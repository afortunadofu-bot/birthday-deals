/* v163：celine 10-30 第二批

   （截圖：「照你的待辦清單」那三格）「這個要有辦法點下去一鍵收藏成我的行程」
   「排行程也要可以看的到點擊人數」
   「使用過了也可以出現在地圖上」
   「功能被用了幾次要可以選時間區間」 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, stubHeavy } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sql = fs.readFileSync(path.join(__dirname, '..', 'schema_v163_event_range.sql'), 'utf8');

(async () => {
  const t = makeAsserts('t82 v163：存成行程、點進每一頁、用過的上地圖、自選區間');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];
  stubHeavy(win, ['render', 'loadOffers', 'loadMyVenueSuggestions', 'loadPendingBadge',
    'maybeShowBirthdayCheer', 'openDetail', 'renderMyWishlist', 'renderReminders', 'paintNearPins']);

  /* ================= 一、照你的待辦清單 → 存成我的行程 ================= */
  win.eval(`LIVE=true; me={id:'u-1'}; myProfile={is_admin:false};
    OFFERS=[{id:1,brand:'31冰淇淋'},{id:2,brand:'金色三麥'},{id:3,brand:'古拉爵'},{id:4,brand:'銀座杏子'},{id:9,brand:'別家'}];
    WISH=new Set(['1','2','3','4']); MY_USED_OFFER_IDS=new Set(['3']);
    VENUES=[{id:1,name:'高雄夢時代',county:'高雄市',offer_count:39},{id:4,name:'新竹巨城商圈',county:'新竹市',offer_count:38}];
    VENUE_PAIRS=new Map([[1,new Set(['1','2','3','4','9'])],[4,new Set(['1','2'])]]);
    window.__ins=[]; window.__loaded=0;
    loadPlans=()=>{ window.__loaded++; return Promise.resolve(); };
    sb={ from:(tb)=>({ insert:(rows)=>{ window.__ins.push([tb,rows]);
        const r={data:tb==='plans'?{id:77}:null, error:null};
        return Object.assign(Promise.resolve(r), {select:()=>({single:()=>Promise.resolve(r)})}); } }),
      rpc:()=>Promise.resolve({data:[],error:null}) };
    renderVenueRecs();`);
  const recBtn = (id) => $(`#venueRecs [data-vrplan="${id}"]`);
  t.ok('每一格都有「＋ 存成我的行程」', !!recBtn(1) && !!recBtn(4));
  t.ok('點商圈名字那一顆還在（看詳情）', !!$('#venueRecs [data-vr="1"]'));
  t.ok('按鈕不包在按鈕裡', !$('#venueRecs button button'));
  recBtn(1).click();
  await tick(win, 6);
  const ins = JSON.parse(win.eval('JSON.stringify(window.__ins)'));
  t.eq('建一趟，名字是商圈的名字', ins[0], ['plans', { user_id: 'u-1', title: '高雄夢時代' }]);
  t.eq('店家＝收藏的、在這個商圈裡的，用過的先拿掉',
    ins[1] && ins[1][1].map((r) => r.offer_id), [1, 2, 4]);
  t.eq('照順序編號', ins[1] && ins[1][1].map((r) => r.sort_order), [0, 1, 2]);
  t.ok('建好重新讀一次行程、打開那一趟', win.eval('window.__loaded') === 1 && win.eval('PLAN_OPEN') === 77);
  t.ok('沒收藏的同商圈店家不會被塞進去', !ins[1][1].some((r) => r.offer_id === 9));

  win.eval("window.__ins=[]; MY_USED_OFFER_IDS=new Set(['1','2']); renderVenueRecs();");
  recBtn(4).click();
  await tick(win, 6);
  t.eq('全部都用過了：照樣全放，不建一趟空的',
    JSON.parse(win.eval('JSON.stringify(window.__ins[1][1].map(r=>r.offer_id))')), [1, 2]);

  win.eval("me=null; window.__ins=[]; renderVenueRecs();");
  t.ok('沒登入：推薦那塊本來就不出現', !recBtn(1));
  win.eval("me={id:'u-1'};");

  /* ================= 二、點進每一頁也記一次 ================= */
  win.eval("window.__ev=[]; logEvent=(type,meta)=>window.__ev.push([type,meta]);");
  win.eval("showSection('browse'); showSection('trip'); showSection('trip'); showSection('mine');");
  const ev = JSON.parse(win.eval('JSON.stringify(window.__ev.filter(e=>e[0]==="tab_open"))'));
  t.eq('換頁記一次，同一頁再點不算', ev.map((e) => e[1].tab), ['trip', 'mine']);

  /* ================= 三、功能被用了幾次：自己的區間 ================= */
  t.ok('區間選單就在這一塊裡', !!$('#pnlEventStats #evRange'));
  t.eq('選項：今天／7／30／90／全部／自己選', $$('#evRange option').map((o) => o.value), ['1', '7', '30', '90', '0', 'custom']);
  t.ok('咖啡那塊換區間不再連動這一塊', !/coffeeRange'\)\.onchange=\(\)=>\{[^}]*loadEventStats/.test(index));

  const span = (v, from, to) => {
    $('#evRange').value = v;
    if (from !== undefined) $('#evFrom').value = from;
    if (to !== undefined) $('#evTo').value = to;
    return JSON.parse(win.eval('JSON.stringify(evRangeSpan())'));
  };
  const today = span('1');
  const d = new Date(today.from);
  t.ok('今天＝從今天 0 點算起（不是近 24 小時）', d.getHours() === 0 && d.getMinutes() === 0 && today.label === '今天');
  const c = span('custom', '2026-10-25', '2026-10-30');
  t.ok('自己選：兩頭都算進去（到＝最後一天的隔天 0 點）',
    new Date(c.from).getDate() === 25 && new Date(c.to).getDate() === 31, JSON.stringify(c));
  t.eq('自己選的標籤', c.label, '10/25～10/30');
  const sw = span('custom', '2026-10-30', '2026-10-25');
  t.ok('前後填反了：自己換過來', new Date(sw.from).getDate() === 25);
  t.eq('同一天', span('custom', '2026-10-30', '2026-10-30').label, '10/30');
  t.eq('只填開始', span('custom', '2026-10-25', '').label, '10/25 之後');
  t.eq('都沒填：不查', span('custom', '', ''), null);

  win.eval(`myProfile={is_admin:true}; window.__rpc=[];
    sb={ rpc:(fn,a)=>{ window.__rpc.push([fn,a]);
      return Promise.resolve(fn==='admin_event_stats_range' ? {data:[
        {target:'tab:trip', people:42, events:60, last_at:'2026-10-30T09:00:00Z'},
        {target:'plan_create', people:5, events:7, last_at:'2026-10-30T09:00:00Z'},
        {target:'venue_rec_plan', people:3, events:4, last_at:'2026-10-30T09:00:00Z'},
        {target:'tab:mine', people:30, events:31, last_at:'2026-10-30T09:00:00Z'}], error:null}
      : {data:[], error:null}); } };`);
  $('#evRange').value = '7';
  await win.eval('loadEventStats()');
  const trip = () => $('#eventStatsBody .ev-sec[data-sec="排行程"]');
  t.ok('排行程那一段寫出幾個人點進來', /42 人點進來/.test(trip().textContent), trip()?.textContent);
  t.ok('點進這一頁那一行排最上面', /點進「排行程」這一頁/.test(trip().querySelector('.linkrow').textContent));
  t.ok('點進來的次數不算進「這一頁的功能被用了幾次」的總數', /· 11 次/.test(trip().textContent));
  t.ok('存成行程也有名字', /從「照你的待辦清單」存成行程/.test(trip().textContent));
  t.ok('「我的」那頁也一樣', /30 人點進來/.test($('#eventStatsBody .ev-sec[data-sec="我的"]').textContent));
  const rpc = JSON.parse(win.eval('JSON.stringify(window.__rpc)'));
  t.ok('近 7 天：送「從」，「到」空著', rpc[0][0] === 'admin_event_stats_range' && rpc[0][1].p_from && rpc[0][1].p_to === null);

  // v163 還沒跑：近幾天退回 v151；自己選日期講清楚要跑哪一支
  win.eval(`EV_RANGE_V163=true; window.__rpc=[];
    sb={ rpc:(fn,a)=>{ window.__rpc.push([fn,a]); return Promise.resolve(fn==='admin_event_stats_range'
      ? {data:null, error:{message:'Could not find the function public.admin_event_stats_range in the schema cache'}}
      : {data:[{target:'tab_open', people:9, events:12, last_at:null}], error:null}); } };`);
  await win.eval('loadEventStats()');
  t.eq('沒跑 v163：近幾天退回 v151 那支', JSON.parse(win.eval('JSON.stringify(window.__rpc.map(r=>r[0]))')),
    ['admin_event_stats_range', 'admin_event_stats']);
  t.ok('沒跑 v163：換頁那一筆還是看得到（只是沒拆）', /換頁/.test($('#eventStatsBody').textContent));
  span('custom', '2026-10-25', '2026-10-30');
  await win.eval('loadEventStats()');
  t.ok('沒跑 v163：自己選日期講要跑哪一支', /schema_v163_event_range\.sql/.test($('#eventStatsBody').textContent));
  t.ok('…而且不是用管理員才看得懂的錯誤碼', !/schema cache|PGRST/.test($('#eventStatsBody').textContent));

  win.eval("EV_RANGE_V163=true;");
  $('#evRange').value = '30';
  $('#evFrom').value = ''; $('#evTo').value = '';
  $('#evRange').value = 'custom';
  $('#evRange').dispatchEvent(new win.Event('change'));
  t.ok('選「自己選日期」：日期欄出現，先帶近 7 天', !$('#evCustom').classList.contains('hidden')
    && !!$('#evFrom').value && !!$('#evTo').value);

  /* ================= 四、用過的也在地圖上 ================= */
  win.eval(`MY_USED_OFFER_IDS=new Set(['3']); NEAR.active=true; NEAR.lat=25; NEAR.lng=121; NEAR.label='這裡';
    NEAR.byOffer=new Map([['1',[]],['3',[]],['9',[]]]); renderNearBar();`);
  t.ok('有回報過：「✓ 我用過的」出現', !$('#btnNearUsed').classList.contains('hidden'));
  $('#btnNearUsed').click();
  t.ok('按下去：亮起來', $('#btnNearUsed').classList.contains('active') && win.eval('NEAR.usedOnly') === true);
  t.ok('數字只數用過的', /有 1 筆你用過的優惠有分店/.test($('#nearStatus').textContent), $('#nearStatus').textContent);
  $('#btnNearWish').click();
  t.ok('跟「只看收藏」一次只開一顆', win.eval('NEAR.wishOnly') === true && win.eval('NEAR.usedOnly') === false
    && !$('#btnNearUsed').classList.contains('active'));
  $('#btnNearWish').click();
  win.eval("MY_USED_OFFER_IDS=new Set(); renderNearBar();");
  t.ok('一筆都沒回報過：那顆不出現', $('#btnNearUsed').classList.contains('hidden'));

  t.ok('地圖上用過的畫綠色', /used:\{color:'#14532d', fill:'#22c55e'/.test(index)
    && /const c = used \? PIN_STYLE\.used/.test(index));
  t.ok('小視窗寫「你用過了」', /✓ 你用過了/.test(index));
  t.ok('清單也跟著篩', /NEAR\.active&&NEAR\.usedOnly&&!MY_USED_OFFER_IDS\.has/.test(index));

  // 使用回報那一格的入口
  win.eval(`window.__near=0; startNear=()=>{ window.__near++; }; MY_USED_OFFER_IDS=new Set(['3']);
    sb={ from:()=>({ select:()=>({ eq:()=>Promise.resolve({data:[{offer_id:3}],error:null}) }) }) };`);
  await win.eval('loadMyUsedOffers()');
  t.ok('使用回報那一格多一顆「在地圖上看」', !$('#btnReportsMap').classList.contains('hidden')
    && $('#recReports').contains($('#btnReportsMap')));
  $('#btnReportsMap').click();
  t.ok('按下去：開附近、只看用過的', win.eval('window.__near') === 1 && win.eval('NEAR.usedOnly') === true
    && win.eval('ACTIVE_TAB') === 'browse');

  /* ================= 五、SQL ================= */
  t.ok('SQL：只有管理員', /if not public\.is_admin\(\) then/.test(sql));
  t.ok('SQL：換頁拆成每一頁', /when 'tab_open'\s+then 'tab:'/.test(sql));
  t.ok('SQL：「到」那一頁不含（前端已經加一天）', /e\.created_at <\s+p_to/.test(sql));
  t.ok('SQL：anon 收回', /revoke execute on function public\.admin_event_stats_range\(timestamptz, timestamptz\) from public, anon/.test(sql));
  t.ok('SQL：不回個別事件', !/select\s+\*\s+from public\.site_events/i.test(sql.replace(/^--.*$/gm, '')));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
