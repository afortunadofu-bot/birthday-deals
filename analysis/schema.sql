-- 壽星日資料分析｜分析用資料庫 schema
--
-- 這是「分析庫」，不是線上那個 Postgres（線上 schema 在 ../schema.sql）。
-- 線上庫是為了寫入與權限設計的，分析庫是為了查詢設計的：
--   * 來源的 JSON 陣列（regions、sources）在這裡攤成子表，才能 join 跟 group by
--   * 原文欄位（offer、conditions）留著備查，但分析只用編碼過的欄位
--   * 門市只保留彙總用得到的欄位，原始 Places 回應不進這個庫（見 README 的資料界線）
--
-- 每次 build_db.py 都整庫重建，所以這裡直接 drop。

drop table if exists offers;
drop table if exists offer_regions;
drop table if exists offer_sources;
drop table if exists stores;
drop table if exists store_counts;
drop table if exists counties;
drop table if exists offer_demand;

-- 一筆優惠 = 一個品牌在一個年度提供的生日方案。
create table offers (
    id                  text primary key,
    brand               text    not null,
    group_name          text,            -- 母集團（三商、王品…），null = 獨立品牌
    category            text    not null, -- 速食／餐廳／火鍋燒肉／飲料／甜點烘焙／零售美妝／娛樂樂園
    offer_text          text    not null, -- 優惠原文，備查用
    conditions          text,             -- 低消、訂位等條件原文
    validity            text,             -- 券的使用期限原文

    -- 取得門檻（編碼欄位）
    membership_type     text,             -- none／app／line／ocard／brand（品牌自家會員）／card／tier
    membership_cost     text,             -- free／spend（要先消費）／tier（要升等）
    advance_days        integer,          -- 需提前幾天入會；0 = 當天辦當天用；null = 沒明訂
    advance_note        text,

    -- 優惠內容（編碼欄位）
    free_tier           text,             -- free_no_min 免費無低消／free_min 免費有低消／bogo 買一送一／discount 折扣
    value_twd           integer,          -- 估算面額（新台幣），null = 無法估
    timing              text,             -- 當日／當月／當週／當月＋當日／前後N天

    -- 檔期
    validity_type       text    not null, -- rolling 每年常態／fixed 限期檔期
    valid_from          text,             -- ISO 日期，rolling 為 null
    valid_until         text,

    -- 資料治理
    verified            integer not null,  -- 0／1，是否人工複查過
    last_checked        text,              -- ISO 日期
    best_source_tier    integer,           -- 1 品牌官方／2 新聞媒體／3 部落格懶人包／4 社群貼文
    best_source_url     text,
    is_nationwide       integer not null,  -- 1 = regions 含「全台」
    has_region_data     integer not null   -- 0 = regions 是空的（門市分布未確認）
);

-- 優惠 × 明確列出的縣市。is_nationwide = 1 的優惠不展開在這裡，
-- 要算「某縣市有幾個優惠」請用下面的 v_offer_county。
create table offer_regions (
    offer_id text not null references offers(id),
    county   text not null,
    primary key (offer_id, county)
);

-- 一筆優惠可以有多個來源，tier 越小越可信。
create table offer_sources (
    offer_id   text    not null references offers(id),
    url        text    not null,
    title      text,
    tier       integer not null,
    tier_label text,
    checked    text,
    primary key (offer_id, url)
);

-- 門市明細：只有本機跑得出來（原始 Places 快取不進 git），所以查詢不靠這張表。
create table stores (
    place_id        text not null,
    brand           text not null,
    name            text,
    county          text,
    lat             real,
    lng             real,
    business_status text,
    primary key (brand, place_id)
);

-- 門市彙總：這張才是查詢用的，由 data/store_counts.csv 還原，可以進 git。
create table store_counts (
    brand     text    not null,
    county    text    not null,
    n_stores  integer not null,
    primary key (brand, county)
);

-- 每筆優惠的「需求面」彙總：有多少人回報用過、成功率、留言數、被收藏幾次。
-- 只有 --live（跟線上公開 view 要資料）才會有東西；吃快照的時候是空的。
-- 這裡全部是每筆優惠的彙總數字，沒有任何個人層級的紀錄。
create table offer_demand (
    offer_id     text primary key references offers(id),
    report_count integer,   -- 回報「我用過了」的次數
    success_rate real,      -- 回報成功的百分比
    comment_count integer,
    last_used_on text,      -- 最後一次被回報使用的日期
    wish_count   integer    -- 被加進願望清單的次數
);

-- 22 個縣市（含金門、連江），order_no 用來固定圖表上的順序：由北到南、本島到離島。
create table counties (
    name     text primary key,
    area     text not null,   -- 北部／中部／南部／東部／離島
    order_no integer not null
);

create index idx_offers_category on offers(category);
create index idx_offers_value on offers(value_twd);
create index idx_regions_county on offer_regions(county);
create index idx_sources_tier on offer_sources(tier);
create index idx_store_counts_county on store_counts(county);

-- 「這個縣市的壽星實際上有幾個優惠可以用」
-- = 明確寫了這個縣市的 + 全台連鎖的。via 欄位留著，方便區分「本地品牌」跟「連鎖」。
drop view if exists v_offer_county;
create view v_offer_county as
    select o.id as offer_id, r.county, 'region' as via
      from offers o join offer_regions r on r.offer_id = o.id
     where o.is_nationwide = 0
    union all
    select o.id as offer_id, c.name as county, 'nationwide' as via
      from offers o join counties c
     where o.is_nationwide = 1;

-- 品牌的門市規模：幾家店、跨幾個縣市。
drop view if exists v_brand_footprint;
create view v_brand_footprint as
    select brand,
           sum(n_stores)  as n_stores,
           count(*)       as n_counties
      from store_counts
     group by brand;
