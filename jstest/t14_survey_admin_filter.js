/* 管理員問卷：逐筆回覆看得到名字跟信箱、可以篩選題目看結果（嵐）

   - 逐筆回覆：時間、會員暱稱（訪客標訪客）、信箱（admin_user_emails 一次查一批）、分數、每一題的答案、還想說的話
   - 篩選：選一題＋一個答案，圖表跟逐筆回覆都只算答這個答案的人；答案選單標出各有幾份
   - 篩選後的圖表用逐筆資料在前端重算，算法跟 admin_survey_summary 一致 */
const { boot, tick, makeSb, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t14 管理員問卷篩選＋逐筆回覆');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  const raw = [
    { id: 1, created_at: '2026-09-17T03:00:00Z', user_id: 'u-1', profiles: { display_name: '嵐' }, overall: 5, nps: 10,
      score_find: 5, liked_features: ['browse', 'map'], used_features: ['browse'], source: 'threads', comment: '很好用',
      extra: { visit_freq: 'bday_weekly', want_types: ['food', 'beauty'] } },
    { id: 2, created_at: '2026-09-16T03:00:00Z', user_id: null, profiles: null, overall: 3, nps: 5,
      score_find: 3, liked_features: ['wishlist'], used_features: ['wishlist'], source: 'friend', comment: '',
      extra: { visit_freq: 'first', want_types: ['food'] } },
    { id: 3, created_at: '2026-09-15T03:00:00Z', user_id: 'u-2', profiles: { display_name: null }, overall: 4, nps: 8,
      score_find: 4, liked_features: ['browse'], used_features: ['report'], source: 'threads', comment: '<b>x</b>',
      extra: { visit_freq: 'birthday_month' } },
  ];
  const emailCalls = [];
  const sb = makeSb({
    tables: { survey_responses: raw },
    rpcs: {
      admin_survey_summary: { data: { total: 3, members: 2, guests: 1, overall_avg: 4, promoters: 1, passives: 1, detractors: 1 }, error: null },
      admin_user_emails: (p) => { emailCalls.push(p.p_ids); return { data: p.p_ids.map((id) => ({ id, email: id === 'u-1' ? 'lan@example.com' : 'two@example.com' })), error: null }; },
    },
  });
  win.__sb = sb;
  win.eval('sb = window.__sb; LIVE = true; me = {id:"admin"}; myProfile = {id:"admin", is_admin:true};');
  await win.loadSurveyAdmin();
  await tick(win, 5);

  /* ---- 逐筆回覆 ---- */
  const items = () => [...doc.querySelectorAll('#svResponses .sv-item')];
  t.eq('逐筆回覆列出每一份', items().length, 3);
  t.ok('看得到會員名字', /嵐/.test(items()[0].textContent));
  t.ok('看得到信箱', /lan@example\.com/.test(items()[0].textContent), items()[0].textContent);
  t.eq('信箱一次查一批（不是一份查一次）', emailCalls.length, 1);
  t.ok('訪客標訪客、沒有信箱', /訪客/.test(items()[1].textContent) && !/@/.test(items()[1].textContent));
  t.ok('每一題的答案翻成中文', /怎麼知道壽星日：?Threads/.test(items()[0].textContent) && /生日月每週幾次/.test(items()[0].textContent), items()[0].textContent);
  t.ok('舊版答案也翻成中文', /生日月才來（舊版）/.test(items()[2].textContent));
  t.ok('還想說的話有跳脫', !items()[2].querySelector('b b') && /<b>x<\/b>/.test(items()[2].textContent));

  /* ---- 篩選題目 ---- */
  const q = $('#svFilterQ');
  t.ok('篩選選單列出題目', [...q.options].some((o) => o.textContent === '怎麼知道壽星日') && [...q.options].some((o) => o.textContent === '會員／訪客'));
  q.value = 'source'; q.dispatchEvent(new win.Event('change'));
  const a = $('#svFilterA');
  t.ok('選題目後出現答案選單，標出各有幾份', !$('#svFilterAWrap').classList.contains('hidden')
    && [...a.options].some((o) => /Threads（2）/.test(o.textContent)), [...a.options].map((o) => o.textContent));
  a.value = 'threads'; a.dispatchEvent(new win.Event('change'));
  await tick(win, 5);
  t.eq('逐筆回覆只剩答 Threads 的', items().length, 2);
  t.ok('標題寫出篩選條件', /怎麼知道壽星日：Threads/.test($('#svResponses b').textContent));
  t.eq('圖表也只算篩選後的人（回覆數 2）', $('#svCount').textContent, '2');
  t.ok('圖表標題寫出篩選條件', /怎麼知道壽星日：Threads/.test($('#svBody .bigstat').textContent), $('#svBody .bigstat').textContent);

  // 複選題：勾了「地圖」的人
  q.value = 'liked'; q.dispatchEvent(new win.Event('change'));
  a.value = 'map'; a.dispatchEvent(new win.Event('change'));
  await tick(win, 5);
  t.eq('複選題篩選（喜歡地圖的人）', items().length, 1);

  // 新題目
  q.value = 'x_want_types'; q.dispatchEvent(new win.Event('change'));
  a.value = 'food'; a.dispatchEvent(new win.Event('change'));
  await tick(win, 5);
  t.eq('新題目也能篩（想看餐廳的人）', items().length, 2);

  // 前端重算跟 RPC 同一套算法
  const agg = win.surveyAggregate(raw);
  t.eq('前端重算：人數、會員／訪客', [agg.total, agg.members, agg.guests], [3, 2, 1]);
  t.eq('前端重算：推薦／中立／批評', [agg.promoters, agg.passives, agg.detractors], [1, 1, 1]);
  t.eq('前端重算：平均滿意度', agg.overall_avg, 4);
  t.eq('前端重算：複選題次數', agg.liked, { browse: 2, map: 1, wishlist: 1 });
  t.eq('前端重算：新題目次數', agg.extra.want_types, { food: 2, beauty: 1 });
  t.eq('前端重算：留言只收有寫的', agg.recent_comments.length, 2);

  // 清除篩選
  q.value = ''; q.dispatchEvent(new win.Event('change'));
  await tick(win, 5);
  t.eq('清掉篩選回到全部', items().length, 3);
  t.ok('答案選單收起來', $('#svFilterAWrap').classList.contains('hidden'));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
