/* v139：地圖地標跟詳情視窗都加「我用過了」

   使用者陳（2026-10-07，問題回報）：
   「希望在點開地圖上的地標然後按"看優惠"後，有"我用過了"的欄位，
     這樣就不用再另外打字搜尋店家才能紀錄~」

   查下來他說得完全對：卡片上一直都有「我用過了」（.act-report），
   但**詳情視窗裡沒有**。從地圖點進來的人只會走到詳情視窗，等於整條路
   走到底都沒有地方可以記錄——只能退回清單自己打字搜尋那家店。 */
const { boot, tick, makeSb, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t62 地圖與詳情都能「我用過了」');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  /* ---- 詳情視窗 ---- */
  t.ok('詳情視窗有「我用過了」', !!$('#btnDtlReport'));
  t.eq('就在關閉旁邊（最明顯的位置）',
    $('#btnDtlReport').parentElement, $('#btnDtlClose').parentElement);
  t.ok('是主要按鈕，不是淡淡的那種', $('#btnDtlReport').classList.contains('primary'));

  win.eval(`OFFERS=[{id:7, brand:'測試店', category:'火鍋', offer:'送鍋',
    regions:['台北市'], timing:'當月', sources:[]}];`);
  win.eval('REPORT_CALLS=[]; openReport=(id)=>REPORT_CALLS.push(id);');
  // openDetail 一開頭就 `if(!LIVE) return`（離線模式看不到留言），而且會去查留言，
  // 所以要給它一個假的 sb
  win.__sb = makeSb({ tables: { offer_comments: [], offer_ratings: [], usage_reports: [] } });
  win.eval('LIVE=true; sb=window.__sb;');
  win.eval('openDetail(7)');
  await tick(win, 1);
  $('#btnDtlReport').click();
  await tick(win, 1);
  t.eq('按下去會開回報視窗，而且帶的是這一筆', win.eval('REPORT_CALLS'), [7]);
  t.eq('詳情先關起來（兩個 dialog 疊著開，手機上會推不動）',
    $('#dlgDetail').open, false);

  /* ---- 地圖地標 ---- */
  const paint = win.eval('String(paintNearPins)');
  t.ok('地標的小視窗裡也有一顆', /map-report/.test(paint));
  t.ok('不用先開詳情，直接從地標就能記',
    paint.indexOf('map-report') > paint.indexOf('map-open-offer'));
  t.ok('「看優惠」還在（不是拿它換掉）', /map-open-offer/.test(paint));

  const init = win.eval('String(openNearMap)');
  t.ok('小視窗打開時才綁事件（Leaflet 會擋掉往外冒泡）',
    /querySelector\('\.map-report'\)/.test(init));
  t.ok('綁的是 openReport，帶 data-id', /openReport\(r\.dataset\.id\)/.test(init));

  t.done();
})();
