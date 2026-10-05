/* 一打開網站就問要不要開定位 ＋ 附近的地圖預設開啟（celine）

   「一打開網頁就會自動跳通知問你要不要開定位，然後地圖預設開啟」

   刻意不在開場直接呼叫 navigator.geolocation：那會讓瀏覽器自己跳權限視窗，很多人
   反射性按「不允許」，而那是瀏覽器層級的封鎖，網站再也問不到（只能請人去設定裡改）。
   所以先用自己的小視窗問，按「好」才真的去要權限。這支就是在驗這個順序，以及
   「已經允許過的人不要再問」「已經封鎖的人不要白問」「回答過就不再問」。 */
const { boot, tick, makeSb, makeAsserts } = require('./harness');

function setPermission(win, state) {
  Object.defineProperty(win.navigator, 'permissions', {
    configurable: true,
    value: state === null ? undefined : { query: async () => ({ state }) },
  });
}
function setGeo(win, ok = true) {
  Object.defineProperty(win.navigator, 'geolocation', {
    configurable: true,
    value: ok ? { getCurrentPosition(cb) { win.setTimeout(() => cb({ coords: { latitude: 25.04, longitude: 121.51 } }), 0); } } : undefined,
  });
}

(async () => {
  const t = makeAsserts('t25 開場問定位＋地圖預設開啟');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const nudge = () => $('#geoNudge');
  const shown = () => !nudge().classList.contains('hidden');

  /* ================= 1. 附近：地圖預設開啟 ================= */
  const sb = makeSb({ rpcs: { nearest_offer_stores: () => ({ data: [], error: null }) } });
  win.__sb = sb;
  win.eval('sb = window.__sb; LIVE = true;');
  setGeo(win, true);
  // jsdom 載不到 Leaflet，真的 openNearMap() 只會走「載入失敗」那條路，
  // 所以這裡換成空殼，驗的是「有沒有被呼叫」
  let mapOpens = 0;
  const realOpen = win.openNearMap;
  win.openNearMap = async () => { mapOpens += 1; };

  $('#btnNear').click();
  await tick(win, 6);
  t.eq('一開「附近」就把地圖打開，不用再按一次「地圖」', mapOpens, 1);
  t.ok('定位成功也照樣開著（不是只有失敗才開）',
    /你目前的位置/.test($('#nearStatus').textContent), $('#nearStatus').textContent);
  win.stopNear();
  await tick(win, 2);

  /* ================= 2. 開場問定位 ================= */
  const askCalls = [];
  win.startNear = () => { askCalls.push('startNear'); };
  const clearAsk = () => win.localStorage.removeItem('sxr_geo_ask');

  // 離線示範模式不要問（問了也查不到分店）
  win.eval('LIVE = false;');
  clearAsk(); setPermission(win, 'prompt');
  t.ok('離線模式不問', (await win.maybeAskLocation()) === false && !shown());

  // 瀏覽器根本不支援定位也不要問
  win.eval('LIVE = true;');
  setGeo(win, false);
  t.ok('沒有定位功能就不問', (await win.maybeAskLocation()) === false && !shown());
  setGeo(win, true);

  // 沒回答過、權限還沒決定 → 跳我們自己的小視窗（不是直接跳瀏覽器權限）
  clearAsk(); setPermission(win, 'prompt');
  t.ok('一打開網站就問', (await win.maybeAskLocation()) === true && shown());
  t.ok('問得清楚在問什麼', /附近有什麼優惠/.test(nudge().textContent), nudge().textContent.replace(/\s+/g, ' ').trim());
  t.ok('講清楚位置怎麼用', /不會存起來/.test(nudge().textContent));
  t.eq('這一步還不要去要瀏覽器的權限', askCalls.length, 0);

  // 更新紀錄的通知要讓路，不然兩個小視窗會疊在一起
  win.localStorage.removeItem('sxr_updates_seen');
  win.localStorage.setItem('sxr_updates_seen', '2000-01-01');
  win.localStorage.removeItem('sxr_updates_nudge_done');
  win.localStorage.removeItem('sxr_updates_nudge_at');
  t.ok('更新通知讓給定位這一問',
    win.maybeShowUpdatesNudge() === false && $('#updatesNudge').classList.contains('hidden'));

  // 按「好」才去要權限
  $('#btnGeoNudgeYes').click();
  await tick(win, 3);
  t.ok('按「好」才開始定位', !shown() && askCalls.length === 1, askCalls);
  t.eq('記住回答過了', win.localStorage.getItem('sxr_geo_ask'), 'yes');
  t.ok('回答過就不再問', (await win.maybeAskLocation()) === false && !shown());

  // 按「先不要」：記住，但不是封鎖——之後自己按「📍 附近」照樣問得到
  clearAsk();
  await win.maybeAskLocation();
  $('#btnGeoNudgeNo').click();
  t.ok('按「先不要」就收起來', !shown());
  t.eq('先不要也記住', win.localStorage.getItem('sxr_geo_ask'), 'no');
  t.ok('說了不要就不再問', (await win.maybeAskLocation()) === false);
  askCalls.length = 0;
  $('#btnNear').click();
  await tick(win, 2);
  t.eq('但自己按「附近」還是能開', askCalls.length, 1);

  // 嵐：「我希望不要每次打開 app 都預設開啟附近」——允許過定位不等於每次都要用，
  // 不再問第二次，但也不要自作主張跳進附近模式（清單會直接被距離篩過一遍）
  clearAsk(); setPermission(win, 'granted');
  askCalls.length = 0;
  win.eval('NEAR.active = false;');
  t.ok('允許過定位就不再問一次', (await win.maybeAskLocation()) === false && !shown());
  t.eq('但也不要自己打開附近', askCalls.length, 0);

  // 已經被封鎖：問了也沒用，不要跳
  clearAsk(); setPermission(win, 'denied');
  askCalls.length = 0;
  t.ok('已經封鎖就不白問', (await win.maybeAskLocation()) === false && !shown() && askCalls.length === 0);

  // 生日卡片正在跳的時候先讓路
  clearAsk(); setPermission(win, 'prompt');
  $('#bdayCheer').classList.remove('hidden');
  t.ok('生日卡片在跳就先不問', (await win.maybeAskLocation()) === false && !shown());
  win.closeBdayCheer();
  t.ok('卡片關掉之後再進來還是問得到', (await win.maybeAskLocation()) === true && shown());
  $('#btnGeoNudgeClose').click();

  win.openNearMap = realOpen;
  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
