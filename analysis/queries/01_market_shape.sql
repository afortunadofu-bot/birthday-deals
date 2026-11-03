-- Q1 這批生日優惠長什麼樣子？（報告開頭的幾個數字）
--
-- 一列就講完整體規模。寫法上刻意用 sum(case when ...) 而不是跑好幾個 count(*)，
-- 只掃一次 offers 就把所有比例算出來。
select
    count(*)                                               as n_offers,
    count(distinct brand)                                  as n_brands,
    count(distinct group_name)                             as n_groups,
    count(distinct category)                               as n_categories,
    sum(case when is_nationwide = 1 then 1 else 0 end)     as n_nationwide,
    sum(case when verified = 1 then 1 else 0 end)          as n_verified,
    sum(case when validity_type = 'rolling' then 1 else 0 end) as n_rolling,
    sum(case when membership_cost = 'free'
              and coalesce(advance_days, 999) = 0 then 1 else 0 end) as n_walk_in,
    count(value_twd)                                       as n_valued,
    sum(value_twd)                                         as total_value,
    max(value_twd)                                         as max_value,
    -- 中位數：SQLite 沒有 median()，用排序後取中間那一（兩）筆的平均。
    (select avg(value_twd) from (
        select value_twd,
               row_number() over (order by value_twd) as rn,
               count(*)     over ()                   as n
          from offers where value_twd is not null
     ) where rn in ((n + 1) / 2, (n + 2) / 2))             as median_value
from offers;
