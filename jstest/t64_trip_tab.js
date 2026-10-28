/* v143：底部第三格換成「行程」，「新增」搬到兩顆按鈕

   celine：「新的一區建議可以獨立一個分頁，取代新增的分頁
             （新增按鈕移到主頁跟我的頁）」「投稿量沒差」 */
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t64 行程分頁＋新增搬家');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];

  /* ---- 底部 ---- */
  const tabs = $$('.tab').map((x) => x.dataset.tab);
  t.eq('底部四格（審核是管理員才有的第五格）',
    tabs.filter((x) => x !== 'admin'), ['browse', 'board', 'trip', 'mine']);
  t.ok('「新增」不再是底部的一格', !tabs.includes('submit'));
  t.eq('第三格叫「排行程」', $('.tab[data-tab="trip"]').textContent.trim(), '排行程');

  /* ---- 但投稿那一整段還在 ---- */
  t.ok('#tab-submit 沒有被拿掉（表單還是那一份）', !!$('#tab-submit'));
  t.ok('表單本體也在', !!$('#submitForm'));

  /* ---- 兩個新的入口 ---- */
  t.ok('優惠清單最下面有一個入口', !!$('#btnGoSubmitList'));
  t.ok('那個入口在清單下面，不是上面',
    $('#grid').compareDocumentPosition($('#submitCta')) & 4);   // 4 = FOLLOWING
  t.ok('「我的投稿」標題旁邊也有一顆', !!$('#btnGoSubmitMine'));
  t.ok('那顆在「我的投稿」那一塊裡', $('#myOffersPanel').contains($('#btnGoSubmitMine')));

  /* ---- 進去之後要出得來 ---- */
  t.ok('投稿頁有「回優惠清單」', !!$('#btnSubmitBack'));
  win.eval("goSubmit('list_bottom')");
  await tick(win, 1);
  t.ok('按了入口之後顯示投稿頁', !$('#tab-submit').classList.contains('hidden'));
  t.ok('其他分頁收起來', $('#tab-browse').classList.contains('hidden'));
  t.eq('投稿頁底下沒有任何一格亮著（所以才需要那顆返回）',
    $$('.tab').filter((x) => x.getAttribute('aria-selected') === 'true').length, 0);
  $('#btnSubmitBack').click();
  await tick(win, 1);
  t.ok('按返回回到優惠清單', !$('#tab-browse').classList.contains('hidden'));
  t.eq('而且「優惠」那一格亮回來',
    $$('.tab').filter((x) => x.getAttribute('aria-selected') === 'true').map((x) => x.dataset.tab),
    ['browse']);

  win.eval("goSubmit('mine')");
  await tick(win, 1);
  $('#btnSubmitBack').click();
  await tick(win, 1);
  t.ok('從「我的」進去的，返回就回「我的」', !$('#tab-mine').classList.contains('hidden'));

  /* ---- 行程分頁 ---- */
  t.ok('有行程那一段', !!$('#tab-trip'));
  t.ok('裡面有場館清單', !!$('#venueList') && !!$('#venueCounty'));

  const src = win.eval('String(loadVenues)');
  t.ok('資料來自 v142 的 venues_public', /venues_public/.test(src));
  /* v142 還沒跑的人不該看到一片紅色錯誤訊息 */
  t.ok('表還沒建起來時講人話，不是丟 error 給使用者', /這一區還沒開放/.test(src));
  t.ok('而且只有管理員看得到要跑哪一支 SQL',
    /is_admin[\s\S]{0,60}schema_v142_venues\.sql/.test(src));
  t.ok('離線時也不會爆', /offlineMsg/.test(src));
  t.ok('點開場館才去查裡面有哪幾家（不是一次全查）',
    /venue_offer_ids/.test(win.eval('String(fillVenue)'))
    && !/venue_offer_ids/.test(src));

  /* v143 拿掉「新增」那一格時踩到的：startEditOffer 還在點
     `.tab[data-tab="submit"]`，拿掉之後那是 null，一按「編輯」整支就炸。
     這一條把「程式裡點的每一個分頁都真的存在」變成規則。 */
  const index = win.eval('document.documentElement.outerHTML');
  const clicked = index.split('data-tab=').slice(1)
    .map((seg) => (seg.match(/^.([a-z]+)/) || [])[1]).filter(Boolean);
  const exist = new Set(tabs);
  t.eq('程式裡點到的分頁都真的存在',
    [...new Set(clicked)].filter((x) => !exist.has(x)), []);

  t.done();
})();
