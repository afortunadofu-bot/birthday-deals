/* 圖表形式（celine：「統計圖表形式都過於單一，每一份數據找到最適合的方式呈現」）

   驗每一份數據用的是對的形式：
   - 使用時段／星期幾／近 6 個月／生日月份 → 直條（照時間順序），要突顯的那一根用主色
   - 優惠類型／會員取得方式／單選題 → 100% 堆疊條，顏色跟著項目走（不是照名次）
   - 各類別使用狀況／複選題 → 橫條
   - NPS、「跟自己查比」→ 分歧條（負向在左、正向在右）
   - 1–5 分平均 → 刻度上的點（不是從 0 開始的長條）
   - 喜歡 vs 最常用 → 同一張分組橫條
   - 轉化率、回訪率 → 量表
   - 折線圖：一條線有淡色面積＋最高點標示；十字線是實線；刻度是整數
   - 每張圖都有「看數字」表格；滑過有數字 */
const { boot, tick, makeSb, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t12 圖表形式');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  const offers = win.eval('OFFERS');
  const pick = (pred) => offers.find(pred);
  const a = pick((o) => o.freeTier === 'free_no_min') || offers[0];
  const b = pick((o) => o.freeTier === 'discount') || offers[1];
  const pop = [
    { offer_id: a.id, brand: a.brand, report_count: 10, success_count: 8, saved_total: 1000 },
    { offer_id: b.id, brand: b.brand, report_count: 30, success_count: 20, saved_total: 3000 },
  ];

  /* ---- 站台數據：累積省下當主角、成功率有量表 ---- */
  win.renderBoardStats([{ saved_total: 100 }], pop, [{ saved_total: 100 }, { saved_total: 300 }], pop, { pageview_count: 9 }, 1);
  t.ok('累積省下放大成主角', /累積省下/.test($('#boardStats .hero').textContent));
  t.ok('成功率有量表', !!$('#boardStats .vm-track .vm-fill'));
  // 嵐：優惠頁跟站台數據的「大家累積省下」要一樣——兩邊都用 site_stats
  win.renderBoardStats([{ saved_total: 100 }], pop, [{ saved_total: 100 }], pop,
    { pageview_count: 9, saved_total: 123456, report_count: 789 }, 1);
  t.ok('站台數據的累積省下用 site_stats', /123,456/.test($('#boardStats .hero').textContent), $('#boardStats .hero').textContent);
  t.ok('總回報次數也用 site_stats', /789\s*總回報次數/.test($('#boardStats').textContent));
  // 成功率不能只拿「成功的回報」來除（會永遠接近 100%）
  win.renderBoardStats([], pop, [], pop, { saved_total: 1, report_count: 4 }, 1,
    [{ result: 'success' }, { result: 'success' }, { result: 'success' }, { result: 'failed' }]);
  t.ok('成功率用所有回報算（3 成功／4 筆＝75%）', /75%\s*成功率（近半年）/.test($('#boardStats').textContent), $('#boardStats').textContent);
  /* 收藏 → 真的去用的轉換率（嵐）。wishlist 的 RLS 是「只看得到自己的」，
     前端配不出來，所以由 v74 的 site_wish_conversion() 在資料庫算好再傳進來。 */
  win.renderBoardStats([], pop, [], pop, { saved_total: 1, report_count: 4 }, 1,
    [{ result: 'success' }], { wished: 640, used: 214, rate: 33 });
  t.ok('有「收藏後真的去用」這張卡', /收藏後真的去用/.test($('#boardStats').textContent));
  t.ok('寫出百分比跟分子分母', /33%/.test($('#boardStats').textContent)
    && /214\s*\/\s*640\s*筆收藏/.test($('#boardStats').textContent), $('#boardStats').textContent);
  win.renderBoardStats([], pop, [], pop, { saved_total: 1, report_count: 4 }, 1,
    [{ result: 'success' }], null);
  t.ok('v74 還沒跑（拿不到資料）時整張卡不出現', !/收藏後真的去用/.test($('#boardStats').textContent));
  win.__sbS = makeSb({ tables: { site_stats: [{ offer_count: 5, saved_total: 123456, report_count: 789 }] } });
  win.eval('sb = window.__sbS; LIVE = true;');
  await win.loadSiteStats();
  t.ok('優惠頁顯示同一個數字、同一個說法', /大家累積省下\s*\$?123,456/.test($('#siteStats').textContent), $('#siteStats').textContent);
  win.eval('LIVE = false;');

  /* ---- 使用時段：24 根直條，只有尖峰用主色 ---- */
  win.renderBoardHoursChart([{ hour: 9, count: 3 }, { hour: 21, count: 12 }, { hour: 22, count: 5 }]);
  const cols = [...doc.querySelectorAll('#boardHoursChart .vcol')];
  t.eq('使用時段是 24 根直條', cols.length, 24);
  t.ok('尖峰那根用主色、其他灰色', !cols[21].querySelector('.mute') && !!cols[9].querySelector('.mute'));
  t.ok('尖峰有標數字', /12 次/.test(cols[21].textContent) && !cols[9].querySelector('.vcol-val'));
  t.ok('滑過看得到時段跟次數', /21:00–22:00/.test(cols[21].dataset.tip) && /12 次/.test(cols[21].dataset.tip));
  t.ok('有「看數字」表格', $('#boardHoursChart details.viz-data table tbody').children.length === 24);

  /* ---- 類型佔比：100% 堆疊條，顏色跟著類型走 ---- */
  win.renderTypeBreakdown(pop);
  const segs = [...doc.querySelectorAll('#boardTypeChart .vstack-seg')];
  t.eq('優惠類型是一條堆疊條', segs.length, new Set([a.freeTier, b.freeTier]).size);
  const colorOf = (label) => [...doc.querySelectorAll('#boardTypeChart .vleg > span')]
    .find((x) => x.textContent.includes(label))?.querySelector('i').style.background;
  const labelA = win.eval('FREE_LABEL')[a.freeTier];
  const before = colorOf(labelA);
  // 名次互換：A 變最多，A 的顏色不能變
  win.renderTypeBreakdown([{ ...pop[0], report_count: 99 }, pop[1]]);
  t.eq('名次改變時顏色不會跳（顏色跟著類型，不跟著名次）', colorOf(labelA), before);
  t.ok('圖例寫出百分比', /\d+%/.test($('#boardTypeChart .vleg').textContent));

  /* ---- 會員取得方式：超過 6 種時小的併成「其他」 ---- */
  const parts = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((l, i) => ({ label: l, value: 10 - i }));
  const html = win.vizStack(parts);
  const box = doc.createElement('div'); box.innerHTML = html;
  t.eq('超過 6 塊時合併成 6 塊', box.querySelectorAll('.vstack-seg').length, 6);
  t.ok('最後一塊是「其他」', /其他/.test(box.querySelector('.vleg').lastElementChild.textContent));

  /* ---- 星期幾：週一到週日，最多的那天用主色 ---- */
  const today = new Date();
  const iso = (d) => win.eval(`ISO(new Date(${d.getTime()}))`);
  const rows = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today.getTime() - i * 864e5);
    const n = d.getDay() === 3 ? 5 : 1;
    for (let k = 0; k < n; k++) rows.push({ used_on: iso(d), result: 'success', saved_twd: 100 });
  }
  win.renderWeekdayBreakdown(rows);
  const wcols = [...doc.querySelectorAll('#boardWeekdayChart .vcol')];
  t.eq('星期是 7 根直條', wcols.length, 7);
  t.eq('從週一排到週日', [...doc.querySelectorAll('#boardWeekdayChart .vcols-x span')].map((x) => x.textContent).join(''), '一二三四五六日');
  t.ok('最多的週三用主色', !wcols[2].querySelector('.mute') && !!wcols[0].querySelector('.mute'));

  /* ---- 近 6 個月：直條照時間，這個月標進行中 ---- */
  win.renderMonthlyBreakdown(rows);
  const mcols = [...doc.querySelectorAll('#boardMonthlyChart .vcol')];
  t.eq('近 6 個月是 6 根直條', mcols.length, 6);
  t.ok('這個月是淡色（還沒結束）', !!mcols[5].querySelector('.soft') && /進行中/.test(mcols[5].dataset.tip));

  /* ---- 各類別：橫條 ---- */
  win.renderCategoryBreakdown(pop);
  t.ok('各類別使用狀況是橫條', doc.querySelectorAll('#boardCatChart .vbar').length >= 1);

  /* ---- 折線圖：面積、最高點、實線十字線、整數刻度 ---- */
  const line = win.svgLineChart(
    [{ date: '9/1', v: 3 }, { date: '9/2', v: 15 }, { date: '9/3', v: 4 }],
    [{ key: 'v', label: '次數', color: 'var(--viz-1)' }], { title: 'x' }, []);
  const lb = doc.createElement('div'); lb.innerHTML = line;
  t.ok('一條線時有淡色面積', /fill-opacity:\.1/.test(lb.querySelector('path').getAttribute('style')));
  t.ok('標出最高點', /最高 15/.test(lb.textContent));
  t.ok('十字線不是虛線', !lb.querySelector('.tip-line').hasAttribute('stroke-dasharray'));
  t.ok('刻度沒有 7.5 這種小數', ![...lb.querySelectorAll('text')].some((x) => /^\d+\.\d+$/.test(x.textContent)));
  t.ok('折線圖也有「看數字」', !!lb.querySelector('details.viz-data'));
  const two = doc.createElement('div');
  two.innerHTML = win.svgLineChart([{ date: '9/1', a: 1, b: 2 }], [{ key: 'a', label: 'A', color: 'red' }, { key: 'b', label: 'B', color: 'blue' }], {}, []);
  t.ok('兩條線有圖例、沒有面積', /A/.test(two.textContent) && /B/.test(two.textContent) && !two.querySelector('path'));

  /* ---- 問卷：NPS 分歧條、1–5 分用點、喜歡 vs 常用同一張、跟自己查比用分歧條 ---- */
  const sb = makeSb({});
  win.__sb = sb; win.eval('sb = window.__sb; LIVE = true; myProfile = {id:"a", is_admin:true};');
  win.renderSurveySummary({
    total: 10, members: 6, guests: 4, overall_avg: 4.3, promoters: 5, passives: 3, detractors: 2,
    find_avg: 4.1, accuracy_avg: 2.5, mobile_avg: null, look_avg: 4.0,
    liked: { browse: 8, map: 2 }, used: { browse: 9, report: 3 },
    source: { threads: 6, unknown: 1 },
    extra: { visit_freq: { bday_weekly: 3, birthday_month: 2, weekly: 1 }, vs_self: { much: 5, bit: 2, same: 2, slower: 1 }, problems: { none: 4, slow: 2 }, age: { '25_34': 5, secret: 1 } },
    recent_comments: [],
  }, '近 30 天');
  const sv = $('#svBody');
  const nps = [...sv.querySelectorAll('.viz')].find((x) => /NPS/.test(x.querySelector('b').textContent));
  t.ok('NPS 是分歧條', !!nps.querySelector('.vdiv .vdiv-axis') && nps.querySelectorAll('.vdiv-seg').length === 3);
  const left = (lab) => [...nps.querySelectorAll('.vdiv-seg')].find((x) => x.dataset.tip.startsWith(lab));
  t.ok('批評者在中線左邊、推薦者在右邊',
    parseFloat(left('批評者').style.left.replace('calc(', '')) < 50 && parseFloat(left('推薦者').style.left.replace('calc(', '')) >= 50);
  t.eq('1–5 分平均用刻度上的點（沒有分數的面向不畫）', sv.querySelectorAll('.vdot').length, 3);
  const dot = [...sv.querySelectorAll('.vdot')].find((x) => /資訊正確/.test(x.textContent));
  t.eq('2.5 分畫在 1–5 刻度的 37.5% 位置', dot.querySelector('.vdot-mark').style.left, '37.5%');
  const feat = [...sv.querySelectorAll('.viz')].find((x) => /喜歡的功能 vs 最常用的功能/.test(x.textContent));
  t.ok('喜歡 vs 常用在同一張分組橫條', !!feat && feat.querySelectorAll('.vbar.grp').length === 3 && feat.querySelectorAll('.vleg > span').length === 2);
  const vs = [...sv.querySelectorAll('.viz')].find((x) => /變快嗎/.test(x.textContent));
  t.ok('「跟自己查比」是分歧條（慢在左、快在右）', !!vs.querySelector('.vdiv') && /比較慢/.test(vs.querySelector('.vdiv-ends').firstElementChild.textContent));
  const prob = [...sv.querySelectorAll('.viz')].find((x) => /遇過哪些問題/.test(x.textContent));
  const noneBar = [...prob.querySelectorAll('.vbar')].find((x) => /都沒有/.test(x.textContent));
  t.ok('「都沒有」是灰色，跟真正的問題分開', /viz-muted/.test(noneBar.querySelector('.vbar-fill').getAttribute('style')));
  // 嵐：「多久來一次」結果出現英文代號（題目改版前的舊答案）
  const freq = [...sv.querySelectorAll('.viz')].find((x) => /多久會來一次/.test(x.textContent));
  t.ok('舊版答案翻成中文、標「舊版選項」', /生日月才來（舊版選項）/.test(freq.textContent) && /每週（舊版選項）/.test(freq.textContent), freq.textContent);
  t.ok('結果裡沒有英文代號', !/birthday_month|weekly/.test(freq.textContent));
  const age = [...sv.querySelectorAll('.viz')].find((x) => /年紀/.test(x.textContent));
  t.ok('年紀是直條', age.querySelectorAll('.vcol').length === 6);
  const src = [...sv.querySelectorAll('.viz')].find((x) => /怎麼知道壽星日/.test(x.textContent));
  t.ok('怎麼知道壽星日是堆疊條', !!src.querySelector('.vstack'));
  t.ok('問卷每張圖都有「看數字」', [...sv.querySelectorAll('.viz')].every((x) => x.querySelector('details.viz-data')));

  /* ---- 管理員：轉化率、回訪率是量表；生日月份是 12 根直條 ---- */
  const box2 = doc.createElement('div'); box2.id = 'dashVisits'; doc.body.appendChild(box2);
  const sbD = makeSb({ rpcs: {
    admin_dashboard_stats: { data: { pageviews_range: 100, visitors_range: 50, new_users_range: 5, active_users_range: 10, use_reports_range: 4, total_users: 40 }, error: null },
    admin_dashboard_series: { data: [{ date: '9/1', pageviews: 1, visitors: 1, new_users: 0, use_reports: 0, submitted: 0, reviewed: 0 }], error: null },
    admin_birthday_distribution: { data: [{ month: 1, count: 3 }, { month: 9, count: 8 }], error: null },
    admin_usage_hour_distribution: { data: [{ hour: 20, count: 4 }], error: null },
    admin_online_now: { data: 2, error: null },
    admin_visit_stats: { data: { active_members: 10, avg_visits_per_member: 2, returning_rate: 0.5 }, error: null },
  } });
  win.__sb = sbD; win.eval('sb = window.__sb;');
  await win.loadAdminDashboard(14);
  await tick(win, 5);
  const dash = $('#dashBody');
  t.ok('轉化率是量表', [...dash.querySelectorAll('.vmeter')].some((m) => /訪客→新會員/.test(m.textContent) && m.querySelector('.vm-fill').style.width === '10%'));
  const bm = [...dash.querySelectorAll('.viz')].find((x) => /生日月份/.test(x.textContent));
  t.eq('生日月份是 12 根直條', bm.querySelectorAll('.vcol').length, 12);
  t.ok('回訪率是量表', [...doc.querySelectorAll('#dashVisits .vmeter')].some((m) => /回訪率/.test(m.textContent)));

  /* ---- 嵐：站台數據、洞察分析分成小分頁，一次只看一塊 ---- */
  const bar = $('.subtabs[data-group="boardInsights"]');
  const panes = () => [...doc.querySelectorAll('#biMonth, #biTrend, #biType, #biWeek')].filter((p) => !p.classList.contains('hidden')).map((p) => p.id);
  t.eq('洞察分析一次只顯示一塊', panes().length, 1);
  bar.querySelector('[data-pane="biWeek"]').click();
  t.eq('點「星期」就只顯示星期那塊', panes(), ['biWeek']);
  t.eq('分頁按鈕標出目前選的', bar.querySelector('[aria-selected="true"]').dataset.pane, 'biWeek');
  t.eq('記住上次看的分頁', win.localStorage.getItem('sxr_subtab_boardInsights'), 'biWeek');
  t.ok('站台數據也分成小分頁', doc.querySelectorAll('.subtabs[data-group="boardStats"] .subtab').length === 3
    && [...doc.querySelectorAll('#bsOverview, #bsHours, #bsCat')].filter((p) => !p.classList.contains('hidden')).length === 1);

  /* ---- 滑過看數字 ---- */
  const tip = doc.querySelector('.viz-tip');
  cols[21].dispatchEvent(new win.MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }));
  t.ok('滑過直條會出現數字', !tip.classList.contains('hidden') && /12 次/.test(tip.textContent), tip.textContent);
  doc.body.dispatchEvent(new win.MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }));
  t.ok('移開就收起來', tip.classList.contains('hidden'));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
