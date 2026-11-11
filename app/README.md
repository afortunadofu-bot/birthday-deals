# 壽星日 App 外殼（Capacitor）

網站原始碼還是在上一層的 `template.html`，**這裡不放任何網站程式碼**。
這個資料夾只負責「把網站成品包成原生 App」。

完整的上架規劃在 [../PLAN-APP.md](../PLAN-APP.md)。

---

## 這裡有什麼

| 檔案 | 用途 |
|---|---|
| `capacitor.config.json` | appId（`work.celinefu.shouxing`，**永久不可改**）、appName、webDir |
| `sync_www.py` | 跑上一層的 `build.py`，再把手機要用的檔案組成 `www/` |
| `www/` | **產物**，不進 git，不要手改 |
| `android/` | Capacitor 產生的原生專案，**要進 git**（AndroidManifest、圖示、簽章設定都在裡面） |

**檔案清單不寫在這裡**，`sync_www.py` 直接讀 `../publish.py` 的 `SITE_FILES`。
那份清單是「網站需要哪些檔」的唯一來源，上線跟 App 共用。
以後要新增圖片或頁面，加進 `publish.py` 就好，App 這邊會自動跟上。

---

## 環境

這台機器上已經有的（不用再裝）：

- Node 24.18 / npm 11.16
- Android SDK：`%LOCALAPPDATA%\Android\Sdk`（platform 34–36.1、build-tools 36.1.0）
- JDK 21：Android Studio 內附的 `C:\Program Files\Android\Android Studio\jbr`

Gradle 不用自己裝，`gradlew` 會自己抓（第一次會下載 Gradle 8.14.3，約 230MB）。

---

## 改一次版要跑什麼

改完上一層的 `template.html` 之後：

```bash
cd app
python sync_www.py && npx cap sync android
```

`sync_www.py` 做三件事：跑 `build.py`、把檔案複製進 `www/`、把 Supabase SDK 的載入順序
改成「先讀本機、CDN 當備援」。`cap sync` 再把 `www/` 複製進
`android/app/src/main/assets/public`。

然後出 APK：

```powershell
cd app\android
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat assembleDebug
```

APK 會在 `android\app\build\outputs\apk\debug\app-debug.apk`。
裝到手機上：`adb install -r <那個路徑>`。

### 量載入速度

```bash
python sync_www.py --perf && npx cap sync android
```

`--perf` 會在 `www/index.html` 插一段只有量測用的 script（DOMContentLoaded、
first-paint、LCP），結果透過 `console.log` 進 logcat：

```powershell
adb logcat -s Capacitor/Console:V
```

那段只進 `www/`（產物），**不會動到 `template.html`**，正式版永遠沒有它。
量完記得跑一次不帶 `--perf` 的 `sync_www.py` 把它清掉。

---

## 幾個刻意做的決定

**`www/` 只放 11 個檔**，不是把上一層整包丟進去。上一層有 `offers.json`、
`schema_*.sql`、`stores_import_*.sql`，加起來幾十 MB，全部都會被包進 APK。

**Supabase SDK 打包進 App**（`www/vendor/supabase.min.js`）。
`index.html` 的載入器對 CDN 只等 10 秒，逾時就整頁降級成「離線示範模式」——
手機網路下這件事會真的發生。本機檔案不會逾時，CDN 留著當備援。

**Leaflet 還是走 CDN**。地圖圖磚本來就要連網，而且那顆 `L.marker` 用的是
Leaflet 預設圖示，路徑是從 `leaflet.css` 的位置推算的，搬到本機還要一起搬 `images/`，
換來的好處是零。

**App 裡不註冊 service worker**。Capacitor 的資產本來就在本機，再疊一層快取只會讓
「到底是哪一份在跑」變難查。這個判斷寫在 `template.html` 的 `registerSW()`
（靠 `window.Capacitor` 判斷，網頁版完全不受影響）。

**字串替換會「吵」**。`sync_www.py` 的 `REPLACEMENTS` 每一條都必須命中，
沒命中就直接中止而不是默默產出壞檔——`template.html` 改到那幾行時會立刻知道。

---

## Google 登入：程式寫好了，剩下你要在兩個後台填的東西

App 裡不能用網頁那套 OAuth 轉址——Google 不准在內嵌 WebView 做 OAuth，
會直接回 `403 disallowed_useragent`。改 user agent 沒用，加允許清單也沒用。

所以 App 走另一條路：原生端去跟 Google 要一張識別碼（id token），
再交給 Supabase 換成我們自己的 session。使用者看到的是手機系統原生的
帳號選擇畫面，不會跳出 App。程式在 `template.html` 的 `googleNativeSignIn()`，
網頁版完全不受影響（靠 `IN_APP` 分流）。

**但是現在按下去會說「這個 App 還沒設定好 Google 登入」**，因為少了用戶端 ID。
下面三步要用你的帳號做，我沒辦法代勞：

### 1. Google Cloud → 建一個 Android 用戶端

憑證頁面：<https://console.cloud.google.com/apis/credentials>
（選到網頁版 Google 登入現在用的那個專案，不要另外開新的）

**建立憑證 → OAuth 用戶端 ID → Android**

| 欄位 | 填什麼 |
|---|---|
| 套件名稱 | `work.celinefu.shouxing` |
| SHA-1（開發用） | `6F:15:1A:87:ED:C0:FA:F5:00:1D:7B:DD:87:AA:11:52:B6:6B:20:A3` |

那組 SHA-1 是這台電腦的 `~/.android/debug.keystore`，**只對 debug APK 有效**。
上架之後 Google Play 會用自己的金鑰重簽，所以正式版還要再加一組：
Play Console →「測試及發布 → 應用程式完整性」裡那組 SHA-1，
回到同一個 Android 用戶端補上去。

### 2. 把 Web 用戶端 ID 填進 `config.js`

**不要新建**，用現在網頁版登入在用的那一個（憑證頁面裡類型是「Web 應用程式」的）。
打開 `claude/config.js`，把這行取消註解並填入：

```js
window.GOOGLE_WEB_CLIENT_ID = "……-…….apps.googleusercontent.com";
```

為什麼 Android 要填 Web 的那一個：Android 端拿回來的識別碼，
它的 `aud` 會是 Web 用戶端 ID，Supabase 是照這個欄位驗的。
填成 Android 那一個會收到 invalid audience。

### 3. 確認 Supabase 那邊對得上

Supabase → Authentication → Providers → Google，裡面那個 Client ID
要跟第 2 步填的是同一個。網頁版本來就在用，所以通常不用改——
**但還是去看一眼**，不一樣的話 App 登入會失敗而網頁版照常，很難查。

做 iOS 版的時候還要再建一個 iOS 用戶端、填 `window.GOOGLE_IOS_CLIENT_ID`，
並且把那個 iOS 用戶端 ID 加進 Supabase 的 Authorized Client IDs。

### 填完怎麼驗

```bash
cd app && python sync_www.py && npx cap sync android
```

重建 APK 裝上去，按登入應該要跳出**系統原生的 Google 帳號選單**（不是網頁）。
選完就直接登入，不會跳出 App。失敗的話看 logcat：

```powershell
adb logcat -s Capacitor/Console:V
```

---

## 還沒做（見 PLAN-APP.md）
- Sign in with Apple
- 本地通知（生日提醒）
- 留言檢舉／封鎖
- App 內刪除帳號
- iOS 平台（要雲端 Mac，見規劃書第 6 點）
- 圖示與啟動畫面（現在是 Capacitor 的預設圖）
