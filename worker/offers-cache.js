/**
 * 壽星日：優惠清單／站台數據的邊緣快取 Worker
 * ---------------------------------------------------------------------------
 * 為什麼要這個：
 *   每一位訪客開網站都要跟 Supabase 要一次「全部已上架的優惠」（400 多筆、
 *   每筆都帶 jsonb，大約 600KB）。免費方案的 Nano 執行個體撐不住——2026-10-04
 *   Threads 一推，24 小時 30 萬次 API 請求、成功率 53%，資料庫被 Disk IO 拖垮，
 *   整站 522 連登入都進不去。
 *
 *   前端的 localStorage 快取只能讓「同一台裝置 10 分鐘內」不重複查；新訪客還是
 *   每個人各查一次。這支 Worker 是「大家共用的那一層」：不管一小時來 10 個人
 *   還是 10000 個人，Supabase 都只被打 6 次（每 10 分鐘一次）。
 *
 * 三個端點（都只接 GET）：
 *   /offers  已上架的優惠（offers_public，自動翻頁，不受 PostgREST 1000 筆上限影響）
 *   /offers/first  開場先畫的前 60 筆（照「依省最多」排，跟網站的預設排序同一套）
 *   /stats   站台數據（site_stats_cached，沒跑 v78 就退回 site_stats）
 *   /board   排行榜那一頁要的 14 份公開統計，打包成一包
 *   /boot    每開一次網頁都要問的兩筆（公告、顯示開關），快取 180 秒（v184 前是 60 秒）
 *   /spend   大家實際花多少（offer_spend_summary），快取 30 分鐘（v183）
 *   POST /events  事件記錄轉送給 Supabase 的 site_events（v183；v185 起在這裡攢 20 秒、很多人的合成一批送）
 *   /img/avatars/…  使用者頭像（Supabase Storage 的公開檔），Cloudflare 存 7 天（v185）
 *
 * 為什麼加 /spend、/events（v183）：2026-11-09 Log Ingestion 一個帳單週期才 5 天就用掉
 * 46%。Logs Explorer 一小時 15,302 個請求，最多的是事件記錄（POST＋瀏覽器先送的 OPTIONS
 * 共 3,300 多次）、offer_spend_summary（每人開站一次，共 1,600 多次）。花費統計每個人拿到
 * 的都一樣，該共用一份；事件記錄經過這裡，瀏覽器送的是 text/plain、沒有自訂標頭，就不會
 * 先送 OPTIONS，這裡轉給 Supabase 是伺服器對伺服器，也沒有。
 *
 * 為什麼加 /boot：Log Ingestion 也超額了（1.5/1 GB）。那個計費看的是**請求次數**
 * 不是大小——每位新訪客開場至少三個請求（公告、顯示開關、記一筆 pageview），
 * 前兩個每個人拿到的都一模一樣。只快取 60 秒是因為顯示開關是管理員即時在調的，
 * 關掉某個東西不該等十分鐘才生效。
 *
 * 為什麼加 /board：量出來每開一次排行榜就是 14 個請求、**32KB**（gzip 後的真實
 * 線上流量）直接打 Supabase。Supabase 免費方案一個月只有 5GB egress，2026-10-12
 * 看到 5.04/5GB 已經超了，排行榜就是最大那一塊。這 14 份全部是公開統計
 * （排行榜、熱門、收藏、走勢…），每個人看到的都一樣，本來就該共用一份。
 *
 * 快取策略：
 *   - 命中就直接回，完全不碰 Supabase
 *   - 過期才去抓一次，抓到就更新快取
 *   - **抓失敗時回上一份還留著的舊資料**（最多 24 小時）。Supabase 掛掉的時候，
 *     網站至少還看得到優惠，不會整頁變成內建的示範資料。
 *
 * 金鑰：anon key 本來就是公開的（前端 config.js 裡就有），放在這裡沒有多洩漏什麼；
 *      真正把關的是資料庫的 RLS。還是建議用環境變數，換金鑰時不用改程式。
 * ---------------------------------------------------------------------------
 * 部署：見同資料夾的 README.md
 */

const DEFAULTS = {
  SUPABASE_URL: 'https://lgshwappyjgnzfkwncjk.supabase.co',
  // SUPABASE_EDGE_KEY 刻意沒有預設值：它是祕密，只能放 Cloudflare 的環境變數。
  // 沒設的話下面會自動退回用 anon key，行為跟 v130 之前一模一樣。
  // 公開的 anon key（跟前端 config.js 同一把）
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxnc2h3YXBweWpnbnpma3duY2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MDgxNTAsImV4cCI6MjEwMTM4NDE1MH0.YEAjEdKM8x7wYU_xvS463xw7EAYA5uQZeqE5ATIgqyQ',
};

/* 快取多久算新鮮。這個數字直接決定 Supabase 的 Egress（免費方案一個月 5 GB）：
   每一次過期，Worker 就要跟 Supabase 重抓一次完整清單 —— 實測 **145 KB**
   （gzip 後、Supabase 那端實際送出的量）。而且 Cloudflare 的快取是**每個機房
   各一份**，台北、高雄、香港各算一次。

     10 分鐘：一天 144 次 × 145 KB ≈ 21 MB／機房／天 ≈ 0.6 GB／月／機房
     30 分鐘：一天  48 次 × 145 KB ≈  7 MB／機房／天 ≈ 0.2 GB／月／機房

   代價是「剛核可的優惠最多晚 30 分鐘才出現在別人的畫面上」。優惠一天改不到
   幾次，這個代價換 3 倍流量是划算的。
   （`/boot` 另外算：顯示開關是管理員即時在調的，那一包維持 60 秒。） */
const FRESH_TTL = 1800;       // 30 分鐘內算新鮮，直接回快取
// 開場那兩筆只快取 60 秒：顯示開關是管理員即時在調的，關掉某個東西
// 不該等十分鐘才在訪客那邊生效。
/* v184：/boot 60 → 180 秒。11/10 一小時裡 Worker 為了 /boot 去問 Supabase 170 次（公告＋顯示開關各 85，
   不同機房各算各的）；拉長到 3 分鐘大約剩三分之一。代價是管理員關掉某個顯示開關，訪客最多 3 分鐘後才看到。 */
/* v187：/boot 180 → 600 秒（celine：「先繼續砍」）。11/11 中午一小時 Worker 還是為了 /boot 問了 Supabase 80 次
   （公告＋顯示開關各 40，機房各算各的）。代價：管理員關掉某個顯示開關、發公告，訪客最多 11 分鐘後才看到
   ——所以瀏覽器那邊只留 60 秒（BROWSER_TTL），不要再疊上 10 分鐘。 */
const TTL = { offers: FRESH_TTL, offersFirst: FRESH_TTL, stats: FRESH_TTL, board: FRESH_TTL, boot: 600, spend: FRESH_TTL };
// 給瀏覽器的 max-age 跟 Worker 自己存的不一樣時寫在這裡（沒寫就一樣）
const BROWSER_TTL = { boot: 60 };

/* 開場先給幾筆。整包 482 筆是 91KB（gzip 後的真實流量）、未壓縮 671KB，手機要
   等它傳完＋解析完才看得到真的資料（在那之前畫面上是內建的示範資料，回報次數
   都是 0）。先給 60 筆大約 14KB，第一螢幕就能換成真的，剩下的在背景補。
   60 是「捲一兩下才會到底」的量；再多就失去意義了。 */
/* v132：跟 Supabase 要哪幾欄。本來是 select=*，實測 146 KB；逐欄點名之後
   128 KB，**一次省 18 KB（12.5%）**。/offers 是整個系統最大的一筆流量，
   這 12.5% 直接乘上「每個機房每天 48 次」。

   沒有要的是 view 裡這五欄：
     slug         前端從來沒讀過
     updated_at   前端從來沒讀過（要「最近更新」的話看的是 last_checked）
     sub_offers   fromRow 沒有對應欄位，整包 jsonb 白傳
     reviewed_by  ─┬─ 只是賦值給 fromRow，下游一個地方都沒用到；
     reviewed_at  ─┘  而且是 uuid／時間戳，壓縮率很差（同一批改掉了）

   ⚠️ 這份清單是寫死的，所以 **view 之後加欄位要記得加進來**，不然前端會
      拿不到那一欄、而且不會報錯。jstest/t31 有一條會比對 fromRow 讀的欄位
      是不是每一個都在這裡，漏掉就測不過。 */
const OFFER_COLS = 'id,brand,category,regions,region_note,offer,membership,membership_type,membership_cost,free_tier,advance_days,advance_note,offer_window,conditions,validity,validity_type,valid_from,valid_until,sources,status,verified,last_checked,submitted_by,review_note,created_at,timing,value_twd,group_name,admin_edit_diff,requires_companion,transferable,min_spend,report_count,last_used_on,success_rate,comment_count,rating_avg,rating_count,wish_count';
/* v166：expected_spend（投稿的人估的「預計會花多少」）。schema_v166 還沒跑的話這一欄不存在，
   整句查詢會 400——所以失敗一次就改用不帶它的那份欄位，Worker 先更新、SQL 後跑也不會壞。 */
const OFFER_COLS_V166 = OFFER_COLS + ',expected_spend';
/* v179：hours、hours_note（投稿的人填的營業時間）。一樣：SQL 還沒跑就一層一層退回舊清單。 */
const OFFER_COLS_V179 = OFFER_COLS_V166 + ',hours,hours_note';
const COLS_CHAIN = [OFFER_COLS_V179, OFFER_COLS_V166, OFFER_COLS];
let colsIdx = 0;
let colsFor = () => COLS_CHAIN[colsIdx];
const isMissingCol = (status, body) => status === 400 && /expected_spend|hours|42703/.test(body || '');
const nextCols = () => (colsIdx < COLS_CHAIN.length - 1 ? (colsIdx++, true) : false);

const FIRST_N = 60;
const STALE_TTL = 86400;      // 上游掛掉時，24 小時內的舊資料還可以頂著用
const PAGE = 1000;            // PostgREST 的 max-rows，一頁最多就是這麼多
const MAX_PAGES = 10;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
};

function cfg(env, key) {
  return (env && env[key]) || DEFAULTS[key];
}

function json(body, { status = 200, ttl = FRESH_TTL, extra = {} } = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // 瀏覽器自己也留一份，重新整理不用再跑一趟 Worker
      'cache-control': `public, max-age=${ttl}`,
      ...CORS,
      ...extra,
    },
  });
}

/** 跟 Supabase 要資料，offers 會自動翻頁（PostgREST 一次最多 1000 筆） */
async function fromSupabase(env, kind) {
  const base = cfg(env, 'SUPABASE_URL');
  const key = cfg(env, 'SUPABASE_ANON_KEY');
  /* v131：身分可以跟 apikey 分開。
       apikey        → 給 Supabase 的閘道看的，必須是這個專案的公開金鑰
       authorization → 決定「用哪個角色查」，PostgREST 看的是這一個
     設了 SUPABASE_EDGE_KEY（edge_reader 角色、只有 Worker 有）之後，整包優惠
     清單就可以從 anon 手上收回來——爬蟲拿著公開的 anon key 也撈不走。
     沒設就退回原本的行為，兩邊都用 anon key。 */
  const authKey = cfg(env, 'SUPABASE_EDGE_KEY') || key;
  const headers = { apikey: key, authorization: `Bearer ${authKey}`, accept: 'application/json' };

  if (kind === 'stats') {
    // v78 的快取版 RPC；沒跑 v78 的話退回直接查 view
    const rpc = await fetch(`${base}/rest/v1/rpc/site_stats_cached`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: '{}',
    });
    if (rpc.ok) return await rpc.json();
    const view = await fetch(`${base}/rest/v1/site_stats?select=*`, { headers });
    if (!view.ok) throw new Error(`site_stats ${view.status}`);
    const rows = await view.json();
    return Array.isArray(rows) ? rows[0] || null : rows;
  }

  if (kind === 'board') return await boardBundle(base, headers);

  if (kind === 'spend') {
    // 用 anon 身分問（schema_v164 只 grant 給 anon／authenticated，edge_reader 不一定有）
    const r = await fetch(`${base}/rest/v1/rpc/offer_spend_summary`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ p_min: 1 }),
    });
    if (!r.ok) throw new Error(`offer_spend_summary ${r.status}`);
    return await r.json();
  }

  if (kind === 'boot') {
    const one = async (path) => {
      const r = await fetch(`${base}/rest/v1/${path}`, { headers });
      if (!r.ok) throw new Error(`${path} ${r.status}`);
      return await r.json();
    };
    // 公告可能一則都沒有（空陣列），那也是答案，不是失敗
    const [ann, flags] = await Promise.all([
      one('current_announcement?select=*&limit=1').catch(() => null),
      one('site_settings?select=key,enabled'),
    ]);
    return { announcement: Array.isArray(ann) ? (ann[0] || null) : (ann || null), flags };
  }

  /* 開場那 60 筆：照 value_twd 由大到小，跟網站預設的「依省最多」同一個排序，
     所以背景把完整那包換上來的時候，前幾張卡片不會整個跳掉重排。 */
  if (kind === 'offersFirst') {
    const first = () => fetch(
      `${base}/rest/v1/offers_public?select=${colsFor()}`
      + `&order=value_twd.desc.nullslast,brand.asc&limit=${FIRST_N}`,
      { headers });
    let res = await first();
    while (!res.ok && isMissingCol(res.status, await res.clone().text()) && nextCols()) {
      res = await first();
    }
    if (!res.ok) throw new Error(`offers_public(first) ${res.status}`);
    return await res.json();
  }

  const out = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    const get = () => fetch(`${base}/rest/v1/offers_public?select=${colsFor()}&order=id.asc`, {
      headers: { ...headers, range: `${from}-${from + PAGE - 1}` },
    });
    let res = await get();
    while (!res.ok && isMissingCol(res.status, await res.clone().text()) && nextCols()) {
      res = await get();
    }
    if (!res.ok) throw new Error(`offers_public ${res.status}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/**
 * 排行榜那一頁的公開統計，一次抓齊。
 *
 * 只收「每個人看到的都一樣」的那些：排行榜本身雖然是 security_invoker 的 view，
 * 但它底下的 usage_reports 讀取政策是 using(true)、profiles_public 也是公開的，
 * 所以登入與否拿到的是同一份；「哪一列是我」是前端自己用 display_name／user_id
 * 比對出來的，不在資料裡。
 *
 * 刻意沒有收進來的：
 *   - site_online_now（即時在線人數，快取了就不即時了；而且它只有幾十個 byte）
 *   - 本月／本週的排行榜（跟著使用者選的期間變，而且預設不會打到）
 *   - 任何跟登入者有關的查詢
 *
 * 單一一份失敗不讓整包失敗——回 null，前端那一塊自己退回直接查。
 * 但核心兩份（lbAll、pop）拿不到就 throw，讓外層改用上一份好資料頂著。
 */
async function boardBundle(base, headers) {
  const jsonHeaders = { ...headers, 'content-type': 'application/json' };
  const get = async (path) => {
    const r = await fetch(`${base}/rest/v1/${path}`, { headers });
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    return await r.json();
  };
  const rpc = async (fn, body) => {
    const r = await fetch(`${base}/rest/v1/rpc/${fn}`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify(body || {}),
    });
    if (!r.ok) throw new Error(`rpc ${fn} ${r.status}`);
    return await r.json();
  };
  const soft = (p) => p.catch(() => null);

  const [lbAll, pop, lbAllPrev, savedAll, popPrev, wish, wishPrev,
         usageDaily, offerUsage, hourDist, wishConv, recent,
         contribAll, contribAllPrev] = await Promise.all([
    get('leaderboard?select=*'),
    get('popular_offers?select=*&limit=50'),
    soft(get('leaderboard_prev?select=display_name,saved_total&order=saved_total.desc&limit=100')),
    soft(get('leaderboard?select=saved_total&limit=5000')),
    soft(get('popular_offers_prev?select=*')),
    soft(get('most_wished?select=*&limit=15')),
    soft(get('most_wished_prev?select=*')),
    soft(rpc('site_usage_daily', { p_days: 180 })),
    soft(rpc('site_offer_usage', { p_days: 365 })),
    soft(rpc('site_usage_hour_distribution', { p_days: 30 })),
    soft(rpc('site_wish_conversion')),
    soft(get('recent_activity?select=*&limit=20')),
    soft(get('contribution_leaderboard?select=*')),
    soft(get('contribution_leaderboard_prev?select=display_name,total_count&order=total_count.desc&limit=100')),
  ]);

  return { lbAll, pop, lbAllPrev, savedAll, popPrev, wish, wishPrev,
           usageDaily, offerUsage, hourDist, wishConv, recent,
           contribAll, contribAllPrev };
}

/**
 * POST /events：網站的事件記錄（v183）。瀏覽器送 text/plain 的 JSON 陣列過來，這裡原樣
 * 轉給 Supabase 的 site_events（RLS 本來就讓 anon 新增，跟網站直接送是同一把 anon key、
 * 同一條政策，沒有多開任何權限）。只做最基本的形狀檢查，免得被拿來亂塞。
 * 失敗回 502，網站那端會改成自己直接送。
 */
const EVENTS_MAX_BYTES = 64000;
const EVENTS_MAX_ROWS = 50;
/* v185：不再一個訪客一批就轉一次——11/10 一小時 314 次。同一台 Worker（isolate）同時接很多人，
   先攢在記憶體裡，20 秒或滿 200 筆才一次送給 Supabase。代價：Worker 剛好被回收的話，最後那
   20 秒的事件會掉（這些只是統計，可以接受）；「即時在線人數」最多晚 20 秒。 */
/* v187：20 → 25 秒。不能再長：ctx.waitUntil 在回應送出後最多只撐 30 秒，超過的話那一批可能來不及送。 */
const EV_HOLD_MS_DEFAULT = 25000;
const EV_BUF_MAX = 200;
let EV_BUF = [];
let EV_FLUSH = null;
async function postEvents(env, rows) {
  const base = cfg(env, 'SUPABASE_URL');
  const key = cfg(env, 'SUPABASE_ANON_KEY');
  return fetch(`${base}/rest/v1/site_events`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  });
}
async function flushEventBuf(env) {
  const rows = EV_BUF;
  EV_BUF = [];
  for (let i = 0; i < rows.length; i += EV_BUF_MAX) {
    try { await postEvents(env, rows.slice(i, i + EV_BUF_MAX)); } catch { /* 統計而已，掉了就算了 */ }
  }
}
function scheduleEventFlush(env, ctx) {
  if (EV_BUF.length >= EV_BUF_MAX) {
    ctx.waitUntil(flushEventBuf(env));
    return;
  }
  if (!EV_FLUSH) {
    const hold = Number(cfg(env, 'EVENTS_HOLD_MS') ?? EV_HOLD_MS_DEFAULT);
    EV_FLUSH = new Promise((r) => setTimeout(r, hold)).then(() => { EV_FLUSH = null; return flushEventBuf(env); });
  }
  ctx.waitUntil(EV_FLUSH);    // 每一個進來的請求都把 Worker 撐到這一批送出去為止
}
async function relayEvents(request, env, ctx) {
  const text = await request.text();
  if (text.length > EVENTS_MAX_BYTES) return json({ error: 'too large' }, { status: 413, ttl: 0 });
  let rows;
  try { rows = JSON.parse(text); } catch { return json({ error: 'bad json' }, { status: 400, ttl: 0 }); }
  const okRow = (r) => r && typeof r === 'object' && !Array.isArray(r) && typeof r.event_type === 'string';
  if (!Array.isArray(rows) || !rows.length || rows.length > EVENTS_MAX_ROWS || !rows.every(okRow)) {
    return json({ error: 'bad rows' }, { status: 400, ttl: 0 });
  }
  EV_BUF.push(...rows);
  scheduleEventFlush(env, ctx);
  return new Response(null, { status: 204, headers: { ...CORS, 'cache-control': 'no-store' } });
}

/**
 * /img/avatars/<使用者 id>/<檔名>：使用者頭像（v185）。
 * 排行榜上每一張頭像，每位看的人都各跟 Supabase Storage 要一次（11/10 一小時 190 次）。
 * 頭像每次上傳檔名都不一樣（內容不會變），可以放心存久一點：Cloudflare 存 7 天，大家共用。
 * 只收 avatars 這個公開 bucket、路徑格式寫死，不能拿來代理別的東西。
 */
const IMG_TTL = 7 * 86400;
async function serveImage(request, env, ctx, rel) {
  if (!/^avatars\/[0-9a-f-]{36}\/[\w.-]{1,100}$/i.test(rel)) return json({ error: 'bad path' }, { status: 400, ttl: 0 });
  const cache = caches.default;
  const key = new Request(`${new URL(request.url).origin}/__cache/img/${rel}`, { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) {
    const res = new Response(hit.body, hit);
    res.headers.set('x-cache', 'HIT');
    return res;
  }
  const up = await fetch(`${cfg(env, 'SUPABASE_URL')}/storage/v1/object/public/${rel}`);
  if (!up.ok) return new Response(null, { status: up.status === 404 ? 404 : 502, headers: { ...CORS, 'cache-control': 'no-store' } });
  const res = new Response(up.body, {
    status: 200,
    headers: {
      'content-type': up.headers.get('content-type') || 'image/jpeg',
      'cache-control': `public, max-age=${IMG_TTL}, immutable`,
      ...CORS,
      'x-cache': 'MISS',
    },
  });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

/**
 * 快取讀寫。
 * 同一份資料存兩把 key：
 *   fresh（10 分鐘）命中就直接用；
 *   stale（24 小時）只有在上游出事時才拿出來頂。
 */
async function serve(request, env, ctx, kind) {
  return cached(request, ctx, kind, TTL[kind] || FRESH_TTL, () => fromSupabase(env, kind), BROWSER_TTL[kind]);
}
async function cached(request, ctx, name, ttl, load, browserTtl) {
  const cache = caches.default;
  const origin = new URL(request.url).origin;
  const freshKey = new Request(`${origin}/__cache/${name}/fresh`, { method: 'GET' });
  const staleKey = new Request(`${origin}/__cache/${name}/stale`, { method: 'GET' });
  const forBrowser = (res) => {
    if (browserTtl != null) res.headers.set('cache-control', `public, max-age=${browserTtl}`);
    return res;
  };

  const hit = await cache.match(freshKey);
  if (hit) {
    const res = new Response(hit.body, hit);
    res.headers.set('x-cache', 'HIT');
    return forBrowser(res);
  }

  try {
    const data = await load();
    const body = JSON.stringify({ at: new Date().toISOString(), data });
    const fresh = json(body, { ttl, extra: { 'x-cache': 'MISS' } });
    const stale = json(body, { ttl: STALE_TTL });
    ctx.waitUntil(Promise.all([
      cache.put(freshKey, fresh.clone()),
      cache.put(staleKey, stale.clone()),
    ]));
    return forBrowser(fresh);
  } catch (err) {
    // 上游掛了：有舊的就先頂著，總比整頁沒資料好
    const old = await cache.match(staleKey);
    if (old) {
      const res = new Response(old.body, old);
      res.headers.set('x-cache', 'STALE');
      res.headers.set('x-upstream-error', String(err && err.message || err).slice(0, 120));
      return forBrowser(res);
    }
    return json({ error: String(err && err.message || err) }, { status: 502, ttl: 0 });
  }
}

/**
 * /tile?y=<整數>&x=<整數>：附近地圖的分店，一格 0.025 度（約 2.5 公里）見方（v187）。
 * 11/11 中午一小時，地圖拖動跟「清單跟著地圖」直接問了 Supabase 約 120 次（加上 OPTIONS），
 * 每個人各問各的。切成固定的格子之後，同一格在同一個機房 30 分鐘內只問一次，大家共用。
 * y = floor(緯度 / 0.025)、x = floor(經度 / 0.025)；只收台灣附近（含金馬）的格子。
 * 台北最密的一格約 450 家，離上限 1000 還遠；真的滿了網站會自己改回直接查。
 */
const TILE_DEG = 0.025;
const TILE_LIMIT = 1000;
function serveTile(request, env, ctx, url) {
  const y = Number(url.searchParams.get('y'));
  const x = Number(url.searchParams.get('x'));
  if (!Number.isInteger(y) || !Number.isInteger(x) || y < 800 || y > 1120 || x < 4640 || x > 4960) {
    return json({ error: 'bad tile' }, { status: 400, ttl: 0 });
  }
  return cached(request, ctx, `tile/${y}_${x}`, FRESH_TTL, async () => {
    const base = cfg(env, 'SUPABASE_URL');
    const key = cfg(env, 'SUPABASE_ANON_KEY');
    const r = await fetch(`${base}/rest/v1/rpc/offer_stores_in_bounds`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        p_south: y * TILE_DEG, p_west: x * TILE_DEG, p_north: (y + 1) * TILE_DEG, p_east: (x + 1) * TILE_DEG,
        p_limit: TILE_LIMIT,
      }),
    });
    if (!r.ok) throw new Error(`offer_stores_in_bounds ${r.status}`);
    return await r.json();
  });
}

/**
 * 首頁（/）。
 * 原本根目錄直接回 404 `{"error":"not found"}`——celine 每次點開網址就看到一行
 * 錯誤訊息，看起來像整支掛了（其實只是「根目錄不是端點」）。改成回一張狀態頁：
 * 用瀏覽器打開就看得懂現在是正常的、三個端點各是什麼、快取有沒有熱著；
 * 用 curl／程式打就還是回 JSON。
 * 只讀快取的「有沒有」，不解析內容，CPU 幾乎不花。
 */
async function statusPage(request) {
  const origin = new URL(request.url).origin;
  const cache = caches.default;
  const warm = {};
  for (const kind of ['offers', 'offersFirst', 'stats', 'board', 'boot', 'spend']) {
    warm[kind] = !!(await cache.match(new Request(`${origin}/__cache/${kind}/fresh`, { method: 'GET' })));
  }
  const now = new Date().toISOString();

  if (!(request.headers.get('accept') || '').includes('text/html')) {
    return json({ ok: true, service: '壽星日 edge cache', paths: ['/offers', '/offers/first', '/stats', '/board', '/boot', '/spend', '/tile', '/events', '/health'], cache: warm, now },
      { ttl: 0 });
  }

  const mark = (on) => on
    ? '<b class="on">快取中</b><span class="dim">10 分鐘內的資料，不會碰資料庫</span>'
    : '<b class="off">等第一個人來</b><span class="dim">下一次請求會去抓一份回來</span>';
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>壽星日 邊緣快取</title><style>
:root{color-scheme:light dark}
body{margin:0;padding:40px 20px;font:16px/1.7 system-ui,-apple-system,"Noto Sans TC",sans-serif;
  background:#faf7f6;color:#1d1413;display:flex;justify-content:center}
@media(prefers-color-scheme:dark){body{background:#140f0f;color:#f2e9e7}}
.box{width:100%;max-width:520px}
h1{font-size:1.25rem;margin:0 0 2px}
.ok{display:inline-block;font-size:.8rem;font-weight:700;color:#16a34a;
  background:#eefbf2;border:1px solid #c9ecd6;border-radius:99px;padding:2px 10px;margin-bottom:18px}
@media(prefers-color-scheme:dark){.ok{background:#0e2416;border-color:#1c4a2c}}
.row{display:flex;flex-wrap:wrap;gap:2px 10px;align-items:baseline;
  padding:11px 0;border-top:1px solid rgba(128,110,108,.25)}
code{font:600 .9rem/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}
a{color:#e8483c}
b{font-size:.8rem}.on{color:#16a34a}.off{color:#8f8482}
.dim{font-size:.78rem;color:#8f8482;flex-basis:100%}
p.note{font-size:.84rem;color:#8f8482;margin-top:22px}
</style></head><body><div class="box">
<h1>壽星日 邊緣快取</h1>
<div class="ok">● 運作中</div>
<div class="row"><code><a href="/offers">/offers</a></code>　優惠清單　${mark(warm.offers)}</div>
<div class="row"><code><a href="/offers/first">/offers/first</a></code>　開場先畫的前 ${FIRST_N} 筆　${mark(warm.offersFirst)}</div>
<div class="row"><code><a href="/stats">/stats</a></code>　站台數據　${mark(warm.stats)}</div>
<div class="row"><code><a href="/board">/board</a></code>　排行榜統計　${mark(warm.board)}</div>
<div class="row"><code><a href="/boot">/boot</a></code>　公告＋顯示開關　${mark(warm.boot)}</div>
<div class="row"><code><a href="/spend">/spend</a></code>　大家實際花多少　${mark(warm.spend)}</div>
<div class="row"><code>/tile?y=…&amp;x=…</code>　附近地圖的分店<span class="dim">一格約 2.5 公里，每格各快取 30 分鐘</span></div>
<div class="row"><code>POST /events</code>　事件記錄轉送<span class="dim">不快取，網站送來的直接轉給資料庫</span></div>
<div class="row"><code><a href="/health">/health</a></code>　健康檢查<span class="dim">不快取，拿來確認這支還活著</span></div>
<p class="note">這個網址是給網站呼叫的，不是給人看的——看到這頁就代表一切正常。
壽星日本體在 <a href="https://birthdaydeals.celine-fu-work.workers.dev">birthdaydeals.celine-fu-work.workers.dev</a>。</p>
<p class="note">${now}</p>
</div></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...CORS },
  });
}

const handler = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // 掛在主站 worker 底下時路徑會是 /api/offers，自己一個 worker 時是 /offers
    const path = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method === 'POST' && path === '/events') return relayEvents(request, env, ctx);

    if (request.method === 'GET' || request.method === 'HEAD') {
      if (path === '/offers') return serve(request, env, ctx, 'offers');
      if (path === '/offers/first') return serve(request, env, ctx, 'offersFirst');
      if (path === '/stats') return serve(request, env, ctx, 'stats');
      if (path === '/board') return serve(request, env, ctx, 'board');
      if (path === '/boot') return serve(request, env, ctx, 'boot');
      if (path === '/spend') return serve(request, env, ctx, 'spend');
      if (path.startsWith('/img/')) return serveImage(request, env, ctx, path.slice(5));
      if (path === '/tile') return serveTile(request, env, ctx, url);
      if (path === '/health') return json({ ok: true, now: new Date().toISOString() }, { ttl: 0 });
    }

    // 如果把這支併進主站的 worker（有 assets 繫結），其餘路徑照原本的靜態檔處理
    // ——包含 `/`，那時候根目錄是網站首頁，不是下面那張狀態頁
    if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') return env.ASSETS.fetch(request);

    if (path === '/' && (request.method === 'GET' || request.method === 'HEAD')) return statusPage(request);

    return json({ error: 'not found', paths: ['/offers', '/offers/first', '/stats', '/board', '/boot', '/spend', '/tile', '/events', '/health'] }, { status: 404, ttl: 0 });
  },
};

export default handler;
