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
const MAIN_JS = path.join(__dirname, '..', 'main.js');

/* v186：主程式被 build.py 抽成 main.js 了，但下面 beforeParse 會把每一個帶 src
   的 <script> 都當成載入失敗（那是為了 config.js 跟 CDN 不要真的打網路）。
   照這樣下去 main.js 永遠不會執行，整包測試等於在測一個沒有程式的頁面。

   所以這裡先把 main.js 貼回它原本的位置——也就是 build.py 留下的那行註解，
   在 </body> 前面，不是 <head> 裡那行 defer。位置錯了的話，程式會在
   body 還沒解析完就跑，整頁抓不到任何元素。

   貼回去之後 jsdom 看到的就跟 v185 以前一模一樣，測的仍然是 build.py
   產生出來的那一份 index.html ＋ main.js。 */
const realReadFileSync = fs.readFileSync;
const readRawIndex = () => realReadFileSync(INDEX, 'utf8');

const DEFER_TAG = '<script src="main.js" defer></script>';
const PLACEHOLDER = /<!-- 主程式在 main\.js[^>]*-->/;

function inlineMainJs(html) {
  const hasTag = html.includes(DEFER_TAG);
  const hasPlaceholder = PLACEHOLDER.test(html);
  if (!hasTag && !hasPlaceholder) return html;   // 已經貼回去過了，不要貼第二次
  if (!hasTag || !hasPlaceholder) {
    throw new Error(
      'index.html 裡找不到 main.js 的 script 標籤或那行註解——build.py 的 split_main_js() 改過了？\n' +
      '請同步更新 jstest/harness.js 的 inlineMainJs()。');
  }
  const js = realReadFileSync(MAIN_JS, 'utf8');
  // 用函式當取代值：main.js 裡到處都是 $（`const $ = ...`、`${}`），
  // 如果傳字串，$& / $` / $1 這些會被當成取代樣式吃掉。
  return html
    .replace(DEFER_TAG + '\n', '')
    .replace(DEFER_TAG, '')
    .replace(PLACEHOLDER, () => '<script>' + js + '</script>');
}

/* 還有二十幾支測試是直接 `fs.readFileSync('../index.html')` 拿原始碼做字串檢查
   （「某某函式裡有沒有帶上這個參數」那種）。主程式搬去 main.js 之後，那些
   regex 全部會抓不到東西——而且不是紅燈，是「找不到所以斷言失敗」，一次壞二十幾支。

   那些測試要的是「前端的原始碼」。拆分之後那份原始碼就是 index.html ＋ main.js，
   所以這個約定補在這裡一次就好，不用每支測試各自記得，新增的測試也自動適用：
   **讀 index.html 的時候，把 main.js 貼回它原本的位置再回傳**（貼回原位而不是
   接在後面，是為了那些會比對前後順序的斷言還成立）。

   只攔 index.html 這一個路徑，其他檔案原封不動。
   要拿「真正的、沒有被貼回去的」index.html（例如想斷言它現在有多小、
   或是有沒有正確引用 main.js），用 readRawIndex()。 */
fs.readFileSync = function (file, ...rest) {
  const out = realReadFileSync.call(fs, file, ...rest);
  if (typeof out === 'string' && typeof file === 'string'
      && path.resolve(file) === path.resolve(INDEX)) {
    return inlineMainJs(out);
  }
  return out;
};

async function boot() {
  const html = inlineMainJs(readRawIndex());
  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      // 0. v168 系統更新公告（11/3–11/5）是照真實日期開的；測試預設當作不在那幾天，
      //    要測公告本身的那一支自己把它刪掉（t87）
      window.__SXR_NO_MAINT = true;
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

module.exports = { boot, tick, makeSb, makeAsserts, stubHeavy, INDEX, MAIN_JS, readRawIndex };
