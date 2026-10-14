-- =====================================================================
-- v113：站外連結被幾個人點過（品牌頁、Bandary、RelateStats）
--
-- celine：「幫我再多偵測有點進去品牌頁任何網址的」
--
-- v112 答的是咖啡按鈕，這一支是同一個問題的另一半：頁尾那組「小數據所」的
-- 連結到底有沒有人點。前端記成一種事件 studio_click，點到哪一個放在
-- meta->>'to'（brandpage／bandary／relatestats），另外 meta->>'from' 記是從
-- 哪一頁點的（footer／about），之後想看哪個位置比較有用時不用再改一次前端。
--
-- 跟 v112 一樣：count(distinct session_id) PostgREST 做不到，而且「人」其實是
-- 「瀏覽器」（session_id 存在 localStorage，about.html 讀的是同一把 key，
-- 所以同一個人從哪一頁點都算同一個）。只回彙總，不回任何一列事件。
--
-- 權限跟 site_events 本來的規則一致：只有管理員。可重複執行。
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
    raise exception '只有管理員可以看站外連結的統計';
  end if;
  -- p_days <= 0（或 null）＝全部時間
  v_since := case when coalesce(p_days, 0) > 0
                  then now() - make_interval(days => p_days) end;

  return query
  select coalesce(nullif(e.meta->>'to', ''), '其他')          as target,
         count(distinct e.session_id) filter
           (where e.session_id <> '')                          as people,
         count(*)                                              as clicks,
         max(e.created_at)                                     as last_at
    from public.site_events e
   where e.event_type = 'studio_click'
     and (v_since is null or e.created_at >= v_since)
   group by 1
   order by people desc, clicks desc;
end $$;

comment on function public.admin_link_stats(int) is
  '頁尾「小數據所」那組站外連結被幾個人、點了幾次（studio_click）。只回彙總數字，管理員限定。';

grant execute on function public.admin_link_stats(int) to authenticated;
revoke execute on function public.admin_link_stats(int) from public, anon;

-- 查詢走 v14 就建好的 (event_type, created_at) 索引；meta 只在已經篩出
-- studio_click 的那一小撮列上展開，不用另外加 jsonb 索引。
