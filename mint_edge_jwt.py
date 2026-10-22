#!/usr/bin/env python3
"""產生 Worker 用的 edge_reader 金鑰（v131）。

Worker 是伺服器端的，它那把金鑰不會出現在任何人的瀏覽器裡，所以可以用一個
「前端沒有的」角色。這支程式就是把那把金鑰簽出來。

用法：
    python mint_edge_jwt.py

它會跟你要 Supabase 的 JWT Secret：
    Dashboard → Settings → API → JWT Settings → JWT Secret

⚠️ 那把 JWT Secret 是整個專案的簽章祕密。
   · 不要貼進任何網站（包括 jwt.io 那種線上工具）
   · 不要進 git、不要存成檔案
   這支程式用 getpass 讀它，不會顯示在畫面上、不會寫到任何地方，
   印出來的只有簽好的 token。

印出來的 token 貼到：
    Cloudflare → Workers → birthdaydeals-api → Settings → Variables
    → 新增一個變數 SUPABASE_EDGE_KEY（**型態選 Secret，不要選純文字**）

⚠️ 是「新增 SUPABASE_EDGE_KEY」，**不是去改 SUPABASE_ANON_KEY**。
   apikey 那個標頭要一直是專案原本的公開金鑰，閘道才認得；
   決定「用哪個角色查」的是 authorization 標頭，Worker 會拿 SUPABASE_EDGE_KEY
   去填它。沒設這個變數的話，Worker 行為跟以前一模一樣，不會壞。
"""

import base64
import getpass
import hashlib
import hmac
import json
import sys
import time
import urllib.error
import urllib.request

ROLE = "edge_reader"
ISS = "supabase"
REF = "lgshwappyjgnzfkwncjk"   # 專案代號，跟現有的 anon key 同一個
YEARS = 10

BASE = "https://lgshwappyjgnzfkwncjk.supabase.co"
# 公開的 anon key（跟 config.js、worker 的 DEFAULTS 同一把）。
# 它只是給 Supabase 閘道看的 apikey，不是祕密。
ANON = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
        "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxnc2h3YXBweWpnbnpma3duY2prIiwicm9sZSI6"
        "ImFub24iLCJpYXQiOjE3ODU4MDgxNTAsImV4cCI6MjEwMTM4NDE1MH0."
        "YEAjEdKM8x7wYU_xvS463xw7EAYA5uQZeqE5ATIgqyQ")


def verify(token: str) -> bool:
    """拿這把金鑰真的去 Supabase 查一次，就跟 Worker 待會做的一模一樣。

    2026-10-21 的教訓：金鑰沒驗就直接貼上 Cloudflare，Worker 對 Supabase 的
    每一支查詢都回 401，站台靠 24 小時的舊快取撐了一天才被發現。
    這一關就是把那次的檢查搬到「碰 Cloudflare 之前」。
    """
    url = f"{BASE}/rest/v1/offers_public?select=id&limit=1"
    req = urllib.request.Request(url, headers={
        "apikey": ANON,                       # 閘道看的：一定要是公開那把
        "authorization": f"Bearer {token}",   # 決定角色的：這次要驗的那把
        "accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            rows = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:200]
        print(f"  [X] Supabase 回 {e.code}")
        print(f"    {detail}")
        if e.code == 401:
            print()
            print("    401 ＝ 簽章對不上。最可能的兩個原因：")
            print("      - JWT Secret 複製到別的東西了（例如 anon key 或 service_role key）")
            print("      - 專案已經換成新的 JWT 簽章系統，不能用共用祕密簽")
            print("    先不要貼去 Cloudflare。")
        elif e.code == 403:
            print()
            print("    403 ＝ 簽章對了，但權限不夠。")
            print("    schema_v131_edge_reader.sql 的【步驟 A2】沒跑成功，回去重跑。")
        return False
    except Exception as e:                                    # noqa: BLE001
        print(f"  [X] 連不上：{e}")
        return False

    if not rows:
        print("  [X] 查得到，但回 0 筆 —— RLS 把它全擋掉了，不要貼去 Cloudflare")
        return False
    print(f"  [OK] 可以讀到優惠（試查一筆：id={rows[0].get('id')}）")
    return True


def b64(raw: bytes) -> str:
    """JWT 用的 base64url：沒有結尾的 '='。"""
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def part(obj) -> str:
    return b64(json.dumps(obj, separators=(",", ":"), sort_keys=True).encode("utf-8"))


def main() -> int:
    secret = getpass.getpass("Supabase JWT Secret（貼上後直接按 Enter，畫面不會顯示）: ").strip()
    if not secret:
        print("沒有輸入，取消。", file=sys.stderr)
        return 1
    if len(secret) < 32:
        print(f"這串只有 {len(secret)} 個字，JWT Secret 至少 32 個字——"
              "是不是複製到別的東西了？", file=sys.stderr)
        return 1

    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "iss": ISS,
        "ref": REF,
        "role": ROLE,
        "iat": now,
        "exp": now + YEARS * 365 * 24 * 3600,
    }

    signing_input = f"{part(header)}.{part(payload)}"
    sig = hmac.new(secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256)
    token = f"{signing_input}.{b64(sig.digest())}"

    print()
    print(f"角色：{ROLE}")
    print(f"到期：{time.strftime('%Y-%m-%d', time.localtime(payload['exp']))}（{YEARS} 年後）")
    print()
    print("先拿這把金鑰去 Supabase 查一次（跟 Worker 待會做的一樣）…")
    if not verify(token):
        print()
        print("這把金鑰不能用，**不要貼到 Cloudflare**。上面寫了原因。")
        return 1

    print()
    print(token)
    print()
    print("下一步：")
    print("  1. 貼到 Cloudflare → birthdaydeals-api → Settings → Variables")
    print("     → 新增 SUPABASE_EDGE_KEY，型態選 Secret，然後重新部署")
    print("     （不要動原本的 SUPABASE_ANON_KEY）")
    print("  2. 開 https://birthdaydeals-api.celine-fu-work.workers.dev/offers 確認還有資料")
    print("  3. 確認之後，才跑 schema_v131_edge_reader.sql 的【步驟 B】")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
