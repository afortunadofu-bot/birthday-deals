/* v159：嵐對「一趟用最多」的四件事

   「已經公開的就不用繼續寫在管理員這邊了，管理員可以去行程那邊按刪除，也可以改名跟編輯」
   「每個商圈點進去可以直接看到他在地圖的大概哪裡，還有店家點點」
   「一開始先看到台灣地圖看大分佈，切縣市也可以看到該縣市概要的圖」
   「功能被用了幾次可以分區塊寫嗎」

   jsdom 跑不了 Leaflet（它載不到外部腳本），所以這一支驗的是地圖**周圍**的邏輯：
   載不到地圖時清單照常、店家點點用的範圍跟家數同一套判斷、管理員那一條只有
   管理員看得到、審核那邊不再列公開的、功能統計照頁面分。地圖本身在瀏覽器裡看過。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, stubHeavy } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

(async () => {
  const t = makeAsserts('t78 商圈地圖、就地編輯、功能統計分頁');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];
  stubHeavy(win, ['render', 'loadOffers', 'loadMyVenueSuggestions', 'loadPendingBadge',
    'maybeShowBirthdayCheer', 'openDetail']);

  /* ================= 一、地圖載不到：清單照常 ================= */
  win.eval(`LIVE=true; me=null; myProfile=null;
    OFFERS=[{id:1,brand:'星巴克',offer:'買一送一'},{id:2,brand:'康是美',offer:'生日禮'}];
    VENUES=[
      {id:7,name:'台中七期・臺灣大道',county:'台中市',lat:24.16497,lng:120.64356,radius_m:180,offer_count:36},
      {id:8,name:'中山站・南京西路',county:'台北市',lat:25.05273,lng:121.52087,radius_m:180,offer_count:17}];
    sb={ rpc:(fn)=>Promise.resolve(fn==='venue_offer_ids'
        ? {data:[{venue_offer_ids:1},{venue_offer_ids:2}],error:null} : {data:[],error:null}),
         from:()=>({}) };
    document.querySelector('#venueCounty').innerHTML='<option value=""></option><option>台中市</option><option>台北市</option>';
    renderVenues();`);
  await win.eval('paintVenuesMap()');
  t.ok('有總覽地圖的位置', !!$('#venuesMap'));
  /* harness 裡外部腳本一律載入失敗，等於真機上 CDN 被擋 */
  t.ok('Leaflet 載不到：總覽地圖整塊藏起來，不留一片空白', $('#venuesMap').classList.contains('hidden'));
  t.eq('清單照常', $$('#venueList .venue').length, 2);

  win.eval('openVenueFromMap(7)');
  await tick(win, 4);
  const body = $('#venueBody7');
  t.ok('從地圖點進來，那一格就展開', body && !body.classList.contains('hidden'));
  t.eq('裡面的店照常列', $$('#venueBody7 .venue-offer').length, 2);
  await tick(win, 4);
  t.ok('地圖載不到：那一格的小地圖拿掉，不留空框', !$('#venueMap7'));

  /* ================= 二、店家點點跟家數用同一套範圍 ================= */
  /* 地圖上的點跟清單上的「36 家」要對得起來：方塊粗篩、再用真正距離細篩，
     跟資料庫的 venue_offer_ids 同一套算法。 */
  const v = { lat: 24.16497, lng: 120.64356, radius_m: 180 };
  const box = JSON.parse(win.eval(`JSON.stringify(venueBox(${JSON.stringify(v)}))`));
  t.ok('方塊把整個圓包進去', box.p_south < v.lat && box.p_north > v.lat && box.p_west < v.lng && box.p_east > v.lng);
  const dist = (s) => win.eval(`venueDistM(${JSON.stringify(v)}, ${JSON.stringify(s)})`);
  t.ok('中心點距離是 0', dist({ lat: v.lat, lng: v.lng }) < 1);
  // 往北 0.0015 度 ≈ 167 公尺（在圈內），0.002 度 ≈ 222 公尺（方塊角落、圈外）
  t.ok('167 公尺在圈內', dist({ lat: v.lat + 0.0015, lng: v.lng }) <= 180);
  t.ok('方塊角落在圈外（要被細篩掉）',
    dist({ lat: box.p_north - 0.0001, lng: box.p_east - 0.0001 }) > 180);

  /* ================= 三、管理員就地編輯 ================= */
  const vRow = JSON.stringify({ id: 7, name: '台中七期・臺灣大道', county: '台中市', radius_m: 180 });
  t.eq('一般人：沒有管理那一條', win.eval(`venueAdminHtml(${vRow})`), '');
  t.ok('一般人打開那一格也看不到', !$('#venueBody7 .venue-admin'));
  win.eval('myProfile={is_admin:true}');
  const html = win.eval(`venueAdminHtml(${vRow})`);
  t.ok('管理員：改名、縣市、範圍、存、取消公開、刪除都在',
    /vaName7/.test(html) && /vaCty7/.test(html) && /vaRadius7/.test(html)
    && /vaSave7/.test(html) && /vaHide7/.test(html) && /vaDel7/.test(html));
  t.ok('縣市選單選在它現在的縣市', /<option selected>台中市<\/option>/.test(html));
  t.ok('範圍選在它現在的範圍', /value="180" selected/.test(html));
  /* 民眾模式會把 is_admin 換成 false，管理那一條要跟著消失 */
  win.eval("myProfile={is_admin:false}");
  t.eq('民眾模式：管理那一條不見', win.eval(`venueAdminHtml(${vRow})`), '');

  // 存：送出去的欄位、存完重新抓清單
  const ups = [];
  win.__ups = ups;
  win.eval(`myProfile={is_admin:true};
    sb={ rpc:()=>Promise.resolve({data:[{venue_offer_ids:1}],error:null}),
         from:(tb)=>({ update:(row)=>({ eq:(c,id)=>{ window.__ups.push({tb,row,id}); return Promise.resolve({error:null}); } }),
                       delete:()=>({ eq:(c,id)=>{ window.__ups.push({tb,op:'delete',id}); return Promise.resolve({error:null}); } }) }) };
    window.__reloads=0; loadVenues=()=>{ window.__reloads++; };
    VENUE_OPEN=null; renderVenues(); openVenueFromMap(7);`);
  await tick(win, 4);
  $('#vaName7').value = '  台中七期  ';
  $('#vaRadius7').value = '300';
  win.eval("document.querySelector('#vaSave7').click()");
  await tick(win, 3);
  t.eq('改名跟範圍送出去', ups[0]?.row, { name: '台中七期', county: '台中市', radius_m: 300 });
  t.eq('送的是那一個商圈', ups[0]?.id, 7);
  t.ok('存完重新抓清單（範圍一改家數就變）', win.eval('window.__reloads') >= 1);

  $('#vaName7').value = '台';
  win.eval("document.querySelector('#vaSave7').click()");
  await tick(win, 2);
  t.eq('名字太短不送', ups.length, 1);

  win.__confirmAnswer = true;
  win.eval("document.querySelector('#vaHide7').click()");
  await tick(win, 3);
  t.eq('取消公開送的是 is_public=false', ups[1]?.row, { is_public: false });
  win.eval("document.querySelector('#vaDel7').click()");
  await tick(win, 3);
  t.ok('刪除前有問', win.__confirms.some((m) => /刪掉「台中七期・臺灣大道」/.test(m)));
  t.eq('刪除送的是 delete', ups[2]?.op, 'delete');

  /* ================= 四、審核：公開的不再列 ================= */
  win.eval(`VENUE_ADMIN={sug:[],
      mine:[{id:7,name:'台中七期',county:'台中市',is_public:true,lat:24.16497,lng:120.64356},
            {id:9,name:'高雄中安路（待確認）',county:'高雄市',is_public:false,lat:22.58239,lng:120.3297}],
      cand:[{offers:36,county:'台中市',lat:24.16500,lng:120.64360,sample_names:'星巴克 新光三越台中中港店'},
            {offers:9,county:'台北市',lat:25.10000,lng:121.50000,sample_names:'寶雅 中華店'}],
      candErr:''};
    renderVenueAdmin();`);
  const adm = $('#venueAdminBody');
  t.ok('公開的不列', !adm.querySelector('[data-vname="7"]'));
  t.ok('還沒公開的照列', !!adm.querySelector('[data-vname="9"]'));
  t.ok('講清楚公開的去哪裡改', /已經公開的 1 個不列在這裡/.test(adm.textContent) && /排行程/.test(adm.textContent));
  /* v153 漏選 lat／lng，「這個熱點建過了沒」永遠比對不到——53 個已經建好的
     在「還沒建的」又全部列一次。公開的那個（台中七期）就在熱點旁邊 5 公尺。 */
  t.ok('建過的熱點不會再列一次（公開的也算建過）', /還沒建的（1）/.test(adm.textContent), adm.textContent.slice(0, 160));
  t.ok('查詢有選座標', /select\('id,name,county,is_public,lat,lng'\)/.test(index));

  /* ================= 五、功能被用了幾次：照頁面分 ================= */
  const sec = (x) => win.eval(`eventSection(${JSON.stringify(x)})`);
  t.eq('收藏算「優惠」', sec('wish'), '優惠');
  t.eq('排行程的店算「排行程」', sec('plan_add'), '排行程');
  t.eq('問卷算「我的」', sec('survey_open'), '我的');
  t.eq('沒登記的不會不見，放「其他」', sec('something_new'), '其他');
  t.eq('區塊看它住在哪一頁', sec('panel:pnlVenues'), '排行程');
  t.eq('「我的」裡的區塊', sec('panel:badgesPanel'), '我的');

  win.eval(`myProfile={is_admin:true}; LIVE=true;
    sb={ rpc:()=>Promise.resolve({data:[
      {target:'wish',people:9,events:40,last_at:'2026-10-30'},
      {target:'plan_add',people:2,events:5,last_at:'2026-10-30'},
      {target:'panel:badgesPanel',people:3,events:4,last_at:'2026-10-29'},
      {target:'survey_open',people:1,events:1,last_at:'2026-10-28'}],error:null}) };`);
  await win.eval('loadEventStats()');
  const secs = $$('#eventStatsBody .ev-sec').map((e) => e.dataset.sec);
  t.eq('照頁面順序分段，沒資料的頁面不出現', secs, ['優惠', '排行程', '我的']);
  const mine = $('#eventStatsBody .ev-sec[data-sec="我的"]').textContent;
  t.ok('「我的」那段：功能跟區塊都在', /打開問卷/.test(mine) && /區塊：/.test(mine), mine.replace(/\s+/g, ' '));
  t.ok('每段標題有那一頁的總次數', /優惠\s*·\s*40 次/.test($('#eventStatsBody').textContent));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
