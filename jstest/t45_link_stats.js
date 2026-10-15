/* celine：「幫我再多偵測有點進去品牌頁任何網址的」

   咖啡按鈕（v112）答的是「有沒有人想贊助」，這一支是另一半：頁尾那組
   「小數據所」的連結到底有沒有人點進去。

   記法是事件委派（OUT_LINKS）而不是一條一條掛 onclick——連結之後搬位置、
   或是在別的地方再放一次品牌頁的連結，都會自動被算到。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, makeSb } = require('./harness');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const about = fs.readFileSync(path.join(root, 'about.html'), 'utf8');

(async () => {
  const t = makeAsserts('t45 站外連結的點擊');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];

  /* ========== 1. 點了就記得到 ========== */
  const events = [];
  win.eval(`LIVE=true; logEvent=(type,meta)=>window.__ev.push({type,meta});`);
  win.__ev = events;

  // jsdom 沒有實作換頁，真的讓它跟著連結走只會印一堆 "Not implemented: navigation"。
  // 網站自己的監聽是捕獲階段，比這一行早跑，所以擋掉預設行為不影響被測的邏輯。
  doc.addEventListener('click', (e) => e.preventDefault());
  const click = (el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  click($('#xsjHome'));
  t.eq('點品牌頁記一筆', events.map((e) => e.type), ['studio_click']);
  t.eq('記得是哪一個連結', events[0].meta.to, 'brandpage');
  t.ok('也記從哪一頁點的（之後想比哪個位置有用）', !!events[0].meta.from, JSON.stringify(events[0].meta));

  events.length = 0;
  click($$('#xsjFooter a[data-flag="show_studio_bandary"]')[0]);
  click($$('#xsjFooter a[data-flag="show_studio_relatestats"]')[0]);
  t.eq('兩個 app 的報名表也分得開', events.map((e) => e.meta.to), ['bandary', 'relatestats']);

  // 點到連結裡面的東西（商標、名字）也算——#xsjHome 整塊都是連結
  events.length = 0;
  click($('#xsjHome .xsj-name'));
  t.eq('點在連結裡面的字也算', events.length, 1);

  // 站內連結不要亂記
  events.length = 0;
  click($$('#xsjFooter a[href="./"]')[0]);
  $$('footer a, .foot-links a').slice(0, 3).forEach(click);
  t.eq('站內的連結不記', events.length, 0);

  t.ok('比對的是網址，不是某一個 id（連結搬家也還算得到）',
    /OUT_LINKS[\s\S]{0,400}celinefubrandpage/.test(index));
  t.ok('用捕獲階段，中途被擋掉冒泡也算得到',
    /OUT_LINKS[\s\S]{0,600}\}, true\);/.test(index));

  /* ========== 2. 審核頁看得到 ========== */
  const panel = $('#pnlCoffeeStats');
  t.ok('跟咖啡放同一塊（問的是同一件事）', !!$('#linkStatsBody') && panel.contains($('#linkStatsBody')));
  t.ok('標題講出兩件事', /咖啡按鈕與站外連結/.test(panel.querySelector('h2').textContent));

  const sb = makeSb({
    rpcs: {
      admin_link_stats: () => [
        { target: 'brandpage', people: 12, clicks: 20, last_at: '2026-10-14T03:00:00Z' },
        { target: 'bandary', people: 3, clicks: 3, last_at: '2026-10-10T03:00:00Z' },
        { target: 'relatestats', people: 0, clicks: 0, last_at: null },
        { target: 'page_about', people: 31, clicks: 44, last_at: '2026-10-15T03:00:00Z' },
        { target: 'page_privacy', people: 2, clicks: 2, last_at: '2026-10-11T03:00:00Z' },
      ],
    },
  });
  win.__sb = sb;
  win.eval(`sb=window.__sb; myProfile={is_admin:true};`);
  await win.eval('loadLinkStats()');
  await tick(win, 3);
  const body = $('#linkStatsBody').textContent.replace(/\s+/g, ' ');
  t.eq('帶了區間（跟咖啡共用同一個選單）',
    sb.__calls.rpc.find((r) => r.name === 'admin_link_stats').params, { p_days: 30 });
  t.ok('看得到幾個人、幾次', /12/.test(body) && /20/.test(body), body.slice(0, 200));
  t.ok('連到哪寫成看得懂的名字，不是 brandpage', /品牌頁/.test(body), body.slice(0, 200));
  t.ok('一次都沒被點的那條不佔版面', !/RelateStats/.test(body), body.slice(0, 300));
  /* celine：「連到 about privacy 小數據所 bandary relatestat 都要紀錄人次」——
     站內那幾頁跟站外連結分成兩組，不要混在一起看 */
  t.ok('站內那幾頁也看得到', /關於這個網站/.test(body) && /隱私權政策/.test(body), body.slice(0, 400));
  t.ok('而且數字是那幾頁自己的', /31/.test(body), body.slice(0, 400));
  t.ok('站外、站內分成兩組', /往站外去/.test(body) && /站內的幾頁/.test(body), body.slice(0, 200));
  t.ok('講明那幾頁不會算進公開的總瀏覽人次', /總瀏覽人次/.test(body), body.slice(-220));
  t.ok('不用排行榜那張 table.lb（第二欄被寫死成撐滿的那一欄，名稱會被擠成一個字一行）',
    !$('#linkStatsBody').querySelector('table'));
  t.eq('五筆裡有四筆有數字，就畫四列', $$('#linkStatsBody .linkrow').length, 4);
  t.ok('講明「人」是瀏覽器那一套', /瀏覽器/.test(body), body.slice(-160));
  t.ok('講明「關於」那一頁的連結也算得到', /about\.html|關於/.test(body), body.slice(-160));

  // 還沒跑 v113 → 講出要跑哪一支，不是丟一段看不懂的錯誤
  win.__sb2 = {
    rpc: () => Promise.resolve({ data: null, error: { message: 'function public.admin_link_stats does not exist' } }),
  };
  win.eval('sb=window.__sb2;');
  await win.eval('loadLinkStats()');
  await tick(win, 2);
  t.ok('沒跑 v113 時講一聲', /schema_v113_link_stats\.sql/.test($('#linkStatsBody').textContent),
    $('#linkStatsBody').textContent.slice(0, 120));

  // 一筆都沒有的時候講人話
  win.__sb3 = { rpc: () => Promise.resolve({ data: [], error: null }) };
  win.eval('sb=window.__sb3;');
  await win.eval('loadLinkStats()');
  await tick(win, 2);
  const empty = $('#linkStatsBody').textContent;
  t.ok('還沒有人點就直說', /還沒有人點/.test(empty), empty.slice(0, 160));
  t.ok('站內那組空的時候，講出是還沒跑 v115 還是真的沒人看',
    /schema_v115_page_stats\.sql/.test(empty), empty.slice(0, 300));

  // 不是管理員就什麼都不查
  const sb4 = makeSb({ rpcs: { admin_link_stats: () => [] } });
  win.__sb4 = sb4;
  win.eval('sb=window.__sb4; myProfile={is_admin:false};');
  await win.eval('loadLinkStats()');
  await tick(win, 2);
  t.eq('非管理員不會去查', sb4.__calls.rpc.length, 0);

  /* ========== 3. 靜態頁自己記一筆（共用 track.js）========== */
  const track = fs.readFileSync(path.join(root, 'track.js'), 'utf8');
  t.ok('記這一頁被打開', /static_view/.test(track));
  t.ok('也記品牌頁的點擊', /studio_click/.test(track));
  t.ok('用同一把 session id（同一個人算同一個）', /sxr_sid/.test(track));
  t.ok('沒有為了兩筆記錄多載 Supabase 的 JS 函式庫',
    !/supabase-js|@supabase/.test(track), 'track.js 不該載 SDK');
  t.ok('失敗不能擋住頁面或連結（整段包在 try 裡、fetch 也 catch 掉）',
    /catch\(function \(\) \{\}\)/.test(track) && /try \{/.test(track));
  t.ok('刻意不叫 pageview（那是主程式在用的，會改掉公開的總瀏覽人次）',
    !/'pageview'|"pageview"/.test(track) && /不叫 pageview|總瀏覽人次/.test(track));

  // 四頁都要掛上去，而且各自帶自己的 data-page
  [['about.html', 'about'], ['privacy.html', 'privacy'], ['terms.html', 'terms'],
   ['updates.html', 'updates']].forEach(([f, page]) => {
    const html = fs.readFileSync(path.join(root, f), 'utf8');
    t.ok(`${f} 有掛 track.js`, /src="track\.js"/.test(html));
    t.ok(`${f} 帶的是 data-page="${page}"`, html.includes(`data-page="${page}"`));
    t.ok(`${f} 有先載 config.js`,
      html.indexOf('src="config.js"') < html.indexOf('src="track.js"'));
  });
  t.ok('updates.html 是 build.py 產的，所以樣板也要有',
    /src="track\.js"/.test(fs.readFileSync(path.join(root, 'updates_template.html'), 'utf8')));
  t.ok('about.html 不再自己寫一份（改用共用的那一支）', !/sxr_sid/.test(about));

  /* ========== 4. 真的有這一支 SQL，而且是管理員限定 ========== */
  const sql = fs.readFileSync(path.join(root, 'schema_v115_page_stats.sql'), 'utf8');
  t.ok('有 v115（跟 v113 同名同參數，前端不用改）',
    /create or replace function public\.admin_link_stats/.test(sql));
  t.ok('兩種事件一起算', /studio_click/.test(sql) && /static_view/.test(sql));
  t.ok('管理員限定', /is_admin\(\)/.test(sql) && /revoke execute[\s\S]*from public, anon/.test(sql));
  t.ok('算的是不重複的 session', /count\(distinct e\.session_id\)/.test(sql));
  t.ok('只回彙總，不回任何一列事件', !/select \*/i.test(sql));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
