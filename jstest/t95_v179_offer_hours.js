/* v179：celine「先不爬營業時間，但使用者投稿跟編輯都可以輸入及更改營業時間」 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeSb, makeAsserts, stubHeavy } = require('./harness');

const sql = fs.readFileSync(path.join(__dirname, '..', 'schema_v179_offer_hours.sql'), 'utf8');
const worker = fs.readFileSync(path.join(__dirname, '..', 'worker', 'offers-cache.js'), 'utf8');

(async () => {
  const t = makeAsserts('t95 v179：投稿、修改建議可以填營業時間');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];
  const f = () => $('#submitForm').elements;
  const J = (x) => JSON.parse(win.eval(`JSON.stringify(${x})`));

  /* ---- 一、換算 ---- */
  const round = (h) => J(`daysToHours(hoursToDays(${JSON.stringify(h)}).all24, hoursToDays(${JSON.stringify(h)}).days)`);
  const samples = {
    '週一到週日 11:00–21:00': [0, 1, 2, 3, 4, 5, 6].map((d) => [d * 1440 + 660, d * 1440 + 1260]),
    '午休兩段': [[3570, 3720], [3900, 4140]],
    '週五 22:00 到週六 02:00': [[8520, 8760]],
    '週六 22:00 到週日 02:00（存成兩段）': [[0, 120], [9960, 10080]],
    '24 小時': [[0, 10080]],
    '週一到週三整天開（接成一段）': [[1440, 5760]],
  };
  for (const [k, h] of Object.entries(samples)) t.eq(`來回一次不變：${k}`, round(h), h);
  t.eq('週六 22:00–02:00 在畫面上是週六一段', J(`hoursToDays(${JSON.stringify(samples['週六 22:00 到週日 02:00（存成兩段）'])}).days[6]`), [[1320, 120]]);
  t.eq('給人看的：連續同樣時間合在一起',
    J(`hoursLines(${JSON.stringify([1, 2, 3, 4, 5].map((d) => [d * 1440 + 660, d * 1440 + 1260]).concat([[6 * 1440 + 600, 6 * 1440 + 1320], [600, 1320]]))})`),
    ['週一至週五 11:00–21:00', '週六、週日 10:00–22:00']);
  t.eq('公休、過午夜、24:00', J('hoursLines([[1440+1080,1440+1440+120],[2*1440+660,3*1440]])'),
    ['週一 18:00–02:00', '週二 11:00–24:00', '週三至週日 公休']);
  t.eq('24 小時營業', J('hoursLines([[0,10080]])'), ['24 小時營業']);

  /* ---- 二、投稿表單 ---- */
  t.ok('v179 還沒跑之前，表單裡不出現（填了也存不進去）', $('#fHoursField').classList.contains('hidden'));
  win.__sb = makeSb({ tables: { offers: [] } });
  const realFrom0 = win.__sb.from;
  win.__sb.from = (tb) => { const q = realFrom0(tb);
    q.then = (ok, bad) => Promise.resolve({ data: null, error: { message: 'column offers.hours does not exist' } }).then(ok, bad); return q; };
  win.eval('sb=window.__sb; LIVE=true; HOURS_COL=null;');
  await win.eval('probeHoursCol()');
  t.ok('沒有那一欄：還是藏著', $('#fHoursField').classList.contains('hidden'));
  win.__sb = makeSb({ tables: { offers: [] } });
  win.eval('sb=window.__sb; HOURS_COL=null;');
  win.eval("showSection('submit')");
  await tick(win, 3);
  t.ok('跑過 v179：打開「新增」就出現', !$('#fHoursField').classList.contains('hidden'));
  win.resetSubmitForm();
  t.ok('預設沒填：只有一顆「＋ 填營業時間」', !!$('#heStart') && !$('#he24'));
  t.eq('沒填就送 null（不是「整週沒開」）', J('readHoursEditor()'), { hours: null, hours_note: null });
  $('#heStart').click();
  t.eq('打開：週一排到週日，每天一列', $$('#hoursEditor .he-day .he-dn').map((e) => e.textContent), ['週一', '週二', '週三', '週四', '週五', '週六', '週日']);
  // 週一改 10:30–22:00，加一段；週二公休；套用週一到每一天前先看單天
  const tIn = (d, i, k) => $(`#hoursEditor .he-t[data-d="${d}"][data-i="${i}"][data-k="${k}"]`);
  tIn(1, 0, 0).value = '10:30'; tIn(1, 0, 0).dispatchEvent(new win.Event('change'));
  tIn(1, 0, 1).value = '14:00'; tIn(1, 0, 1).dispatchEvent(new win.Event('change'));
  $('#hoursEditor .he-add[data-d="1"]').click();
  t.ok('＋一段：週一多一段', !!tIn(1, 1, 0));
  $('#hoursEditor .he-tog[data-d="2"]').click();
  t.ok('週二按「公休」', /公休/.test($('#hoursEditor .he-day[data-d="2"]').textContent) && !tIn(2, 0, 0));
  $('#heNote').value = '各分店不同'; $('#heNote').dispatchEvent(new win.Event('input'));
  const r1 = J('readHoursEditor()');
  t.ok('週一兩段都在、週二沒有', r1.hours.some(([a, b]) => a === 1440 + 630 && b === 1440 + 840)
    && r1.hours.some(([a, b]) => a === 1440 + 1020 && b === 1440 + 1260)
    && !r1.hours.some(([a]) => a >= 2880 && a < 4320), JSON.stringify(r1.hours));
  t.eq('補充也帶上', r1.hours_note, '各分店不同');
  $('#heCopyMon').click();
  t.eq('週一的時間套用到每一天：每天都兩段', J('readHoursEditor().hours').length, 14);
  $('#he24').click();
  t.eq('24 小時營業', J('readHoursEditor().hours'), [[0, 10080]]);
  $('#he24').click();
  $('#heClear').click();
  t.eq('「不填營業時間」：回到 null', J('readHoursEditor()'), { hours: null, hours_note: null });

  // 送出
  stubHeavy(win, ['loadMyStuff', 'logEvent', 'loadOffers', 'render']);
  const fillBasics = () => {
    f().brand.value = '測試燒肉'; f().offer.value = '生日送肉盤';
    f().category.value = f().category.options[0].value;
    f().timing.value = f().timing.options[0].value;
    f().membership_type.value = f().membership_type.options[0].value;
    f().free_tier.value = f().free_tier.options[0].value;
    f().advance_days.value = '0'; f().min_spend.value = '0'; f().expected_spend.value = '500'; f().conditions.value = '無';
    $$('#fRegions .chip').find((c) => c.dataset.r === '全台').click();
  };
  win.__confirmAnswer = true;
  const sb = makeSb({ tables: { offers: [] } });
  win.__sb = sb;
  win.eval('sb=window.__sb; LIVE=true; me={id:"u-1"}; myProfile={id:"u-1",is_admin:false}; OFFERS=[]; PENDING_PREVIEW=[];');
  const submit = () => $('#submitForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  win.resetSubmitForm(); fillBasics();
  $('#heStart').click();
  submit();
  await tick(win, 4);
  const ins = sb.__calls.write.filter((w) => w.table === 'offers' && w.op === 'insert');
  t.eq('送出：營業時間一起帶（預設每天 11:00–21:00）', ins[0] && ins[0].args[0].hours,
    [0, 1, 2, 3, 4, 5, 6].map((d) => [d * 1440 + 660, d * 1440 + 1260]));
  t.ok('送完表單清空，營業時間也回到沒填', !!$('#heStart'));

  // 每一天都按公休 → 擋下來
  win.resetSubmitForm(); fillBasics(); $('#heStart').click();
  [0, 1, 2, 3, 4, 5, 6].forEach((d) => $(`#hoursEditor .he-tog[data-d="${d}"]`).click());
  const before = sb.__calls.write.length;
  submit();
  await tick(win, 3);
  t.ok('七天都公休：不送、講清楚', sb.__calls.write.length === before && /不填營業時間/.test($('#submitMsg').textContent));

  // v179 還沒跑：沒有 hours 欄 → 拿掉再送
  let n = 0;
  const sb2 = makeSb({ tables: { offers: [] } });
  const realFrom = sb2.from;
  sb2.from = (tb) => {
    const q = realFrom(tb); const ins0 = q.insert;
    q.insert = (row) => { ins0(row); n++;
      if (n === 1) return Promise.resolve({ data: null, error: { message: "Could not find the 'hours' column of 'offers' in the schema cache" } });
      if (n === 2) return Promise.resolve({ data: null, error: { message: "Could not find the 'hours_note' column of 'offers' in the schema cache" } });
      return Promise.resolve({ data: null, error: null }); };
    return q;
  };
  win.__sb = sb2; win.eval('sb=window.__sb;');
  win.resetSubmitForm(); fillBasics(); $('#heStart').click();
  submit();
  await tick(win, 5);
  const ins2 = sb2.__calls.write.filter((w) => w.table === 'offers' && w.op === 'insert');
  t.ok('沒跑 v179：拿掉營業時間再送，最後送得出去', ins2.length === 3 && !('hours' in ins2[2].args[0]) && !('hours_note' in ins2[2].args[0])
    && ins2[2].args[0].expected_spend === 500 && /已送出/.test($('#submitMsg').textContent), `${ins2.length} ${$('#submitMsg').textContent}`);

  /* ---- 三、建議修改：帶入原本的、只送改了的 ---- */
  const orig = { id: 5, brand: '舊店', category: '速食', regions: ['全台'], offer: '送薯條', membership_type: 'app',
    free_tier: 'free_min', timing: '當月', transferable: 'no', status: 'approved', sources: [],
    membership: '', conditions: '', requires_companion: false,   // 真的資料庫列都有這幾欄
    hours: [[1440 + 660, 1440 + 1260]], hours_note: null };
  const sb3 = makeSb({ tables: { offers: [orig], offer_edits: [] } });
  win.__sb = sb3; win.eval('sb=window.__sb;');
  await win.startEditOffer(5, false, true);
  await tick(win, 3);
  t.ok('建議修改：原本的營業時間帶進來', !!tIn(1, 0, 0) && tIn(1, 0, 0).value === '11:00' && /公休/.test($('#hoursEditor .he-day[data-d="2"]').textContent));
  tIn(1, 0, 1).value = '22:00'; tIn(1, 0, 1).dispatchEvent(new win.Event('change'));
  f().edit_reason.value = '官網寫到 22:00';
  submit();
  await tick(win, 4);
  const ed = sb3.__calls.write.filter((w) => w.table === 'offer_edits' && w.op === 'insert');
  t.eq('只送改了的欄位：營業時間', ed[0] && Object.keys(ed[0].args[0].patch), ['hours']);
  t.eq('新的營業時間', ed[0] && ed[0].args[0].patch.hours, [[1440 + 660, 1440 + 1320]]);

  /* ---- 四、審核畫面、詳情 ---- */
  t.eq('審核：欄位名稱', J('[EDIT_FIELD_LABEL.hours, EDIT_FIELD_LABEL.hours_note]'), ['營業時間', '營業時間補充']);
  t.eq('審核：改前讀 current_hours', J('EDIT_CUR_KEY.hours'), 'current_hours');
  t.eq('審核：營業時間印成人看得懂的', win.eval('fmtEditVal([[1440+660,1440+1320]])'), '週一 11:00–22:00；週二至週日 公休');
  t.ok('審核：營業時間不給改（陣列塞不進文字框），唯讀', /僅供預覽/.test(win.eval('patchFieldInputHtml(1,"hours",[[0,10080]])')));
  t.eq('fromRow 讀得到', J('fromRow({id:1,brand:"x",regions:[],sources:[],hours:[[0,10080]],hours_note:"x"})').hours, [[0, 10080]]);
  const txt = win.eval('hoursDetailText({hours:[[0,10080]], hoursNote:"國定假日照常"})');
  t.ok('詳情：現在有沒有開＋時間＋補充', /現在營業中/.test(txt) && /24 小時營業/.test(txt) && /國定假日照常/.test(txt), txt);

  /* ---- 五、篩選：投稿填的也算，而且不用問資料庫 ---- */
  win.eval(`HOURS_AVAIL=false; HOURS_F={mode:'',dow:null,min:null}; activeRegion.clear();
    OFFERS=[{id:1,brand:'早餐',regions:['全台'],hours:[[1440*6+360,1440*6+660]]},{id:2,brand:'沒填',regions:['全台'],hours:null}]
      .map(o=>({category:'速食',membership:'',membershipType:'app',freeTier:'free_min',timing:'當月',conditions:'',sources:[],
        regionNote:'',offer:'',advanceNote:'',transferable:'no',status:'approved',...o}));
    buildHoursControls();`);
  t.ok('有人填了營業時間：篩選出現「營業時間」', !$('#hoursRow').classList.contains('hidden'));
  const rpcBefore = sb3.__calls.rpc.length;
  win.eval("HOURS_F={mode:'at',dow:6,min:480};");
  t.eq('週六 08:00：早餐有開、沒填的不列', J('OFFERS.filter(filterPredicate()).map(o=>o.id)'), [1]);
  win.eval("HOURS_F={mode:'at',dow:6,min:720};");
  t.eq('週六 12:00：早餐打烊了', J('OFFERS.filter(filterPredicate()).map(o=>o.id)'), []);
  t.eq('沒有分店營業時間的時候，不去問資料庫', sb3.__calls.rpc.length, rpcBefore);
  win.eval("HOURS_F={mode:'',dow:null,min:null};");

  /* ---- 六、SQL、Worker ---- */
  t.ok('SQL：格式檢查（開 < 關、0～10080）', /valid_week_hours/.test(sql) && /<= 10080/.test(sql));
  t.ok('SQL：要先跑 v166（不然套用那支會找不到 expected_spend）', /還沒跑過 schema_v166/.test(sql));
  t.ok('SQL：核可修改建議會套用營業時間', /hours\s+= case when v_patch \? 'hours'/.test(sql) && /hours_note\s+= case when v_patch \? 'hours_note'/.test(sql));
  t.ok('SQL：改前預覽有 current_hours', /o\.hours\s+as current_hours/.test(sql));
  t.ok('SQL：offers_public 重建後補回邊緣快取角色', /grant select on public\.offers_public to edge_reader/.test(sql));
  t.ok('SQL：不用 cascade', !/drop view[^;]*cascade/i.test(sql));
  t.ok('Worker：多要 hours、hours_note', /OFFER_COLS_V179 = OFFER_COLS_V166 \+ ',hours,hours_note'/.test(worker));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
