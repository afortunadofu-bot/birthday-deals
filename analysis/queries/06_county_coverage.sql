-- Q6 住在哪裡，生日優惠差多少？
--
-- v_offer_county 把兩種來源併起來：明確標了這個縣市的優惠，加上「全台」連鎖。
-- 這一題的重點是 window function 當分母：max(n_offers) over () 一次拿到全國最高的那個
-- 縣市，每一列就能直接算「跟最好的縣市差幾倍」，不用再開子查詢。
with per_county as (
    select c.name, c.area, c.order_no,
           (select count(*) from v_offer_county v where v.county = c.name)                      as n_offers,
           (select count(*) from v_offer_county v where v.county = c.name and v.via = 'region') as n_local,
           coalesce((select sum(n_stores) from store_counts s where s.county = c.name), 0)      as n_stores,
           coalesce((select count(distinct brand) from store_counts s where s.county = c.name), 0) as n_brands_with_store
      from counties c
)
select name                                                   as county,
       area,
       n_offers,
       n_local,                                               -- 其中是「限定這個縣市」的
       n_offers - n_local                                     as n_chain,  -- 其中是全台連鎖的
       n_stores,
       n_brands_with_store,
       rank() over (order by n_offers desc)                   as rk,
       round(100.0 * n_offers / (select count(*) from offers), 0) as pct_of_all,
       round(1.0 * max(n_offers) over () / nullif(n_offers, 0), 1) as gap_to_best,
       order_no
  from per_county
 order by n_offers desc, order_no;
