/* v196 celine 轉來的許願：
   「我省下多少的每一次」只顯示日期、店家、花多少、省多少（點店家就能給星等跟編輯）；
   成功不顯示「成功」二字、顯示花多少跟省多少；失敗只顯示「失敗」（不會省到錢）。
   一筆資料佔一行，排版整齊。
   v197 celine：「花 $2,443 省 $1,080 應該是個表格，格子本身不用寫到花，它是欄位標題」。 */
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t105 v196～v197 每一次是一張表');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];
  const yr = new Date().getFullYear();

  win.eval(`me = {id:'u-1'};
    MY_REPORTS = [
      {id:1, offer_id:7, used_on:'${yr}-11-03', result:'success', spent_twd:200, saved_twd:300, offers:{id:7, brand:'王品牛排'}},
      {id:2, offer_id:8, used_on:'${yr}-10-21', result:'failed',  spent_twd:null, saved_twd:0, offers:{id:8, brand:'失敗那家'}},
      {id:3, offer_id:9, used_on:'${yr}-09-05', result:'partial', spent_twd:150, saved_twd:50, offers:{id:9, brand:'部分成功的店'}},
      {id:4, offer_id:10, used_on:'${yr - 1}-12-31', result:'success', spent_twd:null, saved_twd:120, offers:{id:10, brand:'一個名字非常非常非常非常非常非常長的品牌'}},
    ];
    MY_REP_VIEW='each'; MY_SCORES=new Map([['7',4]]);
    renderMyReports({success:['成功','ok'],partial:['部分','partial'],failed:['失敗','fail']});`);
  await tick(win);
  const txt = (el) => el.textContent.replace(/\s+/g, ' ').trim();
  const cell = (row, cls) => txt(row.querySelector(cls) || doc.createElement('i'));

  t.ok('是一張表', !!$('#myReports table.rl-table'));
  // v197：「表格也要看到幾顆星」
  t.eq('表頭：日期、店家、花、省、評分', $$('#myReports thead th').map(txt), ['日期', '店家', '花', '省', '評分']);
  const rows = $$('#myReports tbody tr.rl-row');
  t.eq('四筆四列', rows.length, 4);
  t.ok('格子裡不寫「花」「省」，只放數字', rows.every((r) => !/花|省/.test(r.textContent)), rows.map(txt).join(' | '));

  t.eq('成功：花、省兩格只有金額', [cell(rows[0], '.rl-spent'), cell(rows[0], '.rl-saved')], ['$200', '$300']);
  t.ok('成功：不寫「成功」', !/成功/.test(txt(rows[0])), txt(rows[0]));
  t.eq('成功：日期、店家', [cell(rows[0], '.rl-date'), cell(rows[0], '.rl-brand')], ['11/3', '王品牛排']);

  const fail = rows[1].querySelector('.rl-fail');
  t.ok('失敗：花、省合成一格寫「失敗」', !!fail && fail.getAttribute('colspan') === '2' && txt(fail) === '失敗', txt(rows[1]));
  t.ok('失敗：沒有金額', !rows[1].querySelector('.rl-spent') && !rows[1].querySelector('.rl-saved'));

  t.eq('部分成功：省那格前面小字「部分」', cell(rows[2], '.rl-saved'), '部分$50');
  t.eq('部分成功：花照樣寫', cell(rows[2], '.rl-spent'), '$150');
  t.eq('沒填花多少：寫「—」', cell(rows[3], '.rl-spent'), '—');
  t.eq('去年的寫年份', cell(rows[3], '.rl-date'), `${yr - 1}/12/31`);
  t.eq('每一列都是 5 欄寬（失敗那列花／省合併一格）',
    rows.map((r) => [...r.children].reduce((a, c) => a + Number(c.getAttribute('colspan') || 1), 0)), [5, 5, 5, 5]);
  t.eq('給過星等的寫幾顆星；還沒給的寫「—」', [txt(rows[0].lastElementChild), txt(rows[2].lastElementChild)], ['★4', '—']);
  t.ok('不再有給星等／已評／編輯 › 這些字', rows.every((r) => !/給星等|已評|編輯/.test(r.textContent)));

  // 點那一列、或用鍵盤按 Enter：打開回報表單（星等在裡面）
  const opened = [];
  win.openReport = (...a) => { opened.push(a[0]); };
  win.eval('openReport=window.openReport');
  rows[0].click();
  rows[2].dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await tick(win);
  t.eq('點一下、按 Enter 都打開那一筆的回報表單', opened.map(String), ['7', '9']);
  t.ok('可以用鍵盤移到那一列', rows.every((r) => r.getAttribute('tabindex') === '0' && r.getAttribute('role') === 'button'));

  win.eval('MY_REPORTS=[]; renderMyReports();');
  t.ok('沒有回報：不畫空表', !$('#myReports table'));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
