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
5. 輸出 stores_import_01.sql、_02.sql…（每檔 400 家，upsert，可重複執行，不會動到管理員手動隱藏的分店）

用法：
  set GOOGLE_MAPS_API_KEY=你的金鑰          (PowerShell: $env:GOOGLE_MAPS_API_KEY="...")
  python fetch_stores.py --dry-run            # 只列出會打幾次 API，不花錢
  python fetch_stores.py --only 麥當勞        # 先拿一個品牌試
  python fetch_stores.py                      # 全部
然後把 stores_import_*.sql 依序全部貼進 Supabase SQL Editor 執行（要先跑過 schema_v58）。
  python fetch_stores.py --cache-only         # 改完比對規則／別名後，只用快取重算，不花錢

品牌名稱跟 Google 上的店名常常不一樣（例如「Global Mall 環球購物中心」在
Google 上是「環球購物中心 板橋車站」），或是純線上／App 的優惠根本沒有實體店，
這些寫在 store_search_aliases.json 調整，不用改程式。
"""

import argparse
from datetime import datetime, timezone
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
# 一個匯入檔最多幾家分店。原本 1,500 家（約 340KB），celine 貼進 Supabase SQL Editor 時報
# 「request entity too large」——SQL Editor 會把整段查詢存成 snippet，太大存不進去。
# 400 家約 90KB；還是太大的話用 --rows-per-file 再調小。
ROWS_PER_FILE = 400
CACHE_ONLY = False     # --cache-only：只用快取重算、不打 API
OUT_JSON = HERE / "stores_fetched.json"

# 跟前端 COUNTIES 同一份（不含「全台」）
COUNTIES = ['基隆市', '台北市', '新北市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '台中市',
            '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '台南市', '高雄市', '屏東縣',
            '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣']

# 台灣本島＋離島的外框。Text Search 的 locationRestriction 只吃矩形，
# 這只是擋掉「日本的麥當勞」這種離譜結果，縣市歸屬另外用地址判斷。
TAIWAN_RECT = {"low": {"latitude": 21.8, "longitude": 118.1},
               "high": {"latitude": 26.4, "longitude": 122.1}}

# 分區補抓用的縣市外框（大約值，只要「包得住整個縣市」就好，多包一點沒關係，
# 超出縣市的店最後會被地址過濾掉）。為什麼需要：第一次試跑麥當勞，台北市、台中市
# 都剛好卡在 59 家（Text Search 一個查詢最多 60 筆），新北市更只剩 29 家——「麥當勞
# 新北市」回來的 60 筆裡混了一堆台北市的店，被地址過濾掉之後就少一大半。實際上
# 雙北各有七八十家以上。沒列在這裡的縣市，被截斷時就用那 60 筆結果自己的範圍外擴。
COUNTY_BOX = {
    '台北市': {"low": {"latitude": 24.96, "longitude": 121.45}, "high": {"latitude": 25.21, "longitude": 121.67}},
    '新北市': {"low": {"latitude": 24.67, "longitude": 121.28}, "high": {"latitude": 25.30, "longitude": 122.01}},
    '桃園市': {"low": {"latitude": 24.59, "longitude": 120.97}, "high": {"latitude": 25.12, "longitude": 121.49}},
    '台中市': {"low": {"latitude": 23.99, "longitude": 120.46}, "high": {"latitude": 24.45, "longitude": 121.45}},
    '台南市': {"low": {"latitude": 22.88, "longitude": 120.03}, "high": {"latitude": 23.42, "longitude": 120.66}},
    '高雄市': {"low": {"latitude": 22.46, "longitude": 120.17}, "high": {"latitude": 23.47, "longitude": 121.05}},
    '彰化縣': {"low": {"latitude": 23.78, "longitude": 120.24}, "high": {"latitude": 24.20, "longitude": 120.73}},
}
MAX_TILE_DEPTH = 5          # 最多切 5 層（單邊縮成 1/32），再小就不切了
MIN_TILE_DEG = 0.01         # 格子邊長小於約 1 公里就不再切

API_URL = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = ",".join([
    "places.id", "places.displayName", "places.formattedAddress",
    "places.location", "places.businessStatus", "nextPageToken",
])


VARIANTS = str.maketrans({"臺": "台", "寿": "壽", "舖": "舗", "蔵": "藏", "珈": "咖", "琲": "啡",
                          "‘": "'", "’": "'", "＆": "&"})


def tw(s):
    """地址／店名裡的異體字統一後再比：臺台混用；平禄寿司（優惠）vs 平禄壽司（Google）；
    辻利茶舖 vs 辻利茶舗；武藏野森咖啡 vs 武蔵野森珈琲（日文漢字）；beard papa‘s 的彎引號 vs 直引號。"""
    return (s or "").translate(VARIANTS)


def norm_brand(s):
    # 跟前端 normBrand 同一套：去掉空白、括號、斜線、頓號、句點這些不影響品牌名的符號
    return re.sub(r"[\s（）()／/、,.．·・‧•｜|【】\-&!]", "", (s or "").lower())


def name_matches(display_name, keys, require=()):
    """店名要包含任一個比對關鍵字（require 裡的則是每一個都要包含）。關鍵字太短（2 字以下）
    只接受開頭相符，避免「大茗」比到「大茗堂中醫」這種完全無關的店。"""
    dn = norm_brand(tw(display_name))
    if any(norm_brand(tw(r)) not in dn for r in require if norm_brand(tw(r))):
        return False
    for k in keys:
        # 關鍵字是一組（tuple／list）時，組裡每一段都要出現——「爭鮮PLUS」要同時有「爭鮮」跟
        # 「PLUS」，只有「爭鮮迴轉壽司」不算；見 derive_keys 的說明
        if isinstance(k, (tuple, list)):
            parts = [norm_brand(tw(x)) for x in k if norm_brand(tw(x))]
            if parts and all(p in dn for p in parts):
                return True
    for k in keys:
        if isinstance(k, (tuple, list)):
            continue
        k = norm_brand(tw(k))
        if not k:
            continue
        if len(k) <= 2:
            if dn.startswith(k):
                return True
        elif k in dn:
            return True
    return False


# 單獨出現時太通用、不能拿來當比對關鍵字的詞（「Mr. May 牛排館」拆出來的「牛排館」
# 會比到美福乾式熟成牛排館；「十二月粥品·茶飲·私房菜」拆出來的「私房菜」會比到任何私房菜）
CJK_STOP = {"火鍋", "樂活", "茶飲", "私房菜", "心生活", "咖啡", "咖啡廳", "咖啡所", "百匯", "自助百匯",
            "牛排館", "拉麵", "燒肉", "焼肉", "日式燒肉", "日式鍋物", "鍋物", "涮涮鍋", "烘焙坊", "麵包坊", "專門店",
            "餐廳", "烤雞", "甜點", "早餐", "壽司", "冰淇淋", "茶館", "茶坊", "集團", "飯店", "酒店", "飯店集團"}
# 品牌名稱後面常接的類別字尾，去掉之後剩下的才是店名本體（天母盛鑫餐廳 → 天母盛鑫）。
# 去掉之後至少要剩 3 個字才用——「孔金涮涮鍋」去掉字尾只剩「孔金」，會比到孔金麻辣鴛鴦鍋。
CJK_SUFFIX = ("日式燒肉", "日式鍋物", "牛排館", "專門店", "專賣店", "烘焙坊", "麵包坊", "咖啡廳", "涮涮鍋", "餐廳")
# 英文通用字只從「尾巴」去掉（Second Floor Cafe → Second Floor、UG TEA → UG），開頭只去
# Kitchen／The。第一版不分位置全部去掉，「Tea top」變成「top」，比到了「特好喝 toptiertea」。
LATIN_STOP_TAIL = {"cafe", "café", "tea", "bakery", "house", "classic", "restaurant", "hotpot",
                   "patisserie", "pâtisserie", "tokyo"}
LATIN_STOP_HEAD = {"kitchen", "the"}
# 店名含這些字的是公司行號，不是門市（GODIVA 比到「香港商歌帝梵亞洲有限公司台灣分公司」）
NAME_EXCLUDE = ("有限公司", "總公司", "分公司", "辦公室", "物流中心", "倉庫", "客服中心")
# 同一筆優惠、相距這麼近的兩個地點算同一家店（IKEA 內湖店的瑞典餐廳、食品超市、充電站
# 在 Google 上是三個地點；誠品書店松菸跟誠品生活松菸也是）。留名字最短的那個。
DEDUPE_METERS = 60
CJK_CHAR = re.compile(r"[㐀-鿿豈-﫿]")
CJK_RUN = re.compile(r"[㐀-鿿豈-﫿]{2,}")
LATIN_WORD = re.compile(r"[A-Za-zÀ-ɏ][A-Za-z0-9À-ɏ&'.:-]*")
TOKEN_SPLIT = re.compile(r"[\s/／・·‧•。、,，|｜]+")


def _letters(x):
    return len(re.sub(r"[^A-Za-zÀ-ɏ]", "", x))


def _latin_phrase(words):
    low = lambda w: re.sub(r"[^a-zà-ɏ]", "", w.lower())
    words = list(words)
    while len(words) > 1 and low(words[-1]) in LATIN_STOP_TAIL:
        words.pop()
    while len(words) > 1 and low(words[0]) in LATIN_STOP_HEAD:
        words.pop(0)
    phrase = " ".join(words)
    # 整個品牌英文段只剩一個通用字（CAFE!N 的「CAFE」）就不拿來比，不然會比到任何咖啡店
    if len(words) == 1 and low(words[0]) in (LATIN_STOP_TAIL | LATIN_STOP_HEAD):
        return None
    return phrase if _letters(phrase) >= 2 else None


def derive_keys(brand):
    """沒有設別名時，從品牌名稱自動拆出比對關鍵字，回傳 (任一個對上就算, 每一個都要對上)。

    為什麼：第一次全部跑完有 79 筆一家都沒找到。逐筆看快取裡 Google 回的店名，大多數
    其實有查到，是比對太嚴——品牌名稱是「中文＋英文」（粥大福 JOUDAFU、貳樓 Second
    Floor Cafe），Google 上的店名通常只有其中一半（「粥大福-新店中正店」），整串拿去比
    就永遠比不到。

    規則（每一條都是實際跑出來的錯誤換來的）：
    - 用空白／斜線／頓號等切成詞。純中文的詞單獨當關鍵字（去掉「餐廳」這類字尾、至少剩
      3 個字的版本也算）；太通用的詞（牛排館、私房菜、火鍋）不單獨比
    - 連在一起的純英文詞組成一段（Second Floor Cafe），尾巴的 Cafe／Tea 這類通用字去掉
    - 中文跟英文「黏在同一個詞裡」（爭鮮PLUS、貴族世家mini、東客麵包DONQ）代表子品牌，
      兩半都要出現才算——拆開各自比的話，爭鮮PLUS 會比到一般的爭鮮迴轉壽司、
      貴族世家mini 會比到一般的貴族世家（第二輪真的發生）
    - 括號裡是「限XX店」的變成「店名也必須包含」的條件（紅茶老爹(限板橋裕民店) 只收裕民店），
      其他括號內容（屋莎洋食鬆餅屋（Woosa））當成一般關鍵字"""
    keys, require = [brand], []

    def paren(m):
        inner = m.group(1).strip()
        if inner.startswith("限"):
            hint = re.sub(r"(門市|分店|店)$", "", inner[1:]).strip()
            if hint:
                require.append(hint)
        elif inner:
            keys.append(inner)
        return " "

    base = re.sub(r"[（(]([^）)]*)[）)]", paren, brand).strip()
    if base and base != brand:
        keys.append(base)

    latin_run = []

    def flush():
        if latin_run:
            phrase = _latin_phrase(latin_run)
            if phrase:
                keys.append(phrase)
            latin_run.clear()

    for token in TOKEN_SPLIT.split(base):
        if not token:
            continue
        has_cjk = bool(CJK_CHAR.search(token))
        latin = [w for w in LATIN_WORD.findall(token) if _letters(w) >= 2]
        if not has_cjk:
            if latin:
                latin_run.extend(latin)
            continue
        flush()
        cjk = CJK_RUN.findall(token)
        if latin:
            group = tuple(cjk + latin)
            if len(group) >= 2:
                keys.append(group)
            continue
        for seg in cjk:
            if seg not in CJK_STOP:
                keys.append(seg)
            for suf in CJK_SUFFIX:
                if seg.endswith(suf) and len(seg) - len(suf) >= 3:
                    keys.append(seg[:-len(suf)])
    flush()

    seen, out = set(), []
    for k in keys:
        ident = tuple(norm_brand(tw(x)) for x in k) if isinstance(k, tuple) else norm_brand(tw(k))
        if not ident or ident in seen or (isinstance(k, str) and k in CJK_STOP):
            continue
        seen.add(ident)
        out.append(k)
    return out, require


def _meters(a, b):
    import math
    dy = (a["lat"] - b["lat"]) * 110540
    dx = (a["lng"] - b["lng"]) * 111320 * math.cos(math.radians((a["lat"] + b["lat"]) / 2))
    return math.hypot(dx, dy)


def dedupe_nearby(rows, meters=DEDUPE_METERS):
    """同一筆優惠的分店清單裡，距離很近的算同一家。留下來的優先挑名字裡有「店／門市／館」的
    （卡片上要顯示「最近分店：屈臣氏七堵店」，不是光禿禿的「屈臣氏」——第三輪只挑最短的名字，
    屈臣氏、麥味登有一堆分店變成只剩品牌名），同樣有的再挑最短的。"""
    kept = []
    branchy = lambda x: 0 if re.search(r"(店|門市|館)", x["name"]) else 1
    for r in sorted(rows, key=lambda x: (branchy(x), len(x["name"]), x["name"])):
        if any(_meters(r, k) < meters for k in kept):
            continue
        kept.append(r)
    return kept


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


def search(api_key, query, page_token=None, refresh=False, rect=None):
    body = {"textQuery": query, "languageCode": "zh-TW", "regionCode": "TW",
            "pageSize": 20, "locationRestriction": {"rectangle": rect or TAIWAN_RECT}}
    if page_token:
        body["pageToken"] = page_token
    raw = json.dumps(body, ensure_ascii=False, sort_keys=True)
    cache_file = CACHE / (hashlib.sha1(raw.encode("utf-8")).hexdigest() + ".json")
    if cache_file.exists() and not refresh:
        return json.loads(cache_file.read_text(encoding="utf-8")), False
    if CACHE_ONLY:
        return {}, False
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
    # exclude：店名包含這些字就不收（寶雅 POYA 比到「寶雅中醫診所」、誠品 比到「誠品畫廊」）
    if a.get("match"):
        keys = {"any": a["match"], "all": a.get("require") or [], "none": a.get("exclude") or []}
    else:
        auto_any, auto_all = derive_keys(offer["brand"])
        keys = {"any": auto_any + [q for q in queries if q != offer["brand"]],
                "all": a.get("require") or auto_all, "none": a.get("exclude") or []}
    regions = offer.get("regions") or []
    counties = COUNTIES if (not regions or "全台" in regions) else [c for c in regions if c in COUNTIES]
    return queries, keys, counties


def paged(api_key, text, rect, refresh, max_pages):
    """翻頁拿完一個查詢。回傳 (places, 計費次數, 是否被 60 筆上限截斷)。
    翻滿 3 頁之後還有 nextPageToken，代表 Google 手上還有更多、只是不給了。"""
    places, calls, token, pages = [], 0, None, 0
    for _ in range(max(1, min(max_pages, 3))):
        data, billed = search(api_key, text, token, refresh, rect)
        calls += billed
        pages += 1
        places += data.get("places", [])
        token = data.get("nextPageToken")
        if not token:
            break
    # Google 最多給 3 頁（60 筆），而且第 3 頁之後「不會」再給 nextPageToken，就算手上還有
    # 更多。第一版用「翻滿 3 頁還有 token」判斷截斷，這個條件實際上永遠不成立——全部跑完
    # 雙北、台中還是卡在 59 家，分區補抓一次都沒觸發。改成「3 頁都拿滿（60 筆）」就當作截斷。
    return places, calls, pages >= 3 and len(places) >= 60


def split4(rect):
    lo, hi = rect["low"], rect["high"]
    mlat = (lo["latitude"] + hi["latitude"]) / 2
    mlng = (lo["longitude"] + hi["longitude"]) / 2
    box = lambda a, b, c, d: {"low": {"latitude": a, "longitude": b}, "high": {"latitude": c, "longitude": d}}
    return [box(lo["latitude"], lo["longitude"], mlat, mlng), box(lo["latitude"], mlng, mlat, hi["longitude"]),
            box(mlat, lo["longitude"], hi["latitude"], mlng), box(mlat, mlng, hi["latitude"], hi["longitude"])]


def bbox_of(places, pad=0.05):
    pts = [p["location"] for p in places if (p.get("location") or {}).get("latitude") is not None]
    if not pts:
        return None
    return {"low": {"latitude": min(x["latitude"] for x in pts) - pad, "longitude": min(x["longitude"] for x in pts) - pad},
            "high": {"latitude": max(x["latitude"] for x in pts) + pad, "longitude": max(x["longitude"] for x in pts) + pad}}


def tiled(api_key, text, rect, refresh, max_pages, depth, info):
    """被截斷的區域切成四塊各自再查，直到每一塊都沒被截斷（或切到很小了）。"""
    places, calls, capped = paged(api_key, text, rect, refresh, max_pages)
    info["tiles"] += 1
    span = min(rect["high"]["latitude"] - rect["low"]["latitude"],
               rect["high"]["longitude"] - rect["low"]["longitude"])
    if capped and depth < MAX_TILE_DEPTH and span / 2 >= MIN_TILE_DEG:
        for sub in split4(rect):
            p2, c2 = tiled(api_key, text, sub, refresh, max_pages, depth + 1, info)
            places += p2
            calls += c2
    elif capped:
        info["still_capped"] = True
    return places, calls


def keep_place(p, keys, county):
    """店名要對得上品牌、地址要在這個縣市、不是永久歇業。"""
    name = (p.get("displayName") or {}).get("text", "")
    loc = p.get("location") or {}
    if not p.get("id") or "latitude" not in loc:
        return None
    if any(x in name for x in NAME_EXCLUDE):
        return None
    if p.get("businessStatus") == "CLOSED_PERMANENTLY":
        return None
    any_keys, all_keys = (keys["any"], keys["all"]) if isinstance(keys, dict) else (keys, [])
    none_keys = keys.get("none", []) if isinstance(keys, dict) else []
    if not name_matches(name, any_keys, all_keys):
        return None
    dn = norm_brand(tw(name))
    if any(norm_brand(tw(x)) in dn for x in none_keys if norm_brand(tw(x))):
        return None
    addr = p.get("formattedAddress", "")
    if tw(county) not in tw(addr):
        return None
    return {"place_id": p["id"], "name": name, "address": addr, "county": county,
            "lat": loc["latitude"], "lng": loc["longitude"], "business_status": p.get("businessStatus")}


def fetch_county(api_key, query, keys, county, refresh, max_pages):
    """查一個品牌在一個縣市的所有分店。先照舊查「品牌 縣市」；如果被 60 筆上限截斷，
    改用縣市外框分區補抓。回傳 (過濾後的分店, 計費次數, {"tiles": 補抓幾區, "still_capped": bool})。"""
    info = {"tiles": 0, "still_capped": False}
    text = f"{query} {county}"
    places, calls, capped = paged(api_key, text, None, refresh, max_pages)
    if capped:
        # 沒有預設外框的縣市，用「地址真的在這個縣市」的那幾家算補抓範圍——不能用全部
        # 60 筆：小縣市的查詢結果可能混了一堆外縣市的店，外框會一路包到台北，補抓就變成
        # 全台灣重查一遍、白花錢。一家都不在這個縣市的話就不補抓。
        local = [x for x in places if tw(county) in tw(x.get("formattedAddress", ""))]
        box = COUNTY_BOX.get(county) or bbox_of(local)
        if box:
            p2, c2 = tiled(api_key, text, box, refresh, max_pages, 0, info)
            places += p2
            calls += c2
    out, seen = [], set()
    for p in places:
        r = keep_place(p, keys, county)
        if r and r["place_id"] not in seen:
            seen.add(r["place_id"])
            out.append(r)
    return out, calls, info


def row_sql(r):
    return (f"({int(r['offer_id'])},{sql_str(r['place_id'])}::text,{sql_str(r['name'])}::text,"
            f"{sql_str(r['address'])}::text,{sql_str(r['county'])}::text,{float(r['lat'])}::float8,"
            f"{float(r['lng'])}::float8,{sql_str(r['business_status'])}::text)")


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
    ap.add_argument("--cache-only", action="store_true",
                    help="只用 .places_cache 裡查過的結果重算（改比對規則／別名後用，不打 API、不花錢）")
    ap.add_argument("--rows-per-file", type=int, default=ROWS_PER_FILE,
                    help=f"每個匯入檔幾家分店（預設 {ROWS_PER_FILE}；SQL Editor 報 request entity too large 就調小）")
    args = ap.parse_args()
    global CACHE_ONLY
    CACHE_ONLY = args.cache_only

    api_key = os.environ.get("GOOGLE_MAPS_API_KEY", "")
    if not api_key and not args.dry_run and not args.cache_only:
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
          f"最多 {n_queries * args.max_pages} 次 API 呼叫（有結果不滿一頁就不會翻下一頁）。\n"
          f"大縣市被 60 筆上限截斷時會自動分區補抓，實際呼叫次數會比這個多一些。")
    if args.dry_run:
        for o, q, _, c in planned:
            print(f"  #{o['id']} {o['brand']}  查「{'」「'.join(q)}」× {len(c)} 縣市")
        return

    rows, calls, per_offer, tiled_log, still_capped = [], 0, {}, [], []
    for o, queries, keys, counties in planned:
        seen, offer_rows = set(), []
        for query, county in ((q, c) for q in queries for c in counties):
            found, c, info = fetch_county(api_key, query, keys, county, args.refresh, args.max_pages)
            calls += c
            if info["tiles"]:
                tiled_log.append(f"{o['brand']}／{county}：分 {info['tiles']} 區補抓")
            if info["still_capped"]:
                still_capped.append(f"{o['brand']}／{county}")
            for r in found:
                if r["place_id"] in seen:
                    continue
                seen.add(r["place_id"])
                offer_rows.append({"offer_id": o["id"], "brand": o["brand"], **r})
        offer_rows = dedupe_nearby(offer_rows)
        seen = {r["place_id"] for r in offer_rows}
        rows.extend(offer_rows)
        per_offer[o["brand"]] = len(seen)
        print(f"  #{o['id']} {o['brand']}：{len(seen)} 家分店")

    OUT_JSON.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")

    run_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    offer_ids = sorted({o["id"] for o, *_ in planned})
    for old in HERE.glob("stores_import*.sql"):
        old.unlink()
    per = max(50, args.rows_per_file)
    parts = [rows[i:i + per] for i in range(0, len(rows), per)] or [[]]
    out_files = []
    for n, chunk in enumerate(parts, 1):
        last = n == len(parts)
        lines = [
            f"-- 由 fetch_stores.py 產生（{run_ts}），第 {n}/{len(parts)} 個檔，請依序全部貼完。",
            "-- 要先跑過 schema_v58_offer_stores.sql。可重複執行。",
            "begin;",
        ]
        if chunk:
            lines += [
                "insert into public.offer_stores (offer_id, place_id, name, address, county, lat, lng,",
                "  business_status, source, fetched_at)",
                "select v.offer_id, v.place_id, v.name, v.address, v.county, v.lat, v.lng, v.business_status,",
                f"  'google_places', timestamptz {sql_str(run_ts)}",
                "from (values",
                ",\n".join(row_sql(r) for r in chunk),
                ") as v(offer_id, place_id, name, address, county, lat, lng, business_status)",
                "join public.offers o on o.id = v.offer_id",
                "on conflict (offer_id, place_id) do update set",
                "  name = excluded.name, address = excluded.address, county = excluded.county,",
                "  lat = excluded.lat, lng = excluded.lng, business_status = excluded.business_status,",
                "  fetched_at = excluded.fetched_at,",
                "  -- 上一輪被匯入自動隱藏、這一輪又出現的分店重新打開；管理員手動隱藏的不動",
                "  hidden = case when offer_stores.hidden_by = 'import' then false else offer_stores.hidden end,",
                "  hidden_by = case when offer_stores.hidden_by = 'import' then null else offer_stores.hidden_by end;",
            ]
        if last:
            ids = ",".join(map(str, offer_ids)) or "null"
            lines += [
                "-- 前面的檔案都貼過了，才把「這一輪有查、但分店沒再出現」（已歇業或之前抓錯）的",
                "-- 自動隱藏（不刪除）。少貼一個檔的話這裡會報錯停下來，不會誤把一大堆分店藏掉。",
                "do $$",
                "begin",
                f"  if (select count(*) from public.offer_stores where fetched_at = timestamptz {sql_str(run_ts)}) < {len(rows)} then",
                f"    raise exception '前面的 stores_import 檔案還沒全部貼完（這一輪應該有 {len(rows)} 家），先把缺的貼完再貼一次最後這個檔。';",
                "  end if;",
                "end $$;",
                "update public.offer_stores set hidden = true, hidden_by = 'import'",
                "where source = 'google_places' and not hidden",
                f"  and offer_id in ({ids})",
                f"  and fetched_at < timestamptz {sql_str(run_ts)};",
            ]
        lines.append("commit;")
        name = f"stores_import_{n:02d}.sql"
        (HERE / name).write_text("\n".join(lines) + "\n", encoding="utf-8")
        out_files.append(name)

    if tiled_log:
        print(f"\n這些縣市被 60 筆上限截斷，已自動分區補抓：")
        for x in tiled_log:
            print("  -", x)
    if still_capped:
        print(f"\n⚠️ 下面這些切到最小格還是被截斷，可能還有漏抓的分店（通常不會發生）：")
        for x in still_capped:
            print("  -", x)
    zero = [b for b, n in per_offer.items() if n == 0]
    print(f"\n完成：{len(rows)} 家分店，實際計費 API 呼叫 {calls} 次（其餘走快取）。")
    print(f"輸出：{'、'.join(out_files)}（依序全部貼進 SQL Editor）、{OUT_JSON.name}（人工檢查用）")
    if CACHE_ONLY:
        print("（--cache-only：沒查過的分區補抓區塊都略過了，要補齊請拿金鑰正常跑一次）")
    if zero:
        print(f"\n⚠️ 下面 {len(zero)} 筆一家都沒找到，可能是店名跟 Google 不同（到 "
              f"store_search_aliases.json 設 query/match），或是純線上優惠（加進 skip）：")
        for b in zero:
            print("  -", b)


if __name__ == "__main__":
    main()
