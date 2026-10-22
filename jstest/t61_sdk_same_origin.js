/* v138：Supabase SDK 改成先讀自己站上那一份

   使用者 tomoe_hot（Threads 私訊，連續兩天）：
     10/20「壽星日 app 顯示離線模式查不到分店位置……這問題 app 才有」
     10/22「去 app 點了〔排序〕〔篩選〕都沒反應，然後點〔附近〕出現（現在連不到
            資料庫…）**但我網路正常，頁面也重新整理了幾次**」

   v128 只讓「App 裡」先讀打包的那一份。但他第二次訊息裡引用的是「或頁面重新整理」
   ——那是**網頁版**的句子（App 裡會寫「把 App 關掉再打開」）。所以他根本不是用 APK，
   是「加到主畫面」的網頁版，v128 對他完全沒生效。

   所以改成所有人都先讀本站那一份，CDN 只當備援。 */
const fs = require('fs');
const path = require('path');
const { makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t61 SDK 先讀自己站上那一份');
  const root = (f) => path.join(__dirname, '..', f);
  const src = fs.readFileSync(root('index.html'), 'utf8');
  const sw = fs.readFileSync(root('sw.js'), 'utf8');

  /* ---- 檔案真的在 ---- */
  t.ok('網站根目錄有 vendor/supabase.min.js（沒有的話會一直退回 CDN）',
    fs.existsSync(root('vendor/supabase.min.js')));
  t.ok('而且不是空檔', fs.statSync(root('vendor/supabase.min.js')).size > 100000);

  /* ---- 載入順序 ---- */
  const fn = src.slice(src.indexOf('async function loadSupabaseSdk()'),
                       src.indexOf('let PAGEVIEW_LOGGED'));
  t.ok('第一個試的是本站那一份',
    fn.indexOf("loadScriptTag('vendor/supabase.min.js'") < fn.indexOf('for(const url of SDK_URLS)'));
  t.ok('不再只有 App 裡才試（v128 的判斷是這次沒生效的原因）', !/if\(IN_APP\)/.test(fn));
  t.ok('CDN 還留著當備援', /for\(const url of SDK_URLS\)/.test(fn));
  t.ok('記下是從哪裡載到的', /SDK_FROM='本站'/.test(fn) && /SDK_FROM='都失敗'/.test(fn));

  /* ---- service worker ---- */
  t.ok('SDK 也預先快取（沒網路也開得起來）', /vendor\/supabase\.min\.js/.test(sw));
  t.ok('快取版本有跟著升（不升的話舊使用者拿不到新清單）', /shouxing-v7/.test(sw));

  /* ---- 兩個一樣的旗標合併掉 ---- */
  t.ok('IN_APP 只剩一個判斷（本來還有一個同義的）',
    (src.match(/typeof window\.Capacitor !== 'undefined'/g) || []).length
    + (src.match(/!!\(window\.Capacitor \|\| window\.cordova\)/g) || []).length === 1);

  /* ---- 可以一鍵複製狀況 ---- */
  t.ok('離線時有一顆「複製狀況」', /id="btnCopyDiag"/.test(src));
  t.ok('clipboard 失敗有退路（有些手機瀏覽器不給）', /execCommand\('copy'\)/.test(src));

  const diag = src.slice(src.indexOf('function diagnosticText()'),
                         src.indexOf('function renderDiagnostics(mb)'));
  t.ok('有帶上版本、開啟方式、SDK 來源',
    /SITE_UPDATES\[0\]/.test(diag) && /加到主畫面/.test(diag) && /SDK_FROM/.test(diag));
  t.ok('有帶上「系統說有沒有網路」（他說網路正常，這條才分得出來）',
    /navigator\.onLine/.test(diag));
  /* 這段是要請使用者貼給我們的，不可以夾帶任何認得出是誰的東西 */
  t.ok('沒有帶走帳號、位置或任何個資',
    !/\bme\b|myProfile|email|user_id|NEAR\.lat|localStorage|session/i.test(diag), diag.slice(0, 200));
  t.ok('只帶網域，不帶完整網址（網址可能有 ?offer= 之類的）',
    /location\.origin/.test(diag) && !/location\.href/.test(diag));

  t.done();
})();
