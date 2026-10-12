/* 嵐的三件事（01:26–01:28）

   1.「有人回覆重複的優惠，我要可以一鍵全部合併」
      —— 回報內容裡的 #編號（認不出來時退回用店名找）→ 一顆按鈕把它們併成一張，
         順手把那則回報標成已完成。兩則以上還能一次全部併。
   2.「要可以自訂移動排行榜那頁各個 block 的順序，固定」
   3.「我的頁也是」
      —— 上下箭頭排序，記在這台裝置上；夾在中間不能搬的東西要留在原地。 */
const { boot, tick, makeSb, makeAsserts, stubHeavy } = require('./harness');

const offer = (id, brand, reportCount = 0) => ({
  id, brand, category: '餐廳', regions: ['全台'], offer: `${brand} 生日優惠`,
  membership_type: 'app', free_tier: 'free_min', timing: '當月', sources: [],
  status: 'approved', reportCount, commentCount: 0, wishCount: 0,
});
const fb = (id, message, extra = {}) => ({
  id, type: 'duplicate', message, status: 'open', created_at: '2026-10-06T13:00:00Z',
  display_name: '嵐', account_email: 'lan@example.com', page: '/', ...extra,
});

(async () => {
  const t = makeAsserts('t33 一鍵合併重複、自訂區塊順序');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];

  /* ================= 1. 認出要併哪幾筆 ================= */
  win.eval(`OFFERS = ${JSON.stringify([
    offer(372, '武藏野森珈琲Diner', 12), offer(515, '武藏野森', 3), offer(516, '武藏野森珈琲', 1),
    offer(517, 'DON DON DONKI', 2), offer(600, '唐吉訶德', 9), offer(700, '麥當勞', 50),
  ])};`);

  const dup = (m) => win.dupTargets(m);
  let d = dup('#515 武藏野森 這筆跟別筆重複：#372 武藏野森珈琲Diner #516 武藏野森珈琲');
  t.ok('三個編號都認出來', d.ok && d.found.length === 3);
  t.eq('保留回報次數最多的那張', d.keep.id, 372);
  t.eq('其餘兩張併進去', d.drops.map((o) => o.id).sort(), [515, 516]);

  // 沒附編號、只寫店名的那種
  d = dup('#517 DON DON DONKI 這筆跟別筆重複：唐吉訶德');
  t.ok('只寫店名也查得到', d.ok, JSON.stringify(d.found.map((o) => o.id)));
  t.eq('店名查到的那張一起算進來', d.found.map((o) => o.id).sort(), [517, 600]);
  t.eq('一樣是回報多的留下', d.keep.id, 600);

  // 已經被併掉／刪掉的編號
  d = dup('#700 麥當勞 這筆跟別筆重複：#999 已經不在了');
  t.ok('湊不到兩張就不給合併', !d.ok);
  t.eq('講得出哪個編號已經不在站上', d.missing, [999]);

  d = dup('這兩家一樣');
  t.ok('什麼都認不出來也不會爆掉', !d.ok && d.found.length === 0);

  // 回報次數一樣時留編號小的（先投的那張）
  win.eval('OFFERS = [{id:9, brand:"甲", reportCount:4, regions:[], sources:[]}, {id:3, brand:"乙", reportCount:4, regions:[], sources:[]}];');
  t.eq('次數一樣時留先投的那張', dup('#9 甲 重複：#3 乙').keep.id, 3);

  /* ================= 2. 一鍵合併（單則 ＋ 整批）================= */
  win.eval(`OFFERS = ${JSON.stringify([
    offer(372, '武藏野森珈琲Diner', 12), offer(515, '武藏野森', 3), offer(516, '武藏野森珈琲', 1),
    offer(41, '再睡5分鐘', 8), offer(391, '再睡五分鐘', 2),
    offer(700, '麥當勞', 50),
  ])};`);
  const rows = [
    fb(1, '#515 武藏野森 這筆跟別筆重複：#372 武藏野森珈琲Diner #516 武藏野森珈琲'),
    fb(2, '#41 再睡5分鐘 這筆跟別筆重複：#391 再睡五分鐘'),
    fb(3, '#700 麥當勞 這筆跟別筆重複：#999 不見了'),
    fb(4, '搜尋壞掉了', { type: 'bug' }),
  ];
  const sb = makeSb({
    rpcs: {
      admin_list_feedback: () => rows,
      admin_merge_offers: () => ({ reports: 5, comments: 2, ratings: 1, wishlist: 3 }),
      admin_resolve_feedback: () => ({ data: null, error: null }),
    },
  });
  win.__sb = sb;
  win.eval('sb = window.__sb; LIVE = true; me = {id:"u-1"}; myProfile = {id:"u-1", is_admin:true};');
  stubHeavy(win, ['loadOffers', 'render']);
  win.confirm = () => true;
  await win.loadFeedbackList();
  await tick(win, 3);

  const mergeBtns = $$('#fbList .fb-merge');
  t.eq('認得出來的兩則才有合併鈕', mergeBtns.length, 2);
  t.ok('按鈕寫得出要併幾筆', /一鍵合併這 3 筆/.test(mergeBtns[0].textContent), mergeBtns[0].textContent);
  t.ok('按下去之前先寫清楚會變成什麼樣子',
    /#372 武藏野森珈琲Diner.*#515.*#516/.test($('#fbList .fb-plan').textContent),
    $('#fbList .fb-plan').textContent.replace(/\s+/g, ' '));
  t.ok('認不出來的那則說明原因', [...doc.querySelectorAll('#fbList .fb-plan')]
    .some((e) => /認不出要併哪兩筆/.test(e.textContent) && /#999/.test(e.textContent)));
  t.ok('問題回報不會長出合併鈕', $$('#fbList .rep').length === 4 && mergeBtns.length === 2);

  // 整批那一條
  const bar = $('#fbBulkBar');
  t.ok('兩則以上才出現「全部合併」', !bar.classList.contains('hidden'));
  t.ok('寫著有幾則', /一鍵合併全部（2 則）/.test(bar.textContent), bar.textContent.replace(/\s+/g, ' '));

  // 先按單則的
  mergeBtns[0].click();
  await tick(win, 5);
  let merges = sb.__calls.rpc.filter((c) => c.name === 'admin_merge_offers');
  t.eq('兩張都併進保留的那張', merges.length, 2);
  t.eq('保留的一直是同一張', [...new Set(merges.map((c) => c.params.p_keep))], [372]);
  t.eq('被併掉的是另外兩張', merges.map((c) => c.params.p_drop).sort(), [515, 516]);
  const resolved = sb.__calls.rpc.filter((c) => c.name === 'admin_resolve_feedback');
  t.eq('那則回報順手標成已完成', resolved.length, 1);
  t.eq('標的是這一則', resolved[0].params.p_id, 1);
  t.ok('回覆寫得出併到哪一張', /#372/.test(resolved[0].params.p_reply), resolved[0].params.p_reply);
  t.ok('合併完有結果訊息', /已合併/.test($('#fbMsg2').textContent), $('#fbMsg2').textContent);

  // 再按整批的
  await win.loadFeedbackList();
  await tick(win, 3);
  sb.__calls.rpc.length = 0;
  $('#btnFbMergeAll').click();
  await tick(win, 8);
  merges = sb.__calls.rpc.filter((c) => c.name === 'admin_merge_offers');
  t.eq('整批會把兩則各自的都併完', merges.length, 3);          // 2 + 1
  t.eq('兩則回報都標成已完成',
    sb.__calls.rpc.filter((c) => c.name === 'admin_resolve_feedback').map((c) => c.params.p_id).sort(), [1, 2]);

  // 合併失敗要講清楚、不要假裝成功
  await win.loadFeedbackList();
  await tick(win, 3);
  const realRpc = sb.rpc;
  sb.rpc = (name, params) => (name === 'admin_merge_offers'
    ? Promise.resolve({ data: null, error: { message: 'function public.admin_merge_offers does not exist' } })
    : realRpc(name, params));
  $('#fbList .fb-merge').click();
  await tick(win, 5);
  t.ok('失敗時講得出要跑哪支 SQL', /schema_v70/.test($('#fbMsg2').textContent), $('#fbMsg2').textContent);
  t.ok('失敗後按鈕放回去讓人再試', !$('#fbList .fb-merge').disabled);
  sb.rpc = realRpc;

  /* ================= 3. 自訂區塊順序 =================
     嵐：「調整區塊順序的按鈕太底下了，我希望變成左上角的懸浮按鈕，或是統一
     移到我的那邊可以當成設定」。選了後者：兩頁的順序都在「我的」的「版面設定」
     裡調，排行榜那頁不再掛任何排序列，也沒有「進入排序模式」這回事。 */
  t.ok('排序的入口收在「我的」的版面設定裡', !!$('#layoutPanel') && !!$('#layoutPanel').closest('#tab-mine'));
  t.ok('排行榜那頁不再掛排序列', !$('#tab-board .order-bar'));
  t.ok('「我的」那頁也沒有', !$('#tab-mine .order-bar'));
  t.ok('兩頁都排得到', [...$('#layoutPage').options].map((o) => o.value).sort().join(',') === 'board,mine');

  for (const page of ['board', 'mine']) {
    const ids = () => win.eval(`blkList(${JSON.stringify(page)}).map(el=>el.id)`);
    $('#layoutPage').value = page;
    $('#layoutPage').dispatchEvent(new win.Event('change'));
    await tick(win, 2);
    const before = ids();
    t.ok(`${page}：有好幾塊可以排`, before.length >= 5, String(before.length));

    const movers = $$('#layoutList .blk-move');
    t.eq(`${page}：清單列的就是這一頁的區塊`, movers.map((m) => m.dataset.id), before);
    t.ok(`${page}：第一塊不能再往上`, movers[0].querySelector('.blk-up').disabled);
    t.ok(`${page}：最後一塊不能再往下`, movers[movers.length - 1].querySelector('.blk-down').disabled);
    t.ok(`${page}：每條都寫著是哪一塊`, movers.every((m) => m.querySelector('.blk-name').textContent.trim().length > 0));

    // 把第一塊往下移——不用先切到那一頁
    movers[0].querySelector('.blk-down').click();
    await tick(win, 2);
    const after = ids();
    t.eq(`${page}：真的換了位置`, [after[0], after[1]], [before[1], before[0]]);
    t.eq(`${page}：其他塊沒被動到`, after.slice(2), before.slice(2));
    const saved = JSON.parse(win.localStorage.getItem(page === 'board' ? 'sxr_order_board' : 'sxr_order_mine'));
    t.eq(`${page}：順序存起來了`, saved, after);
    t.eq(`${page}：清單也跟著更新`, $$('#layoutList .blk-move').map((m) => m.dataset.id), after);
  }

  // 下次打開網頁要照存的順序排
  const savedBoard = JSON.parse(win.localStorage.getItem('sxr_order_board'));
  const { win: win2 } = await boot();
  win2.localStorage.setItem('sxr_order_board', JSON.stringify(savedBoard));
  win2.eval('applyBlockOrder("board")');
  t.eq('重新打開還是上次排好的順序', win2.eval('blkList("board").map(el=>el.id)'), savedBoard);

  // 以後新增的區塊不會被丟到最後面
  t.eq('沒存過的新區塊留在原本的鄰居後面',
    win2.eval(`blkDesired(
      ['a','NEW','b','c'].map(id=>{const e=document.createElement('div'); e.id=id; return e;}),
      ['c','b','a']).map(e=>e.id)`),
    ['c', 'b', 'a', 'NEW']);

  // 回復預設
  win2.confirm = () => true;
  const def = win2.eval('BLK_DEFAULT.board.slice()');
  win2.document.querySelector('#layoutPage').value = 'board';
  win2.document.querySelector('#btnLayoutReset').click();
  t.eq('回復預設真的排回原本的順序', win2.eval('blkList("board").map(el=>el.id)'), def);
  t.eq('存檔也清掉了', win2.localStorage.getItem('sxr_order_board'), null);

  /* 夾在區塊之間、不能搬的東西要留在原地。「登入解鎖」卡片就卡在第一塊跟第二塊中間——
     第一版是拿兩個區塊直接互換，它會被擠著一路往上飄到最前面。 */
  const kidsOf = (w) => w.eval('[...document.querySelector("#tab-mine .wrap").children].map(el=>el.id||"-")');
  const { win: win3 } = await boot();
  const pristine = kidsOf(win3).indexOf('mineLoginCta');
  const blocks3 = () => win3.eval('blkList("mine").map(el=>el.id)');
  const first = blocks3()[0];
  for (let i = 0; i < 6; i += 1) win3.eval(`moveBlock("mine", blkList("mine")[${5 - i}], -1)`);
  t.ok('搬了好幾次之後第一塊換人了', blocks3()[0] !== first, blocks3()[0]);
  t.eq('「登入解鎖」卡片還在它原本的位置', kidsOf(win3).indexOf('mineLoginCta'), pristine);
  t.ok('不能搬的東西沒有變少',
    kidsOf(win3).filter((id) => id === 'mineA2hsBanner' || id === 'mineLoginCta' || id === 'myDebug').length === 3);

  // 會員專屬區塊：拆出外層 div 之後還是要跟著登入狀態一起切
  win2.eval('me = null; paintAuth();');
  const authed = [...win2.document.querySelectorAll('.authed-only')];
  t.eq('會員專屬區塊都掛上標記了', authed.length, 5);
  t.ok('沒登入時整組收起來', authed.every((el) => el.classList.contains('authed-off')));
  win2.eval('me = {id:"u-1"}; myProfile = {id:"u-1"}; paintAuth();');
  t.ok('登入後整組回來', authed.every((el) => !el.classList.contains('authed-off')));
  t.ok('徽章那塊自己的 hidden 沒被蓋掉——還沒拿到徽章就該繼續藏著',
    win2.document.querySelector('#badgesPanel').classList.contains('hidden'));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
