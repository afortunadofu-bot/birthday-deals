/* Supabase 免費方案的 Log Ingestion 是 1GB，2026-10-16 已經 1.235GB 超額。
   那個額度是按「請求數」算的，所以要砍的是請求次數，不是資料量。

   兩個來源：
   1. 「即時在線人數」每 20 秒問一次——排行榜或管理員分頁開著沒關，一小時
      就是 180 次，而且沒人在操作也照打。改成 60 秒。
   2. 事件記錄一筆一個 POST。一個人逛一圈可能五六筆。改成攢著一起送。
      pageview 例外——在線人數就是數它。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, makeSb } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

(async () => {
  const t = makeAsserts('t50 事件批次送＋在線人數少問一點');
  const { win } = await boot();
  const doc = win.document;

  /* ========== 1. 不再自動輪詢「即時在線人數」 ========== */
  t.eq('整支程式只剩一個 setInterval（問卷的停留計時，不打資料庫）',
    (index.match(/setInterval\(/g) || []).length, 1);
  t.ok('那一個不是拿來問在線人數的',
    !/setInterval[\s\S]{0,200}online_now/.test(index));
  t.ok('改成點數字底下那行就重新算', /id="btnBoardOnline"/.test(index) && /id="btnDashOnline"/.test(index));
  t.ok('按鈕按下去才打 site_online_now',
    /btnBoardOnline[\s\S]{0,400}sb\.rpc\('site_online_now'\)/.test(index));
  t.ok('按的時候先 disable，不要連點連打',
    /b\.disabled=true;[\s\S]{0,200}b\.disabled=false;/.test(index));

  /* ========== 2. 事件批次 ========== */
  const posts = [];
  win.__posts = posts;
  win.eval(`
    LIVE=true; me=null;
    CFG={url:'https://db.example', anonKey:'anon-key'};
    window.fetch=(u,o)=>{ window.__posts.push({u, body:JSON.parse(o.body), keepalive:!!o.keepalive,
      apikey:o.headers.apikey}); return Promise.resolve({ok:true, json:()=>Promise.resolve(null)}); };
  `);
  const sb = makeSb({ tables: { site_events: [] } });
  win.__sb = sb;
  win.eval('sb=window.__sb;');

  win.eval(`logEvent('coffee_open'); logEvent('studio_click',{to:'brandpage'}); logEvent('wish',{id:1});`);
  await tick(win, 2);
  t.eq('三筆事件，先一筆都不送（攢著）', posts.length, 0);
  t.eq('也沒有偷偷走 supabase-js', sb.__calls.write.length, 0);
  t.eq('在佇列裡', win.eval('EV_QUEUE.length'), 3);

  // 切到背景就送——而且是一次送完
  win.eval(`Object.defineProperty(document,'hidden',{value:true,configurable:true});
    document.dispatchEvent(new Event('visibilitychange'));`);
  await tick(win, 2);
  t.eq('切到背景一次送出去', posts.length, 1);
  t.eq('三筆包成同一個請求', posts[0].body.length, 3);
  t.ok('送到 site_events', /\/rest\/v1\/site_events$/.test(posts[0].u), posts[0].u);
  t.ok('用 keepalive（頁面要關了也送得出去）', posts[0].keepalive);
  t.ok('帶了 anon key', posts[0].apikey === 'anon-key');
  t.eq('送完佇列就清空', win.eval('EV_QUEUE.length'), 0);
  t.eq('事件內容原樣帶著', posts[0].body.map((r) => r.event_type),
    ['coffee_open', 'studio_click', 'wish']);
  t.ok('session 也帶著', !!posts[0].body[0].session_id);

  // 再按一次背景：佇列是空的，不要送一個空陣列
  posts.length = 0;
  win.eval(`document.dispatchEvent(new Event('visibilitychange'));`);
  await tick(win, 2);
  t.eq('沒東西就不要白打一次', posts.length, 0);

  /* pageview 是例外：在線人數就是數它，不能排隊 */
  win.eval(`logEvent('pageview',{path:'/'});`);
  await tick(win, 2);
  t.eq('pageview 馬上送', sb.__calls.write.filter((w) => w.table === 'site_events').length, 1);
  t.eq('而且不是走批次那條', win.eval('EV_QUEUE.length'), 0);
  t.ok('寫進去的就是 pageview',
    sb.__calls.write.find((w) => w.table === 'site_events').args[0].event_type === 'pageview');

  // 攢到 10 筆就先送一次，不用等那 15 秒
  posts.length = 0;
  win.eval(`for(let i=0;i<10;i++) logEvent('rate_nudge',{i});`);
  await tick(win, 2);
  t.eq('滿 10 筆就送', posts.length, 1);
  t.eq('一次 10 筆', posts[0].body.length, 10);

  t.ok('離線／示範模式不記事件', win.eval(`LIVE=false; EV_QUEUE.length=0; logEvent('wish'); EV_QUEUE.length`) === 0);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
