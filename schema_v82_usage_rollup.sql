-- =====================================================================
-- v82：省下金額的走勢圖「最近幾天都是 0」——因為前端根本沒拿到那幾天的資料
--
--   celine：「省下金額感覺都不對，沒更新到」。截圖上近 30 天的走勢在 9/23 之後
--   直接貼著 0，「近 6 個月」的 10 月是 $0。
--
--   查過資料庫，資料是在的：
--     usage_reports 共 2133 筆，近 180 天 2109 筆
--     10 月（依 used_on）217 筆、省下 27,383；最新一筆是今天
--
--   真正的原因是**前端拿不到全部**。洞察分析那幾張圖是前端自己撈原始回報再加總：
--
--     sb.from('usage_reports').select('offer_id,used_on,saved_twd,result')
--       .gte('used_on', trendSince).limit(8000)
--
--   但 PostgREST 有 max-rows 上限（這個專案是 1000），`limit(8000)` 根本沒用，
--   回來的永遠只有 1000 筆；而且**沒有 order by**，PostgREST 就照資料表的實體
--   順序給（實測回來的第一筆是 id 1239，第二筆是 id 3——連插入順序都不是）。
--   等於隨機抓了一半的回報去畫圖，最近幾天剛好沒被抓到，看起來就是「掉到 0」。
--
--   「被使用過的店家數」那支 `.limit(5000)` 也中同一個坑。
--
--   解法：**不要把原始列撈到瀏覽器再加總**，改成在資料庫算好彙總再回傳。
--   順便省掉一大包流量（2000 筆原始列 → 180 筆彙總）。
--
--   可重複執行。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 每天的使用狀況（近 N 天）
--    走勢圖（近 30 天）跟「近 6 個月每月」兩張圖都用這一份。
--    最多 180 列，不會再撞到 1000 筆上限。
--    usage_reports 本來就是公開可讀（排行榜、熱門優惠都靠它），
--    所以這裡用一般的 security invoker 就好，不需要 definer。
-- ---------------------------------------------------------------------
create or replace function public.site_usage_daily(p_days integer default 180)
returns table(
  d             date,
  uses          integer,
  success_uses  integer,
  saved         integer
)
language sql
stable
set search_path = public
as $$
  select r.used_on,
         count(*)::integer                                            as uses,
         count(*) filter (where r.result = 'success')::integer         as success_uses,
         coalesce(sum(r.saved_twd) filter (where r.result = 'success'), 0)::integer as saved
  from public.usage_reports r
  where r.used_on >= current_date - (greatest(least(coalesce(p_days, 180), 400), 1) - 1)
  group by r.used_on
  order by r.used_on;
$$;

grant execute on function public.site_usage_daily(integer) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. 每一筆優惠在近 N 天的使用狀況
--    「最近使用最多次」（可以切 7／30／90／180 天）跟站台數據的
--    「被使用過的店家數」都用這一份。一筆優惠一列，最多就是站上的優惠數。
-- ---------------------------------------------------------------------
create or replace function public.site_offer_usage(p_days integer default 30)
returns table(
  offer_id      bigint,
  report_count  integer,
  success_count integer,
  saved_total   integer,
  last_used_on  date
)
language sql
stable
set search_path = public
as $$
  select r.offer_id,
         count(*)::integer                                            as report_count,
         count(*) filter (where r.result = 'success')::integer         as success_count,
         coalesce(sum(r.saved_twd) filter (where r.result = 'success'), 0)::integer as saved_total,
         max(r.used_on)                                               as last_used_on
  from public.usage_reports r
  where r.used_on >= current_date - (greatest(least(coalesce(p_days, 30), 400), 1) - 1)
  group by r.offer_id
  order by count(*) desc;
$$;

grant execute on function public.site_offer_usage(integer) to anon, authenticated;

-- 兩支都是照 used_on 篩選，usage_offer_idx 是 (offer_id, used_on desc)，
-- 補一支純 used_on 的索引讓日期範圍掃得動。
create index if not exists usage_used_on_idx on public.usage_reports(used_on);

-- ---------------------------------------------------------------------
-- 對照用：跑完之後這兩個數字應該要跟畫面上的圖對得起來
-- ---------------------------------------------------------------------
-- select sum(saved) from public.site_usage_daily(30);     -- 近 30 天省下總額
-- select count(*)   from public.site_offer_usage(365);    -- 近一年被用過的優惠數
