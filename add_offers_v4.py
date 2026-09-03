#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
offers.json v3 → v4
1. 新增使用者提供的脆貼文 / 7月壽星優惠圖卡整理出的品牌
2. 所有優惠加上 timing（當日 / 當月 / 當週 / 前後N天）與 valueTwd（優惠價值，用於省錢統計）
3. 修正既有資料的會員種類（Ocard）與當日/當月標記

可重複執行。
"""
import json
from collections import Counter
from pathlib import Path

P = Path(__file__).parent / "offers.json"
data = json.loads(P.read_text(encoding="utf-8"))
by_id = {o["id"]: o for o in data["offers"]}

TODAY = "2026-08-04"

# 來源：使用者提供的社群內容，可信度 tier 4
SRC_THREADS = {
    "url": "https://www.threads.com/",
    "title": "網友實際使用心得（脆貼文）",
    "tier": 4, "tierLabel": "社群貼文", "checked": TODAY,
}
SRC_CARD = {
    "url": "https://www.threads.com/",
    "title": "7月壽星優惠整理圖卡（社群流傳）",
    "tier": 4, "tierLabel": "社群貼文", "checked": TODAY,
}

# ---------------------------------------------------------------------------
# 新增品牌
# 欄位順序：id, 品牌, 類別, 優惠, 會員種類, 免費層級, timing, 條件, 價值(元), 地區, 來源
# 價值 None = 未知（不計入省錢統計，但仍可手動填）
# ---------------------------------------------------------------------------
NEW = [
    # ---- 脆貼文：無低消（實際使用過，可信度較高） ----
    ("gonnaeat", "gonna EAT", "飲料", "gonnaEAT 與 gonnaPLUS 可各兌換咖啡一杯（美式／拿鐵）",
     "ocard", "free_no_min", "當月", "直接送，無低消", 60, ["全台"], SRC_THREADS),
    ("habibi", "HABIBI Pâtisserie", "甜點烘焙", "馬卡龍一入",
     "ocard", "free_no_min", "當月", "無低消", 90, ["台北市"], SRC_THREADS),
    ("zhongtaile", "忠泰樂 Lè Cafe", "甜點烘焙", "免費下午茶一份",
     "brand", "free_no_min", "當月", "無低消", None, ["台北市"], SRC_THREADS),
    ("oakbarrel", "橡木桶洋酒", "零售美妝", "小紅酒一瓶",
     "brand", "free_no_min", "當月", "無低消，需年滿 18 歲", None, ["全台"], SRC_THREADS),
    ("tiancheng", "天成飯店集團", "甜點烘焙", "單片蛋糕一份",
     "brand", "free_no_min", "當月", "無低消", 150, ["台北市"], SRC_THREADS),
    ("hongruizhen", "洪瑞珍", "甜點烘焙", "三明治一份（入會禮可一併兌換）",
     "ocard", "free_no_min", "當月", "無低消", 45, ["全台"], SRC_THREADS),
    ("semeur", "聖娜 Semeur", "飲料", "大杯冰美式咖啡一杯；另有壽星滿百折 50",
     "ocard", "free_no_min", "當月", "咖啡券無低消；折抵券需滿 $100", 60, ["全台"], SRC_THREADS),

    # ---- 脆貼文：消費贈 ----
    ("yetang", "椰糖", "飲料", "泰奶冰酥乙份（入會禮可一併兌換）",
     "ocard", "free_min", "當月", "低消 $150／人", 120, ["台北市"], SRC_THREADS),
    ("zhoudafu", "粥大福 CONGEE BOSS", "連鎖餐廳", "粥品買一送一",
     "ocard", "discount", "當月", "需購買同等或較高價粥品", None, ["全台"], SRC_THREADS),
    ("ichigen", "一幻拉麵 ICHIGEN", "連鎖餐廳", "蝦湯拉麵買一送一",
     "ocard", "discount", "當月", "橘焱集團會員；需點兩碗", 280, ["全台"], SRC_THREADS),
    ("zhewei", "這味泰泰", "連鎖餐廳", "指定餐點買一送一",
     "ocard", "discount", "當月", "需點兩份", None, ["全台"], SRC_THREADS),
    ("bengeyakiniku", "本格燒肉", "火鍋燒肉", "用餐 88 折",
     "ocard", "discount", "當月", "服務費另計", None, ["全台"], SRC_THREADS),

    # ---- 脆貼文：甜點篇（含實際金額） ----
    ("glofroyo", "GLÖ FROYO", "甜點烘焙", "優格冰乙份",
     "ocard", "free_min", "當月", "需完成 2 次消費才可兌換", 31, ["台北市"], SRC_THREADS),
    ("movenpick", "莫凡彼 Mövenpick", "甜點烘焙", "飲品半價 + 生日餐盤",
     "brand", "discount", "當月", "需內用", 84, ["全台"], SRC_THREADS),
    ("gelatopique", "Gelato Pique Cafe", "甜點烘焙", "整單 7 折",
     "brand", "discount", "當月", "需內用", None, ["台北市"], SRC_THREADS),
    ("yuzhenxin", "裕珍馨", "甜點烘焙", "生日禮 $100 抵用金",
     "ocard", "discount", "當月", "可折抵奶油酥餅等商品", 100, ["全台"], SRC_THREADS),
    ("yingcoffee", "硬咖啡", "飲料", "香草霜淇淋購買折 $50",
     "ocard", "discount", "當月", "需購買 2 支", 50, ["台北市"], SRC_THREADS),
    ("dameen", "大茗", "飲料", "買一杯送一杯",
     "ocard", "free_min", "當月", "需先消費 1 杯", 40, ["全台"], SRC_THREADS),
    ("yuqianshangcha", "御前上茶", "飲料", "買飲品送抹茶生乳捲",
     "ocard", "free_min", "當月", "需購買任一飲品", 65, ["全台"], SRC_THREADS),
    ("globalmall", "Global Mall 環球購物中心", "零售美妝", "$100 抵用金",
     "brand", "discount", "當月", "依櫃位規定使用", 100, ["台北市", "新北市", "桃園市", "屏東縣"], SRC_THREADS),

    # ---- 脆貼文：當日壽星 ----
    ("tianmushengxin", "天母盛鑫餐廳", "連鎖餐廳", "當日壽星 5 折，同行 9 折（附沙拉吧）",
     "none", "discount", "當日", "折後客單價約 $395 起；建議提前訂位", 395, ["台北市"], SRC_THREADS),
    ("mrmay", "Mr. May 牛排館", "連鎖餐廳", "當日壽星 5 折",
     "none", "discount", "當日", "折後客單價約 $249 起；建議提前訂位", 249, ["台北市"], SRC_THREADS),

    # ---- 圖卡：主餐／聚餐 ----
    ("jgfriedchicken", "繼光香香雞 J&G", "速食", "全品項 8 折",
     "ocard", "discount", "當月", "—", None, ["全台"], SRC_CARD),
    ("tptea", "茶湯會 TP TEA", "飲料", "單杯 85 折／單杯折 $10／免費加料 1 份",
     "ocard", "discount", "當月", "三選一", 20, ["全台"], SRC_CARD),
    ("bolopan", "Bolo Pan 菠蘿包專門店", "甜點烘焙", "冰火菠蘿油 1 個",
     "ocard", "free_min", "當月", "低消 $50", 65, ["台北市"], SRC_CARD),
    ("bokee", "波記 BO KEE", "甜點烘焙", "楊枝甘露 1 份",
     "ocard", "free_no_min", "當月", "—", 100, ["台北市"], SRC_CARD),
    ("dondonki", "唐吉訶德 DON DON DONKI", "零售美妝", "單筆消費滿 $500 折 $100",
     "brand", "discount", "當月", "滿 $500", 100, ["台北市", "新北市", "台中市", "高雄市"], SRC_CARD),
    ("eightpercentice", "8% ice", "甜點烘焙", "內用符合低消可兌換 $180 蛋糕",
     "ocard", "free_min", "當月", "需達內用低消", 180, ["全台"], SRC_CARD),
    ("hilaifoods", "漢來美食", "連鎖餐廳", "當日壽星平日 8 折、假日 85 折",
     "brand", "discount", "當日", "需出示證件；服務費另計", None, ["全台"], SRC_CARD),
    ("jitangdashu", "雞湯大叔", "連鎖餐廳", "全單 9 折",
     "ocard", "discount", "當月", "—", None, ["全台"], SRC_CARD),
    ("laozipot", "老子鍋", "火鍋燒肉", "指定套餐 88 折",
     "ocard", "discount", "當月", "—", None, ["全台"], SRC_CARD),
    ("menniu12", "門牛十二鍋", "火鍋燒肉", "當日壽星半價",
     "none", "discount", "當日", "需出示證件；建議提前訂位", None, ["全台"], SRC_CARD),
    ("yoshinoya", "吉野家", "速食", "單筆消費 9 折",
     "ocard", "discount", "當月", "—", None, ["全台"], SRC_CARD),
    ("xiduo", "喜多酸菜魚", "連鎖餐廳", "95 折；入會另送黑糖豆花 1 碗",
     "ocard", "discount", "當月", "—", None, ["全台"], SRC_CARD),
    ("timhowan", "添好運 Tim Ho Wan", "連鎖餐廳", "$100 抵用金 + 甜心紅豆包",
     "ocard", "discount", "當月", "—", 100, ["全台"], SRC_CARD),
    ("nagata", "長田本庄軒", "連鎖餐廳", "豚骨叉燒炒麵買一送一",
     "ocard", "discount", "當月", "需點兩份", None, ["全台"], SRC_CARD),
    ("yakinikulike", "燒肉 LIKE", "火鍋燒肉", "100g 肉盤免費送（牛五花／豬五花／雞腿肉擇一）",
     "ocard", "free_min", "當月", "需點餐", 120, ["全台"], SRC_CARD),
    ("wankeshabu", "萬客什鍋", "火鍋燒肉", "套餐肉品六選一（極上板腱牛／雪紋梅花豬／特選五花羊等）",
     "ocard", "free_min", "當月", "需點套餐", 150, ["全台"], SRC_CARD),
    ("dubuhouse", "涓豆腐 DUBU HOUSE", "連鎖餐廳", "原味韓式炸雞免費送",
     "ocard", "free_min", "當月", "需點餐", 200, ["全台"], SRC_CARD),
    ("taigaya", "大河屋", "連鎖餐廳", "點套餐送唐揚雞",
     "ocard", "free_min", "當月", "需點套餐", 120, ["全台"], SRC_CARD),
    ("morimori", "森森燒肉", "火鍋燒肉", "永森花肉免費送",
     "ocard", "free_min", "當月", "需點餐", 150, ["全台"], SRC_CARD),
    ("chientu", "錢都日式涮涮鍋", "火鍋燒肉", "肉品三選一（牛／豬／雞擇一）免費送",
     "ocard", "free_min", "當月", "需點餐", 100, ["全台"], SRC_CARD),
    ("cafein", "Cafe!N", "飲料", "$50 折價券",
     "ocard", "discount", "當月", "—", 50, ["全台"], SRC_CARD),

    # ---- 圖卡：甜點 ----
    ("secondfloor", "貳樓 Second Floor Cafe", "甜點烘焙", "蛋糕 1 份",
     "ocard", "free_min", "當月", "需內用消費", 180, ["全台"], SRC_CARD),
    ("choice", "喬義思 Choice", "甜點烘焙", "生日蛋糕 1 個",
     "ocard", "free_min", "當月", "需內用消費", 300, ["台北市"], SRC_CARD),
    ("beardpapa", "beard papa's", "甜點烘焙", "泡芙買 2 送 1",
     "ocard", "discount", "當月", "需購買 2 顆", 60, ["全台"], SRC_CARD),
    ("sunmerry", "SUNMERRY 聖瑪莉", "甜點烘焙", "指定商品買 1 送 1；生日蛋糕 85 折",
     "ocard", "discount", "當月", "—", None, ["全台"], SRC_CARD),
    ("shanguowu", "善菓屋 ARTISAN BAKERY", "甜點烘焙", "焦糖達克瓦茲 1 個",
     "ocard", "free_no_min", "當月", "—", 80, ["全台"], SRC_CARD),
    ("jiuyang", "玖仰 JIUYANG", "甜點烘焙", "焦糖布丁 1 個",
     "ocard", "free_no_min", "當月", "—", 90, ["台北市"], SRC_CARD),
    ("kanpaiclassic", "老乾杯 KANPAI CLASSIC", "火鍋燒肉", "特製甜點 1 份",
     "ocard", "free_min", "當月", "需內用消費", 200, ["全台"], SRC_CARD),
    ("tsujiri", "TSUJIRI 辻利茶舖", "甜點烘焙", "買 $160 切片蛋糕送 $160 飲品",
     "ocard", "discount", "當月", "需購買指定蛋糕", 160, ["全台"], SRC_CARD),
    ("legaleagle", "金色三麥", "連鎖餐廳", "當日壽星送 6 吋蛋糕；當月壽星送切片蛋糕",
     "ocard", "free_min", "當日", "需提前預約；需內用消費", 500, ["全台"], SRC_CARD),
    ("fetnet", "遠傳 FET 心生活", "零售美妝", "$100 購物金",
     "app", "discount", "當月", "遠傳心生活 APP 會員", 100, ["全台"], SRC_CARD),
    ("danjingu", "蛋金固烘焙坊", "甜點烘焙", "古早味現烤蛋糕整條",
     "ocard", "free_no_min", "當月", "—", 200, ["全台"], SRC_CARD),
    ("jsfoodies", "J.S. Foodies Tokyo", "甜點烘焙", "鬆餅乙份",
     "ocard", "free_min", "當日", "需內用消費", 280, ["台北市"], SRC_CARD),
]

# ---------------------------------------------------------------------------
# 既有資料的修正
# ---------------------------------------------------------------------------
# 明確為 Ocard 會員體系的品牌（脆貼文與圖卡佐證）
OCARD_FIX = ["abolang", "diymake", "br31", "arennougat", "xianchadao", "popeyes",
             "dashixiong", "sushiexpress", "dicos", "marugame", "jenjudan",
             "sleep5", "tenren", "yoshinoya"]

# timing 修正：資料庫原本的 window 欄位有些混用
TIMING_FIX = {
    "janfusun": "當日", "abolang": "當日", "jiuwei": "當日", "pizzarock": "當日",
    "matador": "當日", "diymake": "當日", "2202": "當日", "yangguo": "當日",
    "kimuradou": "當日", "yudoufu": "當日", "chunxi": "當日", "weidou": "當日",
    "jackbrothers": "前後3天", "waku": "前後3天", "shuguoyi": "當週",
    "juhotpot": "當月＋當日", "ladym": "當月＋當日", "xiaoshihou": "當月＋當日",
    "wowprime": "當月＋當日",
}

# 既有品牌的優惠價值（元），用於累積省錢統計
VALUE_FIX = {
    "mcdonalds": 60, "mos": 40, "pk-card": 100, "sanshang": 165, "dicos": 187,
    "popeyes": 45, "leburger": 300, "marugame": 74, "sushiexpress": 60, "br31": 95,
    "wowprime": 300, "chuchian": 180, "rouduoduo": 150, "rollingthai": 400,
    "bodeggi": 350, "guotainuan": 200, "shuguoyi": 250, "wuxianji": 150,
    "kyotokatsugyu": 200, "xiaoshihou": 300, "matador": 400, "juhotpot": 150,
    "kimuradou": 500, "jackbrothers": 300, "waku": 200, "yudoufu": 300,
    "chunxi": 600, "yangguo": 250, "tgifridays": 400, "dashixiong": 298,
    "fada": 279, "ikea": 150, "xianchadao": 45, "ugtea": 65, "tenren": 65,
    "chatime-cha": 60, "jenjudan": 65, "jiyuan": 60, "wuchia": 30, "yentaizhu": 60,
    "sleep5": 65, "starbucks": 120, "ladym": 100, "goodcho": 65, "paul": 150,
    "breadspapa": 60, "shuncheng": 200, "diymake": 350, "arennougat": 150,
    "yamazakicafe": 70, "watsons": 300, "janfusun": 899, "leofoo": 999,
    "pizzarock": 300, "abolang": 150, "2202": 300, "jiuwei": 250, "weidou": 180,
}


def norm_timing(o):
    """把舊的 window 欄位正規化成 timing。"""
    return TIMING_FIX.get(o["id"], o.get("window", "當月"))


def main():
    added, updated = 0, 0

    # ---- 1. 新增 ----
    for (oid, brand, cat, offer, mem, free, timing, cond, value, regions, src) in NEW:
        if oid in by_id:
            continue
        mem_label = {"none": "免加入會員", "app": "品牌 APP", "line": "LINE 官方帳號",
                     "ocard": "Ocard（跨品牌）", "card": "實體／數位會員卡",
                     "tier": "需達會員等級", "brand": "品牌會員（管道未明）"}[mem]
        free_label = {"free_no_min": "免費・無低消", "free_min": "免費・需消費",
                      "discount": "折扣／買一送一", "unknown": "條件待確認"}[free]
        row = {
            "id": oid, "brand": brand, "category": cat,
            "offer": offer,
            "membership": "Ocard APP 會員" if mem == "ocard" else mem_label,
            "membershipType": mem, "membershipTypeLabel": mem_label,
            "membershipCost": "free",
            "freeTier": free, "freeTierLabel": free_label,
            "advanceDays": 0 if mem == "ocard" else None,
            "advanceNote": ("Ocard 多數品牌當月加入即可領券，但部分品牌需隔天才能使用，"
                            "建議提前幾天加入" if mem == "ocard" else "建議提前一個月準備"),
            "window": timing, "timing": timing,
            "conditions": cond,
            "validity": "生日當日" if timing == "當日" else "生日當月",
            "validityType": "rolling", "validFrom": None, "validUntil": None,
            "regions": regions, "regionNote": "",
            "valueTwd": value,
            "sources": [src], "bestSource": src,
            "verified": False, "lastChecked": TODAY,
        }
        data["offers"].append(row)
        by_id[oid] = row
        added += 1

    # ---- 2. 修正既有 ----
    for o in data["offers"]:
        oid = o["id"]
        changed = False

        if "timing" not in o:
            o["timing"] = norm_timing(o); o["window"] = o["timing"]; changed = True

        if "valueTwd" not in o:
            o["valueTwd"] = VALUE_FIX.get(oid); changed = True

        if oid in OCARD_FIX and o["membershipType"] != "ocard":
            o["membershipType"] = "ocard"
            o["membershipTypeLabel"] = "Ocard（跨品牌）"
            o["membership"] = "Ocard APP 會員"
            if o["advanceDays"] is None:
                o["advanceDays"] = 0
                o["advanceNote"] = "Ocard 當月加入多半即可領券，部分品牌需隔天才能使用"
            changed = True

        if changed:
            updated += 1

    data["meta"]["version"] = "4.0"
    data["meta"]["lastBuild"] = TODAY
    data["schema"].update({
        "timing": "當日 / 當月 / 當週 / 當月＋當日 / 前後N天　—　最重要的欄位之一",
        "valueTwd": "優惠價值（新台幣），用於累積省錢統計；null 表示未估算",
    })

    P.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    offers = data["offers"]
    print(f"新增 {added} 筆，更新 {updated} 筆，總計 {len(offers)} 筆\n")
    print("適用期間：", dict(Counter(o["timing"] for o in offers)))
    print("免費層級：", dict(Counter(o["freeTierLabel"] for o in offers)))
    print("會員種類：", dict(Counter(o["membershipTypeLabel"] for o in offers)))
    vals = [o["valueTwd"] for o in offers if o.get("valueTwd")]
    print(f"\n有估算價值：{len(vals)}/{len(offers)} 筆，全部用完約可省 ${sum(vals):,}")
    nomin = [o for o in offers if o["freeTier"] == "free_no_min"]
    print(f"免費・無低消：{len(nomin)} 筆，合計約 ${sum(o['valueTwd'] or 0 for o in nomin):,}")


if __name__ == "__main__":
    main()
