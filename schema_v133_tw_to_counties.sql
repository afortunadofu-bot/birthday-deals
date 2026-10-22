-- =====================================================================
-- v133：標「全台」但其實沒有那麼全台的，改成實際有分店的縣市
--
-- 使用者金信宇 2026-10-01 回報：「我點擊篩選『花蓮縣』時，底下篩選出的建議
-- 店家有很多都不是花蓮店家」。
--
-- v110 處理的是一半（regions 整個空白的 67 筆 → 14 筆）。這一支是另一半：
-- **標「全台」的優惠會在每一個縣市都出現**。篩花蓮現在會看到 85 筆——真的含
-- 花蓮的 25 筆，加上標「全台」的 60 筆，而那 60 筆裡有 9 個連鎖在花蓮一家都沒有
-- （小北百貨、天仁茗茶、GU、丹堤咖啡…）。
--
-- ⚠️ 這一支跟 v110 不一樣：v110 只補空白的，純粹是多給；**這一支會把範圍改小**。
--    爬蟲漏掉的分店，會害那個縣市的人看不到一筆本來有的優惠。
--    所以：**先跑【預覽】看過表，再跑【執行】。** 兩段是分開的。
--
-- 門檻（預設十家分店、五個縣市）的理由：到這個規模還整個縣市沒爬到，比較可能
-- 是真的沒有。只有兩三家分店的，可能只是爬蟲沒爬到，不要動——那一組請看
-- region_tw_report.md 的 B 組，自己判斷。
--
-- 可重複執行。分店每季重抓之後可以再跑一次。
-- =====================================================================

create or replace function public.narrow_tw_offer_regions(
  p_min_stores   integer default 10,
  p_min_counties integer default 5,
  p_dry_run      boolean default true)
returns table (
  id        bigint,
  brand     text,
  stores    bigint,
  before    text[],
  after     text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 跟前端 COUNTIES 同一個順序，也跟 v110 用同一份。
  -- 注意是「台」不是「臺」——offer_stores 裡存的、前端篩選用的都是「台」。
  county_order text[] := array[
    '基隆市', '台北市', '新北市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '台中市',
    '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '台南市', '高雄市', '屏東縣',
    '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣'];
begin
  return query
  with ord as (
    select c, i from unnest(county_order) with ordinality as t(c, i)
  ), per_offer as (
    select s.offer_id,
           count(*)                            as store_n,
           count(distinct s.county)            as county_n,
           array_agg(distinct ord.c)           as raw_counties
      from public.offer_stores s
      join ord on ord.c = s.county
     where not s.hidden and s.county is not null
     group by s.offer_id
  ), sorted as (
    select p.offer_id, p.store_n, p.county_n,
           (select array_agg(ord.c order by ord.i)
              from ord where ord.c = any(p.raw_counties)) as new_regions
      from per_offer p
  ), target as (
    select o.id, o.brand, s.store_n, o.regions as old_regions, s.new_regions
      from public.offers o
      join sorted s on s.offer_id = o.id
     where o.status = 'approved'
       and '全台' = any(o.regions)              -- 只動標了「全台」的
       and s.store_n  >= p_min_stores
       and s.county_n >= p_min_counties
       and o.regions is distinct from s.new_regions
  ), done as (
    update public.offers o
       set regions = t.new_regions
      from target t
     where o.id = t.id
       and not p_dry_run
    returning o.id
  )
  select t.id, t.brand, t.store_n, t.old_regions, t.new_regions
    from target t
   where p_dry_run or exists (select 1 from done d where d.id = t.id)
   order by t.store_n desc;
end $$;

comment on function public.narrow_tw_offer_regions(integer, integer, boolean) is
  '把標「全台」、但實際分店資料顯示只在部分縣市的優惠，改成實際縣市。預設只預覽不改。';

-- 批次改資料，只給 SQL Editor 跑
revoke execute on function public.narrow_tw_offer_regions(integer, integer, boolean)
  from public, anon, authenticated;


-- =====================================================================
-- 【預覽】先跑這一段。不會改任何東西。
--
-- 看「after」那一欄：那就是改完之後這筆優惠會出現在哪些縣市的篩選裡。
-- 對照 region_tw_report.md 一起看。覺得某一筆不對，就先別跑下面的【執行】，
-- 或把門檻調高（例如 20, 8）。
-- =====================================================================
select brand, stores, after
  from public.narrow_tw_offer_regions(10, 5, true)
 order by stores desc;


-- =====================================================================
-- 【執行】⚠️ 看過預覽再跑。把下面這一行的註解解開。
-- =====================================================================
-- select brand, stores, after from public.narrow_tw_offer_regions(10, 5, false);


-- =====================================================================
-- 【還原】某一筆改錯了，單獨放回「全台」
-- =====================================================================
-- update public.offers set regions = array['全台'] where id = 這裡填 id;


-- ---------------------------------------------------------------------
-- 跑完確認：篩「花蓮縣」會看到幾筆
-- ---------------------------------------------------------------------
select count(*) filter (where '花蓮縣' = any(regions)) as 真的有花蓮,
       count(*) filter (where '全台'   = any(regions)) as 還標著全台,
       count(*) filter (where '花蓮縣' = any(regions) or '全台' = any(regions))
         as 篩花蓮會看到
  from public.offers
 where status = 'approved';
