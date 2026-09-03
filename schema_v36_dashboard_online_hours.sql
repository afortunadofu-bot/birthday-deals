-- =====================================================================
-- v36：管理員儀表板補兩個東西
--   1) admin_online_now()：最近 5 分鐘內有活動（打過 pageview 事件）的
--      不重複人數，當作「即時在線」的近似值。session_id 是訪客也有的
--      隨機字串，登入的人額外用 user_id 去重——同一個人開兩個分頁只會
--      算一次。這不是真的 WebSocket 即時連線，是每次呼叫都重新查詢
--      「最近 5 分鐘內」這個時間窗，所以前端要定時（例如每 20 秒）重打
--      一次才會看起來像在跳動。
--   2) admin_usage_hour_distribution(p_days)：把 pageview 事件依「台灣
--      時間」的小時（0~23）分桶計數，看大家主要都在一天中的什麼時段
--      用網站。注意：直接用 timestamptz::date／extract 預設會用資料庫
--      的 session timezone（通常是 UTC），這裡刻意用
--      `created_at at time zone 'Asia/Taipei'` 明確轉成台灣時間再取小時，
--      不然分布會整批往後偏 8 小時。
-- 可重複執行。
-- =====================================================================

create or replace function public.admin_online_now()
returns int language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception '只有管理員可以看目前在線人數';
  end if;
  return (
    select count(distinct coalesce(nullif(session_id,''), user_id::text))
    from public.site_events
    where created_at > now() - interval '5 minutes'
  );
end $$;

grant execute on function public.admin_online_now() to authenticated;
revoke execute on function public.admin_online_now() from public;

create or replace function public.admin_usage_hour_distribution(p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_admin() then
    raise exception '只有管理員可以看使用時段分布';
  end if;
  if p_days is null or p_days < 1 or p_days > 90 then p_days := 30; end if;

  with hrs as (
    select generate_series(0,23) as hour
  ),
  ev as (
    select extract(hour from (created_at at time zone 'Asia/Taipei'))::int as hour,
           count(*) as cnt
    from public.site_events
    where event_type = 'pageview'
      and created_at > now() - (p_days || ' days')::interval
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
