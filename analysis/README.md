# 小數據所｜產品分析作品集（的產生器）

**線上版：<https://afortunadofu-bot.github.io/birthday-deals/>**

這個資料夾是那個站的原始碼。頁面不是手寫的 HTML，是 Python 從 SQLite 查完再排出來的，
所以資料換一版、重跑一次，頁面上的數字跟結論會自己跟著換。

| 頁面 | 內容 |
|---|---|
| `index.html` | 首頁：定位、三個案例、我怎麼做產品分析 |
| `birthday-deals.html` | 壽星日：指標框架、供給面分析、成本分析、決策紀錄 |
| `bandary.html` | Bandary 聽團曆：要衡量什麼、為什麼不看下載數 |
| `relatestats.html` | RelateStats：拿不到遙測的產品怎麼衡量 |
| `sql-report.html` | 九題 SQL 報告（技術細節，每題都附 SQL） |

## 怎麼跑

```bash
python build_db.py        # 建 analysis.db
python build_site.py      # 產出整個站到 ../docs/
```

不用裝任何套件。需要 Python 3.9 以上，以及 SQLite 3.35 以上（查詢用到 window function
跟 `sqrt()`／`log10()`）；我自己跑的是 Python 3.13 + SQLite 3.50，舊版沒實測過。

資料庫恢復之後要換成線上的資料：

```bash
python fetch_live.py          # 抓線上公開 view（offers_public 等四支）
python build_db.py --live     # 用線上資料重建，順便灌入需求面彙總
python build_site.py
```

## 檔案

```
analysis/
├ build_db.py      ETL：offers.json（或線上資料）＋門市明細 → analysis.db
├ fetch_live.py    用公開的 anon key 抓線上四支 view，存到 data/live/（不進版控）
├ schema.sql       分析庫的 DDL 與兩個 view
├ queries/         01…11，一題一個 .sql，每支開頭都寫為什麼這樣問
├ charts.py        inline SVG：橫條、直條、散佈、熱度交叉表
├ theme.py         全站共用的 CSS 與頁面外殼
├ report.py        跑 01–09 → 產出九題報告
├ build_site.py    產出首頁與三個案例頁，並叫 report.py 跑一次
└ data/
   ├ store_counts.csv   品牌 × 縣市門市數（653 列，進版控）
   └ live/              線上抓回來的原始回應（不進版控）
```

## 技術重點

**統計量全部寫在 SQL 裡。** SQLite 沒有 `percentile_cont()`、沒有 `corr()`，所以：

- 中位數與四分位 → `row_number() over (partition by …)` 排序後取中間
- 累積比例 → `sum(…) over (order by … rows between unbounded preceding and current row)`
- 分組比較 → `ntile(4) over (order by n_stores)`
- 「跟第一名差幾倍」→ `max(n_offers) over ()` 當分母，不用子查詢
- 交叉表 → `sum(case when … then 1 else 0 end)` 自己 pivot
- Pearson 相關係數 → 把公式展開成 `sum(x*y)`、`sum(x*x)` 幾項，一句 SQL 算完

**Python 只做兩件事**：把巢狀 JSON 攤平成可以 join 的表，以及把查詢結果排成頁面。
沒用 pandas，也沒用 matplotlib。圖是自己產的 inline SVG（`charts.py`）：
中文字型在別台機器上常常缺、深色模式不想出兩套圖檔、報告想保持成單一個 HTML 檔。

## 資料與界線

- **優惠**：目前是 `../offers.json`（139 筆，最後查證 2026-08-04）。線上實際更多，
  但 Supabase 因為 egress 超額被停權，現在讀不到。頁面上凡是用快照的地方都標了日期。
- **門市**：Google Places 的品牌搜尋結果，本機 11,515 筆明細，對得上優惠品牌的 4,734 家。
  **原始 Places 回應不進 git**——那是 Google 的資料；版控裡只有
  `data/store_counts.csv` 這份「某品牌在某縣市有幾家店」的彙總。
- **使用者資料**：只用彙總。線上四支公開 view 給的是每筆優惠的回報數、成功率、
  留言數、收藏數；個人層級的事件（`site_events`）是管理員限定，這裡讀不到也不放。
- **還沒有的數字一律標「待補」**，不先填一個看起來合理的值。Bandary 與 RelateStats
  兩頁現在大半是待補，缺的是 Play Console 與 Firebase 的匯出。
