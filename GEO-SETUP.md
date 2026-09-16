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
- [ ] 地圖圖磚：目前用 OpenStreetMap 官方圖磚，它的[使用政策](https://operations.osmfoundation.org/policies/tiles/)不適合大流量。流量變大前，要換成 MapTiler、Stadia 之類的圖磚服務（改 `openNearMap()` 裡的 `tileLayer` 網址即可）
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
