#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 offers.json 匯入 Supabase（首次建站用）。

前置：先在 Supabase SQL Editor 執行完 schema.sql。

環境變數（都在 Supabase Dashboard → Project Settings → Data API 找得到）：
    export SUPABASE_URL="https://xxxx.supabase.co"
    export SUPABASE_SERVICE_KEY="eyJ...（service_role key）"

⚠️ service_role key 可以繞過所有 RLS 規則，只能放在你自己的電腦，
   絕對不要寫進 config.js 或上傳到 GitHub。

用法：
    python seed.py --dry-run     # 只印出要送什麼，不真的寫入
    python seed.py               # 實際寫入（已存在的 slug 會更新）
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("請先安裝：pip install requests")

HERE = Path(__file__).parent
OFFERS = HERE / "offers.json"


def to_row(o: dict) -> dict:
    """offers.json 的 camelCase → 資料庫的 snake_case。"""
    return {
        "slug": o["id"],
        "brand": o["brand"],
        "category": o["category"],
        "regions": o.get("regions", []),
        "region_note": o.get("regionNote", "") or "",
        "offer": o["offer"],
        "membership": o.get("membership", "") or "",
        "membership_type": o.get("membershipType", "brand"),
        "membership_cost": o.get("membershipCost", "free"),
        "free_tier": o.get("freeTier", "discount"),
        "advance_days": o.get("advanceDays"),
        "advance_note": o.get("advanceNote", "") or "",
        "offer_window": o.get("timing", o.get("window", "當月")),
        "timing": o.get("timing", o.get("window", "當月")),
        "value_twd": o.get("valueTwd"),
        "conditions": o.get("conditions", "") or "",
        "validity": o.get("validity", "") or "",
        "validity_type": o.get("validityType", "rolling"),
        "valid_from": o.get("validFrom"),
        "valid_until": o.get("validUntil"),
        "sources": o.get("sources", []),
        # 種子資料視為已由人工整理過，直接上架
        "status": "approved",
        "verified": bool(o.get("verified")),
        "last_checked": o.get("lastChecked"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    data = json.loads(OFFERS.read_text(encoding="utf-8"))
    rows = [to_row(o) for o in data["offers"]]

    # 基本檢查，避免把壞資料灌進資料庫
    valid_free = {"free_no_min", "free_min", "discount", "unknown"}
    valid_mem = {"none", "app", "line", "ocard", "card", "tier", "brand"}
    problems = []
    for r in rows:
        if r["free_tier"] not in valid_free:
            problems.append(f"{r['brand']}: free_tier={r['free_tier']}")
        if r["membership_type"] not in valid_mem:
            problems.append(f"{r['brand']}: membership_type={r['membership_type']}")
        if r["advance_days"] is not None and not (0 <= r["advance_days"] <= 400):
            problems.append(f"{r['brand']}: advance_days={r['advance_days']}")
        if r["valid_from"] and r["valid_until"] and r["valid_until"] < r["valid_from"]:
            problems.append(f"{r['brand']}: 檔期起訖顛倒")
    if problems:
        print("資料檢查未通過：")
        for p in problems:
            print("  ·", p)
        sys.exit(1)
    print(f"資料檢查通過，共 {len(rows)} 筆")

    if args.dry_run:
        print(json.dumps(rows[0], ensure_ascii=False, indent=2))
        print(f"...（--dry-run，未寫入。其餘 {len(rows)-1} 筆略）")
        return

    url = (os.environ.get("SUPABASE_URL") or "").strip().strip('"').strip("'")
    key = (os.environ.get("SUPABASE_SERVICE_KEY") or "").strip().strip('"').strip("'")

    if not url or not key:
        sys.exit(
            "找不到環境變數 SUPABASE_URL / SUPABASE_SERVICE_KEY。\n\n"
            "⚠️ Windows 的命令提示字元不吃 export，要用 set：\n"
            '    set SUPABASE_URL=https://你的專案代號.supabase.co\n'
            '    set SUPABASE_SERVICE_KEY=eyJ...\n\n'
            "PowerShell 則是：\n"
            '    $env:SUPABASE_URL="https://你的專案代號.supabase.co"\n'
            '    $env:SUPABASE_SERVICE_KEY="eyJ..."\n\n'
            "設定完要在「同一個視窗」接著執行 python seed.py。"
        )

    # 常見的填錯：連 https:// 都沒貼、或貼到 dashboard 網址、
    # 或貼成 Data API 頁面顯示的「API URL」（含 /rest/v1/ 尾巴，我們自己會加這段）
    if not url.startswith("http"):
        url = "https://" + url
    if "supabase.com/dashboard" in url:
        sys.exit("SUPABASE_URL 貼成後台網址了。\n"
                 "要的是 Project Settings → Data API 裡的 Project URL，"
                 "格式是 https://xxxxx.supabase.co")
    m = re.match(r"^(https://[a-z0-9-]+\.supabase\.co)", url)
    if m and url != m.group(1):
        print(f"⚠️ 已自動把 {url} 修正為 {m.group(1)}"
              "（Data API 頁面顯示的 API URL 含 /rest/v1/，seed.py 會自己加這段，貼原始網址即可）")
        url = m.group(1)
    elif not url.endswith(".supabase.co"):
        print(f"⚠️ 注意：URL 看起來不太對（{url}），正常應該以 .supabase.co 結尾")

    endpoint = f"{url.rstrip('/')}/rest/v1/offers"
    print(f"目標：{endpoint}")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        # 依 slug 做 upsert，重複執行不會產生重複資料
        "Prefer": "resolution=merge-duplicates,return=representation",
    }

    ok = 0
    for i in range(0, len(rows), 20):          # 分批送，避免單次 payload 過大
        chunk = rows[i:i + 20]
        try:
            r = requests.post(f"{endpoint}?on_conflict=slug", headers=headers,
                              data=json.dumps(chunk, ensure_ascii=False).encode("utf-8"),
                              timeout=60)
        except requests.exceptions.ConnectionError as e:
            sys.exit(
                f"\n連不上 {endpoint}\n\n"
                "常見原因：\n"
                "  1. SUPABASE_URL 打錯或含多餘字元（正確格式 https://xxxxx.supabase.co）\n"
                "  2. Supabase 免費專案因閒置被暫停 —— 到 Dashboard 按 Restore project\n"
                "  3. 公司或學校網路擋住外連\n\n"
                f"原始錯誤：{type(e).__name__}"
            )
        if r.status_code >= 300:
            msg = r.text[:500]
            if "timing" in msg or "value_twd" in msg:
                msg += "\n\n👉 看起來資料庫還沒有 timing / value_twd 欄位，請先在 SQL Editor 執行 schema_v4.sql"
            elif r.status_code == 401:
                msg += "\n\n👉 401 代表金鑰不對。請確認用的是 service_role key，不是 anon key"
            print(f"第 {i//20 + 1} 批失敗 HTTP {r.status_code}: {msg}")
            sys.exit(1)
        ok += len(chunk)
        print(f"  已寫入 {ok}/{len(rows)}")

    print(f"\n完成，{ok} 筆已上架（status=approved）。")
    print("接著到 Supabase SQL Editor 把自己設成管理員：")
    print("  update public.profiles set is_admin = true")
    print("   where id = (select id from auth.users where email = '你的Gmail');")


if __name__ == "__main__":
    main()
