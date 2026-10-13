# 邊緣快取 Worker（offers-cache.js）

讓所有訪客共用同一份優惠清單，Supabase 每 10 分鐘只被打一次。

## 為什麼需要

| | 每位訪客都查 | 有這層快取 |
| --- | --- | --- |
| 一小時 1,000 位訪客 | Supabase 被打 1,000 次 | **6 次** |
| Supabase 掛掉時 | 整頁變成內建示範資料、回報次數都是 0 | **照常顯示優惠**（最後一份好資料，最多頂 24 小時） |

前端的 `localStorage` 快取只能讓「同一台裝置 10 分鐘內」不重複查；新訪客還是每人各查一次。
這一層是大家共用的那一層。

---

## 部署（Cloudflare 儀表板，約 3 分鐘）

**不會動到現在的網站。** 這是一支**獨立的新 Worker**，現有的
`birthdaydeals.celine-fu-work.workers.dev` 完全不用碰。

> **已經部署過、只是要更新的話**：Cloudflare 儀表板 → Workers & Pages →
> `birthdaydeals-api` → **Edit code** → 把 `offers-cache.js` 整個貼上去蓋掉 →
> **Deploy**。前端不用改——`/board` 還沒上線時網站會自己退回原本的查詢，
> 上線後就自動開始用。

1. Cloudflare 儀表板 → **Workers & Pages** → **Create** → **Start with Hello World!** → Deploy
2. 名字取 `birthdaydeals-api`（網址會是 `https://birthdaydeals-api.<你的帳號>.workers.dev`）
3. 進去按 **Edit code**，把 `offers-cache.js` 的內容整個貼上去，蓋掉原本的 → **Deploy**
4. 打開 `https://birthdaydeals-api.<你的帳號>.workers.dev/health`，看到 `{"ok":true,…}` 就成功了
5. 編輯 `config.js`（跟 `index.html` 放在一起的那支），**加一行**：

   ```js
   window.OFFERS_API = "https://birthdaydeals-api.<你的帳號>.workers.dev";
   ```

6. 重新上傳 `config.js`

沒加第 5 步的話，網站行為跟現在完全一樣（直接問 Supabase），所以可以先部署 Worker、
確認 `/offers` 回得出東西，再決定要不要切過去。

### 金鑰

程式裡已經帶了 Supabase 網址與 anon key——那一把本來就是公開的（前端 `config.js`
裡就有，真正把關的是資料庫的 RLS）。想改用環境變數的話，到 Worker 的
**Settings → Variables** 加：

| 名稱 | 值 |
| --- | --- |
| `SUPABASE_URL` | `https://lgshwappyjgnzfkwncjk.supabase.co` |
| `SUPABASE_ANON_KEY` | 跟 `config.js` 裡的 `anonKey` 一樣 |

有設就用設的，沒設就用程式裡的預設值。

### 用 wrangler 的話

```toml
# wrangler.toml
name = "birthdaydeals-api"
main = "offers-cache.js"
compatibility_date = "2026-01-01"
```

```bash
npx wrangler deploy
```

---

## 端點

| 路徑 | 回傳 | 快取 |
| --- | --- | --- |
| `/` | 用瀏覽器打開是一張狀態頁（現在正不正常、快取熱不熱）；用程式打是 `{ok:true,…}` | 不快取 |
| `/offers` | `{at, data:[…已上架的優惠]}` | 10 分鐘 |
| `/stats` | `{at, data:{…站台數據}}` | 10 分鐘 |
| `/board` | `{at, data:{…排行榜那頁要的 14 份公開統計}}` | 10 分鐘 |
| `/boot` | `{at, data:{announcement, flags}}`（開場那兩筆）| **60 秒** |
| `/health` | `{ok:true, now}` | 不快取 |

### `/boot` 為什麼只有 60 秒

因為 `site_settings` 是管理員在後台即時調的開關——關掉某個東西不該等十分鐘才在
訪客那邊生效。60 秒已經足夠把「每位新訪客都問一次」壓成「每分鐘問一次」。

加它的理由跟 `/board` 不一樣：**Log Ingestion 也超額了（1.5 / 1 GB）**，
而那個計費看的是**請求次數**不是大小。每位新訪客開場至少三個請求
（公告、顯示開關、記一筆 pageview），前兩個每個人拿到的都一模一樣。
接上去之後開場從 3 個請求變 1 個（只剩 pageview）。

### `/board` 是後來加的，為什麼

2026-10-12 看到 Supabase 免費方案的 **Egress 5.04 / 5 GB（已超）**。量出來：
每開一次排行榜就是 **14 個請求、32KB**（gzip 後的真實線上流量）直接打 Supabase；
優惠頁跟「我的」幾乎是 0——因為優惠早就走這支 Worker 了。所以那 5GB 就是排行榜。

這 14 份全部是公開統計，每個人看到的都一樣（排行榜雖然是 `security_invoker` 的
view，但底下 `usage_reports` 的讀取政策是 `using(true)`、`profiles_public` 也公開，
登入與否拿到同一份；「哪一列是我」是前端自己比對出來的，不在資料裡）。

**刻意沒收進來的**：即時在線人數（快取了就不即時，而且只有幾十個 byte）、
本月／本週排行榜（跟著使用者選的期間變）、任何跟登入者有關的查詢。

接上去之後實測：排行榜那一頁對 Supabase 的請求從 **14 → 1**（只剩在線人數）。

直接點開 Worker 的網址（根目錄）會看到那張狀態頁——不是錯誤訊息。
併進主站 worker（有 `ASSETS` 繫結）時根目錄照常是網站首頁，狀態頁不會蓋掉它。

回應會帶 `x-cache: HIT｜MISS｜STALE`，想確認有沒有真的命中就看這個標頭：

```bash
curl -sI https://birthdaydeals-api.<你的帳號>.workers.dev/offers | grep -i x-cache
```

`STALE` 代表 Supabase 當下有問題，正在用上一份好資料頂著（同時會帶
`x-upstream-error` 說明原因）。

---

## 會不會超過免費額度

Workers 免費方案是**每天 10 萬次請求**。加了這支之後，每位訪客多 1～2 次請求
（優惠清單、站台數據），而且瀏覽器自己也會快取 10 分鐘。以目前的量（一天約
數千到上萬次造訪）離上限還很遠；真的逼近了再升級 $5／月的方案。

CPU 方面：命中快取的路徑幾乎不花 CPU（不解析 JSON，直接把 body 轉傳），
免費方案每次呼叫 10ms 的限制綽綽有餘。
