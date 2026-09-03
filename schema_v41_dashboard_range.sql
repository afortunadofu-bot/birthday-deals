-- =====================================================================
-- v41：站台儀表板的數字全部跟著時間區間選單走，不是只有走勢圖能選
--
--   背景：dashRange 選單（近7/14/30/90天）原本只有傳給 admin_dashboard_
--   series（折線圖）跟 admin_usage_hour_distribution（時段分布），最上面
--   那排大數字（近7天瀏覽數／訪客／新會員／活躍會員／使用回報）是另一支
--   admin_dashboard_stats() 撈的，天數整個寫死在 SQL 裡（7 天或 30 天），
--   選單怎麼切都不會變，這裡改成一起吃同一個 p_days。
--
--   「累積會員數」「上架優惠數」「待審投稿」「待處理問題回報」「累積瀏覽」
--   「累積使用回報」這幾個本來就是「現在的狀態／到現在為止的總量」，不是
--   「在這段期間發生了幾次」，所以維持不受區間影響——這不是漏改，是這幾個
--   數字的定義本來就跟「哪個區間」無關。
--
--   p_days 傳 null 代表「全部時間」，前端選單新增這個選項（value=0 時
--   轉成 null 再呼叫）。折線圖（admin_dashboard_series）因為是逐日畫點，
--   選「全部時間」還是實際上限 90 天（不然一個經營很久的站畫出來的圖會
--   密到看不出東西，也拖效能），但這排大數字跟時段分布圖只是聚合成
--   固定幾個數字/24小時桶，不會有這個問題，可以真的不設上限。
-- 可重複執行。
-- =====================================================================

-- 舊版是零參數的 admin_dashboard_stats()，新版加了參數，先把舊的drop掉，
-- 不然會變成兩支同名不同參數的函式同時存在，PostgREST 挑選時容易搞混。
drop function if exists public.admin_dashboard_stats();

create or replace function public.admin_dashboard_stats(p_days int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
  v_since timestamptz;
begin
  if not public.is_admin() then raise exception '只有管理員可以看儀表板'; end if;
  if p_days is not null and p_days < 1 then p_days := null; end if;

  -- null（全部時間）就用 epoch 當下限，等於「不設下限」；
  -- 有指定天數就用 now() 往前推。
  v_since := case when p_days is null then to_timestamp(0) else now() - (p_days || ' days')::interval end;

  select jsonb_build_object(
    -- 「累積」開頭的是現在的總量，不受區間影響
    'pageviews_total',    (select count(*) from public.site_events where event_type='pageview'),
    'total_users',        (select count(*) from public.profiles),
    'total_offers',       (select count(*) from public.offers where status='approved'),
    'pending_offers',     (select count(*) from public.offers where status='pending'),
    'total_use_reports',  (select count(*) from public.usage_reports),
    'open_feedback',      (select count(*) from public.site_feedback where status='open'),
    -- 這幾個是「這段區間內發生了幾次」，跟著 p_days 走
    'pageviews_range',    (select count(*) from public.site_events where event_type='pageview' and created_at > v_since),
    'visitors_range',     (select count(distinct session_id) from public.site_events where created_at > v_since and session_id <> ''),
    'new_users_range',    (select count(*) from public.profiles where created_at > v_since),
    'active_users_range', (select count(distinct user_id) from public.site_events where created_at > v_since and user_id is not null),
    'use_reports_range',  (select count(*) from public.usage_reports where created_at > v_since)
  ) into result;
  return result;
end $$;

grant execute on function public.admin_dashboard_stats(int) to authenticated;
revoke execute on function public.admin_dashboard_stats(int) from public;

-- 折線圖天數上限原本是「超過 90 天就整個退回預設 14 天」，改成「超過就
-- 夾在 90 天」——選「全部時間」時前端會傳一個很大的數字進來，這裡夾成
-- 90 天顯示，比起突然跳回 14 天更符合「使用者選了『看多一點』」的預期。
create or replace function public.admin_dashboard_series(p_days int default 14)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception '只有管理員可以看儀表板'; end if;
  if p_days is null or p_days < 1 then p_days := 14; end if;
  if p_days > 90 then p_days := 90; end if;

  with days as (
    select (current_date - n)::date as day from generate_series(0, p_days - 1) as n
  ),
  pv as (
    select created_at::date as day, count(*) as cnt,
           count(distinct nullif(session_id,'')) as visitors
    from public.site_events where event_type = 'pageview'
    group by 1
  ),
  nu as (
    select created_at::date as day, count(*) as cnt from public.profiles group by 1
  ),
  ur as (
    select created_at::date as day, count(*) as cnt from public.usage_reports group by 1
  ),
  sub as (
    select created_at::date as day, count(*) as cnt from public.offers group by 1
  ),
  rev as (
    select reviewed_at::date as day, count(*) as cnt
    from public.offers where reviewed_at is not null group by 1
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
revoke execute on function public.admin_dashboard_series(int) from public;

-- 使用時段分布：本來超過 90 天就整個重置回 30 天，一樣改成夾住不重置；
-- 另外開放 p_days 傳 null 代表「全部時間」——這支只會聚合成固定 24 個
-- 小時桶，資料量再大也不會讓輸出跟著變大，真的可以不設上限。
create or replace function public.admin_usage_hour_distribution(p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
  v_since timestamptz;
begin
  if not public.is_admin() then
    raise exception '只有管理員可以看使用時段分布';
  end if;
  if p_days is not null then
    if p_days < 1 then p_days := 30; end if;
    if p_days > 90 then p_days := 90; end if;
  end if;
  v_since := case when p_days is null then to_timestamp(0) else now() - (p_days || ' days')::interval end;

  with hrs as (
    select generate_series(0,23) as hour
  ),
  ev as (
    select extract(hour from (created_at at time zone 'Asia/Taipei'))::int as hour,
           count(*) as cnt
    from public.site_events
    where event_type = 'pageview'
      and created_at > v_since
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('hour', h.hour, 'count', coalesce(ev.cnt,0)) order by h.hour), '[]'::jsonb)
    into result
  from hrs h
  left join ev on ev.hour = h.hour;

  return result;
end $$;

grant execute on function public.admin_usage_hour_distribution(int) to authenticated;
revoke execute on function public.admin_usage_hour_distribution(int) from public;
