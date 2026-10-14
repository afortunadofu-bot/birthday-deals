/* celine：「用過的人最推薦，希望看到使用人數／評分人數之類的」
          「洞察分析月份可以切成年分」

   1. 推薦榜只寫了平均分數跟評分人數，看不出這家到底被多少人用過——
      「4 顆星、2 個人評」跟「4 顆星、被回報用過 139 次」是兩件事。
      多一個「用過次數」，但擠在同一欄裡（手機上排五欄會把品牌欄壓到 61px，
      「31冰淇淋 Baskin-Robbins」斷成三行）。

   2. 洞察分析的「月份」多一個「年份」。年份不能用走勢圖那份近 180 天的資料算——
      使用者可以回填過去的日期，今年年初那幾個月就落在視窗外（實測站上 1、3 月
      都有回報）。切到年份時才多抓一次 400 天（site_usage_daily 的上限）。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, makeSb } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

(async () => {
  const t = makeAsserts('t44 推薦榜的使用次數＋洞察分析的年份');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];

  /* ========== 1. 用過的人最推薦：評分人數＋用過次數 ========== */
  win.eval(`OFFERS=[
    {id:1, brand:'甲店', timing:'當月', ratingAvg:4.8, ratingCount:12, reportCount:139},
    {id:2, brand:'乙店', timing:'當日', ratingAvg:5,   ratingCount:2,  reportCount:3},
    {id:3, brand:'丙店', timing:'當月', ratingAvg:4.9, ratingCount:1,  reportCount:200},
  ]; renderRatedCta=()=>{}; renderTopRated();`);
  const head = $('#ratedBody thead').textContent.replace(/\s+/g, '');
  t.ok('表頭寫得出評分人數', /評分人數/.test(head), head);
  t.ok('表頭也寫得出用過次數', /用過次數/.test(head), head);
  t.eq('沒有多開一欄（手機上品牌欄會被壓扁）', $$('#ratedBody thead th').length, 4);

  const rowOf = (brand) => $$('#ratedBody tbody tr')
    .find((r) => r.cells[1].textContent.includes(brand));
  const jia = rowOf('甲店');
  t.ok('甲店有上榜', !!jia, $('#ratedBody').textContent.replace(/\s+/g, ' ').slice(0, 120));
  const numCell = jia.cells[3].textContent.replace(/\s+/g, ' ').trim();
  t.ok('看得到幾個人評過', /12 人/.test(numCell), numCell);
  t.ok('同一格也看得到被用過幾次', /139 次/.test(numCell), numCell);
  t.ok('兩個數字分兩行', !!jia.cells[3].querySelector('br'));
  t.eq('兩家都上榜（都有兩個人以上評過）', $$('#ratedBody tbody tr').length, 2);
  const body = $('#ratedBody').textContent;
  t.ok('只有一個人評過的還是不上榜（200 次也一樣）', !/丙店/.test(body));

  /* ========== 2. 洞察分析：月份／年份 ========== */
  t.ok('多一個「看月份還是年份」的切換', !!$('#momUnit'));
  t.eq('兩個選項', $$('#momUnit option').map((o) => o.value), ['month', 'year']);
  t.ok('預設還是月份', $('#momUnit').value === 'month');
  t.ok('年份下拉先藏著', $('#momYearWrap').classList.contains('hidden'));
  t.ok('月份下拉看得到', !$('#momMonthWrap').classList.contains('hidden'));

  // 加總：月份比日期的前 7 個字，年份比前 4 個——同一支函式
  const rows = [
    { used_on: '2025-12-31', success_uses: 1, saved: 100 },
    { used_on: '2026-01-05', success_uses: 2, saved: 200 },
    { used_on: '2026-03-20', success_uses: 3, saved: 300 },
    { used_on: '2026-10-01', success_uses: 4, saved: 400 },
  ];
  const totals = (key) => JSON.parse(win.eval(
    `JSON.stringify(periodTotals(${JSON.stringify(rows)}, ${JSON.stringify(key)}))`));
  t.eq('一個月', totals('2026-03'), { saved: 300, uses: 3 });
  t.eq('一整年', totals('2026'), { saved: 900, uses: 9 });
  t.eq('去年', totals('2025'), { saved: 100, uses: 1 });

  // 年份清單：被資料視窗切一半的年份不列出來，不然「去年」會只算到視窗開始那天之後
  const years = (since) => JSON.parse(win.eval(
    `JSON.stringify(momYears(${JSON.stringify(rows)}, ${JSON.stringify(since)}))`));
  const nowY = String(new Date().getFullYear());
  t.ok('視窗蓋不到整個 2025，就不列 2025', !years('2025-09-10').includes('2025'),
    years('2025-09-10').join(','));
  t.ok('視窗蓋得到整個 2025 就列得出來', years('2024-01-01').includes('2025'),
    years('2024-01-01').join(','));
  t.ok('今年一定在（它本來就還沒過完）', years('2026-09-10').includes(nowY));
  t.eq('新的年份排前面', years('2024-01-01')[0], years('2024-01-01').slice().sort().reverse()[0]);

  /* 切到年份：要多抓一次 400 天（走勢那份只有 180 天，今年年初會被切掉），
     而且只抓一次——連點兩下不要打兩次 API。 */
  const daily = [
    { d: '2026-01-05', uses: 2, success_uses: 2, saved: 1150 },
    { d: '2026-03-20', uses: 3, success_uses: 3, saved: 1828 },
    { d: `${nowY}-10-01`, uses: 9, success_uses: 9, saved: 95841 },
  ];
  const sb = makeSb({ rpcs: { site_usage_daily: () => daily } });
  win.__sb = sb;
  win.eval(`LIVE=true; sb=window.__sb;
    setMomRows([{used_on:'${nowY}-10-01', success_uses:9, saved:95841}], '${nowY}-05-01');`);
  await tick(win, 2);

  $('#momUnit').value = 'year';
  $('#momUnit').dispatchEvent(new win.Event('change'));
  $('#momUnit').dispatchEvent(new win.Event('change'));   // 連點第二下
  await tick(win, 8);

  const dailyCalls = sb.__calls.rpc.filter((c) => c.name === 'site_usage_daily');
  t.eq('去抓了一次整年的資料', dailyCalls.length, 1);
  t.eq('抓 400 天（site_usage_daily 的上限）', dailyCalls[0].params, { p_days: 400 });
  t.ok('月份下拉收起來', $('#momMonthWrap').classList.contains('hidden'));
  t.ok('年份下拉出現', !$('#momYearWrap').classList.contains('hidden'));
  t.ok('年份選得到今年', $$('#momYear option').some((o) => o.value === nowY),
    $$('#momYear option').map((o) => o.value).join(','));

  const card = $('#boardMoM').textContent.replace(/\s+/g, ' ');
  t.ok('卡片標題是「年」', new RegExp(`${nowY} 年`).test(card), card.slice(0, 120));
  t.ok('整年的金額是三天加起來，不是只有視窗內那一天',
    /98,819/.test(card), card.slice(0, 160));
  t.ok('上一年不在資料範圍內就講明，不要憑空生一個 ▲100%',
    /上一年不在資料範圍內/.test(card), card.slice(0, 200));
  t.ok('所以也不會出現漲跌標籤', !/▲|▼/.test(card), card.slice(0, 200));

  const chart = $('#boardMonthChart').textContent.replace(/\s+/g, ' ');
  t.ok('圖表換成一個月一個點', /年每個月的/.test(chart), chart.slice(0, 100));
  const points = $$('#boardMonthChart tbody tr').map((r) => r.cells[0].textContent.trim());
  t.eq('1 月到這個月，不畫還沒發生的月份', points,
    Array.from({ length: new Date().getMonth() + 1 }, (_, i) => `${i + 1}月`));

  // 切回月份：卡片要變回「跟上個月比」，圖表變回一天一個點
  $('#momUnit').value = 'month';
  $('#momUnit').dispatchEvent(new win.Event('change'));
  await tick(win, 4);
  t.ok('切回去就收起年份', $('#momYearWrap').classList.contains('hidden'));
  t.ok('卡片講的又是月份', /跟上個月比|都還沒有成功使用/.test($('#boardMoM').textContent),
    $('#boardMoM').textContent.replace(/\s+/g, ' ').slice(0, 120));
  t.eq('切回月份不會再打一次 API',
    sb.__calls.rpc.filter((c) => c.name === 'site_usage_daily').length, 1);

  // 再切回年份：資料已經在手上，不用再抓
  $('#momUnit').value = 'year';
  $('#momUnit').dispatchEvent(new win.Event('change'));
  await tick(win, 4);
  t.eq('第二次切到年份也不用再抓',
    sb.__calls.rpc.filter((c) => c.name === 'site_usage_daily').length, 1);

  t.ok('年份那份刻意不放進邊緣快取共用（註解講明原因）',
    /刻意不放進邊緣快取那包共用/.test(index));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
