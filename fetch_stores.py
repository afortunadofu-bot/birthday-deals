#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
抓各品牌分店位置（Google Places API），產生可以貼進 Supabase SQL Editor 的匯入檔。

為什麼有這支：嵐／使用者（Z、王、Cindy）都要「附近有哪些店有優惠」「從北車
方圓距離由近到遠」。這需要每一家分店的座標，而資料庫原本只有「適用縣市」，
沒有任何地址／經緯度。celine 決定用 Google Places API 當分店資料來源。

做法：
1. 用 config.js 裡的 anon key 讀線上「已上架」的優惠（跟前端看到的一樣，
   含使用者投稿上架的——repo 裡的 offers.json 只有種子資料、也沒有 DB id）
2. 每筆優惠依「適用縣市」逐縣市查（全台＝22 縣市都查）。Text Search 一個查詢
   最多只回 60 筆，麥當勞這種全台幾百家的連鎖直接查「麥當勞」會漏掉大半，
   拆成「麥當勞 台北市」「麥當勞 新北市」…才抓得完整
3. 結果要通過兩道過濾才收：店名要對得上品牌（Places 會把「附近的其他店」
   也塞進結果）、地址要在那個縣市裡（避免「台北市」查到新北的店重複歸錯縣市）；
   永久歇業的不收
4. 每個 API 回應都存在 .places_cache/，重跑不會重複計費；要強制重抓就加 --refresh
5. 輸出 stores_import.sql（upsert，可重複執行，不會動到管理員手動隱藏的分店）

用法：
  set GOOGLE_MAPS_API_KEY=你的金鑰          (PowerShell: $env:GOOGLE_MAPS_API_KEY="...")
  python fetch_stores.py --dry-run            # 只列出會打幾次 API，不花錢
  python fetch_stores.py --only 麥當勞        # 先拿一個品牌試
  python fetch_stores.py                      # 全部
然後把 stores_import.sql 貼進 Supabase SQL Editor 執行（要先跑過 schema_v58）。

品牌名稱跟 Google 上的店名常常不一樣（例如「Global Mall 環球購物中心」在
Google 上是「環球購物中心 板橋車站」），或是純線上／App 的優惠根本沒有實體店，
這些寫在 store_search_aliases.json 調整，不用改程式。
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
CACHE = HERE / ".places_cache"
ALIASES = HERE / "store_search_aliases.json"
OUT_SQL = HERE / "stores_import.sql"
OUT_JSON = HERE / "stores_fetched.json"

# 跟前端 COUNTIES 同一份（不含「全台」）
COUNTIES = ['基隆市', '台北市', '新北市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '台中市',
            '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '台南市', '高雄市', '屏東縣',
            '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣']

# 台灣本島＋離島的外框。Text Search 的 locationRestriction 只吃矩形，
# 這只是擋掉「日本的麥當勞」這種離譜結果，縣市歸屬另外用地址判斷。
TAIWAN_RECT = {"low": {"latitude": 21.8, "longitude": 118.1},
               "high": {"latitude": 26.4, "longitude": 122.1}}

API_URL = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = ",".join([
    "places.id", "places.displayName", "places.formattedAddress",
    "places.location", "places.businessStatus", "nextPageToken",
])


def tw(s):
    """地址裡「臺」「台」混用，比對前統一。"""
    return (s or "").replace("臺", "台")


def norm_brand(s):
    # 跟前端 normBrand 同一套：去掉空白、括號、斜線、頓號、句點這些不影響品牌名的符號
    return re.sub(r"[\s（）()／/、,.．·・]", "", (s or "").lower())


def name_matches(display_name, keys):
    """店名要包含任一個比對關鍵字。關鍵字太短（2 字以下）只接受開頭相符，
    避免「大茗」比到「大茗堂中醫」這種完全無關的店。"""
    dn = norm_brand(tw(display_name))
    for k in keys:
        k = norm_brand(tw(k))
        if not k:
            continue
        if len(k) <= 2:
            if dn.startswith(k):
                return True
        elif k in dn:
            return True
    return False


def load_config():
    txt = (HERE / "config.js").read_text(encoding="utf-8")
    url = re.search(r"url\s*:\s*['\"]([^'\"]+)['\"]", txt)
    key = re.search(r"anonKey\s*:\s*['\"]([^'\"]+)['\"]", txt)
    if not (url and key):
        sys.exit("讀不到 config.js 裡的 url / anonKey")
    return url.group(1).rstrip("/"), key.group(1)


def load_offers():
    url, key = load_config()
    req = urllib.request.Request(
        f"{url}/rest/v1/offers?select=id,brand,regions,category&status=eq.approved&order=id",
        headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def load_aliases():
    if not ALIASES.exists():
        return {"brands": {}, "skip": []}
    data = json.loads(ALIASES.read_text(encoding="utf-8"))
    data.setdefault("brands", {})
    data.setdefault("skip", [])
    return data


def search(api_key, query, page_token=None, refresh=False):
    body = {"textQuery": query, "languageCode": "zh-TW", "regionCode": "TW",
            "pageSize": 20, "locationRestriction": {"rectangle": TAIWAN_RECT}}
    if page_token:
        body["pageToken"] = page_token
    raw = json.dumps(body, ensure_ascii=False, sort_keys=True)
    cache_file = CACHE / (hashlib.sha1(raw.encode("utf-8")).hexdigest() + ".json")
    if cache_file.exists() and not refresh:
        return json.loads(cache_file.read_text(encoding="utf-8")), False
    req = urllib.request.Request(API_URL, data=raw.encode("utf-8"), method="POST", headers={
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": FIELD_MASK,
    })
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read().decode("utf-8"))
            break
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "replace")
            if e.code in (429, 500, 503) and attempt < 3:
                time.sleep(2 ** attempt)
                continue
            sys.exit(f"Places API 錯誤 {e.code}：{msg[:500]}")
    CACHE.mkdir(exist_ok=True)
    cache_file.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    time.sleep(0.15)
    return data, True


def plan_for(offer, aliases):
    """回傳 (要搜的字清單, 店名比對關鍵字, 縣市清單)。
    別名可以給 queries（多個字分開搜），給聯名卡這種一筆優惠對到好幾個品牌用，
    例如「PK雙饗卡（肯德基 × 必勝客）」要分別搜肯德基跟必勝客。"""
    a = aliases["brands"].get(offer["brand"], {})
    queries = a.get("queries") or ([a["query"]] if a.get("query") else [offer["brand"]])
    keys = a.get("match") or queries
    regions = offer.get("regions") or []
    counties = COUNTIES if (not regions or "全台" in regions) else [c for c in regions if c in COUNTIES]
    return queries, keys, counties


def sql_str(v):
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="只列出會打幾次 API，不真的查")
    ap.add_argument("--only", help="只跑品牌名稱包含這個字串的優惠")
    ap.add_argument("--max-pages", type=int, default=3, help="每個查詢最多翻幾頁（每頁 20 筆，上限 3 頁）")
    ap.add_argument("--refresh", action="store_true", help="忽略快取強制重抓")
    args = ap.parse_args()

    api_key = os.environ.get("GOOGLE_MAPS_API_KEY", "")
    if not api_key and not args.dry_run:
        sys.exit("請先設定環境變數 GOOGLE_MAPS_API_KEY（見檔頭用法）")

    aliases = load_aliases()
    offers = load_offers()
    if args.only:
        offers = [o for o in offers if args.only in o["brand"]]
    skip = set(aliases["skip"])

    planned = [(o, *plan_for(o, aliases)) for o in offers if o["brand"] not in skip]
    n_queries = sum(len(q) * len(c) for _, q, _, c in planned)
    print(f"{len(planned)} 筆優惠（略過 {len(offers) - len(planned)} 筆），"
          f"共 {n_queries} 個縣市查詢；每個查詢最多 {args.max_pages} 頁，"
          f"最多 {n_queries * args.max_pages} 次 API 呼叫（有結果不滿一頁就不會翻下一頁）。")
    if args.dry_run:
        for o, q, _, c in planned:
            print(f"  #{o['id']} {o['brand']}  查「{'」「'.join(q)}」× {len(c)} 縣市")
        return

    rows, calls, per_offer = [], 0, {}
    for o, queries, keys, counties in planned:
        seen = set()
        for query, county in ((q, c) for q in queries for c in counties):
            token = None
            for _ in range(max(1, min(args.max_pages, 3))):
                data, billed = search(api_key, f"{query} {county}", token, args.refresh)
                calls += billed
                for p in data.get("places", []):
                    pid = p.get("id")
                    name = (p.get("displayName") or {}).get("text", "")
                    addr = p.get("formattedAddress", "")
                    loc = p.get("location") or {}
                    if not pid or pid in seen or "latitude" not in loc:
                        continue
                    if p.get("businessStatus") == "CLOSED_PERMANENTLY":
                        continue
                    if not name_matches(name, keys):
                        continue
                    if tw(county) not in tw(addr):
                        continue
                    seen.add(pid)
                    rows.append({"offer_id": o["id"], "brand": o["brand"], "place_id": pid,
                                 "name": name, "address": addr, "county": county,
                                 "lat": loc["latitude"], "lng": loc["longitude"],
                                 "business_status": p.get("businessStatus")})
                token = data.get("nextPageToken")
                if not token:
                    break
        per_offer[o["brand"]] = len(seen)
        print(f"  #{o['id']} {o['brand']}：{len(seen)} 家分店")

    OUT_JSON.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")

    offer_ids = sorted({r["offer_id"] for r in rows} | {o["id"] for o, *_ in planned})
    lines = [
        "-- 由 fetch_stores.py 產生，請勿手改。要先跑過 schema_v58_offer_stores.sql。",
        "-- 可重複執行：同一家分店（offer_id + place_id）重跑只會更新店名／地址／座標，",
        "-- 不會把管理員手動隱藏（hidden=true）的分店又打開。",
        "-- 這次有查的優惠裡，Google 上已經找不到的舊分店會被標成 hidden（不刪除，",
        "-- 管理員手動加的 source<>'google_places' 分店不受影響）。",
        "begin;",
        "create temp table _stores_in (offer_id bigint, place_id text, name text, address text,",
        "  county text, lat double precision, lng double precision, business_status text) on commit drop;",
    ]
    for i in range(0, len(rows), 500):
        chunk = rows[i:i + 500]
        lines.append("insert into _stores_in values")
        lines.append(",\n".join(
            f"({r['offer_id']},{sql_str(r['place_id'])},{sql_str(r['name'])},{sql_str(r['address'])},"
            f"{sql_str(r['county'])},{r['lat']},{r['lng']},{sql_str(r['business_status'])})"
            for r in chunk) + ";")
    lines += [
        "insert into public.offer_stores (offer_id, place_id, name, address, county, lat, lng,",
        "  business_status, source, fetched_at)",
        "select s.offer_id, s.place_id, s.name, s.address, s.county, s.lat, s.lng, s.business_status,",
        "  'google_places', now()",
        "from _stores_in s join public.offers o on o.id = s.offer_id",
        "on conflict (offer_id, place_id) do update set",
        "  name = excluded.name, address = excluded.address, county = excluded.county,",
        "  lat = excluded.lat, lng = excluded.lng, business_status = excluded.business_status,",
        "  fetched_at = excluded.fetched_at;",
        "update public.offer_stores st set hidden = true",
        f"where st.source = 'google_places' and st.offer_id in ({','.join(map(str, offer_ids)) or 'null'})",
        "  and not exists (select 1 from _stores_in s where s.offer_id = st.offer_id and s.place_id = st.place_id);",
        "commit;",
        f"-- {len(rows)} 家分店，{len(per_offer)} 筆優惠",
    ]
    OUT_SQL.write_text("\n".join(lines) + "\n", encoding="utf-8")

    zero = [b for b, n in per_offer.items() if n == 0]
    print(f"\n完成：{len(rows)} 家分店，實際計費 API 呼叫 {calls} 次（其餘走快取）。")
    print(f"輸出：{OUT_SQL.name}（貼進 SQL Editor）、{OUT_JSON.name}（人工檢查用）")
    if zero:
        print(f"\n⚠️ 下面 {len(zero)} 筆一家都沒找到，可能是店名跟 Google 不同（到 "
              f"store_search_aliases.json 設 query/match），或是純線上優惠（加進 skip）：")
        for b in zero:
            print("  -", b)


if __name__ == "__main__":
    main()
