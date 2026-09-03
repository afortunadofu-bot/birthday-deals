-- =====================================================================
-- v15：管理員儀表板趨勢圖用的時間序列 RPC
-- =====================================================================
-- 可重複執行。跑完這份之後，管理員後台的「站台儀表板」會多出四組走勢圖：
-- 瀏覽/訪客、新會員成長、使用回報、投稿/審核量。
-- =====================================================================

create or replace function public.admin_dashboard_series(p_days int default 14)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception '只有管理員可以看儀表板'; end if;
  if p_days is null or p_days < 1 or p_days > 90 then p_days := 14; end if;

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
