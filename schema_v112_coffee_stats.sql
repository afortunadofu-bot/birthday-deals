-- =====================================================================
-- v112：咖啡按鈕的「幾個人」（不只是「幾次」）
--
-- celine：「我可以偵測多少人點過捐款咖啡嗎」
--
-- v107 已經有審核頁的「咖啡按鈕」那一塊，但它是用 PostgREST 的 head+count 數
-- site_events 的列數，答的是「被按了幾次」。同一個人反覆點開五次說明，在那個
-- 數字裡就是 5。要答「幾個人」得 count(distinct session_id)，PostgREST 做不到，
-- 所以交給資料庫算，而且只回彙總數字、不回任何一列原始事件。
--
-- session_id 是前端存在 localStorage 的隨機字串（見 template.html 的 SESSION_ID），
-- 所以「人」實際上是「瀏覽器」：同一個人用手機和電腦各點一次算兩個，清掉瀏覽器
-- 資料就會變成新的一個。這是故意的——站上不會為了算人頭去綁任何身分。
--
-- 權限跟 site_events 本來的規則一致：只有管理員。
-- 可重複執行。
-- =====================================================================

create or replace function public.admin_coffee_stats(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since timestamptz;
  r record;
begin
  if not public.is_admin() then
    raise exception '只有管理員可以看咖啡按鈕的統計';
  end if;
  -- p_days <= 0（或 null）＝全部時間
  v_since := case when coalesce(p_days, 0) > 0
                  then now() - make_interval(days => p_days) end;

  select
    count(*) filter (where event_type = 'coffee_open')          as open_events,
    count(distinct session_id) filter
      (where event_type = 'coffee_open' and session_id <> '')   as open_people,
    count(*) filter (where event_type = 'coffee_go')            as go_events,
    count(distinct session_id) filter
      (where event_type = 'coffee_go' and session_id <> '')     as go_people,
    min(created_at)                                             as first_at
  into r
  from public.site_events
  where event_type in ('coffee_open', 'coffee_go')
    and (v_since is null or created_at >= v_since);

  return jsonb_build_object(
    'days',        coalesce(p_days, 0),
    'open_events', coalesce(r.open_events, 0),
    'open_people', coalesce(r.open_people, 0),
    'go_events',   coalesce(r.go_events, 0),
    'go_people',   coalesce(r.go_people, 0),
    'first_at',    r.first_at);
end $$;

comment on function public.admin_coffee_stats(int) is
  '咖啡按鈕被幾個人、按了幾次（coffee_open／coffee_go）。只回彙總數字，管理員限定。';

grant execute on function public.admin_coffee_stats(int) to authenticated;
revoke execute on function public.admin_coffee_stats(int) from public, anon;

-- 查詢走 v14 就建好的 (event_type, created_at) 索引，不用加新的索引。
