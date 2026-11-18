/* v196 celine 轉來的許願：
   「我省下多少的每一次」只顯示日期、店家、花多少、省多少（點店家就能給星等跟編輯）；
   成功不顯示「成功」二字、顯示花多少跟省多少；失敗只顯示「失敗」（不會省到錢）。
   一筆資料佔一行，排版整齊。 */
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t105 v196 每一次一筆一行');
  const { win } = await boot();
  const doc = win.document;
  const $$ = (s) => [...doc.querySelectorAll(s)];
  const yr = new Date().getFullYear();

  win.eval(`me = {id:'u-1'};
    MY_REPORTS = [
      {id:1, offer_id:7, used_on:'${yr}-11-03', result:'success', spent_twd:200, saved_twd:300, offers:{id:7, brand:'王品牛排'}},
      {id:2, offer_id:8, used_on:'${yr}-10-21', result:'failed',  spent_twd:null, saved_twd:0, offers:{id:8, brand:'失敗那家'}},
      {id:3, offer_id:9, used_on:'${yr}-09-05', result:'partial', spent_twd:150, saved_twd:50, offers:{id:9, brand:'部分成功的店'}},
      {id:4, offer_id:10, used_on:'${yr - 1}-12-31', result:'success', spent_twd:null, saved_twd:120, offers:{id:10, brand:'一個名字非常非常非常非常非常非常長的品牌'}},
    ];
    MY_REP_VIEW='each';
    renderMyReports({success:['成功','ok'],partial:['部分','partial'],failed:['失敗','fail']});`);
  await tick(win);
  const rows = $$('#myReports .rep');
  const txt = (el) => el.textContent.replace(/\s+/g, ' ').trim();

  t.eq('四筆四列', rows.length, 4);
  t.ok('成功：不寫「成功」', !/成功/.test(txt(rows[0])), txt(rows[0]));
  t.ok('成功：寫花多少、省多少', /花 \$200/.test(txt(rows[0])) && /省 \$300/.test(txt(rows[0])), txt(rows[0]));
  t.ok('成功：日期、店家都在', /11\/3/.test(txt(rows[0])) && /王品牛排/.test(txt(rows[0])), txt(rows[0]));
  t.ok('失敗：只寫「失敗」，不寫花／省', /失敗/.test(txt(rows[1])) && !/花 /.test(txt(rows[1])) && !/省 /.test(txt(rows[1])), txt(rows[1]));
  t.ok('部分成功：還是寫花／省（有省到），前面小字標「部分」', /部分/.test(txt(rows[2])) && /花 \$150/.test(txt(rows[2])) && /省 \$50/.test(txt(rows[2])), txt(rows[2]));
  t.ok('沒填花多少：寫「—」', /花 —/.test(txt(rows[3])), txt(rows[3]));
  t.ok('今年的日期不寫年份；去年的寫', /^11\/3/.test(txt(rows[0])) && new RegExp(`^${yr - 1}/12/31`).test(txt(rows[3])), `${txt(rows[0])} | ${txt(rows[3])}`);
  t.eq('一列只有日期、店家、金額三格', rows.map((r) => r.children.length), [3, 3, 3, 3]);
  t.ok('不再有給星等／已評／編輯 › 這些字', rows.every((r) => !/給星等|已評|編輯/.test(r.textContent)));
  t.ok('一筆一行：不換行、店名太長就省略',
    rows.every((r) => r.classList.contains('rep-line')) && rows.every((r) => !!r.querySelector('.rl-brand')));

  // 點那一列、或用鍵盤按 Enter：打開回報表單（星等在裡面）
  let opened = [];
  win.openReport = (...a) => { opened.push(a[0]); };
  win.eval('openReport=window.openReport');
  rows[0].click();
  rows[2].dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await tick(win);
  t.eq('點一下、按 Enter 都打開那一筆的回報表單', opened.map(String), ['7', '9']);
  t.ok('可以用鍵盤移到那一列', rows.every((r) => r.getAttribute('tabindex') === '0' && r.getAttribute('role') === 'button'));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
