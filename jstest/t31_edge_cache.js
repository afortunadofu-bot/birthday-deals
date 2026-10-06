/* 邊緣快取：Cloudflare Worker（worker/offers-cache.js）＋ 前端怎麼用它

   celine：「Cloudflare Worker 邊緣快取做」。

   前端的 localStorage 快取只能讓「同一台裝置 10 分鐘內」不重複查，新訪客還是每人
   各查一次；這一層是大家共用的——不管一小時來 10 個還是 10000 個人，Supabase 都
   只被打 6 次。Supabase 掛掉時 Worker 還會把最後一份好資料頂出來。

   這支驗兩半：
   A. Worker 本身（用假的 caches／fetch 跑，不連網）
   B. 前端：有設 window.OFFERS_API 才走這條，失敗要退回直接問 Supabase，
      force（自己剛回報完）刻意不用共用快取 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts } = require('./harness');

/* Worker 是 ES module（Cloudflare 要求 export default），但這包測試是 CommonJS。
   把 `export default handler;` 換成 module.exports 再 require 進來——原始檔維持
   可以直接貼進 Cloudflare 的樣子。 */
function loadWorker() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'offers-cache.js'), 'utf8');
  const cjs = src.replace(/export default handler;?/, 'module.exports = handler;');
  const file = path.join(require('os').tmpdir(), `offers-cache-${Date.now()}.cjs`);
  fs.writeFileSync(file, cjs);
  const mod = require(file);
  fs.unlinkSync(file);
  return mod;
}

function fakeCaches() {
  const store = new Map();
  return {
    store,
    default: {
      async match(req) { const hit = store.get(req.url); return hit ? hit.clone() : undefined; },
      async put(req, res) { store.set(req.url, res.clone()); },
    },
  };
}

(async () => {
  const t = makeAsserts('t31 邊緣快取');

  /* ================= A. Worker ================= */
  const worker = loadWorker();
  const ctx = { waitUntil: (p) => p };
  const realFetch = globalThis.fetch;
  let upstream = [];
  let fail = false;
  globalThis.caches = fakeCaches();
  globalThis.fetch = async (url, init) => {
    upstream.push(String(url));
    if (fail) return new Response('boom', { status: 503 });
    if (String(url).includes('/rest/v1/rpc/site_stats_cached')) {
      return Response.json({ offer_count: 430, saved_total: 302446 });
    }
    // offers_public：第一頁滿 1000 筆，第二頁 2 筆（驗自動翻頁）
    const range = (init && init.headers && init.headers.range) || '0-999';
    const page0 = range.startsWith('0-');
    const rows = page0
      ? Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, brand: `店${i + 1}` }))
      : [{ id: 1001, brand: '最後一家' }, { id: 1002, brand: '再一家' }];
    return Response.json(rows);
  };

  const get = (p, init) => worker.fetch(new Request('https://api.test' + p, init), {}, ctx);

  let res = await get('/offers');
  let body = await res.json();
  t.eq('第一次是 MISS', res.headers.get('x-cache'), 'MISS');
  t.eq('超過 1000 筆會自己翻頁接起來', body.data.length, 1002);
  t.eq('翻了兩頁', upstream.length, 2);
  t.ok('標了抓取時間', !!body.at);
  t.ok('任何網站都能讀（CORS）', res.headers.get('access-control-allow-origin') === '*');
  t.ok('叫瀏覽器也快取 10 分鐘', /max-age=600/.test(res.headers.get('cache-control')));

  upstream = [];
  res = await get('/offers');
  t.eq('第二次直接命中快取', res.headers.get('x-cache'), 'HIT');
  t.eq('完全沒再碰 Supabase', upstream.length, 0);
  t.eq('內容一樣', (await res.json()).data.length, 1002);

  // Supabase 掛掉：快取過期了也要有東西頂著
  fail = true;
  globalThis.caches.store.delete('https://api.test/__cache/offers/fresh');   // 模擬 10 分鐘後過期
  upstream = [];
  res = await get('/offers');
  t.eq('上游掛掉改用上一份好資料', res.headers.get('x-cache'), 'STALE');
  t.eq('資料還在', (await res.json()).data.length, 1002);
  t.ok('同時說明為什麼是舊的', !!res.headers.get('x-upstream-error'));

  // 連舊的都沒有才認輸
  globalThis.caches = fakeCaches();
  res = await get('/offers');
  t.eq('完全沒資料時回 502', res.status, 502);
  t.ok('不要把錯誤也快取起來', /max-age=0/.test(res.headers.get('cache-control')));

  fail = false;
  globalThis.caches = fakeCaches();
  res = await get('/stats');
  t.eq('站台數據也快取得了', res.status, 200);
  t.eq('用的是 v78 的快取版 RPC', upstream.filter((u) => /site_stats_cached/.test(u)).length, 1);

  res = await get('/health');
  t.eq('健康檢查', res.status, 200);
  res = await get('/nope');
  t.eq('沒有的路徑回 404', res.status, 404);
  res = await get('/offers', { method: 'OPTIONS' });
  t.eq('CORS 預檢', res.status, 204);
  // 併進主站 worker 時（有 ASSETS 繫結），其他路徑要交回靜態檔
  let assetHits = 0;
  res = await worker.fetch(new Request('https://api.test/index.html'), {
    ASSETS: { fetch: async () => { assetHits += 1; return new Response('html'); } },
  }, ctx);
  t.eq('其餘路徑交給靜態檔處理', assetHits, 1);
  // 掛在 /api 底下也要認得
  globalThis.caches = fakeCaches();
  res = await worker.fetch(new Request('https://api.test/api/offers'), {}, ctx);
  t.eq('/api/offers 也通', res.status, 200);

  globalThis.fetch = realFetch;

  /* ================= B. 前端 ================= */
  const { win } = await boot();
  const doc = win.document;
  const calls = { edge: [], sb: 0 };
  win.__sb = {
    from: () => ({ select: () => ({ order: () => ({ range: () => { calls.sb += 1; return Promise.resolve({ data: [{ id: 9, brand: '直接問 Supabase 拿到的', regions: [], sources: [] }], error: null }); } }) }) }),
    rpc: () => Promise.resolve({ data: null, error: { message: 'nope' } }),
  };
  win.eval('sb = window.__sb; LIVE = true;');
  win.localStorage.clear();

  // 沒設 OFFERS_API：行為跟以前一樣
  win.fetch = async (u) => { calls.edge.push(String(u)); return { ok: true, json: async () => ({ data: [] }) }; };
  await win.loadOffers(true);
  t.eq('沒設就不要打邊緣快取', calls.edge.length, 0);
  t.eq('照樣問得到 Supabase', calls.sb, 1);

  // 設了就先問 Worker
  win.OFFERS_API = 'https://api.test/';
  win.localStorage.clear(); calls.sb = 0; calls.edge = [];
  win.fetch = async (u) => {
    calls.edge.push(String(u));
    return { ok: true, json: async () => ({ at: '2026-10-06', data: [{ id: 1, brand: '邊緣快取拿到的', regions: [], sources: [] }] }) };
  };
  await win.loadOffers();
  t.eq('打的是 /offers（尾巴的斜線會處理掉）', calls.edge[0], 'https://api.test/offers');
  t.eq('完全不用問 Supabase', calls.sb, 0);
  t.eq('資料有進畫面', win.eval('OFFERS[0].brand'), '邊緣快取拿到的');
  t.ok('也存進這台裝置的快取', !!win.localStorage.getItem('sxr_offers_cache'));

  // Worker 掛了就退回直接問 Supabase
  win.localStorage.clear(); calls.sb = 0;
  win.fetch = async () => { throw new Error('worker down'); };
  await win.loadOffers();
  t.eq('邊緣快取失敗要退回原本的路', calls.sb, 1);
  t.eq('畫面還是有資料', win.eval('OFFERS[0].brand'), '直接問 Supabase 拿到的');

  // 自己剛回報完（force）：要最新的，不能拿共用快取
  win.localStorage.clear(); calls.sb = 0; calls.edge = [];
  win.fetch = async (u) => { calls.edge.push(String(u)); return { ok: true, json: async () => ({ data: [{ id: 1, brand: 'x', regions: [], sources: [] }] }) }; };
  await win.loadOffers(true);
  t.eq('force 不走共用快取', calls.edge.length, 0);
  t.eq('force 直接問 Supabase', calls.sb, 1);

  // 站台數據也走同一條
  win.eval('STATS_CACHE = null; STATS_CACHE_AT = 0;');
  win.localStorage.removeItem('sxr_site_stats');
  calls.edge = [];
  win.fetch = async (u) => { calls.edge.push(String(u)); return { ok: true, json: async () => ({ data: { offer_count: 430, saved_total: 302446, report_count: 2201 } }) }; };
  const s = await win.siteStats();
  t.eq('站台數據先問邊緣快取', calls.edge[0], 'https://api.test/stats');
  t.eq('拿到的是 Worker 那份', s.offer_count, 430);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
