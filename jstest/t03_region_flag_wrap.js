/* 待審佇列「適用地區」標籤跑版（嵐回饋：又跑版了，截圖是審核分頁的待審佇列）

   根因：.flag 為了「當月」「免費・需消費」這種短標籤不要從中間斷掉，設了
   white-space:nowrap。但地區標籤塞的是縣市清單，全台的店可以長到十幾個縣市，
   nowrap 就整串撐出卡片右邊。修法是加一個 .flag.wrap 變體，只套在地區標籤上，
   其餘短標籤維持原本不換行的行為——所以測試要同時驗「地區有 wrap」跟
   「其他 flag 沒有 wrap」，只驗前者的話，哪天有人把 wrap 加到 .flag 本身
   （短標籤又會開始亂斷）測試也照樣綠。

   getComputedStyle 在 jsdom 對 class 選擇器的支援不完整，所以樣式本身改從
   CSSOM（document.styleSheets）把規則撈出來比對，這比較不會受 jsdom 版本影響。 */
const { boot, tick, makeSb, makeAsserts } = require('./harness');

const row = (id, brand, regions) => ({
  id, brand, category: '速食', regions, offer: `${brand} 生日優惠`,
  membership: '', membership_type: 'app', membership_cost: 'free', free_tier: 'free_min',
  advance_days: 0, timing: '當月', value_twd: null, conditions: '', sources: [],
  status: 'pending', submitted_by: 'u-1', created_at: '2026-09-01T00:00:00Z',
});

const ALL_COUNTIES = ['基隆市', '台北市', '新北市', '桃園市', '新竹市', '新竹縣', '苗栗縣',
  '台中市', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '台南市', '高雄市', '屏東縣',
  '宜蘭縣', '花蓮縣', '台東縣'];

(async () => {
  const t = makeAsserts('t03 待審佇列地區標籤換行');
  const { win } = await boot();
  const doc = win.document;

  /* ---- 1. CSS 規則本身 ---- */
  const rules = [];
  for (const sheet of doc.styleSheets) {
    let list;
    try { list = sheet.cssRules; } catch { continue; }
    for (const r of list) if (r.selectorText) rules.push(r);
  }
  const flagRule = rules.find((r) => r.selectorText === '.flag');
  const wrapRule = rules.find((r) => r.selectorText === '.flag.wrap');

  t.ok('.flag 規則存在', !!flagRule);
  t.eq('.flag 維持 nowrap（短標籤不要從中間斷掉）',
    flagRule && flagRule.style.getPropertyValue('white-space').trim(), 'nowrap');
  t.ok('.flag.wrap 規則存在', !!wrapRule);
  t.eq('.flag.wrap 允許換行', wrapRule && wrapRule.style.getPropertyValue('white-space').trim(), 'normal');
  t.eq('.flag.wrap 不超過容器寬度', wrapRule && wrapRule.style.getPropertyValue('max-width').trim(), '100%');
  t.ok('.flag.wrap 長字串也能斷（overflow-wrap:anywhere）',
    wrapRule && /anywhere/.test(wrapRule.style.getPropertyValue('overflow-wrap')),
    wrapRule && wrapRule.style.getPropertyValue('overflow-wrap'));

  /* ---- 2. 實際渲染：只有地區那顆吃到 wrap ---- */
  const sb = makeSb({
    tables: {
      offers: [row(301, '全台連鎖', ALL_COUNTIES), row(302, '沒填地區的店', [])],
      profiles_public: [{ id: 'u-1', display_name: '小明' }],
    },
  });
  win.__sb = sb;
  win.eval('sb = window.__sb; LIVE = true; myProfile = {id:"admin-1", is_admin:true};');

  await win.loadPending();
  await tick(win);

  const rowEl = doc.querySelector('.pend-row[data-row="301"]');
  const flags = [...rowEl.querySelectorAll('.flag')];
  t.eq('一列四顆標籤（期間／免費層級／會員／地區）', flags.length, 4);

  const wrapped = flags.filter((f) => f.classList.contains('wrap'));
  t.eq('只有一顆標籤吃到 wrap', wrapped.length, 1);
  t.ok('吃到 wrap 的就是地區那顆',
    wrapped[0].textContent === ALL_COUNTIES.join('、'), wrapped[0].textContent);
  t.ok('前三顆短標籤維持不換行（沒有 wrap）',
    flags.slice(0, 3).every((f) => !f.classList.contains('wrap')),
    flags.slice(0, 3).map((f) => f.className));
  t.ok('地區那顆是整列最後一顆', flags[3] === wrapped[0]);

  /* ---- 3. 沒填地區的 fallback 也要是同一顆（同樣有 wrap，不會突然變回 nowrap）---- */
  const empty = doc.querySelector('.pend-row[data-row="302"]');
  const emptyFlags = [...empty.querySelectorAll('.flag')];
  t.eq('未填地區顯示提示字', emptyFlags[3].textContent, '未填地區');
  t.ok('未填地區那顆一樣帶 wrap', emptyFlags[3].classList.contains('wrap'));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
