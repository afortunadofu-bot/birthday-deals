-- =====================================================================
-- v28：「全台」品牌分店查核 — 第 7 批（8 個品牌，種子資料）
-- 查核依據：
--   丰禾          王品集團旗下，全台4家分店：台北市/台中市(3)
--   享鴨          王品集團旗下，全台7家分店：台北/新北/桃園/台中/新竹
--   和牛涮        王品集團旗下：台北/新北/台中/台南/高雄
--   再睡5分鐘     近期北市已歇業數家分店，信心度較低：台北/新北/台中/高雄
--   大師兄銷魂麵舖  台北/新北/桃園/台中/台南皆有分店
--   茶聚 CHAGE    台北(3)/新北(7)/桃園(4)/台中/宜蘭(1)
--   莫凡彼 Mövenpick 台北/新北(永和)/台中/台南/高雄
--   築間幸福鍋物   官網列出適用縣市，全台45家分店，橫跨15個縣市
-- （老子鍋這次查到的資訊跟同名不同店的「荖子鍋」混在一起，信心度不足，
--   暫不調整，之後再查）
-- 可重複執行。
-- =====================================================================

update public.offers set regions='{台北市,台中市}',
  region_note='王品集團旗下，全台4家分店'
  where brand='丰禾' and regions=array['全台'];

update public.offers set
  regions='{台北市,新北市,桃園市,台中市,新竹市}',
  region_note='王品集團旗下，全台7家分店'
  where brand='享鴨' and regions=array['全台'];

update public.offers set
  regions='{台北市,新北市,台中市,台南市,高雄市}',
  region_note='王品集團旗下'
  where brand='和牛涮' and regions=array['全台'];

update public.offers set regions='{台北市,新北市,台中市,高雄市}',
  region_note='近期有數家分店歇業，信心度較低，建議之後再核實'
  where brand='再睡5分鐘' and regions=array['全台'];

update public.offers set
  regions='{台北市,新北市,桃園市,台中市,台南市}', region_note=''
  where brand='大師兄銷魂麵舖' and regions=array['全台'];

update public.offers set regions='{台北市,新北市,桃園市,台中市,宜蘭縣}', region_note=''
  where brand='茶聚' and regions=array['全台'];

update public.offers set
  regions='{台北市,新北市,台中市,台南市,高雄市}', region_note=''
  where brand='莫凡彼 Mövenpick' and regions=array['全台'];

update public.offers set
  regions='{台北市,新北市,基隆市,宜蘭縣,新竹市,桃園市,苗栗縣,台中市,彰化縣,雲林縣,南投縣,嘉義市,台南市,高雄市,屏東縣}',
  region_note='官網列出適用縣市，全台45家分店'
  where brand='築間幸福鍋物' and regions=array['全台'];
