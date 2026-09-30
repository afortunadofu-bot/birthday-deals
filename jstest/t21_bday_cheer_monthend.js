/* 生日祝賀動畫 ＋ 月底到期提醒（嵐）

   1.「如果使用者有寫自己的生日日期，在生日當天或當週點進來的話，會得到生日動畫跟小卡片、
      蠟燭之類的，祝她生日快樂玩得開心」
      - 當天：滿版紙花＋「生日快樂，○○！」
      - 前後 3 天：同一張卡片，語氣改成「生日快到了」
      - 每年每台裝置各跳一次；沒填生日（或只填月份）不跳
      - 生日祝賀在跳的時候，更新紀錄的通知先讓路
   2.「九月份過期的可以讓他們在月底前收到」：月底前 7 天提醒待辦清單裡這個月會結束的優惠 */
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t21 生日祝賀＋月底提醒');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const ls = win.localStorage;

  const today = new Date(win.eval('TODAY.getTime()'));
  const setBday = (d) => {
    $('#bmonth').value = String(d.getMonth() + 1);
    $('#bday').value = String(d.getDate());
  };
  const plus = (n) => new Date(today.getTime() + n * 864e5);
  const clearKeys = () => Object.keys({ ...ls }).forEach((k) => { if (k.startsWith('sxr_bday_cheer')) ls.removeItem(k); });

  win.eval('myProfile = {display_name:"嵐"}; me = {id:"u-1"};');

  /* ---- 沒填生日不跳 ---- */
  $('#bmonth').value = ''; $('#bday').value = '';
  t.ok('沒填生日不跳', win.maybeShowBirthdayCheer() === false && $('#bdayCheer').classList.contains('hidden'));
  // 只填月份不知道是哪一天，也不跳
  $('#bmonth').value = String(today.getMonth() + 1); $('#bday').value = '';
  t.ok('只填月份不跳', win.maybeShowBirthdayCheer() === false);

  /* ---- 生日當天 ---- */
  clearKeys();
  setBday(today);
  t.ok('生日當天會跳', win.maybeShowBirthdayCheer() === true && !$('#bdayCheer').classList.contains('hidden'));
  t.ok('寫出名字跟生日快樂', /生日快樂，嵐/.test($('#bdayCheerTitle').textContent), $('#bdayCheerTitle').textContent);
  // celine：「卡片文字多一點生日祝福」——標題下面多一句祝福語，隨機從一組裡挑
  t.ok('有一句生日祝福', /[。！]/.test($('#bdayCheerWish').textContent) && $('#bdayCheerWish').textContent.length >= 10,
    $('#bdayCheerWish').textContent);
  t.ok('下面那行講待辦清單或去挑優惠',
    /待辦清單|挑幾個/.test($('#bdayCheerSub').textContent), $('#bdayCheerSub').textContent);
  t.ok('紙花有三種形狀（長方形／圓形／彩帶）',
    new Set([...doc.querySelectorAll('#bdayConfetti i')].map((x) => x.className)).size === 3,
    [...new Set([...doc.querySelectorAll('#bdayConfetti i')].map((x) => x.className))]);
  t.ok('蛋糕旁邊有小亮點', doc.querySelectorAll('.bday-spark').length >= 4);
  t.ok('有蛋糕跟蠟燭', !!$('#bdayCheer .bday-cake') && !!$('#bdayCheer .bday-flame'));
  t.ok('有紙花在掉', doc.querySelectorAll('#bdayConfetti i').length >= 20);
  t.ok('紙花不是排隊掉下來（延遲各自不同）',
    new Set([...doc.querySelectorAll('#bdayConfetti i')].map((x) => x.style.animationDelay)).size > 5);

  /* ---- 生日祝賀在跳的時候，更新紀錄通知先讓路 ---- */
  ls.removeItem('sxr_updates_seen'); ls.removeItem('sxr_updates_nudge_done');
  ls.setItem('sxr_updates_seen', '2000-01-01');
  t.ok('更新通知讓給生日祝賀', win.maybeShowUpdatesNudge() === false && $('#updatesNudge').classList.contains('hidden'));

  /* ---- 關掉 ---- */
  $('#btnBdayCheerClose').click();
  t.ok('按「知道了」關掉', $('#bdayCheer').classList.contains('hidden'));
  t.eq('關掉後紙花也清掉（不要一直在背景動）', doc.querySelectorAll('#bdayConfetti i').length, 0);
  t.ok('同一年不會再跳第二次', win.maybeShowBirthdayCheer() === false);

  /* ---- 點背景也關得掉 ---- */
  clearKeys();
  win.maybeShowBirthdayCheer();
  $('#bdayCheer').dispatchEvent(new win.Event('click'));  // target 就是 #bdayCheer 本身
  t.ok('點卡片外面也關得掉', $('#bdayCheer').classList.contains('hidden'));

  /* ---- 「看我的待辦清單」 ---- */
  clearKeys();
  win.maybeShowBirthdayCheer();
  $('#btnBdayCheerGo').click();
  await tick(win, 2);
  t.ok('按「看我的待辦清單」會關掉並切到「我的」分頁',
    $('#bdayCheer').classList.contains('hidden') && !$('#tab-mine').classList.contains('hidden'));

  /* ---- 生日前後 3 天：語氣不一樣 ---- */
  clearKeys();
  setBday(plus(2));
  t.ok('生日前 2 天也會跳', win.maybeShowBirthdayCheer() === true);
  t.ok('文案改成「生日快到了」', /生日快到了/.test($('#bdayCheerTitle').textContent), $('#bdayCheerTitle').textContent);
  t.ok('寫出還有幾天', /再 2 天/.test($('#bdayCheerSub').textContent), $('#bdayCheerSub').textContent);
  closeAndClear();
  setBday(plus(-3));
  t.ok('生日過後 3 天內也還會跳', win.maybeShowBirthdayCheer() === true);
  t.ok('過後的文案講「這幾天還能用」', /生日這幾天/.test($('#bdayCheerSub').textContent), $('#bdayCheerSub').textContent);

  /* ---- 超過一週就不跳 ---- */
  closeAndClear();
  setBday(plus(10));
  t.ok('離生日還久不跳', win.maybeShowBirthdayCheer() === false);

  /* ---- 跨年：12/31 生日、1/1 開網站，算得出來只差一天 ---- */
  closeAndClear();
  win.eval('TODAY.setMonth(0); TODAY.setDate(1);');
  $('#bmonth').value = '12'; $('#bday').value = '31';
  const st = win.bdayCheerState();
  t.eq('跨年的生日也算得出來（差 1 天、算當週）', [st && st.kind, st && st.days], ['week', -1]);
  win.eval(`TODAY.setMonth(${today.getMonth()}); TODAY.setDate(${today.getDate()});`);

  /* ================= 月底到期提醒 ================= */
  // 把「今天」調到這個月倒數第 3 天
  const mEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  win.eval(`TODAY.setDate(${mEnd - 3});`);
  const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  win.eval(`OFFERS = [
    {id:'m1', brand:'當月店', timing:'當月', validUntil:null, regions:[]},
    {id:'m2', brand:'有到期日的店', timing:'當日', validUntil:'${ym}-${String(mEnd).padStart(2, '0')}', regions:[]},
    {id:'m3', brand:'明年才到期的店', timing:'當月', validUntil:'${today.getFullYear() + 1}-06-30', regions:[]},
    {id:'m4', brand:'沒收藏的店', timing:'當月', validUntil:null, regions:[]}];
    WISH = new Set(['m1','m2','m3']);`);
  // 生日月＝這個月（當月型優惠過了月底就沒了），但生日那天已經過了，不會跟生日提醒混在一起
  $('#bmonth').value = String(today.getMonth() + 1); $('#bday').value = '1';
  win.renderReminders();
  const rem = () => $('#remindersBody').textContent;
  t.ok('月底前會提醒剩幾天、有幾個要過期', /只剩 3 天/.test(rem()) && /有 2 個優惠這個月底就結束/.test(rem()), rem());
  t.ok('列出當月型的那家', /當月店/.test(rem()) && /當月有效，過了月底就沒了/.test(rem()));
  t.ok('列出這個月到期的那家', /有到期日的店/.test(rem()));
  t.ok('明年才到期的不算', !/明年才到期的店/.test(rem()));
  t.ok('沒收藏的不算', !/沒收藏的店/.test(rem()));

  // 生日月不是這個月的人，看不到「當月型」那一筆（那些優惠本來就不是他能用的）
  $('#bmonth').value = String(((today.getMonth() + 3) % 12) + 1); $('#bday').value = '1';
  win.renderReminders();
  t.ok('生日月不是這個月就只提醒有明確到期日的', !/當月店/.test(rem()) && /有到期日的店/.test(rem()), rem());

  // 月初不要一直催
  win.eval('TODAY.setDate(3);');
  $('#bmonth').value = String(today.getMonth() + 1);
  win.renderReminders();
  t.ok('月初不跳月底提醒', !/這個月底就結束/.test(rem()), rem());

  function closeAndClear() { win.closeBdayCheer(); clearKeys(); }
  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
