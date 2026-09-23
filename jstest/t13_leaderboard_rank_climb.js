/* 排行榜：你是第幾名、進步最多（嵐）

   - 「所有排行榜都要讓使用者知道自己是第幾名」：省錢、貢獻度排行榜上方顯示「你目前排第 N 名（共 M 人）」，
     名次用 my_board_rank()（v67）在資料庫算——名次在前 50 名以外也看得到；v67 還沒跑時退回在名單裡找自己；
     還沒上榜的講怎麼上榜
   - 「排行榜都多一個選項，可以篩選最近前進名次最多的店家跟人」：大家都在用什麼、最多人收藏、省錢、
     貢獻度四個榜都能切「進步最多」，只留名次往前的、照進步幅度排，NEW 當作從榜外衝上來 */
const { boot, tick, makeSb, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t13 排行榜名次＋進步最多');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const offers = win.eval('OFFERS');

  /* ---- 進步最多的計算 ---- */
  const climb = win.rankClimbRows([
    { rank: 1, prevRank: 1 }, { rank: 2, prevRank: 5 }, { rank: 3, prevRank: null }, { rank: 4, prevRank: 2 }, { rank: 5, prevRank: 9 },
  ]);
  t.eq('只留往前進的，照進步幅度排（NEW 當作從榜外衝上來）', climb.map((r) => [r.rank, r.climb]), [[3, 7], [5, 4], [2, 3]]);
  t.ok('名次數字維持原本的名次（不重編）', climb[0].rank === 3);

  /* ---- 大家都在用什麼 ---- */
  win.eval(`POP_ROWS = [
    {offer_id:${JSON.stringify(offers[0].id)}, brand:'A店', timing:'當月', success_count:5, report_count:6, saved_total:100, rank:1, prevRank:1},
    {offer_id:${JSON.stringify(offers[1].id)}, brand:'B店', timing:'當月', success_count:3, report_count:4, saved_total:90, rank:2, prevRank:6},
    {offer_id:${JSON.stringify(offers[2].id)}, brand:'C店', timing:'當月', success_count:2, report_count:2, saved_total:80, rank:3, prevRank:2}];
    POP_HAS_PREV = true;`);
  win.renderPopBody();
  const names = (sel) => [...doc.querySelectorAll(`${sel} tbody tr`)].map((tr) => tr.children[1].textContent.trim().split(/\s/)[0]);
  t.eq('預設照名次', names('#popBody'), ['A店', 'B店', 'C店']);
  $('#popSortBy').value = 'climb'; $('#popSortBy').dispatchEvent(new win.Event('change'));
  t.eq('切「進步最多」只看往前進的店家', names('#popBody'), ['B店']);
  t.ok('名次欄還是原本的第 2 名、標出進步 4 名', /^2/.test($('#popBody tbody tr .rk').textContent) && /▲4/.test($('#popBody tbody tr .rk').textContent));
  win.eval('POP_ROWS = POP_ROWS.map(r=>({...r, prevRank:r.rank}));');
  win.renderPopBody();
  t.ok('沒有人往前進時講清楚', /沒有人（店家）的名次往前進/.test($('#popBody').textContent));

  /* ---- 最近使用最多次（嵐：除了進步最多，也想看最近誰被用最多，時間範圍要能選）---- */
  const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  win.eval(`POP_TREND = [
    // B店：近 7 天 3 次；A店：近 7 天 1 次、30 天內再 4 次；C店：50 天前 5 次
    {offer_id:${JSON.stringify(offers[1].id)}, used_on:'${day(1)}', result:'success', saved_twd:50},
    {offer_id:${JSON.stringify(offers[1].id)}, used_on:'${day(2)}', result:'success', saved_twd:50},
    {offer_id:${JSON.stringify(offers[1].id)}, used_on:'${day(3)}', result:'failed', saved_twd:0},
    {offer_id:${JSON.stringify(offers[0].id)}, used_on:'${day(2)}', result:'success', saved_twd:20},
    {offer_id:${JSON.stringify(offers[0].id)}, used_on:'${day(10)}', result:'success', saved_twd:20},
    {offer_id:${JSON.stringify(offers[0].id)}, used_on:'${day(11)}', result:'success', saved_twd:20},
    {offer_id:${JSON.stringify(offers[0].id)}, used_on:'${day(12)}', result:'success', saved_twd:20},
    {offer_id:${JSON.stringify(offers[0].id)}, used_on:'${day(13)}', result:'success', saved_twd:20},
    {offer_id:${JSON.stringify(offers[2].id)}, used_on:'${day(50)}', result:'success', saved_twd:10},
    {offer_id:${JSON.stringify(offers[2].id)}, used_on:'${day(51)}', result:'success', saved_twd:10},
    {offer_id:${JSON.stringify(offers[2].id)}, used_on:'${day(52)}', result:'success', saved_twd:10},
    {offer_id:${JSON.stringify(offers[2].id)}, used_on:'${day(53)}', result:'success', saved_twd:10},
    {offer_id:${JSON.stringify(offers[2].id)}, used_on:'${day(54)}', result:'success', saved_twd:10}];`);
  t.ok('平常看不到期間選單', $('#popRangeWrap').classList.contains('hidden'));
  $('#popSortBy').value = 'recent'; $('#popSortBy').dispatchEvent(new win.Event('change'));
  t.ok('切「最近使用最多次」才出現期間選單', !$('#popRangeWrap').classList.contains('hidden'));
  t.eq('預設近 30 天：A 店 5 次排第一', names('#popBody'), [offers[0].brand, offers[1].brand]);
  $('#popRange').value = '7'; $('#popRange').dispatchEvent(new win.Event('change'));
  t.eq('改成近 7 天，換 B 店排第一', names('#popBody'), [offers[1].brand, offers[0].brand]);
  t.ok('成功／回報分開算（B 店 3 次裡 2 次成功）',
    [...doc.querySelectorAll('#popBody tbody tr')][0].children[2].textContent.trim() === '2／3',
    [...doc.querySelectorAll('#popBody tbody tr')][0].textContent);
  $('#popRange').value = '90'; $('#popRange').dispatchEvent(new win.Event('change'));
  t.eq('拉到近 90 天，50 天前用很多次的 C 店才進來', names('#popBody').length, 3);
  t.ok('說明文字跟著改成「近 N 天」', /近 90 天/.test($('#popBody').closest('.panel').querySelector('.sub').textContent));
  $('#popRange').value = '7'; $('#popRange').dispatchEvent(new win.Event('change'));
  win.eval('POP_TREND = [];');
  win.renderPopBody();
  t.ok('那段期間沒人用就講清楚', /近 7 天還沒有人回報使用/.test($('#popBody').textContent), $('#popBody').textContent);
  $('#popSortBy').value = 'rank'; $('#popSortBy').dispatchEvent(new win.Event('change'));
  t.ok('切回名次就收起期間選單', $('#popRangeWrap').classList.contains('hidden'));

  /* ---- 最多人收藏 ---- */
  win.renderMostWished([
    { offer_id: offers[0].id, brand: '甲', timing: '當月', wish_count: 9, value_twd: 100, prevRank: null },
    { offer_id: offers[1].id, brand: '乙', timing: '當月', wish_count: 8, value_twd: 100, prevRank: 1 },
  ], true);
  t.eq('收藏榜預設照名次', names('#wishBody'), ['甲', '乙']);
  $('#wishSortBy').value = 'climb'; $('#wishSortBy').dispatchEvent(new win.Event('change'));
  t.eq('收藏榜「進步最多」：NEW 的衝上來、退步的不列', names('#wishBody'), ['甲']);

  /* ---- 省錢排行榜：我的名次用資料庫算 ---- */
  const rpcCalls = [];
  const sb = makeSb({ rpcs: { my_board_rank: (p) => { rpcCalls.push(p); return { data: { rank: 73, total: 210, value: 1234 }, error: null }; } } });
  win.__sb = sb;
  win.eval(`sb = window.__sb; LIVE = true; me = {id:'me-1'}; myProfile = {id:'me-1', display_name:'我', show_on_leaderboard:true};
    LB_MONTHLY = false; LB_WEEKLY = false; LB_HAS_PREV = true;
    LB_ROWS = [
      {rank:1, prevRank:3, display_name:'甲', saved_total:900, success_count:3, brands_used:2, brands:[]},
      {rank:2, prevRank:1, display_name:'乙', saved_total:800, success_count:9, brands_used:2, brands:[]},
      {rank:3, prevRank:null, display_name:'丙', saved_total:700, success_count:1, brands_used:1, brands:[]}];`);
  win.renderLbBody();
  await tick(win, 3);
  t.ok('名次在前 50 名以外也看得到自己排第幾', /第\s*73\s*名/.test($('#myRankBanner').textContent) && /共 210 人/.test($('#myRankBanner').textContent), $('#myRankBanner').textContent);
  t.eq('查的是總累積的省錢榜', rpcCalls[rpcCalls.length - 1], { p_board: 'savings', p_period: 'all', p_key: null });
  $('#lbSortBy').value = 'climb'; $('#lbSortBy').dispatchEvent(new win.Event('change'));
  await tick(win, 2);
  // 甲：第 3 → 第 1（進步 2 名）；丙：新上榜，當作從榜外第 4 名衝到第 3（進步 1 名）；乙退步不列
  t.eq('省錢排行榜「進步最多」', [...doc.querySelectorAll('#lbBody tbody tr.lb-row')].map((tr) => tr.querySelector('.who-name').textContent), ['甲', '丙']);
  $('#lbSortBy').value = 'amount';

  // v67 還沒跑：退回在名單裡找自己；不在名單裡就不顯示
  const sbOld = makeSb({ rpcs: { my_board_rank: { data: null, error: { message: 'function public.my_board_rank does not exist' } } } });
  win.__sb = sbOld; win.eval(`sb = window.__sb; myProfile = {id:'me-1', display_name:'乙', show_on_leaderboard:true};`);
  win.renderLbBody();
  await tick(win, 3);
  t.ok('v67 沒跑時退回用名單找自己', /第\s*2\s*名/.test($('#myRankBanner').textContent), $('#myRankBanner').textContent);

  // 還沒上榜
  win.__sb = makeSb({ rpcs: { my_board_rank: { data: { rank: null, total: 30, value: 0 }, error: null } } });
  win.eval('sb = window.__sb;');
  win.renderLbBody();
  await tick(win, 3);
  t.ok('還沒上榜的講怎麼上榜', /還沒上榜/.test($('#myRankBanner').textContent) && /回報一次成功使用/.test($('#myRankBanner').textContent));

  /* ---- 貢獻度排行榜：我的名次、進步最多 ---- */
  const calls2 = [];
  win.__sb = makeSb({ rpcs: { my_board_rank: (p) => { calls2.push(p); return { data: { rank: 5, total: 40, value: 7 }, error: null }; } } });
  win.eval(`sb = window.__sb; CONTRIB_MONTHLY = true; CONTRIB_WEEKLY = false; CONTRIB_YM = '2026-09'; CONTRIB_HAS_PREV = true;
    CONTRIB_ROWS = [
      {rank:1, prevRank:1, user_id:'a', display_name:'A', submitted_count:5, edit_count:1, total_count:6},
      {rank:2, prevRank:null, user_id:'b', display_name:'B', submitted_count:3, edit_count:0, total_count:3}];`);
  win.renderContribBody();
  await tick(win, 3);
  t.ok('貢獻度排行榜也顯示自己第幾名', /第\s*5\s*名/.test($('#contribMyRank').textContent) && /貢獻 7 次/.test($('#contribMyRank').textContent), $('#contribMyRank').textContent);
  t.eq('查的是這個月的貢獻度榜', calls2[calls2.length - 1], { p_board: 'contrib', p_period: 'month', p_key: '2026-09' });
  $('#contribSortBy').value = 'climb'; $('#contribSortBy').dispatchEvent(new win.Event('change'));
  await tick(win, 2);
  t.eq('貢獻度「進步最多」', [...doc.querySelectorAll('#contribBody tbody tr')].map((tr) => tr.querySelector('.who-name').textContent), ['B']);

  // 沒登入不顯示
  win.eval('me = null;');
  win.renderContribBody();
  await tick(win, 2);
  t.ok('沒登入不顯示自己的名次', $('#contribMyRank').classList.contains('hidden'));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
