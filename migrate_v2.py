#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
offers.json v1 → v2 遷移
新增欄位：regions（縣市）／regionNote／validityType／validFrom／validUntil／sources（多來源含可信度）
執行一次即可；可重複執行（具冪等性）。
"""
import json
from pathlib import Path

HERE = Path(__file__).parent
P = HERE / "offers.json"
data = json.loads(P.read_text(encoding="utf-8"))

# ---------------------------------------------------------------- 地區
# "全台" = 全國連鎖；[] = 門市分布未確認
REGIONS = {
    "mcdonalds": ["全台"], "mos": ["全台"], "pk-card": ["全台"], "sanshang": ["全台"],
    "dicos": ["全台"], "popeyes": ["全台"], "marugame": ["全台"], "sushiexpress": ["全台"],
    "br31": ["全台"], "wowprime": ["全台"], "chuchian": ["全台"], "rouduoduo": ["全台"],
    "ikea": ["全台"], "starbucks": ["全台"], "watsons": ["全台"], "tgifridays": ["全台"],
    "juhotpot": ["全台"], "matador": ["全台"], "yudoufu": ["全台"], "yangguo": ["全台"],
    "dashixiong": ["全台"], "xianchadao": ["全台"], "tenren": ["全台"],
    "chatime-cha": ["全台"], "jenjudan": ["全台"], "wuchia": ["全台"],
    "sleep5": ["全台"], "paul": ["全台"], "arennougat": ["全台"], "abolang": ["全台"],
    "bodeggi": ["全台"], "kyotokatsugyu": ["全台"], "xiaoshihou": ["全台"],
    "wuxianji": ["全台"], "shuguoyi": ["全台"], "rollingthai": ["全台"],
    "goodcho": ["台北市", "新北市", "台中市", "高雄市"],
    "ladym": ["台北市", "台中市"],
    "shuncheng": ["台北市", "新北市"],
    "leburger": ["新北市", "台北市", "高雄市"],
    "guotainuan": ["彰化縣", "台中市", "桃園市", "新北市"],
    "yamazakicafe": ["新北市"],
    "waku": ["台中市"],
    "jackbrothers": ["台中市"],
    "janfusun": ["雲林縣"],
    "leofoo": ["新竹縣"],
    "chunxi": ["台北市", "台中市", "高雄市"],
    "breadspapa": ["台北市", "新北市", "台中市"],
    "fada": ["台中市"],
    "jiyuan": ["台中市", "高雄市"],
    "yentaizhu": ["台中市"],
    "ugtea": ["台北市", "新北市", "台中市"],
    "diymake": ["台北市", "新北市", "台中市", "高雄市"],
    "weidou": ["台北市", "台中市"],
    "pizzarock": ["台中市"],
    "2202": [], "jiuwei": [], "kimuradou": [],
}

REGION_NOTES = {
    "goodcho": "主要門市：台北信義／內湖、新北、台中、高雄，出發前請確認分店",
    "leburger": "限板橋店、新莊店、台北大安店、高雄三多店",
    "guotainuan": "限員林／台中崇德／大里／豐原／中壢／土城店",
    "yamazakicafe": "單店：新北市板橋區長江路二段 126 號",
    "ladym": "限台北旗艦店、遠百信義店、台中 LaLaport 店、台中誠品 480 店",
    "shuncheng": "忠一、南港 Lalaport、士林、信義、忠誠、雙連、永和門市不參加",
    "janfusun": "雲林縣古坑鄉",
    "leofoo": "新竹縣關西鎮",
    "jackbrothers": "門市分布以官網為準，資料來源為台中在地部落格",
    "waku": "台中在地品牌",
    "2202": "門市分布未確認", "jiuwei": "門市分布未確認", "kimuradou": "門市分布未確認",
    "jiyuan": "南部起家，近年北擴，分店以官網為準",
    "ugtea": "分店分布以官網為準",
    "breadspapa": "分店分布以官網為準",
    "diymake": "烘焙教室，各分店規則可能不同",
    "pizzarock": "分店分布以官網為準",
}

# ---------------------------------------------------------------- 期限
# rolling = 每年生日循環的常態優惠；fixed = 有明確起訖的檔期活動
VALIDITY = {
    # id: (type, validFrom, validUntil)
    "wowprime":  ("fixed", "2026-07-25", "2026-08-31"),
    "shuncheng": ("fixed", "2026-08-01", "2026-08-28"),
    "leofoo":    ("fixed", None, None),   # 逐月公告，無固定起訖
}
VALIDITY_DEFAULT = ("rolling", None, None)

# ---------------------------------------------------------------- 來源可信度
# 1 = 品牌官方公告／官方 APP　2 = 新聞媒體　3 = 部落格懶人包　4 = 社群貼文（Threads/IG/FB）
TIER_BY_DOMAIN = {
    "wowfms.com": 1,
    "mcdonalds.com.tw": 1, "mos.com.tw": 1, "starbucks.com.tw": 1,
    "watsons.com.tw": 1, "ikea.com.tw": 1, "sushiexpress.com.tw": 1,
    "leofoovillage.com.tw": 1, "janfusun.com.tw": 1,
    "businesstoday.com.tw": 2, "dailyview.tw": 2, "cool-style.com.tw": 2,
    "info.talk.tw": 3, "rachel.tw": 3, "gofunit.com": 3, "happybirthday.com.tw": 3,
    "threads.net": 4, "threads.com": 4, "instagram.com": 4, "facebook.com": 4,
}
TIER_LABEL = {1: "品牌官方", 2: "新聞媒體", 3: "部落格懶人包", 4: "社群貼文"}

# 已知的品牌官方來源（tier 1），會被排在最前面顯示
OFFICIAL = {
    "wowprime": ("https://wowfms.com/content/202607birthdaygift", "王品瘋美食 8月壽星專屬生日禮"),
}


def domain_of(url: str) -> str:
    from urllib.parse import urlparse
    host = urlparse(url).netloc.lower()
    return host[4:] if host.startswith("www.") else host


def tier_of(url: str) -> int:
    d = domain_of(url)
    for key, tier in TIER_BY_DOMAIN.items():
        if d == key or d.endswith("." + key):
            return tier
    return 3   # 未知來源保守給部落格級


def main():
    for o in data["offers"]:
        oid = o["id"]

        o["regions"] = REGIONS.get(oid, [])
        o["regionNote"] = REGION_NOTES.get(oid, "")

        vtype, vfrom, vuntil = VALIDITY.get(oid, VALIDITY_DEFAULT)
        o["validityType"] = vtype
        o["validFrom"] = vfrom
        o["validUntil"] = vuntil

        # 多來源：把原本的單一 source 併入 sources 陣列
        sources = []
        if oid in OFFICIAL:
            url, title = OFFICIAL[oid]
            sources.append({"url": url, "title": title, "tier": 1,
                            "tierLabel": TIER_LABEL[1], "checked": o["lastChecked"]})
        if o.get("source"):
            t = tier_of(o["source"])
            sources.append({"url": o["source"], "title": domain_of(o["source"]),
                            "tier": t, "tierLabel": TIER_LABEL[t],
                            "checked": o["lastChecked"]})
        # 去重 + 依可信度排序（tier 小的在前）
        seen, uniq = set(), []
        for s in sorted(sources, key=lambda x: x["tier"]):
            if s["url"] in seen:
                continue
            seen.add(s["url"])
            uniq.append(s)
        o["sources"] = uniq
        o["bestSource"] = uniq[0] if uniq else None

    data["meta"]["version"] = "2.0"
    data["schema"].update({
        "regions": "適用縣市清單；['全台'] 表示全國連鎖；[] 表示門市分布未確認",
        "regionNote": "地區補充說明（限定門市等）",
        "validityType": "rolling（每年生日常態優惠）/ fixed（限期檔期活動）",
        "validFrom": "檔期起日（ISO；rolling 為 null）",
        "validUntil": "檔期迄日（ISO；rolling 為 null）",
        "sources": "來源陣列，含 tier 可信度：1 品牌官方 / 2 新聞媒體 / 3 部落格懶人包 / 4 社群貼文",
        "bestSource": "sources 中 tier 最小者，網站優先顯示",
    })

    P.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    national = sum(1 for o in data["offers"] if o["regions"] == ["全台"])
    local = sum(1 for o in data["offers"] if o["regions"] and o["regions"] != ["全台"])
    unknown = sum(1 for o in data["offers"] if not o["regions"])
    print(f"完成。全台連鎖 {national}／區域限定 {local}／地區未確認 {unknown}")
    from collections import Counter
    print("最佳來源可信度分布：",
          Counter(o["bestSource"]["tierLabel"] for o in data["offers"] if o["bestSource"]))


if __name__ == "__main__":
    main()
