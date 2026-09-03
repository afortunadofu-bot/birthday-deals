-- =====================================================================
-- v26：「全台」品牌分店查核 — 第 5 批（18 個品牌，種子資料）
-- 查核依據：
--   8% ice        目前僅台北市、台南市有分店
--   Cafe!N        台北/台中/高雄，新竹門市已歇業
--   MAGIC TOUCH   爭鮮集團旗下，橫跨北北桃竹竹中彰嘉南高屏
--   PAUL          法式麵包，台北(2)/新北(林口)/新竹市/台中市
--   Popeyes       2024年剛引進，目前僅台北市4家分店，尚未拓展中南部
--   TGI FRIDAYS   13家分店：台北(5)/新北(1)/桃園(3)/台中(2)/台南(1)/高雄(1)
--   TSUJIRI 辻利茶舖  目前僅台北遠百信義店一家實體門市
--   beard papa's  遍及台北/新北/桃園/新竹/台中/台南/高雄
--   gonna EAT     台北市多家 + 新竹縣竹北 + 桃園市中壢
--   一幻拉麵 ICHIGEN 台北信義店 + 高雄鼓山店，共2家
--   莆田          王品集團旗下，台北/桃園/台中/高雄，共約4家
--   京都勝牛      8家分店：台北/新北/新竹/台中/台南/高雄
--   品田牧場      超過30家分店，橫跨15個縣市（雙北/桃竹苗/中彰投雲嘉/南高屏/宜蘭/台東）
--   燒肉 LIKE     5家分店：台北/新北/新竹/台中/高雄
--   涓豆腐 DUBU HOUSE 約19家分店：雙北/桃園/新竹/苗栗/台中/台南/宜蘭/高雄
--   玉豆腐        目前分店都集中在高雄
--   粥大福 CONGEE BOSS 官網另列宜花東、高屏分類但確切分店未查到，信心度較低，
--                 已確認：雙北/基隆/桃園/台中
--   聚 北海道昆布鍋  橫跨14個縣市：雙北/桃竹苗竹/中/雲嘉南/高屏/宜蘭/台東
-- （老子鍋這次查不到足夠可信的分店資訊，暫時維持「全台」不變，之後再查）
-- 可重複執行。
-- =====================================================================

update public.offers set regions='{台北市,台南市}', region_note=''
  where brand='8% ice' and regions=array['全台'];

update public.offers set regions='{台北市,台中市,高雄市}',
  region_note='已知新竹門市已歇業'
  where brand='Cafe!N' and regions=array['全台'];

update public.offers set
  regions='{台北市,新北市,桃園市,新竹市,新竹縣,台中市,彰化縣,嘉義市,台南市,高雄市,屏東縣}',
  region_note='爭鮮集團旗下品牌'
  where brand='MAGIC TOUCH' and regions=array['全台'];

update public.offers set regions='{台北市,新北市,新竹市,台中市}', region_note=''
  where brand='PAUL' and regions=array['全台'];

update public.offers set regions='{台北市}',
  region_note='2024年才引進台灣，目前僅台北市有分店，尚未拓展至台中、台南、高雄'
  where brand='Popeyes' and regions=array['全台'];

update public.offers set
  regions='{台北市,新北市,桃園市,台中市,台南市,高雄市}', region_note=''
  where brand='TGI FRIDAYS' and regions=array['全台'];

update public.offers set regions='{台北市}',
  region_note='目前台灣僅台北遠百信義店一家實體門市'
  where brand='TSUJIRI 辻利茶舖' and regions=array['全台'];

update public.offers set
  regions='{台北市,新北市,桃園市,新竹市,台中市,台南市,高雄市}', region_note=''
  where brand='beard papa''s' and regions=array['全台'];

update public.offers set regions='{台北市,新竹縣,桃園市}', region_note=''
  where brand='gonna EAT' and regions=array['全台'];

update public.offers set regions='{台北市,高雄市}', region_note=''
  where brand='一幻拉麵 ICHIGEN' and regions=array['全台'];

update public.offers set regions='{台北市,桃園市,台中市,高雄市}',
  region_note='王品集團旗下，全台約4家分店'
  where brand='莆田' and regions=array['全台'];

update public.offers set
  regions='{台北市,新北市,新竹市,台中市,台南市,高雄市}', region_note=''
  where brand='京都勝牛' and regions=array['全台'];

update public.offers set
  regions='{台北市,新北市,桃園市,新竹市,新竹縣,苗栗縣,台中市,彰化縣,雲林縣,嘉義市,台南市,高雄市,屏東縣,宜蘭縣,台東縣}',
  region_note=''
  where brand='品田牧場' and regions=array['全台'];

update public.offers set regions='{台北市,新北市,新竹市,台中市,高雄市}', region_note=''
  where brand='燒肉 LIKE' and regions=array['全台'];

update public.offers set
  regions='{台北市,新北市,桃園市,新竹市,苗栗縣,台中市,台南市,宜蘭縣,高雄市}',
  region_note=''
  where brand='涓豆腐 DUBU HOUSE' and regions=array['全台'];

update public.offers set regions='{高雄市}',
  region_note='目前分店都集中在高雄'
  where brand='玉豆腐' and regions=array['全台'];

update public.offers set regions='{台北市,新北市,基隆市,桃園市,台中市}',
  region_note='官網另列宜花東及高屏地區分類，但確切分店地址未查到，信心度較低，建議之後再核實'
  where brand='粥大福 CONGEE BOSS' and regions=array['全台'];

update public.offers set
  regions='{台北市,新北市,桃園市,新竹市,新竹縣,苗栗縣,台中市,雲林縣,嘉義市,台南市,高雄市,屏東縣,宜蘭縣,台東縣}',
  region_note=''
  where brand='聚 北海道昆布鍋' and regions=array['全台'];
