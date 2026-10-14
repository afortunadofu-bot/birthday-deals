-- ⚠️ 不要再跑這一支——已經被 schema_v97_dev_intro_flag.sql 取代（v97 是超集）。
-- 在跑過 v97 的資料庫上重貼這一支，會停在：
--   ERROR: 23514: check constraint "site_settings_key_known" ... is violated by some row
-- 因為下面的 key 白名單沒有 v97 加的 show_dev_intro，而那一列已經在表裡了。
-- （整包會回滾，不會把資料弄壞，但也不會有任何效果。）要改設定表請改跑 v97。
--
-- =====================================================================
-- v95：全站顯示開關
--
--   celine：「我希望網頁上面管理員可以加一個按鈕，是可以關掉品牌頁跟捐款頁的，
--            跟個別可以選要加甚麼展示」。
--
--   「關掉」要對**所有訪客**生效，所以不能放 localStorage（那只會影響管理員
--   自己那台裝置）。開關存在資料庫，任何人都讀得到、只有管理員改得了。
--
--   這張表只放「要不要顯示某一塊」的布林值，沒有任何個資，所以 anon 直接開讀取；
--   前端在開場就要讀到它，走 RPC 反而多一次往返。
--
--   key 用 check 白名單鎖住：這張表是公開可讀的，不限制的話管理員（或拿到管理員
--   帳號的人）可以塞任意 key 進去，變成一個誰都看得到的留言板。
--
--   可重複執行。
-- =====================================================================

create table if not exists public.site_settings (
  key        text primary key,
  enabled    boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.site_settings drop constraint if exists site_settings_key_known;
alter table public.site_settings add constraint site_settings_key_known
  check (key in (
    'show_studio_footer',      -- 頁尾「小數據所」整塊
    'show_studio_brandpage',   -- 上面那塊裡，連回品牌頁的連結
    'show_studio_bandary',     -- Bandary 封測報名連結
    'show_studio_relatestats', -- RelateStats 封測報名連結
    'show_coffee'              -- 「請我喝杯咖啡」浮動按鈕
  ));

alter table public.site_settings enable row level security;

-- 讀：所有人（含未登入）。裡面只有 on/off，沒有任何個資。
drop policy if exists site_settings_read on public.site_settings;
create policy site_settings_read on public.site_settings
  for select using (true);

-- 寫：只有管理員
drop policy if exists site_settings_admin on public.site_settings;
create policy site_settings_admin on public.site_settings
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.site_settings to anon, authenticated;
grant insert, update on public.site_settings to authenticated;

-- 預設全開＝維持現在的樣子。跑這支不會讓任何東西消失。
insert into public.site_settings(key, enabled) values
  ('show_studio_footer', true),
  ('show_studio_brandpage', true),
  ('show_studio_bandary', true),
  ('show_studio_relatestats', true),
  ('show_coffee', true)
on conflict (key) do nothing;

-- touch_updated_at() 是 schema_v32 就有的通用 trigger 函式
drop trigger if exists site_settings_touch on public.site_settings;
create trigger site_settings_touch before update on public.site_settings
  for each row execute function public.touch_updated_at();
