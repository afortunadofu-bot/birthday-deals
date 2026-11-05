-- =====================================================================
-- v178：分店營業時間＋「幾點有開」篩選
--
-- celine（11/5）：「掃各家的營業時間，篩選多一個可以選時間」。
-- 分店（offer_stores，v58）原本只有座標跟地址，沒有營業時間。
-- fetch_stores.py --hours 會順便抓 Google 的 regularOpeningHours，
-- 換算成「一週裡的第幾分鐘」區間存進來，前端選「現在有開」或「週六 19:00」
-- 的時候，問資料庫「哪幾筆優惠，在這個時間至少有一家分店開著」。
--
-- 設計重點：
-- - open_week：一週 10080 分鐘（週日 00:00＝0，跟 Google 的 day 編號一樣），
--   每段營業時間是一個 [開門, 打烊) 區間。跨午夜（22:00–02:00）的照樣是一段；
--   跨過週六→週日的拆成兩段。24 小時營業＝[0,10080)。
--   null＝沒有營業時間資料（還沒抓、或 Google 上沒寫）——跟「整週都沒開」分開，
--   篩選的時候這種優惠不算有開、也不算沒開，前端會說「N 筆查不到營業時間」。
-- - hours_text：Google 給的「星期一: 10:00 – 21:00」原文，給人核對用。
-- - 只算前台看得到的分店（not hidden），選了縣市就只看那幾個縣市的分店。
-- - 國定假日、店家臨時公休 Google 是另一個欄位（specialDays），這裡沒抓——
--   篩選結果是「平常的營業時間」，前端有寫。
--
-- 可重複執行。要先跑過 schema_v58_offer_stores.sql。
-- 跑完再貼 fetch_stores.py --hours 產生的 stores_import_*.sql。
-- =====================================================================

alter table public.offer_stores add column if not exists open_week int4range[];
alter table public.offer_stores add column if not exists hours_text text[];
alter table public.offer_stores add column if not exists hours_fetched_at timestamptz;

-- ---------------------------------------------------------------------
-- 在 p_mow（一週裡的第幾分鐘，台灣時間）這個時間點，每筆優惠有沒有分店開著。
-- 只回傳「至少一家分店有營業時間資料」的優惠：
--   is_open = true  → 至少一家開著
--   is_open = false → 有資料的分店全都沒開
-- 沒回傳的優惠＝查不到營業時間。
-- 回傳的量是「有分店的優惠數」（幾百列、每列兩個值），篩選的時候才會叫。
-- ---------------------------------------------------------------------
drop function if exists public.offers_open_at(int, text[]);
create or replace function public.offers_open_at(p_mow int, p_counties text[] default null)
returns table (offer_id bigint, is_open boolean)
language sql
stable
security invoker
set search_path = public
as $$
  select s.offer_id,
         bool_or(exists (
           select 1 from unnest(s.open_week) r
           where r @> greatest(0, least(10079, coalesce(p_mow, 0)))
         )) as is_open
  from public.offer_stores s
  where not s.hidden
    and s.open_week is not null
    and (p_counties is null or cardinality(p_counties) = 0 or s.county = any(p_counties))
  group by s.offer_id;
$$;

comment on function public.offers_open_at(int, text[]) is
  'v178：在一週裡的第 p_mow 分鐘（台灣時間，週日 00:00＝0），每筆優惠有沒有分店開著。只回傳有營業時間資料的優惠。';

grant execute on function public.offers_open_at(int, text[]) to anon, authenticated;

notify pgrst, 'reload schema';
