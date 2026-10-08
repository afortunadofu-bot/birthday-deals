/* celine 一次講了好幾件事：

   1.「下次吧好像關不掉 POPUP」——視窗裡的「下次吧」是 <form method="dialog"> 的
      送出鈕。瀏覽器會把視窗關掉，但實測到它**不派送 close 事件**，於是掛在 close
      上的收尾全都沒跑：body 還停在 lockBodyScroll() 設的 position:fixed，整頁
      卡住不能捲。看起來就是「按了也關不掉」。
   2.「更新紀錄不要寫那麼仔細，而且我希望不要是收合，是點進去看到新網頁」。
   3.「關於做這個網頁的人也是，點進去再看到細節」。
   4.「有時候會慢一點那個區塊很醜，文字也怪」。
   5.「請我喝杯咖啡按鈕改回去 ICON，不用提一個人做的，然後這跟免費伺服器的論述
      衝突，改一下」。

   這一支顧 1（修好了沒）跟 2／3（那兩頁真的長出來了沒、內容跟 updates.json
   對得上沒）。按鈕與文案在 t35，面板本身在 t10／t36。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts } = require('./harness');

const HERE = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(HERE, f), 'utf8');

(async () => {
  const t = makeAsserts('t37 獨立頁面＋彈出視窗關得掉');

  /* ================= 1.「下次吧」要真的關得掉 =================
     jsdom 沒有真的 <dialog>（harness 補的 showModal/close 只是切 open），
     所以這裡照「真機上實際發生的事」擺一次：視窗被關掉了（open=false）、
     但沒有人派送 close 事件，然後表單送出的事件進來。修好的話，
     頁面那段補派 close 的程式會把捲動鎖解開。 */
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  const dlg = $('#dlgCoffee');
  const form = dlg.querySelector('form[method="dialog"]');
  t.ok('「下次吧」在 method="dialog" 的表單裡', !!form &&
    [...form.querySelectorAll('button')].some((b) => /下次吧/.test(b.textContent)));

  $('#btnCoffee').classList.remove('hidden');
  $('#btnCoffee').click();
  t.ok('視窗開起來了', dlg.open === true);
  t.eq('開著的時候背景鎖住（iOS 會把底下的頁面捲掉）', doc.body.style.position, 'fixed');

  dlg.open = false;                                     // 瀏覽器自己關掉的
  form.dispatchEvent(new win.Event('submit', { bubbles: true }));
  await tick(win, 3);
  t.eq('關掉之後背景解鎖了（不然整頁卡住，看起來就是關不掉）', doc.body.style.position, '');
  t.ok('收尾的記號也清掉了', !doc.body.dataset.scrollLocked && !dlg.dataset.scrollLocked);

  // 手機返回鍵也要能關它——這顆當初漏掛（開場有 pushDlgHistory，卻沒進關閉清單）
  $('#btnCoffee').click();
  t.ok('再開一次', dlg.open === true);
  win.dispatchEvent(new win.PopStateEvent('popstate', { state: {} }));
  await tick(win, 2);
  t.ok('按返回鍵關得掉咖啡視窗', dlg.open !== true);
  t.eq('而且背景一樣解鎖', doc.body.style.position, '');

  /* ================= 2. 更新紀錄：一份來源，兩個去處 ================= */
  const src = JSON.parse(read('updates.json')).updates;
  const updates = win.eval('SITE_UPDATES');
  t.eq('index.html 裡的更新紀錄筆數跟 updates.json 一樣', updates.length, src.length);
  t.eq('而且是由新到舊', updates.map((u) => u.date), [...src.map((u) => u.date)].sort().reverse());
  t.ok('每一筆都有日期、標題、至少一條內容',
    updates.every((u) => /^\d{4}-\d{2}-\d{2}$/.test(u.date) && u.title && u.items.length));
  // celine：「不要寫那麼仔細」——一筆最多三條，一條不要長到變成一段文章
  t.ok('一筆最多三條', updates.every((u) => u.items.length <= 3),
    updates.filter((u) => u.items.length > 3).map((u) => u.date).join(','));
  const longest = updates.flatMap((u) => u.items).sort((a, b) => b.length - a.length)[0];
  t.ok('一條不超過 60 字', longest.length <= 60, `${longest.length} 字：${longest}`);

  const upd = read('updates.html');
  t.ok('updates.html 是一整頁（不是片段）', /^<!DOCTYPE html>/i.test(upd.trim()));
  t.ok('有標題跟回首頁的路', /<h1>更新紀錄<\/h1>/.test(upd) && /href="\.\/"/.test(upd));
  t.eq('每一筆都印出來了', (upd.match(/<article class="u">/g) || []).length, src.length);
  t.ok('最新那筆排第一', upd.indexOf(updates[0].title) < upd.indexOf(updates[1].title));
  t.ok('細項印在這一頁（「我的」那邊只有標題）', updates[0].items.every((i) => upd.includes(i)));
  t.ok('內容有跳脫', !/<script>bad|onerror=/.test(upd));

  /* ================= 3. 關於做這個網站的人 ================= */
  // 只看真的會被讀到的字：舊那句「主機跟網域的錢也是自己付」還留在註解裡當對照
  const aboutRaw = read('about.html');
  const about = aboutRaw.replace(/<!--[\s\S]*?-->/g, '');
  t.ok('about.html 是一整頁', /^<!DOCTYPE html>/i.test(about.trim()));
  t.ok('有標題', /<h1>關於做這個網站的人<\/h1>/.test(about));
  t.ok('連得到品牌頁（細節搬到這一頁，連結也跟著搬）', /celinefubrandpage/.test(about));
  t.ok('三個 app 都寫到了', /壽星日/.test(about) && /Bandary/.test(about) && /RelateStats/.test(about));
  /* celine：「不用提一個人做的，然後這跟免費伺服器的論述衝突」——
     「自己付主機跟網域」那套不能再出現，照實寫跑在免費方案上就好。 */
  t.ok('照實寫：跑在免費方案上', /免費方案/.test(about));
  t.ok('沒有「主機跟網域自己付」那套互相打架的說法', !/主機跟網域/.test(about));
  t.ok('講得出咖啡要做什麼（換成付費的方案）', /付費/.test(about) && /buymeacoffee/.test(about));
  t.ok('兩頁互相連得到', /updates\.html/.test(about) && /about\.html/.test(upd));

  /* ================= 4. 兩頁都進得去 ================= */
  t.eq('「我的」底部的入口指向 about.html', $('#devIntroLink').getAttribute('href'), 'about.html');
  t.ok('更新紀錄面板有「看完整更新紀錄」',
    [...$('#siteUpdatesPanel').querySelectorAll('a')].some((a) => a.getAttribute('href') === 'updates.html'));
  // 「有時候會慢一點」也接到同一套說法上
  const slow = $('#freeTierNote');
  t.ok('「有時候會慢一點」連得到「它是怎麼養著的」',
    [...slow.querySelectorAll('a')].some((a) => a.getAttribute('href') === 'about.html'));
  t.ok('烏龜不在標題的文字裡（區塊排序的清單是讀 h2 當名字的）',
    !/🐢/.test(slow.querySelector('h2').textContent), slow.querySelector('h2').textContent);
  t.eq('區塊排序的清單叫得出它的名字', win.eval('blkName(document.querySelector("#freeTierNote"))'),
    '有時候會慢一點');
  // celine：「文字也怪」——原本兩句各道歉一次
  t.ok('不要道歉兩次', !/請多包涵/.test(slow.textContent) && !/說聲抱歉/.test(slow.textContent),
    slow.textContent.replace(/\s+/g, ' ').trim());
  t.ok('但該講的還是講了', /不是你的網路/.test(slow.textContent) && /免費方案/.test(slow.textContent));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
