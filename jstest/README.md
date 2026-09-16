# jstest — 前端迴歸測試

用 jsdom 載入 **`../index.html`**（build.py 產生出來的成品，不是 template.html），
把 `window.supabase` 換成 mock，模擬點擊、斷言結果。沒有測試框架，就是一堆
可以直接 `node` 跑的腳本。

## 怎麼跑

```bash
cd jstest
npm install      # 只需要第一次（裝 jsdom）
node run_all.js
```

改完 `template.html` 之後要先 `python build.py` 再跑，不然測到的是舊的 index.html。

單獨跑一支：

```bash
node t01_pending_bulk_approve.js
```

## 目前覆蓋

| 檔案 | 測什麼 |
| --- | --- |
| `_smoke.js` | harness 本身：離線模式開得起來、種子資料有畫出卡片 |
| `t01_pending_bulk_approve.js` | 待審佇列全選／批次核可，且照每一列自己的「已查證」「審核備註」送出 |
| `t02_admin_email_peek.js` | 排行榜點頭貼看信箱（含 stopPropagation）、留言清單按信封才查＋cache、非管理員看不到 |
| `t03_region_flag_wrap.js` | 待審佇列「適用地區」標籤換行（`.flag.wrap`），其餘短標籤維持不換行 |
| `t04_detail_comment_email.js` | 優惠詳情彈窗的留言也接上信封鈕（第二個接線點，容易改一邊漏一邊） |
| `t05_reports_wishlist_feedback.js` | 待辦清單每一列的地圖按鈕、重複回報提醒（含同品牌另一張卡片、王品≠王品牛排）、詳情頁編輯自己的回報、待辦清單詳情開完整視窗、第一次收藏提示 |
| `t07_maps_button.js` | Google 地圖按鈕：卡片／詳情都有、列表上方的功能介紹小卡（✕／按過地圖就不再出現、列表空的時候不顯示）、搜尋字整理（限定店、括號英文、單一縣市、品牌已含縣市不重複）、點了不會開卡片詳情 |
| `t08_mobile_fixes_likes.js` | 回報說明獨佔一行（手機跑版）、回報視窗打開不聚焦日期欄、收藏備註改會長高的 textarea（含跳脫）、回報／留言按讚（讚數、自己不能按、按／收回、失敗改回、沒登入、v61 未跑時不顯示） |
| `t09_survey_visits.js` | 回饋問卷：入口在「我的」且訪客看得到、單選／複選、必填、還想說的話預設展開、v63 新題目（extra、「都沒有」互斥、v63 沒跑自動拿掉 extra 重送、後台長條圖、CSV 欄位）、訪客／會員送出內容、重複填與 24 小時限制提示、小卡片觸發（第 2 次來／第一次收藏／之後再說 7 天／填完 30 天）、30 分鐘造訪規則、管理員 NPS 與長條圖、留言看得到暱稱與時間（訪客標訪客、CSV 不含暱稱）、CSV 跳脫且不含個人代號、造訪統計與 v62 未跑提示 |
| `t11_alt_bday_tags.js` | 第二組生日（預設收著、稱呼／月份必填、儲存內容、v65 未跑提示、提醒橫幅與「知道了」）＋待辦清單標籤（每列選單、預設值與自訂、存檔、上面篩選、貼家人標籤時死線照家人生日算） |
| `t10_updates_a2hs.js` | 「我的」更新紀錄：預設展開、有新更新時跳通知（第一次來不跳、晚點再看、去看看切分頁＋展開＋捲過去、不跟問卷小卡片疊在一起）、訪客看得到、由新到舊、預設 3 筆可展開、內容沒有技術用語、NEW／小紅點與第一次來不顯示、跳脫；加到主畫面提醒：在頂部、有安裝權限直接安裝、否則捲到步驟、✕ 30 天、已加到主畫面不顯示 |

## harness 的坑（`harness.js` 裡有更詳細的註解）

- 頁面開場會動態 append `<script src=config.js>` 跟 supabase CDN。jsdom 預設不抓
  外部資源，`onload`/`onerror` 都不會觸發 → `connectLive()` 會卡滿 5 秒逾時。
  harness 攔掉 `HTMLScriptElement` 的 `src` setter，直接非同步觸發 `onerror`，
  讓它立刻落到離線模式；測試再自己把 `LIVE`/`sb`/`myProfile` 塞成想要的值。
- `sb.from(...)` 的 query builder 要把鏈式方法補齊（`select/eq/in/not/gte/lte/order/
  limit/single/maybeSingle/insert/update/upsert/delete/then`），少一個就整個炸。
  `harness.js` 的 `CHAIN` 陣列已經一次補滿，新增查詢方法時往裡面加就好。
- `select('id',{count:'exact',head:true})` 這種精確計數查詢要回 `count` 欄位。
- jsdom 沒有 `HTMLDialogElement.showModal/close`、`window.scrollTo`、
  `Element.scrollIntoView`，harness 都補了（`window.__scrollCalls` 順便當成
  `withScrollRestore` 的觀測點）。
- 頁面頂層變數是 `let`（`LIVE` / `sb` / `myProfile` …），**不會掛在 window 上**，
  要用 `win.eval('LIVE=true')` 這種間接 eval 才改得到。頂層 `function` 宣告
  反而會掛在 window 上，所以 `win.loadPending()` / `win.loadOffers = ...` 直接用。
- 測試腳本不會自己結束（jsdom 的 timer 還掛著），收尾一定要 `process.exit()`。
