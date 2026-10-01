/* 類別「火鍋燒肉」拆成「火鍋」跟「燒肉」（celine：「提議新增分類標籤：燒肉 飲料 甜點 火鍋」）

   飲料、甜點烘焙本來就是獨立類別，真正混在一起的是火鍋燒肉——站上 73 筆裡 50 筆是
   鍋物、22 筆是燒肉，想「今天只吃燒肉」的人篩完還是得自己一筆一筆看。

   這支要顧的重點是「schema_v77 還沒跑的那段時間」：資料庫裡還是舊的「火鍋燒肉」，
   篩選列是照資料長出來的，所以舊值不能消失、也不能把畫面弄壞。 */
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t26 火鍋／燒肉分家');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  const cats = win.eval('CATEGORIES');
  t.ok('火鍋、燒肉各自是一個類別', cats.includes('火鍋') && cats.includes('燒肉'), cats);
  t.ok('不再有合在一起的「火鍋燒肉」', !cats.includes('火鍋燒肉'), cats);
  t.ok('飲料、甜點本來就在（沒有重複新增）',
    cats.includes('飲料') && cats.includes('甜點烘焙'), cats);
  t.eq('火鍋跟燒肉排在一起', cats.indexOf('燒肉') - cats.indexOf('火鍋'), 1);
  t.ok('投稿表單的類別選單跟著有',
    [...$('#fCategory').options].map((o) => o.value).includes('燒肉'),
    [...$('#fCategory').options].map((o) => o.value));

  const colors = win.eval('CAT_COLOR');
  t.ok('兩個類別的小圓點顏色不一樣', colors['火鍋'] && colors['燒肉'] && colors['火鍋'] !== colors['燒肉'],
    [colors['火鍋'], colors['燒肉']]);
  t.ok('v77 還沒跑的舊值也還有顏色，不會掉成灰的', !!colors['火鍋燒肉']);

  /* ---- 篩選列 ---- */
  const chipText = () => [...doc.querySelectorAll('#cats .chip')].map((c) => c.textContent.trim());
  const chipVals = () => [...doc.querySelectorAll('#cats .chip')].map((c) => c.dataset.v ?? c.dataset.val ?? c.getAttribute('data-v'));
  win.eval(`OFFERS = [
    {id:1, brand:'鬥牛士二鍋', category:'火鍋', offer:'鍋物', regions:[], timing:'當月', sources:[]},
    {id:2, brand:'茶六燒肉堂', category:'燒肉', offer:'燒肉', regions:[], timing:'當月', sources:[]},
    {id:3, brand:'森森燒肉', category:'燒肉', offer:'燒肉', regions:[], timing:'當月', sources:[]},
    {id:4, brand:'清心福全', category:'飲料', offer:'飲料', regions:[], timing:'當月', sources:[]}];`);
  win.buildControls();
  await tick(win, 1);
  t.ok('火鍋、燒肉各自一格', chipText().some((x) => /^火鍋（1）/.test(x)) && chipText().some((x) => /^燒肉（2）/.test(x)),
    chipText());
  t.ok('每一格都寫出有幾筆', chipText().slice(1).every((x) => /（\d+）$/.test(x)), chipText());
  t.eq('照固定順序排，不是照資料出現順序', chipText().slice(1).map((x) => x.replace(/（\d+）/, '')),
    ['火鍋', '燒肉', '飲料']);

  /* ---- v77 還沒跑：舊的「火鍋燒肉」不能消失 ---- */
  win.eval(`OFFERS = [
    {id:1, brand:'鬥牛士二鍋', category:'火鍋燒肉', offer:'鍋物', regions:[], timing:'當月', sources:[]},
    {id:4, brand:'清心福全', category:'飲料', offer:'飲料', regions:[], timing:'當月', sources:[]}];`);
  win.buildControls();
  await tick(win, 1);
  t.ok('v77 還沒跑時舊類別照樣篩得到', chipText().some((x) => /^火鍋燒肉（1）/.test(x)), chipText());
  t.eq('沒出現在清單上的舊值排在後面', chipText().slice(1).map((x) => x.replace(/（\d+）/, '')),
    ['飲料', '火鍋燒肉']);
  t.ok('不會因為類別沒資料就畫出空的一格', !chipText().some((x) => /（0）/.test(x)), chipText());

  /* ---- 更新紀錄有寫（這是使用者看得到的改動）---- */
  const updates = win.eval('SITE_UPDATES');
  const allText = updates.map((u) => u.title + u.items.join('')).join('');
  t.ok('更新紀錄寫了火鍋跟燒肉分開', /火鍋/.test(allText) && /燒肉/.test(allText), updates[0]);
  // 嵐：跟生日卡片有關的東西都不要寫進更新紀錄
  t.ok('更新紀錄裡沒有生日卡片的事', !/生日卡片|生日動畫|祝福/.test(allText),
    allText.match(/生日卡片|生日動畫|祝福/));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
