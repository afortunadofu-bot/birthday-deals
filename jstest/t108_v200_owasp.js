/* v200：用 OWASP Top 10 檢查壽星日之後修的幾件事
   A03 使用者填的來源網址只接受 http(s)；A08 外部 CDN 的程式帶 integrity、版本釘死；
   A05 安全標頭（_headers）；資料庫那支 schema_v200_security.sql 收回 anon 讀 site_events。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts } = require('./harness');
const ROOT = path.join(__dirname, '..');

(async () => {
  const t = makeAsserts('t108 v200 OWASP 檢查後的修正');
  const { win } = await boot();
  const doc = win.document;

  /* ---- A03：javascript: 這種網址不能變成連結 ---- */
  const sh = (u) => win.eval(`safeHref(${JSON.stringify(u)})`);
  t.eq('https 照常', sh('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  t.eq('http 照常', sh('http://example.com'), 'http://example.com');
  t.eq('javascript: 擋掉', sh('javascript:alert(1)'), '');
  t.eq('大小寫、前面空白也擋', sh('  JaVaScRiPt:alert(1)'), '');
  t.eq('data: 擋掉', sh('data:text/html,<script>alert(1)</script>'), '');
  t.eq('沒有 scheme 的也不畫', sh('www.example.com'), '');
  t.eq('空的', sh(null), '');

  const bad = 'javascript:alert(document.cookie)';
  const html = win.eval(`(()=>{ const o={...seedOffers()[0]};
    o.sources=[{url:${JSON.stringify(bad)},tier:1},{url:'https://ok.example/x',tier:2}]; o.bestSource=o.sources[0];
    return offerCardHtml(o,0)+'|||'+offerFactsHtml(o); })()`);
  const box = doc.createElement('div');
  box.innerHTML = html;
  const hrefs = [...box.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
  t.ok('卡片、詳情裡沒有 javascript: 連結', hrefs.every((h) => !/^\s*javascript:/i.test(h)), hrefs.join(' , '));
  t.ok('正常的那個來源還在', hrefs.includes('https://ok.example/x'), hrefs.join(' , '));

  /* ---- A08：外部 script 帶 integrity ---- */
  win.eval(`loadScriptTag('https://cdn.example/x.js', 50, 'sha384-abc')`);
  const scriptBy = (re) => [...doc.querySelectorAll('script')].filter((s) => re.test(s.src || '')).pop();
  const sc = scriptBy(/cdn\.example\/x\.js$/);
  t.ok('有給雜湊就帶 integrity + crossorigin',
    !!sc && sc.getAttribute('integrity') === 'sha384-abc' && sc.getAttribute('crossorigin') === 'anonymous');
  win.eval(`loadScriptTag('config.js?t108', 50)`);
  const own = scriptBy(/config\.js\?t108$/);
  t.ok('自己站上的檔案不帶', !!own && !own.hasAttribute('integrity'));
  const urls = win.eval('SDK_URLS');
  t.ok('SDK 備援版本釘死（不是 @2 最新版）', urls.length === 2 && urls.every((u) => /@2\.\d+\.\d+\//.test(u)), urls.join(' '));
  t.ok('每個備援網址都有雜湊', urls.every((u) => /^sha384-/.test(win.eval(`SDK_SRI[${JSON.stringify(u)}]`))));
  // jsDelivr 那份跟站上 vendor/ 那份是同一個檔案：雜湊要對得上，不然換版時忘了改會整個載不進來
  const crypto = require('crypto');
  const local = 'sha384-' + crypto.createHash('sha384').update(fs.readFileSync(path.join(ROOT, 'vendor', 'supabase.min.js'))).digest('base64');
  t.eq('jsDelivr 那份的雜湊＝站上那份', win.eval('SDK_SRI[SDK_URLS[0]]'), local);
  t.ok('jsDelivr 的版本＝站上那份的版本',
    urls[0].includes('@' + (fs.readFileSync(path.join(ROOT, 'vendor', 'supabase.min.js'), 'utf8').match(/supabase-js@(\d+\.\d+\.\d+)/) || [])[1] + '/'));

  win.eval('window.L=undefined');
  win.eval('loadLeaflet()');
  await tick(win);
  const lcss = doc.querySelector('link[data-leaflet]');
  const ljs = scriptBy(/leaflet/);
  t.ok('Leaflet 的 css 帶 integrity', !!lcss && /^sha384-/.test(lcss.getAttribute('integrity') || ''));
  t.ok('Leaflet 的 js 帶 integrity', !!ljs && /^sha384-/.test(ljs.getAttribute('integrity') || ''));

  /* ---- A05：安全標頭 ---- */
  const hdr = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8');
  const lines = hdr.split('\n');
  const start = lines.indexOf('/*');
  const rules = lines.slice(start + 1).filter((l) => /^\s+\S+:/.test(l)).map((l) => l.trim().split(':')[0]);
  t.ok('_headers 套到全部網址', start >= 0);
  ['X-Content-Type-Options', 'X-Frame-Options', 'Content-Security-Policy', 'Referrer-Policy', 'Permissions-Policy']
    .forEach((h) => t.ok(`有 ${h}`, rules.includes(h), rules.join(',')));
  t.ok('定位只給自己（「附近」要用），不是整個關掉', /geolocation=\(self\)/.test(hdr));
  t.ok('不准別人用 iframe 包', /frame-ancestors 'none'/.test(hdr));
  const pub = fs.readFileSync(path.join(ROOT, 'publish.py'), 'utf8');
  t.ok('publish.py 會把 _headers 放進上傳資料夾', /'_headers':\s*'_headers'/.test(pub));

  /* ---- 資料庫 ---- */
  const sql = fs.readFileSync(path.join(ROOT, 'schema_v200_security.sql'), 'utf8');
  t.ok('收回 anon 讀 site_events', /revoke select on public\.site_events from anon;/.test(sql));
  t.ok('管理員判斷只問一次（select 包起來）', /using \(\(select public\.is_admin\(\)\)\)/.test(sql));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
