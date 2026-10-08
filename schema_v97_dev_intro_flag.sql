-- =====================================================================
-- v97：多一個開關——「我的」頁面底部的開發者介紹
--
--   celine：「本來是想要教你在我的頁面最下面加一個 BLOCK 當作開發者的介紹，
--            引導到這個網站 …celinefubrandpage/，然後管理員可以把這個 BLOCK 關掉」。
--
--   這支是 v95 的超集：整張表、policy、白名單、預設值都重寫一次。所以
--     - v95 已經跑過 → 跑這支只會多一個 key，其他不動
--     - v95 沒跑過   → 跑這支就夠了，不用回頭補 v95
--
--   可重複執行。
-- =====================================================================

create table if not exists public.site_settings (
  key        text primary key,
  enabled    boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- 白名單加上 show_dev_intro。公開可讀的表不限制 key 的話，等於開了一個
-- 誰都看得到的留言板。
alter table public.site_settings drop constraint if exists site_settings_key_known;
alter table public.site_settings add constraint site_settings_key_known
  check (key in (
    'show_studio_footer',      -- 頁尾「小數據所」整塊
    'show_studio_brandpage',   -- 上面那塊裡，連回品牌頁的連結
    'show_studio_bandary',     -- Bandary 封測報名連結
    'show_studio_relatestats', -- RelateStats 封測報名連結
    'show_coffee',             -- 「請我喝杯咖啡」按鈕
    'show_dev_intro'           -- v97：「我的」頁面底部的開發者介紹區塊
  ));

alter table public.site_settings enable row level security;

drop policy if exists site_settings_read on public.site_settings;
create policy site_settings_read on public.site_settings
  for select using (true);

drop policy if exists site_settings_admin on public.site_settings;
create policy site_settings_admin on public.site_settings
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.site_settings to anon, authenticated;
grant insert, update on public.site_settings to authenticated;

-- 預設全開＝維持現在的樣子。已經被關掉的那幾個不會被這支打開
-- （on conflict do nothing 只補沒有的那幾列）。
insert into public.site_settings(key, enabled) values
  ('show_studio_footer', true),
  ('show_studio_brandpage', true),
  ('show_studio_bandary', true),
  ('show_studio_relatestats', true),
  ('show_coffee', true),
  ('show_dev_intro', true)
on conflict (key) do nothing;

drop trigger if exists site_settings_touch on public.site_settings;
create trigger site_settings_touch before update on public.site_settings
  for each row execute function public.touch_updated_at();
