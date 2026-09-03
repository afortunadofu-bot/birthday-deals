# 壽星日 v7 改版規劃書

給下一輪執行者（Sonnet）的施工說明。依 P0→P4 順序做，每個階段做完就 build + 測，不要一次全改。

**現況基準**：`template.html`（單檔前端，約 1200 行）→ `build.py` 注入 `offers.json` → `index.html`。
資料庫 Supabase，已跑過 `schema.sql` / `schema_v4.sql` / `schema_v5.sql` / `schema_v6.sql`。

---

## 施工紀律（重要，先讀）

**不可破壞的既有功能**——每階段做完都要確認這些還活著：

- 113 筆種子資料正常顯示、離線模式（無 config.js）不白畫面
- Google 登入流程、`redirectTarget()` 的 `/index.html` 正規化邏輯
- 未登入可瀏覽、要記錄才需登入
- PWA（manifest / sw.js / 加到桌面）
- 所有 `$()` / `$$()` 取用的 DOM id 與 class

**Non-goals（這輪不要做）**：

- 不要換掉單檔架構、不要引入 React/Vue/建置工具
- 不要改 `seed.py` 的資料格式或重灌資料
- 不要動 `is_admin()` / `guard_profile_privileges()` 這兩個既有的安全機制
- 不要為了 i18n 就把中文字串全部換成 key（P4 才做，且分兩步）

**驗收方式**：沿用 `~/jstest` 的 jsdom 測試法。每個階段至少寫一支測試檔，模擬 supabase client 驗證互動。純視覺改動要用 `node --check` + CSS 大括號配對確認沒壞。

---

## P0：管理員權限沒生效（阻塞項，先修）

### 診斷

RLS 規則本身沒問題，已確認：

- `public.is_admin()` 有 `security definer`，能繞過 profiles 自身 RLS
- `profiles_read` 是 `using (true)`，讀自己的 profile 不會被擋
- `offers_read_admin` / `offers_update_admin` / `review_offer()` 都正確

所以問題在**資料**或**前端錯誤被吞掉**，依可能性排序：

1. **`profiles` 根本沒有你那一列**（最可能）
   自動建 profile 是靠 `on_auth_user_created` trigger。如果曾經在跑 `schema.sql` **之前**就登入過，那次登入不會建 profile，後來的 `update ... where id = (select id from auth.users where email=...)` 就會**影響 0 列**。
   Supabase SQL Editor 對 UPDATE 影響 0 列一樣顯示 Success，不會警告，所以看起來「有跑成功」。

2. **email 對不上**——用了另一個 Google 帳號登入，`auth.users` 裡的 email 跟 SQL 裡寫的不同。

3. **前端把錯誤吞掉**——`onSession()` 裡：
   ```js
   const {data} = await sb.from('profiles').select('*').eq('id',me.id).single();
   myProfile = data;
   ```
   `error` 沒接。`.single()` 在查不到列時會回錯誤且 `data` 為 null，結果 `myProfile` 是 null，審核分頁靜默隱藏，畫面上沒有任何線索。

### 施工內容

**(a) 新增 `schema_v7_admin_fix.sql`**——一份可重複執行的自我修復腳本：

```sql
-- 1) 補建所有缺漏的 profile（處理「登入早於 trigger 安裝」的情況）
insert into public.profiles (id, display_name, avatar_url)
select u.id,
       coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '壽星'),
       u.raw_user_meta_data->>'avatar_url'
from auth.users u
on conflict (id) do nothing;

-- 2) 先看清楚有哪些帳號、目前誰是管理員
select u.email, p.id, p.display_name, p.is_admin
from auth.users u left join public.profiles p on p.id = u.id
order by u.created_at;

-- 3) 設管理員，用 returning 確認「真的有改到」
--    如果下面這段回傳 0 列，代表 email 打錯或該帳號沒登入過
update public.profiles set is_admin = true
 where id = (select id from auth.users where lower(email) = lower('afortunado.fu@gmail.com'))
returning id, display_name, is_admin;
```

腳本內要用註解寫清楚：**第 3 段一定要看到回傳一列，看到 0 列就是沒設成功**。

**(b) 前端 `onSession()` 加錯誤處理**

```js
const {data, error} = await sb.from('profiles').select('*').eq('id', me.id).single();
if (error || !data) {
  myProfile = null;
  note($('#modeBanner'), 'alert',
    `<b>讀不到你的個人檔案</b>（${esc(error?.message || '查無資料')}）。<br>
     你的 user id：<code>${esc(me.id)}</code><br>
     請到 Supabase SQL Editor 執行 schema_v7_admin_fix.sql。`);
} else {
  myProfile = data;
}
```

**(c) 「我的」分頁加一塊權限診斷區**（`#myDebug`）

登入後永遠顯示，內容：目前 email、user id、`is_admin` 是 true 還 false、可一鍵複製 user id。
這樣以後有任何權限問題，使用者能直接把 id 貼進 SQL，不用再猜。

**(d) 更新 `FIX-LOGIN.md`**，加一節「設了管理員卻沒有審核分頁」，寫明上面的 0 列陷阱。

### 驗收

- jsdom 模擬 `is_admin: true` → 審核分頁出現、`#myDebug` 顯示 `是`
- jsdom 模擬 profiles 查詢回 `{data:null, error:{...}}` → 畫面出現紅色橫幅且含 user id，不是靜默失敗

---

## P1：資訊細節與基本操作（單週可完成）

### 1-1　我的使用回報可點進去看細項

**現況**：`loadMyStuff()` 只 select 了 `id,used_on,result,saved_twd,offers(brand)`，`store` / `note` 根本沒撈出來，一行帶過。

**改法**：

- select 補齊：`id,used_on,result,saved_twd,store,note,created_at,offers(id,brand,offer,timing,category)`
- `.rep` 那一行整列可點 → 開新的 `<dialog id="dlgMyReport">`
- 視窗內容：品牌／優惠原文／使用日期／結果（成功·部分·失敗，用既有 `.ok/.partial/.fail` 配色）／省下金額／門市／備註／建立時間
- 視窗底部兩顆按鈕：**編輯**（帶回 `dlgReport` 重新填，走 update）、**刪除**（沿用現有 confirm + delete）
- 編輯需要 `usage_reports` 的 update RLS——目前只有 insert/delete/admin，**要補一條**：
  ```sql
  create policy reports_own_update on public.usage_reports
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());
  ```

### 1-2　留言可刪除

RLS 已經有 `comments_own for delete using (user_id = auth.uid())`，**不用改資料庫**。

前端在 `openDetail()` 的 `cmtHtml` 裡：

- 若 `x.user_id === me?.id` → 顯示「刪除」按鈕（自己的留言）
- 若 `myProfile?.is_admin` → 顯示「刪除」+ 既有的「隱藏」（管理員兩種都能做）
- 刪除要 `confirm()`，成功後 `openDetail(id)` 重畫 + `loadOffers().then(render)` 更新留言數徽章

### 1-3　管理員審核按鈕（補齊缺口）

現在審核分頁只能「原樣核可 / 退回」。要補的是：

- **編輯後核可**：待審卡片加「編輯」按鈕 → 沿用 `startEditOffer()` 的表單填法，但管理員版本送出後回到審核分頁，不改 status
- **已上架優惠也能改**：`render()` 產生的卡片，`myProfile?.is_admin` 時多一顆「編輯」按鈕，開同一個表單，送出走 `sb.from('offers').update()`（`offers_update_admin` 已允許，不用新 RLS）
- **下架**：審核分頁與卡片加「下架」→ `review_offer(id,'archived')`，RPC 已支援 `archived`

### 1-4　排序與篩選器補強

- 排序下拉補上「依留言數」「依回報次數」兩個選項（資料在 `offers_public` 已有 `comment_count` / `report_count`）
- 篩選補「有人回報過」「有留言」兩個 toggle
- 排序記憶：把目前排序/篩選寫進 `localStorage`，下次開啟還原（PWA 每天用，這個很有感）

---

## P2：手機版 UI 大改（參考 Ocard／國泰優惠）

這是使用者反映最強烈的一項：**篩選佔掉大半螢幕又不能收合**。

### 目標排版（對齊 Ocard / 國泰的共同特徵）

那類 app 的共通做法：

1. 頂部只留 logo + 搜尋框，不放任何篩選
2. 分類是**單行橫向捲動**的 chip，絕不換行成三四行
3. 其他篩選全部收進一顆「篩選」按鈕，點了從**底部滑出 bottom sheet**
4. 卡片走「左品牌圖／右文字」的固定結構，一屏看得到 3–4 張
5. 底部 tab bar 固定，大量留白、圓角、淺灰分隔線

### 具體改法

**(a) 篩選區重構**

- 桌機（>600px）：維持現在的展開樣式，這個沒問題
- 手機（≤600px）：sticky 區只留一行 → `[搜尋框] [篩選 ⌄ (3)] [排序 ⌄]`
  - 「篩選」按鈕右上角顯示**已套用數量徽章**
  - 點擊開 `<dialog id="dlgFilter">`，以 bottom sheet 樣式呈現（`position:fixed; bottom:0; border-radius:16px 16px 0 0`），裡面放期間／類型／分類／地區／會員全部 chip 群組
  - sheet 底部固定兩顆：「清除全部」「查看 N 筆結果」
- 分類 chip 群組在手機一律 `flex-wrap:nowrap; overflow-x:auto`，加左右漸層遮罩暗示可捲動

**(b) 卡片精簡（手機）**

現在卡片塞了太多列（meta / line / kv / 來源）。手機版只留：

- 第一行：品牌（粗）＋ 金額（右對齊）
- 第二行：優惠內容，最多兩行 `-webkit-line-clamp:2`
- 第三行：最多 3 個關鍵標籤（當日／免費／會員種類）
- 底部：`我用過了` `留言(n)` 兩顆按鈕

其餘（條件、期限、門市、來源、提前天數）收進「詳情」——直接**沿用已經做好的 `dlgDetail` 視窗**，在裡面上半部加優惠完整資訊，下半部才是回報與留言。這樣點卡片任一處都能看全貌，跟 Ocard 的行為一致。

**(c) 觸控尺寸**

所有可點元素最小 44×44px（現在 `.btn.sm` 只有約 28px 高，手機很難點）。

### 驗收

- jsdom 模擬 375px 寬 → 確認 sticky 區高度 < 120px、篩選 chip 不在主畫面
- 桌機 1280px → 確認維持原本展開樣式沒退化

---

## P3：待辦清單與民眾修改建議

### 3-1　待辦清單（勾選）

**新表**：

```sql
create table if not exists public.wishlist (
  user_id    uuid   not null references public.profiles(id) on delete cascade,
  offer_id   bigint not null references public.offers(id) on delete cascade,
  done       boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, offer_id)
);
alter table public.wishlist enable row level security;
create policy wishlist_own on public.wishlist
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

**前端**：

- 卡片右上角一顆書籤/星號 icon → 加入或移出清單（樂觀更新，失敗再回滾）
- 「我的」分頁新增「我的待辦清單」區塊：可勾選 `done`，已完成的置底並淡化
- 勾選 `done` 時跳一個輕量提示：「要順便記錄省下多少嗎？」→ 一鍵開 `dlgReport`（把待辦跟省錢統計串起來，這是這個 app 的核心迴圈）
- **未登入**也能用：先存 `localStorage`，登入後自動合併上傳（合併時 `on conflict do nothing`）

### 3-2　民眾提出修改建議（需核可）

**新表**：

```sql
create table if not exists public.offer_edits (
  id          bigserial primary key,
  offer_id    bigint not null references public.offers(id) on delete cascade,
  proposed_by uuid   not null references public.profiles(id) on delete cascade,
  patch       jsonb  not null,              -- 只存要改的欄位，例如 {"offer":"...","advance_days":7}
  reason      text   not null default '',
  status      text   not null default 'pending'
              check (status in ('pending','approved','rejected')),
  reviewed_by uuid   references public.profiles(id),
  reviewed_at timestamptz,
  review_note text   not null default '',
  created_at  timestamptz not null default now()
);
alter table public.offer_edits enable row level security;

create policy edits_read_own on public.offer_edits
  for select using (proposed_by = auth.uid() or public.is_admin());
create policy edits_insert on public.offer_edits
  for insert with check (
    auth.uid() is not null and not public.is_banned()
    and proposed_by = auth.uid() and status = 'pending'
  );
create policy edits_admin on public.offer_edits
  for all using (public.is_admin()) with check (public.is_admin());
```

**核可用 RPC**（跟 `review_offer` 同一個模式，`security definer` + 內部檢查 admin）：

```sql
create or replace function public.review_offer_edit(p_edit_id bigint, p_status text, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare e public.offer_edits;
begin
  if not public.is_admin() then raise exception '只有管理員可以審核'; end if;
  select * into e from public.offer_edits where id = p_edit_id;
  if e.id is null then raise exception '找不到這筆建議'; end if;

  if p_status = 'approved' then
    -- 用 jsonb_populate_record 把 patch 套回 offers，只有 patch 裡有的欄位會被改
    update public.offers o set
      brand        = coalesce(e.patch->>'brand', o.brand),
      offer        = coalesce(e.patch->>'offer', o.offer),
      conditions   = coalesce(e.patch->>'conditions', o.conditions),
      membership   = coalesce(e.patch->>'membership', o.membership),
      timing       = coalesce(e.patch->>'timing', o.timing),
      advance_days = coalesce((e.patch->>'advance_days')::int, o.advance_days),
      value_twd    = coalesce((e.patch->>'value_twd')::int, o.value_twd),
      valid_until  = coalesce((e.patch->>'valid_until')::date, o.valid_until)
    where o.id = e.offer_id;
  end if;

  update public.offer_edits
     set status = p_status, reviewed_by = auth.uid(),
         reviewed_at = now(), review_note = coalesce(p_note,'')
   where id = p_edit_id;
end $$;
```

**前端**：

- 卡片／詳情視窗加「回報錯誤・建議修正」按鈕 → dialog，只列常改的欄位（優惠內容、條件、提前天數、金額、到期日）＋ 修改原因
- 只送出「有動過」的欄位進 `patch`，沒動的不放
- 審核分頁分成三個 tab：**待審投稿** / **修改建議** / **已處理**
- 修改建議卡片要**並排顯示新舊值**（`原本：xxx → 建議：yyy`），管理員一眼可判斷

---

## P4：集團階層與國際化

### 4-1　集團（一個集團可分開寫，也可整包寫一筆）

```sql
alter table public.offers add column if not exists group_name    text    not null default '';
alter table public.offers add column if not exists is_group_wide boolean not null default false;
create index if not exists offers_group_idx on public.offers(group_name) where group_name <> '';
```

語意約定（寫進註解，避免後續混淆）：

- `group_name = '王品集團'`、`is_group_wide = false` → 這是集團底下**單一品牌**的優惠
- `group_name = '王品集團'`、`is_group_wide = true` → 這是**整個集團通用**的那一筆（例如「集團共用生日禮」）
- 兩者可以同時存在，不互斥

**前端**：

- 列表頂端加「依品牌 / 依集團」切換
- 依集團模式：同 `group_name` 收成一張大卡，卡上先顯示 `is_group_wide` 那筆，下方可展開列出旗下各品牌單筆
- 篩選加「集團」下拉
- **統計陷阱**：`site_stats` 與「全部用完可省」加總時，若集團通用那筆跟旗下單筆同時計入會**重複灌水**。建議統計時排除 `is_group_wide = true`，並在 UI 標註口徑

### 4-2　國際化（全球通用）

這項工程最大，**拆成兩步做，第一步就有價值**：

**第一步（建議這輪只做這步）——字串抽離**

- 把所有寫死的 UI 中文集中成一個 `I18N` 物件：`{ 'zh-TW': {...}, 'en': {...} }`
- 加 `const t = k => I18N[LANG][k] ?? I18N['zh-TW'][k] ?? k;`
- `LANG` 依 `navigator.language` 判定，右上角可手動切換並存 `localStorage`
- 先只做 `zh-TW`，`en` 留空物件也沒關係——**重點是把字串集中，之後翻譯只是填表**

**第二步（之後再做）——資料層去在地化**

- 地區：`regions text[]` 目前寫死台灣 22 縣市 → 加 `country text not null default 'TW'`，篩選改成「國家 → 地區」兩層
- 金額：`value_twd` → 新增 `currency text default 'TWD'`，顯示改用
  `new Intl.NumberFormat(LANG, {style:'currency', currency}).format(v)`
  （**注意**：不要直接改名 `value_twd` 欄位，會連動 `seed.py`、`my_savings`、`leaderboard`、`popular_offers`、`site_stats` 五處 view。改成「新增 currency 欄位、`value_twd` 保留為數值」風險最低）
- 日期：改用 `Intl.DateTimeFormat`，不要自己拼 `${m}/${d}`
- 生日死線計算要注意時區，統一用當地日期而非 UTC

---

## 建議施工順序與檢查點

| 階段 | 內容 | 產出檔案 | 檢查點 |
|---|---|---|---|
| P0 | 管理員修復 | `schema_v7_admin_fix.sql`、改 `onSession()`、`#myDebug` | 使用者看得到審核分頁 |
| P1 | 回報細項／留言刪除／審核按鈕／排序 | `schema_v8.sql`（reports update policy） | 各功能 jsdom 測試通過 |
| P2 | 手機 UI 大改 | 僅 `template.html` | 375px 下 sticky < 120px |
| P3 | 待辦清單／修改建議 | `schema_v9.sql` | 建議送出→核可→內容真的變了 |
| P4 | 集團／i18n | `schema_v10.sql` | 統計沒有重複計算 |

每個階段結束都要：`python3 build.py` → `node --check` → 跑 `~/jstest` 的迴歸測試 → 確認 113 筆與離線模式正常。

---

## 給執行者的提醒

- **P0 沒修好之前不要往下做**，後面 P1/P3 的管理員功能全部驗不了
- 每加一張表都要記得 `enable row level security` + 至少一條 policy，漏掉等於資料全公開（anon key 是公開的，RLS 是唯一防線）
- 每個新 view 都要 `with (security_invoker = true)`，否則會用 view 擁有者權限執行，繞過 RLS
- 新增 RPC 一律 `security definer` + 函式內第一行檢查 `is_admin()`，不要只靠前端隱藏按鈕
- 手機 UI 改動幅度大，建議**先另存一份 `template.html` 備份**再動手
