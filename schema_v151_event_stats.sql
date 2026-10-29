-- v151：每個功能、每個區塊被用了幾次
-- ---------------------------------------------------------------------
-- celine：「管理者要可以看到每個 block 及 app 內每個功能被點擊的次數」。
--
-- 不用新的資料表：site_events 本來就一直在記這些（收藏、地圖、分享、投稿、
-- 咖啡、問卷…），只是沒有人看得到。這一支把它們依 event_type 彙總成一張表。
--
-- 跟 admin_link_stats 一樣的原則：
--   - security definer ＋ 函式裡自己擋 is_admin()
--   - **只回彙總數字**，不回任何一列事件、不回 session_id／user_id
--   - 只給 authenticated，anon 收回
--
-- 兩個刻意的決定：
--
-- 1. 不算 pageview。那一種佔了整張表的絕大多數，混進來的話其他功能全部被
--    壓成 0 那一排，而「總瀏覽人次」排行榜上本來就有。
--
-- 2. panel_open 要拆開看。「每個 block 被點幾次」如果只回一個總數，等於沒有
--    回答問題——所以 panel_open 用 meta->>'id' 拆成一塊一塊，前面加 'panel:'
--    讓前端認得出來。做法跟 admin_link_stats 把 studio_click 拆成各個目標
--    一模一樣。
--
-- 可重複執行。
-- ---------------------------------------------------------------------

create or replace function public.admin_event_stats(p_days int default 30)
returns table(
  target  text,
  people  bigint,
  events  bigint,
  last_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_since timestamptz;
begin
  if not public.is_admin() then
    raise exception '只有管理員可以看功能使用統計';
  end if;
  -- p_days <= 0（或 null）＝全部時間
  v_since := case when coalesce(p_days, 0) > 0
                  then now() - make_interval(days => p_days) end;

  return query
  select case when e.event_type = 'panel_open'
              then 'panel:' || coalesce(nullif(e.meta->>'id', ''), 'other')
              else e.event_type
         end                                                    as target,
         count(distinct e.session_id) filter
           (where e.session_id <> '')                           as people,
         count(*)                                               as events,
         max(e.created_at)                                      as last_at
    from public.site_events e
   where e.event_type <> 'pageview'
     and (v_since is null or e.created_at >= v_since)
   group by 1
   order by events desc, people desc;
end $$;

comment on function public.admin_event_stats(int) is
  '管理員專用：每個功能／區塊在近 N 天被用了幾次、幾個人用過。只回彙總，不回個別事件。';

grant execute on function public.admin_event_stats(int) to authenticated;
revoke execute on function public.admin_event_stats(int) from public, anon;

-- 【檢查】跑完貼這一行，應該看得到一張由多到少的表：
-- select * from public.admin_event_stats(30);
