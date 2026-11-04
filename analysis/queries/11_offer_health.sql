-- Q11 哪幾筆優惠「寫得好看但用不到」？（需求面，要 --live 才有資料）
--
-- 使用者回報「我用過了」的時候會標成功或失敗，offer_stats 把它算成 success_rate。
-- 成功率低又有一定回報量的，就是資料錯了或品牌悄悄改規則——這是維運清單，
-- 不是分析結論，所以排序照「要先處理哪一筆」來排：回報越多、成功率越低的排越前面。
--
-- 回報數太少的不要下結論：1 個人回報失敗不代表什麼，所以用 having 擋掉。
select o.brand,
       o.category,
       o.value_twd,
       d.report_count,
       cast(d.success_rate as integer) as success_rate,
       d.comment_count,
       d.wish_count,
       d.last_used_on,
       o.best_source_tier,
       o.verified,
       cast(julianday('now') - julianday(d.last_used_on) as integer) as days_since_used,
       -- 要先處理誰：回報多、成功率低、而且還有人在收藏的
       round((100 - coalesce(d.success_rate, 100)) * d.report_count / 100.0, 1) as failed_est
  from offers o
  join offer_demand d on d.offer_id = o.id
 where coalesce(d.report_count, 0) >= 3
 group by o.id
having coalesce(d.success_rate, 100) < 80
 order by failed_est desc, d.report_count desc;
