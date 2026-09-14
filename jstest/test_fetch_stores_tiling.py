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
    capped_more = page == 2 and len(inside) > 60   # 第 3 頁之後還有 → Google 仍給 token
    data = {"places": chunk}
    if has_more or capped_more:
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

ok = all(results)
print(f"[fetch_stores 分區補抓] {sum(results)}/{len(results)} passed")
sys.exit(0 if ok else 1)
