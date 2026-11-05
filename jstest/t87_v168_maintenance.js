/* v168：celine「11/3－11/5 系統更新！這幾天正在進行系統升級作業，登入功能將暫時無法使用，
   造成不便敬請見諒🙏」「我想要加這個在剛登入的那裏」。
   Supabase 流量超過免費方案上限被暫停——公告不能放資料庫，寫死在頁面上、照日期開關。 */
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t87 v168：系統更新公告、登入暫停');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  delete win.__SXR_NO_MAINT;            // 這一支要測的就是公告本身

  const on = (iso) => win.eval(`maintActive(new Date('${iso}'))`);
  t.ok('11/3 開始', on('2026-11-03T00:05:00+08:00'));
  t.ok('11/4 還在', on('2026-11-04T23:50:00+08:00'));
  /* v173：Supabase 11/4 就恢復了，until 收到 11/4（原本 11/5，照日期多擋了一天登入） */
  t.ok('11/5 已經收掉（資料庫提早恢復）', !on('2026-11-05T09:00:00+08:00'));
  t.ok('11/2 還沒', !on('2026-11-02T23:59:00+08:00'));
  t.ok('11/6 自己消失', !on('2026-11-06T00:01:00+08:00'));

  win.eval("maintDated=()=>true; maintActive=()=>true; paintMaint();");
  t.ok('那幾天：最上面的公告出現', !$('#maintBanner').classList.contains('hidden'));
  t.eq('標題照原文', $('#maintTitle').textContent, '11/3－11/5 系統更新！');
  t.eq('內文照原文', $('#maintBody').textContent, '這幾天正在進行系統升級作業，登入和排行榜功能將暫時無法使用，造成不便敬請見諒🙏');

  // 按登入：不去 Google，公告叫出來
  let oauth = 0;
  win.eval('LIVE=true; sb={auth:{signInWithOAuth:()=>{ window.__oauth=(window.__oauth||0)+1; return Promise.resolve({error:null}); }}};');
  $('#btnDismissMaint').click();
  t.ok('✕ 可以先關掉', $('#maintBanner').classList.contains('hidden'));
  $('#btnLogin').click();
  await tick(win, 3);
  oauth = win.eval('window.__oauth||0');
  t.eq('按「Google 登入」不會跳去 Google', oauth, 0);
  t.ok('關掉的公告重新出現', !$('#maintBanner').classList.contains('hidden'));
  $('#btnMineLogin').click();
  await tick(win, 2);
  t.eq('「我的」那顆登入也一樣', win.eval('window.__oauth||0'), 0);

  /* 會寫進資料庫的小卡片（問卷、評分、一句回饋）那幾天都不跳——填了也送不出去 */
  win.eval(`me={id:'u-1'}; MY_REPORTS=[1,2,3,4,5].map(i=>({id:i,result:'success'}));
    SURVEY_NUDGE_SHOWN=false; RATE_NUDGE_SHOWN=false; localStorage.clear();`);
  t.ok('問卷提示不跳', win.eval('surveyNudgeAllowed()') === false);
  t.ok('評分提示不跳', win.eval('rateNudgeAllowed()') === false);
  t.ok('一句回饋不跳', win.eval('maybeShowOneLine()') === false);
  win.eval('maintActive=()=>false; paintMaint();');
  t.ok('日期過了：一句回饋照常會跳', win.eval('maybeShowOneLine()') === true);
  win.eval("document.querySelector('#oneLineNudge').classList.add('hidden'); me=null;");
  t.ok('日期過了：公告不出現', $('#maintBanner').classList.contains('hidden'));
  $('#btnLogin').click();
  await tick(win, 3);
  t.ok('日期過了：登入照常去 Google', win.eval('window.__oauth||0') >= 1);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
