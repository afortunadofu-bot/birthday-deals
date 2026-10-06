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
 * 兩個端點（都只接 GET）：
 *   /offers  已上架的優惠（offers_public，自動翻頁，不受 PostgREST 1000 筆上限影響）
 *   /stats   站台數據（site_stats_cached，沒跑 v78 就退回 site_stats）
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
  // 公開的 anon key（跟前端 config.js 同一把）
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxnc2h3YXBweWpnbnpma3duY2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MDgxNTAsImV4cCI6MjEwMTM4NDE1MH0.YEAjEdKM8x7wYU_xvS463xw7EAYA5uQZeqE5ATIgqyQ',
};

const FRESH_TTL = 600;        // 10 分鐘內算新鮮，直接回快取
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
  const headers = { apikey: key, authorization: `Bearer ${key}`, accept: 'application/json' };

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
    const fresh = json(body, { ttl: FRESH_TTL, extra: { 'x-cache': 'MISS' } });
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

const handler = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // 掛在主站 worker 底下時路徑會是 /api/offers，自己一個 worker 時是 /offers
    const path = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (request.method === 'GET' || request.method === 'HEAD') {
      if (path === '/offers') return serve(request, env, ctx, 'offers');
      if (path === '/stats') return serve(request, env, ctx, 'stats');
      if (path === '/health') return json({ ok: true, now: new Date().toISOString() }, { ttl: 0 });
    }

    // 如果把這支併進主站的 worker（有 assets 繫結），其餘路徑照原本的靜態檔處理
    if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') return env.ASSETS.fetch(request);

    return json({ error: 'not found', paths: ['/offers', '/stats', '/health'] }, { status: 404, ttl: 0 });
  },
};

export default handler;
