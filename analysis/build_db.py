#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把壽星日的資料攤平成一個可以查的 SQLite 分析庫。

    python build_db.py            # 重建 analysis.db
    python build_db.py --refresh-counts   # 連 data/store_counts.csv 一起重算（要有本機門市快取）

資料從哪來：

  1. ../offers.json            — 139 筆生日優惠的快照（2026-09-18），這份在 git 裡。
  2. ../stores_fetched*.json    — Google Places 抓回來的門市明細，**不在 git 裡**。
     有這兩個檔的時候會重算 data/store_counts.csv；沒有的話就讀現成的 CSV。

為什麼門市要這樣分兩層：原始 Places 回應有 place_id、店名、經緯度，那是 Google 的
資料，不該跟著這個 repo 散出去；但「某品牌在某縣市有幾家店」是算出來的統計量，
放進 git 才能讓別人重跑這份分析。所以明細留本機，彙總進版控。

沒有第三方套件，clone 下來 python 就能跑。
"""

import argparse
import csv
import json
import sqlite3
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
DB = HERE / "analysis.db"
SCHEMA = HERE / "schema.sql"
DATA = HERE / "data"
COUNTS_CSV = DATA / "store_counts.csv"

OFFERS_JSON = REPO / "offers.json"
STORE_FILES = [REPO / "stores_fetched.json", REPO / "stores_fetched_regions.json"]

# 縣市：名稱跟 ../fetch_stores.py 的 COUNTIES 一致（台不臺），分區是標準地理分區。
COUNTIES = [
    ("基隆市", "北部"), ("台北市", "北部"), ("新北市", "北部"), ("桃園市", "北部"),
    ("新竹市", "北部"), ("新竹縣", "北部"),
    ("苗栗縣", "中部"), ("台中市", "中部"), ("彰化縣", "中部"), ("南投縣", "中部"),
    ("雲林縣", "中部"),
    ("嘉義市", "南部"), ("嘉義縣", "南部"), ("台南市", "南部"), ("高雄市", "南部"),
    ("屏東縣", "南部"),
    ("宜蘭縣", "東部"), ("花蓮縣", "東部"), ("台東縣", "東部"),
    ("澎湖縣", "離島"), ("金門縣", "離島"), ("連江縣", "離島"),
]
COUNTY_SET = {c for c, _ in COUNTIES}


def norm(s):
    """統一寫法：臺→台、去掉頭尾空白。offers.json 跟門市資料兩邊混用，不統一會 join 不到。"""
    if s is None:
        return None
    return s.replace("臺", "台").strip()


def load_offers():
    raw = json.loads(OFFERS_JSON.read_text(encoding="utf-8"))
    return raw["meta"], raw["offers"]


def rows_for_offer(o):
    regions = [norm(r) for r in (o.get("regions") or [])]
    nationwide = 1 if "全台" in regions else 0
    counties = [r for r in regions if r in COUNTY_SET]
    best = o.get("bestSource") or {}
    offer = (
        o["id"], norm(o["brand"]), o.get("groupName"), o["category"],
        o.get("offer") or "", o.get("conditions"), o.get("validity"),
        o.get("membershipType"), o.get("membershipCost"), o.get("advanceDays"),
        o.get("advanceNote"),
        o.get("freeTier"), o.get("valueTwd"), o.get("timing"),
        o.get("validityType") or "rolling", o.get("validFrom"), o.get("validUntil"),
        1 if o.get("verified") else 0, o.get("lastChecked"),
        best.get("tier"), best.get("url"),
        nationwide,
        0 if not regions else 1,
    )
    region_rows = [(o["id"], c) for c in counties]
    source_rows = []
    seen = set()
    for s in (o.get("sources") or []):
        url = s.get("url")
        if not url or url in seen:
            continue
        seen.add(url)
        source_rows.append((o["id"], url, s.get("title"), s.get("tier") or 4,
                            s.get("tierLabel"), s.get("checked")))
    return offer, region_rows, source_rows


def load_stores_detail():
    """讀本機門市明細；沒有檔案就回 None（代表這次要吃現成的 CSV）。"""
    found = [p for p in STORE_FILES if p.exists()]
    if not found:
        return None
    seen = {}
    for p in found:
        for s in json.loads(p.read_text(encoding="utf-8")):
            brand, pid = norm(s.get("brand")), s.get("place_id")
            if not brand or not pid:
                continue
            seen[(brand, pid)] = (
                pid, brand, s.get("name"), norm(s.get("county")),
                s.get("lat"), s.get("lng"), s.get("business_status"),
            )
    return list(seen.values()), [p.name for p in found]


def counts_from_detail(stores, offer_brands):
    """彙總成 brand × county。
    只收營業中的門市，也只收對得上優惠品牌的——門市資料比優惠快照新，
    裡面有一堆快照時還沒收錄的品牌，留著會讓分母失真。"""
    agg = {}
    for pid, brand, name, county, lat, lng, status in stores:
        if status != "OPERATIONAL" or county not in COUNTY_SET:
            continue
        if brand not in offer_brands:
            continue
        agg[(brand, county)] = agg.get((brand, county), 0) + 1
    return sorted((b, c, n) for (b, c), n in agg.items())


def write_counts_csv(counts):
    DATA.mkdir(exist_ok=True)
    with COUNTS_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["brand", "county", "n_stores"])
        w.writerows(counts)


def read_counts_csv():
    if not COUNTS_CSV.exists():
        sys.exit(f"找不到 {COUNTS_CSV.name}，也沒有本機門市明細（../stores_fetched*.json），"
                 "門市那幾題沒資料可跑")
    with COUNTS_CSV.open(encoding="utf-8") as f:
        return [(r["brand"], r["county"], int(r["n_stores"])) for r in csv.DictReader(f)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh-counts", action="store_true",
                    help="有本機門市明細時，重算 data/store_counts.csv")
    args = ap.parse_args()

    meta, offers = load_offers()
    offer_brands = {norm(o["brand"]) for o in offers}

    detail = load_stores_detail()
    if detail and (args.refresh_counts or not COUNTS_CSV.exists()):
        stores, names = detail
        counts = counts_from_detail(stores, offer_brands)
        write_counts_csv(counts)
        source_note = f"本機明細 {', '.join(names)}（{len(stores):,} 家）→ 重算彙總"
    else:
        stores = detail[0] if detail else []
        counts = read_counts_csv()
        source_note = f"現成彙總 data/{COUNTS_CSV.name}"

    if DB.exists():
        DB.unlink()
    con = sqlite3.connect(DB)
    con.executescript(SCHEMA.read_text(encoding="utf-8"))

    con.executemany("insert into counties(name, area, order_no) values (?,?,?)",
                    [(n, a, i) for i, (n, a) in enumerate(COUNTIES)])

    for o in offers:
        offer, regions, sources = rows_for_offer(o)
        con.execute("insert into offers values (" + ",".join("?" * len(offer)) + ")", offer)
        con.executemany("insert into offer_regions values (?,?)", regions)
        con.executemany("insert into offer_sources values (?,?,?,?,?,?)", sources)

    con.executemany("insert into stores values (?,?,?,?,?,?,?)", stores)
    con.executemany("insert into store_counts values (?,?,?)", counts)
    con.commit()

    q = lambda sql: con.execute(sql).fetchone()[0]
    matched = q("select count(distinct brand) from store_counts")
    print(f"建好 {DB.name}")
    print(f"  資料版本      offers.json v{meta.get('version')}，lastBuild {meta.get('lastBuild')}")
    print(f"  優惠          {q('select count(*) from offers')} 筆 / "
          f"{q('select count(distinct brand) from offers')} 個品牌 / "
          f"{q('select count(distinct category) from offers')} 類")
    print(f"  縣市標註      {q('select count(*) from offer_regions')} 筆優惠×縣市，"
          f"全台連鎖 {q('select count(*) from offers where is_nationwide=1')} 筆，"
          f"未標註 {q('select count(*) from offers where has_region_data=0')} 筆")
    print(f"  來源          {q('select count(*) from offer_sources')} 筆")
    print(f"  門市          {source_note}")
    print(f"                {q('select coalesce(sum(n_stores),0) from store_counts')} 家，"
          f"對得上 {matched}/{len(offer_brands)} 個品牌")
    con.close()


if __name__ == "__main__":
    main()
