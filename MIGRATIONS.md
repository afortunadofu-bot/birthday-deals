# 資料庫：哪幾支要跑

celine：「為啥你現在 SQL 編號都是亂碼亂跳」。

## 為什麼會跳號

`schema_vN_*.sql` 的 **N 是版本號，不是第幾支 SQL**。每一個版本對應 `CHANGELOG.md` 裡的
一個條目，而大部分版本只改前端、沒有資料庫變更——那些版本就沒有 SQL 檔。所以會看到

```
… v80  v81  v82  v83  ⟶  v92  ⟶  v95  ⟶  v97  v98
```

中間的 v84–v91、v93、v94、v96 都是純前端（邊緣快取 Worker、愛心、圖卡、排序介面…）。

這樣編號的好處是「看到檔名就知道去 CHANGELOG 哪一段找說明」，壞處就是你看到的這個：
**跳號看起來像漏了什麼**。所以有了這一頁——要跑哪幾支，看這裡就好。

## 現在要跑的

> 最後確認時間：2026-10-29（直接打資料庫驗過，不是憑印象。做法：拿 anon key 呼叫
> 那支函式——回 `PGRST202 no matches found` 是**還沒跑**，回 `42501 permission denied`
> 是**函式在、只是你沒權限**，也就是跑過了。）

| 檔案 | 做什麼 | 沒跑會怎樣 |
| --- | --- | --- |
| `schema_v150_weekday.sql` | 排行榜的「星期幾最多人上站」 | 那一塊不出現，其他照常 |
| `schema_v151_event_stats.sql` | 審核分頁的「功能被用了幾次」 | 那一塊不出現，其他照常 |

### 不是 SQL、但還沒做完的

| 要做什麼 | 現在的狀況 |
| --- | --- |
| 把 `venues` 設成公開 | v142 跑過了，但 `venues` 預設 `is_public = false`（館名是從座標猜的），所以 `venues_public` 現在回的是**空陣列**——「排行程」那一頁看起來是空的就是這個原因。核對過那 45 個商圈名之後，把要上架的設成 `is_public = true` |
| `vendor/supabase.min.js` | 線上 404，但 `/supabase.min.js`（根目錄）是 200、大小一樣——檔案傳上去了，只是資料夾那層被攤平。v152 起兩個位置都會找，所以**不用再處理**；想整齊的話再補傳一次到 `vendor/` 底下 |

### 這兩支沒辦法用上面那招驗

`schema_v133_tw_to_counties.sql` 跟 `schema_v141_fix_unknown_tiers.sql` 改的是**資料**，
不是函式——而 v133 那支函式呼叫下去就直接改資料了，不能拿來「試試看在不在」。
要確認的話，開網站看：花蓮還有沒有一批標成「全台」的、「優惠層級」還有沒有「其他」。

## 已經跑過的（確認過，不用再跑）

| 檔案 | 怎麼確認的 |
| --- | --- |
| `schema_v115_page_stats.sql` | 2026-10-29：`admin_link_stats` 回 42501（函式在）。`track.js` 線上也已經是 200，那四頁從現在開始會有人次 |
| `schema_v142_venues.sql` | 2026-10-29：`venues_public` 回 200 `[]`（view 在，只是還沒有公開的） |
| `schema_v144_auto_approve.sql` | 2026-10-29：`site_settings` 讀回來含 `auto_approve` 這個 key |
| `schema_v97_dev_intro_flag.sql` | `site_settings` 讀回來已經是六個 key，含 `show_dev_intro` |
| `schema_v92_site_events_io.sql` | `admin_events_prune_preview`、`admin_dashboard_stats` 這兩支函式都在（anon 呼叫回 42501「權限不足」，不是「找不到函式」）|
| `schema_v95_site_settings.sql` | 被 `v97` 覆蓋（它是超集）。**不要再跑它**：它的 key 白名單沒有 `show_dev_intro`，重跑會報 `site_settings_key_known is violated by some row`（2026-10-14 踩過）|
| `v73`–`v83` | 2026-10-06 一支一支打過 RPC／view 驗過（見 CHANGELOG v92 那段）|
| `schema_v110_regions_from_stores.sql` | 2026-10-15 查線上資料：「適用縣市」空白的從 **67 筆降到 14 筆**，爬蟲補上了 53 筆 |
| `schema_v112_coffee_stats.sql` | celine 的截圖裡「咖啡按鈕」已經顯示人數（63 人／共 76 次），代表函式在 |
| `schema_v113_link_stats.sql` | 同一張截圖裡「站外連結」那張表有資料（品牌頁 1 人 1 次）|

## 跑法

Supabase Dashboard → SQL Editor → 貼上整支 → Run。

全部都寫成可重複執行（`create or replace`、`if not exists`、`on conflict do nothing`），
不確定跑過沒有就再跑一次，不會壞。

### ⚠️ 只有一個例外：`schema_v131_edge_reader.sql`

**這一支不能整份貼下去跑。** 它分成【步驟 A】跟【步驟 B】，中間要先去 Cloudflare
換 Worker 的金鑰、而且確認 Worker 還拿得到資料，才能跑【步驟 B】。
順序弄錯的話，站上的優惠清單會整個讀不到（可以復原，但會有一段空窗）。

檔案開頭把順序寫清楚了，**跑之前先把那一段讀完**。
最危險的那一行（`revoke select … from anon`）在檔案裡是註解掉的，
要自己解開——那是故意的。

| 檔案 | 怎麼跑 |
| --- | --- |
| `schema_v130_guards.sql` | 照常，整份貼下去就好 |
| `schema_v131_edge_reader.sql` | **分兩次**，照檔案開頭的「上線順序」 |
| `schema_v133_tw_to_counties.sql` | 照常貼，但**整份只會跑預覽**；看過表再解開【執行】那一行 |
| `schema_v141_fix_unknown_tiers.sql` | 照常貼，會改 9 筆；剩 4 筆是註解掉的 |
| `schema_v144_auto_approve.sql` | 照常貼。**開關預設關著**，跑這支不會讓任何東西自動上架 |
| `schema_v142_venues.sql` | 照常貼。**場館是草稿（`is_public=false`）**，看過名字才上架；最後那段公告要等前端上線再解開 |
