/* 問卷逐筆回覆看得出是誰、可以收合、圖表不要生出「其他」；管理員可以刪除優惠（嵐）

   1.「多久來一次的『其他』是什麼？問卷沒有其他的選項」：堆疊條原本超過 6 塊就把小的
      併成「其他」，問卷的選項是固定清單，不能併——每一個選項都要自己列出來。
   2.「我都不知道什麼是誰填的、跟這個人分別填了什麼」：逐筆回覆那一行原本被
      .sub-item b 的固定欄寬切成「2026-09-2…」，名字跟信箱都看不到；
      每一份可以點開／收起，也可以「只看這個人的回覆」。
   3.「回饋問卷也要可以收合」：整塊逐筆回覆收得起來，狀態記在瀏覽器裡。
   4.「管理員要可以刪除優惠」：先試算（p_confirm:false）把會一起刪掉的東西寫進確認視窗，
      有別人的使用回報時再確認一次，才真的刪。 */
const { boot, tick, makeSb, makeAsserts, stubHeavy } = require('./harness');

(async () => {
  const t = makeAsserts('t20 問卷逐筆＋刪除優惠');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];

  // 多久來一次：6 個現行選項全部有人選，再加 3 個題目改版前的舊答案 → 一共 9 塊
  const freq = ['first', 'bday_daily', 'bday_weekly', 'bday_once', 'off_often', 'off_sometimes',
    'birthday_month', 'weekly', 'daily'];
  const raw = freq.map((f, i) => ({
    id: i + 1, created_at: `2026-09-${20 - i}T03:00:00Z`,
    user_id: i < 2 ? 'u-1' : (i === 2 ? 'u-2' : null),
    session_id: i < 3 ? '' : (i < 6 ? 'dev-a' : 'dev-b'),
    profiles: i < 2 ? { display_name: '嵐' } : (i === 2 ? { display_name: 'DORIS' } : null),
    overall: 5, nps: 10, liked_features: ['browse'], used_features: ['browse'], source: 'threads',
    comment: i === 0 ? '很好用' : '', extra: { visit_freq: f },
  }));
  const sb = makeSb({
    tables: { survey_responses: raw },
    rpcs: {
      admin_survey_summary: () => ({ data: win.surveyAggregate(raw), error: null }),
      admin_user_emails: (p) => ({ data: p.p_ids.map((id) => ({ id, email: id + '@example.com' })), error: null }),
    },
  });
  win.__sb = sb;
  win.eval('sb = window.__sb; LIVE = true; me = {id:"admin"}; myProfile = {id:"admin", is_admin:true};');
  await win.loadSurveyAdmin();
  await tick(win, 5);

  /* ============ 1. 圖表不要生出問卷沒有的「其他」 ============ */
  const freqCard = $$('#svBody .viz').find((c) => /多久會來一次/.test(c.querySelector('b')?.textContent || ''));
  t.ok('有「多久會來一次」這張圖', !!freqCard);
  const legend = [...freqCard.querySelectorAll('.vleg > span')].map((x) => x.textContent.trim());
  t.eq('九個選項全部列出來，不併成「其他」', legend.length, 9);
  t.ok('圖例裡沒有「其他」', !legend.some((x) => x.startsWith('其他')), legend);
  t.ok('現行選項照問卷的順序', /^第一次來/.test(legend[0]) && /^不是生日月偶爾來/.test(legend[5]), legend.slice(0, 6));
  t.ok('舊版選項標成舊版', legend.slice(6).every((x) => /舊版選項/.test(x)), legend.slice(6));
  const oldColors = [...freqCard.querySelectorAll('.vstack-seg')].slice(6).map((s) => s.style.background);
  t.eq('舊版選項各有不同深淺的灰（疊在一起也分得出來）', new Set(oldColors).size, 3, oldColors);

  /* ============ 2. 逐筆回覆看得出是誰 ============ */
  const items = () => $$('#svResponses .sv-item');
  t.eq('逐筆回覆列出每一份', items().length, 9);
  const head0 = items()[0].querySelector('.sv-head');
  t.eq('看得到名字（不會被切成 2026-09-2…）', head0.querySelector('.sv-name').textContent.trim(), '嵐');
  t.ok('看得到信箱', /u-1@example\.com/.test(head0.querySelector('.sv-email').textContent));
  t.ok('看得到時間跟分數', /2026/.test(head0.querySelector('.sv-when').textContent)
    && /滿意度 5/.test(head0.querySelector('.sv-score').textContent));
  t.ok('訪客標訪客、沒有信箱', items()[3].textContent.includes('訪客') && !items()[3].querySelector('.sv-email'));

  /* ---- 每一份預設收起來，點了才攤開 ---- */
  t.ok('預設只顯示一行', items()[0].querySelector('.sv-detail').classList.contains('hidden'));
  head0.click();
  t.ok('點一下攤開答案', !items()[0].querySelector('.sv-detail').classList.contains('hidden'));
  t.ok('攤開後看得到每一題的答案', /生日月幾乎每天|第一次來/.test(items()[0].querySelector('.sv-ans-list').textContent));
  items()[0].querySelector('.sv-head').click();
  t.ok('再點一下收起來', items()[0].querySelector('.sv-detail').classList.contains('hidden'));

  $('#btnSvExpandAll').click();
  t.ok('「全部展開」把這一頁都打開', items().every((x) => !x.querySelector('.sv-detail').classList.contains('hidden')));
  t.eq('按鈕變成「全部收合」', $('#btnSvExpandAll').textContent, '全部收合');
  $('#btnSvExpandAll').click();
  t.ok('再按一次全部收起來', items().every((x) => x.querySelector('.sv-detail').classList.contains('hidden')));

  /* ---- 整塊收合 ---- */
  $('#btnSvFold').click();
  t.ok('整塊逐筆回覆收得起來', $('#svRespWrap').classList.contains('hidden'));
  t.eq('收合狀態記在瀏覽器裡', win.localStorage.getItem('sxr_sv_list_open'), '0');
  t.eq('收合後按鈕變「展開」', $('#btnSvFold').textContent, '展開');
  $('#btnSvFold').click();
  t.ok('再按一次展開', !$('#svRespWrap').classList.contains('hidden'));

  /* ============ 3. 只看某一個人填了什麼 ============ */
  const qOpts = [...$('#svFilterQ').options].map((o) => o.textContent);
  t.eq('篩選選單第一項就是「填表人」', qOpts[1], '填表人');
  $('#svFilterQ').value = 'person';
  $('#svFilterQ').dispatchEvent(new win.Event('change'));
  const aOpts = [...$('#svFilterA').options].map((o) => o.textContent);
  t.ok('會員排前面、標出各填了幾份', /^嵐（2）/.test(aOpts[0]) && /^DORIS（1）/.test(aOpts[1]), aOpts);
  t.ok('訪客照裝置編號', aOpts.some((x) => /^訪客 1（3）/.test(x)) && aOpts.some((x) => /^訪客 2（3）/.test(x)), aOpts);

  $('#svFilterQ').value = ''; $('#svFilterQ').dispatchEvent(new win.Event('change'));
  await tick(win, 5);
  items()[0].querySelector('.sv-only').click();
  await tick(win, 5);
  t.eq('「只看這個人的回覆」只留他填的', items().length, 2);
  t.eq('篩選條件也跟著設成這個人', [$('#svFilterQ').value, $('#svFilterA').value], ['person', 'u:u-1']);
  t.ok('標題寫出是誰', /填表人：嵐/.test($('#svResponses b').textContent), $('#svResponses b').textContent);
  t.eq('圖表也只算這個人（2 份）', $('#svCount').textContent, '2');

  /* ============ 4. 管理員刪除優惠 ============ */
  stubHeavy(win, ['loadOffers', 'render']);
  const offers = [{ id: 7, brand: '重複的店', status: 'approved', created_at: '2026-09-01T00:00:00Z',
    reviewed_at: '2026-09-02T00:00:00Z', submitted_by: null }];
  const del = [];
  const sb2 = makeSb({
    tables: { offers, profiles_public: [] },
    rpcs: {
      admin_delete_offer: (p) => {
        del.push(p);
        return { data: { deleted: !!p.p_confirm, id: p.p_offer_id, brand: '重複的店',
          reports: 3, comments: 1, ratings: 0, wishlist: 2, edits: 0, stores: 0 }, error: null };
      },
    },
  });
  win.__sb = sb2; win.eval('sb = window.__sb;');
  await win.loadApproved();
  await tick(win, 5);
  const delBtn = () => $('#approvedList .ap-delete');
  t.ok('已通過清單每一列都有「刪除」', !!delBtn());
  // celine：「管理員頁面看不到店家編號」——要合併／刪除／互相講哪一筆時都得報編號
  t.eq('已通過清單看得到優惠編號', $('#approvedList .oid')?.textContent, '#7');
  await win.loadPending();
  await tick(win, 5);
  t.eq('待審佇列也看得到優惠編號', $('#pendingList .oid')?.textContent, '#7');

  // 第一次問：會一起刪掉什麼
  const asked = [];
  win.confirm = (m) => { asked.push(m); return true; };
  delBtn().click();
  await tick(win, 6);
  t.eq('先試算再真的刪', del.map((p) => p.p_confirm), [false, true]);
  t.ok('確認視窗寫出會一起刪掉什麼', /3 筆使用回報/.test(asked[0]) && /1 則留言/.test(asked[0]) && /2 個收藏/.test(asked[0]), asked[0]);
  t.ok('確認視窗提醒可以改用「下架」', /下架/.test(asked[0]));
  t.ok('有別人的回報時再確認一次', asked.length === 2 && /排行榜/.test(asked[1]), asked);
  const toast = () => $$('.toast').map((x) => x.textContent).join('｜');
  t.ok('刪完給提示', /已刪除「重複的店」/.test(toast()), toast());

  // 第二次確認按「取消」就不刪
  del.length = 0;
  let n = 0;
  win.confirm = () => { n += 1; return n === 1; };
  delBtn().click();
  await tick(win, 6);
  t.eq('第二次確認取消就不會刪', del.map((p) => p.p_confirm), [false]);

  // v72 還沒跑
  del.length = 0;
  win.confirm = () => true;
  win.__alerts.length = 0;
  const sb3 = makeSb({ tables: { offers, profiles_public: [] },
    rpcs: { admin_delete_offer: { data: null, error: { message: 'function public.admin_delete_offer(bigint, boolean) does not exist' } } } });
  win.__sb = sb3; win.eval('sb = window.__sb;');
  await win.loadApproved();
  await tick(win, 5);
  delBtn().click();
  await tick(win, 6);
  t.ok('v72 沒跑時講要跑哪一支 SQL', /schema_v72_admin_delete_offer\.sql/.test(win.__alerts[0] || ''), win.__alerts);

  /* ---- 優惠詳情裡也有（已通過清單只列最新 200 筆，舊的從詳情頁刪）---- */
  t.ok('詳情頁有「刪除（管理員）」', !!$('#dtlAdminDelete'));
  t.ok('沒開詳情時不顯示', $('#dtlAdminDelete').classList.contains('hidden'));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
