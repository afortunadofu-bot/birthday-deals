/* v145：場館的「一鍵加入待辦清單」——按下去先開一張勾選清單

   celine：「一鍵加入收藏希望是可以套用在這」「然後要可以勾選不是全部」 */
const { boot, tick, makeSb, makeAsserts, stubHeavy } = require('./harness');

(async () => {
  const t = makeAsserts('t66 一鍵加入待辦清單');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];

  /* ---- 視窗本體 ---- */
  t.ok('有勾選清單這個視窗', !!$('#dlgBulkAdd'));
  t.ok('裡面有清單', !!$('#bulkAddList'));
  t.ok('有「全部勾選」跟「全部取消」', !!$('#btnBulkAll') && !!$('#btnBulkNone'));
  t.ok('送出鈕是 type=button（不然 <form method=dialog> 會先把視窗關掉）',
    $('#btnBulkAdd').getAttribute('type') === 'button');
  /* 手機上按返回鍵要關得掉——不在那份清單裡的話，返回會直接把整頁／App 關掉。
     原本寫死「dlgBulkAdd 是清單最後一個」，v147 在它後面再加一個就紅了。
     驗的是「在不在清單裡」，不是排第幾個。 */
  t.ok('返回鍵的那份清單裡有它',
    /dlgBulkAdd'\)[^\]]*\]\.forEach/.test(doc.documentElement.outerHTML));

  /* ---- 場館裡那顆按鈕 ---- */
  const sb = makeSb({
    rpcs: { venue_offer_ids: [{ venue_offer_ids: 1 }, { venue_offer_ids: 2 }, { venue_offer_ids: 3 }] },
    tables: { wishlist: [] },
  });
  win.__sb = sb;
  stubHeavy(win, ['render', 'renderMyWishlist', 'renderReminders', 'paintNearPins']);
  win.eval(`
    sb = window.__sb;
    OFFERS = [{id:1,brand:'甲',offer:'買一送一'},
              {id:2,brand:'乙',offer:'送蛋糕'},
              {id:3,brand:'丙',offer:'八五折'}];
    WISH = new Set(['3']);
    MY_USED_OFFER_IDS = new Set(['2']);
    VENUES = [{id:9, name:'中山站・南京西路', county:'台北市', offer_count:3}];
    VENUE_OPEN = 9;
    renderVenues();
  `);
  await tick(win, 3);

  const bulkBtn = $('#venueBulk9');
  t.ok('場館打開之後有一顆「一鍵加入」', !!bulkBtn);
  /* 已經在清單裡的那一筆不算進去——按鈕上的數字就是真的會多拿到幾筆 */
  t.ok('數字扣掉已經收藏的那一筆', /2 筆/.test(bulkBtn.textContent), bulkBtn.textContent);

  /* ---- 預設怎麼勾 ---- */
  bulkBtn.click();
  await tick(win, 2);
  t.ok('按了就打開視窗', $('#dlgBulkAdd').open === true);
  const boxes = $$('#bulkAddList input[type=checkbox]');
  t.eq('列出來的是「還沒收藏」的那兩筆', boxes.map((c) => c.dataset.id), ['1', '2']);
  t.ok('已經收藏的那一筆根本不列（重複加沒有意義）',
    !boxes.some((c) => c.dataset.id === '3'));
  t.ok('說明寫出另外幾筆已經在清單裡了', /1 筆已經在/.test($('#bulkAddSub').textContent),
    $('#bulkAddSub').textContent);
  t.ok('也寫出是哪一個商圈', /中山站/.test($('#bulkAddSub').textContent));

  t.ok('沒用過的預設勾起來', boxes.find((c) => c.dataset.id === '1').checked);
  /* 生日優惠大多一年一次，回報過用過的勾了也用不到 */
  t.ok('回報過用過了的預設不勾', !boxes.find((c) => c.dataset.id === '2').checked);
  t.ok('而且標出來是為什麼', /回報過用過/.test($('#bulkAddList').textContent));
  t.ok('送出鈕上的數字＝真的勾起來的筆數', /1 筆/.test($('#btnBulkAdd').textContent),
    $('#btnBulkAdd').textContent);

  /* ---- 勾選不是全部 ---- */
  $('#btnBulkAll').click();
  await tick(win, 1);
  t.eq('「全部勾選」兩筆都勾起來',
    $$('#bulkAddList input[type=checkbox]').filter((c) => c.checked).length, 2);
  t.ok('數字跟著變', /2 筆/.test($('#btnBulkAdd').textContent));

  $('#btnBulkNone').click();
  await tick(win, 1);
  t.eq('「全部取消」一筆都不剩',
    $$('#bulkAddList input[type=checkbox]').filter((c) => c.checked).length, 0);
  t.ok('一筆都沒選就按不下去', $('#btnBulkAdd').disabled);

  /* 手動取消其中一筆 */
  $('#btnBulkAll').click();
  await tick(win, 1);
  const one = $$('#bulkAddList input[type=checkbox]').find((c) => c.dataset.id === '2');
  one.checked = false;
  one.onchange();
  await tick(win, 1);
  t.ok('取消掉一筆之後數字是 1', /1 筆/.test($('#btnBulkAdd').textContent),
    $('#btnBulkAdd').textContent);

  /* ---- 真的送出（未登入：存在這台裝置上） ---- */
  win.eval('LIVE = false; me = null;');
  $('#btnBulkAdd').click();
  await tick(win, 3);
  t.ok('勾起來的那一筆進了收藏', win.eval("WISH.has('1')"));
  t.ok('取消掉的那一筆沒有進去', !win.eval("WISH.has('2')"));
  t.ok('本來就收藏的還在', win.eval("WISH.has('3')"));
  t.ok('未登入時存在這台裝置上',
    JSON.parse(win.localStorage.getItem('sxr_wishlist') || '[]').includes('1'));
  t.ok('送出後把視窗關起來', !$('#dlgBulkAdd').open);

  /* ---- 寫失敗就不能假裝收好了 ----
     一筆的 toggleWish 是先改畫面再寫（失敗就改回來）；整批不能這樣，
     十八筆一起失敗的話畫面上十八個「已收藏」全是假的，使用者不會再加一次。 */
  const src = win.eval('String(doBulkAdd)');
  const writeAt = src.indexOf('upsert');
  const wishAt = src.indexOf('WISH.add(String(id)); syncWishButtons');
  t.ok('先寫資料庫、成功了才改畫面', writeAt > 0 && wishAt > writeAt);
  t.ok('失敗就 return，不會往下走到 WISH.add', /r\.error\)\{[\s\S]{0,120}return;/.test(src));
  t.ok('v71 還沒跑（沒有 person 欄位）會退回不帶清單再送一次',
    /person\|column\|schema cache/.test(src));
  t.ok('加完之後場館清單上的「已收藏」要跟著更新', /fillVenue\(venueId\)/.test(src));

  /* ---- 行程還沒做，就不要放一顆按了沒地方看的按鈕 ---- */
  /* 行程本體還沒做，所以這張清單上刻意沒有「加入行程」——按了沒地方看的
     按鈕比沒有按鈕更糟。（註解裡寫得到那四個字，所以只看視窗裡的文字。） */
  t.ok('這一版只加「待辦清單」，沒有「加入行程」',
    !/加入行程/.test($('#dlgBulkAdd').textContent));

  t.done();
})();
