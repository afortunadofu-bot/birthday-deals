#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把上一層的網站成品組成 app/www/，給 Capacitor 當 webDir 用。

為什麼不直接讓 Capacitor 指向上一層：那個資料夾裡有 offers.json、schema_*.sql、
stores_import_*.sql（加起來幾十 MB）跟一堆 Python 腳本，全部都會被打包進 APK。

**檔案清單不寫在這裡**，直接讀 `publish.py` 的 `SITE_FILES`。
那份清單是「網站需要哪些檔」的唯一來源，上線跟 App 共用同一份，
以後新增圖片或頁面只要加進 publish.py，App 這邊自動跟上。
（第一版這裡自己抄了一份清單，一個月後就漏了 whatsnew-*.jpg——所以不抄了。）

用法：
    python sync_www.py            # 先跑 build.py，再組 www/
    python sync_www.py --no-build # 直接用現有的 index.html

www/ 是產物，不要進 git，也不要手改。
"""

import argparse
import importlib.util
import shutil
import subprocess
import sys
from pathlib import Path

APP = Path(__file__).parent
SRC = APP.parent
WWW = APP / "www"

# App 裡不要的：service worker。Capacitor 的資產本來就在手機本機，再疊一層快取
# 只會讓改版後「到底是哪一份在跑」變難查。template.html 的 registerSW() 已經靠
# IN_APP 跳過註冊，這裡連檔案都不複製，雙重保險。
EXCLUDE = {"sw.js"}

# supabase.min.js 在網站上是攤平放在根目錄的（上傳時子資料夾會被攤平），
# 但 App 自己控制資產路徑，沒有那個限制。index.html 的載入器是先找
# vendor/ 再找根目錄，所以 App 版放回 vendor/ 可以少一次 404。
KEEP_IN_VENDOR = {"supabase.min.js": "vendor/supabase.min.js"}

# 刻意沒有「字串替換」這一段了。
# 第一版曾經在這裡把 SDK_URLS 改成本機優先，但 v128／v152 之後
# template.html 自己就是「先找 vendor/、再找根目錄、最後才 CDN」，
# 所有人（含網頁版）都一樣，App 不需要特別待遇了。


def load_site_files() -> dict:
    """讀 publish.py 的 SITE_FILES（import 不會跑 main()）。"""
    path = SRC / "publish.py"
    if not path.exists():
        sys.exit(f"找不到 {path}——SITE_FILES 清單在那裡，沒有它不知道要複製什麼。")
    spec = importlib.util.spec_from_file_location("publish", path)
    mod = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(SRC))
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.path.pop(0)
    if not getattr(mod, "SITE_FILES", None):
        sys.exit("publish.py 裡找不到 SITE_FILES，清單的格式應該改過了。")
    return dict(mod.SITE_FILES)


# --perf 用的量測片段。只動 www/（產物），不動 template.html，所以正式版永遠沒有這段。
# console.log 會被 Capacitor 轉進 logcat（tag: Capacitor/Console），
# 所以手機上可以用 `adb logcat -s Capacitor/Console` 直接讀到數字。
PERF_SNIPPET = """<script>
/* 量測用，只有 sync_www.py --perf 會放進來 */
(function(){
  function log(n,v){ console.log('[PERF] '+n+'='+Math.round(v)+'ms'); }
  document.addEventListener('DOMContentLoaded',function(){ log('DOMContentLoaded',performance.now()); });
  window.addEventListener('load',function(){ log('load',performance.now()); });
  try{
    new PerformanceObserver(function(l){ l.getEntries().forEach(function(e){ log(e.name,e.startTime); }); })
      .observe({type:'paint',buffered:true});
    new PerformanceObserver(function(l){ var e=l.getEntries().pop(); if(e) log('LCP',e.startTime); })
      .observe({type:'largest-contentful-paint',buffered:true});
  }catch(e){}
})();
</script>
"""


def run_build() -> None:
    r = subprocess.run([sys.executable, "build.py"], cwd=SRC)
    if r.returncode != 0:
        sys.exit("build.py 失敗，www/ 沒有重建。")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-build", action="store_true", help="不跑 build.py，直接用現有成品")
    ap.add_argument("--perf", action="store_true",
                    help="在 www/index.html 插入量測片段（DOMContentLoaded／paint／LCP），只給測速用")
    args = ap.parse_args()

    if not args.no_build:
        run_build()

    site_files = load_site_files()

    # 哪些要複製、複製到 www/ 的哪個名字
    plan = {}
    for dest, src in site_files.items():
        if dest in EXCLUDE:
            continue
        plan[KEEP_IN_VENDOR.get(dest, dest)] = src

    missing = [s for s in plan.values() if not (SRC / s).exists()]
    if missing:
        sys.exit("上一層找不到這些檔案（先跑 build.py 或補檔）：" + "、".join(missing))

    if WWW.exists():
        shutil.rmtree(WWW)
    WWW.mkdir(parents=True)

    total = 0
    for dest, src in sorted(plan.items()):
        d = WWW / dest
        d.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(SRC / src, d)
        total += d.stat().st_size

    idx = WWW / "index.html"
    if args.perf:
        html = idx.read_text(encoding="utf-8")
        if "<head>" not in html:
            sys.exit("index.html 裡找不到 <head>，量測片段插不進去。")
        html = html.replace("<head>", "<head>\n" + PERF_SNIPPET, 1)
        idx.write_text(html, encoding="utf-8")
        print("  ⚠️ 已插入量測片段（--perf）——這份 www/ 只能用來測速，不要拿去送審")

    print(f"www/ 已組好：{len(plan)} 個檔案，共 {total / 1024 / 1024:.1f} MB"
          f"（清單來自 publish.py，跳過 {'、'.join(sorted(EXCLUDE))}）")
    print(f"  index.html {idx.stat().st_size / 1024 / 1024:.2f} MB ← 這就是 WebView 要吃下去的量")


if __name__ == "__main__":
    main()
