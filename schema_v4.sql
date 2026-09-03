-- =====================================================================
-- 壽星日　schema v4 增量更新
-- 已經跑過 schema.sql 的人，只要再跑這一份即可。全新安裝請先跑 schema.sql。
-- 可重複執行。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 新欄位：timing（當日／當月）與 value_twd（優惠價值）
-- ---------------------------------------------------------------------
alter table public.offers
  add column if not exists timing    text not null default '當月',
  add column if not exists value_twd int;

-- 把舊的 offer_window 值搬進 timing（只搬一次，已有值的不動）
update public.offers set timing = offer_window
 where timing = '當月' and offer_window is distinct from '當月';

alter table public.offers drop constraint if exists offers_timing_check;
alter table public.offers add constraint offers_timing_check
  check (timing in ('當日','當月','當週','當月＋當日','前後3天','前後7天'));

alter table public.offers drop constraint if exists offers_value_check;
alter table public.offers add constraint offers_value_check
  check (value_twd is null or value_twd between 0 and 100000);

create index if not exists offers_timing_idx on public.offers(timing);

-- ---------------------------------------------------------------------
-- 2. 使用回報加上「實際省下多少」
-- ---------------------------------------------------------------------
alter table public.usage_reports
  add column if not exists saved_twd int;

alter table public.usage_reports drop constraint if exists usage_saved_check;
alter table public.usage_reports add constraint usage_saved_check
  check (saved_twd is null or saved_twd between 0 and 100000);

-- 沒填金額時，用該筆優惠的估算價值補上（只在成功的回報上算）
create or replace function public.fill_saved_amount()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.saved_twd is null and new.result = 'success' then
    select value_twd into new.saved_twd from public.offers where id = new.offer_id;
  end if;
  if new.result = 'failed' then
    new.saved_twd := 0;          -- 失敗就是沒省到
  end if;
  return new;
end $$;

drop trigger if exists usage_fill_saved on public.usage_reports;
create trigger usage_fill_saved before insert or update on public.usage_reports
  for each row execute function public.fill_saved_amount();

-- ---------------------------------------------------------------------
-- 3. 個人省錢統計
-- ---------------------------------------------------------------------
create or replace view public.my_savings
with (security_invoker = true) as
select
  r.user_id,
  count(*)                                                  as report_count,
  count(*) filter (where r.result = 'success')              as success_count,
  coalesce(sum(r.saved_twd), 0)                             as saved_total,
  coalesce(sum(r.saved_twd) filter
    (where r.used_on >= date_trunc('year', current_date)), 0) as saved_this_year,
  min(r.used_on)                                            as first_used_on,
  max(r.used_on)                                            as last_used_on,
  count(distinct r.offer_id)                                as brands_used
from public.usage_reports r
group by r.user_id;

-- ---------------------------------------------------------------------
-- 4. 排行榜
--    只公開暱稱、頭像與金額，不公開 email 或 user id。
--    要出現在榜上必須自己打開 show_on_leaderboard（預設關閉，尊重隱私）。
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists show_on_leaderboard boolean not null default false;

create or replace view public.leaderboard
with (security_invoker = true) as
select
  row_number() over (order by sum(r.saved_twd) desc nulls last) as rank,
  p.display_name,
  p.avatar_url,
  coalesce(sum(r.saved_twd), 0)                as saved_total,
  count(*) filter (where r.result = 'success') as success_count,
  count(distinct r.offer_id)                   as brands_used,
  max(r.used_on)                               as last_used_on
from public.usage_reports r
join public.profiles p on p.id = r.user_id
where p.show_on_leaderboard = true
  and p.is_banned = false
  and r.used_on >= current_date - interval '365 days'
group by p.id, p.display_name, p.avatar_url
having coalesce(sum(r.saved_twd), 0) > 0
order by saved_total desc
limit 100;

-- 各品牌被回報最多次的排行（給「大家都在用什麼」用）
create or replace view public.popular_offers
with (security_invoker = true) as
select
  o.id as offer_id, o.brand, o.category, o.free_tier, o.timing, o.value_twd,
  count(r.id)                                     as report_count,
  count(*) filter (where r.result = 'success')    as success_count,
  coalesce(sum(r.saved_twd), 0)                   as saved_total
from public.offers o
join public.usage_reports r on r.offer_id = o.id
where o.status = 'approved'
  and r.used_on >= current_date - interval '365 days'
group by o.id, o.brand, o.category, o.free_tier, o.timing, o.value_twd
order by report_count desc
limit 50;

-- ---------------------------------------------------------------------
-- 5. 站台總計（首頁顯示用）
-- ---------------------------------------------------------------------
create or replace view public.site_stats
with (security_invoker = true) as
select
  (select count(*) from public.offers where status = 'approved')          as offer_count,
  (select count(*) from public.offers
     where status = 'approved' and free_tier = 'free_no_min')             as free_count,
  (select coalesce(sum(value_twd), 0) from public.offers
     where status = 'approved')                                          as total_value,
  (select count(*) from public.usage_reports)                            as report_count,
  (select coalesce(sum(saved_twd), 0) from public.usage_reports)         as saved_total,
  (select count(distinct user_id) from public.usage_reports)             as user_count;

-- ---------------------------------------------------------------------
-- 6. 重建 offers_public（帶入 timing 與 value_twd）
-- ---------------------------------------------------------------------
drop view if exists public.offers_public;
create view public.offers_public
with (security_invoker = true) as
select o.*, s.report_count, s.last_used_on, s.success_rate, s.comment_count
from public.offers o
left join public.offer_stats s on s.offer_id = o.id
where o.status = 'approved';

grant select on public.offers_public, public.offer_stats, public.leaderboard,
                public.popular_offers, public.site_stats to anon, authenticated;
grant select on public.my_savings to authenticated;

-- ---------------------------------------------------------------------
-- 7. 投稿時允許帶 timing / value_twd（RLS 政策重建）
-- ---------------------------------------------------------------------
drop policy if exists offers_insert on public.offers;
create policy offers_insert on public.offers
  for insert with check (
    auth.uid() is not null
    and not public.is_banned()
    and submitted_by = auth.uid()
    and status = 'pending'
    and verified = false
    and public.submissions_today(auth.uid()) < 10
  );
