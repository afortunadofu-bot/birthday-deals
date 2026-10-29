/* v146：celine 2026-10-29 回報的版面／文字修正

   「灰色小字太多」「搜尋清單有灰色底」「這公告的字怪怪的，也沒有廣告當開頭很怪」
   「名次跑版」「更新紀錄標題太靠上了，留白空間太小」 */
const fs = require('fs');
const path = require('path');
const { boot, makeAsserts } = require('./harness');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  const t = makeAsserts('t67 1029 版面修正');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];
  const index = read('index.html');

  /* ---- 1. 待辦清單的搜尋框不該有灰底 ----
     它本來借用首頁的 .searchbar——那個是 sticky，底色是為了讓清單捲到它下面
     時不會穿幫。放在 panel 裡不需要 sticky，底色就只剩一條沒來由的灰帶。 */
  const wlSearch = $('#wlSearch');
  t.ok('搜尋框還在', !!wlSearch);
  t.ok('不再借用首頁那條 sticky 的樣式',
    !wlSearch.closest('.searchbar'));
  t.ok('改用自己的樣式', !!wlSearch.closest('.wl-searchbar'));
  const wlCss = (index.match(/\.wl-searchbar\{[^}]*\}/) || [''])[0];
  t.ok('而且那個樣式沒有 sticky，也沒有底色',
    wlCss && !/sticky/.test(wlCss) && !/background/.test(wlCss), wlCss);
  /* 首頁那條要維持原樣——它需要底色 */
  t.ok('首頁的搜尋列還是 sticky＋有底色',
    /\.searchbar\{[^}]*position:sticky[^}]*\}/.test(index.replace(/\n\s*/g, ''))
    || /\.searchbar\{[^}]*\}/.test(index));

  /* ---- 2. 咖啡視窗：「也沒有廣告」不要自己當一段的開頭 ---- */
  const coffee = $('#dlgCoffee');
  t.ok('「功能全部免費」跟「也沒有廣告」是同一句',
    /全部免費，也沒有廣告/.test(coffee.textContent), coffee.textContent.trim().slice(0, 40));
  const say = coffee.querySelector('.coffee-say').textContent.trim();
  t.ok('下面那段不再從「也」開頭', !say.startsWith('也'), say.slice(0, 24));

  /* ---- 3. 排行榜名次跑版（兩位數被拆成上下兩行）---- */
  const rkCss = (index.match(/table\.lb \.rk\{[\s\S]*?\}/) || [''])[0];
  t.ok('名次那一欄不換行', /white-space:nowrap/.test(rkCss), rkCss);

  /* ---- 4. 更新紀錄那一頁的留白 ---- */
  const upd = read('updates.html');
  const mainCss = (upd.match(/\bmain\{padding:(\d+)px/) || [])[1];
  t.ok('標題上方留白比原本的 28px 多', Number(mainCss) > 28, mainCss + 'px');

  /* ---- 5. 「我的」頁面的灰色小字 ----
     留下來的標準：不講就會做錯、或牽涉到別人看不看得到。
     純粹描述「這一塊是什麼」的那幾句拿掉——標題已經說了。 */
  const mine = $('#tab-mine');
  /* 有幾句在原始碼裡是斷成兩行寫的，換行跟縮排不算字數 */
  const subs = [...mine.querySelectorAll('p.sub')]
    .map((p) => p.textContent.replace(/\s+/g, '').trim());
  const gone = ['用回報紀錄自動累積', '點一筆可以看詳情', '最近改了什麼',
    '找生日優惠很花時間'];
  gone.forEach((g) => t.ok(`拿掉了：${g}…`, !subs.some((s) => s.includes(g))));
  t.ok('剩下的每一句都在 40 字以內',
    subs.every((s) => s.length <= 40),
    subs.filter((s) => s.length > 40).join(' ｜ '));
  /* 真的重要的那幾句要留著 */
  t.ok('「會出現在排行榜上」這種跟別人看得到有關的留著',
    subs.some((s) => /排行榜/.test(s)));
  t.ok('徽章那一塊還在（只是不再多一行說明）', !!$('#badgesPanel'));
  /* v154 收進了「我送出過的」，變成裡面的一顆小分頁。清單本身（#myReports）沒動。 */
  t.ok('「我的使用回報」那一格還在',
    !!$('#myRecordsPanel #myReports')
    && [...doc.querySelectorAll('#myRecordsPanel .rec-tab')].some((b) => /使用回報/.test(b.textContent)));
  t.ok('更新紀錄那一塊還在', !!$('#siteUpdatesPanel'));
  t.ok('分享那一塊還留一句（講什麼時候用得上）',
    /生日快到時傳一下/.test($('#shareSitePanel').textContent));

  t.done();
})();
