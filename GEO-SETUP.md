# 附近有優惠的店：上線前設定流程

> **已於 2026-09-16 合併回 `main` 上線。** celine 決定先上線，`_待celine確認` 的 10 個品牌之後再補
> （那幾筆優惠目前是 0 家分店，在「附近」模式下不會出現，其他優惠不受影響）。
> 下面的流程留著給「之後補品牌」「每季重抓分店」用。

使用者回饋來源：Z（9/9）要從北車算距離、由近到遠列出；王（9/6）要地圖，想知道人在 101 附近有哪些店；Cindy（9/13）想要能用地理距離篩選。

## 做了什麼

| 部分 | 檔案 | 說明 |
| --- | --- | --- |
| 資料表＋距離查詢 | `schema_v58_offer_stores.sql` | `offer_stores` 分店表、`nearest_offer_stores()`（每筆優惠最近的一家）、`offer_stores_in_bounds()`（地圖畫面內的分店）、`offer_store_coverage`（管理員查哪些優惠沒有分店） |
| 抓分店 | `fetch_stores.py` | 用 Google Places API（New）Text Search，逐縣市查每個品牌（大縣市被 60 筆上限截斷時自動分區補抓），產生 `stores_import_*.sql` |
| 品牌別名 | `store_search_aliases.json` | 品牌名稱跟 Google 店名對不上、聯名卡要拆成好幾個品牌搜、純線上優惠要略過，都在這裡設定 |
| 補空白的適用縣市 | `fetch_stores.py --fill-regions`、`schema_v110_regions_from_stores.sql` | 「適用縣市」空白的優惠，全台一次查完、照分店地址回推縣市（見最後一節） |
| 前端 | `template.html` | 「📍 附近」按鈕、距離範圍、離我最近排序、卡片上的「最近分店＋導航」、Leaflet 地圖（點地圖可以換查詢位置） |

## 一、申請 Google API 金鑰（只要做一次）

1. 到 [Google Cloud Console](https://console.cloud.google.com/) 建一個專案，並綁定付款方式。
2. 「API 和服務 → 程式庫」，搜尋並啟用 **Places API (New)**。
3. 「API 和服務 → 憑證 → 建立憑證 → API 金鑰」。
4. 編輯這把金鑰，在「API 限制」只勾 **Places API (New)**。這支腳本只在你自己電腦上跑，所以不用設網站限制。
5. 「帳單 → 預算與快訊」設一個每月預算提醒，建議先設低一點。
6. **金鑰不要貼進任何檔案，也不要 commit。** 只放在環境變數裡。

## 二、估算用量（不花錢）

```bash
python fetch_stores.py --dry-run
```

目前線上有 294 筆已上架優惠，共 2,268 個「品牌 × 縣市」查詢。每個查詢最多翻 3 頁，所以**最多 6,804 次 API 呼叫**；小品牌通常一頁就結束，實際會少很多。

Places API 的免費額度和單價請以 [Google 官方價目表](https://developers.google.com/maps/billing-and-pricing/pricing) 為準，第一次全部跑完有可能超過免費額度。所有回應都會快取在 `.places_cache/`，**重跑不會重複計費**。

## 三、先拿一個品牌試

PowerShell：

```bash
$env:GOOGLE_MAPS_API_KEY="你的金鑰"; python fetch_stores.py --only 麥當勞
```

跑完打開 `stores_fetched.json`，抽查幾家的店名、地址是不是真的麥當勞，而且在對的縣市。

## 四、全部跑

```bash
python fetch_stores.py
```

最後會列出「一家都沒找到」的優惠，通常是兩種情況：

- **店名跟 Google 上不一樣**：在 `store_search_aliases.json` 的 `brands` 加上 `query`（拿去搜的字）和 `match`（店名要包含其中一個才收）。大部分「中文＋英文」的品牌名稱不用設，腳本會自動拆開比對。
- **抓到別家店**（例如「寶雅」比到「寶雅中醫診所」）：在那個品牌加 `exclude`（店名包含這些字就不收）。
- **不確定是不是同一個品牌、集團優惠要列出旗下品牌**：`store_search_aliases.json` 最下面的 `_待celine確認` 有逐筆說明，確認後再改別名。
- **純線上／App 優惠，沒有實體店**：把品牌名稱加進 `skip`。

改完別名先跑 `python fetch_stores.py --cache-only`：只用快取重算，不打 API、不花錢，可以快速看比對結果；確認沒問題再拿金鑰正常跑一次，補齊還沒查過的部分。

## 五、匯入 Supabase（依序貼進 SQL Editor）

1. `schema_v58_offer_stores.sql`
2. `stores_import_01.sql`、`stores_import_02.sql`…**依序全部貼完**。腳本把分店拆成每檔 400 家（約 90KB）。**貼上後直接按 Run，不要按儲存或重新命名**——SQL Editor 存 snippet 有大小限制，會報「request entity too large」；如果連 Run 都報這個錯，用 `python fetch_stores.py --cache-only --rows-per-file 200` 重新產生更小的檔案（不花錢）。最後一個檔會先檢查前面都貼過了，才自動隱藏已歇業的分店，少貼一個會報錯停下來。全部可重複執行
3. 檢查覆蓋率：

   ```sql
   select * from offer_store_coverage where store_count = 0 order by brand;
   ```

## 六、上線清單（全部打勾才合併回 main）

- [ ] v58 已經在 Supabase 跑過，`stores_import_*.sql` 全部依序匯入
- [ ] `offer_store_coverage` 裡 `store_count = 0` 的，都確認過是純線上優惠，或已經補好別名重跑
- [ ] 抽查 5 個大型連鎖（麥當勞、摩斯、星巴克…）：在地圖上的分店位置正確、沒有混進別家店
- [ ] 手機實測：允許定位 → 列表變成由近到遠，卡片有「最近分店」，導航連結會開 Google 地圖
- [ ] 手機實測：拒絕定位 → 會自動打開地圖，點一下地圖可以查那裡附近
- [ ] 手機實測：把距離從 1 公里調到 30 公里，列表筆數跟著變
- [ ] 桌機實測：地圖可以拖曳、縮放，放大後會出現分店點，點「看優惠」會開詳情
- [ ] `cd jstest && node run_all.js` 全綠
- [x] 地圖圖磚：已經從 OpenStreetMap 官方圖磚（[使用政策](https://operations.osmfoundation.org/policies/tiles/)不適合大流量）換成 **CARTO Voyager**——一樣是 OSM 的資料、不用金鑰、專門給網站/App 用，有標示出處。之後想換成有 SLA 的服務（MapTiler、Stadia…），在 `config.js` 設 `window.MAPTILER_KEY` 或 `window.MAP_TILES`，不用改程式
- [ ] 定期更新：分店會開關店，建議每季用 `python fetch_stores.py --refresh` 重抓一次

合併：

```bash
git switch main
```

```bash
git merge feature/geo
```

```bash
git push origin main
```

## 補上空白的適用縣市（2026-10-14 加的，獨立流程）

使用者（金信宇）回報「篩花蓮縣跑出很多不是花蓮的店」，查下去發現線上有 **67 筆優惠的
「適用縣市」整個是空的**——任何縣市篩選都找不到它們，「📍 附近」也不會出現。

這些沒有縣市可以照著查，所以多了一個模式：**全台一次查完，再從每一家店的地址回推它在
哪個縣市**。逐縣市掃等於每個品牌打 22 個查詢（67 × 22 = 1,474 個），而這些大多是只有
一兩家店的獨立店，一個查詢就找完了——實際只要 67 個查詢。只有被 60 筆上限截斷
（代表 Google 手上還有更多）的大連鎖，才會再逐縣市掃一遍。

```bash
python fetch_stores.py --fill-regions --dry-run
```

```bash
$env:GOOGLE_MAPS_API_KEY="你的金鑰"; python fetch_stores.py --fill-regions
```

跑完會多兩個東西：

- **`region_fill_report.md`**：每一筆回推出來的縣市，附上實際找到的店名跟地址。
  **貼進資料庫之前先掃一遍**——比對到別家店就會多一個不該有的縣市，而且錯了很難從
  網站上看出來（使用者只會覺得「篩花蓮又跑出不是花蓮的店」，就是這件事被回報的原因）。
  不對的就照上面第四節設 `match`／`exclude`，再跑 `--cache-only` 重算（不花錢）。
- **`stores_import_regions_01.sql`…**：只含這幾筆優惠的分店，**不會蓋掉既有的
  `stores_import_*.sql`**（那些是全部品牌的，已經匯入過了）。

匯入順序：

1. `schema_v110_regions_from_stores.sql`（定義「照分店補縣市」的函式，順手把已經有分店、
   縣市卻空白的那幾筆補上）
2. `stores_import_regions_*.sql` 依序全部貼完——最後一個檔會自動再呼叫一次那個函式
3. 檢查還有哪幾筆是空的：

   ```sql
   select id, brand, category from public.offers
    where status = 'approved' and coalesce(array_length(regions, 1), 0) = 0 order by id;
   ```

   還是空的通常是**純線上／App／會員優惠**（HAPPY GO 這種本來就沒有實體店）：
   把品牌加進 `store_search_aliases.json` 的 `skip`，適用縣市手動填「全台」。

一家都沒找到的時候**縣市會留空白，不會瞎猜一個**——寧可繼續躺在那邊，也不要把台北的
使用者送去一家只有高雄有的店。
