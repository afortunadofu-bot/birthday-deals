/* celine 使用上遇到的四個問題：

   1. 手機看使用回報，有補充說明的會「一行一兩個字、拉得很長」
      → 回報列允許換行，說明獨佔一行（驗 CSS 規則＋說明真的是獨立的 .rep-note）
   2. 手機編輯回報，一點開就跳日曆
      → 對話框打開時焦點放在標題，不是日期欄（驗 autofocus 在標題、不在日期欄）
   3. 收藏備註字多顯示不完整 → 改成會長高的 textarea（驗元素型別、長備註完整保留、存檔照舊）
   4. 想幫回報／留言按讚 → v61 兩張表＋按鈕（驗讚數、自己的不能按、按／收回、失敗改回來、
      沒登入提示、還沒跑 v61 時整個功能不出現） */
const { boot, tick, makeSb, makeAsserts } = require('./harness');

const OFFER = {
  id: 7, brand: '早餐店', category: '速食', regions: ['台北市'], offer: '生日送蛋餅',
  membership: '', membershipType: 'app', membershipCost: 'free', freeTier: 'free_min',
  advanceDays: 0, advanceNote: '', timing: '當月', valueTwd: 60, conditions: '',
  validity: '', validityType: 'rolling', sources: [], bestSource: null, status: 'approved',
  reportCount: 2, commentCount: 2, ratingAvg: null, ratingCount: 0, wishCount: 0, transferable: 'unknown',
};
const LONG_NOTE = '店員說要提前三天加會員，我當天去被拒絕，隔天再去才換到。另外要出示身分證，照片要清楚。'.repeat(2);

function detailTables(extra = {}) {
  return {
    comments: [
      { id: 501, body: '超好用', created_at: '2026-09-01T03:00:00Z', is_hidden: false, user_id: 'u-2' },
      { id: 502, body: '我自己的留言', created_at: '2026-09-02T03:00:00Z', is_hidden: false, user_id: 'u-1' },
    ],
    usage_reports: [
      { id: 61, used_on: '2026-09-02', result: 'success', store: '忠孝店', note: LONG_NOTE, saved_twd: 80, user_id: 'u-2', created_at: '2026-09-02T01:00:00Z' },
      { id: 62, used_on: '2026-09-03', result: 'success', store: '', note: '', saved_twd: null, user_id: 'u-1', created_at: '2026-09-03T01:00:00Z' },
    ],
    offer_ratings: [], offer_edit_history: [], offer_edits_pending_preview: [],
    profiles_public: [{ id: 'u-1', display_name: 'celine' }, { id: 'u-2', display_name: '嵐' }],
    report_likes: [{ report_id: 61, user_id: 'u-3' }, { report_id: 61, user_id: 'u-4' }, { report_id: 62, user_id: 'u-2' }],
    comment_likes: [{ comment_id: 501, user_id: 'u-1' }],
    ...extra,
  };
}

(async () => {
  const t = makeAsserts('t08 手機版回報／備註、按讚');
  const { win } = await boot();
  const doc = win.document;
  win.__offer = OFFER;
  win.eval('LIVE = true; me = {id:"u-1"}; myProfile = {id:"u-1", is_admin:false, display_name:"celine"}; OFFERS = [window.__offer];');

  /* ================= 1. 回報說明獨佔一行 ================= */
  const rules = [];
  for (const sh of doc.styleSheets) { try { for (const r of sh.cssRules) if (r.selectorText) rules.push(r); } catch {} }
  const wrap = rules.find((r) => r.selectorText === '.rep.rep-full');
  const noteRule = rules.find((r) => r.selectorText === '.rep-full .rep-note');
  t.eq('回報列允許換行', wrap && wrap.style.getPropertyValue('flex-wrap'), 'wrap');
  t.eq('說明獨佔一整行', noteRule && noteRule.style.getPropertyValue('flex-basis'), '100%');
  t.ok('長說明可以斷行', noteRule && /anywhere/.test(noteRule.style.getPropertyValue('overflow-wrap')));

  const sb = makeSb({ tables: detailTables() });
  win.__sb = sb; win.eval('sb = window.__sb;');
  await win.openDetail(7);
  await tick(win, 6);
  const reps = [...doc.querySelectorAll('#dtlBody .rep.rep-full')];
  t.eq('兩筆回報都是可換行的列', reps.length, 2);
  const note = reps[0].querySelector('.rep-note');
  t.ok('有說明的回報，說明在獨立的區塊裡', note && note.textContent === LONG_NOTE, note && note.textContent.slice(0, 20));
  t.eq('沒說明的回報不留空白區塊', reps[1].querySelectorAll('.rep-note').length, 0);

  /* ================= 2. 打開回報視窗不要跳日曆 ================= */
  t.ok('標題有 autofocus（打開時焦點停在標題）', doc.querySelector('#repTitle').hasAttribute('autofocus'));
  t.eq('標題可聚焦但不進 Tab 順序', doc.querySelector('#repTitle').getAttribute('tabindex'), '-1');
  t.ok('日期欄沒有 autofocus', !doc.querySelector('#repDate').hasAttribute('autofocus'));
  const focusables = [...doc.querySelectorAll('#dlgReport [autofocus]')];
  t.eq('整個回報視窗只有標題有 autofocus', focusables.map((e) => e.id), ['repTitle']);

  /* ================= 4. 按讚 ================= */
  const likeOf = (kind, id) => doc.querySelector(`#dtlBody .like-btn[data-kind="${kind}"][data-id="${id}"]`);
  t.ok('讚數查回來後按鈕顯示出來', !likeOf('report', 61).classList.contains('hidden'));
  t.eq('別人的回報讚數正確', likeOf('report', 61).querySelector('.like-n').textContent, '2');
  t.eq('我沒按過：未按下狀態', likeOf('report', 61).getAttribute('aria-pressed'), 'false');
  t.ok('自己的回報不能按', likeOf('report', 62).disabled);
  t.eq('自己的回報照樣看得到讚數', likeOf('report', 62).querySelector('.like-n').textContent, '1');
  t.eq('我按過的留言：已按下狀態', likeOf('comment', 501).getAttribute('aria-pressed'), 'true');
  t.ok('自己的留言不能按', likeOf('comment', 502).disabled);

  // 按讚
  const btn = likeOf('report', 61);
  btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await tick(win, 3);
  const ins = sb.__calls.write.filter((w) => w.table === 'report_likes' && w.op === 'insert');
  t.eq('按讚送出 insert，帶自己的 user_id', ins.length && ins[0].args[0], { report_id: 61, user_id: 'u-1' });
  t.eq('讚數 +1', btn.querySelector('.like-n').textContent, '3');
  t.eq('變成已按下', btn.getAttribute('aria-pressed'), 'true');

  // 收回讚
  btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await tick(win, 3);
  const del = sb.__calls.write.filter((w) => w.table === 'report_likes' && w.op === 'delete');
  t.eq('收回讚送出 delete', del.length, 1);
  t.eq('讚數 -1', btn.querySelector('.like-n').textContent, '2');
  t.eq('變回未按下', btn.getAttribute('aria-pressed'), 'false');

  // 失敗要改回來
  const realFrom = sb.from;
  sb.from = (table) => table === 'report_likes'
    ? { insert: () => Promise.resolve({ data: null, error: { message: 'permission denied' } }) }
    : realFrom(table);
  win.__alerts.length = 0;
  btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await tick(win, 3);
  sb.from = realFrom;
  t.eq('送出失敗時讚數改回原本', btn.querySelector('.like-n').textContent, '2');
  t.eq('送出失敗時狀態改回未按下', btn.getAttribute('aria-pressed'), 'false');
  t.ok('送出失敗有提示', /按讚失敗/.test(win.__alerts[0] || ''), win.__alerts);

  // 沒登入
  win.eval('me = null; myProfile = null;');
  win.__alerts.length = 0;
  const before = sb.__calls.write.length;
  btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await tick(win, 2);
  t.ok('沒登入按讚會提示登入', /登入/.test(win.__alerts[0] || ''), win.__alerts);
  t.eq('沒登入不會送出任何寫入', sb.__calls.write.length, before);
  win.eval('me = {id:"u-1"}; myProfile = {id:"u-1", is_admin:false, display_name:"celine"};');

  // 還沒跑 v61：讚數查詢失敗 → 整個按讚功能不出現
  const sbNoTable = makeSb({ tables: detailTables() });
  const rf = sbNoTable.from;
  sbNoTable.from = (table) => (table === 'report_likes' || table === 'comment_likes')
    ? { select() { return this; }, in: () => Promise.resolve({ data: null, error: { message: 'relation "public.report_likes" does not exist' } }) }
    : rf(table);
  win.__sb = sbNoTable; win.eval('sb = window.__sb;');
  await win.openDetail(7);
  await tick(win, 6);
  const shown = [...doc.querySelectorAll('#dtlBody .like-btn')].filter((b) => !b.classList.contains('hidden'));
  t.eq('資料庫還沒有按讚表時，一顆讚都不顯示', shown.length, 0);
  t.eq('回報跟留言本身照常顯示', doc.querySelectorAll('#dtlBody .rep.rep-full').length + doc.querySelectorAll('#dtlBody .cmt').length, 4);

  /* ================= 3. 收藏備註改成會長高的多行框 ================= */
  const sbWl = makeSb({ tables: { wishlist: [] } });
  win.__sb = sbWl; win.eval('sb = window.__sb;');
  win.eval(`WL_ROWS = [{offer_id: 7, year: new Date().getFullYear(), done: false,
    note: ${JSON.stringify(LONG_NOTE.slice(0, 200))}, sort_order: 1, created_at: '2026-09-01T00:00:00Z',
    offers: {id: 7, brand: '早餐店', offer: '生日送蛋餅', advance_days: 0, regions: ['台北市']}}];`);
  win.renderWishlistBody();
  await tick(win, 1);
  const ta = doc.querySelector('#myWishlist .wl-note');
  t.eq('備註欄是多行 textarea', ta && ta.tagName, 'TEXTAREA');
  t.eq('長備註完整帶入（沒有被截掉）', ta && ta.value, LONG_NOTE.slice(0, 200));
  t.eq('上限仍然是 200 字', ta && ta.getAttribute('maxlength'), '200');
  ta.value = '改短一點';
  ta.dispatchEvent(new win.Event('input'));
  ta.dispatchEvent(new win.Event('blur'));
  await tick(win, 3);
  const upd = sbWl.__calls.write.filter((w) => w.table === 'wishlist' && w.op === 'update');
  t.ok('改完備註照樣存回資料庫', upd.some((w) => w.args[0].note === '改短一點'), upd.map((w) => w.args[0]));
  const scary = '</textarea><img src=x onerror=alert(1)>';
  win.eval(`WL_ROWS[0].note = ${JSON.stringify(scary)};`);
  win.renderWishlistBody();
  await tick(win, 1);
  t.ok('備註裡有 HTML 也不會跑出來（有跳脫）',
    !doc.querySelector('#myWishlist img') && doc.querySelector('#myWishlist .wl-note').value === scary);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
