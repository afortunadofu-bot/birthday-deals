/* celine：「問卷的蒐選結果還是很難篩選，我想直接看所有人的回饋意見」
          「除了回饋，其他欄位也都要能這樣篩選，不然每次都要滑到底才能看到」

   原本：所有圖表在上面、逐筆回覆在最下面，而且每一份還要點開才看得到裡面寫什麼。
   想看一句話要先滑過七八張圖，再點開一份一份找。

   改成四個小分頁，預設停在「大家說了什麼」（所有人的文字，攤平、照時間），
   另外一個「逐題看」：選一題，一次看完所有人在那一題答了什麼。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

(async () => {
  const t = makeAsserts('t48 問卷：直接看大家寫了什麼');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];

  /* ========== 版面 ========== */
  const bar = $('#pnlSurvey .subtabs');
  t.ok('問卷那一塊有小分頁', !!bar && bar.dataset.group === 'survey');
  t.eq('四個分頁', $$('#pnlSurvey .subtab').map((b) => b.dataset.pane),
    ['svPaneSay', 'svPaneQ', 'svPaneAll', 'svPaneSum']);
  t.eq('預設停在「大家說了什麼」', $$('#pnlSurvey .subtab')[0].textContent.trim(), '大家說了什麼');
  t.ok('圖表被收進自己的分頁，不會擋在前面',
    $('#svBody').closest('.subpane').id === 'svPaneSum');
  t.ok('逐筆回覆也是自己一個分頁', $('#svResponses').closest('.subpane').id === 'svPaneAll');

  /* ========== 大家說了什麼 ========== */
  const rows = [
    { id: 1, created_at: '2026-10-14T10:00:00Z', user_id: 'u1', profiles: { display_name: '小美' },
      overall: 5, nps: 10, comment: '很好用，希望有當天不用預約的', liked_features: ['list', 'map'], source: 'friend' },
    { id: 2, created_at: '2026-10-13T10:00:00Z', user_id: null,
      overall: 4, nps: 8, comment: '  ', liked_features: ['map'], source: 'search' },
    { id: 3, created_at: '2026-10-12T10:00:00Z', user_id: null,
      overall: 3, nps: 6, comment: '希望收藏可以依距離排序', liked_features: [], source: 'search' },
  ];
  win.__rows = rows;
  win.eval(`LIVE=true; myProfile={is_admin:true}; SV_RAW=window.__rows; SV_LABEL='近 30 天';
    fillSurveyQPick(); renderSurveyComments(); renderSurveyByQuestion();`);

  const say = $('#svComments').textContent.replace(/\s+/g, ' ');
  t.ok('數得出幾則', /2 則/.test(say), say.slice(0, 80));
  t.eq('只算真的有寫字的（空白不算）', $$('#svComments .say').length, 2);
  t.ok('文字直接看得到，不用點開', /希望有當天不用預約的/.test(say) && /希望收藏可以依距離排序/.test(say));
  t.ok('新的在前面', $$('#svComments .say')[0].textContent.includes('當天不用預約'));
  t.ok('旁邊寫得出是誰、幾分', /小美/.test(say) && /訪客/.test(say) && /滿意度/.test(say), say.slice(0, 200));
  t.ok('文字是主角（.say-text），時間跟人是配角（.say-meta）',
    !!$('#svComments .say-text') && !!$('#svComments .say-meta'));

  /* ========== 逐題看 ========== */
  const opts = $$('#svQPick option').map((o) => o.value);
  t.ok('每一題都選得到', opts.includes('liked') && opts.includes('source') && opts.includes('overall'),
    opts.join(','));
  t.ok('「填表人」不列進來（那不是一題）', !opts.includes('person'));

  win.eval(`document.querySelector('#svQPick').value='liked'; renderSurveyByQuestion();`);
  const byq = $('#svByQ').textContent.replace(/\s+/g, ' ');
  t.ok('看得出哪個選項幾個人', /2 人/.test(byq), byq.slice(0, 200));
  t.ok('沒答的也要講出來，不要默默從分母消失', /1 份沒答/.test(byq), byq.slice(0, 200));
  t.ok('下面列得出每一份各自答了什麼', $$('#svByQ .linkrow').length >= 5, String($$('#svByQ .linkrow').length));
  t.ok('沒答的那一份顯示「—」，不是空白一列', /—/.test(byq));

  // 換一題就換一組數字
  win.eval(`document.querySelector('#svQPick').value='source'; renderSurveyByQuestion();`);
  t.ok('換一題，上面的標題跟著換', /怎麼知道/.test($('#svByQ').textContent), $('#svByQ').textContent.slice(0, 60));

  /* ========== 跟原本的篩選是同一份資料 ========== */
  t.ok('三個分頁共用 surveyRowsNow()，不會各算各的',
    /function surveyRowsNow/.test(index)
    && /renderSurveyComments[\s\S]{0,400}surveyRowsNow\(\)/.test(index)
    && /renderSurveyByQuestion[\s\S]{0,600}surveyRowsNow\(\)/.test(index));
  t.ok('設了篩選之後，留言那一頁也會跟著只算那幾份',
    /applySurveyFilter[\s\S]{0,300}renderSurveyComments\(\)/.test(index));

  win.eval(`SV_RAW=[]; renderSurveyComments(); renderSurveyByQuestion();`);
  t.eq('一份問卷都沒有的時候不要留一塊空殼', $('#svComments').innerHTML.trim(), '');

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
