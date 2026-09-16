/* 9/3～9/13 使用者回報那一批（非地圖類）：

   - DORIS①：同一家店（環球購物有兩張卡片）兩筆都回報，省下的錢重複計算；而且回報
     送出後找不到地方改。→ 今年回報過同一筆／同品牌另一張卡片時先問要不要改成編輯；
     詳情頁自己的回報旁邊直接給「編輯」。
   - DORIS②：待辦清單點「詳情」要跟優惠頁點開一樣，看得到別人的回報跟留言。
   - Cindy①：不知道收藏的東西存到哪裡去了。→ 第一次收藏提示一次，附跳過去的按鈕。

   品牌比對那段特別驗「王品」跟「王品牛排」不能被當成同一家——包含關係比對很容易
   寫得太鬆，結果回報王品牛排卻跳出「你已經回報過王品」。 */
const { boot, tick, makeSb, makeAsserts } = require('./harness');

const offer = (id, brand, extra = {}) => ({
  id, brand, category: '零售美妝', regions: ['台北市'], offer: `${brand} 生日禮`,
  membership: '', membershipType: 'app', membershipCost: 'free', freeTier: 'free_min',
  advanceDays: 3, advanceNote: '', timing: '當月', valueTwd: 100, conditions: '',
  validity: '', validityType: 'rolling', sources: [], bestSource: null, status: 'approved',
  reportCount: 0, commentCount: 0, ratingAvg: null, ratingCount: 0, wishCount: 0,
  transferable: 'unknown', ...extra,
});

(async () => {
  const t = makeAsserts('t05 回報／待辦清單／收藏提示');
  const { win } = await boot();
  const doc = win.document;
  const year = new Date().getFullYear();

  win.__offers = [
    offer(7, '環球購物中心'),
    offer(8, 'Global Mall 環球購物中心'),
    offer(9, '王品'),
    offer(10, '王品牛排'),
  ];
  win.eval('LIVE = true; me = {id:"u-1"}; myProfile = {id:"u-1", is_admin:false, display_name:"DORIS"};'
    + ' OFFERS = window.__offers;');

  /* ================= A. 同品牌比對 ================= */
  t.eq('環球兩張卡片算同一家', win.sameBrandOfferIds(8).sort(), [7, 8]);
  t.eq('王品不會把王品牛排算進來', win.sameBrandOfferIds(9), [9]);
  t.eq('王品牛排也不會把王品算進來', win.sameBrandOfferIds(10), [10]);

  /* ================= B. 重複回報提醒 ================= */
  let lastOps = null;
  const prevRow = { id: 55, used_on: `${year}-09-01`, result: 'success', saved_twd: 100,
    store: '板橋店', note: '', created_at: `${year}-09-01T04:00:00Z`, offer_id: 7 };
  const sbDup = makeSb({ tables: { usage_reports: (st) => { lastOps = st.ops; return [prevRow]; } } });
  win.__sb = sbDup; win.eval('sb = window.__sb;');

  win.__confirms.length = 0; win.__confirmAnswer = true;
  await win.openReport(8);
  await tick(win, 2);
  const inOp = (lastOps || []).find((o) => o[0] === 'in');
  const gteOp = (lastOps || []).find((o) => o[0] === 'gte');
  t.ok('查的是同品牌所有卡片的回報', inOp && [...inOp[2]].sort().join() === '7,8', inOp);
  t.eq('只看今年的回報', gteOp && gteOp[2], `${year}-01-01`);
  t.eq('有跳一次確認', win.__confirms.length, 1);
  t.ok('確認文字講清楚是另一張卡片、會重複計算',
    /另一張優惠卡片/.test(win.__confirms[0]) && /重複計算/.test(win.__confirms[0]), win.__confirms[0]);
  t.ok('確認文字的換行是真的換行字元（不是字面上的 \\n）', /\n\n/.test(win.__confirms[0]));
  t.eq('按確定 → 改成編輯原本那一筆', doc.querySelector('#repTitle').textContent, '編輯使用回報');
  t.eq('帶入原本那筆的日期', doc.querySelector('#repDate').value, `${year}-09-01`);
  t.ok('編輯模式有刪除鈕', !doc.querySelector('#btnDeleteReport').classList.contains('hidden'));

  win.__confirms.length = 0; win.__confirmAnswer = false;
  await win.openReport(8);
  await tick(win, 2);
  t.eq('按取消 → 照樣新增一筆', doc.querySelector('#repTitle').textContent, '回報使用狀況');
  t.ok('新增模式沒有刪除鈕', doc.querySelector('#btnDeleteReport').classList.contains('hidden'));

  const sbNone = makeSb({ tables: { usage_reports: [] } });
  win.__sb = sbNone; win.eval('sb = window.__sb;');
  win.__confirms.length = 0; win.__confirmAnswer = true;
  await win.openReport(10);
  await tick(win, 2);
  t.eq('今年沒回報過就不問', win.__confirms.length, 0);
  t.eq('直接是新增模式', doc.querySelector('#repTitle').textContent, '回報使用狀況');

  /* ================= C. 詳情頁自己的回報可以編輯 ================= */
  const sbDetail = makeSb({
    tables: {
      comments: [],
      usage_reports: [
        { id: 61, used_on: `${year}-09-02`, result: 'success', store: '', note: '我的', saved_twd: 80, user_id: 'u-1', created_at: `${year}-09-02T01:00:00Z` },
        { id: 62, used_on: `${year}-09-03`, result: 'failed', store: '', note: '別人的', saved_twd: null, user_id: 'u-2', created_at: `${year}-09-03T01:00:00Z` },
      ],
      offer_ratings: [], offer_edit_history: [], offer_edits_pending_preview: [],
      profiles_public: [{ id: 'u-1', display_name: 'DORIS' }, { id: 'u-2', display_name: '路人' }],
    },
  });
  win.__sb = sbDetail; win.eval('sb = window.__sb;');
  await win.openDetail(7);
  await tick(win, 4);
  const editBtns = [...doc.querySelectorAll('#dtlBody .dtl-rep-edit')];
  t.eq('只有自己的那筆回報有編輯鈕', editBtns.map((b) => b.dataset.rid), ['61']);
  editBtns[0].click();
  await tick(win, 2);
  t.eq('點編輯開的是編輯模式', doc.querySelector('#repTitle').textContent, '編輯使用回報');
  t.eq('帶入的是自己那筆', doc.querySelector('#repDate').value, `${year}-09-02`);
  t.ok('建立時間有帶到（詳情頁的查詢有補 created_at）',
    !doc.querySelector('#repMeta').classList.contains('hidden') && !/undefined|Invalid/.test(doc.querySelector('#repMeta').textContent),
    doc.querySelector('#repMeta').textContent);

  /* ================= D. 待辦清單「詳情」開完整詳情視窗 ================= */
  win.eval(`WL_ROWS = [{offer_id: 7, year: ${year}, done: false, note: '', sort_order: 1,
    created_at: '${year}-09-01T00:00:00Z',
    offers: {id: 7, brand: '環球購物中心', offer: '環球購物中心 生日禮', advance_days: 3, regions: ['台北市']}}];`);
  win.renderWishlistBody();
  await tick(win, 1);
  t.eq('內嵌的精簡詳情區塊已經拿掉', doc.querySelectorAll('#myWishlist .sub-list').length, 0);
  const calls = [];
  const realOpenDetail = win.openDetail;
  win.openDetail = (id, fallback) => { calls.push({ id, fallback }); };
  doc.querySelector('#myWishlist .wl-toggle').click();
  await tick(win, 1);
  win.openDetail = realOpenDetail;
  t.eq('點詳情呼叫 openDetail 開同一個視窗', calls.length && calls[0].id, '7');
  t.eq('有帶備援資料（已下架時也看得到內容）', calls.length && calls[0].fallback && calls[0].fallback.brand, '環球購物中心');
  // 嵐：地圖找附近店家「不見了」——待辦清單本來沒有這顆，只有優惠卡片跟詳情視窗有
  const wlMap = doc.querySelector('#myWishlist .wl-map');
  t.ok('待辦清單每一列也有地圖按鈕', !!wlMap && /google\.com\/maps/.test(wlMap.href), wlMap && wlMap.href);
  t.ok('地圖按鈕用品牌＋縣市去搜', decodeURIComponent(wlMap.href).includes('環球購物中心'), decodeURIComponent(wlMap.href));
  t.eq('地圖按鈕開新分頁', wlMap.target, '_blank');

  /* ================= E. 第一次收藏提示收到哪裡 ================= */
  win.localStorage.removeItem('sxr_wish_where_hinted');
  const sbWish = makeSb({ tables: { wishlist: [] } });
  win.__sb = sbWish; win.eval('sb = window.__sb; WISH = new Set();');
  doc.querySelector('#modeBanner').innerHTML = '';
  await win.toggleWish(9);
  await tick(win, 2);
  t.ok('第一次收藏跳出「在我的分頁」提示',
    /待辦清單/.test(doc.querySelector('#modeBanner').textContent) && !!doc.querySelector('#btnGoWishlist'),
    doc.querySelector('#modeBanner').textContent);
  doc.querySelector('#btnGoWishlist').click();
  await tick(win, 1);
  t.ok('按「去看看」切到我的分頁', !doc.querySelector('#tab-mine').classList.contains('hidden'));
  t.eq('提示按完就收掉', doc.querySelector('#modeBanner').innerHTML, '');

  await win.toggleWish(10);
  await tick(win, 2);
  t.eq('第二次收藏不再提示', doc.querySelector('#modeBanner').innerHTML, '');
  const before = doc.querySelector('#modeBanner').innerHTML;
  await win.toggleWish(10);   // 取消收藏
  await tick(win, 2);
  t.eq('取消收藏不會提示', doc.querySelector('#modeBanner').innerHTML, before);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
