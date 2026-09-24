/* 優惠列表分批畫＋彈出視窗不跳回最上面（嵐）

   1.「往下滑一滑網頁都會出錯，無法顯示」：原本一次把所有符合條件的卡片畫出來，
      手機／iPad 記憶體吃緊會整頁重載。改成一次 30 張，滑到底再接著畫。
      - 第一次只畫 30 張，但「共幾筆」還是全部
      - 「再看更多」按鈕會接著畫，數字跟著更新，畫完就收起來
      - 滑到離底部 600px 以內會自動接著畫；還很遠就不畫
   2.「用 iPad 點開一筆關掉後又會跑到最上面」：打開彈出視窗時把背景固定住，
      關掉時還原並捲回原來的位置。 */
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t18 列表分批＋關視窗不跳頁');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const cards = () => doc.querySelectorAll('#grid .card').length;

  /* ================= 1. 分批畫 ================= */
  // jsdom 裡每個元素的位置都是 0，會一直被判定成「已經滑到底」，所以先把哨兵固定成「離底部還很遠」
  const sentinel = $('#gridSentinel');
  const setTop = (v) => { sentinel.getBoundingClientRect = () => ({ top: v, bottom: v, left: 0, right: 0, width: 0, height: 0 }); };
  const far = () => setTop(win.innerHeight + 2000);
  far();
  win.render();
  await tick(win, 2);

  const total = win.eval('GRID_LIST.length');
  t.ok('種子資料夠多，測得出分批', total > 30, total);
  t.eq('第一次只畫 30 張', cards(), 30);
  t.eq('「共幾筆」還是全部符合條件的筆數', Number(($('#count').textContent.match(/(\d+)/) || [])[1]), total);
  t.ok('「再看更多」寫出還有幾筆', /還有 \d+ 筆/.test($('#btnGridMore').textContent), $('#btnGridMore').textContent);

  $('#btnGridMore').click();
  t.eq('按一下多畫 30 張', cards(), Math.min(60, total));
  t.ok('按鈕數字跟著更新', $('#btnGridMore').textContent.includes(String(total - cards())), $('#btnGridMore').textContent);

  /* ---- 滑到接近底部才自動接著畫 ---- */
  const before = cards();
  far();
  win.maybePaintMore();
  t.eq('離底部還很遠時不會亂畫', cards(), before);
  setTop(win.innerHeight + 100);
  win.maybePaintMore();
  t.eq('滑到接近底部就接著畫', cards(), Math.min(before + 30, total));

  // 捲動事件也接得上
  far();
  const before2 = cards();
  setTop(win.innerHeight - 10);
  win.dispatchEvent(new win.Event('scroll'));
  await new Promise((r) => win.setTimeout(r, 200));
  t.ok('捲動時會自動接著畫', cards() > before2, { before2, now: cards() });

  // 全部畫完就收起按鈕
  for (let i = 0; i < 30 && cards() < total; i++) win.maybePaintMore();
  t.eq('全部畫完', cards(), total);
  t.ok('畫完就不顯示「再看更多」', $('#gridMore').classList.contains('hidden'));

  // 換篩選條件時重來
  far();
  $('#q').value = '';
  win.render();
  await tick(win, 2);
  t.eq('重新篩選後從第一批重畫', cards(), win.eval('Math.min(GRID_LIST.length, 30)'));

  /* ================= 2. 開關彈出視窗不跳頁 ================= */
  const scrolls = [];
  win.scrollTo = (x, y) => { scrolls.push(typeof x === 'object' ? x.top : y); };
  Object.defineProperty(win, 'scrollY', { value: 1234, configurable: true });
  const dlg = $('#dlgReport');
  dlg.showModal();
  t.eq('打開時把背景固定住', [doc.body.style.position, doc.body.style.top], ['fixed', '-1234px']);
  dlg.close();
  t.eq('關掉時還原', [doc.body.style.position, doc.body.style.top], ['', '']);
  t.eq('關掉時捲回原來的位置', scrolls[scrolls.length - 1], 1234);

  // 關掉視窗之後會 history.back()，瀏覽器的「自動捲動還原」會把我們剛還原好的位置蓋掉
  // （記到的是 body 被 fixed 住時的 0）——celine：「按關閉鈕一直跳回去頁面最上面」。
  t.eq('關掉瀏覽器的自動捲動還原，捲動位置由我們自己管', win.history.scrollRestoration, 'manual');

  // 同一次點擊重複打開不會把鎖疊起來（疊起來就解不開了）
  dlg.showModal();
  dlg.showModal();
  dlg.close();
  t.eq('重複打開也解得開', doc.body.style.position, '');

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
