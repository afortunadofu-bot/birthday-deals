-- =====================================================================
-- 這份不是要執行的 migration，是要你在 Supabase SQL Editor 貼上去「執行」，
-- 然後把「結果」複製貼回來給我——因為觀眾投稿的優惠只存在正式資料庫，
-- 我這邊沒有直接連線權限看不到，offers.json 只有一開始爬蟲/種子的資料。
--
-- 這段會列出：submitted_by 不是空的（代表是真人投稿，不是爬蟲/seed 匯入）
-- 而且地區有標「全台」的優惠，我可以拿這份清單繼續查。
-- =====================================================================
select id, brand, status, timing, offer, created_at
from public.offers
where submitted_by is not null
  and '全台' = any(regions)
order by created_at desc;
