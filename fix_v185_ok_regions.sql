-- v185 收尾：Ok超商 的分店是全台都有，縣市直接設成「全台」
-- （Google 用「OKmart」才查得到，跑一次要掃全台、要花錢，所以先手動設）
update public.offers set regions = '{全台}'
 where id = 469 and brand = 'Ok超商' and regions = '{}';

-- 檢查：應該看到 Ok超商 → {全台}
select id, brand, regions from public.offers where id in (469, 532);
