# geo／自動找出商圈

**成品：<https://afortunadofu-bot.github.io/birthday-deals/venue-clusters.html>**

拿好康地圖的 21,209 家店座標做密度分群，長出「商圈」，再用壽星日那 148 個
人工圈的商圈當對照組驗收。

```bash
python fetch_venues.py   # 抓 148 個人工商圈（venues_public，公開 view）
python cluster.py        # 掃參數、分群、評估、效能對照 → metrics.json
```

需要 `scikit-learn`（跟 `../ml/requirements.txt` 同一套）。

## 結果

| | |
|---|---|
| 自動找到 | 1,149 個商圈（人工 148 個） |
| 對上人工商圈 | 79.7%（118 / 148） |
| 收進的店家 | 50.1% |
| silhouette | 0.528 |
| 參數 | DBSCAN、haversine、eps = 150 m、min_samples = 4、每群至少 3 個品牌 |

三個有意思的地方：

1. **半徑放大反而對不上。** eps 從 150 m 拉到 300 m，收進的店從 50% 升到 78%，
   但對上人工商圈從 79.7% 掉到 33.8%——街區被黏成一塊，重心飄走了。
2. **人工漏掉的全在雙北以外。** 台中人工 19 個、自動 203 個；台南 6 對 82。
   自動化的用處不是取代手工，是把其他縣市補起來。
3. **對不上的 30 個全是郊區購物中心**（Outlet、夢時代、萬家福）。
   一棟樓裡五十家店，在地圖上只是一個點，密度法本來就抓不到。
   結論是商圈有兩種，不是模型不夠好。

效能：每家店找最近的 20 家，暴力法 O(n²) 估計 55.5 秒，BallTree 2.6 秒，快 21 倍。
參數要掃 12 組，這個差別決定你敢不敢多試幾種。

## 資料來源與授權

- **店家座標**：OpenStreetMap，**© OpenStreetMap contributors**，ODbL 授權。
  原始檔在好康地圖 repo 的 `data/stores_osm.json`（由 `crawler/osm_stores.py` 抓），
  不在這個 repo 裡。這裡只放分群後的**彙總**（群中心、店數、品牌數），
  不重新散布原始資料。
- **人工商圈**：壽星日的 `venues_public` view（公開），148 筆，
  只有商圈本身的名字、中心點、半徑，沒有任何使用者資料。
