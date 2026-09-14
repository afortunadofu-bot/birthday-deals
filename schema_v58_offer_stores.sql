-- =====================================================================
-- v58：分店位置（附近有優惠的店、依距離排序、地圖）
--
-- 為什麼要改：
-- 使用者回饋一直出現同一件事——
--   Z（9/9）：「離自己距離最近的分店，像是我人如果在北車，就從北車方圓距離來列表由近到遠」
--   王（9/6）：「新增地圖功能，讓我知道附近有哪些可以換，e.g. 人在101裡面有哪些店有優惠」
--   Cindy（9/13）：「推薦可以加一個篩選的指標——地理距離」
-- 資料庫原本只有「適用縣市」（offers.regions），沒有任何分店地址或座標，
-- 縣市精度回答不了「北車附近」這種問題。celine 決定用 Google Places API 當分店
-- 資料來源：fetch_stores.py 抓完產生 stores_import.sql，貼進來匯入這張表。
--
-- 設計重點：
-- - 一筆優惠對多家分店（offer_id + place_id 唯一），重跑匯入是 upsert
-- - hidden：Google 上查不到了、或管理員判定抓錯的分店不刪除，只隱藏，
--   重跑匯入也不會把管理員隱藏的分店又打開
-- - 距離在資料庫算（nearest_offer_stores），不把全台幾千家分店都下載到手機上。
--   沒有用 PostGIS（Supabase 要另外開 extension），先用經緯度外框篩掉遠的
--   分店、再用 haversine 算實際距離，幾千筆資料量完全夠用
-- - 使用者的座標只當 RPC 參數拿來算距離，不寫進任何資料表
--
-- 可重複執行。
-- =====================================================================

create table if not exists public.offer_stores (
  id               bigserial primary key,
  offer_id         bigint not null references public.offers(id) on delete cascade,
  place_id         text not null,
  name             text not null,
  address          text,
  county           text,
  lat              double precision not null check (lat between -90 and 90),
  lng              double precision not null check (lng between -180 and 180),
  business_status  text,
  source           text not null default 'google_places',
  hidden           boolean not null default false,
  fetched_at       timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (offer_id, place_id)
);

create index if not exists offer_stores_offer_idx on public.offer_stores (offer_id);
create index if not exists offer_stores_lat_lng_idx on public.offer_stores (lat, lng) where not hidden;

alter table public.offer_stores enable row level security;

-- 分店位置跟優惠內容一樣是公開資訊，誰都能讀；隱藏的只有管理員看得到
drop policy if exists "offer_stores public read" on public.offer_stores;
create policy "offer_stores public read" on public.offer_stores
  for select using (not hidden or public.is_admin());

drop policy if exists "offer_stores admin write" on public.offer_stores;
create policy "offer_stores admin write" on public.offer_stores
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.offer_stores to anon, authenticated;
grant insert, update, delete on public.offer_stores to authenticated;

-- ---------------------------------------------------------------------
-- 每筆優惠「離我最近的一家分店」＋方圓內共有幾家。
-- 只回傳在 p_km 公里內有分店的優惠；前端用它排序、篩選、在卡片上寫「最近 350m」。
-- p_km 夾在 0.1～300 公里之間，避免有人傳超大半徑把整張表掃一遍。
-- ---------------------------------------------------------------------
drop function if exists public.nearest_offer_stores(double precision, double precision, double precision);
create or replace function public.nearest_offer_stores(
  p_lat double precision,
  p_lng double precision,
  p_km  double precision default 50
)
returns table (
  offer_id       bigint,
  store_id       bigint,
  place_id       text,
  name           text,
  address        text,
  lat            double precision,
  lng            double precision,
  distance_m     double precision,
  stores_within  integer
)
language sql
stable
set search_path = public
as $$
  with params as (
    select greatest(least(coalesce(p_km, 50), 300), 0.1) as km
  ),
  cand as (
    select s.id, s.offer_id, s.place_id, s.name, s.address, s.lat, s.lng,
      2 * 6371000 * asin(least(1, sqrt(
        power(sin(radians(s.lat - p_lat) / 2), 2)
        + cos(radians(p_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lng - p_lng) / 2), 2)
      ))) as d
    from params p, public.offer_stores s
    join public.offers o on o.id = s.offer_id and o.status = 'approved'
    where p_lat is not null and p_lng is not null
      and not s.hidden
      and s.lat between p_lat - p.km / 111.0 and p_lat + p.km / 111.0
      and s.lng between p_lng - p.km / (111.0 * greatest(cos(radians(p_lat)), 0.01))
                    and p_lng + p.km / (111.0 * greatest(cos(radians(p_lat)), 0.01))
  ),
  within as (
    select c.*, count(*) over (partition by c.offer_id) as n
    from cand c, params p
    where c.d <= p.km * 1000
  )
  select distinct on (w.offer_id)
    w.offer_id, w.id, w.place_id, w.name, w.address, w.lat, w.lng, w.d, w.n::integer
  from within w
  order by w.offer_id, w.d;
$$;

grant execute on function public.nearest_offer_stores(double precision, double precision, double precision)
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- 地圖目前畫面範圍內的分店（地圖拖動／縮放時呼叫）。上限 1000 筆，
-- 縮到全台灣的大小時前端會提示「放大一點才會顯示分店」而不是一次丟幾千個點。
-- ---------------------------------------------------------------------
drop function if exists public.offer_stores_in_bounds(double precision, double precision, double precision, double precision, integer);
create or replace function public.offer_stores_in_bounds(
  p_south double precision,
  p_west  double precision,
  p_north double precision,
  p_east  double precision,
  p_limit integer default 500
)
returns table (
  store_id  bigint,
  offer_id  bigint,
  place_id  text,
  name      text,
  address   text,
  lat       double precision,
  lng       double precision
)
language sql
stable
set search_path = public
as $$
  select s.id, s.offer_id, s.place_id, s.name, s.address, s.lat, s.lng
  from public.offer_stores s
  join public.offers o on o.id = s.offer_id and o.status = 'approved'
  where not s.hidden
    and s.lat between p_south and p_north
    and s.lng between p_west and p_east
  order by s.id
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

grant execute on function public.offer_stores_in_bounds(double precision, double precision, double precision, double precision, integer)
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- 管理員看覆蓋率用：哪些優惠一家分店都沒有（可能是店名跟 Google 對不上，
-- 要去 store_search_aliases.json 設別名；或是純線上優惠，不需要分店）
-- ---------------------------------------------------------------------
create or replace view public.offer_store_coverage
with (security_invoker = true) as
select o.id as offer_id, o.brand, o.regions,
  count(s.id) filter (where not s.hidden) as store_count,
  max(s.fetched_at) as last_fetched_at
from public.offers o
left join public.offer_stores s on s.offer_id = o.id
where o.status = 'approved'
group by o.id, o.brand, o.regions;

grant select on public.offer_store_coverage to authenticated;
