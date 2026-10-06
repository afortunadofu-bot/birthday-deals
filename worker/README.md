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
| `/offers` | `{at, data:[…已上架的優惠]}` | 10 分鐘 |
| `/stats` | `{at, data:{…站台數據}}` | 10 分鐘 |
| `/health` | `{ok:true, now}` | 不快取 |

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
