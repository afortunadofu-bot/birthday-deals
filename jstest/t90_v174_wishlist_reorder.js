/* v174：celine「代辦清單要可以上下移順序」。
   ▲▼ 本來只有排序選「自訂順序」才出現，預設「最近加入」等於藏起來。 */
const { boot, tick, makeSb, makeAsserts, stubHeavy } = require('./harness');

(async () => {
  const t = makeAsserts('t90 v174：待辦清單隨時可以上下移');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];
  stubHeavy(win, ['renderMyWishlist']);
  const sb = makeSb({ tables: { wishlist: [] } });
  win.__sb = sb;
  const y = new Date().getFullYear();
  /* 加入時間：A 最早、C 最新。舊的 sort_order 故意跟畫面上的順序不一樣（C=0 在最前）——
     確認第一次按的時候，起點是「畫面上」的順序，不是舊的 sort_order。 */
  win.eval(`sb=window.__sb; LIVE=true; me={id:'u-1'}; WL_FLAGS=false;
    WL_ROWS=[   /* 跟資料庫回來的一樣：最新加入的在前 */
      {offer_id:4,done:true, note:'',sort_order:3,created_at:'2026-10-04T00:00:00Z',year:${y},offers:{brand:'用過了'}},
      {offer_id:3,done:false,note:'',sort_order:0,created_at:'2026-10-03T00:00:00Z',year:${y},offers:{brand:'C店'}},
      {offer_id:2,done:false,note:'',sort_order:1,created_at:'2026-10-02T00:00:00Z',year:${y},offers:{brand:'B店'}},
      {offer_id:1,done:false,note:'',sort_order:2,created_at:'2026-10-01T00:00:00Z',year:${y},offers:{brand:'A店'}}];
    document.querySelector('#wlSort').value='added_asc'; renderWishlistBody();`);
  const order = () => $$('#myWishlist [data-wl-row]').map((e) => e.dataset.wlRow);
  const btn = (id, dir) => $(`#myWishlist .wl-move[data-id="${id}"][data-dir="${dir}"]`);

  t.eq('排序是「最早加入」：A、B、C（用過的在最後）', order(), ['1', '2', '3', '4']);
  t.ok('不用先選「自訂順序」，▲▼ 就在', !!btn(1, 1) && !!btn(2, -1));
  t.ok('第一個不能再往上', btn(1, -1).disabled);
  t.ok('最後一個（還沒用的）不能再往下', btn(3, 1).disabled);
  t.ok('用過的沒有 ▲▼（它沉在最下面）', !btn(4, 1) && !btn(4, -1));

  btn(1, 1).click();
  await tick(win, 4);
  t.eq('按 A 的 ▼：A 跟 B 換，C 不動（照畫面上的順序換，不是照舊的 sort_order）', order(), ['2', '1', '3', '4']);
  t.eq('排序自動切成「自訂順序」', $('#wlSort').value, 'manual');
  const writes = sb.__calls.write.filter((w) => w.table === 'wishlist' && w.op === 'update');
  t.ok('新的順序寫回資料庫（整串重新編號，連 C 也改了，下次打開才會一樣）', writes.length === 3, writes.map((w) => JSON.stringify(w.args[0])).join(' '));

  btn(3, -1).click();
  await tick(win, 4);
  t.eq('之後照自訂順序繼續排：C 往上', order(), ['2', '3', '1', '4']);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
