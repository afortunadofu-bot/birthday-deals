/* v195 celine（11/17）：「能再降低嗎」。Log Ingestion 0.72/1 GB，剩 17 天，一天要壓在 16.5 MB；
   11/16 是 17.7 MB。Logs Explorer 11/16～17 的 24 小時：

     offer_detail_bundle（瀏覽器）     2,443  → 沒登入的走 Worker /detail，存 10 分鐘共用
     rpc/offer_stores_in_bounds（Worker）1,840 → 格子 6 小時 → 24 小時（t100）
     offer_edits_pending_preview（瀏覽器） 970 → 一次拿全部、5 分鐘內共用
     profiles（瀏覽器）                  811 → last_seen_at 6 小時內不重寫
     offer_stores（瀏覽器）              492 → 「有沒有營業時間」記一天 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeSb, makeAsserts } = require('./harness');

function loadWorker() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'offers-cache.js'), 'utf8');
  const file = path.join(require('os').tmpdir(), `offers-cache-v195-${Date.now()}.cjs`);
  fs.writeFileSync(file, src.replace(/export default handler;?/, 'module.exports = handler;'));
  const mod = require(file);
  fs.unlinkSync(file);
  return mod;
}
const BUNDLE = { comments: [{ id: 1, body: '好吃' }], reports: [], history: [], names: [], report_likes: [], comment_likes: [], my_score: null };

(async () => {
  const t = makeAsserts('t104 v195 再少打 Supabase');

  /* ================= Worker /detail ================= */
  const worker = loadWorker();
  const store = new Map();
  globalThis.caches = { default: {
    async match(req) { const h = store.get(req.url); return h ? h.clone() : undefined; },
    async put(req, res) { store.set(req.url, res.clone()); },
  } };
  const ctx = { waitUntil: (p) => p };
  let up = [];
  globalThis.fetch = async (url, init) => {
    up.push({ url: String(url), body: init && init.body ? JSON.parse(init.body) : null, auth: init && init.headers && init.headers.authorization });
    return Response.json(BUNDLE);
  };
  const get = (p) => worker.fetch(new Request('https://api.test' + p), {}, ctx);

  let res = await get('/detail?id=42');
  const body = await res.json();
  t.ok('/detail：問 offer_detail_bundle，帶那一筆的 id',
    res.status === 200 && up.length === 1 && up[0].url.endsWith('/rest/v1/rpc/offer_detail_bundle') && up[0].body.p_offer_id === 42, JSON.stringify(up));
  t.ok('用 anon 身分問（拿到的是公開那一份）', /^Bearer /.test(up[0].auth || ''));
  t.ok('回的是 {at, data}', body.at && Array.isArray(body.data.comments));
  t.eq('瀏覽器只留 1 分鐘', res.headers.get('cache-control'), 'public, max-age=60');
  await new Promise((r) => setTimeout(r, 5));
  res = await get('/detail?id=42');
  t.eq('第二次：Worker 自己存著，不再問 Supabase', [res.headers.get('x-cache'), up.length], ['HIT', 1]);
  await get('/detail?id=43');
  t.eq('另一筆：各算各的', up.length, 2);
  t.eq('id 不是正整數：400', (await get('/detail?id=abc')).status, 400);
  t.eq('id 是 0：400', (await get('/detail?id=0')).status, 400);
  const status = await (await get('/')).json();
  t.ok('狀態頁列得出 /detail', (status.paths || []).includes('/detail'), JSON.stringify(status.paths));
  delete globalThis.caches;

  /* ================= 網站 ================= */
  const { win } = await boot();
  win.console.warn = () => {};
  win.__edge = [];
  win.__edgeMode = 'ok';
  win.__bundle = BUNDLE;
  win.eval(`window.OFFERS_API='https://api.example';
    window.fetch=(u)=>{
      window.__edge.push(String(u));
      if(window.__edgeMode==='404') return Promise.resolve({ok:false, status:404, json:()=>Promise.resolve({})});
      return Promise.resolve({ok:true, status:200, json:()=>Promise.resolve({at:'x', data:window.__bundle})});
    };`);
  const sb = makeSb({
    tables: {
      offer_edits_pending_preview: [{ id: 1, offer_id: 7 }, { id: 2, offer_id: 8 }, { id: 3, offer_id: 7 }],
      offer_stores: [{ offer_id: 7 }],
    },
    rpcs: { offer_detail_bundle: BUNDLE },
  });
  win.__sb = sb;
  win.eval('sb = window.__sb; LIVE = true; DETAIL_BUNDLE_OK = true; DETAIL_EDGE_OK = true;');

  /* ---- A. 詳情 ---- */
  win.eval('me = null;');
  let d = await win.eval('loadDetailBundle(7)');
  t.ok('沒登入：從 Worker 拿', win.__edge.length === 1 && /\/detail\?id=7$/.test(win.__edge[0]) && d && d.comments.length === 1, JSON.stringify(win.__edge));
  t.eq('…不直接問 Supabase', sb.__calls.rpc.filter((c) => c.name === 'offer_detail_bundle').length, 0);
  win.eval(`me = {id:'u-1'};`);
  win.__edge = [];
  d = await win.eval('loadDetailBundle(7)');
  t.ok('登入了：直接問（有自己的評分、剛留的言要馬上看到）', win.__edge.length === 0 && sb.__calls.rpc.some((c) => c.name === 'offer_detail_bundle') && !!d);
  win.eval('me = null;');
  win.__edgeMode = '404';
  sb.__calls.rpc.length = 0;
  d = await win.eval('loadDetailBundle(7)');
  t.ok('Worker 還沒更新（404）：改回直接問，畫面一樣', !!d && sb.__calls.rpc.some((c) => c.name === 'offer_detail_bundle'));
  win.__edge = [];
  await win.eval('loadDetailBundle(8)');
  t.eq('…這次造訪不再試 Worker', win.__edge.length, 0);

  /* ---- B. 待審的修改建議 ---- */
  win.eval(`me = {id:'u-1'}; forgetPendingEdits();`);
  sb.__calls.select.length = 0;
  const a7 = await win.eval('pendingEditsFor(7)');
  const a8 = await win.eval('pendingEditsFor(8)');
  t.eq('點開第 7 筆：只挑出它的', a7.map((e) => e.id), [1, 3]);
  t.eq('點開第 8 筆：只挑出它的', a8.map((e) => e.id), [2]);
  t.eq('兩次只問一次', sb.__calls.select.filter((c) => c.table === 'offer_edits_pending_preview').length, 1);
  win.eval('forgetPendingEdits();');
  await win.eval('pendingEditsFor(7)');
  t.eq('自己送出修改建議後清掉：下次重拿', sb.__calls.select.filter((c) => c.table === 'offer_edits_pending_preview').length, 2);
  win.eval('me = null;');
  t.eq('沒登入：不問', await win.eval('pendingEditsFor(7)'), null);

  /* ---- C. 上次來訪 ---- */
  const lastSeenWrites = () => sb.__calls.write.filter((w) => w.table === 'profiles' && w.op === 'update').length;
  win.eval(`me = {id:'u-1'}; myProfile = {id:'u-1', last_seen_at: new Date(Date.now()-60*60*1000).toISOString()};`);
  await win.eval('checkNewOffers()');
  t.eq('一小時前才來過：不重寫', lastSeenWrites(), 0);
  win.eval(`myProfile.last_seen_at = new Date(Date.now()-7*60*60*1000).toISOString();`);
  await win.eval('checkNewOffers()');
  t.eq('七小時前：寫一次', lastSeenWrites(), 1);
  win.eval(`myProfile.last_seen_at = null;`);
  await win.eval('checkNewOffers()');
  t.eq('第一次來：寫', lastSeenWrites(), 2);

  /* ---- D. 營業時間 ---- */
  const hoursAsks = () => sb.__calls.select.filter((c) => c.table === 'offer_stores').length;
  win.eval(`LIVE = true; localStorage.removeItem('sxr_hours_avail'); HOURS_TRIED = false; buildHoursControls = ()=>{};`);
  await win.eval('loadHoursAvail()');
  t.eq('第一次：問一次', [hoursAsks(), win.eval('HOURS_AVAIL')], [1, true]);
  win.eval('HOURS_TRIED = false; HOURS_AVAIL = false;');
  await win.eval('loadHoursAvail()');
  t.eq('一天內再打開：不問，直接當作有', [hoursAsks(), win.eval('HOURS_AVAIL')], [1, true]);
  win.eval(`localStorage.setItem('sxr_hours_avail', String(Date.now()-25*60*60*1000)); HOURS_TRIED = false;`);
  await win.eval('loadHoursAvail()');
  t.eq('過了一天：再問一次', hoursAsks(), 2);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
