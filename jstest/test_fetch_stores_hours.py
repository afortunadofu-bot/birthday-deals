#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""fetch_stores.py --hours 的離線測試（不打 Google、不花錢）。
跑法：python jstest/test_fetch_stores_hours.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import fetch_stores as fs  # noqa: E402

fails = 0


def check(label, got, want):
    global fails
    ok = got == want
    fails += not ok
    print(("  PASS  " if ok else "  FAIL  ") + label + ("" if ok else f"\n        got  {got!r}\n        want {want!r}"))


def per(od, oh, cd, ch, om=0, cm=0):
    return {"open": {"day": od, "hour": oh, "minute": om}, "close": {"day": cd, "hour": ch, "minute": cm}}


print("=== fetch_stores --hours ===")
check("週一 10:00–21:00", fs.week_ranges({"periods": [per(1, 10, 1, 21)]}), [(2040, 2700)])
check("跨午夜 週五 22:00–週六 02:00 算一段", fs.week_ranges({"periods": [per(5, 22, 6, 2)]}), [(8520, 8760)])
check("週六 22:00–週日 02:00 拆兩段", fs.week_ranges({"periods": [per(6, 22, 0, 2)]}), [(0, 120), (9960, 10080)])
check("24 小時（只有 open 沒有 close）", fs.week_ranges({"periods": [{"open": {"day": 0, "hour": 0, "minute": 0}}]}), [(0, 10080)])
check("每天 00:00–24:00 接起來＝整週", fs.week_ranges({"periods": [per(d, 0, (d + 1) % 7, 0) for d in range(7)]}), [(0, 10080)])
check("午休拆兩段", fs.week_ranges({"periods": [per(2, 11, 2, 14, 30, 0), per(2, 17, 2, 21)]}), [(3570, 3720), (3900, 4140)])
check("沒寫營業時間＝None（不是整週沒開）", fs.week_ranges({}), None)

fs.HOURS = True
r = {"offer_id": 7, "place_id": "p", "name": "王's", "address": "台北市", "county": "台北市", "lat": 25.0, "lng": 121.5,
     "business_status": "OPERATIONAL", "open_week": [(2040, 2700)], "hours_text": ["星期一: 10:00 – 21:00"]}
check("SQL：區間陣列、原文、單引號跳脫", fs.row_sql(r),
      "(7,'p'::text,'王''s'::text,'台北市'::text,'台北市'::text,25.0::float8,121.5::float8,'OPERATIONAL'::text,"
      "'{\"[2040,2700)\"}'::int4range[],array['星期一: 10:00 – 21:00']::text[])")
check("SQL：沒營業時間寫 null", fs.row_sql({**r, "open_week": None, "hours_text": None}).endswith(",null::int4range[],null::text[])"), True)
fs.HOURS = False
check("沒加 --hours：跟以前一樣", fs.row_sql(r).endswith("'OPERATIONAL'::text)"), True)

p = {"id": "x", "displayName": {"text": "麥當勞 台北店"}, "formattedAddress": "台北市中正區",
     "location": {"latitude": 25, "longitude": 121.5}, "businessStatus": "OPERATIONAL",
     "regularOpeningHours": {"periods": [per(1, 10, 1, 21)], "weekdayDescriptions": ["星期一: 10:00 – 21:00"]}}
fs.HOURS = True
k = fs.keep_place(p, {"any": ["麥當勞"], "all": [], "none": []}, "台北市")
check("keep_place 帶出營業時間", (k["open_week"], k["hours_text"]), ([(2040, 2700)], ["星期一: 10:00 – 21:00"]))
fs.HOURS = False
check("沒加 --hours 不帶", "open_week" in fs.keep_place(p, {"any": ["麥當勞"], "all": [], "none": []}, "台北市"), False)

# --missing --dry-run 用 is_cached 估「真的要打的」：要跟 search() 寫進去的快取檔同一個
import json as _json  # noqa: E402
import tempfile  # noqa: E402
fs.CACHE = Path(tempfile.mkdtemp())
check("沒查過：不在快取", fs.is_cached("測試品牌 台北市"), False)
fs.CACHE.mkdir(exist_ok=True)
fs._request("測試品牌 台北市")[1].write_text(_json.dumps({"places": []}), encoding="utf-8")
check("search() 走快取的那個檔＝is_cached 看的那個檔",
      (fs.is_cached("測試品牌 台北市"), fs.search("", "測試品牌 台北市")), (True, ({"places": []}, False)))
check("全台一次查（外框＝全台）跟逐縣市查（外框沒給）是同一個快取 key",
      fs._request("測試品牌", None, fs.TAIWAN_RECT)[1] == fs._request("測試品牌")[1], True)

print(f"[fetch_stores --hours] {'全部通過' if not fails else f'{fails} 個失敗'}")
sys.exit(1 if fails else 0)
