-- =====================================================================
-- v115：「關於」「隱私權」「服務條款」「更新紀錄」這幾頁也要有人次
--
-- celine：「連到 about privacy 小數據所 bandary relatestat 都要紀錄人次」
--
-- v113 只數了站外連結（studio_click）。這一支把站內那幾頁一起算進來：
-- 它們沒有載主程式，所以改用 track.js 直接 POST 一筆 static_view。
--
-- 刻意不叫 pageview——那是主程式在用的事件名，混進來會讓排行榜上公開的
-- 「總瀏覽人次」默默變成另一個意思（站台數據是對所有人開放的 view）。
--
-- 函式名稱、參數、回傳欄位都跟 v113 一樣，所以 create or replace 就夠，
-- 前端不用跟著改；還沒跑這一支的話就只是看不到那幾頁而已，不會壞。
-- 可重複執行。
-- =====================================================================

create or replace function public.admin_link_stats(p_days int default 30)
returns table(
  target  text,
  people  bigint,
  clicks  bigint,
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
    raise exception '只有管理員可以看連結與頁面的統計';
  end if;
  -- p_days <= 0（或 null）＝全部時間
  v_since := case when coalesce(p_days, 0) > 0
                  then now() - make_interval(days => p_days) end;

  return query
  select case when e.event_type = 'static_view'
              then 'page_' || coalesce(nullif(e.meta->>'page', ''), 'other')
              else coalesce(nullif(e.meta->>'to', ''), 'other')
         end                                                    as target,
         count(distinct e.session_id) filter
           (where e.session_id <> '')                           as people,
         count(*)                                               as clicks,
         max(e.created_at)                                      as last_at
    from public.site_events e
   where e.event_type in ('studio_click', 'static_view')
     and (v_since is null or e.created_at >= v_since)
   group by 1
   order by people desc, clicks desc;
end $$;

comment on function public.admin_link_stats(int) is
  '站外連結（studio_click）與靜態頁瀏覽（static_view）各被幾個人、幾次。只回彙總數字，管理員限定。';

grant execute on function public.admin_link_stats(int) to authenticated;
revoke execute on function public.admin_link_stats(int) from public, anon;

-- 查詢走 v14 就建好的 (event_type, created_at) 索引；meta 只在已經篩出這兩種
-- 事件的那一小撮列上展開，不用另外加 jsonb 索引。
