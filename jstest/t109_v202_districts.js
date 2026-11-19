/* v202 問卷（11/18）：「希望加入近哪個捷運站、哪一區（ex 士林區、信義區等等）做搜尋，
   不然光找台北市很難分辨。」→ 只選一個縣市時多一列「行政區」，資料從分店地址來。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t109 v202 行政區篩選');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];
  const row = () => $('#districtRow');
  const chips = () => $$('#districtChips .chip').map((b) => b.textContent.trim());
  const clickChip = (re) => $$('#districtChips .chip').find((b) => re.test(b.textContent)).click();

  // 台北市（含全台）的前三筆當作有分店在內湖、士林
  const ids = win.eval(`OFFERS.filter(o=>matchRegion(o,'台北市',false)).slice(0,3).map(o=>o.id)`);
  t.ok('種子資料有台北市的優惠', ids.length === 3, ids);
  const calls = [];
  let reply = { data: { '內湖區': [ids[0]], '士林區': [ids[1], ids[2]], '萬華區': [999999] }, error: null };
  win.__sb = { rpc: (name, p) => { calls.push([name, p]); return Promise.resolve(reply); } };
  win.localStorage.removeItem('sxr_districts_v1');
  win.eval(`sb = window.__sb; LIVE = true; DIST_CACHE.clear(); activeRegion.clear(); activeDistrict.clear(); render();`);

  t.ok('沒選縣市：沒有行政區那一列', row().classList.contains('hidden'));
  t.eq('沒選縣市不會去問', calls.length, 0);

  $$('#regionChips .chip').find((b) => b.dataset.v === '台北市').click();
  t.ok('選了台北市：那一列出現（先顯示讀取中）', !row().classList.contains('hidden'));
  await tick(win, 3);
  t.eq('只問台北市這一個縣市', calls, [['offer_districts', { p_county: '台北市' }]]);
  t.eq('照筆數排、帶筆數；資料裡沒有的優惠（萬華區）不列',
    chips(), ['全部行政區', '士林區（2）', '內湖區（1）']);
  t.ok('講清楚是看分店地址、捷運站用附近', /分店地址/.test(row().textContent) && /捷運站/.test(row().textContent) && /附近/.test(row().textContent));

  clickChip(/^內湖區/);
  const shown = () => win.eval(`(()=>{ const p=filterPredicate(); return OFFERS.filter(p).map(o=>o.id); })()`);
  t.eq('選內湖區：只剩分店在內湖的', shown(), [ids[0]]);
  t.ok('篩選中那一條看得到「內湖區」', $$('#activeFilters .af-chip').some((b) => /內湖區/.test(b.textContent)));
  t.ok('篩選按鈕的數字算進去（台北市＋內湖區＝2）', $('#filterBadge').textContent === '2', $('#filterBadge').textContent);
  t.ok('筆數那行寫出內湖區', /內湖區/.test($('#count').textContent), $('#count').textContent);

  clickChip(/^士林區/);
  t.eq('可以複選（內湖＋士林）', shown().sort(), ids.slice().sort());

  // 從「篩選中」拿掉士林區
  $$('#activeFilters .af-chip').find((b) => /士林區/.test(b.textContent)).click();
  t.eq('從篩選中拿掉士林區', shown(), [ids[0]]);
  t.ok('面板裡的士林區也彈起來', $$('#districtChips .chip').find((b) => /^士林區/.test(b.textContent)).getAttribute('aria-pressed') === 'false');

  // 記住篩選：重新整理後還在
  win.eval('saveFilters(); activeDistrict.clear(); activeRegion.clear(); DIST_FOR=null; loadFilters(); render();');
  t.eq('重新整理後行政區還在', win.eval('[...activeDistrict]'), ['內湖區']);
  t.eq('…第二次不用再問資料庫（裝置上記一天）', calls.length, 1);

  // 多選一個縣市：行政區不適用，清掉
  $$('#regionChips .chip').find((b) => b.dataset.v === '新北市').click();
  t.ok('選了兩個縣市：那一列收起來', row().classList.contains('hidden'));
  t.eq('…行政區條件一起清掉，不會偷偷擋東西', win.eval('activeDistrict.size'), 0);

  // 換回只有新北市：不會帶著台北市的行政區
  $$('#regionChips .chip').find((b) => b.dataset.v === '台北市').click();
  await tick(win, 3);
  t.eq('換成新北市才去問新北市', calls[calls.length - 1], ['offer_districts', { p_county: '新北市' }]);

  // 函式還沒建：整列不出現，其他照舊
  reply = { data: null, error: { message: 'function public.offer_districts(text) does not exist' } };
  win.localStorage.removeItem('sxr_districts_v1');
  win.eval('DIST_CACHE.clear(); activeRegion.clear(); activeRegion.add("台中市"); render();');
  await tick(win, 3);
  t.ok('問不到：沒有行政區那一列', row().classList.contains('hidden'));
  t.ok('…畫面上不提 SQL', !/SQL|schema|函式/.test(doc.querySelector('#tab-browse').textContent));

  // 全部清除
  reply = { data: { '西屯區': [ids[0]] }, error: null };
  win.eval('DIST_CACHE.clear(); render();');
  await tick(win, 3);
  clickChip(/^西屯區/);
  $('#btnClearFilters').click();
  t.eq('全部清除也清掉行政區', win.eval('activeDistrict.size'), 0);

  /* ---- 商圈：商場自己的壽星禮（問卷 11/01「環球自己有優惠，環球的店家也有優惠，可以疊加」）---- */
  const mall = (b) => win.eval(`isMallOffer({brand:${JSON.stringify(b)}})`);
  t.ok('認得出商場本身', mall('Global Mall 環球購物中心') && mall('ATT 4 fun') && mall('Focus百貨'));
  t.ok('「限○○門市」的是店家，不是商場', !mall('MAGiC TOUCH 樂敘(限夢時代門市)') && !mall('洪瑞珍(限微風南京/南港車站)'));
  t.ok('一般店家、小北百貨不算', !mall('麥當勞') && !mall('小北百貨'));
  win.eval(`(()=>{ const a={...seedOffers()[0], id:990001, brand:'星巴克測試'};
      // 種子資料裡有環球購物中心就用那一筆，沒有才補一筆（不要一個商場出現兩次）
      let g=OFFERS.find(o=>isMallOffer(o) && /環球/.test(o.brand));
      if(!g){ g={...seedOffers()[0], id:990002, brand:'Global Mall 環球購物中心', offer:'100元電子商品禮券'}; OFFERS.push(g); }
      OFFERS.push(a); window.__gid=String(g.id);
      VENUES=[{id:900, name:'中和環球', county:'', lat:null, lng:null, offer_count:2, is_public:true}];
      VENUE_PAIRS=new Map([[900, new Set(['990001', window.__gid])]]);
      $('#venueCounty').value=''; VENUE_OPEN=900; renderVenues(); })()`);
  await tick(win, 3);
  const vhead = $('#venueList .venue-head').textContent;
  t.ok('商圈標題看得到「商場禮」', /商場禮/.test(vhead), vhead);
  const brands = $$('#venueBody900 .vo-brand').map((x) => x.textContent);
  t.eq('商場自己的排最上面', brands, ['Global Mall 環球購物中心', '星巴克測試']);
  const note = ($('#venueBody900 .venue-mall-note') || {}).textContent || '';
  t.ok('講清楚可以跟店家的一起拿', /環球購物中心/.test(note) && /一起拿/.test(note), note);
  // 商場的座標不在範圍內，但商圈名字對得上（實測：中和環球、板橋車站・環球原本都漏掉）
  win.eval('VENUE_PAIRS=new Map([[900, new Set(["990001"])]]); renderVenues();');
  await tick(win, 3);
  t.eq('範圍內沒有、但名字有「環球」：一樣補上、排最上面',
    $$('#venueBody900 .vo-brand').map((x) => x.textContent), ['Global Mall 環球購物中心', '星巴克測試']);
  t.ok('…標題也有商場禮', /商場禮/.test($('#venueList .venue-head').textContent));
  win.eval('VENUES[0].name="新莊中正路"; renderVenues();');
  await tick(win, 3);
  t.ok('沒有商場禮的商圈：沒有提示、沒有標籤',
    !$('#venueBody900 .venue-mall-note') && !/商場禮/.test($('#venueList .venue-head').textContent));

  /* ---- 資料庫那支：抓行政區的規則 ---- */
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema_v202_districts.sql'), 'utf8');
  t.ok('anon 可以呼叫', /grant execute on function public\.offer_districts\(text\) to anon/.test(sql));
  t.ok('隱藏、歇業的分店不算', /not s\.hidden/.test(sql) && /CLOSED_PERMANENTLY/.test(sql));
  const tr = sql.match(/translate\(p_addr,\s*'([^']+)',\s*'([^']+)'\)/);
  t.ok('簡繁對照兩邊一樣長', !!tr && [...tr[1]].length === [...tr[2]].length);
  t.ok('「后」不換（台中后里區）', !!tr && !tr[1].includes('后'));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
