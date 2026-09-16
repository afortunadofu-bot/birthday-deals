# 壽星日 — 交接文件（給 Claude Code 接手用）

寫於 2026-09-11。前一個 session 在 Cowork 桌面版跑，工作區（Linux sandbox）
掛載壞掉沒辦法 build／測試／commit，所以改到 Claude Code 繼續。

**2026-09-11 更新（Claude Code 這一棒）**：第六節那批動作已經做完——
`python build.py` 已重跑、`jstest/` 迴歸測試已重建並全綠、改動已 commit。
詳細見下面第四節。

---

## 一、這個專案在幹嘛

**壽星日**：台灣生日優惠整合網站。使用者可以瀏覽／篩選各品牌生日優惠、
加到待辦清單、回報「我用過了」累積省下金額、給店家評分留言、投稿新優惠、
對已上架的優惠提「修改建議」。有排行榜（省錢榜／貢獻榜）、成就徽章、
管理員審核後台。

- 線上網址：https://birthdaydeals.celine-fu-work.workers.dev/
- GitHub：https://github.com/afortunadofu-bot/birthday-deals
- 後端：Supabase（PostgreSQL + Auth + RLS），前端直接用 supabase-js 打
- 前端：單一 HTML 檔，原生 JS，沒有框架、沒有打包工具
- PWA：有 manifest.json / sw.js，可加到主畫面

## 二、檔案結構與建置流程

**這個資料夾就是 git repo 根目錄。**

```
template.html    ← 唯一的前端「原始碼」。所有前端改動都改這裡
build.py         ← 把 seed 資料塞進 template.html 產生 index.html
index.html       ← 產生出來的成品（部署用）。不要手改！改了會被 build 蓋掉
seed.py / scraper.py / threads_client.py / migrate_*.py / add_offers_v4.py
                 ← 早期抓資料、匯入資料的腳本，平常不會動
serve.py         ← 本機起 http server 用（離線模式測試）
jstest/          ← jsdom 迴歸測試（進版控了，不要再放暫存區）。
                   `cd jstest && npm install && node run_all.js`
config.js        ← Supabase 金鑰（已 gitignore）；config.example.js 是範本
schema_v*.sql    ← 資料庫 migration，一支一版，全部可重複執行
CHANGELOG.md     ← 版本紀錄，由新到舊排序
README.md / SETUP.md / FIX-LOGIN.md  ← 說明文件
```

**改任何前端功能的標準流程：**

```bash
# 1. 改 template.html
# 2. 重新產生 index.html
python3 build.py        # 會印出「index.html 已產生，共 N 筆優惠。」
# 3. 測試（見下一節）
# 4. 更新 CHANGELOG.md
# 5. git commit
```

## 三、開發慣例（前一個 session 建立的，建議延續）

### 使用者看得到的改動要記進「更新紀錄」

「我的」分頁的「🆕 更新紀錄」內容寫在 `template.html` 的 `SITE_UPDATES`（新的加在最上面，
日期 YYYY-MM-DD）。只寫使用者用起來有什麼不一樣，不寫資料庫、管理員後台、還沒上線的分支功能。
CHANGELOG.md 是給開發看的完整紀錄，兩邊都要更新。

### 測試：jsdom「先驗證再收工」

前一個 session 的做法是：每改完一個功能，就用 jsdom 載入產生出來的
index.html，把 `window.supabase` 換成 mock，模擬點擊，印出斷言結果，
確認全 true 才算完成。

**✅ 已重建**：舊的那批（t4.js ~ t22.js）隨 sandbox 暫存區消失了，現在
repo 裡有 `jstest/`，已進版控。跑法：

```bash
cd jstest && npm install && node run_all.js
```

目前 5 支、70 條斷言，覆蓋待審佇列批次核可、管理員點頭貼看信箱（排行榜＋
留言兩個接線點）、地區標籤換行。新增測試照 `jstest/README.md` 的表格補一列。

mock 的關鍵重點（踩過的坑，`jstest/harness.js` 都處理掉了）：
- `sb.from(...)` 回傳的 mock query builder 要把所有會用到的鏈式方法都補齊：
  `select / eq / in / not / gte / lte / order / limit / single / maybeSingle /
  insert / update / upsert / delete / then`。少一個就整個炸
  （`.not is not a function` 這個坑踩過兩次）
- `select('id',{count:'exact',head:true})` 這種精確計數查詢要回 `count` 欄位
- 要 stub 掉動態插入的 `<script src>`（config.js / supabase CDN），
  讓它假裝載入成功，不然會蓋掉自己 stub 的 window.supabase
- 要 stub `HTMLDialogElement.prototype.showModal/close`、`window.scrollTo`
- 測試腳本不會自己結束，收尾要 `process.exit(0)` 或外面包 `timeout`

### SQL migration 慣例

- 檔名 `schema_vN_描述.sql`，版號接續往下加
- **一律要可重複執行**（`create or replace` / `drop ... if exists` /
  `if not exists`），使用者會整批重貼
- 檔頭寫清楚「為什麼要改」的來龍去脈（這個專案的註解風格是講背景、
  講根因，不是只講 what）
- **`create or replace view` 只能在既有欄位後面 append 新欄位**，
  不能改名稱／型別／順序，否則報 `42P16`。要插在中間就得
  `drop view if exists` 再 `create`（v56 就是踩這個坑）
- 寫完可以用 `pglast`（Python 綁 libpg_query）驗語法：
  `pglast.parse_sql(sql)` 驗外層、`pglast.parse_plpgsql(sql)` 驗函式本體

### 註解風格

這個 codebase 的註解是「講清楚為什麼」，包含使用者原始回饋、根因分析、
為什麼選這個做法而不是另一個。維持這個風格，不要改成一行式的 what 註解。

### 使用者溝通

celine 會轉述朋友「嵐」的回饋（口語、有時間戳、繁中）。回饋通常很短，
要自己去 codebase 找根因。回報時講結論跟根因，不要流水帳。

---

## 四、目前進度

### ✅ 已完成且已 commit（本地）

本地最新三個 commit：`24f9453`、`afa225e`、`c78c48a`

- v53 排行榜／貢獻榜「全部時間」也有名次升降箭頭
  （用「7 天前快照」view 比對，因為全部時間榜沒有天然的「上一期」）
- v54 修「全選核可」撞 `offers_timing_check`（前端有「其他」選項，
  DB constraint 沒有）
- v55 排行榜（公開頁）加即時在線人數、平台總瀏覽人次、使用時段分布
- 手機版「新增」表單跳鍵盤時貼底導覽列被蓋住（visualViewport API）
- 修改建議的長網址把版面撐爆（overflow-wrap）
- 回報使用狀況後邀請評分
- v56 優惠詳情頁顯示該優惠目前待審的修改建議
- 待審佇列標題旁補筆數徽章
- 核可／退回後畫面跳掉（row 移除的 setTimeout 沒被 withScrollRestore 包住）
- 「已通過／已退回」總筆數被 `.limit()` 截斷導致跟儀表板數字對不起來
- 站台數據＋洞察分析視覺改版（.bigstat 卡片化、所有圖表統一 .dash-chart
  外框、長條圖收斂成 .hbar-row/.hbar-track/.hbar-fill 共用 class）

### ✅ 已 build、已測試、已 commit（2026-09-11 Claude Code 這一棒）

下面這三項當初只改在 `template.html`，現在已經 `python build.py` 產出
`index.html`、補了 jsdom 迴歸測試（全綠）、並且 commit 了。

1. **待審佇列「適用地區」標籤跑版**
   `.flag` 為了短標籤設了 `white-space:nowrap`，但地區標籤會塞十幾個縣市，
   整串撐出卡片。新增 `.flag.wrap`（允許換行＋`overflow-wrap:anywhere`），
   只套在 loadPending() 的地區標籤上。

2. **待審佇列一鍵全選批次核可**
   新增 `#pendBulkBar`（全選 ＋「核可已勾選（已選 N 筆）」）、每列
   `.pend-check` 勾選框、`bulkApproveOffers(ids)`。批次核可會沿用每一列
   自己的「已查證」勾選與「審核備註」輸入值。

3. **管理員點頭貼看註冊信箱**
   - 排行榜：`wireEmailLongPress` 改寫成 `wireEmailPeek`，從「長按 550ms」
     改成「點一下」切換顯示，一樣 stopPropagation 擋掉外層展開列
   - 留言區（詳情彈窗＋管理員「最近留言」）：新增
     `adminEmailBtnHtml(uid)` / `adminLookupEmail(uid)` /
     `wireAdminEmailBtns(root)`，只有管理員看得到的信封鈕，點了才用既有的
     `admin_user_emails()` RPC 查，查過的存 `ADMIN_EMAIL_CACHE`

**驗證重點**（這三點都已經寫成測試，在 `jstest/t01`～`t04`）：勾兩筆按批次
核可要送出兩次 review_offer 且帶對 verified/note；非管理員完全不該出現信封鈕；
點排行榜頭貼不能連帶展開該列。

~~已知小瑕疵~~（2026-09-15 已修）：`adminLookupEmail()` 原本 RPC 失敗時也把 `null`
存進 cache，現在失敗不存、再點會重查。同一次也修了「打開信箱後收不回去」。

### 🔴 要 celine 貼進 Supabase SQL Editor 執行的

以下四支不確定有沒有跑過（v54 確定沒跑、v56 跑失敗後已修正），
全部可重複執行，建議整批重貼一次：

- `schema_v53_leaderboard_contrib_prev.sql`
- `schema_v54_timing_check_other.sql`
- `schema_v55_public_online_hours.sql`
- `schema_v56_pending_edit_preview_fields.sql` ← 已修成 drop + create
- `schema_v57_used_on_trigger.sql` ← 取代會報 23514 的 used_on CHECK constraint（見 CHANGELOG v57）

**沒跑的話對應前端功能不會動**（名次箭頭、全選核可、即時在線人數、
詳情頁待審修改建議的「改前內容」）。

### 📋 待辦

1. **店家規劃用 insight（嵐要的，優先）**
   - 單一會員平均點進來幾次：`site_events` 已有 pageview + user_id/session_id。
     算「近 N 天平均每位會員造訪次數」「平均每位訪客造訪次數」「回訪率
     （造訪 2 次以上的會員佔比）」。要跟 `admin_dashboard_stats` 既有的
     `active_users_range` 定義對齊，避免又出現「數字不統一」
   - 生日禮種類 × 日期交叉分析：`usage_reports` 有 used_on/offer_id，
     `offers` 有 category/free_tier/membership_type/timing。建議兩組：
     (a) 類別 × 月份 → 店家排檔期用
     (b) 類別 × 相對生日的日子（用 profiles.birthday 算「生日當天／前7天／
     後7天／當月其他」）→ 回答「大家是生日當天就衝還是拖到月底」
     ⚠️ 牽涉生日是敏感資料，只做聚合、不回傳任何 user_id，只開管理員
   - 前端沿用這輪新加的 `.dash-chart` / `.hbar-row` 樣式；交叉分析建議用
     簡單熱力表（類別為列、月份為欄，格子深淺代表次數）

2. 地圖功能：附近店家優惠——**已經合併回 `main` 上線**（2026-09-16）。程式、SQL（v58）、
   分店資料（`stores_import_*.sql`，9767 家）、測試（`jstest/t06_near_me.js`）都在 main 上。
   還沒收尾的兩件事：
   - `store_search_aliases.json` 最下面 `_待celine確認` 那 10 個品牌還是 0 家分店
     （薄多義、忠泰樂、波記、喜多酸菜魚、Mr. May、喬義思、烤狀猿、丹蕾，以及天成／米塔／
     瓦城泰統／京星集團優惠涵蓋哪些品牌）。celine 確認後改別名、`python fetch_stores.py
     --cache-only` 重新產生匯入檔再貼一次即可
   - 地圖圖磚目前用 OpenStreetMap 官方圖磚，流量變大前要換成 MapTiler／Stadia
     （改 `openNearMap()` 裡的 `tileLayer` 網址），見 `GEO-SETUP.md`
3. 洞察分析加品牌／使用趨勢走勢圖
4. i18n 多語系

---

## 五、兩個卡關

1. **Cowork 工作區掛載壞掉**：9/8 那版 Windows 更新造成的，Claude Code
   不受影響，所以才轉過來。
2. **GitHub push 沒授權**：`git push origin main` 一直失敗
   （`could not read Username for 'https://github.com'`），
   本地三個 commit 都推不上去。接手後要先處理這個，不然改再多也上不了線。

---

## 六、接手後建議的第一批動作

```bash
# 1. 確認狀態
git log --oneline -5
git status

# 2. 把已改好的 template.html 建置出來
python3 build.py

# 3. 建 jstest/ 重新寫迴歸測試（舊的已隨暫存區消失）
#    至少先覆蓋：待審佇列批次核可、頭貼看信箱、地區標籤換行

# 4. 跑過之後 commit
git add -A
git commit -m "跑版/批次核可/頭貼看信箱"

# 5. 設定 GitHub 認證後 push
git push origin main
```
