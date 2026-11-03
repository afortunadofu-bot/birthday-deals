-- Q5 這些優惠是誰說的？多久沒複查了？
--
-- 每筆優惠可以有多個來源，tier 越小越可信：1 品牌官方／2 新聞媒體／3 部落格懶人包／4 社群貼文。
-- best_source_tier 是其中最可信的那一個。這一題問的是資料治理，不是優惠本身：
-- 「最好的來源只是部落格」的優惠佔多少、這些優惠是不是反而面額開得特別大、
-- 以及距離上次複查過了幾天（julianday 相減）。
with t as (
    select case best_source_tier
             when 1 then '1 品牌官方'
             when 2 then '2 新聞媒體'
             when 3 then '3 部落格懶人包'
             when 4 then '4 社群貼文'
             else '未標註'
           end                                   as tier_label,
           coalesce(best_source_tier, 9)         as tier,
           verified,
           value_twd,
           cast(julianday('now') - julianday(last_checked) as integer) as days_since_check,
           (select count(*) from offer_sources s where s.offer_id = offers.id) as n_sources
      from offers
)
select tier_label,
       count(*)                                                as n_offers,
       round(100.0 * count(*) / sum(count(*)) over (), 1)       as pct,
       sum(verified)                                           as n_verified,
       round(100.0 * sum(verified) / count(*), 0)               as verified_pct,
       cast(avg(value_twd) as integer)                          as avg_value,
       round(avg(n_sources), 1)                                as avg_sources,
       max(days_since_check)                                   as days_since_check
  from t
 group by tier_label, tier
 order by tier;
