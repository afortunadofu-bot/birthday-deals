/* 使用者回報的三個問題（審核頁的「問題回報／建議」）

   1. LiChiee：「在我的使用回報介面裡編輯使用過的品牌，這次總共花了多少（元）
      記錄的金額無法顯示」
      → 撈回報的兩支查詢欄位清單裡漏掉 spent_twd。而且不只是看不到：欄位是空的
        送出去會變成 null，等於**每編輯一次就把原本填的金額清掉一次**。

   2. 陳：「待辦清單的自訂排序會卡住無法上下調整（部分時候上下按鈕無反應）」
      → 舊做法會產生重複的 sort_order，兩筆同號時「交換」等於什麼都沒做。
        「部分時候」正是因為要剛好撞號才會發生。

   3. 金信宇：「我點擊篩選『花蓮縣』時，底下篩選出的建議店家有很多都不是花蓮店家」
      → 標「全台」的連鎖本來就會一起列出來（標題有寫「含全台」），但「全台」是個
        很寬鬆的標記。線上實際數字：花蓮縣含全台 75 筆，真的標了花蓮的只有 22 筆。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, makeSb } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

(async () => {
  const t = makeAsserts('t43 使用者回報的三個問題');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];

  /* ========== 1. 編輯回報時「這次總共花了多少」會不見、還會被清掉 ========== */
  const selects = index.match(/\.select\('id,used_on,result,saved_twd[^']*'\)/g) || [];
  t.eq('撈回報的查詢有兩支', selects.length, 2);
  t.ok('兩支都帶了 spent_twd', selects.every((x) => x.includes('spent_twd')), selects.join(' | '));
  t.ok('表單會把它填回去', /\$\('#repSpent'\)\.value = existing\?\.spent_twd \?\? '';/.test(index));

  // 真的開一次：帶著 spent_twd 的舊資料，欄位要有值
  win.eval(`LIVE=true; me={id:'u-1'};`);
  await win.eval(`openReport(1, {id:9, used_on:'2026-10-01', result:'success',
    saved_twd:120, spent_twd:480, store:'門市', note:'', offers:{brand:'甲店', offer:''}})`);
  await tick(win, 2);
  t.eq('編輯時看得到原本填的金額', $('#repSpent').value, '480');
  t.eq('省下的金額也在', $('#repSaved').value, '120');
  $('#dlgReport').close();

  /* ========== 2. 待辦清單的上下排序「部分時候沒反應」 ========== */
  /* 重現原本的壞情況：WL_ROWS 不是照 sort_order 排的，沒有值的那幾筆用
     「在陣列裡的索引」補號，就會撞到已經存在的號碼。 */
  const sb = makeSb({ tables: { wishlist: [] } });
  win.__sb = sb;
  const setRows = (rows) => win.eval(`
    sb=window.__sb; LIVE=true; me={id:'u-1'};
    MY_USED_OFFER_IDS=new Set();
    WL_ROWS=${JSON.stringify(rows)};
    renderWishlistBody=()=>{};
  `);
  const orderOf = () => JSON.parse(win.eval(`JSON.stringify(
    WL_ROWS.slice().sort((a,b)=>(a.sort_order??999999)-(b.sort_order??999999)
      || (new Date(b.created_at)-new Date(a.created_at))).map(w=>w.offer_id))`));

  // X 沒有號碼、Y 已經是 0 —— 舊做法會把 X 也補成 0，兩筆同號
  setRows([
    { offer_id: 'X', sort_order: null, created_at: '2026-10-03' },
    { offer_id: 'Y', sort_order: 0, created_at: '2026-10-02' },
    { offer_id: 'Z', sort_order: null, created_at: '2026-10-01' },
  ]);
  const before = orderOf();
  await win.eval(`moveWishlistItem(${JSON.stringify(before[1])}, -1)`);
  await tick(win, 4);
  const after = orderOf();
  t.ok('第二筆往上移，真的換到第一位', after[0] === before[1],
    `${before.join('>')} → ${after.join('>')}`);
  t.eq('原本第一筆退到第二位', after[1], before[0]);
  const nums = JSON.parse(win.eval('JSON.stringify(WL_ROWS.map(w=>w.sort_order))'));
  t.eq('每一筆都有號碼，而且沒有重複', new Set(nums).size, nums.length);
  t.ok('號碼是從 0 開始連號', [...nums].sort((a, b) => a - b).every((n, i) => n === i), nums.join(','));
  const writes = sb.__calls.write.filter((w) => w.table === 'wishlist' && w.op === 'update');
  t.ok('有寫回資料庫', writes.length >= 2, String(writes.length));
  t.ok('寫的都是 sort_order', writes.every((w) => 'sort_order' in w.args[0]));

  // 連號之後，每次移動只會動到兩筆
  sb.__calls.write.length = 0;
  const mid = orderOf()[1];
  await win.eval(`moveWishlistItem(${JSON.stringify(mid)}, 1)`);
  await tick(win, 4);
  t.eq('連號之後每次只動兩筆', sb.__calls.write.filter((w) => w.table === 'wishlist').length, 2);

  // 第一筆不能再往上、最後一筆不能再往下
  sb.__calls.write.length = 0;
  const top = orderOf()[0];
  await win.eval(`moveWishlistItem(${JSON.stringify(top)}, -1)`);
  await tick(win, 3);
  t.eq('第一筆往上移是沒事發生，不是寫一堆空的', sb.__calls.write.length, 0);

  /* ========== 3. 篩選縣市時混進一堆「全台」 ========== */
  t.ok('多一顆「只看有標這個縣市的」', !!$('#fExactRegion'));
  t.ok('沒選縣市的時候藏起來', $('#fExactRegionWrap').classList.contains('hidden'));

  const match = (regions, r, exact) => win.eval(
    `matchRegion({regions:${JSON.stringify(regions)}}, ${JSON.stringify(r)}, ${!!exact})`);
  t.eq('沒勾的時候，全台的連鎖照樣列出來', match(['全台'], '花蓮縣', false), true);
  t.eq('勾了就只留真的標了花蓮的', match(['全台'], '花蓮縣', true), false);
  t.eq('真的標了花蓮的，勾不勾都在', match(['花蓮縣', '台北市'], '花蓮縣', true), true);
  t.eq('沒填地區的一律不算（勾不勾都一樣）', match([], '花蓮縣', false), false);
  t.eq('沒選縣市時不篩', match(['台北市'], '', true), true);

  // 選了縣市那顆才出現；取消選擇要連勾選狀態一起收掉，
  // 不然下次再選縣市會莫名其妙少一堆東西
  win.eval(`activeRegion.clear(); activeRegion.add('花蓮縣'); syncExactRegionToggle();`);
  t.ok('選了縣市就出現', !$('#fExactRegionWrap').classList.contains('hidden'));
  $('#fExactRegion').checked = true;
  win.eval(`activeRegion.clear(); syncExactRegionToggle();`);
  t.ok('取消選縣市就收起來', $('#fExactRegionWrap').classList.contains('hidden'));
  t.ok('而且把勾也取消掉', !$('#fExactRegion').checked);

  // 標題那行要照實說是哪一種
  t.ok('標題會寫「含全台」還是「不含全台」',
    /\$\('#fExactRegion'\)\?\.checked\?'（不含全台）':'含全台'/.test(index));

  // 記在這台裝置上，而且「清除篩選」要清得掉
  t.ok('狀態會存起來', /fExactRegion:\$\('#fExactRegion'\)\.checked/.test(index));
  t.ok('下次打開會還原', /\$\('#fExactRegion'\)\.checked=!!s\.fExactRegion;/.test(index));
  t.ok('清除篩選清得掉', /\$\('#fExactRegion'\)\.checked=false;/.test(index));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
