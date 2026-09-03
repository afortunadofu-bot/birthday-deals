-- =====================================================================
-- v21：「全台」品牌分店查核 — 第 1 批（8 個品牌）
-- 用 Google 搜尋實際查了這幾個品牌的門市地址，發現原本標「全台」其實
-- 分店很少或集中在特定縣市，改成實際查到的縣市，避免使用者在沒有分店
-- 的縣市篩選卻看到這筆優惠。可重複執行。
--
-- 查核依據（門市家數／分布，查核時間 2026-08）：
--   尬鍋       全台僅3家：台北2家、桃園中壢1家
--   阪前       全台僅4家：台北2家、台中1家、桃園1家
--   就饗       全台僅5家：台北2家、新北1家、高雄2家
--   五鮮級     約50家，集中中南部，此次先確認高雄、彰化有分店
--   阿仁牛軋糖  固定門市僅3家皆在桃園，其餘為快閃櫃
--   洪瑞珍      彰化/台中/台北/台南皆有分店（各分店多獨立經營）
--   裕珍馨      主要在台中（總部大甲）、台北
--   大茗       台北/新北/台中/新竹/高雄皆有分店
-- （吳家紅茶冰查到「百餘家連鎖」，維持原本「全台」不變，這次不動）
-- =====================================================================

update public.offers set regions='{台北市,桃園市}', region_note=''
  where brand='尬鍋' and regions=array['全台'];

update public.offers set regions='{台北市,台中市,桃園市}', region_note=''
  where brand='阪前' and regions=array['全台'];

update public.offers set regions='{台北市,新北市,高雄市}', region_note=''
  where brand='就饗' and regions=array['全台'];

update public.offers set regions='{高雄市,彰化縣}',
  region_note='門市多集中中南部，此為已確認縣市，其餘中南部縣市待查'
  where brand='五鮮級' and regions=array['全台'];

update public.offers set regions='{桃園市}',
  region_note='固定門市僅3家皆在桃園，其餘多為快閃櫃，非常態門市'
  where brand='阿仁牛軋糖' and regions=array['全台'];

update public.offers set regions='{彰化縣,台中市,台北市,台南市}',
  region_note='各地分店多為獨立加盟經營，優惠內容可能因店而異，建議先致電門市確認'
  where brand='洪瑞珍' and regions=array['全台'];

update public.offers set regions='{台中市,台北市}', region_note=''
  where brand='裕珍馨' and regions=array['全台'];

update public.offers set regions='{台北市,新北市,台中市,新竹市,高雄市}', region_note=''
  where brand='大茗' and regions=array['全台'];
