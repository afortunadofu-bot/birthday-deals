#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生日優惠自動爬蟲
================
從公開的「生日優惠懶人包」頁面抓取品牌 / 優惠 / 會員條件 / 提前天數，
產生 scraped_raw.json，並與人工維護的 offers.json 做差異比對。

設計原則
--------
1. 只抓允許抓取的頁面（先讀 robots.txt）。
2. 每個網域之間間隔 REQUEST_DELAY 秒，不對來源造成負擔。
3. **不自動覆蓋 offers.json**。爬蟲只產出「新增 / 疑似變動」清單，
   由人工確認後再寫回，避免錯誤資料直接上線。

用法
----
    pip install requests beautifulsoup4 lxml
    python scraper.py                 # 抓取並輸出 scraped_raw.json + diff_report.md
    python scraper.py --apply         # 額外把「純新增」的品牌寫進 offers.json（標 verified=false）
"""

import argparse
import json
import re
import sys
import time
import urllib.robotparser
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("請先安裝相依套件：pip install requests beautifulsoup4 lxml")

# --------------------------------------------------------------------------
# 設定
# --------------------------------------------------------------------------

HERE = Path(__file__).parent
OFFERS_PATH = HERE / "offers.json"
RAW_PATH = HERE / "scraped_raw.json"
DIFF_PATH = HERE / "diff_report.md"

USER_AGENT = "BirthdayDealsBot/1.0 (+個人專案；僅彙整公開優惠資訊)"
REQUEST_DELAY = 3.0          # 秒，同網域間隔
TIMEOUT = 30

# 來源清單。每個來源指定要掃描的標題層級與該頁的預設分類。
SOURCES = [
    {
        "name": "好康情報誌 生日優惠懶人包",
        "urls": [
            "https://info.talk.tw/2026birthday/",
            "https://info.talk.tw/2026birthday/2/",
        ],
        "heading_selector": "h3, h4",
        "default_category": "餐廳",
        "tier": 3, "tierLabel": "部落格懶人包",
    },
    {
        "name": "貪食瑞秋 生日壽星優惠懶人包",
        "urls": ["https://rachel.tw/birthday/"],
        "heading_selector": "h3, h4",
        "default_category": "餐廳",
        "tier": 3, "tierLabel": "部落格懶人包",
    },
    {
        # Ocard 沒有公開 API，品牌清單鎖在 App 內需登入才看得到。
        # 這些是專門整理 Ocard 生日禮的公開頁面，是目前唯一可行的替代來源。
        "name": "Ocard 生日優惠整理（Dcard／vocus）",
        "urls": [
            "https://vocus.cc/article/68d22ff4fd89780001210a2b",
            "https://www.dcard.tw/f/food/p/261083732",
        ],
        "heading_selector": "h2, h3, h4",
        "default_category": "餐廳",
        "tier": 3, "tierLabel": "部落格懶人包",
        "force_membership": "Ocard 會員",
    },
    {
        "name": "今周刊 生日優惠整理",
        "urls": ["https://www.businesstoday.com.tw/article/category/183031/post/202512290017/"],
        "heading_selector": "h2, h3",
        "default_category": "餐廳",
        "tier": 2, "tierLabel": "新聞媒體",
    },
]

# --------------------------------------------------------------------------
# 欄位抽取規則
# --------------------------------------------------------------------------

# 「提前 N 天」的各種寫法
ADVANCE_PATTERNS = [
    (re.compile(r"生日前\s*(\d+)\s*(?:個)?工作日"), 1),
    (re.compile(r"提前\s*(\d+)\s*天"), 1),
    (re.compile(r"生日前\s*(\d+)\s*天"), 1),
    (re.compile(r"前\s*(\d+)\s*天(?:完成|註冊|預訂|預約)"), 1),
    (re.compile(r"需(?:要)?\s*(\d+)\s*天前(?:預訂|預約)"), 1),
    (re.compile(r"前\s*(\d+)\s*個月"), 30),          # 乘數 30
]

MEMBERSHIP_PATTERNS = [
    (re.compile(r"Ocard", re.I), "Ocard 會員"),
    (re.compile(r"LINE\s*@?|LINE會員|LINE 官方"), "LINE 會員"),
    (re.compile(r"APP\s*會員|APP會員|下載.{0,6}APP"), "APP 會員"),
    (re.compile(r"加入會員|成為會員|註冊會員|卡友"), "品牌會員"),
]

WINDOW_PATTERNS = [
    # 「生日當日60天內」是使用期限而非適用期間，需排除
    (re.compile(r"當日壽星|生日當日(?!\s*\d)|生日當天(?!\s*\d)"), "當日"),
    (re.compile(r"當週壽星|前後\s*七\s*天|前後\s*7\s*天"), "當週"),
    (re.compile(r"前後\s*(\d+)\s*天"), "前後N天"),
    (re.compile(r"當月壽星|生日當月|生日月"), "當月"),
]

CATEGORY_KEYWORDS = {
    "飲料": ["茶", "奶茶", "飲品", "飲料", "咖啡", "紅茶", "TEA", "冰沙"],
    "甜點烘焙": ["蛋糕", "甜點", "泡芙", "貝果", "司康", "麵包", "餅", "牛軋糖", "冰淇淋"],
    "火鍋燒肉": ["火鍋", "燒肉", "鍋物", "涮", "打邊爐", "石頭火鍋", "麻辣"],
    "速食": ["漢堡", "炸雞", "薯條", "披薩", "比薩", "肯德基", "麥當勞", "摩斯", "壽司", "爭鮮"],
    "零售美妝": ["屈臣氏", "康是美", "寶雅", "美妝", "藥妝", "超市", "量販"],
    "娛樂樂園": ["樂園", "遊樂", "影城", "電影", "六福村", "劍湖山", "麗寶"],
}


def guess_category(text: str, default: str) -> str:
    for cat, keywords in CATEGORY_KEYWORDS.items():
        if any(k in text for k in keywords):
            return cat
    return default


def extract_advance_days(text: str):
    """回傳 (天數 or None, 說明片段 or None)。"""
    for pattern, multiplier in ADVANCE_PATTERNS:
        m = pattern.search(text)
        if m:
            days = int(m.group(1)) * multiplier
            start = max(0, m.start() - 25)
            return days, text[start:m.end() + 25].strip()
    return None, None


def extract_first(patterns, text, default=None):
    for pattern, label in patterns:
        if pattern.search(text):
            return label
    return default


def check_robots(url: str) -> bool:
    parsed = urlparse(url)
    rp = urllib.robotparser.RobotFileParser()
    rp.set_url(f"{parsed.scheme}://{parsed.netloc}/robots.txt")
    try:
        rp.read()
    except Exception:
        # 讀不到 robots.txt 時保守放行，但仍維持低頻率
        return True
    return rp.can_fetch(USER_AGENT, url)


def fetch(url: str) -> str:
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
    resp.raise_for_status()
    resp.encoding = resp.apparent_encoding or "utf-8"
    return resp.text


# --------------------------------------------------------------------------
# 解析：以標題為切點，收集到下一個標題為止的內文
# --------------------------------------------------------------------------

NOISE_HEADINGS = re.compile(
    r"相關文章|最新文章|熱門文章|分類|關於|延伸閱讀|標籤|文章目錄|分享"
)


def parse_page(html: str, source: dict, url: str) -> list:
    soup = BeautifulSoup(html, "lxml")

    # 移除側欄、頁尾等雜訊
    for tag in soup.select("nav, footer, aside, script, style"):
        tag.decompose()

    results = []
    for heading in soup.select(source["heading_selector"]):
        title = heading.get_text(" ", strip=True)
        if not title or NOISE_HEADINGS.search(title):
            continue

        # 收集到下一個同級或更高級標題為止
        body_parts = []
        for sib in heading.find_all_next():
            if sib.name in ("h1", "h2", "h3", "h4"):
                break
            if sib.name in ("p", "li", "td", "div") and sib.find(True, recursive=False) is None:
                txt = sib.get_text(" ", strip=True)
                if txt:
                    body_parts.append(txt)
            if len(" ".join(body_parts)) > 1200:
                break
        body = " ".join(body_parts)
        if len(body) < 15:
            continue

        # 標題常見格式「品牌：優惠內容」
        if "：" in title:
            brand, offer_hint = title.split("：", 1)
        elif ":" in title:
            brand, offer_hint = title.split(":", 1)
        else:
            brand, offer_hint = title, ""

        brand = brand.strip("▎▪ ★☆*# ").strip()
        combined = title + " " + body

        days, days_note = extract_advance_days(combined)

        # 地區與期限：沿用 threads_client 的解析規則，兩支爬蟲共用同一套辭典
        from datetime import datetime as _dt
        try:
            from threads_client import extract_regions, extract_validity
            regions = extract_regions(combined)
            vfrom, vuntil, vraw = extract_validity(combined, _dt.now())
        except ImportError:
            regions, vfrom, vuntil, vraw = [], None, None, None

        results.append({
            "brand": brand,
            "category": guess_category(combined, source["default_category"]),
            "offer": offer_hint.strip() or body[:120],
            "membership": source.get("force_membership")
                          or extract_first(MEMBERSHIP_PATTERNS, combined, "需確認"),
            "advanceDays": days,
            "advanceNote": days_note,
            "regions": regions,
            "validFrom": vfrom,
            "validUntil": vuntil,
            "validityRaw": vraw,
            "sourceTier": source.get("tier", 3),
            "tierLabel": source.get("tierLabel", "部落格懶人包"),
            "window": extract_first(WINDOW_PATTERNS, combined, "當月"),
            "rawText": body[:800],
            "verified": False,
            "source": url,
            "sourceName": source["name"],
            "lastChecked": date.today().isoformat(),
        })
    return results


# --------------------------------------------------------------------------
# 主流程
# --------------------------------------------------------------------------

def normalize(name: str) -> str:
    """品牌名正規化，用來比對是否已存在。"""
    return re.sub(r"[\s（）()＆&·・\-–—【】\[\]]", "", name).lower()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true",
                        help="把純新增的品牌寫入 offers.json（標記 verified=false 待人工確認）")
    args = parser.parse_args()

    scraped = []
    for source in SOURCES:
        for url in source["urls"]:
            if not check_robots(url):
                print(f"[skip] robots.txt 不允許：{url}")
                continue
            try:
                print(f"[fetch] {url}")
                html = fetch(url)
                items = parse_page(html, source, url)
                print(f"        擷取 {len(items)} 筆")
                scraped.extend(items)
            except Exception as exc:
                print(f"[error] {url} -> {exc}")
            time.sleep(REQUEST_DELAY)

    RAW_PATH.write_text(
        json.dumps({"scrapedAt": date.today().isoformat(), "items": scraped},
                   ensure_ascii=False, indent=2),
        encoding="utf-8")
    print(f"\n已寫入 {RAW_PATH.name}（{len(scraped)} 筆原始資料）")

    # ---- 與現有資料比對 ----
    data = json.loads(OFFERS_PATH.read_text(encoding="utf-8"))
    existing = {normalize(o["brand"]): o for o in data["offers"]}

    new_items, changed = [], []
    seen = set()
    for item in scraped:
        key = normalize(item["brand"])
        if not key or key in seen:
            continue
        seen.add(key)
        match = None
        for ek, ev in existing.items():
            if key in ek or ek in key:
                match = ev
                break
        if match is None:
            new_items.append(item)
        else:
            diffs = []
            if item["advanceDays"] is not None and item["advanceDays"] != match.get("advanceDays"):
                diffs.append(f"提前天數：{match.get('advanceDays')} → {item['advanceDays']}")
            if item["window"] != match.get("window") and match.get("window") not in ("", None):
                diffs.append(f"適用期間：{match.get('window')} → {item['window']}")
            if diffs:
                changed.append((match["brand"], diffs, item["source"]))

    lines = [f"# 爬蟲差異報告　{date.today().isoformat()}", ""]
    lines.append(f"- 爬取筆數：**{len(scraped)}**（去重後 {len(seen)} 個品牌）")
    lines.append(f"- 現有資料：**{len(data['offers'])}** 筆")
    lines.append(f"- 疑似新增：**{len(new_items)}**　疑似變動：**{len(changed)}**")
    lines.append("")

    if changed:
        lines += ["## ⚠️ 疑似變動（請人工複查）", ""]
        for brand, diffs, src in changed:
            lines.append(f"### {brand}")
            lines += [f"- {d}" for d in diffs]
            lines.append(f"- 來源：{src}")
            lines.append("")

    if new_items:
        lines += ["## ➕ 疑似新增品牌", ""]
        for it in new_items:
            lines.append(f"### {it['brand']}　`{it['category']}`")
            lines.append(f"- 優惠：{it['offer'][:150]}")
            lines.append(f"- 會員：{it['membership']}　提前天數：{it['advanceDays']}")
            lines.append(f"- 期間：{it['window']}　地區：{'、'.join(it['regions']) or '未偵測'}")
            lines.append(f"- 期限：{it['validFrom'] or '?'} ～ {it['validUntil'] or '未偵測'}"
                         + (f"（原文：{it['validityRaw']}）" if it.get("validityRaw") else ""))
            lines.append(f"- 來源：[{it['tierLabel']}] {it['source']}")
            lines.append("")

    DIFF_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"已寫入 {DIFF_PATH.name}")

    if args.apply and new_items:
        for it in new_items:
            data["offers"].append({
                "id": normalize(it["brand"])[:24] or f"auto{len(data['offers'])}",
                "brand": it["brand"],
                "category": it["category"],
                "offer": it["offer"][:200],
                "membership": it["membership"],
                "advanceDays": it["advanceDays"],
                "advanceNote": it["advanceNote"] or "由爬蟲自動擷取，未經人工確認",
                "window": it["window"],
                "conditions": "—（待人工補齊）",
                "validity": "—",
                "verified": False,
                "source": it["source"],
                "lastChecked": it["lastChecked"],
                # v2 欄位
                "regions": it["regions"],
                "regionNote": "由爬蟲自動偵測，未確認門市分布",
                "validityType": "fixed" if it["validUntil"] else "rolling",
                "validFrom": it["validFrom"],
                "validUntil": it["validUntil"],
                "sources": [{"url": it["source"], "title": it["sourceName"],
                             "tier": it["sourceTier"], "tierLabel": it["tierLabel"],
                             "checked": it["lastChecked"]}],
                "bestSource": {"url": it["source"], "title": it["sourceName"],
                               "tier": it["sourceTier"], "tierLabel": it["tierLabel"],
                               "checked": it["lastChecked"]},
            })
        data["meta"]["lastBuild"] = date.today().isoformat()
        OFFERS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"已將 {len(new_items)} 筆新增品牌寫入 offers.json（verified=false）")
        print("請執行 python build.py 重新產生網站。")


if __name__ == "__main__":
    main()
