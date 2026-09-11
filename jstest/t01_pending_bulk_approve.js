/* 待審佇列「一鍵全選批次核可」（嵐回饋：待審核清單也要一鍵審核全選）

   重點不是「有沒有送出」，而是「有沒有照每一列自己的狀態送」——管理員通常是
   先一列一列把『已查證』勾好、備註打好，最後才一次核可。如果批次核可一律
   送未查證／空備註，就等於把前面個別填好的東西洗掉，這是這個功能最容易寫錯
   的地方，所以測試把兩列刻意設成不同的 verified/note 再比對。 */
const { boot, tick, makeSb, makeAsserts, stubHeavy } = require('./harness');

const row = (id, brand, extra = {}) => ({
  id, brand, category: '速食', regions: ['台北市'], offer: `${brand} 生日送一份`,
  membership: '', membership_type: 'app', membership_cost: 'free', free_tier: 'free_min',
  advance_days: 3, advance_note: '', timing: '當月', value_twd: 120,
  conditions: '需出示證件', validity: '', validity_type: 'rolling',
  sources: [{ tierLabel: '官網', url: 'https://example.com/a' }],
  status: 'pending', submitted_by: 'u-1', created_at: '2026-09-01T00:00:00Z',
  ...extra,
});

(async () => {
  const t = makeAsserts('t01 待審佇列批次核可');
  const { win } = await boot();
  const doc = win.document;

  const sb = makeSb({
    tables: {
      offers: [row(101, '早餐店'), row(102, '拉麵店', { submitted_by: 'u-2' })],
      profiles_public: [{ id: 'u-1', display_name: '小明' }, { id: 'u-2', display_name: '小華' }],
    },
    rpcs: { review_offer: () => ({ data: null, error: null }) },
  });

  win.__sb = sb;
  win.eval('sb = window.__sb; LIVE = true; myProfile = {id:"admin-1", is_admin:true};');

  await win.loadPending();
  await tick(win);

  // ---- 渲染 ----
  const checks = [...doc.querySelectorAll('.pend-check')];
  t.eq('兩筆待審各有一個勾選框', checks.length, 2);
  t.eq('勾選框 data-id 對應待審 id', checks.map((c) => c.dataset.id), ['101', '102']);
  t.ok('有待審時批次工具列顯示出來', !doc.querySelector('#pendBulkBar').classList.contains('hidden'));
  t.eq('初始按鈕文字帶已選筆數', doc.querySelector('#pendBulkApprove').textContent,
    '核可已勾選（已選 0 筆）');
  t.ok('沒勾任何一筆時按鈕是 disabled', doc.querySelector('#pendBulkApprove').disabled);

  // ---- 每列各自填「已查證」跟「審核備註」，兩列刻意不一樣 ----
  doc.querySelector('.cv[data-id="101"]').checked = true;
  doc.querySelector('.rn[data-id="101"]').value = '官網已確認';
  doc.querySelector('.cv[data-id="102"]').checked = false;
  doc.querySelector('.rn[data-id="102"]').value = '';

  // ---- 全選 ----
  const all = doc.querySelector('#pendSelectAll');
  all.checked = true;
  all.dispatchEvent(new win.Event('change'));
  await tick(win, 1);
  t.ok('全選把每一列都勾起來', checks.every((c) => c.checked));
  t.eq('全選後按鈕文字更新筆數', doc.querySelector('#pendBulkApprove').textContent,
    '核可已勾選（已選 2 筆）');
  t.ok('有勾選後按鈕可按', !doc.querySelector('#pendBulkApprove').disabled);

  // ---- 取消其中一列，全選框要自己跳回未勾滿 ----
  checks[1].checked = false;
  checks[1].dispatchEvent(new win.Event('change'));
  await tick(win, 1);
  t.ok('取消一列後全選框不再是勾的', all.checked === false);
  t.eq('筆數跟著減少', doc.querySelector('#pendBulkApprove').textContent, '核可已勾選（已選 1 筆）');

  // 再勾回來，準備做真正的批次核可
  checks[1].checked = true;
  checks[1].dispatchEvent(new win.Event('change'));
  await tick(win, 1);

  // ---- 批次核可 ----
  // 這幾支會連鎖重畫整頁，換成空殼，順便驗「核可完有沒有重新整理清單」
  const hits = stubHeavy(win);
  win.__scrollCalls.length = 0;
  win.__confirmAnswer = true;

  doc.querySelector('#pendBulkApprove').click();
  await tick(win, 6);

  t.eq('送出前有跳確認', win.__confirms.length, 1);
  t.ok('確認文字有寫幾筆', /2 筆/.test(win.__confirms[0] || ''), win.__confirms[0]);

  const rpc = sb.__calls.rpc.filter((c) => c.name === 'review_offer');
  t.eq('送出兩次 review_offer', rpc.length, 2);
  t.eq('第一筆帶對 id/狀態/已查證/備註', rpc[0].params,
    { p_offer_id: 101, p_status: 'approved', p_verified: true, p_note: '官網已確認' });
  t.eq('第二筆沿用自己那列的未查證＋空備註', rpc[1].params,
    { p_offer_id: 102, p_status: 'approved', p_verified: false, p_note: '' });

  t.ok('成功訊息寫出核可筆數',
    /已核可 2 筆/.test(doc.querySelector('#pendMsg').textContent),
    doc.querySelector('#pendMsg').textContent.trim());
  t.ok('有重新載入待審清單', hits.loadPending >= 1, hits.loadPending);
  t.ok('重畫後有把捲動位置設回去（withScrollRestore）', win.__scrollCalls.length >= 1);

  // ---- 守門：非管理員一律不送 ----
  // 批次核可等於一次把好幾筆推上公開頁，前端守門壞掉的話，就只剩 RPC 那一層
  // 擋得住（會擋，但那是最後一道）。這裡直接呼叫 bulkApproveOffers 驗前端這道。
  const sb2 = makeSb({
    tables: { offers: [row(201, '咖啡店')], profiles_public: [{ id: 'u-1', display_name: '小明' }] },
    rpcs: { review_offer: () => ({ data: null, error: null }) },
  });
  win.__sb = sb2;
  win.eval('sb = window.__sb; myProfile = {id:"u-9", is_admin:false};');
  await win.bulkApproveOffers(['201']);
  await tick(win, 2);
  t.eq('非管理員呼叫 bulkApproveOffers 完全不送 RPC',
    sb2.__calls.rpc.filter((c) => c.name === 'review_offer').length, 0);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
