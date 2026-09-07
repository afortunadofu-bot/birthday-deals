-- v55：排行榜（公開頁面）也能看到「即時在線人數」跟「使用時段分布」
-- ---------------------------------------------------------------------
-- 嵐回饋：排行榜也要看得到即時在線人數（不用像管理員儀表板那樣特別強調
-- 「5 分鐘」這個時間窗的細節，數字本身就好）跟平台總瀏覽人次；使用時間
-- 分布感覺也可以加到排行榜。
--
-- 「平台總瀏覽人次」不用新東西：public.site_stats（schema_v17_misc.sql）
-- 本來就是公開 view，早就有 pageview_count／visitor_count 兩個欄位
-- （對應 #84「公開顯示總瀏覽人次」），只是目前只用在首頁頂端那排小藥丸，
-- 沒有放到排行榜頁——這支不用動資料庫，前端多抓一次 site_stats 就好。
--
-- 「即時在線人數」「使用時段分布」這兩個目前只有 admin_online_now()／
-- admin_usage_hour_distribution()，都在函式裡明擋「只有管理員可以看」。
-- 這支複製一份不擋權限、只回聚合數字（不含 session_id／user_id 這種可能
-- 識別出「誰」的欄位，純粹是「現在幾人、哪個時段熱門」這種不涉及個人
-- 隱私的統計數字）的公開版本，開放給所有人（含未登入）呼叫。原本
-- admin_ 開頭那兩支維持不動，管理員儀表板繼續用那兩支（含「近 N 天」
-- 篩選器等管理員專屬功能）。
--
-- 可重複執行。
-- ---------------------------------------------------------------------

create or replace function public.site_online_now()
returns int language plpgsql security definer set search_path = public as $$
begin
  return (
    select count(distinct coalesce(nullif(session_id,''), user_id::text))
    from public.site_events
    where created_at > now() - interval '5 minutes'
  );
end $$;

grant execute on function public.site_online_now() to anon, authenticated;

create or replace function public.site_usage_hour_distribution(p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
  v_since timestamptz;
begin
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

grant execute on function public.site_usage_hour_distribution(int) to anon, authenticated;
