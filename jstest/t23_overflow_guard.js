/* 版面溢出的防線（celine：「確定每個地方各種情況都不要跑版」）

   使用者自己打的字可能是一長串沒有空白的英文、一條很長的網址，或一整排中文標點
   （「。。。。」在中文排版規則裡不能出現在行首，所以整串被當成一個不能拆的東西）。
   這些字放進 flex／grid 容器時，子項目預設的 min-width:auto 會讓它「絕不縮小」，
   於是整張卡片、整個面板、甚至整頁被撐寬——就是一再被回報的跑版。

   真正的版面驗證是在瀏覽器上做的（280／360／375／414／768／1024／1280 七種寬度，
   把惡意內容塞進每一個清單，逐一量 scrollWidth vs clientWidth，全部歸零）。
   jsdom 沒有排版引擎，量不到寬度，所以這一支只守「那些規則還在不在」——
   避免之後有人整理 CSS 時把它們刪掉，跑版又整批回來。 */
const fs = require('fs');
const path = require('path');
const { makeAsserts } = require('./harness');

const css = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
// 把換行與多餘空白壓掉，斷言才不會被排版方式影響
const flat = css.replace(/\s+/g, ' ');

const t = makeAsserts('t23 版面溢出防線');

const has = (needle) => flat.includes(needle.replace(/\s+/g, ' '));

/* ---- 1. 使用者輸入的文字：可縮小 ＋ 沒有斷點時可硬斷 ---- */
t.ok('有一條統一的「使用者輸入可斷行」規則', has('min-width:0; overflow-wrap:anywhere;'));
[
  ['優惠卡片的內容', '.card p.offer'],
  ['優惠卡片的欄位表（條件／來源網址）', '.kv, .kv dt, .kv dd'],
  ['使用回報那一列', '.rep > span, .rep > b, .rep > div'],
  ['詳情裡的兩欄列表', '.sub-item > span, .sub-item > b, .sub-item > div'],
  ['留言', '.cmt .body, .cmt .who'],
  ['已退回／待審的內容', '.rej-row > div, .pend-row h3'],
  ['合併面板的卡片', '.merge-card, .merge-card .offer'],
  ['排行榜的暱稱欄', 'table.lb td .who, table.lb td'],
  ['問題回報的內文', '.fb-msg'],
  ['問卷逐筆的答案與留言', '.sv-ans, .sv-comment'],
  ['彈出視窗的標題與說明', '.dlg h2, .dlg > .sub, .dlg .sub'],
].forEach(([label, sel]) => t.ok(`防線涵蓋：${label}`, has(sel), sel));

t.ok('卡片標題（長店名）可斷行', has('.card h3{margin:0;font-size:1.03rem;font-weight:800;line-height:1.4;flex:1; min-width:0;overflow-wrap:anywhere}'));
t.ok('生日卡片的名字可斷行（Google 帳號的名字可能很長）', has('.bday-card h2{font-size:1.32rem;margin:10px 0 8px;letter-spacing:.01em;overflow-wrap:anywhere}'));

/* ---- 2. 不要被壓扁：一列塞太多東西時換行，而不是把某一格擠成 2px ---- */
t.ok('使用回報那一列排不下會換行', has('.rep{display:flex;flex-wrap:wrap;row-gap:4px'));
t.ok('標籤（已查證…）不會被壓扁', has('.flag{display:inline-block;flex:0 0 auto;max-width:100%'));
t.ok('彈性欄位用 flex:1 1 auto，不是 flex:1（basis 0 會被擠成 0 寬）',
  !flat.includes('style="flex:1;min-width:0"'), '還有 flex:1;min-width:0 的寫法');

/* ---- 3. 原生表單元件：寬度會長到跟最寬的選項一樣 ---- */
t.ok('篩選選單／輸入框不超過容器', has('.lbl select,.lbl input{min-width:0;max-width:100%}'));
t.ok('待辦清單的標籤選單不超過卡片', has('.wl-chips select,.wl-tag-wrap{max-width:100%;min-width:0}'));
t.ok('管理員 email 輸入框在小螢幕不會超出', has('min-width:min(200px,100%)'));

/* ---- 4. 絕對定位的選單不能戳出畫面 ---- */
t.ok('待辦清單的「⋯」選單限制在畫面內', has('max-width:min(260px, calc(100vw - 40px))'));

/* ---- 5. 整排排不下時換行，不要把搜尋框擠成小方塊 ---- */
t.ok('搜尋列可換行、搜尋框有最小寬度', has('.searchbar input[type=search]{flex:1 1 150px;min-width:150px'));
t.ok('窄螢幕時搜尋框自己一整行', has('@media(max-width:560px){ .searchbar input[type=search]{flex:1 1 100%} }'));
t.ok('「附近」不會被擠成兩行', has('.near-trigger{flex:none;white-space:nowrap}'));
t.ok('待辦清單的清單切換排不下就換行', has('.subtabs.wrap{flex-wrap:wrap'));

/* ---- 6. meta 那一排（投稿者：<超長暱稱>）---- */
t.ok('meta 的每一格最多跟容器一樣寬', has('.meta span{white-space:nowrap;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis}'));

/* ---- 7. grid 的 1fr 要允許縮到 0 ---- */
t.ok('欄位表的 1fr 改成 minmax(0,1fr)', has('grid-template-columns:auto minmax(0,1fr)'));

process.exit(t.done() ? 0 : 1);
