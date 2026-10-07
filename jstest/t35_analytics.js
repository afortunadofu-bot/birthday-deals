/* celine 貼了 GA4 的追蹤碼（G-L5LSDESD9F）進來，意思是裝上去。

   兩件事要守住：
   1. 本機開發不要送——不然 python serve.py 跟這包測試的流量會混進正式報表，
      「昨天有幾個人來」就不準了。
   2. 隱私權政策第 8 節本來寫著「我們沒有使用廣告或分析用的追蹤 Cookie」。
      裝了 GA 之後那句話就不是真的了，政策要跟著改——這不是文件工整問題，
      是公開頁面上對使用者的承諾。 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { makeAsserts } = require('./harness');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const privacy = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
const ID = 'G-L5LSDESD9F';

/* 用指定的網址開一次首頁，回報「有沒有去載 GA 的腳本」。
   不實際連外網：攔截 appendChild，看有沒有人要插那支 script。 */
function loadFrom(url) {
  const added = [];
  // 這支不用 harness：要驗的就是「真的這份 index.html 在某個網址下會不會載 GA」，
  // 所以用最素的 jsdom。頁面其他腳本在這種素環境下會噴錯（沒有 config.js、
  // 沒有 Supabase SDK），那些不是這支要管的事，丟進黑洞 console。
  const dom = new JSDOM(index, {
    url,
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole(),
    beforeParse(window) {
      const realAppend = window.Node.prototype.appendChild;
      window.Node.prototype.appendChild = function (node) {
        const src = node && node.tagName === 'SCRIPT' ? String(node.src || '') : '';
        if (src.includes('googletagmanager.com')) {
          added.push(src);
          return node;                       // 攔下來，不要真的讓 jsdom 去抓
        }
        return realAppend.call(this, node);  // 其他的（config.js…）照原本的走
      };
    },
  });
  return { gaHits: added, dataLayer: dom.window.dataLayer, window: dom.window };
}

(async () => {
  const t = makeAsserts('t35 流量統計與贊助按鈕');

  /* ================= 1. 正式網站：要送 ================= */
  const live = loadFrom('https://birthdaydeals.celine-fu-work.workers.dev/');
  t.eq('正式網域會載入 GA', live.gaHits.length, 1, JSON.stringify(live.gaHits));
  t.ok('帶的是 celine 的追蹤編號', live.gaHits[0].includes(ID), live.gaHits[0]);
  t.ok('有送出 config', (live.dataLayer || []).some((a) => a[0] === 'config' && a[1] === ID),
    JSON.stringify((live.dataLayer || []).map((a) => [...a].slice(0, 2))));

  /* ================= 2. 本機：不要送 ================= */
  ['http://localhost:8765/', 'http://127.0.0.1:5173/', 'http://app.localhost:3000/'].forEach((u) => {
    const dev = loadFrom(u);
    t.eq(`本機不送（${u.replace(/^https?:\/\//, '').replace(/\/$/, '')}）`, dev.gaHits.length, 0);
  });
  t.eq('本機也不要留下 config（不然之後有人補送就送出去了）',
    (loadFrom('http://localhost:8765/').dataLayer || []).filter((a) => a[0] === 'config').length, 0);

  /* ================= 3. 不要擋到頁面 ================= */
  t.ok('非同步載入，不卡畫面', /s\.async\s*=\s*true/.test(index));
  t.ok('gtag 先定義好，載入失敗也不會噴 ReferenceError',
    index.indexOf('function gtag()') < index.indexOf('googletagmanager.com'));
  t.ok('GA 掛了網站照常用', typeof live.window.dataLayer === 'object');

  /* ================= 4. 隱私權政策要跟著改 ================= */
  t.ok('不再宣稱「沒有使用分析用的追蹤 Cookie」',
    !/沒有使用廣告或分析用的追蹤\s*Cookie/.test(privacy),
    (privacy.match(/沒有使用[^<。]{0,30}/) || [''])[0]);
  t.ok('有寫到用了 Google Analytics', /Google Analytics/.test(privacy));
  t.ok('第三方服務那張表也補上了', /流量統計（Google Analytics/.test(privacy));
  t.ok('說得出看到的是什麼（整體數字，不拿來辨認個人）', /不會拿它去辨認你是誰/.test(privacy));
  t.ok('給得出擋掉的方法', /gaoptout/.test(privacy));
  t.ok('「不賣資料」這句留著', /不會把你的資料賣給任何人/.test(privacy));
  t.ok('最後更新日期有跟著改', /最後更新：2026 年 10 月 7 日/.test(privacy));

  /* ================= 5. Buy Me a Coffee 浮動按鈕 ================= */
  const bmc = (index.match(/<script data-name="BMC-Widget"[\s\S]*?><\/script>/) || [''])[0];
  t.ok('贊助按鈕的 script 在', bmc.length > 0);
  t.ok('指向 celine 的頁面', /data-id="celinefu"/.test(bmc), bmc);
  /* 這一條是實測踩到的：腳本裡寫的是 `"left"==dataset.position`，官方產生的程式碼
     卻給大寫的 "Right"。寫 "Left" 會比不中、默默掉回右邊，壓在「回到頂端」上面。 */
  t.ok('位置是小寫的 left（大寫會比不中，掉回右邊壓到「回到頂端」）',
    /data-position="left"/.test(bmc), bmc);
  /* 腳本開頭就 querySelector 自己這個 <script>，其餘掛在 DOMContentLoaded。
     async 有機會在那個事件之後才執行，按鈕就永遠不會出現。 */
  t.ok('用 defer 不用 async', / defer/.test(bmc) && !/ async/.test(bmc), bmc);
  t.ok('對話泡泡關掉（它位置寫死在底部，會被手機導覽列切掉，又沒有 id 可以選）',
    /data-message=""/.test(bmc), bmc);
  t.ok('用網站自己的主色', /data-color="#e8483c"/.test(bmc));
  t.ok('排在 </body> 前面，不卡頁面顯示', index.indexOf('BMC-Widget') > index.indexOf('connectLive()'));

  const css = index.replace(/\s+/g, ' ');
  t.ok('z-index 壓回 54，不要蓋在網站自己的東西上面', css.includes('#bmc-wbtn{z-index:54 !important}'));
  t.ok('手機才墊高，跟「回到頂端」同一個算式',
    /@media\(max-width:768px\)\{ \/\*[^*]*\*\/ #bmc-wbtn\{bottom:calc\(16px \+ var\(--tabbar-h\)/.test(css)
    || css.includes('#bmc-wbtn{bottom:calc(16px + var(--tabbar-h) + var(--kb-offset,0px) + env(safe-area-inset-bottom)) !important}'),
    '找不到手機版的墊高規則');
  t.ok('沒有去動展開的視窗（手機上是滿版的，動它只會多一條縫）',
    !/#bmc-iframe\{[^}]*bottom/.test(css));

  t.ok('隱私權政策有寫到贊助是第三方服務', /Buy Me a Coffee/.test(privacy));
  t.ok('而且講明看不到信用卡號', /看不到你的信用卡號/.test(privacy));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
