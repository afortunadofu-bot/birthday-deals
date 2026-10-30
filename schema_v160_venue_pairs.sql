-- =====================================================================
-- v160：一次拿到「每個商圈裡有哪些優惠」；使用者可以建議修改某個商圈
--
-- 嵐：
--   「希望可以看這個人都蒐藏些什麼，建議他可以去哪個商圈一次用掉」
--   「行程旁邊可以串地圖」
--   「使用者也可以投稿編輯」
--
-- 可重複執行。
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. venue_offer_pairs()：所有公開商圈 × 裡面的優惠，一次給
--
-- 為什麼要這一支：「你的待辦清單去哪個商圈一次用最多」要拿你收藏的每一筆去對
-- **每一個**商圈。原本只有 venue_offer_ids(一個商圈)，72 個商圈就是 72 次請求。
-- 這一支一次回 (商圈, 優惠) 的配對，前端自己對——收藏是誰的、收藏了什麼，
-- 都不會送到資料庫（配對本身是公開資料：公開的商圈 × 核可的優惠）。
--
-- 算法跟 venue_offer_ids 一字不差（方塊粗篩、再用真正距離細篩），清單上的
-- 「36 家」跟這裡算出來的才會一樣。
-- ---------------------------------------------------------------------
create or replace function public.venue_offer_pairs()
returns table (venue_id bigint, offer_id bigint)
language sql
stable
security definer
set search_path = public
as $$
  select distinct v.id, s.offer_id
    from public.venues v
    join public.offer_stores s
      on not s.hidden and s.lat is not null
     and s.lat between v.lat - v.radius_m / 111000.0 and v.lat + v.radius_m / 111000.0
     and s.lng between v.lng - v.radius_m / 101000.0 and v.lng + v.radius_m / 101000.0
    join public.offers o
      on o.id = s.offer_id and o.status = 'approved'
   where v.is_public
     and 111000.0 * sqrt(power(s.lat - v.lat, 2)
                       + power((s.lng - v.lng) * cos(radians(v.lat)), 2)) <= v.radius_m;
$$;

revoke execute on function public.venue_offer_pairs() from public;
grant  execute on function public.venue_offer_pairs() to anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. 建議修改某一個商圈
--
-- 推薦地點那張表（v153）多一欄：指向「改哪一個」。空的＝推薦一個新地點（照舊）。
-- 商圈被刪掉的話，指向它的建議一起刪（那些建議已經沒有對象了）。
-- 權限不用動：誰能送、送成什麼狀態，v153 的 RLS 已經管好了。
-- ---------------------------------------------------------------------
alter table public.venue_suggestions
  add column if not exists venue_id bigint references public.venues(id) on delete cascade;

create index if not exists venue_suggestions_venue_idx
  on public.venue_suggestions(venue_id) where venue_id is not null;
