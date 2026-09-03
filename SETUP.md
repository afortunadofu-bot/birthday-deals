# 上線步驟（全部免費）

整套走 Supabase 免費方案 + Cloudflare Pages 免費方案，**月費 $0**。
照著做大約 30 分鐘。不用寫程式，但要複製貼上一些東西。

---

## 步驟 1：建立 Supabase 專案（5 分鐘）

1. 到 <https://supabase.com> 註冊（可用 Google 帳號）
2. 點 **New project**
   - Name：`birthday-deals`（隨意）
   - Database Password：**存起來**，之後可能會用到
   - Region：選 **Southeast Asia (Singapore)**，離台灣最近
3. 等 2 分鐘建置完成

> 免費方案額度：500MB 資料庫、5GB 流量／月、50,000 位月活躍使用者。
> 以這個網站的規模，短期內用不完。
> 注意：**免費專案若連續 7 天沒有任何活動會被暫停**（可一鍵恢復）。

---

## 步驟 2：建立資料表（2 分鐘）

1. 左側選單 → **SQL Editor** → **New query**
2. 把 `schema.sql` 整份內容貼上
3. 按 **Run**

看到 `Success. No rows returned` 就成功了。這份 SQL 可以重複執行，改壞了再跑一次即可。

---

## 步驟 3：開啟 Google 登入（10 分鐘）

這步最繁瑣，因為要去 Google 那邊申請。

### 3-1　先拿到 Supabase 的 callback 網址

Supabase → **Authentication** → **Sign In / Providers** → 找到 **Google** → 展開，
複製那串 **Callback URL**，長得像：

```
https://你的專案代號.supabase.co/auth/v1/callback
```

### 3-2　到 Google Cloud 建立憑證

1. 前往 <https://console.cloud.google.com>
2. 建立一個新專案（名稱隨意）
3. 左側 → **API 和服務** → **OAuth 同意畫面**
   - User Type 選 **外部（External）**
   - 應用程式名稱：`壽星日`
   - 使用者支援電子郵件：你的 Gmail
   - 開發人員聯絡資訊：你的 Gmail
   - 其餘留空，一路 **儲存並繼續**
4. 左側 → **憑證** → **建立憑證** → **OAuth 用戶端 ID**
   - 應用程式類型：**網頁應用程式**
   - **已授權的重新導向 URI**：貼上剛剛複製的 Callback URL
   - 建立
5. 複製 **用戶端 ID** 和 **用戶端密鑰**

### 3-3　填回 Supabase

回到 Supabase 的 Google provider 設定，把 Client ID 與 Client Secret 貼上，
打開 **Enable Sign in with Google**，儲存。

> 測試階段 Google 會限制只有「測試使用者」能登入。
> 在 OAuth 同意畫面把自己的 Gmail 加進測試使用者清單即可。
> 要開放給所有人，需要送出「發布應用程式」。

---

## 步驟 4：匯入 58 筆種子資料（3 分鐘）

1. Supabase → **Project Settings** → **API**（或 Data API），複製：
   - **Project URL**
   - **service_role** key（在 `Secret keys` 區塊，要按顯示）

2. 在電腦上執行：

```bash
pip install requests
export SUPABASE_URL="https://你的專案代號.supabase.co"
export SUPABASE_SERVICE_KEY="eyJ...你的 service_role key"

python seed.py --dry-run    # 先看看要送什麼
python seed.py              # 實際寫入
```

> ⚠️ **service_role key 可以繞過所有權限規則**。只放在自己電腦的環境變數裡，
> 不要寫進任何檔案、不要上傳 GitHub、不要放進 `config.js`。

---

## 步驟 5：設定前端（2 分鐘）

1. Supabase → **Project Settings** → **API**，複製 **Project URL** 與 **anon public** key
   （anon key 是設計成公開的，可以放前端）
2. 把 `config.example.js` 複製成 `config.js`，填入這兩個值
3. 用瀏覽器開啟 `index.html`，右上角應該能按 **使用 Google 登入**

---

## 步驟 6：把自己設成管理員（1 分鐘）

**先用 Google 登入一次**（這樣才會在資料庫產生你的帳號），然後回 SQL Editor 執行：

```sql
update public.profiles set is_admin = true
 where id = (select id from auth.users where email = 'afortunado.fu@gmail.com');
```

重新整理網頁，右上角會出現綠色「管理員」標籤，並多出「審核後台」分頁。

---

## 步驟 7：免費部署上線（5 分鐘）

推薦 **Cloudflare Pages**（免費、無流量上限、台灣速度快）：

1. 把 `index.html` 和 `config.js` 兩個檔案放進一個資料夾
2. 到 <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Pages**
   → **Upload assets**，把資料夾拖進去
3. 拿到網址 `https://xxx.pages.dev`

**最後一步別忘了**：回 Supabase → **Authentication** → **URL Configuration**，
把 `https://xxx.pages.dev` 加進 **Site URL** 和 **Redirect URLs**，
否則登入後會被導回錯誤的網址。

> 其他免費選項：GitHub Pages、Netlify、Vercel，做法類似。

---

## 之後的日常維運

```bash
# 更新資料
python scraper.py            # 部落格/新聞 → diff_report.md
python threads_client.py     # Threads → threads_report.md
# 人工確認後編輯 offers.json
python seed.py               # 同步進資料庫（依 slug 覆蓋，不會產生重複）

# 只改前端版型
python build.py              # 重新產生 index.html，再上傳一次
```

日常的優惠新增與審核，直接在網站上做就好，不用碰程式。

---

## 安全性設計（給想確認的人看）

前端用的 `anon key` 是公開的，任何人都拿得到。**所有安全性靠資料庫的 RLS 規則把關**：

| 行為 | 誰可以做 | 怎麼擋 |
|---|---|---|
| 看已核可的優惠 | 所有人（含未登入） | `status = 'approved'` |
| 看待審／被退件的 | 只有投稿者本人與管理員 | `submitted_by = auth.uid()` |
| 新增優惠 | 登入且未被停用者 | 強制 `status='pending'`、`verified=false` |
| 核可／退件 | 只有管理員 | `review_offer()` 函式內再檢查一次 |
| 把自己變管理員 | **沒有人做得到** | trigger 會把 `is_admin` 還原成舊值 |
| 灌爆投稿 | — | 每人每日 10 筆 |
| 灌爆留言 | — | 每人每日 30 則 |
| 重複回報同一天 | — | 資料庫 unique 約束 |

即使有人拿 anon key 直接打 API，也繞不過這些規則——因為規則是在資料庫層執行的，
不是寫在前端 JavaScript 裡。

**已知的殘留風險**（先讓你知道，不是現在就要解）：

- 一個人可以辦多個 Google 帳號來洗回報。要防得靠人工觀察異常，或之後加檢舉功能。
- 管理員權限目前只能靠 SQL 指令給予，沒有後台介面。使用者少時這樣反而安全。
- 沒有留言檢舉機制，管理員得自己巡。留言表已有 `is_hidden` 欄位，之後要做很快。
