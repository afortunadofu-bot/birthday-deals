/* celine：「使用回報可以輸入星等，是推薦指數」
          「可以偵測咖啡的點閱率，讓管理員看到」

   1. 推薦指數做進回報表單：剛用完當下最知道好不好，以前卻要等送出之後才被問
      一次，錯過那一次就再也沒人提（整站最多評分的一筆也只有 8 個人評過）。
      回報「失敗」時這一欄收起來——沒用到的東西沒什麼好推薦。

   2. 咖啡按鈕本來就一直在記事件（coffee_open／coffee_go），只是沒有人看得到。
      不用新的 SQL：site_events 的 select 政策本來就是管理員才讀得到，
      v14 也早就建了 (event_type, created_at) 的索引。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, makeSb } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

(async () => {
  const t = makeAsserts('t42 回報表單的推薦指數＋咖啡點閱率');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];

  /* ================= 1. 回報表單的推薦指數 ================= */
  t.ok('回報表單有這一欄', !!$('#repRateField') && !!$('#repRateField').closest('#dlgReport'));
  t.ok('叫「推薦指數」（celine 的用字）', /推薦指數/.test($('#repRateField').textContent));
  t.eq('五顆星', $$('#repStars .star-btn').length, 5);

  const score = () => win.eval('repScore');
  const lit = () => $$('#repStars .star-btn.on').length;

  win.eval('setRepScore(0)');
  t.eq('沒給分的時候是 0', score(), 0);
  t.ok('清除鈕先藏著', $('#btnRepStarClear').classList.contains('hidden'));
  $$('#repStars .star-btn')[2].click();
  t.eq('點第三顆就是 3 分', score(), 3);
  t.eq('前三顆亮起來', lit(), 3);
  t.ok('寫得出現在幾顆', /3 星/.test($('#repStarMsg').textContent), $('#repStarMsg').textContent);
  t.ok('給了分才出現清除鈕', !$('#btnRepStarClear').classList.contains('hidden'));
  $('#btnRepStarClear').click();
  t.eq('清得掉', score(), 0);
  t.eq('星星也暗回去', lit(), 0);

  // 回報「失敗」時整欄收起來，而且不要留著剛剛給的分
  $$('#repStars .star-btn')[4].click();
  $('#repResult').value = 'failed';
  $('#repResult').dispatchEvent(new win.Event('change'));
  t.ok('回報失敗就不問推薦指數', $('#repRateField').classList.contains('hidden'));
  t.eq('而且不要留著剛剛給的分', score(), 0);
  $('#repResult').value = 'success';
  $('#repResult').dispatchEvent(new win.Event('change'));
  t.ok('改回成功又出現', !$('#repRateField').classList.contains('hidden'));

  /* 送出：回報先存，再存推薦指數（兩張不同的表）。
     分數沒變就不要白打一次 API；評分存失敗也不能連累已經存好的回報。 */
  const sb = makeSb({ tables: { usage_reports: [], offer_ratings: [] } });
  win.__sb = sb;
  win.eval(`
    LIVE=true; me={id:'u-1'}; sb=window.__sb;
    MY_RATED=new Set(['77']); MY_SCORES=new Map([['77',4]]);
    loadOffers=async()=>{}; render=()=>{}; loadMyStuff=()=>{};
    loadSiteStats=()=>{}; loadMyUsedOffers=()=>{}; openDetail=async()=>{};
    repId=77; editingReportId=55;
  `);
  // 評過 4 星的那一筆，打開要帶回 4 星
  win.eval('setRepScore(MY_SCORES.get(String(repId))||0)');
  t.eq('編輯已經評過的，星等要帶回來', score(), 4);
  t.ok('openReport 真的會帶', /setRepScore\(MY_SCORES\.get\(String\(id\)\) \|\| 0\)/.test(index));

  // 分數沒變 → 不要再寫一次
  await win.eval(`document.querySelector('#repDate').value='2026-10-13';
    document.querySelector('#btnSaveReport').onclick({preventDefault(){}})`);
  await tick(win, 4);
  t.eq('分數沒變就不重寫', sb.__calls.write.filter((w) => w.table === 'offer_ratings').length, 0);
  t.ok('回報本身有寫', sb.__calls.write.some((w) => w.table === 'usage_reports'));

  // 改了分數 → 連評分一起寫
  win.eval("editingReportId=55; repId=77;");
  $$('#repStars .star-btn')[0].click();
  await win.eval(`document.querySelector('#btnSaveReport').onclick({preventDefault(){}})`);
  await tick(win, 4);
  const rate = sb.__calls.write.filter((w) => w.table === 'offer_ratings');
  t.eq('改了分數才寫', rate.length, 1);
  t.eq('寫的是這家、這個分數', [rate[0].args[0].offer_id, rate[0].args[0].score], [77, 1]);
  t.eq('同一個人同一家只會有一列', rate[0].args[1], { onConflict: 'offer_id,user_id' });
  t.eq('自己的那份也更新了', win.eval('MY_SCORES.get("77")'), 1);

  /* 評分存失敗不要連累回報——回報已經存好了，為了一顆星把整張表退回來
     只會讓人重填一次 */
  t.ok('評分失敗不擋回報', /if\(!rErr\)\{\s*MY_RATED\.add/.test(index.replace(/\s+/g, ' ')) ||
    /\{error:rErr\}=await sb\.from\('offer_ratings'\)/.test(index));
  t.ok('而且不會 alert 把人嚇一跳',
    !/rErr[\s\S]{0,60}alert\(/.test(index));

  // 表單裡給過了，送出後那張提示卡就不用再問一次「要不要評分」
  t.ok('已經評過就不再問一次',
    /\$\{\(me && !MY_RATED\.has\(String\(id\)\)\)\?`<button[^`]*btnInlineRate/.test(index));

  /* ================= 2. 咖啡按鈕的點閱率 ================= */
  const panel = $('#pnlCoffeeStats');
  t.ok('審核頁多一塊「咖啡按鈕」', !!panel && !!panel.closest('#tab-admin'));
  t.ok('可以選區間', !!$('#coffeeRange'));
  t.ok('每一塊都能收合的規則也涵蓋它（自動掃，不用登記）',
    /\$\$\(`\$\{sel\} \.panel`\)\.forEach/.test(index));

  // 查法：只回數字，不要把幾萬列拉下來
  const q = [];
  win.eval(`myProfile={is_admin:true};`);
  win.__sb2 = {
    from: () => ({
      select: (cols, opts) => {
        const st = { cols, opts };
        const o = {
          eq: (k, v) => { st.type = v; return o; },
          gte: (k, v) => { st.since = v; return o; },
          then: (ok) => { q.push(st); ok({ count: st.type === 'coffee_open' ? 240 : 36, error: null }); return Promise.resolve(); },
        };
        return o;
      },
    }),
  };
  win.eval('sb=window.__sb2;');
  await win.eval('loadCoffeeStats()');
  await tick(win, 3);
  t.eq('查兩種事件', q.map((x) => x.type).sort(), ['coffee_go', 'coffee_open']);
  t.ok('用 head + count（不回資料列，egress 很緊）',
    q.every((x) => x.opts && x.opts.head === true && x.opts.count === 'exact'), JSON.stringify(q[0].opts));
  t.ok('有帶日期範圍', q.every((x) => !!x.since), JSON.stringify(q.map((x) => x.since)));
  const body = $('#coffeeStatsBody').textContent.replace(/\s+/g, ' ');
  t.ok('看得到點開幾次', /240/.test(body), body.slice(0, 120));
  t.ok('看得到真的出去幾次', /36/.test(body), body.slice(0, 120));
  t.ok('算得出比例', /15%/.test(body), body.slice(0, 160));
  t.ok('講明我們看不到金流', /看不到|不會知道/.test(body) && /Buy Me a Coffee/.test(body), body.slice(-120));

  // 按鈕被關掉時要講一聲，不然看到 0 會以為統計壞了
  win.eval('SITE_FLAGS.show_coffee=false;');
  await win.eval('loadCoffeeStats()');
  await tick(win, 3);
  t.ok('按鈕關著的時候講一聲', /關掉/.test($('#coffeeStatsBody').textContent));
  win.eval('SITE_FLAGS.show_coffee=true;');

  // 不是管理員就什麼都不查
  q.length = 0;
  win.eval('myProfile={is_admin:false};');
  await win.eval('loadCoffeeStats()');
  await tick(win, 2);
  t.eq('非管理員不會去查 site_events', q.length, 0);

  // 原本寫成「v107 以後都不准有 SQL 檔」，但那是在賭「之後沒有別的改動要動資料庫」——
  // v110（照分店補適用縣市）一加進來就假失敗了。要驗的其實只有「這一版自己沒帶 SQL」。
  t.ok('不需要新的 SQL（site_events 本來就只有管理員讀得到）',
    !fs.readdirSync(path.join(__dirname, '..')).some((f) => /^schema_v107_/.test(f)));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
