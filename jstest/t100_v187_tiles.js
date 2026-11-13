/* v187 celine：「先繼續砍好了」。11/11 中午一小時還剩 801 個請求，其中：
   - 附近地圖拖動＋清單跟著地圖：直接問 Supabase 約 120 次（加上 OPTIONS），每個人各問各的
     → 改成固定的格子（/tile，一格 0.025 度），同一格 Cloudflare 存 30 分鐘大家共用
   - Worker 的 /boot：公告＋顯示開關各 40 次 → Worker 存 10 分鐘（瀏覽器只留 1 分鐘）
   - Worker 轉送事件：20 秒一批 → 25 秒（waitUntil 最多撐 30 秒） */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts } = require('./harness');

function loadWorker() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'offers-cache.js'), 'utf8');
  const file = path.join(require('os').tmpdir(), `offers-cache-v187-${Date.now()}.cjs`);
  fs.writeFileSync(file, src.replace(/export default handler;?/, 'module.exports = handler;'));
  const mod = require(file);
  fs.unlinkSync(file);
  return { mod, src };
}

const T = 0.025;
const STORES = [
  { store_id: 1, offer_id: 10, name: 'A 忠孝店', address: 'a', place_id: 'p1', lat: 25.0400, lng: 121.5100 },
  { store_id: 2, offer_id: 10, name: 'A 南京店', address: 'b', place_id: 'p2', lat: 25.0500, lng: 121.5100 },
  { store_id: 3, offer_id: 11, name: 'B 格線上', address: 'c', place_id: 'p3', lat: 25.0500, lng: 121.5250 },   // 剛好在經度格線上
  { store_id: 4, offer_id: 12, name: 'C 太遠', address: 'd', place_id: 'p4', lat: 25.0700, lng: 121.5100 },
  { store_id: 5, offer_id: 11, name: 'B 最近', address: 'e', place_id: 'p5', lat: 25.0420, lng: 121.5120 },
];
// 跟資料庫一樣：between 兩端都算，所以壓在格線上的店兩格都會出現
const inTile = (s, y, x) => s.lat >= y * T - 1e-9 && s.lat <= (y + 1) * T + 1e-9 && s.lng >= x * T - 1e-9 && s.lng <= (x + 1) * T + 1e-9;

(async () => {
  const t = makeAsserts('t100 v187：地圖格子、/boot 10 分鐘');

  /* ================= Worker ================= */
  const { mod: worker, src: wsrc } = loadWorker();
  const store = new Map();
  globalThis.caches = { default: {
    async match(req) { const h = store.get(req.url); return h ? h.clone() : undefined; },
    async put(req, res) { store.set(req.url, res.clone()); },
  } };
  const ctx = { waitUntil: (p) => p };
  let up = [];
  globalThis.fetch = async (url, init) => {
    up.push({ url: String(url), body: init && init.body ? JSON.parse(init.body) : null });
    if (String(url).includes('current_announcement')) return Response.json([]);
    if (String(url).includes('site_settings')) return Response.json([{ key: 'show_coffee', enabled: true }]);
    return Response.json([{ store_id: 1, offer_id: 10, lat: 25.04, lng: 121.51 }]);
  };
  const get = (p) => worker.fetch(new Request('https://api.test' + p), {}, ctx);

  let res = await get('/tile?y=1001&x=4860');
  const body = await res.json();
  t.ok('/tile：問 offer_stores_in_bounds', res.status === 200 && up.length === 1 && up[0].url.endsWith('/rest/v1/rpc/offer_stores_in_bounds'), JSON.stringify(up));
  const b = up[0].body;
  t.ok('範圍就是那一格（0.025 度）',
    Math.abs(b.p_south - 25.025) < 1e-9 && Math.abs(b.p_north - 25.05) < 1e-9
    && Math.abs(b.p_west - 121.5) < 1e-9 && Math.abs(b.p_east - 121.525) < 1e-9 && b.p_limit === 1000, JSON.stringify(b));
  t.ok('回的是 {at, data}', body.at && Array.isArray(body.data) && body.data.length === 1);
  // v193：格子 30 分鐘 → 6 小時（分店一天變不到幾家；11/12～13 一天 Worker 為了格子問了 2,519 次）
  t.ok('格子存 6 小時，瀏覽器也一樣', /max-age=21600/.test(res.headers.get('cache-control')), res.headers.get('cache-control'));
  await new Promise((r) => setTimeout(r, 5));
  up = [];
  res = await get('/tile?y=1001&x=4860');
  t.ok('同一格第二個人：Cloudflare 那份，不碰 Supabase', res.headers.get('x-cache') === 'HIT' && up.length === 0);
  res = await get('/tile?y=1001&x=4861');
  t.eq('隔壁那一格：另外問', up.length, 1);
  up = [];
  t.eq('格子編號不是整數：400', (await get('/tile?y=1001.5&x=4860')).status, 400);
  t.eq('台灣以外的格子：400', (await get('/tile?y=1&x=4860')).status, 400);
  t.eq('少帶參數：400', (await get('/tile?y=1001')).status, 400);
  t.eq('上面三個都沒碰 Supabase', up.length, 0);
  const status = await (await get('/')).json();
  t.ok('狀態頁列得出 /tile', (status.paths || []).includes('/tile'), JSON.stringify(status.paths));

  /* /boot：Worker 自己存 10 分鐘，瀏覽器 60 秒 */
  res = await get('/boot');
  t.eq('/boot 給瀏覽器的是 60 秒', res.headers.get('cache-control'), 'public, max-age=60');
  await new Promise((r) => setTimeout(r, 5));
  const kept = store.get('https://api.test/__cache/boot/fresh');
  t.eq('Worker 自己存的那份是 10 分鐘', kept && kept.headers.get('cache-control'), 'public, max-age=600');
  up = [];
  res = await get('/boot');
  t.ok('命中時給瀏覽器的也是 60 秒（不是存的那份的 600）',
    res.headers.get('x-cache') === 'HIT' && res.headers.get('cache-control') === 'public, max-age=60' && up.length === 0);
  res = await get('/offers/first');
  t.eq('其他端點不受影響（照舊 30 分鐘）', res.headers.get('cache-control'), 'public, max-age=1800');
  t.ok('事件攢 25 秒一批（waitUntil 最多 30 秒，不能再長）', /const EV_HOLD_MS_DEFAULT = 25000;/.test(wsrc));
  delete globalThis.caches;

  /* ================= 網站 ================= */
  const { win } = await boot();
  win.console.warn = () => {};
  win.__stores = STORES;
  win.__tileReqs = [];
  win.__tileMode = 'ok';
  win.eval(`window.OFFERS_API='https://api.example'; TILE_CACHE.clear(); TILE_OK=true;
    window.fetch=(u)=>{
      const m=String(u).match(/\\/tile\\?y=(-?\\d+)&x=(-?\\d+)$/);
      if(!m) return Promise.reject(new Error('unexpected '+u));
      window.__tileReqs.push(m[1]+'_'+m[2]);
      if(window.__tileMode==='404') return Promise.resolve({ok:false, status:404, json:()=>Promise.resolve({})});
      const y=+m[1], x=+m[2], T=${T};
      let rows=window.__stores.filter(s=>s.lat>=y*T-1e-9 && s.lat<=(y+1)*T+1e-9 && s.lng>=x*T-1e-9 && s.lng<=(x+1)*T+1e-9);
      if(window.__tileMode==='big') rows=Array.from({length:1000},(_,i)=>({store_id:9000+i, offer_id:10, lat:y*T, lng:x*T}));
      return Promise.resolve({ok:true, status:200, json:()=>Promise.resolve({at:'x', data:rows})});
    };`);

  /* ---- storesFromTiles ---- */
  let r = await win.eval('storesFromTiles(25.03, 121.50, 25.05, 121.53)');
  t.eq('畫面 25.03～25.05、121.50～121.53：拿 4 格', win.__tileReqs.slice().sort(), ['1001_4860', '1001_4861', '1002_4860', '1002_4861']);
  const ids = r.rows.map((s) => s.store_id).sort();
  t.eq('格線上的店只算一次（4 格裡的店都拿到，畫面外的由畫圖那邊再篩）', ids, [1, 2, 3, 4, 5]);
  t.ok('拿到的範圍是那幾格拼起來', Math.abs(r.box.s - 25.025) < 1e-9 && Math.abs(r.box.n - 25.075) < 1e-9
    && Math.abs(r.box.w - 121.5) < 1e-9 && Math.abs(r.box.e - 121.55) < 1e-9, JSON.stringify(r.box));
  win.__tileReqs = [];
  await win.eval('storesFromTiles(25.031, 121.501, 25.049, 121.529)');
  t.eq('拖回同一塊：一格都不用再拿', win.__tileReqs.length, 0);
  t.eq('範圍太大（超過 16 格）：不走格子', await win.eval('storesFromTiles(24.9, 121.3, 25.2, 121.7)'), null);
  t.eq('…而且一格都沒拿', win.__tileReqs.length, 0);
  t.ok('網站跟 Worker 的格子一樣大', /TILE_DEG=0\.025/.test(win.document.documentElement.outerHTML) || win.eval('TILE_DEG') === 0.025);

  /* ---- nearestFromTiles：跟 nearest_offer_stores 同樣的答案 ---- */
  win.eval('TILE_CACHE.clear();');
  win.__tileReqs = [];
  const near = await win.eval('nearestFromTiles(25.04, 121.51, 3)');
  const byOffer = Object.fromEntries(near.map((x) => [x.offer_id, x]));
  t.eq('每筆優惠只留一家（3 公里外的 C 不算）', Object.keys(byOffer).sort(), ['10', '11']);
  t.eq('A：最近的是忠孝店、距離 0', [byOffer[10].store_id, Math.round(byOffer[10].distance_m)], [1, 0]);
  t.eq('A：3 公里內共 2 家', byOffer[10].stores_within, 2);
  t.eq('B：最近的是「B 最近」', byOffer[11].store_id, 5);
  t.ok('B：距離算得對（約 290 公尺）', Math.abs(byOffer[11].distance_m - 290) < 15, byOffer[11].distance_m);
  t.eq('B：3 公里內共 2 家（格線上那家沒有算兩次）', byOffer[11].stores_within, 2);
  t.ok('名稱、地址、place_id 都帶著（卡片上的「最近分店」、導航連結要用）',
    byOffer[11].name === 'B 最近' && byOffer[11].address === 'e' && byOffer[11].place_id === 'p5');
  t.ok('3 公里：9 格以內', win.__tileReqs.length > 0 && win.__tileReqs.length <= 16, win.__tileReqs.length);
  win.__tileReqs = [];
  t.eq('5 公里：太大，不走格子（照原本問資料庫）', await win.eval('nearestFromTiles(25.04, 121.51, 5)'), null);
  t.eq('…而且一格都沒拿', win.__tileReqs.length, 0);

  /* ---- loadNear：走格子時不問資料庫 ---- */
  win.__rpc = [];
  win.eval(`sb={ rpc:(n,p)=>{ window.__rpc.push(n); return Promise.resolve({data:[{offer_id:99, distance_m:1, stores_within:1, name:'rpc'}], error:null}); } };
    render=()=>{}; renderNearBar=()=>{}; NEAR.active=true; NEAR.lat=25.04; NEAR.lng=121.51; NEAR.km=3; NEAR.reqSeq=0;`);
  await win.eval('loadNear()');
  t.ok('清單：沒有問 nearest_offer_stores', win.__rpc.length === 0, JSON.stringify(win.__rpc));
  t.eq('清單：拿到的是格子算出來的', win.eval('[...NEAR.byOffer.keys()].sort().join(",")'), '10,11');
  win.eval('NEAR.km=10;');
  await win.eval('loadNear()');
  t.ok('10 公里：照原本問資料庫', win.__rpc.join() === 'nearest_offer_stores' && win.eval('NEAR.byOffer.has("99")'));

  /* ---- loadNearPins：走格子 ---- */
  win.__rpc = [];
  win.__painted = 0;
  win.__b = { getSouth: () => 25.03, getWest: () => 121.50, getNorth: () => 25.05, getEast: () => 121.53 };
  win.eval(`NEAR_PIN_KEY=''; NEAR_PIN_BOX=null; NEAR_PIN_ROWS=[]; paintNearPins=()=>{ window.__painted++; };
    NEAR_MAP={ getZoom:()=>15, getBounds:()=>window.__b };`);
  await win.eval('loadNearPins()');
  t.ok('地圖：沒有問 offer_stores_in_bounds', win.__rpc.length === 0 && win.__painted === 1, JSON.stringify(win.__rpc));
  t.eq('地圖：手上的是格子裡的店', win.eval('NEAR_PIN_ROWS.map(s=>s.store_id).sort((a,b)=>a-b).join(",")'), '1,2,3,4,5');
  win.__b = { getSouth: () => 25.032, getWest: () => 121.502, getNorth: () => 25.052, getEast: () => 121.532 };
  await win.eval('loadNearPins()');
  t.ok('拖一點點（還在拿到的格子裡）：直接重畫', win.__rpc.length === 0 && win.__painted === 2);

  /* ---- 退路 ---- */
  win.eval(`TILE_CACHE.clear(); NEAR_PIN_KEY=''; NEAR_PIN_BOX=null;`);
  win.__tileMode = 'big';
  t.eq('有一格滿 1000 家（被截斷）：不用格子', await win.eval('storesFromTiles(25.03, 121.50, 25.05, 121.53)'), null);
  await win.eval('loadNearPins()');
  t.eq('…地圖照原本直接問資料庫', win.__rpc.join(), 'offer_stores_in_bounds');
  win.eval(`TILE_CACHE.clear(); NEAR_PIN_KEY=''; NEAR_PIN_BOX=null;`);
  win.__tileMode = '404';
  win.__tileReqs = [];
  t.eq('Worker 還沒更新（/tile 404）：不用格子', await win.eval('storesFromTiles(25.03, 121.50, 25.05, 121.53)'), null);
  t.eq('…而且這次造訪不再試', win.eval('TILE_OK'), false);
  const n404 = win.__tileReqs.length;
  await win.eval('storesFromTiles(25.03, 121.50, 25.05, 121.53)');
  t.eq('…下一次一格都沒拿', win.__tileReqs.length, n404);
  win.eval(`TILE_OK=true; TILE_CACHE.clear(); window.OFFERS_API='';`);
  win.__tileReqs = [];
  t.eq('沒設 Worker：不用格子', await win.eval('storesFromTiles(25.03, 121.50, 25.05, 121.53)'), null);
  t.eq('…一格都沒拿', win.__tileReqs.length, 0);

  /* ---- 顯示開關、資料庫活著沒 ---- */
  t.eq('判斷 /boot 新不新的門檻跟著放寬到 15 分鐘', win.eval('BOOT_FRESH_MS'), 15 * 60 * 1000);
  win.eval('NEAR.active=false; NEAR_MAP=null;');

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
