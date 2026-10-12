/* celine 轉來的一批（嵐的回饋 ＋ 她自己看到的）：

   1.「洞察趨勢本月，可以選月份」
   2. 嵐：「壽星日，用完最推薦的清單」「給推薦星等排行」
   3.「下方空白很大，檢查」
   4.「隱私權跟服務的呈現方式有點醜」
   5.「調整區塊順序的按鈕出現在那邊還是很醜，改一下」

   3 的原因是同一段清空間被算了兩次（body 的 padding-bottom ＋ .xsj-footer 的），
   jsdom 沒有版面可量，所以那條用 CSS 文字驗；其餘都在 DOM 上驗得到。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

(async () => {
  const t = makeAsserts('t38 選月份、星等排行、版面三處');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];

  /* ================= 1. 洞察分析可以選月份 ================= */
  t.ok('「本月」那個小分頁改叫「月份」',
    /data-pane="biMonth">月份</.test(index));
  t.ok('月份下拉在「月份」那一頁裡', !!$('#biMonth #momMonth'));

  // momMonths：資料視窗第一個月通常只抓到半個月，拿它比會失真，所以要被濾掉
  const months = (rows, since) => win.eval(
    `MOM_SINCE=${JSON.stringify(since)}; JSON.stringify(momMonths(${JSON.stringify(rows)}))`);
  const rows = [
    { used_on: '2026-04-20', saved: 10, success_uses: 1 },
    { used_on: '2026-05-03', saved: 20, success_uses: 2 },
    { used_on: '2026-06-09', saved: 30, success_uses: 3 },
  ];
  const got = JSON.parse(months(rows, '2026-04-15'));
  t.ok('整個月都在範圍內的留著', got.includes('2026-05') && got.includes('2026-06'));
  const cut = JSON.parse(months(rows, '2026-05-10'));
  t.ok('只抓到半個月的那個月濾掉', !cut.includes('2026-05'), cut.join(','));
  const nowYm = new Date().toISOString().slice(0, 7);
  t.ok('當月一定選得到（月初還沒人回報也要在）', cut.includes(nowYm), cut.join(','));
  t.eq('由新到舊', got, [...got].sort().reverse());

  // 選了月份就跟那個月的上個月比
  win.eval(`MOM_SINCE='2026-01-01'; MOM_ROWS=${JSON.stringify([
    { used_on: '2026-05-03', saved: 100, success_uses: 2 },
    { used_on: '2026-06-09', saved: 300, success_uses: 6 },
  ])};`);
  const sel = $('#momMonth');
  sel.innerHTML = '<option value="2026-06">6</option><option value="2026-05">5</option>';
  sel.value = '2026-06';
  win.renderMomSelected();
  let txt = $('#boardMoM').textContent.replace(/\s+/g, ' ');
  t.ok('畫的是選到的那個月', /2026-06/.test(txt), txt.slice(0, 120));
  t.ok('而且跟上個月比得出來', /上個月/.test(txt) && /200%|▲/.test(txt), txt.slice(0, 160));
  sel.value = '2026-05';
  win.renderMomSelected();
  txt = $('#boardMoM').textContent.replace(/\s+/g, ' ');
  t.ok('換一個月就換一組數字', /2026-05/.test(txt), txt.slice(0, 120));

  /* 上個月落在資料視窗外時，不能假裝它是 0 ——那會生出一個憑空的「▲ 100%」 */
  win.eval(`MOM_SINCE='2026-05-01';`);
  sel.value = '2026-05';
  win.renderMomSelected();
  txt = $('#boardMoM').textContent.replace(/\s+/g, ' ');
  t.ok('資料範圍外的上個月不要假裝是 0', !/▲|▼/.test(txt), txt.slice(0, 160));
  t.ok('而且說得出為什麼沒有比較', /不在資料範圍/.test(txt), txt.slice(0, 160));

  /* ================= 2. 用過的人最推薦 ================= */
  const rated = $('#pnlTopRated');
  t.ok('排行榜多一塊星等排行', !!rated && !!rated.closest('#tab-board'));
  t.ok('也能跟著一起排順序', rated.hasAttribute('data-block'));

  /* 排序不是直接比平均：兩個人給的 5 星不該站在八個人給的 5 星前面。
     貝氏平均先往整站平均拉一把，評的人越多才越站得住。
     單票直接不上榜——整站平均本來就在 4.9 上下，一個人給的 5 星收斂完還是
     停在平均之上，會蓋過真的被很多人用過的店；而且一個人說好也不叫推薦。 */
  const order = (offers) => JSON.parse(win.eval(
    `JSON.stringify(topRatedRows(${JSON.stringify(offers)}).map(o=>o.brand))`));
  const sample = [
    { id: 1, brand: '八個人五星', ratingAvg: 5, ratingCount: 8 },
    { id: 2, brand: '兩個人五星', ratingAvg: 5, ratingCount: 2 },
    { id: 3, brand: '五個人四點八', ratingAvg: 4.8, ratingCount: 5 },
    { id: 4, brand: '一個人五星', ratingAvg: 5, ratingCount: 1 },
    { id: 5, brand: '沒人評分', ratingAvg: null, ratingCount: 0 },
  ];
  const ranked = order(sample);
  t.eq('人多的五星排第一', ranked[0], '八個人五星');
  t.ok('同樣五星，人少的排後面',
    ranked.indexOf('八個人五星') < ranked.indexOf('兩個人五星'), ranked.join(' > '));
  t.ok('只有一個人評過的不上榜', !ranked.includes('一個人五星'), ranked.join(' > '));
  t.ok('沒人評分的也不上榜', !ranked.includes('沒人評分'), ranked.join(' > '));

  win.eval(`OFFERS=${JSON.stringify(sample)};`);
  win.renderTopRated();
  const trs = $$('#ratedBody tbody tr');
  t.eq('畫得出來', trs.length, 3);
  t.ok('看得到星星、平均分跟人數', /★/.test(trs[0].textContent)
    && /5/.test(trs[0].textContent) && /8 人/.test(trs[0].textContent),
    trs[0].textContent.replace(/\s+/g, ' ').trim());
  t.ok('點一列會打開那筆優惠的詳情', trs[0].classList.contains('lb-click')
    && trs[0].dataset.oid === '1');
  win.eval('OFFERS=[];');
  win.renderTopRated();
  t.ok('還沒有人評分時講得出下一步',
    /回報之後/.test($('#ratedBody').textContent), $('#ratedBody').textContent.trim());
  t.ok('面板上有寫出上榜門檻', /兩個人/.test($('#pnlTopRated .sub').textContent),
    $('#pnlTopRated .sub').textContent.trim());

  /* ================= 3. 下方空白很大 ================= */
  /* body 有 padding-bottom:tabbar（給所有分頁的保險），.xsj-footer 又加一次，
     所以頁面最後多出整整一個分頁列高度的頁底色。jsdom 沒有版面可量，驗 CSS。 */
  const css = index.replace(/\s+/g, ' ');
  t.ok('body 還是留著那段保險', /body\{padding-bottom:calc\(var\(--tabbar-h\)/.test(css));
  t.ok('頁尾把多算的那一份拉回來',
    /\.xsj-footer\{[^}]*margin-bottom:calc\(0px - var\(--tabbar-h\) - env\(safe-area-inset-bottom\)\)/.test(css),
    (css.match(/\.xsj-footer\{[^}]*\}/g) || []).slice(-1)[0]);

  /* ================= 4. 隱私權／服務條款的呈現 ================= */
  const links = $$('footer .foot-links a').map((a) => a.getAttribute('href'));
  t.ok('四頁收成同一排', links.includes('privacy.html') && links.includes('terms.html')
    && links.includes('updates.html') && links.includes('about.html'), links.join(','));
  t.ok('不要再用全形空白加「·」兜出來的間距',
    !/<p><a href="privacy\.html">/.test(index));
  t.ok('那一排跟上面的說明文字用一條線分開',
    /\.foot-links\{[^}]*border-top/.test(css));

  /* ================= 5. 調整區塊順序的按鈕 ================= */
  for (const page of ['board', 'mine']) {
    const main = $(`#tab-${page} .wrap`);
    const bar = main.querySelector('.order-bar');
    t.ok(`${page}：排序列收在整頁最後面`, main.lastElementChild === bar,
      main.lastElementChild && main.lastElementChild.className);
    t.ok(`${page}：按鈕還在`, !!bar.querySelector(`.blk-order-toggle[data-page="${page}"]`));
  }
  t.ok('平常是一條安靜的文字列，不是一顆按鈕',
    /main:not\(\.ordering\) \.order-bar \.btn\{[^}]*border:0/.test(css));
  t.ok('進排序模式才釘在畫面底部（「完成」要永遠按得到）',
    /\.ordering \.order-bar\{[^}]*position:sticky/.test(css));
  t.ok('排序模式只留搬得動的東西',
    /\.ordering > :not\(\[data-block\]\):not\(\.order-bar\)\{display:none/.test(css));

  // 排序模式本身還是要能用（搬完順序存得起來）
  win.toggleBlockOrdering('board', true);
  await tick(win, 2);
  t.ok('進得去排序模式', $('#tab-board .wrap').classList.contains('ordering'));
  t.ok('每一塊都長出搬移列', $$('#tab-board .wrap > [data-block] > .blk-move').length > 1);
  t.eq('完成鈕的字會換', $('#tab-board .blk-order-toggle').textContent, '✓ 完成');
  const before = $$('#tab-board .wrap > [data-block]').map((e) => e.id);
  $$('#tab-board .blk-move')[1].querySelector('.blk-up').click();
  await tick(win, 2);
  const after = $$('#tab-board .wrap > [data-block]').map((e) => e.id);
  t.eq('↑ 真的把它往前搬了', after[0], before[1]);
  t.ok('而且存起來了',
    (JSON.parse(win.localStorage.getItem('sxr_order_board') || '[]'))[0] === before[1]);
  win.toggleBlockOrdering('board', false);
  await tick(win, 2);
  t.ok('出得來', !$('#tab-board .wrap').classList.contains('ordering'));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
