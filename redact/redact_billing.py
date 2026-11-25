#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把一份真實專案的請款預估頁去識別化之後，放進公開的作品集。

    python redact_billing.py

輸入 `source/billing.html`（原稿，**不進版控**）
輸出 `../docs/billing-forecast.html`（公開頁）

對照表放在 `names.local.json`，**也不進版控**——那張表本身就是答案，
放進公開 repo 等於沒遮。版控裡只有這支程式跟一份格式範例。

打馬的範圍（2026-11-24 跟使用者確認過）：
  公司名、案名、檔名  → 代號化
  金額                → **保留原數字**。4,242 萬的機電案本身就是說服力，
                        公司名拿掉之後，單看金額認不出是誰的案子。

替換一律從最長的字串開始，否則「亭恩」會先吃掉「亭恩科技」，
留下「廠商 A科技」這種殘骸。做完會自己檢查一次，有漏的就不產出檔案。
"""

import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "source" / "billing.html"
MAP = HERE / "names.local.json"
OUT = (Path(os.environ.get("PORTFOLIO_OUT")
       or HERE.parent.parent.parent / "celine.fu") / "work" / "billing-forecast.html")

BANNER = """<div style="max-width:1100px;margin:0 auto;padding:14px 18px;
  font:14px/1.7 system-ui,-apple-system,'Noto Sans TC',sans-serif;
  background:#fff8e6;border:1px solid #f0d9a0;border-radius:10px;color:#4a3c1a;">
  <b>這是一份真實專案的工作成果，已去識別化。</b>
  業主、下包廠商、案名一律改成代號（總包 T、廠商 A…），檔名與單據編號也拿掉了；
  <b>金額、時程、比例全部是原始數字</b>，分析結論沒有被改動。
  <a href="index.html" style="color:#7a5c12;">← 回作品集</a>　·　
  <a href="../" style="color:#7a5c12;">個人網頁</a>
</div>
"""


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    if not SRC.exists():
        sys.exit(f"找不到原稿 {SRC}")
    if not MAP.exists():
        sys.exit(f"找不到對照表 {MAP}（參考 names.example.json 自己建一份，不要進版控）")

    pairs = json.loads(MAP.read_text(encoding="utf-8"))
    html = SRC.read_text(encoding="utf-8")

    # 長的先換，避免短名字把長名字咬掉一半
    for src in sorted(pairs, key=len, reverse=True):
        html = html.replace(src, pairs[src])

    html = re.sub(r"<title>.*?</title>", "<title>機電工程請款預估</title>", html, count=1,
                  flags=re.S)
    html = re.sub(r"(<body[^>]*>)", r"\1\n" + BANNER, html, count=1)

    leaks = {s: html.count(s) for s in pairs if s in html}
    if leaks:
        sys.exit(f"還有沒換乾淨的：{leaks}")

    OUT.write_text(html, encoding="utf-8")
    print(f"寫好 {OUT.parent.name}/{OUT.name}（{len(html):,} 字元）")
    print(f"  換掉 {len(pairs)} 組名稱，檢查後沒有殘留")


if __name__ == "__main__":
    main()
