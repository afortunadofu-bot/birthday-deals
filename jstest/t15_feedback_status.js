/* 問題回報／建議：已完成／未完成／修改中（嵐）

   - 狀態篩選：全部／未完成／修改中／已完成
   - 每一則依狀態給按鈕：未完成 →「🔧 修改中」「標記已完成」；修改中 →「標記已完成」「改回未完成」；
     已完成 →「改回未完成」
   - 標成修改中直接更新 site_feedback.status；v68 沒跑（check constraint 擋下）時講要跑哪支 SQL
   - 標題旁的數字算「還沒完成的」（未完成＋修改中） */
const { boot, tick, makeSb, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t15 問題回報狀態');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  const sb = makeSb({});
  win.__sb = sb;
  win.eval(`sb = window.__sb; LIVE = true; myProfile = {id:'a', is_admin:true};
    FB_ROWS = [
      {id:1, type:'bug', status:'open', message:'壞掉了', created_at:'2026-09-17T00:00:00Z'},
      {id:2, type:'suggestion', status:'in_progress', message:'想要地圖', created_at:'2026-09-16T00:00:00Z'},
      {id:3, type:'suggestion', status:'resolved', message:'做好了', created_at:'2026-09-15T00:00:00Z'}];`);
  win.renderFbList();
  const msgs = () => [...doc.querySelectorAll('#fbList .rep')].map((r) => r.textContent.match(/壞掉了|想要地圖|做好了/)[0]);
  t.eq('預設全部都看得到', msgs(), ['壞掉了', '想要地圖', '做好了']);
  t.eq('標題數字算還沒完成的（未完成＋修改中）', $('#fbCount').textContent, '2');
  const sel = $('#fbStatusFilter');
  const pick = (v) => { sel.value = v; sel.dispatchEvent(new win.Event('change')); };
  pick('open'); t.eq('篩未完成', msgs(), ['壞掉了']);
  pick('in_progress'); t.eq('篩修改中', msgs(), ['想要地圖']);
  pick('resolved'); t.eq('篩已完成', msgs(), ['做好了']);
  pick('all');

  const btns = (i) => [...doc.querySelectorAll('#fbList .rep')[i].querySelectorAll('.fb-toggle')].map((b) => b.textContent.trim());
  t.eq('未完成的按鈕', btns(0), ['🔧 修改中', '標記已完成']);
  t.eq('修改中的按鈕', btns(1), ['標記已完成', '改回未完成']);
  t.eq('已完成的按鈕', btns(2), ['改回未完成']);
  t.ok('修改中有自己的標籤', /修改中/.test(doc.querySelectorAll('#fbList .rep')[1].querySelector('.flag:nth-child(2)').textContent));

  // 標成修改中
  win.loadFeedbackList = () => {};
  doc.querySelectorAll('#fbList .rep')[0].querySelector('[data-status="in_progress"]').click();
  await tick(win, 3);
  const w = sb.__calls.write[sb.__calls.write.length - 1];
  t.eq('標成修改中直接更新狀態', [w.table, w.op, w.args[0]], ['site_feedback', 'update', { status: 'in_progress' }]);

  // v68 還沒跑
  let alerted = '';
  win.alert = (m) => { alerted = m; };
  win.__sb2 = makeSb({});
  win.__sb2.from = () => ({ update: () => ({ eq: () => Promise.resolve({ error: { message: 'new row violates check constraint "site_feedback_status_check"' } }) }) });
  win.eval('sb = window.__sb2;');
  win.renderFbList();
  doc.querySelectorAll('#fbList .rep')[0].querySelector('[data-status="in_progress"]').click();
  await tick(win, 3);
  t.ok('v68 沒跑時講要跑哪支 SQL', /schema_v68/.test(alerted), alerted);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
