-- v163：「功能被用了幾次」可以自己選日期，也看得到每一頁有幾個人點進來
-- ---------------------------------------------------------------------
-- celine：「功能被用了幾次要可以選時間區間」「排行程也要可以看的到點擊人數」。
--
-- v151 的 admin_event_stats(p_days) 只吃「近幾天」。這一支吃「從、到」兩個時間點
-- （任一頭空著＝不限），其他照抄 v151：
--   - security definer ＋ 函式裡自己擋 is_admin()
--   - 只回彙總數字，不回任何一列事件、不回 session_id／user_id
--   - 只給 authenticated，anon 收回
--   - 不算 pageview
--
-- 多拆一種：前端從 v163 開始，每換一頁記一次 tab_open（meta.tab ＝ browse／board／
-- trip／mine／admin／submit）。跟 panel_open 拆成 'panel:<id>' 一樣，這裡拆成
-- 'tab:<頁>'，前端才分得出「點進排行程」有幾個人。
--
-- 不需要先跑別支（site_events 是 v14 就有的表，is_admin() 是 v1 就有的）。
-- v151 那支留著：前端在這支還沒跑的時候會退回去用它。
-- 可重複執行。
-- ---------------------------------------------------------------------

create or replace function public.admin_event_stats_range(
  p_from timestamptz default null,
  p_to   timestamptz default null
)
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
begin
  if not public.is_admin() then
    raise exception '只有管理員可以看功能使用統計';
  end if;

  return query
  select case e.event_type
           when 'panel_open' then 'panel:' || coalesce(nullif(e.meta->>'id', ''), 'other')
           when 'tab_open'   then 'tab:'   || coalesce(nullif(e.meta->>'tab', ''), 'other')
           else e.event_type
         end                                                    as target,
         count(distinct e.session_id) filter
           (where e.session_id <> '')                           as people,
         count(*)                                               as events,
         max(e.created_at)                                      as last_at
    from public.site_events e
   where e.event_type <> 'pageview'
     and (p_from is null or e.created_at >= p_from)
     and (p_to   is null or e.created_at <  p_to)
   group by 1
   order by events desc, people desc;
end $$;

comment on function public.admin_event_stats_range(timestamptz, timestamptz) is
  '管理員專用：每個功能／區塊／頁面在 [p_from, p_to) 之間被用了幾次、幾個人用過。只回彙總。';

grant execute on function public.admin_event_stats_range(timestamptz, timestamptz) to authenticated;
revoke execute on function public.admin_event_stats_range(timestamptz, timestamptz) from public, anon;

-- 【檢查】跑完貼這一行，應該看得到一張由多到少的表（近 7 天）：
-- select * from public.admin_event_stats_range(now() - interval '7 days', null);
