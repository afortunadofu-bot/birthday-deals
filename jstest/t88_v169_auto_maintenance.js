/* v169：celine「以後幫我注意，如果系統無法登入，都先自動掛個 banner 寫這幾天系統更新，預留我修改的時間」 */
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t88 v169：資料庫連不上就自動掛「系統更新中」');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  delete win.__SXR_NO_MAINT;
  win.eval('doneNoticeActive=()=>false;');   // v176 的「已更新完成」照真實日期會出現，這一支只測停機那則
  win.eval("CFG={url:'https://x.supabase.co', anonKey:'anon'}; window.OFFERS_API='https://api.example';"
    + " maintDated=()=>false; MAINT_DOWN=false; paintMaint();");
  t.ok('平常（不在手動填的日期裡、資料庫活著）：沒有公告', $('#maintBanner').classList.contains('hidden'));

  // fetch 假的：照網址回不同的東西
  const setNet = (supa, worker) => {
    win.__calls = [];
    win.fetch = (url) => {
      win.__calls.push(String(url));
      const pick = /supabase/.test(url) ? supa.shift() : worker;
      if (pick === 'throw') return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve({ status: pick, ok: pick >= 200 && pick < 300 });
    };
  };
  const probe = async () => { win.eval('MAINT_DOWN=false; sessionStorage.clear(); paintMaint();'); return win.eval('probeBackend(1)'); };

  setNet([200], 200);
  t.ok('資料庫回 200：不掛', (await probe()) === false && $('#maintBanner').classList.contains('hidden'));

  setNet([402], 200);
  t.ok('402（超量被停）：馬上掛', (await probe()) === true && !$('#maintBanner').classList.contains('hidden'));
  t.eq('標題沒有日期（不知道要停多久）', $('#maintTitle').textContent, '系統更新中！');
  t.ok('內文照 celine 的字', /這幾天正在進行系統升級作業，登入和排行榜功能將暫時無法使用，造成不便敬請見諒🙏/.test($('#maintBody').textContent));
  t.ok('登入被擋下來', win.eval('maintActive()') === true);
  t.eq('只問了一次（402 不用再確認）', win.__calls.filter((u) => /supabase/.test(u)).length, 1);
  t.ok('問的是最小的那一筆（不吃流量）', /site_settings\?select=key&limit=1/.test(win.__calls[0]));

  setNet([503, 200], 200);
  t.ok('偶爾一次 503、再問就好了：不掛（不要資料庫慢一下就說系統更新）', (await probe()) === false);

  setNet([503, 503], 200);
  t.ok('連兩次 5xx、Worker 卻是通的：掛', (await probe()) === true);

  setNet(['throw', 'throw'], 200);
  t.ok('連不上、但 Worker 通（這個人有網路）：掛', (await probe()) === true);

  setNet(['throw', 'throw'], 'throw');
  t.ok('連不上、Worker 也連不上：是自己沒網路，不掛', (await probe()) === false && $('#maintBanner').classList.contains('hidden'));

  // 手動填了日期的那一則優先
  win.eval('maintDated=()=>true; MAINT_DOWN=true; paintMaint();');
  t.eq('手動填了日期：用有日期的那一則', $('#maintTitle').textContent, '11/3－11/5 系統更新！');

  /* v173：手動填的日期還沒過，但資料庫已經確定恢復 → 公告收掉、登入放行
     （celine：「為甚麼我現在登入功能還未恢復」——Supabase 11/4 就恢復了，公告照日期擋到 11/5） */
  win.eval('maintDated=()=>true; MAINT_DOWN=false; MAINT_UP=false; paintMaint();');
  t.ok('日期內、還沒問過：照日期掛著', !$('#maintBanner').classList.contains('hidden'));
  setNet([200], 200);
  win.eval('sessionStorage.clear();');
  await win.eval('probeBackend(1)');
  t.ok('日期內、但資料庫確定活著：公告收掉', $('#maintBanner').classList.contains('hidden'));
  t.ok('…登入放行', win.eval('maintActive()') === false);
  win.eval('MAINT_UP=false; maintDated=()=>false;');

  /* v170：Supabase 被停掉時，畫面上不要出現「Service for this project is restricted…」那串英文——
     所有請求經過 sxFetch，402 換成一句人話，順便掛公告 */
  win.Response = global.Response;
  win.eval('maintDated=()=>false; MAINT_DOWN=false; paintMaint();');
  win.fetch = () => Promise.resolve(new global.Response(JSON.stringify({ message: 'Service for this project is restricted due to the following violations: exceed_egress_quota.' }), { status: 402 }));
  const r402 = await win.eval('sxFetch("https://x.supabase.co/rest/v1/venues_public")');
  const body = JSON.parse(await r402.text());
  t.ok('402：錯誤訊息換成人話（各區塊的「載入失敗：…」就會是這句）', /系統更新中/.test(body.message) && !/restricted|egress/i.test(JSON.stringify(body)));
  t.eq('狀態碼照舊是 402（呼叫的程式照樣知道是失敗）', r402.status, 402);
  t.ok('而且公告自己掛起來', win.eval('MAINT_DOWN') === true && !$('#maintBanner').classList.contains('hidden'));
  win.fetch = () => Promise.resolve(new global.Response('{"x":1}', { status: 200 }));
  const r200 = await win.eval('sxFetch("https://x.supabase.co/rest/v1/offers")');
  t.eq('其他回應原樣交回去', await r200.text(), '{"x":1}');
  t.ok('Supabase 的連線都走 sxFetch', /createClient\(CFG\.url, CFG\.anonKey, \{global:\{fetch:sxFetch\}\}\)/.test(
    require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8')));

  /* v183 起開站先看 Worker 的 /boot 新不新，舊了或拿不到才自己問（maybeProbeBackend，t97 有跑過行為） */
  t.ok('開站就會去問（不擋開站）', /createClient\(CFG\.url, CFG\.anonKey, \{global:\{fetch:sxFetch\}\}\);\s*maybeProbeBackend\(\);/.test(
    require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8')));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
