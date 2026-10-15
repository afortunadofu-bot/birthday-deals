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

## 還沒做（見 PLAN-APP.md）

- Google 原生登入（現在的 `signInWithOAuth` 在 WebView 會回 `403 disallowed_useragent`）
- Sign in with Apple
- 本地通知（生日提醒）
- 留言檢舉／封鎖
- App 內刪除帳號
- iOS 平台（要雲端 Mac，見規劃書第 6 點）
- 圖示與啟動畫面（現在是 Capacitor 的預設圖）
