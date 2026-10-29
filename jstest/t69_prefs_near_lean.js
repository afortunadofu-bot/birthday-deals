/* v148／v149：celine 這一輪的三件

   1.「設定類的都要讓使用者保留上次設定 ex 行榜時間區間、收藏簡易版 等等」
   2.「附近功能也要可以套用到篩選」
   3.「首頁可以多個簡易版字少模式（從我的頁面切換開關）」

   這一支守的重點：
   - 設定是用一張清單統一管的，不是一個一個補（漏一個就又變成「怎麼都跳回預設」）
   - 記住的值已經不在選項裡就不要硬套（會變成空白一片）
   - 篩選條件**不**歸它管（優惠分頁那組本來就有 sxr_filters_v1 在管）
   - 地圖吃篩選的同時，一定要講出來被擋掉幾家 */
const fs = require('fs');
const path = require('path');
const { boot, makeAsserts, stubHeavy } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

(async () => {
  const t = makeAsserts('t69 設定記憶、附近吃篩選、簡易版');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  /* ================= 一、設定會記得 ================= */
  const REMEMBER = JSON.parse(win.eval('JSON.stringify(REMEMBER)'));
  t.ok('有一張統一的清單', Array.isArray(REMEMBER) && REMEMBER.length > 10);
  t.ok('清單上每個 id 在畫面上都找得到',
    REMEMBER.every((id) => !!$('#' + id)),
    REMEMBER.filter((id) => !$('#' + id)));
  ['lbPeriod', 'wlSort', 'wlCompact', 'venueCounty', 'trendDays'].forEach((id) => {
    t.ok(`記得住：${id}`, REMEMBER.includes(id));
  });
  /* 優惠分頁的篩選不歸它管——那組早就有 sxr_filters_v1 在存，
     兩邊都寫同一個控制項的話，誰後寫誰贏，會變成看運氣。 */
  ['fVerified', 'fLive', 'fReported', 'q', 'sort'].forEach((id) => {
    t.ok(`不重複管：${id}`, !REMEMBER.includes(id));
  });
  /* 審核佇列的狀態篩選記住等於把待審的藏起來 */
  t.ok('審核佇列的篩選不記', !REMEMBER.includes('fbStatusFilter'));

  // 換一個值 → 存起來
  win.localStorage.removeItem('sxr_prefs_v1');
  const lb = $('#lbPeriod');
  lb.value = [...lb.options].map((o) => o.value).find((v) => v !== lb.value);
  lb.dispatchEvent(new win.Event('change'));
  const saved = JSON.parse(win.localStorage.getItem('sxr_prefs_v1') || '{}');
  t.ok('改了就存起來', saved.lbPeriod === lb.value, saved);

  // 勾選框存的是 true/false，不是 'on'
  const cb = $('#wlCompact');
  cb.checked = true;
  cb.dispatchEvent(new win.Event('change'));
  t.ok('勾選框存布林值',
    JSON.parse(win.localStorage.getItem('sxr_prefs_v1')).wlCompact === true);

  // 套回去
  win.eval("localStorage.setItem('sxr_prefs_v1', JSON.stringify({lbPeriod:'all', wlCompact:true}));");
  $('#lbPeriod').value = ''; $('#wlCompact').checked = false;
  win.applyPref('lbPeriod'); win.applyPref('wlCompact');
  t.ok('下次進來選單是上次那個', $('#lbPeriod').value === 'all', $('#lbPeriod').value);
  t.ok('下次進來勾勾也還在', $('#wlCompact').checked === true);

  /* 記住的值已經不在選項裡（標籤被刪掉、那一年清空了）——不要硬套，
     套一個不存在的值 select 會變成空白，看起來像壞掉。 */
  win.eval("localStorage.setItem('sxr_prefs_v1', JSON.stringify({lbPeriod:'這個選項不存在'}));");
  $('#lbPeriod').value = 'all';
  win.applyPref('lbPeriod');
  t.ok('選項沒了就不要硬套', $('#lbPeriod').value === 'all', $('#lbPeriod').value);

  // localStorage 整個壞掉也不要炸
  win.eval("localStorage.setItem('sxr_prefs_v1', '{壞掉的 JSON');");
  let threw = false;
  try { win.applyPref('lbPeriod'); win.eval('loadPrefs()'); } catch (e) { threw = true; }
  t.ok('存的東西壞掉也不要炸', !threw);
  win.localStorage.removeItem('sxr_prefs_v1');

  /* ================= 二、附近也吃篩選 ================= */
  t.ok('篩選判斷抽成共用的一支', typeof win.filterPredicate === 'function');
  /* 抽出來的那支不可以把「附近自己的條件」也吃進去——地圖的點是用畫面範圍
     查出來的，跟列表用的 NEAR.byOffer 不是同一組資料。 */
  const fpSrc = win.filterPredicate.toString();
  t.ok('共用的那支不碰 NEAR.byOffer', !/NEAR\.byOffer/.test(fpSrc));
  t.ok('共用的那支不碰 wishOnly', !/wishOnly/.test(fpSrc));
  t.ok('畫地圖的點之前會先問它',
    /function paintNearPins[\s\S]{0,900}filterPredicate\(\)/.test(index), '');
  t.ok('沒通過篩選的點不畫',
    /if\(!pass\(o\)\)\{\s*filtered\+\+;\s*return;\s*\}/.test(index));
  /* 被擋掉幾家一定要講——篩選條件在另一個分頁的上面，當下不在視線裡，
     不講的話使用者只會看到點變少，以為這一區沒有店。 */
  t.ok('而且會講出被擋掉幾家',
    /篩選條件另外擋掉 \$\{filtered\} 家/.test(index));

  // 真的會擋：先關掉所有篩選，再只留一個類別
  stubHeavy(win, ['renderMyWishlist', 'renderReminders']);
  win.eval(`
    OFFERS=[{id:1,brand:'A',category:'餐廳',offer:'x',timing:'生日當月',freeTier:'discount',
             membershipType:'none',regions:[],verified:true,commentCount:0,reportCount:0,
             validUntil:null,lastUsedOn:null,transferable:'no',requiresCompanion:false},
            {id:2,brand:'B',category:'飲料',offer:'y',timing:'生日當月',freeTier:'discount',
             membershipType:'none',regions:[],verified:true,commentCount:0,reportCount:0,
             validUntil:null,lastUsedOn:null,transferable:'no',requiresCompanion:false}];
    activeCat=new Set(); $('#q').value='';
  `);
  t.ok('沒篩選的時候兩筆都過',
    win.eval('OFFERS.filter(filterPredicate()).length') === 2);
  win.eval("activeCat=new Set(['餐廳']);");
  t.ok('篩了類別就只剩一筆',
    win.eval('OFFERS.filter(filterPredicate()).length') === 1);
  win.eval("activeCat=new Set();");

  /* ================= 三、首頁簡易版 ================= */
  const lean = $('#optLeanHome');
  t.ok('開關在「版面設定」裡', !!lean && !!lean.closest('#layoutPanel'));
  t.ok('而且會被記住', REMEMBER.includes('optLeanHome'));
  t.ok('預設是關的', !lean.checked);
  t.ok('一開始 body 沒有 lean', !doc.body.classList.contains('lean'));
  lean.checked = true;
  lean.dispatchEvent(new win.Event('change'));
  t.ok('打開就加上 lean', doc.body.classList.contains('lean'));
  t.ok('打開也會記起來',
    JSON.parse(win.localStorage.getItem('sxr_prefs_v1') || '{}').optLeanHome === true);
  lean.checked = false;
  lean.dispatchEvent(new win.Event('change'));
  t.ok('關掉就拿掉', !doc.body.classList.contains('lean'));

  /* 規則：藏掉「看了放心」的，留下「不看會出事」的 */
  const leanCss = (index.match(/body\.lean \.card[\s\S]*?\{display:none\}/) || [''])[0];
  t.ok('簡易版的規則寫在一起', !!leanCss);
  ['.meta', '.kv', '.src', '.flag.hide-lean'].forEach((sel) => {
    t.ok(`簡易版藏掉 ${sel}`, leanCss.includes(sel), leanCss);
  });
  t.ok('警告那幾行留著（剩 N 天、提前天數未知）', /\.line:not\(\.warn\)/.test(leanCss), leanCss);
  t.ok('附近的距離也留著（開附近時那就是重點）', /:not\(\.near-line\)/.test(leanCss), leanCss);

  /* 卡片上哪幾個標籤被標成「可以藏」——「未查證」「需同行」不可以被藏掉 */
  const card = index.slice(index.indexOf('function offerCardHtml'),
    index.indexOf('function offerCardHtml') + 3500);
  /* 「已查證」跟「未查證」寫在同一行（三元運算），所以要看那一個 <span>
     自己的 class，不能看整行有沒有 hide-lean。 */
  const flagClass = (txt) => {
    const m = card.match(new RegExp('<span class="(flag[^"]*)"[^>]*>[^<]*' + txt));
    return m ? m[1] : null;
  };
  ['已查證', '已用 ', '★ '].forEach((txt) => {
    const c = flagClass(txt);
    t.ok(`「${txt.trim()}」簡易版可以藏`, !!c && c.includes('hide-lean'), c);
  });
  ['未查證', '需同行'].forEach((txt) => {
    const c = flagClass(txt);
    t.ok(`「${txt}」簡易版還是要看得到`, !!c && !c.includes('hide-lean'), c);
  });

  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
