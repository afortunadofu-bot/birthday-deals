/* 幫別人記生日 → 待辦清單分成不同份（v71，嵐）

   - 有設第二組生日時，待辦清單上面出現「我的／媽媽的／全部」，各自標出幾筆
   - 切到哪一份就只看那一份；「全部」看得到所有的
   - 每一筆的「⋯」可以移到別人的清單、也可以移回自己的
   - 在別人的清單裡按星號收藏，會收進那一份清單
   - 在別人的清單裡的優惠，入會死線照那個人的生日算
   - v71 還沒跑時：清單照樣看得到，移動時講要跑哪支 SQL
   - 生日刪得掉（自己的用「清除」、家人的用原本的清除） */
const { boot, tick, makeSb, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t19 分清單');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const year = new Date().getFullYear();
  const soon = new Date(Date.now() + 5 * 864e5);

  const sb = makeSb({});
  win.__sb = sb;
  win.eval(`sb = window.__sb; LIVE = true; me = {id:'u-1'}; myProfile = {id:'u-1'};
    ALT_B = {label:'媽媽', month:${soon.getMonth() + 1}, day:${soon.getDate()}};
    WL_PERSON = 'me';
    WL_ROWS = [
      {offer_id: 1, year: ${year}, done: false, note: '', tag: null, person: null, created_at: '${year}-09-01T00:00:00Z',
       offers: {id: 1, brand: '我的店', offer: '生日禮', advance_days: 7, regions: []}},
      {offer_id: 2, year: ${year}, done: false, note: '', tag: null, person: '媽媽', created_at: '${year}-09-02T00:00:00Z',
       offers: {id: 2, brand: '媽媽的店', offer: '生日禮', advance_days: 7, regions: []}}];`);
  // 自己的生日設在 100 天後，才分得出死線照誰的生日算
  const mine = new Date(Date.now() + 100 * 864e5);
  $('#bmonth').value = String(mine.getMonth() + 1);
  $('#bday').value = String(mine.getDate());
  win.renderWishlistBody();
  await tick(win, 1);

  const tabs = () => [...doc.querySelectorAll('#wlPersonTabs .subtab')].map((b) => b.textContent.trim());
  const brands = () => [...doc.querySelectorAll('#myWishlist .wl-name')].map((x) => x.textContent.trim());
  t.ok('有第二組生日時出現清單切換', !$('#wlPersonTabs').classList.contains('hidden'));
  t.eq('列出我的／媽媽的／全部，各自標筆數', tabs(), ['我的（1）', '媽媽的（1）', '全部（2）']);
  // celine 的清單叫「我不知道」，三個分頁加起來 338px 放不下手機，原本會變成左右捲、
  // 永遠有一個被切掉半個。.wrap 讓它排不下就換行（版面驗證在瀏覽器上量過）。
  t.ok('排不下要換行，不要變成左右捲把分頁切掉', $('#wlPersonTabs').classList.contains('wrap'));
  t.eq('預設只看我的清單', brands(), ['我的店']);

  const clickTab = (label) => [...doc.querySelectorAll('#wlPersonTabs .subtab')].find((b) => b.textContent.startsWith(label)).click();
  clickTab('媽媽');
  t.eq('切到媽媽的清單只看那一份', brands(), ['媽媽的店']);
  t.ok('切換記在瀏覽器裡', win.localStorage.getItem('sxr_wl_person') === '媽媽');
  // 在媽媽的清單裡，死線照媽媽的生日算
  const dl = [...doc.querySelectorAll('#myWishlist .wl-meta')].map((x) => x.textContent).join(' ');
  const altDl = new Date(soon); altDl.setDate(altDl.getDate() - 7);
  t.ok('死線照媽媽的生日算', dl.includes('媽媽的生日') && dl.includes(`${altDl.getMonth() + 1}/${altDl.getDate()}`), dl);

  clickTab('全部');
  t.eq('全部看得到兩份', brands().sort(), ['媽媽的店', '我的店'].sort());

  /* ---- 移到別人的清單 ---- */
  clickTab('我的');
  const moveBtn = doc.querySelector('#myWishlist .wl-move-person');
  t.ok('「⋯」裡可以移到媽媽的清單', /移到 媽媽 的清單/.test(moveBtn.textContent), moveBtn.textContent);
  moveBtn.click();
  await tick(win, 3);
  const w = sb.__calls.write[sb.__calls.write.length - 1];
  t.eq('移動寫回資料庫', [w.table, w.op, w.args[0]], ['wishlist', 'update', { person: '媽媽' }]);
  t.eq('移走之後我的清單空了', brands(), []);
  clickTab('媽媽');
  t.eq('兩筆都在媽媽的清單', brands().length, 2);
  const backBtn = [...doc.querySelectorAll('#myWishlist .wl-move-person')].find((b) => /移回我的清單/.test(b.textContent));
  t.ok('也可以移回自己的清單', !!backBtn);
  backBtn.click();
  await tick(win, 3);
  t.eq('移回自己的清單寫的是空值', sb.__calls.write[sb.__calls.write.length - 1].args[0], { person: null });

  /* ---- 在別人的清單裡收藏 ---- */
  win.eval(`WL_PERSON='媽媽'; WISH = new Set();`);
  const sbW = makeSb({ tables: { wishlist: [] } });
  const seen = [];
  const realFrom = sbW.from;
  sbW.from = (tb) => tb === 'wishlist'
    ? { upsert: (row) => { seen.push(row); return Promise.resolve({ error: null }); }, delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }) }
    : realFrom(tb);
  win.__sb = sbW; win.eval('sb = window.__sb;');
  await win.toggleWish(9);
  await tick(win, 3);
  t.eq('在媽媽的清單裡收藏就收進那一份', seen[0] && seen[0].person, '媽媽');

  // v71 還沒跑：退回不帶清單，照樣收得起來
  const seen2 = [];
  const sbOld = makeSb({});
  sbOld.from = () => ({
    upsert: (row) => { seen2.push(row); return Promise.resolve(row.person ? { error: { message: "Could not find the 'person' column of 'wishlist' in the schema cache" } } : { error: null }); },
  });
  win.__sb = sbOld; win.eval('sb = window.__sb; WISH = new Set();');
  await win.toggleWish(10);
  await tick(win, 3);
  t.eq('v71 沒跑時退回不帶清單再存一次', seen2.length, 2);
  t.ok('第二次沒有帶 person', !('person' in seen2[1]));

  /* ---- 沒有第二組生日就不出現切換 ---- */
  win.eval(`ALT_B={label:'',month:0,day:0}; WL_ROWS=WL_ROWS.map(w=>({...w, person:null})); WL_PERSON='me';`);
  win.renderWishlistBody();
  t.ok('沒幫別人記生日時不出現清單切換', $('#wlPersonTabs').classList.contains('hidden'));

  /* ---- 生日刪得掉 ---- */
  const upd = [];
  const sbB = makeSb({});
  sbB.from = () => ({ update: (row) => { upd.push(row); return { eq: () => Promise.resolve({ error: null }) }; } });
  win.__sb = sbB; win.eval('sb = window.__sb;');
  $('#btnClearBirthday').click();
  await tick(win, 3);
  t.eq('按「清除」把自己的生日清掉', upd[upd.length - 1], { birth_month: null, birth_day: null });
  t.eq('下拉也清空', [$('#bmonth').value, $('#bday').value], ['', '']);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
