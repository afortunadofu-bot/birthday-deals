-- =====================================================================
-- v64：問卷「還想說的話」看得到是誰留的
--
--   背景（嵐）：後台看回饋時想知道是誰留言的、什麼時候留的。
--   時間本來就有（created_at），這支補上會員暱稱：
--   recent_comments 多一個 display_name（訪客是 null，畫面上顯示「訪客」）。
--
--   只有管理員讀得到（函式本身第一行就擋非管理員），匯出的 CSV 一樣不含暱稱
--   跟任何個人代號。
--
--   要先跑過 v62、v63。可重複執行。
-- =====================================================================

create or replace function public.admin_survey_summary(p_days int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
  v_since timestamptz;
begin
  if not public.is_admin() then raise exception '只有管理員可以看問卷統計'; end if;
  if p_days is not null and p_days < 1 then p_days := null; end if;
  v_since := case when p_days is null then to_timestamp(0) else now() - (p_days || ' days')::interval end;

  with s as (
    select * from public.survey_responses where created_at > v_since
  )
  select jsonb_build_object(
    'total',        (select count(*) from s),
    'members',      (select count(*) from s where user_id is not null),
    'guests',       (select count(*) from s where user_id is null),
    'overall_avg',  (select round(avg(overall)::numeric, 2) from s),
    'promoters',    (select count(*) from s where nps >= 9),
    'passives',     (select count(*) from s where nps between 7 and 8),
    'detractors',   (select count(*) from s where nps <= 6),
    'find_avg',     (select round(avg(score_find)::numeric, 2) from s),
    'accuracy_avg', (select round(avg(score_accuracy)::numeric, 2) from s),
    'mobile_avg',   (select round(avg(score_mobile)::numeric, 2) from s),
    'look_avg',     (select round(avg(score_look)::numeric, 2) from s),
    'liked',  (select coalesce(jsonb_object_agg(f, n), '{}'::jsonb)
               from (select f, count(*) as n from s cross join lateral unnest(s.liked_features) as f group by f) x),
    'used',   (select coalesce(jsonb_object_agg(f, n), '{}'::jsonb)
               from (select f, count(*) as n from s cross join lateral unnest(s.used_features) as f group by f) x),
    'source', (select coalesce(jsonb_object_agg(src, n), '{}'::jsonb)
               from (select coalesce(source, 'unknown') as src, count(*) as n from s group by 1) x),
    'extra',  (select coalesce(jsonb_object_agg(k, cnts), '{}'::jsonb)
               from (select k, jsonb_object_agg(v, n) as cnts
                     from (select e.key as k, x.v, count(*) as n
                           from s
                           cross join lateral jsonb_each(s.extra) as e
                           cross join lateral jsonb_array_elements_text(
                             case when jsonb_typeof(e.value) = 'array' then e.value
                                  else jsonb_build_array(e.value) end) as x(v)
                           group by 1, 2) a
                     group by k) b),
    -- 嵐：想知道是誰留的、什麼時候留的 → 多回傳會員暱稱（訪客是 null）
    'recent_comments', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb)
               from (select r.created_at, r.overall, r.nps, r.comment,
                            (r.user_id is not null) as is_member, r.device,
                            p.display_name
                     from s r
                     left join public.profiles p on p.id = r.user_id
                     where r.comment <> ''
                     order by r.created_at desc limit 50) c)
  ) into result;
  return result;
end $$;

grant execute on function public.admin_survey_summary(int) to authenticated;
revoke execute on function public.admin_survey_summary(int) from public;
