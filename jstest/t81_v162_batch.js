/* v162：celine 10-30 那一批

   「幫別人記生日跟成就徽章往下移，使用回報要往上移，而且要比投稿左邊」
   「一趟用最多的縣市由北排到南」
   「不要直接一件全部加入，是可以勾選那種」
   「地圖位置有些舊的幫我全部更新，有些店家不在地圖裡」
   「剛剛的更新紀錄動畫要可以按快轉或跳過，至少維持一周都會跳出來，然後最後要引導
     說對更新內容細節有興趣可以看更新紀錄（顯示更新紀錄的位置）」
   「生日當天最省行程、免費一路拿拿拿……我希望它作為預設的出現在大家的行程那裏當範例」
   「自動上架包含修改建議也能自動改」 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, stubHeavy } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sql = fs.readFileSync(path.join(__dirname, '..', 'schema_v162_venues_examples_autoedit.sql'), 'utf8');
const root = (f) => path.join(__dirname, '..', f);

(async () => {
  const t = makeAsserts('t81 v162：順序、勾選、地圖、更新動畫、範例、自動套用');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];
  stubHeavy(win, ['render', 'loadOffers', 'loadMyVenueSuggestions', 'loadPendingBadge',
    'maybeShowBirthdayCheer', 'openDetail', 'renderMyWishlist', 'renderReminders', 'paintNearPins']);

  /* ================= 一、「我的」的順序 ================= */
  const blocks = win.eval("blkList('mine').map(el=>el.id)");
  const at = (id) => blocks.indexOf(id);
  t.ok('我送出過的往上：緊接在註冊死線後面', at('myRecordsPanel') === at('planner') + 1, blocks.join(','));
  t.ok('幫家人記生日、成就徽章往下：在關於壽星日前面', at('altBdayPanel') < at('aboutSitePanel')
    && at('badgesPanel') < at('aboutSitePanel') && at('altBdayPanel') > at('feedbackPanel'), blocks.join(','));
  t.eq('使用回報排在投稿左邊', $$('#myRecordsPanel .rec-tab').map((b) => b.dataset.rec), ['Reports', 'Offers', 'Feedback']);
  t.ok('預設打開的是使用回報', $('#recReports').classList.contains('on'));

  // 自己排過順序的人：存檔也搬一次，只搬一次
  const KEY = 'sxr_order_mine', FLAG = 'sxr_order_moved_v162';
  const migrate = (saved) => {
    win.localStorage.removeItem(FLAG);
    win.localStorage.setItem(KEY, JSON.stringify(saved));
    win.eval('moveBlocksV162Once()');
    return JSON.parse(win.localStorage.getItem(KEY));
  };
  t.eq('存檔：我送出過的搬到註冊死線後面，生日跟徽章搬到關於前面',
    migrate(['profilePanel', 'altBdayPanel', 'wishlistPanel', 'planner', 'badgesPanel', 'feedbackPanel', 'myRecordsPanel', 'aboutSitePanel']),
    ['profilePanel', 'wishlistPanel', 'planner', 'myRecordsPanel', 'feedbackPanel', 'altBdayPanel', 'badgesPanel', 'aboutSitePanel']);
  win.localStorage.setItem(KEY, JSON.stringify(['altBdayPanel', 'myRecordsPanel']));
  win.eval('moveBlocksV162Once()');
  t.eq('只搬一次：之後自己搬的不會又被拉回來', JSON.parse(win.localStorage.getItem(KEY)), ['altBdayPanel', 'myRecordsPanel']);
  t.eq('沒有關於壽星日的存檔：接在最後', migrate(['badgesPanel', 'profilePanel']), ['profilePanel', 'badgesPanel']);
  win.localStorage.removeItem(KEY);

  /* ================= 二、縣市由北排到南 ================= */
  win.eval(`LIVE=true; me=null; myProfile=null;
    OFFERS=[{id:1,brand:'甲',offer:'買一送一'},{id:2,brand:'乙',offer:'送蛋糕'},{id:3,brand:'丙',offer:'八五折'}];
    WISH=new Set(['3']); MY_USED_OFFER_IDS=new Set();
    VENUE_PAIRS=null; VENUE_PAIRS_TRIED=true;
    sb={ from:(tb)=>({ select:()=>({ order:()=>({ limit:()=>Promise.resolve({data:[
        {id:1,name:'高雄夢時代',county:'高雄市',lat:22.59,lng:120.30,radius_m:180,offer_count:39},
        {id:2,name:'宜蘭新月',county:'宜蘭縣',lat:24.75,lng:121.75,radius_m:180,offer_count:19},
        {id:3,name:'台北京站',county:'台北市',lat:25.04,lng:121.51,radius_m:180,offer_count:34},
        {id:4,name:'新竹巨城',county:'新竹市',lat:24.80,lng:120.97,radius_m:180,offer_count:38}], error:null}) }) }) }),
        rpc:(fn)=>Promise.resolve(fn==='venue_offer_ids'?{data:[{venue_offer_ids:1},{venue_offer_ids:2},{venue_offer_ids:3}],error:null}:{data:[],error:null}) };`);
  await win.eval('loadVenues()');
  t.eq('縣市選單由北到南（東部排在西部後面）',
    $$('#venueCounty option').map((o) => o.value).filter(Boolean), ['台北市', '新竹市', '高雄市', '宜蘭縣']);

  /* ================= 三、商圈的店：清單上直接打勾 ================= */
  win.eval('VENUE_OPEN=1; renderVenues();');
  await tick(win, 4);
  const btn = () => $('#venueBulk1');
  t.ok('沒有「一鍵加入（N 筆）」那種看起來會全部加的按鈕', !/一鍵加入待辦清單（/.test($('#venueBody1').textContent));
  t.ok('一筆都沒勾：「加入勾選的」按不下去', btn().disabled);
  const cb = (oid) => $(`#venueBody1 [data-vpick="${oid}"]`);
  t.ok('已經收藏的勾著、不能取消', cb('3').checked && cb('3').disabled);
  cb('1').checked = true; cb('1').dispatchEvent(new win.Event('change'));
  t.ok('勾一筆：按得下去，寫出幾筆', !btn().disabled && /1 筆/.test(btn().textContent), btn().textContent);
  win.eval("document.querySelector('#venueAll1').click()");
  t.ok('全選：只勾還沒收藏的那兩筆', cb('1').checked && cb('2').checked && /2 筆/.test(btn().textContent));
  t.eq('全選之後按鈕變成「全部取消」', $('#venueAll1').textContent, '全部取消');
  win.eval("document.querySelector('#venueAll1').click()");
  t.ok('全部取消', !cb('1').checked && !cb('2').checked && btn().disabled);
  cb('2').checked = true; cb('2').dispatchEvent(new win.Event('change'));
  win.eval("window.__added=null; wishAddMany=(ids)=>{ window.__added=ids; ids.forEach(i=>WISH.add(String(i))); return Promise.resolve(true); };");
  win.eval("document.querySelector('#venueBulk1').click()");
  await tick(win, 4);
  t.eq('只加勾起來的那一筆', JSON.parse(win.eval('JSON.stringify(window.__added)')), ['2']);
  t.ok('加完之後那一筆變成已收藏', /已收藏/.test($('#venueBody1').textContent) && cb('2').disabled);
  t.ok('點店名還是看詳情（勾勾跟店名分開）', !!$('#venueBody1 .vo-open'));

  /* ================= 四、地圖 ================= */
  /* jsdom 跑不了 Leaflet，地圖本身在瀏覽器裡看過（LaLaport：16＋5＋2 顆＝23 家） */
  t.ok('小地圖縮放到整個圈都放得進去', /m\.fitBounds\(ring\.getBounds\(\)/.test(index));
  t.ok('同一個位置的店併成一顆、寫幾家', /const key=st\.lat\.toFixed\(4\)\+','\+st\.lng\.toFixed\(4\)/.test(index)
    && /這裡有 \$\{g\.rows\.length\} 家/.test(index));
  t.ok('併起來的那顆裡面每一家都有「看優惠」', /querySelectorAll\('\.map-open-offer'\)/.test(index));
  t.ok('SQL：商圈中心往分店集中的地方移（四輪）', /for i in 1\.\.4 loop/.test(sql) && /avg\(s\.lat\)/.test(sql));
  t.ok('SQL：少於 3 家分店的不動', /having count\(\*\) >= 3/.test(sql));
  t.ok('SQL：跑完列出每個移了幾公尺', /"中心移了幾公尺"/.test(sql));

  /* ================= 五、更新動畫 ================= */
  const done = () => win.localStorage.getItem('sxr_whatsnew_v162');
  win.eval("whatsNewActive=()=>true;");
  win.localStorage.removeItem('sxr_whatsnew_v162');
  doc.querySelectorAll('dialog').forEach((d) => d.close());
  t.ok('那一週、還沒看過：跳出來', win.eval('maybeShowWhatsNew()') === true && $('#dlgWhatsNew').open);
  t.eq('第一張', $('#wnCount').textContent, '1 / 10');
  t.eq('圖片打開才載（平常不吃流量）', $('#wnShot').getAttribute('src'), 'whatsnew-01.jpg');
  t.eq('上面一排進度條，一張一格', $$('#wnBars i').length, 10);
  t.ok('第一張沒有「上一張」', $('#btnWnPrev').disabled);
  win.eval("document.querySelector('#btnWnNext').click()");
  t.eq('快轉：下一張', $('#wnCount').textContent, '2 / 10');
  win.eval("document.querySelector('#btnWnHitNext').click()");
  t.eq('點畫面右半邊也是下一張', $('#wnCount').textContent, '3 / 10');
  win.eval("document.querySelector('#btnWnHitPrev').click()");
  t.eq('左半邊回上一張', $('#wnCount').textContent, '2 / 10');
  t.ok('自己會往下播', /WN_TIMER=setTimeout\(\(\)=>showWhatsNewScene\(WN_AT\+1\), WHATSNEW\.dur\)/.test(index));

  win.eval("document.querySelector('#btnWnSkip').click()");
  t.ok('跳過：關掉', !$('#dlgWhatsNew').open);
  t.eq('跳過：記下來', done(), 'skip');
  t.ok('跳過之後不再跳', win.eval('maybeShowWhatsNew()') === false && !$('#dlgWhatsNew').open);

  win.localStorage.removeItem('sxr_whatsnew_v162');
  win.eval("whatsNewActive=()=>false;");
  t.ok('過了那一週：不跳', win.eval('maybeShowWhatsNew()') === false);
  win.eval("whatsNewActive=()=>true;");
  win.eval("document.querySelector('#dlgCoffee').showModal();");
  t.ok('別的視窗開著：不疊上去', win.eval('maybeShowWhatsNew()') === false);
  win.eval("document.querySelector('#dlgCoffee').close();");
  t.ok('開場：跳了動畫就不再問定位、不跳更新通知',
    /if\(maybeShowWhatsNew\(\)\) return;\s*await maybeAskLocation\(\);/.test(index));

  // 最後一張：更新紀錄在哪裡＋帶我去看
  win.eval("maybeShowWhatsNew(); showWhatsNewScene(9);");
  t.eq('最後一張', $('#wnCount').textContent, '10 / 10');
  t.ok('講出更新紀錄在哪裡', /「我的」→「關於壽星日」→「更新紀錄」/.test($('#wnD').textContent));
  t.eq('按鈕變成「帶我去看更新紀錄」', $('#btnWnNext').textContent, '帶我去看更新紀錄');
  t.eq('「跳過」變成「關閉」', $('#btnWnSkip').textContent, '關閉');
  t.ok('最後一張停住，不自己關', /if\(!sc\.last && !WN_PAUSED\) WN_TIMER/.test(index));
  win.eval("document.querySelector('#btnWnNext').click()");
  await tick(win, 2);
  t.ok('帶我去看：切到「我的」', win.eval('ACTIVE_TAB') === 'mine' && !$('#dlgWhatsNew').open);
  t.ok('而且「關於壽星日」是打開的', !$('#siteUpdatesPanel').closest('.panel').classList.contains('collapsed'));
  t.eq('看到最後算看完', done(), 'done');

  // 用返回鍵關掉也算「不想看」
  win.localStorage.removeItem('sxr_whatsnew_v162');
  win.eval('maybeShowWhatsNew()');
  win.history.back();
  await new Promise((r) => setTimeout(r, 400));
  t.ok('返回鍵關得掉', !$('#dlgWhatsNew').open);
  // harness 的 close() 不會發 close 事件（真的瀏覽器會），這裡補發
  $('#dlgWhatsNew').dispatchEvent(new win.Event('close'));
  t.eq('返回鍵關掉也記下來，下次不再跳', done(), 'back');

  t.ok('錯過的人：更新紀錄那裡可以重看', !!$('#btnWnReplay') && !$('#btnWnReplay').closest('#tab-mine') === false);
  for (let i = 1; i <= 10; i++) {
    const f = `whatsnew-${String(i).padStart(2, '0')}.jpg`;
    t.ok(`${f} 在網站根目錄（不放子資料夾：上次 vendor/ 被攤平過）`, fs.existsSync(root(f)) && fs.statSync(root(f)).size < 60000);
  }

  /* ================= 六、範例行程 ================= */
  t.ok('我的行程排除範例（範例掛在管理員帳號下）', /if\(PLAN_EXAMPLE_FILTER\) q=q\.eq\('is_example', false\)/.test(index));
  t.ok('v162 沒跑（沒有 is_example）：不篩，照常', /PLAN_EXAMPLE_FILTER=false; return loadPlans\(\)/.test(index));
  win.eval(`me={id:'u-1'}; myProfile={is_admin:true};
    SHARED=[{id:1,title:'免費一路拿拿拿',note:'',author:'壽星日',mine:false,saved:false,n_stops:5,n_saves:0,is_example:true},
            {id:2,title:'別人的',note:'',author:'嵐',mine:false,saved:false,n_stops:2,n_saves:1,is_example:false}];
    SHARED_ITEMS.set(1,[]); SHARED_ITEMS.set(2,[]);
    document.querySelector('#pnlShared').classList.remove('hidden'); SHARED_OPEN=1; renderShared();`);
  t.ok('範例標「範例」', /範例/.test($('[data-shared="1"] .plan-head').textContent));
  t.ok('別人的不標', !/範例/.test($('[data-shared="2"] .plan-head').textContent));
  t.ok('管理員：範例沒有「取消公開」（要改就重跑 SQL）', !$('[data-sunpub="1"]'));
  t.ok('SQL：三趟範例', /'免費一路拿拿拿'/.test(sql) && /'生日當天最省行程'/.test(sql) && /'一個人也可以吃到飽'/.test(sql));
  t.ok('SQL：三趟不會挑到同一個商圈', /not \(venue_id = any\(v_used\)\)/.test(sql));
  t.ok('SQL：一個人也可以吃到飽＝不用同行的', /not requires_companion/.test(sql));
  t.ok('SQL：範例排最上面、作者寫壽星日', /order by p\.is_example desc/.test(sql) && /when p\.is_example then '壽星日'/.test(sql));
  t.ok('SQL：重跑會先刪掉舊的範例', /delete from public\.plans where is_example/.test(sql));

  /* ================= 七、修改建議自動套用 ================= */
  t.ok('開關的名字講到修改建議', /auto_approve:'老手的投稿跟修改建議自動通過'/.test(index));
  win.eval(`LIVE=true; window.__rpc=[];
    sb={ rpc:(fn,a)=>{ window.__rpc.push([fn,a]); return Promise.resolve(fn==='admin_auto_applied_edits'
      ? {data:[{id:7,offer_id:3,brand:'丙',proposer:'嵐',fields:'value_twd、timing',reviewed_at:'2026-10-30T10:00:00Z',reverted:false}],error:null}
      : {data:null,error:null}); } };
    loadOffers=()=>Promise.resolve();`);
  await win.eval('loadAutoAppliedEdits()');
  t.ok('審核那邊列得出自動套用的修改建議', /丙/.test($('#autoEditsBody').textContent) && /改了：value_twd、timing/.test($('#autoEditsBody').textContent));
  win.__confirmAnswer = true;
  win.eval("document.querySelector('#autoEditsBody .ae-undo').click()");
  await tick(win, 3);
  t.ok('還原叫的是 admin_revert_auto_edit', JSON.stringify(win.eval('window.__rpc')).includes('"admin_revert_auto_edit",{"p_edit_id":7}'));
  t.ok('SQL：管理員核可跟自動套用走同一份欄位清單', (sql.match(/perform public\.apply_offer_edit_patch/g) || []).length >= 3);
  t.ok('SQL：自動套用跟 v144 同一顆開關、同一個門檻', /key = 'auto_approve'/.test(sql) && /MIN_APPROVED constant integer := 2/.test(sql));
  t.ok('SQL：停權的不自動套用', /coalesce\(p\.is_banned, false\)\)\s*then\s*return null/.test(sql));
  t.ok('SQL：套用前先記下改之前的樣子（還原用）', /auto_prev = v_prev/.test(sql));
  t.ok('SQL：套用那一支誰都不能直接叫', /revoke execute on function public\.apply_offer_edit_patch\(bigint, jsonb\) from public, anon, authenticated/.test(sql));
  t.ok('SQL：還原只有管理員', /admin_revert_auto_edit[\s\S]{0,300}if not public\.is_admin\(\)/.test(sql));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
