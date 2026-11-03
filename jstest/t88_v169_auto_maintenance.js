/* v169：celine「以後幫我注意，如果系統無法登入，都先自動掛個 banner 寫這幾天系統更新，預留我修改的時間」 */
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t88 v169：資料庫連不上就自動掛「系統更新中」');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  delete win.__SXR_NO_MAINT;
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
  t.ok('內文照 celine 的字', /這幾天正在進行系統升級作業，登入功能將暫時無法使用，造成不便敬請見諒🙏/.test($('#maintBody').textContent));
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

  t.ok('開站就會去問（不擋開站）', /createClient\(CFG\.url, CFG\.anonKey\);\s*probeBackend\(\);/.test(
    require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8')));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
