/* v166：celine「投稿的必填選項變多，補充欄位一般人好像都看不到，需要幾天註冊那個都先必填，
   然後都要寫預計這家需要花多少錢跟低消多少錢等，使用條件也要必填」 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeSb, makeAsserts, stubHeavy } = require('./harness');

const sql = fs.readFileSync(path.join(__dirname, '..', 'schema_v166_expected_spend.sql'), 'utf8');
const worker = fs.readFileSync(path.join(__dirname, '..', 'worker', 'offers-cache.js'), 'utf8');

(async () => {
  const t = makeAsserts('t85 v166：投稿必填、預計花多少、低消修改建議套得上');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const f = () => $('#submitForm').elements;
  const REQ = ['advance_days', 'min_spend', 'expected_spend', 'conditions'];

  /* ---- 位置跟必填 ---- */
  win.resetSubmitForm();
  REQ.forEach((n) => {
    t.ok(`${n} 是必填`, f()[n] && f()[n].required);
    t.ok(`${n} 不在選填區裡（看得到）`, !$('#moreFields').contains(f()[n]));
  });
  t.ok('有「預計會花多少」這一格', /預計會花多少/.test(f().expected_spend.closest('.field').textContent));
  t.ok('選填區預設攤開（「補充欄位一般人好像都看不到」）', !$('#moreFields').classList.contains('hidden'));
  t.ok('必填的標了 *', [...doc.querySelectorAll('#submitForm .req-mark')].filter((m) => !m.classList.contains('hidden')).length === 4);

  stubHeavy(win, ['loadMyStuff', 'logEvent', 'loadOffers', 'render']);
  const fillBasics = () => {
    f().brand.value = '測試早餐店'; f().offer.value = '生日當月送豆漿';
    f().category.value = f().category.options[0].value;
    f().timing.value = f().timing.options[0].value;
    f().membership_type.value = f().membership_type.options[0].value;
    f().free_tier.value = f().free_tier.options[0].value;
    [...doc.querySelectorAll('#fRegions .chip')].find((c) => c.dataset.r === '全台').click();
  };
  fillBasics();
  t.ok('四格沒填：瀏覽器擋下來（按送出鈕時）', $('#submitForm').checkValidity() === false);
  f().advance_days.value = '0'; f().min_spend.value = '0'; f().expected_spend.value = '120'; f().conditions.value = '無';
  t.ok('四格都填了（0 也算填了）：可以送', $('#submitForm').checkValidity() === true);

  win.__confirmAnswer = true;          // 沒填來源網址那個提醒：照送
  const sb = makeSb({ tables: { offers: [] } });
  win.__sb = sb;
  win.eval('sb=window.__sb; LIVE=true; me={id:"u-1"}; myProfile={id:"u-1",is_admin:false}; OFFERS=[]; PENDING_PREVIEW=[];');
  const submit = () => $('#submitForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  submit();
  await tick(win, 4);
  const ins = sb.__calls.write.filter((w) => w.table === 'offers' && w.op === 'insert');
  t.ok('送出：預計花費、低消、提前天數、條件都帶上', ins.length === 1 && ins[0].args[0].expected_spend === 120
    && ins[0].args[0].min_spend === 0 && ins[0].args[0].advance_days === 0 && ins[0].args[0].conditions === '無',
    JSON.stringify(ins[0] && ins[0].args[0]));

  // v166 還沒跑：沒有 expected_spend 那一欄 → 拿掉再送一次，不讓人白填
  let first = true;
  const sb2 = makeSb({ tables: { offers: [] } });
  const realFrom = sb2.from;
  sb2.from = (tb) => {
    const q = realFrom(tb);
    const ins0 = q.insert;
    q.insert = (row) => {
      ins0(row);
      if (first && tb === 'offers') { first = false;
        return Promise.resolve({ data: null, error: { message: "Could not find the 'expected_spend' column of 'offers' in the schema cache" } }); }
      return Promise.resolve({ data: null, error: null });
    };
    return q;
  };
  win.__sb = sb2;
  win.eval('sb=window.__sb;');
  win.resetSubmitForm(); fillBasics();
  f().advance_days.value = '3'; f().min_spend.value = '300'; f().expected_spend.value = '350'; f().conditions.value = '需訂位';
  submit();
  await tick(win, 4);
  const ins2 = sb2.__calls.write.filter((w) => w.table === 'offers' && w.op === 'insert');
  t.eq('沒跑 v166：自動再送一次', ins2.length, 2);
  t.ok('第二次不帶 expected_spend、其他照帶', !('expected_spend' in ins2[1].args[0]) && ins2[1].args[0].min_spend === 300);
  t.ok('最後顯示送出成功', /已送出/.test($('#submitMsg').textContent), $('#submitMsg').textContent);

  /* ---- 修改建議、編輯：不擋 ---- */
  win.eval(`OFFERS=[{id:5,brand:'舊資料',category:'速食',regions:['全台'],offer:'送薯條',membership:'',membershipType:'app',
    membershipCost:'free',freeTier:'free_min',advanceDays:null,advanceNote:'',timing:'當月',valueTwd:50,conditions:'',
    validity:'',validityType:'rolling',sources:[],bestSource:null,status:'approved',reportCount:0,commentCount:0,
    ratingAvg:null,ratingCount:0,wishCount:0,transferable:'no',minSpend:null,expectedSpend:null}];`);
  win.__sb = makeSb({ tables: { offers: [{ id: 5, brand: '舊資料', category: '速食', regions: ['全台'], offer: '送薯條',
    membership_type: 'app', free_tier: 'free_min', timing: '當月', transferable: 'no', status: 'approved', sources: [] }] } });
  win.eval('sb=window.__sb;');
  await win.startEditOffer(5, false, true);
  await tick(win, 3);
  t.ok('修改建議：四格不必填（改錯字不用補四格）', REQ.every((n) => !f()[n].required));
  t.ok('星號也藏起來', [...doc.querySelectorAll('#submitForm .req-mark')].every((m) => m.classList.contains('hidden')));
  win.resetSubmitForm();
  t.ok('回到新投稿：又變必填', REQ.every((n) => f()[n].required));

  /* ---- 顯示 ---- */
  t.eq('fromRow 讀得到', win.eval('fromRow({id:1,brand:"x",expected_spend:180,regions:[],sources:[]}).expectedSpend'), 180);
  win.eval('SPEND=new Map();');
  const card = win.eval('offerCardHtml({...OFFERS[0], expectedSpend:180},0)');
  t.ok('還沒人回報花多少：卡片寫投稿的人估的「預計花」', /預計花 \$180/.test(card));
  win.eval("SPEND=new Map([['5',{n:4,avg:220,min:100,max:300}]]);");
  const card2 = win.eval('offerCardHtml({...OFFERS[0], expectedSpend:180},0)');
  t.ok('有大家實際花的：寫實際的，不寫估的', /大家平均花 \$220/.test(card2) && !/預計花/.test(card2));

  /* ---- 審核 ---- */
  t.eq('修改建議的「改前」認得低消（v81 起一直是空的）', win.eval('EDIT_CUR_KEY.min_spend'), 'current_min_spend');
  t.eq('也認得預計花費', win.eval('EDIT_CUR_KEY.expected_spend'), 'current_expected_spend');
  t.eq('審核畫面的欄位名稱', win.eval('EDIT_FIELD_LABEL.expected_spend'), '預計花費');

  /* ---- SQL ---- */
  t.ok('SQL：核可修改建議會套用低消（v81 漏的）', /min_spend\s+= case when v_patch \? 'min_spend'/.test(sql));
  t.ok('SQL：也套用預計花費', /expected_spend\s+= case when v_patch \? 'expected_spend'/.test(sql));
  t.ok('SQL：offers_public 重建後補回邊緣快取角色的權限', /grant select on public\.offers_public to edge_reader/.test(sql));
  t.ok('SQL：不用 cascade（有別的 view 依賴就停下來，不要連帶刪掉）', !/drop view[^;]*cascade/i.test(sql));
  t.ok('SQL：金額範圍', /expected_spend >= 0 and expected_spend <= 100000/.test(sql));

  /* ---- Worker ---- */
  t.ok('Worker：多要 expected_spend', /OFFER_COLS_V166 = OFFER_COLS \+ ',expected_spend'/.test(worker));
  /* v179 起改成一串欄位清單一層一層退（V179 → V166 → 原本的），最後一層一定是原本的 OFFER_COLS */
  t.ok('Worker：SQL 還沒跑就退回原本的欄位，不會壞', /COLS_CHAIN = \[[^\]]*OFFER_COLS_V166, OFFER_COLS\]/.test(worker)
    && (worker.match(/isMissingCol\(res\.status/g) || []).length === 2);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
