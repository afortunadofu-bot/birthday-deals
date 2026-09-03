-- =====================================================================
-- v22：「全台」品牌分店查核 — 第 2 批（7 個品牌）
-- 查核依據（門市家數／分布，查核時間 2026-08）：
--   IKEA 宜家家居    全台僅6家：台北、新北(2)、桃園、台中、高雄
--   添好運 Tim Ho Wan 官網門市分類含：台北/新北/桃園/新竹/台中/台南/高雄
--   老乾杯 KANPAI CLASSIC  確認：台中、台南、嘉義、高雄
--   阿薄郎薄皮餃子     3家分店都在台北市（忠孝/公館/南西）
--   長田本庄軒        日本引進品牌，台灣首波僅信義A11一家
--   蛋金固烘焙坊       目前僅一家店，桃園南門市場
--   青花驕           已確認台北/新北/桃園有分店，其餘待查
-- 可重複執行。
-- =====================================================================

update public.offers set regions='{台北市,新北市,桃園市,台中市,高雄市}',
  region_note='全台僅6家店'
  where brand='IKEA 宜家家居' and regions=array['全台'];

update public.offers set regions='{台北市,新北市,桃園市,新竹市,台中市,台南市,高雄市}', region_note=''
  where brand='添好運 Tim Ho Wan' and regions=array['全台'];

update public.offers set regions='{台中市,台南市,嘉義市,高雄市}', region_note=''
  where brand='老乾杯 KANPAI CLASSIC' and regions=array['全台'];

update public.offers set regions='{台北市}', region_note='目前3家分店都在台北市'
  where brand='阿薄郎薄皮餃子' and regions=array['全台'];

update public.offers set regions='{台北市}', region_note='台灣首波僅信義A11一家分店，日本引進品牌'
  where brand='長田本庄軒' and regions=array['全台'];

update public.offers set regions='{桃園市}', region_note='目前僅一家店，位於桃園南門市場'
  where brand='蛋金固烘焙坊' and regions=array['全台'];

update public.offers set regions='{台北市,新北市,桃園市}',
  region_note='此為已確認縣市，可能還有其他分店待查'
  where brand='青花驕' and regions=array['全台'];
