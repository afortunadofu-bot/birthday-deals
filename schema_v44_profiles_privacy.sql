-- =====================================================================
-- v44：修 profiles 表的隱私漏洞——任何人拿 anon key 直接打 REST API 都能
-- 撈到「每一個」註冊會員的生日月日、is_admin、上次來訪時間
--
--   問題根源：profiles_read 政策是 `for select using (true)`，意思是「這張
--   表任何人都能整列查」。當初這樣設是為了讓留言、排行榜能顯示「留言者/
--   得獎者的暱稱」，但 profiles 這張表後來陸續加了 birth_month／birth_day
--   （v18）、last_seen_at（v35）、is_admin／is_banned 這些完全不該公開的
--   欄位，卻是同一條「using(true)」政策罩著。結果是：只要有 anon key
--   （本來就寫在 config.js 裡，本來就是公開的），直接打
--   `GET /rest/v1/profiles?select=*` 就能撈到全站每個人的生日、上次上線
--   時間、誰是管理員——完全不管那個人有沒有勾選「在排行榜顯示暱稱」。
--   這等於架空了 v17 特地做的「排行榜隱私重新設計：預設上榜+匿名化」。
--
--   修法：
--   1) profiles 本表的 select 政策收緊成「只能看自己那列，或你是管理員」。
--   2) 另外開一個 profiles_public view，只裝 id/display_name/avatar_url/
--      is_banned/show_on_leaderboard 這幾個「本來就設計成給別人看」的欄位，
--      不用 security_invoker（用 view 擁有者身分執行），所以不受第 1 點
--      收緊的影響，繼續公開讀得到。
--   3) 所有原本「join profiles 只是為了拿 display_name/avatar_url」的
--      view（排行榜、最近動態、投稿/修改建議公開預覽）全部改成 join
--      profiles_public，行為不變，但資料庫層面再也撈不到別人的生日/
--      is_admin/last_seen_at。
--   4) 前端兩處直接對 comments／usage_reports embed `profiles(display_name)`
--      的地方，因為現在 profiles 已經看不到別人的列，embed 會變成 null，
--      要跟著改（另外查 profiles_public 再自己 merge 回去）——這部分改在
--      template.html，不在這支 SQL 裡。
-- 可重複執行。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 收緊 profiles 本表的讀取權限
-- ---------------------------------------------------------------------
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
-- 2) 公開安全子集：只給「本來就設計成給別人看」的欄位
-- ---------------------------------------------------------------------
create or replace view public.profiles_public as
select id, display_name, avatar_url, is_banned, show_on_leaderboard
from public.profiles;

grant select on public.profiles_public to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) 排行榜（總累積）：join 改成 profiles_public，邏輯不變
-- ---------------------------------------------------------------------
create or replace view public.leaderboard
with (security_invoker = true) as
select
  row_number() over (order by sum(r.saved_twd) desc nulls last) as rank,
  case when p.show_on_leaderboard then p.display_name
       else '匿名使用者' || substr(p.id::text, 1, 4) end as display_name,
  case when p.show_on_leaderboard then p.avatar_url else null end as avatar_url,
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
join public.profiles_public p on p.id = r.user_id
join public.offers   o on o.id = r.offer_id
where p.is_banned = false
  and r.used_on >= current_date - interval '365 days'
group by p.id, p.display_name, p.avatar_url, p.show_on_leaderboard
having coalesce(sum(r.saved_twd), 0) > 0
order by saved_total desc
limit 100;

grant select on public.leaderboard to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) 排行榜（本月）：同上
-- ---------------------------------------------------------------------
create or replace view public.leaderboard_monthly
with (security_invoker = true) as
select
  p.id                              as user_id,
  case when p.show_on_leaderboard then p.display_name
       else '匿名使用者' || substr(p.id::text, 1, 4) end as display_name,
  case when p.show_on_leaderboard then p.avatar_url else null end as avatar_url,
  to_char(r.used_on, 'YYYY-MM')     as ym,
  sum(coalesce(r.saved_twd, 0))::int as saved_total,
  count(*)::int                     as success_count,
  count(distinct o.brand)::int      as brands_used,
  array_agg(distinct o.brand)       as brands
from public.usage_reports r
join public.profiles_public p on p.id = r.user_id
join public.offers   o on o.id = r.offer_id
where r.result = 'success' and p.is_banned = false
group by p.id, p.display_name, p.avatar_url, p.show_on_leaderboard, to_char(r.used_on, 'YYYY-MM');

grant select on public.leaderboard_monthly to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) 排行榜上方「最近動態」：同上
-- ---------------------------------------------------------------------
create or replace view public.recent_activity
with (security_invoker = true) as
select * from (
  select 'usage'::text as kind, r.id, r.offer_id, o.brand,
    case when p.show_on_leaderboard then p.display_name
         else '匿名使用者' || substr(p.id::text, 1, 4) end as display_name,
    null::text as body,
    r.created_at
  from public.usage_reports r
  join public.offers   o on o.id = r.offer_id
  join public.profiles_public p on p.id = r.user_id
  where r.result = 'success' and p.is_banned = false and o.status = 'approved'
  order by r.created_at desc
  limit 30
) u
union all
select * from (
  select 'comment'::text as kind, c.id, c.offer_id, o.brand,
    case when p.show_on_leaderboard then p.display_name
         else '匿名使用者' || substr(p.id::text, 1, 4) end as display_name,
    left(c.body, 60) as body,
    c.created_at
  from public.comments c
  join public.offers   o on o.id = c.offer_id
  join public.profiles_public p on p.id = c.user_id
  where c.is_hidden = false and p.is_banned = false and o.status = 'approved'
  order by c.created_at desc
  limit 30
) cm
order by created_at desc
limit 20;

grant select on public.recent_activity to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6) 待審投稿／修改建議公開預覽：投稿人/提議人暱稱改用 profiles_public
-- ---------------------------------------------------------------------
create or replace view public.offers_pending_preview
with (security_invoker = true) as
select o.id, o.brand, o.category, o.regions, o.offer, o.membership,
       o.membership_type, o.free_tier, o.timing, o.offer_window,
       o.advance_days, o.conditions, o.value_twd, o.valid_until,
       o.sources, o.group_name, o.created_at,
       p.display_name as submitted_by_name
from public.offers o
left join public.profiles_public p on p.id = o.submitted_by
where o.status = 'pending';

grant select on public.offers_pending_preview to authenticated;

create or replace view public.offer_edits_pending_preview
with (security_invoker = true) as
select e.id, e.offer_id, e.patch, e.reason, e.source_url, e.created_at,
       o.brand,
       o.offer        as current_offer,
       o.conditions   as current_conditions,
       o.membership   as current_membership,
       o.timing       as current_timing,
       o.advance_days as current_advance_days,
       o.value_twd    as current_value_twd,
       o.valid_until  as current_valid_until,
       p.display_name as proposed_by_name
from public.offer_edits e
join public.offers o on o.id = e.offer_id
left join public.profiles_public p on p.id = e.proposed_by
where e.status = 'pending';

grant select on public.offer_edits_pending_preview to authenticated;

-- ---------------------------------------------------------------------
-- 7) 順便補幾個承載量體檢時發現漏掉的索引——usage_reports/offers 依
--    user_id/submitted_by 查（我的使用回報、我的投稿、排行榜彙總）目前
--    沒有對應索引，資料量還小感覺不出來，量大之後這幾張常查的表會變慢。
--    CREATE INDEX IF NOT EXISTS 本身是安全的疊加操作，不影響現有資料。
-- ---------------------------------------------------------------------
create index if not exists usage_reports_user_idx on public.usage_reports(user_id, used_on desc);
create index if not exists offers_submitted_by_idx on public.offers(submitted_by);
create index if not exists comments_user_idx on public.comments(user_id);
