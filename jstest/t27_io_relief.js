/* 止血：不要每開一次網頁就把 site_events 整張表掃兩遍

   Supabase 寄信說 Disk IO 預算快用完、執行個體可能沒有回應；同一天有人回報
   「點 Google 登入一直跳」，截圖是 supabase.co 的 522。root cause 是 site_stats
   這個 view 裡有兩個 count 會掃 site_events，而前端「每一次開啟網頁」都查它一次、
   切到排行榜再查一次——造訪數越多、每一次造訪要讀的資料就越多。

   這支驗的是前端那一半（資料庫那一半在 schema_v78_io_relief.sql）：
   - 優先打 v78 的快取 RPC，不直接查 view
   - 同一個分頁內不重複查；同一台裝置 10 分鐘內不重複查
   - v78 還沒跑（RPC 不存在）要自動退回原本的寫法，畫面不能壞
   - 使用者自己剛回報完要看到最新數字（force）
   - 排行榜跟優惠頁共用同一份，不是各查各的 */
const { boot, tick, makeAsserts } = require('./harness');

function stubSb(win, { rpcOk = true } = {}) {
  const calls = { rpc: [], view: 0 };
  const viewRow = { offer_count: 390, free_count: 12, total_value: 29347, saved_total: 263755,
    report_count: 1903, user_count: 42, pageview_count: 9000, visitor_count: 1200 };
  win.__sb = {
    rpc: (name) => {
      calls.rpc.push(name);
      if (name === 'site_stats_cached') {
        return Promise.resolve(rpcOk
          ? { data: { ...viewRow, saved_total: 111111 }, error: null }
          : { data: null, error: { message: 'function public.site_stats_cached() does not exist' } });
      }
      return Promise.resolve({ data: null, error: null });
    },
    from: () => ({
      select: () => ({ single: () => { calls.view += 1; return Promise.resolve({ data: viewRow, error: null }); } }),
    }),
  };
  win.eval('sb = window.__sb; LIVE = true;');
  return calls;
}

(async () => {
  const t = makeAsserts('t27 站台數據快取（Disk IO 止血）');
  const { win } = await boot();
  const doc = win.document;
  const reset = () => {
    win.eval('STATS_CACHE = null; STATS_CACHE_AT = 0;');
    win.localStorage.removeItem('sxr_site_stats');
  };

  /* ---- 1. 走 v78 的快取 RPC，不直接查 view ---- */
  reset();
  let calls = stubSb(win);
  const s1 = await win.siteStats();
  t.eq('打的是快取 RPC', calls.rpc, ['site_stats_cached']);
  t.eq('沒有直接查 site_stats', calls.view, 0);
  t.eq('拿到的是 RPC 回的那份', s1.saved_total, 111111);

  /* ---- 2. 同一個分頁內不重複查 ---- */
  await win.siteStats();
  await win.siteStats();
  t.eq('同一個分頁內只查一次', calls.rpc.length, 1);

  /* ---- 3. 同一台裝置 10 分鐘內不重複查（重新整理也不查）---- */
  win.eval('STATS_CACHE = null; STATS_CACHE_AT = 0;');   // 模擬重新整理：記憶體沒了，localStorage 還在
  const s3 = await win.siteStats();
  t.eq('重新整理後走 localStorage，不再打資料庫', calls.rpc.length, 1);
  t.eq('數字還是對的', s3.saved_total, 111111);
  const saved = JSON.parse(win.localStorage.getItem('sxr_site_stats'));
  t.ok('localStorage 有存時間戳，不是永久快取', typeof saved.at === 'number' && !!saved.data);

  // 放十一分鐘：過期了就要重新查
  win.localStorage.setItem('sxr_site_stats',
    JSON.stringify({ at: Date.now() - 11 * 60 * 1000, data: saved.data }));
  win.eval('STATS_CACHE = null; STATS_CACHE_AT = 0;');
  await win.siteStats();
  t.eq('超過 10 分鐘才會再查一次', calls.rpc.length, 2);

  /* ---- 4. 使用者自己剛回報完：要看到最新數字 ---- */
  calls = stubSb(win);
  reset();
  await win.siteStats();              // 先暖一份快取
  const fresh = await win.siteStats(true);
  t.eq('force 時直接查最新的 view', calls.view, 1);
  t.eq('force 不走快取 RPC', calls.rpc.length, 1);
  t.eq('拿到的是 view 的數字', fresh.saved_total, 263755);

  /* ---- 5. v78 還沒跑：RPC 不存在也要正常顯示 ---- */
  calls = stubSb(win, { rpcOk: false });
  reset();
  const s5 = await win.siteStats();
  t.eq('RPC 失敗就退回原本的 view', calls.view, 1);
  t.eq('畫面照樣拿得到數字', s5.offer_count, 390);
  await win.loadSiteStats();
  t.ok('優惠頁的小藥丸畫得出來', /共 390 筆優惠/.test(doc.querySelector('#siteStats').textContent),
    doc.querySelector('#siteStats').textContent);

  /* ---- 6. 離線示範模式不打資料庫 ---- */
  win.eval('LIVE = false;');
  reset();
  calls = stubSb(win);
  win.eval('LIVE = false;');
  t.eq('離線模式直接不查', await win.siteStats(), null);
  t.eq('完全沒有查詢送出去', [calls.rpc.length, calls.view], [0, 0]);

  /* ---- 7. 地圖：範圍沒變就不要再查一次分店 ---- */
  win.eval('LIVE = true;');
  const bounds = { getSouth: () => 25.01, getWest: () => 121.51, getNorth: () => 25.09, getEast: () => 121.59 };
  const rpcCalls = [];
  win.__sb2 = { rpc: (name, p) => { rpcCalls.push([name, p]); return Promise.resolve({ data: [], error: null }); } };
  win.eval('sb = window.__sb2; NEAR_PIN_KEY = "";');
  win.eval(`NEAR_MAP = { getZoom:()=>15, getBounds:()=>window.__bounds };
    NEAR_MAP_PINS = { clearLayers(){}, getLayers:()=>[] };`);
  win.__bounds = bounds;
  await win.loadNearPins();
  await win.loadNearPins();
  t.eq('同一個畫面範圍只查一次分店', rpcCalls.filter((c) => c[0] === 'offer_stores_in_bounds').length, 1);
  win.__bounds = { getSouth: () => 24.11, getWest: () => 120.61, getNorth: () => 24.19, getEast: () => 120.69 };
  await win.loadNearPins();
  t.eq('移到別的地方才再查', rpcCalls.filter((c) => c[0] === 'offer_stores_in_bounds').length, 2);
  // 縮太遠會把點清掉，放大回來要重查（不能被「範圍一樣」擋住）
  win.eval('NEAR_MAP = { getZoom:()=>11, getBounds:()=>window.__bounds };');
  await win.loadNearPins();
  win.eval('NEAR_MAP = { getZoom:()=>15, getBounds:()=>window.__bounds };');
  await win.loadNearPins();
  t.eq('縮遠再放大回來要重查', rpcCalls.filter((c) => c[0] === 'offer_stores_in_bounds').length, 3);

  /* ---- 8. 優惠清單也在這台裝置上留一份（開場最重的那一趟往返）---- */
  const offerRows = [
    { id: 1, brand: '快取店', category: '飲料', regions: ['台北市'], offer: '生日免費',
      timing: '當月', status: 'approved', sources: [], report_count: 3 },
  ];
  let offerFetches = 0;
  win.__sb3 = {
    from: () => ({ select: () => ({ limit: () => { offerFetches += 1; return Promise.resolve({ data: offerRows, error: null }); } }) }),
  };
  win.eval('sb = window.__sb3; LIVE = true;');
  win.localStorage.removeItem('sxr_offers_cache');

  await win.loadOffers();
  t.eq('第一次要去資料庫拿', offerFetches, 1);
  t.eq('拿到的優惠有進 OFFERS', win.eval('OFFERS.length'), 1);
  t.ok('存成這台裝置上的快取', !!win.localStorage.getItem('sxr_offers_cache'));

  win.eval('OFFERS = [];');
  await win.loadOffers();
  t.eq('十分鐘內重開不再查一次', offerFetches, 1);
  t.eq('畫面照樣有資料（從快取還原）', win.eval('OFFERS.length'), 1);
  t.eq('存的是原始資料列，不是畫面用的物件', win.eval('OFFERS[0].brand'), '快取店');

  // 使用者自己剛回報／投稿完：要看到最新的，不能給他舊的
  await win.loadOffers(true);
  t.eq('force 一定重新查', offerFetches, 2);

  // 過期就重新查
  const raw = JSON.parse(win.localStorage.getItem('sxr_offers_cache'));
  win.localStorage.setItem('sxr_offers_cache',
    JSON.stringify({ at: Date.now() - 11 * 60 * 1000, rows: raw.rows }));
  await win.loadOffers();
  t.eq('超過 10 分鐘才會再查一次', offerFetches, 3);

  // 快取壞掉（手動改壞、版本不合）不能讓整個網站打不開
  win.localStorage.setItem('sxr_offers_cache', '{壞掉的 JSON');
  offerFetches = 0;
  await win.loadOffers();
  t.eq('快取壞掉就當作沒有，照樣查得到', offerFetches, 1);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
