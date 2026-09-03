-- =====================================================================
-- v23：合併重複投稿「門牛十二鍋」→「鬥牛士二鍋」+ 全台品牌查核第 3 批
-- 可重複執行。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 合併重複投稿。
--    「門牛十二鍋」其實是「鬥牛士二鍋」被爬蟲/OCR 誤讀成兩筆不同投稿
--    （門↔鬥、十↔士 字形相近），優惠內容也幾乎一樣（當日壽星半價/5折），
--    查了官網（bullfight.com.tw）確認是同一個品牌，合併成一筆，
--    互動資料（回報/留言/評分/收藏/修改建議/通知）都搬到保留的那筆。
-- ---------------------------------------------------------------------
do $$
declare
  keep_id bigint;
  dup_id  bigint;
begin
  select id into keep_id from public.offers where brand = '鬥牛士二鍋' order by id limit 1;
  select id into dup_id  from public.offers where brand = '門牛十二鍋' order by id limit 1;

  if keep_id is null or dup_id is null then
    raise notice '找不到其中一筆（keep_id=%, dup_id=%），可能已經合併過或品牌名稱不同，本次不動作', keep_id, dup_id;
  else
    -- 使用回報：同一人同一天可能兩邊都回報過，避免撞到唯一鍵，搬不過去的就捨棄
    update public.usage_reports r set offer_id = keep_id
     where r.offer_id = dup_id
       and not exists (
         select 1 from public.usage_reports r2
          where r2.offer_id = keep_id and r2.user_id = r.user_id and r2.used_on = r.used_on
       );
    delete from public.usage_reports where offer_id = dup_id;

    -- 留言：直接搬
    update public.comments set offer_id = keep_id where offer_id = dup_id;

    -- 評分：同一人可能兩邊都評過分，保留分數較新的那筆
    insert into public.offer_ratings (offer_id, user_id, score, created_at, updated_at)
      select keep_id, user_id, score, created_at, updated_at
      from public.offer_ratings where offer_id = dup_id
      on conflict (offer_id, user_id) do update
        set score = excluded.score, updated_at = excluded.updated_at
        where excluded.updated_at > public.offer_ratings.updated_at;
    delete from public.offer_ratings where offer_id = dup_id;

    -- 待辦清單：同一人可能兩邊都收藏了
    insert into public.wishlist (user_id, offer_id, done, created_at)
      select user_id, keep_id, done, created_at
      from public.wishlist where offer_id = dup_id
      on conflict (user_id, offer_id) do nothing;
    delete from public.wishlist where offer_id = dup_id;

    -- 修改建議、通知：直接搬
    update public.offer_edits set offer_id = keep_id where offer_id = dup_id;
    update public.notifications set offer_id = keep_id where offer_id = dup_id;

    -- 最後刪掉重複的那筆優惠本身
    delete from public.offers where id = dup_id;

    raise notice '已把「門牛十二鍋」(id=%) 合併進「鬥牛士二鍋」(id=%)', dup_id, keep_id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2) 全台品牌查核第 3 批（含上次沒查完的「鬥牛士二鍋」本身）。
--    查核依據：
--      鬥牛士二鍋  官網列出6家分店：台南中山、高雄楠梓、桃園時尚、
--                 台中文心、新竹SoGo、台中新時代
--      這味泰泰    已確認台北、新北有分店，其餘待查
--      大河屋      分店遍及雙北/桃園/新竹/台中/嘉義/台南/高雄/屏東/宜蘭
--      品川蘭      6家分店：台北3家、新北1家、桃園2家
--      善菓屋      只查到一家門市（新莊宏匯店），信心度較低
--      喜多酸菜魚   共6家分店都在雙北
--      小時厚牛排   六扇門火鍋旗下新品牌，宜蘭/桃園/新竹/新北/台中/
--                 苗栗/彰化/高雄/屏東皆有分店
-- ---------------------------------------------------------------------
update public.offers set regions='{台南市,高雄市,桃園市,台中市,新竹市}', region_note=''
  where brand='鬥牛士二鍋' and regions=array['全台'];

update public.offers set regions='{台北市,新北市}',
  region_note='此為已確認縣市，可能還有其他分店待查'
  where brand='這味泰泰' and regions=array['全台'];

update public.offers set
  regions='{台北市,新北市,桃園市,新竹縣,台中市,嘉義市,台南市,高雄市,屏東縣,宜蘭縣}',
  region_note=''
  where brand='大河屋' and regions=array['全台'];

update public.offers set regions='{台北市,新北市,桃園市}', region_note=''
  where brand='品川蘭' and regions=array['全台'];

update public.offers set regions='{新北市}',
  region_note='目前只查到一家門市（新莊宏匯店），信心度較低，建議之後再核實'
  where brand='善菓屋 ARTISAN BAKERY' and regions=array['全台'];

update public.offers set regions='{台北市,新北市}', region_note='共6家分店都在雙北'
  where brand='喜多酸菜魚' and regions=array['全台'];

update public.offers set
  regions='{宜蘭縣,桃園市,新竹縣,新北市,台中市,苗栗縣,彰化縣,高雄市,屏東縣}',
  region_note=''
  where brand='小時厚牛排' and regions=array['全台'];
