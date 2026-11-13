/* v194 celine：「繼續完善使用者體驗檢查」。手機寬（375px）走一輪找到的：

   1. 星巴克卡片寫「需達等級．需達等級」——會員類型本身就是「需達等級」，後面又接一次
   2. 一打開就是「555 / 560 筆」，篩選按鈕卻顯示 0：少掉的 5 筆是預設勾著的「隱藏過期」藏的，
      畫面上沒說
   3. 地圖提示在手機上被拆成三行（152px），第一張卡片被擠到畫面下半 → 87px
   4. 卡片上「來源↗」只有 36×17，手指很難點到 */
const { boot, tick, makeAsserts, readRawIndex } = require('./harness');

(async () => {
  const t = makeAsserts('t103 v194 使用者體驗檢查');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  /* ===== 1. 會員標籤不重複 ===== */
  const flagOf = (patch) => {
    const html = win.eval(`(()=>{ const o={...OFFERS[0], ...${JSON.stringify(patch)}}; return offerCardHtml(o, 0); })()`);
    const box = doc.createElement('div'); box.innerHTML = html;
    return [...box.querySelectorAll('.flag')].map((x) => x.textContent.trim())
      .find((x) => /會員|等級|APP|LINE|Ocard|消費紀錄/.test(x));
  };
  t.eq('類型是「需達等級」、門檻也是等級：只寫一次', flagOf({ membershipType: 'tier', membershipCost: 'tier' }), '需達等級');
  t.eq('品牌會員＋需達等級：兩個都要講', flagOf({ membershipType: 'brand', membershipCost: 'tier' }), '品牌會員．需達等級');
  t.eq('品牌會員＋需消費紀錄', flagOf({ membershipType: 'brand', membershipCost: 'spend' }), '品牌會員．需消費紀錄');
  t.eq('免費加入的不多寫', flagOf({ membershipType: 'brand', membershipCost: 'free' }), '品牌會員');

  /* ===== 2. 「隱藏過期」藏了幾筆要講 ===== */
  // 示範資料本來就有幾筆過期的；數字要跟真的過期筆數一致
  const expired = () => win.eval(`OFFERS.filter(o=>o.validUntil&&dUntil(o.validUntil)<0).length`);
  win.eval(`$('#fLive').checked=true; render();`); await tick(win);
  const n0 = expired();
  t.ok('隱藏過期勾著：講出藏了幾筆（跟真的過期筆數一樣）', n0 > 0 && $('#count').textContent.includes(`（${n0} 筆已過期沒列出）`), `${n0} ${$('#count').textContent}`);
  win.eval(`$('#fLive').checked=false; render();`); await tick(win);
  t.ok('不隱藏時就不講', !/已過期/.test($('#count').textContent), $('#count').textContent);
  win.eval(`$('#fLive').checked=true; OFFERS.forEach(o=>{ if(o.validUntil&&dUntil(o.validUntil)<0) o.validUntil=null; }); render();`); await tick(win);
  t.ok('沒有過期的也不講', !/已過期/.test($('#count').textContent), $('#count').textContent);

  /* ===== 3、4. 版面（jsdom 量不到寬高，只確認規則在、而且排在會蓋掉它的那條後面） ===== */
  t.ok('地圖提示的文字有 nb-text', !!$('#mapTipBanner .nb-text'));
  const css = readRawIndex().replace(/\s+/g, ' ');
  const generic = css.indexOf('.new-banner span:not(.nb-icon){');
  const mine = css.indexOf('.new-banner span.nb-text{flex:1 1 0;min-width:0}');
  t.ok('nb-text 那條排在通用那條後面（同樣權重，後面的贏）', generic > -1 && mine > generic, `${generic} ${mine}`);
  t.ok('「來源↗」的可點範圍撐大、位置不變', /\.src a\{[^}]*padding:10px 6px;margin:-10px -6px\}/.test(css));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
