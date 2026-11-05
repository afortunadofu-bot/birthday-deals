/* v178：celine「掃各家的營業時間，篩選多一個可以選時間」 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeSb, makeAsserts, stubHeavy } = require('./harness');

const sql = fs.readFileSync(path.join(__dirname, '..', 'schema_v178_store_hours.sql'), 'utf8');
const base = {
  category: '速食', regions: ['台北市'], membership: '', membershipCost: 'free', freeTier: 'free_min',
  timing: '當月', valueTwd: 60, conditions: '', validity: '', validityType: 'rolling', sources: [],
  bestSource: null, status: 'approved', reportCount: 0, commentCount: 0, ratingAvg: null, ratingCount: 0,
  wishCount: 0, transferable: 'unknown', advanceNote: '', membershipType: 'app', advanceDays: null,
};
const OFFERS = [
  { ...base, id: 1, brand: '早餐店' },
  { ...base, id: 2, brand: '燒肉店' },
  { ...base, id: 3, brand: '24小時' },
  { ...base, id: 4, brand: '純線上' },
];
/* 假的資料庫：早餐店 06:00–11:00、燒肉 17:00–23:00、24 小時；純線上沒有分店 */
const OPEN = { 1: [[360, 660]], 2: [[1020, 1380]], 3: [[0, 1440]] };
const isOpen = (id, mow) => OPEN[id].some(([a, b]) => mow % 1440 >= a && mow % 1440 < b);

(async () => {
  const t = makeAsserts('t94 v178：營業時間篩選');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];
  stubHeavy(win, ['loadMyVenueSuggestions', 'loadPendingBadge', 'maybeShowBirthdayCheer', 'renderReminders']);
  win.__offers = OFFERS;
  win.eval('OFFERS = window.__offers.map(o=>({...o})); activeRegion.clear();');
  const shown = () => JSON.parse(win.eval('JSON.stringify(OFFERS.filter(filterPredicate()).map(o=>o.id))'));

  /* 一、還沒有營業時間資料（v178 沒跑或還沒匯入）：整列不出現 */
  const sbEmpty = makeSb({ tables: { offer_stores: [] } });
  win.__sb = sbEmpty;
  win.eval('sb=window.__sb; LIVE=true; HOURS_TRIED=false;');
  await win.eval('loadHoursAvail()');
  t.ok('沒有資料：篩選裡不出現「營業時間」', $('#hoursRow').classList.contains('hidden'));
  t.eq('也不擋任何優惠', shown(), [1, 2, 3, 4]);

  /* 二、有資料 */
  const sb = makeSb({
    tables: { offer_stores: [{ offer_id: 1 }] },
    rpcs: { offers_open_at: (p) => [1, 2, 3].map((id) => ({ offer_id: id, is_open: isOpen(id, p.p_mow) })) },
  });
  win.__sb = sb;
  win.eval('sb=window.__sb; HOURS_TRIED=false; HOURS_CACHE.clear();');
  await win.eval('loadHoursAvail()');
  t.ok('有資料：多一排「營業時間」', !$('#hoursRow').classList.contains('hidden'));
  t.eq('三個選項', $$('#hoursChips .chip').map((c) => c.textContent), ['不限', '現在有開', '指定時間']);

  // 指定時間：週六 08:00 → 只有早餐店跟 24 小時
  $$('#hoursChips .chip')[2].click();
  t.ok('選「指定時間」才出現星期跟時間', !$('#hoursAtPick').classList.contains('hidden'));
  t.eq('星期從週一排到週日', $$('#hoursDay option').map((o) => o.textContent.replace('（今天）', '')),
    ['週一', '週二', '週三', '週四', '週五', '週六', '週日']);
  t.eq('時間每半小時一格', $$('#hoursTime option').length, 48);
  $('#hoursDay').value = '6'; $('#hoursDay').dispatchEvent(new win.Event('change'));
  $('#hoursTime').value = '480'; $('#hoursTime').dispatchEvent(new win.Event('change'));
  win.eval('filterPredicate()');      // 第一次：去問資料庫
  await tick(win, 3);
  t.eq('週六 08:00：早餐店、24 小時', shown(), [1, 3]);
  const call = sb.__calls.rpc.filter((c) => c.name === 'offers_open_at').pop();
  t.eq('問資料庫用的是「一週裡的第幾分鐘」（週六＝6）', call.params.p_mow, 6 * 1440 + 480);
  t.ok('沒選縣市：不限縣市', call.params.p_counties === null);
  t.ok('「篩選中」寫「週六 08:00 有開」', JSON.parse(win.eval('JSON.stringify(activeFilterChips().map(c=>c.label))')).includes('週六 08:00 有開'));
  t.ok('篩選數字有算進去', $('#filterBadge').textContent === '1');
  win.eval('render()');
  t.ok('「N / M 筆」那行講清楚：查不到營業時間的另外算（純線上那筆）',
    /週六 08:00 有開（另有 1 筆查不到營業時間，沒列出）/.test($('#count').textContent), $('#count').textContent);

  // 換時間：晚上 19:00 → 燒肉、24 小時
  $('#hoursTime').value = '1140'; $('#hoursTime').dispatchEvent(new win.Event('change'));
  await tick(win, 3);
  t.eq('週六 19:00：燒肉、24 小時', shown(), [2, 3]);
  const n = sb.__calls.rpc.filter((c) => c.name === 'offers_open_at').length;
  $('#hoursTime').value = '480'; $('#hoursTime').dispatchEvent(new win.Event('change'));
  await tick(win, 3);
  t.eq('切回問過的時間不再重問（省流量）', sb.__calls.rpc.filter((c) => c.name === 'offers_open_at').length, n);

  // 選了縣市：只看那個縣市的分店
  win.eval("activeRegion.add('台北市'); render();");
  await tick(win, 3);
  t.eq('選了台北市：把縣市一起傳過去', sb.__calls.rpc.filter((c) => c.name === 'offers_open_at').pop().params.p_counties, ['台北市']);
  win.eval('activeRegion.clear();');

  // 記住篩選
  win.eval('saveFilters(); HOURS_F={mode:"",dow:null,min:null}; loadFilters();');
  t.eq('重新打開還記得', JSON.parse(win.eval('JSON.stringify(HOURS_F)')), { mode: 'at', dow: 6, min: 480 });

  // 現在有開：台灣時間，15 分鐘一格
  $$('#hoursChips .chip')[1].click();
  await tick(win, 3);
  const now = JSON.parse(win.eval('JSON.stringify(twNow())'));
  const tw = new Date(Date.now() + 8 * 3600e3);
  t.ok('「現在」用台灣時間', now.dow === tw.getUTCDay() && Math.abs(now.min - (tw.getUTCHours() * 60 + tw.getUTCMinutes())) <= 1);
  const pNow = sb.__calls.rpc.filter((c) => c.name === 'offers_open_at').pop().params.p_mow;
  t.ok('「現在」對齊到 15 分鐘', pNow % 15 === 0 && pNow === now.dow * 1440 + Math.floor(now.min / 15) * 15);
  t.eq('現在有開：照假資料算', shown(), [1, 2, 3].filter((id) => isOpen(id, pNow)));

  // 讀不到（例如資料庫掛了）：不擋，說中文
  const sbErr = makeSb({ tables: { offer_stores: [{ offer_id: 1 }] },
    rpcs: { offers_open_at: { data: null, error: { message: 'Failed to fetch' } } } });
  win.__sb = sbErr;
  win.eval('sb=window.__sb; HOURS_CACHE.clear(); render();');
  await tick(win, 3);
  t.eq('讀不到：不擋任何優惠', shown(), [1, 2, 3, 4]);
  t.ok('讀不到：說中文', /營業時間讀不到/.test($('#count').textContent) && !/Failed to fetch/.test($('#count').textContent), $('#count').textContent);

  $('#btnClearFilters').click();
  t.ok('清除篩選一起清掉', win.eval('HOURS_F.mode') === '' && $$('#hoursChips .chip')[0].getAttribute('aria-pressed') === 'true');

  /* 三、SQL */
  t.ok('SQL：只看前台看得到的分店', /not s\.hidden/.test(sql));
  t.ok('SQL：沒有營業時間的不算有開也不算沒開', /s\.open_week is not null/.test(sql));
  t.ok('SQL：不用 security definer', !/security definer/.test(sql));
  t.ok('SQL：給 anon 叫', /grant execute on function public\.offers_open_at\(int, text\[\]\) to anon, authenticated/.test(sql));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
