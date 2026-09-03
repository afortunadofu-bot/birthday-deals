-- v49：「大家都在用什麼」「最多人收藏」也能看到最近排名升降
-- ---------------------------------------------------------------------
-- 嵐的回饋：這兩個排行榜也想要跟省錢/貢獻度排行榜一樣，看得出最近排名
-- 是上升還是下降。
--
-- 這兩張榜本身沒有「本月/本週」這種分期概念可以直接比對：
--   - popular_offers 是「近一年使用回報次數」排行，沒有依月份/週份分開的
--     版本；
--   - most_wished 是「目前」的收藏數排行，收藏這件事本身沒有「這個月的
--     收藏數」這種概念（收進待辦清單後不會過期，只有現在收了沒收）。
-- 沒辦法比照 leaderboard_monthly/weekly 那樣拿「上個月」跟「這個月」比。
--
-- 改用「跟 7 天前比」：兩張表本來就有 created_at（usage_reports 的回報
-- 建立時間／wishlist 的收藏建立時間），用這個當切點，算出「如果只算 7
-- 天前以前就存在的資料，名次會是多少」，再跟現在的名次一比，就能看出
-- 最近這 7 天有沒有竄升或下滑——概念上跟 git blame 找「這行是什麼時候
-- 加的」是同一種「拿時間切一刀、比較前後差異」的做法。
--
-- most_wished_prev 比照 wishlist_counts 的既有做法（見 schema_v13_ratings.
-- sql 的註解）：不加 security_invoker，讓它以擁有者身分執行、繞過
-- wishlist 的 RLS 才算得出全站數字；只回傳 offer_id 與數量，不含
-- user_id，不會洩漏「誰收藏了什麼」。
--
-- popular_offers_prev 沿用 popular_offers 本身的做法：usage_reports 本來
-- 就對所有人開放讀取（讓大家都能看公開統計），加 security_invoker 就好，
-- 不用比照 most_wished_prev 額外繞過 RLS。
--
-- 可重複執行。
-- ---------------------------------------------------------------------

create or replace view public.popular_offers_prev
with (security_invoker = true) as
select
  o.id as offer_id,
  count(r.id) as report_count
from public.offers o
join public.usage_reports r on r.offer_id = o.id
where o.status = 'approved'
  and r.used_on >= current_date - interval '365 days'
  and r.created_at <= now() - interval '7 days'
group by o.id
order by report_count desc
limit 50;

grant select on public.popular_offers_prev to anon, authenticated;

create or replace view public.most_wished_prev as
select w.offer_id, count(*)::int as wish_count
from public.wishlist w
join public.offers o on o.id = w.offer_id
where o.status = 'approved'
  and w.created_at <= now() - interval '7 days'
group by w.offer_id
order by wish_count desc;

grant select on public.most_wished_prev to anon, authenticated;
