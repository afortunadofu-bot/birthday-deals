#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""個人網頁：首頁＋每個精選案例一頁。內容在 celine.fu/data/profile.json。

    python build_profile.py            # 產到 celine.fu/draft/
    python build_profile.py --live     # 產到 celine.fu/（換掉正式版）

第一版的草稿被打回來，理由是「很 AI、沒有質感」。問題出在：18 列長得一模一樣、
沒有主次、沒有畫面、點進去也沒有東西。這一版的作法：

  * **主次分明**：六件精選案例各自一頁，其餘收成一份緊湊的索引
  * **有畫面**：真實截圖；沒有截圖的案子自己畫一張說明圖
  * **邏輯跑得完**：背景 → 業主要求 → 問題 → 怎麼分析 → 解法 → 結果，
    一頁讀完知道這個人怎麼想事情，而不是只知道他做過什麼
  * **版面不對稱**：圖左文右交錯，標題用襯線體，數字大而安靜
"""

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = HERE.parent.parent.parent / "celine.fu"
DATA = SITE / "data" / "profile.json"
TPE = timezone(timedelta(hours=8))
FONTS = ("https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@500;700&"
         "family=Noto+Sans+TC:wght@400;500;700&display=swap")


def esc(s):
    import html
    return html.escape(str(s if s is not None else ""))


def t(node, lang):
    if isinstance(node, dict):
        return node.get(lang) or node.get("zh") or ""
    return node or ""


def bi(node, tag="span", cls=""):
    c = f" {cls}" if cls else ""
    return (f'<{tag} class="zh{c}">{esc(t(node, "zh"))}</{tag}>'
            f'<{tag} class="en{c}">{esc(t(node, "en"))}</{tag}>')


# ── 自己畫的說明圖（沒有截圖的案子用）────────────────────────────
#
# 畫法上的幾條規矩，不然很容易畫成「簡報上的那種圖」：
#   * 長度要有意義。四個月跟一個月就畫成 4:1，不要兩個一樣大的方塊配箭頭
#   * 一張圖只用一次重點色，其餘是灰階
#   * 寧可少畫。能用一行字講完的不要畫成流程圖
#   * 對齊到 8 的倍數，字級只有兩種：13px 標籤、11.5px 附註

def figure_flow():
    """20 幾份長短不一的報價，收斂成一份。長度直接代表報價範圍。"""
    bids = [196, 150, 232, 118, 174, 204, 136]
    rows = []
    y = 56
    for i, w in enumerate(bids):
        x = 24 + (i % 3) * 18          # 錯開，表示範圍互相重疊、對不齊
        rows.append(f'<rect x="{x}" y="{y}" width="{w}" height="7" rx="1.5" class="f-bar"/>')
        y += 14
    return f"""<svg viewBox="0 0 720 230" class="fig" role="img"
  aria-label="二十多份長短不一、互相重疊的報價，收斂成一份範圍清楚的契約">
  <text x="24" y="32" class="f-h">20+ 份報價</text>
  <text x="24" y="48" class="f-n">長度＝各自認定的範圍。彼此重疊，也彼此漏接</text>
  {''.join(rows)}
  <line x1="340" y1="40" x2="340" y2="170" class="f-rule"/>
  <text x="364" y="96" class="f-h">成本 × 範圍</text>
  <text x="364" y="114" class="f-n">每個工項逐一對照：誰有報、含不含</text>
  <text x="364" y="130" class="f-n">輔料與測試、介面由誰負責</text>
  <text x="24" y="196" class="f-h f-on">1 份執行契約</text>
  <rect x="24" y="204" width="356" height="10" rx="2" class="f-bar-on"/>
  <text x="396" y="213" class="f-n">範圍不重疊、責任有歸屬</text>
  <text x="24" y="{230 - 2}" class="f-n"></text>
</svg>"""


def figure_timeline():
    """四個月對一個月，寬度就照 4:1 畫。"""
    return """<svg viewBox="0 0 720 180" class="fig" role="img"
  aria-label="送審卡了四個月，接手後一個月核准">
  <text x="24" y="34" class="f-h">修改四個月，沒有通過</text>
  <rect x="24" y="48" width="432" height="18" rx="2" class="f-bar"/>
  <text x="24" y="86" class="f-n">退件 → 改 → 再送 → 再退。沒有人去問到底是哪一條不過</text>
  <line x1="472" y1="40" x2="472" y2="140" class="f-rule"/>
  <text x="472" y="34" class="f-h" text-anchor="middle">接手</text>
  <text x="496" y="116" class="f-h f-on">一個月內核准</text>
  <rect x="496" y="126" width="108" height="18" rx="2" class="f-bar-on"/>
  <text x="24" y="166" class="f-n">同一份文件、同一批規格。改的是比較表的排法，
    讓審查委員一眼對得上規範與型錄</text>
</svg>"""


def figure_tiers():
    """一份文件，三層讀者。用縮排表示深度，不是三個並排的框。"""
    rows = [("C-level", "三分鐘看完結論", 0, True),
            ("投資經理", "標準化財務指標", 1, False),
            ("技術盡職調查", "模型細節與附錄", 2, False)]
    out = ['<text x="24" y="32" class="f-h">一份白皮書，三層深度</text>']
    for name, note, i, on in rows:
        y = 52 + i * 38
        x = 24 + i * 20
        cls = "f-bar-on" if on else "f-bar"
        out.append(f'<rect x="{x}" y="{y}" width="8" height="24" rx="1.5" class="{cls}"/>')
        out.append(f'<text x="{x + 20}" y="{y + 11}" class="f-h{" f-on" if on else ""}">{name}</text>')
        out.append(f'<text x="{x + 20}" y="{y + 28}" class="f-n">{note}</text>')
    out.append('<line x1="400" y1="52" x2="400" y2="152" class="f-rule"/>')
    out.append('<text x="424" y="96" class="f-n">改一次，三種讀者同時更新；</text>')
    out.append('<text x="424" y="113" class="f-n">不用維護三個版本，也不會互相矛盾</text>')
    return ('<svg viewBox="0 0 720 176" class="fig" role="img" '
            'aria-label="一份白皮書分三層，服務三種讀者">' + "".join(out) + "</svg>")


def figure_cash():
    """一條錢的路徑切成三段，卡在哪一段決定要找誰。"""
    seg = [("已發包", "採購", 0), ("已計價", "我們自己", 1), ("已收款", "業主", 2)]
    out = ['<text x="24" y="32" class="f-h">同一筆錢，三個狀態</text>']
    w = 212
    for name, who, i in seg:
        x = 24 + i * (w + 12)
        on = i == 2
        out.append(f'<rect x="{x}" y="50" width="{w}" height="28" rx="2" '
                   f'class="{"f-bar-on" if on else "f-bar"}"/>')
        out.append(f'<text x="{x}" y="100" class="f-h{" f-on" if on else ""}">{name}</text>')
        out.append(f'<text x="{x}" y="118" class="f-n">卡住 → 找{who}</text>')
    out.append('<text x="24" y="156" class="f-n">分開記之後，每一筆延遲都有歸屬；'
               '20+ 個專案共用一組專案編號，</text>')
    out.append('<text x="24" y="173" class="f-n">內部期限固定壓在契約里程碑前一週</text>')
    return ('<svg viewBox="0 0 720 186" class="fig" role="img" '
            'aria-label="金流拆成已發包、已計價、已收款三段">' + "".join(out) + "</svg>")


def figure_risk():
    """20 件案子的節點分兩類：自己排得動的，跟等別人決定的。"""
    out = ['<text x="24" y="30" class="f-h">20+ 件案子</text>',
           '<text x="24" y="47" class="f-n">每件 5–20 家下包，加上公家審查單位</text>']
    for i in range(21):
        x = 24 + (i % 7) * 26
        y = 62 + (i // 7) * 26
        out.append(f'<rect x="{x}" y="{y}" width="18" height="18" rx="2" class="f-bar"/>')
    out.append('<line x1="236" y1="56" x2="236" y2="196" class="f-rule"/>')
    out.append('<text x="262" y="78" class="f-h">我方可控</text>')
    out.append('<text x="262" y="95" class="f-n">自己排進度：設計、採購、施工、驗收</text>')
    out.append('<text x="262" y="126" class="f-h f-on">他方決定</text>')
    out.append('<text x="262" y="143" class="f-n">送審核准、業主決標、廠商交期</text>')
    out.append('<text x="262" y="160" class="f-n">排不動，只能盯</text>')
    out.append('<line x1="520" y1="56" x2="520" y2="196" class="f-rule"/>')
    out.append('<text x="546" y="78" class="f-h f-on">十幾個風險點</text>')
    for i in range(12):
        y = 92 + i * 9
        out.append(f'<rect x="546" y="{y}" width="{104 - (i % 4) * 14}" height="4" rx="1" '
                   f'class="f-bar-on"/>')
    out.append('<text x="546" y="212" class="f-n">二十件案子的「他方決定」加起來只有這些，</text>')
    out.append('<text x="546" y="229" class="f-n">那才是真正要盯的清單</text>')
    return ('<svg viewBox="0 0 720 244" class="fig" role="img" '
            'aria-label="二十多件案子的節點分成我方可控與他方決定，他方決定的收斂成十幾個風險點">'
            + "".join(out) + "</svg>")


def figure_score():
    """同一套工項、不同廠商有沒有報。空格比數字更會說話。"""
    items = ["配電盤", "管線與配線", "弱電整合", "測試與試車", "輔料", "介面施工",
             "保固與教育訓練"]
    have = [[1, 1, 1], [1, 1, 1], [1, 0, 1], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 0]]
    out = ['<text x="24" y="30" class="f-h">同一套工項，逐欄對照誰有報</text>',
           '<text x="24" y="47" class="f-n">拆完才看得出來，價差大部分來自範圍認定，不是單價</text>']
    for j, name in enumerate(["廠商 A", "廠商 B", "廠商 C"]):
        out.append(f'<text x="{272 + j * 96}" y="78" class="f-n">{name}</text>')
    for i, label in enumerate(items):
        y = 98 + i * 22
        out.append(f'<text x="24" y="{y}" class="f-n">{label}</text>')
        for j in range(3):
            x = 272 + j * 96
            if have[i][j]:
                out.append(f'<rect x="{x}" y="{y - 10}" width="56" height="12" rx="2" '
                           f'class="f-bar"/>')
            else:
                out.append(f'<line x1="{x}" y1="{y - 4}" x2="{x + 56}" y2="{y - 4}" '
                           f'class="f-rule"/>')
    out.append('<text x="24" y="276" class="f-n f-on">橫線＝這家沒報。</text>')
    out.append('<text x="128" y="276" class="f-n">最低價那家常常是漏得最多那家，'
               '所以評分要先把範圍補齊再比</text>')
    return ('<svg viewBox="0 0 720 290" class="fig" role="img" '
            'aria-label="同一套工項對照三家廠商有沒有報價，空缺用橫線表示">'
            + "".join(out) + "</svg>")


def figure_funnel():
    """三個階段，每一段都會掉人。寬度照剩下多少畫。"""
    rows = [("接觸", "名單來自產業活動與引薦", 560),
            ("第一次會議", "白皮書先寄，會議只談假設", 320),
            ("盡職調查", "模型細節與附錄這時候才用得到", 150)]
    out = ['<text x="24" y="30" class="f-h">三個階段，每一段都會掉人</text>',
           '<text x="24" y="47" class="f-n">寬度＝還留著多少，不是等寬的漏斗圖</text>']
    y = 72
    for i, (name, note, w) in enumerate(rows):
        on = i == len(rows) - 1
        out.append(f'<rect x="24" y="{y}" width="{w}" height="26" rx="2" '
                   f'class="{"f-bar-on" if on else "f-bar"}"/>')
        out.append(f'<text x="24" y="{y + 46}" class="f-h{" f-on" if on else ""}">{name}</text>')
        out.append(f'<text x="{24 + 96}" y="{y + 46}" class="f-n">{note}</text>')
        y += 66
    out.append('<text x="24" y="272" class="f-n">每一次拒絕都記下理由與階段，'
               '下一輪才知道要先補哪一塊；</text>')
    out.append('<text x="24" y="289" class="f-n">轉換機率分數就是這樣長出來的</text>')
    return ('<svg viewBox="0 0 720 302" class="fig" role="img" '
            'aria-label="募資三個階段的漏斗，寬度代表還留著多少投資人">'
            + "".join(out) + "</svg>")


FIGURES = {"flow": figure_flow, "timeline": figure_timeline,
           "tiers": figure_tiers, "cash": figure_cash,
           "risk": figure_risk, "score": figure_score, "funnel": figure_funnel}


# ── 版面 ──────────────────────────────────────────────────────

def shell(*, title, desc, body, depth=0, now=None, cases=()):
    up = "../" * depth
    case_links = "".join(
        f'<li><a href="{up}case/{c["id"]}.html">'
        f'<span class="zh">{esc(t(c["title"], "zh"))}</span>'
        f'<span class="en">{esc(t(c["title"], "en"))}</span></a></li>' for c in cases)
    return f"""<!doctype html>
<html lang="zh-Hant" data-lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="icon" href="{up}img/icon.svg" type="image/svg+xml">
<link rel="alternate icon" href="{up}img/icon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="{up}img/icon-180.png">
<meta name="theme-color" content="#15140f">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<style>{CSS}</style>
</head>
<body>
<div class="prog" id="prog"></div>
<header class="bar">
  <div class="wrap bar-in">
    <a class="bname" href="{up}index.html"><span class="zh">傅聖嵐</span><span class="en">Fu Sheng-Lan</span></a>
    <span class="bar-r">
      <button class="lang" data-set="zh">中文</button><span class="sep">·</span>
      <button class="lang" data-set="en">EN</button>
      <button class="tog" type="button" aria-label="切換深淺色">◐</button>
      <button class="burger" id="burger" aria-label="選單" aria-expanded="false">
        <span></span><span></span>
      </button>
    </span>
  </div>
</header>
<div class="menu" id="menu" hidden>
  <div class="wrap menu-in">
    <div class="menu-col">
      <p class="menu-h"><span class="zh">精選案例</span><span class="en">Selected cases</span></p>
      <ol class="menu-cases">{case_links}</ol>
    </div>
    <div class="menu-col menu-col-2">
      <p class="menu-h"><span class="zh">頁面</span><span class="en">Pages</span></p>
      <ul class="menu-list">
        <li><a href="{up}index.html"><span class="zh">首頁</span><span class="en">Home</span></a></li>
        <li><a href="{up}index.html#rest"><span class="zh">其他做過的事</span><span class="en">Everything else</span></a></li>
        <li><a href="{up}index.html#where"><span class="zh">待過的地方</span><span class="en">Where</span></a></li>
        <li><a href="{up}index.html#skills"><span class="zh">技能</span><span class="en">Skills</span></a></li>
        <li><a href="{up}index.html#think"><span class="zh">怎麼想事情</span><span class="en">How I think</span></a></li>
        <li><a href="{up}work/"><span class="zh">分析作品集</span><span class="en">Analysis portfolio</span></a></li>
        <li><a href="https://afortunadofu-bot.github.io/celinefubrandpage/">小數據所</a></li>
        <li><a href="{up}index.html#contact"><span class="zh">聯絡</span><span class="en">Contact</span></a></li>
      </ul>
    </div>
  </div>
</div>
{body}
<footer class="wrap foot">
  <p class="foot-links">
    <a href="{up}index.html"><span class="zh">首頁</span><span class="en">Home</span></a>　·
    <a href="{up}work/"><span class="zh">分析作品集</span><span class="en">Analysis</span></a>　·
    <a href="https://afortunadofu-bot.github.io/celinefubrandpage/">小數據所</a>
  </p>
  <p class="foot-note"><span class="zh">內容由 <code>data/profile.json</code> 產生</span>
     <span class="en">Generated from <code>data/profile.json</code></span>　·　{now:%Y-%m-%d}</p>
</footer>
<script>
(function () {{
  var root = document.documentElement;
  function setLang(l) {{
    root.dataset.lang = l; root.lang = (l === "en") ? "en" : "zh-Hant";
    try {{ localStorage.setItem("fsl-lang", l); }} catch (e) {{}}
    document.querySelectorAll(".lang").forEach(function (b) {{
      b.classList.toggle("on", b.dataset.set === l);
    }});
  }}
  try {{ setLang(localStorage.getItem("fsl-lang") || "zh"); }} catch (e) {{ setLang("zh"); }}
  document.querySelectorAll(".lang").forEach(function (b) {{
    b.addEventListener("click", function () {{ setLang(b.dataset.set); }});
  }});
  var tg = document.querySelector(".tog");
  try {{ var s = localStorage.getItem("sdl-theme"); if (s) root.dataset.theme = s; }} catch (e) {{}}
  tg.addEventListener("click", function () {{
    var dark = root.dataset.theme === "dark" ||
      (!root.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
    root.dataset.theme = dark ? "light" : "dark";
    try {{ localStorage.setItem("sdl-theme", root.dataset.theme); }} catch (e) {{}}
  }});
  // 數字只在作品集算一次，這裡 fetch 蓋上去；抓不到就留 JSON 裡的值
  var cells = document.querySelectorAll("[data-live]");
  if (cells.length && typeof fetch === "function") {{
    fetch("{up}work/stats.json", {{ cache: "no-cache" }})
      .then(function (r) {{ return r.ok ? r.json() : Promise.reject(0); }})
      .then(function (s) {{
        cells.forEach(function (el) {{
          var k = el.getAttribute("data-live"), v = s[k];
          if (v == null) return;
          el.textContent = (k === "success_rate") ? v + "%" : Number(v).toLocaleString("en-US");
        }});
      }}).catch(function () {{}});
  }}
  var prog = document.getElementById("prog");
  function onScroll() {{
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    prog.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
  }}
  addEventListener("scroll", onScroll, {{ passive: true }});
  addEventListener("resize", onScroll);
  onScroll();

  var burger = document.getElementById("burger"), menu = document.getElementById("menu");
  function setMenu(open) {{
    menu.hidden = !open;
    burger.classList.toggle("on", open);
    burger.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.style.overflow = open ? "hidden" : "";
  }}
  burger.addEventListener("click", function () {{ setMenu(menu.hidden); }});
  menu.addEventListener("click", function (e) {{ if (e.target.closest("a")) setMenu(false); }});
  addEventListener("keydown", function (e) {{ if (e.key === "Escape") setMenu(false); }});

  var chips = document.querySelectorAll(".chip"), rows = document.querySelectorAll(".row");
  chips.forEach(function (c) {{
    c.addEventListener("click", function () {{
      chips.forEach(function (x) {{ x.classList.toggle("on", x === c); }});
      rows.forEach(function (r) {{
        r.hidden = !(c.dataset.cap === "all" ||
                     r.dataset.caps.split(" ").indexOf(c.dataset.cap) >= 0);
      }});
    }});
  }});
}})();
</script>
</body></html>"""


def case_page(w, d, orgs, caps, prev_next, now, featured_all=()):
    org = orgs[w["org"]]
    imgs = ""
    if w.get("images"):
        figs = "".join(
            f'<figure><img src="{esc(im["src"])}" alt="{esc(t(im, "zh"))}" loading="lazy">'
            f'<figcaption>{bi(im)}</figcaption></figure>' for im in w["images"])
        imgs = f'<div class="shots shots-{min(len(w["images"]), 3)}">{figs}</div>'
    # 示意圖可以跟截圖並存：截圖給畫面，示意圖給方法
    kinds = [f["kind"] for f in w.get("figures", [])] or (
        [w["figure"]["kind"]] if w.get("figure") else [])
    caps_f = [f.get("cap") for f in w.get("figures", [])] or [None] * len(kinds)
    for kind, cap in zip(kinds, caps_f):
        imgs += (f'<div class="figwrap">{FIGURES[kind]()}'
                 + (f'<p class="figcap">{esc(cap)}</p>' if cap else "") + "</div>")

    live_big = f' data-live="{w["big"]["live"]}"' if w.get("big", {}).get("live") else ""
    table = ""
    if w.get("table"):
        tb = w["table"]
        head = "".join(f"<th>{esc(h)}</th>" for h in tb["head"])
        body = "".join("<tr>" + "".join(f"<td>{esc(c)}</td>" for c in row) + "</tr>"
                       for row in tb["rows"])
        table = (f'<figure class="doc"><table class="doc-t"><thead><tr>{head}</tr></thead>'
                 f'<tbody>{body}</tbody></table>'
                 f'<figcaption>{bi(tb["caption"])}</figcaption></figure>')

    stats = "".join(
        f'<div class="st"><div class="st-v"'
        + (f' data-live="{s["live"]}"' if s.get("live") else "")
        + f'>{esc(s["v"])}</div>{bi(s, cls="st-l")}</div>'
        for s in w.get("stats", []))

    chain = "".join(
        f'<section class="step{" todo" if c.get("todo") else ""}">'
        f'<h2>{bi(c["k"])}</h2><p>{bi(c["v"])}</p></section>' for c in w.get("chain", []))

    skills = ""
    if w.get("skills"):
        chips = "".join(f'<span class="sk">{esc(s)}</span>' for s in w["skills"])
        skills = ('<div class="skills"><span class="skills-h">'
                  '<span class="zh">用到的技能</span><span class="en">Skills</span></span>'
                  f'{chips}</div>')

    links = ""
    if w.get("links"):
        items = "".join(
            f'<li><a href="{esc(k["href"])}">{bi(k)}</a></li>' for k in w["links"])
        links = ('<div class="links"><p class="links-h">'
                 '<span class="zh">連結</span><span class="en">Links</span></p>'
                 f'<ul>{items}</ul></div>')

    tools = ""
    if w.get("tools"):
        rows_t = "".join(f'<tr><th scope="row">{esc(r["k"])}</th>'
                         f'<td>{esc(r["v"])}</td></tr>' for r in w["tools"])
        tools = ('<div class="tools-b"><p class="tools-h">'
                 '<span class="zh">實際做了什麼</span><span class="en">What I actually did</span>'
                 '</p><table class="tools-t"><tbody>' + rows_t + "</tbody></table></div>")

    cta = ""
    if w.get("cta"):
        cta = (f'<a class="cta" href="{esc(w["cta"]["href"])}">{bi(w["cta"])}</a>')

    tags = "".join(f'<span class="tag">{bi(caps[c])}</span>' for c in w["caps"] if c in caps)
    prev, nxt = prev_next
    nav = []
    if prev:
        nav.append(f'<a class="pn" href="{prev["id"]}.html"><span class="pn-k">←</span>'
                   f'{bi(prev["title"])}</a>')
    if nxt:
        nav.append(f'<a class="pn pn-r" href="{nxt["id"]}.html">{bi(nxt["title"])}'
                   f'<span class="pn-k">→</span></a>')

    body = f"""
<main class="wrap case">
  <a class="back" href="../index.html"><span class="zh">← 回所有案例</span><span class="en">← All cases</span></a>
  <p class="kicker">{bi(w["kicker"])}<span class="kdot">·</span>{esc(org["period"])}</p>
  <h1>{bi(w["title"])}</h1>
  <p class="lead">{bi(w["result"])}</p>
  {skills}
  <div class="bignum"><span class="bn-v"{live_big}>{esc(w["big"]["v"])}</span>{bi(w["big"], cls="bn-l")}</div>
  {imgs}
  {table}
  <div class="sts">{stats}</div>
  <div class="chain">{chain}</div>
  {tools}
  {cta}
  {links}
  <div class="tags">{tags}</div>
  <nav class="pns">{''.join(nav)}</nav>
</main>"""
    return shell(title=f'案例｜{t(w["title"], "zh")}',
                 desc=t(w["result"], "zh"), body=body, depth=1, now=now, cases=featured_all)


def home(d, orgs, caps, featured, rest, now):
    nums = "".join(
        f'<div class="hn"><span class="hn-v">{esc(h["value"])}</span>{bi(h, cls="hn-l")}'
        f'{bi(h["note"], cls="hn-n")}</div>' for h in d["headline"])

    cards = []
    for i, w in enumerate(featured):
        org = orgs[w["org"]]
        thumb = ""
        if w.get("images"):
            thumb = (f'<div class="fc-img"><img src="{esc(w["images"][0]["src"][3:])}" '
                     f'alt="{esc(t(w["title"], "zh"))}" loading="lazy"></div>')
        elif w.get("figure"):
            thumb = f'<div class="fc-img fc-fig">{FIGURES[w["figure"]["kind"]]()}</div>'
        cards.append(f"""
      <a class="fc{' fc-flip' if i % 2 else ''}" href="case/{esc(w["id"])}.html">
        {thumb}
        <div class="fc-t">
          <p class="kicker">{bi(w["kicker"])}</p>
          <h3>{bi(w["title"])}</h3>
          <p class="fc-big"><b>{esc(w["big"]["v"])}</b>{bi(w["big"], cls="fc-big-l")}</p>
          <p class="fc-r">{bi(w["result"])}</p>
          <p class="fc-sk">{" · ".join(esc(s) for s in w.get("skills", [])[:4])}</p>
          <span class="fc-go"><span class="zh">看這個案例 →</span><span class="en">Read the case →</span></span>
        </div>
      </a>""")

    chips = ['<button class="chip on" data-cap="all"><span class="zh">全部</span>'
             f'<span class="en">All</span><i>{len(rest)}</i></button>']
    for c in d["caps"]:
        n = sum(1 for w in rest if c["id"] in w["caps"])
        if n:
            chips.append(f'<button class="chip" data-cap="{c["id"]}">{bi(c)}<i>{n}</i></button>')

    rows = "".join(
        f'<div class="row" data-caps="{" ".join(w["caps"])}">'
        f'<div class="row-m">{bi(w["title"], cls="row-t")}'
        f'<span class="row-o">{bi(orgs[w["org"]])}</span></div>'
        f'<p class="row-r">{bi(w["result"])}</p>'
        + (('<p class="row-sk">' + " · ".join(esc(s) for s in w["skills"]) + "</p>")
           if w.get("skills") else "")
        + (('<p class="row-l">' + " · ".join(
            f'<a href="{esc(k["href"].replace("../", ""))}">{t(k, "zh")}</a>'
            for k in w["links"]) + "</p>") if w.get("links") else "")
        + "</div>" for w in rest)

    def org_link(o):
        inner = bi(o)
        return f'<a href="{esc(o["url"])}" class="tl-a">{inner}</a>' if o.get("url") else inner

    tl = "".join(
        f'<li{" class=now" if o.get("current") else ""}>'
        f'<span class="tl-p">{esc(o["period"])}</span>'
        f'<span class="tl-o">{org_link(o)}</span>{bi(o["role"], cls="tl-r")}'
        f'{bi(o["note"], cls="tl-n")}</li>' for o in d["orgs"])

    ap = "".join(f'<div class="ap"><h3>{bi(a)}</h3><p>{bi(a["body"])}</p></div>'
                 for a in d["approach"])

    # 技能總覽：把每件作品的 skills 收攏去重，照出現次數排。
    # 不另外維護一份清單，才不會跟案例頁對不起來。
    tally = {}
    for x in d["work"]:
        for s in x.get("skills", []):
            tally[s] = tally.get(s, 0) + 1
    rows_sk = []
    for zh, en, items in SKILL_GROUPS:
        have = sorted((s for s in items if s in tally), key=lambda s: (-tally[s], s))
        if not have:
            continue
        chips_sk = "".join(
            f'<span class="sk2">{esc(s)}'
            + (f'<i>{tally[s]}</i>' if tally[s] > 1 else "") + "</span>" for s in have)
        rows_sk.append(f'<div class="skg"><h3><span class="zh">{zh}</span>'
                       f'<span class="en">{en}</span></h3>'
                       f'<div class="sks">{chips_sk}</div></div>')
    skill_all = "".join(rows_sk)
    missing = sorted(set(tally) - {s for _, _, xs in SKILL_GROUPS for s in xs})
    assert not missing, f"技能沒分組：{missing}"
    c = d["contact"]

    body = f"""
<main class="wrap">
  <section class="hero">
    <h1>{bi(d["tagline"])}</h1>
    <p class="sub">{bi(d["sub"])}</p>
    <div class="btns">
      <a class="btn" href="work/"><span class="zh">分析作品集（八份）→</span><span class="en">Analysis portfolio →</span></a>
      <a class="btn ghost" href="https://afortunadofu-bot.github.io/celinefubrandpage/">小數據所 →</a>
    </div>
    <div class="hns">{nums}</div>
  </section>

  <section class="blk">
    <div class="bh"><h2><span class="zh">精選案例</span><span class="en">Selected cases</span></h2>
      <p class="bn"><span class="zh">{len(featured)} 件寫完整的：遇到什麼問題、當初怎麼拆、最後怎麼解、結果是什麼。</span>
        <span class="en">{len(featured)} written in full: the problem, how I broke it down, what I did, what came out.</span></p></div>
    <div class="fcs">{''.join(cards)}</div>
  </section>

  <section class="blk cta-blk">
    <div><h2><span class="zh">自己做的產品與分析</span><span class="en">Own products &amp; analysis</span></h2>
      <p><span class="zh">三個自己上架的產品，加八份把它們算清楚的分析：SQL、機器學習、空間分群都在裡面，數字是即時抓的。</span>
         <span class="en">Three shipped products and eight analyses — SQL, machine learning and spatial clustering. The numbers are live.</span></p></div>
    <div class="btns">
      <a class="btn" href="work/"><span class="zh">分析作品集（八份）→</span><span class="en">Analysis portfolio →</span></a>
      <a class="btn ghost" href="https://afortunadofu-bot.github.io/celinefubrandpage/">小數據所 →</a>
    </div>
  </section>

  <section class="blk" id="rest">
    <div class="bh"><h2><span class="zh">其他做過的事</span><span class="en">Everything else</span></h2>
      <p class="bn"><span class="zh">{len(rest)} 件，按能力篩。</span>
        <span class="en">{len(rest)} more, filtered by capability.</span></p></div>
    <div class="chips">{''.join(chips)}</div>
    <div class="rows">{rows}</div>
  </section>

  <section class="blk" id="where">
    <div class="bh"><h2><span class="zh">待過的地方</span><span class="en">Where</span></h2></div>
    <ol class="tl">{tl}</ol>
  </section>

  <section class="blk" id="skills">
    <div class="bh"><h2><span class="zh">技能</span><span class="en">Skills</span></h2>
      <p class="bn"><span class="zh">數字是這個詞出現在幾件作品裡。</span>
        <span class="en">The number is how many pieces each one appears in.</span></p></div>
    {skill_all}
  </section>

  <section class="blk" id="think">
    <div class="bh"><h2><span class="zh">怎麼想事情</span><span class="en">How I think</span></h2></div>
    <div class="aps">{ap}</div>
  </section>

  <section class="blk" id="contact">
    <div class="bh"><h2><span class="zh">聯絡</span><span class="en">Contact</span></h2></div>
    <dl class="cl">
      <dt>Email</dt><dd><a href="mailto:{esc(c["email"])}">{esc(c["email"])}</a></dd>
      <dt><span class="zh">電話 / LINE</span><span class="en">Phone</span></dt>
      <dd><a href="tel:{esc(c["phone"].replace("-", ""))}">{esc(c["phone"])}</a></dd>
      <dt><span class="zh">地點</span><span class="en">Location</span></dt><dd>{bi(c["location"])}</dd>
    </dl>
  </section>
</main>"""
    return shell(title="傅聖嵐｜專案交付與資料分析", desc=t(d["tagline"], "zh"),
                 body=body, depth=0, now=now, cases=featured)


CSS = """
:root{
  color-scheme:light;
  --page:#faf9f6; --card:#fff; --ink:#15140f; --ink-2:#4a4740; --muted:#8a867c;
  --line:#e6e3da; --rule:#d8d4c8; --accent:#8a5a2b; --good:#2f7d32;
  --serif:"Noto Serif TC",Georgia,"Times New Roman",serif;
  --sans:system-ui,-apple-system,"Segoe UI","Noto Sans TC",sans-serif;
}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme=light])){
  color-scheme:dark;
  --page:#141311; --card:#1b1a17; --ink:#f0ede5; --ink-2:#c5c0b4; --muted:#8e8a7f;
  --line:#2b2924; --rule:#3a372f; --accent:#d4a35e;
}}
:root[data-theme=dark]{
  color-scheme:dark;
  --page:#141311; --card:#1b1a17; --ink:#f0ede5; --ink-2:#c5c0b4; --muted:#8e8a7f;
  --line:#2b2924; --rule:#3a372f; --accent:#d4a35e;
}
:root[data-lang=zh] .en,:root[data-lang=en] .zh{display:none}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--ink);font:16px/1.85 var(--sans);
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.wrap{max-width:940px;margin:0 auto;padding:0 24px}
a{color:inherit}
.prog{position:fixed;top:0;left:0;height:2px;width:0;background:var(--accent);z-index:20;
  transition:width .08s linear}
.burger{background:none;border:0;padding:8px 2px 8px 10px;cursor:pointer;display:flex;
  flex-direction:column;gap:5px;margin-left:4px}
.burger span{display:block;width:18px;height:1.5px;background:var(--ink-2);transition:transform .2s}
.burger.on span:first-child{transform:translateY(3.2px) rotate(45deg)}
.burger.on span:last-child{transform:translateY(-3.2px) rotate(-45deg)}
.menu{position:fixed;inset:49px 0 0;background:var(--page);z-index:19;overflow:auto}
.menu-in{display:grid;grid-template-columns:1.3fr 1fr;gap:48px;padding-top:54px;padding-bottom:54px}
.menu-h{font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);
  margin:0 0 18px;font-weight:600}
.menu-cases{list-style:none;counter-reset:mc;margin:0;padding:0}
.menu-cases li{border-top:1px solid var(--line)}
.menu-cases a{display:block;padding:15px 0;text-decoration:none;font-family:var(--serif);
  font-weight:700;font-size:19px;line-height:1.4}
.menu-cases a::before{counter-increment:mc;content:counter(mc,decimal-leading-zero);
  font-family:var(--sans);font-weight:400;font-size:12px;color:var(--muted);margin-right:14px;
  font-variant-numeric:tabular-nums}
.menu-cases a:hover{color:var(--accent)}
.menu-list{list-style:none;margin:0;padding:0}
.menu-list li{border-top:1px solid var(--line)}
.menu-list a{display:block;padding:12px 0;text-decoration:none;font-size:15px;color:var(--ink-2)}
.menu-list a:hover{color:var(--ink)}
@media (max-width:760px){.menu-in{grid-template-columns:1fr;gap:34px}}
.bar{position:sticky;top:0;z-index:18;background:color-mix(in srgb,var(--page) 88%,transparent);
  backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.bar-in{display:flex;align-items:center;justify-content:space-between;padding:13px 24px}
.bname{font-family:var(--serif);font-weight:700;letter-spacing:.02em;text-decoration:none;font-size:15px}
.bar-r{display:flex;align-items:center;gap:5px}
.lang,.tog{background:none;border:0;color:var(--muted);font:inherit;font-size:13px;cursor:pointer;padding:3px 5px}
.lang.on{color:var(--ink);font-weight:600}
.sep{color:var(--rule)}
.tog{font-size:15px;margin-left:5px}
h1,h2,h3{font-family:var(--serif);font-weight:700;letter-spacing:-.01em}
.hero{padding:86px 0 24px}
.hero h1{font-size:clamp(30px,4.6vw,50px);line-height:1.34;margin:0 0 22px;max-width:15em}
.sub{color:var(--ink-2);font-size:16.5px;max-width:40em;margin:0 0 42px}
.hns{display:flex;flex-wrap:wrap;gap:36px 52px;max-width:none;padding-bottom:10px}
.hn{min-width:132px}
.hn-v{display:block;font-family:var(--serif);font-size:34px;line-height:1.1;letter-spacing:-.02em}
.hn-l{display:block;font-size:13.5px;color:var(--ink-2);margin-top:3px}
.hn-n{display:block;font-size:12.5px;color:var(--muted)}
.blk{padding:64px 0 0;margin-top:64px;border-top:1px solid var(--line)}
.bh{margin-bottom:34px}
.bh h2{font-size:25px;margin:0 0 8px}
.bn{color:var(--muted);font-size:14px;margin:0;max-width:44em}
.fcs{display:grid;gap:34px}
.fc{display:grid;grid-template-columns:300px 1fr;gap:30px;align-items:center;
  text-decoration:none;background:var(--card);border:1px solid var(--line);
  border-radius:3px;padding:26px;transition:border-color .18s}
.fc:hover{border-color:var(--rule)}
.fc-flip .fc-img{order:2}
.fc-img img{width:100%;height:190px;object-fit:cover;object-position:top;
  border-radius:2px;display:block;background:var(--page)}
.fc-fig{display:flex;align-items:center}
.fc-fig .fig{width:100%;height:auto}
.kicker{font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);
  margin:0 0 10px;font-weight:600}
.kdot{margin:0 7px;color:var(--rule)}
.fc h3{font-size:21px;margin:0 0 12px;line-height:1.4}
.fc-big{margin:0 0 10px;display:flex;align-items:baseline;gap:9px;flex-wrap:wrap}
.fc-big b{font-family:var(--serif);font-size:27px;font-weight:700;letter-spacing:-.02em}
.fc-big-l{font-size:13px;color:var(--muted)}
.fc-r{margin:0 0 14px;color:var(--ink-2);font-size:15px}
.fc-go{font-size:13.5px;color:var(--accent)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}
.chip{background:none;border:1px solid var(--line);border-radius:2px;padding:5px 12px;
  font:inherit;font-size:13px;color:var(--ink-2);cursor:pointer;display:inline-flex;gap:7px}
.chip:hover{border-color:var(--rule)}
.chip.on{background:var(--ink);color:var(--page);border-color:var(--ink)}
.chip i{font-style:normal;font-size:11px;opacity:.55}
.rows{margin-top:14px}
.row{padding:17px 0;border-top:1px solid var(--line)}
.row[hidden]{display:none}
.row-m{display:flex;justify-content:space-between;gap:16px;align-items:baseline;flex-wrap:wrap}
.row-t{font-weight:600;font-size:15.5px}
.row-o{font-size:12.5px;color:var(--muted);white-space:nowrap}
.row-r{margin:5px 0 0;color:var(--ink-2);font-size:14.5px;max-width:52em}
.tl{list-style:none;margin:0;padding:0}
.tl li{display:grid;grid-template-columns:140px 1fr;gap:3px 22px;padding:16px 0;border-top:1px solid var(--line)}
.tl li:first-child{border-top:0}
.tl-p{color:var(--muted);font-size:13px;font-variant-numeric:tabular-nums}
.tl-o{font-family:var(--serif);font-weight:700;font-size:16px}
.tl-r{grid-column:2;color:var(--ink-2);font-size:14px}
.tl-n{grid-column:2;color:var(--muted);font-size:12.5px}
.tl li.now .tl-o::after{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;
  background:var(--good);margin-left:8px;vertical-align:middle}
.aps{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:26px}
.ap h3{font-size:16px;margin:0 0 7px}
.ap p{margin:0;color:var(--ink-2);font-size:14.5px}
.tl-a{color:inherit;text-decoration:none;border-bottom:1px solid var(--line)}
.tl-a:hover{border-bottom-color:var(--accent)}
.cta-blk{display:flex;justify-content:space-between;gap:26px;flex-wrap:wrap;align-items:flex-end}
.cta-blk h2{font-size:25px;margin:0 0 8px}
.cta-blk p{margin:0;color:var(--ink-2);max-width:33em}
.btns{display:flex;gap:10px;flex-wrap:wrap;margin:22px 0 0}
.hero .btns{margin:26px 0 30px}
.btn{display:inline-block;padding:13px 26px;background:var(--ink);color:var(--page);
  text-decoration:none;font-size:14px;border-radius:2px}
.btn.ghost{background:none;color:var(--ink-2);border:1px solid var(--line)}
.cta-blk{padding:26px;border:1px solid var(--line);border-radius:3px;background:var(--card)}
.cta-blk .btns{margin:18px 0 0}
.cl{display:grid;grid-template-columns:auto 1fr;gap:9px 24px;margin:0;font-size:15.5px}
.cl dt{color:var(--muted);font-size:13px;padding-top:3px}
.cl dd{margin:0}
.cl a{text-decoration:none;border-bottom:1px solid var(--line)}
/* ── 案例頁 ── */
.case{padding:40px 0 0;max-width:780px}
.back{display:inline-block;margin-bottom:30px;font-size:13.5px;color:var(--muted);text-decoration:none}
.back:hover{color:var(--ink)}
.case h1{font-size:clamp(28px,4.4vw,42px);line-height:1.32;margin:0 0 18px;max-width:17em}
.lead{font-size:18px;color:var(--ink-2);margin:0 0 34px;max-width:36em}
.bignum{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;padding:22px 0;
  border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin-bottom:38px}
.bn-v{font-family:var(--serif);font-size:clamp(34px,6vw,54px);line-height:1;letter-spacing:-.03em}
.bn-l{color:var(--muted);font-size:14px}
.shots{display:grid;gap:14px;margin:0 0 38px;justify-items:start}
.shots-1{grid-template-columns:minmax(0,620px)}
.shots-2{grid-template-columns:repeat(2,minmax(0,480px))}
.shots-3{grid-template-columns:repeat(2,minmax(0,480px))}
.shots figure{margin:0}
.shots img{width:100%;max-width:100%;border:1px solid var(--line);border-radius:2px;display:block}
.shots figcaption{font-size:12px;color:var(--muted);margin-top:7px}
.doc{margin:0 0 38px;padding:0;overflow-x:auto}
.doc-t{width:100%;border-collapse:collapse;font-size:13.5px;
  font-variant-numeric:tabular-nums;background:var(--card);border:1px solid var(--line)}
.doc-t th,.doc-t td{padding:7px 12px;border-bottom:1px solid var(--line);text-align:left}
.doc-t thead th{font-size:11.5px;letter-spacing:.06em;color:var(--muted);font-weight:600;
  background:var(--page)}
.doc-t td:first-child,.doc-t td:nth-child(3),.doc-t td:nth-child(4){color:var(--muted);width:1%;
  white-space:nowrap}
.doc-t td:nth-last-child(-n+2){color:var(--rule);letter-spacing:.14em;width:1%;white-space:nowrap}
.doc figcaption{font-size:12px;color:var(--muted);margin-top:9px;line-height:1.7}
.tools-b{margin:0 0 38px}
.tools-h{font-size:11.5px;letter-spacing:.1em;color:var(--muted);margin:0 0 10px;font-weight:600}
.tools-t{width:100%;border-collapse:collapse;font-size:14px;background:var(--card);
  border:1px solid var(--line)}
.tools-t th,.tools-t td{padding:10px 14px;border-bottom:1px solid var(--line);
  text-align:left;vertical-align:top}
.tools-t tr:last-child th,.tools-t tr:last-child td{border-bottom:0}
.tools-t th{width:118px;white-space:nowrap;font-weight:600;color:var(--accent-ink,var(--ink));
  font-size:13px}
.tools-t td{color:var(--ink-2);line-height:1.75}
@media(max-width:600px){.tools-t th,.tools-t td{display:block;width:auto}
  .tools-t th{border-bottom:0;padding-bottom:2px}}
.figcap{font-size:12px;color:var(--muted);margin:14px 0 0;line-height:1.7}
.figwrap{margin:0 0 38px;padding:20px;border:1px solid var(--line);border-radius:2px;background:var(--card)}
.fig{width:100%;height:auto;display:block}
.fig text{font:13px var(--sans);fill:var(--ink)}
.fig .f-h{font-size:13.5px;font-weight:600}
.fig .f-n{font-size:11.5px;fill:var(--muted)}
.fig .f-on{fill:var(--accent)}
.fig .f-bar{fill:var(--rule)}
.fig .f-bar-on{fill:var(--accent)}
.fig .f-rule{stroke:var(--line);stroke-width:1}
.sts{display:flex;flex-wrap:wrap;gap:30px 48px;margin:0 0 42px}
.st-v{font-family:var(--serif);font-size:24px;line-height:1.2}
.st-l{display:block;font-size:12.5px;color:var(--muted);margin-top:2px;max-width:17em}
.chain{counter-reset:step}
.step{padding:0 0 30px}
.step h2{font-size:14px;letter-spacing:.06em;color:var(--accent);margin:0 0 8px;
  font-family:var(--sans);font-weight:600}
.step h2::before{counter-increment:step;content:counter(step,decimal-leading-zero) "　";
  color:var(--rule);font-variant-numeric:tabular-nums}
.step p{margin:0;font-size:16.5px;line-height:1.95;color:var(--ink-2);max-width:38em}
.step.todo p{color:var(--muted);border-left:2px solid var(--rule);padding-left:14px}
.skills{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin:0 0 34px}
.skills-h{font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);
  margin-right:6px;font-weight:600}
.sk{font-size:12.5px;padding:3px 11px;border:1px solid var(--rule);border-radius:2px;
  color:var(--ink);background:var(--card)}
.skg{display:grid;grid-template-columns:168px 1fr;gap:18px;padding:16px 0;
  border-top:1px solid var(--line)}
.skg:first-child{border-top:0;padding-top:4px}
.skg h3{margin:2px 0 0;font-size:13px;font-weight:600;color:var(--muted);letter-spacing:.02em}
.sks{display:flex;flex-wrap:wrap;gap:8px}
@media(max-width:640px){.skg{grid-template-columns:1fr;gap:10px}}
.sk2{font-size:13px;padding:4px 12px;border:1px solid var(--line);border-radius:2px;
  color:var(--ink);background:var(--card);display:inline-flex;gap:7px;align-items:center}
.sk2 i{font-style:normal;font-size:11px;color:var(--accent);font-variant-numeric:tabular-nums}
.fc-sk{margin:0 0 12px;font-size:12px;color:var(--muted);letter-spacing:.02em}
.links{margin:0 0 30px;padding:20px 0 0;border-top:1px solid var(--line)}
.links-h{font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);
  margin:0 0 10px;font-weight:600}
.links ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px 20px}
.links a{font-size:14px;color:var(--ink);text-decoration:none;border-bottom:1px solid var(--rule)}
.links a:hover{border-color:var(--accent);color:var(--accent)}
.links a::after{content:" ↗";color:var(--muted);font-size:11px}
.row-sk{margin:7px 0 0;font-size:12px;color:var(--muted);letter-spacing:.02em}
.row-l{margin:6px 0 0;font-size:13px}
.row-l a{color:var(--accent);text-decoration:none;border-bottom:1px solid transparent}
.row-l a:hover{border-color:var(--accent)}
.cta{display:inline-block;margin:6px 0 34px;padding:11px 22px;border:1px solid var(--ink);
  text-decoration:none;font-size:14px;border-radius:2px}
.cta:hover{background:var(--ink);color:var(--page)}
.tags{display:flex;flex-wrap:wrap;gap:7px;padding-top:28px;border-top:1px solid var(--line)}
.tag{font-size:11.5px;color:var(--muted);border:1px solid var(--line);padding:2px 9px;border-radius:2px}
.pns{display:flex;justify-content:space-between;gap:20px;margin:40px 0 0;padding-top:26px;
  border-top:1px solid var(--line)}
.pn{text-decoration:none;color:var(--ink-2);font-size:14px;max-width:46%}
.pn:hover{color:var(--ink)}
.pn-r{text-align:right;margin-left:auto}
.pn-k{color:var(--muted);margin:0 8px}
.foot{padding:64px 0 56px;margin-top:64px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
.foot-links{margin:0 0 6px}
.foot-links a{text-decoration:none}
.foot-note{margin:0;font-size:12px}
@media (max-width:760px){
  .fc{grid-template-columns:1fr;gap:18px}
  .fc-flip .fc-img{order:0}
  .fc-img img{height:150px}
  .shots-3,.shots-2,.shots-1{grid-template-columns:minmax(0,100%)}
  .tl li{grid-template-columns:1fr}
  .tl-r,.tl-n{grid-column:1}
  .hero{padding:56px 0 16px}
  .hns{gap:26px 36px}
}
"""


SKILL_GROUPS = [('資料與分析', 'Data & analytics', ['SQL', 'Python', 'scikit-learn', 'ETL', '資料分析', '資料庫設計', '資料視覺化', 'API 串接 (REST)', '指標設計 (KPI)', '機器學習', '自然語言處理 (NLP)', '特徵工程', '模型評估', '分群分析 (Clustering)', '空間資料分析', '演算法效能優化', '自動化流程', '資料去識別化', '商業分析 (BA)', 'PostgreSQL', '網路爬蟲', '地理編碼 (Geocoding)', 'Google Analytics (GA4)']),
                ('專案與交付', 'Delivery', ['專案管理', '風險管理', '利害關係人管理', '跨部門協作', '系統整合', '時程管控', '人力資源規劃', '工時分析', '試算模型']),
                ('採購、成本與財務', 'Sourcing & finance', ['採購發包', '供應商管理', '議價談判', '合約管理', '標單審查', '專案成本控管', '成本分析', '成本談判', '現金流管理', '財務分析', '財務模型', '管理報表', '情境模擬', 'Excel 建模']),
                ('商業與產品', 'Business & product', ['商業開發', '市場進入策略 (GTM)', '投資人關係 (IR)', '募資簡報', 'CRM 系統設計', '銷售漏斗分析', '轉換率分析', '市場區隔分析', '受眾分析', '競品與市場研究', '使用者研究', '問卷設計', '產品定位', '活動企劃', '贊助提案', 'SEO']),
                ('法規與公部門', 'Compliance & public sector', ['法規遵循', '公部門標案', '投標文件撰寫 (RFP)', '政府機關溝通', '技術文件審查', '跨境法規研究', '個資合規']),
                ('文件與溝通', 'Writing & communication', ['技術文件撰寫', '商業簡報', '簡報設計', '財務敘事', '決策支援報告']),
                ('工具與軟體', 'Tools', ['Excel', 'Android 開發', 'Kotlin', 'Jetpack Compose', 'Firebase', '產品上架', 'Capacitor', 'Google Play Console', 'JavaScript', 'OpenStreetMap', '生成式 AI 工具應用']),
                ('後端與雲端', 'Backend & cloud', ['Supabase', 'Cloudflare Workers', 'Cloudflare D1', '資料權限設計 (RLS)', 'CI/CD', '自動化測試'])]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="產到 celine.fu/（換掉正式版）")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    d = json.loads(DATA.read_text(encoding="utf-8"))
    now = datetime.now(TPE)
    orgs = {o["id"]: o for o in d["orgs"]}
    caps = {c["id"]: c for c in d["caps"]}

    featured = sorted((w for w in d["work"] if w.get("featured")),
                      key=lambda w: w["featured"])
    rest = [w for w in d["work"] if not w.get("featured")]

    root = SITE if args.live else SITE / "draft"
    (root / "case").mkdir(parents=True, exist_ok=True)
    (root / "index.html").write_text(home(d, orgs, caps, featured, rest, now), encoding="utf-8")
    for i, w in enumerate(featured):
        pn = (featured[i - 1] if i else None,
              featured[i + 1] if i + 1 < len(featured) else None)
        (root / "case" / f'{w["id"]}.html').write_text(
            case_page(w, d, orgs, caps, pn, now, featured), encoding="utf-8")
    where = "celine.fu/" if args.live else "celine.fu/draft/"
    print(f"寫好 {where}index.html 與 {len(featured)} 個案例頁（其餘 {len(rest)} 件在索引）")


if __name__ == "__main__":
    main()
