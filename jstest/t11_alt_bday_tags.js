/* 第二組生日（幫家人／另一半記）＋待辦清單標籤（v65）

   嵐許願、celine 拍板：
   - 「我的」加一欄「幫家人／另一半也記一個生日」，預設收著
   - 待辦清單自訂分組，上面用標籤篩選

   驗：
   - 第二組生日：面板在「我的」、預設收合、稱呼跟月份必填、存的內容正確、
     v65 沒跑時講人話、生日前 14 天提醒、「知道了」關掉就不再出現
   - 標籤：每一列一個下拉（預設值＋自訂）、存檔、上面的篩選（各標籤／沒有標籤）、
     貼上家人標籤的那一筆，入會死線改用家人的生日算 */
const { boot, tick, makeSb, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t11 第二組生日＋待辦清單標籤');
  const { win } = await boot();
  const doc = win.document;
  const ls = win.localStorage;
  const year = new Date().getFullYear();
  // 今天往後推 5 天當「家人的生日」，才測得到 14 天內的提醒
  const soon = new Date(Date.now() + 5 * 864e5);
  const altM = soon.getMonth() + 1, altD = soon.getDate();

  /* ================= 第二組生日：面板 ================= */
  const panel = doc.querySelector('#altBdayPanel');
  t.ok('「我的」分頁有第二組生日的面板', !!panel && !!panel.closest('#tab-mine'));
  t.ok('面板可以摺疊', !!panel.querySelector('.panel-cbody'));
  t.ok('celine：預設收著', panel.classList.contains('collapsed'));
  t.ok('在自己的生日欄位下面', doc.querySelector('#profilePanel')
    && (doc.querySelector('#profilePanel').compareDocumentPosition(panel) & 4) === 4);
  t.eq('月份選單有 12 個月', doc.querySelectorAll('#altMonth option').length, 13);
  t.eq('日期選單有 31 天', doc.querySelectorAll('#altDay option').length, 32);

  /* ================= 第二組生日：存檔 ================= */
  const sb = makeSb({});
  win.__sb = sb;
  win.eval('sb = window.__sb; LIVE = true; me = {id:"u-1"}; myProfile = {id:"u-1", is_admin:false};');

  doc.querySelector('#btnAltSave').click();
  await tick(win, 2);
  t.ok('沒選月份不會送出', !sb.__calls.write.length);
  t.ok('提示要選月份', /月份/.test(doc.querySelector('#altBdayMsg').textContent));

  doc.querySelector('#altMonth').value = String(altM);
  doc.querySelector('#altDay').value = String(altD);
  doc.querySelector('#btnAltSave').click();
  await tick(win, 2);
  t.ok('沒填稱呼不會送出', !sb.__calls.write.length);
  t.ok('提示要填稱呼', /稱呼/.test(doc.querySelector('#altBdayMsg').textContent));

  doc.querySelector('#altLabel').value = '  媽媽  ';
  doc.querySelector('#btnAltSave').click();
  await tick(win, 3);
  t.eq('存到 profiles', sb.__calls.write.length && sb.__calls.write[0].table, 'profiles');
  t.eq('存的內容（稱呼去頭尾空白）', sb.__calls.write[0].args[0],
    { alt_label: '媽媽', alt_birth_month: altM, alt_birth_day: altD });
  t.ok('顯示存好了', /媽媽/.test(doc.querySelector('#altBdayMsg').textContent));
  t.ok('面板下方寫出還有幾天', /媽媽的生日/.test(doc.querySelector('#altBdayHint').textContent)
    && /還有 5 天/.test(doc.querySelector('#altBdayHint').textContent), doc.querySelector('#altBdayHint').textContent);

  // v65 還沒跑
  const sbNoCol = makeSb({});
  sbNoCol.from = () => ({
    update: () => ({ eq: () => Promise.resolve({ data: null, error: { message: "Could not find the 'alt_label' column of 'profiles' in the schema cache" } }) }),
  });
  win.__sb = sbNoCol; win.eval('sb = window.__sb;');
  doc.querySelector('#btnAltSave').click();
  await tick(win, 3);
  t.ok('v65 還沒跑時只講還沒開放（v155：不提 SQL）', /還沒開放/.test(doc.querySelector('#altBdayMsg').textContent)
    && !/schema_|SQL|Supabase|管理員/.test(doc.querySelector('#altBdayMsg').textContent),
    doc.querySelector('#altBdayMsg').textContent);
  win.__sb = sb; win.eval('sb = window.__sb;');

  /* ================= 第二組生日：提醒 ================= */
  ls.clear();
  win.eval(`ALT_B = {label:'媽媽', month:${altM}, day:${altD}};`);
  win.renderReminders();
  const banner = () => doc.querySelector('#altBdaySoonBanner');
  t.ok('家人生日前 14 天有提醒', !!banner(), doc.querySelector('#remindersBody').innerHTML.slice(0, 120));
  t.ok('提醒寫出稱呼跟剩幾天', /媽媽的生日還有/.test(banner().textContent) && /5/.test(banner().textContent));
  doc.querySelector('#btnDismissAltBday').click();
  t.ok('按「知道了」就收起來', !banner());
  win.renderReminders();
  t.ok('關掉之後重畫也不再出現', !banner());
  ls.clear();

  // 還很遠的生日不提醒
  const far = new Date(Date.now() + 90 * 864e5);
  win.eval(`ALT_B = {label:'媽媽', month:${far.getMonth() + 1}, day:${far.getDate()}};`);
  win.renderReminders();
  t.ok('還有 3 個月的話不提醒', !banner());
  win.eval(`ALT_B = {label:'媽媽', month:${altM}, day:${altD}};`);

  /* ================= 待辦清單標籤 ================= */
  // 自己的生日設在 3 個月後，才分得出「死線是照誰的生日算」
  const mine = new Date(Date.now() + 100 * 864e5);
  doc.querySelector('#bmonth').value = String(mine.getMonth() + 1);
  doc.querySelector('#bday').value = String(mine.getDate());
  win.eval(`WL_ROWS = [
    {offer_id: 7, year: ${year}, done: false, note: '', sort_order: 1, tag: null,
     created_at: '${year}-09-01T00:00:00Z',
     offers: {id: 7, brand: '環球購物中心', offer: '生日禮', advance_days: 7, regions: ['台北市']}},
    {offer_id: 8, year: ${year}, done: false, note: '', sort_order: 2, tag: '離家遠',
     created_at: '${year}-09-02T00:00:00Z',
     offers: {id: 8, brand: '海底撈', offer: '生日禮', advance_days: 7, regions: ['台北市']}}];`);
  win.renderWishlistBody();
  await tick(win, 1);

  // celine：「還不夠簡潔直觀好看」→ 每一筆改成一張小卡
  const cards = [...doc.querySelectorAll('#myWishlist .wl-item')];
  t.eq('每一筆是一張小卡', cards.length, 2);
  t.ok('點品牌名就是開詳情', cards.every((c) => c.querySelector('.wl-top .wl-name.wl-toggle')));
  t.ok('第一行右邊只留地圖跟「⋯」', cards.every((c) => c.querySelectorAll('.wl-actions > .wl-map, .wl-actions > .wl-more').length === 2
    && !c.querySelector('.wl-actions > .wl-remove')));
  t.ok('移除、移到明年收進「⋯」選單', cards.every((c) => c.querySelector('.wl-more .wl-remove') && c.querySelector('.wl-more .wl-year-toggle')));
  t.ok('優惠內容跟入會期限在第二行', cards.every((c) => /生日禮/.test(c.querySelector('.wl-meta').textContent)
    && /入會期限/.test(c.querySelector('.wl-meta').textContent)));
  // 沒寫備註：只有一顆「📝 備註」，按了才攤開
  const noteTa = cards[0].querySelector('.wl-note');
  t.ok('沒寫備註時輸入框先收起來', noteTa.classList.contains('hidden'));
  cards[0].querySelector('.wl-note-add').click();
  t.ok('按「📝 備註」才攤開輸入框', !noteTa.classList.contains('hidden') && !cards[0].querySelector('.wl-note-add'));
  // 「⋯」選單：按了動作就收起來、點別的地方也收起來
  const more = cards[0].querySelector('.wl-more');
  more.setAttribute('open', '');
  doc.body.click();
  t.ok('點選單以外的地方就收起「⋯」選單', !more.hasAttribute('open'));
  const css = [...doc.querySelectorAll('style')].map((x) => x.textContent).join(' ');
  // celine：「📍 地圖」在手機上縮成只有 📍（文字包在 .wl-map-txt，手機版藏起來）
  const mapBtn = doc.querySelector('#myWishlist .wl-map');
  t.ok('地圖按鈕的「地圖」兩個字可以單獨藏起來', !!mapBtn.querySelector('.wl-map-txt') && mapBtn.textContent.includes('📍'));
  t.eq('只剩 📍 時螢幕報讀器還是念得出「地圖」', mapBtn.getAttribute('aria-label'), '地圖');
  t.ok('手機上藏起「地圖」兩個字', /@media\(max-width:600px\)\{[^@]*\.wl-map-txt\{display:none\}/.test(css));
  t.ok('品牌名沒有 inline 樣式（手機版排版靠 CSS）', cards.every((c) => !c.querySelector('.wl-name').getAttribute('style')));
  const tagSelects = () => [...doc.querySelectorAll('#myWishlist .wl-tag')];
  t.eq('每一列都有標籤選單', tagSelects().length, 2);
  const opts = [...tagSelects()[0].options].map((o) => o.textContent);
  t.ok('有預設的幾個標籤', ['這次生日', '明年再說', '離家遠', '跟朋友一起'].every((x) => opts.includes(x)), opts);
  t.ok('第二組生日的稱呼也是一個標籤', opts.includes('媽媽'), opts);
  t.ok('可以自訂', opts.includes('自訂…'));
  t.eq('已經貼過的標籤會選起來', tagSelects()[1].value, '離家遠');

  // 選一個標籤 → 存進資料庫
  const before = sb.__calls.write.length;
  tagSelects()[0].value = '媽媽';
  tagSelects()[0].dispatchEvent(new win.Event('change'));
  await tick(win, 3);
  const w = sb.__calls.write[sb.__calls.write.length - 1];
  t.eq('標籤存進 wishlist', [w.table, w.op, w.args[0]], ['wishlist', 'update', { tag: '媽媽' }]);

  // 貼家人標籤的那一筆，入會死線改用家人的生日算
  const dlLines = [...doc.querySelectorAll('#myWishlist div')].map((d) => d.textContent).filter((x) => x.includes('⏰'));
  const altDl = new Date(soon); altDl.setDate(altDl.getDate() - 7);
  const mineDl = new Date(mine); mineDl.setDate(mineDl.getDate() - 7);
  const f = (x) => `${x.getMonth() + 1}/${x.getDate()}`;
  t.ok('貼家人標籤的那筆，死線照家人的生日算', dlLines.some((x) => x.includes('媽媽的生日') && x.includes(f(altDl))), dlLines);
  t.ok('沒貼的那筆還是照自己的生日算', dlLines.some((x) => !x.includes('媽媽') && x.includes(f(mineDl))), dlLines);

  // 上面的標籤篩選
  const filter = doc.querySelector('#wlTagFilter');
  t.ok('清單上方有標籤篩選', !!filter && !!filter.closest('#wishlistPanel'));
  const fOpts = [...filter.options].map((o) => o.value);
  t.ok('篩選選項有全部、用到的標籤、沒有標籤', fOpts.includes('all') && fOpts.includes('媽媽') && fOpts.includes('離家遠'), fOpts);
  filter.value = '離家遠';
  win.renderWishlistBody();
  await tick(win, 1);
  t.eq('選了標籤只看那一組', doc.querySelectorAll('#myWishlist [data-wl-row]').length, 1);
  t.ok('留下來的是對的那一筆', doc.querySelector('#myWishlist [data-wl-row]').dataset.wlRow === '8');
  filter.value = 'all';
  win.renderWishlistBody();
  await tick(win, 1);
  t.eq('切回全部看得到兩筆', doc.querySelectorAll('#myWishlist [data-wl-row]').length, 2);

  // v65 還沒跑：清單照樣看得到（查詢自動退回不帶 tag）
  const tried = [];
  const sbNoTag = makeSb({});
  sbNoTag.from = (table) => ({
    select: (cols) => {
      tried.push(cols);
      const res = /tag/.test(cols)
        ? { data: null, error: { message: 'column wishlist.tag does not exist' } }
        : { data: [{ offer_id: 7, year, done: false, note: '', created_at: `${year}-09-01T00:00:00Z`, offers: { id: 7, brand: '環球購物中心', offer: '生日禮', advance_days: 7, regions: ['台北市'] } }], error: null };
      const chain = { eq: () => chain, order: () => Promise.resolve(res) };
      return chain;
    },
  });
  win.__sb = sbNoTag; win.eval('sb = window.__sb;');
  await win.renderMyWishlist();
  await tick(win, 2);
  t.eq('v65 沒跑時自動改成不帶標籤再查一次', tried.length, 2);
  t.ok('第一次有帶 tag、第二次沒有', /tag/.test(tried[0]) && !/,tag/.test(tried[1]), tried);
  t.eq('清單照樣看得到', doc.querySelectorAll('#myWishlist [data-wl-row]').length, 1);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
