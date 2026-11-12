/* v190 celine：「目前沒半個人給過錢」「說維運一個月要兩千塊之類的」，
   接著「你要做為一個有 20 年專業的 QA 完整測試完並提出優化建議」。

   10/12～11/11 每週：點開咖啡說明 1～2%，點開的人只有約 6% 按去 Buy Me a Coffee。
   這一版：
     1. 視窗寫出一個月大約 2,000 元、錢去哪、一杯多少（3 美元≈100 元，20 杯就夠）
     2. 多兩個入口：「我的」累積省下底下（省 300 元以上才出現）、「有時候會慢一點」那塊
     3. 事件帶 from，之後看得出哪個入口有用
   全部要跟著管理員的「左下角的咖啡按鈕」開關走——關掉就三個入口一起不見。 */
const { boot, tick, makeSb, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t101 v190 咖啡說明與入口');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const shown = (el) => !!el && !el.classList.contains('hidden');

  // 事件改記在陣列裡，不要真的送出去
  win.eval('window.__ev=[]; logEvent=(t,m)=>{ window.__ev.push([t, m||{}]); };');
  const evs = () => JSON.parse(JSON.stringify(win.__ev));
  const closeDlg = () => { try { $('#dlgCoffee').close(); } catch {} };

  /* ===== 1. 視窗的字（只看讀者看得到的，不看註解） ===== */
  const say = $('#dlgCoffee .coffee-say').textContent.replace(/\s+/g, ' ');
  /* v191 celine：「寫糊一點不要太清楚」——給區間、只講種類不點名哪家服務 */
  t.ok('講得出每個月大概要多少（區間）', /每個月大概兩三千元/.test(say), say);
  t.ok('只講種類，不點名哪家服務', !/Supabase|Cloudflare|Claude/i.test(say), say);
  t.ok('講得出錢去哪（資料庫、主機、AI、API）', /資料庫/.test(say) && /主機/.test(say) && /AI 工具/.test(say) && /API/.test(say), say);
  t.ok('有一杯多少錢，跟 Buy Me a Coffee 那頁（3 美元）對得上', /3 美元（約 100 元）/.test(say), say);
  t.ok('停擺寫日期不寫「11 月初」（過幾個月就讀不懂）', /11\/3/.test(say) && !/11 月初/.test(say), say);

  /* ===== 2. 三個入口都開同一張視窗，事件帶來源 ===== */
  win.eval('SITE_FLAGS.show_coffee = true; applySiteFlags();');
  t.ok('左下角的杯子在', shown($('#btnCoffee')));
  const slow = $('#freeTierNote [data-coffee-from="slow_note"]');
  t.ok('「有時候會慢一點」那塊有咖啡入口', shown(slow));

  $('#btnCoffee').click(); await tick(win);
  t.ok('按杯子 → 視窗打開', $('#dlgCoffee').open);
  t.eq('事件記得是從杯子來的', evs().filter((e) => e[0] === 'coffee_open').map((e) => e[1].from), ['icon']);
  closeDlg();

  slow.click(); await tick(win);
  t.ok('按「有時候會慢一點」的入口 → 同一張視窗', $('#dlgCoffee').open);
  $('#btnCoffeeGo').click(); await tick(win);
  t.eq('去 Buy Me a Coffee 的事件也帶同一個來源',
    evs().filter((e) => e[0] === 'coffee_go').map((e) => e[1].from), ['slow_note']);
  t.ok('按了去之後視窗收起來', !$('#dlgCoffee').open);

  /* ===== 3. 「我的」累積省下：省 300 以上才出現 ===== */
  win.__sb = makeSb({ tables: {} });
  win.eval(`sb = window.__sb; LIVE = true; me = {id:'u-qa'};`);
  const sv = (total) => ({ saved_total: total, saved_this_year: total, success_count: 2, brands_used: 2 });
  await win.loadMyStuff({ savings: sv(120) }); await tick(win);
  t.ok('省 120 元：不提咖啡（還沒什麼好謝的）', !$('#mySavings [data-coffee-from]'), $('#mySavings').innerHTML.slice(0, 300));
  await win.loadMyStuff({ savings: sv(850) }); await tick(win);
  const hero = $('#mySavings [data-coffee-from="savings"]');
  t.ok('省 850 元：累積省下底下有一行咖啡', !!hero && shown(hero.closest('.coffee-entry')), $('#mySavings').innerHTML.slice(0, 400));
  hero.click(); await tick(win);
  t.ok('按了打開同一張視窗', $('#dlgCoffee').open);
  t.eq('來源記成 savings', evs().filter((e) => e[0] === 'coffee_open').map((e) => e[1].from).slice(-1), ['savings']);
  closeDlg();

  /* ===== 4. 管理員關掉：三個入口一起不見，也打不開 ===== */
  win.eval('SITE_FLAGS.show_coffee = false; applySiteFlags();');
  t.ok('關掉：杯子不見', !shown($('#btnCoffee')));
  t.ok('關掉：「有時候會慢一點」的入口不見', !shown(slow));
  t.ok('關掉：累積省下那行不見', !shown($('#mySavings .coffee-entry')));
  await win.loadMyStuff({ savings: sv(850) }); await tick(win);
  t.ok('關著的時候重畫「我的」，那行也不會冒出來', !shown($('#mySavings .coffee-entry')));
  const before = evs().length;
  win.eval(`openCoffee('slow_note')`); await tick(win);
  t.ok('關著的時候就算被叫到也不開', !$('#dlgCoffee').open);
  t.eq('也不記事件', evs().length, before);

  win.eval('SITE_FLAGS.show_coffee = true; applySiteFlags();');
  t.ok('再打開：三個入口回來', shown($('#btnCoffee')) && shown(slow) && shown($('#mySavings .coffee-entry')));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
