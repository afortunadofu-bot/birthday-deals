-- Q9 哪幾筆已經不能用了？（資料維運清單）
--
-- validity_type = 'fixed' 的優惠是限期檔期，有 valid_from／valid_until；
-- rolling 是每年都有的常態優惠。對一個會被壽星拿去用的網站來說，
-- 「檔期過了還留在頁面上」比「少收錄一筆」嚴重，所以這一題直接產出要處理的清單：
-- 過期、快到期（14 天內）、還沒開始、以及沒寫迄日的 fixed（等於沒辦法自動下架）。
select brand,
       category,
       valid_from,
       valid_until,
       value_twd,
       best_source_tier,
       verified,
       case
         when valid_until is null                             then '沒寫迄日'
         when julianday(valid_until) <  julianday('now')      then '已過期'
         when julianday(valid_from)  >  julianday('now')      then '還沒開始'
         when julianday(valid_until) <= julianday('now') + 14 then '14 天內到期'
         else '進行中'
       end                                                     as status,
       cast(julianday(valid_until) - julianday('now') as integer) as days_left,
       cast(julianday('now') - julianday(last_checked) as integer) as days_since_check
  from offers
 where validity_type = 'fixed'
 order by case
            when valid_until is null                        then 1
            when julianday(valid_until) < julianday('now')  then 0
            else 2
          end,
          valid_until;
