/* 投稿查重 ＋ 審核時看得到相似的 ＋ 待審佇列把圖表收起來（嵐）

   1.「投稿的內容如果已經有相似的，先問他要不要跳到修改意見」
      - 打店名的當下就列出站上看起來是同一家的（最多 3 張，附優惠內容），
        按一下就切成「對那一筆提修改建議」
      - 比對規則：全形／半形、大小寫、中文數字（五十嵐＝50嵐）、標點都要看成一樣
   2.「管理員在核可的時候也要可以直接看到有沒有相似的」
      - 待審每一列列出站上相似的那幾張，還有同一批待審裡重複的那筆
      - 一顆按鈕把「重複：站上已經有 #x」填進審核備註
   3.「現在待審佇列每次點開都會先看到一堆圖表才看的到要審核的店家，有點浪費時間」
      - 要審的清單排在圖表前面，圖表收合起來，收著的時候連查詢都不要送 */
const { boot, tick, makeSb, makeAsserts, stubHeavy } = require('./harness');

const offer = (id, brand, extra = {}) => ({
  id, brand, category: '速食', regions: ['台北市'], offer: `${brand} 生日當月送蛋糕`,
  membership: '', membership_type: 'app', membership_cost: 'free', free_tier: 'free_min',
  advance_days: 3, advance_note: '', timing: '當月', value_twd: 120,
  conditions: '需出示證件', validity: '', validity_type: 'rolling',
  sources: [{ tierLabel: '官網', url: 'https://example.com/a' }],
  status: 'approved', created_at: '2026-09-01T00:00:00Z', ...extra,
});

(async () => {
  const t = makeAsserts('t24 投稿查重＋審核比對');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];

  /* ================= 1. 比對規則 ================= */
  // normBrand 是頂層 const（不會掛在 window 上），要用間接 eval 才叫得到
  const nb = (s) => win.eval(`normBrand(${JSON.stringify(s)})`);
  t.eq('中文數字換成阿拉伯數字', [nb('五十嵐'), nb('再睡五分鐘'), nb('十二鍋')],
    [nb('50嵐'), nb('再睡5分鐘'), nb('12鍋')]);
  t.eq('全形英文跟半形一樣', nb('ＭＯＳ ＢＵＲＧＥＲ'), nb('mos burger'));
  t.eq('標點、空白不影響', nb('哈肯舖 手作麵包'), nb('哈肯舖（手作麵包）'));
  t.ok('太短的字不比對（一個字誰都像）', win.similarBrands('王', [offer(1, '王品')]).length === 0);

  /* ================= 2. 投稿打字時的提示 ================= */
  win.eval(`OFFERS = [
    {id:11, brand:'五十嵐', offer:'生日當月飲料買一送一', reportCount:8},
    {id:12, brand:'50嵐 信義店', offer:'生日當天大杯免費', reportCount:2},
    {id:13, brand:'麥當勞', offer:'生日送蛋捲冰淇淋', reportCount:30}];
    PENDING_PREVIEW = [{id:90, brand:'星巴克', offer:'生日券一張'}];`);

  const box = $('#brandDupHint');
  const typeBrand = (v) => { $('#fBrand').value = v; win.renderBrandDupHint(); };

  typeBrand('肯德基');
  t.ok('沒有相似的就不出現', box.classList.contains('hidden'));

  typeBrand('50嵐');
  t.ok('站上有同一家就跳提示', !box.classList.contains('hidden'));
  t.eq('相似的幾張全部列出來，不是只給第一張', $$('#brandDupHint .dup-pick').length, 2);
  // 打「50嵐」找到的是「五十嵐」（正規化後完全一樣）跟「50嵐 信義店」（包含），
  // 完全一樣的那張要排前面
  t.ok('完全一樣的那張排前面', /#11/.test($$('#brandDupHint .dup-pick')[0].textContent),
    $$('#brandDupHint .dup-pick')[0].textContent.replace(/\s+/g, ' '));
  t.ok('看得到編號跟優惠內容（同品牌好幾張才分得出來要改哪張）',
    /#11/.test(box.textContent) && /飲料買一送一/.test(box.textContent));
  t.ok('每一張都寫著可以改成提修改建議', /改成對這筆提修改建議/.test(box.textContent));
  t.ok('也講清楚不是同一家可以照樣投', /不同家/.test(box.textContent), box.textContent.replace(/\s+/g, ' '));

  // 還在審核中的那種：不給「提修改建議」的按鈕（那筆還沒上架，沒得改）
  typeBrand('星巴克');
  t.ok('別人投過還在審核中也會提醒', !box.classList.contains('hidden') && /還在等審核/.test(box.textContent));
  t.eq('審核中的不給提修改建議的按鈕', $$('#brandDupHint .dup-pick').length, 0);
  t.ok('列出對方投了什麼', /生日券一張/.test(box.textContent));

  /* ---- 按下去要真的切成「對那一筆提修改建議」 ---- */
  const sb = makeSb({ tables: { offers: [offer(11, '五十嵐', { offer: '生日當月飲料買一送一' })] } });
  win.__sb = sb;
  win.eval('sb = window.__sb; LIVE = true; me = {id:"u-1"}; myProfile = {id:"u-1"};');
  typeBrand('五十嵐');
  $$('#brandDupHint .dup-pick')[0].click();
  await tick(win, 4);
  t.eq('切成「建議修改」模式', $('#btnSubmitOffer').textContent, '送出建議');
  t.ok('標題寫出是對哪一家提建議', /建議修改/.test($('#submitTitle').textContent), $('#submitTitle').textContent);
  t.ok('修改原因欄位打開', !$('#fEditReasonField').classList.contains('hidden'));
  t.ok('帶出原本的內容', $('#submitForm').elements.brand.value === '五十嵐');
  win.eval('editingOfferId = null; editingAsSuggestion = false; LIVE = false; me = null;');

  /* ================= 3. 待審佇列：清單在前、圖表收起來 ================= */
  const pnl = $('#pnlPending');
  const order = [...pnl.querySelectorAll('#pendingList, #pendInsightsFold')].map((e) => e.id);
  t.eq('要審的清單排在圖表前面', order, ['pendingList', 'pendInsightsFold']);
  t.ok('圖表預設收起來', !$('#pendInsightsFold').open);
  t.ok('收起來的時候標題有寫裡面是什麼', /審核分析/.test($('#pendInsightsFold > summary').textContent));

  const sb2 = makeSb({
    tables: {
      offers: [
        { ...offer(101, '五十嵐', { status: 'pending', submitted_by: 'u-1' }), offer: '生日當月大杯免費' },
        { ...offer(102, '五十嵐', { status: 'pending', submitted_by: 'u-2' }), offer: '生日送一杯' },
        { ...offer(103, '漢堡王', { status: 'pending', submitted_by: 'u-3' }) },
      ],
      profiles_public: [{ id: 'u-1', display_name: '小明' }, { id: 'u-2', display_name: '小華' },
        { id: 'u-3', display_name: '小美' }],
    },
    rpcs: { admin_review_insights: () => ({ data: { approved_count: 8, rejected_count: 2, pending_count: 3 } }) },
  });
  win.__sb = sb2;
  win.eval('sb = window.__sb; LIVE = true; myProfile = {id:"admin-1", is_admin:true};');
  win.eval(`OFFERS = [{id:11, brand:'五十嵐', offer:'生日當月飲料買一送一', reportCount:8}];`);

  // 收著的時候不要白跑一趟查詢
  sb2.__calls.rpc.length = 0;
  await win.loadReviewInsights();
  t.eq('收起來時不送查詢', sb2.__calls.rpc.filter((c) => c.name === 'admin_review_insights').length, 0);
  t.eq('圖表區還是空的', $('#reviewInsights').innerHTML, '');

  const fold = $('#pendInsightsFold');
  fold.open = true;
  fold.dispatchEvent(new win.Event('toggle'));
  await tick(win, 3);
  t.eq('展開才去算', sb2.__calls.rpc.filter((c) => c.name === 'admin_review_insights').length, 1);
  t.ok('展開後看得到核可率', /核可率/.test($('#reviewInsights').textContent));
  t.eq('展開狀態記在這台裝置上', win.localStorage.getItem('sxr_admin_pend_insights'), '1');

  // 收合→再展開：裡面已經有東西就不用再算一次；裡面是空的（還沒算過）就要補算，
  // 不然「一進來就展開」的人會看到一塊空白（展開狀態是記住的，順序跟第一次相反）
  fold.open = false; fold.dispatchEvent(new win.Event('toggle'));
  sb2.__calls.rpc.length = 0;
  fold.open = true; fold.dispatchEvent(new win.Event('toggle'));
  await tick(win, 3);
  t.eq('已經算過就不重算', sb2.__calls.rpc.filter((c) => c.name === 'admin_review_insights').length, 0);
  $('#reviewInsights').innerHTML = '';
  fold.open = false; fold.dispatchEvent(new win.Event('toggle'));
  fold.open = true; fold.dispatchEvent(new win.Event('toggle'));
  await tick(win, 3);
  t.eq('沒算過就補算一次', sb2.__calls.rpc.filter((c) => c.name === 'admin_review_insights').length, 1);

  /* ================= 4. 審核每一列看得到相似的 ================= */
  await win.loadPending();
  await tick(win, 2);
  const rowOf = (id) => doc.querySelector(`.pend-row[data-row="${id}"]`);
  t.eq('三筆待審都畫出來', $$('.pend-row').length, 3);
  const dup1 = rowOf(101).querySelector('.pend-dup');
  t.ok('相似的那筆會警告', !!dup1);
  t.ok('寫出站上已經有哪一張（含編號）', /#11/.test(dup1.textContent) && /五十嵐/.test(dup1.textContent),
    dup1.textContent.replace(/\s+/g, ' '));
  t.ok('連同一批待審裡重複的那筆也抓出來', /待審 #102/.test(dup1.textContent),
    dup1.textContent.replace(/\s+/g, ' '));
  t.ok('沒有相似的那筆不要亂警告', !rowOf(103).querySelector('.pend-dup'));

  // 一顆按鈕把退回理由填好
  rowOf(101).querySelector('.pend-dup-note').click();
  t.eq('把重複寫進審核備註', doc.querySelector('.rn[data-id="101"]').value,
    '重複投稿：站上已經有 #11 五十嵐');

  // 核可／退回的流程沒有被這塊提醒弄壞
  const realLoadPending = win.loadPending;
  const hits = stubHeavy(win, ['loadOffers', 'render', 'loadSiteStats', 'loadReviewInsights']);
  sb2.__calls.rpc.length = 0;
  rowOf(101).querySelector('.rj').click();
  await tick(win, 6);
  const rev = sb2.__calls.rpc.find((c) => c.name === 'review_offer');
  t.ok('退回照樣送得出去，備註一起帶上',
    rev && rev.params.p_status === 'rejected' && /#11 五十嵐/.test(rev.params.p_note || ''),
    rev && rev.params);
  t.ok('退回後有重新整理清單', hits.loadOffers >= 1);

  /* ===== 5. 重複的話，把彼此沒填的欄位補齊（celine）=====
     重複的投稿不見得是垃圾：新投稿常常填了舊那筆沒填的東西，反過來也是。
     只補空的，不蓋掉任何已經填好的值。 */
  const sb3 = makeSb({
    tables: {
      offers: [
        // 待審這筆：有提前天數、地區、來源；沒有優惠價值、使用條件
        { ...offer(201, '五十嵐', { status: 'pending', submitted_by: 'u-1' }),
          offer: '生日當月大杯免費', advance_days: 7, regions: ['台北市', '新北市'],
          sources: [{ tierLabel: '官網', url: 'https://5050.tw/bday' }],
          value_twd: null, conditions: '', valid_until: null, transferable: 'yes' },
      ],
      profiles_public: [{ id: 'u-1', display_name: '小明' }],
    },
  });
  win.__sb = sb3;
  win.eval('sb = window.__sb;');
  // 站上那筆：有優惠價值、使用條件；沒有提前天數、地區、來源，本人證件也還沒確認
  win.eval(`OFFERS = [{id:11, brand:'五十嵐', category:'飲料', offer:'生日當月飲料買一送一',
    timing:'當月', membership:'', membershipType:'app', freeTier:'free_min',
    advanceDays:null, valueTwd:120, conditions:'需出示證件', validFrom:null, validUntil:null,
    transferable:'unknown', regions:[], sources:[], reportCount:8}];`);
  win.loadPending = realLoadPending;   // 上面 stubHeavy 把它換成空殼了，這裡要用真的
  await win.loadPending();
  await tick(win, 2);
  const fillBtn = () => doc.querySelector('.pend-row[data-row="201"] .pend-dup-fill');
  t.ok('有可以互相補的欄位時才出現按鈕', !!fillBtn());
  t.ok('按鈕上先寫清楚各補幾項',
    /補給 #11 4 項/.test(fillBtn().textContent) && /補給這筆 2 項/.test(fillBtn().textContent),
    fillBtn().textContent.replace(/\s+/g, ' '));

  win.__confirmAnswer = true;
  win.__confirms.length = 0;
  win.loadPending = async () => {};   // 補完會重畫整份清單，這裡只驗寫了什麼
  sb3.__calls.write.length = 0;
  fillBtn().click();
  await tick(win, 6);
  t.ok('動手前先把要補什麼列出來給人確認',
    /只補空白的欄位/.test(win.__confirms[0] || '') && /提前天數：7/.test(win.__confirms[0] || ''),
    win.__confirms[0]);
  const writes = sb3.__calls.write.filter((w) => w.op === 'update');
  t.eq('兩邊各寫一次', writes.length, 2);
  t.eq('補給站上那筆的欄位', Object.keys(writes[0].args[0]).sort(),
    ['advance_days', 'regions', 'sources', 'transferable']);
  t.eq('值是從投稿那筆抄過去的', [writes[0].args[0].advance_days, writes[0].args[0].regions],
    [7, ['台北市', '新北市']]);
  t.ok('不會蓋掉站上已經填好的（優惠價值、使用條件沒被動到）',
    !('value_twd' in writes[0].args[0]) && !('conditions' in writes[0].args[0]),
    Object.keys(writes[0].args[0]));
  t.eq('補給投稿那筆的欄位', Object.keys(writes[1].args[0]).sort(), ['conditions', 'value_twd']);
  t.ok('「尚未確認」算沒填，對方確認過就補過來', writes[0].args[0].transferable === 'yes');
  t.ok('補完告訴你可以退回了', /可以退回/.test($('#pendMsg').textContent), $('#pendMsg').textContent);
  t.ok('補完有重新整理站上的資料', hits.loadOffers >= 2, hits);

  // 按取消就什麼都不做
  win.__confirmAnswer = false;
  sb3.__calls.write.length = 0;
  await win.fillMissingBetween(
    { id: 201, brand: '五十嵐', advanceDays: 7, regions: ['台北市'], sources: [], conditions: '', valueTwd: null },
    win.eval('OFFERS')[0]);
  t.eq('按取消不寫任何東西', sb3.__calls.write.length, 0);
  win.__confirmAnswer = true;

  // 兩邊都填滿了：不給按鈕，也不要讓人白按一次才知道
  const full = { id: 301, brand: '一芳', category: '飲料', offer: 'x', timing: '當月', membership: '',
    membershipType: 'app', freeTier: 'free_min', advanceDays: 3, valueTwd: 60, conditions: '要證件',
    validFrom: null, validUntil: '2026-12-31', transferable: 'yes', regions: ['台北市'],
    sources: [{ url: 'https://a.tw' }] };
  t.eq('沒有空欄位就沒有要補的', win.fillPlan(full, { ...full, id: 302 }), []);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
