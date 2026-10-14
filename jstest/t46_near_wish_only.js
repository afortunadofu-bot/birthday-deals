/* celine：「我希望地圖那裡可以一鍵查看已收藏的附近店家」

   「附近」一開是全部幾百筆，但收藏的那幾家通常才是真的打算去的。
   這顆把列表跟地圖同時收成只剩收藏的，再按一次就全部回來。

   兩個地方要一起動：卡片列表（render 的篩選）跟地圖上的點（paintNearPins）。
   切換時刻意不重查資料庫——地圖是預設開啟的，每一次查詢都算在資料庫頭上。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

(async () => {
  const t = makeAsserts('t46 附近：只看收藏');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  t.ok('附近那一排有這顆', !!$('#btnNearWish') && !!$('#btnNearWish').closest('#nearBar'));
  t.ok('一開始是沒按下的', $('#btnNearWish').getAttribute('aria-pressed') === 'false');

  /* 假的地圖：只要能收點、能數點就好，不載 Leaflet */
  // 用站上真的那幾筆（種子資料）當樣本，不自己捏——卡片要畫得出來
  const sample = JSON.parse(win.eval('JSON.stringify(OFFERS.slice(0,3).map(o=>({id:String(o.id),brand:o.brand})))'));
  const [A, B, C] = sample;
  win.eval(`
    WISH=new Set(['${B.id}']);
    NEAR.active=true; NEAR.lat=25; NEAR.lng=121; NEAR.label='測試';
    NEAR.byOffer=new Map(${JSON.stringify(sample.map((o) => [o.id, {}]))});
    NEAR_PIN_ROWS=${JSON.stringify(sample.map((o) => ({ offer_id: o.id, lat: 25, lng: 121, name: o.brand + ' 門市' })))};
    window.__pins=[];
    NEAR_MAP={};
    NEAR_MAP_PINS={ clearLayers(){ window.__pins.length=0; },
                    getLayers(){ return window.__pins; } };
    window.L={ circleMarker(ll, opt){
      const m={ll, opt, bindPopup(html){ m.html=html; return m; },
                addTo(g){ window.__pins.push(m); return m; }};
      return m; } };
    render();
  `);
  const pins = () => win.__pins;
  const listIds = () => [...doc.querySelectorAll('#grid .card')].map((c) => c.dataset.id);

  win.eval('paintNearPins()');
  t.eq('沒按之前：三家店都在地圖上', pins().length, 3);
  t.eq('列表也是三筆', listIds().length, 3);
  const pinOf = (o) => pins().find((p) => p.html.includes(o.brand));
  t.ok('收藏的那一家本來就畫得比較大（一眼看得出哪家是自己收的）',
    pinOf(B).opt.radius > pinOf(A).opt.radius);
  t.ok('收藏的點上會寫「已收藏」', /已收藏/.test(pinOf(B).html));

  // 按下去
  $('#btnNearWish').click();
  await tick(win, 2);
  t.ok('按鈕變成按下的狀態', $('#btnNearWish').getAttribute('aria-pressed') === 'true');
  t.eq('地圖只剩收藏的那一家', pins().length, 1);
  t.ok('剩下的就是收藏的那家', pins()[0].html.includes(B.brand));
  t.eq('列表也只剩那一筆', listIds(), [B.id]);
  t.ok('狀態列照「收藏的」數，不是照全部數',
    /有 1 收藏的優惠有分店/.test($('#nearStatus').textContent), $('#nearStatus').textContent);
  t.ok('地圖下面講清楚藏起來幾家、怎麼看回全部',
    /另外 2 家/.test($('#nearMapHint').textContent) && /再按一次/.test($('#nearMapHint').textContent),
    $('#nearMapHint').textContent);

  // 切換不重查資料庫
  t.ok('切換只重畫，不重查（按鈕只呼叫 paintNearPins）',
    /btnNearWish'\)\.onclick[\s\S]{0,220}paintNearPins\(\)/.test(index)
    && !/btnNearWish'\)\.onclick[\s\S]{0,220}loadNearPins\(\)/.test(index));

  // 在「只看收藏」的狀態下按書籤收藏／取消，地圖要立刻跟上
  win.eval(`LIVE=false; me=null; toggleWish('${A.id}')`);
  await tick(win, 2);
  t.eq('剛收藏的那家馬上出現在地圖上', pins().length, 2);
  win.eval(`toggleWish('${B.id}')`);
  await tick(win, 2);
  t.eq('取消收藏的馬上消失', pins().length, 1);
  t.ok('剩下的是剛收藏的那家', pins()[0].html.includes(A.brand));

  // 再按一次就全部回來
  $('#btnNearWish').click();
  await tick(win, 2);
  t.eq('全部回來', pins().length, 3);
  t.eq('列表也全部回來', listIds().length, 3);

  // 待辦清單是空的時候，不要只給一張空白地圖
  win.eval(`WISH=new Set(); NEAR.wishOnly=true; renderNearBar();`);
  t.ok('清單空的時候告訴他怎麼收藏', /待辦清單還是空的/.test($('#nearStatus').textContent),
    $('#nearStatus').textContent);
  win.eval(`WISH=new Set(['99']); renderNearBar();`);
  t.ok('有收藏但附近沒有時，建議把距離調遠', /距離調遠/.test($('#nearStatus').textContent),
    $('#nearStatus').textContent);

  // 關掉附近模式要一起歸零，不然下次打開會莫名其妙只剩幾筆
  win.eval('stopNear()');
  t.ok('關掉附近就把這個狀態收掉', win.eval('NEAR.wishOnly') === false);
  t.ok('按鈕也退回沒按下', $('#btnNearWish').getAttribute('aria-pressed') === 'false');

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
