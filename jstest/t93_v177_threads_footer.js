/* v177：頁尾連到小數據所的 Threads（@dayscount），聯絡信箱換成品牌信箱。
   問 runtime：真的開頁面、真的點下去，看記到什麼。 */
const fs = require('fs');
const path = require('path');
const { boot, makeAsserts } = require('./harness');

const root = path.join(__dirname, '..');

(async () => {
  const t = makeAsserts('t93 頁尾 Threads 與品牌信箱');
  const { win } = await boot();
  const doc = win.document;

  const a = doc.querySelector('#xsjFooter a[href*="threads.com/@dayscount"]');
  t.ok('頁尾小數據所那塊有 Threads 連結', !!a);
  t.ok('開新分頁', a && a.target === '_blank' && /noopener/.test(a.rel));

  const events = [];
  win.eval(`LIVE=true; logEvent=(type,meta)=>window.__ev.push({type,meta});`);
  win.__ev = events;
  doc.addEventListener('click', (e) => e.preventDefault());
  a.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  t.eq('點 Threads 記一筆 studio_click', events.map((e) => e.type), ['studio_click']);
  t.eq('記成 threads', events[0] && events[0].meta.to, 'threads');

  const mails = [...doc.querySelectorAll('a[href^="mailto:"]')].map((x) => x.getAttribute('href'));
  t.ok('首頁聯絡信箱是品牌信箱', mails.includes('mailto:dayscount.tw@gmail.com'), JSON.stringify(mails));

  for (const f of ['index.html', 'about.html', 'privacy.html', 'terms.html']) {
    const html = fs.readFileSync(path.join(root, f), 'utf8');
    t.ok(`${f} 不再出現個人信箱`, !html.includes('celine.fu@gmail.com'));
  }
  t.ok('about.html 有 Threads 按鈕',
    fs.readFileSync(path.join(root, 'about.html'), 'utf8').includes('threads.com/@dayscount'));

  t.done();
})();
