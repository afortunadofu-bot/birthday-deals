#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把上一層的網站成品組成 app/www/，給 Capacitor 當 webDir 用。

為什麼不直接讓 Capacitor 指向上一層：那個資料夾裡有 offers.json、schema_*.sql、
stores_import_*.sql（加起來幾十 MB）跟一堆 Python 腳本，全部都會被打包進 APK。
www/ 只放手機真的需要的那幾個檔。

用法：
    python sync_www.py            # 先跑 build.py，再組 www/
    python sync_www.py --no-build # 直接用現有的 index.html

www/ 是產物，不要進 git，也不要手改。
"""

import argparse
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

APP = Path(__file__).parent
SRC = APP.parent
WWW = APP / "www"

# 手機上真的會用到的檔案。少一個會 404，多一個只是讓 APK 變大。
FILES = [
    "index.html",      # build.py 產物
    "updates.html",    # build.py 產物
    "about.html",
    "privacy.html",
    "terms.html",
    "config.js",       # Supabase 金鑰（anon key，公開的，靠 RLS 把關）
    "track.js",
    "manifest.json",
    "icon.svg",
    "icon-192.png",
    "icon-512.png",
]

# 刻意不複製的：
#   sw.js       —— Capacitor 的資產本來就在本機，再疊一層 service worker
#                  只會讓快取更難除錯。template.html 已經在 App 裡跳過註冊。
#   og-image.png—— 只有社群分享的爬蟲會抓，手機版面上用不到（62KB）。
#   sitemap.xml / robots.txt / google*.html —— 搜尋引擎用的，App 裡沒有意義。

# Supabase SDK 改成打包進 App。原因是 index.html 的載入器對 CDN 只等 10 秒，
# 逾時就整頁降級成「離線示範模式」——手機網路下這件事會真的發生。
# 本機檔案永遠不會逾時，CDN 留著當備援。
SDK_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"
SDK_LOCAL = "vendor/supabase.min.js"

# Leaflet 刻意留在 CDN：地圖圖磚本來就要連網才看得到，而且那一顆
# L.marker 用的是 Leaflet 的預設圖示，路徑是從 leaflet.css 的位置推算出來的，
# 搬到本機還要一起搬 images/，換來的好處是零。

# 字串替換：每一條都必須真的命中，沒命中就是上游改過了，要吵出來而不是默默產出壞檔。
REPLACEMENTS = [
    (
        "SDK_URLS 最前面插入本機檔案",
        "const SDK_URLS=[\n"
        "  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',",
        "const SDK_URLS=[\n"
        f"  '{SDK_LOCAL}',\n"
        "  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',",
    ),
]


def run_build() -> None:
    r = subprocess.run([sys.executable, "build.py"], cwd=SRC)
    if r.returncode != 0:
        sys.exit("build.py 失敗，www/ 沒有重建。")


def fetch_sdk(dest: Path) -> None:
    if dest.exists():
        print(f"  vendor/supabase.min.js 已存在（{dest.stat().st_size // 1024} KB），跳過下載")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  下載 Supabase SDK → {dest.name}")
    with urllib.request.urlopen(SDK_URL, timeout=60) as r:
        dest.write_bytes(r.read())
    print(f"  完成（{dest.stat().st_size // 1024} KB）")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-build", action="store_true", help="不跑 build.py，直接用現有成品")
    args = ap.parse_args()

    if not args.no_build:
        run_build()

    # vendor/ 要保留（裡面是下載來的 SDK，不想每次重抓），其餘清掉重組。
    if WWW.exists():
        for p in WWW.iterdir():
            if p.name == "vendor":
                continue
            shutil.rmtree(p) if p.is_dir() else p.unlink()
    WWW.mkdir(parents=True, exist_ok=True)

    missing = [f for f in FILES if not (SRC / f).exists()]
    if missing:
        sys.exit("上一層找不到這些檔案：" + "、".join(missing))

    total = 0
    for f in FILES:
        src, dst = SRC / f, WWW / f
        shutil.copy2(src, dst)
        total += dst.stat().st_size

    fetch_sdk(WWW / "vendor" / "supabase.min.js")

    # 針對 App 版做的字串替換（不動 template.html，網頁版完全不受影響）
    idx = WWW / "index.html"
    html = idx.read_text(encoding="utf-8")
    for label, old, new in REPLACEMENTS:
        if old not in html:
            sys.exit(
                f"替換失敗：{label}。\n"
                "index.html 裡找不到預期的那段字，應該是 template.html 改過了。\n"
                "請同步更新 app/sync_www.py 的 REPLACEMENTS，不要讓它默默產出壞檔。"
            )
        html = html.replace(old, new, 1)
    idx.write_text(html, encoding="utf-8")

    print(f"www/ 已組好：{len(FILES)} 個檔案，共 {total / 1024 / 1024:.1f} MB")
    print(f"  index.html {idx.stat().st_size / 1024 / 1024:.2f} MB ← 這就是 WebView 要吃下去的量")


if __name__ == "__main__":
    main()
