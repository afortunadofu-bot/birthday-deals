#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把線上那套資料庫裡「公開讀得到」的東西抓下來，存進 data/live/。

    python fetch_live.py

抓四支，全部只用 ../config.js 裡那把 anon key——它本來就設計成公開的，
真正的防線是資料庫的 RLS：

    offers_public        全部已核可的優惠，另外附帶每筆的回報數、成功率、留言數
    wishlist_counts      每筆優惠被幾個人收藏
    most_wished          最多人想要的優惠
    leaderboard_monthly  當月省下金額排行（彙總）

這四支的 grant 都明確寫了 `to anon`（見 ../schema_v1*.sql），所以不需要管理員權限，
也碰不到任何個人層級的事件——那些（site_events、usage_reports 明細）是 admin 限定，
這支程式讀不到，也不該讀。

抓下來的原始回應留在本機（data/live/ 不進版控），進版控的只有彙總。
"""

import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONFIG = HERE.parent / "config.js"
OUT = HERE / "data" / "live"

ENDPOINTS = {
    "offers_public": "/rest/v1/offers_public?select=*&order=id",
    "wishlist_counts": "/rest/v1/wishlist_counts?select=*",
    "most_wished": "/rest/v1/most_wished?select=*",
    "leaderboard_monthly": "/rest/v1/leaderboard_monthly?select=*",
}


def load_config():
    txt = CONFIG.read_text(encoding="utf-8")
    url = re.search(r"url\s*:\s*['\"]([^'\"]+)", txt)
    key = re.search(r"anonKey\s*:\s*['\"]([^'\"]+)", txt)
    if not (url and key):
        sys.exit("讀不到 ../config.js 裡的 url / anonKey")
    return url.group(1).rstrip("/"), key.group(1)


def get(url, key, path):
    req = urllib.request.Request(url + path, headers={
        "apikey": key, "Authorization": "Bearer " + key, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    url, key = load_config()
    OUT.mkdir(parents=True, exist_ok=True)
    ok = 0
    for name, path in ENDPOINTS.items():
        try:
            data = get(url, key, path)
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "replace")[:160]
            if e.code == 402:
                sys.exit("Supabase 回 402：專案被停權（額度超過），現在抓不到任何資料。\n"
                         "       額度恢復或升級方案之後再跑一次這支。")
            print(f"  {name:20} HTTP {e.code} {msg}")
            continue
        except Exception as e:                      # noqa: BLE001 — 網路什麼都可能壞
            print(f"  {name:20} 失敗：{type(e).__name__} {e}")
            continue
        (OUT / f"{name}.json").write_text(
            json.dumps(data, ensure_ascii=False), encoding="utf-8")
        print(f"  {name:20} {len(data):,} 筆")
        ok += 1
    if not ok:
        sys.exit("一支都沒抓到。")
    print(f"存到 {OUT}（不進版控）。接著跑：python build_db.py --live")


if __name__ == "__main__":
    main()
