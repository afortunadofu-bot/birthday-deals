/* 審核分頁一進去本來要打十幾支查詢（v123 之前是「一登入就打」，v123 改成
   「切到分頁才打」，但還是十幾支）。其中六支是**預設收起來**的那幾塊：
   已核可、已退回、使用回報、管理員設定、顯示開關、合併重複——收著的時候
   查回來也沒人看得到。

   改成那幾塊被打開才去載。沒有新的 SQL、沒有新的權限面，只是「晚一點查」。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

(async () => {
  const t = makeAsserts('t53 審核：收起來的那幾塊，打開才載');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  const hits = [];
  win.__hits = hits;
  win.eval(['loadPending', 'loadPendingEdits', 'loadRejected', 'loadApproved', 'loadAdminSettings',
    'renderSiteFlagsPanel', 'loadCoffeeStats', 'loadLinkStats', 'loadAdminDashboard',
    'loadFeedbackList', 'loadUsageReportsAdmin', 'loadSurveyAdmin', 'renderMergePanel',
    'loadAdminCommentList', 'loadReviewInsights']
    .map((n) => `${n}=()=>{ window.__hits.push('${n}'); };`).join(''));

  // 先把所有管理員區塊收起來，模擬「預設收起來」的狀態
  win.eval(`LIVE=true; myProfile={is_admin:true}; me={id:'u-1'};
    PANEL_FILLED.clear(); TAB_LOADED.clear();
    Object.keys(PANEL_LOADER).forEach(id=>document.getElementById(id)?.classList.add('collapsed'));`);
  win.eval(`ensureTabData('admin')`);
  await tick(win, 2);

  // 進審核是為了「處理東西」，所以只剩這五支；「看數據」的那幾塊要點開才載
  t.eq('一進審核只載要處理的那幾塊', hits.slice().sort(),
    ['loadAdminCommentList', 'loadFeedbackList', 'loadPending',
      'loadPendingEdits', 'loadReviewInsights'].sort());
  ['loadApproved', 'loadRejected', 'loadUsageReportsAdmin', 'loadAdminSettings',
    'renderSiteFlagsPanel', 'renderMergePanel',
    'loadAdminDashboard', 'loadCoffeeStats', 'loadLinkStats', 'loadSurveyAdmin'].forEach((f) =>
    t.ok(`收著的 ${f} 不載`, !hits.includes(f)));

  // 儀表板一塊就五支 RPC，是最貴的一塊
  hits.length = 0;
  win.eval(`fillPanel('pnlDash')`);
  t.eq('儀表板也是打開才載', hits, ['loadAdminDashboard']);
  /* 原本是比對原始碼裡那三個名字排在一起，所以只要在中間插一個新的區塊就紅
     （v151 加「功能被用了幾次」就撞到）。改成直接問那份清單本身——驗的是
     「在不在裡面」，不是「排第幾個」。 */
  const closed = win.eval('JSON.stringify([...PANEL_DEFAULT_CLOSED])');
  ['pnlDash', 'pnlCoffeeStats', 'pnlSurvey'].forEach((id) =>
    t.ok(`${id} 預設是收起來的`, JSON.parse(closed).includes(id), closed));

  // 打開「已核可」才載，而且只載一次
  hits.length = 0;
  win.eval(`fillPanel('pnlApproved')`);
  t.eq('打開才載', hits, ['loadApproved']);
  hits.length = 0;
  win.eval(`fillPanel('pnlApproved')`);
  t.eq('收起來再打開不會重查', hits.length, 0);

  // 咖啡那一塊是兩支，一起載
  hits.length = 0;
  win.eval(`fillPanel('pnlCoffeeStats')`);
  t.eq('咖啡那塊的兩支一起', hits.slice().sort(), ['loadCoffeeStats', 'loadLinkStats']);

  // 不是管理員就什麼都不載，而且不要把它記成「載過了」
  win.eval(`PANEL_FILLED.clear(); myProfile={is_admin:false};`);
  hits.length = 0;
  win.eval(`fillPanel('pnlRejected')`);
  t.eq('不是管理員不載', hits.length, 0);
  t.ok('也不會被記成載過（之後升成管理員還是載得到）', !win.eval(`PANEL_FILLED.has('pnlRejected')`));

  // 使用者自己把預設收起來的打開過：切到分頁時要補載
  win.eval(`myProfile={is_admin:true}; PANEL_FILLED.clear(); TAB_LOADED.clear();
    document.getElementById('pnlRejected')?.classList.remove('collapsed');`);
  hits.length = 0;
  win.eval(`ensureTabData('admin')`);
  await tick(win, 2);
  t.ok('開著的那一塊照樣會載', hits.includes('loadRejected'), hits.join(','));

  t.ok('收合那一支本身會去補資料', /if\(o\) fillPanel\(id\);/.test(index));
  t.ok('有寫清楚為什麼（請求數）', /Log Ingestion 是按請求數算的/.test(index));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
