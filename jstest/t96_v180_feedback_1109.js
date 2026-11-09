/* v180：11/07–11/08 的問題回報／建議
   林彥華：負向篩選、正向篩選會篩掉資料不全的、隱藏已去過回報過的、地圖選地點附近的清單
   陳：簡易版待辦清單一個字一行；襪子：無法定位 */
const { boot, tick, makeAsserts, stubHeavy } = require('./harness');

const base = {
  category: '速食', regions: ['台北市'], membership: '', membershipCost: 'free', freeTier: 'free_min',
  timing: '當月', valueTwd: 60, conditions: '', validity: '', validityType: 'rolling', sources: [],
  bestSource: null, status: 'approved', reportCount: 0, commentCount: 0, ratingAvg: null, ratingCount: 0,
  wishCount: 0, transferable: 'no', advanceNote: '', membershipType: 'app', advanceDays: 0, hours: null,
};
const OFFERS = [
  { ...base, id: 1, brand: '速食A' },
  { ...base, id: 2, brand: '火鍋B', category: '火鍋', advanceDays: null },              // 沒寫提前天數
  { ...base, id: 3, brand: '美妝C', category: '零售美妝', advanceDays: 7 },              // 寫了、不符合
  { ...base, id: 4, brand: '飲料D', category: '飲料', transferable: 'unknown' },
  { ...base, id: 5, brand: '飲料E', category: '飲料', transferable: 'yes' },
];

(async () => {
  const t = makeAsserts('t96 v180：11/07–11/08 回饋');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];
  stubHeavy(win, ['loadMyVenueSuggestions', 'loadPendingBadge', 'maybeShowBirthdayCheer', 'renderReminders']);
  win.__offers = OFFERS;
  win.eval('OFFERS = window.__offers.map(o=>({...o})); me=null; MY_USED_OFFER_IDS=new Set(); buildControls(); render();');
  const shown = () => JSON.parse(win.eval('JSON.stringify(OFFERS.filter(filterPredicate()).map(o=>o.id))'));
  const chips = () => JSON.parse(win.eval('JSON.stringify(activeFilterChips().map(c=>c.label))'));

  /* ---- 負向篩選 ---- */
  t.eq('「不看」那一排：都看＋每個分類', $$('#catsEx .chip').map((c) => c.textContent), ['都看', '速食', '火鍋', '飲料', '零售美妝']);
  $$('#catsEx .chip').find((c) => c.dataset.v === '飲料').click();
  $$('#catsEx .chip').find((c) => c.dataset.v === '零售美妝').click();
  t.eq('不看飲料、美妝', shown(), [1, 2]);
  t.ok('「篩選中」寫「不看飲料」', chips().includes('不看飲料'));
  t.eq('篩選數字算進去', $('#filterBadge').textContent, '2');
  win.eval('activeFilterChips().find(c=>c.label==="不看飲料").drop(); render();');
  t.eq('從「篩選中」拿掉一個', shown(), [1, 2, 4, 5]);
  t.ok('面板裡那顆也彈起來', $$('#catsEx .chip').find((c) => c.dataset.v === '飲料').getAttribute('aria-pressed') === 'false');
  $('#btnClearFilters').click();
  t.eq('清除篩選一起清', shown(), [1, 2, 3, 4, 5]);

  /* ---- 資料沒寫的也列出來 ---- */
  t.ok('沒用到嚴格的篩選：不出現', $('#fKeepUnknownWrap').classList.contains('hidden'));
  $('#fNoAdvance').checked = true; $('#fNoAdvance').dispatchEvent(new win.Event('input'));
  t.ok('勾了「不用提前加入」：出現', !$('#fKeepUnknownWrap').classList.contains('hidden'));
  t.eq('不用提前加入：沒寫的（火鍋B）本來被篩掉', shown(), [1, 4, 5]);
  $('#fKeepUnknown').checked = true; $('#fKeepUnknown').dispatchEvent(new win.Event('input'));
  t.eq('資料沒寫的也列出來：火鍋B 回來，寫了 7 天的美妝C 還是不列', shown(), [1, 2, 4, 5]);
  $('#fNoAdvance').checked = false;
  $('#fTransferable').checked = true; $('#fTransferable').dispatchEvent(new win.Event('input'));
  t.eq('不用本人證件＋沒寫也列：寫「要」的不列、沒寫的列', shown(), [4, 5]);
  $('#fKeepUnknown').checked = false; win.eval('render()');
  t.eq('不用本人證件（嚴格）：只有寫「不用」的', shown(), [5]);
  $('#btnClearFilters').click();

  /* ---- 營業時間也吃這個勾 ---- */
  win.eval(`HOURS_AVAIL=false; OFFERS[0].hours=[[0,10080]]; HOURS_F={mode:'now',dow:null,min:null}; render();`);
  t.eq('現在有開（嚴格）：只有填了 24 小時的', shown(), [1]);
  $('#fKeepUnknown').checked = true; win.eval('render()');
  t.eq('現在有開＋沒寫也列：沒填營業時間的也列', shown(), [1, 2, 3, 4, 5]);
  t.ok('「幾筆」那行改寫「含 N 筆沒寫營業時間的」', /含 4 筆沒寫營業時間的/.test($('#count').textContent), $('#count').textContent);
  $('#btnClearFilters').click();
  win.eval('OFFERS[0].hours=null;');

  /* ---- 隱藏我回報用過的 ---- */
  t.ok('沒登入：不出現', $('#fHideUsedWrap').classList.contains('hidden'));
  win.eval("me={id:'u-1'}; MY_USED_OFFER_IDS=new Set(['2','5']); render();");
  t.ok('登入、回報過：出現', !$('#fHideUsedWrap').classList.contains('hidden'));
  $('#fHideUsed').checked = true; $('#fHideUsed').dispatchEvent(new win.Event('input'));
  t.eq('隱藏回報過的 2、5', shown(), [1, 3, 4]);
  t.ok('「篩選中」看得到', chips().includes('隱藏我用過的'));

  /* ---- 記住 ---- */
  $$('#catsEx .chip').find((c) => c.dataset.v === '火鍋').click();
  $('#fKeepUnknown').checked = true;
  win.eval('saveFilters(); activeCatEx.clear(); document.querySelector("#fHideUsed").checked=false; document.querySelector("#fKeepUnknown").checked=false; loadFilters();');
  t.ok('重新打開還記得', win.eval('activeCatEx.has("火鍋") && document.querySelector("#fHideUsed").checked && document.querySelector("#fKeepUnknown").checked'));
  $('#btnClearFilters').click();

  /* ---- 附近：查這一區 ---- */
  win.eval(`L={latLng:(a,b)=>({lat:a,lng:b})}; NEAR.lat=25.04; NEAR.lng=121.51; NEAR.km=3; NEAR.loading=false;
    NEAR_MAP={getCenter:()=>window.__c, distance:(a,b)=>Math.hypot((a.lat-b.lat)*111000,(a.lng-b.lng)*101000)};`);
  win.__c = { lat: 25.0401, lng: 121.5101 };
  win.eval('syncNearHereBtn()');
  t.ok('地圖只動一點點：不出現', $('#btnNearHere').classList.contains('hidden'));
  win.__c = { lat: 25.06, lng: 121.53 };
  win.eval('syncNearHereBtn()');
  t.ok('拖到 2 公里外：出現「查這一區的優惠」', !$('#btnNearHere').classList.contains('hidden') && /查這一區/.test($('#btnNearHere').textContent));
  let called = null;
  win.eval('setNearCenter=(a,b,l)=>{ window.__set=[a,b,l]; };');
  win.eval(`document.querySelector('#btnNearHere').onclick=()=>{ const c=NEAR_MAP.getCenter(); document.querySelector('#btnNearHere').classList.add('hidden'); setNearCenter(c.lat,c.lng,'地圖中間'); };`);
  // 上面是同一段 onclick（openNearMap 在 jsdom 裡跑不起來，Leaflet 沒載），確認原始碼真的這樣綁
  const idx = win.document.documentElement.outerHTML.indexOf("$('#btnNearHere').onclick=()=>{");
  t.ok('原始碼：按下去拿地圖中間當查詢位置', idx > 0);
  $('#btnNearHere').click();
  called = JSON.parse(win.eval('JSON.stringify(window.__set)'));
  t.eq('按下去：用地圖中間重查', called, [25.06, 121.53, '地圖中間']);

  /* ---- 定位失敗說清楚 ---- */
  const geo = (ua, code) => win.eval(`(()=>{ Object.defineProperty(navigator,'userAgent',{value:${JSON.stringify(ua)},configurable:true}); return geoFailText({code:${code}}); })()`);
  t.ok('LINE 裡開的：叫人用瀏覽器開', /用瀏覽器開啟/.test(geo('Mozilla/5.0 (iPhone) Line/13.0', 1)));
  t.ok('Threads 裡開的（UA 是 Barcelona）', /用瀏覽器開啟/.test(geo('Mozilla/5.0 (iPhone) Barcelona 300.0', 1)));
  t.ok('iPhone 拒絕：講設定在哪', /定位服務/.test(geo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari', 1)));
  t.ok('Android 拒絕：講鎖頭→權限', /鎖頭/.test(geo('Mozilla/5.0 (Linux; Android 14) Chrome', 1)));
  t.ok('逾時', /太久/.test(geo('Mozilla/5.0 (Linux; Android 14) Chrome', 3)));

  /* ---- 簡易版待辦清單 ---- */
  const css = [...doc.querySelectorAll('style')].map((x) => x.textContent).join('\n');
  t.ok('待辦清單第一行可以換行（按鈕太多就整排換下去）', /\.wl-top\{[^}]*flex-wrap:wrap/.test(css));
  t.ok('店名至少留 7 個字寬，不會被擠成一個字一行', /\.wl-name\{flex:1 1 7em/.test(css));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
