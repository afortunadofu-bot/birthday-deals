-- Q3 生日當天才想到要用，還來得及嗎？
--
-- advance_days = 這個優惠要求提前幾天完成入會／預約。0 表示當天辦當天用，
-- null 表示品牌沒明訂（對壽星來說等於「不保證」，所以單獨一欄，不混進 0）。
-- 重點是累積比例：用 sum() over (order by ...) 把「N 天前就要辦好」的優惠累加起來，
-- 才看得出「生日前一天才查，還剩多少可以用」。
with bucketed as (
    select case
             when advance_days is null then '未明訂'
             when advance_days = 0     then '當天辦就能用'
             when advance_days <= 7    then '要提前 1–7 天'
             when advance_days <= 30   then '要提前 8–30 天'
             else '要提前 30 天以上'
           end as bucket,
           case
             when advance_days is null then 9
             when advance_days = 0     then 0
             when advance_days <= 7    then 1
             when advance_days <= 30   then 2
             else 3
           end as sort_key,
           value_twd
      from offers
),
agg as (
    select bucket, sort_key,
           count(*)                      as n_offers,
           cast(avg(value_twd) as integer) as avg_value
      from bucketed
     group by bucket, sort_key
)
select bucket,
       n_offers,
       avg_value,
       round(100.0 * n_offers / sum(n_offers) over (), 1) as pct,
       -- 依門檻由鬆到緊累加：到這一列為止「拿得到」的優惠有幾筆
       sum(case when sort_key < 9 then n_offers else 0 end)
           over (order by sort_key rows between unbounded preceding and current row)
                                                          as cum_reachable
  from agg
 order by sort_key;
