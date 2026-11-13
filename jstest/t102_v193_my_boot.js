/* v193 celine：「你先繼續砍」（Supabase 11/2 寬限期結束，超過額度可能被限制、回 402）。

   登入後開場那四支（收藏、用過的、我的評分、未讀通知）併成一支 my_boot()：
   Logs Explorer 11/12～13 一天 wishlist 1,201、usage_reports 589、offer_ratings 287、
   notifications 273。

   要守住的：
     1. 有 my_boot 就只打這一支，四樣東西照樣到位（書籤、已用、評分、鈴鐺數字）
     2. 還沒跑 schema_v193（RPC 錯誤）就退回原本四支，畫面一樣
     3. 這台裝置上還有沒同步的收藏：先合併、再重問一次收藏（my_boot 那份是合併前的） */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeSb, makeAsserts } = require('./harness');
const sql = fs.readFileSync(path.join(__dirname, '..', 'schema_v193_my_boot.sql'), 'utf8');

(async () => {
  const t = makeAsserts('t102 v193 登入後一次問完');

  /* ===== SQL ===== */
  t.ok('只回呼叫者自己的（auth.uid()，不收 user_id 參數）',
    /uid uuid := auth\.uid\(\)/.test(sql) && /create or replace function public\.my_boot\(\)/.test(sql));
  t.ok('沒登入就拒絕', /if uid is null then\s+raise exception/.test(sql));
  ['wishlist w where w.user_id = uid', 'usage_reports r where r.user_id = uid',
    'offer_ratings x where x.user_id = uid', 'n.user_id = uid'].forEach((frag) =>
    t.ok(`每一塊都篩自己：${frag.split(' ')[0]}`, sql.includes(frag)));
  t.ok('只給登入的人執行', /grant execute on function public\.my_boot\(\) to authenticated/.test(sql)
    && /revoke execute on function public\.my_boot\(\) from public, anon/.test(sql));
  t.ok('跑完叫 PostgREST 重新讀一次', /notify pgrst, 'reload schema'/.test(sql));

  /* ===== 前端 ===== */
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const state = () => JSON.parse(win.eval(`JSON.stringify({
    wish:[...WISH].sort(), used:[...MY_USED_OFFER_IDS].sort(), rated:[...MY_RATED].sort(),
    scores:[...MY_SCORES.entries()].sort(), badge:$('#notifCount').textContent,
    badgeHidden:$('#notifCount').classList.contains('hidden')})`));
  const PER_USER = ['wishlist', 'usage_reports', 'offer_ratings', 'notifications'];
  const tables = {
    wishlist: [{ offer_id: 3 }, { offer_id: 7 }],
    usage_reports: [{ offer_id: 7 }],
    offer_ratings: [{ offer_id: 3, score: 5 }],
    notifications: [{ read_at: null }, { read_at: null }, { read_at: '2026-11-01T00:00:00Z' }],
  };
  async function run(rpc, opts = {}) {
    const sb = makeSb({ tables, rpcs: rpc === undefined ? {} : { my_boot: rpc } });
    win.__sb = sb;
    win.eval(`sb = window.__sb; LIVE = true; me = {id:'u-1'};
      WISH = new Set(${JSON.stringify(opts.localWish || [])});
      MY_USED_OFFER_IDS = new Set(); MY_RATED = new Set(); MY_SCORES = new Map();`);
    await win.loadMyBoot();
    await tick(win, 6);
    return sb.__calls;
  }
  const want = { wish: ['3', '7'], used: ['7'], rated: ['3'], scores: [['3', 5]], badge: '2', badgeHidden: false };

  // 1. 有 my_boot
  let calls = await run({ wish: [3, 7], used: [7], ratings: [{ offer_id: 3, score: 5 }], unread: 2 });
  t.eq('只打 my_boot 一支', calls.rpc.map((c) => c.name), ['my_boot']);
  t.eq('那四張表一支都沒有再問', calls.select.map((c) => c.table).filter((x) => PER_USER.includes(x)), []);
  t.eq('收藏、用過、評分、鈴鐺數字都到位', state(), want);

  // 2. 還沒跑 v193：RPC 回錯誤
  calls = await run({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.my_boot' } });
  t.eq('沒跑 SQL：退回原本四支', calls.select.map((c) => c.table).filter((x) => PER_USER.includes(x)).sort(),
    PER_USER.slice().sort());
  t.eq('畫面跟有 my_boot 時一樣', state(), want);

  // 2b. RPC 整個丟例外（網路斷）也一樣退回
  calls = await run(() => { throw new Error('network'); });
  t.eq('丟例外也退回原本四支', calls.select.map((c) => c.table).filter((x) => PER_USER.includes(x)).sort(),
    PER_USER.slice().sort());

  // 3. 裝置上還有沒同步的收藏
  calls = await run({ wish: [3], used: [7], ratings: [{ offer_id: 3, score: 5 }], unread: 2 }, { localWish: ['7'] });
  t.ok('先把裝置上的收藏合併上去', calls.write.some((w) => w.table === 'wishlist' && w.op === 'upsert'));
  t.eq('合併完重問收藏（my_boot 那份是合併前的）', calls.select.filter((c) => c.table === 'wishlist').length, 1);
  t.eq('其他三樣照樣用 my_boot 的，不重問',
    calls.select.map((c) => c.table).filter((x) => ['usage_reports', 'offer_ratings', 'notifications'].includes(x)), []);

  // 4. 沒有未讀：紅點收起來
  await run({ wish: [], used: [], ratings: [], unread: 0 });
  t.ok('沒有未讀：鈴鐺的紅點收起來', state().badgeHidden);
  t.eq('收藏清空也正確', state().wish, []);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
