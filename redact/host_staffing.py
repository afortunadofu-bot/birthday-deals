#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把工務所人力編制的試算頁放進公開作品集。

    python host_staffing.py

輸入 `source/staffing.html`（原稿，不進版控）
輸出 `../../../celine.fu/work/staffing-model.html`

這一份跟 billing 不一樣，裡面沒有業主、廠商或案名，所以不用代號化；
要補的是脈絡：工時是業界經驗值不是官方統計、法規門檻的出處在頁尾。
原稿本來就把法條與縣市公告的連結附在最後，那些一個都不動。
"""

import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "source" / "staffing.html"
OUT = (Path(os.environ.get("PORTFOLIO_OUT")
       or HERE.parent.parent.parent / "celine.fu") / "work" / "staffing-model.html")

BANNER = """<div style="max-width:1100px;margin:0 auto;padding:14px 18px;
  font:14px/1.7 system-ui,-apple-system,'Noto Sans TC',sans-serif;
  background:#fff8e6;border:1px solid #f0d9a0;border-radius:10px;color:#4a3c1a;">
  <b>這是一份自己做的試算模型，不是官方統計。</b>
  工時是把職務拆成工項之後逐項估出來的業界經驗值，實際落差可能到 ±20–30%，
  用在自己的案子之前建議先記兩週工時校正；
  法規門檻的部分來自營造業法、職業安全衛生管理辦法、公共工程品質管理作業要點
  與幾個縣市的公告，出處連結都放在頁尾。
  <a href="index.html" style="color:#7a5c12;">← 回作品集</a>　·　
  <a href="../" style="color:#7a5c12;">個人網頁</a>
  <div style="margin-top:10px;padding-top:10px;border-top:1px solid #f0d9a0;font-size:13px;">
    <b>用到的技能與工具：</b>人力資源規劃 · 工時分析 · 法規遵循 · 專案成本控管 ·
    試算模型（可自己改參數）· 職務拆解與尖峰對照
  </div>
</div>
"""


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    if not SRC.exists():
        sys.exit(f"找不到原稿 {SRC}")

    html = SRC.read_text(encoding="utf-8")
    html = re.sub(r"<title>.*?</title>",
                  "<title>分析｜工務所人力編制試算</title>\n"
                  '<link rel="icon" href="../img/icon-work.svg" type="image/svg+xml">\n'
                  '<link rel="alternate icon" href="../img/icon-work-32.png" sizes="32x32">',
                  html, count=1, flags=re.S)
    html = re.sub(r"(<body[^>]*>)", r"\1\n" + BANNER, html, count=1)
    if "回作品集" not in html:
        sys.exit("banner 沒插進去，檢查 <body> 標籤")

    OUT.write_text(html, encoding="utf-8")
    print(f"寫好 {OUT.parent.name}/{OUT.name}（{len(html):,} 字元）")


if __name__ == "__main__":
    main()
