/* v155：公開的地方不能出現站務指示（celine 2026-10-29：「其他人不該看到這個」）

   v153／v154 修掉了「排行程」那一頁，但同一種字在別的地方還有十幾處：
   「（Supabase 可能還沒跑 schema_v20_notifications.sql）」
   「大頭貼上傳還沒開通（管理員需要先在 Supabase 執行 schema_v70…）」……
   通知、排行榜、待辦清單、「我的」、問卷，誰都看得到。

   規則：優惠／排行榜／排行程／我的，還有誰都打得開的對話框——
   - 表／欄位／函式還沒建起來：只說「還沒開放」「暫時讀不到」
   - is_admin 擋著也不行：判斷錯一次就是全站看得到，她自己在那些頁面也不想看
   - 要跑哪一支只寫在審核頁（#tab-admin）跟 MIGRATIONS.md

   這一支兩半：
   一、真的去觸發幾條公開的錯誤路徑，看畫面上的字（主要的那半）
   二、掃 index.html 裡**畫得出來的字串**（不是註解）：提到 schema_v 的，
       一定要在管理員專用的函式裡 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, stubHeavy } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const BAD = /schema_|SQL|Supabase|管理員/;

/* 什麼都回錯誤的假 sb：from().select().eq()… 怎麼串都行，await 下去就是 {error} */
function errSb(msg) {
  const res = { data: null, error: { message: msg }, count: null };
  const chain = new Proxy(function () {}, {
    get: (_, k) => (k === 'then' ? (ok, ng) => Promise.resolve(res).then(ok, ng) : () => chain),
    apply: () => chain,
  });
  return {
    from: () => chain, rpc: () => chain, storage: { from: () => chain },
    channel: () => chain, removeChannel: () => {},
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => {}, signOut: () => Promise.resolve({}),
    },
  };
}

(async () => {
  const t = makeAsserts('t74 公開的地方不出現站務指示');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  stubHeavy(win, ['render', 'loadOffers', 'paintOffers', 'loadPending', 'loadReviewInsights']);
  const txt = (sel) => ($(sel)?.textContent || '').replace(/\s+/g, ' ').trim();
  const use = (msg) => { win.__sb = errSb(msg); win.eval("LIVE=true; me={id:'u-1',email:'a@b.c'}; sb=window.__sb;"); };
  const MISSING = 'relation "public.x" does not exist';

  /* ================= 一、真的觸發 ================= */

  // 一般人跟管理員都跑一次：管理員看到的也不能不一樣
  for (const [who, prof] of [['一般人', '{id:"u-1"}'], ['管理員', '{id:"u-1",is_admin:true}']]) {
    use(MISSING);
    win.eval(`myProfile=${prof};`);

    await win.openNotifDialog();
    await tick(win, 2);
    t.ok(`${who}：通知讀不到只講暫時讀不到`, /暫時讀不到/.test(txt('#notifList')) && !BAD.test(txt('#notifList')),
      txt('#notifList'));
    $('#dlgNotif').close();

    await win.loadRecentActivity();
    await tick(win, 2);
    t.ok(`${who}：排行榜的最近動態`, /暫時讀不到/.test(txt('#recentActivity')) && !BAD.test(txt('#recentActivity')),
      txt('#recentActivity'));

    await win.loadPendingPreview();
    await tick(win, 2);
    t.ok(`${who}：待審預覽`, !BAD.test(txt('#pendPreview')) && txt('#pendPreview') !== '', txt('#pendPreview'));

    $('#bmonth').value = '3';
    $('#btnSaveBirthday').click();
    await tick(win, 3);
    t.ok(`${who}：「我的」存生日`, /還沒開放/.test(txt('#birthdayMsg')) && !BAD.test(txt('#birthdayMsg')),
      txt('#birthdayMsg'));

    win.eval("MONTHLY_ROWS=null; MONTHLY_ERR='function public.site_monthly_activity does not exist'; renderMonthlyActivity();");
    t.ok(`${who}：排行榜每月人數`, !BAD.test(txt('#boardMonthlyChart')), txt('#boardMonthlyChart'));
  }

  // 收藏（待辦清單）用 alert 講
  use(MISSING);
  win.__alerts.length = 0;
  await win.toggleWish(String(win.eval('OFFERS[0]?.id ?? 1')), null);
  await tick(win, 2);
  t.ok('收藏失敗不叫人去跑 SQL', win.__alerts.length === 1 && !BAD.test(win.__alerts[0]), win.__alerts);

  // 個人檔案讀不到：會出現在頂端的告示跟「我的」下方，任何登入的人都可能碰到
  use('JSON object requested, multiple (or no) rows returned');
  win.eval('myProfile=null; try{forgetProfile()}catch(e){}');
  await win.eval("onSession({user:{id:'u-9',email:'x@y.z'}})").catch(() => {});
  await tick(win, 3);
  t.ok('讀不到個人檔案：頂端告示不提 SQL', /讀不到你的個人檔案/.test(txt('#modeBanner'))
    && !BAD.test(txt('#modeBanner')), txt('#modeBanner'));
  win.eval('renderMyDebug()');
  const dd = [...doc.querySelectorAll('#myDebugBody dt')].find((d) => d.textContent === '個人檔案');
  const ddTxt = dd ? dd.nextElementSibling.textContent : '';
  t.ok('「我的」下方那一行也不提', /找不到/.test(ddTxt) && !BAD.test(ddTxt), ddTxt);

  // 真的錯誤（不是還沒建表）原文照樣帶出來，不要全部吞成「還沒開放」
  t.eq('還沒建表 → 只說還沒開放', win.pubErrText({ message: MISSING }, '失敗：'), win.eval('PUB_NOT_OPEN'));
  t.eq('其他錯誤 → 前綴＋原文',
    win.pubErrText({ message: 'permission denied for table x' }, '失敗：'), '失敗：permission denied for table x');
  t.eq('字串也收', win.pubErrText('timeout', '失敗：'), '失敗：timeout');
  use('permission denied for table notifications');
  await win.openNotifDialog();
  await tick(win, 2);
  t.ok('通知：真的錯誤還是看得到原文', /permission denied/.test(txt('#notifList')), txt('#notifList'));
  $('#dlgNotif').close();

  /* ================= 二、靜態：畫得出來的字串 ================= */
  /* 只看字串（'…' "…" `…`），註解跳過——註解裡寫「要跑 schema_v65」是給維護的人看的，
     本來就該留著。 */
  const scripts = [...index.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const lits = [];
  for (const src of scripts) lex(src, lits);
  t.ok('掃得到字串（掃描器本身沒壞）', lits.some((l) => l.text.includes('暫時讀不到')), lits.length);
  t.ok('…而且不把註解算進來', !lits.some((l) => l.text.includes('其他人不該看到這個')));

  /* 管理員專用：開頭就 `if(!…is_admin) return` 的，加上下面這幾支（只在審核頁被叫到）。
     要加新的進來，先確定它真的只畫在 #tab-admin 裡面。 */
  const ADMIN_ONLY = new Set([
    'loadAutoApproved',   // #autoApprovedBody，在 #tab-admin
    'venueWriteHint',     // 只有 saveVenue／delVenue／createVenue（#venueAdminBody）在叫
    'mergeErrText',       // 回報清單裡的「合併」（loadFeedbackList 有擋）
    'renderFbList',       // 同上
    'loadVisitStats',     // #dashVisits，儀表板
    'dbErrHint',          // 只有儀表板在叫
    'renderMergePanel',   // #pnlMerge
  ]);
  // `if(!LIVE||!myProfile?.is_admin) return`、`if(!box || !myProfile?.is_admin || !LIVE) return` 都算
  const GUARD = /if\s*\((?:[^()\n]|\([^()\n]*\))*!\s*myProfile\?\.is_admin\b(?:[^()\n]|\([^()\n]*\))*\)\s*return/;
  const leaks = [];
  for (const { text, src, pos } of lits) {
    if (!/schema_v\d/.test(text)) continue;
    const fn = enclosingFn(src, pos);
    if (fn && (ADMIN_ONLY.has(fn.name) || GUARD.test(src.slice(fn.bodyAt, fn.bodyAt + 300)))) continue;
    leaks.push(`${fn ? fn.name : '(頂層)'}：${text.slice(0, 60)}`);
  }
  t.eq('提到 schema_v 的字串都在管理員專用的函式裡', leaks, []);

  /* 靜態 HTML：公開的四個分頁跟誰都打得開的對話框（註解節點不算） */
  const pub = ['#tab-browse', '#tab-board', '#tab-trip', '#tab-mine'];
  const dlgs = [...doc.querySelectorAll('dialog')].filter((d) => !d.closest('#tab-admin'));
  const staticHits = [...pub.map((s) => $(s)), ...dlgs].filter(Boolean)
    .filter((el) => /schema_v\d|SQL Editor/.test(el.textContent))
    .map((el) => el.id);
  t.eq('公開分頁跟對話框的 HTML 裡沒有', staticHits, []);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

/* 最小的 JS 字串掃描器：抓出所有字串常值（樣板字串的 ${…} 裡面也遞迴進去），
   跳過註解跟正規表示式。不求完整，只求不把註解跟 regex 當成字串。 */
function lex(src, out) {
  let i = 0, prev = '';
  const n = src.length;
  const KW = /(?:^|[^\w$])(?:return|typeof|case|in|of|void|delete|throw|else|do)$/;
  function str(q) {
    const at = i; i++;
    let s = '';
    while (i < n && src[i] !== q) { if (src[i] === '\\') { s += src[i + 1]; i += 2; } else s += src[i++]; }
    i++; out.push({ text: s, src, pos: at }); prev = 'x';
  }
  function tpl() {
    const at = i; i++;
    let s = '';
    while (i < n && src[i] !== '`') {
      if (src[i] === '\\') { s += src[i + 1]; i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') { i += 2; code('}'); i++; s += '\u0000'; continue; }
      s += src[i++];
    }
    i++; out.push({ text: s, src, pos: at }); prev = 'x';
  }
  function code(stop) {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      if (stop && c === '}' && depth === 0) return;
      if (c === '{') depth++;
      if (c === '}') depth--;
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
      if (c === '\'' || c === '"') { str(c); continue; }
      if (c === '`') { tpl(); continue; }
      if (c === '/') {
        const before = src.slice(Math.max(0, i - 12), i).replace(/\s+$/, '');
        const p = before.slice(-1);
        if (!p || '(,=:[!&|?{};+-*%<>~^'.includes(p) || KW.test(before)) {
          i++; let cls = false;
          while (i < n && (src[i] !== '/' || cls)) {
            if (src[i] === '\\') i++;
            else if (src[i] === '[') cls = true;
            else if (src[i] === ']') cls = false;
            i++;
          }
          i++; while (/[a-z]/i.test(src[i] || '')) i++;
          prev = 'x'; continue;
        }
      }
      if (!/\s/.test(c)) prev = c;
      i++;
    }
  }
  code(null);
  return out;
}

/* 這個位置是哪一支頂層函式裡面（行首的 function／async function） */
function enclosingFn(src, pos) {
  const re = /^(?:async\s+)?function\s+([\w$]+)\s*\(/gm;
  let m, last = null;
  while ((m = re.exec(src)) && m.index < pos) last = { name: m[1], bodyAt: m.index };
  return last;
}
