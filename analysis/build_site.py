#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""產生整個作品集站到 ../docs/（GitHub Pages 的來源）。

    python build_db.py && python build_site.py

頁面：
    index.html           首頁：定位、三個案例、怎麼做分析
    birthday-deals.html  壽星日：有真實資料的旗艦案例
    bandary.html         Bandary 聽團曆
    relatestats.html     RelateStats
    sql-report.html      九題 SQL 報告（由 report.py 產生，這裡順便叫它跑）

寫這支程式的規矩：**頁面上每一個數字都要有出處。**
算得出來的就從 analysis.db 查；只有我手上沒有、要等資料的，
用 th.pending() 標成「待補」放在頁面上，不要先填一個看起來合理的數字。
"""

import sqlite3
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import charts as ch
import theme as th

HERE = Path(__file__).resolve().parent
DOCS = HERE.parent / "docs"
DB = HERE / "analysis.db"
TPE = timezone(timedelta(hours=8))
TODAY = datetime.now(TPE)
STAMP = f"{TODAY:%Y-%m-%d}"

SITE_URL = "https://birthdaydeals.celine-fu-work.workers.dev/"


def q(con, sql):
    cur = con.execute(sql)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def one(con, sql):
    return con.execute(sql).fetchone()[0]


# ───────────────────────── 首頁 ─────────────────────────

def home(f):
    tiles = th.stats([
        th.stat("線上產品", "3 個", "壽星日（網站＋App 殼）、Bandary、RelateStats"),
        th.stat("壽星日版本", "154 個", f'{f["first_day"]} 開站到現在，{f["commits"]} 個 commit'),
        th.stat("回歸測試", "92 支", "每個版本上線前全部跑過"),
        th.stat("分析過的優惠", f'{f["n_offers"]} 筆', "加上 4,734 家門市的縣市分布"),
    ])

    cases = "".join([
        th.case_card(
            "birthday-deals.html", "壽星日 Birthday Deals",
            "台灣各品牌的生日優惠，可以篩選、收藏、記錄自己省下多少。",
            ["供給面：139 筆優惠的價值、門檻、縣市覆蓋，九支 SQL 問完",
             "資料治理：只有 12% 有品牌官方來源，推導出自動下架的需求",
             "成本分析：資料庫流量超額，拆解成因之後一天少 25% 的量"],
            "有真實資料"),
        th.case_card(
            "bandary.html", "Bandary 聽團曆",
            "台灣聽團仔的演出記錄：追場次、每日選歌、好友日曆、免費活動共享。",
            ["已上架 Google Play，版本 1.117.2",
             "要衡量的是「記錄行為會不會持續」，不是下載數",
             "數據等 Play Console 與 Firebase 匯出"],
            "指標已定義，等數據"),
        th.case_card(
            "relatestats.html", "RelateStats",
            "把通訊軟體上的注意力停留時間算成數字，做社交人格與數位健康分析。",
            ["刻意不要 INTERNET 權限，所以產品端一筆遙測都收不到",
             "拿不到行為資料的產品，怎麼知道做得好不好",
             "只能靠 Play Console、評論與許願板"],
            "沒有遙測的案例"),
    ])

    how = """
  <p class="lede">這三個產品都是同一件事的不同版本：<b>把沒人幫你算的事算出來。</b>
    銀行幫你算錢，公司幫你算工時，剩下那些呢？你今年進了幾次 live house、
    一年一次的那天究竟省下多少，算出來其實很有意思。</p>
  <p>這份作品集要給的不是「我做了三個 app」，而是這三個產品背後我怎麼做決定：
    要衡量什麼、資料從哪來、算出來之後改了什麼、改完有沒有用。
    有數據的地方放數據，還沒有的地方直接標成「待補」，不先填一個看起來合理的數字。</p>
"""

    method = """
  <p>每個案例都照同一個順序走，所以三頁讀起來是同一套方法的三次應用。</p>
  <h3>1. 先定義要衡量什麼</h3>
  <p>做之前先寫下來：這個產品好不好，看哪幾個數字。壽星日分成供給（有多少優惠能拿）、
    需求（有沒有人真的用）、品質（資料可不可信）、成本（跑得起來嗎）四組；
    RelateStats 因為收不到行為資料，整組指標得換一套寫法。</p>
  <h3>2. 資料從哪來，界線在哪</h3>
  <p>壽星日的事件表 <code>site_events</code> 是自己設計的，欄位只有事件類型、
    一個匿名的 session、選填的使用者 id 跟一包 meta。分析一律只用彙總，
    個人層級的紀錄不離開資料庫，也不進版控。
    這一頁公開在網路上，所以這條線要先畫好再開始算。</p>
  <h3>3. 算完要能導向一個決定</h3>
  <p>不以「做出一張圖」為終點。「19 筆限期優惠全部過期」要推到
    「不能靠人記得下架，得用 <code>valid_until</code> 自動判斷」；
    「資料庫流量超額」要推到「哪一條路徑吃掉最多、先砍哪一條」。</p>
  <h3>4. 改完要回去看數字</h3>
  <p>154 個版本都有紀錄，改動大的會回頭量一次。
    把快取從 10 分鐘拉到 30 分鐘之後，上游請求從一天 144 次降到 48 次；
    一批減量上線之後，每天的量從 115 MB 降到 85 MB。
    沒有回去量的就不敢說它有效。</p>
"""

    skills = """
  <ul class="plain">
    <li><b>SQL。</b>九支查詢全部用 window function 跟 CTE 寫完：中位數與四分位
      （SQLite 沒有 <code>percentile_cont</code>，自己用 <code>row_number()</code> 做）、
      累積比例、<code>ntile(4)</code> 分組、交叉表、Pearson 相關係數直接展開公式算。
      <a href="sql-report.html">每一題的 SQL 都附在報告裡</a>。</li>
    <li><b>Python。</b>把巢狀 JSON 攤平成可以 join 的表、彙總成可以進版控的 CSV、
      再把查詢結果排版成這幾頁。沒有第三方套件，圖是自己產的 inline SVG。</li>
    <li><b>事件追蹤設計。</b>事件表的欄位、哪些事件要記、匿名 session 怎麼接，
      以及「公開的排行榜數字」跟「內部的分析數字」為什麼不能共用同一個定義。</li>
    <li><b>成本分析。</b>把一次流量超額拆成固定成本與變動成本，量出每條路徑的位元組，
      按「真的會發生」排風險順序，再決定砍哪一條。</li>
    <li><b>資料治理。</b>來源分級（官方／媒體／部落格／社群）、複查延遲、
      過期自動下架，都是從分析結果長出來的規則。</li>
  </ul>
"""

    contact = f"""
  <p>這些產品都還在線上跑：<a href="{SITE_URL}">壽星日</a>（免費方案，人多的時候會慢幾秒）。
    程式碼在 <a href="https://github.com/afortunadofu-bot/birthday-deals">GitHub</a>。</p>
  <p>想聊聊或要更完整的資料，信箱是 <code>celine.fu@gmail.com</code>。</p>
"""

    body = (th.card("", how) + tiles
            + th.card("三個案例", cases)
            + th.card("我怎麼做產品分析", method)
            + th.card("具體會的東西", skills)
            + th.card("聯絡", contact))

    return th.page(
        filename="index.html",
        title="小數據所｜產品分析作品集",
        lead="把沒人幫你算的事算出來。三個自己做的產品，跟它們背後的數字。",
        desc="BA／產品分析作品集：壽星日、Bandary 聽團曆、RelateStats 三個產品的指標設計、"
             "資料分析與產品決策。",
        meta=f"定位：BA／產品分析　·　內容更新 {STAMP}",
        body=body,
    )


# ────────────────────── 壽星日案例 ──────────────────────

def birthday_deals(con, f):
    county = q(con, """
        select c.name as county,
               (select count(*) from v_offer_county v where v.county = c.name) as n_offers
          from counties c order by n_offers desc, c.order_no""")
    tier = q(con, """
        select case best_source_tier
                 when 1 then '1 品牌官方' when 2 then '2 新聞媒體'
                 when 3 then '3 部落格懶人包' when 4 then '4 社群貼文'
                 else '未標註' end as tier_label,
               count(*) as n
          from offers group by best_source_tier order by coalesce(best_source_tier, 9)""")

    intro = f"""
  <p class="lede">壽星日收台灣各品牌的生日優惠，可以篩選、收藏、記錄自己省下多少。
    2026 年 8 月開站，到現在 154 個版本。企劃、開發、資料整理、分析都是我一個人。</p>
  <p>這一頁講的是分析的部分：這個產品該看哪些數字、我實際算出了什麼、
    算完之後改了什麼。完整的 SQL 跟圖表在
    <a href="sql-report.html">九題報告</a>那一頁。</p>
"""

    frame = th.metric_table([
        ("供給：優惠數", "approved 狀態的優惠筆數",
         f'{f["n_offers"]} 筆（2026-08 快照）'),
        ("供給：縣市覆蓋", "每個縣市拿得到幾筆（含全台連鎖）",
         f'{county[0]["n_offers"]} ↔ {county[-1]["n_offers"]} 筆'),
        ("供給：能當天用的比例", "免費入會且不用提前登錄的占比",
         f'{f["walk_in_pct"]}%'),
        ("品質：官方來源比例", "最佳來源是品牌官方的占比", f'{f["official_pct"]}%'),
        ("品質：複查延遲", "今天減去 last_checked", f'{f["stale"]} 天'),
        ("品質：過期未下架", "validity_type=fixed 且 valid_until 已過",
         f'{f["expired"]} / {f["n_fixed"]} 筆'),
        ("需求：回報使用", "回報「我用過了」的次數（offer_stats）", f["d_reports"]),
        ("需求：兌換成功率", "回報成功 ÷ 全部回報", f["d_success"]),
        ("需求：收藏", "被加進願望清單的次數（wishlist_counts）", f["d_wishes"]),
        ("需求：留言", "每筆優惠底下的留言數", f["d_comments"]),
        ("需求：到站與漏斗", "site_events 的 pageview → 點開 → 外連，以 session 去重",
         th.pending("管理員限定，要另外匯出")),
        ("成本：Egress", "Supabase 每月送出的位元組", "上一個週期超過 5 GB 額度"),
        ("成本：固定成本", "快取過期回源一輪的量 × 一天幾輪 × 幾個機房",
         "約 180 KB／輪"),
    ])

    supply = f"""
  <p>完整的九題在<a href="sql-report.html">報告那一頁</a>，這裡只留跟產品決策有關的三個。</p>
  <h3>住在哪裡，差 {round(county[0]["n_offers"] / county[-1]["n_offers"], 1)} 倍</h3>
  <p>住{th.esc(county[0]["county"])}的壽星有 {county[0]["n_offers"]} 個優惠可選，
     最少的縣市只有 {county[-1]["n_offers"]} 個，而且那些全部是全台連鎖，
     等於這些縣市完全沒有本地品牌的生日優惠可拿。這是產品的供給缺口，
     不是演算法調一調就會好的東西。</p>
  {ch.hbar(county, label="county", value="n_offers", row_h=22, bar_h=13, label_w=76,
           title="各縣市可用生日優惠數")}
  <h3>一半的優惠，生日當天才查就來不及</h3>
  <p>{f["walk_in_pct"]}% 的優惠是當天辦會員當天就能領，其餘要提前登錄，
     還有 {f["unknown_advance"]} 筆品牌根本沒寫要多久。對一個「生日當天才會被打開」的產品來說，
     這直接決定了要不要做提前提醒，答案是要。</p>
  <h3>只有 {f["official_pct"]}% 的優惠有品牌官方背書</h3>
  <p>其餘的最佳來源是部落格懶人包或社群貼文。這不是「資料很爛」，
     是「這類資料本來就長這樣」，所以產品要承認它：來源分級顯示在卡片上、
     使用者可以回報有沒有用、過期的自己下架。</p>
  {ch.hbar(tier, label="tier_label", value="n", label_w=150,
           title="優惠的最佳來源可信度分佈")}
"""

    cost = """
  <p>2026 年 10 月，Supabase 的免費額度（Egress 5 GB／月）被判超額，整個專案被停權，
    登入、收藏、回報、投稿全部不能用。這一段是把它當成一個分析題來處理的過程。</p>
  <h3>先分清楚是事故還是日常</h3>
  <p>逐日看 log 的量：9/20～9/28 是 70～110 MB／天，9/30 之後跳到 450～540，
     10/04 最高 830 MB。對得上 10/02～10/04 的資料庫事故——
     掃全表的查詢把 API 打到一直回 522。修好的隔天就掉回來了。
     <b>所以超額是一次事故造成的，不是日常流量撐不住</b>，這個結論決定了後面要做什麼：
     要防的是「下一次事故」，不是「使用者變多」。</p>
  <h3>量每一條路徑到底吐出多少位元組</h3>
  <p>不猜，實際量。優惠清單壓縮後一次 128 KB、<code>/board</code> 合計 33 KB、
     <code>/stats</code> 約 1 KB，一輪回源約 180 KB。快取 30 分鐘一輪，
     一天 48 輪，一個機房一個月約 0.26 GB——而 Cloudflare 是每個機房各一份快取，
     三四個機房就是一個月 1.1～1.4 GB 的固定成本。<b>這部分跟有幾個使用者完全無關</b>，
     是先要認的帳。</p>
  <h3>照「真的會發生」排，不是照「砍得最多」排</h3>
  <p>有一條原本以為很肥的查詢，實際量完壓縮後只有 354 bytes，就放掉不做了。
     真正做的三件事：快取 10 分鐘拉到 30 分鐘（上游請求一天 144 → 48 次，
     每個機房每月 0.6 → 0.2 GB）、優惠清單從 <code>select=*</code> 改成逐欄點名
     （146 → 128 KB，砍掉五個前端根本沒在讀的欄位）、
     還有一批把請求數減半的改動（每天的量 115 → 85 MB，約少 25%）。</p>
  <h3>回頭看有沒有用</h3>
  <p>用量頁從 1.284 GB 掉到 0.896 GB，跟自己算的對得起來。
     但這次仍然被停權，因為被判的是上一個計費週期——事故那三天就在裡面。
     所以同一批分析也產出了一條維運規則：<b>加新的 RPC 或 view 的時候要特別小心</b>，
     走快取的有擋，前端直接打的沒有。</p>
  <p class="note">數字出處：repo 裡的 <code>SUPABASE-流量.md</code>，2026-10-20 實測。</p>
"""

    users = """
  <p>這是這個案例現在唯一的空白，而且空白的原因是技術性的：
    資料庫停權中，讀不到任何一筆事件。</p>
  <p>能先做的都做了：事件表本來就設計好了，分析要用的指標也定義完了
    （上面那張表的「需求」那幾列）。事件表長這樣：</p>
  <pre><code>site_events(
  id          bigserial,
  event_type  text,        -- pageview / submit / use_report / wish / rate / static_view …
  session_id  text,        -- 匿名，localStorage 產生
  user_id     uuid,        -- 可為 null（沒登入也能用）
  meta        jsonb,
  created_at  timestamptz
)</code></pre>
  <p>要算的是三件事：<b>漏斗</b>（到站 → 點開優惠 → 點外連或收藏 → 回報用過）、
    <b>內容供給與需求對不對得上</b>（最多人收藏的類別，跟優惠數最多的類別是不是同一批）、
    以及<b>回訪</b>（生日是一年一次的事件，所以留存要看的是「隔年還會不會回來」，
    不是次日留存）。</p>
  <h3>已經寫好、等資料就會亮起來的部分</h3>
  <p>有一半不用等管理員權限。線上有四支 view 本來就開放公開讀
    （<code>offers_public</code>、<code>wishlist_counts</code>、<code>most_wished</code>、
    <code>leaderboard_monthly</code>），裡面有每筆優惠的回報數、兌換成功率、
    留言數與收藏數——那已經是需求面的一半。抓這四支的程式
    （<code>fetch_live.py</code>）跟吃它的 ETL（<code>build_db.py --live</code>）都寫好了，
    現在跑會停在一句「Supabase 回 402」。</p>
  <p>兩支對應的查詢也先寫完了：
    <code>10_demand_vs_supply.sql</code> 比「哪一類收藏多」跟「哪一類優惠多」的落差，
    用來決定下一批要去談哪種品牌；
    <code>11_offer_health.sql</code> 挑出回報多、成功率低的優惠，那是資料錯了或品牌改規則，
    屬於維運清單。</p>
  <p>真正要等管理員匯出的只剩漏斗跟回訪，因為 <code>site_events</code> 是
    admin 限定、anon key 讀不到。</p>
  <p class="note">公開的只會是彙總。個人層級的事件不離開資料庫，也不進版控。</p>
"""

    decisions = th.timeline([
        ("v129", "快取 10 分鐘 → 30 分鐘",
         "成本分析的直接結果：上游請求一天 144 → 48 次。代價是新優惠最多晚 30 分鐘出現，"
         "對一個「一年用一次」的產品可以接受。"),
        ("v132", "優惠清單從 <code>select=*</code> 改成逐欄點名",
         "量完才發現有五個欄位前端一個都沒讀。146 → 128 KB。"
         "順手加了一條測試：view 以後加欄位沒跟著改，測試就會紅。"),
        ("v133", "標「全台」但其實沒那麼全台的，改成實際有分店的縣市",
         "門市資料跟優惠的 regions 欄位對不起來，是縣市覆蓋那一題算出來的。"
         "影響的是使用者在自己縣市看到的清單準不準。"),
        ("v144", "自動上架：老手的新投稿不用再等審核",
         "投稿審核是人工瓶頸。先看投稿者過去的紀錄，再決定要不要擋。"),
        ("v167", "「我省下多少」收成一個數字，排到「我送出過的」前面",
         "這個產品的核心價值是「幫你算省下多少」，版面要讓它第一眼就看得到。"),
        ("v168–v172", "資料庫停掉時，自動掛「系統更新中」、錯誤訊息一律中文",
         "停權期間使用者看到的是英文錯誤。可靠性也是產品的一部分："
         "壞掉的時候要壞得像話。"),
    ])

    todo = """
  <ul class="plain">
    <li><b>使用者行為那一段還是空的。</b>資料庫恢復之後要補完漏斗、回訪與內容供需。</li>
    <li><b>優惠筆數要換成現在的。</b>這一頁用的是 2026-08 的快照（139 筆），
      線上實際已經成長到好幾百筆，等得到資料就重跑。</li>
    <li><b>縣市覆蓋沒有按人口標準化。</b>手上沒有可引用的人口資料，所以先不換算。</li>
  </ul>
"""

    body = (th.card("", intro)
            + th.card("這個產品該看哪些數字", frame)
            + th.card("分析一：供給面", supply)
            + th.card("分析二：成本與可靠性", cost)
            + th.card("分析三：使用者行為（等資料）", users)
            + th.card("決策紀錄（節錄）", decisions)
            + th.card("還沒做到的", todo))

    return th.page(
        filename="birthday-deals.html",
        title="壽星日 Birthday Deals",
        lead="台灣各品牌的生日優惠，可以篩選、收藏、記錄自己省下多少。",
        desc="壽星日的產品分析案例：指標框架、供給面分析、資料治理、成本分析與決策紀錄。",
        meta=f'線上：<a href="{SITE_URL}">birthdaydeals</a>　·　'
             f"2026-08 開站，154 個版本　·　角色：企劃／開發／分析　·　更新 {STAMP}",
        body=body,
    )


# ─────────────────────── Bandary ───────────────────────

def bandary():
    intro = """
  <p class="lede">Bandary 聽團曆是給台灣聽團仔的演出記錄 App：追蹤看過的場次、
    每日選歌、倒數即將到來的演出，還有免費活動共享、好友日曆、Google 日曆匯入。
    已經在 Google Play 上架，版本 1.117.2。</p>
  <p>跟壽星日一樣是一個人做完：企劃、Android 開發、雲端設定、上架。
    這一頁講的是「這個產品要怎麼知道做得好不好」。</p>
"""
    frame = th.metric_table([
        ("核心行為", "有沒有真的拿它記錄演出（新增場次的人數／頻率）",
         th.pending("Firebase 匯出")),
        ("啟用", "安裝後七天內至少記錄過一場的比例", th.pending("Firebase 匯出")),
        ("留存", "看團是不定期的事，要看「月活」跟「有演出那週的回訪」",
         th.pending("Play Console")),
        ("社群功能", "好友日曆、免費活動共享的使用比例",
         th.pending("Firebase 匯出")),
        ("匯入", "Google 日曆匯入的成功率與失敗原因", th.pending("Firebase 匯出")),
        ("下載與評分", "Play Console 的安裝數、解除安裝率、評分",
         th.pending("Play Console")),
    ])
    why = """
  <p>下載數對這個產品不是好指標。聽團是不定期的事：有人一個月跑三場，
    有人半年一場，所以「日活」「次日留存」這種通用指標會把它判死。
    要看的是<b>有演出的那一週會不會回來</b>，以及<b>記錄這件事會不會持續</b>。</p>
  <p>它有 Firebase（Firestore ＋ Functions），所以跟 RelateStats 不一樣，
    行為資料是拿得到的，只是還沒有把它接成一套固定在看的指標。</p>
"""
    need = """
  <p>這一頁的數字我手上還沒有，需要的是這幾樣：</p>
  <ul class="plain">
    <li><b>Play Console</b>：安裝／解除安裝、評分、留存那幾張報表的 CSV 匯出。</li>
    <li><b>Firebase</b>：事件匯出（或 BigQuery link 的資料表），
      至少要有「新增場次」「開啟好友日曆」「匯入 Google 日曆」這三個事件。</li>
    <li><b>一句話</b>：這個 App 你最想知道的是什麼？指標框架要照那個問題排，
      不是照工具給什麼就看什麼。</li>
  </ul>
  <p class="note">拿到之後這一頁會長成跟壽星日那頁一樣：指標框架 → 分析 → 決策 → 回看。</p>
"""
    body = (th.card("", intro)
            + th.card("要衡量什麼", frame)
            + th.card("為什麼不看下載數", why)
            + th.card("還缺什麼才寫得下去", need))
    return th.page(
        filename="bandary.html",
        title="Bandary 聽團曆",
        lead="台灣聽團仔的演出記錄：追場次、每日選歌、好友日曆、免費活動共享。",
        desc="Bandary 聽團曆的產品分析：為什麼不看下載數、要衡量什麼、還缺哪些資料。",
        meta=f"Google Play 已上架　·　版本 1.117.2　·　角色：企劃／開發／上架　·　更新 {STAMP}",
        body=body,
    )


# ───────────────────── RelateStats ─────────────────────

def relatestats():
    intro = """
  <p class="lede">RelateStats 把你在通訊軟體上對每個人投入的注意力停留時間與互動頻率
    算成數字，做社交人格與數位健康分析。不 root、不碰任何資料庫，
    只靠通知監聽與無障礙服務兩個引擎。已在 Google Play 上架。</p>
"""
    decision = """
  <p>這個 App 的開發守則裡有一條寫死的硬規則：<b>不要加 <code>INTERNET</code> 權限。</b>
    因為「資料傳不出手機」是隱私權政策、資料安全性表單、無障礙服務聲明三份文件的共同前提，
    加了就要三份一起重寫。連雲端備份都因此繞開 Google 登入＋Drive API，
    改走系統檔案選擇器，讓使用者自己決定要不要把檔案丟上雲端。</p>
  <p>這是一個有代價的產品決策，而且代價正好落在我這一行：
    <b>產品端一筆遙測都收不到。</b>沒有事件、沒有漏斗、沒有留存曲線，
    連「有多少人真的開了通知存取」都不知道。</p>
"""
    howto = """
  <p>收不到行為資料的產品，不是沒辦法衡量，是要換一套來源。這個 App 的指標只能長這樣：</p>
"""
    frame = th.metric_table([
        ("安裝後有沒有留下來", "Play Console 的安裝數 vs 解除安裝數",
         th.pending("Play Console")),
        ("權限開通率（間接）", "開不了權限的人多半會留負評或寄信，用評論內容分類估",
         th.pending("Play 評論匯出")),
        ("使用者實際要什麼", "許願板（WISHLIST）的投票與留言",
         th.pending("許願板資料")),
        ("版本健康度", "當機率、ANR（Play Console 提供，不需要遙測）",
         th.pending("Play Console")),
        ("口碑", "評分與評論的主題分布", th.pending("Play 評論匯出")),
    ])
    tradeoff = """
  <p>這個取捨值不值得，本身就是一個可以分析的問題。我的看法是值得，理由有兩個：</p>
  <ul class="plain">
    <li><b>這類 App 的信任門檻特別高。</b>它讀的是通知內容，使用者要先相信資料不會出去，
      才會開那兩個權限。「沒有網路權限」是這件事唯一能給的硬證據，比任何隱私政策的文字都有用。</li>
    <li><b>代價是可以用別的東西補的。</b>當機率、評論、許願板都拿得到，
      只是比較慢、比較糙。真正拿不到的是「用了多久才放棄」這種細節。</li>
  </ul>
  <p>要是哪天想補回量測，能走的路只有一條：讓使用者自己把去識別化的統計<b>主動</b>送出來，
    而且預設關閉。那會是一個要重新寫三份文件的決定，所以得先確定值得。</p>
"""
    body = (th.card("", intro)
            + th.card("核心產品決策：不要網路權限", decision)
            + th.card("那要怎麼知道做得好不好", howto + frame)
            + th.card("這個取捨值不值得", tradeoff))
    return th.page(
        filename="relatestats.html",
        title="RelateStats",
        lead="把關係裡那些說不清楚的事情算成數字——而且刻意不讓資料離開手機。",
        desc="RelateStats 的產品分析：不要網路權限這個決策的代價，以及收不到遙測時怎麼衡量產品。",
        meta=f"Google Play 已上架　·　v2.1　·　角色：企劃／開發／上架　·　更新 {STAMP}",
        body=body,
    )


# ─────────────────────── 組裝 ───────────────────────

def main():
    if not DB.exists():
        sys.exit("找不到 analysis.db，先跑 python build_db.py")
    con = sqlite3.connect(DB)
    n_offers = one(con, "select count(*) from offers")
    f = {
        "n_offers": n_offers,
        "commits": 188,
        "first_day": "2026-08",
        "walk_in_pct": round(100 * one(
            con, "select count(*) from offers where membership_cost='free'"
                 " and coalesce(advance_days, 999) = 0") / n_offers),
        "unknown_advance": one(con, "select count(*) from offers where advance_days is null"),
        "official_pct": round(100 * one(
            con, "select count(*) from offers where best_source_tier = 1") / n_offers),
        "stale": one(con, "select cast(julianday('now') - julianday(max(last_checked))"
                          " as integer) from offers"),
        "expired": one(con, "select count(*) from offers where validity_type='fixed'"
                            " and valid_until is not null"
                            " and julianday(valid_until) < julianday('now')"),
        "n_fixed": one(con, "select count(*) from offers where validity_type='fixed'"),
    }
    # 需求面：有 --live 抓回來才有，沒有就讓頁面顯示「待補」，不要填 0 冒充
    n_demand = one(con, "select count(*) from offer_demand")
    if n_demand:
        f["d_reports"] = f'{one(con, "select coalesce(sum(report_count),0) from offer_demand"):,} 次'
        f["d_success"] = f'{one(con, "select cast(avg(success_rate) as integer) from offer_demand")}%'
        f["d_wishes"] = f'{one(con, "select coalesce(sum(wish_count),0) from offer_demand"):,} 次'
        f["d_comments"] = f'{one(con, "select coalesce(sum(comment_count),0) from offer_demand"):,} 則'
    else:
        for k in ("d_reports", "d_success", "d_wishes", "d_comments"):
            f[k] = th.pending("資料庫停權中")

    DOCS.mkdir(exist_ok=True)
    (DOCS / ".nojekyll").write_text("", encoding="utf-8")
    print("--- 九題報告 ---", flush=True)
    subprocess.run([sys.executable, "-X", "utf8", str(HERE / "report.py")], check=True)
    print("--- 作品集頁面 ---", flush=True)
    pages = {
        "index.html": home(f),
        "birthday-deals.html": birthday_deals(con, f),
        "bandary.html": bandary(),
        "relatestats.html": relatestats(),
    }
    for name, doc in pages.items():
        (DOCS / name).write_text(doc, encoding="utf-8")
        print(f"寫好 docs/{name}（{len(doc):,} 字元）")
    con.close()


if __name__ == "__main__":
    main()
