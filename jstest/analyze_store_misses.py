#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""分析 fetch_stores.py 跑完「一家都沒找到」的優惠：Google 其實回了什麼？

只讀 .places_cache/ 裡已經存下來的回應，不打 API、不花錢。用途是分辨：
- 店名比對太嚴（Google 有回這家店，但被 name_matches 擋掉）→ 改比對規則／別名
- Google 真的查不到（回的是別家店或空的）→ 可能是純線上優惠，或品牌名要換個搜法
"""
import collections
import hashlib
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import fetch_stores as fs  # noqa: E402

rows = json.loads(fs.OUT_JSON.read_text(encoding="utf-8"))
offers = fs.load_offers()
aliases = fs.load_aliases()
have = {r["offer_id"] for r in rows}
zero = [o for o in offers if o["id"] not in have and o["brand"] not in set(aliases["skip"])]


def cached_page1(text):
    body = {"textQuery": text, "languageCode": "zh-TW", "regionCode": "TW",
            "pageSize": 20, "locationRestriction": {"rectangle": fs.TAIWAN_RECT}}
    raw = json.dumps(body, ensure_ascii=False, sort_keys=True)
    f = fs.CACHE / (hashlib.sha1(raw.encode("utf-8")).hexdigest() + ".json")
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else None


print(f"總分店 {len(rows)}，沒找到 {len(zero)} 筆\n")
print("=== 大縣市家數（看分區補抓有沒有生效）===")
mc = collections.Counter(r["county"] for r in rows if "麥當勞" in r["brand"])
print("麥當勞:", sum(mc.values()), dict(mc.most_common(6)))

print("\n=== 沒找到的優惠：Google 第一頁回了什麼（每筆取回應最多的一個縣市）===")
for o in zero:
    queries, keys, counties = fs.plan_for(o, aliases)
    best = None
    for q in queries:
        for c in counties:
            d = cached_page1(f"{q} {c}")
            if d is None:
                continue
            names = [(p.get("displayName") or {}).get("text", "") for p in d.get("places", [])]
            addrs = [p.get("formattedAddress", "") for p in d.get("places", [])]
            if best is None or len(names) > len(best[2]):
                best = (q, c, names, addrs)
    if not best:
        print(f"#{o['id']} {o['brand']} | 地區 {o.get('regions')} | 沒有快取")
        continue
    q, c, names, addrs = best
    print(f"#{o['id']} {o['brand']} | 地區 {o.get('regions')} | 查「{q} {c}」回 {len(names)} 筆")
    for n, a in list(zip(names, addrs))[:4]:
        print(f"     - {n}  ｜ {a[:28]}")

brands_live = {o["brand"] for o in offers}
bad_alias = [b for b in aliases["brands"] if b not in brands_live]
if bad_alias:
    print("\n⚠️ 別名檔裡這些品牌名稱跟線上優惠對不上（字差一點點就不會生效）：", bad_alias)

if len(sys.argv) > 1:
    prev = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    before = collections.Counter(r["brand"] for r in prev)
    after = collections.Counter(r["brand"] for r in rows)
    prev_ids = collections.defaultdict(set)
    for r in prev:
        prev_ids[r["brand"]].add(r["place_id"])
    print(f"\n=== 跟上一版比（{len(prev)} → {len(rows)} 家），家數有變的優惠：新增的店要人工看有沒有抓錯 ===")
    for b in sorted({*before, *after}, key=lambda x: -(after[x] - before[x])):
        if after[b] != before[b]:
            new = [r["name"] for r in rows if r["brand"] == b and r["place_id"] not in prev_ids[b]]
            print(f"  {b}：{before[b]} → {after[b]}　新增例：{new[:4]}")

print("\n=== 可疑的比對（店名很短或品牌很短，可能抓到別家）===")
by_offer = collections.defaultdict(list)
for r in rows:
    by_offer[(r["offer_id"], r["brand"])].append(r["name"])
for (oid, brand), names in sorted(by_offer.items(), key=lambda x: -len(x[1])):
    if len(fs.norm_brand(brand)) <= 3:
        print(f"#{oid} {brand}：{len(names)} 家，例：{names[:5]}")
