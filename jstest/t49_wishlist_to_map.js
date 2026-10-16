/* celine：「代辦清單新增按距離排序的按鈕，然後導到地圖頁面」
   （使用者「烏龍綠」2026-10-10 也提過：「希望在收藏的店家也能放以地理位置近的排序」）

   待辦清單那一頁沒有地圖、也沒有距離，硬塞一個「依距離」的排序選項只會排不出
   東西。這顆按鈕是入口：切到「優惠」分頁、打開「附近」跟「只看收藏」——那邊
   本來就會由近到遠排，而且有地圖。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

(async () => {
  const t = makeAsserts('t49 待辦清單 → 地圖、由近到遠');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  const btn = $('#btnWlNear');
  t.ok('待辦清單那一塊有這顆', !!btn && !!btn.closest('#wishlistPanel'));
  t.ok('一筆收藏都沒有的時候先藏起來', btn.classList.contains('hidden'));

  // 有收藏才出現
  win.eval(`LIVE=true; me={id:'u-1'}; WISH=new Set(['1','2']); WL_ROWS=[]; renderWishlistBody();`);
  t.ok('有收藏就出現', !btn.classList.contains('hidden'));

  // 按下去：先設好「只看收藏」再切分頁，不要先閃一下全部幾百筆
  const calls = [];
  win.eval(`
    window.__calls=[];
    startNear=()=>{ window.__calls.push(['startNear', NEAR.wishOnly]); };
    logEvent=(t,m)=>window.__calls.push(['logEvent',t]);
  `);
  btn.click();
  await tick(win, 2);
  const log = JSON.parse(win.eval('JSON.stringify(window.__calls)'));
  t.ok('有去開「附近」', log.some((c) => c[0] === 'startNear'), JSON.stringify(log));
  t.eq('而且開之前「只看收藏」就already設好了',
    log.find((c) => c[0] === 'startNear')[1], true);
  t.ok('切到「優惠」分頁（那一頁的 id 是 tab-browse）',
    !$('#tab-browse').classList.contains('hidden') && $('#tab-mine').classList.contains('hidden'));
  t.ok('有記一筆事件（之後才知道有沒有人用）',
    log.some((c) => c[0] === 'logEvent' && c[1] === 'wishlist_to_map'));

  // 清單空了就不要留一顆按下去只會跳提示的按鈕
  win.eval(`WISH=new Set(); renderWishlistBody();`);
  t.ok('收藏清光就收起來', btn.classList.contains('hidden'));

  // 真的被按到（例如用鍵盤）而清單是空的：講人話，不要開一張空地圖
  let toast = '';
  win.__toast = (m) => { toast = m; };
  win.eval(`showToast=(m)=>window.__toast(m); startNear=()=>{ window.__calls.push(['startNear', NEAR.wishOnly]); };`);
  win.eval('window.__calls.length=0;');
  win.eval('wishlistToMap()');
  t.ok('空的時候不要開地圖', !JSON.parse(win.eval('JSON.stringify(window.__calls)')).length);
  t.ok('而且要講怎麼收藏', /待辦清單還是空的/.test(toast) && /書籤/.test(toast), toast);

  t.ok('用的是既有的「只看收藏」，沒有另外長出一套篩選',
    /function wishlistToMap[\s\S]{0,300}NEAR\.wishOnly=true/.test(index));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
