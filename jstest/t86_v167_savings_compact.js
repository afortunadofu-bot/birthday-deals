/* v167：celine「我省下多少的金額方塊太多了，然後這個區塊要預設更上面，在使用回報上面」 */
const { boot, makeAsserts, stubHeavy } = require('./harness');

(async () => {
  const t = makeAsserts('t86 v167：我省下多少收成一個數字、排到我送出過的前面');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  stubHeavy(win, ['renderBadges', 'renderMyWishlist', 'renderMyReports', 'renderSavingsSinceVisit', 'maybeShowRateNudge',
    'maybeShowOneLine', 'renderMySpent', 'loadMyFeedback']);

  /* ---- 位置 ---- */
  const blocks = win.eval("blkList('mine').map(el=>el.id)");
  const at = (id) => blocks.indexOf(id);
  t.ok('「我省下多少」緊接在「我送出過的」前面（使用回報本來住在那裡）',
    at('mySavingsPanel') === at('myRecordsPanel') - 1, blocks.join(','));
  t.ok('在待辦清單、註冊死線後面', at('mySavingsPanel') > at('planner'));

  const KEY = 'sxr_order_mine', FLAG = 'sxr_order_moved_v167';
  const migrate = (saved) => {
    win.localStorage.removeItem(FLAG);
    win.localStorage.setItem(KEY, JSON.stringify(saved));
    win.eval('moveBlocksV167Once()');
    return JSON.parse(win.localStorage.getItem(KEY));
  };
  t.eq('自己排過順序的人：也搬到我送出過的前面',
    migrate(['wishlistPanel', 'planner', 'myRecordsPanel', 'profilePanel', 'mySavingsPanel', 'aboutSitePanel']),
    ['wishlistPanel', 'planner', 'mySavingsPanel', 'myRecordsPanel', 'profilePanel', 'aboutSitePanel']);
  win.localStorage.setItem(KEY, JSON.stringify(['aboutSitePanel', 'mySavingsPanel']));
  win.eval('moveBlocksV167Once()');
  t.eq('只搬一次：之後自己搬的不會被拉回來', JSON.parse(win.localStorage.getItem(KEY)), ['aboutSitePanel', 'mySavingsPanel']);
  t.eq('存檔裡沒有我送出過的：放在註冊死線後面',
    migrate(['planner', 'profilePanel', 'mySavingsPanel']), ['planner', 'mySavingsPanel', 'profilePanel']);
  win.localStorage.removeItem(KEY);

  /* ---- 一個大數字＋一行字 ---- */
  const show = async (sv) => {
    win.__sv = sv;
    win.eval('LIVE=true; me={id:"u-1"}; myProfile={id:"u-1",display_name:"測"};');
    win.eval('sb={from:()=>{const o={select:()=>o,eq:()=>o,order:()=>Promise.resolve({data:[],error:null}),maybeSingle:()=>Promise.resolve({data:null})};return o;},rpc:()=>Promise.resolve({data:null,error:null})};');
    await win.eval('loadMyStuff({savings:window.__sv, reports:[]})');
    return $('#mySavings');
  };
  let box = await show({ saved_total: 1733, saved_this_year: 1733, success_count: 12, brands_used: 12 });
  t.eq('只剩一個方塊', box.children.length, 1);
  t.ok('大數字是累積省下', /\$1,733/.test(box.querySelector('.hero .v').textContent));
  const sub = box.querySelector('.hero-sub').textContent;
  t.ok('其他三個變成一行字', /成功 12 次/.test(sub) && /12 個品牌/.test(sub), sub);
  t.ok('今年跟累積一樣：不重複寫', !/今年/.test(sub), sub);
  box = await show({ saved_total: 3000, saved_this_year: 1200, success_count: 20, brands_used: 15 });
  t.ok('今年跟累積不一樣：寫出今年', /今年 \$1,200/.test(box.querySelector('.hero-sub').textContent));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
