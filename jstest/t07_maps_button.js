/* 「在 Google 地圖找附近分店」按鈕（celine 回饋：多一個連到 Google Map 的按鈕）

   不需要分店資料，直接用品牌名稱開 Google 地圖搜尋，所以跟 feature/geo 的「附近」功能
   分開、可以先上線。這支驗：
   - 每張卡片都有地圖按鈕、網址是 Google 地圖搜尋、品牌名稱有正確編碼
   - 點地圖按鈕不能順便打開卡片詳情（卡片整張可以點）
   - 搜尋字的整理規則：「限XX店」要帶店名、括號英文名去掉、只有一個縣市才帶縣市
   - 詳情視窗也有同一顆按鈕 */
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t07 Google 地圖按鈕');
  const { win } = await boot();
  const doc = win.document;

  /* ---- 搜尋字整理規則 ---- */
  const q = (brand, regions) => win.mapsSearchQuery({ brand, regions });
  t.eq('一般品牌、全台：只搜品牌', q('麥當勞', ['全台']), '麥當勞');
  t.eq('多個縣市：不帶縣市，交給 Google 用使用者位置排', q('季緣', ['台北市', '台中市']), '季緣');
  t.eq('只有一個縣市：帶縣市', q('善菓屋 ARTISAN BAKERY', ['新北市']), '善菓屋 ARTISAN BAKERY 新北市');
  t.eq('「限XX店」帶店名、不帶「限」字', q('紅茶老爹(限板橋裕民店)', ['新北市']), '紅茶老爹 板橋裕民店 新北市');
  t.eq('全形括號的限定店也一樣', q('好食多涮涮鍋（限大安店）', []), '好食多涮涮鍋 大安店');
  t.eq('括號裡的英文名去掉', q('屋莎洋食鬆餅屋（Woosa）', ['台北市', '新北市']), '屋莎洋食鬆餅屋');
  t.eq('品牌名稱已經含縣市就不重複帶', q('台中長榮桂冠酒店 咖啡廳（自助百匯）', ['台中市']), '台中長榮桂冠酒店 咖啡廳');
  t.eq('沒有地區資料也不會壞', q('臺虎精釀', null), '臺虎精釀');
  t.ok('網址是 Google 地圖搜尋、中文有編碼',
    win.mapsSearchUrl({ brand: '麥當勞', regions: ['全台'] }) ===
      'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('麥當勞'));

  /* ---- 卡片 ---- */
  const cards = [...doc.querySelectorAll('#grid .card')];
  const btns = [...doc.querySelectorAll('#grid .card .act-map')];
  t.ok('每張卡片都有地圖按鈕', cards.length > 0 && btns.length === cards.length, { cards: cards.length, btns: btns.length });
  const first = btns[0];
  t.ok('開新分頁、rel=noopener', first.target === '_blank' && /noopener/.test(first.rel), { target: first.target, rel: first.rel });
  const brand = cards[0].querySelector('h3').textContent;
  t.ok('卡片按鈕的網址帶的是這張卡片的品牌',
    decodeURIComponent(first.href.split('query=')[1]).startsWith(brand.replace(/[（(][^）)]*[）)]/g, ' ').replace(/\s+/g, ' ').trim()),
    { brand, href: decodeURIComponent(first.href) });

  const opened = [];
  const real = win.openDetail;
  win.openDetail = (id) => opened.push(id);
  first.addEventListener('click', (e) => e.preventDefault());   // jsdom 不支援真的導頁
  first.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  await tick(win, 1);
  win.openDetail = real;
  t.eq('點地圖按鈕不會打開卡片詳情', opened.length, 0);

  /* ---- 詳情視窗 ---- */
  const html = win.eval('offerFactsHtml(OFFERS[0])');
  const box = doc.createElement('div');
  box.innerHTML = html;
  const dtl = box.querySelector('.dtl-map');
  t.ok('詳情視窗有地圖按鈕', !!dtl);
  t.ok('詳情按鈕網址跟卡片用同一套規則', dtl && dtl.href === win.eval('mapsSearchUrl(OFFERS[0])'));
  t.eq('沒有品牌的空資料不畫按鈕', win.eval("offerFactsHtml({timing:'當月',regions:[],sources:[]})").includes('dtl-map'), false);

  /* ================= 功能介紹小卡（celine）================= */
  const tip = doc.querySelector('#mapTipBanner');
  t.ok('介紹卡在優惠列表裡、在卡片上面', !!tip && !!tip.closest('#tab-browse')
    && (tip.compareDocumentPosition(doc.querySelector('#grid')) & 4) === 4);
  win.localStorage.removeItem('sxr_map_tip_done');
  win.renderMapTip();
  t.ok('還沒看過時會顯示', !tip.classList.contains('hidden'));
  t.ok('介紹卡講的是地圖按鈕', /地圖/.test(tip.textContent) && /分店/.test(tip.textContent), tip.textContent);
  doc.querySelector('#btnDismissMapTip').click();
  t.ok('按 ✕ 收起來', tip.classList.contains('hidden'));
  win.renderMapTip();
  t.ok('看過之後不再出現', tip.classList.contains('hidden'));

  // 按過地圖按鈕也當作知道了
  win.localStorage.removeItem('sxr_map_tip_done');
  win.renderMapTip();
  doc.querySelector('#grid .act-map').click();
  t.ok('按過地圖按鈕就不用再提醒', tip.classList.contains('hidden')
    && !!win.localStorage.getItem('sxr_map_tip_done'));

  // 列表空的時候不講（沒有卡片可以指）
  win.localStorage.removeItem('sxr_map_tip_done');
  const grid = doc.querySelector('#grid');
  const keep = grid.innerHTML;
  grid.innerHTML = '';
  win.renderMapTip();
  t.ok('列表沒有卡片時不顯示', tip.classList.contains('hidden'));
  grid.innerHTML = keep;

  /* ================= 排行榜站台數據：上榜人數 → 已上架店家（celine）================= */
  win.renderBoardStats([{ saved_total: 100 }], [{ report_count: 2, success_count: 1, brand: 'x' }], null, null, null, 0);
  const stats = doc.querySelector('#boardStats').textContent;
  const brands = win.eval('new Set(OFFERS.map(o=>o.brand).filter(Boolean)).size');
  t.ok('站台數據不再顯示「上榜人數」', !/上榜人數/.test(stats), stats);
  t.ok('改成顯示「已上架店家」', new RegExp(brands + '\\s*已上架店家').test(stats), { brands, stats });

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
