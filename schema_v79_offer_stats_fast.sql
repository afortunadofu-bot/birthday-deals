-- =====================================================================
-- v79：首頁一打開就慢——offer_stats 每次都為「每一筆優惠」各跑四支子查詢
--
--   celine：「這樣真的夠用嗎？之前開啟網頁也慢慢的。」不夠。v78 修掉的是
--   site_events 那一條（每開一次網頁掃一次事件表），但「開啟網頁慢」還有
--   第二條，而且它跟造訪數無關，是每一次都慢。
--
--   前端開場一定會打 `select * from offers_public`，而 offers_public 是
--   offers ⟕ offer_stats，offer_stats 長這樣（schema_v13_ratings.sql）：
--
--     select o.id,
--       count(distinct r.id) …,                                  -- join usage_reports 後 group by
--       (select count(*) from comments      c where c.offer_id = o.id and not c.is_hidden),
--       (select round(avg(g.score),1) from offer_ratings g where g.offer_id = o.id),
--       (select count(*)             from offer_ratings g where g.offer_id = o.id),
--       coalesce((select w.wish_count from wishlist_counts w where w.offer_id = o.id), 0)
--     from offers o left join usage_reports r on r.offer_id = o.id
--     group by o.id;
--
--   那四個括號是「相關子查詢」：**每一筆優惠都要各跑一次**。站上 500 筆優惠
--   就是 2000 次查找，其中 offer_ratings 還被掃了兩遍（平均一次、筆數一次），
--   wishlist_counts 是沒有索引的整表 group by。每一位訪客、每一次開啟網頁，
--   資料庫都要重新算一遍這些東西。
--
--   改法不改變任何結果，只改算的方式：四支相關子查詢 → 三個先彙總好的 CTE，
--   再用 hash join 接回去。每張來源表只掃一次，不是每筆優惠掃一次。
--
--   欄位名稱、順序、型別都跟原本一模一樣，所以前端不用跟著改。
--   可重複執行。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. wishlist 少一支 (offer_id) 索引：wishlist_counts 是 group by offer_id，
--    沒有索引就得整表掃。現有的兩支索引都是 (user_id, …) 開頭，用不上。
-- ---------------------------------------------------------------------
create index if not exists wishlist_offer_idx on public.wishlist(offer_id);

-- ---------------------------------------------------------------------
-- 2. offer_stats 改寫
--    offers_public 依賴它，而且是 `select o.*` 展開的，所以照 schema_v13 的
--    老規矩：先把 offers_public 砍掉，改完 offer_stats 再原樣建回來。
-- ---------------------------------------------------------------------
drop view if exists public.offers_public;

create or replace view public.offer_stats
with (security_invoker = true) as
with r as (
  select offer_id,
         count(*)                                     as report_count,
         max(used_on)                                 as last_used_on,
         count(*) filter (where result = 'success')   as success_count,
         count(*) filter (where result = 'failed')    as failed_count
  from public.usage_reports
  group by offer_id
), c as (
  select offer_id, count(*) as comment_count
  from public.comments
  where not is_hidden
  group by offer_id
), g as (
  select offer_id,
         round(avg(score), 1) as rating_avg,
         count(*)             as rating_count
  from public.offer_ratings
  group by offer_id
)
select
  o.id                                                     as offer_id,
  coalesce(r.report_count, 0)                              as report_count,
  r.last_used_on                                           as last_used_on,
  coalesce(r.success_count, 0)                             as success_count,
  coalesce(r.failed_count, 0)                              as failed_count,
  case when coalesce(r.report_count, 0) = 0 then null
       else round(100.0 * r.success_count / r.report_count)
  end                                                      as success_rate,
  coalesce(c.comment_count, 0)                             as comment_count,
  g.rating_avg                                             as rating_avg,
  coalesce(g.rating_count, 0)                              as rating_count,
  coalesce(w.wish_count, 0)                                as wish_count
from public.offers o
left join r on r.offer_id = o.id
left join c on c.offer_id = o.id
left join g on g.offer_id = o.id
left join public.wishlist_counts w on w.offer_id = o.id;

grant select on public.offer_stats to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. offers_public 原樣建回來（跟 schema_v45_transferable.sql 一字不差）
-- ---------------------------------------------------------------------
create view public.offers_public
with (security_invoker = true) as
select o.*, s.report_count, s.last_used_on, s.success_rate, s.comment_count,
       s.rating_avg, s.rating_count, s.wish_count
from public.offers o
left join public.offer_stats s on s.offer_id = o.id
where o.status = 'approved';

grant select on public.offers_public to anon, authenticated;

-- ---------------------------------------------------------------------
-- 想自己確認有沒有變快，跑完這一段看 Execution Time（跑之前先跑一次
-- 對照組：改之前大約是幾百毫秒到好幾秒，改完應該在幾十毫秒上下）
-- ---------------------------------------------------------------------
-- explain analyze select * from public.offers_public;
