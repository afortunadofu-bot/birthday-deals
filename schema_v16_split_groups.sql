-- =====================================================================
-- v16：集團優惠資料拆分（王品集團／三商集團／爭鮮集團）
-- =====================================================================
-- 正式站資料庫裡這三個集團目前還是舊的「一列塞好幾個品牌」合併格式
-- （例如 brand = '王品集團（原燒／王品牛排／…)'），前端排行榜／篩選都已經
-- 改成一店一列呈現，這份負責把資料庫也補成一店一列。
--
-- 做法（每個集團都一樣）：
--   1) 找到舊的合併列（brand 開頭是「OO集團」）。
--   2) 把它 UPDATE 成拆分後的第一個品牌——沿用同一個 id，這樣原本掛在
--      這筆優惠上的收藏／評分／使用回報都會留在新的第一個品牌名下，
--      不會因為拆分而不見。
--   3) 其餘品牌用 INSERT 補上，共用同一個 group_name，並沿用舊列的
--      分類、會員方式、時間規則、來源、審核狀態等共同欄位（這些欄位在
--      同一個集團底下每個品牌本來就長一樣，只有品牌名／優惠內容／
--      免費層級／優惠價值不同）。
-- 可重複執行：已經拆過的集團，下次執行會直接跳過（brand 已經不是
-- 「OO集團」開頭了）。
-- =====================================================================

do $$
declare
  old_row public.offers%rowtype;
begin

  -- ---------------- 王品集團 ----------------
  select * into old_row from public.offers
    where brand like '王品集團%' limit 1;
  if found then
    update public.offers set
      brand = '原燒',
      offer = '生日當天憑券內用消費 1 客多人套餐（雙人／三人）85 折；非生日當天贈「松阪豬玫瑰花」乙份',
      free_tier = 'discount',
      value_twd = 200,
      group_name = '王品集團'
    where id = old_row.id;

    insert into public.offers (
      brand, category, regions, region_note, offer, membership, membership_type, membership_cost,
      free_tier, advance_days, advance_note, offer_window, timing, conditions, validity, validity_type,
      valid_from, valid_until, sources, status, verified, last_checked, submitted_by, reviewed_by,
      reviewed_at, review_note, group_name, value_twd
    )
    select v.brand, old_row.category, old_row.regions, old_row.region_note, v.offer, old_row.membership,
      old_row.membership_type, old_row.membership_cost, v.free_tier, old_row.advance_days,
      old_row.advance_note, old_row.offer_window, old_row.timing, old_row.conditions, old_row.validity,
      old_row.validity_type, old_row.valid_from, old_row.valid_until, old_row.sources, old_row.status,
      old_row.verified, old_row.last_checked, old_row.submitted_by, old_row.reviewed_by, old_row.reviewed_at,
      old_row.review_note, '王品集團', v.value_twd
    from (values
      ('王品牛排', '憑券（內用／外帶）消費單客個人饗宴套餐 9 折', 'discount', 150),
      ('藝奇', '憑券內用消費享單客套餐 9 折（主餐升級加價亦適用）', 'discount', 100),
      ('夏慕尼', '憑券內用消費單客套餐 88 折', 'discount', 170),
      ('西堤', '憑券內用消費獨享單客經典套餐 9 折', 'discount', 70),
      ('陶板屋', '憑券內用消費享單客和風洋食套餐 9 折（主餐升級亦適用）', 'discount', 70),
      ('品田牧場', '憑券內用消費享任一套餐 88 折', 'discount', 50),
      ('莆田', '憑券消費滿 $500 即贈「手作瑪德蓮花束」乙份', 'free_min', 150),
      ('青花驕', '消費憑券贈「青花椒冰淇淋」乙份', 'free_min', 80),
      ('享鴨', '憑券消費即贈「冰糖醬香鴨翅」乙份', 'free_min', 150),
      ('丰禾', '憑券消費滿 $500 元即贈「豬腳麵線」乙份', 'free_min', 180),
      ('和牛涮', '內用消費憑券頂級和牛套餐享單客 9 折', 'discount', 120),
      ('肉次方', '憑券內用消費享指定套餐單客 9 折', 'discount', 80),
      ('尬鍋', '憑券內用消費即贈「現蒸壽桃」乙份', 'free_min', 80),
      ('阪前', '憑券內用消費 $1,880 套餐乙客即贈「水果寶石生乳捲」乙份', 'free_min', 200),
      ('就饗', '依王品瘋美食 APP 當月公告的壽星禮為準', 'unknown', null),
      ('金咕', '依王品瘋美食 APP 當月公告的壽星禮為準', 'unknown', null)
    ) as v(brand, offer, free_tier, value_twd);
    raise notice '王品集團：已拆成 17 筆。';
  else
    raise notice '王品集團：找不到舊的合併列，可能已經拆過了，跳過。';
  end if;

  -- ---------------- 三商集團 ----------------
  select * into old_row from public.offers
    where brand like '三商集團%' limit 1;
  if found then
    update public.offers set
      brand = '三商巧福',
      offer = '買「原汁牛肉麵＋燙青菜＋杯裝飲料」送原汁牛肉麵一份',
      free_tier = 'free_min',
      value_twd = 140,
      group_name = '三商集團'
    where id = old_row.id;

    insert into public.offers (
      brand, category, regions, region_note, offer, membership, membership_type, membership_cost,
      free_tier, advance_days, advance_note, offer_window, timing, conditions, validity, validity_type,
      valid_from, valid_until, sources, status, verified, last_checked, submitted_by, reviewed_by,
      reviewed_at, review_note, group_name, value_twd
    )
    select v.brand, old_row.category, old_row.regions, old_row.region_note, v.offer, old_row.membership,
      old_row.membership_type, old_row.membership_cost, v.free_tier, old_row.advance_days,
      old_row.advance_note, old_row.offer_window, old_row.timing, old_row.conditions, old_row.validity,
      old_row.validity_type, old_row.valid_from, old_row.valid_until, old_row.sources, old_row.status,
      old_row.verified, old_row.last_checked, old_row.submitted_by, old_row.reviewed_by, old_row.reviewed_at,
      old_row.review_note, '三商集團', v.value_twd
    from (values
      ('巧福PLUS', '買「紅燒牛肉麵＋時蔬肉燥＋經典紅茶」送紅燒牛肉麵一份', 'free_min', 160),
      ('鮮五丼', '買「招牌牛丼＋蒜香時蔬＋杯裝飲料」送招牌牛丼一份', 'free_min', 130),
      ('品川蘭', '雪花牛肉麵買一送一', 'free_min', 200),
      ('福勝亭', '炸雞柳定食買一送一', 'free_min', 220),
      ('三商炸雞', '買唐揚雞腿送原味胡椒脆雞塊', 'free_min', 60),
      ('拿坡里', '重乳酪蛋糕外帶 $250', 'discount', 100)
    ) as v(brand, offer, free_tier, value_twd);
    raise notice '三商集團：已拆成 7 筆。';
  else
    raise notice '三商集團：找不到舊的合併列，可能已經拆過了，跳過。';
  end if;

  -- ---------------- 爭鮮集團 ----------------
  select * into old_row from public.offers
    where brand like '爭鮮集團%' limit 1;
  if found then
    update public.offers set
      brand = '爭鮮',
      offer = '生日當月送鮭魚三味',
      free_tier = 'free_min',
      value_twd = 60,
      group_name = '爭鮮集團'
    where id = old_row.id;

    insert into public.offers (
      brand, category, regions, region_note, offer, membership, membership_type, membership_cost,
      free_tier, advance_days, advance_note, offer_window, timing, conditions, validity, validity_type,
      valid_from, valid_until, sources, status, verified, last_checked, submitted_by, reviewed_by,
      reviewed_at, review_note, group_name, value_twd
    )
    select v.brand, old_row.category, old_row.regions, old_row.region_note, v.offer, old_row.membership,
      old_row.membership_type, old_row.membership_cost, v.free_tier, old_row.advance_days,
      old_row.advance_note, old_row.offer_window, old_row.timing, old_row.conditions, old_row.validity,
      old_row.validity_type, old_row.valid_from, old_row.valid_until, old_row.sources, old_row.status,
      old_row.verified, old_row.last_checked, old_row.submitted_by, old_row.reviewed_by, old_row.reviewed_at,
      old_row.review_note, '爭鮮集團', v.value_twd
    from (values
      ('爭鮮PLUS', '生日當月送香酥鮭魚邊鰭', 'free_min', 60),
      ('爭鮮gogo', '生日當月送多多君', 'free_min', 40),
      ('定食8', '生日當月送黃金脆薯', 'free_min', 50),
      ('MAGIC TOUCH', '生日當月送海洋茶碗蒸', 'free_min', 60)
    ) as v(brand, offer, free_tier, value_twd);
    raise notice '爭鮮集團：已拆成 5 筆。';
  else
    raise notice '爭鮮集團：找不到舊的合併列，可能已經拆過了，跳過。';
  end if;
end $$;
