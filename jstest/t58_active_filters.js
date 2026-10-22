/* v135：套用中的篩選攤在列表上面，每一個都可以單獨拿掉

   celine（2026-10-17，問卷回饋）：
   「手機介面下列表頁清除篩選位置不明顯，是否現在是套用篩選的狀態也不夠明顯」

   在這之前，收起篩選面板之後唯一的線索是「篩選」按鈕上的一個數字——看得出
   「有幾個」，看不出「是哪些」；要拿掉其中一個得重新打開面板、在一長串開關裡找，
   「清除篩選」那顆也埋在面板最下面。

   問卷「你遇過哪些問題」第二名是「優惠太多看不完」（64 人、22%）。 */
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t58 篩選中的條件看得見');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];

  win.eval(`OFFERS = [
    {id:1, brand:'鬥牛士', category:'火鍋', offer:'送鍋', regions:['台北市'], timing:'當月', sources:[], verified:true},
    {id:2, brand:'茶六', category:'燒肉', offer:'送肉', regions:['台中市'], timing:'當月', sources:[], verified:false},
    {id:3, brand:'清心', category:'飲料', offer:'送茶', regions:['台北市'], timing:'當週', sources:[], verified:false}];`);
  win.buildControls();
  await tick(win, 1);
  win.render();

  const box = () => $('#activeFilters');
  const chips = () => $$('#activeFilters .af-chip[data-i]').map((b) => b.textContent.replace('✕', '').trim());
  const cards = () => $$('#grid .card').length;

  t.ok('什麼都沒篩的時候，整條不出現', box().classList.contains('hidden'));

  /* ---- 選一個類別 ---- */
  const catChip = $$('#cats .chip').find((c) => c.dataset.v === '火鍋');
  catChip.click();
  await tick(win, 1);
  t.ok('篩了就看得到', !box().classList.contains('hidden'));
  t.eq('看得到篩的是哪一個，不只是數字', chips(), ['火鍋']);
  t.eq('列表真的篩了', cards(), 1);
  t.ok('旁邊就有「全部清除」，不用再打開面板', !!$('#afClearAll'));

  /* ---- 再加一個開關 ---- */
  $('#fVerified').checked = true;
  win.render();
  t.eq('兩個條件各自一顆', chips(), ['火鍋', '已查證']);
  t.eq('「篩選」按鈕上的數字跟著對', $('#filterBadge').textContent, '2');

  /* ---- 單獨拿掉其中一個 ---- */
  $$('#activeFilters .af-chip[data-i]')[1].click();
  await tick(win, 1);
  t.eq('拿掉「已查證」，另一個還在', chips(), ['火鍋']);
  t.eq('那顆開關也跟著彈起來', $('#fVerified').checked, false);

  /* ---- 拿掉類別：面板裡的 chip 也要同步 ---- */
  $$('#activeFilters .af-chip[data-i]')[0].click();
  await tick(win, 1);
  t.ok('全部拿掉之後整條收起來', box().classList.contains('hidden'));
  t.eq('列表回到全部', cards(), 3);
  t.eq('面板裡那顆也彈起來了（不然重開面板會對不上）',
    catChip.getAttribute('aria-pressed'), 'false');
  t.eq('「全部」那顆按回去', $$('#cats .chip').find((c) => c.dataset.v === '').getAttribute('aria-pressed'), 'true');

  /* ---- 搜尋字也算一個條件 ---- */
  $('#q').value = '茶六';
  win.render();
  t.eq('搜尋字看得見，也拿得掉', chips(), ['搜尋「茶六」']);
  $$('#activeFilters .af-chip[data-i]')[0].click();
  await tick(win, 1);
  t.eq('拿掉就把搜尋框清空', $('#q').value, '');

  /* ---- 預設勾著的那顆，要反過來說 ---- */
  $('#fLive').checked = false;
  win.render();
  t.eq('「隱藏過期」取消勾選，說的是「含過期的」', chips(), ['含過期的']);
  $$('#activeFilters .af-chip[data-i]')[0].click();
  await tick(win, 1);
  t.eq('拿掉之後回到預設（勾著）', $('#fLive').checked, true);

  /* ---- 全部清除 ---- */
  $$('#cats .chip').find((c) => c.dataset.v === '火鍋').click();
  $('#fVerified').checked = true;
  $('#q').value = '鬥牛士';
  win.render();
  t.eq('三個條件', chips().length, 3);
  $('#afClearAll').click();
  await tick(win, 1);
  t.ok('一鍵清光', box().classList.contains('hidden'));
  t.eq('搜尋框也清掉', $('#q').value, '');
  t.eq('列表全部回來', cards(), 3);

  t.done();
})();
