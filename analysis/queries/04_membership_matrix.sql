-- Q4 要先變成誰的會員，才換得到什麼？
--
-- 兩個分類交叉：入會方式（Ocard／品牌 APP／LINE／不用會員…）× 優惠型態
-- （免費無低消／免費有低消／買一送一／折扣）。SQLite 沒有 pivot，
-- 用 sum(case when ...) 把列轉成欄，最後一欄是這一種入會方式的優惠面額中位數。
with labelled as (
    select case membership_type
             when 'none'  then '不用會員'
             when 'app'   then '品牌 APP'
             when 'line'  then 'LINE 官方帳號'
             when 'ocard' then 'Ocard 第三方集點'
             when 'brand' then '品牌自家會員'
             when 'card'  then '指定信用卡'
             when 'tier'  then '要升到指定會員等級'
             else coalesce(membership_type, '未標註')
           end as access,
           membership_type,
           free_tier,
           value_twd,
           coalesce(advance_days, 999) as advance_days
      from offers
),
med as (  -- 每種入會方式的面額中位數
    select membership_type,
           avg(case when rn in ((n + 1) / 2, (n + 2) / 2) then value_twd end) as median_value
      from (
        select membership_type, value_twd,
               row_number() over (partition by membership_type order by value_twd) as rn,
               count(*)     over (partition by membership_type)                    as n
          from labelled where value_twd is not null
      ) group by membership_type
)
select l.access,
       count(*) as n_offers,
       sum(case when l.free_tier = 'free_no_min' then 1 else 0 end) as free_no_min,
       sum(case when l.free_tier = 'free_min'    then 1 else 0 end) as free_with_min,
       sum(case when l.free_tier = 'bogo'        then 1 else 0 end) as bogo,
       sum(case when l.free_tier = 'discount'    then 1 else 0 end) as discount,
       sum(case when l.advance_days = 0          then 1 else 0 end) as same_day_ok,
       cast(m.median_value as integer) as median_value
  from labelled l
  left join med m on m.membership_type = l.membership_type
 group by l.access, m.median_value
 order by n_offers desc;
