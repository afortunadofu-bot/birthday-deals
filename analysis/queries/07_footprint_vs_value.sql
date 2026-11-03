-- Q7 店開得多的品牌，生日優惠是不是比較小？（品牌層級的散佈資料）
--
-- 直覺上連鎖越大、單客成本壓得越低，生日禮應該越薄。這一題先把每個品牌的
-- 門市數跟優惠面額配成一組點，下一題（08）再算分位平均跟相關係數。
-- 門市數來自 store_counts（彙總），所以只有對得上的品牌會出現。
select o.brand,
       o.category,
       o.value_twd,
       f.n_stores,
       f.n_counties,
       o.free_tier,
       o.is_nationwide,
       ntile(4) over (order by f.n_stores) as store_quartile,
       -- 同類別裡的面額排名，拿來標出每一類最大方的那一家
       rank() over (partition by o.category order by o.value_twd desc) as rank_in_category
  from offers o
  join v_brand_footprint f on f.brand = o.brand
 where o.value_twd is not null
 order by f.n_stores desc;
