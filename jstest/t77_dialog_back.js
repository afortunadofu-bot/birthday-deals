/* 用按鈕關掉視窗，不要跳「再按一次返回鍵可以離開」

   從 v49 起就有的：consumeDlgHistory() 先把旗標清成 false 再 history.back()，
   那一次 popstate 進來時看到「沒有視窗開著」，就當成使用者在最上層按返回——
   跳出那一行**而且把離開的開關打開兩秒**。所以用按鈕關掉任何一個視窗（最常用的
   優惠詳情也是）都會閃那一行；手機上「關掉、再按一下返回」就直接把網站關了。
   v157 寫行程的「加店家」時在瀏覽器裡看到才發現，之前沒有任何一支測試在看它。

   三種情況都要對：
     1. 用按鈕關        → 什麼都不提示、不準備離開
     2. 開著時按返回鍵  → 把視窗關掉、不提示
     3. 沒有視窗時按返回 → 提示「再按一次」（這個功能本身是對的，不能一起修掉） */
const { boot, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t77 關視窗不會被當成要離開');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  /* jsdom 的 history.back() 要經過三層 setTimeout(0) 才派送 popstate，而開機之後頁面
     還有一堆計時器在跑——80ms 等不到，400ms 穩。 */
  const wait = (ms) => new Promise((r) => setTimeout(r, Math.max(ms, 400)));
  const toasts = () => [...doc.querySelectorAll('.toast')].map((e) => e.textContent).join(' ');
  const clear = () => { doc.querySelectorAll('.toast').forEach((e) => e.remove()); win.eval('EXIT_ARMED=false'); };

  /* 1. 用按鈕關。harness 的 <dialog> 不會自己派送 close 事件（真的瀏覽器會），
        所以這裡直接呼叫 close 事件上掛的那一支，等於真機上按了「下次吧」。 */
  clear();
  win.eval("document.querySelector('#dlgCoffee').showModal(); pushDlgHistory();");
  t.ok('打開時有推一筆紀錄', win.eval('DLG_HISTORY_PUSHED') === true);
  win.eval("document.querySelector('#dlgCoffee').close(); consumeDlgHistory();");
  await wait(80);
  t.ok('用按鈕關：不跳「再按一次返回鍵」', !/再按一次返回鍵/.test(toasts()), toasts());
  t.ok('用按鈕關：不準備離開', win.eval('EXIT_ARMED') === false);
  t.ok('自己造成的那一次已經消化掉了', win.eval('DLG_SELF_BACK') === false);

  // 2. 開著的時候按返回鍵：關掉視窗
  clear();
  win.eval("document.querySelector('#dlgCoffee').showModal(); pushDlgHistory();");
  win.history.back();
  await wait(80);
  t.ok('開著時按返回：視窗關掉', !$('#dlgCoffee').open);
  t.ok('開著時按返回：不提示要離開', !/再按一次返回鍵/.test(toasts()) && win.eval('EXIT_ARMED') === false);

  // 3. 沒有視窗開著時按返回：這才是要提示的時候
  clear();
  win.history.back();
  await wait(80);
  t.ok('沒有視窗時按返回：提示再按一次', /再按一次返回鍵/.test(toasts()), toasts());
  t.ok('沒有視窗時按返回：準備離開', win.eval('EXIT_ARMED') === true);
  win.eval('EXIT_ARMED=false');

  /* 4. v153「推薦一個地點」跟 v156「加店家」當初沒列進返回鍵要關的那份清單：
        手機上按返回，視窗不關、反而跳「再按一次」。 */
  for (const id of ['dlgVenueSuggest', 'dlgPlanAdd']) {
    clear();
    win.eval(`document.querySelector('#${id}').showModal(); pushDlgHistory();`);
    win.history.back();
    await wait(80);
    t.ok(`#${id}：按返回鍵關得掉`, !$('#' + id).open);
    t.ok(`#${id}：不會被當成要離開`, win.eval('EXIT_ARMED') === false);
  }

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
