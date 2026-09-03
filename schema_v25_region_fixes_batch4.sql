-- =====================================================================
-- v25：「全台」品牌分店查核 — 第 4 批（4 個品牌，種子資料）
-- 查核依據：
--   福勝亭        45家分店，橫跨基隆/雙北/桃園/竹竹/台中/南投/雲林/
--                嘉義/台南/高雄/屏東/宜蘭
--   錢都日式涮涮鍋  34家分店全集中北北桃竹，中南部目前沒有分店
--   聖娜 Semeur    已確認台北、新北有分店，其餘待查
--   貳樓          8個縣市：雙北/桃園/新竹/台中/嘉義/台南/高雄
-- （珍煮丹、繼光香香雞查到都是30~100家規模的全國連鎖，維持「全台」不變）
-- 可重複執行。
-- =====================================================================

update public.offers set
  regions='{基隆市,台北市,新北市,桃園市,新竹市,新竹縣,台中市,南投縣,雲林縣,嘉義市,台南市,高雄市,屏東縣,宜蘭縣}',
  region_note=''
  where brand='福勝亭' and regions=array['全台'];

update public.offers set regions='{台北市,新北市,桃園市,新竹市}',
  region_note='34家分店全集中北北桃竹，中南部目前沒有分店'
  where brand='錢都日式涮涮鍋' and regions=array['全台'];

update public.offers set regions='{台北市,新北市}',
  region_note='此為已確認縣市，可能還有其他分店待查'
  where brand='聖娜 Semeur' and regions=array['全台'];

update public.offers set
  regions='{台北市,新北市,桃園市,新竹市,台中市,嘉義市,台南市,高雄市}',
  region_note=''
  where brand='貳樓 Second Floor Cafe' and regions=array['全台'];
