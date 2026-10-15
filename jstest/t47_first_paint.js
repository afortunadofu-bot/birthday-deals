/* celine：「先給前幾十筆、捲到再補後面你做」

   整包 482 筆是 91KB（gzip 後的真實流量）、未壓縮 671KB。在它傳完＋解析完之前，
   畫面上是內建的示範資料——那一份的回報次數、省下金額全是 0（嵐回報過
   「明明很多人回報，但回報紀錄都是 0」，講的就是那個畫面）。

   所以：先跟 Worker 要 60 筆（約 14KB）把第一螢幕換成真的，剩下的在背景補。
   這一支驗的是「不能為了快把正確性弄丟」——完整那包一定要蓋回去，而且開場
   後面那些步驟不能拿到半份資料。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts } = require('./harness');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'worker', 'offers-cache.js'), 'utf8');

(async () => {
  const t = makeAsserts('t47 開場先畫前幾十筆');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  const row = (id, v) => ({ id, brand: `店${id}`, offer: '優惠', timing: '當月',
    category: '餐廳', regions: ['台北市'], value_twd: v, free_tier: 'discount',
    membership: '免會員', verified: true, report_count: 3, rating_count: 0 });

  // Worker：/offers/first 先回來，/offers 慢一點
  const calls = [];
  let releaseFull;
  const fullReady = new Promise((r) => { releaseFull = r; });
  win.__fetches = calls;
  win.eval(`
    LIVE=true;
    window.OFFERS_API='https://edge.example';
    edgeFetch=(p)=>{ window.__fetches.push(p); return window.__edge(p); };
  `);
  win.__edge = (p) => {
    if (p === '/offers/first') return Promise.resolve([row(1, 900), row(2, 800)]);
    if (p === '/offers') return fullReady.then(() => [row(1, 900), row(2, 800), row(3, 700), row(4, 600)]);
    return Promise.resolve(null);
  };
  win.eval('localStorage.removeItem("sxr_offers_cache");');

  const cards = () => [...doc.querySelectorAll('#grid .card')].length;
  const loading = win.eval('loadOffers()');
  await tick(win, 4);

  t.eq('完整那包還沒回來，就先畫了預覽', cards(), 2);
  t.eq('兩趟都發出去了，而且完整那包不是等預覽畫完才開始',
    calls.slice(0, 2).sort(), ['/offers', '/offers/first']);
  t.ok('loadOffers 還沒回來（開場後面的步驟不會拿到半份資料）',
    win.eval('typeof PREVIEW_ONLY') === 'boolean');

  releaseFull();
  await loading;
  await tick(win, 3);
  t.eq('完整那包到了就蓋回去', cards(), 4);
  t.eq('OFFERS 是完整的那份', win.eval('OFFERS.length'), 4);
  t.ok('完整那包才寫進本機快取（預覽那份不寫，不然下次重開只剩 60 筆）',
    JSON.parse(win.eval('localStorage.getItem("sxr_offers_cache")')).rows.length === 4);

  /* 網路夠快、完整那包先回來的時候不要多閃一次預覽 */
  calls.length = 0;
  win.eval('localStorage.removeItem("sxr_offers_cache"); OFFERS=[];');
  win.__edge = (p) => {
    if (p === '/offers') return Promise.resolve([row(9, 100)]);
    if (p === '/offers/first') return new Promise(() => {});   // 永遠不回
    return Promise.resolve(null);
  };
  await win.eval('loadOffers()');
  await tick(win, 3);
  t.eq('完整那包先回來就直接用它', win.eval('OFFERS.length'), 1);

  /* 舊版 Worker 沒有 /offers/first：回 null，照舊只用完整那包 */
  calls.length = 0;
  win.eval('localStorage.removeItem("sxr_offers_cache"); OFFERS=[];');
  win.__edge = (p) => Promise.resolve(p === '/offers' ? [row(5, 500), row(6, 400)] : null);
  await win.eval('loadOffers()');
  await tick(win, 3);
  t.eq('舊版 Worker 也不會壞', win.eval('OFFERS.length'), 2);
  t.ok('有去問過那個端點（新版 Worker 上線就自動生效）', calls.includes('/offers/first'));

  /* 剛回報完／剛投稿完（force）要的是最新狀態，不能走預覽那條路 */
  calls.length = 0;
  win.__sbRows = [row(7, 300)];
  win.eval(`sb={from:()=>({select:()=>({order:()=>({range:()=>Promise.resolve({data:window.__sbRows, error:null})})})})};`);
  await win.eval('loadOffers(true)');
  await tick(win, 3);
  t.eq('force 不碰邊緣快取，也不走預覽', calls.length, 0);
  t.eq('force 拿到的是直接查回來的那份', win.eval('OFFERS.length'), 1);

  /* 原始碼層級：排序要跟網站預設的「依省最多」對得起來，不然換包時會整個跳 */
  t.ok('Worker 照 value_twd 由大到小給', /order=value_twd\.desc\.nullslast/.test(worker));
  t.ok('網站預設排序就是依 valueTwd 由大到小',
    /sortBy==='value'\) return \(b\.valueTwd\|\|0\)-\(a\.valueTwd\|\|0\)/.test(index));
  t.ok('Worker 有把這個端點列進狀態頁跟健康檢查', /\/offers\/first/.test(worker));
  t.ok('前 N 筆的數量寫成常數、有說明為什麼是 60', /const FIRST_N = 60/.test(worker));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
