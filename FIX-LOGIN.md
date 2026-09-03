# 登入按不下去 — 兩個原因

你卡在的兩件事我都找到原因了。網站現在會自己診斷，開起來就會列出還缺什麼。

---

## 原因一：用 `file://` 開網頁（這是主因）

雙擊 `index.html` 時網址是 `file:///C:/Users/...`。
**Google OAuth 和 Supabase 都不接受 `file://` 來源**，所以按鈕按了不會有反應。

### 解法

在放檔案的資料夾開命令提示字元，執行：

```
python serve.py
```

會自動開啟 `http://localhost:5173`。從這個網址進去登入才會動。

然後到 Supabase → **Authentication** → **URL Configuration**，
把 `http://localhost:5173` 加進 **Redirect URLs**。

---

## 原因二：Cloudflare Pages 只上傳了 index.html

你做到步驟 7 了，但如果只拖了 `index.html` 上去，
`config.js` 沒跟著上傳，網站就讀不到 Supabase 金鑰，登入按鈕會是**灰色停用**狀態。

### 解法

把這些檔案放在**同一個資料夾**，整個資料夾拖上 Cloudflare Pages：

```
index.html      ← 網站
config.js       ← Supabase 金鑰（必要！）
manifest.json   ← 加到桌面用
sw.js           ← 離線快取用
icon.svg        ← 圖示
```

上傳後，回 Supabase → **Authentication** → **URL Configuration**：

- **Site URL**：`https://你的名稱.pages.dev`
- **Redirect URLs**：`https://你的名稱.pages.dev`（把 `http://localhost:5173` 也加進去）

---

## 步驟 6 失敗的補救

步驟 6 是把自己設成管理員，但必須**先成功登入過一次**才會有帳號。
順序是：

1. 先用上面的方法讓登入能動
2. 用 Google 登入一次
3. 回 Supabase SQL Editor 執行：

```sql
update public.profiles set is_admin = true
 where id = (select id from auth.users where email = 'afortunado.fu@gmail.com');
```

4. 重新整理網頁，上方會多出「審核」分頁

---

## seed.py 連線失敗

錯誤訊息裡是連線逾時。Windows 上最常見的原因是**用了 `export`**——
那是 Mac/Linux 的語法，Windows 命令提示字元不吃，變數其實沒設進去。

### Windows 命令提示字元（cmd）

```
set SUPABASE_URL=https://你的專案代號.supabase.co
set SUPABASE_SERVICE_KEY=eyJ...
python seed.py
```

### PowerShell

```powershell
$env:SUPABASE_URL="https://你的專案代號.supabase.co"
$env:SUPABASE_SERVICE_KEY="eyJ..."
python seed.py
```

**要在同一個視窗連續執行**，關掉視窗變數就沒了。

`seed.py` 已經改成會檢查這些狀況，並在連不上時直接告訴你可能是哪一種原因
（網址打錯／專案被暫停／金鑰用錯）。

> Supabase 免費專案**閒置 7 天會自動暫停**。如果之前建好放著沒動，
> 先去 Dashboard 看看有沒有 **Restore project** 的按鈕。

---

## 這次還要多跑一段 SQL

資料結構有更新（新增「當日/當月」欄位、優惠價值、省錢統計、排行榜）。
到 SQL Editor 執行 **`schema_v4.sql`** 整份，然後重跑 `python seed.py`。

順序整理：

```
1. SQL Editor 執行 schema.sql      （之前做過就跳過）
2. SQL Editor 執行 schema_v4.sql   ← 這次新增
3. set 環境變數 → python seed.py   （113 筆）
4. python serve.py → 用 localhost 登入
5. SQL 把自己設成管理員
6. 整個資料夾上傳 Cloudflare Pages
7. Supabase 加 Redirect URLs
```
