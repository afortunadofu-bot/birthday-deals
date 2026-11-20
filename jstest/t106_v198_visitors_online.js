/* v198 celine：首頁統計那排「多一個平台總瀏覽人數跟在線人數」。
   - 總瀏覽人數：site_stats.visitor_count（/stats 那包本來就有）
   - 在線人數：Worker 的 /boot 順便帶 site_online_now()，前端不自己打資料庫（Log 額度） */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeSb, makeAsserts } = require('./harness');

function loadWorker() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'offers-cache.js'), 'utf8');
  const cjs = src.replace(/export default handler;?/, 'module.exports = handler;');
  const file = path.join(require('os').tmpdir(), `offers-cache-${Date.now()}-t106.cjs`);
  fs.writeFileSync(file, cjs);
  const mod = require(file);
  fs.unlinkSync(file);
  return mod;
}
function fakeCaches() {
  const store = new Map();
  return { default: {
    async match(req) { const hit = store.get(req.url); return hit ? hit.clone() : undefined; },
    async put(req, res) { store.set(req.url, res.clone()); },
  } };
}

(async () => {
  const t = makeAsserts('t106 v198 總瀏覽人數、在線人數');

  /* ---------- Worker：/boot 帶 online ---------- */
  const w = loadWorker();
  const ctx = { waitUntil: (p) => p };
  const get = (p) => w.fetch(new Request('https://api.test' + p, {}), {}, ctx);
  const realFetch = globalThis.fetch;
  let up = [], onlineFails = false;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    up.push({ u, init });
    if (u.includes('rpc/site_online_now')) return onlineFails ? new Response('no', { status: 404 }) : Response.json(7);
    if (u.includes('current_announcement')) return Response.json([]);
    if (u.includes('site_settings')) return Response.json([{ key: 'show_coffee', enabled: true }]);
    return Response.json([]);
  };
  globalThis.caches = fakeCaches();
  let body = await (await get('/boot')).json();
  t.eq('/boot 帶剛剛在線人數', body.data.online, 7);
  const call = up.find((x) => x.u.includes('rpc/site_online_now'));
  t.ok('用 POST 問 site_online_now', !!call && call.init && call.init.method === 'POST');
  t.ok('公告、開關照舊', body.data.announcement === null && Array.isArray(body.data.flags));
  up = [];
  await get('/boot');
  t.eq('第二個人：快取命中，不再問在線人數', up.length, 0);

  globalThis.caches = fakeCaches();
  onlineFails = true;
  body = await (await get('/boot')).json();
  t.eq('在線人數問不到：null，不讓整包壞掉', body.data.online, null);
  t.ok('…開關還是拿得到', Array.isArray(body.data.flags) && body.data.flags.length === 1);
  globalThis.fetch = realFetch;
  delete globalThis.caches;

  /* ---------- 網站 ---------- */
  const { win } = await boot();
  const doc = win.document;
  const sb = makeSb({});
  win.__sb = sb;
  const txt = () => doc.querySelector('#siteStats').textContent.replace(/\s+/g, ' ').trim();
  const pills = () => [...doc.querySelectorAll('#siteStats .statpill')].map((e) => e.textContent.replace(/\s+/g, ' ').trim());

  win.eval(`LIVE=true; sb=window.__sb; ONLINE_NOW=null;
    siteStats=async()=>({offer_count:571, saved_total:597265, report_count:4543, visitor_count:135456, pageview_count:268479});
    bootBundle=async()=>({announcement:null, flags:[], online:3});`);
  await win.eval('loadSiteStats()');
  await tick(win);
  // v203：跟站台數據統一，用瀏覽人次（pageview_count）
  t.ok('有總瀏覽人次（跟站台數據同一個數字）', pills().some((p) => p === '👀 總瀏覽人次 268,479'), pills().join(' | '));
  t.ok('有在線人數', pills().some((p) => p === '🟢 剛剛 3 人在線上'), pills().join(' | '));
  t.eq('順序：筆數、累積省下、瀏覽人數、在線', pills().map((p) => p.slice(0, 2)), ['📋', '💰', '👀', '🟢']);
  t.ok('不是用不重複裝置數（135,456，跟站台數據對不起來）', !/135,456|人數/.test(txt()));

  win.eval(`ONLINE_NOW=null; bootBundle=async()=>({announcement:null, flags:[], online:0});`);
  await win.eval('loadSiteStats()');
  await tick(win);
  t.ok('Worker 那份是 0：至少寫 1（正在看的人自己就在線上）', pills().includes('🟢 剛剛 1 人在線上'), pills().join(' | '));

  win.eval(`ONLINE_NOW=null; bootBundle=async()=>({announcement:null, flags:[]});`);
  await win.eval('loadSiteStats()');
  await tick(win);
  t.ok('Worker 還沒更新（/boot 沒有 online）：不畫在線那顆', !/在線/.test(txt()), txt());
  t.eq('…也不自己打 site_online_now', sb.__calls.rpc.filter((c) => c.name === 'site_online_now').length, 0);
  t.ok('瀏覽人次照樣在', /總瀏覽人次 268,479/.test(txt()));

  win.eval(`ONLINE_NOW=null; bootBundle=async()=>null;
    siteStats=async()=>({offer_count:12, saved_total:0, report_count:0, visitor_count:0});`);
  await win.eval('loadSiteStats()');
  await tick(win);
  t.eq('沒有人數資料（示範站／舊快取）：只剩筆數那顆', pills(), ['📋 共 12 筆優惠']);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
