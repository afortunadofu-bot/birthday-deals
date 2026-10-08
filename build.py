#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 offers.json 注入 template.html，產生可直接雙擊開啟的 index.html。"""

import json
from datetime import date
from pathlib import Path

HERE = Path(__file__).parent
data = json.loads((HERE / "offers.json").read_text(encoding="utf-8"))
data["meta"]["lastBuild"] = data["meta"].get("lastBuild") or date.today().isoformat()

payload = {
    "meta": data["meta"],
    "offers": [
        {
            "brand": o["brand"], "category": o["category"], "offer": o["offer"],
            "membership": o["membership"], "advanceDays": o["advanceDays"],
            "advanceNote": o["advanceNote"], "window": o["window"],
            "conditions": o["conditions"], "validity": o["validity"],
            "verified": o["verified"], "lastChecked": o["lastChecked"],
            # v2
            "regions": o.get("regions", []), "regionNote": o.get("regionNote", ""),
            "validityType": o.get("validityType", "rolling"),
            "validFrom": o.get("validFrom"), "validUntil": o.get("validUntil"),
            # bestSource 不再另外存一份——它在這 138 筆資料裡永遠等於
            # sources[0]（第一筆來源本來就是依可信度排過序的），跟前端
            # loadOffers() 讀 Supabase 資料時的算法完全一樣，front-end
            # 直接算就好，不用把同一份物件在種子資料裡重複存兩次。這是
            # LCP 優化的一部分：省下的這一份重複資料要等整包種子資料
            # 下載完才看得到第一屏卡片，越輕越快看到內容。
            "sources": o.get("sources", []),
            # v3
            "membershipType": o.get("membershipType", "brand"),
            "membershipCost": o.get("membershipCost", "free"),
            "freeTier": o.get("freeTier", "discount"),
            # v4
            "timing": o.get("timing", o.get("window", "當月")),
            "valueTwd": o.get("valueTwd"),
            # v12：集團歸屬（王品集團等），各品牌已拆成獨立卡片，這裡只留歸屬標記
            "groupName": o.get("groupName", ""),
            # v45：可轉讓（票券本身能不能給別人用，不用出示本人證件），預設未確認
            "transferable": o.get("transferable", "unknown"),
        }
        for o in data["offers"]
    ],
}

html = (HERE / "template.html").read_text(encoding="utf-8")
html = html.replace("/*__OFFERS_DATA__*/",
                    json.dumps(payload, ensure_ascii=False, separators=(",", ":")))

# ---- 更新紀錄：一份來源，兩個去處 ----------------------------------------
# celine：「更新紀錄不要是收合，是點進去看到新網頁」。所以內容搬到 updates.json，
# 這裡注入 index.html（「我的」頁面只用到日期＋標題，拿來做 NEW 標記跟最新幾筆的
# 清單），同時產生整頁的 updates.html。寫在兩個地方很快就會對不起來，所以兩邊都
# 從同一個檔案長出來。
updates = json.loads((HERE / "updates.json").read_text(encoding="utf-8"))["updates"]
updates.sort(key=lambda u: u["date"], reverse=True)
html = html.replace("/*__UPDATES_DATA__*/",
                    json.dumps(updates, ensure_ascii=False, separators=(",", ":")))


def esc(t: str) -> str:
    return (t.replace("&", "&amp;").replace("<", "&lt;")
             .replace(">", "&gt;").replace('"', "&quot;"))


def updates_page() -> str:
    def one(u: dict) -> str:
        lis = "".join(f"<li>{esc(i)}</li>" for i in u["items"])
        return (
            '  <article class="u">\n'
            f'    <div class="u-date">{esc(u["date"])}</div>\n'
            f'    <h2>{esc(u["title"])}</h2>\n'
            f"    <ul>{lis}</ul>\n"
            "  </article>"
        )

    body = "\n".join(one(u) for u in updates)
    tpl = (HERE / "updates_template.html").read_text(encoding="utf-8")
    if "<!--__UPDATES_BODY__-->" not in tpl:
        raise SystemExit("updates_template.html 少了 <!--__UPDATES_BODY__--> 這個記號。")
    return tpl.replace("<!--__UPDATES_BODY__-->", body)


def check_js(page: str) -> None:
    """產生出來的 index.html 裡那包 JS 必須語法正確才算數。

    踩過一次：編輯時不小心多留了一行 `if(...){`，整包腳本從那裡開始就解析失敗，
    網站變成「畫得出來但什麼都不會動」——登入鈕沒反應、優惠永遠是內建種子資料。
    瀏覽器只在 console 裡講一句，不看 console 根本不知道。
    有 node 就用 `node --check` 擋下來，沒有就只提醒一句，不擋住建置。
    """
    import re, shutil, subprocess, tempfile
    scripts = re.findall(r"<script>(.*?)</script>", page, re.S)
    if not scripts:
        return
    node = shutil.which("node")
    if not node:
        print("（找不到 node，跳過 JS 語法檢查）")
        return
    big = max(scripts, key=len)
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
        f.write(big)
        path = f.name
    try:
        r = subprocess.run([node, "--check", path], capture_output=True)
    finally:
        try:
            Path(path).unlink()
        except OSError:
            pass
    if r.returncode != 0:
        msg = r.stderr.decode("utf-8", "replace").strip()
        raise SystemExit("JS 語法錯誤，index.html 沒有產生：\n" + msg)


check_js(html)
(HERE / "index.html").write_text(html, encoding="utf-8")
(HERE / "updates.html").write_text(updates_page(), encoding="utf-8")

print(f"index.html 已產生，共 {len(payload['offers'])} 筆優惠。")
print(f"updates.html 已產生，共 {len(updates)} 筆更新。")
