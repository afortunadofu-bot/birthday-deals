-- =====================================================================
-- v81：每個月的收藏／使用人數　＋　低消與實際花費
--
--   嵐：
--     「收藏跟使用都可以區分成月份看，看每個月的人數」
--     「希望可以增加每人平均消費或是低消之類的，讓人知道去這家店領生日優惠
--       大概會花多少錢」
--
--   兩件事放同一支，因為要跑的人只想少貼幾次。可重複執行。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 每個月的收藏／使用（嵐：「看每個月的人數」）
--
--    wishlist 的 RLS 是「只看得到自己的」，所以前端算不出全站每個月有多少人
--    收藏——跟 wishlist_counts 一樣，交給 security definer 的函式在資料庫算，
--    只回傳每個月的「幾個人、幾筆」，不吐任何 user_id。
--
--    月份是用 generate_series 補齊的，中間沒有任何活動的月份也會回 0，
--    圖表才不會跳月。
-- ---------------------------------------------------------------------
create or replace function public.site_monthly_activity(p_months integer default 12)
returns table(
  ym          text,
  wish_users  integer,
  wish_count  integer,
  use_users   integer,
  use_count   integer,
  saved_total integer
)
language sql
stable
security definer
set search_path = public
as $$
  with span as (
    select greatest(least(coalesce(p_months, 12), 36), 1) as n
  ),
  months as (
    select to_char(d, 'YYYY-MM') as ym
    from span,
         generate_series(date_trunc('month', current_date) - ((span.n - 1) * interval '1 month'),
                         date_trunc('month', current_date),
                         interval '1 month') as d
  ),
  w as (
    select to_char(created_at, 'YYYY-MM') as ym,
           count(distinct user_id)        as users,
           count(*)                       as n
    from public.wishlist
    group by 1
  ),
  u as (
    select to_char(used_on, 'YYYY-MM')     as ym,
           count(distinct user_id)         as users,
           count(*)                        as n,
           coalesce(sum(saved_twd), 0)     as saved
    from public.usage_reports
    where result in ('success', 'partial')
    group by 1
  )
  select m.ym,
         coalesce(w.users, 0)::integer,
         coalesce(w.n, 0)::integer,
         coalesce(u.users, 0)::integer,
         coalesce(u.n, 0)::integer,
         coalesce(u.saved, 0)::integer
  from months m
  left join w on w.ym = m.ym
  left join u on u.ym = m.ym
  order by m.ym;
$$;

revoke execute on function public.site_monthly_activity(integer) from public;
grant execute on function public.site_monthly_activity(integer) to anon, authenticated;

-- 月份比對是字串（to_char），加索引也用不上；資料量是「每一筆收藏／回報」，
-- 現在幾千筆，整表掃一次很快。真的變大再改成每月一列的彙總表。

-- ---------------------------------------------------------------------
-- 2. 低消（offers.min_spend）
--
--    「免費・需消費」現在只說「要消費」，沒說要花多少。填了之後卡片上會寫
--    「低消 $350」，去之前就知道大概要花多少錢。
--    不填＝還沒人確認，不是「沒有低消」——沒有低消的那種請選「免費・無低消」。
-- ---------------------------------------------------------------------
alter table public.offers
  add column if not exists min_spend integer;
alter table public.offers drop constraint if exists offers_min_spend_range;
alter table public.offers
  add constraint offers_min_spend_range
  check (min_spend is null or (min_spend >= 0 and min_spend <= 100000)) not valid;

-- ---------------------------------------------------------------------
-- 3. 實際花了多少（usage_reports.spent_twd）
--
--    低消是「規定」，這個是「實際」。回報使用時可以順手填「這次總共花了多少」，
--    詳情頁就能顯示「大家平均花 $420」——比低消更接近真實體感（低消 350 但
--    大家其實都花 500 的店，看了就知道）。選填，不想填就留空。
-- ---------------------------------------------------------------------
alter table public.usage_reports
  add column if not exists spent_twd integer;
alter table public.usage_reports drop constraint if exists usage_reports_spent_range;
alter table public.usage_reports
  add constraint usage_reports_spent_range
  check (spent_twd is null or (spent_twd >= 0 and spent_twd <= 100000)) not valid;

-- ---------------------------------------------------------------------
-- 4. offers_public 要重建才看得到 min_spend
--
--    這個 view 是 `select o.*`，而 PostgreSQL 會在「建立當下」就把 o.* 展開成
--    固定的欄位清單記起來——後來用 alter table add column 加的欄位不會自己
--    補進去（schema_v13／v45 都踩過這個坑）。所以每次 offers 加欄位，
--    這個 view 都要 drop 再 create 一次。
--    定義跟 schema_v79_offer_stats_fast.sql 裡那份一字不差。
-- ---------------------------------------------------------------------
drop view if exists public.offers_public;
create view public.offers_public
with (security_invoker = true) as
select o.*, s.report_count, s.last_used_on, s.success_rate, s.comment_count,
       s.rating_avg, s.rating_count, s.wish_count
from public.offers o
left join public.offer_stats s on s.offer_id = o.id
where o.status = 'approved';

grant select on public.offers_public to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. 修改建議的「改前 vs 改後」對照也要認得低消
--    （不加的話，有人提議改低消時，審核畫面的「改前」那一欄會寫
--     「（改前內容未提供預覽）」）。其餘欄位跟 schema_v56 一字不差。
-- ---------------------------------------------------------------------
drop view if exists public.offer_edits_pending_preview;
create view public.offer_edits_pending_preview
with (security_invoker = true) as
select e.id, e.offer_id, e.patch, e.reason, e.source_url, e.created_at,
       o.brand,
       o.offer              as current_offer,
       o.conditions         as current_conditions,
       o.membership         as current_membership,
       o.membership_type    as current_membership_type,
       o.free_tier          as current_free_tier,
       o.timing             as current_timing,
       o.advance_days       as current_advance_days,
       o.value_twd          as current_value_twd,
       o.min_spend          as current_min_spend,
       o.valid_from         as current_valid_from,
       o.valid_until        as current_valid_until,
       o.category           as current_category,
       o.requires_companion as current_requires_companion,
       o.transferable       as current_transferable,
       o.regions            as current_regions,
       o.sources            as current_sources,
       p.display_name as proposed_by_name
from public.offer_edits e
join public.offers o on o.id = e.offer_id
left join public.profiles_public p on p.id = e.proposed_by
where e.status = 'pending';

grant select on public.offer_edits_pending_preview to authenticated;
