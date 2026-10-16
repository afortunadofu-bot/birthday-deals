/* 繼續砍 Supabase 的請求數（Log Ingestion 超額）。

   登入一次本來會連打九支查詢，其中六支是「我的」跟「審核」分頁裡的東西——
   而那兩頁常常整場都不會被點開。管理員更誇張：十幾支，每次重新整理都來一輪。

   改成切到分頁才載（排行榜本來就是這樣）。留在開場的只有「不在那個分頁也會
   用到的」：收藏、用過了、我的評分、通知數字、補送沒送成功的回報，以及
   管理員那顆「有幾筆待審」的紅點。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, makeSb } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

(async () => {
  const t = makeAsserts('t51 切到分頁才載');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  /* ========== 開場只載輕的那幾支 ========== */
  const boot_ = index.split('\n').find((l) => l.includes('if(me){ loadWishlist()'));
  t.ok('找得到開場那一行', !!boot_);
  t.ok('開場留著：收藏、用過了、我的評分、補送回報、通知數字',
    ['loadWishlist', 'loadMyUsedOffers', 'loadMyRatings', 'flushPendingReport', 'loadNotifCount']
      .every((f) => boot_.includes(f)), boot_);
  t.ok('開場不再載「我的」那一包', !/loadMyStuff\(\)/.test(boot_), boot_);
  t.ok('開場不再載投稿狀態那兩支',
    !/loadPendingPreview|loadPendingEditsPreview/.test(boot_), boot_);
  t.ok('管理員開場只剩徽章那一支',
    /if\(myProfile\?\.is_admin\) loadPendingBadge\(\);/.test(index));
  t.ok('徽章用 head\+count，不把整批待審拉下來',
    /loadPendingBadge[\s\S]{0,400}count:'exact', head:true/.test(index));

  /* ========== 切過去才載，而且只載一次 ========== */
  const hits = [];
  win.__hits = hits;
  const stub = (names) => win.eval(names.map((n) =>
    `${n}=(...a)=>{ window.__hits.push('${n}'); };`).join(''));
  stub(['loadMyStuff', 'loadPendingPreview', 'loadPendingEditsPreview',
    'loadPending', 'loadPendingEdits', 'loadRejected', 'loadApproved', 'loadAdminSettings',
    'renderSiteFlagsPanel', 'loadCoffeeStats', 'loadLinkStats', 'loadAdminDashboard',
    'loadFeedbackList', 'loadUsageReportsAdmin', 'loadSurveyAdmin', 'renderMergePanel',
    'loadAdminCommentList', 'loadReviewInsights', 'loadBoard']);

  win.eval(`LIVE=true; me=null; myProfile=null; TAB_LOADED.clear();`);
  win.eval(`ensureTabData('mine')`);
  t.eq('沒登入就什麼都不用載', hits.length, 0);

  win.eval(`me={id:'u-1'};`);
  win.eval(`ensureTabData('mine')`);
  t.eq('切到「我的」才載那三支', hits.slice().sort(),
    ['loadMyStuff', 'loadPendingEditsPreview', 'loadPendingPreview'].sort());
  hits.length = 0;
  win.eval(`ensureTabData('mine')`);
  t.eq('再切回去不會重載一次', hits.length, 0);

  win.eval(`ensureTabData('admin')`);
  t.eq('不是管理員就不載審核那一包', hits.length, 0);

  win.eval(`myProfile={is_admin:true};`);
  win.eval(`ensureTabData('admin')`);
  // v125 之後又細分了一層：收起來的那幾塊要打開才載（t53 專門驗那個）。
  // 這裡只驗「切過去才載」跟「待審佇列一定在」。
  t.ok('切到「審核」才載', hits.length > 0);
  t.ok('待審佇列那兩支一定在（那是進去就看得到的）',
    ['loadPending', 'loadPendingEdits'].every((f) => hits.includes(f)), hits.join(','));
  hits.length = 0;
  win.eval(`ensureTabData('admin')`);
  t.eq('再切回去也不重載', hits.length, 0);

  hits.length = 0;
  win.eval(`ensureTabData('board'); ensureTabData('board');`);
  t.eq('排行榜照舊每次都問（它自己有 10 分鐘快取）', hits.filter((h) => h === 'loadBoard').length, 2);

  /* ========== 徽章：只回一個數字 ========== */
  const sb = makeSb({ tables: { offers: [{ id: 1 }, { id: 2 }] } });
  win.__sb = sb;
  win.eval(`sb=window.__sb; myProfile={is_admin:true}; loadPendingBadge();`);
  await tick(win, 3);
  const sel = sb.__calls.select.find((c) => c.table === 'offers');
  t.ok('用 head+count', sel && sel.opts && sel.opts.head === true && sel.opts.count === 'exact',
    JSON.stringify(sel));
  t.eq('數字寫到分頁徽章上', $('#pendCount').textContent, '2');
  t.ok('有數字就顯示出來', !$('#pendCount').classList.contains('hidden'));

  /* ========== 我的評分還是開場就載（排行榜要用）========== */
  const sb2 = makeSb({ tables: { offer_ratings: [{ offer_id: 7, score: 4 }] } });
  win.__sb2 = sb2;
  win.eval(`sb=window.__sb2; me={id:'u-1'}; renderRatedCta=()=>{}; maybeShowRateNudge=()=>{};
    loadMyRatings();`);
  await tick(win, 3);
  t.eq('評分讀得回來', win.eval('MY_SCORES.get("7")'), 4);
  t.ok('而且是獨立一支，不用把「我的」整包拉下來',
    /async function loadMyRatings\(\)/.test(index));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
