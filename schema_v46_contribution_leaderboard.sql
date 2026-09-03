-- v46：貢獻度排行榜（投稿 + 修改建議被核可的次數）
-- ---------------------------------------------------------------------
-- 嵐的回饋：想看投稿跟修改建議的「貢獻度排行榜」，不是只有省錢排行榜。
-- 只算「已核可」的投稿（offers.status='approved'）跟修改建議
-- （offer_edits.status='approved'）——退回的不算貢獻，才不會有人亂投稿
-- 刷數字。時間點用 reviewed_at（管理員核可的當下），不是 created_at
-- （投稿的當下）——這樣本週/本月榜才會跟「這期審核通過了什麼」對得起來，
-- 不會因為投稿排隊審核拖了好幾天而算到別期去。
--
-- 跟 leaderboard / leaderboard_monthly / leaderboard_weekly 三張 view
-- 同一套結構：all-time 版本不外洩 user_id（隱私），本月/本週版本會（給
-- 前端比對「哪一列是我」跟算名次升降用）。
-- ---------------------------------------------------------------------

-- 1) 全部時間（近一年，跟 leaderboard 的時間窗一致）
create or replace view public.contribution_leaderboard
with (security_invoker = true) as
with sub as (
  select submitted_by as user_id, count(*)::int as submitted_count
  from public.offers
  where status = 'approved' and submitted_by is not null
    and reviewed_at >= current_date - interval '365 days'
  group by submitted_by
), edt as (
  select proposed_by as user_id, count(*)::int as edit_count
  from public.offer_edits
  where status = 'approved' and proposed_by is not null
    and reviewed_at >= current_date - interval '365 days'
  group by proposed_by
), uids as (
  select user_id from sub
  union
  select user_id from edt
)
select
  row_number() over (
    order by (coalesce(sub.submitted_count,0) + coalesce(edt.edit_count,0)) desc
  ) as rank,
  case when p.show_on_leaderboard then p.display_name
       else '匿名使用者' || substr(p.id::text, 1, 4) end as display_name,
  case when p.show_on_leaderboard then p.avatar_url else null end as avatar_url,
  coalesce(sub.submitted_count,0) as submitted_count,
  coalesce(edt.edit_count,0)      as edit_count,
  coalesce(sub.submitted_count,0) + coalesce(edt.edit_count,0) as total_count
from uids
join public.profiles_public p on p.id = uids.user_id
left join sub on sub.user_id = uids.user_id
left join edt on edt.user_id = uids.user_id
where p.is_banned = false
order by total_count desc
limit 100;

grant select on public.contribution_leaderboard to anon, authenticated;

-- 2) 本月
create or replace view public.contribution_leaderboard_monthly
with (security_invoker = true) as
with sub as (
  select submitted_by as user_id, to_char(reviewed_at,'YYYY-MM') as ym, count(*)::int as submitted_count
  from public.offers
  where status = 'approved' and submitted_by is not null and reviewed_at is not null
  group by submitted_by, to_char(reviewed_at,'YYYY-MM')
), edt as (
  select proposed_by as user_id, to_char(reviewed_at,'YYYY-MM') as ym, count(*)::int as edit_count
  from public.offer_edits
  where status = 'approved' and proposed_by is not null and reviewed_at is not null
  group by proposed_by, to_char(reviewed_at,'YYYY-MM')
), combo as (
  select user_id, ym from sub
  union
  select user_id, ym from edt
)
select
  c.user_id,
  case when p.show_on_leaderboard then p.display_name
       else '匿名使用者' || substr(p.id::text, 1, 4) end as display_name,
  case when p.show_on_leaderboard then p.avatar_url else null end as avatar_url,
  c.ym,
  coalesce(sub.submitted_count,0) as submitted_count,
  coalesce(edt.edit_count,0)      as edit_count,
  coalesce(sub.submitted_count,0) + coalesce(edt.edit_count,0) as total_count
from combo c
join public.profiles_public p on p.id = c.user_id
left join sub on sub.user_id = c.user_id and sub.ym = c.ym
left join edt on edt.user_id = c.user_id and edt.ym = c.ym
where p.is_banned = false;

grant select on public.contribution_leaderboard_monthly to anon, authenticated;

-- 3) 本週（ISO 週，格式跟 leaderboard_weekly 一致，例如 2026-W35）
create or replace view public.contribution_leaderboard_weekly
with (security_invoker = true) as
with sub as (
  select submitted_by as user_id, to_char(reviewed_at,'IYYY-"W"IW') as iso_week, count(*)::int as submitted_count
  from public.offers
  where status = 'approved' and submitted_by is not null and reviewed_at is not null
  group by submitted_by, to_char(reviewed_at,'IYYY-"W"IW')
), edt as (
  select proposed_by as user_id, to_char(reviewed_at,'IYYY-"W"IW') as iso_week, count(*)::int as edit_count
  from public.offer_edits
  where status = 'approved' and proposed_by is not null and reviewed_at is not null
  group by proposed_by, to_char(reviewed_at,'IYYY-"W"IW')
), combo as (
  select user_id, iso_week from sub
  union
  select user_id, iso_week from edt
)
select
  c.user_id,
  case when p.show_on_leaderboard then p.display_name
       else '匿名使用者' || substr(p.id::text, 1, 4) end as display_name,
  case when p.show_on_leaderboard then p.avatar_url else null end as avatar_url,
  c.iso_week,
  coalesce(sub.submitted_count,0) as submitted_count,
  coalesce(edt.edit_count,0)      as edit_count,
  coalesce(sub.submitted_count,0) + coalesce(edt.edit_count,0) as total_count
from combo c
join public.profiles_public p on p.id = c.user_id
left join sub on sub.user_id = c.user_id and sub.iso_week = c.iso_week
left join edt on edt.user_id = c.user_id and edt.iso_week = c.iso_week
where p.is_banned = false;

grant select on public.contribution_leaderboard_weekly to anon, authenticated;
