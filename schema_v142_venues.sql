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
-- celine 選了「商圈」而不是「一棟」，所以名字是**商圈名**，不是館名。
--
-- 為什麼：一格 160 公尺裡常常有好幾棟。「中山站・南京西路」那一格同時有
-- 誠品南西、新光三越南西、中山地下街、寶雅台北南西店——取其中任何一棟的名字
-- 都是錯的。**正式館名顯示在每一家店自己的名字上**（「誠品南西店」「新光三越
-- 南西店」），那本來就是對的，不用猜哪一棟到哪裡為止。
--
-- 註解裡是「幾家優惠｜裡面有哪些館」，方便你核對名字取得對不對。
--
-- ⚠️ **還是要看過一遍再上架。** 沒把握的我寫了「待確認」在名字裡。
-- ---------------------------------------------------------------------
insert into public.venues (name, county, lat, lng, radius_m)
select * from (values
  ('新竹巨城商圈', '新竹市', 24.80966, 120.97493, 180),  -- 31 家｜巨城、SOGO、誠品
  ('新店裕隆城', '新北市', 24.97806, 121.54654, 180),  -- 27 家｜裕隆城、誠品
  ('台中七期・臺灣大道', '台中市', 24.16497, 120.64356, 180),  -- 24 家｜新光三越、大遠百、遠百
  ('中和環球', '新北市', 25.00665, 121.4748, 180),  -- 23 家｜環球
  ('南崁台茂', '桃園市', 25.05337, 121.28826, 180),  -- 22 家｜台茂、誠品
  ('板橋車站・環球', '新北市', 25.01425, 121.46382, 180),  -- 22 家｜環球
  ('高雄漢神巨蛋', '高雄市', 22.66971, 120.30247, 180),  -- 21 家｜漢神巨蛋、漢神
  ('高雄夢時代', '高雄市', 22.59545, 120.30742, 180),  -- 20 家｜夢時代、統一時代
  ('宜蘭新月廣場', '宜蘭縣', 24.7541, 121.75065, 180),  -- 19 家｜新月廣場、誠品
  ('信義・松壽路', '台北市', 25.0348, 121.56607, 180),  -- 19 家｜微風、ATT 4 FUN、新光三越
  ('台北京站', '台北市', 25.04943, 121.51712, 180),  -- 18 家｜京站、新光三越
  ('信義・松仁路', '台北市', 25.0367, 121.56747, 180),  -- 18 家｜新光三越、遠百、ATT 4 FUN
  ('台中遠雄廣場', '台中市', 24.136, 120.68761, 180),  -- 17 家｜遠雄
  ('板橋大遠百', '新北市', 25.01374, 121.46691, 180),  -- 17 家｜大遠百、遠百
  ('中山站・南京西路', '台北市', 25.05273, 121.52087, 180),  -- 17 家｜誠品、新光三越
  ('新莊・新北大道', '新北市', 25.05963, 121.44953, 180),  -- 17 家｜（沒有明顯的館）
  ('南港・三井 LaLaport', '台北市', 25.05933, 121.61758, 180),  -- 17 家｜三井
  ('台南新光三越西門', '台南市', 22.98701, 120.19808, 180),  -- 17 家｜新光三越
  ('忠孝復興・SOGO', '台北市', 25.04209, 121.54495, 180),  -- 15 家｜SOGO
  ('高雄大順路', '高雄市', 22.6561, 120.30642, 180),  -- 15 家｜誠品
  ('高雄中安路（待確認）', '高雄市', 22.58239, 120.3297, 180),  -- 15 家｜（沒有明顯的館）
  ('天母・忠誠路', '台北市', 25.11187, 121.53149, 180),  -- 15 家｜（沒有明顯的館）
  ('高雄三多商圈', '高雄市', 22.6129, 120.30439, 180),  -- 15 家｜大遠百、遠百、SOGO
  ('大直美麗華', '台北市', 25.08321, 121.55714, 180),  -- 15 家｜美麗華、誠品
  ('樹林秀泰', '新北市', 24.99552, 121.42829, 180),  -- 14 家｜秀泰
  ('中壢 SOGO', '桃園市', 24.96275, 121.22379, 180),  -- 14 家｜SOGO
  ('信義・松高路', '台北市', 25.03964, 121.56561, 180),  -- 14 家｜統一時代、新光三越、微風
  ('嘉義忠孝路', '嘉義市', 23.49651, 120.45265, 180),  -- 14 家｜（沒有明顯的館）
  ('台中一中街・中友', '台中市', 24.15212, 120.68487, 180),  -- 14 家｜中友、誠品
  ('桃園經國路', '桃園市', 25.01588, 121.30499, 180),  -- 13 家｜家樂福
  ('永和中山路', '新北市', 25.00793, 121.50747, 180),  -- 13 家｜誠品
  ('南港・忠孝東路', '台北市', 25.05256, 121.60461, 180),  -- 13 家｜環球
  ('台北車站・微風', '台北市', 25.04684, 121.51753, 180),  -- 13 家｜誠品、新光三越、微風
  ('西門町', '台北市', 25.04403, 121.5074, 180),  -- 13 家｜誠品
  ('台中進德路', '台中市', 24.13577, 120.69253, 180),  -- 13 家｜三井
  ('台北站前・館前路', '台北市', 25.04564, 121.515, 180),  -- 13 家｜新光三越
  ('新店小碧潭・京站', '新北市', 24.97242, 121.5305, 180),  -- 12 家｜京站
  ('台北站前・南陽街', '台北市', 25.04567, 121.51661, 180),  -- 12 家｜誠品、新光三越
  ('士林・中正路', '台北市', 25.09489, 121.52566, 180),  -- 12 家｜（沒有明顯的館）
  ('台南南紡購物中心', '台南市', 22.99052, 120.23294, 180),  -- 12 家｜南紡、誠品
  ('桃園站前', '桃園市', 24.99104, 121.31247, 180),  -- 12 家｜遠百、新光三越
  ('台南三井 Outlet（歸仁）', '台南市', 22.92475, 120.28782, 180),  -- 12 家｜三井
  ('台中七期・大遠百', '台中市', 24.1637, 120.64462, 180),  -- 12 家｜新光三越、大遠百、遠百
  ('竹北遠百', '新竹縣', 24.82215, 121.02353, 180),  -- 12 家｜遠百、誠品
  ('桃園中正路', '桃園市', 24.99014, 121.31272, 180)   -- 11 家｜遠百、新光三越
) as t(name, county, lat, lng, radius_m)
where not exists (
  select 1 from public.venues v
   where 111000.0 * sqrt(power(v.lat - t.lat, 2)
         + power((v.lng - t.lng) * cos(radians(v.lat)), 2)) <= 200);


-- ---------------------------------------------------------------------
-- 5b. 如果你已經跑過這支的舊版（名字是館名那一版），照座標改成商圈名
--
-- 沒跑過舊版的話這段不會動到任何東西（上面的 insert 已經是新名字）。
-- 你自己改過的名字**不會被蓋掉**——只有名字還是舊的那幾筆才會改。
-- ---------------------------------------------------------------------
with want(lat, lng, name) as (values
  (24.80966, 120.97493, '新竹巨城商圈'),
  (24.97806, 121.54654, '新店裕隆城'),
  (24.16497, 120.64356, '台中七期・臺灣大道'),
  (25.00665, 121.4748, '中和環球'),
  (25.05337, 121.28826, '南崁台茂'),
  (25.01425, 121.46382, '板橋車站・環球'),
  (22.66971, 120.30247, '高雄漢神巨蛋'),
  (22.59545, 120.30742, '高雄夢時代'),
  (24.7541, 121.75065, '宜蘭新月廣場'),
  (25.0348, 121.56607, '信義・松壽路'),
  (25.04943, 121.51712, '台北京站'),
  (25.0367, 121.56747, '信義・松仁路'),
  (24.136, 120.68761, '台中遠雄廣場'),
  (25.01374, 121.46691, '板橋大遠百'),
  (25.05273, 121.52087, '中山站・南京西路'),
  (25.05963, 121.44953, '新莊・新北大道'),
  (25.05933, 121.61758, '南港・三井 LaLaport'),
  (22.98701, 120.19808, '台南新光三越西門'),
  (25.04209, 121.54495, '忠孝復興・SOGO'),
  (22.6561, 120.30642, '高雄大順路'),
  (22.58239, 120.3297, '高雄中安路（待確認）'),
  (25.11187, 121.53149, '天母・忠誠路'),
  (22.6129, 120.30439, '高雄三多商圈'),
  (25.08321, 121.55714, '大直美麗華'),
  (24.99552, 121.42829, '樹林秀泰'),
  (24.96275, 121.22379, '中壢 SOGO'),
  (25.03964, 121.56561, '信義・松高路'),
  (23.49651, 120.45265, '嘉義忠孝路'),
  (24.15212, 120.68487, '台中一中街・中友'),
  (25.01588, 121.30499, '桃園經國路'),
  (25.00793, 121.50747, '永和中山路'),
  (25.05256, 121.60461, '南港・忠孝東路'),
  (25.04684, 121.51753, '台北車站・微風'),
  (25.04403, 121.5074, '西門町'),
  (24.13577, 120.69253, '台中進德路'),
  (25.04564, 121.515, '台北站前・館前路'),
  (24.97242, 121.5305, '新店小碧潭・京站'),
  (25.04567, 121.51661, '台北站前・南陽街'),
  (25.09489, 121.52566, '士林・中正路'),
  (22.99052, 120.23294, '台南南紡購物中心'),
  (24.99104, 121.31247, '桃園站前'),
  (22.92475, 120.28782, '台南三井 Outlet（歸仁）'),
  (24.1637, 120.64462, '台中七期・大遠百'),
  (24.82215, 121.02353, '竹北遠百'),
  (24.99014, 121.31272, '桃園中正路')
)
update public.venues v
   set name = w.name
  from want w
 where 111000.0 * sqrt(power(v.lat - w.lat, 2)
       + power((v.lng - w.lng) * cos(radians(v.lat)), 2)) <= 60
   and v.name <> w.name
   and v.is_public = false;      -- 已經上架的不要動，那是你確認過的


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
