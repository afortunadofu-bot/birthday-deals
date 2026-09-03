-- =====================================================================
-- v5 增量更新：排行榜要能看到「這人用過哪些店家」
-- 只需要重建 leaderboard 這個 view，其他表格結構不變。
-- 在 Supabase SQL Editor 貼上整份執行即可，可重複執行。
-- =====================================================================

-- 只公開暱稱、頭像、金額與品牌清單，不公開 email 或 user id（沿用原本的隱私原則）。
-- 品牌清單只列「成功用到」的，且跟金額排行同樣只看近 365 天、需 show_on_leaderboard=true。
create or replace view public.leaderboard
with (security_invoker = true) as
select
  row_number() over (order by sum(r.saved_twd) desc nulls last) as rank,
  p.display_name,
  p.avatar_url,
  coalesce(sum(r.saved_twd), 0)                as saved_total,
  count(*) filter (where r.result = 'success') as success_count,
  count(distinct r.offer_id)                   as brands_used,
  max(r.used_on)                               as last_used_on,
  coalesce(
    array_agg(distinct o.brand order by o.brand)
      filter (where r.result = 'success'),
    '{}'
  )                                             as brands
from public.usage_reports r
join public.profiles p on p.id = r.user_id
join public.offers   o on o.id = r.offer_id
where p.show_on_leaderboard = true
  and p.is_banned = false
  and r.used_on >= current_date - interval '365 days'
group by p.id, p.display_name, p.avatar_url
having coalesce(sum(r.saved_twd), 0) > 0
order by saved_total desc
limit 100;

grant select on public.leaderboard to anon, authenticated;
