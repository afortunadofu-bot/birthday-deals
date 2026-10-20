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

ROLE = "edge_reader"
ISS = "supabase"
REF = "lgshwappyjgnzfkwncjk"   # 專案代號，跟現有的 anon key 同一個
YEARS = 10


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
