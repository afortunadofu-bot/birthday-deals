/* 小數據所頁尾、輸入地點定位、手機打中文搜尋會「無結果」、logo 小彩蛋

   1. 頁尾加上小數據所的署名（BRAND.md 的「署名層」）：點陣標誌的點位固定、
      tagline、一句話定位、三個產品、年份
   2.「多一個可以輸入地點開地圖定位的功能」：輸入地名 → 查 OSM Nominatim → 換中心點
   3.「手機介面輸入搜尋的時候常常顯示無結果」：注音選字中途就拿去比對了，
      要等 compositionend 再比對
   4. 小彩蛋：連點 logo 五下放生日動畫（刻意不寫進更新紀錄，所以這裡也順便確認沒寫） */
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t22 品牌頁尾＋地點＋輸入法');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];

  /* ================= 1. 小數據所頁尾 ================= */
  const foot = $('.xsj-footer');
  t.ok('頁尾有小數據所這一塊', !!foot);
  t.ok('品牌名與 tagline', /小數據所/.test(foot.textContent) && /日子有數/.test(foot.textContent));
  t.ok('一句話定位', /把沒人在記的生活，變成你看得懂的數據。/.test(foot.textContent));
  // 點陣標誌：BRAND.md 明講點位固定不要改
  //   . W . A / W A . . / . . A W / A . W .
  const dots = $$('.xsj-mark i').map((i) => (i.classList.contains('hi') ? 'A' : i.classList.contains('on') ? 'W' : '.'));
  t.eq('點陣標誌的點位跟品牌規範一樣', dots.join(''), '.W.A' + 'WA..' + '..AW' + 'A.W.');
  const apps = () => $$('.xsj-apps a').map((x) => [x.textContent.trim(), x.getAttribute('href')]);
  t.eq('列出三個產品', apps().map((x) => x[0]),
    ['壽星日', 'Bandary 聽團曆 · Google Play', 'RelateStats · Google Play']);
  t.eq('壽星日標成目前這一站', $('.xsj-apps [aria-current="page"]').textContent.trim(), '壽星日');
  // 2026-10-15 上架了，另外兩個從封測報名表換成 Google Play 的上架頁
  t.eq('Bandary 連到 Google Play', apps()[1][1],
    'https://play.google.com/store/apps/details?id=com.bandary.app');
  t.eq('RelateStats 連到 Google Play', apps()[2][1],
    'https://play.google.com/store/apps/details?id=com.relatestats.app');
  t.ok('不要還留著舊的報名表連結', !/forms\.gle/.test($('.xsj-apps').innerHTML));
  t.ok('外部連結都開新分頁且加了 noopener',
    $$('.xsj-apps a[href^="https://play.google.com"]').every((a) => a.target === '_blank' && /noopener/.test(a.rel)));
  t.eq('年份是今年', $('#xsjYear').textContent, String(new Date().getFullYear()));

  /* ================= 1.5 「我的」看得到自己回報過的問題（v73）================= */
  const { makeSb } = require('./harness');
  const fbRows = [
    { id: 2, type: 'bug', message: '地圖不見了', status: 'in_progress', admin_reply: null, created_at: '2026-09-28T02:00:00Z' },
    { id: 1, type: 'suggestion', message: '希望有搜尋欄', status: 'resolved', admin_reply: '已經加上去了，謝謝！', created_at: '2026-09-20T02:00:00Z' },
  ];
  const sbFb = makeSb({ tables: { site_feedback: fbRows } });
  win.__sb = sbFb;
  win.eval('sb = window.__sb; LIVE = true; me = {id:"u-1"}; myProfile = {id:"u-1"};');
  await win.loadMyFeedback();
  await tick(win, 3);
  const fbPanel = $('#myFeedbackPanel');
  t.ok('有回報過就出現這一塊', !fbPanel.classList.contains('hidden'));
  t.eq('標題旁標幾筆', $('#myFbCount').textContent, '2');
  t.ok('查的是自己那幾筆', sbFb.__calls.select.some((c) => c.table === 'site_feedback'));
  const fbText = $('#myFeedback').textContent;
  t.ok('看得到內容跟狀態', /地圖不見了/.test(fbText) && /修改中/.test(fbText), fbText);
  t.ok('看得到管理員的回覆', /已經加上去了/.test(fbText));
  t.ok('看得到是問題回報還是建議', /問題回報/.test(fbText) && /建議/.test(fbText));

  // 沒回報過就不要佔一塊版面
  win.__sb = makeSb({ tables: { site_feedback: [] } });
  win.eval('sb = window.__sb;');
  await win.loadMyFeedback();
  t.ok('沒回報過就不顯示', fbPanel.classList.contains('hidden'));

  // v73 還沒跑（讀不到）：收起來就好，不要在「我的」放一塊紅字錯誤
  const sbErr = makeSb({});
  sbErr.from = () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: null, error: { message: 'permission denied for table site_feedback' } }) }) }) }) });
  win.__sb = sbErr; win.eval('sb = window.__sb;');
  await win.loadMyFeedback();
  t.ok('v73 沒跑時安靜收起來', fbPanel.classList.contains('hidden'));

  // 沒登入也不顯示
  win.eval('me = null;');
  await win.loadMyFeedback();
  t.ok('沒登入不顯示', fbPanel.classList.contains('hidden'));
  win.eval('LIVE = false; me = null;');

  /* ================= 2. 手機打中文搜尋 ================= */
  let renders = 0;
  win.render = () => { renders += 1; };
  const q = $('#q');
  const ev = (type) => q.dispatchEvent(new win.Event(type));
  q.value = 'ㄇ'; ev('compositionstart'); ev('input');
  q.value = 'ㄇㄞ'; ev('input');
  await new Promise((r) => win.setTimeout(r, 300));
  t.eq('還在選字時不要拿半成品去比對', renders, 0);
  q.value = '麥當勞'; ev('compositionend');
  await new Promise((r) => win.setTimeout(r, 300));
  t.ok('選完字才比對一次', renders >= 1, renders);
  // 英數字（不會觸發 composition）照原本的 debounce 走
  renders = 0;
  q.value = 'star'; ev('input');
  await new Promise((r) => win.setTimeout(r, 300));
  t.ok('打英數字照樣即時搜尋', renders >= 1, renders);

  // 待辦清單的搜尋欄同一套
  let wlRenders = 0;
  win.renderWishlistBody = () => { wlRenders += 1; };
  const wq = $('#wlSearch');
  wq.value = 'ㄇ'; wq.dispatchEvent(new win.Event('compositionstart')); wq.dispatchEvent(new win.Event('input'));
  t.eq('待辦清單搜尋也不會在選字中途比對', wlRenders, 0);
  wq.dispatchEvent(new win.Event('compositionend'));
  t.eq('選完字才比對', wlRenders, 1);

  /* ================= 3. 輸入地點，把地圖定位過去 ================= */
  t.ok('「換地點」預設收著', $('#nearPlaceWrap').classList.contains('hidden'));
  $('#btnNearPlace').click();
  t.ok('按了才展開', !$('#nearPlaceWrap').classList.contains('hidden'));
  t.eq('按鈕變成「收起」', $('#btnNearPlace').textContent, '收起');

  const calls = [];
  let reply = [];
  win.fetch = (url) => { calls.push(String(url)); return Promise.resolve({ ok: true, json: () => Promise.resolve(reply) }); };
  const centers = [];
  win.setNearCenter = async (lat, lng, label) => { centers.push([lat, lng, label]); };

  // 沒打字就按：不要打 API
  $('#btnNearPlaceGo').click();
  await tick(win, 3);
  t.eq('沒輸入就不查', calls.length, 0);

  // 只找到一個 → 直接用
  reply = [{ lat: '25.0478', lon: '121.5170', display_name: '臺北車站, 中正區, 臺北市, 臺灣' }];
  $('#nearPlaceQ').value = '台北車站';
  $('#btnNearPlaceGo').click();
  await tick(win, 4);
  t.ok('查的是 OSM 的地名服務、限定台灣、帶了關鍵字',
    /nominatim\.openstreetmap\.org/.test(calls[0]) && /countrycodes=tw/.test(calls[0])
    && /q=%E5%8F%B0%E5%8C%97%E8%BB%8A%E7%AB%99/.test(calls[0]), calls[0]);
  t.eq('只有一個結果就直接換中心點', centers[0], [25.0478, 121.5170, '臺北車站']);
  t.ok('告訴使用者換去哪了', /已經改成查「臺北車站」附近/.test($('#nearPlaceMsg').textContent), $('#nearPlaceMsg').textContent);

  // 找到好幾個 → 列出來讓人選
  reply = [
    { lat: '25.1', lon: '121.5', display_name: '市府路, 信義區, 臺北市, 臺灣' },
    { lat: '24.1', lon: '120.6', display_name: '市府路, 西區, 臺中市, 臺灣' },
  ];
  $('#nearPlaceQ').value = '市府路';
  $('#nearPlaceQ').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter' }));
  await tick(win, 4);
  const hits = () => $$('#nearPlaceHits .near-place-hit');
  t.eq('有好幾個地方就列出來', hits().length, 2);
  t.ok('每一個都看得到完整地址', /臺中市/.test(hits()[1].textContent));
  hits()[1].click();
  await tick(win, 3);
  t.eq('點了才換中心點', centers[1], [24.1, 120.6, '市府路']);
  t.eq('選完收起清單', hits().length, 0);

  // 查不到
  reply = [];
  $('#nearPlaceQ').value = '不存在的地方';
  $('#btnNearPlaceGo').click();
  await tick(win, 4);
  t.ok('查不到講人話', /找不到「不存在的地方」/.test($('#nearPlaceMsg').textContent), $('#nearPlaceMsg').textContent);

  // 服務壞掉
  win.fetch = () => Promise.reject(new Error('offline'));
  $('#nearPlaceQ').value = '台北車站';
  $('#btnNearPlaceGo').click();
  await tick(win, 4);
  t.ok('服務壞掉時給備案（自己在地圖上點）', /也可以直接在地圖上點一個位置/.test($('#nearPlaceMsg').textContent),
    $('#nearPlaceMsg').textContent);

  /* ================= 4. logo 小彩蛋 ================= */
  win.localStorage.removeItem(`sxr_bday_cheer_today_${new Date().getFullYear()}`);
  $('#bmonth').value = ''; $('#bday').value = '';   // 沒填生日也要放得出來
  // celine：「生日卡片動畫跳不出來」——五下太多（手指比字大，常常有一兩下落在字的
  // 外框外面就不算數），改成三下；pointerdown 之外再補一條 click 的路
  const tapLogo = () => $('.brand').dispatchEvent(new win.Event('pointerdown', { bubbles: true }));
  const clickLogo = () => $('.brand').dispatchEvent(new win.Event('click', { bubbles: true }));
  for (let i = 0; i < 2; i++) tapLogo();
  t.ok('點兩下還沒反應', $('#bdayCheer').classList.contains('hidden'));
  tapLogo();
  t.ok('連點三下放生日動畫', !$('#bdayCheer').classList.contains('hidden'));
  t.ok('彩蛋不佔用「今年已經跳過了」的紀錄（真的生日那天還是要跳）',
    !win.localStorage.getItem(`sxr_bday_cheer_today_${new Date().getFullYear()}`));
  win.closeBdayCheer();

  // 同一下的 pointerdown＋隨後的 click 不能被算成兩下
  win.eval('LOGO_TAPS = 0;');
  tapLogo(); clickLogo();
  tapLogo(); clickLogo();
  t.ok('一下不會被算成兩下', $('#bdayCheer').classList.contains('hidden'));
  tapLogo();
  t.ok('第三下才跳', !$('#bdayCheer').classList.contains('hidden'));
  win.closeBdayCheer();
  // 不送 pointerdown 的瀏覽器（舊 iOS Safari 等）只有 click，也要算得到
  win.eval('LOGO_TAPS = 0; lastLogoPointer = 0;');
  for (let i = 0; i < 3; i++) clickLogo();
  t.ok('只有 click 的瀏覽器也放得出來', !$('#bdayCheer').classList.contains('hidden'));
  win.closeBdayCheer();

  // 這是彩蛋，不要寫在更新紀錄裡（嵐特別交代）
  const updates = win.eval('SITE_UPDATES').map((u) => u.title + u.items.join('')).join('');
  t.ok('更新紀錄裡沒有提到彩蛋', !/彩蛋|連點|logo/i.test(updates));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
