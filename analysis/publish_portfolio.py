#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一個指令：重建作品集、推上線。

    python publish_portfolio.py                 # 建 + 推
    python publish_portfolio.py --dry           # 只建，不碰 git
    python publish_portfolio.py -m "改了什麼"    # 自訂 commit 訊息

它會做四件事：

  1. `redact_billing.py`（有原稿才跑）→ 產出去識別化的請款預估頁
  2. `build_site.py`（內含 report.py）→ 產出整個作品集到 ../../../celine.fu/work/
  3. celine.fu：commit + push（作品集跟個人網頁同一個 repo、同一個站）
  4. birthday-deals：commit + push，但**只加自己的那幾個路徑**

第 4 點的限制是故意的：這個 repo 常常有別的工作同時在改（爬門市的那些
stores_import_*.sql 就是），`git add -A` 會把別人做到一半的東西一起推出去。
所以這裡只 add 我自己產出的路徑，其他一律不碰。
"""

import argparse
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent                      # .../birthday deals/claude
SITE = HERE.parent.parent.parent / "celine.fu"
TPE = timezone(timedelta(hours=8))

# birthday-deals 這邊只准動這些路徑
MINE = ["analysis", "docs", "ml", "geo", "redact", "README.md"]


def run(cmd, cwd, check=True, quiet=False):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8")
    if not quiet and r.stdout.strip():
        print("   " + r.stdout.strip().replace("\n", "\n   "))
    if check and r.returncode != 0:
        print(r.stderr.strip()[:600])
        sys.exit(f"失敗：{' '.join(cmd)}")
    return r


def dirty(repo, paths=None):
    r = run(["git", "status", "--porcelain"] + (paths or []), repo, quiet=True)
    return [ln for ln in r.stdout.splitlines() if ln.strip()]


def push(repo, paths, message):
    changed = dirty(repo, paths)
    if not changed:
        print(f"   {repo.name}：沒有要推的")
        return False
    print(f"   {repo.name}：{len(changed)} 個檔案")
    run(["git", "add"] + paths, repo)
    run(["git", "commit", "-q", "-m", message], repo)
    run(["git", "push", "-q", "origin", "HEAD"], repo)
    head = run(["git", "log", "--oneline", "-1"], repo, quiet=True).stdout.strip()
    print(f"   推上去了：{head}")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true", help="只重建，不 commit 也不 push")
    ap.add_argument("-m", "--message", help="commit 訊息")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    stamp = f"{datetime.now(TPE):%Y-%m-%d}"
    msg = args.message or f"作品集重建（{stamp}）"

    print("1／3 請款預估頁")
    if (REPO / "redact" / "source" / "billing.html").exists():
        run([sys.executable, "-X", "utf8", "redact_billing.py"], REPO / "redact")
    else:
        print("   沒有原稿，跳過（線上那一頁維持上次的）")

    print("2／3 作品集")
    run([sys.executable, "-X", "utf8", "build_site.py"], HERE)

    if args.dry:
        print("3／3 --dry：不碰 git")
        return

    print("3／3 推上線")
    a = push(SITE, ["work", "index.html", "README.md"], msg)
    b = push(REPO, MINE, msg)
    if a:
        print("   作品集：https://afortunadofu-bot.github.io/celine.fu/work/")
    if not (a or b):
        print("   兩邊都沒有異動，什麼都沒推。")


if __name__ == "__main__":
    main()
