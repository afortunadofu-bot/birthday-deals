-- =====================================================================
-- v142：「一趟用最多」的資料庫層
--
-- celine：
--   「多一區寫說**去哪裡可以一次使用到最多店家**之類的，微風、精湛、中友百貨
--     之類的。用過的人可以寫，官方也可以給幾個，類似形成推薦的東西，
--     然後可以**一鍵加入收藏**」
--   「一趟用最多希望可以有**留言區及按愛心**功能」
--   「新光三越這種的可以標店名，什麼**新光三越南西店**之類的」
--
-- **這一支只做資料庫，前端是下一版。** 可重複執行。
--
-- ---------------------------------------------------------------------
-- 為什麼不用等使用者投稿
-- ---------------------------------------------------------------------
-- offer_stores 已經有 11,473 家分店的座標。把地圖切成約 160 公尺見方的格子、
-- 數每一格裡有幾個**不同的優惠**，前幾名就是：
--
--   新竹巨城 31、新店裕隆城 27、新光三越台中中港 24、中和環球 23、
--   台茂 22、環球板橋 22、漢神巨蛋 21、高雄夢時代 20、宜蘭新月 19、
--   ATT 4 FUN 19、京站 18、新光三越信義A11 18、新光三越南西 17、中友百貨 14…
--
-- 所以「官方推薦」直接從資料長出來，使用者投稿是加分、不是前提。
--
-- 留言跟愛心照 offers 那一套現成的做法（comments / comment_likes 同一個形狀），
-- 不另外發明寫法。
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 四張表
-- ---------------------------------------------------------------------
create table if not exists public.venues (
  id         bigserial primary key,
  name       text not null check (char_length(name) between 2 and 40),
  county     text,
  lat        double precision not null,
  lng        double precision not null,
  radius_m   integer not null default 180 check (radius_m between 50 and 1500),
  note       text check (note is null or char_length(note) <= 300),
  -- 預設**不公開**：名字是系統猜的，確認過才上架
  is_public  boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists venues_public_idx on public.venues(is_public, county);

-- 留言（跟 public.comments 同一個形狀）
create table if not exists public.venue_comments (
  id         bigserial primary key,
  venue_id   bigint not null references public.venues(id) on delete cascade,
  user_id    uuid   not null references public.profiles(id) on delete cascade,
  body       text   not null check (char_length(body) between 1 and 800),
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists venue_comments_idx on public.venue_comments(venue_id, created_at desc);

-- 愛心：一種按在場館本身（「這個地方值得跑一趟」），一種按在留言上
create table if not exists public.venue_likes (
  venue_id   bigint not null references public.venues(id) on delete cascade,
  user_id    uuid   not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (venue_id, user_id)
);
create table if not exists public.venue_comment_likes (
  comment_id bigint not null references public.venue_comments(id) on delete cascade,
  user_id    uuid   not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);


-- ---------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------
alter table public.venues              enable row level security;
alter table public.venue_comments      enable row level security;
alter table public.venue_likes         enable row level security;
alter table public.venue_comment_likes enable row level security;

drop policy if exists venues_read  on public.venues;
drop policy if exists venues_admin on public.venues;
-- 公開的誰都看得到；還沒公開的只有管理員看得到（那是還沒確認名字的草稿）
create policy venues_read  on public.venues
  for select using (is_public or public.is_admin());
create policy venues_admin on public.venues
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists venue_comments_read   on public.venue_comments;
drop policy if exists venue_comments_insert on public.venue_comments;
drop policy if exists venue_comments_own    on public.venue_comments;
drop policy if exists venue_comments_admin  on public.venue_comments;
create policy venue_comments_read on public.venue_comments
  for select using ((not is_hidden) or user_id = auth.uid() or public.is_admin());
create policy venue_comments_insert on public.venue_comments
  for insert with check (user_id = auth.uid() and not public.is_banned());
create policy venue_comments_own on public.venue_comments
  for delete using (user_id = auth.uid());
create policy venue_comments_admin on public.venue_comments
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists venue_likes_read  on public.venue_likes;
drop policy if exists venue_likes_write on public.venue_likes;
create policy venue_likes_read  on public.venue_likes for select using (true);
create policy venue_likes_write on public.venue_likes for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and not public.is_banned());

drop policy if exists venue_comment_likes_read  on public.venue_comment_likes;
drop policy if exists venue_comment_likes_write on public.venue_comment_likes;
create policy venue_comment_likes_read  on public.venue_comment_likes for select using (true);
create policy venue_comment_likes_write on public.venue_comment_likes for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and not public.is_banned());

grant select                 on public.venues              to anon, authenticated;
grant select                 on public.venue_comments      to anon, authenticated;
grant insert, delete         on public.venue_comments      to authenticated;
grant select                 on public.venue_likes         to anon, authenticated;
grant insert, delete         on public.venue_likes         to authenticated;
grant select                 on public.venue_comment_likes to anon, authenticated;
grant insert, delete         on public.venue_comment_likes to authenticated;
grant usage on sequence public.venue_comments_id_seq to authenticated;


-- ---------------------------------------------------------------------
-- 3. 一個場館裡有哪幾筆優惠
--
-- **不存成表**：分店資料每季會重抓，存起來就會過期。用座標當場算——
-- 先用經緯度方框粗篩（走得到索引），再用真正的距離篩一次。
-- ---------------------------------------------------------------------
create or replace function public.venue_offer_ids(p_venue_id bigint)
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select distinct s.offer_id
    from public.venues v
    join public.offer_stores s
      on not s.hidden and s.lat is not null
     -- 粗篩：緯度 1 度約 111 km，經度在台灣約 101 km
     and s.lat between v.lat - v.radius_m / 111000.0 and v.lat + v.radius_m / 111000.0
     and s.lng between v.lng - v.radius_m / 101000.0 and v.lng + v.radius_m / 101000.0
    join public.offers o
      on o.id = s.offer_id and o.status = 'approved'
   where v.id = p_venue_id
     -- 細篩：真正的距離
     and 111000.0 * sqrt(power(s.lat - v.lat, 2)
                       + power((s.lng - v.lng) * cos(radians(v.lat)), 2)) <= v.radius_m;
$$;

-- 公開清單：名字、縣市、幾家優惠、幾顆愛心、幾則留言
create or replace view public.venues_public
with (security_invoker = true) as
select v.id, v.name, v.county, v.lat, v.lng, v.radius_m, v.note,
       (select count(*) from public.venue_offer_ids(v.id))                 as offer_count,
       (select count(*) from public.venue_likes l    where l.venue_id = v.id) as like_count,
       (select count(*) from public.venue_comments c
         where c.venue_id = v.id and not c.is_hidden)                      as comment_count
  from public.venues v
 where v.is_public;

grant select on public.venues_public to anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. 找熱點（只有管理員）
--
-- 這一支**不會自己新增任何東西**，只是列出「這裡好像可以開一個場館」。
-- 名字要自己取——系統取的會把四個縣市的「新光三越」混在一起。
-- 已經建過場館的（200 公尺內）不會再列。
-- ---------------------------------------------------------------------
create or replace function public.admin_venue_candidates(p_min_offers integer default 8)
returns table (offers bigint, county text, lat double precision, lng double precision,
               sample_names text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '只有管理員可以看';
  end if;
  return query
  with g as (
    select count(distinct s.offer_id)                      as n,
           avg(s.lat)                                      as clat,
           avg(s.lng)                                      as clng,
           mode() within group (order by s.county)         as cty,
           string_agg(distinct s.name, '、')                as nm
      from public.offer_stores s
      join public.offers o on o.id = s.offer_id and o.status = 'approved'
     where not s.hidden and s.lat is not null
     group by round(s.lat / 0.0015), round(s.lng / 0.0015)
    having count(distinct s.offer_id) >= p_min_offers
  )
  select g.n, g.cty,
         round(g.clat::numeric, 5)::double precision,
         round(g.clng::numeric, 5)::double precision,
         left(g.nm, 160)
    from g
   where not exists (
     select 1 from public.venues v
      where 111000.0 * sqrt(power(v.lat - g.clat, 2)
            + power((v.lng - g.clng) * cos(radians(v.lat)), 2)) <= 200)
   order by g.n desc;
end $$;

revoke execute on function public.admin_venue_candidates(integer) from public, anon;
grant  execute on function public.admin_venue_candidates(integer) to authenticated;


-- ---------------------------------------------------------------------
-- 5. 先放 45 個場館的草稿（is_public = false）
--
-- 名字是從分店名稱裡撈出來的，照要求帶了分店名：
-- 「新光三越南西」「新光三越信義A11」「SOGO忠孝」「環球板橋」「中友百貨」。
--
-- ⚠️ **還是要看過一遍再上架。** 幾個我沒把握的已經寫在名字裡（「待確認」），
--    「誠品」「大遠百」這種有好幾家的最容易猜錯。
-- ---------------------------------------------------------------------
insert into public.venues (name, county, lat, lng, radius_m)
select * from (values
  ('新竹巨城', '新竹市', 24.80966, 120.97493, 180),                 -- 約 31 家優惠
  ('新店裕隆城', '新北市', 24.97806, 121.54654, 180),               -- 約 27 家
  ('新光三越台中中港', '台中市', 24.16497, 120.64356, 180),         -- 約 24 家
  ('中和環球購物中心', '新北市', 25.00665, 121.4748, 180),          -- 約 23 家
  ('台茂購物中心', '桃園市', 25.05337, 121.28826, 180),             -- 約 22 家
  ('環球板橋', '新北市', 25.01425, 121.46382, 180),                 -- 約 22 家
  ('漢神巨蛋', '高雄市', 22.66971, 120.30247, 180),                 -- 約 21 家
  ('高雄夢時代', '高雄市', 22.59545, 120.30742, 180),               -- 約 20 家
  ('宜蘭新月廣場', '宜蘭縣', 24.7541, 121.75065, 180),              -- 約 19 家
  ('ATT 4 FUN', '台北市', 25.0348, 121.56607, 180),                 -- 約 19 家
  ('京站時尚廣場', '台北市', 25.04943, 121.51712, 180),             -- 約 18 家
  ('新光三越信義A11', '台北市', 25.0367, 121.56747, 180),           -- 約 18 家
  ('台中遠雄廣場', '台中市', 24.136, 120.68761, 180),               -- 約 17 家
  ('新北大遠百', '新北市', 25.01374, 121.46691, 180),               -- 約 17 家
  ('新光三越南西', '台北市', 25.05273, 121.52087, 180),             -- 約 17 家
  ('南港車站周邊', '台北市', 25.05933, 121.61758, 180),             -- 約 17 家
  ('新光三越台南西門', '台南市', 22.98701, 120.19808, 180),         -- 約 17 家
  ('SOGO忠孝', '台北市', 25.04209, 121.54495, 180),                 -- 約 15 家
  ('高雄誠品（待確認）', '高雄市', 22.6561, 120.30642, 180),        -- 約 15 家
  ('高雄大遠百', '高雄市', 22.6129, 120.30439, 180),                -- 約 15 家
  ('大直美麗華', '台北市', 25.08321, 121.55714, 180),               -- 約 15 家
  ('秀泰樹林', '新北市', 24.99552, 121.42829, 180),                 -- 約 14 家
  ('SOGO中壢', '桃園市', 24.96275, 121.22379, 180),                 -- 約 14 家
  ('信義誠品（待確認）', '台北市', 25.03964, 121.56561, 180),       -- 約 14 家
  ('中友百貨', '台中市', 24.15212, 120.68487, 180),                 -- 約 14 家
  ('家樂福經國', '桃園市', 25.01588, 121.30499, 180),               -- 約 13 家
  ('新北誠品（待確認）', '新北市', 25.00793, 121.50747, 180),       -- 約 13 家
  ('南港車站', '台北市', 25.05256, 121.60461, 180),                 -- 約 13 家
  ('台北車站誠品地下街', '台北市', 25.04684, 121.51753, 180),       -- 約 13 家
  ('新光三越台北站前', '台北市', 25.04564, 121.515, 180),           -- 約 13 家
  ('京站小碧潭', '新北市', 24.97242, 121.5305, 180),                -- 約 12 家
  ('誠品忠孝', '台北市', 25.04567, 121.51661, 180),                 -- 約 12 家
  ('台南南紡購物中心', '台南市', 22.99052, 120.23294, 180),         -- 約 12 家
  ('台南（待確認）', '台南市', 22.92475, 120.28782, 180),           -- 約 12 家
  ('台中大遠百', '台中市', 24.1637, 120.64462, 180),                -- 約 12 家
  ('新竹遠百', '新竹縣', 24.82215, 121.02353, 180),                 -- 約 12 家
  ('新光三越桃園站前', '桃園市', 24.99014, 121.31272, 180),         -- 約 11 家
  ('環球左營', '高雄市', 22.68739, 120.30725, 180),                 -- 約 11 家
  ('京站', '台北市', 25.04884, 121.51784, 180),                     -- 約 11 家
  ('微風台北車站', '台北市', 25.04764, 121.51685, 180),             -- 約 11 家
  ('遠百中山', '新北市', 25.01097, 121.46423, 180),                 -- 約 11 家
  ('誠品西門', '台北市', 25.04403, 121.50598, 180),                 -- 約 11 家
  ('微風南京', '台北市', 25.05202, 121.54827, 180),                 -- 約 11 家
  ('桃園大江購物中心', '桃園市', 25.00166, 121.22853, 180),         -- 約 10 家
  ('新北遠雄（待確認）', '新北市', 25.06229, 121.64961, 180)        -- 約 10 家
) as t(name, county, lat, lng, radius_m)
where not exists (
  select 1 from public.venues v
   where 111000.0 * sqrt(power(v.lat - t.lat, 2)
         + power((v.lng - t.lng) * cos(radians(v.lat)), 2)) <= 200);


-- ---------------------------------------------------------------------
-- 跑完：看草稿長怎樣
--
-- 「幾家優惠」是現算的，所以可以直接拿來檢查名字對不對：
-- 新竹巨城應該要有三十幾家，如果只有兩三家就是座標或半徑不對。
-- ---------------------------------------------------------------------
select id, name, county, is_public,
       (select count(*) from public.venue_offer_ids(venues.id)) as 幾家優惠
  from public.venues
 order by 幾家優惠 desc;

-- 名字對了就上架。可以一次全開：
-- update public.venues set is_public = true;
-- 或一筆一筆：
-- update public.venues set name = '新的名字', is_public = true where id = 幾號;

-- 之後想再找新的熱點（前端還沒做，先用這支看）：
-- select * from public.admin_venue_candidates(8);


-- =====================================================================
-- 6. 新功能公告（⚠️ 等前端上線了再跑）
--
-- celine：「維持兩周都會有通知宣布有新功能」。
-- 公告本來就是 duration_days 預設 14 天，剛好兩週，不用做新東西。
--
-- **前端還沒做，現在跑的話會公告一個點不到的功能。** 等下一版上線再解開。
-- =====================================================================
-- insert into public.announcements (title, body, duration_days) values (
--   '新功能：一趟用最多',
--   '新增「一趟用最多」——哪些百貨、商場一次就能用到最多家生日優惠，' ||
--   '新竹巨城三十幾家、新店裕隆城二十幾家。可以一鍵整館加進待辦清單，' ||
--   '也可以留言跟按愛心，告訴大家哪一家真的好用。',
--   14);
