#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
offers.json v2 → v3
新增：membershipType（會員種類）／membershipCost（入會成本）／freeTier（免費層級）
可重複執行。
"""
import json
import re
from collections import Counter
from pathlib import Path

P = Path(__file__).parent / "offers.json"
data = json.loads(P.read_text(encoding="utf-8"))

# ---------------------------------------------------------------- 會員種類
MEMBERSHIP_TYPES = {
    "none":  "免加入會員",
    "app":   "品牌 APP",
    "line":  "LINE 官方帳號",
    "ocard": "Ocard（跨品牌）",
    "card":  "實體／數位會員卡",
    "tier":  "需達會員等級",
    "brand": "品牌會員（管道未明）",
}

# 由 membership 文字自動判定，特例用 OVERRIDE 蓋掉
MEMBERSHIP_OVERRIDE = {
    "starbucks": "tier",     # 需綠星級以上
    "ikea":      "card",     # IKEA Family 宜家卡
    "ladym":     "none",     # 當月優惠持身分證即可
    "watsons":   "app",      # 寵i會員，券發到 APP 電子錢包
}


def guess_membership_type(o):
    if o["id"] in MEMBERSHIP_OVERRIDE:
        return MEMBERSHIP_OVERRIDE[o["id"]]
    m = o["membership"]
    if re.search(r"無需會員|不需會員|持身分證", m):  return "none"
    if re.search(r"Ocard", m, re.I):                 return "ocard"
    if re.search(r"LINE", m, re.I):                  return "line"
    if re.search(r"APP", m, re.I):                   return "app"
    if re.search(r"卡$|卡友|宜家卡", m):              return "card"
    if re.search(r"星級|等級", m):                    return "tier"
    return "brand"


# 入會成本：free = 免費註冊即可；spend = 需有消費紀錄；tier = 需達等級
MEMBERSHIP_COST = {
    "goodcho":    "spend",   # 需前 18 個月內有任一筆消費
    "xiaoshihou": "spend",   # 需生日前入會且有消費紀錄
    "starbucks":  "tier",    # 需綠星級
}

# ---------------------------------------------------------------- 免費層級
#   free_no_min  = 不用花錢就拿得到（免費入會可接受）
#   free_min     = 東西免費，但要先消費／達低消
#   discount     = 折扣、買一送一、折價券，不算免費
#   unknown      = 條件未確認
FREE_TIER = {
    # ---- 不用花錢就拿得到 ----
    "xianchadao": "free_no_min",   # 不限消費直接送琥珀紅茶
    "br31":       "free_no_min",   # 免費標準單球兌換券
    "goodcho":    "free_no_min",   # 憑券免費兌換貝果或司康
    "popeyes":    "free_no_min",   # 生日禮比司吉
    "leofoo":     "free_no_min",   # 指定月份壽星免費入園
    "diymake":    "free_no_min",   # 免費 4 吋生日蛋糕
    "wuchia":     "free_no_min",   # $30 折抵券，最低價飲品等於免費

    # ---- 東西免費，但要先消費 ----
    "sushiexpress": "free_min",   # 需消費（不限金額）
    "marugame":     "free_min",   # 買炸物才送麵
    "paul":         "free_min",   # 滿 $500 贈甜點
    "rouduoduo":    "free_min",   # 內用才送肉蛋糕
    "wuxianji":     "free_min",   # 來店內用即享
    "yamazakicafe": "free_min",   # 來店用餐贈司康
    "shuncheng":    "free_min",   # 滿 $399 贈
    "starbucks":    "free_min",   # 需點中杯以上飲料才贈蛋糕
    "chuchian":     "free_min",   # 需點乙份套餐
    "guotainuan":   "free_min",   # 需點一份套餐
    "shuguoyi":     "free_min",   # 四人以下需滿 $1,799
    "rollingthai":  "free_min",   # 單點滿 $2,000
    "bodeggi":      "free_min",   # 每人低消 $500、4 人以上
    "leburger":     "free_min",   # 每人低消 $350、4 人同行
    "tgifridays":   "free_min",   # 滿 $1,200
    "pizzarock":    "free_min",   # 消費 $100
    "xiaoshihou":   "free_min",   # 低消 $100
    "yentaizhu":    "free_min",   # 買任一飲品才送厚奶茶
    "chunxi":       "free_min",   # 用餐才贈蝦與蛋糕
    "yudoufu":      "free_min",
    "2202":         "free_min",
    "jiuwei":       "free_min",
    "abolang":      "free_min",
    "weidou":       "free_min",
    "sanshang":     "free_min",   # 買套餐送主餐
}
# 其餘一律視為折扣類（折數／買一送一／折價券）
FREE_TIER_DEFAULT = "discount"

FREE_TIER_LABEL = {
    "free_no_min": "免費・無低消",
    "free_min":    "免費・需消費",
    "discount":    "折扣／買一送一",
    "unknown":     "條件待確認",
}


def main():
    for o in data["offers"]:
        mt = guess_membership_type(o)
        o["membershipType"] = mt
        o["membershipTypeLabel"] = MEMBERSHIP_TYPES[mt]
        o["membershipCost"] = "free" if mt == "none" else MEMBERSHIP_COST.get(o["id"], "free")
        ft = FREE_TIER.get(o["id"], FREE_TIER_DEFAULT)
        o["freeTier"] = ft
        o["freeTierLabel"] = FREE_TIER_LABEL[ft]

    data["meta"]["version"] = "3.0"
    data["schema"].update({
        "membershipType": "none/app/line/ocard/card/tier/brand",
        "membershipTypeLabel": "會員種類中文標籤",
        "membershipCost": "free 免費入會 / spend 需有消費紀錄 / tier 需達等級",
        "freeTier": "free_no_min 免費無低消 / free_min 免費需消費 / discount 折扣類 / unknown 待確認",
        "freeTierLabel": "免費層級中文標籤",
    })
    P.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    print("會員種類：", dict(Counter(o["membershipTypeLabel"] for o in data["offers"])))
    print("入會成本：", dict(Counter(o["membershipCost"] for o in data["offers"])))
    print("免費層級：", dict(Counter(o["freeTierLabel"] for o in data["offers"])))
    print("\n【免費・無低消】")
    for o in data["offers"]:
        if o["freeTier"] == "free_no_min":
            print(f"  · {o['brand']}（{o['membershipTypeLabel']}）— {o['offer'][:40]}")


if __name__ == "__main__":
    main()
