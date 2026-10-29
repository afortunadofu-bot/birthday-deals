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
| `schema_v153_venues_write.sql` | 使用者推薦地點那張表；`venues` 的寫入權限明確寫出來 | 「推薦一個地點」送不出去；審核那一塊的「待審推薦」那段是空的 |

### 不是 SQL、但還沒做完的

| 要做什麼 | 現在的狀況 |
| --- | --- |
| 建立「一趟用最多」的地點 | 公開的一筆都沒有（2026-10-29 查證：`venues_public` 回 `[]`）。v142 的規劃有四塊，「審核頁：系統列出熱點草稿、你改名確認」那一塊從來沒做，所以沒有任何畫面能建地點。v153 補上了：到「審核」→「一趟用最多：地點」，系統會列出熱點，改完名字按「建立並公開」。之前手動建過的會出現在「已經建好的」裡 |
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

## 公開的頁面說「還沒開放」「暫時讀不到」的時候

celine（2026-10-29）：「其他人不該看到這個」。v155 起，優惠／排行榜／排行程／我的，
還有誰都打得開的對話框，表或函式還沒建起來時**只講人話，不講要跑哪一支**——管理員登入
看也一樣。要跑哪一支只寫在這裡跟「審核」分頁。對照表：

| 在哪裡看到 | 對應的檔案 |
| --- | --- |
| 「讀不到你的個人檔案」（頂端告示、「我的」最下面） | `schema_v9_admin.sql`（會補建缺漏的個人檔案） |
| 加進待辦清單失敗 | `schema_v8.sql` |
| 通知、排行榜的最近動態 | `schema_v20_notifications.sql` |
| 待辦清單：分清單／標籤／第二組生日／切換年度／排序 | `v71`／`v65`／`v65`／`v50`／`v47` |
| 附近分店 | `schema_v58_offer_stores.sql`（還要匯入分店） |
| 評分、排行榜本月、待審預覽 | `schema_v13_ratings.sql` |
| 排行榜本週／貢獻度／每月人數／看月份 | `v45`／`v46`／`v81`／`v83` |
| 回報網站問題、待審修改預覽 | `schema_v30_feedback_and_edit_preview.sql` |
| 投稿修改 | `schema_v11_edits.sql` |
| 「我的」存生日 | `schema_v18_misc.sql` |
| 取消／刪除自己的投稿 | `v14`／`v17` |
| 大頭貼 | `schema_v70_split_groups_merge_avatars.sql` |
| 問卷 | `schema_v62_survey_and_visits.sql` |
| 排行榜「星期幾最多人上站」那一塊整個沒出現 | `schema_v150_weekday.sql` |

站本身連不上（「連不上資料庫」）、Google 登入失敗：看 `FIX-LOGIN.md`。

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
