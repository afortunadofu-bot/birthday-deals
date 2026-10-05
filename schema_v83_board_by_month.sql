-- =====================================================================
-- v83：「大家都在用什麼」「最多人收藏」可以看單一月份，而且看得到「幾個人」
--
--   嵐：「大家都在用什麼跟最多人收藏，可以看到每個月份的人數，現在都是混在一起」。
--
--   這兩張榜本來都是「全部時間」的累計：
--     popular_offers → 從頭到現在被回報幾次
--     most_wished    → 從頭到現在被收藏幾次
--   混在一起的結果是「去年很紅、今年沒人用」的優惠永遠卡在前面，看不出現在誰在紅。
--
--   另外「次數」跟「人數」是兩件事：同一個人在同一家店回報三次是 3 次、1 個人。
--   嵐要的是**人數**，所以兩支都回 user_count（distinct user_id）。
--
--   p_ym 傳 'YYYY-MM' 看那個月，傳 null 就是全部時間（跟現在的榜一致）。
--   可重複執行。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 某個月（或全部時間）每一筆優惠被用的狀況
--    usage_reports 本來就公開可讀，不需要 security definer。
-- ---------------------------------------------------------------------
create or replace function public.offer_usage_by_month(p_ym text default null)
returns table(
  offer_id      bigint,
  user_count    integer,
  report_count  integer,
  success_count integer,
  saved_total   integer
)
language sql
stable
set search_path = public
as $$
  select r.offer_id,
         count(distinct r.user_id)::integer                            as user_count,
         count(*)::integer                                             as report_count,
         count(*) filter (where r.result = 'success')::integer          as success_count,
         coalesce(sum(r.saved_twd) filter (where r.result = 'success'), 0)::integer as saved_total
  from public.usage_reports r
  where p_ym is null or to_char(r.used_on, 'YYYY-MM') = p_ym
  group by r.offer_id
  order by count(distinct r.user_id) desc, count(*) desc;
$$;

grant execute on function public.offer_usage_by_month(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. 某個月（或全部時間）每一筆優惠被幾個人收藏
--
--    wishlist 的 RLS 是「只看得到自己的」，所以這支要 security definer 才算得到
--    全站的數字——跟 wishlist_counts（schema_v13）同樣的理由、同樣的安全性：
--    只吐 offer_id 跟數量，不吐任何 user_id。
--    wishlist 的主鍵是 (user_id, offer_id)，所以一列就是一個人，count(*) 就是人數。
-- ---------------------------------------------------------------------
create or replace function public.offer_wish_by_month(p_ym text default null)
returns table(
  offer_id   bigint,
  wish_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select w.offer_id, count(*)::integer as wish_count
  from public.wishlist w
  where p_ym is null or to_char(w.created_at, 'YYYY-MM') = p_ym
  group by w.offer_id
  order by count(*) desc;
$$;

revoke execute on function public.offer_wish_by_month(text) from public;
grant execute on function public.offer_wish_by_month(text) to anon, authenticated;

-- wishlist(offer_id) 的索引在 v79 已經加過了；usage_reports(used_on) 在 v82。
-- 這兩支都是整表 group by，資料量級是「每一筆收藏／回報」，現在幾千筆，很快。

-- ---------------------------------------------------------------------
-- 對照用
-- ---------------------------------------------------------------------
-- select * from public.offer_usage_by_month('2026-09') limit 5;
-- select * from public.offer_wish_by_month('2026-09')  limit 5;
