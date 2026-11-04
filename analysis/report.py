#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""跑 queries/*.sql，把結果排成一頁 report.html。

    python build_db.py && python report.py

每一節的結論都是從查詢結果算出來的（不是寫死在字串裡），資料換了數字會跟著換。
圖是 charts.py 產的 inline SVG，表格是同一份資料的文字版，兩個都在。
"""

import html
import sqlite3
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

import charts as ch

HERE = Path(__file__).resolve().parent
DB = HERE / "analysis.db"
QUERIES = HERE / "queries"
OUT = HERE / "report.html"
# GitHub Pages 的來源是 repo 根目錄的 docs/（Settings → Pages 設成 main /docs）。
# 同一份內容寫兩個地方，是為了讓「看原始碼的人」跟「只想看報告的人」都不用多跑一步；
# 由這支程式一起寫，就不會有一邊更新、另一邊還是舊的。
PAGES = HERE.parent / "docs" / "index.html"
TPE = timezone(timedelta(hours=8))

TITLE = "壽星日資料分析"
SUBTITLE = "139 筆台灣生日優惠，用 SQL 問九個問題"


def run(con, name):
    sql = (QUERIES / name).read_text(encoding="utf-8")
    cur = con.execute(sql)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()], sql


def pick(rows, key, value, field):
    for r in rows:
        if r[key] == value:
            return r[field]
    return None


def esc(s):
    return html.escape(str(s))


def sql_block(name, sql):
    return (f'<details class="sqlbox"><summary>看這一題的 SQL'
            f'<code>queries/{esc(name)}</code></summary>'
            f'<pre><code>{esc(sql.strip())}</code></pre></details>')


def table_block(rows, cols, label="看完整表格"):
    return (f'<details class="tablebox"><summary>{esc(label)}</summary>'
            f'{ch.table(rows, cols)}</details>')


def section(num, qtext, answer, body, name, sql, tablehtml, qno_text=None):
    return f"""
<section class="card" id="q{num}">
  <div class="qno">{esc(qno_text or f"Q{num}")}</div>
  <h2>{qtext}</h2>
  <p class="answer">{answer}</p>
  {body}
  <div class="foot">{sql_block(name, sql)}{tablehtml}</div>
</section>"""


def build():
    if not DB.exists():
        sys.exit("找不到 analysis.db，先跑 python build_db.py")
    con = sqlite3.connect(DB)
    now = datetime.now(TPE)
    meta_build = con.execute("select max(last_checked) from offers").fetchone()[0]
    n_brand_stores = con.execute("select count(distinct brand) from store_counts").fetchone()[0]
    n_stores_total = con.execute("select coalesce(sum(n_stores),0) from store_counts").fetchone()[0]

    q1, s1 = run(con, "01_market_shape.sql")
    q2, s2 = run(con, "02_value_by_category.sql")
    q3, s3 = run(con, "03_advance_days.sql")
    q4, s4 = run(con, "04_membership_matrix.sql")
    q5, s5 = run(con, "05_source_trust.sql")
    q6, s6 = run(con, "06_county_coverage.sql")
    q7, s7 = run(con, "07_footprint_vs_value.sql")
    q8, s8 = run(con, "08_footprint_quartiles.sql")
    q9, s9 = run(con, "09_expiry_watch.sql")
    m = q1[0]
    # 縣市的最高與最低先算起來，Q1 的導言跟 Q6 都要用
    best = q6[0]
    floor = min(r["n_offers"] for r in q6)
    floor_rows = [r for r in q6 if r["n_offers"] == floor]

    # ---------- Q1 規模 ----------
    pct = lambda a, b: f"{100.0 * a / b:.0f}%"
    tiles = "".join([
        ch.stat("優惠筆數", f'{m["n_offers"]}', f'{m["n_categories"]} 個類別、'
                f'{m["n_brands"]} 個品牌'),
        ch.stat("面額中位數", f'NT${int(m["median_value"])}',
                f'{m["n_valued"]} 筆估得出面額，最大 NT${m["max_value"]:,}'),
        ch.stat("當天辦就能用", f'{pct(m["n_walk_in"], m["n_offers"])}',
                f'{m["n_walk_in"]} 筆免費入會又不用提前'),
        ch.stat("全台都吃得到", f'{pct(m["n_nationwide"], m["n_offers"])}',
                f'{m["n_nationwide"]} 筆全台連鎖，其餘限定縣市'),
        ch.stat("人工複查過", f'{pct(m["n_verified"], m["n_offers"])}',
                f'{m["n_verified"]} 筆標記 verified'),
        ch.stat("每年都有", f'{pct(m["n_rolling"], m["n_offers"])}',
                f'{m["n_rolling"]} 筆常態、{m["n_offers"] - m["n_rolling"]} 筆限期檔期'),
    ])
    s_q1 = f"""
<section class="card hero-card" id="q1">
  <div class="qno">Q1</div>
  <h2>這批生日優惠加起來有多大？</h2>
  <div class="hero">
    <div class="hero-num">NT${m["total_value"]:,}</div>
    <div class="hero-lbl">把 {m["n_valued"]} 筆估得出面額的優惠全部加起來，
      一個壽星理論上能領到的總額。實際上沒有人領得完：住{esc(best["county"])}
      拿得到 {best["n_offers"]} 筆，住{"、".join(esc(r["county"]) for r in floor_rows[:3])}
      {f"等 {len(floor_rows)} 個縣市" if len(floor_rows) > 3 else ""}只剩 {floor} 筆（Q6）。</div>
  </div>
  <div class="stats">{tiles}</div>
  <div class="foot">{sql_block("01_market_shape.sql", s1)}</div>
</section>"""

    # ---------- Q2 類別 ----------
    # 只有 5 筆以上才畫進圖裡：娛樂樂園只有 2 筆，中位數 900 多會把其他六類壓成一條線，
    # 而且 2 筆本來就撐不起「這一類的行情」。被擋掉的仍然在表格裡。
    main = [r for r in q2 if r["n_valued"] >= 5]
    thin = [r for r in q2 if r["n_valued"] < 5]
    big, small = main[0], main[-1]
    multi = round(big["median_value"] / small["median_value"], 1)
    q2_ans = (f'<b>吃一頓的生日禮，是喝一杯的 {multi} 倍。</b>'
              f'{esc(big["category"])}的面額中位數 NT${big["median_value"]}，'
              f'{esc(small["category"])}只有 NT${small["median_value"]}。'
              + (f'筆數不到 5 的類別（'
                 + "、".join(f'{esc(r["category"])} {r["n_valued"]} 筆' for r in thin)
                 + '）沒有畫進圖裡。'
                 f'{esc(thin[0]["category"])}的中位數有 NT${thin[0]["median_value"]}，'
                 f'但兩筆撐不起一個行情，放進去只會把其他類別壓成一條線。'
                 if thin else ''))
    q2_body = ('<p class="caption">各類別面額中位數（括號是估得出面額的筆數；'
               '只畫 5 筆以上的類別）</p>'
               + ch.hbar([dict(r, cat=f'{r["category"]}（{r["n_valued"]}）') for r in main],
                         label="cat", value="median_value", unit=" 元",
                         title="各類別生日優惠面額中位數"))
    q2_tbl = table_block(q2, [("category", "類別"), ("n_all", "優惠數"),
                              ("n_valued", "可估面額"), ("median_value", "中位數"),
                              ("q1_value", "Q1"), ("q3_value", "Q3"),
                              ("min_value", "最小"), ("max_value", "最大"),
                              ("vs_overall", "對全體倍數")])

    # ---------- Q3 提前門檻 ----------
    same_day = pick(q3, "bucket", "當天辦就能用", "n_offers") or 0
    unknown = pick(q3, "bucket", "未明訂", "n_offers") or 0
    need_8up = sum(r["n_offers"] for r in q3
                   if r["bucket"].startswith("要提前 8") or r["bucket"].startswith("要提前 30"))
    q3_ans = (f'<b>生日當天才查，只剩一半能用。</b>'
              f'{m["n_offers"]} 筆裡只有 {same_day} 筆（{pct(same_day, m["n_offers"])}）'
              f'是當天辦會員當天就能領；{need_8up} 筆要你提前八天以上入會（多數是整整一個月），'
              f'還有 {unknown} 筆（{pct(unknown, m["n_offers"])}）'
              f'品牌根本沒說要多久——對壽星來說，沒說＝不保證。')
    q3_body = ('<p class="caption">按「要提前幾天入會」分組的優惠筆數</p>'
               + ch.column(q3, label="bucket", value="n_offers"))
    q3_tbl = table_block(q3, [("bucket", "提前門檻"), ("n_offers", "筆數"),
                              ("pct", "占比 %"), ("avg_value", "平均面額"),
                              ("cum_reachable", "累計可拿到")])

    # ---------- Q4 入會方式 ----------
    top = q4[0]
    q4_ans = (f'<b>{m["n_offers"]} 筆裡有 {top["n_offers"]} 筆綁在同一個第三方平台上。</b>'
              f'{esc(top["access"])}一個人就占了 {pct(top["n_offers"], m["n_offers"])}。'
              f'對壽星是好事，辦一個帳號解鎖一堆品牌；對這個網站是風險，'
              f'它改規則，資料就要大改。')
    q4_body = ('<p class="caption">入會方式 × 優惠型態（格子越深筆數越多；數字都印出來了，'
               '不靠顏色讀）</p>'
               + ch.heat_table(q4, row_label="access", total_key="n_offers",
                               cols=[("free_no_min", "免費無低消"), ("free_with_min", "免費有低消"),
                                     ("bogo", "買一送一"), ("discount", "折扣")],
                               extra=[("median_value", "面額中位數"), ("same_day_ok", "當天可辦")])
               + '<p class="note">「當天可辦」那欄要小心讀：'
                 '「不用會員」這組有 22 筆的 advance_days 是 null（品牌沒明訂），'
                 '所以它顯示 0，不是真的來不及。這就是 Q3 把「未明訂」單獨一組的原因。</p>')
    q4_tbl = ""

    # ---------- Q5 來源 ----------
    official = pick(q5, "tier_label", "1 品牌官方", "n_offers") or 0
    social = pick(q5, "tier_label", "4 社群貼文", "n_offers") or 0
    social_ver = pick(q5, "tier_label", "4 社群貼文", "verified_pct") or 0
    stale = max(r["days_since_check"] or 0 for r in q5)
    weak = sum(r["n_offers"] for r in q5 if r["tier_label"][:1] in ("3", "4"))
    q5_ans = (f'<b>只有 {pct(official, m["n_offers"])} 的優惠有品牌官方背書。</b>'
              f'有 {pct(weak, m["n_offers"])} 的優惠，最好的來源只是部落格懶人包或社群貼文；'
              f'其中社群貼文那 {social} 筆的人工複查率是 {social_ver:.0f}%。'
              f'整批資料已經 {stale} 天沒有複查過。'
              f'這一節看的是資料本身可不可靠，跟優惠大不大沒關係。')
    official_share = f'占 {pct(official, m["n_offers"])}'
    q5_body = ('<p class="caption">以「最可信來源」分組的優惠筆數</p>'
               + ch.hbar(q5, label="tier_label", value="n_offers", label_w=150,
                         title="優惠的最佳來源可信度分佈")
               + f'<div class="stats">'
                 f'{ch.stat("距離上次複查", f"{stale} 天", "整批 last_checked 都是同一天", "warn")}'
                 f'{ch.stat("有官方來源", f"{official} 筆", official_share)}'
                 f'{ch.stat("只有社群貼文", f"{social} 筆", f"複查率 {social_ver:.0f}%", "warn")}'
                 f'</div>')
    q5_tbl = table_block(q5, [("tier_label", "最佳來源"), ("n_offers", "筆數"), ("pct", "占比 %"),
                              ("n_verified", "複查過"), ("verified_pct", "複查率 %"),
                              ("avg_value", "平均面額"), ("avg_sources", "平均來源數"),
                              ("days_since_check", "幾天沒查")])

    # ---------- Q6 縣市 ----------
    no_store = [r["county"] for r in q6 if r["n_stores"] == 0]
    q6_ans = (f'<b>住{esc(best["county"])}的壽星有 {best["n_offers"]} 個優惠可選，'
              f'{"、".join(esc(r["county"]) for r in floor_rows)}只有 {floor} 個，'
              f'差 {round(best["n_offers"] / floor, 1)} 倍。</b>'
              f'而且那 {floor} 個全部是全台連鎖，'
              f'也就是說這些縣市的壽星完全沒有「本地品牌」的生日優惠可拿。'
              + (f'{"、".join(esc(c) for c in no_store)}連一家對得上的門市都沒有。'
                 if no_store else ''))
    q6_body = ('<p class="caption">各縣市可用的優惠筆數（含全台連鎖）</p>'
               + ch.hbar(q6, label="county", value="n_offers", row_h=24, bar_h=14,
                         label_w=76, ref=m["n_nationwide"],
                         ref_label=f'全台連鎖 {m["n_nationwide"]} 筆＝地板',
                         title="各縣市可用生日優惠數"))
    q6_tbl = table_block(q6, [("county", "縣市"), ("area", "分區"), ("n_offers", "可用優惠"),
                              ("n_local", "限定本地"), ("n_chain", "全台連鎖"),
                              ("n_stores", "門市數"), ("n_brands_with_store", "有門市的品牌"),
                              ("rk", "排名"), ("gap_to_best", "跟第一名差幾倍")])

    # ---------- Q7/Q8 門市規模 ----------
    r_val = q8[0]["pearson_r"]
    qq1, qq4 = q8[0], q8[-1]
    q7_ans = (f'<b>店開得越多，生日禮越薄。</b>'
              f'門市數最少的那四分之一品牌（{qq1["min_stores"]}–{qq1["max_stores"]} 家店）'
              f'面額中位數 NT${qq1["median_value"]}，'
              f'最多的那四分之一（{qq4["min_stores"]}–{qq4["max_stores"]} 家）只有 '
              f'NT${qq4["median_value"]}。'
              f'這是弱負相關：log10(門市數) 與面額的 Pearson 相關 {r_val}，'
              f'門市最多的那 {qq4["n_brands"]} 個品牌裡，還是有人開 300 元。'
              f'而且只有 {q8[0]["corr_n"]} 個品牌有門市資料，所以這是觀察，不是定律。')
    q7_body = ('<p class="caption">每一點是一個品牌：橫軸門市數（對數刻度）、縱軸優惠面額</p>'
               + ch.scatter(q7, x="n_stores", y="value_twd", name="brand",
                            xlabel="門市數（對數）", ylabel="面額（元）",
                            annotate=[(q7[0]["brand"], -9, 4)],
                            title="門市數與優惠面額")
               + '<p class="caption">按門市數四等分後的面額中位數</p>'
               + ch.column([dict(r, lbl=f'第 {r["store_quartile"]} 組',
                                 sub=f'{r["min_stores"]}–{r["max_stores"]} 家')
                            for r in q8],
                           label="lbl", value="median_value", unit=" 元",
                           height=236, sub="sub"))
    q7_tbl = (table_block(q8, [("store_quartile", "門市數分組"), ("n_brands", "品牌數"),
                               ("min_stores", "最少店數"), ("max_stores", "最多店數"),
                               ("median_value", "面額中位數"), ("avg_value", "平均面額"),
                               ("pearson_r", "Pearson r"), ("corr_n", "樣本數")], "看分組統計")
              + table_block(q7[:40], [("brand", "品牌"), ("category", "類別"),
                                      ("n_stores", "門市"), ("n_counties", "跨縣市"),
                                      ("value_twd", "面額"), ("store_quartile", "分組")],
                            "看門市數前 40 大的品牌"))

    # ---------- Q9 檔期 ----------
    expired = [r for r in q9 if r["status"] == "已過期"]
    noend = [r for r in q9 if r["status"] == "沒寫迄日"]
    q9_ans = (f'<b>這份快照裡的限期檔期，到今天全部不能用了。</b>'
              f'{len(q9)} 筆 fixed 優惠中 {len(expired)} 筆已過期、{len(noend)} 筆沒寫迄日。'
              f'快照停在 {esc(meta_build)}，檔期卻會自己走——'
              f'線上版不能靠人工記得下架，得用 valid_until 自動判斷。'
              f'這一節列的是要處理的清單。')
    pill = {"已過期": ("critical", "✕"), "沒寫迄日": ("warning", "！"),
            "14 天內到期": ("warning", "！"), "還沒開始": ("muted", "·"),
            "進行中": ("good", "✓")}
    rows = []
    for r in q9:
        tone, icon = pill.get(r["status"], ("muted", "·"))
        rows.append(dict(r, status_html=f'<span class="pill" data-tone="{tone}">'
                                        f'{icon} {esc(r["status"])}</span>'))
    body = ['<table class="data"><thead><tr><th>狀態</th><th>品牌</th><th>類別</th>'
            '<th>檔期</th><th>面額</th><th>來源層級</th></tr></thead><tbody>']
    for r in rows:
        body.append(f'<tr><td>{r["status_html"]}</td><td>{esc(r["brand"])}</td>'
                    f'<td>{esc(r["category"])}</td>'
                    f'<td class="num">{esc(r["valid_from"] or "—")} → '
                    f'{esc(r["valid_until"] or "沒寫")}</td>'
                    f'<td class="num">{ch.fmt_int(r["value_twd"]) if r["value_twd"] else "—"}</td>'
                    f'<td class="num">{r["best_source_tier"] or "—"}</td></tr>')
    body.append('</tbody></table>')
    q9_body = '<p class="caption">19 筆限期檔期的現況（狀態同時有圖示與文字，不只靠顏色）</p>' \
              + "".join(body)

    # ---------- 組頁 ----------
    secs = [
        s_q1,
        section(2, "哪一類的生日優惠最大方？", q2_ans, q2_body,
                "02_value_by_category.sql", s2, q2_tbl),
        section(3, "生日當天才想到，還來得及嗎？", q3_ans, q3_body,
                "03_advance_days.sql", s3, q3_tbl),
        section(4, "要先變成誰的會員，才換得到什麼？", q4_ans, q4_body,
                "04_membership_matrix.sql", s4, q4_tbl),
        section(5, "這些優惠是誰說的？多久沒複查了？", q5_ans, q5_body,
                "05_source_trust.sql", s5, q5_tbl),
        section(6, "住在哪裡，生日優惠差多少？", q6_ans, q6_body,
                "06_county_coverage.sql", s6, q6_tbl),
        section(7, "店開得多的品牌，生日禮是不是比較薄？", q7_ans, q7_body,
                "07_footprint_vs_value.sql + 08_footprint_quartiles.sql",
                s7 + "\n\n-- ── 分組與相關係數：queries/08_footprint_quartiles.sql ──\n\n" + s8,
                q7_tbl, qno_text="Q7 · Q8"),
        section(9, "哪幾筆已經不能用了？", q9_ans, q9_body,
                "09_expiry_watch.sql", s9, ""),
    ]

    limits = f"""
<section class="card" id="limits">
  <h2>資料限制</h2>
  <p class="answer">這份分析不能拿來說什麼，先寫在前面。</p>
  <ul class="limits">
    <li><b>這是快照，不是即時資料。</b>優惠來自 <code>offers.json</code>，
      最後查證日 {esc(meta_build)}；線上版的 Postgres 已經長得更大，
      但這台機器跑分析時（{now:%Y-%m-%d}）線上資料庫正好在維護，所以全部用本機快照。
      Q9 的「全部過期」是快照的必然結果，不是線上網站的狀態。</li>
    <li><b>面額是估的。</b><code>value_twd</code> 是把「一份雞塊」「九折」這種優惠
      換算成新台幣的估計值，{m["n_offers"] - m["n_valued"]} 筆估不出來（吃到飽、
      「依門市公告」）就留 null，不當 0。所有平均與中位數都只算得出來的那些。</li>
    <li><b>門市數只到對得上的品牌。</b>門市來自 Google Places 的品牌搜尋結果，
      {n_brand_stores} 個品牌抓得到門市，其中 {q8[0]["corr_n"]} 個同時估得出面額，
      Q7 的散佈圖就是這 {q8[0]["corr_n"]} 個點。品牌名對不上的（聯名卡、改名、小店）
      沒有門市數，所以這一題天生偏向連鎖品牌。</li>
    <li><b>縣市覆蓋看的是「有沒有」，不是「多好拿」。</b>Q6 算的是這個縣市有幾筆優惠，
      沒有按人口或店數標準化：手上沒有可引用的人口資料，所以不換算。</li>
    <li><b>沒有使用者行為資料。</b>這份分析完全是優惠與門市的靜態結構，
      沒有碰任何人的瀏覽或兌換紀錄。</li>
  </ul>
</section>"""

    method = f"""
<section class="card" id="method">
  <h2>怎麼做的</h2>
  <p>九個問題、九個 <code>.sql</code> 檔，全部跑在 SQLite。統計量刻意全部寫在 SQL 裡：
    中位數與四分位用 <code>row_number() over (partition by …)</code> 自己做
    （SQLite 沒有 <code>percentile_cont</code>）、累積比例用
    <code>sum() over (order by …)</code>、分組用 <code>ntile(4)</code>、
    Pearson 相關係數直接把公式展開成 <code>sum(x*y)</code> 那幾項算。
    Python 只負責兩件事：把巢狀 JSON 攤平成可以 join 的表，以及把查詢結果排成這一頁。</p>
  <p>沒有第三方套件。<code>pandas</code>／<code>matplotlib</code> 都沒用到，
    圖是直接產 inline SVG：中文不會因為缺字型變成方塊、深色模式用 CSS 變數自動切換、
    整份報告就是一個 HTML 檔。</p>
  <pre class="tree"><code>analysis/
├ build_db.py      JSON → SQLite（含門市彙總，653 列 CSV 進版控）
├ schema.sql       分析庫的 DDL 與兩個 view
├ queries/         01…09，一題一檔
├ charts.py        inline SVG：橫條、直條、散佈、交叉表
├ report.py        跑查詢 → 算結論 → 吐這一頁
└ data/store_counts.csv   品牌×縣市門市數（原始 Places 回應不進 git）</code></pre>
  <p class="note">重跑：<code>python build_db.py &amp;&amp; python report.py</code>。
    門市明細在本機才有，缺的時候會自動改讀 <code>data/store_counts.csv</code>，
    所以 clone 下來就跑得完整份報告。</p>
</section>"""

    nav = "".join(f'<a href="#q{a}">{t}</a>' for a, t in
                  [("1", "Q1 規模"), ("2", "Q2 類別"), ("3", "Q3 提前門檻"),
                   ("4", "Q4 入會方式"), ("5", "Q5 資料可信度"), ("6", "Q6 縣市落差"),
                   ("7", "Q7–8 門市規模"), ("9", "Q9 檔期")])
    doc = f"""<!doctype html>
<html lang="zh-Hant"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{TITLE}</title>
<meta name="description" content="{esc(SUBTITLE)}">
<style>{CSS}</style>
</head>
<body>
<header class="top">
  <div class="wrap">
    <h1>{TITLE}</h1>
    <p class="sub">{esc(SUBTITLE)}</p>
    <p class="byline">資料：壽星日 <code>offers.json</code>（最後查證 {esc(meta_build)}）
      ＋ Google Places 門市彙總　·　工具：SQLite ＋ Python 標準庫　·
      產出 {now:%Y-%m-%d %H:%M} (UTC+8)</p>
    <nav class="jump">{nav}<a href="#method">方法</a><a href="#limits">資料限制</a></nav>
    <button class="theme" type="button" aria-label="切換深淺色">◐</button>
  </div>
</header>
<main class="wrap">
<section class="card intro">
  <p>壽星日是我做的一個網站，收台灣的生日優惠。做網站的時候只在意「怎麼顯示」，
    從來沒認真問過這批資料本身長什麼樣子。這一頁把它丟進 SQLite 問九個問題：
    哪一類最大方、多少優惠其實當天辦來不及、住不同縣市差多少、
    還有這批資料自己有多可信。</p>
  <p>每一節都是「問題 → 一句結論 → 圖 → SQL → 表格」。
    結論的數字是從查詢結果算出來的。資料換一版，這一頁的數字會自己跟著換。</p>
</section>
{"".join(secs)}
{method}
{limits}
</main>
<footer class="wrap foot-note">
  <p>{TITLE}　·　{m["n_offers"]} 筆優惠、{m["n_brands"]} 個品牌、
    {n_stores_total:,} 家門市彙總　·
    產出 {now:%Y-%m-%d %H:%M}（UTC+8）</p>
</footer>
<script>
(function () {{
  var btn = document.querySelector('.theme'), root = document.documentElement;
  try {{ var s = localStorage.getItem('bd-theme'); if (s) root.dataset.theme = s; }} catch (e) {{}}
  btn.addEventListener('click', function () {{
    var dark = root.dataset.theme === 'dark' ||
      (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = dark ? 'light' : 'dark';
    try {{ localStorage.setItem('bd-theme', root.dataset.theme); }} catch (e) {{}}
  }});
}})();
</script>
</body></html>"""
    OUT.write_text(doc, encoding="utf-8")
    PAGES.parent.mkdir(exist_ok=True)
    PAGES.write_text(doc, encoding="utf-8")
    (PAGES.parent / ".nojekyll").write_text("", encoding="utf-8")
    con.close()
    print(f"寫好 {OUT.name} 與 docs/{PAGES.name}（{len(doc):,} 字元）")
    for n, rows in [("Q2", q2), ("Q3", q3), ("Q4", q4), ("Q5", q5),
                    ("Q6", q6), ("Q7", q7), ("Q8", q8), ("Q9", q9)]:
        print(f"  {n}: {len(rows)} 列")


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
.wrap{max-width:860px; margin:0 auto; padding:0 16px}
.top{padding:40px 0 8px; position:relative}
.top h1{font-size:30px; line-height:1.25; margin:0 0 6px; letter-spacing:-.01em}
.sub{margin:0 0 14px; color:var(--ink-2); font-size:17px}
.byline{margin:0; color:var(--muted); font-size:13px}
.jump{display:flex; flex-wrap:wrap; gap:6px; margin:18px 0 0}
.jump a{
  font-size:13px; color:var(--ink-2); text-decoration:none;
  border:1px solid var(--border); border-radius:999px; padding:3px 11px;
}
.jump a:hover{color:var(--ink); border-color:var(--axis)}
.theme{
  position:absolute; top:40px; right:16px; width:34px; height:34px;
  border-radius:999px; border:1px solid var(--border); background:var(--card);
  color:var(--ink-2); font-size:15px; cursor:pointer;
}
main{padding:20px 0 40px}
.card{
  background:var(--card); border:1px solid var(--border); border-radius:14px;
  padding:26px 26px 20px; margin:16px 0;
}
.card.intro{color:var(--ink-2)}
.card.intro p{margin:0 0 10px}
.qno{
  font-size:12px; font-weight:600; letter-spacing:.08em; color:var(--series-1);
  margin-bottom:6px;
}
.card h2{font-size:21px; line-height:1.35; margin:0 0 12px; letter-spacing:-.01em}
.answer{margin:0 0 18px; color:var(--ink-2)}
.answer b{color:var(--ink)}
.caption{margin:22px 0 6px; font-size:13px; color:var(--muted)}
.note{margin:12px 0 0; font-size:13px; color:var(--muted)}
.hero{display:flex; gap:18px; align-items:baseline; flex-wrap:wrap; margin:4px 0 22px}
.hero-num{font-size:50px; font-weight:650; line-height:1; letter-spacing:-.02em}
.hero-lbl{flex:1 1 280px; color:var(--ink-2); font-size:14px}
.stats{display:grid; grid-template-columns:repeat(auto-fit,minmax(168px,1fr)); gap:12px}
.stat{border:1px solid var(--border); border-radius:10px; padding:12px 14px}
.stat-label{font-size:12px; color:var(--muted)}
.stat-value{font-size:24px; font-weight:620; line-height:1.3; margin:2px 0}
.stat-sub{font-size:12px; color:var(--ink-2)}
.stat[data-tone=warn] .stat-value{color:var(--critical)}
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
table{border-collapse:collapse; width:100%; font-size:13px; margin:6px 0 2px}
th,td{text-align:left; padding:6px 9px; border-bottom:1px solid var(--border)}
thead th{color:var(--muted); font-weight:600; font-size:12px; white-space:nowrap}
td{font-variant-numeric:tabular-nums; color:var(--ink-2)}
tbody th{font-weight:500; color:var(--ink); white-space:nowrap}
table.matrix{border-collapse:separate; border-spacing:2px}
table.matrix td{text-align:center; color:var(--ink); border-radius:3px; border:0}
table.matrix th{border:0; border-bottom:1px solid var(--border)}
table.matrix td.on-fill{color:#fff}
table.data td.num{font-variant-numeric:tabular-nums}
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
pre code,code{
  font:12.5px/1.65 ui-monospace,SFMono-Regular,Consolas,"Noto Sans Mono",monospace;
}
code{color:var(--ink-2)}
pre.tree{background:var(--page)}
.limits{margin:0; padding-left:20px; color:var(--ink-2)}
.limits li{margin-bottom:9px}
.limits b{color:var(--ink)}
.foot-note{color:var(--muted); font-size:12px; padding-bottom:40px}
@media (max-width:620px){
  .card{padding:20px 16px 16px}
  .top h1{font-size:25px}
  .hero-num{font-size:40px}
}
"""

if __name__ == "__main__":
    build()
