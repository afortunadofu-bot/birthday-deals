#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""fetch_stores.py 分區補抓的離線測試（不打 Google、不花錢）。

為什麼有這支：第一次試跑麥當勞，台北市、台中市都卡在 59 家、新北市只剩 29 家——
Text Search 一個查詢最多給 60 筆，雙北這種一個縣市七八十家的連鎖一定被截斷，
新北市的查詢結果還混了一堆台北市的店，過濾完就更少。修法是被截斷時切成四塊
各自再查。這裡用假的 Google 回應驗：
- 台北市 300 家（遠超過 60）要全部抓到、不重複
- 查詢結果裡混進來的新北市、別家品牌、永久歇業的店都要被濾掉
- 分店少於 60 家的縣市不能多打任何一次補抓（不能白花錢）

跑法：python jstest/test_fetch_stores_tiling.py
"""
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import fetch_stores as fs  # noqa: E402

random.seed(7)
BOX = fs.COUNTY_BOX['台北市']["low"], fs.COUNTY_BOX['台北市']["high"]


def place(i, lat, lng, name, county, status="OPERATIONAL"):
    return {"id": f"pid-{i}", "displayName": {"text": name}, "formattedAddress": f"{county}某區某路 {i} 號",
            "location": {"latitude": lat, "longitude": lng}, "businessStatus": status}


WORLD = []
for i in range(300):   # 台北市 300 家麥當勞
    WORLD.append(place(i, random.uniform(25.00, 25.17), random.uniform(121.47, 121.64), f"麥當勞-台北{i}店", "台北市"))
for i in range(300, 340):   # 邊界外面的新北市麥當勞，查台北時會混進來
    WORLD.append(place(i, random.uniform(24.97, 25.20), random.uniform(121.45, 121.67), f"麥當勞-新北{i}店", "新北市"))
for i in range(340, 360):   # 別家店
    WORLD.append(place(i, random.uniform(25.00, 25.17), random.uniform(121.47, 121.64), f"摩斯漢堡{i}", "台北市"))
for i in range(360, 365):   # 永久歇業
    WORLD.append(place(i, random.uniform(25.00, 25.17), random.uniform(121.47, 121.64), f"麥當勞-歇業{i}店",
                       "台北市", "CLOSED_PERMANENTLY"))
for i in range(365, 380):   # 嘉義市 15 家，不會被截斷
    WORLD.append(place(i, random.uniform(23.46, 23.50), random.uniform(120.43, 120.48), f"麥當勞-嘉義{i}店", "嘉義市"))
for i in range(380, 383):   # 雲林縣只有 3 家，但查詢結果被外縣市的店塞滿 60 筆
    WORLD.append(place(i, random.uniform(23.69, 23.72), random.uniform(120.52, 120.55), f"麥當勞-雲林{i}店", "雲林縣"))

for i in range(383, 385):   # 台東縣只有 2 家原燒……
    WORLD.append(place(i, random.uniform(22.75, 22.76), random.uniform(121.14, 121.15), f"原燒 台東{i}店", "台東縣"))
for i in range(385, 485):   # ……但附近有 100 家別家燒肉，Google 會拿來把 60 筆補滿
    WORLD.append(place(i, random.uniform(22.70, 22.80), random.uniform(121.10, 121.20), f"某某燒肉{i}", "台東縣"))

SPILLOVER = {
    '台北市': ['新北市'],
    # 最壞情況：小縣市的查詢被遠方大縣市的店塞滿。雲林縣沒有預設外框，要用「真的在
    # 雲林的那幾家」算補抓範圍；如果用全部 60 筆算，外框會一路包到台北，變成全台重查。
    '雲林縣': ['台北市', '新北市'],
}
CALLS = []


def fake_search(api_key, query, page_token=None, refresh=False, rect=None):
    """模擬 Places Text Search：只回傳外框內的點，每頁 20 筆，最多 3 頁（60 筆）。"""
    CALLS.append((query, page_token, rect))
    r = rect or fs.TAIWAN_RECT
    county = query.split()[-1]
    # Google Text Search 依「文字相關度」回結果，不會把全台灣所有麥當勞都丟回來——
    # 試跑時小縣市（嘉義縣 3 家、南投縣 1 家）都是一頁就結束。這裡模擬成只回
    # 「地址在這個縣市」的店，外加 SPILLOVER 設定的外縣市（查台北市時混進新北市的店，
    # 是試跑時真的看到的）。第一版假回應把全台灣的店都丟回來，小縣市也被當成截斷，
    # 測出來的「多打了幾十次」是假回應的問題，不是 fetch_stores 的問題。
    rel = [county] + SPILLOVER.get(county, [])
    inside = [p for p in WORLD
              if any(c in p["formattedAddress"] for c in rel)
              and r["low"]["latitude"] <= p["location"]["latitude"] <= r["high"]["latitude"]
              and r["low"]["longitude"] <= p["location"]["longitude"] <= r["high"]["longitude"]]
    inside.sort(key=lambda p: (county not in p["formattedAddress"], p["id"]))
    page = int(page_token or 0)
    chunk = inside[page * 20:(page + 1) * 20]
    has_more = len(inside) > (page + 1) * 20 and page < 2
    data = {"places": chunk}
    # 真實 API：第 3 頁之後就「不再」給 nextPageToken，就算 Google 手上還有更多。第一版假回應
    # 在第 3 頁照樣給 token，剛好配合 fetch_stores 第一版「看 token 判斷截斷」的錯誤假設，
    # 所以離線測試全綠、實際全部跑完卻一次都沒補抓（雙北、台中還是卡在 59 家）。
    if has_more:
        data["nextPageToken"] = str(page + 1)
    return data, True


fs.search = fake_search
results = []


def check(name, cond, extra=""):
    results.append(cond)
    print(f"  {'PASS' if cond else 'FAIL'}  {name}{'' if cond else '  ->  ' + str(extra)}")


print("=== fetch_stores 分區補抓（離線） ===")

CALLS.clear()
rows, calls, info = fs.fetch_county("k", "麥當勞", ["麥當勞"], "台北市", False, 3)
ids = [r["place_id"] for r in rows]
check("台北市 300 家全部抓到", len(set(ids)) == 300, len(set(ids)))
check("沒有重複", len(ids) == len(set(ids)))
check("沒混進新北市的店", all("台北市" in r["address"] for r in rows))
check("沒混進別家品牌", all("麥當勞" in r["name"] for r in rows))
check("永久歇業的不收", not any("歇業" in r["name"] for r in rows))
check("有觸發分區補抓", info["tiles"] > 0, info)
check("切到最後沒有還被截斷的格子", not info["still_capped"], info)
check("回報的計費次數等於實際呼叫次數", calls == len(CALLS), (calls, len(CALLS)))
print(f"  （台北 300 家用了 {len(CALLS)} 次呼叫、分 {info['tiles']} 區）")

CALLS.clear()
rows, calls, info = fs.fetch_county("k", "麥當勞", ["麥當勞"], "嘉義市", False, 3)
check("嘉義市 15 家全部抓到", len(rows) == 15, len(rows))
check("沒被截斷的縣市不分區補抓", info["tiles"] == 0, info)
check("沒被截斷的縣市只打 1 次（不滿一頁不翻頁）", len(CALLS) == 1, len(CALLS))

CALLS.clear()
rows, calls, info = fs.fetch_county("k", "麥當勞", ["麥當勞"], "新竹市", False, 3)
check("完全沒有分店的縣市回空、不補抓", rows == [] and info["tiles"] == 0 and len(CALLS) == 1, (len(rows), info, len(CALLS)))

CALLS.clear()
rows, calls, info = fs.fetch_county("k", "麥當勞", ["麥當勞"], "雲林縣", False, 3)
check("雲林縣 3 家全部抓到、沒混進外縣市", len(rows) == 3 and all("雲林縣" in r["address"] for r in rows),
      [r["address"] for r in rows])
check("被外縣市塞滿時，補抓範圍只包雲林那幾家（不會全台重查）", info["tiles"] <= 1 and len(CALLS) <= 4,
      (info, len(CALLS)))

CALLS.clear()
rows, calls, info = fs.fetch_county("k", "原燒", ["原燒"], "台東縣", False, 3)
check("小縣市被別家店補滿 60 筆：2 家原燒照樣抓到", len(rows) == 2, [r["name"] for r in rows])
check("小縣市被別家店補滿 60 筆：不算截斷、不分區補抓（實跑時白花了很多次 API）",
      info["tiles"] == 0 and not info["still_capped"] and len(CALLS) == 3, (info, len(CALLS)))

print("--- 店名比對規則（第一次全部跑完 79 筆 0 家分店，大多是比對太嚴）---")


def matches(brand, name):
    k, req = fs.derive_keys(brand)
    return fs.name_matches(name, k, req)


check("中英品牌：Google 店名只有中文那半也要對上", matches("粥大福 JOUDAFU", "粥大福-新店中正店"))
check("中英品牌：Google 店名只有英文那半也要對上", matches("唐吉訶德 DON DON DONKI", "DON DON DONKI 西門店"))
check("英文段去掉 Cafe 這種通用字", matches("貳樓 Second Floor Cafe", "Second Floor 貳樓新店裕隆城店"))
check("英文兩個字母的品牌（UG TEA → UG）", matches("UG TEA", "UG 台北西湖店"))
check("J.S. Foodies 的點跟空白不影響", matches("J.S. Foodies Tokyo", "J.S.FOODIES 台中港三井"))
check("括號裡的英文名也算（屋莎（Woosa））", matches("屋莎洋食鬆餅屋（Woosa）", "woosa洋食パンケーキ 台北松菸店"))
check("「限XX店」只收那一家", matches("紅茶老爹(限板橋裕民店)", "紅茶老爹-板橋裕民店"))
check("「限XX店」別家分店不收", not matches("紅茶老爹(限板橋裕民店)", "紅茶老爹-永和店"))
check("通用詞不單獨比（牛排館不會比到美福）", not matches("Mr. May 牛排館", "美福乾式熟成牛排館"))
check("通用詞不單獨比（私房菜不會比到別家私房菜）", not matches("十二月粥品·茶飲·私房菜", "阿婆私房菜"))
check("通用詞不單獨比（火鍋不會比到別家火鍋）", not matches("22:02 火鍋。樂活", "火鍋世家 板橋店"))
check("去掉「餐廳」字尾（天母盛鑫餐廳 → 天母盛鑫）", matches("天母盛鑫餐廳", "天母盛鑫-中山北店"))
check("去掉「牛排館」字尾（人从众厚切牛排館）", matches("人从众厚切牛排館", "人从众厚切牛排(台北永春店)"))
check("異體字 寿／壽", matches("平禄寿司", "平禄壽司-五權店"))
check("異體字 舖／舗", matches("TSUJIRI 辻利茶舖", "TSUJIRI 辻利茶舗 遠百信義店"))
check("彎引號／直引號", matches("beard papa‘s", "【beard papa's日本No.1泡芙品牌】板橋大遠百店"))
check("單純品牌行為不變（麥當勞）", matches("麥當勞", "麥當勞-基隆信一餐廳") and not matches("麥當勞", "摩斯漢堡 板橋店"))
check("短中文品牌仍然只接受開頭相符（大茗 ≠ 大茗堂中醫的反例）", not matches("大茗", "新大茗茶飲"))

print("--- 第二輪（只用快取重算）人工檢查抓出來的誤比對 ---")
check("子品牌：爭鮮PLUS 不收一般爭鮮迴轉壽司", not matches("爭鮮PLUS", "爭鮮迴轉壽司-西湖店"))
check("子品牌：爭鮮PLUS 自己的店要收", matches("爭鮮PLUS", "爭鮮PLUS 台北南西店"))
check("子品牌：貴族世家mini 不收一般貴族世家", not matches("貴族世家mini", "貴族世家-板橋板新店"))
check("子品牌：貴族世家mini 不收 Mini私房點心", not matches("貴族世家mini", "Mini私房點心"))
check("子品牌：巧福PLUS 不收巧福便當", not matches("巧福PLUS", "巧福便當（不外送）"))
check("中英黏在一起但順序顛倒也收（東客麵包DONQ）", matches("東客麵包DONQ", "DONQ東客麵包 新光三越南西店"))
check("& 跟空白不影響（默爾pasta&pizza）", matches("默爾pasta&pizza", "默爾 pasta pizza(松山車站店)"))
check("英文通用字只去尾巴：Tea top 不比到 toptiertea", not matches("Tea top", "特 ‧ 好喝 toptiertea 特好喝 通化店"))
check("英文通用字只去尾巴：Tea top 自己的店要收", matches("Tea top", "Tea top 台北松山店"))
check("字尾去掉後太短不用（孔金涮涮鍋 不比到孔金麻辣鍋）", not matches("孔金涮涮鍋", "孔金麻辣鴛鴦鍋吃到飽"))
check("英文段只剩通用字不用（CAFE!N 不比到隨便的 Cafe）", not matches("CAFE!N 硬咖啡", "Coffee Cafe 板橋店"))
check("英文段只剩通用字不用（CAFE!N 自己的店用中文收）", matches("CAFE!N 硬咖啡", "硬咖啡 南海門市"))
office = {"id": "x", "displayName": {"text": "香港商歌帝梵亞洲有限公司台灣分公司"},
          "formattedAddress": "台北市信義區", "location": {"latitude": 25.03, "longitude": 121.56}}
check("公司行號不算門市", fs.keep_place(office, ["歌帝梵"], "台北市") is None)

near = [
    {"place_id": "a", "name": "IKEA Charging Station", "lat": 25.0600, "lng": 121.5750},
    {"place_id": "b", "name": "IKEA 內湖店", "lat": 25.0602, "lng": 121.5751},
    {"place_id": "c", "name": "IKEA瑞典餐廳 內湖店", "lat": 25.0601, "lng": 121.5753},
    {"place_id": "d", "name": "IKEA 新店店", "lat": 24.9790, "lng": 121.5410},
]
kept = fs.dedupe_nearby(near)
check("60 公尺內的多個地點算同一家", len(kept) == 2, [k["name"] for k in kept])
check("同一家留名字最短的（正式店名）", {k["name"] for k in kept} == {"IKEA 內湖店", "IKEA 新店店"}, [k["name"] for k in kept])

print("--- 第三輪人工檢查抓出來的問題 ---")
twin = [
    {"place_id": "w1", "name": "屈臣氏", "lat": 25.1290, "lng": 121.6960},
    {"place_id": "w2", "name": "屈臣氏七堵店", "lat": 25.1291, "lng": 121.6961},
]
check("合併重複地點時優先留有分店名的（不是光禿禿的品牌名）",
      [k["name"] for k in fs.dedupe_nearby(twin)] == ["屈臣氏七堵店"], [k["name"] for k in fs.dedupe_nearby(twin)])
check("日文漢字異體（武蔵野森珈琲 = 武藏野森咖啡）", matches("武藏野森咖啡", "武蔵野森珈琲Diner 高雄台鋁店"))


def place_at(name, county):
    return {"id": name, "displayName": {"text": name}, "formattedAddress": f"{county}某路1號",
            "location": {"latitude": 25.0, "longitude": 121.5}}


poya = {"any": ["寶雅", "POYA"], "all": [], "none": ["診所"]}
check("別名 exclude：寶雅中醫診所不收", fs.keep_place(place_at("寶雅中醫診所", "台北市"), poya, "台北市") is None)
check("別名 exclude：寶雅自己的店照收", fs.keep_place(place_at("寶雅 南京三民店", "台北市"), poya, "台北市") is not None)
aliases = fs.load_aliases()
_, keys, _ = fs.plan_for({"brand": "寶雅 POYA", "regions": ["台北市"]}, aliases)
check("別名檔的 exclude 真的有帶進比對條件", "診所" in keys.get("none", []), keys)
_, keys, _ = fs.plan_for({"brand": "誠品 eslite", "regions": ["台北市"]}, aliases)
check("誠品畫廊不收", fs.keep_place(place_at("誠品畫廊", "台北市"), keys, "台北市") is None)

ok = all(results)
print(f"[fetch_stores 分區補抓] {sum(results)}/{len(results)} passed")
sys.exit(0 if ok else 1)
