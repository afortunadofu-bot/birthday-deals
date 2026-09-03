-- =====================================================================
-- 壽星日　資料庫 schema（Supabase / PostgreSQL）
-- 在 Supabase Dashboard → SQL Editor 貼上整份執行即可。
-- 可重複執行（具冪等性）。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 使用者檔案
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  is_admin     boolean     not null default false,
  is_banned    boolean     not null default false,
  created_at   timestamptz not null default now()
);

-- Google 登入後自動建立 profile
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '壽星'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 管理員判定（給 RLS 用；security definer 才能繞過 profiles 自身的 RLS）
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_banned()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_banned from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------
-- 2. 優惠主表
-- ---------------------------------------------------------------------
create table if not exists public.offers (
  id            bigserial primary key,
  slug          text unique,
  brand         text not null check (char_length(brand) between 1 and 120),
  category      text not null default '連鎖餐廳',
  regions       text[] not null default '{}',
  region_note   text not null default '',
  offer         text not null check (char_length(offer) between 1 and 1000),

  -- 會員種類
  membership            text not null default '',
  membership_type       text not null default 'brand'
                        check (membership_type in ('none','app','line','ocard','card','tier','brand')),
  membership_cost       text not null default 'free'
                        check (membership_cost in ('free','spend','tier')),

  -- 免費層級
  free_tier     text not null default 'discount'
                check (free_tier in ('free_no_min','free_min','discount','unknown')),

  -- 時間相關
  advance_days  int check (advance_days is null or advance_days between 0 and 400),
  advance_note  text not null default '',
  offer_window  text not null default '當月',      -- window 是 SQL 保留字，故改名
  conditions    text not null default '',
  validity      text not null default '',
  validity_type text not null default 'rolling' check (validity_type in ('rolling','fixed')),
  valid_from    date,
  valid_until   date,

  sources       jsonb not null default '[]'::jsonb,

  -- 審核流程
  status        text not null default 'pending'
                check (status in ('pending','approved','rejected','archived')),
  verified      boolean not null default false,
  last_checked  date,
  submitted_by  uuid references public.profiles(id) on delete set null,
  reviewed_by   uuid references public.profiles(id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text not null default '',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint valid_range check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create index if not exists offers_status_idx    on public.offers(status);
create index if not exists offers_category_idx  on public.offers(category);
create index if not exists offers_freetier_idx  on public.offers(free_tier);
create index if not exists offers_regions_idx   on public.offers using gin(regions);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists offers_touch on public.offers;
create trigger offers_touch before update on public.offers
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 3. 使用回報（民眾回報「我哪天用了、成不成功」）
-- ---------------------------------------------------------------------
create table if not exists public.usage_reports (
  id         bigserial primary key,
  offer_id   bigint not null references public.offers(id) on delete cascade,
  user_id    uuid   not null references public.profiles(id) on delete cascade,
  used_on    date   not null check (used_on <= current_date and used_on >= current_date - 365),
  result     text   not null check (result in ('success','partial','failed')),
  store      text   not null default '' check (char_length(store) <= 80),
  note       text   not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  -- 同一人同一天同一筆優惠只能回報一次
  unique (offer_id, user_id, used_on)
);
create index if not exists usage_offer_idx on public.usage_reports(offer_id, used_on desc);

-- ---------------------------------------------------------------------
-- 4. 留言
-- ---------------------------------------------------------------------
create table if not exists public.comments (
  id         bigserial primary key,
  offer_id   bigint not null references public.offers(id) on delete cascade,
  user_id    uuid   not null references public.profiles(id) on delete cascade,
  body       text   not null check (char_length(body) between 1 and 800),
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists comments_offer_idx on public.comments(offer_id, created_at desc);

-- ---------------------------------------------------------------------
-- 5. 統計 view：最新使用日期、成功率、留言數
-- ---------------------------------------------------------------------
-- security_invoker = true：讓 view 沿用呼叫者的 RLS 權限。
-- 若不加，PostgreSQL 預設以 view 擁有者身分執行，會繞過 RLS。
create or replace view public.offer_stats
with (security_invoker = true) as
select
  o.id as offer_id,
  count(distinct r.id)                                             as report_count,
  max(r.used_on)                                                   as last_used_on,
  count(*) filter (where r.result = 'success')                     as success_count,
  count(*) filter (where r.result = 'failed')                      as failed_count,
  case when count(r.id) = 0 then null
       else round(100.0 * count(*) filter (where r.result = 'success') / count(r.id))
  end                                                              as success_rate,
  (select count(*) from public.comments c
    where c.offer_id = o.id and not c.is_hidden)                   as comment_count
from public.offers o
left join public.usage_reports r on r.offer_id = o.id
group by o.id;

-- 前台一次拿到優惠 + 統計
create or replace view public.offers_public
with (security_invoker = true) as
select o.*, s.report_count, s.last_used_on, s.success_rate, s.comment_count
from public.offers o
left join public.offer_stats s on s.offer_id = o.id
where o.status = 'approved';

-- ---------------------------------------------------------------------
-- 6. 投稿頻率限制（防灌水）
-- ---------------------------------------------------------------------
create or replace function public.submissions_today(uid uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.offers
   where submitted_by = uid and created_at > now() - interval '24 hours';
$$;

create or replace function public.comments_today(uid uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.comments
   where user_id = uid and created_at > now() - interval '24 hours';
$$;

-- ---------------------------------------------------------------------
-- 7. RLS（Row Level Security）
--    anon key 是公開的，所有安全性都靠這一段，請勿刪除。
-- ---------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.offers        enable row level security;
alter table public.usage_reports enable row level security;
alter table public.comments      enable row level security;

-- ---- profiles ----
drop policy if exists profiles_read       on public.profiles;
drop policy if exists profiles_self_write on public.profiles;
drop policy if exists profiles_admin_all  on public.profiles;

create policy profiles_read on public.profiles
  for select using (true);                              -- 顯示留言者暱稱/頭像

create policy profiles_self_write on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- 防止提權：非管理員不論送什麼，is_admin / is_banned 一律還原成舊值。
-- 用 trigger 而不是寫在 RLS 的 with check 裡，因為在 policy 中查詢同一張表
-- 容易觸發遞迴評估，是 Supabase 上常見的地雷。
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.is_admin  := old.is_admin;
    new.is_banned := old.is_banned;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_privileges();

create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- offers ----
drop policy if exists offers_read_approved on public.offers;
drop policy if exists offers_read_own      on public.offers;
drop policy if exists offers_read_admin    on public.offers;
drop policy if exists offers_insert        on public.offers;
drop policy if exists offers_update_admin  on public.offers;
drop policy if exists offers_delete_admin  on public.offers;

create policy offers_read_approved on public.offers
  for select using (status = 'approved');               -- 未登入也看得到已核可的

create policy offers_read_own on public.offers
  for select using (submitted_by = auth.uid());         -- 投稿者看得到自己的待審件

create policy offers_read_admin on public.offers
  for select using (public.is_admin());

create policy offers_insert on public.offers
  for insert with check (
    auth.uid() is not null
    and not public.is_banned()
    and submitted_by = auth.uid()
    and status = 'pending'                              -- 民眾只能投「待審」
    and verified = false
    and public.submissions_today(auth.uid()) < 10       -- 每人每日上限 10 筆
  );

create policy offers_update_admin on public.offers
  for update using (public.is_admin()) with check (public.is_admin());

create policy offers_delete_admin on public.offers
  for delete using (public.is_admin());

-- ---- usage_reports ----
drop policy if exists reports_read   on public.usage_reports;
drop policy if exists reports_insert on public.usage_reports;
drop policy if exists reports_own_rw on public.usage_reports;
drop policy if exists reports_admin  on public.usage_reports;

create policy reports_read on public.usage_reports
  for select using (true);

create policy reports_insert on public.usage_reports
  for insert with check (
    auth.uid() is not null
    and not public.is_banned()
    and user_id = auth.uid()
    and exists (select 1 from public.offers o where o.id = offer_id and o.status = 'approved')
  );

create policy reports_own_rw on public.usage_reports
  for delete using (user_id = auth.uid());

create policy reports_admin on public.usage_reports
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- comments ----
drop policy if exists comments_read   on public.comments;
drop policy if exists comments_insert on public.comments;
drop policy if exists comments_own    on public.comments;
drop policy if exists comments_admin  on public.comments;

create policy comments_read on public.comments
  for select using (not is_hidden or user_id = auth.uid() or public.is_admin());

create policy comments_insert on public.comments
  for insert with check (
    auth.uid() is not null
    and not public.is_banned()
    and user_id = auth.uid()
    and is_hidden = false
    and public.comments_today(auth.uid()) < 30          -- 每人每日上限 30 則
    and exists (select 1 from public.offers o where o.id = offer_id and o.status = 'approved')
  );

create policy comments_own on public.comments
  for delete using (user_id = auth.uid());

create policy comments_admin on public.comments
  for all using (public.is_admin()) with check (public.is_admin());

-- view 的權限跟隨底層表格
grant select on public.offer_stats, public.offers_public to anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. 管理員審核用的函式（一次完成核可＋標記查證者）
-- ---------------------------------------------------------------------
create or replace function public.review_offer(
  p_offer_id bigint, p_status text, p_verified boolean default false, p_note text default ''
) returns public.offers language plpgsql security definer set search_path = public as $$
declare result public.offers;
begin
  if not public.is_admin() then
    raise exception '只有管理員可以審核';
  end if;
  if p_status not in ('approved','rejected','archived','pending') then
    raise exception '不合法的狀態：%', p_status;
  end if;
  update public.offers
     set status = p_status,
         verified = p_verified,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_note = coalesce(p_note, ''),
         last_checked = case when p_verified then current_date else last_checked end
   where id = p_offer_id
   returning * into result;
  return result;
end $$;

-- =====================================================================
-- 9. 設定第一位管理員（把 email 換成你的 Google 帳號後執行）
-- =====================================================================
-- update public.profiles set is_admin = true
--  where id = (select id from auth.users where email = 'afortunado.fu@gmail.com');
