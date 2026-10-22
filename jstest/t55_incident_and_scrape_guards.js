/* v130／v131：防「再出一次事故」與「anon key 被拿去打」

   celine：「先做預防這幾個的」（SUPABASE-流量.md →「以後怎樣才會爆掉」1、2）

   這支驗三件事：
   A. Worker 的 apikey 跟 authorization 真的分開了（v131 的關鍵）
   B. 沒設 SUPABASE_EDGE_KEY 時行為完全不變（不會把現在的站弄壞）
   C. 兩支 SQL 的內容該有的都有、該先別跑的真的是註解掉的 */
const fs = require('fs');
const path = require('path');
const { makeAsserts } = require('./harness');

function loadWorker() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'offers-cache.js'), 'utf8');
  const cjs = src.replace(/export default handler;?/, 'module.exports = handler;');
  const file = path.join(require('os').tmpdir(), `guards-${Date.now()}.cjs`);
  fs.writeFileSync(file, cjs);
  const mod = require(file);
  fs.unlinkSync(file);
  return mod;
}

function fakeCaches() {
  const store = new Map();
  return {
    store,
    default: {
      async match(req) { const hit = store.get(req.url); return hit ? hit.clone() : undefined; },
      async put(req, res) { store.set(req.url, res.clone()); },
    },
  };
}

(async () => {
  const t = makeAsserts('t55 事故與爬蟲的預防');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

  /* ================= A／B. Worker 的兩個標頭 ================= */
  const worker = loadWorker();
  const ctx = { waitUntil: (p) => p };
  const realFetch = globalThis.fetch;
  let seen = [];
  globalThis.caches = fakeCaches();
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), headers: (init && init.headers) || {} });
    return Response.json([{ id: 1, brand: '測試' }]);
  };

  const ANON = 'anon.key.aaa';
  const EDGE = 'edge.key.bbb';

  const hit = async (env) => {
    seen = [];
    globalThis.caches = fakeCaches();     // 每次都是全新的快取，一定會打上游
    await worker.fetch(new Request('https://api.test/offers'), env, ctx);
    return seen[0];
  };

  let call = await hit({ SUPABASE_ANON_KEY: ANON, SUPABASE_EDGE_KEY: EDGE });
  t.eq('apikey 還是專案的公開金鑰（閘道要認得）', call.headers.apikey, ANON);
  t.eq('authorization 換成 edge_reader 那把', call.headers.authorization, `Bearer ${EDGE}`);
  t.ok('兩個標頭真的不一樣', call.headers.apikey !== call.headers.authorization.slice(7));

  call = await hit({ SUPABASE_ANON_KEY: ANON });
  t.eq('沒設 EDGE_KEY：apikey 不變', call.headers.apikey, ANON);
  t.eq('沒設 EDGE_KEY：authorization 退回 anon，行為跟以前一樣',
    call.headers.authorization, `Bearer ${ANON}`);

  t.ok('EDGE_KEY 沒有預設值（祕密不能寫進原始碼）',
    !/SUPABASE_EDGE_KEY\s*:/.test(read('worker/offers-cache.js').split('function cfg')[0]));

  globalThis.fetch = realFetch;

  /* ================= C. 兩支 SQL ================= */
  const v130 = read('schema_v130_guards.sql');
  t.ok('v130 給 anon 設了查詢時間上限',
    /alter role anon\s+set statement_timeout/.test(v130));
  t.ok('v130 給 authenticated 設的比較寬（管理員那邊真的在算東西）',
    /alter role authenticated set statement_timeout = '20s'/.test(v130));
  t.ok('v130 有成本稽核函式', /create or replace function public\.admin_query_cost\(\)/.test(v130));
  t.ok('稽核函式會抓 Seq Scan', /Seq Scan/.test(v130));
  t.ok('稽核函式只有管理員能跑', /if not public\.is_admin\(\)/.test(v130));
  t.ok('稽核函式對 anon 收掉執行權',
    /revoke execute on function public\.admin_query_cost\(\) from public, anon/.test(v130));
  t.ok('清單裡包含前端直接打、沒有快取擋著的那幾份',
    ['site_stats', 'offer_stats', 'wishlist_counts'].every((v) => v130.includes(`('${v}',`)));

  const v131 = read('schema_v131_edge_reader.sql');
  t.ok('v131 開 edge_reader 角色', /create role edge_reader nologin noinherit/.test(v131));
  t.ok('v131 把角色給 authenticator（少這行會 500）',
    /grant edge_reader to authenticator/.test(v131));
  t.ok('v131 授權的是 Worker 真的會讀的那幾份',
    ['offers_public', 'current_announcement', 'site_settings', 'leaderboard', 'recent_activity']
      .every((v) => v131.includes(`public.${v}`)));
  t.ok('最危險的那一行（收掉 anon）刻意是註解掉的，要她確認 Worker 活著才跑',
    /^--\s*revoke select on public\.offers_public from anon;/m.test(v131)
    && !/^\s*revoke select on public\.offers_public from anon;/m.test(v131));
  t.ok('有寫怎麼還原', /grant select on public\.offers_public to anon/.test(v131));
  t.ok('有講清楚登入的人不受影響', /authenticated/.test(v131) && /退路還在/.test(v131));
  /* offers_public 是 security_invoker 的 view：它用呼叫者的權限去讀底下的
     public.offers。只 grant 那個 view 的話，Worker 會拿到 permission denied。 */
  t.ok('有處理 security_invoker（只授權 view 不夠）', /security_invoker/.test(v131));
  t.ok('沿著相依關係自動授權底下的表，不是手寫清單',
    /with recursive needed/.test(v131) && /pg_rewrite/.test(v131));
  t.ok('最後有一關是真的切成 edge_reader 查一次', /set role edge_reader/.test(v131));
  t.ok('有講「0 筆」跟「permission denied」各代表什麼',
    /0 筆/.test(v131) && /permission denied/.test(v131));

  const mint = read('mint_edge_jwt.py');
  t.ok('產金鑰的腳本用 getpass 讀祕密（不會顯示、不會留檔）', /getpass\.getpass/.test(mint));
  // urlopen( 不算（那是去驗金鑰，不是寫檔）——用 \b 把它排除掉
  t.ok('腳本不會把祕密寫到任何檔案', !/\bopen\(/.test(mint));
  t.ok('腳本叫她新增 EDGE_KEY，不是去改 ANON_KEY', /不要動原本的 SUPABASE_ANON_KEY/.test(mint));
  /* 2026-10-21 的事故：金鑰沒驗就貼上 Cloudflare，Worker 全部 401，
     站台靠 24 小時的舊快取撐了一整天都看不出來。檢查要搬到上線之前。 */
  t.ok('簽完會自己拿去 Supabase 驗一次', /def verify\(/.test(mint) && /offers_public\?select=id/.test(mint));
  t.ok('驗不過就不印 token（不可能再貼一把壞金鑰上去）',
    /if not verify\(token\):/.test(mint) && /不要貼到 Cloudflare/.test(mint));
  t.ok('401／403／0 筆分別講清楚是什麼問題',
    /401/.test(mint) && /403/.test(mint) && /RLS 把它全擋掉/.test(mint));
  t.ok('輸出沒有 cp950 印不出來的符號（她的終端機是 Big5）',
    !/[✓✗⚠]/.test(mint.split('def main')[1] || ''));
  t.ok('SQL 檔寫了 Worker 壞掉怎麼最快救回來',
    /兩個都刪掉/.test(v131) || /兩個都刪掉/.test(v131) || /SUPABASE_EDGE_KEY 兩個都刪掉/.test(v131));

  t.done();
})();
