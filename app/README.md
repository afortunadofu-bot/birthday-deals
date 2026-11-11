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
| `ios/` | 同上，**要進 git**（Info.plist、PrivacyInfo.xcprivacy、共用 scheme 都在裡面）。建置要雲端 Mac，見下面「iOS 怎麼建」 |
| `../codemagic.yaml` | iOS 的雲端建置流程（Codemagic 只讀 repo 根目錄，所以放在上一層） |

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

## iOS 怎麼建

**先講清楚哪些驗證過、哪些沒有。** 這台是 Windows，沒有 Mac，所以：

| | 狀態 |
|---|---|
| `npm i @capacitor/ios && npx cap add ios` | **實際跑過**，`ios/` 已經產生並進了 git |
| `python sync_www.py && npx cap sync ios` | **實際跑過**（Windows 上可以跑，只是複製檔案） |
| `Info.plist`、`PrivacyInfo.xcprivacy`、共用 scheme | 實際寫進去了，兩個 plist 都用 `plistlib` 解析驗過格式 |
| `codemagic.yaml` 裡的 `xcodebuild`、簽章、上傳 TestFlight | **沒驗證過**，照 Codemagic 與 Capacitor 的文件寫的 |

第一次在 Codemagic 按下 build，很可能會在某一步停下來。那是預期的，看 log 修。

### 這個 iOS 專案長什麼樣

`npx cap add ios` 在 Capacitor 8 產生的是 **Swift Package Manager** 專案，
不是以前的 CocoaPods 專案：依賴寫在 `ios/App/CapApp-SPM/Package.swift`，
**整個專案裡沒有 Podfile**，所以建置流程裡也沒有 `pod install`——
那一步在這個版型下不存在，不是漏掉。

`Package.swift` 用相對路徑 `../../../node_modules/@capgo/capacitor-social-login`
指向登入 plugin，所以 **CI 一定要先在 `app/` 跑 `npm ci`**，不然 xcodebuild 解析
SPM 依賴時會失敗。

另外補了一個 Capacitor 樣板沒附的檔：`ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme`。
Xcode 開專案時會自己生一份 scheme，但那份在 `xcuserdata/`（不進 git），
CI 上 `xcodebuild -scheme App` 會找不到，所以手寫了一份共用的。

### 建置流程放在哪

[`../codemagic.yaml`](../codemagic.yaml)，在 **repo 根目錄**（也就是 `claude/`）。
不是放在 `app/` 的原因很單純：Codemagic 只讀 repo 根目錄的 `codemagic.yaml`，
沒有「指定設定檔路徑」這個選項。

流程是：`npm ci` → `python3 sync_www.py` → `npx cap sync ios` →
`xcode-project use-profiles` → `xcodebuild archive` → `xcodebuild -exportArchive`
→ 上傳 TestFlight。

**刻意沒設自動觸發。** 網站一天會改好幾次，每次 push 都跑 macOS 會把免費的
500 分鐘燒光。要出 TestFlight 版的時候自己到 Codemagic 按 Start new build。

### 你要自己做的四件事

這四件都要用你的身分、你的帳號，我沒辦法代勞。**第 1 件要等，今天就去辦。**

#### 1. Apple Developer Program（US$99／年）

<https://developer.apple.com/programs/enroll/>

個人帳號要做身分驗證，**可能要等 1–3 週**，這是整個 iOS 路線的瓶頸。
沒有這個就拿不到 App Store Connect，也就不能上 TestFlight。

#### 2. App Store Connect 建一筆 App 記錄

<https://appstoreconnect.apple.com> → 我的 App → ＋

| 欄位 | 填什麼 |
|---|---|
| 平台 | iOS |
| 名稱 | `壽星日`（上限 30 字，想加副標就寫「壽星日 — 台灣生日優惠」） |
| 主要語言 | 繁體中文 |
| 套件 ID | **`work.celinefu.shouxing`** |
| SKU | 隨便取一個只有你看得到的代號，例如 `shouxing-ios` |

套件 ID 跟 Android 的 `applicationId` **故意是同一個**，兩邊商店各自獨立，
不會衝突。這個 ID 送出之後**永遠不能改**。

建 App 記錄之前要先在 <https://developer.apple.com/account/resources/identifiers>
把這個 Bundle ID 註冊起來（Identifiers → ＋ → App IDs → App）。
憑證跟 provisioning profile 不用自己弄，Codemagic 會去建。

#### 3. Codemagic：連 GitHub ＋ 放一把 App Store Connect API key

<https://codemagic.io> 用 GitHub 帳號登入 → Add application → 選這個 repo。
它會自己找到根目錄的 `codemagic.yaml`，workflow 清單裡會出現「壽星日 iOS → TestFlight」。

API key 要先在 Apple 那邊產生：
App Store Connect → 使用者與存取權 → 整合 → App Store Connect API →
產生 API 金鑰（存取權限選 **App Manager**），下載那個 `.p8` 檔
（**只能下載一次**），並記下 **Issuer ID** 與 **Key ID**。

然後 Codemagic → Teams/App settings → Integrations → App Store Connect →
把 Issuer ID、Key ID、`.p8` 填進去，**給這把 key 取個名字**。

⚠️ 取的名字要跟 `codemagic.yaml` 裡這一行一致，不一樣的話 build 會在簽章那步掛掉：

```yaml
    integrations:
      app_store_connect: shouxing-asc-key   # ← 改成你取的名字
```

簽章用的是 Codemagic 的 automatic code signing：它拿這把 key 去 App Store Connect
抓（沒有就自己建）憑證與 provisioning profile，所以你**不用**自己產 `.p12`、
也不用上傳任何憑證檔。

#### 4. Google 登入的 iOS 用戶端

Android 那三步（上面那一節）之外，iOS 還要再一個用戶端：

Google Cloud → 憑證 → 建立憑證 → OAuth 用戶端 ID → **iOS**，
套件 ID 填 `work.celinefu.shouxing`。然後：

- `claude/config.js` 加 `window.GOOGLE_IOS_CLIENT_ID = "…….apps.googleusercontent.com";`
- Supabase → Authentication → Providers → Google 的 **Authorized Client IDs**
  把這個 iOS 用戶端 ID 加進去（逗號分隔）
- `ios/App/App/Info.plist` 要加 `CFBundleURLTypes`，URL scheme 填**反過來寫**的
  用戶端 ID（`com.googleusercontent.apps.……`），Google 的 SDK 靠這個把人導回 App

最後那一項現在**還沒加**，因為要有實際的用戶端 ID 才填得出來。
沒填的話 iOS 版按登入會失敗（Android 版不受影響）。

### iOS 專屬的設定做了什麼

**`Info.plist`**（兩個鍵）

- `NSLocationWhenInUseUsageDescription`：「附近」要定位。WKWebView 的
  `navigator.geolocation` 跟原生定位都吃這個鍵，缺了 iOS 直接不問權限
  （功能等於壞掉），而且會被 App Review 退件。
- `ITSAppUsesNonExemptEncryption = false`：沒有這個鍵，每一版上傳 TestFlight
  都要到 App Store Connect 手動回答一次出口合規問題。

**`PrivacyInfo.xcprivacy`**（PLAN-APP.md 第 6 階段提到的那個）

Apple 從 2024-05 起強制要求，缺了上傳會收到 `ITMS-91053` 警告信。
內容是照 `privacy.html` 現在寫的翻過來的，檔案裡有逐項對照。一個重點：
**定位沒有宣告為「收集」**，因為政策寫的是「座標只在裝置上排序，不會傳給我們」，
沒有離開裝置就不算 collected。

⚠️ 兩件要自己確認：App Store Connect 的**隱私問卷**要跟這個檔對得起來
（審核是比對兩邊），而且以後加了推播、Sign in with Apple、或把座標送去後端查，
這個檔要跟著改。

### 本機能做到哪一步

Windows 上可以改 iOS 專案的檔案、可以跑 `cap sync ios`，但**不能建置、不能跑模擬器**。
iOS 的驗證只有兩條路：Codemagic 的 build log，以及裝到實機的 TestFlight 版本。

改完網站之後要讓 iOS 跟上：

```bash
cd app
python sync_www.py && npx cap sync ios
```

（`npm run sync` 的 `cap sync` 不帶平台，會一次同步 android 跟 ios。）

產出的 `ios/App/App/public`、`capacitor.config.json`、`config.xml` 都不進 git，
CI 每次都會自己重跑這一步。

### iOS 版還缺的（不只建置管線）

`ios/` 跑得起來不等於過得了審核。PLAN-APP.md 的六個卡點裡，iOS 這邊還剩：

- Sign in with Apple（有 Google 登入就必須有，Guideline 4.8）
- 留言檢舉／封鎖（Guideline 1.2）
- App 內自助刪除帳號（5.1.1(v)）
- 本地通知（生日提醒）——這是過 Guideline 4.2 的主要籌碼
- iOS 版把咖啡贊助按鈕藏起來
- 圖示與啟動畫面（現在是 Capacitor 的預設圖，`AppIcon` 只有一張 1024）

---

## 還沒做（見 PLAN-APP.md）
- Sign in with Apple
- 本地通知（生日提醒）
- 留言檢舉／封鎖
- App 內刪除帳號
- iOS 的第一個 TestFlight build（`ios/` 跟 `codemagic.yaml` 已經備好，
  但沒有 Mac 可以驗證，見上面「iOS 怎麼建」）
- 圖示與啟動畫面（現在是 Capacitor 的預設圖）
