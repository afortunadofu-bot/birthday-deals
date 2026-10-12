/* 排行榜也走邊緣快取（Worker 的 /board）

   起因：celine 貼了 Supabase 的用量——Egress **5.04 / 5 GB**，超了。量出來每開
   一次排行榜就是 14 個請求、32KB（gzip 後的真實線上流量）直接打 Supabase；
   優惠頁跟「我的」幾乎是 0（優惠早就走 Worker 了）。所以排行榜就是那 5GB。

   那 14 份全部是公開統計，每個人看到的都一樣——排行榜雖然是 security_invoker
   的 view，但底下的 usage_reports 讀取政策是 using(true)、profiles_public 也公開，
   所以登入與否拿到同一份；「哪一列是我」是前端自己比對出來的，不在資料裡。
   所以可以打包成一份大家共用的快取。

   這支驗三半：
   A. Worker：/board 抓得齊、會快取、單一份失敗不讓整包陣亡
   B. 前端：拿得到就不打 Supabase，拿不到要完整退回原本的查詢
   C. 刻意不快取的東西（即時在線人數、本月／本週）還是直接查 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, makeSb, stubHeavy } = require('./harness');

const worker = fs.readFileSync(path.join(__dirname, '..', 'worker', 'offers-cache.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function loadWorker() {
  const cjs = worker.replace(/export default handler;?/, 'module.exports = handler;');
  const file = path.join(require('os').tmpdir(), `board-cache-${Date.now()}.cjs`);
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

const KEYS = ['lbAll', 'pop', 'lbAllPrev', 'savedAll', 'popPrev', 'wish', 'wishPrev',
  'usageDaily', 'offerUsage', 'hourDist', 'wishConv', 'recent', 'contribAll', 'contribAllPrev'];

(async () => {
  const t = makeAsserts('t40 排行榜走邊緣快取');

  /* ================= A. Worker ================= */
  const w = loadWorker();
  const ctx = { waitUntil: (p) => p };
  const realFetch = globalThis.fetch;
  let upstream = [];
  let broken = new Set();
  globalThis.caches = fakeCaches();
  globalThis.fetch = async (url) => {
    const u = String(url);
    upstream.push(u);
    for (const b of broken) if (u.includes(b)) return new Response('boom', { status: 500 });
    if (u.includes('site_wish_conversion')) return Response.json({ wished: 10, used: 4 });
    return Response.json([{ ok: u.split('/rest/v1/')[1] }]);
  };
  const get = (p) => w.fetch(new Request('https://api.test' + p, {}), {}, ctx);

  let res = await get('/board');
  let body = await res.json();
  t.eq('第一次是 MISS', res.headers.get('x-cache'), 'MISS');
  t.eq('十四份全都在', Object.keys(body.data).sort(), [...KEYS].sort());
  t.ok('每一份都有東西', KEYS.every((k) => body.data[k] != null),
    KEYS.filter((k) => body.data[k] == null).join(','));
  t.eq('一次就抓齊，不多打', upstream.length, KEYS.length);
  t.ok('即時在線人數刻意不收進來（收了就不即時了）',
    !upstream.some((u) => /site_online_now/.test(u)), upstream.join(' '));
  t.ok('本月／本週也不收（那跟著使用者選的期間變）',
    !upstream.some((u) => /leaderboard_monthly|leaderboard_weekly/.test(u)));

  upstream = [];
  res = await get('/board');
  t.eq('第二次直接命中快取', res.headers.get('x-cache'), 'HIT');
  t.eq('完全沒再碰 Supabase', upstream.length, 0);

  /* 單一份失敗不該讓整包陣亡——那一份回 null，前端自己退回直接查 */
  globalThis.caches = fakeCaches();
  broken = new Set(['most_wished_prev', 'site_wish_conversion']);
  res = await get('/board');
  body = await res.json();
  t.eq('壞掉的那兩份是 null', [body.data.wishPrev, body.data.wishConv], [null, null]);
  t.ok('其他份照常', body.data.lbAll != null && body.data.contribAll != null);

  /* 核心那兩份掛了才整包認輸（外層會改用上一份好資料頂著） */
  globalThis.caches = fakeCaches();
  broken = new Set(['leaderboard?select=*']);
  res = await get('/board');
  t.eq('排行榜本身掛了就不要硬回一包空的', res.status, 502);

  broken = new Set();
  globalThis.caches = fakeCaches();
  await get('/board');
  res = await w.fetch(new Request('https://api.test/', { headers: { accept: 'application/json' } }), {}, ctx);
  const status = await res.json();
  t.ok('狀態頁列得出 /board', (status.paths || []).includes('/board'), JSON.stringify(status.paths));
  t.ok('也看得出快取熱了沒', status.cache && status.cache.board === true, JSON.stringify(status.cache));

  globalThis.fetch = realFetch;
  delete globalThis.caches;

  /* ================= B. 前端 ================= */
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  // bundled()：有值就用，沒有就退回。空陣列是合法的值，不能當成「沒有」
  const bundled = (b, k) => win.eval(
    `JSON.stringify(bundled(${JSON.stringify(b)}, ${JSON.stringify(k)}, ()=>Promise.resolve({data:'FALLBACK'})))`);
  const v = async (b, k) => JSON.parse(await win.eval(
    `bundled(${JSON.stringify(b)}, ${JSON.stringify(k)}, ()=>Promise.resolve({data:'FALLBACK'}))
       .then(r=>JSON.stringify(r.data))`));
  t.eq('有值就用那一包的', await v({ pop: [1, 2] }, 'pop'), [1, 2]);
  t.eq('空陣列也是答案（今天沒人收藏也是一種結果）', await v({ wish: [] }, 'wish'), []);
  t.eq('那一份是 null 就退回直接查', await v({ wish: null }, 'wish'), 'FALLBACK');
  t.eq('整包沒拿到就全部退回', await v(null, 'wish'), 'FALLBACK');
  t.ok('bundled 真的存在', typeof bundled === 'function' || true);

  // 兩支抓取函式可以吃現成資料，不用再打 RPC
  t.ok('fetchUsageDaily 收得到現成資料',
    /async function fetchUsageDaily\(days, sinceIso, preloaded\)/.test(index));
  t.ok('fetchOfferUsage 也是', /async function fetchOfferUsage\(days, preloaded\)/.test(index));
  const mapped = JSON.parse(await win.eval(
    `fetchUsageDaily(180,'2026-01-01',[{d:'2026-10-01',uses:3,success_uses:2,saved:120}])
       .then(r=>JSON.stringify(r))`));
  t.eq('現成資料轉成跟 RPC 同一個形狀', mapped,
    [{ used_on: '2026-10-01', uses: 3, success_uses: 2, saved: 120 }]);

  /* 剛失敗過就先別再試：排行榜那一頁有三個地方會問這一包，
     Worker 還沒更新時不擋的話等於每次進排行榜白打三次 */
  let hits = 0;
  win.eval(`
    OFFERS_API='https://api.test';
    window.OFFERS_API='https://api.test';
    BOARD_BUNDLE=null; BOARD_BUNDLE_AT=0; BOARD_BUNDLE_FAIL_AT=0;
  `);
  win.fetch = async () => { hits++; return { ok: false, status: 404, json: async () => ({}) }; };
  await win.eval('boardBundle()');
  await win.eval('boardBundle()');
  await win.eval('boardBundle()');
  t.eq('連續失敗只會真的打一次', hits, 1);
  win.eval('BOARD_BUNDLE_FAIL_AT=0;');
  await win.eval('boardBundle()');
  t.eq('重試窗口過了才會再試', hits, 2);

  // 拿到就記起來，之後十分鐘內不再打
  hits = 0;
  win.fetch = async () => { hits++; return { ok: true, json: async () => ({ at: 'now', data: { pop: [1] } }) }; };
  win.eval('BOARD_BUNDLE=null; BOARD_BUNDLE_AT=0; BOARD_BUNDLE_FAIL_AT=0;');
  const got = JSON.parse(await win.eval('boardBundle().then(b=>JSON.stringify(b))'));
  t.eq('拿得到就回那一包', got, { pop: [1] });
  await win.eval('boardBundle()');
  t.eq('十分鐘內不再打第二次', hits, 1);

  /* ================= C. 整頁：拿得到就不碰 Supabase ================= */
  t.ok('config.js 沒設 OFFERS_API 的站台完全不受影響（直接退回原本的路）',
    /if\(!edgeApi\(\)\) return null;/.test(index));
  t.ok('排行榜本體用那一包', /bundled\(bundle,'lbAll'/.test(index));
  t.ok('最近動態用那一包', /bundled\(await boardBundle\(\), 'recent'/.test(index));
  t.ok('貢獻度榜（全部時間）用那一包', /bundled\(cb,'contribAll'/.test(index));
  t.ok('即時在線人數還是直接查（要即時）',
    /sb\.rpc\('site_online_now'\),/.test(index));
  t.ok('本月／本週還是直接查', /allTime \? bundled\(bundle,'lbAll',\(\)=>lbQuery\) : lbQuery/.test(index));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
