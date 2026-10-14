-- =====================================================================
-- v110：照 Google 地圖上實際找到的分店，補上「適用縣市」空白的優惠
--
-- 使用者（金信宇）回報「我點擊篩選『花蓮縣』時，底下篩選出的建議店家有很多都不是
-- 花蓮店家」。查下去是兩件事：
--
--   1. 標「全台」的連鎖本來就會一起列出來（標題有寫「含全台」）。v109 已經多一顆
--      「只看有標這個縣市的（不含全台）」，勾起來花蓮 75 筆 → 22 筆。
--   2. 線上還有 67 筆優惠的「適用縣市」整個是空的——任何縣市篩選都找不到它們，
--      「📍 附近」也不會出現。等於躺在站上但沒什麼人看得到。
--
-- 而 offer_stores 裡其實已經有每一家分店的地址跟縣市（fetch_stores.py 從 Google
-- Places 抓的），只是從來沒有人把它寫回 offers.regions——例如「多那之」有 70 家
-- 分店、橫跨 13 個縣市，regions 卻是空的。這一支就是把那一步補上。
--
-- 做成函式而不是一次性的 update：分店每季會重抓一次，新投稿的優惠也會陸續補分店，
-- 每次抓完都可以再跑一次。只會動「空白」的那幾筆，已經填過的（包含手動填「全台」的）
-- 一律不動。可重複執行。
--
-- 搭配 fetch_stores.py --fill-regions 使用（它會全台一次查完、照每一家店的地址回推
-- 縣市，不用逐縣市掃 22 次）：
--
--   1. 先貼這一支（定義函式，順手把「已經有分店、但縣市空白」的那幾筆補上）
--   2. $env:GOOGLE_MAPS_API_KEY="你的金鑰"; python fetch_stores.py --fill-regions
--   3. 人工看一遍 region_fill_report.md（比對到別家店就會多一個不該有的縣市）
--   4. stores_import_regions_*.sql 依序全部貼完，最後一個檔會自動再呼叫這裡的函式
-- =====================================================================

create or replace function public.fill_offer_regions_from_stores()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  -- 跟前端 COUNTIES 同一個順序（北→中→南→東→離島），不是字母序；
  -- 優惠詳情頁的「適用縣市」會照這個順序列出來。
  -- 不在這張清單裡的縣市會被忽略（寧可少一個，也不要寫進一個前端篩選不認得的值）。
  county_order text[] := array[
    '基隆市', '台北市', '新北市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '台中市',
    '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '台南市', '高雄市', '屏東縣',
    '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣'];
begin
  with ord as (
    select c, i from unnest(county_order) with ordinality as t(c, i)
  ), found as (
    select s.offer_id, array_agg(ord.c order by ord.i) as regions
      from (select distinct offer_id, county
              from public.offer_stores
             where not hidden and county is not null) s
      join ord on ord.c = s.county
     group by s.offer_id
  )
  update public.offers o
     set regions = f.regions
    from found f
   where o.id = f.offer_id
     and o.status = 'approved'
     and coalesce(array_length(o.regions, 1), 0) = 0;   -- 只補空白的
  get diagnostics n = row_count;
  return n;
end $$;

comment on function public.fill_offer_regions_from_stores() is
  '把「適用縣市」空白的優惠，照 offer_stores 裡實際找到的分店縣市補上。可重複執行，不會動已經填過的。';

-- 這是批次改資料，只給 SQL Editor／後端腳本跑，前端不該呼叫
revoke execute on function public.fill_offer_regions_from_stores() from public, anon, authenticated;

do $$
begin
  raise notice '照分店補上適用縣市：% 筆', public.fill_offer_regions_from_stores();
end $$;

-- 跑完剩下這些還是空白的（代表還沒抓過分店，或是純線上優惠本來就沒有實體店）。
-- store_count 是 0 的就去跑 fetch_stores.py --fill-regions；跑完還是 0 的，
-- 到 store_search_aliases.json 設別名，或確認它是純線上優惠、手動填「全台」。
select o.id, o.brand, o.category,
       count(s.id) filter (where not s.hidden) as store_count
  from public.offers o
  left join public.offer_stores s on s.offer_id = o.id
 where o.status = 'approved'
   and coalesce(array_length(o.regions, 1), 0) = 0
 group by o.id, o.brand, o.category
 order by store_count desc, o.id;
