/* 附近有優惠的店（feature/geo）

   Z（9/9）「人在北車就從北車方圓距離由近到遠」、王（9/6）「人在 101 附近有哪些店有優惠」、
   Cindy（9/13）「篩選加地理距離」。這支驗前端那一層：定位 → 呼叫 nearest_offer_stores →
   列表只留有分店的、由近到遠、卡片寫最近分店＋導航。

   特別驗幾個容易壞、使用者又一定會遇到的情況：
   - 定位被拒絕：不能整個功能卡住，要改成打開地圖讓人點位置（測試裡 Leaflet 載不到，
     順便驗「地圖載入失敗」有講人話、不會把畫面弄壞）
   - 手快連續換距離：舊的 RPC 比新的晚回來時，不能蓋掉新結果
   - 使用者自己改了排序：之後換距離不能又被強制切回「離我最近」
   - 重新整理後 saveFilters 還原成 distance 排序、但附近模式沒開：要退回預設排序
   - 資料庫還沒跑 v58：要提示管理員去跑，列表維持原樣
   - 隱私：座標不能寫進 localStorage */
const { boot, tick, makeSb, makeAsserts } = require('./harness');

const LAT = 25.0478, LNG = 121.5170;

function setGeo(win, mode) {
  Object.defineProperty(win.navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition(ok, fail) {
        win.setTimeout(() => {
          if (mode === 'deny') fail({ code: 1, message: 'User denied Geolocation' });
          else ok({ coords: { latitude: LAT, longitude: LNG, accuracy: 30 } });
        }, 0);
      },
    },
  });
}

(async () => {
  const t = makeAsserts('t06 附近模式');
  const { win } = await boot();
  const doc = win.document;
  const cards = () => [...doc.querySelectorAll('#grid .card')];

  // 用開機時種子資料畫出來的前三張卡片當測試對象，不用自己捏一份完整的優惠物件
  const ids = cards().slice(0, 3).map((c) => c.dataset.id);
  const totalCards = cards().length;
  t.ok('種子資料至少有 3 張卡片可以測', ids.length === 3 && totalCards > 3, { ids, totalCards });

  /* ================= 離線模式：直接講清楚，不假裝在找 ================= */
  win.__alerts.length = 0;
  doc.querySelector('#btnNear').click();
  await tick(win, 2);
  t.ok('離線模式按附近會提示原因', /離線模式/.test(win.__alerts[0] || ''), win.__alerts);
  t.ok('離線模式不會打開附近狀態列', doc.querySelector('#nearBar').classList.contains('hidden'));

  /* ================= 正常定位 ================= */
  const rpcCalls = [];
  const rowsFor = (km) => [
    { offer_id: ids[2], store_id: 12, place_id: 'pid-2', name: '北車站前店', address: '台北市中正區', lat: 25.046, lng: 121.516, distance_m: 348, stores_within: 3 },
    { offer_id: ids[0], store_id: 10, place_id: null, name: '忠孝店', address: '台北市中正區', lat: 25.042, lng: 121.527, distance_m: 1234, stores_within: 1 },
  ].filter((r) => r.distance_m <= km * 1000);
  const sb = makeSb({
    rpcs: { nearest_offer_stores: (p) => { rpcCalls.push(p); return { data: rowsFor(p.p_km), error: null }; } },
  });
  win.__sb = sb;
  win.eval('sb = window.__sb; LIVE = true;');
  setGeo(win, 'ok');

  doc.querySelector('#btnNear').click();
  await tick(win, 6);

  t.eq('用定位到的座標、預設 3 公里查', rpcCalls[0], { p_lat: LAT, p_lng: LNG, p_km: 3 });
  t.ok('附近狀態列打開', !doc.querySelector('#nearBar').classList.contains('hidden'));
  t.eq('附近按鈕顯示為開啟', doc.querySelector('#btnNear').getAttribute('aria-pressed'), 'true');
  t.ok('狀態列寫出位置跟筆數',
    /你目前的位置/.test(doc.querySelector('#nearStatus').textContent) && /2 筆/.test(doc.querySelector('#nearStatus').textContent),
    doc.querySelector('#nearStatus').textContent);
  t.eq('自動切到離我最近排序', doc.querySelector('#sort').value, 'distance');
  t.eq('列表只剩有分店的優惠，而且由近到遠', cards().map((c) => c.dataset.id), [ids[2], ids[0]]);

  const line0 = cards()[0].querySelector('.near-line');
  t.ok('最近那張卡片寫距離（公尺取整到 10）', line0 && /350 公尺/.test(line0.textContent), line0 && line0.textContent);
  t.ok('寫出分店名稱', line0 && /北車站前店/.test(line0.textContent));
  t.ok('寫出範圍內共幾家', line0 && /3 公里內共 3 家/.test(line0.textContent));
  const nav0 = cards()[0].querySelector('.near-nav');
  t.ok('導航連結帶 place_id 指到那一家店',
    nav0 && /google\.com\/maps\/search/.test(nav0.href) && /query_place_id=pid-2/.test(nav0.href), nav0 && nav0.href);
  t.eq('導航連結開新分頁', nav0 && nav0.target, '_blank');
  const line1 = cards()[1].querySelector('.near-line');
  t.ok('超過 1 公里改用公里、只有一家就不寫共幾家',
    line1 && /1\.2 公里/.test(line1.textContent) && !/共/.test(line1.textContent), line1 && line1.textContent);
  t.ok('沒有 place_id 時導航連結只帶座標',
    !/query_place_id/.test(cards()[1].querySelector('.near-nav').href));
  t.ok('筆數列標出距離範圍', /📍 3 公里內/.test(doc.querySelector('#count').textContent),
    doc.querySelector('#count').textContent);

  // 點導航不能順便打開整張卡片的詳情
  const detailCalls = [];
  const realOpenDetail = win.openDetail;
  win.openDetail = (id) => detailCalls.push(id);
  nav0.addEventListener('click', (e) => e.preventDefault());   // jsdom 不支援真的導頁，擋掉避免噴 not implemented
  nav0.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  await tick(win, 1);
  win.openDetail = realOpenDetail;
  t.eq('點導航不會打開卡片詳情', detailCalls.length, 0);

  /* ================= 換距離 ================= */
  const km = doc.querySelector('#nearKm');
  km.value = '1';
  km.dispatchEvent(new win.Event('change'));
  await tick(win, 4);
  t.eq('換成 1 公里重新查', rpcCalls[rpcCalls.length - 1].p_km, 1);
  t.eq('1 公里內只剩一筆', cards().map((c) => c.dataset.id), [ids[2]]);
  t.eq('距離範圍會記住', win.localStorage.getItem('sxr_near_km'), '1');

  /* ================= 使用者自己改排序後，換距離不能又被切回去 ================= */
  const sort = doc.querySelector('#sort');
  sort.value = 'brand';
  sort.dispatchEvent(new win.Event('input', { bubbles: true }));
  km.value = '5';
  km.dispatchEvent(new win.Event('change'));
  await tick(win, 4);
  t.eq('使用者選的排序被保留', sort.value, 'brand');

  /* ================= 手快連續換距離：晚回來的舊結果不能蓋掉新的 ================= */
  const slowFirst = [];
  win.__sb.rpc = (name, p) => new Promise((res) => {
    const delay = slowFirst.length === 0 ? 40 : 0;
    slowFirst.push(p.p_km);
    win.setTimeout(() => res({ data: p.p_km === 10 ? rowsFor(10) : [], error: null }), delay);
  });
  win.eval('sb = window.__sb;');
  km.value = '30'; km.dispatchEvent(new win.Event('change'));   // 慢，回空陣列
  km.value = '10'; km.dispatchEvent(new win.Event('change'));   // 快，回兩筆
  await new Promise((r) => win.setTimeout(r, 80));
  await tick(win, 3);
  t.eq('兩次查詢都有送出', slowFirst, [30, 10]);
  t.eq('最後畫面是比較新的那次（10 公里、兩筆）', cards().length, 2);

  /* ================= 範圍內沒有分店 ================= */
  win.__sb = makeSb({ rpcs: { nearest_offer_stores: { data: [], error: null } } });
  win.eval('sb = window.__sb;');
  km.value = '3'; km.dispatchEvent(new win.Event('change'));
  await tick(win, 4);
  t.eq('沒有分店時列表是空的', cards().length, 0);
  t.ok('空狀態講清楚是距離內沒有分店',
    /3 公里內還沒有找到有優惠的分店/.test(doc.querySelector('#emptyTitle').textContent),
    doc.querySelector('#emptyTitle').textContent);

  /* ================= 資料庫還沒跑 v58 ================= */
  win.__sb = makeSb({ rpcs: { nearest_offer_stores: { data: null, error: { message: 'function public.nearest_offer_stores does not exist' } } } });
  win.eval('sb = window.__sb;');
  km.value = '5'; km.dispatchEvent(new win.Event('change'));
  await tick(win, 4);
  t.ok('提示管理員執行 schema_v58', /schema_v58/.test(doc.querySelector('#nearStatus').textContent),
    doc.querySelector('#nearStatus').textContent);
  t.eq('查詢失敗時列表不被篩掉', cards().length, totalCards);

  /* ================= 關閉附近模式 ================= */
  doc.querySelector('#btnNearClose').click();
  await tick(win, 2);
  t.ok('狀態列收起來', doc.querySelector('#nearBar').classList.contains('hidden'));
  t.eq('按鈕顯示為關閉', doc.querySelector('#btnNear').getAttribute('aria-pressed'), 'false');
  t.eq('卡片不再有最近分店那一行', doc.querySelectorAll('#grid .near-line').length, 0);
  t.eq('列表恢復全部', cards().length, totalCards);

  /* ================= 重新整理還原出 distance 排序，但附近模式沒開 ================= */
  sort.value = 'distance';
  win.render();
  t.eq('沒開附近模式時 distance 排序退回預設', sort.value, 'value');

  /* ================= 定位被拒絕 ================= */
  setGeo(win, 'deny');
  win.__sb = makeSb({ rpcs: { nearest_offer_stores: { data: [], error: null } } });
  win.eval('sb = window.__sb;');
  doc.querySelector('#btnNear').click();
  await tick(win, 8);
  t.ok('拒絕定位時說明原因、引導改點地圖',
    /沒有定位權限/.test(doc.querySelector('#nearStatus').textContent) && /地圖/.test(doc.querySelector('#nearStatus').textContent),
    doc.querySelector('#nearStatus').textContent);
  t.ok('地圖載不到時講人話', /地圖載入失敗/.test(doc.querySelector('#nearMapHint').textContent),
    doc.querySelector('#nearMapHint').textContent);
  t.ok('地圖載不到時不會留一塊空白框', doc.querySelector('#nearMapWrap').classList.contains('hidden'));
  t.ok('拒絕定位時列表維持原樣（沒有位置就不篩）', cards().length === totalCards, cards().length);

  /* ================= 隱私：座標沒有寫進瀏覽器儲存 ================= */
  const stored = Object.keys(win.localStorage).map((k) => `${k}=${win.localStorage.getItem(k)}`).join('|');
  t.ok('localStorage 裡找不到座標', !/25\.04|121\.5/.test(stored), stored);

  /* ================= 地圖圖磚（celine：要能承受大流量）================= */
  const tiles = () => win.mapTileConfig();
  t.ok('預設不是 OSM 官方圖磚（使用政策不適合大流量）', !/tile\.openstreetmap\.org/.test(tiles().url), tiles().url);
  t.ok('預設圖磚有標示出處', /OpenStreetMap/.test(tiles().attribution) && /CARTO/.test(tiles().attribution));
  t.ok('預設放大到 20 級', tiles().maxZoom >= 19);
  win.MAPTILER_KEY = 'k e y/1';
  t.ok('設了 MapTiler 金鑰就改用 MapTiler', /api\.maptiler\.com/.test(tiles().url), tiles().url);
  t.ok('金鑰有做網址跳脫', tiles().url.includes('k%20e%20y%2F1'), tiles().url);
  t.ok('MapTiler 也有標示出處', /MapTiler/.test(tiles().attribution));
  win.MAP_TILES = { url: 'https://example.com/{z}/{x}/{y}.png', attribution: '自家圖磚' };
  t.eq('config.js 直接指定圖磚時優先用它', tiles().url, 'https://example.com/{z}/{x}/{y}.png');
  t.ok('沒指定的欄位用預設值補上', tiles().maxZoom >= 19);
  delete win.MAP_TILES; delete win.MAPTILER_KEY;

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
