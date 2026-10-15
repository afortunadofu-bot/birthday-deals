# 壽星日 → 上架 App Store + Google Play 規劃

> 寫於 2026-10-15。目標：**同一份網站程式碼**包成 App，同一天在 Android 跟 iOS 上架。

---

## 結論先講

用 **Capacitor** 把現有的 `index.html` 包成原生殼。理由：

- 網站是單檔 HTML + vanilla JS，**沒有 bundler、沒有 node_modules**。Capacitor 的 `webDir`
  可以直接指向一個放靜態檔的資料夾，所以不用改寫任何前端架構。
- 一份程式碼兩邊跑，改版型還是只改 `template.html`。
- 要加的原生能力（推播、定位、分享、Apple 登入）都有現成 plugin。

**不建議**的路線：
- 純 TWA／PWABuilder：Android 可以過，但 iOS 不吃，等於還要維護第二套。
- 改寫 React Native／Flutter：等於重做一個 775KB 的前端，沒有理由。

但 Capacitor 的「包一層就上架」只對 Android 成立。**iOS 真正的難關不是技術，是 Apple 審核**，
下面六個卡點裡有四個是為了過審才要做的。

---

## 現況盤點

| 項目 | 狀態 | 對上架的影響 |
|---|---|---|
| `template.html` → `build.py` → `index.html` | 775KB 單檔，無 bundler | ✅ 直接丟進 Capacitor 就能跑 |
| `manifest.json` + `sw.js` | 已是 PWA | ✅ icon 可沿用，sw 在 App 裡要關掉 |
| `icon-192.png` / `icon-512.png` / `icon.svg` | 有 | ⚠️ 還缺 iOS 1024 與各尺寸、啟動畫面 |
| Supabase（Postgres + RLS + Google OAuth） | 運作中 | 🔴 **登入要改原生流程** |
| Leaflet、supabase-js 走 CDN | 運作中 | ⚠️ 要改成打包進本機（離線 + 審核） |
| `privacy.html` / `terms.html` | 有且完整 | ✅ 兩邊商店都需要這個 URL |
| 留言／使用回報（UGC） | 有，但**沒有檢舉機制** | 🔴 **Apple 1.2 硬性要求** |
| 刪除帳號 | 只能寄信，30 天內處理 | 🔴 **兩邊都要求 App 內可自助刪除** |
| ☕ Buy Me a Coffee 外部連結 | 有 | ⚠️ iOS 版建議隱藏 |
| 推播通知 | 完全沒有 | 🔴 這是 iOS 過審的主要籌碼 |
| 建置環境 | Windows 11，沒有 Mac | 🔴 iOS 要雲端 Mac |

---

## 六個真正的卡點

按「不解決就上不了架」排序。

### 1. 🔴 Google 登入在 WebView 會被 Google 直接擋掉

現在的程式碼是 `supabase.auth.signInWithOAuth({ provider:'google', redirectTo: ... })`。
這在 Capacitor 的 WebView 裡會回 **`403 disallowed_useragent`**——Google 政策禁止在
內嵌 WebView 做 OAuth，改 user agent 沒用，加 `allowNavigation` 白名單也沒用。

**做法**：改成原生登入 + 把 ID token 交給 Supabase。

```js
// 原本（網頁版保留）
await supabase.auth.signInWithOAuth({ provider:'google', redirectTo: redirectTarget() });

// App 版
import { SocialLogin } from '@capgo/capacitor-social-login';
const res = await SocialLogin.login({ provider:'google', options:{ mode:'online' } });
await supabase.auth.signInWithIdToken({ provider:'google', token: res.result.idToken });
```

細節：
- Supabase 的 Google provider 要填 **Web Client ID**，`webClientId` 也填同一個。
- Google Cloud Console 要另外開 **iOS client ID** 和 **Android client ID**（Android 要塞
  簽章的 SHA-1）。三個 ID 任何一個對不上就會是 invalid audience 或 nonce mismatch。
- `template.html` 裡要加平台判斷：`Capacitor.isNativePlatform()` 走原生、否則走現在的流程。
  這是整個專案裡最需要小心的一段，建議抽成一個 `auth.js` 兩邊共用。

### 2. 🔴 Apple Guideline 4.2「最低功能」——網站包一層會被退

Apple 不禁止 WebView，禁的是「這個 App 就只是一個網站」。常見退件理由是
「not sufficiently different from a mobile browsing experience」。加一個推播就想過關通常不夠，
**要讓原生能力變成核心體驗**。

好消息是壽星日有一個天然的原生賣點，而且資料庫早就有需要的欄位：

| 原生功能 | 用什麼做 | 為什麼只有 App 做得到 |
|---|---|---|
| **生日提醒** ⭐ 主力 | Local Notifications | 「星巴克要生日前 7 天入會，今天是最後一天」——直接吃現有的**提前天數**欄位 |
| 生日當天早上一則「今天你有 23 個可以領」 | Local Notifications | 同上 |
| 附近有優惠 | Geolocation（已有 5 處 + Leaflet） | 原生定位比瀏覽器準、不用每次問 |
| 分享一筆優惠給朋友 | Share sheet | 原生分享面板 |
| 離線可看 | Capacitor 本地資產 + `worker/offers-cache.js` | 殼永遠打得開，不像 PWA 看快取運氣 |
| 公告／回覆通知 | Push（APNs / FCM） | 網頁推播在 iOS 幾乎不可靠 |
| Widget／捷徑 | iOS App Intents | 第二版再做，加分項 |

**關鍵的架構簡化**：生日提醒用**本地通知**就好，不需要後端。
生日是確定的日期，提前天數是資料庫裡的常數，登入後算一次、排一整年的通知即可。
只有「公告」和「回覆你的留言」這兩種才需要真的推播後端（Supabase Edge Function → FCM/APNs），
那個可以留到第二版。

送審時在 App Review Notes 裡**明確列出**這些原生功能，不要讓審核員自己找。

### 3. 🔴 有 Google 登入，就必須同時提供 Sign in with Apple

Apple Guideline 4.8。要在 Supabase 加 Apple provider、在 Apple Developer 設 Service ID 與金鑰，
前端多一顆按鈕。Android 版不用顯示。

另外：**審核員要能登入**。Google OAuth 對審核員很麻煩，建議在 Supabase 開 email+password
並給一組測試帳號寫在 Review Notes（或讓審核員走現有的離線示範模式，但主動給帳號比較穩）。

### 4. 🔴 UGC 必須有檢舉與封鎖（Apple Guideline 1.2）

有留言和使用回報就算 UGC，Apple 明文要求四件事：過濾機制、**檢舉按鈕**、**封鎖使用者**、
公開聯絡方式，並承諾收到檢舉後及時移除。

`README.md` 的「已知限制」自己寫了「沒有留言檢舉機制（資料表已預留 `is_hidden` 欄位）」——
這件事本來就在待辦清單上，現在變成上架的必要條件。需要：

- `schema_vNNN_reports.sql`：檢舉表 + 封鎖表 + RLS
- 卡片／留言上的「檢舉」按鈕、「封鎖這個人」
- 審核後台的檢舉佇列（既有後台加一個分頁）

### 5. 🔴 兩邊都要求 App 內可以自助刪除帳號

`privacy.html` 現在寫「寄信給我們，30 天內完成刪除」。Google Play 要求**App 內**有刪除路徑
**加上**一個網頁 URL；Apple 5.1.1(v) 要求 App 內可直接發起刪除。

做法：「我的紀錄」頁加「刪除帳號」，走一個 Supabase Edge Function（需要 service_role，
不能放前端）把 profile、投稿、留言、回報一起處理掉，並在 `privacy.html` 補一段自助刪除說明。

### 6. 🔴 Windows 沒有 Mac，iOS 要用雲端建置

- **Codemagic**：免費 500 macOS 分鐘／月，能完整處理簽章並上傳 TestFlight，**不需要自己的 Mac**。
  對這個專案的改版頻率夠用，推薦這條。
- Xcode Cloud：Apple 會員已含 25 小時／月，但設定專案本身需要 Xcode（也就是需要 Mac）。
- Ionic Appflow：**已停售**，2027-12-31 關閉，不要用。

代價：在 Windows 上沒有 iOS 模擬器也沒有 debugger，iOS 的驗證只能靠實機或 TestFlight。
如果手邊有 iPhone，TestFlight 完全夠用。

---

## 另外兩件會吃時間但不難的事

### ☕ Buy Me a Coffee 的外部連結（iOS）

站上那顆咖啡按鈕連到 `buymeacoffee.com/celinefu`。Apple 對「導到站外付錢」一向敏感，
而贊助文案自己寫了「不會解鎖任何功能」——這是好事，代表不涉及數位內容解鎖，
但審核員仍可能要求改成 App 內購買（抽 30%）。

**最省事的做法：iOS 版用 `Capacitor.getPlatform()` 把那顆按鈕藏起來。**
Android 版照常顯示。想在 iOS 收贊助再說，那是另一個題目。

### Google Play 個人開發者帳號的封測門檻

2023-11-13 之後開的**個人**帳號，要先跑封閉測試：**至少 12 位測試者連續 14 天都在測試名單裡**，
才能申請正式發布。（公司／組織帳號免這一關。）

12 人是「連續 14 天」的 12 人，第 12 個人加入的那天才開始算。所以——
**這是整個時程的關鍵路徑，Android 的封測要最早開始跑，而且名單一次就要湊滿 12 人。**

---

## 專案結構

不動現有檔案，新開一個 `app/`：

```
claude/
├── template.html          ← 還是只改這裡（加平台判斷）
├── build.py               ← 加 --target app，順手把 www/ 填好
├── app/                   ← 新增
│   ├── capacitor.config.json   ( webDir: "www", appId: "work.celinefu.shouxing" )
│   ├── package.json
│   ├── www/               ← build.py 產出，不進 git
│   │   ├── index.html  about.html  privacy.html  terms.html  updates.html
│   │   ├── icon-*.png  manifest.json
│   │   └── vendor/        ← leaflet + supabase-js 改成本機載入
│   ├── android/           ← Capacitor 產生
│   └── ios/               ← Capacitor 產生
└── shared/auth.js         ← 網頁與 App 共用的登入抽象層
```

幾個決定：
- **`sw.js` 在 App 裡不註冊**。Capacitor 已經是本地資產，service worker 只會讓快取更難除錯。
- **CDN 改本機**（`vendor/`）。離線時才真的打得開，也少一個審核員可能問的問題。
- **Web 版完全不受影響**。所有原生分支都包在 `Capacitor.isNativePlatform()` 裡。
- `appId` 一旦送出就**永遠不能改**，兩邊商店都一樣，取名時想清楚。

### OTA 熱更新（建議，但不是必須）

`CHANGELOG.md` 的節奏是幾乎每天在改。如果每個小修都要等商店審核會很痛。
Capacitor 有 OTA 方案（Capgo 等）可以只更新 web 層、不送審。Apple 允許這種更新，
前提是**不改 App 的用途**。建議第二階段再接，第一版先用正常送審。

---

## 時程

六到八週，但其中大半是在等。**第 0 階段的兩件事第一天就要做，因為它們是等待型的。**

| 階段 | 做什麼 | 自己要花的時間 | 等待時間 |
|---|---|---|---|
| **0. 帳號**（Day 1 就開始） | Apple Developer 申請（要身分驗證）、Play Console 申請 | 半天 | **1–3 週**（Apple 驗證不一定快） |
| **1. 殼跑起來** | 裝 Node、`npm init`、加 Capacitor、Android 跑出第一個 APK | 1–2 天 | — |
| **2. 原生登入** | Google 原生登入、Apple 登入、`auth.js` 抽象層 | 2–3 天 | — |
| **3. 過審必要功能** | 本地通知（生日提醒）、檢舉／封鎖、刪除帳號、分享、iOS 藏咖啡鈕 | **1–1.5 週** | — |
| **4. Android 封測開跑** ⭐ | 上傳 AAB、湊滿 12 位測試者 | 1 天 | **14 天**（硬性，愈早愈好） |
| **5. iOS 建置管線** | Codemagic 設定、簽章、第一個 TestFlight build | 2–3 天 | — |
| **6. 商店素材與表單** | 截圖（各尺寸）、說明文案、Play 資料安全表、Apple 隱私問卷 + `PrivacyInfo.xcprivacy`、年齡分級、Review Notes | 3–4 天 | — |
| **7. 送審** | 兩邊都設**手動發布**，等兩邊都過了再同時按下去 | — | Apple 1–3 天、Play 數天 |

**同步上架的做法**：兩邊都選「核准後手動發布」。先過的那邊壓著不放，等另一邊也過，
挑一天同時發布。

**順序上的重點**：Android 比較好過、而且封測的 14 天是牆上時鐘。
所以第 3 階段一做完就立刻上傳 Android 封測，讓 14 天在你弄 iOS 的時候同時在跑。

---

## 費用

| 項目 | 費用 |
|---|---|
| Apple Developer Program | **US$99／年**（必要） |
| Google Play Console | **US$25**（一次性） |
| Codemagic | 免費 500 macOS 分鐘／月（這個規模夠用） |
| Supabase | 目前免費方案。推播／刪除帳號會用到 Edge Function，免費額度內 |
| OTA（Capgo 等） | 選配，第二版再評估 |

**第一年約 US$125。** 另外提醒：公告草稿裡提到想把主機換付費方案——
如果 App 上架帶來流量，Supabase 升級的壓力會比現在更大，可以一起算進預算。

---

## 需要你決定的三件事

1. **`appId` 要叫什麼**（永久不可改）。建議 `work.celinefu.shouxing`，
   或如果想用 `birthdaydeals.tw` 這類網域反寫也可以。
2. **App 名稱**。商店上的名字有長度限制（Apple 30 字、Play 30 字），
   「壽星日」很好，要不要加副標（例：「壽星日 — 台灣生日優惠」）。
3. **第一版要不要做遠端推播**。我的建議是**不要**：生日提醒用本地通知就能做到，
   不用後端、不用 FCM/APNs 設定，過審的籌碼一樣拿得到。公告推播留第二版。

---

## 我會建議的第一步

不是寫程式，是**今天就去申請兩個開發者帳號**，因為 Apple 的身分驗證可能要等好幾週，
那段時間剛好夠把第 1–3 階段做完。

技術上的第一步是階段 1：裝 Node、把 Capacitor 接上去、在 Android 上跑出第一個能開的 APK。
那一步做完就會知道 775KB 的單檔在手機 WebView 上的實際載入速度，
那是後面所有決定的基礎。
