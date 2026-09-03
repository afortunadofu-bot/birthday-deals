-- v45：排行榜加「本週」區間
-- ---------------------------------------------------------------------
-- 嵐的回饋：排行榜目前只有「本月／全部」，希望多一個「本週」，並且能看到
-- 名次相較上一期是升是降。這支 migration 只負責「本週」這張新 view；
-- 名次升降是前端拿本週跟上週（或本月跟上月）兩份排行榜比對算出來的，
-- 不需要額外的 view。
--
-- 週的定義用 ISO 週（週一到週日算一週），格式跟 <input type="week"> 一致
-- （例如 2026-W35），方便前端不用自己額外轉換格式。
-- ---------------------------------------------------------------------
create or replace view public.leaderboard_weekly
with (security_invoker = true) as
select
  p.id                                      as user_id,
  case when p.show_on_leaderboard then p.display_name
       else '匿名使用者' || substr(p.id::text, 1, 4) end as display_name,
  case when p.show_on_leaderboard then p.avatar_url else null end as avatar_url,
  to_char(r.used_on, 'IYYY-"W"IW')          as iso_week,
  sum(coalesce(r.saved_twd, 0))::int        as saved_total,
  count(*)::int                             as success_count,
  count(distinct o.brand)::int              as brands_used,
  array_agg(distinct o.brand)               as brands
from public.usage_reports r
join public.profiles_public p on p.id = r.user_id
join public.offers   o on o.id = r.offer_id
where r.result = 'success' and p.is_banned = false
group by p.id, p.display_name, p.avatar_url, p.show_on_leaderboard, to_char(r.used_on, 'IYYY-"W"IW');

grant select on public.leaderboard_weekly to anon, authenticated;
