-- Q8 把品牌按門市數分成四組，面額差多少？順便用純 SQL 算相關係數。
--
-- ntile(4) 把品牌依門市數切四等份，再比每一組的面額中位數。
-- 最後兩欄是 Pearson 相關係數，直接在 SQL 裡展開公式算：
--   r = (n·Σxy − Σx·Σy) / √(n·Σx² − (Σx)²) · √(n·Σy² − (Σy)²)
-- x 取 log10(門市數)：門市數從個位數到上千家，不取對數的話幾家超大連鎖會主導整個係數。
-- 四組的值相同（同一個母數算出來的），放在每一列只是方便一起讀。
with bv as (
    select o.brand, o.value_twd as y, f.n_stores,
           log10(f.n_stores) as x,
           ntile(4) over (order by f.n_stores) as q
      from offers o
      join v_brand_footprint f on f.brand = o.brand
     where o.value_twd is not null
),
med as (
    select q,
           avg(case when rn in ((n + 1) / 2, (n + 2) / 2) then y end) as median_value
      from (select q, y,
                   row_number() over (partition by q order by y) as rn,
                   count(*)     over (partition by q)            as n
              from bv)
     group by q
),
corr as (
    select count(*) as n, sum(x) as sx, sum(y) as sy,
           sum(x * y) as sxy, sum(x * x) as sxx, sum(y * y) as syy
      from bv
)
select bv.q                                                as store_quartile,
       count(*)                                            as n_brands,
       min(bv.n_stores)                                    as min_stores,
       max(bv.n_stores)                                    as max_stores,
       cast(med.median_value as integer)                   as median_value,
       cast(avg(bv.y) as integer)                          as avg_value,
       round((corr.n * corr.sxy - corr.sx * corr.sy) /
             (sqrt(corr.n * corr.sxx - corr.sx * corr.sx) *
              sqrt(corr.n * corr.syy - corr.sy * corr.sy)), 3) as pearson_r,
       corr.n                                              as corr_n
  from bv
  join med  on med.q = bv.q
 cross join corr
 group by bv.q, med.median_value, corr.n, corr.sx, corr.sy, corr.sxy, corr.sxx, corr.syy
 order by bv.q;
