-- Q2 哪一類的生日優惠最大方？
--
-- 用中位數而不是平均：139 筆裡有幾個上千元的（樂園套票、套餐組）會把平均拉歪。
-- SQLite 沒有 median()／percentile_cont()，所以自己用 window function 做：
-- 先在每個 category 裡排序編號，再取中間那一（兩）筆平均；四分位同理。
with valued as (
    select category, value_twd,
           row_number() over (partition by category order by value_twd) as rn,
           count(*)     over (partition by category)                    as n
      from offers
     where value_twd is not null
),
stat as (
    select category,
           n,
           avg(case when rn in ((n + 1) / 2, (n + 2) / 2) then value_twd end) as median_value,
           avg(case when rn = max(1, n / 4)              then value_twd end)  as q1_value,
           avg(case when rn = max(1, (n * 3 + 3) / 4)    then value_twd end)  as q3_value,
           min(value_twd) as min_value,
           max(value_twd) as max_value
      from valued
     group by category, n
),
-- 全體中位數，當作比較基準
overall as (
    select avg(value_twd) as median_all from (
        select value_twd,
               row_number() over (order by value_twd) as rn,
               count(*)     over ()                   as n
          from offers where value_twd is not null
    ) where rn in ((n + 1) / 2, (n + 2) / 2)
),
counted as (
    select category, count(*) as n_all from offers group by category
)
select s.category,
       c.n_all,
       s.n                             as n_valued,
       cast(s.median_value as integer) as median_value,
       cast(s.q1_value     as integer) as q1_value,
       cast(s.q3_value     as integer) as q3_value,
       s.min_value,
       s.max_value,
       round(s.median_value / o.median_all, 2) as vs_overall
  from stat s
  join counted c on c.category = s.category
 cross join overall o
 order by s.median_value desc;
