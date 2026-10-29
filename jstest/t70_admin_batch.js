/* v150／v151：celine 這一輪的管理員那一包

   「管理員要可以有個按鈕，其他分頁都變成一般民眾模式」
   「洞察分析月份那裡也要看得到次數」
   「星期那裡也要附上上線人數」
   「管理者要可以看到每個 block 及 app 內每個功能被點擊的次數」

   這一支最在意的：
   - 民眾模式只是把畫面換掉，**不能真的把管理員身分弄丟**（切回來要完整還原）
   - 切進去之後唯一回得來的路（那條橫幅）每一頁都看得到
   - 區塊展開的事件要節流，不然 site_events 會被灌爆 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, stubHeavy } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  const t = makeAsserts('t70 民眾模式、洞察補數字、功能統計');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  /* ================= 一、用一般民眾的樣子看 ================= */
  const banner = $('#previewBanner');
  t.ok('有那條橫幅', !!banner);
  t.ok('一開始是收著的', banner.classList.contains('hidden'));
  /* 橫幅一定要在分頁外面——放進「審核」分頁的話，切進民眾模式之後那個分頁
     自己也不見了，等於把回去的路一起關掉。 */
  t.ok('橫幅不在任何一個分頁裡面',
    !banner.closest('section[id^="tab-"]'), banner.closest('section')?.id);
  t.ok('橫幅上寫清楚「權限沒有變」', /資料庫的權限沒有變/.test(banner.textContent));
  t.ok('有回去的按鈕', !!$('#btnEndPreview'));
  t.ok('切換鈕在「審核」分頁',
    !!$('#btnPublicPreview') && !!$('#btnPublicPreview').closest('#tab-admin'));

  stubHeavy(win, ['render', 'renderMyWishlist', 'renderReminders', 'loadOffers',
    'loadPendingBadge', 'renderAvatarEditor', 'renderPlanner', 'maybeShowBirthdayCheer']);
  win.eval(`LIVE=true; me={id:'u-1', email:'a@b.c'};
    myProfile={id:'u-1', is_admin:true, display_name:'celine', show_on_leaderboard:true};
    paintAuth();`);
  const adminTab = doc.querySelector('.tab[data-tab="admin"]');
  t.ok('管理員看得到「審核」分頁', !adminTab.classList.contains('hidden'));
  t.ok('名字旁邊有「管」', !$('#uAdminBadge').classList.contains('hidden'));

  win.eval('setPublicPreview(true)');
  await tick(win, 2);
  t.ok('切進去之後「審核」分頁不見了', adminTab.classList.contains('hidden'));
  t.ok('「管」徽章也不見了', $('#uAdminBadge').classList.contains('hidden'));
  t.ok('橫幅出現了', !banner.classList.contains('hidden'));
  t.ok('全站共用的那個判斷式現在是 false', win.eval('!!myProfile.is_admin') === false);
  t.ok('按鈕變成「回到管理員」', /回到管理員/.test($('#btnPublicPreview').textContent));

  win.eval('setPublicPreview(false)');
  await tick(win, 2);
  t.ok('切回來，分頁回來了', !adminTab.classList.contains('hidden'));
  t.ok('「管」徽章也回來了', !$('#uAdminBadge').classList.contains('hidden'));
  t.ok('橫幅收起來了', banner.classList.contains('hidden'));
  t.ok('管理員身分完整還原', win.eval('!!myProfile.is_admin') === true);
  /* 還原的是**整份** profile，不是只把 is_admin 補回去——暱稱、上不上排行榜
     這些要一起回來，不然切一趟就把其他欄位弄丟了。 */
  t.ok('其他欄位也一起還原',
    win.eval("myProfile.display_name==='celine' && myProfile.show_on_leaderboard===true"));

  // 不是管理員的人按不出來（就算有人去 console 叫它）
  win.eval("myProfile={id:'u-2', is_admin:false}; setPublicPreview(true);");
  t.ok('本來就不是管理員：不進入預覽', win.eval('PUBLIC_PREVIEW') === false);
  win.eval("myProfile={id:'u-1', is_admin:true, display_name:'celine'};");

  /* 刻意不記住：重新整理要回到管理員，不然隔天打開會以為權限掉了 */
  t.ok('不寫進 localStorage',
    !/sxr[a-z_]*preview/i.test(index) || !/localStorage[^;]*preview/i.test(index));

  /* ================= 二、洞察分析：月份要看得到次數 ================= */
  /* 上面那個「人數／筆數」切換只換圖，底下的「看數字」跟提示本來也跟著
     只剩一種——兩個數字本來就在同一份資料裡。 */
  const mon = index.slice(index.indexOf('function renderMonthlyActivity'),
    index.indexOf('async function refreshMonthlyActivity'));
  t.ok('收藏那張表兩欄都列', /head:\['月份','收藏人數','收藏筆數'\]/.test(mon), '');
  t.ok('使用那張表兩欄都列', /head:\['月份','使用人數','使用次數','省下金額'\]/.test(mon), '');
  t.ok('提示也兩個都講', /\$\{us\[i\]\} 人・\$\{cs\[i\]\} 筆/.test(mon), '');
  t.ok('合計那一行也兩個都講',
    /sum\(wishU\)\} 人・\$\{sum\(wishC\)\} 筆/.test(mon), '');

  /* ================= 三、星期：上站人數 ================= */
  t.ok('星期那一頁多一塊', !!$('#boardWeekdayVisits'));
  t.ok('有載入的那一支', typeof win.loadWeekdayVisits === 'function');
  /* 一次就好——切來切去不要一直打同一支 RPC（Log 是按請求數算的） */
  t.ok('抓過就不再抓',
    /if\(WEEKDAY_VISITS\|\|WEEKDAY_VISITS_ERR\) return;/.test(index));
  /* 函式還沒跑的時候，一般使用者不該看到資料庫的錯誤訊息 */
  const vis = index.slice(index.indexOf('function renderWeekdayVisits'),
    index.indexOf('function renderWeekdayVisits') + 900);
  t.ok('還沒跑 SQL 時只有管理員看得到提示', /myProfile\?\.is_admin/.test(vis), '');
  t.ok('而且會講要跑哪一支', /schema_v150_weekday\.sql/.test(vis), '');

  // 真的畫得出來
  win.eval(`WEEKDAY_VISITS=[{dow:0,visitors:5,views:9},{dow:1,visitors:12,views:30},
    {dow:2,visitors:3,views:4},{dow:3,visitors:3,views:4},{dow:4,visitors:3,views:4},
    {dow:5,visitors:3,views:4},{dow:6,visitors:7,views:11}];
    WEEKDAY_VISITS_ERR=''; renderWeekdayVisits();`);
  const vbox = $('#boardWeekdayVisits');
  t.ok('畫出來了', /星期幾最多人上站/.test(vbox.textContent), vbox.textContent.slice(0, 30));
  t.ok('講出最多的是哪一天', /週一/.test(vbox.textContent));
  /* 七根而已，每一根的數字都要寫出來——只標最高的那根，其他六天就要用猜的 */
  t.ok('每一根都有數字',
    vbox.querySelectorAll('.vcol-val').length === 7,
    vbox.querySelectorAll('.vcol-val').length);
  t.ok('同一天同一個人只算一次這件事有講', /只算一次/.test(vbox.textContent));

  // 沒資料就整塊不要出現（不要留一張空圖）
  win.eval('WEEKDAY_VISITS=[]; renderWeekdayVisits();');
  t.ok('沒資料就不佔位子', !vbox.innerHTML.trim());

  /* 上面那張「星期幾最多人成功使用」也一樣，每根都要有數字 */
  t.ok('成功使用那張也每根都有數字',
    /emph:counts\[i\]===max, showValue:true/.test(index));

  /* ================= 四、每個功能／區塊被點幾次 ================= */
  t.ok('有這一塊', !!$('#pnlEventStats') && !!$('#pnlEventStats').closest('#tab-admin'));
  t.ok('有載入的那一支', typeof win.loadEventStats === 'function');
  /* 問那份清單本身，不要比對原始碼裡的排列順序——t53 就是那樣寫的，
     結果這次在中間插一個新區塊就紅了。 */
  t.ok('預設收著（它是看數據的，不是進審核要處理的事）',
    JSON.parse(win.eval('JSON.stringify([...PANEL_DEFAULT_CLOSED])')).includes('pnlEventStats'));
  t.ok('打開才去載', /pnlEventStats:\s*\(\)=>loadEventStats\(\)/.test(index));
  t.ok('跟上面共用同一個區間選單',
    /\$\('#coffeeRange'\)\.onchange=\(\)=>\{ loadCoffeeStats\(\); loadLinkStats\(\); loadEventStats\(\); \}/
      .test(index));
  t.ok('還沒跑 SQL 會講要跑哪一支', /schema_v151_event_stats\.sql/.test(index));
  /* 區塊的中文名要從畫面上的 h2 讀，不要另外養一張對照表——
     改了標題就對不起來，加新區塊還要記得回來補。 */
  t.ok('區塊名字是從 h2 讀的', /function panelLabel[\s\S]{0,200}querySelector\('h2'\)/.test(index));

  /* 節流：一次開站每一塊只記一次，而且只記「展開」 */
  t.ok('有一份「這次已經記過的」', /const PANEL_LOGGED=new Set\(\)/.test(index));
  t.ok('只在展開而且沒記過的時候記',
    /if\(now && !PANEL_LOGGED\.has\(id\)\)\{ PANEL_LOGGED\.add\(id\); logEvent\('panel_open',\{id\}\); \}/
      .test(index));

  /* SQL 那兩支的基本安全：只有管理員、只回彙總 */
  ['schema_v150_weekday.sql', 'schema_v151_event_stats.sql'].forEach((f) => {
    const sql = read(f);
    t.ok(`${f} 是可以重複執行的`, /create or replace function/.test(sql));
  });
  const ev = read('schema_v151_event_stats.sql');
  t.ok('功能統計只有管理員叫得動', /if not public\.is_admin\(\) then/.test(ev));
  t.ok('而且 anon 被收回', /revoke execute[\s\S]*from public, anon/.test(ev));
  t.ok('不回 session_id／user_id 本身',
    !/select[\s\S]*e\.session_id\s*,/.test(ev) && /count\(distinct e\.session_id\)/.test(ev));
  t.ok('不把 pageview 算進來（會壓死其他全部）', /e\.event_type <> 'pageview'/.test(ev));
  const wk = read('schema_v150_weekday.sql');
  t.ok('星期那支是公開的（排行榜是公開頁面）',
    /grant execute on function public\.site_weekday_distribution\(int\) to anon, authenticated/.test(wk));
  t.ok('星期那支只回聚合數字', !/select[\s\S]*jsonb_build_object\([^)]*'session/.test(wk));
  t.ok('時區固定台北，不然星期會被切錯一天', /at time zone 'Asia\/Taipei'/.test(wk));

  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
