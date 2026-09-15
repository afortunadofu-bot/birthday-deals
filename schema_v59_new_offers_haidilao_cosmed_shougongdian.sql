-- =====================================================================
-- v59：新增 海底撈、康是美、手工殿麻辣鍋物 三筆優惠，先進待審佇列
--
--   背景：celine 轉貼一篇使用者的生日優惠實際使用紀錄（「真的很愛生日月
--   吃吃喝喝 ep.1」，9/1～9/8 共 16 筆），請我檢查後加進資料庫。逐筆對過
--   線上資料：13 筆已經有了（默爾、31冰淇淋、善菓屋、季緣、福勝亭、麥當勞、
--   大茗、這味泰泰、龜記、涓豆腐、UG、TSUJIRI、DONQ），只有這 3 筆缺。
--   已有的 13 筆裡有幾筆跟貼文寫的不一樣（麥當勞 $85 vs $89、善菓屋要不要
--   消費等），那些是「修改既有已查證資料」，不在這支 SQL 裡偷改，另外列給
--   celine 決定。
--
--   三筆都設 pending、verified=false、submitted_by=null（跟 v43 一樣）：
--   進管理員審核佇列，可以用新的「全選批次核可」一次核可，核可後才會上架。
--
--   - 康是美：官方 eShop 公告頁確認「生日當月 5 號、30 倍點數、實體／eShop 擇一」
--     （tier 1）。結帳上限 1 萬、不可併週二 6 倍這兩點只出現在網路整理文章，官方頁
--     沒寫，條件欄寫明「依門市公告為準」，不當成確定的規則
--   - 海底撈：這篇貼文跟另外兩則使用者分享一致（會員生日當月送整份紅糖糍粑），
--     但沒找到官方公告（整理文章抓不到內文），所以來源只標社群貼文；「生日當天
--     消費滿額送大禮包」的門檻也標成未確認
--   - 手工殿麻辣鍋物：只有這篇使用者貼文寫「Ocard、達內用低消送 A5 和牛
--     50 克／人」；網路上較舊的整理寫的是「當月壽星招待生魚片壽司蛋糕」，
--     兩者不一樣，可能是改過活動。核可前請管理員再確認
--
--   以品牌名稱判斷是否已存在（已經有就不重複新增），可重複執行。
-- =====================================================================

insert into public.offers (
  brand, category, regions, region_note, offer,
  membership, membership_type, membership_cost, free_tier,
  advance_days, advance_note, timing, offer_window, conditions, validity, validity_type,
  sources, status, verified, submitted_by
)
select '康是美', '零售美妝', array['全台']::text[], '',
  '生日當月 5 號任選 1 次消費，會員點數 30 倍送（基本 1 倍＋加碼 29 倍，約等於 9.9% 點數回饋）。',
  '康是美會員（會員卡／App）', 'card', 'free', 'discount',
  0, '', '其他', '其他',
  '限生日當月 5 號；實體門市與 eShop 擇一參加（官方公告）。結帳金額上限、能否與週二點數加倍併用等細節，官方公告頁沒寫，網路整理文章說上限 1 萬元、不可併週二 6 倍送，依門市現場公告為準。',
  '生日當月 5 號當天', 'rolling',
  '[{"url":"https://shop.cosmed.com.tw/Article/Detail/65004","title":"康是美網購 eShop－生日會員於生日當月5號消費享會員點數30倍送（實體/eShop擇1）","tier":1,"tierLabel":"品牌官方"},
    {"url":"https://uptogo.com.tw/%E5%95%86%E6%A5%AD/%E8%A1%8C%E9%8A%B7%E5%85%AC%E9%97%9C/%E5%BB%A3%E5%91%8A/%E5%BA%B7%E6%98%AF%E7%BE%8E%E7%94%9F%E6%97%A530%E5%80%8D-%E5%B9%BE%E6%8A%98%EF%BC%9F/","title":"UpToGo－康是美生日30倍幾折？回饋與限制整理","tier":3,"tierLabel":"部落格"}]'::jsonb,
  'pending', false, null
where not exists (select 1 from public.offers where brand like '康是美%');

insert into public.offers (
  brand, category, regions, region_note, offer,
  membership, membership_type, membership_cost, free_tier,
  advance_days, advance_note, timing, offer_window, conditions, validity, validity_type,
  sources, status, verified, submitted_by
)
select '海底撈', '火鍋燒肉', array[]::text[], '分店縣市待確認',
  '生日當月會員送整份紅糖糍粑兌換券；生日當天來店另有壽星大禮包、店員唱生日歌。',
  '海底撈會員（LINE 官方帳號／會員 App）', 'line', 'free', 'free_min',
  0, '', '當月', '當月',
  '紅糖糍粑兌換券需內用。生日當天大禮包的門檻（網路整理寫消費滿 NT$1,500 並出示證件）目前沒找到官方公告，依門市現場為準。',
  '生日當月', 'rolling',
  '[{"url":"https://www.threads.com/@stunning_xn/post/DEAGQHtSZMU","title":"Threads 使用者分享：生日當月會員送整份紅糖糍粑兌換券","tier":4,"tierLabel":"社群貼文"},
    {"url":"https://www.threads.com/@oo_anta_oo/post/DHBmgIBPjnW","title":"Threads 使用者分享：生日月大禮包＋會員換整份紅糖糍粑","tier":4,"tierLabel":"社群貼文"}]'::jsonb,
  'pending', false, null
where not exists (select 1 from public.offers where brand like '海底撈%');

insert into public.offers (
  brand, category, regions, region_note, offer,
  membership, membership_type, membership_cost, free_tier,
  advance_days, advance_note, timing, offer_window, conditions, validity, validity_type,
  sources, status, verified, submitted_by
)
select '手工殿麻辣鍋物', '火鍋燒肉', array['台北市']::text[], '目前查到信義區門市',
  '生日當月內用達最低消費，每人送 A5 和牛 50 克。',
  'Ocard 會員', 'ocard', 'free', 'free_min',
  0, '', '當月', '當月',
  '需達內用最低消費；A5 和牛 50 克／人。⚠️ 目前只有 2026/9 一位使用者分享，網路上較舊的整理寫的是「當月壽星招待生魚片壽司蛋糕」，核可前請再確認。',
  '生日當月', 'rolling',
  '[{"url":"https://carina.com.tw/%E3%80%90%E6%89%8B%E5%B7%A5%E6%AE%BF%E9%BA%BB%E8%BE%A3%E9%8D%8B%E7%89%A9%E3%80%91%E5%8F%B0%E5%8C%97%E9%8D%8B%E9%9A%9B%E5%A4%A7%E8%B3%9E%E7%AC%AC%E4%B8%80%E5%90%8D%E4%BF%A1%E7%BE%A9%E5%8D%80%E7%81%AB/","title":"洋洋的吃喝玩樂－手工殿麻辣鍋物（店家資訊、舊版壽星優惠）","tier":3,"tierLabel":"部落格"}]'::jsonb,
  'pending', false, null
where not exists (select 1 from public.offers where brand like '手工殿%');
