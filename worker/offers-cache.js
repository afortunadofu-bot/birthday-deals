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
 *   /boot    每開一次網頁都要問的兩筆（公告、顯示開關），快取 60 秒
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
const TTL = { offers: FRESH_TTL, offersFirst: FRESH_TTL, stats: FRESH_TTL, board: FRESH_TTL, boot: 60 };

/* 開場先給幾筆。整包 482 筆是 91KB（gzip 後的真實流量）、未壓縮 671KB，手機要
   等它傳完＋解析完才看得到真的資料（在那之前畫面上是內建的示範資料，回報次數
   都是 0）。先給 60 筆大約 14KB，第一螢幕就能換成真的，剩下的在背景補。
   60 是「捲一兩下才會到底」的量；再多就失去意義了。 */
const FIRST_N = 60;
const STALE_TTL = 86400;      // 上游掛掉時，24 小時內的舊資料還可以頂著用
const PAGE = 1000;            // PostgREST 的 max-rows，一頁最多就是這麼多
const MAX_PAGES = 10;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
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
    const res = await fetch(
      `${base}/rest/v1/offers_public?select=*&order=value_twd.desc.nullslast,brand.asc&limit=${FIRST_N}`,
      { headers });
    if (!res.ok) throw new Error(`offers_public(first) ${res.status}`);
    return await res.json();
  }

  const out = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    const res = await fetch(`${base}/rest/v1/offers_public?select=*&order=id.asc`, {
      headers: { ...headers, range: `${from}-${from + PAGE - 1}` },
    });
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
 * 快取讀寫。
 * 同一份資料存兩把 key：
 *   fresh（10 分鐘）命中就直接用；
 *   stale（24 小時）只有在上游出事時才拿出來頂。
 */
async function serve(request, env, ctx, kind) {
  const cache = caches.default;
  const origin = new URL(request.url).origin;
  const freshKey = new Request(`${origin}/__cache/${kind}/fresh`, { method: 'GET' });
  const staleKey = new Request(`${origin}/__cache/${kind}/stale`, { method: 'GET' });

  const hit = await cache.match(freshKey);
  if (hit) {
    const res = new Response(hit.body, hit);
    res.headers.set('x-cache', 'HIT');
    return res;
  }

  try {
    const data = await fromSupabase(env, kind);
    const body = JSON.stringify({ at: new Date().toISOString(), data });
    const fresh = json(body, { ttl: TTL[kind] || FRESH_TTL, extra: { 'x-cache': 'MISS' } });
    const stale = json(body, { ttl: STALE_TTL });
    ctx.waitUntil(Promise.all([
      cache.put(freshKey, fresh.clone()),
      cache.put(staleKey, stale.clone()),
    ]));
    return fresh;
  } catch (err) {
    // 上游掛了：有舊的就先頂著，總比整頁沒資料好
    const old = await cache.match(staleKey);
    if (old) {
      const res = new Response(old.body, old);
      res.headers.set('x-cache', 'STALE');
      res.headers.set('x-upstream-error', String(err && err.message || err).slice(0, 120));
      return res;
    }
    return json({ error: String(err && err.message || err) }, { status: 502, ttl: 0 });
  }
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
  for (const kind of ['offers', 'offersFirst', 'stats', 'board', 'boot']) {
    warm[kind] = !!(await cache.match(new Request(`${origin}/__cache/${kind}/fresh`, { method: 'GET' })));
  }
  const now = new Date().toISOString();

  if (!(request.headers.get('accept') || '').includes('text/html')) {
    return json({ ok: true, service: '壽星日 edge cache', paths: ['/offers', '/offers/first', '/stats', '/board', '/boot', '/health'], cache: warm, now },
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

    if (request.method === 'GET' || request.method === 'HEAD') {
      if (path === '/offers') return serve(request, env, ctx, 'offers');
      if (path === '/offers/first') return serve(request, env, ctx, 'offersFirst');
      if (path === '/stats') return serve(request, env, ctx, 'stats');
      if (path === '/board') return serve(request, env, ctx, 'board');
      if (path === '/boot') return serve(request, env, ctx, 'boot');
      if (path === '/health') return json({ ok: true, now: new Date().toISOString() }, { ttl: 0 });
    }

    // 如果把這支併進主站的 worker（有 assets 繫結），其餘路徑照原本的靜態檔處理
    // ——包含 `/`，那時候根目錄是網站首頁，不是下面那張狀態頁
    if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') return env.ASSETS.fetch(request);

    if (path === '/' && (request.method === 'GET' || request.method === 'HEAD')) return statusPage(request);

    return json({ error: 'not found', paths: ['/offers', '/offers/first', '/stats', '/board', '/boot', '/health'] }, { status: 404, ttl: 0 });
  },
};

export default handler;
