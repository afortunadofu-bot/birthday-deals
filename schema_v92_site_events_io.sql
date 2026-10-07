-- =====================================================================
-- v92：站台儀表板讀不動——site_events 被整張掃過好幾遍
--
--   症狀（嵐的截圖）：「我的 → 審核 → 站台儀表板」顯示
--       讀取失敗：canceling statement due to statement timeout
--   連用 anon 去 REST 取一筆 site_events 都會逾時。
--
--   原因不是「沒有索引」——v14 就建了 (event_type, created_at) 跟 (created_at)，
--   v78 又補了一支 pageview 的 session_id 部分索引。真正的原因是**查詢沒有範圍**：
--
--   1. admin_dashboard_series(p_days)：折線圖只要最近 14 天，但裡面每一個 CTE
--      都是「整張表 group by 日期」，算完才 left join 回那 14 天。所以
--      count(distinct session_id) 是對**全部 16 萬筆** pageview 做的，
--      而且因為沒有 created_at 範圍，索引完全幫不上忙，只能 seq scan 整張表
--      （連 meta jsonb 一起讀進來）。這一支就是逾時的那一支。
--
--   2. admin_dashboard_stats / admin_visit_stats 選「全部時間」時，
--      v_since 會變成 epoch，等於沒有下限，一樣是整張表的 distinct。
--
--   這一版三件事：
--     1. 把日期範圍推進每一個 CTE 裡面（真正的修法）
--     2. 補三支涵蓋式索引，讓這些計數變成 index only scan，不用回表讀 meta
--     3. 準備好「保留 N 天」的清理工具：先把要刪掉那幾天的總數存進 archive，
--        再刪原始列，公開的累計瀏覽數不會因此掉下來。**這支不會自動執行**，
--        要不要清、什麼時候清由人決定。
--
--   可重複執行。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 涵蓋式索引
--    (created_at, session_id) 的順序是刻意的：先用 created_at 做範圍掃描，
--    掃到的那一段裡面直接就有 session_id，不用回原表。反過來排的話範圍條件
--    就用不到索引了。
-- ---------------------------------------------------------------------

-- 折線圖、區間瀏覽數、區間不重複裝置（只看 pageview）
create index if not exists site_events_pv_range_idx
  on public.site_events (created_at, session_id)
  where event_type = 'pageview';

-- 區間不重複裝置（所有事件種類，admin_dashboard_stats 的 visitors_range）
create index if not exists site_events_range_session_idx
  on public.site_events (created_at, session_id);

-- 區間活躍會員數
create index if not exists site_events_range_user_idx
  on public.site_events (created_at, user_id)
  where user_id is not null;

-- ---------------------------------------------------------------------
-- 2. 折線圖：把日期範圍推進每一個 CTE
--    行為跟以前完全一樣（同樣的欄位、同樣的天數上限 90），只是不再先把
--    整張表算完再丟掉 99% 的結果。
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard_series(p_days int default 14)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
  v_from date;
begin
  if not public.is_admin() then raise exception '只有管理員可以看儀表板'; end if;
  if p_days is null or p_days < 1 then p_days := 14; end if;
  if p_days > 90 then p_days := 90; end if;
  v_from := current_date - (p_days - 1);

  with days as (
    select (current_date - n)::date as day from generate_series(0, p_days - 1) as n
  ),
  pv as (
    select created_at::date as day, count(*) as cnt,
           count(distinct nullif(session_id,'')) as visitors
    from public.site_events
    where event_type = 'pageview' and created_at >= v_from
    group by 1
  ),
  nu as (
    select created_at::date as day, count(*) as cnt
    from public.profiles where created_at >= v_from group by 1
  ),
  ur as (
    select created_at::date as day, count(*) as cnt
    from public.usage_reports where created_at >= v_from group by 1
  ),
  sub as (
    select created_at::date as day, count(*) as cnt
    from public.offers where created_at >= v_from group by 1
  ),
  rev as (
    select reviewed_at::date as day, count(*) as cnt
    from public.offers where reviewed_at is not null and reviewed_at >= v_from group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', to_char(d.day,'MM/DD'),
    'pageviews', coalesce(pv.cnt,0),
    'visitors', coalesce(pv.visitors,0),
    'new_users', coalesce(nu.cnt,0),
    'use_reports', coalesce(ur.cnt,0),
    'submitted', coalesce(sub.cnt,0),
    'reviewed', coalesce(rev.cnt,0)
  ) order by d.day), '[]'::jsonb) into result
  from days d
  left join pv  on pv.day  = d.day
  left join nu  on nu.day  = d.day
  left join ur  on ur.day  = d.day
  left join sub on sub.day = d.day
  left join rev on rev.day = d.day;

  return result;
end $$;

grant execute on function public.admin_dashboard_series(int) to authenticated;
revoke execute on function public.admin_dashboard_series(int) from public, anon;

-- ---------------------------------------------------------------------
-- 3. 「全部時間」的上限
--    p_days 是 null 時以前用 epoch 當下限，等於整張表。改成用資料表裡
--    最早那一筆當下限——結果一模一樣，但 planner 拿得到一個真的範圍，
--    走得了上面那幾支索引。
--    （保留 p_days is null 這個介面，前端選「全部時間」時傳的是一個很大的數字，
--      兩種都要能吃。）
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard_stats(p_days int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
  v_since timestamptz;
begin
  if not public.is_admin() then raise exception '只有管理員可以看儀表板'; end if;
  if p_days is not null and p_days < 1 then p_days := null; end if;

  v_since := case
    when p_days is null then coalesce((select min(created_at) from public.site_events), now())
    else now() - (p_days || ' days')::interval
  end;

  select jsonb_build_object(
    -- 「累積」開頭的是現在的總量，不受區間影響
    'pageviews_total',    (select count(*) from public.site_events where event_type='pageview'),
    'total_users',        (select count(*) from public.profiles),
    'total_offers',       (select count(*) from public.offers where status='approved'),
    'pending_offers',     (select count(*) from public.offers where status='pending'),
    'total_use_reports',  (select count(*) from public.usage_reports),
    'open_feedback',      (select count(*) from public.site_feedback where status='open'),
    -- 這幾個是「這段區間內發生了幾次」，跟著 p_days 走
    'pageviews_range',    (select count(*) from public.site_events where event_type='pageview' and created_at >= v_since),
    'visitors_range',     (select count(distinct session_id) from public.site_events where created_at >= v_since and session_id <> ''),
    'new_users_range',    (select count(*) from public.profiles where created_at >= v_since),
    'active_users_range', (select count(distinct user_id) from public.site_events where created_at >= v_since and user_id is not null),
    'use_reports_range',  (select count(*) from public.usage_reports where created_at >= v_since)
  ) into result;
  return result;
end $$;

grant execute on function public.admin_dashboard_stats(int) to authenticated;
revoke execute on function public.admin_dashboard_stats(int) from public, anon;

-- 造訪統計（v62）：同一個 epoch 問題，而且它還要跑 window function
create or replace function public.admin_visit_stats(p_days int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
  v_since timestamptz;
begin
  if not public.is_admin() then raise exception '只有管理員可以看造訪統計'; end if;
  if p_days is not null and p_days < 1 then p_days := null; end if;
  v_since := case
    when p_days is null then coalesce((select min(created_at) from public.site_events), now())
    else now() - (p_days || ' days')::interval
  end;

  with pv as (
    select user_id, session_id, created_at,
      lag(created_at) over (
        partition by coalesce(user_id::text, 's:' || session_id) order by created_at
      ) as prev_at
    from public.site_events
    where event_type = 'pageview' and created_at >= v_since
  ),
  visits as (
    select user_id, session_id,
      (prev_at is null or created_at - prev_at > interval '30 minutes') as is_new
    from pv
  ),
  member_visits as (
    select user_id, count(*) filter (where is_new) as v, count(*) as p
    from visits where user_id is not null
    group by user_id
  ),
  guest_visits as (
    select session_id, count(*) filter (where is_new) as v
    from visits where user_id is null and session_id <> ''
    group by session_id
  ),
  active as (
    -- 跟 admin_dashboard_stats 的 active_users_range 同一個定義
    select count(distinct user_id) as n
    from public.site_events where created_at >= v_since and user_id is not null
  ),
  totals as (
    select (select n from active) as active_n,
           (select coalesce(sum(v), 0) from member_visits) as mv,
           (select coalesce(sum(p), 0) from member_visits) as mp,
           (select count(*) from member_visits where v >= 2) as returning_n
  )
  select jsonb_build_object(
    'active_members',              t.active_n,
    'member_visits',               t.mv,
    'member_pageviews',            t.mp,
    'avg_visits_per_member',       case when t.active_n > 0 then round(t.mv::numeric / t.active_n, 2) end,
    'avg_pageviews_per_member',    case when t.active_n > 0 then round(t.mp::numeric / t.active_n, 2) end,
    'returning_members',           t.returning_n,
    'returning_rate',              case when t.active_n > 0 then round(t.returning_n::numeric / t.active_n, 4) end,
    'guest_devices',               (select count(*) from guest_visits),
    'avg_visits_per_guest_device', (select round(avg(v)::numeric, 2) from guest_visits)
  ) into result
  from totals t;
  return result;
end $$;

grant execute on function public.admin_visit_stats(int) to authenticated;
revoke execute on function public.admin_visit_stats(int) from public, anon;

-- ---------------------------------------------------------------------
-- 3.5 公開的「使用時段分布」：堵住一個任何人都打得開的全表掃描
--     v55 這一支開放給 anon，而 p_days 傳 null 時下限是 epoch＝整張表。
--     前端固定傳 30，但 RPC 是公開的，一行迴圈就能逼資料庫一直全表掃描——
--     10/04 把 Disk IO 燒光的就是這種「每一次呼叫都掃全表」的查詢。
--     改成跟管理員那一支一樣：null 就當 30 天。
-- ---------------------------------------------------------------------
create or replace function public.site_usage_hour_distribution(p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  -- 沒有「全部時間」這個選項了：公開端點不給無上限的查詢
  if p_days is null or p_days < 1 or p_days > 90 then p_days := 30; end if;

  with hrs as (
    select generate_series(0,23) as hour
  ),
  ev as (
    select extract(hour from (created_at at time zone 'Asia/Taipei'))::int as hour,
           count(*) as cnt
    from public.site_events
    where event_type = 'pageview'
      and created_at >= now() - (p_days || ' days')::interval
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('hour', h.hour, 'count', coalesce(ev.cnt,0)) order by h.hour), '[]'::jsonb)
    into result
  from hrs h
  left join ev on ev.hour = h.hour;

  return result;
end $$;

grant execute on function public.site_usage_hour_distribution(int) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. 清理工具（**不會自動執行**）
--
--    site_events 只進不出，一天大概多一萬多筆。現在 16 萬筆還不是問題，
--    但一年後是四百萬筆，Supabase 免費方案的 500MB 會先滿。
--
--    直接 delete 會讓首頁公開顯示的「累計瀏覽」掉下來——那個數字是
--    count(*) from site_events。所以刪之前先把要刪掉那幾天的總數加進
--    archive，view 再把 archive + 現存的加起來，使用者看到的數字不會變。
--
--    誠實說明一個精度問題：archive 的 visitors 是「每天不重複裝置數的總和」，
--    跨午夜的同一個 session 會被算成兩次。只影響已經清掉的那幾天，而且
--    這個數字本來就只是量級參考。沒有清理過的站台完全不受影響。
-- ---------------------------------------------------------------------
create table if not exists public.site_events_archive(
  id         smallint primary key default 1 check (id = 1),
  pageviews  bigint not null default 0,
  visitors   bigint not null default 0,
  until      date,                       -- 已經清到哪一天（含）
  updated_at timestamptz not null default now()
);
alter table public.site_events_archive enable row level security;
-- 不開任何 policy：只有下面的 security definer 函式碰得到

insert into public.site_events_archive(id) values (1) on conflict (id) do nothing;

-- 先看會刪掉多少，不動資料
create or replace function public.admin_events_prune_preview(p_keep_days int default 180)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cut date;
begin
  if not public.is_admin() then raise exception '只有管理員可以看'; end if;
  if p_keep_days is null or p_keep_days < 30 then p_keep_days := 30; end if;
  v_cut := current_date - p_keep_days;
  return jsonb_build_object(
    'cutoff', v_cut,
    'rows_to_delete', (select count(*) from public.site_events where created_at < v_cut),
    'rows_kept',      (select count(*) from public.site_events where created_at >= v_cut),
    'oldest',         (select min(created_at) from public.site_events)
  );
end $$;

grant execute on function public.admin_events_prune_preview(int) to authenticated;
revoke execute on function public.admin_events_prune_preview(int) from public, anon;

-- 真的清。先結算再刪，同一個交易裡，不會出現「加了但沒刪」或「刪了但沒加」。
create or replace function public.admin_events_prune(p_keep_days int default 180)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cut date;
  v_pv bigint;
  v_vis bigint;
  v_del bigint;
begin
  if not public.is_admin() then raise exception '只有管理員可以清理事件紀錄'; end if;
  -- 最少保留 30 天：折線圖最多畫 90 天，低於這個數字等於把儀表板清空
  if p_keep_days is null or p_keep_days < 30 then p_keep_days := 30; end if;
  v_cut := current_date - p_keep_days;

  select count(*) filter (where event_type='pageview'), count(*)
    into v_pv, v_del
  from public.site_events where created_at < v_cut;

  if v_del = 0 then
    return jsonb_build_object('deleted', 0, 'cutoff', v_cut, 'note', '沒有這麼舊的紀錄');
  end if;

  -- 每天各算一次不重複裝置再加起來（見上面關於精度的說明）
  select coalesce(sum(d.n), 0) into v_vis from (
    select count(distinct nullif(session_id,'')) as n
    from public.site_events
    where created_at < v_cut and event_type = 'pageview'
    group by created_at::date
  ) d;

  update public.site_events_archive
     set pageviews = pageviews + v_pv,
         visitors  = visitors + v_vis,
         until     = v_cut - 1,
         updated_at = now()
   where id = 1;

  delete from public.site_events where created_at < v_cut;

  return jsonb_build_object('deleted', v_del, 'pageviews_archived', v_pv,
                            'visitors_archived', v_vis, 'cutoff', v_cut);
end $$;

grant execute on function public.admin_events_prune(int) to authenticated;
revoke execute on function public.admin_events_prune(int) from public, anon;

-- ---------------------------------------------------------------------
-- 5. 公開的站台數據：加上 archive，清理過也不會讓累計數字掉下來
--    欄位名稱與型別跟 v17 完全一樣，所以 create or replace 就夠，
--    不用 drop（drop 會連帶把 site_stats_cached 的相依性弄掉）。
-- ---------------------------------------------------------------------
create or replace view public.site_stats
with (security_invoker = false) as
select
  (select count(*) from public.offers where status = 'approved')          as offer_count,
  (select count(*) from public.offers
     where status = 'approved' and free_tier = 'free_no_min')             as free_count,
  (select coalesce(sum(value_twd), 0) from public.offers
     where status = 'approved')                                          as total_value,
  (select count(*) from public.usage_reports)                            as report_count,
  (select coalesce(sum(saved_twd), 0) from public.usage_reports)         as saved_total,
  (select count(distinct user_id) from public.usage_reports)             as user_count,
  -- 下面兩個是這一版唯一改的地方：加上 archive（清理過的那幾天的總數），
  -- 其餘欄位與 v17 逐字相同——create or replace view 不允許改欄位名稱、
  -- 型別或順序，抄錯一個就整支跑不起來。
  (select coalesce((select pageviews from public.site_events_archive where id = 1), 0))
    + (select count(*) from public.site_events where event_type = 'pageview')                   as pageview_count,
  (select coalesce((select visitors from public.site_events_archive where id = 1), 0))
    + (select count(distinct nullif(session_id,'')) from public.site_events where event_type = 'pageview') as visitor_count;

grant select on public.site_stats to anon, authenticated;

-- =====================================================================
-- 跑完之後值得做一次（SQL Editor 直接貼，很快）：
--   analyze public.site_events;
-- 讓 planner 知道新索引的分布，第一次查詢就選對計畫。
-- =====================================================================
analyze public.site_events;
