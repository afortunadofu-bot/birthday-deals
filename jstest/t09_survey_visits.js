/* 回饋問卷＋管理員「平均每位會員造訪幾次」（v62）

   celine 的要求逐條驗：
   - 問卷入口固定在「我的」分頁、訪客也看得到（不能被包在會員專屬區塊裡）
   - 全部用點的：單選題點別的會換掉、複選題可以多選；前兩題必填
   - 喜歡的功能、最常用的功能分成兩題複選
   - 可以重複填（每次 insert 新的一列）；24 小時內重填被資料庫擋下時講人話
   - 訪客也能填（user_id 為空、帶裝置代號）
   - 小卡片：第 2 次來、第一次收藏／回報、停留 5 分鐘任一觸發；每次打開網站最多一次；
     「之後再說」7 天不再出現；填完 30 天不主動跳
   - 一次造訪＝間隔 30 分鐘
   - 管理員：NPS／平均／長條圖、CSV 不含個人代號且跳脫正確、造訪數字＋v62 未跑的提示 */
const { boot, tick, makeSb, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t09 回饋問卷＋造訪統計');
  const { win } = await boot();
  const doc = win.document;
  const ls = win.localStorage;

  /* ================= 入口位置 ================= */
  const panel = doc.querySelector('#surveyPanel');
  t.ok('「我的」分頁有問卷區塊', !!panel && !!panel.closest('#tab-mine'));
  t.ok('問卷區塊不在會員專屬區塊裡（訪客也看得到）', panel && !panel.closest('#mineAuthedPanels'));
  // celine：回饋區域要放在「推薦給朋友」附近
  t.ok('問卷區塊在「推薦給朋友」正下方',
    panel && panel.previousElementSibling && panel.previousElementSibling.id === 'shareSitePanel',
    panel && panel.previousElementSibling && panel.previousElementSibling.id);

  /* ================= 問卷視窗 ================= */
  const inserts = [];
  let insertResult = { data: null, error: null };
  const sb = makeSb({});
  const realFrom = sb.from;
  sb.from = (table) => table === 'survey_responses'
    ? { insert: (row) => { inserts.push(row); return Promise.resolve(insertResult); } }
    : realFrom(table);
  win.__sb = sb;
  win.eval('sb = window.__sb; LIVE = true; me = null; myProfile = null;');

  doc.querySelector('#btnOpenSurvey').click();
  await tick(win, 1);
  t.ok('按「填寫回饋問卷」打開問卷視窗', doc.querySelector('#dlgSurvey').open);
  const g = (q) => doc.querySelector(`#dlgSurvey .sv-group[data-q="${q}"]`);
  const pick = (q, v) => g(q).querySelector(`.sv-opt[data-v="${v}"]`).click();
  t.eq('滿意度 5 個表情可以點', g('overall').querySelectorAll('.sv-opt').length, 5);
  t.eq('推薦分數 0–10 共 11 顆', g('nps').querySelectorAll('.sv-opt').length, 11);
  t.eq('4 個面向各 5 顆', ['score_find', 'score_accuracy', 'score_mobile', 'score_look']
    .map((q) => g(q).querySelectorAll('.sv-opt').length), [5, 5, 5, 5]);
  t.ok('喜歡的功能、最常用的功能是兩題不同的複選',
    g('liked').dataset.multi === '1' && g('used').dataset.multi === '1'
    && g('liked').querySelectorAll('.sv-opt').length === g('used').querySelectorAll('.sv-opt').length
    && g('liked').querySelectorAll('.sv-opt').length >= 6);
  t.ok('只有最後一格是文字（選填）', doc.querySelectorAll('#dlgSurvey textarea').length === 1
    && doc.querySelectorAll('#dlgSurvey input[type="text"]').length === 0);

  // 必填
  doc.querySelector('#btnSvSubmit').click();
  await tick(win, 2);
  t.eq('沒點前兩題不會送出', inserts.length, 0);
  t.ok('提示要點前兩題', /前兩題/.test(doc.querySelector('#svMsg').textContent));

  // 單選：換選項會換掉
  pick('overall', '4'); pick('overall', '5');
  t.eq('單選題點別的會換掉', [...g('overall').querySelectorAll('.sv-opt[aria-pressed="true"]')].map((b) => b.dataset.v), ['5']);
  // 複選：可以多選、再點取消
  pick('liked', 'browse'); pick('liked', 'wishlist'); pick('liked', 'map'); pick('liked', 'map');
  t.eq('複選題可以多選、再點一次取消', [...g('liked').querySelectorAll('.sv-opt[aria-pressed="true"]')].map((b) => b.dataset.v), ['browse', 'wishlist']);
  pick('nps', '9'); pick('score_mobile', '4'); pick('used', 'browse'); pick('source', 'threads');
  doc.querySelector('#svComment').value = '  很好用，希望有地圖  ';

  const beforeSubmit = Date.now();
  doc.querySelector('#btnSvSubmit').click();
  await tick(win, 3);
  t.eq('送出一份', inserts.length, 1);
  const row = inserts[0];
  t.eq('訪客：user_id 是空的', row.user_id, null);
  t.ok('帶裝置代號（24 小時限制用）', typeof row.session_id === 'string' && row.session_id.length > 0);
  t.eq('分數正確', [row.overall, row.nps, row.score_mobile, row.score_find], [5, 9, 4, null]);
  t.eq('喜歡的功能', row.liked_features, ['browse', 'wishlist']);
  t.eq('最常用的功能', row.used_features, ['browse']);
  t.eq('來源', row.source, 'threads');
  t.eq('文字去頭尾空白', row.comment, '很好用，希望有地圖');
  t.eq('問卷版本', row.version, 'v1');
  t.ok('記下填寫時間', Number(ls.getItem('sxr_survey_last_submit')) >= beforeSubmit);
  t.ok('顯示謝謝', /謝謝/.test(doc.querySelector('#svMsg').textContent));
  t.ok('「我的」區塊顯示今天填過', /今天填過/.test(doc.querySelector('#surveyLastHint').textContent));

  // 可以重複填：再開一次、再送一次會是新的一份；被 24 小時限制擋下時講人話
  win.eval('openSurvey("mine")');
  await tick(win, 1);
  t.eq('再開問卷，上一份的選擇已經清掉', doc.querySelectorAll('#dlgSurvey .sv-opt[aria-pressed="true"]').length, 0);
  pick('overall', '3'); pick('nps', '6');
  insertResult = { data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "survey_responses"' } };
  doc.querySelector('#btnSvSubmit').click();
  await tick(win, 3);
  t.eq('重複填會送出新的一份（不是更新舊的）', inserts.length, 2);
  t.ok('24 小時內重填被擋下時講人話', /24 小時內已經填過/.test(doc.querySelector('#svMsg').textContent), doc.querySelector('#svMsg').textContent);
  insertResult = { data: null, error: { message: 'relation "public.survey_responses" does not exist' } };
  doc.querySelector('#btnSvSubmit').click();
  await tick(win, 3);
  t.ok('資料庫還沒跑 v62 時提示管理員', /schema_v62/.test(doc.querySelector('#svMsg').textContent));
  insertResult = { data: null, error: null };
  doc.querySelector('#dlgSurvey').close();

  // 會員填：帶自己的 user_id
  win.eval('me = {id:"u-1"}; myProfile = {id:"u-1", is_admin:false};');
  win.eval('openSurvey("mine")');
  pick('overall', '4'); pick('nps', '10');
  doc.querySelector('#btnSvSubmit').click();
  await tick(win, 3);
  t.eq('會員：帶自己的 user_id', inserts[inserts.length - 1].user_id, 'u-1');
  doc.querySelector('#dlgSurvey').close();

  /* ================= 小卡片 ================= */
  const nudge = doc.querySelector('#surveyNudge');
  const resetNudge = () => { ['sxr_survey_snooze_until', 'sxr_survey_last_submit', 'sxr_survey_first_wish', 'sxr_survey_first_report'].forEach((k) => ls.removeItem(k)); win.eval('SURVEY_NUDGE_SHOWN = false;'); nudge.classList.add('hidden'); };
  resetNudge();
  t.eq('條件符合就顯示', win.maybeShowSurveyNudge('test'), true);
  t.ok('小卡片出現', !nudge.classList.contains('hidden'));
  nudge.classList.add('hidden');
  t.eq('每次打開網站最多顯示一次', win.maybeShowSurveyNudge('test'), false);

  // 之後再說 → 7 天
  win.eval('SURVEY_NUDGE_SHOWN = false;');
  win.maybeShowSurveyNudge('test');
  const t0 = Date.now();
  doc.querySelector('#btnSvNudgeLater').click();
  const until = Number(ls.getItem('sxr_survey_snooze_until'));
  t.ok('「之後再說」收起卡片', nudge.classList.contains('hidden'));
  t.ok('「之後再說」7 天內不再出現', Math.abs(until - (t0 + 7 * 864e5)) < 5000, { until, expected: t0 + 7 * 864e5 });
  win.eval('SURVEY_NUDGE_SHOWN = false;');
  t.eq('7 天內不會再跳', win.maybeShowSurveyNudge('test'), false);
  ls.setItem('sxr_survey_snooze_until', String(Date.now() - 1000));
  t.eq('7 天過了會再出現', win.maybeShowSurveyNudge('test'), true);

  // 填完 30 天內不主動跳
  resetNudge();
  ls.setItem('sxr_survey_last_submit', String(Date.now() - 10 * 864e5));
  t.eq('填完 10 天內不主動跳', win.maybeShowSurveyNudge('test'), false);
  ls.setItem('sxr_survey_last_submit', String(Date.now() - 31 * 864e5));
  t.eq('填完超過 30 天會再邀請', win.maybeShowSurveyNudge('test'), true);

  // 「好啊」打開問卷
  doc.querySelector('#btnSvNudgeGo').click();
  await tick(win, 1);
  t.ok('按「好啊」打開問卷、收起卡片', doc.querySelector('#dlgSurvey').open && nudge.classList.contains('hidden'));
  doc.querySelector('#dlgSurvey').close();

  // 造訪次數：間隔 30 分鐘才算新的一次
  ls.removeItem('sxr_visit_count'); ls.removeItem('sxr_visit_last');
  t.eq('第一次打開算第 1 次', win.trackSurveyVisit(), 1);
  t.eq('馬上重新整理還是第 1 次', win.trackSurveyVisit(), 1);
  ls.setItem('sxr_visit_last', String(Date.now() - 29 * 60 * 1000));
  t.eq('隔 29 分鐘還是同一次', win.trackSurveyVisit(), 1);
  ls.setItem('sxr_visit_last', String(Date.now() - 31 * 60 * 1000));
  t.eq('隔 31 分鐘算第 2 次', win.trackSurveyVisit(), 2);

  // 第一次收藏：只有第一次會觸發
  resetNudge();
  t.eq('第一次收藏會觸發', win.surveyAfterFirst('wish'), true);
  t.eq('第二次收藏不會再觸發', win.surveyAfterFirst('wish'), false);
  await new Promise((r) => win.setTimeout(r, 1700));
  t.ok('第一次收藏後小卡片出現', !nudge.classList.contains('hidden'));

  /* ================= 管理員：問卷統計 ================= */
  win.eval('me = {id:"admin-1"}; myProfile = {id:"admin-1", is_admin:true};');
  const summary = {
    total: 10, members: 6, guests: 4, overall_avg: 4.3, promoters: 5, passives: 3, detractors: 2,
    find_avg: 4.1, accuracy_avg: 3.8, mobile_avg: 4.5, look_avg: 4.0,
    liked: { browse: 8, wishlist: 5, map: 2 }, used: { browse: 9, report: 3 },
    source: { threads: 6, friend: 3, unknown: 1 },
    recent_comments: [{ created_at: '2026-09-15T03:00:00Z', overall: 5, nps: 10, comment: '<b>超讚</b>', is_member: true, device: 'mobile' }],
  };
  const sbAdmin = makeSb({ rpcs: { admin_survey_summary: { data: summary, error: null } } });
  win.__sb = sbAdmin; win.eval('sb = window.__sb;');
  await win.loadSurveyAdmin();
  await tick(win, 2);
  const body = doc.querySelector('#svBody');
  t.ok('NPS 分數＝(5−2)/10×100＝30', /\b30\b/.test(body.querySelector('.bigstat').textContent), body.querySelector('.bigstat').textContent);
  t.ok('平均滿意度顯示到小數一位', /4\.3 \/ 5/.test(body.textContent));
  t.ok('喜歡的功能長條圖用中文功能名稱', /瀏覽／篩選優惠/.test(body.textContent) && /8 人・80%/.test(body.textContent));
  t.ok('來源沒填的顯示「沒填」', /沒填/.test(body.textContent));
  t.ok('文字回饋有跳脫（不會變成 HTML）', !body.querySelector('.sub-item b b') && /<b>超讚<\/b>/.test(body.textContent));
  t.eq('標題旁顯示回覆數', doc.querySelector('#svCount').textContent, '10');
  t.eq('查詢帶區間天數', sbAdmin.__calls.rpc.find((c) => c.name === 'admin_survey_summary').params, { p_days: 30 });

  win.eval('myProfile = {id:"u-9", is_admin:false};');
  const n = sbAdmin.__calls.rpc.length;
  await win.loadSurveyAdmin();
  t.eq('非管理員不查問卷統計', sbAdmin.__calls.rpc.length, n);
  win.eval('myProfile = {id:"admin-1", is_admin:true};');

  // CSV
  const csv = win.buildSurveyCsv([
    { created_at: '2026-09-15T03:00:00Z', user_id: 'u-1', session_id: 'sSECRET', device: 'mobile', version: 'v1', overall: 5, nps: 9,
      score_find: 4, score_accuracy: null, score_mobile: 5, score_look: 3, liked_features: ['browse', 'map'], used_features: ['browse'],
      source: 'friend', comment: '好用, 但"希望"\n有地圖' },
    { created_at: '2026-09-14T03:00:00Z', user_id: null, session_id: 'sOTHER', device: 'desktop', version: 'v1', overall: 2, nps: 3,
      liked_features: [], used_features: [], source: null, comment: '' },
  ]);
  t.ok('CSV 開頭有 BOM（Excel 中文不亂碼）', csv.charCodeAt(0) === 0xFEFF);
  t.ok('CSV 不含 user_id／裝置代號', !/u-1|sSECRET|sOTHER/.test(csv));
  t.ok('CSV 功能用中文名稱', /瀏覽／篩選優惠、Google 地圖找分店/.test(csv));
  t.ok('CSV 逗號、引號、換行有正確跳脫', csv.includes('"好用, 但""希望""\n有地圖"'));
  t.ok('CSV 會員／訪客標示', /,是,mobile,/.test(csv) && /,否,desktop,/.test(csv));

  /* ================= 管理員：造訪統計 ================= */
  const box = doc.createElement('div'); box.id = 'dashVisits'; doc.body.appendChild(box);
  const sbV = makeSb({ rpcs: { admin_visit_stats: { data: { active_members: 40, avg_visits_per_member: 3.456, avg_pageviews_per_member: 7.1, returning_rate: 0.625, avg_visits_per_guest_device: 1.4 }, error: null } } });
  win.__sb = sbV; win.eval('sb = window.__sb;');
  await win.loadVisitStats(30, '近 30 天');
  t.ok('平均每位會員造訪次數（取一位小數）', /3\.5/.test(box.textContent) && /平均每位會員造訪次數/.test(box.textContent), box.textContent.slice(0, 80));
  t.ok('回訪率百分比', /62\.5%/.test(box.textContent));
  t.ok('說明分母是活躍會員人數', /40 人/.test(box.textContent));
  t.eq('造訪統計帶區間天數', sbV.__calls.rpc[0].params, { p_days: 30 });
  const sbV2 = makeSb({ rpcs: { admin_visit_stats: { data: null, error: { message: 'function public.admin_visit_stats(integer) does not exist' } } } });
  win.__sb = sbV2; win.eval('sb = window.__sb;');
  await win.loadVisitStats(null, '全部時間');
  t.ok('v62 還沒跑時提示要執行哪支 SQL', /schema_v62/.test(box.textContent));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
