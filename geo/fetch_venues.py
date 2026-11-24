#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""抓壽星日那 148 個人工圈的商圈，當作自動分群的對照組。

    python fetch_venues.py

用的是 `venues_public` 這支公開 view（grant 給 anon），裡面只有商圈本身的
名字、中心點、半徑跟幾筆優惠，沒有任何使用者資料。
"""

import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONFIG = HERE.parent / "config.js"
OUT = HERE / "data" / "venues.json"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    txt = CONFIG.read_text(encoding="utf-8")
    url = re.search(r"url\s*:\s*['\"]([^'\"]+)", txt).group(1).rstrip("/")
    key = re.search(r"anonKey\s*:\s*['\"]([^'\"]+)", txt).group(1)
    req = urllib.request.Request(
        f"{url}/rest/v1/venues_public?select=id,name,county,lat,lng,radius_m,offer_count"
        "&order=id&limit=1000",
        headers={"apikey": key, "Authorization": "Bearer " + key})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            rows = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.exit(f"抓不到：HTTP {e.code} {e.read().decode('utf-8', 'replace')[:160]}")
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(rows)} 個人工商圈 → data/{OUT.name}")


if __name__ == "__main__":
    main()
