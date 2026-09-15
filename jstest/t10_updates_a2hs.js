/* 「我的」分頁：更新紀錄＋加到主畫面提醒

   celine：
   - 「我的」頁面要有個小地方記每個版本的更新日期、簡單介紹改了哪裡
   - 「我的」那邊也要提醒使用者可以加到主畫面

   驗：
   - 更新紀錄訪客也看得到、日期由新到舊、預設只顯示最新 3 筆可展開、內容是給一般使用者看的
     （不能出現 schema／RLS／管理員後台這種字）
   - 有新更新時「我的」分頁小紅點＋NEW，看過就消失；第一次來的人不會看到紅點
   - 加到主畫面提醒在「我的」頂部；已經加到主畫面就不出現；✕ 30 天不再出現；
     瀏覽器有給安裝權限時按鈕直接安裝 */
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t10 更新紀錄＋加到主畫面提醒');
  const { win } = await boot();
  const doc = win.document;
  const ls = win.localStorage;

  /* ================= 更新紀錄 ================= */
  const panel = doc.querySelector('#siteUpdatesPanel');
  t.ok('「我的」分頁有更新紀錄', !!panel && !!panel.closest('#tab-mine'));
  t.ok('更新紀錄不在會員專屬區塊裡（訪客也看得到）', panel && !panel.closest('#mineAuthedPanels'));
  // celine：更新紀錄也要可以摺疊（預設收合，免得「我的」分頁太長）
  t.ok('更新紀錄可以摺疊', !!panel.querySelector('.panel-cbody'));
  t.ok('更新紀錄預設收合', panel.classList.contains('collapsed'));

  const updates = win.eval('SITE_UPDATES');
  const dates = updates.map((u) => u.date);
  t.ok('每筆都有日期、標題、內容', updates.every((u) => /^\d{4}-\d{2}-\d{2}$/.test(u.date) && u.title && u.items.length));
  t.eq('日期由新到舊', dates, [...dates].sort().reverse());
  t.eq('沒有重複日期', new Set(dates).size, dates.length);

  const entries = () => [...doc.querySelectorAll('#siteUpdatesList .upd-entry')];
  t.eq('預設只顯示最新 3 筆', entries().length, 3);
  t.ok('第一筆是最新的', entries()[0].querySelector('.upd-date').textContent === updates[0].date);
  const more = doc.querySelector('#btnSiteUpdatesMore');
  t.ok('有「看更早的更新」按鈕並寫出幾筆', !more.classList.contains('hidden') && more.textContent.includes(String(updates.length - 3)), more.textContent);
  more.click();
  t.eq('展開後全部顯示', entries().length, updates.length);
  t.eq('展開後按鈕變「收起」', more.textContent, '收起');
  more.click();
  t.eq('收起後回到 3 筆', entries().length, 3);

  const allText = updates.map((u) => u.title + u.items.join('')).join('');
  t.ok('內容是給一般使用者看的（沒有技術／後台用語）',
    !/schema|RLS|jsdom|SQL|Supabase|trigger|RPC|管理員|後台|待審佇列|feature\/geo|v\d{2}/i.test(allText), allText.match(/schema|RLS|jsdom|SQL|Supabase|trigger|RPC|管理員|後台|待審佇列|feature\/geo|v\d{2}/i));
  // 「用 Google 地圖找附近分店」是 main 上已上線的地圖按鈕，可以寫；
  // 還在 feature/geo 分支的是「📍 附近」按鈕、離我最近排序、距離範圍這些
  t.ok('沒上線的附近模式功能沒有列進去', !/離我最近|附近模式|📍 附近|距離範圍/.test(allText),
    allText.match(/離我最近|附近模式|📍 附近|距離範圍/));

  // 第一次來的人：不顯示紅點
  ls.removeItem('sxr_updates_seen');
  win.renderSiteUpdates();
  const tabDot = () => doc.querySelectorAll('.tab[data-tab="mine"] .tab-dot').length;
  t.eq('第一次來的人不會看到小紅點', tabDot(), 0);
  t.eq('第一次來的人直接記成已讀最新一筆', ls.getItem('sxr_updates_seen'), updates[0].date);
  t.eq('第一次來的人看不到 NEW', doc.querySelectorAll('#siteUpdatesList .upd-new').length, 0);

  // 之前來過、後來有新更新
  ls.setItem('sxr_updates_seen', updates[1].date);
  win.renderSiteUpdates();
  t.ok('有新更新時「我的」分頁出現小紅點', tabDot() > 0);
  t.eq('只有比上次看過更新的那幾筆標 NEW', doc.querySelectorAll('#siteUpdatesList .upd-new').length, 1);
  t.ok('NEW 標在最新那筆', !!entries()[0].querySelector('.upd-new'));
  win.markUpdatesSeen();
  t.eq('看過之後小紅點消失', tabDot(), 0);
  t.eq('看過之後 NEW 消失', doc.querySelectorAll('#siteUpdatesList .upd-new').length, 0);
  t.eq('記下看過最新一筆', ls.getItem('sxr_updates_seen'), updates[0].date);

  // 可以摺疊之後：收合時標題旁要看得到 NEW；只打開「我的」分頁不算看過，展開更新紀錄才算
  const headNew = doc.querySelector('#updHeadNew');
  const h2 = panel.querySelector('h2');
  ls.setItem('sxr_updates_seen', updates[1].date);
  win.renderSiteUpdates();
  if (!panel.classList.contains('collapsed')) h2.click();
  t.ok('收合時標題旁也看得到 NEW', !headNew.classList.contains('hidden'));
  doc.querySelector('.tab[data-tab="mine"]').click();
  await new Promise((r) => win.setTimeout(r, 4300));
  t.eq('更新紀錄收合著，只打開「我的」分頁不算看過', ls.getItem('sxr_updates_seen'), updates[1].date);
  h2.click();
  t.ok('點標題展開更新紀錄', !panel.classList.contains('collapsed'));
  await new Promise((r) => win.setTimeout(r, 2800));
  t.eq('展開幾秒後才標成已讀', ls.getItem('sxr_updates_seen'), updates[0].date);
  t.ok('看過之後標題旁的 NEW 消失', headNew.classList.contains('hidden'));
  t.eq('看過之後「我的」分頁小紅點消失', tabDot(), 0);
  h2.click();
  t.ok('再點標題收合', panel.classList.contains('collapsed'));

  // 更新紀錄文字有跳脫
  win.eval(`SITE_UPDATES.unshift({date:'2099-01-01', title:'<img src=x onerror=alert(1)>', items:['<script>bad()</script>']});`);
  ls.setItem('sxr_updates_seen', '2000-01-01');
  win.renderSiteUpdates();
  t.ok('更新內容有跳脫（不會變成 HTML）', !doc.querySelector('#siteUpdatesList img') && !doc.querySelector('#siteUpdatesList script'));
  win.eval('SITE_UPDATES.shift();');
  win.markUpdatesSeen();

  /* ================= 加到主畫面提醒 ================= */
  const banner = doc.querySelector('#mineA2hsBanner');
  const main = doc.querySelector('#tab-mine main');
  t.ok('提醒在「我的」分頁最上面', banner && main.firstElementChild === banner);
  t.ok('提醒不在會員專屬區塊裡（訪客也看得到）', !banner.closest('#mineAuthedPanels'));
  ls.removeItem('sxr_mine_a2hs_snooze_until');
  win.renderA2hsPanel();
  t.ok('還沒加到主畫面時顯示提醒', !banner.classList.contains('hidden'));
  t.eq('瀏覽器沒給安裝權限時按鈕寫「怎麼加」', doc.querySelector('#btnMineA2hs').textContent, '怎麼加');

  // 按「怎麼加」捲到步驟說明
  let scrolled = null;
  doc.querySelector('#a2hsPanel').scrollIntoView = function () { scrolled = this.id; };
  doc.querySelector('#btnMineA2hs').click();
  await tick(win, 1);
  t.eq('按「怎麼加」捲到下面的步驟說明', scrolled, 'a2hsPanel');

  // 瀏覽器有給安裝權限：直接安裝
  let prompted = 0;
  win.__fakeInstall = { prompt: () => { prompted++; }, userChoice: Promise.resolve({ outcome: 'accepted' }) };
  win.eval('deferredInstall = window.__fakeInstall;');
  win.renderA2hsPanel();
  t.eq('有安裝權限時按鈕寫「加到主畫面」', doc.querySelector('#btnMineA2hs').textContent, '加到主畫面');
  doc.querySelector('#btnMineA2hs').click();
  await tick(win, 3);
  t.eq('按下去直接跳系統安裝', prompted, 1);
  t.eq('安裝權限用過就清掉', win.eval('deferredInstall'), null);

  // ✕ 30 天不再出現
  const t0 = Date.now();
  doc.querySelector('#btnMineA2hsClose').click();
  t.ok('按 ✕ 收起提醒', banner.classList.contains('hidden'));
  const until = Number(ls.getItem('sxr_mine_a2hs_snooze_until'));
  t.ok('✕ 之後 30 天不再出現', Math.abs(until - (t0 + 30 * 864e5)) < 5000, { until, expected: t0 + 30 * 864e5 });
  win.renderA2hsPanel();
  t.ok('30 天內重新整理也不出現', banner.classList.contains('hidden'));
  ls.setItem('sxr_mine_a2hs_snooze_until', String(Date.now() - 1000));
  win.renderA2hsPanel();
  t.ok('30 天過了會再出現', !banner.classList.contains('hidden'));

  // 已經加到主畫面（從主畫面圖示打開）
  Object.defineProperty(win.navigator, 'standalone', { configurable: true, value: true });
  win.renderA2hsPanel();
  t.ok('已經加到主畫面就不顯示提醒', banner.classList.contains('hidden'));
  t.ok('已經加到主畫面也不顯示步驟說明', doc.querySelector('#a2hsPanel').classList.contains('hidden'));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
