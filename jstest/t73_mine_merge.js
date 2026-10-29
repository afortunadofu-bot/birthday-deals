/* v154：「我的」頁面 block 過多（celine：「看能不能整合」）

   18 塊 → 13 塊，兩組：
     「我送出過的」＝ 我的投稿＋我的使用回報＋我回報過的問題（三顆小分頁）
     「關於壽星日」＝ 加到主畫面＋更新紀錄＋關於做這個網站的人＋有時候會慢一點

   這一支最在意的：
   - 內容一個都不能少，只是住進了別人的那一塊
   - 收進去的那幾段，原本有程式在找它們的 id——那些程式要照舊找得到
   - 自己排過順序的人，不能因為七個 id 不見了就整頁亂掉
   - 「關於壽星日」標題上的 NEW 是狀態，不是名字 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, stubHeavy } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

(async () => {
  const t = makeAsserts('t73 「我的」18 塊併成 13 塊');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];

  /* ================= 一、塊數 ================= */
  const blocks = win.eval("blkList('mine').map(el=>el.id)");
  t.eq('「我的」剩 13 塊', blocks.length, 13, blocks.join(','));
  ['myRecordsPanel', 'aboutSitePanel'].forEach((id) =>
    t.ok(`${id} 是一塊可以排順序的區塊`, blocks.includes(id)));
  ['myOffersPanel', 'myReportsPanel', 'a2hsPanel', 'siteUpdatesPanel', 'devIntroPanel',
    'freeTierNote'].forEach((id) =>
    t.ok(`${id} 不再自己佔一塊`, !blocks.includes(id)));
  /* 「回報網站問題」刻意不收：它是一個動作，不是一段說明 */
  t.ok('「回報網站問題」還是自己一塊', blocks.includes('feedbackPanel'));

  /* ================= 二、「我送出過的」 ================= */
  const rec = $('#myRecordsPanel');
  t.ok('是登入才看得到的', rec.classList.contains('authed-only'));
  /* 三塊本來就都預設收著，合起來也一樣 */
  t.ok('預設收著',
    JSON.parse(win.eval('JSON.stringify([...PANEL_DEFAULT_CLOSED])')).includes('myRecordsPanel'));
  t.ok('「＋ 投稿」在標題列上（收起來也按得到）', rec.querySelector('h2').contains($('#btnGoSubmitMine')));
  ['myOffers', 'myReports', 'myFeedback'].forEach((id) =>
    t.ok(`畫清單的容器 #${id} 一個字都沒動`, rec.contains($('#' + id))));

  const tabs = () => $$('#myRecordsPanel .rec-tab');
  const pane = (r) => $('#rec' + r);
  const shown = (r) => pane(r).classList.contains('on');
  t.eq('三顆小分頁', tabs().map((b) => b.textContent.replace(/\d+/g, '').trim()),
    ['投稿', '使用回報', '問題回報']);
  t.ok('一開始是「投稿」', shown('Offers') && !shown('Reports') && !shown('Feedback'));

  tabs()[1].click();
  t.ok('點「使用回報」換過去', shown('Reports') && !shown('Offers'));
  t.eq('選到的那顆有標起來', tabs()[1].getAttribute('aria-selected'), 'true');
  t.eq('其他的沒有', tabs()[0].getAttribute('aria-selected'), 'false');
  t.eq('記住上次看哪一格', win.localStorage.getItem('sxr_my_record_tab'), 'Reports');

  /* 「問題回報」一筆都沒有的時候，連分頁鈕都不要出現——一顆點下去是空的按鈕，
     比少一顆還糟。loadMyFeedback() 有三條路會把那一格藏起來，這裡直接看它的 class。 */
  tabs()[2].click();
  t.ok('切到「問題回報」', shown('Feedback'));
  $('#myFeedbackPanel').classList.add('hidden');
  await tick(win, 2);                       // MutationObserver 是非同步的
  t.ok('那一格沒東西：分頁鈕也藏起來', tabs()[2].classList.contains('hidden'));
  t.ok('而且自動跳到看得見的那一格', shown('Offers') && !shown('Feedback'));
  $('#myFeedbackPanel').classList.remove('hidden');
  await tick(win, 2);
  t.ok('有東西了：分頁鈕回來', !tabs()[2].classList.contains('hidden'));

  // 記住的是一格已經藏起來的 → 開場不要停在空的那一格
  win.localStorage.setItem('sxr_my_record_tab', 'Feedback');
  $('#myFeedbackPanel').classList.add('hidden');
  await tick(win, 2);
  win.eval("showMyRecord(localStorage.getItem('sxr_my_record_tab'))");
  t.ok('記住的那格藏起來了，就改去看得見的', !shown('Feedback'));
  $('#myFeedbackPanel').classList.remove('hidden');
  await tick(win, 2);

  /* ================= 三、「關於壽星日」 ================= */
  const about = $('#aboutSitePanel');
  t.ok('訪客也看得到（不在會員專屬裡）', !about.classList.contains('authed-only'));
  t.ok('預設展開（四段本來都是開著的，合起來不要突然藏起來）',
    !JSON.parse(win.eval('JSON.stringify([...PANEL_DEFAULT_CLOSED])')).includes('aboutSitePanel'));
  ['a2hsPanel', 'siteUpdatesPanel', 'devIntroPanel', 'freeTierNote'].forEach((id) =>
    t.ok(`#${id} 還在，住在這一塊裡`, about.contains($('#' + id))));
  /* 這四個 id 都有別的程式在找，所以留著——但它們不能再是 .panel：
     自動收合那一支會掃 #tab-mine .panel，掃到的話每一段都會長出自己的收合箭頭。 */
  ['a2hsPanel', 'siteUpdatesPanel', 'devIntroPanel', 'freeTierNote'].forEach((id) =>
    t.ok(`#${id} 不再是一個面板（不會自己長出收合箭頭）`,
      !$('#' + id).classList.contains('panel') && !$('#' + id).querySelector('.pctoggle')));
  t.ok('NEW 搬到外面這一塊的標題上（收起來也看得到）',
    about.querySelector(':scope > h2').contains($('#updHeadNew')));

  /* 管理員關掉「關於做這個網站的人」→ 只藏那一段，不是整塊 */
  win.eval('SITE_FLAGS.show_dev_intro=false; applySiteFlags();');
  t.ok('關掉介紹：那一段藏起來', $('#devIntroPanel').classList.contains('hidden'));
  t.ok('關掉介紹：整塊還在（還有更新紀錄）', !about.classList.contains('hidden'));
  win.eval('SITE_FLAGS.show_dev_intro=true; applySiteFlags();');

  /* 分隔線只畫在「前面還有一段看得見的」那幾段上——已經裝到主畫面的人第一段整個
     藏起來，用 :first-child 的話第二段頂上會多一條線 */
  t.ok('分隔線看的是「前面有沒有看得見的一段」',
    /\.about-row:not\(\.hidden\) ~ \.about-row\{/.test(index));

  /* 外面那塊收著的時候，裡面的更新紀錄看不到——不能被算成「看過了」 */
  const h2 = about.querySelector(':scope > h2');
  if (!about.classList.contains('collapsed')) h2.click();
  t.ok('外面收著：更新紀錄不算打開', win.eval('updatesPanelOpen()') === false);
  h2.click();
  t.ok('外面打開：才算', win.eval('updatesPanelOpen()') === true);

  /* 頂部「怎麼加到主畫面」：外面那塊收著的話要先打開，不然捲過去什麼都看不到 */
  if (!about.classList.contains('collapsed')) h2.click();
  win.eval('deferredInstall=null');
  $('#btnMineA2hs').click();
  t.ok('「怎麼加」會先把外面那塊打開', !about.classList.contains('collapsed'));

  /* 「版面設定」那張清單讀 h2 當名字。NEW、計數、箭頭都是狀態不是名字——
     不然同一塊有兩個名字（有新的時候一個、看過之後一個）。 */
  $('#updHeadNew').classList.remove('hidden');
  t.eq('「關於壽星日」的名字不含 NEW', win.eval('blkName(document.querySelector("#aboutSitePanel"))'),
    '關於壽星日');
  t.eq('「我送出過的」的名字不含那顆按鈕', win.eval('blkName(document.querySelector("#myRecordsPanel"))'),
    '我送出過的');

  /* ================= 四、自己排過順序的人 ================= */
  /* 存檔裡還是舊的七個 id。那些 id 現在已經不是區塊了，blkDesired 會直接略過——
     新的兩塊就沒有排名。換一次：新的那塊放在它的成員裡最先出現的位置。 */
  const KEY = 'sxr_order_mine', FLAG = 'sxr_order_merged_v154';
  const migrate = (saved) => {
    win.localStorage.removeItem(FLAG);
    win.localStorage.setItem(KEY, JSON.stringify(saved));
    win.eval('mergeSavedBlocksOnce()');
    return JSON.parse(win.localStorage.getItem(KEY));
  };
  let out = migrate(['wishlistPanel', 'myReportsPanel', 'profilePanel', 'myOffersPanel',
    'siteUpdatesPanel', 'feedbackPanel', 'a2hsPanel', 'devIntroPanel']);
  t.eq('七個舊的換成兩個新的，各放在成員最先出現的位置', out,
    ['wishlistPanel', 'myRecordsPanel', 'profilePanel', 'aboutSitePanel', 'feedbackPanel']);
  t.eq('換完記旗標', win.localStorage.getItem(FLAG), '1');

  // 只換一次：之後自己搬過，下次開站不要又被拉回來
  win.localStorage.setItem(KEY, JSON.stringify(['aboutSitePanel', 'wishlistPanel', 'myRecordsPanel']));
  win.eval('mergeSavedBlocksOnce()');
  t.eq('第二次不再動', JSON.parse(win.localStorage.getItem(KEY)),
    ['aboutSitePanel', 'wishlistPanel', 'myRecordsPanel']);

  // 存檔裡只有其中幾個成員：還是換得過去
  out = migrate(['profilePanel', 'freeTierNote']);
  t.eq('只剩一個成員也認得出來', out, ['profilePanel', 'aboutSitePanel']);
  // 沒存過順序：不要無中生有一份
  win.localStorage.removeItem(FLAG); win.localStorage.removeItem(KEY);
  win.eval('mergeSavedBlocksOnce()');
  t.eq('沒存過就什麼都不寫', win.localStorage.getItem(KEY), null);
  win.localStorage.removeItem(KEY);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
