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
  t.ok('最後更新日期有跟著改', /最後更新：2026 年 10 月 8 日/.test(privacy));

  /* ================= 5. 咖啡按鈕 =================
     celine：「現在直接點咖啡按鈕會覺得莫名其妙」。原本是 Buy Me a Coffee 的浮動元件
     ——一顆沒有說明的杯子，點下去直接跳付款表單。改成自己的按鈕＋先講清楚的小視窗，
     第三方腳本因此完全不用載。 */
  // celine：「字有點多且占版面」——要短，但不能短到又變成一顆看不懂的杯子
  const label = (index.match(/id="btnCoffee"[^>]*>([^<]*)</) || ['', ''])[1];
  t.ok('按鈕帶著字，不是一顆孤零零的杯子', /咖啡/.test(label), label);
  t.ok('而且夠短，不佔版面', label.replace(/[^一-鿿]/g, '').length <= 5, label);
  t.ok('有一張先把話講清楚的視窗', /<dialog id="dlgCoffee"/.test(index));
  t.ok('視窗裡說明了為什麼要請', /主機跟網域的錢也是自己付/.test(index));
  /* celine 看過兩版都說「很刻意」：先是「完全自願，不請也不會少掉任何功能」，
     再是「沒有也真的沒關係」。兩句的毛病一樣——都在幫讀者預演「我不給」，
     等於先替對方覺得尷尬。不給是預設，不用安慰；講完想講的就停。 */
  // 只看視窗裡真的會被讀到的字——那幾句話還留在旁邊的註解裡當對照，不算數
  const coffeeSay = (index.match(/<dialog id="dlgCoffee"[\s\S]*?<\/dialog>/) || [''])[0]
    .replace(/<!--[\s\S]*?-->/g, '');
  t.ok('不要再用免責聲明的語氣',
    !/完全自願/.test(coffeeSay) && !/不會少掉任何功能/.test(coffeeSay), coffeeSay.slice(0, 200));
  t.ok('也不要替對方預演「我不給」',
    !/沒關係/.test(coffeeSay) && !/沒有也/.test(coffeeSay), coffeeSay.slice(0, 200));
  t.ok('想講的講完就停', /請我喝杯咖啡我會很開心。<\/p>/.test(coffeeSay), coffeeSay.slice(-120));
  t.ok('那份「沒關係」交給退出那顆去說', /下次吧/.test(index));
  t.ok('確定了才去 buymeacoffee', /id="btnCoffeeGo"[\s\S]{0,120}buymeacoffee\.com\/celinefu/.test(index));
  t.ok('開新分頁而且擋住 opener',
    /id="btnCoffeeGo"[\s\S]{0,200}rel="noopener"/.test(index));
  // 整支第三方腳本都不用載了：沒有人按，就不會有任何對 buymeacoffee 的連線或 cookie
  t.ok('完全沒有第三方腳本', !/cdnjs\.buymeacoffee\.com/.test(index) && !/BMC-Widget/.test(index));

  const css = index.replace(/\s+/g, ' ');
  t.ok('釘在左下角（右下是「回到頂端」）', /#btnCoffee\{position:fixed;left:16px;/.test(css));
  t.ok('墊在底部導覽列上面，跟「回到頂端」同一個算式',
    css.includes('bottom:calc(16px + var(--tabbar-h) + var(--kb-offset,0px) + env(safe-area-inset-bottom))'));
  t.ok('z-index 54，不蓋在網站自己的東西上面', /#btnCoffee\{[^}]*z-index:54/.test(css));

  t.ok('隱私權政策有寫到贊助是第三方服務', /Buy Me a Coffee/.test(privacy));
  t.ok('而且講明看不到信用卡號', /看不到你的信用卡號/.test(privacy));
  t.ok('政策也跟著改成「按之前不會載入他們的程式」',
    /在你前往之前[\s\S]{0,40}不會載入他們的任何程式/.test(privacy));

  /* ================= 6. 頁尾連回品牌頁 ================= */
  const home = (index.match(/<a class="xsj-lockup xsj-home"[\s\S]*?>/) || [''])[0];
  t.ok('頁尾的小數據所連得回品牌頁',
    /afortunadofu-bot\.github\.io\/celinefubrandpage/.test(home), home);
  t.ok('開新分頁而且擋住 opener', /target="_blank"/.test(home) && /rel="noopener"/.test(home));
  // 不加 width:max-content 的話這個 <a> 會撐滿整行，右邊一大片空白也能點到
  t.ok('點擊範圍只有標誌那一塊，不是整行',
    /\.xsj-home\{[^}]*width:max-content/.test(index), '少了 width:max-content');
  t.ok('外觀不變（不要底線、不要變成連結色）',
    /\.xsj-home\{[^}]*text-decoration:none[^}]*color:inherit/.test(index));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
