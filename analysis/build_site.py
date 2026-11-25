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

import os
import sqlite3
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import charts as ch
import theme as th

HERE = Path(__file__).resolve().parent
# 作品集的產出位置＝個人網頁 repo 的 work/。
# 個人網頁是門面，作品集從它的漢堡選單點進去，所以兩個放同一個站、同一個 repo。
# 這支程式還是留在壽星日這邊，因為它要讀 analysis.db、../ml、../geo。
# 要換地方輸出就設環境變數 PORTFOLIO_OUT。
SITE_REPO = Path(os.environ.get("PORTFOLIO_OUT")
                 or HERE.parent.parent.parent / "celine.fu")
DOCS = SITE_REPO / "work"
# 舊網址（壽星日 repo 的 Pages）留轉址頁，之前發出去的連結才不會壞
OLD_DOCS = HERE.parent / "docs"
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
        th.stat("分析過的優惠", f'{f["n_offers"]} 筆', "加上 4,734 家門市與 11,205 次收藏"),
    ])

    cases = "".join([
        th.case_card(
            "birthday-deals.html", "壽星日 Birthday Deals",
            "台灣各品牌的生日優惠，可以篩選、收藏、記錄自己省下多少。",
            [f'供給面：{f["n_offers"]} 筆優惠的價值、門檻、縣市覆蓋，九支 SQL 問完',
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
    work = th.case_card(
        "billing-forecast.html", "機電工程請款預估與現金流",
        "一個 4,242 萬的機電工程案，追四期請款、23 家下包、到 2028 年的現金流。",
        ["手上 528 萬看起來是賺的，扣掉預收訂金與兩邊卡住的保留款，實質是 −51 萬",
         "每收 100 元的估驗要付出去 86 元——施工期墊錢不是虧損，是在還簽約時收的訂金",
         "順便抓出四個待確認：240 萬間接工程費沒進任何一期、保留款被雙扣 59,728 等"],
        "本業・真實專案（已去識別化）")

    projects = "".join([
        th.case_card(
            "ml-autofill.html", "投稿欄位自動預填",
            "拿 581 筆已標註的優惠訓練文字分類器，讓投稿審核先填好三個欄位。",
            ["優惠型態：準確率 81.7%，六成的投稿可以自動填、其中 92.4% 正確",
             "入會方式做不起來——優惠文字裡根本沒寫怎麼入會，所以只敢填一成",
             "類別的瓶頸是分類法：把餐飲細類合併，準確率從 57.8% 跳到 69.5%"],
            "機器學習／文字分類"),
        th.case_card(
            "venue-clusters.html", "自動找出商圈",
            "21,209 家店的座標分群，用 148 個人工商圈驗收。",
            ["對上人工商圈 79.7%，另外補出台中、台南、彰化這些手工沒做到的",
             "對不上的 30 個全是郊區購物中心——方法的邊界，不是模型不好",
             "BallTree 比暴力法快 21 倍，才掃得完 12 組參數"],
            "非監督學習／空間索引"),
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
    <li><b>機器學習。</b>文字分類（TF-IDF ＋ 羅吉斯迴歸）、類別不平衡、
      交叉驗證與 baseline 對照、信心門檻換覆蓋率、消融實驗抓資料洩漏，
      以及一張寫清楚弱點的 model card。重點不是模型多強，是知道哪些任務不該做。</li>
  </ul>
"""

    contact = f"""
  <p>這些產品都還在線上跑：<a href="{SITE_URL}">壽星日</a>（免費方案，人多的時候會慢幾秒）。
    程式碼在 <a href="https://github.com/afortunadofu-bot/birthday-deals">GitHub</a>。</p>
  <p>想聊聊或要更完整的資料，信箱是 <code>celine.fu@gmail.com</code>。</p>
"""

    body = (th.card("", how) + tiles
            + th.card("三個產品", cases)
            + th.card("本業的分析工作", work)
            + th.card("資料與 ML 專題", projects)
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
         f'{f["n_offers"]} 筆（{f["data_date"]}）'),
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

    q10 = q(con, (HERE / "queries" / "10_demand_vs_supply.sql").read_text(encoding="utf-8"))
    short = [r for r in q10 if (r["gap"] or 0) > 0]
    over = [r for r in q10 if (r["gap"] or 0) < 0]
    # 用百分點挑「缺口最大」會偏袒本來就大的類別（餐廳佔四成，差 6pp 其實只差 1.15 倍），
    # 所以標題改用需求／供給的倍數，圖還是畫百分點。
    top_short = max(short, key=lambda r: (r["wish_share"] or 0) / (r["supply_share"] or 1))
    top_over = over[-1]
    drink = next((r for r in q10 if r["category"] == "飲料"), None)
    users = f"""
  <p>收藏、回報、留言這三種行為，每筆優惠的彙總在線上四支公開 view 裡就拿得到
    （<code>offers_public</code>、<code>wishlist_counts</code> 等），不需要管理員權限。
    目前累積 {f["d_wishes"]}收藏、{f["d_reports"]}回報，
    {f["n_reported"]} 筆優惠至少有一個人回報用過。</p>
  <h3>做最多的類別，不是最多人想要的類別</h3>
  <p>把每個類別的<b>供給占比</b>（優惠數）減掉<b>需求占比</b>（收藏數），
    就看得出選題有沒有押對。正的是想要的人比供給多，負的是做太多。</p>
  {ch.diverging_hbar(q10, label="category", value="gap", unit=" pp", label_w=84,
                     pos_note="供給不足（該補）", neg_note="供給過剩",
                     title="各類別的需求占比減供給占比")}
  <p><b>{th.esc(top_short["category"])}是最明顯的缺口</b>：只佔 {top_short["supply_share"]}%
    的優惠數，卻吃掉 {top_short["wish_share"]}% 的收藏，需求是供給的
    {round((top_short["wish_share"] or 0) / (top_short["supply_share"] or 1), 1)} 倍。飲料是另一種缺口：供給 {drink["supply_share"]}%，
    收藏沒有特別多，<b>回報占比卻有 {drink["report_share"]}%</b>，
    是最常真的被拿去用的類別。反過來 {th.esc(top_over["category"])} 供給
    {top_over["supply_share"]}%、收藏只有 {top_over["wish_share"]}%，
    下一批不用再往那邊找。</p>
  <p>這跟我自己對使用者的判斷對得上（上班族、愛「賺到」的感覺、
    會收專櫃滿額禮跟美妝的買多折），差別是現在有數字撐著，不只是直覺。</p>
  <h3>兌換成功率 {f["d_success"]}，維運清單只有四筆</h3>
  <p>回報「我用過了」的時候可以標成功或失敗。整體成功率 {f["d_success"]}，
    回報三次以上、成功率低於 80% 的只有 4 筆——那幾筆是資料寫錯或品牌偷改規則，
    排進下一輪複查就好。這個數字比我預期的高，代表人工整理的品質撐得住。</p>
  <h3>還缺的那一半</h3>
  <p>漏斗（到站 → 點開 → 外連 → 回報）跟回訪還沒有，因為事件表
    <code>site_events</code> 是管理員限定，anon key 讀不到。回訪對這個產品特別重要：
    生日一年一次，要看的是「隔年還會不會回來」，次日留存在這裡沒有意義。</p>
  <p class="note">公開的只有彙總。個人層級的事件不離開資料庫，也不進版控。</p>
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
    <li><b>漏斗與回訪還沒有。</b>事件表是管理員限定，要另外匯出才算得了
      「到站 → 點開 → 外連 → 回報」這條路徑，以及隔年的回訪率。</li>
    <li><b>門市資料只蓋到 117 個品牌。</b>Google Places 那份是 2026-09 抓的，
      之後新增的品牌沒有門市數，所以 Q7 的散佈圖只有那批老品牌。</li>
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
    work = f"""
  {th.stats([
      th.stat("已上架", "1.121.2", "Google Play，2026-05 開始做"),
      th.stat("程式規模", "59,526 行", "197 個 Kotlin 檔（2026-11-25 實測）"),
      th.stat("回饋管道", "App 內建", "表單直接寫進 Firestore，含 1–5 星滿意度"),
      th.stat("後台", "自己做的", "使用者數、活躍度、Pro 轉換、內容統計"),
  ])}
  <h3>回饋是自己收的，不是等 Play 評論</h3>
  <p>Play 的評論量少又慢，而且只有已經很不爽或很喜歡的人會留。所以 App 裡做了
    「我的 → 支持與回饋 → 意見回饋」，送出直接寫進 Firestore 的
    <code>feedback</code>：分類（bug／功能／其他）、內容、<b>1–5 星滿意度</b>、
    選填聯絡方式。滿意度那一欄是刻意加的——沒有它，回饋只能讀，不能算。</p>
  <p>收集方式跟統計口徑寫在 <code>docs/USER_FEEDBACK.md</code>：
    平均滿意度怎麼算、NPS 近似值怎麼換算、每期要更新哪幾節，
    還有一張「使用者說了什麼 → 哪一版改了什麼 → 之後反應」的迭代表。
    <b>表格目前是空的</b>，因為還沒有匯出資料來填——這就是這一頁待補的那一塊。</p>
  <h3>產出的不只是 App</h3>
  <ul class="plain">
    <li><code>PORTFOLIO.md</code>　產品定位、功能總覽、架構、技術決策、專案數據</li>
    <li><code>USER_FEEDBACK.md</code>　回饋收集與滿意度追蹤的方法</li>
    <li><code>ROADMAP.md</code>　功能排序</li>
    <li><code>PLAY_STORE_COPY.md</code>、<code>COPY_GUIDE.md</code>　商店文案與全站文案規範</li>
    <li><code>CONSOLE_SETUP.md</code>、<code>PLAY_RELEASE.md</code>　雲端設定與上架流程</li>
  </ul>
  <p class="note">App 連結：<a href="https://play.google.com/store/apps/details?id=com.bandary.app">Google Play</a></p>
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
            + th.card("已經做出來的東西", work)
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
    work = f"""
  {th.stats([
      th.stat("已上架", "1.1.12", "Google Play，versionCode 119"),
      th.stat("程式規模", "16,513 行", "Kotlin + Compose（2026-11-25 實測）"),
      th.stat("網路權限", "沒有", "連 INTERNET 都沒宣告"),
      th.stat("隱私權政策", "公開頁", "另開一個 repo 放，App 內可直接開"),
  ])}
  <h3>一條規則，牽動五份文件</h3>
  <p>「資料傳不出這支手機」不是一句行銷話，是同時寫在五個地方的承諾：</p>
  <ul class="plain">
    <li>隱私權政策（<code>docs/privacy-policy.html</code>，另有公開網頁版）</li>
    <li>Play Console 的資料安全性（Data safety）申報</li>
    <li>無障礙 API 使用聲明（這支 App 靠無障礙服務讀通知）</li>
    <li>商店的簡短說明與完整說明</li>
    <li>App 內的權限揭露對話框</li>
  </ul>
  <p>所以開發守則裡直接寫死：<b>不要加 <code>INTERNET</code> 權限</b>。
    加了，這五個地方全部要重寫、重新申報。這條規則的代價就是上面那張表——
    產品端一筆遙測都收不到。</p>
  <h3>許願板只好做成外部網頁</h3>
  <p>使用者想要「看別人許了什麼願、互相投票」。做在 App 裡就要連線，
    而且 Play 對使用者自建內容另有要求（檢舉、封鎖、審核），沒做會被拒。
    最後的解法是：許願板是一個<b>一般網頁</b>，App 只丟一個
    <code>ACTION_VIEW</code> 給瀏覽器，跟開隱私權政策同一條路，App 本身完全不連線。</p>
  <p>這是一個約束一路往下傳的實例：一句承諾 → 五份文件 → 一個不能做在 App 裡的功能
    → 一個繞道的設計。寫在 <code>docs/WISHLIST.md</code>。</p>
  <p class="note">App 連結：<a href="https://play.google.com/store/apps/details?id=com.relatestats.app">Google Play</a>　·　
    <a href="https://afortunadofu-bot.github.io/relatestats-privacy/">隱私權政策</a></p>
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
            + th.card("已經做出來的東西", work)
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


# ───────────────────── ML：投稿欄位自動預填 ─────────────────────

ML_METRICS = HERE.parent / "ml" / "metrics.json"


def ml_autofill():
    """讀 ../ml/metrics.json 產出案例頁；還沒訓練過就不產這一頁。"""
    if not ML_METRICS.exists():
        return None
    import json
    m = json.loads(ML_METRICS.read_text(encoding="utf-8"))
    tasks = {x["task"]: x for x in m["tasks"]}
    ab = {a["task"]: a for a in m.get("ablations", [])}
    ft, mt, cat = tasks["free_tier"], tasks["membership_type"], tasks["category"]

    intro = f"""
  <p class="lede">壽星日的優惠有一部分是使用者投稿的。送進來是一段自由文字，
    但資料庫裡「優惠型態／入會方式／類別」三欄是編碼過的選項，現在靠人一筆一筆判斷。
    這個模型的工作不是取代判斷，是<b>把有把握的那些先填好</b>，其餘留白。</p>
  <p>訓練資料是 {ft["n"]} 筆已經標好的優惠，輸入只用投稿當下就有的東西：
    品牌名、優惠內容、條件。五折交叉驗證，所有數字都是 out-of-fold 算的。</p>
"""

    rows = []
    for x in (ft, mt, cat):
        op = x.get("operating_point") or {}
        rows.append(
            f'<tr><th scope="row">{th.esc(x["title"])}</th>'
            f'<td>{x["n"]} 筆 / {x["n_classes"]} 類</td>'
            f'<td>{x["baseline_accuracy"]}%</td>'
            f'<td><b>{x["accuracy"]}%</b></td>'
            f'<td>{x["macro_f1"]}</td>'
            f'<td>{op.get("coverage", "—")}%</td>'
            f'<td>{op.get("accuracy", "—")}%</td></tr>')
    table = ('<table class="metrics"><thead><tr><th>欄位</th><th>資料</th>'
             '<th>baseline</th><th>準確率</th><th>macro-F1</th>'
             '<th>自動填覆蓋率</th><th>自動填準確率</th></tr></thead>'
             f'<tbody>{"".join(rows)}</tbody></table>')

    lift = [{"t": x["title"], "lift": round(x["accuracy"] - x["baseline_accuracy"], 1)}
            for x in (ft, mt, cat)]
    result = f"""
  <p>baseline 是「永遠猜最大宗的那一類」。581 筆是小資料，不先釘住這條線，
    很容易把「猜對多數類」當成學會了。三個任務都贏過 baseline，但贏的幅度差很多。</p>
  {table}
  <p class="caption">比 baseline 多出來的百分點</p>
  {ch.hbar(lift, label="t", value="lift", unit=" pp", label_w=84,
           title="三個任務比 baseline 進步多少")}
  <p>模型本身是字元 n-gram TF-IDF ＋ 羅吉斯迴歸（平衡類別）。
    比過 ComplementNB 跟校準過的線性 SVM，三個任務都是這組 macro-F1 最高。
    不斷詞是刻意的：中文斷詞器對「大麥克或勁辣雞腿堡＋小薯$89」這種混了品名、
    數字、符號的句子常切壞，字元 2–4 gram 反而穩。</p>
"""

    op = ft["operating_point"]
    pts = [{"cov": c["coverage"], "acc": c["accuracy"], "th": f'門檻 {c["threshold"]}'}
           for c in ft["coverage"] if c["accuracy"] is not None]
    tradeoff = f"""
  <p>模型不需要每一筆都答。只要「有把握的那些」夠準，就可以自動預填，
    其餘留白給人。所以真正要挑的不是準確率，是<b>門檻</b>：
    信心超過多少才敢填。</p>
  <p class="caption">優惠型態：每一點是一個信心門檻，橫軸是會自動填的比例，
    縱軸是這些自動填的準確率</p>
  {ch.scatter(pts, x="cov", y="acc", name="th", log_x=False,
              xlabel="覆蓋率（%）", ylabel="準確率（%）",
              xticks=[0, 20, 40, 60, 80, 100],
              annotate=[(f'門檻 {op["threshold"]}', -9, -8)],
              title="覆蓋率與準確率的取捨")}
  <p>選的是<b>門檻 {op["threshold"]}：{op["coverage"]}% 的投稿會被自動填，
    這些填的 {op["accuracy"]}% 是對的。</b>挑法是「自動填的至少九成正確之下，
    覆蓋率最大」。九成是自己定的——預填錯一欄的代價是審稿的人改回來，不是災難；
    如果這個欄位錯了會直接影響使用者，門檻要再拉高。</p>
  <p>另外兩個欄位用同一條規則挑，結果是入會方式只敢填 {mt["operating_point"]["coverage"]}%、
    類別只敢填 {cat["operating_point"]["coverage"]}%。這就是下一節的事。</p>
"""

    cm_rows = []
    for lab, row in zip(cat["labels"], cat["confusion"]):
        d = {"真實": lab}
        d.update({c: n for c, n in zip(cat["labels"], row)})
        cm_rows.append(d)
    honest = f"""
  <h3>入會方式這個任務，不該用這組特徵做</h3>
  <p>準確率 {mt["accuracy"]}%，比 baseline 的 {mt["baseline_accuracy"]}% 好，
    但按門檻只敢自動填 {mt["operating_point"]["coverage"]}%——九成的投稿還是得人填。
    原因很單純：<b>優惠文字裡通常根本沒寫怎麼入會</b>，模型只能從品牌名猜。</p>
  <p>要證明這點可以做個反面實驗：把 <code>membership</code> 那欄自由文字
    （「麥當勞 APP 會員」）也餵進去，準確率立刻從 {ab["membership_type"]["before"]["accuracy"]}%
    跳到 {ab["membership_type"]["after"]["accuracy"]}%。但那是作弊——那一欄跟答案是
    同一個人在同一個畫面填的，投稿當下還不存在。
    <b>會跳 {round(ab["membership_type"]["after"]["accuracy"] - ab["membership_type"]["before"]["accuracy"], 1)}
    個百分點，正好說明這個資訊只能從別的地方來</b>，例如品牌官網或同集團既有品牌。</p>
  <h3>類別的瓶頸是分類法，不是模型</h3>
  <p>類別只有 {cat["accuracy"]}%。看混淆矩陣就知道錯在哪：火鍋、燒肉、速食、甜點
    全部往「餐廳」跑。這四類在語意上互相包含——燒肉店也是餐廳，人在標的時候也會猶豫。</p>
  <p>把餐廳／火鍋／燒肉／速食合併成「餐飲」再分一次，準確率從
    {ab["category"]["before"]["accuracy"]}% 跳到 {ab["category"]["after"]["accuracy"]}%。
    <b>那 {round(ab["category"]["after"]["accuracy"] - ab["category"]["before"]["accuracy"], 1)}
    個百分點是分類法要負的責任，不是模型不夠強。</b>
    產品上的選擇因此變成：要嘛接受細類只能半自動，要嘛重新設計分類（例如主類＋子標籤）。</p>
  <p class="caption">類別的混淆矩陣（橫軸是模型猜的，直軸是實際的；對角線才是對的）</p>
  {ch.heat_table(cm_rows, row_label="真實", cols=[(c, c) for c in cat["labels"]])}
"""

    use = """
  <ul class="plain">
    <li><b>預填，不自動送出。</b>模型填好的欄位還是要人按確認。信心低於門檻的留白，
      不要填一個「看起來合理」的值——審稿的人會信它。</li>
    <li><b>把信心值留在資料庫裡。</b>之後可以回頭算「模型填的 vs 人改掉的」，
      那是真正的線上指標，比交叉驗證誠實。</li>
    <li><b>定期重訓。</b>資料每個月都在長，重訓一次 20 秒。</li>
    <li><b>不要拿去跑別的網站的優惠。</b>訓練資料全部是壽星日自己的寫法。</li>
  </ul>
  <p class="note">完整的限制與不該拿它做什麼，寫在
    <a href="https://github.com/afortunadofu-bot/birthday-deals/blob/main/ml/MODEL_CARD.md">model
    card</a>。程式在 <code>ml/</code>：<code>dataset.py</code>、<code>train.py</code>、
    <code>predict.py</code>，裝好 scikit-learn 就能重跑。</p>
"""

    body = (th.card("", intro)
            + th.card("結果：三個任務，差很多", result)
            + th.card("真正要挑的是門檻，不是準確率", tradeoff)
            + th.card("兩件做不起來的事，以及為什麼", honest)
            + th.card("產品上怎麼用", use))
    return th.page(
        filename="ml-autofill.html",
        title="投稿欄位自動預填",
        lead="把人工判斷的三個欄位交給分類器，沒把握的留白——以及兩個做不起來的任務。",
        desc="用 581 筆已標註的生日優惠訓練文字分類器，做投稿審核的欄位預填；"
             "含 baseline 對照、信心門檻與覆蓋率取捨、兩個消融實驗。",
        meta=f"資料 {ft['n']} 筆　·　scikit-learn ＋ 五折交叉驗證　·　更新 {STAMP}",
        body=body,
    )


# ───────────────────── 商圈自動分群（好康地圖的 OSM 店家）─────────────────────

GEO_METRICS = HERE.parent / "geo" / "metrics.json"


def venue_clusters():
    if not GEO_METRICS.exists():
        return None
    import json
    g = json.loads(GEO_METRICS.read_text(encoding="utf-8"))
    ch_sel = g["chosen"]
    b = g["benchmark"]

    intro = f"""
  <p class="lede">好康地圖收的是全台的優惠，而使用者真正在問的是「我附近有什麼」。
    壽星日那邊已經有 {g["n_manual"]} 個<b>人工</b>圈出來的商圈——名字、中心點、半徑
    都是一個一個手工定的——但手工只做得動雙北跟幾個大城市。</p>
  <p>這一題：拿 {g["n_stores"]:,} 家店的座標自動分群，看能不能長出商圈，
    再用那 {g["n_manual"]} 個人工商圈當對照組驗收。非監督學習最容易自我感覺良好，
    有人工標準可以對的時候就該對。</p>
"""

    grid_rows = "".join(
        f'<tr><th scope="row">{r["eps_m"]} m / {r["min_samples"]}</th>'
        f'<td>{r["n_clusters"]}</td><td>{r["store_coverage"]}%</td>'
        f'<td>{r["manual_recall"]}%</td><td>{r["median_stores"]}</td></tr>'
        for r in g["grid"])
    method = f"""
  <p>DBSCAN，距離用 haversine（球面距離，不是把經緯度當平面座標），
    底層走 BallTree。兩個參數要掃：<code>eps</code> 是「多近算鄰居」，
    <code>min_samples</code> 是「幾家店才算一群」。</p>
  <p>另外加一條領域規則：<b>一個商圈至少要有 {g["min_brands"]} 個不同品牌</b>。
    只看密度會把同一條街的五家 50嵐 當成商圈，但那不是商圈，那是展店策略。</p>
  <table class="metrics"><thead><tr><th>eps / min_samples</th><th>群數</th>
    <th>收進多少店</th><th>對上人工商圈</th><th>每群中位店數</th></tr></thead>
    <tbody>{grid_rows}</tbody></table>
  <p><b>半徑放大，反而對不上。</b>eps 從 150 m 拉到 300 m，收進的店從 50% 升到 78%，
    但對上人工商圈的比例從 79.7% 掉到 33.8%——因為相鄰的街區被黏成一大塊，
    重心飄離原本的商圈中心。這條曲線不是「越大越好」，是有甜蜜點的。</p>
  <p>最後選 <b>eps = {ch_sel["eps_m"]} m、min_samples = {ch_sel["min_samples"]}</b>：
    對上人工的比例最高，同分再取收進最多店家的。
    沒有用 silhouette 挑參數——它只看分得乾不乾淨，不管分出來的是不是商圈。</p>
"""

    tiles = th.stats([
        th.stat("自動找到的商圈", f'{g["n_clusters"]:,} 個', f'人工有 {g["n_manual"]} 個'),
        th.stat("對上人工商圈", f'{g["manual_recall"]}%',
                f'{g["manual_hit"]} / {g["n_manual"]} 個'),
        th.stat("收進的店家", f'{g["store_coverage"]}%',
                f'{g["n_stores"]:,} 家裡的一半'),
        th.stat("silhouette", f'{g["silhouette"]}', "分群本身的緊密程度"),
    ])
    county = [{"c": r["county"], "gap": r["gap"]} for r in g["counties"][:14]]
    result = f"""
  {tiles}
  <p class="caption">自動商圈數減人工商圈數，各縣市</p>
  {ch.hbar(county, label="c", value="gap", label_w=76, row_h=24, bar_h=14,
           title="自動比人工多找到幾個商圈")}
  <p><b>人工漏掉的全在雙北以外。</b>台中人工只有
    {next(r["manual"] for r in g["counties"] if r["county"] == "台中市")} 個、
    自動找到 {next(r["auto"] for r in g["counties"] if r["county"] == "台中市")} 個；
    台南 {next(r["manual"] for r in g["counties"] if r["county"] == "台南市")} 對
    {next(r["auto"] for r in g["counties"] if r["county"] == "台南市")}。
    這正是自動化的用處——不是取代那 {g["n_manual"]} 個手工的，是把其他縣市補起來。</p>
"""

    miss_rows = "".join(
        f'<tr><th scope="row">{th.esc(m["name"])}</th><td>{th.esc(m["county"])}</td>'
        f'<td>{m["distance_m"]:,} m</td></tr>' for m in g["misses"][:8])
    limits = f"""
  <p>{g["manual_miss"]} 個人工商圈沒被對上。把它們列出來之後，型態很一致：</p>
  <table class="metrics"><thead><tr><th>人工商圈</th><th>縣市</th>
    <th>最近的自動群有多遠</th></tr></thead><tbody>{miss_rows}</tbody></table>
  <p><b>幾乎全是郊區的大型購物中心</b>（Outlet、夢時代、萬家福、秀泰）。
    它們周圍沒有密集的店家，密度法當然抓不到——一棟樓裡有五十家店，
    但在地圖上那是一個點。</p>
  <p>所以結論不是「模型不夠好」，是<b>商圈有兩種</b>：街區型（靠密度）
    跟單點型（一棟建築就是一個商圈）。後者要用別的訊號，例如 OSM 的
    <code>shop=mall</code> 標籤或樓地板面積，密度分群本來就不該處理它。</p>
"""

    perf = f"""
  <p>分群之前要先算鄰居。{b["n"]:,} 家店兩兩比是 {b["n"] ** 2 // 2 // 1000000} 百萬次
    距離計算，暴力法 O(n²)；BallTree 把空間切成巢狀的球，查詢降到 O(log n)。</p>
  {th.stats([
      th.stat("暴力法", f'{b["brute_estimated_s"]} 秒',
              f'用 {b["brute_subset_n"]:,} 家的子集實測 {b["brute_subset_s"]} 秒再換算'),
      th.stat("BallTree", f'{round(b["balltree_build_s"] + b["balltree_query_s"], 1)} 秒',
              f'建樹 {b["balltree_build_s"]} 秒＋查詢 {b["balltree_query_s"]} 秒'),
      th.stat("快了", f'{b["speedup"]} 倍', f'每家店找最近的 {b["k"]} 家', "good"),
  ])}
  <p>這不是純理論的差別：參數要掃 12 組，每一組都要重算一次鄰居。
    用暴力法這一題要跑十分鐘以上，用 BallTree 是 24 秒——
    能不能快速試參數，直接決定你敢不敢多試幾種。</p>
"""

    use = """
  <ul class="plain">
    <li><b>先補六都以外。</b>雙北的人工商圈已經夠細，自動的價值在台中、台南、
      彰化、新竹這些手工還沒做到的地方。</li>
    <li><b>自動的當草稿，不是直接上線。</b>名字還是要人取——
      「台北市第 17 群」沒有人看得懂，「中山站・南京西路」才有用。</li>
    <li><b>郊區購物中心另外處理。</b>那 {miss} 個對不上的不要硬塞進密度分群，
      用 OSM 的 mall 標籤直接建一個點。</li>
  </ul>
  <p class="note">店家資料來自 OpenStreetMap（© OpenStreetMap contributors，ODbL），
    由好康地圖的 <code>crawler/osm_stores.py</code> 抓取；這一頁只放彙總與群中心，
    不重新散布原始資料。程式在 <code>geo/</code>。</p>
"""
    use = use.replace("{miss}", str(g["manual_miss"]))

    body = (th.card("", intro)
            + th.card("方法與參數", method)
            + th.card("結果", result)
            + th.card("對不上的那些，才是重點", limits)
            + th.card("資料結構：為什麼不能用暴力法", perf)
            + th.card("產品上怎麼用", use))
    return th.page(
        filename="venue-clusters.html",
        title="自動找出商圈",
        lead=f'{g["n_stores"]:,} 家店的座標分群，跟 {g["n_manual"]} 個人工商圈對照。',
        desc="用 DBSCAN 在 21,209 家店的座標上自動長出商圈，以 148 個人工商圈驗收，"
             "並比較 BallTree 與暴力法的效能。",
        meta=f'資料：OpenStreetMap 店家 {g["n_stores"]:,} 家（ODbL）＋'
             f'壽星日人工商圈 {g["n_manual"]} 個　·　更新 {STAMP}',
        body=body,
    )


def write_stats(con, f):
    """吐一份 stats.json 給其他兩個站（個人網頁、小數據所品牌頁）抓。

    三個站都在 afortunadofu-bot.github.io 底下，同源，所以它們可以直接 fetch
    這一份，不需要 CORS、不需要後端。數字只有這裡算一次，其他站不要再自己寫死——
    寫死的數字一定會過期，而過期的數字比沒有數字糟。"""
    import json
    ml = {}
    if ML_METRICS.exists():
        m = json.loads(ML_METRICS.read_text(encoding="utf-8"))
        best = max(m["tasks"], key=lambda x: x["accuracy"])
        ml = {"best_task": best["title"], "accuracy": best["accuracy"],
              "baseline": best["baseline_accuracy"],
              "autofill_coverage": (best.get("operating_point") or {}).get("coverage")}
    geo = {}
    if GEO_METRICS.exists():
        g = json.loads(GEO_METRICS.read_text(encoding="utf-8"))
        geo = {"stores": g["n_stores"], "auto_venues": g["n_clusters"],
               "manual_venues": g["n_manual"], "manual_recall": g["manual_recall"]}
    stats = {
        "updated": STAMP,
        "source": "https://afortunadofu-bot.github.io/birthday-deals/",
        "note": "由 analysis/build_site.py 產生，請用 fetch 讀，不要抄成寫死的數字",
        "products": 3,
        "offers": f["n_offers"],
        "offer_data_date": f["data_date"],
        "wishes": one(con, "select coalesce(sum(wish_count),0) from offer_demand"),
        "reports": one(con, "select coalesce(sum(report_count),0) from offer_demand"),
        "success_rate": one(con, "select cast(avg(success_rate) as integer) from offer_demand"),
        "counties": one(con, "select count(*) from counties"),
        "ml": ml,
        "geo": geo,
        "pages": [{"title": t, "url": f"https://afortunadofu-bot.github.io/birthday-deals/{h}"}
                  for h, t in th.NAV],
    }
    (DOCS / "stats.json").write_text(
        json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"寫好 docs/stats.json（{len(stats['pages'])} 頁、更新 {STAMP}）")
    return stats




def write_redirects(names):
    """舊網址 /birthday-deals/<頁> → 新網址 /celine.fu/work/<頁>。

    之前貼出去的連結不能壞，所以每一頁都留一個轉址檔，不是只轉首頁。"""
    base = "https://afortunadofu-bot.github.io/celine.fu/work/"
    OLD_DOCS.mkdir(exist_ok=True)
    tpl = """<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<link rel="canonical" href="{t}">
<meta http-equiv="refresh" content="0; url={t}">
<meta name="robots" content="noindex, follow">
<title>作品集搬家了</title>
<style>body{{margin:0;min-height:100vh;display:grid;place-items:center;
background:#f9f9f7;color:#0b0b0b;font:15px/1.8 system-ui,-apple-system,
"Noto Sans TC",sans-serif;padding:24px;text-align:center}}a{{color:#2a78d6}}</style>
</head><body><div>
<p>作品集搬到個人網站底下了。</p>
<p><a href="{t}">前往新的網址 →</a></p>
<script>location.replace("{t}");</script>
</div></body></html>
"""
    for name in names:
        target = base + ("" if name == "index.html" else name)
        (OLD_DOCS / name).write_text(tpl.format(t=target), encoding="utf-8")
    print(f"舊網址留了 {len(names)} 個轉址頁 → {OLD_DOCS.name}/")


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
        "data_date": one(con, "select max(last_checked) from offers") or STAMP,
    }
    # 需求面：有 --live 抓回來才有，沒有就讓頁面顯示「待補」，不要填 0 冒充
    n_demand = one(con, "select count(*) from offer_demand")
    if n_demand:
        f["d_reports"] = f'{one(con, "select coalesce(sum(report_count),0) from offer_demand"):,} 次'
        f["d_success"] = f'{one(con, "select cast(avg(success_rate) as integer) from offer_demand")}%'
        f["d_wishes"] = f'{one(con, "select coalesce(sum(wish_count),0) from offer_demand"):,} 次'
        f["d_comments"] = f'{one(con, "select coalesce(sum(comment_count),0) from offer_demand"):,} 則'
        f["n_reported"] = one(con, "select count(*) from offer_demand"
                                   " where coalesce(report_count,0) > 0")
    else:
        for k in ("d_reports", "d_success", "d_wishes", "d_comments"):
            f[k] = th.pending("要先跑 fetch_live.py")
        f["n_reported"] = 0

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
    for name, page in (("ml-autofill.html", ml_autofill()),
                       ("venue-clusters.html", venue_clusters())):
        if page:
            pages[name] = page
    for name, doc in pages.items():
        (DOCS / name).write_text(doc, encoding="utf-8")
        print(f"寫好 docs/{name}（{len(doc):,} 字元）")
    write_stats(con, f)
    write_redirects(list(pages) + ["sql-report.html", "billing-forecast.html"])
    con.close()


if __name__ == "__main__":
    main()
