-- =====================================================================
-- v13：民眾評分、收藏統計、每月排行榜、待審投稿公開預覽
-- =====================================================================
-- 可重複執行。跑完這份之後前端才會有評分、最多人收藏、月排行榜。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 民眾評分（1～5 星，一人一筆，可改）
-- ---------------------------------------------------------------------
create table if not exists public.offer_ratings (
  offer_id   bigint not null references public.offers(id) on delete cascade,
  user_id    uuid   not null references public.profiles(id) on delete cascade,
  score      int    not null check (score between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (offer_id, user_id)
);
create index if not exists ratings_offer_idx on public.offer_ratings(offer_id);

alter table public.offer_ratings enable row level security;

drop policy if exists ratings_read on public.offer_ratings;
drop policy if exists ratings_own  on public.offer_ratings;

-- 評分是公開資訊（要算平均給大家看），但只能改自己那筆
create policy ratings_read on public.offer_ratings for select using (true);
create policy ratings_own  on public.offer_ratings for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists ratings_touch on public.offer_ratings;
create trigger ratings_touch before update on public.offer_ratings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 2) 讓「收藏數」也能公開統計
--    wishlist 原本的 RLS 只允許看自己的，所以前端算不出「最多人收藏」。
--    這裡開一個只回傳彙總數字、不會洩漏「誰收藏了什麼」的 view。
-- ---------------------------------------------------------------------
create or replace view public.wishlist_counts as
select offer_id, count(*)::int as wish_count
from public.wishlist
group by offer_id;

-- 注意：這個 view 刻意「不」加 security_invoker，
-- 讓它以擁有者身分執行、繞過 wishlist 的 RLS，才算得到全站總數。
-- 它只吐出 offer_id 與數量，不含 user_id，所以不會洩漏個人收藏內容。
grant select on public.wishlist_counts to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) 統計 view 補上評分與收藏數
-- ---------------------------------------------------------------------
create or replace view public.offer_stats
with (security_invoker = true) as
select
  o.id as offer_id,
  count(distinct r.id)                                             as report_count,
  max(r.used_on)                                                   as last_used_on,
  count(*) filter (where r.result = 'success')                     as success_count,
  count(*) filter (where r.result = 'failed')                      as failed_count,
  case when count(r.id) = 0 then null
       else round(100.0 * count(*) filter (where r.result = 'success') / count(r.id))
  end                                                              as success_rate,
  (select count(*) from public.comments c
    where c.offer_id = o.id and not c.is_hidden)                   as comment_count,
  (select round(avg(g.score), 1) from public.offer_ratings g
    where g.offer_id = o.id)                                       as rating_avg,
  (select count(*) from public.offer_ratings g
    where g.offer_id = o.id)                                       as rating_count,
  coalesce((select w.wish_count from public.wishlist_counts w
    where w.offer_id = o.id), 0)                                   as wish_count
from public.offers o
left join public.usage_reports r on r.offer_id = o.id
group by o.id;

-- offers_public 用 o.* 展開所有欄位。PostgreSQL 的 view 會把 o.* 在「建立當下」
-- 展開成固定的欄位清單記住；後來用 alter table add column 加的欄位
-- （sub_offers、group_name）不會自動補進舊的 view 定義。現在要重建 view 讓它
-- 認得新欄位，o.* 會重新展開、把 sub_offers/group_name 插進「中間」，
-- 而不是接在最後面 —— PostgreSQL 的 create or replace view 只准在最後面加欄位、
-- 不准改名或插在中間，所以才會報 cannot change name of view column。
-- 用 drop + create 取代 create or replace 就能繞過這個限制。
drop view if exists public.offers_public;
create view public.offers_public
with (security_invoker = true) as
select o.*, s.report_count, s.last_used_on, s.success_rate, s.comment_count,
       s.rating_avg, s.rating_count, s.wish_count
from public.offers o
left join public.offer_stats s on s.offer_id = o.id
where o.status = 'approved';

grant select on public.offers_public to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) 待審投稿公開預覽：登入者可以看到別人投了什麼（唯讀），
--    但只有管理員能審核（審核走 review_offer RPC，本來就檢查 is_admin）。
--    這樣大家能先收藏、也避免重複投稿同一筆。
-- ---------------------------------------------------------------------
create or replace view public.offers_pending_preview
with (security_invoker = true) as
select o.id, o.brand, o.category, o.regions, o.offer, o.membership,
       o.membership_type, o.free_tier, o.timing, o.offer_window,
       o.advance_days, o.conditions, o.value_twd, o.valid_until,
       o.sources, o.group_name, o.created_at,
       p.display_name as submitted_by_name
from public.offers o
left join public.profiles p on p.id = o.submitted_by
where o.status = 'pending';

drop policy if exists offers_read_pending_all on public.offers;
create policy offers_read_pending_all on public.offers
  for select using (status = 'pending' and auth.uid() is not null);

grant select on public.offers_pending_preview to authenticated;

-- ---------------------------------------------------------------------
-- 5) 每月排行榜：只算指定月份的成功回報
-- ---------------------------------------------------------------------
create or replace view public.leaderboard_monthly
with (security_invoker = true) as
select
  p.id                              as user_id,
  p.display_name,
  p.avatar_url,
  to_char(r.used_on, 'YYYY-MM')     as ym,
  sum(coalesce(r.saved_twd, 0))::int as saved_total,
  count(*)::int                     as success_count,
  count(distinct o.brand)::int      as brands_used,
  array_agg(distinct o.brand)       as brands
from public.usage_reports r
join public.profiles p on p.id = r.user_id
join public.offers   o on o.id = r.offer_id
where r.result = 'success' and p.show_on_leaderboard
group by p.id, p.display_name, p.avatar_url, to_char(r.used_on, 'YYYY-MM');

grant select on public.leaderboard_monthly to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6) 最多人收藏的優惠（給排行榜分頁用）
-- ---------------------------------------------------------------------
create or replace view public.most_wished as
select o.id as offer_id, o.brand, o.timing, o.value_twd, w.wish_count
from public.wishlist_counts w
join public.offers o on o.id = w.offer_id
where o.status = 'approved'
order by w.wish_count desc;

grant select on public.most_wished to anon, authenticated;
