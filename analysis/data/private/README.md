# 把匯出的檔案丟在這個資料夾

這一包**不進版控**（除了你現在看的這份說明）。裡面放的是從 Play Console、Firebase
匯出的原始檔，可能含有國家、裝置、評論全文這類不該公開的東西；
作品集頁面上只會出現算完的彙總數字。

丟完跟我說一聲就好，檔名不用改——我會看實際的欄位再寫讀檔的程式，
不先猜格式。

## Bandary 要的

| 檔案 | 從哪裡來 |
|---|---|
| `bandary_installs.csv` | Play Console →「統計資料」→ 指標選「安裝數（裝置）」「解除安裝數」→ 時間拉到上架至今 → 右上角匯出 CSV |
| `bandary_ratings.csv` | Play Console →「評分」→ 匯出 |
| `bandary_retention.csv` | Play Console →「使用者留存」（有的話；介面叫「留存率」）→ 匯出 |
| `bandary_events.csv` | Firebase → Analytics →「事件」→ 右上角匯出 CSV。至少要有「新增場次」「開啟好友日曆」「匯入 Google 日曆」這三個 |

## RelateStats 要的

| 檔案 | 從哪裡來 |
|---|---|
| `relatestats_installs.csv` | 同上，Play Console 的統計資料 |
| `relatestats_ratings.csv` | Play Console →「評分」 |
| `relatestats_reviews.csv` | Play Console →「評論」→ 匯出（這支沒有遙測，評論是少數能看到使用者實際遇到什麼的來源） |
| `relatestats_vitals.csv` | Play Console →「Android vitals」→ 當機率／ANR |

## 懶得匯出的話

**截圖也可以。** Play Console 首頁那幾個數字（安裝、解除安裝、評分、當機率）
拍下來丟給我，我照著填，並在頁面上註明數字是哪一天的截圖。
精確度差一點，但比空著好。

## 不要放進來的

- 含 email、使用者 ID、裝置識別碼的原始檔
- Firebase 的服務帳戶金鑰（`*-service-account*.json`）——repo 的 `.gitignore`
  有擋，但根本不要放進來比較安全
