-- =====================================================================
-- v47：celine 桃園/淡水/南港/北車等地踩點日記 —— 爬文核實後新增與修正
--
--   背景：celine 貼了一篇很長的踩點心得文，列了 30 幾家店的生日禮。
--   逐一比對現有 offers.json 快照後發現：裡面大多數品牌（IKEA、31冰淇淋、
--   鮮茶道、德克士、聖娜、Gelato Pique Cafe、御前上茶、繼光香香雞、
--   裕珍馨、大茗、環球購物中心、Popeyes、洪瑞珍、莫凡彼、硬咖啡、
--   GLÖ FROYO、天成飯店集團、大師兄銷魂麵舖、蛋金固烘焙坊、吳家紅茶冰、
--   HABIBI）其實資料庫裡已經有了——這次爬文查證後，大部分跟現有資料
--   相符，沒有動；只有兩筆發現官方條款「明顯跟現有資料不同」才動手
--   UPDATE（IKEA 官方在 2025/4/1 起改了生日禮規則、大師兄的口味選項
--   其實是4選1不是3選1），其餘的即使有些小出入也保留現況，改用文字
--   在旁邊註記，交給 celine 自己在後台核對比較保險——我沒辦法直接讀
--   到 Supabase 現在的即時資料，貿然覆寫每一欄風險比省下的時間還高。
--
--   真正查完全新、資料庫裡沒有的品牌，共 10 家，用跟 v43 一樣的方式
--   先進 pending 待審佇列（不是直接上架），verified 一律先設 false，
--   等 celine 在「待審佇列」核對後自己勾已查證、按核可。
--
--   有一家「七盞茶」爬文查證後刻意沒有收：日記裡寫的「入會禮阿里山
--   冰茶」查起來其實是鮮茶道的活動，七盞茶官網／社群都查不到任何
--   生日禮公告，高機率是踩點當下兩家店記混了，所以沒有寫進資料庫，
--   留在這份 SQL 的說明裡提醒 celine 自己確認。
--
-- 可重複執行（用 where not exists 擋重複新增；三筆 update 是全欄覆寫，
-- 執行多次結果一樣）。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 修正 1：IKEA Family 生日禮規則在 2025/4/1 起已經改版，資料庫裡如果
-- 還是舊規則（買主餐送主餐）要更新成新規則（第二件半價+另一張滿額券）。
-- 來源：IKEA 官方生日禮頁面（tier 1）。
-- ---------------------------------------------------------------------
update public.offers set
  offer = 'IKEA Family 會員生日禮（2025/4/1 起新制）：瑞典餐廳主餐第二件（較低價者）半價；'
    || '另加碼一張「單筆消費滿 $200 折 $100」商品抵用券（家具／餐廳／超市等皆可用）。'
    || '兩者是分開的兩張券，可以只用其中一張，不強制兩張都要用。',
  conditions = '兩份主餐需為 $119 以上，第二份（較低價者）5折；商品抵用券單筆滿 $200 可折抵 $100；'
    || '優惠券須於生日當月底前領取並使用完畢，逾期不補發；每人每年限兌換一次；需完成手機驗證並綁定 LINE 官方帳號才能領取。',
  sources = coalesce(sources,'[]'::jsonb) || '[{"url":"https://www.ikea.com.tw/zh/family/birthdayoffer","title":"IKEA Family 官方生日禮頁面","tier":1,"tierLabel":"品牌官方"}]'::jsonb
where brand = 'IKEA 宜家家居';

-- ---------------------------------------------------------------------
-- 修正 2：大師兄銷魂麵舖的口味選項查證後其實是4選1（多一款「辣裡辣渣
-- 拌麵」），不是3選1。來源：使用者兌換心得（tier 4，官方無公開條款頁）。
-- ---------------------------------------------------------------------
update public.offers set
  offer = 'Ocard 會員生日禮：免費兌換快煮乾拌麵一包，口味4選1（麻辣粗麵／麻辣細麵／花生麻醬細麵／辣裡辣渣拌麵）。',
  sources = coalesce(sources,'[]'::jsonb) || '[{"url":"https://www.threads.com/@tenshain0517/post/DKZCA-fSt9A","title":"使用者兌換心得（Threads）","tier":4,"tierLabel":"部落格"}]'::jsonb
where brand = '大師兄銷魂麵舖';

-- ---------------------------------------------------------------------
-- 修正 3：聖娜的「生日禮」跟「入會禮」查證後是兩件不同的東西，把文字
-- 拆清楚，避免使用者以為要湊到入會禮的滿額條件才能領生日禮咖啡。
-- ---------------------------------------------------------------------
update public.offers set
  offer = 'App 會員生日禮：生日當月免費兌換大杯美式咖啡（16oz）一杯。'
    || '（另有入會禮：完成註冊即送兩張「滿 $100 折 $50」優惠券，是加入會員的贈禮，不是生日禮本身，兩者不用湊在一起才能用。）',
  sources = coalesce(sources,'[]'::jsonb) || '[{"url":"https://www.dcard.tw/f/savemoney/p/257648213","title":"Dcard 會員生日優惠整理","tier":4,"tierLabel":"部落格"}]'::jsonb
where brand = '聖娜 Semeur';

-- =====================================================================
-- 以下是資料庫裡目前沒有、爬文查證後新增的品牌，共 10 家，全部先進
-- pending 待審佇列。
-- =====================================================================

insert into public.offers (
  brand, category, regions, region_note, offer,
  membership, membership_type, membership_cost, free_tier,
  advance_days, advance_note, offer_window, conditions, validity, validity_type,
  sources, status, verified, submitted_by
)
select '慕慕檸', '飲料', array['全台']::text[], '',
  'Ocard 會員生日禮：生日當月免費兌換飲品一杯（App 內選項可能調整，曾出現「慕慕煦光蕎麥茶」中杯等品項；使用者實測畫面為3選1，換到檸檬水）。',
  'Ocard 會員', 'ocard', 'free', 'free_no_min',
  null, '建議提前於 Ocard 完成生日資料註冊，實際到帳時間依系統為準。',
  '當月', '兌換品項依 App 當期畫面為準；未查到官方公告的低消或分店限制文字，屬第三方整理資訊，建議上架前以實際帳號畫面核對。',
  '生日當月', 'rolling',
  '[{"url":"https://www.dcard.tw/f/savemoney/p/257937395","title":"Dcard－Ocard生日優惠整理","tier":4,"tierLabel":"部落格"}]'::jsonb,
  'pending', false, null
where not exists (select 1 from public.offers where brand = '慕慕檸');

insert into public.offers (
  brand, category, regions, region_note, offer,
  membership, membership_type, membership_cost, free_tier,
  advance_days, advance_note, offer_window, conditions, validity, validity_type,
  sources, status, verified, submitted_by
)
select 'gonnaEAT', '飲料', array['全台']::text[], '目前全台4家門市（含台北內湖、京站等）',
  'Ocard 會員生日禮：生日當月免費兌換精選黑咖啡或經典拿鐵（2選1，實付0元，原價約 $140）。',
  'Ocard 會員', 'ocard', 'free', 'free_no_min',
  null, '建議提前於 Ocard 完成生日資料註冊。',
  '當月', '2選1（黑咖啡／拿鐵）；未查到官方公告的低消或分店限制文字。',
  '生日當月', 'rolling',
  '[{"url":"https://www.threads.com/@noridanngo/post/DOYXAYQD9H0","title":"使用者兌換心得（Threads）","tier":4,"tierLabel":"部落格"}]'::jsonb,
  'pending', false, null
where not exists (select 1 from public.offers where brand = 'gonnaEAT');

insert into public.offers (
  brand, category, regions, region_note, offer,
  membership, membership_type, membership_cost, free_tier,
  advance_days, advance_note, offer_window, conditions, validity, validity_type,
  sources, status, verified, submitted_by
)
select '七彩雲南', '連鎖餐廳', array['全台']::text[], '',
  'Ocard 會員生日禮：生日當月發放 $100 折價券一張，可折抵消費。',
  'Ocard 會員', 'ocard', 'free', 'discount',
  null, '建議提前於 Ocard 完成生日資料註冊。',
  '當月', '未查到官方公告的低消門檻文字；使用者實測直接用來折抵一份肉蛋米干，等同免費。',
  '生日當月', 'rolling',
  '[{"url":"https://www.dcard.tw/f/savemoney/p/257937395","title":"Dcard－Ocard生日優惠整理","tier":4,"tierLabel":"部落格"}]'::jsonb,
  'pending', false, null
where not exists (select 1 from public.offers where brand = '七彩雲南');

insert into public.offers (
  brand, category, regions, region_note, offer,
  membership, membership_type, membership_cost, free_tier,
  advance_days, advance_note, offer_window, conditions, validity, validity_type,
  sources, status, verified, submitted_by
)
select '功夫茶', '飲料', array['全台']::text[], '',
  '官方會員（LINE 官方帳號）發放生日禮：滿 $50 折 $30 優惠券一張。'
    || '（另有入會禮同為滿 $50 折 $30，是加入會員的贈禮，兩張券需分開結帳，不可疊加折抵同一筆消費。）',
  'LINE 官方帳號會員', 'line', 'free', 'discount',
  null, '未查到官方公告需提前幾天完成綁定。',
  '當月', '生日禮、入會禮皆為「滿 $50 折 $30」，需個別滿足低消門檻，不可用同一筆訂單疊加兩張券。',
  '生日當月', 'rolling',
  '[{"url":"https://www.dcard.tw/f/savemoney/p/257648213","title":"Dcard 會員生日優惠整理","tier":4,"tierLabel":"部落格"}]'::jsonb,
  'pending', false, null
where not exists (select 1 from public.offers where brand = '功夫茶');

insert into public.offers (
  brand, category, regions, region_note, offer,
  membership, membership_type, membership_cost, free_tier,
  advance_days, advance_note, offer_window, conditions, validity, validity_type,
  sources, status, verified, submitted_by
)
select '世界豆漿大王', '連鎖餐廳', array['全台']::text[], '',
  'Ocard 會員生日禮：生日當月發放5張 $100 折價券，單筆消費滿 $200 可折抵1張。',
  'Ocard 會員', 'ocard', 'free', 'discount',
  null, '建議提前於 Ocard 完成生日資料註冊。',
  '當月', '限平日（週一至週四）使用；一天限用1張；5張使用完畢為止。',
  '生日當月', 'rolling',
  '[{"url":"https://www.dcard.tw/f/savemoney/p/257937395","title":"Dcard－Ocard生日優惠整理","tier":4,"tierLabel":"部落格"}]'::jsonb,
  'pending', false, null
where not exists (select 1 from public.offers where brand = '世界豆漿大王');

insert into public.offers (
  brand, category, regions, region_note, offer,
  membership, membership_type, membership_cost, free_tier,
  advance_days, advance_note, offer_window, conditions, validity, validity_type,
  sources, status, verified, submitted_by
)
select '基隆海科館', '其他', array['基隆市']::text[], '國立海洋科技博物館本館及潮境智能海洋館',
  '當月壽星憑證件至售票櫃台，可免費入館參觀（不含潮境智能海洋館B區VR互動體驗，B區需另外購票，現場售價 $150）。',
  '免會員，現場出示證件即可', 'none', 'free', 'free_no_min',
  null, '無需事先預約，當月隨到隨辦，現場出示身分證明文件即可。',
  '當月', '限本人當月適用；連續假期、國定假日不適用；憑身分證明文件現場核對生日，非預約制。',
  '生日當月', 'rolling',
  '[{"url":"https://www.nmmst.gov.tw/chhtml/content/216/10532","title":"國立海洋科技博物館官網－票價資訊","tier":1,"tierLabel":"品牌官方"}]'::jsonb,
  'pending', false, null
where not exists (select 1 from public.offers where brand = '基隆海科館');

insert into public.offers (
  brand, category, regions, region_note, offer,
  membership, membership_type, membership_cost, free_tier,
  advance_days, advance_note, offer_window, conditions, validity, validity_type,
  sources, status, verified, submitted_by
)
select 'NOKE忠泰樂生活', '其他', array['台北市']::text[], '限台北 NOKE 忠泰樂生活（部分加碼活動也涵蓋台中老佛爺店）',
  'App 會員生日禮：生日當月至2樓服務中心出示 App 條碼與證件核對後，可4選1兌換：'
    || '3F Uncanny Kai 康普茶（杯裝，僅供外帶）／4F WIRED CAFE 美式咖啡或莊園紅茶（僅限外帶）／'
    || '5F 山海豆花 白玉粉圓或寒天絹豆花（僅供外帶）／5F 明森宇治焙茶霜淇淋（僅供外帶，20:30後改以指定甜點兌換）。'
    || '另有加碼 $200 購物金、免費停車券等。',
  'App 會員（忠泰生活圈 App）', 'app', 'free', 'free_no_min',
  null, '首次兌換需現場完成身分驗證，之後可於 App 內生日當月1日直接領取。',
  '當月', '需至2樓服務中心完善會員資料並出示證件；所有兌換券皆限外帶，每券限兌換一次不得轉讓；使用期限至次月7日。',
  '生日當月至次月7日', 'rolling',
  '[{"url":"https://noke.jutretail.com.tw/news/840","title":"忠泰樂生活官方公告","tier":1,"tierLabel":"品牌官方"}]'::jsonb,
  'pending', false, null
where not exists (select 1 from public.offers where brand = 'NOKE忠泰樂生活');

insert into public.offers (
  brand, category, regions, region_note, offer,
  membership, membership_type, membership_cost, free_tier,
  advance_days, advance_note, offer_window, conditions, validity, validity_type,
  sources, status, verified, submitted_by
)
select '好食多涮涮鍋（大安店）', '火鍋燒肉', array['台北市']::text[], '限大安店（台北市大安區大安路一段19巷8號／11號），好食多其他分店活動需另外查證',
  '當月壽星憑證件現場兌換：贈送一公斤鮮甜白蝦（約63隻）或可換成一公斤蛤蜊；壽星攜7位朋友同行（共8人）可加碼贈送兩公斤白蝦。',
  '免會員，現場出示證件即可', 'none', 'free', 'free_min',
  2, '官方查到的資料是建議提前2天電話預約；有使用者說法是「提前24小時」，兩者略有出入，建議實際致電門市確認。',
  '當月', '限台北市大安區「大安店」；需為當月壽星本人並出示證件；需點兩份單人鍋或一份雙人套餐。',
  '生日當月', 'rolling',
  '[{"url":"https://happybirthday.com.tw/events/430","title":"happybirthday.com.tw 生日優惠整理（引用品牌官方FB公告）","tier":4,"tierLabel":"部落格"}]'::jsonb,
  'pending', false, null
where not exists (select 1 from public.offers where brand = '好食多涮涮鍋（大安店）');

insert into public.offers (
  brand, category, regions, region_note, offer,
  membership, membership_type, membership_cost, free_tier,
  advance_days, advance_note, offer_window, conditions, validity, validity_type,
  sources, status, verified, submitted_by
)
select '臺一牛奶大王', '甜點烘焙', array['台北市']::text[], '目前查到以台北公館店為主，其他分店請自行確認',
  'Ocard 會員：入會禮與生日禮各可兌換一份指定品項（各資料對品項描述略有出入，常見說法為焦糖布丁、冰酒釀優格或紅豆湯），'
    || '需低消滿 $80 才可兌換，且入會禮與生日禮需分兩次結帳，不可同筆使用。',
  'Ocard 會員', 'ocard', 'free', 'free_min',
  null, '建議提前於 Ocard 完成生日資料註冊。',
  '當月', '低消 $80；入會禮、生日禮不可同筆消費疊加，需分開結帳；建議實際登入 Ocard App 核對當期券面品項。',
  '生日當月', 'rolling',
  '[{"url":"https://www.dcard.tw/f/food/p/261083732","title":"Dcard 生日優惠整理","tier":4,"tierLabel":"部落格"}]'::jsonb,
  'pending', false, null
where not exists (select 1 from public.offers where brand = '臺一牛奶大王');

insert into public.offers (
  brand, category, regions, region_note, offer,
  membership, membership_type, membership_cost, free_tier,
  advance_days, advance_note, offer_window, conditions, validity, validity_type,
  sources, status, verified, submitted_by
)
select '花比麵包坊（天成飯店集團）', '甜點烘焙', array['台北市','新北市']::text[],
  '花比麵包坊多店：台北中正區天成店、花園店；新北新店碧潭店 等',
  'Cosmos CLUB App 會員生日禮：花比麵包坊任選蛋糕乙份（現場依當時供應款式而定，官方公告價值約 $120）。'
    || '（另有入會禮：完成註冊送100點紅利點數，輸入邀請碼可再加碼點數——官方近期資料顯示加碼50點，'
    || '惟不同時期活動可能調整，請以 App 內即時公告為準；100點可依點數對應兌換多款花比品項，非固定兌換單一品項。）',
  'App 會員（Cosmos CLUB App）', 'app', 'free', 'free_no_min',
  null, '需下載 Cosmos CLUB App 並完整填寫生日資料才會收到生日禮。',
  '當月', '蛋糕需至指定花比門市自取，各店自取時段不同；與資料庫裡既有的「天成飯店集團」是不同的優惠項目（那筆是飯店住宿類），這筆專指花比麵包坊的蛋糕兌換。',
  '生日當月', 'rolling',
  '[{"url":"https://cosmosapp.tw-cosmos.com/","title":"Cosmos CLUB官方App介紹頁","tier":1,"tierLabel":"品牌官方"},{"url":"https://cosmosapp.tw-cosmos.com/goodsDetail?gid=7","title":"花比麵包坊兌換商品官方頁","tier":1,"tierLabel":"品牌官方"}]'::jsonb,
  'pending', false, null
where not exists (select 1 from public.offers where brand = '花比麵包坊（天成飯店集團）');
