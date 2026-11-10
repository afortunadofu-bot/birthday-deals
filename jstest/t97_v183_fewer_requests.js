/* v183 celine：「Supabase 後台的 log 才知道是誰在大量呼叫，查看能不能減少」。
   Logs Explorer 一小時 15,302 個請求（約 700 個 IP），每個人開站固定打的四個最多：
   事件記錄、「資料庫活著嗎」、「有沒有分店營業時間」、花費統計——每個還各帶一個 OPTIONS。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, makeSb } = require('./harness');

function loadWorker() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'offers-cache.js'), 'utf8');
  const file = path.join(require('os').tmpdir(), `offers-cache-v183-${Date.now()}.cjs`);
  fs.writeFileSync(file, src.replace(/export default handler;?/, 'module.exports = handler;'));
  const mod = require(file);
  fs.unlinkSync(file);
  return mod;
}

(async () => {
  const t = makeAsserts('t97 v183：少打 Supabase');

  /* ================= Worker ================= */
  const worker = loadWorker();
  const store = new Map();
  globalThis.caches = { default: {
    async match(req) { const h = store.get(req.url); return h ? h.clone() : undefined; },
    async put(req, res) { store.set(req.url, res.clone()); },
  } };
  const ctx = { waitUntil: (p) => p };
  let up = [];
  let upStatus = 201;
  globalThis.fetch = async (url, init) => {
    up.push({ url: String(url), init });
    if (String(url).includes('offer_spend_summary')) return Response.json([{ offer_id: 7, n: 4, avg_spent: 250 }]);
    return new Response(null, { status: upStatus });
  };
  const call = (p, init) => worker.fetch(new Request('https://api.test' + p, init), {}, ctx);

  let res = await call('/spend');
  let body = await res.json();
  t.eq('/spend：拿到花費統計', body.data, [{ offer_id: 7, n: 4, avg_spent: 250 }]);
  t.ok('問的是 offer_spend_summary(p_min=1)', up.length === 1 && /rpc\/offer_spend_summary$/.test(up[0].url)
    && JSON.parse(up[0].init.body).p_min === 1);
  t.ok('用 anon 身分問（edge_reader 不一定有權限）', /^Bearer eyJ/.test(up[0].init.headers.authorization)
    && up[0].init.headers.authorization === `Bearer ${up[0].init.headers.apikey}`);
  t.ok('快取 30 分鐘', /max-age=1800/.test(res.headers.get('cache-control')));
  res = await call('/spend');
  t.ok('第二個人：直接拿快取，不碰 Supabase', res.headers.get('x-cache') === 'HIT' && up.length === 1);

  const rows = [{ event_type: 'pageview', session_id: 's1', user_id: null, meta: { tab: '#offers' } },
    { event_type: 'wish', session_id: 's1', user_id: null, meta: { id: 3 } }];
  /* v185 起 Worker 先攢著（很多人的合成一批），測試把攢的時間設成 1ms，等它送出去 */
  const pending = [];
  const ctxEv = { waitUntil: (p) => { pending.push(p); } };
  const envEv = { EVENTS_HOLD_MS: '1' };
  const callEv = (body) => worker.fetch(new Request('https://api.test/events', { method: 'POST', headers: { 'content-type': 'text/plain' }, body }), envEv, ctxEv);
  up = [];
  res = await callEv(JSON.stringify(rows));
  t.eq('/events：成功回 204', res.status, 204);
  t.eq('先攢著，還沒送', up.length, 0);
  await callEv(JSON.stringify([{ event_type: 'wish', session_id: 's2', user_id: null, meta: {} }]));
  await Promise.all(pending.splice(0));
  t.ok('兩個人的事件合成一個請求送給 site_events', up.length === 1 && /\/rest\/v1\/site_events$/.test(up[0].url)
    && up[0].init.method === 'POST');
  t.eq('內容原樣轉過去', JSON.parse(up[0].init.body), [...rows, { event_type: 'wish', session_id: 's2', user_id: null, meta: {} }]);
  t.ok('用 JSON、不要回傳內容', up[0].init.headers['content-type'] === 'application/json'
    && up[0].init.headers.prefer === 'return=minimal');
  t.ok('網站讀得到結果（CORS）', res.headers.get('access-control-allow-origin') === '*');

  up = [];
  const bad = async (b) => (await call('/events', { method: 'POST', body: b })).status;
  t.eq('不是 JSON：400', await bad('hello'), 400);
  t.eq('不是陣列：400', await bad('{"event_type":"x"}'), 400);
  t.eq('空陣列：400', await bad('[]'), 400);
  t.eq('沒有 event_type：400', await bad('[{"x":1}]'), 400);
  t.eq('一次超過 50 筆：400', await bad(JSON.stringify(Array.from({ length: 51 }, () => ({ event_type: 'x' })))), 400);
  t.eq('太大：413', await bad(JSON.stringify([{ event_type: 'x', meta: { s: 'a'.repeat(70000) } }])), 413);
  t.eq('上面這些都沒轉給 Supabase', up.length, 0);
  /* v185 起是攢著送：Supabase 失敗時網站那端已經拿到 204，事件就掉了（只是統計），Worker 不能因此壞掉 */
  upStatus = 402;
  t.eq('Supabase 失敗：網站照樣拿到 204', (await callEv(JSON.stringify(rows))).status, 204);
  let threw = false;
  try { await Promise.all(pending.splice(0)); } catch { threw = true; }
  t.ok('送失敗也不會讓 Worker 丟錯', !threw);
  upStatus = 201;
  up = [];
  await callEv(JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ event_type: 'x', i }))));
  await callEv(JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ event_type: 'x', i }))));
  await callEv(JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ event_type: 'x', i }))));
  await callEv(JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ event_type: 'x', i }))));
  await Promise.all(pending.splice(0));
  t.ok('滿 200 筆就先送，不用等', up.length >= 1 && JSON.parse(up[0].init.body).length === 200);
  t.eq('GET /events 不是端點', (await call('/events')).status, 404);

  /* ================= 網站 ================= */
  const { win } = await boot();
  win.console.warn = () => {};

  /* ---- 事件：先走 Worker，失敗就直接送 ---- */
  const sent = [];
  win.__sent = sent;
  win.__status = 204;
  win.eval(`LIVE=true; me=null; CFG={url:'https://db.example', anonKey:'anon-key'};
    window.OFFERS_API='https://api.example'; EV_EDGE_OK=true; EV_QUEUE.length=0;
    window.fetch=(u,o)=>{ window.__sent.push({u:String(u), o}); return Promise.resolve({ok:window.__status<300, status:window.__status}); };`);
  win.eval(`logEvent('pageview',{tab:'#offers'}); logEvent('wish',{id:1}); flushEvents();`);
  await tick(win, 3);
  t.ok('送到 Worker 的 /events', sent.length === 1 && sent[0].u === 'https://api.example/events', JSON.stringify(sent.map((x) => x.u)));
  const h = sent[0].o.headers;
  t.ok('text/plain、沒有 apikey／Authorization（瀏覽器就不會先送 OPTIONS）',
    h['Content-Type'] === 'text/plain' && !('apikey' in h) && !('Authorization' in h));
  t.ok('keepalive（關頁面也送得出去）', sent[0].o.keepalive === true);
  t.eq('pageview 跟其他事件同一批', JSON.parse(sent[0].o.body).map((r) => r.event_type), ['pageview', 'wish']);

  sent.length = 0;
  win.__status = 404;   // Worker 還沒更新：沒有 /events
  win.eval(`logEvent('wish',{id:2}); flushEvents();`);
  await tick(win, 3);
  t.ok('Worker 沒有 /events：這一批改直接送 Supabase', sent.length === 2 && sent[1].u === 'https://db.example/rest/v1/site_events'
    && sent[1].o.headers.apikey === 'anon-key', JSON.stringify(sent.map((x) => x.u)));
  sent.length = 0;
  win.eval(`logEvent('wish',{id:3}); flushEvents();`);
  await tick(win, 3);
  t.ok('之後這次造訪都直接送，不再白打 Worker', sent.length === 1 && sent[0].u === 'https://db.example/rest/v1/site_events');

  sent.length = 0;
  win.eval(`window.OFFERS_API=''; EV_EDGE_OK=true; logEvent('wish',{id:4}); flushEvents();`);
  await tick(win, 3);
  t.ok('沒設 Worker 的站台：照舊直接送', sent.length === 1 && sent[0].u === 'https://db.example/rest/v1/site_events');

  win.eval('clearTimeout(EV_TIMER); EV_TIMER=null; EV_QUEUE.length=0;');
  win.eval(`logEvent('wish',{id:5});`);
  t.ok('一般事件攢 30 秒', win.eval('EV_BATCH_MS') === 30000 && win.eval('EV_QUEUE.length') === 1);
  win.eval(`logEvent('pageview',{});`);
  t.ok('來了 pageview：改成 3 秒內送（在線人數還是即時的）', win.eval('EV_PAGEVIEW_MS') === 3000);
  win.eval('clearTimeout(EV_TIMER); EV_TIMER=null; EV_QUEUE.length=0;');

  /* ---- 資料庫活著嗎：Worker 的 /boot 是新的就不用問 ---- */
  const probes = [];
  win.__probes = probes;
  win.eval(`probeBackend=async()=>{ window.__probes.push(1); return false; }; window.OFFERS_API='https://api.example';`);
  const tryProbe = async (at, ok = true) => {
    probes.length = 0;
    win.__bootAt = at; win.__bootOk = ok;
    win.eval(`BOOT_BUNDLE=null; BOOT_AT=0; BOOT_FAIL_AT=0; BOOT_INFLIGHT=null; delete EDGE_AT['/boot']; MAINT_UP=false;
      window.fetch=(u)=>Promise.resolve(window.__bootOk
        ? {ok:true, status:200, json:()=>Promise.resolve({at:window.__bootAt, data:{announcement:null, flags:[]}})}
        : {ok:false, status:502, json:()=>Promise.resolve({})});`);
    await win.eval('maybeProbeBackend()');
    return probes.length;
  };
  t.eq('/boot 是 30 秒前抓的：不用自己問', await tryProbe(new Date(Date.now() - 30e3).toISOString()), 0);
  t.ok('而且當作資料庫活著', win.eval('MAINT_UP') === true);
  t.eq('/boot 是 20 分鐘前的舊資料（Worker 問不到 Supabase）：自己問', await tryProbe(new Date(Date.now() - 20 * 60e3).toISOString()), 1);
  t.eq('Worker 掛了：自己問', await tryProbe(null, false), 1);
  t.eq('Worker 沒給時間：自己問', await tryProbe(undefined), 1);
  win.eval(`window.OFFERS_API='';`);
  probes.length = 0;
  await win.eval('maybeProbeBackend()');
  t.eq('沒設 Worker 的站台：照舊每次問', probes.length, 1);

  /* ---- 花費統計：先拿 Worker 的 ---- */
  win.eval(`window.OFFERS_API='https://api.example'; SPEND_TRIED=false; SPEND=new Map();
    window.fetch=(u)=>Promise.resolve(String(u).endsWith('/spend')
      ? {ok:true, status:200, json:()=>Promise.resolve({at:new Date().toISOString(), data:[{offer_id:9, n:5, avg_spent:120, min_spent:80, max_spent:200}]})}
      : {ok:false, status:404, json:()=>Promise.resolve({})});`);
  const sbSpend = makeSb({ rpcs: { offer_spend_summary: [{ offer_id: 1, n: 3, avg_spent: 50, min_spent: 50, max_spent: 50 }] } });
  win.__sb = sbSpend; win.eval('sb=window.__sb;');
  await win.eval('loadSpendSummary()');
  t.ok('Worker 有：用 Worker 的，不打 Supabase', win.eval('SPEND.has("9") && !SPEND.has("1")')
    && !(sbSpend.__calls.rpc || []).some((c) => (c.fn || c.name || c[0]) === 'offer_spend_summary'));
  win.eval(`SPEND_TRIED=false; SPEND=new Map(); window.fetch=()=>Promise.resolve({ok:false, status:404, json:()=>Promise.resolve({})});`);
  await win.eval('loadSpendSummary()');
  t.ok('Worker 還沒更新（/spend 404）：退回直接問', win.eval('SPEND.has("1")'));

  /* ---- 有沒有分店營業時間：打開篩選才問 ---- */
  const src = win.eval('paintOffers.toString()');
  t.ok('開站不再一律問', !/^\s*loadHoursAvail\(\);/m.test(src) && /if\(HOURS_F\.mode\) loadHoursAvail\(\)/.test(src));
  let asked = 0;
  win.eval('HOURS_TRIED=false;');
  const sbH = makeSb({ tables: { offer_stores: [] } });
  const origFrom = sbH.from.bind(sbH);
  sbH.from = (tb) => { if (tb === 'offer_stores') asked++; return origFrom(tb); };
  win.__sb = sbH; win.eval('sb=window.__sb;');
  win.eval('closeFilterSheet && closeFilterSheet(); openFilterSheet();');
  await tick(win, 3);
  t.eq('打開篩選：問一次', asked, 1);
  win.eval('closeFilterSheet(); openFilterSheet();');
  await tick(win, 3);
  t.eq('再打開：問過就不再問', asked, 1);
  win.eval('closeFilterSheet();');

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
