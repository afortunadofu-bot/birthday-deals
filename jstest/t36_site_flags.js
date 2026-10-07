/* celine：「我希望網頁上面管理員可以加一個按鈕，是可以關掉品牌頁跟捐款頁的，
             跟個別可以選要加甚麼展示」

   重點不是「管理員自己看不到」，是**所有訪客都看不到**——所以開關存在資料庫
   （schema_v95 的 site_settings），不是 localStorage。

   咖啡按鈕特別處理：它是第三方腳本、會種 cookie，所以關掉時要「根本不載入」，
   而不是載進來再用 CSS 藏起來。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeSb, makeAsserts } = require('./harness');

const sql = fs.readFileSync(path.join(__dirname, '..', 'schema_v95_site_settings.sql'), 'utf8');

(async () => {
  const t = makeAsserts('t36 全站顯示開關');

  /* ================= 1. SQL：權限與白名單 ================= */
  t.ok('讀取開放給所有人（含未登入）', /create policy site_settings_read[\s\S]{0,80}for select using \(true\)/.test(sql));
  t.ok('只有管理員改得了', /create policy site_settings_admin[\s\S]{0,120}using \(public\.is_admin\(\)\)[\s\S]{0,60}with check \(public\.is_admin\(\)\)/.test(sql));
  // 公開可讀的表不限制 key 的話，等於開了一個誰都看得到的留言板
  t.ok('key 用白名單鎖住', /site_settings_key_known[\s\S]{0,400}check \(key in \(/.test(sql));
  ['show_studio_footer', 'show_studio_brandpage', 'show_studio_bandary',
    'show_studio_relatestats', 'show_coffee'].forEach((k) =>
    t.ok(`白名單含 ${k}`, new RegExp(`'${k}'`).test(sql)));
  // 五個 key 都要用 true 塞進去——有一個漏寫 true，跑完 SQL 那塊就當場消失
  t.eq('預設五個全開＝跑這支不會讓任何東西消失',
    (sql.match(/\('show_\w+', true\)/g) || []).length, 5,
    (sql.match(/\('show_\w+', \w+\)/g) || []).join(' '));
  t.ok('重跑不會蓋掉已經改過的設定', /on conflict \(key\) do nothing/.test(sql));

  /* ================= 2. 前端：預設與套用 ================= */
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];
  const flags = () => win.eval('JSON.parse(JSON.stringify(SITE_FLAGS))');

  t.eq('預設全部打開', Object.values(flags()).every((v) => v === true), true, JSON.stringify(flags()));
  t.ok('頁尾預設看得到', !$('#xsjFooter').classList.contains('hidden'));

  // 載入第三方腳本這件事在 jsdom 裡不會真的發生，攔 appendChild 看它有沒有要載
  const added = [];
  win.eval(`window.__added = [];
    const realAppend = document.body.appendChild.bind(document.body);
    document.body.appendChild = (n) => { if(n && n.tagName==='SCRIPT') { window.__added.push(String(n.src||'')); return n; } return realAppend(n); };`);
  const addedSrcs = () => win.__added;

  // 關掉：整塊頁尾
  win.eval('SITE_FLAGS.show_studio_footer = false; applySiteFlags();');
  t.ok('關掉頁尾就整塊不見', $('#xsjFooter').classList.contains('hidden'));
  win.eval('SITE_FLAGS.show_studio_footer = true; applySiteFlags();');
  t.ok('打開又回來', !$('#xsjFooter').classList.contains('hidden'));

  /* 個別連結：celine「字樣都保留，關掉只關超連結」——所以關掉時字要留在原地，
     只是不能點。不是藏起來、更不是刪掉：「Bandary 聽團曆」這幾個字本身在介紹做了什麼。 */
  const linkOf = (f) => doc.querySelector(`[data-flag="${f}"]`) || $('#xsjHome');
  win.eval('SITE_FLAGS.show_studio_brandpage = false; applySiteFlags();');
  const home = $('#xsjHome');
  t.eq('關掉品牌頁連結後不能點了', home.getAttribute('href'), null);
  t.ok('但字還在', /小數據所/.test(home.textContent) && /日子有數/.test(home.textContent));
  t.ok('看起來也不像連結', home.classList.contains('link-off'));
  t.ok('讀螢幕軟體知道它被停用', home.getAttribute('aria-disabled') === 'true');
  t.ok('頁尾其他東西留著', !$('#xsjFooter').classList.contains('hidden'));
  win.eval('SITE_FLAGS.show_studio_brandpage = true; applySiteFlags();');
  t.ok('打開時原本的網址放得回去',
    /celinefubrandpage/.test(home.getAttribute('href') || ''), home.getAttribute('href'));

  win.eval('SITE_FLAGS.show_studio_bandary = false; applySiteFlags();');
  const bandary = linkOf('show_studio_bandary');
  t.eq('Bandary 也是只拿掉連結', bandary.getAttribute('href'), null);
  t.ok('報名那幾個字照樣看得到', /Bandary/.test(bandary.textContent) && /封閉測試報名/.test(bandary.textContent));
  t.ok('RelateStats 不受影響',
    /forms\.gle/.test(linkOf('show_studio_relatestats').getAttribute('href') || ''));
  // 文字留著，所以中間那個「·」也要留著，不會變成孤單的分隔點
  t.eq('分隔點不再跟著開關', doc.querySelectorAll('.xsj-sep[data-flag]').length, 0);
  win.eval('SITE_FLAGS.show_studio_bandary = true; applySiteFlags();');

  /* ================= 3. 咖啡按鈕：關掉＝根本不載入 ================= */
  win.__added.length = 0;
  win.eval('SITE_FLAGS.show_coffee = false; applySiteFlags();');
  t.eq('關掉時完全不去碰 buymeacoffee.com', addedSrcs().filter((s) => /buymeacoffee/.test(s)).length, 0);
  t.eq('也不會留下它的 script 標籤', doc.querySelectorAll('script[data-name="BMC-Widget"]').length, 0);

  win.eval('SITE_FLAGS.show_coffee = true; applySiteFlags();');
  const bmc = addedSrcs().filter((s) => /buymeacoffee/.test(s));
  t.eq('打開才載入，而且只載一次', bmc.length, 1, JSON.stringify(addedSrcs()));
  win.eval('applySiteFlags(); applySiteFlags();');
  t.eq('重複套用不會重複載入', addedSrcs().filter((s) => /buymeacoffee/.test(s)).length, 1);

  /* ================= 4. 從資料庫讀，讀不到要維持現狀 ================= */
  const rows = [
    { key: 'show_coffee', enabled: false },
    { key: 'show_studio_relatestats', enabled: false },
    { key: 'show_studio_footer', enabled: true },
  ];
  const sb = makeSb({ tables: { site_settings: rows } });
  win.__sb = sb;
  win.eval('sb = window.__sb; LIVE = true; me = {id:"u-1"}; myProfile = {id:"u-1", is_admin:true};');
  win.localStorage.clear();
  await win.loadSiteFlags();
  await tick(win, 2);
  t.eq('資料庫說關就關', [flags().show_coffee, flags().show_studio_relatestats], [false, false]);
  t.eq('沒提到的維持打開', flags().show_studio_bandary, true);
  t.eq('畫面跟著變（只拿掉連結）', linkOf('show_studio_relatestats').getAttribute('href'), null);
  t.ok('存進這台裝置的快取（下次開場就不會閃一下）',
    JSON.parse(win.localStorage.getItem('sxr_site_flags')).show_coffee === false);

  // 還沒跑 v95（查詢失敗）：維持現狀，不要讓畫面少一塊
  const realFrom = sb.from;
  sb.from = (tb) => (tb === 'site_settings'
    ? { select: () => Promise.resolve({ data: null, error: { message: 'relation "public.site_settings" does not exist' } }) }
    : realFrom(tb));
  win.eval('SITE_FLAGS.show_studio_footer = true; applySiteFlags();');
  await win.loadSiteFlags();
  await tick(win, 2);
  t.ok('讀不到設定時頁尾照常顯示（後端出事不該讓網站少一塊）',
    !$('#xsjFooter').classList.contains('hidden'));
  sb.from = realFrom;

  // 開場先用快取套用，不等網路
  win.localStorage.setItem('sxr_site_flags', JSON.stringify({ show_coffee: false, show_studio_footer: false }));
  win.eval('readFlagCache(); applySiteFlags();');
  t.ok('開場讀得到快取', $('#xsjFooter').classList.contains('hidden'));
  t.eq('壞掉的快取不會把網站弄壞',
    (() => { win.localStorage.setItem('sxr_site_flags', '{壞掉的'); win.eval('readFlagCache()'); return 'ok'; })(), 'ok');
  win.localStorage.clear();
  win.eval('SITE_FLAGS = {show_studio_footer:true,show_studio_brandpage:true,show_studio_bandary:true,show_studio_relatestats:true,show_coffee:true}; applySiteFlags();');

  /* ================= 5. 管理員面板 ================= */
  win.renderSiteFlagsPanel();
  const boxes = $$('#siteFlagsBody .flag-box');
  t.eq('五個開關都在', boxes.length, 5);
  t.ok('每一個都寫得出是什麼',
    $$('#siteFlagsBody .flag-item').every((r) => r.textContent.trim().length > 2));
  // celine：「網站顯示設定很醜」——原本五個平鋪的勾選框加「└」符號，看不出層級
  t.eq('三個子項目縮排在第一項底下', $$('#siteFlagsBody .flag-kids .flag-box').length, 3);
  t.ok('「└」那種字元不要再用了（字型不同會跑掉）', !/└/.test($('#siteFlagsBody').innerHTML));
  t.ok('咖啡那項講清楚關掉就不會載入第三方程式',
    /不會載入 buymeacoffee\.com/.test($('#siteFlagsBody').textContent));

  const coffeeBox = boxes.find((b) => b.dataset.k === 'show_coffee');
  coffeeBox.checked = false;
  coffeeBox.dispatchEvent(new win.Event('change'));
  await tick(win, 3);
  const writes = sb.__calls.write.filter((w) => w.table === 'site_settings');
  t.eq('改一下就存進資料庫', writes.length, 1);
  t.eq('存的是 upsert（第一次還沒有那一列）', writes[0].op, 'upsert');
  t.eq('存對 key 跟值', [writes[0].args[0].key, writes[0].args[0].enabled], ['show_coffee', false]);
  t.eq('畫面馬上跟著變', flags().show_coffee, false);
  t.ok('而且講清楚是對所有人生效', /所有人/.test($('#siteFlagsMsg').textContent), $('#siteFlagsMsg').textContent);

  // 存檔失敗：勾勾要彈回去，不能讓畫面說成功、資料庫其實沒存
  sb.from = (tb) => (tb === 'site_settings'
    ? { upsert: () => Promise.resolve({ data: null, error: { message: 'relation "public.site_settings" does not exist' } }) }
    : realFrom(tb));
  const footBox = $$('#siteFlagsBody .flag-box').find((b) => b.dataset.k === 'show_studio_footer');
  footBox.checked = false;
  footBox.dispatchEvent(new win.Event('change'));
  await tick(win, 3);
  t.ok('存檔失敗時勾勾彈回原狀', footBox.checked === true);
  t.ok('而且說得出要跑哪一支 SQL', /schema_v95/.test($('#siteFlagsMsg').textContent), $('#siteFlagsMsg').textContent);
  t.eq('失敗時不要改畫面', flags().show_studio_footer, true);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
