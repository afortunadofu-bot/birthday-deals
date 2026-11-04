-- Q10 做得多的類別，跟大家想要的類別，是同一批嗎？（需求面，要 --live 才有資料）
--
-- offer_demand 來自線上公開 view：每筆優惠有多少人回報用過、成功率、留言數、
-- 被收藏幾次。全部是每筆優惠的彙總，沒有個人層級的紀錄。
--
-- 這一題要回答的是選題問題：如果某一類「收藏很多、優惠很少」，
-- 那就是下一批該去談的品牌；反過來「優惠很多、沒人收藏」的，是白做工。
-- 兩邊都用占比（share）比，才不會被「餐廳本來就比較多」這件事蓋過去。
with per_cat as (
    select o.category,
           count(*)                                   as n_offers,
           coalesce(sum(d.wish_count), 0)             as wishes,
           coalesce(sum(d.report_count), 0)           as reports,
           coalesce(sum(d.comment_count), 0)          as comments,
           avg(d.success_rate)                        as avg_success
      from offers o
      left join offer_demand d on d.offer_id = o.id
     group by o.category
),
shared as (
    select *,
           round(100.0 * n_offers / sum(n_offers) over (), 1) as supply_share,
           round(100.0 * wishes   / nullif(sum(wishes) over (), 0), 1) as wish_share,
           round(100.0 * reports  / nullif(sum(reports) over (), 0), 1) as report_share
      from per_cat
)
select category,
       n_offers,
       supply_share,
       wishes,
       wish_share,
       reports,
       report_share,
       cast(avg_success as integer) as avg_success_rate,
       -- 正的＝想要的人比供給多（該補貨），負的＝供給比想要的多
       round(wish_share - supply_share, 1) as gap
  from shared
 order by gap desc nulls last, n_offers desc;
