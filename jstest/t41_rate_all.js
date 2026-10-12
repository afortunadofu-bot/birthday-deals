/* celine：「給星等的地方也要能收闔」
          「目前都是需要按很多按鈕才能分別評分，能一次評所有店家嗎」
          「多幾種好評分的方式」

   原本要給一家店星等得走五個動作：找到那筆 → 點開詳情 → 往下捲到評分 →
   點星星 → 關掉，再從頭找下一家。這支驗三件事：

   1. 「用過的人最推薦」那塊可以收合（它是後來加的，當初漏了登記；
      順便補上 #tab-board 漏掉的箭頭樣式——之前畫面上是一個裸的「▾」）
   2. 「一次給星等」：用過但還沒評的全部攤成一張清單，一家點一下就存
   3. 多幾個入口：「我的使用回報」每一列右邊也看得到／給得了星等 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, makeSb } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const css = index.replace(/\s+/g, ' ');

const REPORTS = [
  { id: 1, offer_id: 101, result: 'success', used_on: '2026-10-01', saved_twd: 120, offers: { brand: '甲店' } },
  { id: 2, offer_id: 102, result: 'success', used_on: '2026-09-20', saved_twd: 80, offers: { brand: '乙店' } },
  { id: 3, offer_id: 103, result: 'success', used_on: '2026-09-10', saved_twd: 60, offers: { brand: '丙店（評過）' } },
  { id: 4, offer_id: 104, result: 'failed', used_on: '2026-09-02', saved_twd: 0, offers: { brand: '沒用成的' } },
];

(async () => {
  const t = makeAsserts('t41 一次給星等＋可收合');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];

  /* ================= 1. 可收合 ================= */
  const panel = $('#pnlTopRated');
  t.ok('「用過的人最推薦」包進可收合的殼了', !!panel.querySelector('.panel-cbody'));
  t.ok('標題右邊有箭頭', !!panel.querySelector('h2 .pctoggle'));
  t.ok('預設展開', !panel.classList.contains('collapsed'));
  const h2 = panel.querySelector('h2');
  h2.click();
  t.ok('點標題收起來', panel.classList.contains('collapsed')
    && panel.querySelector('.panel-cbody').classList.contains('hidden'));
  t.eq('狀態記在這台裝置上', win.localStorage.getItem('sxr_admin_panel_pnlTopRated'), '0');
  h2.click();
  t.ok('再點一次打開', !panel.classList.contains('collapsed'));
  /* 排行榜那一頁的 panel 早就套了可收合，但三條選擇器當初漏掉 #tab-board，
     所以箭頭沒有圓底、標題也不是手指游標，畫面上只剩一個裸的「▾」 */
  t.ok('箭頭的樣式有涵蓋排行榜那一頁',
    /#tab-board \.panel>h2 \.pctoggle/.test(css));
  t.ok('標題是可以點的樣子', /#tab-board \.panel>h2\{cursor:pointer/.test(css));
  t.ok('收起來的內容真的藏得起來', /#tab-board \.panel \.panel-cbody\.hidden\{display:none/.test(css));
  t.ok('排行榜每一塊都有箭頭', $$('#tab-board .panel > h2 .pctoggle').length >= 7,
    String($$('#tab-board .panel > h2 .pctoggle').length));

  /* ================= 2. 一次給星等 ================= */
  const sb = makeSb({ tables: { offer_ratings: [] } });
  win.__sb = sb;
  win.eval(`
    LIVE=true; me={id:'u-1'}; sb=window.__sb;
    MY_RATED=new Set(['103']);
    MY_REPORTS=${JSON.stringify(REPORTS)};
    renderMyReports({success:['成功','ok'],partial:['部分','partial'],failed:['失敗','fail']});
    renderRatedCta();
    openRateAll('test');
  `);
  const dlg = $('#dlgRateAll');
  t.ok('清單打開了', dlg.open === true);
  const rows = () => $$('#dlgRateAll .rate-row');
  t.eq('一家一列，只列還沒評的', rows().map((r) => r.querySelector('b').textContent), ['甲店', '乙店']);
  t.eq('每一列五顆星', rows()[0].querySelectorAll('.star-btn').length, 5);
  t.ok('寫得出還剩幾家', /還有 2 家/.test($('#rateAllSub').textContent), $('#rateAllSub').textContent);
  t.ok('看得到是哪一天用的', /2026-10-01/.test(rows()[0].textContent));

  // 點一下就存，不用離開這張清單
  rows()[0].querySelectorAll('.star-btn')[3].click();
  await tick(win, 3);
  const w = sb.__calls.write.filter((x) => x.table === 'offer_ratings' && x.op === 'upsert');
  t.eq('送出一筆評分', w.length, 1);
  t.eq('送的是這家、這個分數', [w[0].args[0].offer_id, w[0].args[0].score], [101, 4]);
  t.eq('同一個人同一家只會有一列', w[0].args[1], { onConflict: 'offer_id,user_id' });
  const first = rows()[0];
  t.ok('那一列就地變成「已給 4 星」', /已給 4 星/.test(first.textContent), first.textContent.trim());
  t.ok('而且不是整張重畫（還沒評的那列沒有跳位）',
    rows()[1].querySelector('b').textContent === '乙店');
  t.ok('剩幾家跟著減', /還有 1 家/.test($('#rateAllSub').textContent), $('#rateAllSub').textContent);
  t.ok('記進「我評過的」', win.eval('MY_RATED.has("101")'));

  // 「改」可以改回去
  first.querySelector('.rate-row-undo').click();
  await tick(win, 2);
  t.eq('「改」會把星星放回來', first.querySelectorAll('.star-btn').length, 5);
  t.eq('而且記得原本給幾顆', first.querySelectorAll('.star-btn.on').length, 4);

  // 存不起來的時候要講，而且不要假裝已經存好
  const sbBad = makeSb({ tables: { offer_ratings: [] } });
  const realFrom = sbBad.from;
  sbBad.from = (tbl) => tbl === 'offer_ratings'
    ? { upsert: () => Promise.resolve({ error: { message: '權限不足' } }) }
    : realFrom(tbl);
  win.__sb2 = sbBad;
  win.eval('sb=window.__sb2;');
  const second = rows()[1];
  second.querySelectorAll('.star-btn')[4].click();
  await tick(win, 3);
  t.ok('存失敗要說出來', /存不起來/.test(second.textContent), second.textContent.trim());
  t.ok('不要假裝已經給過了', !/已給/.test(second.textContent));
  t.ok('星星放回去讓人再試一次',
    [...second.querySelectorAll('.star-btn')].every((b) => !b.disabled));
  win.eval('sb=window.__sb;');

  /* 比較重的同步（重抓優惠、重畫榜單）只在關起來的時候做一次，
     不是每評一家就重抓一次 */
  t.ok('評分當下不重抓優惠',
    !/loadOffers\(true\)[\s\S]{0,80}markRateRowDone/.test(index));
  t.ok('關起來才同步', /dlgRateAll'\)\.addEventListener\('close'[\s\S]{0,320}loadOffers\(true\)/.test(index));

  /* ================= 3. 多幾個入口 ================= */
  // 「我的使用回報」每一列
  const btns = $$('#myReports .rep-rate').map((b) => b.dataset.oid);
  t.eq('還沒評的那幾列有「給星等」', btns, ['102']);   // 101 剛剛評完了
  t.eq('評過的顯示已評，不再問一次', $$('#myReports .rep-rated').length, 2);
  t.ok('沒用成的不問（沒什麼好評）',
    !$$('#myReports .rep').some((r) => /沒用成的/.test(r.textContent) && /給星等/.test(r.textContent)));

  // 點星等不要順便把「編輯回報」打開
  let opened = null;
  win.openReport = (...a) => { opened = a; };
  $('#myReports .rep-rate').click();
  await tick(win, 2);
  t.eq('點「給星等」不會順便開編輯回報', opened, null);

  // 入口分流：只剩一家就直接開那筆詳情（順便看得到別人的評價），多家才開清單
  t.ok('一家 → 開詳情', /list\.length===1\) openDetail\(first\.id, null, true\)/.test(index));
  t.ok('多家 → 開一次評完的清單', /else openRateAll\('board'\)/.test(index));
  t.ok('小卡片也是同一套分流', /else if\(list\.length\) openRateAll\('nudge'\)/.test(index));

  /* 刻意沒做「全部一鍵給 5 星」：這份資料就是「用過的人最推薦」那塊榜的
     全部依據，一鍵全 5 星等於把榜變成一份沒有鑑別度的名單。 */
  t.ok('沒有「全部給 5 星」那種一鍵按鈕',
    !/全部給 ?5 ?星|都給五星|rateAllFive/.test(index));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
