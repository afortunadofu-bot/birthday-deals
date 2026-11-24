#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""從 21,209 家店的座標自動長出「商圈」，再跟人工圈的 148 個對照。

    python fetch_venues.py     # 先抓人工商圈（壽星日的公開 view）
    python cluster.py          # 分群、評估、寫出 metrics.json

為什麼做這題：好康地圖的優惠綁在店家上，而使用者問的其實是「這附近有什麼」。
壽星日那邊已經有 148 個**人工**圈出來的商圈（名字、中心點、半徑都是手工定的），
但手工只做得動雙北跟幾個大城市。如果分群結果跟人工圈的對得上，
那剩下的縣市就能自動補完。

對照組很重要：非監督學習最容易自我感覺良好，有人工標準才知道分出來的是不是商圈。

資料：
  店家  ../../tw-deals/data/stores_osm.json（OpenStreetMap，ODbL，21,209 家）
  商圈  data/venues.json（壽星日 venues_public，148 個，fetch_venues.py 抓的）
"""

import json
import math
import sys
import time
from collections import Counter
from pathlib import Path

import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.metrics import silhouette_score
from sklearn.neighbors import BallTree

HERE = Path(__file__).resolve().parent
STORES = HERE.parent.parent.parent / "tw-deals" / "data" / "stores_osm.json"
VENUES = HERE / "data" / "venues.json"
OUT = HERE / "metrics.json"
CLUSTERS_OUT = HERE / "data" / "clusters.json"

EARTH_M = 6_371_000.0
# 一個商圈至少要有幾個「不同品牌」。光看店家密度會把同一條街的五家 50嵐
# 當成商圈，但那不是商圈，那是展店策略。
MIN_BRANDS = 3


def load_stores():
    if not STORES.exists():
        sys.exit(f"找不到 {STORES}（好康地圖 repo 的 OSM 店家檔）")
    rows = json.loads(STORES.read_text(encoding="utf-8"))
    rows = [r for r in rows if r.get("lat") and r.get("lng")]
    return rows


def load_venues():
    if not VENUES.exists():
        sys.exit(f"找不到 {VENUES}，先跑 python fetch_venues.py")
    return json.loads(VENUES.read_text(encoding="utf-8"))


def haversine_m(a_lat, a_lng, b_lat, b_lng):
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = p2 - p1
    dl = math.radians(b_lng - a_lng)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_M * math.asin(math.sqrt(h))


def run_dbscan(coords_rad, eps_m, min_samples):
    db = DBSCAN(eps=eps_m / EARTH_M, min_samples=min_samples,
                metric="haversine", algorithm="ball_tree")
    return db.fit_predict(coords_rad)


def summarise(rows, labels):
    """把每一群整理成中心點、店數、品牌數、縣市。"""
    groups = {}
    for r, lab in zip(rows, labels):
        if lab == -1:
            continue
        groups.setdefault(lab, []).append(r)
    out = []
    for lab, members in groups.items():
        brands = Counter(m["brand"] for m in members)
        if len(brands) < MIN_BRANDS:
            continue
        out.append({
            "id": int(lab),
            "lat": sum(m["lat"] for m in members) / len(members),
            "lng": sum(m["lng"] for m in members) / len(members),
            "n_stores": len(members),
            "n_brands": len(brands),
            "county": Counter(m["county"] for m in members).most_common(1)[0][0],
            "top_brands": [b for b, _ in brands.most_common(4)],
        })
    out.sort(key=lambda c: -c["n_stores"])
    return out


def match_to_manual(clusters, venues, slack_m=250):
    """人工圈的商圈，自動分群有沒有找到？

    判定：自動群的中心點落在人工商圈的半徑 + slack 之內就算對上。
    slack 是因為人工的中心點是「這個商圈的地標」（百貨門口、捷運站），
    自動的中心點是店家的重心，本來就不會剛好同一點。"""
    hits, misses = [], []
    for v in venues:
        best, best_d = None, None
        for c in clusters:
            d = haversine_m(v["lat"], v["lng"], c["lat"], c["lng"])
            if best_d is None or d < best_d:
                best, best_d = c, d
        ok = best_d is not None and best_d <= (v.get("radius_m") or 200) + slack_m
        (hits if ok else misses).append({
            "name": v["name"], "county": v["county"],
            "distance_m": round(best_d) if best_d is not None else None,
            "n_stores": best["n_stores"] if (ok and best) else None,
        })
    return hits, misses


def benchmark(coords_rad, k=20):
    """同一件事（每家店找最近的 k 家）用兩種做法算，比時間。

    這是整題裡最「資料結構」的一段：暴力法是 O(n²)，把 21,209 家店兩兩比
    要算 2.2 億次距離；BallTree 先把空間切成巢狀的球，查詢變成 O(log n)。
    為了不讓暴力法跑到天荒地老，它只跑 1,500 家店的子集再換算。"""
    n = len(coords_rad)
    sub = coords_rad[:1500]
    t0 = time.perf_counter()
    # 暴力法：子集內兩兩算 haversine
    lat = sub[:, 0][:, None]
    lng = sub[:, 1][:, None]
    dlat = lat - lat.T
    dlng = lng - lng.T
    a = np.sin(dlat / 2) ** 2 + np.cos(lat) * np.cos(lat.T) * np.sin(dlng / 2) ** 2
    np.sort(2 * np.arcsin(np.sqrt(a)), axis=1)[:, :k]
    brute_sub = time.perf_counter() - t0
    brute_est = brute_sub * (n / len(sub)) ** 2

    t0 = time.perf_counter()
    tree = BallTree(coords_rad, metric="haversine")
    build = time.perf_counter() - t0
    t0 = time.perf_counter()
    tree.query(coords_rad, k=k)
    query = time.perf_counter() - t0
    return {
        "n": n,
        "k": k,
        "brute_subset_n": len(sub),
        "brute_subset_s": round(brute_sub, 3),
        "brute_estimated_s": round(brute_est, 1),
        "balltree_build_s": round(build, 3),
        "balltree_query_s": round(query, 3),
        "speedup": round(brute_est / (build + query), 1),
    }


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    rows = load_stores()
    venues = load_venues()
    coords = np.radians(np.array([[r["lat"], r["lng"]] for r in rows]))
    print(f"店家 {len(rows):,} 家、人工商圈 {len(venues)} 個")

    grid = []
    for eps in (100, 150, 200, 300):
        for ms in (4, 6, 8):
            labels = run_dbscan(coords, eps, ms)
            clusters = summarise(rows, labels)
            hits, misses = match_to_manual(clusters, venues)
            covered = sum(c["n_stores"] for c in clusters)
            grid.append({
                "eps_m": eps, "min_samples": ms,
                "n_clusters": len(clusters),
                "store_coverage": round(100 * covered / len(rows), 1),
                "manual_recall": round(100 * len(hits) / len(venues), 1),
                "median_stores": int(np.median([c["n_stores"] for c in clusters]))
                if clusters else 0,
            })
            print(f"  eps={eps:3}m min_samples={ms}  群 {len(clusters):4}  "
                  f"收進 {grid[-1]['store_coverage']:4.1f}% 的店  "
                  f"對上人工 {grid[-1]['manual_recall']:4.1f}%")

    # 挑法：對得上人工商圈的比例最高，同分再取收進最多店家的那一組。
    # 不用 silhouette 挑，因為它只看「分得乾不乾淨」，不管分出來的是不是商圈；
    # 有人工標準可以對的時候，就該用人工標準。
    best = max(grid, key=lambda g: (g["manual_recall"], g["store_coverage"]))
    print(f"\n選 eps={best['eps_m']}m、min_samples={best['min_samples']}")

    labels = run_dbscan(coords, best["eps_m"], best["min_samples"])
    clusters = summarise(rows, labels)
    hits, misses = match_to_manual(clusters, venues)

    # 分群品質：silhouette 只在被分進群的點上算（雜訊點不算）
    mask = labels != -1
    sil = float(silhouette_score(coords[mask], labels[mask], metric="haversine",
                                 sample_size=4000, random_state=0))

    by_county = Counter(c["county"] for c in clusters)
    manual_by_county = Counter(v["county"] for v in venues)
    counties = [{"county": c,
                 "auto": by_county.get(c, 0),
                 "manual": manual_by_county.get(c, 0),
                 "gap": by_county.get(c, 0) - manual_by_county.get(c, 0)}
                for c in sorted(set(by_county) | set(manual_by_county),
                                key=lambda x: -(by_county.get(x, 0)))]

    bench = benchmark(coords)
    print(f"分群品質 silhouette {sil:.3f}；"
          f"BallTree 比暴力法快約 {bench['speedup']:.0f} 倍")

    CLUSTERS_OUT.parent.mkdir(exist_ok=True)
    CLUSTERS_OUT.write_text(json.dumps(clusters[:200], ensure_ascii=False, indent=1),
                            encoding="utf-8")
    OUT.write_text(json.dumps({
        "n_stores": len(rows),
        "n_manual": len(venues),
        "min_brands": MIN_BRANDS,
        "grid": grid,
        "chosen": best,
        "n_clusters": len(clusters),
        "store_coverage": round(100 * sum(c["n_stores"] for c in clusters) / len(rows), 1),
        "silhouette": round(sil, 3),
        "manual_hit": len(hits),
        "manual_miss": len(misses),
        "manual_recall": round(100 * len(hits) / len(venues), 1),
        "misses": sorted(misses, key=lambda m: m["distance_m"] or 9e9, reverse=True)[:12],
        "counties": counties,
        "top_clusters": clusters[:12],
        "benchmark": bench,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"寫好 {OUT.name} 與 data/{CLUSTERS_OUT.name}")
    print(f"  自動 {len(clusters)} 個商圈，對上人工 {len(hits)}/{len(venues)}")


if __name__ == "__main__":
    main()
