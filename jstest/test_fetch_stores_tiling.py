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

CALLS = []


def fake_search(api_key, query, page_token=None, refresh=False, rect=None):
    """模擬 Places Text Search：只回傳外框內的點，每頁 20 筆，最多 3 頁（60 筆）。"""
    CALLS.append((query, page_token, rect))
    r = rect or fs.TAIWAN_RECT
    county = query.split()[-1]
    inside = [p for p in WORLD
              if r["low"]["latitude"] <= p["location"]["latitude"] <= r["high"]["latitude"]
              and r["low"]["longitude"] <= p["location"]["longitude"] <= r["high"]["longitude"]]
    if rect is None:   # 沒給外框時，Google 大致依文字相關度排，縣市名稱對的排前面
        inside.sort(key=lambda p: (county not in p["formattedAddress"], p["id"]))
    else:
        inside.sort(key=lambda p: p["id"])
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

ok = all(results)
print(f"[fetch_stores 分區補抓] {sum(results)}/{len(results)} passed")
sys.exit(0 if ok else 1)
