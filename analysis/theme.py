#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""作品集站的共用外殼：CSS、頁首頁尾、導覽、幾個反覆用到的小元件。

所有頁面（首頁、三個案例、SQL 報告）都從這裡拿版型，所以改一次全站一起變。
顏色全部走 CSS 變數，深色模式只是換一組變數，沒有第二套樣式表。
"""

import html

SITE = "小數據所｜產品分析作品集"
NAV = [
    ("index.html", "首頁"),
    ("birthday-deals.html", "壽星日"),
    ("bandary.html", "Bandary"),
    ("relatestats.html", "RelateStats"),
    ("sql-report.html", "SQL 報告"),
]


def esc(s):
    return html.escape(str(s if s is not None else ""))


def stat(label, value, sub=None, tone=""):
    t = f' data-tone="{tone}"' if tone else ""
    s = f'<div class="stat-sub">{esc(sub)}</div>' if sub else ""
    return (f'<div class="stat"{t}><div class="stat-label">{esc(label)}</div>'
            f'<div class="stat-value">{value}</div>{s}</div>')


def stats(items):
    return f'<div class="stats">{"".join(items)}</div>'


def pending(text):
    """「這個數字我還沒有」的明示標記。寧可讓它在頁面上顯眼，也不要塞一個編出來的數字。"""
    return f'<span class="pending">待補：{esc(text)}</span>'


def card(title, body, no=None, anchor=None):
    a = f' id="{esc(anchor)}"' if anchor else ""
    n = f'<div class="qno">{esc(no)}</div>' if no else ""
    h = f"<h2>{esc(title)}</h2>" if title else ""
    return f'<section class="card"{a}>{n}{h}{body}</section>'


def case_card(href, name, one_line, bullets, status):
    lis = "".join(f"<li>{b}</li>" for b in bullets)
    return (f'<a class="case" href="{esc(href)}">'
            f'<div class="case-head"><span class="case-name">{esc(name)}</span>'
            f'<span class="case-status">{esc(status)}</span></div>'
            f'<p class="case-line">{esc(one_line)}</p>'
            f'<ul class="case-points">{lis}</ul>'
            f'<span class="case-go">看這個案例 →</span></a>')


def metric_table(rows):
    """指標表：指標／怎麼定義／現在多少。現在沒有的就放 pending()。"""
    body = "".join(
        f'<tr><th scope="row">{esc(n)}</th><td>{esc(d)}</td><td>{v}</td></tr>'
        for n, d, v in rows)
    return ('<table class="metrics"><thead><tr><th>指標</th><th>怎麼算</th>'
            f'<th>現況</th></tr></thead><tbody>{body}</tbody></table>')


def timeline(rows):
    """決策紀錄：版本／做了什麼／為什麼／看什麼數字判斷。"""
    body = "".join(
        f'<li><div class="tl-head"><span class="tl-ver">{esc(v)}</span>'
        f'<span class="tl-what">{esc(w)}</span></div>'
        f'<p class="tl-why">{why}</p></li>' for v, w, why in rows)
    return f'<ol class="timeline">{body}</ol>'


def page(*, filename, title, lead, meta, body, desc=""):
    def nav_item(href, text):
        on = ' class="on"' if href == filename else ""
        return f'<a href="{esc(href)}"{on}>{esc(text)}</a>'

    nav = "".join(nav_item(h, t) for h, t in NAV)
    return f"""<!doctype html>
<html lang="zh-Hant"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc or lead)}">
<style>{CSS}</style>
</head>
<body>
<header class="top">
  <div class="wrap">
    <a class="brand" href="index.html">小數據所</a>
    <h1>{esc(title)}</h1>
    <p class="sub">{lead}</p>
    <p class="byline">{meta}</p>
    <nav class="jump">{nav}</nav>
    <button class="theme" type="button" aria-label="切換深淺色">◐</button>
  </div>
</header>
<main class="wrap">
{body}
</main>
<footer class="wrap foot-note">
  <p>{esc(SITE)}　·　內容與圖表由 <code>analysis/</code> 的 Python 產生，
     資料換一版重跑就會更新。</p>
</footer>
<script>
(function () {{
  var btn = document.querySelector('.theme'), root = document.documentElement;
  try {{ var s = localStorage.getItem('sdl-theme'); if (s) root.dataset.theme = s; }} catch (e) {{}}
  btn.addEventListener('click', function () {{
    var dark = root.dataset.theme === 'dark' ||
      (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = dark ? 'light' : 'dark';
    try {{ localStorage.setItem('sdl-theme', root.dataset.theme); }} catch (e) {{}}
  }});
}})();
</script>
</body></html>"""


CSS = """
:root{
  color-scheme: light;
  --page:#f9f9f7; --surface:#fcfcfb; --card:#ffffff;
  --ink:#0b0b0b; --ink-2:#52514e; --muted:#898781;
  --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,.10);
  --series-1:#2a78d6; --series-dim:#9ec5f4;
  --good:#0ca30c; --warning:#fab219; --critical:#d03b3b;
}
@media (prefers-color-scheme: dark){
  :root:where(:not([data-theme=light])){
    color-scheme: dark;
    --page:#0d0d0d; --surface:#1a1a19; --card:#1a1a19;
    --ink:#f0efec; --ink-2:#c3c2b7; --muted:#898781;
    --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10);
    --series-1:#3987e5; --series-dim:#1c5cab;
  }
}
:root[data-theme=dark]{
  color-scheme: dark;
  --page:#0d0d0d; --surface:#1a1a19; --card:#1a1a19;
  --ink:#f0efec; --ink-2:#c3c2b7; --muted:#898781;
  --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10);
  --series-1:#3987e5; --series-dim:#1c5cab;
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--page); color:var(--ink);
  font:15px/1.7 system-ui,-apple-system,"Segoe UI","Noto Sans TC","Microsoft JhengHei",sans-serif;
  -webkit-font-smoothing:antialiased;
}
.wrap{max-width:880px; margin:0 auto; padding:0 16px}
.top{padding:34px 0 8px; position:relative}
.brand{
  display:inline-block; font-size:13px; letter-spacing:.06em; color:var(--muted);
  text-decoration:none; margin-bottom:10px;
}
.brand:hover{color:var(--ink-2)}
.top h1{font-size:30px; line-height:1.25; margin:0 0 8px; letter-spacing:-.01em}
.sub{margin:0 0 12px; color:var(--ink-2); font-size:17px}
.byline{margin:0; color:var(--muted); font-size:13px}
.jump{display:flex; flex-wrap:wrap; gap:6px; margin:18px 0 0}
.jump a{
  font-size:13px; color:var(--ink-2); text-decoration:none;
  border:1px solid var(--border); border-radius:999px; padding:3px 11px;
}
.jump a:hover{color:var(--ink); border-color:var(--axis)}
.jump a.on{color:var(--card); background:var(--ink); border-color:var(--ink)}
.theme{
  position:absolute; top:34px; right:16px; width:34px; height:34px;
  border-radius:999px; border:1px solid var(--border); background:var(--card);
  color:var(--ink-2); font-size:15px; cursor:pointer;
}
main{padding:20px 0 40px}
.card{
  background:var(--card); border:1px solid var(--border); border-radius:14px;
  padding:26px 26px 20px; margin:16px 0;
}
.card.intro{color:var(--ink-2)}
.card p{margin:0 0 12px}
.card p:last-child{margin-bottom:8px}
.qno{font-size:12px; font-weight:600; letter-spacing:.08em; color:var(--series-1); margin-bottom:6px}
.card h2{font-size:21px; line-height:1.35; margin:0 0 12px; letter-spacing:-.01em}
.card h3{font-size:16px; margin:22px 0 8px}
.answer{margin:0 0 18px; color:var(--ink-2)}
.answer b{color:var(--ink)}
.caption{margin:22px 0 6px; font-size:13px; color:var(--muted)}
.note{margin:12px 0 0; font-size:13px; color:var(--muted)}
.lede{font-size:17px; color:var(--ink-2)}
.hero{display:flex; gap:18px; align-items:baseline; flex-wrap:wrap; margin:4px 0 22px}
.hero-num{font-size:50px; font-weight:650; line-height:1; letter-spacing:-.02em}
.hero-lbl{flex:1 1 280px; color:var(--ink-2); font-size:14px}
.stats{display:grid; grid-template-columns:repeat(auto-fit,minmax(168px,1fr)); gap:12px; margin:14px 0}
.stat{border:1px solid var(--border); border-radius:10px; padding:12px 14px}
.stat-label{font-size:12px; color:var(--muted)}
.stat-value{font-size:24px; font-weight:620; line-height:1.3; margin:2px 0}
.stat-sub{font-size:12px; color:var(--ink-2)}
.stat[data-tone=warn] .stat-value{color:var(--critical)}
.stat[data-tone=good] .stat-value{color:var(--good)}
.pending{
  display:inline-block; font-size:12px; padding:1px 9px; border-radius:999px;
  border:1px dashed var(--axis); color:var(--muted); white-space:nowrap;
}
.case{
  display:block; text-decoration:none; color:inherit;
  background:var(--card); border:1px solid var(--border); border-radius:14px;
  padding:20px 22px 16px; margin:12px 0;
}
.case:hover{border-color:var(--axis)}
.case-head{display:flex; align-items:baseline; gap:10px; flex-wrap:wrap}
.case-name{font-size:19px; font-weight:620}
.case-status{font-size:12px; color:var(--muted)}
.case-line{margin:6px 0 10px; color:var(--ink-2)}
.case-points{margin:0 0 12px; padding-left:20px; color:var(--ink-2); font-size:14px}
.case-points li{margin-bottom:4px}
.case-go{font-size:13px; color:var(--series-1)}
table{border-collapse:collapse; width:100%; font-size:13px; margin:6px 0 2px}
th,td{text-align:left; padding:6px 9px; border-bottom:1px solid var(--border); vertical-align:top}
thead th{color:var(--muted); font-weight:600; font-size:12px; white-space:nowrap}
td{color:var(--ink-2)}
tbody th{font-weight:500; color:var(--ink)}
table.metrics tbody th{white-space:nowrap}
table.metrics td:last-child{font-variant-numeric:tabular-nums; white-space:nowrap}
table.matrix{border-collapse:separate; border-spacing:2px}
table.matrix td{text-align:center; color:var(--ink); border-radius:3px; border:0}
table.matrix th{border:0; border-bottom:1px solid var(--border)}
table.matrix td.on-fill{color:#fff}
table.data td.num{font-variant-numeric:tabular-nums}
.timeline{margin:8px 0 0; padding-left:0; list-style:none; counter-reset:none}
.timeline li{border-left:2px solid var(--grid); padding:0 0 16px 16px; margin:0}
.timeline li:last-child{padding-bottom:0}
.tl-head{display:flex; gap:10px; align-items:baseline; flex-wrap:wrap}
.tl-ver{
  font-size:12px; font-variant-numeric:tabular-nums; color:var(--series-1);
  font-weight:600; white-space:nowrap;
}
.tl-what{font-weight:560}
.tl-why{margin:4px 0 0; color:var(--ink-2); font-size:14px}
.pill{
  display:inline-block; font-size:12px; padding:1px 9px; border-radius:999px;
  border:1px solid var(--border); white-space:nowrap;
}
.pill[data-tone=critical]{color:var(--critical); border-color:var(--critical)}
.pill[data-tone=warning]{color:#8a5a00; border-color:var(--warning)}
:root[data-theme=dark] .pill[data-tone=warning]{color:var(--warning)}
@media (prefers-color-scheme: dark){
  :root:where(:not([data-theme=light])) .pill[data-tone=warning]{color:var(--warning)}
}
.pill[data-tone=good]{color:var(--good); border-color:var(--good)}
.chart{width:100%; height:auto; display:block; margin:2px 0 4px; overflow:visible}
.chart .grid{stroke:var(--grid); stroke-width:1}
.chart .axis{stroke:var(--axis); stroke-width:1}
.chart .bar{fill:var(--series-1)}
.chart .bar-dim{fill:var(--series-dim)}
.chart .dot{fill:var(--series-1); stroke:var(--card); stroke-width:2}
.chart .row:hover .bar,.chart .row:hover .dot{filter:brightness(1.12)}
.chart .row:hover .dot{r:6}
.chart text{font:12px/1 system-ui,-apple-system,"Segoe UI","Noto Sans TC",sans-serif}
.chart .lbl{fill:var(--ink-2)}
.chart .sublbl,.chart .tick,.chart .axlbl{fill:var(--muted); font-size:11px}
.chart .tick{font-variant-numeric:tabular-nums}
.chart .val{fill:var(--ink-2); font-variant-numeric:tabular-nums}
.chart .anno{fill:var(--ink-2); font-size:11px}
.chart .refline{stroke:var(--axis); stroke-width:1}
.chart .reflbl{fill:var(--muted); font-size:11px}
.foot{margin-top:18px; border-top:1px solid var(--border); padding-top:12px}
details{margin:6px 0}
summary{
  cursor:pointer; font-size:13px; color:var(--ink-2); list-style:none;
  display:flex; gap:8px; align-items:center;
}
summary::-webkit-details-marker{display:none}
summary::before{content:"▸"; color:var(--muted); font-size:11px}
details[open] summary::before{content:"▾"}
summary code{font-size:12px; color:var(--muted)}
pre{
  background:var(--page); border:1px solid var(--border); border-radius:8px;
  padding:14px; overflow-x:auto; margin:8px 0 0;
}
pre code,code{font:12.5px/1.65 ui-monospace,SFMono-Regular,Consolas,"Noto Sans Mono",monospace}
code{color:var(--ink-2)}
ul.plain{margin:0; padding-left:20px; color:var(--ink-2)}
ul.plain li{margin-bottom:9px}
ul.plain b{color:var(--ink)}
.foot-note{color:var(--muted); font-size:12px; padding-bottom:40px}
@media (max-width:620px){
  .card{padding:20px 16px 16px}
  .top h1{font-size:25px}
  .hero-num{font-size:40px}
}
"""
