#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 offers.json 注入 template.html，產生可直接雙擊開啟的 index.html。"""

import json
from datetime import date
from pathlib import Path

HERE = Path(__file__).parent
data = json.loads((HERE / "offers.json").read_text(encoding="utf-8"))
data["meta"]["lastBuild"] = data["meta"].get("lastBuild") or date.today().isoformat()

payload = {
    "meta": data["meta"],
    "offers": [
        {
            "brand": o["brand"], "category": o["category"], "offer": o["offer"],
            "membership": o["membership"], "advanceDays": o["advanceDays"],
            "advanceNote": o["advanceNote"], "window": o["window"],
            "conditions": o["conditions"], "validity": o["validity"],
            "verified": o["verified"], "lastChecked": o["lastChecked"],
            # v2
            "regions": o.get("regions", []), "regionNote": o.get("regionNote", ""),
            "validityType": o.get("validityType", "rolling"),
            "validFrom": o.get("validFrom"), "validUntil": o.get("validUntil"),
            # bestSource 不再另外存一份——它在這 138 筆資料裡永遠等於
            # sources[0]（第一筆來源本來就是依可信度排過序的），跟前端
            # loadOffers() 讀 Supabase 資料時的算法完全一樣，front-end
            # 直接算就好，不用把同一份物件在種子資料裡重複存兩次。這是
            # LCP 優化的一部分：省下的這一份重複資料要等整包種子資料
            # 下載完才看得到第一屏卡片，越輕越快看到內容。
            "sources": o.get("sources", []),
            # v3
            "membershipType": o.get("membershipType", "brand"),
            "membershipCost": o.get("membershipCost", "free"),
            "freeTier": o.get("freeTier", "discount"),
            # v4
            "timing": o.get("timing", o.get("window", "當月")),
            "valueTwd": o.get("valueTwd"),
            # v12：集團歸屬（王品集團等），各品牌已拆成獨立卡片，這裡只留歸屬標記
            "groupName": o.get("groupName", ""),
            # v45：可轉讓（票券本身能不能給別人用，不用出示本人證件），預設未確認
            "transferable": o.get("transferable", "unknown"),
        }
        for o in data["offers"]
    ],
}

html = (HERE / "template.html").read_text(encoding="utf-8")
html = html.replace("/*__OFFERS_DATA__*/",
                    json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
(HERE / "index.html").write_text(html, encoding="utf-8")

print(f"index.html 已產生，共 {len(payload['offers'])} 筆優惠。")
