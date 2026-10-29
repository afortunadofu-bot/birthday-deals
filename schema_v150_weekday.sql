-- v150：星期幾最多人「上站」（不是只有「最多人回報用過」）
-- ---------------------------------------------------------------------
-- celine：「星期那裡也要附上上線人數」。
--
-- 洞察分析的「星期」目前只有一張圖：星期幾最多人成功使用。那張是拿
-- usage_reports 算的，回答的是「哪一天大家真的去兌換」——但「哪一天大家會
-- 來看」是另一件事，而且兩者通常不一樣（上班日滑手機找優惠、週末才去用）。
--
-- 「使用時段」那張圖（site_usage_hour_distribution，schema_v55）已經在用
-- site_events 的 pageview 算「幾點最多人上站」了。這一支是它的星期版本，
-- 形狀、權限、隱私原則都照抄：
--   - security definer，但**只回聚合數字**，不吐 session_id／user_id
--   - 開放給 anon／authenticated（排行榜是公開頁面）
--   - 時區固定 Asia/Taipei，不然星期會被 UTC 切錯一天
--
-- 人數的定義：同一天同一個 session 只算一個人，跟 site_online_now() 用的
-- 是同一條 coalesce(session_id, user_id) 規則。跨天不去重——同一個人禮拜一
-- 來過三個禮拜，就是三個「人天」。不這樣算的話，「週一 12 人」會隨著區間
-- 拉長而越來越不像「一個星期一大概有幾個人」。
--
-- 可重複執行。
-- ---------------------------------------------------------------------

create or replace function public.site_weekday_distribution(p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
  v_since timestamptz;
begin
  if p_days is null then p_days := 30; end if;
  if p_days < 1  then p_days := 30; end if;
  if p_days > 90 then p_days := 90; end if;
  v_since := now() - (p_days || ' days')::interval;

  with dows as (
    select generate_series(0,6) as dow
  ),
  -- 先壓成「哪一天、哪一個 session」，同一天同一個人只留一列
  sess as (
    select distinct
           (created_at at time zone 'Asia/Taipei')::date as d,
           coalesce(nullif(session_id,''), user_id::text) as who
    from public.site_events
    where event_type = 'pageview'
      and created_at > v_since
      and coalesce(nullif(session_id,''), user_id::text) is not null
  ),
  ev as (
    select extract(dow from d)::int as dow, count(*) as visitors
    from sess
    group by 1
  ),
  pv as (
    select extract(dow from (created_at at time zone 'Asia/Taipei'))::int as dow,
           count(*) as views
    from public.site_events
    where event_type = 'pageview'
      and created_at > v_since
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'dow', d.dow,
           'visitors', coalesce(ev.visitors, 0),
           'views', coalesce(pv.views, 0)) order by d.dow), '[]'::jsonb)
    into result
  from dows d
  left join ev on ev.dow = d.dow
  left join pv on pv.dow = d.dow;

  return result;
end $$;

grant execute on function public.site_weekday_distribution(int) to anon, authenticated;

-- 【檢查】跑完貼這一行看看有沒有數字（0=週日）：
-- select public.site_weekday_distribution(30);
