#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Threads 生日優惠爬蟲（官方 Graph API）
=====================================

使用 Meta 官方的 Threads Keyword Search API 搜尋公開貼文，
抽取「品牌 / 縣市 / 優惠期限 / 提前註冊天數」，產出待審清單。

⚠️ 三個必須先知道的限制
------------------------
1. **需要 App Review 通過 `threads_keyword_search` 進階權限**，
   否則 API 只會搜尋「你自己帳號的貼文」，搜不到別人的公開貼文。
   申請可能需要企業驗證（Business Verification）。
   來源：https://developers.facebook.com/docs/threads/keyword-search/

2. **每個使用者 24 小時上限 2,200 次查詢**，且跨 App 共用額度。
   本程式內建額度記帳（threads_quota.json），超過會停止。

3. **圖文貼文的文字若「畫在圖片裡」，API 只回傳貼文的 caption 文字，
   不會回傳圖片內的文字。** 本程式解析的是 caption。
   若要讀圖內文字，需要另外接 OCR（見檔案末 OCR_NOTE）。

環境變數
--------
    export THREADS_ACCESS_TOKEN="你的 token"

用法
----
    python threads_client.py --days 14            # 搜尋近 14 天貼文
    python threads_client.py --days 30 --limit 100
    python threads_client.py --dry-run            # 不打 API，用範例資料驗證解析邏輯
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("請先安裝：pip install requests")

HERE = Path(__file__).parent
QUOTA_PATH = HERE / "threads_quota.json"
OUT_JSON = HERE / "threads_candidates.json"
OUT_MD = HERE / "threads_report.md"
OFFERS_PATH = HERE / "offers.json"

API = "https://graph.threads.net/v1.0/keyword_search"
FIELDS = "id,text,media_type,permalink,timestamp,username"
DAILY_QUOTA = 2200

# 搜尋詞。TAG 模式用主題標籤，KEYWORD 模式用一般關鍵字。
QUERIES = [
    ("生日優惠", "KEYWORD"),
    ("壽星優惠", "KEYWORD"),
    ("壽星", "TAG"),
    ("生日優惠", "TAG"),
    ("壽星免費", "KEYWORD"),
    ("生日禮", "KEYWORD"),
]

# ---------------------------------------------------------------- 地區辭典
COUNTIES = [
    "台北市", "臺北市", "新北市", "桃園市", "台中市", "臺中市", "台南市", "臺南市",
    "高雄市", "基隆市", "新竹市", "新竹縣", "苗栗縣", "彰化縣", "南投縣", "雲林縣",
    "嘉義市", "嘉義縣", "屏東縣", "宜蘭縣", "花蓮縣", "台東縣", "臺東縣",
    "澎湖縣", "金門縣", "連江縣",
]
# 常見簡稱／行政區 → 縣市
DISTRICT_MAP = {
    "台北": "台北市", "北市": "台北市", "信義區": "台北市", "大安區": "台北市",
    "中山區": "台北市", "士林": "台北市", "內湖": "台北市", "西門": "台北市",
    "東區": "台北市", "南港": "台北市", "松山": "台北市",
    "新北": "新北市", "板橋": "新北市", "新莊": "新北市", "三重": "新北市",
    "中和": "新北市", "永和": "新北市", "淡水": "新北市", "新店": "新北市", "土城": "新北市",
    "桃園": "桃園市", "中壢": "桃園市", "南崁": "桃園市",
    "台中": "台中市", "中市": "台中市", "逢甲": "台中市", "一中": "台中市",
    "勤美": "台中市", "北屯": "台中市", "西屯": "台中市", "南屯": "台中市", "豐原": "台中市",
    "台南": "台南市", "中西區": "台南市",
    "高雄": "高雄市", "左營": "高雄市", "苓雅": "高雄市", "鹽埕": "高雄市", "三多": "高雄市",
    "新竹": "新竹市", "竹北": "新竹縣", "關西": "新竹縣",
    "基隆": "基隆市", "苗栗": "苗栗縣", "彰化": "彰化縣", "員林": "彰化縣", "鹿港": "彰化縣",
    "南投": "南投縣", "雲林": "雲林縣", "斗六": "雲林縣", "虎尾": "雲林縣", "古坑": "雲林縣",
    "嘉義": "嘉義市", "民雄": "嘉義縣", "屏東": "屏東縣", "恆春": "屏東縣",
    "宜蘭": "宜蘭縣", "羅東": "宜蘭縣", "花蓮": "花蓮縣", "台東": "台東縣",
    "澎湖": "澎湖縣", "金門": "金門縣", "馬祖": "連江縣",
}
NATIONWIDE = re.compile(r"全台|全臺|全省|各分店|全門市|全國")

# ---------------------------------------------------------------- 期限辭典
CURRENT_YEAR = datetime.now().year

DATE_RANGE_PATTERNS = [
    # 2026/8/1-2026/8/31、2026.8.1~8.31
    re.compile(r"(\d{4})[/.\-年](\d{1,2})[/.\-月](\d{1,2})日?\s*[~\-–—至到]\s*(?:(\d{4})[/.\-年])?(\d{1,2})[/.\-月](\d{1,2})"),
    # 8/1-8/31、8/1~8/31
    re.compile(r"(?<!\d)(\d{1,2})[/.](\d{1,2})\s*[~\-–—至到]\s*(\d{1,2})[/.](\d{1,2})(?!\d)"),
]
DEADLINE_PATTERNS = [
    re.compile(r"(?:活動|優惠|使用|兌換|領取)?\s*(?:至|到|截止(?:日)?[:：]?)\s*(\d{4})[/.\-年](\d{1,2})[/.\-月](\d{1,2})"),
    re.compile(r"(?:至|到)\s*(\d{1,2})[/.月](\d{1,2})\s*(?:日)?\s*(?:止|截止|前)"),
    re.compile(r"(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(?:止|截止|前|到期)"),
]
ADVANCE_PATTERNS = [
    (re.compile(r"生日前\s*(\d+)\s*(?:個)?工作日"), 1),
    (re.compile(r"(?:提前|需|請)\s*(\d+)\s*天(?:前)?(?:完成|註冊|預訂|預約|加入)"), 1),
    (re.compile(r"生日前\s*(\d+)\s*天"), 1),
    (re.compile(r"(\d+)\s*天前(?:預訂|預約|完成)"), 1),
    (re.compile(r"前\s*(\d+)\s*個月(?:加入|註冊|入會)"), 30),
]
MEMBERSHIP_PATTERNS = [
    (re.compile(r"Ocard", re.I), "Ocard 會員"),
    (re.compile(r"LINE\s*@|LINE\s*會員|LINE官方"), "LINE 會員"),
    (re.compile(r"APP\s*會員|下載.{0,8}APP"), "APP 會員"),
    (re.compile(r"加入會員|成為會員|註冊會員|卡友|會員限定"), "品牌會員"),
    (re.compile(r"免會員|不需(?:加入)?會員|無須會員"), "無需會員"),
]

# 廣告/業配雜訊，命中就降低可信度
PROMO_NOISE = re.compile(r"合作|業配|抽獎|留言抽|tag\s*好友|標記好友|團購|代購|#ad", re.I)


# ---------------------------------------------------------------- 額度記帳
def load_quota() -> dict:
    if QUOTA_PATH.exists():
        q = json.loads(QUOTA_PATH.read_text(encoding="utf-8"))
        if datetime.fromisoformat(q["windowStart"]) > datetime.now(timezone.utc) - timedelta(hours=24):
            return q
    return {"windowStart": datetime.now(timezone.utc).isoformat(), "used": 0}


def save_quota(q: dict):
    QUOTA_PATH.write_text(json.dumps(q, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------------------------------------------------------------- 解析
def extract_regions(text: str):
    found = []
    if NATIONWIDE.search(text):
        found.append("全台")
    for c in COUNTIES:
        if c in text:
            found.append(c.replace("臺", "台"))
    for k, v in DISTRICT_MAP.items():
        if k in text and v not in found:
            found.append(v)
    # 去重保序
    out, seen = [], set()
    for r in found:
        if r not in seen:
            seen.add(r); out.append(r)
    return out


def _mk(y, m, d):
    try:
        return datetime(int(y), int(m), int(d)).date().isoformat()
    except ValueError:
        return None


def extract_validity(text: str, posted: datetime):
    """回傳 (validFrom, validUntil, 原文片段)。"""
    year = posted.year
    for pat in DATE_RANGE_PATTERNS:
        m = pat.search(text)
        if not m:
            continue
        g = m.groups()
        if len(g) == 6:      # 含西元年
            y1, m1, d1, y2, m2, d2 = g
            return _mk(y1, m1, d1), _mk(y2 or y1, m2, d2), m.group(0)
        m1, d1, m2, d2 = g   # 無年份，用貼文年份推定
        f, u = _mk(year, m1, d1), _mk(year, m2, d2)
        if f and u and u < f:            # 跨年
            u = _mk(year + 1, m2, d2)
        return f, u, m.group(0)

    for pat in DEADLINE_PATTERNS:
        m = pat.search(text)
        if not m:
            continue
        g = m.groups()
        if len(g) == 3:
            return None, _mk(*g), m.group(0)
        u = _mk(year, g[0], g[1])
        if u and u < posted.date().isoformat():
            u = _mk(year + 1, g[0], g[1])
        return None, u, m.group(0)
    return None, None, None


def extract_advance(text: str):
    for pat, mul in ADVANCE_PATTERNS:
        m = pat.search(text)
        if m:
            s = max(0, m.start() - 20)
            return int(m.group(1)) * mul, text[s:m.end() + 20].strip()
    return None, None


def extract_membership(text: str):
    for pat, label in MEMBERSHIP_PATTERNS:
        if pat.search(text):
            return label
    return "需確認"


def match_brand(text: str, known_brands: dict):
    """比對已知品牌；回傳 (第一個命中的品牌, 是否為未知品牌, 全部命中清單)。"""
    flat = re.sub(r"\s", "", text)
    hits = [brand for norm, brand in known_brands.items() if norm and norm in flat]
    if hits:
        return hits[0], False, hits
    return None, True, []


def score(item: dict) -> int:
    """貼文可信度評分（0–100）。社群貼文本質為 tier 4，這裡只做內部排序。"""
    s = 40
    t = item["text"]
    if item["brand"]:            s += 15
    if item["validUntil"]:       s += 15
    if item["advanceDays"] is not None: s += 10
    if item["membership"] != "需確認":  s += 10
    if item["regions"]:          s += 10
    if len(t) > 120:             s += 5
    if PROMO_NOISE.search(t):    s -= 25
    if item["mediaType"] == "IMAGE" and len(t) < 40:
        s -= 20                  # 純圖無文，caption 幾乎沒資訊
    return max(0, min(100, s))


# ---------------------------------------------------------------- API
def search(token: str, q: str, mode: str, since: int, until: int,
           limit: int, media_type: str | None, quota: dict):
    if quota["used"] >= DAILY_QUOTA:
        raise RuntimeError(f"已達 24 小時查詢上限 {DAILY_QUOTA}，請稍後再試")
    params = {
        "q": q, "search_mode": mode, "search_type": "RECENT",
        "fields": FIELDS, "since": since, "until": until,
        "limit": limit, "access_token": token,
    }
    if media_type:
        params["media_type"] = media_type
    r = requests.get(API, params=params, timeout=30)
    quota["used"] += 1
    save_quota(quota)
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code}: {r.text[:300]}")
    return r.json().get("data", [])


SAMPLE = [{
    "id": "sample1", "media_type": "IMAGE", "username": "deal_hunter_tw",
    "permalink": "https://www.threads.net/@deal_hunter_tw/post/SAMPLE",
    "timestamp": "2026-08-01T04:12:00+0000",
    "text": "台中壽星必收！瓦庫燒肉生日前後3天憑證件8折，活動至 8/31 止。"
            "另外板橋的山崎咖啡所當月壽星送司康，需提前 3 天預約，加入LINE會員才有券",
}, {
    "id": "sample2", "media_type": "IMAGE", "username": "randomuser",
    "permalink": "https://www.threads.net/@randomuser/post/SAMPLE2",
    "timestamp": "2026-08-02T09:00:00+0000",
    "text": "生日快樂🎂",
}]


# ---------------------------------------------------------------- 主流程
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=14, help="搜尋近 N 天的貼文")
    ap.add_argument("--limit", type=int, default=50, help="每次查詢筆數上限（最大 100）")
    ap.add_argument("--dry-run", action="store_true", help="不打 API，用內建範例驗證解析邏輯")
    args = ap.parse_args()

    offers = json.loads(OFFERS_PATH.read_text(encoding="utf-8"))["offers"]
    known = {re.sub(r"[\s（）()【】\[\]×✕]", "", o["brand"].split("（")[0]): o["brand"]
             for o in offers}

    if args.dry_run:
        raw = SAMPLE
        print("[dry-run] 使用內建範例資料，未呼叫 API")
    else:
        token = os.environ.get("THREADS_ACCESS_TOKEN")
        if not token:
            sys.exit("找不到環境變數 THREADS_ACCESS_TOKEN。\n"
                     "取得方式：Meta for Developers 建立 Threads App → Graph API Explorer 產生 token\n"
                     "並確認已通過 threads_keyword_search 進階權限審核，否則只搜得到你自己的貼文。")
        quota = load_quota()
        print(f"今日已用額度 {quota['used']}/{DAILY_QUOTA}")
        until = int(time.time())
        since = until - args.days * 86400
        raw, seen_ids = [], set()
        for q, mode in QUERIES:
            for mt in ("IMAGE", "TEXT"):
                try:
                    posts = search(token, q, mode, since, until, args.limit, mt, quota)
                    new = [p for p in posts if p["id"] not in seen_ids]
                    seen_ids.update(p["id"] for p in new)
                    raw.extend(new)
                    print(f"  [{mode}/{mt}] {q} → {len(posts)} 筆（新 {len(new)}）")
                except RuntimeError as e:
                    print(f"  [error] {q}/{mt}: {e}")
                    if "上限" in str(e):
                        break
                time.sleep(1)

    # ---- 解析 ----
    items = []
    for p in raw:
        text = p.get("text") or ""
        posted = datetime.fromisoformat(p["timestamp"].replace("+0000", "+00:00"))
        vfrom, vuntil, vraw = extract_validity(text, posted)
        days, dnote = extract_advance(text)
        brand, is_new, all_hits = match_brand(text, known)
        it = {
            "brand": brand, "isNewBrand": is_new,
            "allBrands": all_hits,
            # 一則貼文提到多個品牌時，期限／天數／地區可能不屬於同一家，必須人工拆解
            "multiBrand": len(all_hits) > 1,
            "regions": extract_regions(text),
            "membership": extract_membership(text),
            "advanceDays": days, "advanceNote": dnote,
            "validFrom": vfrom, "validUntil": vuntil, "validityRaw": vraw,
            "text": text, "mediaType": p.get("media_type"),
            "username": p.get("username"),
            "permalink": p.get("permalink"),
            "postedAt": posted.date().isoformat(),
            "sourceTier": 4, "tierLabel": "社群貼文",
        }
        it["confidence"] = score(it)
        items.append(it)

    items.sort(key=lambda x: -x["confidence"])
    OUT_JSON.write_text(json.dumps(
        {"scrapedAt": datetime.now().date().isoformat(), "count": len(items), "items": items},
        ensure_ascii=False, indent=2), encoding="utf-8")

    # ---- 報告 ----
    strong = [i for i in items if i["confidence"] >= 60]
    lines = [f"# Threads 擷取報告　{datetime.now().date().isoformat()}", "",
             f"- 貼文總數：**{len(items)}**",
             f"- 可信度 ≥60 分（值得人工看）：**{len(strong)}**",
             f"- 抓到明確期限：**{sum(1 for i in items if i['validUntil'])}**",
             f"- 抓到提前天數：**{sum(1 for i in items if i['advanceDays'] is not None)}**",
             f"- 抓到縣市：**{sum(1 for i in items if i['regions'])}**", "",
             "> ⚠️ Threads 貼文可信度為 **tier 4（最低）**。以下資料僅作為「線索」，",
             "> 請務必回品牌官方管道確認後，再寫入 offers.json。", ""]
    for i in strong:
        lines += [
            f"### {i['brand'] or '（未比對到已知品牌）'}　`{i['confidence']}分`",
        ]
        if i["multiBrand"]:
            lines.append(f"- ⚠️ **這則貼文提到 {len(i['allBrands'])} 個品牌**"
                         f"（{'、'.join(i['allBrands'])}），下列期限／天數／地區可能分屬不同品牌，需人工拆解")
        lines += [
            f"- 地區：{'、'.join(i['regions']) or '未偵測'}",
            f"- 期限：{i['validFrom'] or '?'} ～ {i['validUntil'] or '未偵測'}"
            + (f"（原文：{i['validityRaw']}）" if i["validityRaw"] else ""),
            f"- 提前天數：{i['advanceDays'] if i['advanceDays'] is not None else '未偵測'}"
            + (f"（{i['advanceNote']}）" if i["advanceNote"] else ""),
            f"- 會員：{i['membership']}　類型：{i['mediaType']}",
            f"- 貼文：@{i['username']} {i['postedAt']} — {i['permalink']}",
            f"- 原文節錄：{i['text'][:180]}", "",
        ]
    OUT_MD.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n已寫入 {OUT_JSON.name}（{len(items)} 筆）與 {OUT_MD.name}（{len(strong)} 筆值得複查）")


OCR_NOTE = """
如果要讀「圖片裡的文字」（多數優惠圖卡屬於此類）：

1. Threads Media API 的 image_url 欄位可取得圖片網址（fields 加上 image_url）。
2. 下載後丟給 OCR。中文推薦：
   - PaddleOCR（開源、繁中辨識好）：pip install paddleocr
   - Google Cloud Vision API（付費，準確度最高）
3. 把 OCR 出來的文字，餵進本檔案的 extract_validity / extract_advance /
   extract_regions 就能沿用同一套解析規則。

注意：OCR 出來的文字錯字率不低（尤其日期的數字），
務必維持 tier 4 標記與人工複查流程，不要直接上線。
"""

if __name__ == "__main__":
    main()
