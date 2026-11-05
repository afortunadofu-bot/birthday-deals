/* v175：celine「一句回饋要另外放，不能跟修改意見放在一起，且不一定要標示已完成」 */
const { boot, makeAsserts, stubHeavy } = require('./harness');

(async () => {
  const t = makeAsserts('t91 v175：一句回饋自己一塊');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  stubHeavy(win, ['loadOffers', 'render']);
  win.eval(`myProfile={is_admin:true}; FB_ROWS=[
    {id:1,type:'bug',status:'open',message:'地圖點不到',created_at:'2026-11-01T10:00:00Z'},
    {id:2,type:'suggestion',status:'in_progress',message:'想要篩選',created_at:'2026-11-01T11:00:00Z'},
    {id:3,type:'praise',status:'open',message:'你很優秀 感謝您',created_at:'2026-11-02T15:31:00Z',display_name:'小豬'},
    {id:4,type:'praise',status:'open',message:'好用！',created_at:'2026-11-03T09:00:00Z',display_name:'嵐'}];
    document.querySelector('#fbTypeFilter').value='all'; document.querySelector('#fbStatusFilter').value='active';
    renderFbList();`);

  const fb = $('#fbList').textContent;
  t.ok('問題回報／建議那塊沒有一句回饋', !/你很優秀|好用！/.test(fb) && /地圖點不到/.test(fb) && /想要篩選/.test(fb));
  t.eq('上面的待處理數字不算一句回饋', $('#fbCount').textContent, '2');

  const pr = $('#pnlPraise');
  t.ok('一句回饋自己一塊，排在問題回報後面', !!pr && $('#pnlFeedback').nextElementSibling === pr);
  const rows = [...doc.querySelectorAll('#praiseList .praise-row')];
  t.eq('兩則都在，新的在上面', rows.map((r) => r.querySelector('.praise-msg').textContent), ['好用！', '你很優秀 感謝您']);
  t.ok('寫出是誰', /小豬/.test(rows[1].textContent));
  t.ok('沒有「修改中／標記已完成」', !pr.querySelector('.fb-toggle') && !/修改中|標記已完成|未完成/.test(pr.textContent));
  t.eq('標題旁邊寫幾則', $('#praiseCount').textContent, '2');

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
