-- =====================================================================
-- v37：審核區塊補分析——核可率、平均審核耗時、待審類別分布、投稿最多的人
-- 一次撈回一個 jsonb，前端不用自己拼好幾個 count/avg 查詢。
-- 可重複執行。
-- =====================================================================

create or replace function public.admin_review_insights()
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_admin() then
    raise exception '只有管理員可以看審核分析';
  end if;

  select jsonb_build_object(
    'approved_count', (select count(*) from public.offers where status = 'approved'),
    'rejected_count', (select count(*) from public.offers where status = 'rejected'),
    'pending_count',  (select count(*) from public.offers where status = 'pending'),
    -- 平均審核耗時：從投稿建立到管理員核可/退回的小時數，只算已經審過的，
    -- 還在待審的（reviewed_at is null）不列入計算。
    'avg_review_hours', (
      select round(extract(epoch from avg(reviewed_at - created_at)) / 3600, 1)
      from public.offers
      where reviewed_at is not null and status in ('approved','rejected')
    ),
    'pending_by_category', (
      select coalesce(jsonb_agg(jsonb_build_object('category', category, 'count', cnt) order by cnt desc), '[]'::jsonb)
      from (
        select coalesce(nullif(category,''),'未分類') as category, count(*) as cnt
        from public.offers where status = 'pending'
        group by 1
      ) t
    ),
    'top_submitters', (
      select coalesce(jsonb_agg(jsonb_build_object('name', display_name, 'count', cnt) order by cnt desc), '[]'::jsonb)
      from (
        select coalesce(p.display_name,'匿名') as display_name, count(*) as cnt
        from public.offers o
        join public.profiles p on p.id = o.submitted_by
        where o.submitted_by is not null
        group by 1
        order by count(*) desc
        limit 5
      ) t
    )
  ) into result;

  return result;
end $$;

grant execute on function public.admin_review_insights() to authenticated;
revoke execute on function public.admin_review_insights() from public;
