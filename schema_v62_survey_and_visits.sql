-- =====================================================================
-- v62：回饋問卷＋管理員「平均每位會員造訪幾次」
--
--   背景（celine）：
--   1. 想要一個跳出來讓使用者填的回饋問卷，固定放在「我的」分頁，新使用者也會被
--      引導去填；未來要當作品集用的使用者回饋。要求：填法越簡單越好（全部用點的）、
--      訪客也能填、可以重複填（不同時間有不同感受）、要問喜歡哪些功能跟最常用哪些功能。
--   2. 管理員儀表板要看得到「平均每位會員點進來看幾次」。
--
--   跟既有的「問題回報／建議」（site_feedback）分開：那張是一格自由文字，這張是
--   可以統計的分數（滿意度、NPS、各面向、功能勾選），用途不同。
--
--   ---- 問卷 ----
--   - 可以重複填，每次都是新的一列（保留不同時間的感受），但同一台裝置（session_id）
--     或同一個會員 24 小時內只能送一份，避免被灌票。判斷寫在 security definer 函式
--     survey_can_submit() 裡，因為 RLS 政策要查「同一張表」而訪客沒有讀取權限
--   - version 欄位：以後改題目時新舊答案分得開
--   - 只有管理員讀得到個別回覆；統計用 admin_survey_summary()
--
--   ---- 造訪次數 ----
--   site_events.session_id 是存在瀏覽器 localStorage、不會過期的裝置代號，一台裝置
--   永遠同一個，不能直接拿來當「造訪次數」。pageview 則是每次打開／重新整理網站記一次
--   （切分頁不算）。所以「一次造訪」定義成：同一個人兩次 pageview 間隔超過 30 分鐘才算
--   新的一次（celine 確認），連續重新整理不會重複計算。
--   分母用「這段期間在 site_events 有出現過的會員數」——跟 admin_dashboard_stats 的
--   active_users_range 同一個定義，儀表板上的數字才對得起來。
--
--   可重複執行。
-- =====================================================================

create table if not exists public.survey_responses (
  id              bigserial primary key,
  created_at      timestamptz not null default now(),
  user_id         uuid references public.profiles(id) on delete set null,
  session_id      text not null default '' check (char_length(session_id) <= 80),
  version         text not null default 'v1' check (char_length(version) <= 20),
  overall         smallint not null check (overall between 1 and 5),
  nps             smallint not null check (nps between 0 and 10),
  score_find      smallint check (score_find between 1 and 5),
  score_accuracy  smallint check (score_accuracy between 1 and 5),
  score_mobile    smallint check (score_mobile between 1 and 5),
  score_look      smallint check (score_look between 1 and 5),
  liked_features  text[] not null default '{}' check (cardinality(liked_features) <= 20),
  used_features   text[] not null default '{}' check (cardinality(used_features) <= 20),
  source          text check (char_length(source) <= 30),
  comment         text not null default '' check (char_length(comment) <= 500),
  device          text check (device in ('mobile','desktop')),
  page            text not null default '' check (char_length(page) <= 100)
);
create index if not exists survey_responses_created_idx on public.survey_responses(created_at desc);
create index if not exists survey_responses_session_idx on public.survey_responses(session_id, created_at desc);
create index if not exists survey_responses_user_idx    on public.survey_responses(user_id, created_at desc);

alter table public.survey_responses enable row level security;

-- 同一台裝置或同一個會員 24 小時內有沒有填過。security definer：RLS 政策裡要查同一張表，
-- 但訪客／一般會員沒有 select 權限，直接寫子查詢會永遠查不到東西。
create or replace function public.survey_can_submit(p_session text, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.survey_responses s
    where s.created_at > now() - interval '24 hours'
      and ((coalesce(p_session,'') <> '' and s.session_id = p_session)
           or (p_user is not null and s.user_id = p_user))
  );
$$;
grant execute on function public.survey_can_submit(text, uuid) to anon, authenticated;

drop policy if exists survey_insert on public.survey_responses;
drop policy if exists survey_admin_read on public.survey_responses;
drop policy if exists survey_admin_delete on public.survey_responses;

-- 訪客也能填：user_id 只能是空的或自己；停權的會員不能填；要帶裝置代號；24 小時一份
create policy survey_insert on public.survey_responses
  for insert with check (
    (user_id is null or user_id = auth.uid())
    and (auth.uid() is null or not public.is_banned())
    and session_id <> ''
    and public.survey_can_submit(session_id, user_id)
  );

create policy survey_admin_read on public.survey_responses
  for select using (public.is_admin());

create policy survey_admin_delete on public.survey_responses
  for delete using (public.is_admin());

grant insert on public.survey_responses to anon, authenticated;
grant select, delete on public.survey_responses to authenticated;
grant usage on sequence public.survey_responses_id_seq to anon, authenticated;

-- ---------------------------------------------------------------------
-- 問卷統計（管理員）。p_days 跟儀表板一樣：null＝全部時間
-- NPS 在前端算：(推薦者 9–10 分 − 批評者 0–6 分) ÷ 總數 × 100
-- ---------------------------------------------------------------------
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
    'recent_comments', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb)
               from (select created_at, overall, nps, comment, (user_id is not null) as is_member, device
                     from s where comment <> '' order by created_at desc limit 50) c)
  ) into result;
  return result;
end $$;

grant execute on function public.admin_survey_summary(int) to authenticated;
revoke execute on function public.admin_survey_summary(int) from public;

-- ---------------------------------------------------------------------
-- 造訪統計（管理員）。一次造訪＝同一個人兩次 pageview 間隔超過 30 分鐘才算新的一次。
-- 會員用 user_id 分組；訪客（沒登入）用裝置代號分組，當成對照數字。
-- ---------------------------------------------------------------------
create or replace function public.admin_visit_stats(p_days int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
  v_since timestamptz;
begin
  if not public.is_admin() then raise exception '只有管理員可以看造訪統計'; end if;
  if p_days is not null and p_days < 1 then p_days := null; end if;
  v_since := case when p_days is null then to_timestamp(0) else now() - (p_days || ' days')::interval end;

  with pv as (
    select user_id, session_id, created_at,
      lag(created_at) over (
        partition by coalesce(user_id::text, 's:' || session_id) order by created_at
      ) as prev_at
    from public.site_events
    where event_type = 'pageview' and created_at > v_since
  ),
  visits as (
    select user_id, session_id,
      (prev_at is null or created_at - prev_at > interval '30 minutes') as is_new
    from pv
  ),
  member_visits as (
    select user_id, count(*) filter (where is_new) as v, count(*) as p
    from visits where user_id is not null
    group by user_id
  ),
  guest_visits as (
    select session_id, count(*) filter (where is_new) as v
    from visits where user_id is null and session_id <> ''
    group by session_id
  ),
  active as (
    -- 跟 admin_dashboard_stats 的 active_users_range 同一個定義
    select count(distinct user_id) as n
    from public.site_events where created_at > v_since and user_id is not null
  ),
  totals as (
    select (select n from active) as active_n,
           (select coalesce(sum(v), 0) from member_visits) as mv,
           (select coalesce(sum(p), 0) from member_visits) as mp,
           (select count(*) from member_visits where v >= 2) as returning_n
  )
  select jsonb_build_object(
    'active_members',              t.active_n,
    'member_visits',               t.mv,
    'member_pageviews',            t.mp,
    'avg_visits_per_member',       case when t.active_n > 0 then round(t.mv::numeric / t.active_n, 2) end,
    'avg_pageviews_per_member',    case when t.active_n > 0 then round(t.mp::numeric / t.active_n, 2) end,
    'returning_members',           t.returning_n,
    'returning_rate',              case when t.active_n > 0 then round(t.returning_n::numeric / t.active_n, 4) end,
    'guest_devices',               (select count(*) from guest_visits),
    'avg_visits_per_guest_device', (select round(avg(v)::numeric, 2) from guest_visits)
  ) into result
  from totals t;
  return result;
end $$;

grant execute on function public.admin_visit_stats(int) to authenticated;
revoke execute on function public.admin_visit_stats(int) from public;
