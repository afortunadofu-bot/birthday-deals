/* 繼續砍 Supabase 請求數（SUPABASE-流量.md 的第 1、2 項）。

   1. 個人檔案（暱稱／是不是管理員／有沒有被停權）每次開站都查一次。存進
      sessionStorage，10 分鐘內不重查。只存 10 分鐘、而且只存在 sessionStorage：
      這一列決定權限，存太久的話剛被停權的人還能繼續操作一陣子。

   2.「我的」那一頁本來四支查詢，v124 的 my_dashboard() 一次回一包。
      還沒跑那支 SQL 的站台要照舊能用。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, makeSb } = require('./harness');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'schema_v124_my_dashboard.sql'), 'utf8');

(async () => {
  const t = makeAsserts('t52 個人檔案快取＋「我的」一次問完');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  /* ========== 1. 個人檔案快取 ========== */
  win.eval(`sessionStorage.clear(); cacheProfile('u-1', {id:'u-1', display_name:'小美', is_admin:false});`);
  t.ok('存得進去', !!win.eval(`cachedProfile('u-1')`));
  t.eq('讀回來是同一列', win.eval(`cachedProfile('u-1').display_name`), '小美');
  t.eq('不是同一個人就不給', win.eval(`cachedProfile('u-2')`), null);

  // 過期就不給（10 分鐘）
  win.eval(`(()=>{ const r=JSON.parse(sessionStorage.getItem('sxr_profile'));
    r.at=Date.now()-11*60*1000; sessionStorage.setItem('sxr_profile', JSON.stringify(r)); })()`);
  t.eq('超過 10 分鐘就重查', win.eval(`cachedProfile('u-1')`), null);

  t.ok('存在 sessionStorage，不是 localStorage（關掉分頁就沒了）',
    /sessionStorage\.(getItem|setItem)\('sxr_profile'/.test(index)
    && !/localStorage[\s\S]{0,40}sxr_profile/.test(index));
  t.ok('改過自己的暱稱／頭像／生日／上榜設定就把快取丟掉',
    (index.match(/forgetProfile\(\);/g) || []).length >= 5);
  t.ok('登出也丟掉', /forgetProfile\(\); await sb\.auth\.signOut\(\)/.test(index));
  t.ok('讀不到個人檔案時不要把壞的那份存起來', /PROFILE_ERROR=true; forgetProfile\(\)/.test(index));

  /* ========== 2.「我的」一次問完 ========== */
  const d = {
    savings: { saved_total: 1200, saved_this_year: 300, success_count: 4, brands_used: 3 },
    reports: [{ id: 1, used_on: '2026-10-10', result: 'success', saved_twd: 100, spent_twd: 250,
      store: '門市', note: '', created_at: '2026-10-10T00:00:00Z', offer_id: 7,
      offers: { id: 7, brand: '甲店', offer: '送蛋糕', timing: '當月', value_twd: 100 } }],
    pending: [{ id: 11, brand: '乙店', created_at: '2026-10-09T00:00:00Z' }],
    pending_edits: [{ id: 21, offer_id: 7, created_at: '2026-10-08T00:00:00Z' }],
  };
  const sb = makeSb({ rpcs: { my_dashboard: () => d } });
  win.__sb = sb;
  win.eval(`LIVE=true; me={id:'u-1'}; myProfile={id:'u-1'}; sb=window.__sb;
    renderBadges=()=>{}; renderMyReports=()=>{}; renderSavingsSinceVisit=()=>{};
    maybeShowRateNudge=()=>{}; renderRatedCta=()=>{};`);
  await win.eval('loadMyTab()');
  await tick(win, 4);

  t.eq('只打一支 RPC', sb.__calls.rpc.map((r) => r.name), ['my_dashboard']);
  // 「我的」那一頁還有另外三支（待辦清單明細、我投稿的、我回報的問題），
  // 那三支不在這次合併的範圍裡——這裡只驗被合併掉的那四支真的沒再打
  const hit = (tb) => sb.__calls.select.some((c) => c.table === tb);
  t.ok('被併掉的那四支都沒再打',
    !hit('my_savings') && !hit('usage_reports')
    && !hit('offers_pending_preview') && !hit('offer_edits_pending_preview'),
    sb.__calls.select.map((c) => c.table).join(','));
  t.ok('省下的金額畫出來了', /1,200/.test($('#mySavings').textContent), $('#mySavings').textContent);
  t.eq('我的回報接回去了', win.eval('MY_REPORTS.length'), 1);
  t.ok('回報帶著 spent_twd（v109 那個會被清掉的欄位）',
    win.eval('MY_REPORTS[0].spent_twd') === 250);
  t.eq('審核中的投稿也接回去了（投稿表單比對重複要用）',
    win.eval('PENDING_PREVIEW.length'), 1);

  /* 還沒跑 v124：退回原本那幾支，畫面一樣 */
  const sb2 = makeSb({
    rpcs: { my_dashboard: () => ({ data: null, error: { message: 'function public.my_dashboard does not exist' } }) },
    tables: {
      my_savings: [{ saved_total: 50, saved_this_year: 50, success_count: 1, brands_used: 1 }],
      usage_reports: [], offers_pending_preview: [], offer_edits_pending_preview: [],
    },
  });
  win.__sb2 = sb2;
  win.eval(`sb=window.__sb2; MY_REPORTS=[]; PENDING_PREVIEW=[];`);
  await win.eval('loadMyTab()');
  await tick(win, 4);
  t.ok('沒有那支函式也不會壞', /50/.test($('#mySavings').textContent), $('#mySavings').textContent);
  t.ok('退回去各自查', sb2.__calls.select.some((c) => c.table === 'my_savings')
    && sb2.__calls.select.some((c) => c.table === 'offers_pending_preview'));

  /* ========== 3. SQL 本身 ========== */
  t.ok('只回自己的（用 auth.uid()，不收 user_id 參數）',
    /auth\.uid\(\)/.test(sql) && /my_dashboard\(\)/.test(sql));
  t.ok('沒登入就擋下來', /uid is null/.test(sql));
  t.ok('四塊都在', ['savings', 'reports', 'pending', 'pending_edits'].every((k) => sql.includes(`'${k}'`)));
  t.ok('回報有帶 spent_twd', /r\.spent_twd/.test(sql));
  t.ok('anon 不能呼叫', /revoke execute[\s\S]*from public, anon/.test(sql));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
