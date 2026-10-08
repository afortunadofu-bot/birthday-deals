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

> 最後確認時間：2026-10-08（直接打資料庫驗過，不是憑印象）

| 檔案 | 狀態 | 做什麼 |
| --- | --- | --- |
| `schema_v97_dev_intro_flag.sql` | **還沒跑** | 多一個 `show_dev_intro` 開關（「我的」底部的開發者介紹）|

就這一支。`v97` 是 `v95` 的超集（整張表、policy、白名單、預設值都重寫一次），
所以不管 `v95` 有沒有跑過，跑 `v97` 都會對。

## 已經跑過的（確認過，不用再跑）

| 檔案 | 怎麼確認的 |
| --- | --- |
| `schema_v92_site_events_io.sql` | `admin_events_prune_preview` 這支函式存在（anon 呼叫被權限擋下，不是「找不到函式」）|
| `schema_v95_site_settings.sql` | `site_settings` 讀得到，裡面已有五個 key |
| `v73`–`v83` | 2026-10-06 一支一支打過 RPC／view 驗過（見 CHANGELOG v92 那段）|

## 跑法

Supabase Dashboard → SQL Editor → 貼上整支 → Run。

全部都寫成可重複執行（`create or replace`、`if not exists`、`on conflict do nothing`），
不確定跑過沒有就再跑一次，不會壞。
