/* ---------------------------------------------------------------------------
   jsdom 測試骨架（重建版）

   為什麼有這個檔：前一個 session 的迴歸測試（t4.js ~ t22.js）放在 sandbox
   暫存區，換機器就整批消失了。這次改成放進 repo、進版控，之後誰接手都跑得起來。

   做法跟之前一樣：用 jsdom 載入「build.py 產生出來的 index.html」（不是
   template.html——要測的是真正部署出去的那份），把 window.supabase 換成
   mock，模擬點擊，斷言結果。

   踩過的坑，都在這裡處理掉了：
   1. 頁面開場會動態 append <script src=config.js> 跟 supabase CDN。jsdom 預設
      不抓外部資源，onload/onerror 都不會觸發，connectLive() 就會卡滿 5 秒的
      逾時。這裡把 HTMLScriptElement 的 src setter 攔掉，直接非同步觸發
      onerror，讓它立刻落到「離線模式」——測試想要的正是離線開機，因為這樣
      開場完全不會打 Supabase，我們再自己把 LIVE/sb/myProfile 塞成想要的值。
   2. jsdom 沒有 HTMLDialogElement.showModal/close，要自己補。
   3. window.scrollTo 在 jsdom 是「not implemented」會噴 error，要蓋掉
      （順便當成 withScrollRestore 的觀測點）。
   4. 頁面的頂層變數是 `let`（LIVE / sb / myProfile …），不會掛在 window 上，
      要用 win.eval('LIVE=true') 這種間接 eval 才改得到。頂層 `function` 宣告
      反而會掛在 window 上，所以 stub 掉 loadOffers 之類的重函式直接指定
      win.loadOffers 就好。
   5. 測試腳本不會自己結束（jsdom 的 timer 還掛著），收尾一定要 process.exit。
--------------------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const INDEX = path.join(__dirname, '..', 'index.html');

async function boot() {
  const html = fs.readFileSync(INDEX, 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      // 1. 外部 script 一律當成載入失敗 → 走離線模式開機，開場不打網路
      const proto = window.HTMLScriptElement.prototype;
      Object.defineProperty(proto, 'src', {
        configurable: true,
        get() { return this.getAttribute('data-stub-src') || ''; },
        set(v) {
          this.setAttribute('data-stub-src', String(v));
          // onerror 是在 s.src=... 之後才指派的，所以要非同步觸發
          setTimeout(() => {
            if (typeof this.onerror === 'function') this.onerror(new window.Event('error'));
          }, 0);
        },
      });
      // 2. <dialog>
      const dlg = window.HTMLDialogElement && window.HTMLDialogElement.prototype;
      if (dlg) {
        dlg.showModal = function () { this.open = true; };
        dlg.close = function () { this.open = false; };
        dlg.show = function () { this.open = true; };
      }
      // 2.5 jsdom 的 history 沒有 scrollRestoration，頁面那段
      //     `if('scrollRestoration' in history) history.scrollRestoration='manual'`
      //     會整段跳過，測不到。補一個可寫的屬性，預設跟瀏覽器一樣是 'auto'。
      if (!('scrollRestoration' in window.history)) {
        let mode = 'auto';
        Object.defineProperty(window.history, 'scrollRestoration', {
          configurable: true,
          get() { return mode; },
          set(v) { mode = String(v); },
        });
      }
      // 3. scrollTo / scrollIntoView（jsdom 會噴 "not implemented"）
      window.__scrollCalls = [];
      window.scrollTo = (...a) => { window.__scrollCalls.push(a); };
      window.scroll = window.scrollTo;
      window.Element.prototype.scrollIntoView = function () {};
      // 4. confirm / alert：測試裡要能自己決定回什麼、事後查得到問了什麼
      window.__confirms = [];
      window.confirm = (msg) => { window.__confirms.push(msg); return window.__confirmAnswer !== false; };
      window.__alerts = [];
      window.alert = (msg) => { window.__alerts.push(msg); };
      // 5. Service Worker
      if (!window.navigator.serviceWorker) {
        Object.defineProperty(window.navigator, 'serviceWorker', {
          configurable: true,
          value: { register: () => Promise.resolve({}), ready: Promise.resolve({}) },
        });
      }
    },
  });

  const win = dom.window;
  await new Promise((res) => {
    if (win.document.readyState === 'complete') return res();
    win.addEventListener('load', res, { once: true });
  });
  // 讓 connectLive() 的離線分支跑完
  await tick(win, 5);
  return { dom, win };
}

// 讓 jsdom 的 microtask / macrotask queue 跑幾圈
function tick(win, times = 3) {
  let p = Promise.resolve();
  for (let i = 0; i < times; i++) p = p.then(() => new Promise((r) => win.setTimeout(r, 0)));
  return p;
}

/* ---- Supabase mock ----------------------------------------------------
   `sb.from(...)` 回傳的 query builder 一定要把所有會用到的鏈式方法補齊，
   少一個就整個炸（`.not is not a function` 這個坑前一個 session 踩過兩次）。
   這裡乾脆一次把 postgrest 會用到的 filter 方法全補上，並且：
   - builder 本身是 thenable（有 .then），所以 `await sb.from(x).select()` 會拿到
     `{data, error, count}`
   - select('id',{count:'exact',head:true}) 這種精確計數查詢要回 count 欄位
   - 每一次查詢跟寫入都記在 __calls 裡，方便斷言「有沒有送出、送了什麼」
----------------------------------------------------------------------- */
const CHAIN = ['select', 'eq', 'neq', 'in', 'not', 'is', 'gt', 'gte', 'lt', 'lte',
  'like', 'ilike', 'or', 'and', 'filter', 'match', 'contains', 'containedBy',
  'overlaps', 'textSearch', 'order', 'limit', 'range', 'returns', 'abortSignal', 'csv'];

function makeSb(cfg = {}) {
  const tables = cfg.tables || {};
  const rpcs = cfg.rpcs || {};
  const calls = { rpc: [], select: [], write: [] };

  function resultFor(table, state) {
    const src = tables[table];
    const data = typeof src === 'function' ? src(state) : (src === undefined ? [] : src);
    return {
      data: state.head ? null : data,
      error: null,
      count: Array.isArray(data) ? data.length : (data ? 1 : 0),
      status: 200,
    };
  }

  function qb(table) {
    const state = { table, ops: [], head: false };
    const o = {};
    CHAIN.forEach((m) => {
      o[m] = (...args) => {
        state.ops.push([m, ...args]);
        if (m === 'select') {
          state.head = !!(args[1] && args[1].head);
          calls.select.push({ table, cols: args[0], opts: args[1] });
        }
        return o;
      };
    });
    ['insert', 'update', 'upsert', 'delete'].forEach((m) => {
      o[m] = (...args) => {
        state.ops.push([m, ...args]);
        calls.write.push({ table, op: m, args });
        return o;
      };
    });
    const one = () => {
      const r = resultFor(table, state);
      const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
      return Promise.resolve({ data: d, error: null, status: 200 });
    };
    o.single = one;
    o.maybeSingle = one;
    o.then = (onOk, onErr) => Promise.resolve(resultFor(table, state)).then(onOk, onErr);
    o.catch = (f) => Promise.resolve(resultFor(table, state)).catch(f);
    o.finally = (f) => Promise.resolve(resultFor(table, state)).finally(f);
    return o;
  }

  return {
    __calls: calls,
    from: (t) => qb(t),
    rpc: (name, params) => {
      calls.rpc.push({ name, params });
      const h = rpcs[name];
      if (h === undefined) return Promise.resolve({ data: null, error: null });
      const out = typeof h === 'function' ? h(params) : h;
      const wrapped = (out && (('data' in out) || ('error' in out))) ? out : { data: out, error: null };
      return Promise.resolve(wrapped);
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
    removeChannel: () => {},
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      getUser: () => Promise.resolve({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: () => Promise.resolve({ error: null }),
    },
  };
}

/* 把管理員後台那幾支「會連鎖打一堆查詢／重畫整頁」的重函式換成空殼，
   測試只想驗被測的那一段行為，不想被 loadOffers()→render() 整頁重畫拖下水。
   頂層 `function` 宣告會掛在 window 上，所以直接指定就能蓋掉。
   回傳一個記錄器，方便斷言「核可完有沒有重新整理清單」。 */
function stubHeavy(win, names) {
  const hits = {};
  (names || ['loadOffers', 'render', 'loadSiteStats', 'loadReviewInsights', 'loadPending',
    'paintOffers', 'checkNewOffers', 'loadEditQueue', 'loadApproved', 'loadRejected'])
    .forEach((n) => {
      hits[n] = 0;
      win[n] = async (...a) => { hits[n] += 1; return undefined; };
    });
  return hits;
}

/* ---- 極簡斷言 --------------------------------------------------------- */
function makeAsserts(title) {
  const results = [];
  console.log(`\n=== ${title} ===`);
  const ok = (name, cond, extra) => {
    results.push({ name, pass: !!cond, extra });
    const tail = (cond || extra === undefined) ? '' : `  ->  ${JSON.stringify(extra)}`;
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${tail}`);
  };
  const eq = (name, actual, expected) =>
    ok(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
  /* done() 以前只回傳 true/false，要靠每一支測試自己寫
     `process.exit(t.done() ? 0 : 1)` 才會讓 run_all 看到紅燈。
     t55 之後新加的十三支都只寫了 `t.done();`——**它們印出 FAIL，但整批還是
     報 ALL PASS**。2026-10-29 抓到（t67 有一條 FAIL，總結卻寫「ALL PASS（68 支）」）。
     改成 done() 自己把 exitCode 設起來：兩種寫法都會紅，以後新測試怎麼寫都不會漏。 */
  const done = () => {
    const bad = results.filter((r) => !r.pass);
    console.log(`[${title}] ${results.length - bad.length}/${results.length} passed`);
    if (bad.length) process.exitCode = 1;
    return bad.length === 0;
  };
  return { ok, eq, done, results };
}

module.exports = { boot, tick, makeSb, makeAsserts, stubHeavy, INDEX };
