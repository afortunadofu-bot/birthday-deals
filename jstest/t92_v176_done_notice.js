/* v176：celine「不用登入就能看得到公告通知，然後幫我搞一個大家都看得到的公告，說系統已更新完成，可以登入了」 */
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t92 v176：「系統已更新完成」公告');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  delete win.__SXR_NO_MAINT;
  const box = $('#maintBanner');
  const on = (iso) => win.eval(`doneNoticeActive(new Date('${iso}'))`);

  t.ok('11/5 開始', on('2026-11-05T08:00:00+08:00'));
  t.ok('11/8 還在', on('2026-11-08T22:00:00+08:00'));
  t.ok('11/9 自己消失', !on('2026-11-09T00:10:00+08:00'));
  t.ok('11/4 還沒（那天還在停機）', !on('2026-11-04T12:00:00+08:00'));

  win.eval(`me=null; doneNoticeActive=()=>true; maintActive=()=>false; localStorage.clear(); paintMaint();`);
  t.ok('沒登入也看得到', !box.classList.contains('hidden') && win.eval('me') === null);
  t.eq('標題', $('#maintTitle').textContent, '系統已更新完成！');
  t.ok('內文講可以登入了', /可以登入了/.test($('#maintBody').textContent));
  t.ok('綠色、打勾（不是停機那個橘色扳手）', box.classList.contains('done-banner') && /✅/.test(box.querySelector('.nb-icon').textContent));

  win.eval('maintActive=()=>true; paintMaint();');
  t.ok('還在停機的時候不出現（停機那則優先）', !box.classList.contains('done-banner') && /🛠/.test(box.querySelector('.nb-icon').textContent));
  win.eval('maintActive=()=>false; paintMaint();');

  $('#btnDismissMaint').click();
  t.ok('✕ 關掉', box.classList.contains('hidden'));
  t.eq('記在這台裝置上（下次打開不再跳）', win.localStorage.getItem('sxr_notice_closed_v176'), '1');
  win.eval('doneNoticeActive=function(){ try{ return localStorage.getItem("sxr_notice_closed_v176")!=="1"; }catch{ return true; } }; paintMaint();');
  t.ok('重新整理：不再出現', box.classList.contains('hidden'));

  let oauth = 0;
  win.eval('LIVE=true; sb={auth:{signInWithOAuth:()=>{ window.__o=(window.__o||0)+1; return Promise.resolve({error:null}); }}};');
  $('#btnLogin').click();
  await tick(win, 3);
  oauth = win.eval('window.__o||0');
  t.ok('登入不再被擋（會去 Google）', oauth >= 1);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
