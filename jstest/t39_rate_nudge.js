/* celine：「用過的人最推薦，多一個鼓勵給評分的通知，然後這塊排行榜也要有」
          「站外贊助、不會解鎖任何功能改成什麼」

   為什麼要鼓勵：站上一直有評分，但只有「回報完當下」那一次會被問到。錯過
   那一次就再也沒人提，所以整站最多評分的一筆也只有 8 個人評過——「最推薦」
   這塊榜單撐不起來。兩個入口補這個缺口：榜單自己底下一條邀請、以及隔一陣子
   跳一次的小卡片。

   這一支驗：誰會被邀請（用過、成功、還沒評）、誰不會被煩（評過的、失敗的、
   沒登入的）、小卡片的禮貌（不疊卡、按掉會安靜一陣子），以及咖啡視窗改寫後
   那兩句話。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

(async () => {
  const t = makeAsserts('t39 鼓勵評分＋咖啡視窗的兩句話');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  const setup = (reports, rated, extra = '') => win.eval(`
    me={id:'u-1'}; LIVE=true; RATE_NUDGE_SHOWN=false;
    MY_REPORTS=${JSON.stringify(reports)};
    MY_RATED=new Set(${JSON.stringify(rated)});
    ${extra}
    renderRatedCta();
  `);
  const REPORTS = [
    { offer_id: 101, result: 'success', used_on: '2026-10-01', offers: { brand: '甲店' } },
    { offer_id: 102, result: 'success', used_on: '2026-09-20', offers: { brand: '乙店' } },
    { offer_id: 101, result: 'success', used_on: '2026-08-01', offers: { brand: '甲店' } },
    { offer_id: 103, result: 'failed', used_on: '2026-09-02', offers: { brand: '沒用成的' } },
  ];
  const pending = () => JSON.parse(win.eval('JSON.stringify(unratedUsed().map(x=>x.brand))'));

  /* ================= 1. 誰會被邀請 ================= */
  setup(REPORTS, []);
  t.eq('用過而且還沒評的才算', pending(), ['甲店', '乙店']);
  t.ok('同一家用兩次只算一家', pending().filter((b) => b === '甲店').length === 1);
  t.ok('沒用成的不算（result 不是 success）', !pending().includes('沒用成的'));
  setup(REPORTS, ['101']);
  t.eq('已經評過的不再被煩', pending(), ['乙店']);
  setup(REPORTS, ['101', '102']);
  t.eq('全部評完就沒有了', pending(), []);

  /* ================= 2. 榜單底下那條邀請 ================= */
  const cta = $('#ratedCta');
  t.ok('邀請在「用過的人最推薦」那一塊裡面', !!cta && cta.closest('#pnlTopRated'));
  t.ok('全部評完就收起來，不要硬放一條用不到的提示', cta.classList.contains('hidden'));
  setup(REPORTS, []);
  t.ok('有東西可以評才出現', !cta.classList.contains('hidden'));
  t.ok('寫得出還有幾家', /2/.test(cta.textContent) && /星等/.test(cta.textContent),
    cta.textContent.replace(/\s+/g, ' ').trim());
  setup([REPORTS[1]], []);
  t.ok('只剩一家就直接寫出店名', /乙店/.test(cta.textContent),
    cta.textContent.replace(/\s+/g, ' ').trim());
  // 沒登入的人看不到（他也不能評）
  win.eval('me=null; renderRatedCta();');
  t.ok('沒登入就不出現', cta.classList.contains('hidden'));

  /* ================= 3. 小卡片 ================= */
  const nudge = $('#rateNudge');
  const show = () => win.eval('maybeShowRateNudge()');
  win.localStorage.removeItem('sxr_rate_snooze_until');
  setup(REPORTS, []);
  t.ok('有東西可以評就跳', show() === true);
  t.ok('卡片真的顯示出來', !nudge.classList.contains('hidden'));
  t.ok('說得出還有幾家', /2/.test($('#rateNudgeText').textContent),
    $('#rateNudgeText').textContent);

  // 同一次造訪不重複跳
  t.ok('同一次造訪不會再跳一次', show() === false);

  // 按掉會安靜一陣子
  $('#btnRateNudgeClose').click();
  t.ok('按 ✕ 就收起來', nudge.classList.contains('hidden'));
  const until = Number(win.localStorage.getItem('sxr_rate_snooze_until') || 0);
  t.ok('而且記下要安靜到什麼時候', until > Date.now() + 10 * 864e5, String(until));
  win.eval('RATE_NUDGE_SHOWN=false;');
  t.ok('安靜期間不會再跳', show() === false);

  // 全部評完就不該再跳
  win.localStorage.removeItem('sxr_rate_snooze_until');
  setup(REPORTS, ['101', '102'], 'RATE_NUDGE_SHOWN=false;');
  t.ok('沒東西可以評就不跳', show() === false);
  // 沒登入也不跳
  win.localStorage.removeItem('sxr_rate_snooze_until');
  setup(REPORTS, [], 'RATE_NUDGE_SHOWN=false;');
  win.eval('me=null;');
  t.ok('沒登入不跳', show() === false);

  /* 同一個位置不疊兩張卡片——雙向都要讓 */
  win.eval('me={id:"u-1"}; RATE_NUDGE_SHOWN=false;');
  $('#surveyNudge').classList.remove('hidden');
  t.ok('別人先跳的話這張讓位', show() === false);
  $('#surveyNudge').classList.add('hidden');
  t.ok('別人收了就跳得出來', show() === true);
  win.eval('SURVEY_NUDGE_SHOWN=false;');
  t.ok('反過來也讓：這張在的時候問卷那張不跳',
    win.eval('maybeShowSurveyNudge("test")') === false);
  $('#rateNudge').classList.add('hidden');

  /* ================= 4. 點「去評分」會帶到評分那一格 ================= */
  t.ok('openDetail 收得到「直接看評分」這個指示',
    /async function openDetail\(id, fallback=null, focusRate=false\)/.test(index));
  t.ok('捲過去＋發光抽成共用的函式', /function flashRateBox\(root\)/.test(index));
  t.ok('小卡片的「去評分」有用到它', /openDetail\(list\[0\]\.id, null, true\)/.test(index));
  t.ok('榜單底下那條也是', /openDetail\(first\.id, null, true\)/.test(index));

  /* ================= 5. 咖啡視窗：嵐那兩句話改成什麼 ================= */
  // 只看視窗裡真的讀得到的字——舊說法還留在註解裡當對照
  const say = (index.match(/<dialog id="dlgCoffee"[\s\S]*?<\/dialog>/) || [''])[0]
    .replace(/<!--[\s\S]*?-->/g, '');
  t.ok('不要寫「不會解鎖任何功能」（celine：感覺很派）', !/解鎖/.test(say), say.slice(0, 200));
  t.ok('改成講產品本身：功能全部免費、沒有付費版',
    /功能全部免費/.test(say) && /沒有付費版/.test(say), say.slice(0, 200));
  t.ok('「站外」改成講清楚錢在哪裡付', /站外/.test(say) && /Buy Me a Coffee 上完成/.test(say),
    say.slice(-200));
  t.ok('順便講明看不到卡號', /看不到你的卡號/.test(say), say.slice(-200));
  t.ok('沒有把「免費」講兩次',
    (say.match(/收訂閱/g) || []).length === 0, say.slice(0, 220));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
