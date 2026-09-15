-- =====================================================================
-- v63：回饋問卷多問幾題（全部用點的）
--
--   背景（celine）：回饋想多問一些問題，一樣要用點的。
--
--   新題目（多久來一次、有沒有真的用過優惠、想看哪類優惠、遇過什麼問題、希望加什麼…）
--   不再一題開一個欄位，統一放進 extra（jsonb）：
--     { "visit_freq": "weekly", "want_types": ["food","beauty"], ... }
--   單選是字串、複選是字串陣列。以後再加題目只要改前端，不用再跑 SQL。
--   題目 key 跟選項對應的中文寫在 template.html 的 SURVEY_EXTRA。
--
--   admin_survey_summary() 多回傳 extra：每題每個選項幾個人
--     { "visit_freq": {"weekly": 3, "first": 5}, "want_types": {"food": 7}, ... }
--
--   前端在這支還沒跑時會自動改成不帶 extra 送出（舊題目照樣收得到），所以先上前端也不會壞。
--
--   可重複執行。
-- =====================================================================

alter table public.survey_responses
  add column if not exists extra jsonb not null default '{}'::jsonb
    check (jsonb_typeof(extra) = 'object' and pg_column_size(extra) <= 4000);

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
    -- 新題目：每題每個選項幾個人（單選字串、複選陣列都攤平成一個個選項來數）
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
    'recent_comments', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb)
               from (select created_at, overall, nps, comment, (user_id is not null) as is_member, device
                     from s where comment <> '' order by created_at desc limit 50) c)
  ) into result;
  return result;
end $$;

grant execute on function public.admin_survey_summary(int) to authenticated;
revoke execute on function public.admin_survey_summary(int) from public;

-- 讓 PostgREST 馬上認得新欄位（不然前端送 extra 會說找不到欄位）
notify pgrst, 'reload schema';
