-- =====================================================================
-- v67：排行榜「你是第幾名」＋修正貢獻度排行榜的修改建議次數
--
--   1. 嵐：所有排行榜都要讓使用者知道自己是第幾名。
--      原本前端只能在「抓回來的前 50 名」裡找自己，而且全部時間榜沒有回傳 user_id，
--      只能用暱稱比對——名次在 50 名以後、或自己選擇不公開暱稱，就找不到。
--      新增 my_board_rank()：直接在資料庫裡算「登入的這個人」在某個榜、某一期的名次，
--      只回傳自己的名次／總人數／自己的數字，不會透露別人是誰。
--
--   2. 修 bug：貢獻度排行榜（contribution_leaderboard 系列）是 security_invoker 的 view，
--      用「看的人」的權限去讀 offer_edits。但 offer_edits 的 RLS 只讓提案人自己跟管理員
--      讀已核可的建議——所以除了管理員，大家看到每個人的「建議」都是 0，名次也跟著算錯。
--      改成用 view 擁有者的權限算（security_invoker = false）。view 只輸出彙總次數跟
--      本來就公開的暱稱／頭像（不公開暱稱的人一樣顯示「匿名使用者」），不會多洩漏資料。
--
--   可重複執行。
-- =====================================================================

alter view public.contribution_leaderboard         set (security_invoker = false);
alter view public.contribution_leaderboard_monthly set (security_invoker = false);
alter view public.contribution_leaderboard_weekly  set (security_invoker = false);
alter view public.contribution_leaderboard_prev    set (security_invoker = false);

-- p_board：'savings'（省錢）或 'contrib'（貢獻度）
-- p_period：'all'（總累積＝近一年，跟 leaderboard view 同一個定義）、'month'、'week'
-- p_key：month 時是 'YYYY-MM'，week 時是 'IYYY-"W"IW'（例如 2026-W38）
-- 回傳 {rank, total, value}；還沒上榜時 rank 是 null
create or replace function public.my_board_rank(p_board text, p_period text default 'all', p_key text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_period text := coalesce(p_period, 'all');
  res jsonb;
begin
  if v_uid is null then return null; end if;

  if p_board = 'savings' then
    with t as (
      select r.user_id, sum(coalesce(r.saved_twd, 0)) as v
      from public.usage_reports r
      join public.profiles_public p on p.id = r.user_id
      where p.is_banned = false
        and case v_period
              when 'month' then r.result = 'success' and to_char(r.used_on, 'YYYY-MM') = p_key
              when 'week'  then r.result = 'success' and to_char(r.used_on, 'IYYY-"W"IW') = p_key
              else r.used_on >= current_date - interval '365 days'
            end
      group by r.user_id
      having v_period <> 'all' or sum(coalesce(r.saved_twd, 0)) > 0
    ), rk as (
      select user_id, v, rank() over (order by v desc) as rnk, count(*) over () as n from t
    )
    select jsonb_build_object('rank', rnk, 'total', n, 'value', v) into res from rk where user_id = v_uid;
    if res is null then
      select jsonb_build_object('rank', null, 'total', count(*), 'value', 0) into res from t;
    end if;

  elsif p_board = 'contrib' then
    with sub as (
      select submitted_by as uid, count(*) as c
      from public.offers
      where status = 'approved' and submitted_by is not null and reviewed_at is not null
        and case v_period
              when 'month' then to_char(reviewed_at, 'YYYY-MM') = p_key
              when 'week'  then to_char(reviewed_at, 'IYYY-"W"IW') = p_key
              else reviewed_at >= current_date - interval '365 days'
            end
      group by submitted_by
    ), edt as (
      select proposed_by as uid, count(*) as c
      from public.offer_edits
      where status = 'approved' and proposed_by is not null and reviewed_at is not null
        and case v_period
              when 'month' then to_char(reviewed_at, 'YYYY-MM') = p_key
              when 'week'  then to_char(reviewed_at, 'IYYY-"W"IW') = p_key
              else reviewed_at >= current_date - interval '365 days'
            end
      group by proposed_by
    ), t as (
      select u.uid as user_id, coalesce(s.c, 0) + coalesce(e.c, 0) as v
      from (select uid from sub union select uid from edt) u
      join public.profiles_public p on p.id = u.uid
      left join sub s on s.uid = u.uid
      left join edt e on e.uid = u.uid
      where p.is_banned = false
    ), rk as (
      select user_id, v, rank() over (order by v desc) as rnk, count(*) over () as n from t
    )
    select jsonb_build_object('rank', rnk, 'total', n, 'value', v) into res from rk where user_id = v_uid;
    if res is null then
      select jsonb_build_object('rank', null, 'total', count(*), 'value', 0) into res from t;
    end if;

  else
    raise exception 'unknown board: %', p_board;
  end if;

  return res;
end $$;

grant execute on function public.my_board_rank(text, text, text) to authenticated;
revoke execute on function public.my_board_rank(text, text, text) from public, anon;

notify pgrst, 'reload schema';
