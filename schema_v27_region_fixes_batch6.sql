-- =====================================================================
-- v27：「全台」品牌分店查核 — 第 6 批（15 個品牌，種子資料）
-- 查核依據：
--   泰滾 Rolling Thai  4家分店：台北南京/桃園/台中崇德/台中朝富
--   漢來美食           集團旗下已確認的餐廳所在縣市：高雄/台北/桃園/台中/台南
--   肉次方             王品集團旗下，10家分店：台北(2)/新北(1)/台中(2)/台南(1)
--   薄多義 BoDeGi      11家分店：宜蘭/雙北/桃園/新竹縣/台中/台南(2)/高雄(2)
--   萬客什鍋           台中起家5家 + 雙北3家
--   蔬鍋藝             林口/鶯歌/龜山/彰化，共4家
--   金咕               王品集團2023年新品牌，目前僅台北西門一家
--   雞湯大叔           多家分店：台北/新北永和/台中/桃園
--   鮮五丼             三商旗下，主要在北部，南部僅高雄鳳山一家
--   SUNMERRY 聖瑪莉    約40家門市，集中大台北及新竹地區
--   夏慕尼             王品集團旗下，14家分店：雙北/桃園/新竹/台中/台南/高雄
--   御前上茶           台北/新北/桃園/台中/台南/高雄皆有分店
--   巧福PLUS           三商巧福升級版，目前全台僅台北松江、新店建國2家
--   本格燒肉           築間集團旗下，新北/台中/台南/高雄，宜蘭爾本店已歇業
--   森森燒肉           桃園/新竹竹北/台中/高雄，近10家分店
-- （橡木桶洋酒查到34家門市遍佈北中南，養鍋、肉多多、拿坡里、定食8
--   查到的規模與分布都夠廣，維持「全台」不變；老子鍋這次查不到足夠
--   可信資訊，暫不調整）
-- 可重複執行。
-- =====================================================================

update public.offers set regions='{台北市,桃園市,台中市}', region_note=''
  where brand='泰滾 Rolling Thai' and regions=array['全台'];

update public.offers set regions='{高雄市,台北市,桃園市,台中市,台南市}',
  region_note='漢來美食集團旗下品牌，已確認的餐廳所在縣市'
  where brand='漢來美食' and regions=array['全台'];

update public.offers set regions='{台北市,新北市,台中市,台南市}', region_note=''
  where brand='肉次方' and regions=array['全台'];

update public.offers set
  regions='{宜蘭縣,台北市,新北市,桃園市,新竹縣,台中市,台南市,高雄市}', region_note=''
  where brand='薄多義 BoDeGi' and regions=array['全台'];

update public.offers set regions='{台中市,台北市,新北市}', region_note=''
  where brand='萬客什鍋' and regions=array['全台'];

update public.offers set regions='{新北市,彰化縣,桃園市}', region_note=''
  where brand='蔬鍋藝' and regions=array['全台'];

update public.offers set regions='{台北市}',
  region_note='王品集團2023年底推出的新品牌，目前僅台北西門一家門市'
  where brand='金咕' and regions=array['全台'];

update public.offers set regions='{台北市,新北市,台中市,桃園市}', region_note=''
  where brand='雞湯大叔' and regions=array['全台'];

update public.offers set regions='{台北市,高雄市}',
  region_note='主要開在北部，南部只有高雄鳳山一家分店'
  where brand='鮮五丼' and regions=array['全台'];

update public.offers set regions='{台北市,新北市,新竹市,新竹縣}',
  region_note='約40家門市，集中大台北及新竹地區'
  where brand='SUNMERRY 聖瑪莉' and regions=array['全台'];

update public.offers set
  regions='{台北市,新北市,桃園市,新竹市,台中市,台南市,高雄市}',
  region_note='王品集團旗下，全台14家分店'
  where brand='夏慕尼' and regions=array['全台'];

update public.offers set
  regions='{台北市,新北市,桃園市,台中市,台南市,高雄市}', region_note=''
  where brand='御前上茶' and regions=array['全台'];

update public.offers set regions='{台北市,新北市}',
  region_note='三商巧福升級版新品牌，目前全台僅2家門市'
  where brand='巧福PLUS' and regions=array['全台'];

update public.offers set regions='{新北市,台中市,台南市,高雄市}',
  region_note='築間集團旗下品牌，宜蘭爾本店已歇業'
  where brand='本格燒肉' and regions=array['全台'];

update public.offers set regions='{桃園市,新竹縣,台中市,高雄市}', region_note=''
  where brand='森森燒肉' and regions=array['全台'];
