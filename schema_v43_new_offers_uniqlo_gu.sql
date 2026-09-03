-- =====================================================================
-- v43：新增 UNIQLO／GU 兩筆優惠，先進待審佇列
--
--   背景：使用者問「有沒有可轉讓、不用出示證件」的生日優惠。查了一輪，
--   台灣目前幾乎沒有品牌明確標榜「可轉讓」——多數連鎖餐廳的壽星優惠
--   還是要求出示身分證／健保卡證明生日。但有一類優惠實質上「不用在
--   現場出示證件」：App／網路會員生日禮。這種優惠是「註冊時就先登記
--   生日」，生日月自動發券到帳號裡，兌換時店員只掃 App 裡的券／輸入
--   優惠碼，不會再另外核對證件——但也不是官方標榜「可轉讓」，純粹是
--   驗證方式本來就在註冊當下做完了，跟本網站已有的麥當勞／IKEA／
--   PK雙饗卡（肯德基×必勝客）是同一種模式。
--
--   UNIQLO 跟 GU 目前不在資料庫裡，符合這個模式，先補進來，狀態設
--   pending，進管理員審核佇列，不是直接上架。submitted_by 留 null，
--   核可後會被「已通過清單」歸類成系統匯入（不是使用者投稿）。
--
--   資料來源都是品牌官方客服頁面（tier 1），可重複執行。
-- =====================================================================

insert into public.offers (
  brand, category, regions, region_note, offer,
  membership, membership_type, membership_cost, free_tier,
  advance_days, advance_note, offer_window, conditions, validity, validity_type,
  sources, status, verified, submitted_by
)
select 'UNIQLO', '零售美妝', array['全台']::text[],
  '僅限 UNIQLO 網路商店（2026/7/1 起生日券改為只能網路商店用，不能在實體店用）',
  'App 會員生日禮：生日月 1 號自動發一張 NT$100 折價券，單筆消費滿 NT$1,000 可折抵。' ||
  '兌換不用臨櫃出示證件——生日是註冊會員時填在 App 裡的，到期自動發券、直接在網路商店結帳折抵。',
  'UNIQLO App／網路商店會員', 'app', 'free', 'discount',
  30, '建議生日前一個月就完成 App 會員註冊並填好生日資料，優惠券會在生日當月 1 號自動匯入帳號。',
  '當月', '單筆消費滿 NT$1,000 折抵 NT$100；限 UNIQLO 網路商店使用，2026/7/1 起不可於實體店鋪使用；每人每月限發一張。',
  '生日當月', 'rolling',
  '[{"url":"https://faq-tw.uniqlo.com/pkb_Home_UQ_TW?id=kA0fR0000001WgzSAE&l=zh_TW","title":"UNIQLO 台灣官方客服－APP會員權益說明","tier":1,"tierLabel":"品牌官方"},
    {"url":"https://happybirthday.com.tw/events/697","title":"happybirthday.com.tw","tier":3,"tierLabel":"部落格"}]'::jsonb,
  'pending', false, null
where not exists (select 1 from public.offers where brand = 'UNIQLO');

insert into public.offers (
  brand, category, regions, region_note, offer,
  membership, membership_type, membership_cost, free_tier,
  advance_days, advance_note, offer_window, conditions, validity, validity_type,
  sources, status, verified, submitted_by
)
select 'GU', '零售美妝', array['全台']::text[],
  '僅限 GU 網路商店，不能在實體門市使用',
  'App／網路會員生日禮：生日月自動發一張 NT$100 滿額優惠券，單筆消費滿 NT$1,000 可折抵。' ||
  '一樣是註冊時就登記好生日，兌換時不用再另外出示證件，直接在網路商店結帳套用。',
  'GU App／網路商店會員', 'app', 'free', 'discount',
  30, '建議生日前一個月完成會員註冊並填好生日資料；就算生日當月才註冊，官方說一個工作天內也能收到券，但比較容易來不及，建議提早辦。',
  '當月', '單筆消費滿 NT$1,000 折抵 NT$100；限 GU 網路商店使用，逾生日當月即失效；每人每月限用一次。',
  '生日當月月底止', 'rolling',
  '[{"url":"https://faq-tw.gu-global.com/pkb_Home_GU_TW?id=kA0Ie000000TOgC&l=zh_TW","title":"GU 台灣官方客服－會員生日優惠券說明","tier":1,"tierLabel":"品牌官方"}]'::jsonb,
  'pending', false, null
where not exists (select 1 from public.offers where brand = 'GU');
