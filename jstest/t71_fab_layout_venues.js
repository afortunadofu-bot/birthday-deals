/* v152：celine 看完 v151 之後的四件

   「track.js 跟 vendor/supabase.min.js 線上還是 404」
   「版面設定往上移，現在的地方太冷們了」
   「投稿按鈕多一點，要一按進去首頁就能投稿，例如懸浮原點」
   「一趟最多目前沒顯示，也沒投稿」

   這一支最在意的：
   - 版面設定搬位置，**存檔裡也要搬**，不然老使用者什麼都不會變
   - 而且只搬一次：自己搬回去的人不要下次開站又被拉走
   - 懸浮按鈕只在「在看東西」的那幾頁，而且不能疊在「回到最上方」上面
   - 「空的」要分得出是「還沒整理」還是「這個縣市沒有」 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, stubHeavy } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  const t = makeAsserts('t71 懸浮投稿鈕、版面設定上移、一趟用最多的空狀態');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  /* ============ 一、SDK：本站那一份有兩個可能的位置 ============
     線上實測：/supabase.min.js 是 200、/vendor/supabase.min.js 是 404，
     兩邊同樣 218,199 bytes——檔案傳上去了，只是資料夾那一層被攤平了。
     與其要求每次上傳都記得建資料夾，不如兩個位置都找一次。 */
  const tried = [];
  win.eval(`window.__tried=[];
    loadScriptTag=(u)=>{ window.__tried.push(u);
      if(u==='supabase.min.js') window.supabase={createClient:()=>({})};
      return Promise.resolve(); };
    delete window.supabase;`);
  await win.eval('loadSupabaseSdk()');
  tried.push(...JSON.parse(win.eval('JSON.stringify(window.__tried)')));
  t.eq('先找 vendor/ 那一份', tried[0], 'vendor/supabase.min.js');
  t.eq('沒有就找根目錄那一份', tried[1], 'supabase.min.js');
  t.ok('找到就不去 CDN 了', !tried.some((u) => /^https?:/.test(u)), tried.join(' '));
  t.eq('而且算「本站」，不是 CDN', win.eval('SDK_FROM'), '本站');

  /* sw.js：addAll 是全有全無的，清單裡有一個 404 就一個都不會被快取——
     原本後面還接 .catch(()=>{})，所以連失敗都看不出來。 */
  const sw = read('sw.js');
  t.ok('離線快取換版本了（不換的話舊的空快取不會被丟掉）', /shouxing-v8/.test(sw));
  t.ok('不再呼叫 addAll（註解裡講原因的那幾個字不算）', !/\.addAll\(/.test(sw));
  t.ok('一個一個加，單獨吃掉失敗', /\.map\(a => c\.add\(a\)\.catch\(\(\) => \{\}\)\)/.test(sw));
  t.ok('兩個位置都列', /'\.\/vendor\/supabase\.min\.js', '\.\/supabase\.min\.js'/.test(sw));
  t.ok('index.html 這種一定要有的沒被降級成「有就好」',
    /const ASSETS = \['\.\/', '\.\/index\.html'/.test(sw));

  /* ================= 二、版面設定往上移 ================= */
  const mineIds = () => [...doc.querySelectorAll('#tab-mine .wrap > [data-block]')].map((e) => e.id);
  let ids = mineIds();
  t.eq('版面設定就排在「個人資料」後面',
    ids.indexOf('layoutPanel'), ids.indexOf('profilePanel') + 1, ids.slice(0, 6).join(','));
  t.ok('不再是倒數幾塊', ids.indexOf('layoutPanel') < 5, ids.indexOf('layoutPanel'));

  /* 存檔優先（blkDesired），所以光改 HTML 的話**用過這個網站的人完全不會變**。
     搬一次存檔，然後記旗標。 */
  const KEY = 'sxr_order_mine', FLAG = 'sxr_order_moved_v152';
  const migrate = (saved) => {
    win.localStorage.removeItem(FLAG);
    if (saved === null) win.localStorage.removeItem(KEY);
    else win.localStorage.setItem(KEY, JSON.stringify(saved));
    win.eval('moveLayoutPanelOnce()');
    const v = win.localStorage.getItem(KEY);
    return v ? JSON.parse(v) : null;
  };
  let out = migrate(['profilePanel', 'shareSitePanel', 'wishlistPanel', 'devIntroPanel', 'layoutPanel']);
  t.eq('舊存檔也被搬到「個人資料」後面',
    out, ['profilePanel', 'layoutPanel', 'shareSitePanel', 'wishlistPanel', 'devIntroPanel']);
  t.eq('做完記旗標', win.localStorage.getItem(FLAG), '1');

  // 只搬一次：自己搬回去的人，下次開站要留在自己搬的地方
  win.localStorage.setItem(KEY, JSON.stringify(['profilePanel', 'shareSitePanel', 'layoutPanel']));
  win.eval('moveLayoutPanelOnce()');
  t.eq('第二次開站不再動它',
    JSON.parse(win.localStorage.getItem(KEY)), ['profilePanel', 'shareSitePanel', 'layoutPanel']);

  // 沒存過順序的人：不要無中生有一份存檔，HTML 的新位置本來就會生效
  t.eq('沒存過順序就什麼都不寫', migrate(null), null);
  // 存檔裡根本沒有這一塊（更早的版本存的）：也不要硬塞
  out = migrate(['profilePanel', 'shareSitePanel']);
  t.eq('存檔裡沒有版面設定就不動', out, ['profilePanel', 'shareSitePanel']);
  // profilePanel 不在存檔裡：排到最前面，總之不要又掉到最後
  out = migrate(['wishlistPanel', 'devIntroPanel', 'layoutPanel']);
  t.eq('沒有「個人資料」可以靠的話就排第一',
    out, ['layoutPanel', 'wishlistPanel', 'devIntroPanel']);
  win.localStorage.removeItem(KEY);

  t.ok('簡易版的開關也跟著搬（它就住在這一塊裡）',
    $('#layoutPanel').contains($('#optLeanHome')));

  /* ================= 三、投稿的懸浮按鈕 ================= */
  const fab = $('#btnFabSubmit');
  t.ok('有這顆', !!fab);
  t.ok('寫得出它是什麼，不是一顆光禿禿的「＋」', /投稿/.test(fab.textContent));
  t.ok('螢幕閱讀器念得出來', /投稿/.test(fab.getAttribute('aria-label') || ''));

  stubHeavy(win, ['render', 'renderMyWishlist', 'renderReminders', 'loadOffers',
    'loadPendingBadge', 'renderAvatarEditor', 'renderPlanner', 'loadBoard',
    'loadVenues', 'loadMyTab', 'maybeShowBirthdayCheer']);
  const shown = (tab) => { win.eval(`showSection('${tab}')`); return fab.classList.contains('show'); };
  ['browse', 'board', 'trip'].forEach((tab) =>
    t.ok(`「在看東西」的 ${tab} 看得到`, shown(tab)));
  t.ok('「我的」看不到（那一頁自己已經有一顆）', !shown('mine'));
  t.ok('「新增」看不到（人就站在投稿頁上）', !shown('submit'));
  t.ok('「審核」看不到（那是在處理別人的投稿）', !shown('admin'));

  win.eval("showSection('browse')");
  t.ok('顯示時 body 會標記起來', win.document.body.classList.contains('has-fab'));
  win.eval("showSection('mine')");
  t.ok('收起來時標記也拿掉', !win.document.body.classList.contains('has-fab'));
  /* 兩顆都釘在右下角同一條線上，所以「回到最上方」要往上讓一格。
     42（按鈕高）+ 8（間距）+ 16（原本的底距）= 66。 */
  t.ok('「回到最上方」會讓位，不是疊在一起',
    /body\.has-fab #btnToTop\{bottom:calc\(66px \+ var\(--tabbar-h\)/.test(index));
  t.ok('沒登入也看得到（投稿頁自己有登入提示）',
    !/btnFabSubmit[\s\S]{0,400}authed-only/.test(index) && !fab.classList.contains('authed-only'));

  // 回去的那顆要回到「剛剛站在哪一頁」，而且字要對
  const backFrom = (tab) => {
    win.eval(`showSection('${tab}'); goSubmit('fab');`);
    return [win.eval('SUBMIT_FROM'), $('#btnSubmitBack').textContent];
  };
  t.eq('從排行程投稿，回得去排行程', backFrom('trip'), ['trip', '← 回排行程']);
  t.eq('從排行榜投稿，回得去排行榜', backFrom('board'), ['board', '← 回排行榜']);
  /* 本來那顆上面永遠寫著「← 回優惠清單」，從「我的」按進來也一樣——
     字是錯的，按下去還真的會被丟到別頁。 */
  t.eq('從「我的」投稿，回得去「我的」', backFrom('mine'), ['mine', '← 回「我的」']);
  win.eval("showSection('browse'); goSubmit('list_bottom');");
  t.eq('優惠清單底下那顆照舊', win.eval('SUBMIT_FROM'), 'browse');
  t.ok('按下去真的到投稿頁', !$('#tab-submit').classList.contains('hidden'));

  /* ================= 四、一趟用最多：空的時候 ================= */
  win.eval("myProfile=null; VENUES=[]; document.querySelector('#venueCounty').value=''; renderVenues();");
  const vtxt = () => $('#venueList').textContent.trim();
  /* venues 預設 is_public=false（館名是從座標猜的，要人確認過才上架），
     所以「v142 跑完了，清單還是空的」是正常狀態，不是壞掉。 */
  t.ok('一筆都還沒公開：說還在整理，不是說「這個縣市沒有」',
    /還在整理中/.test(vtxt()) && !/這個縣市/.test(vtxt()), vtxt());
  t.ok('一般人看不到資料庫的事', !/is_public|schema_v142/.test(vtxt()), vtxt());
  win.eval('myProfile={is_admin:true}; renderVenues();');
  t.ok('管理員看得到差哪一步', /is_public = true/.test(vtxt()), vtxt());
  t.ok('而且講得出是哪一支 SQL', /schema_v142_venues\.sql/.test(vtxt()));

  // 有資料、只是這個縣市沒有：那才是「這個縣市還沒有」
  win.eval(`myProfile=null;
    VENUES=[{id:1,name:'新竹巨城',county:'新竹市',offer_count:31}];
    const s=document.querySelector('#venueCounty');
    s.innerHTML='<option value=""></option><option value="台北市">台北市</option>';
    s.value='台北市'; renderVenues();`);
  t.ok('講的是哪一個縣市，不是泛泛的一句', /「台北市」還沒有/.test(vtxt()), vtxt());
  t.ok('給一條出路', !!$('#btnVenueAll'));
  $('#btnVenueAll').click();
  t.eq('按了就看全部', win.eval("document.querySelector('#venueCounty').value"), '');
  t.ok('全部縣市就看得到那一筆了', /新竹巨城/.test(vtxt()), vtxt());
  t.eq('而且記住了（下次打開不用再切一次）',
    win.eval("JSON.stringify(loadPrefs().venueCounty)"), '""');

  /* 投稿一個地點要的是座標（venues 有 lat／lng／radius_m），不是表單填得出來的，
     所以走「先告訴我們是哪裡」這條路——用現成的功能建議，不等新表單。 */
  t.ok('有投稿的入口', !!$('#btnVenueSuggest'));
  win.eval("document.querySelector('#btnVenueSuggest').click()");
  t.ok('開的是功能建議', $('#dlgFeedback').open && $('#fbType').value === 'suggestion');
  const msg = $('#fbMsg').value;
  t.ok('要問的四件事先列好', /地點/.test(msg) && /縣市/.test(msg) && /哪幾家/.test(msg), msg);
  t.ok('標題也跟著換成「功能建議」', /功能建議/.test($('#fbDlgTitle').textContent));
  $('#dlgFeedback').close();

  /* 功能統計那張表要看得懂這兩個新事件，不然會印出英文代號 */
  t.ok('「推薦一個地點」在對照表裡', /venue_suggest:'推薦一個/.test(index));
  t.ok('「開始投稿」本來就在', /go_submit:'開始投稿'/.test(index));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
