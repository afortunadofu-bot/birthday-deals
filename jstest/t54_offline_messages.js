/* 使用者 tomoe_hot（2026-10-20，Threads 私訊）：

     「壽星日 app 顯示＞＞離線模式查不到分店位置，要我先用***（英文）啟動並設定
      ***（英文）。請問你看得懂我再說什麼問題嗎。然後這問題 app 才有，我用電腦
      看網頁不會有問題」

   那兩個英文是 `python serve.py` 跟 `config.js`——寫給開發者看的除錯訊息，
   卻直接彈給一般使用者。兩件事要修：
     1. 那些訊息在線上／App 裡要講人話
     2. App 為什麼會進離線模式：打包在 APK 裡的 SDK 從來沒被讀過 */
const fs = require('fs');
const path = require('path');
const { boot, makeAsserts } = require('./harness');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'app', 'sync_www.py'), 'utf8');

(async () => {
  const t = makeAsserts('t54 離線訊息要講人話＋App 用打包的 SDK');
  const { win } = await boot();
  const doc = win.document;

  /* ========== 1. 訊息 ========== */
  t.ok('沒有任何一句還在對使用者講 serve.py',
    !/alert\('離線模式[^']*serve\.py/.test(index), '還有寫死的開發訊息');

  /* IS_DEV／IN_APP 是 const（載入時就定案，執行中不該被改），所以把 offlineMsg
     的原始碼抓出來，自己餵兩個旗標進去跑——驗的還是真正那段邏輯。 */
  const src = index.match(/function offlineMsg\(what\)\{[\s\S]*?\n\}/)[0];
  const msg = (dev, inApp) =>
    new Function('IS_DEV', 'IN_APP', src + '\nreturn offlineMsg;')(dev, inApp)('查不到分店位置');
  t.ok('開發機上照舊講實話（我自己要看得懂卡在哪）',
    /serve\.py/.test(msg(true, false)), msg(true, false));
  const live = msg(false, false);
  t.ok('線上不提 serve.py／config.js', !/serve\.py|config\.js/.test(live), live);
  t.ok('線上講「連不到資料庫」跟怎麼辦', /連不到資料庫/.test(live) && /重新整理/.test(live), live);
  const app = msg(false, true);
  t.ok('App 裡叫人關掉再打開，不是叫人重新整理',
    /App 關掉再打開/.test(app) && !/重新整理/.test(app), app);

  /* 離線診斷那一塊同理：使用者看到的是人話，不是三行除錯清單。
     jsdom 跑起來 hostname 就是 localhost，所以執行得到的是「開發機」那一支；
     使用者那一支從原始碼驗（IS_DEV 是 const，執行中不該被改）。 */
  const box = doc.createElement('div');
  win.__box = box;
  win.eval(`renderDiagnostics(window.__box)`);
  t.ok('開發機上照舊列出三條檢查', /config\.js/.test(box.innerHTML), box.textContent.slice(0, 80));

  const userBranch = index.slice(index.indexOf('if(!IS_DEV){', index.indexOf('function renderDiagnostics')),
    index.indexOf('const rows = ['));
  t.ok('使用者版先攔下來', /if\(!IS_DEV\)\{/.test(userBranch));
  t.ok('使用者版沒有 file://、config.js、CDN 那些字',
    !/file:|config\.js|CDN/.test(userBranch), userBranch.slice(-200));
  t.ok('但有講清楚現在看到的數字不是真的', /還不是真的/.test(userBranch));
  t.ok('App 裡講「關掉再打開」', /IN_APP\?'或把 App 關掉再打開一次'/.test(userBranch));

  /* ========== 2. App 裡先用打包進去的 SDK ========== */
  t.ok('sync_www.py 本來就把 SDK 打包進去了', /vendor\/supabase\.min\.js/.test(sync));
  t.ok('網頁這邊現在真的會去讀它', /loadScriptTag\('vendor\/supabase\.min\.js'/.test(index));
  /* v128 原本寫「只有 App 裡才先試」，理由是「線上沒有 vendor/，不要讓訪客白白
     多一個 404」。那個判斷就是 10/22 再次回報的原因——tomoe_hot 用的是「加到主
     畫面」的網頁版、不是 APK，所以那條路對他完全沒生效。v138 改成所有人都先試，
     vendor/ 也放到網站上了。這條斷言留著只會再擋一次正確的修法。 */
  t.ok('v138：所有人都先試本站那一份，不是只有 App', !/if\(IN_APP\)/.test(index));
  t.ok('試完還是會退回 CDN（打包的那份壞掉也不能整個死掉）',
    /vendor\/supabase\.min\.js[\s\S]{0,200}for\(const url of SDK_URLS\)/.test(index));

  /* IN_APP 不能用 hostname 判斷——Capacitor 的網址就是 https://localhost */
  t.ok('用 window.Capacitor 判斷，不是用 localhost',
    /const IN_APP = !!\(window\.Capacitor \|\| window\.cordova\)/.test(index));
  t.ok('開發判斷把 App 排除掉', /const IS_DEV = !IN_APP &&/.test(index));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
