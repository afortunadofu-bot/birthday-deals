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

  /* ===== 免費方案的說明（嵐：「寫說目前是用免費方案架設的，有時候稍有延遲請見諒」）===== */
  const ft = doc.querySelector('#freeTierNote');
  t.ok('「我的」分頁有一塊說明速度', !!ft && !!ft.closest('#tab-mine'));
  t.ok('訪客也看得到（不在會員專屬區塊裡）', ft && !ft.closest('#mineAuthedPanels'));
  t.ok('講清楚是免費方案、會有延遲', /免費方案/.test(ft.textContent) && /慢/.test(ft.textContent),
    ft.textContent.replace(/\s+/g, ' ').trim());
  t.ok('講清楚不是使用者自己的網路有問題', /不是你的網路/.test(ft.textContent));

  /* ================= 更新紀錄 ================= */
  const panel = doc.querySelector('#siteUpdatesPanel');
  t.ok('「我的」分頁有更新紀錄', !!panel && !!panel.closest('#tab-mine'));
  t.ok('更新紀錄不在會員專屬區塊裡（訪客也看得到）', panel && !panel.closest('#mineAuthedPanels'));
  // celine：更新紀錄要可以摺疊、預設展開
  t.ok('更新紀錄可以摺疊', !!panel.querySelector('.panel-cbody'));
  t.ok('更新紀錄預設展開', !panel.classList.contains('collapsed'));

  const updates = win.eval('SITE_UPDATES');
  const dates = updates.map((u) => u.date);
  t.ok('每筆都有日期、標題、內容', updates.every((u) => /^\d{4}-\d{2}-\d{2}$/.test(u.date) && u.title && u.items.length));
  t.eq('日期由新到舊', dates, [...dates].sort().reverse());
  t.eq('沒有重複日期', new Set(dates).size, dates.length);

  /* celine：「更新紀錄不要寫那麼仔細」「不要是收合，是點進去看到新網頁」。
     「我的」頁面只留最新三筆的日期＋標題，細項全部在 updates.html。 */
  const entries = () => [...doc.querySelectorAll('#siteUpdatesList .upd-row')];
  t.eq('只顯示最新 3 筆', entries().length, 3);
  t.ok('第一筆是最新的', entries()[0].querySelector('.upd-date').textContent === updates[0].date);
  t.ok('沒有「看更早的更新」那顆展開鈕了', !doc.querySelector('#btnSiteUpdatesMore'));
  const panelText = doc.querySelector('#siteUpdatesList').textContent;
  t.ok('細項不列在「我的」頁面（那是另一頁的事）',
    !updates[0].items.some((i) => panelText.includes(i)), panelText.replace(/\s+/g, ' ').trim());
  t.ok('每一列都點得進完整的那一頁',
    entries().every((a) => a.tagName === 'A' && a.getAttribute('href') === 'updates.html'));
  const go = [...panel.querySelectorAll('a')].find((a) => a.getAttribute('href') === 'updates.html' && /完整/.test(a.textContent));
  t.ok('面板底部有「看完整更新紀錄」的入口', !!go, go && go.textContent.trim());

  const allText = updates.map((u) => u.title + u.items.join('')).join('');
  t.ok('內容是給一般使用者看的（沒有技術／後台用語）',
    !/schema|RLS|jsdom|SQL|Supabase|trigger|RPC|管理員|後台|待審佇列|feature\/geo|v\d{2}/i.test(allText), allText.match(/schema|RLS|jsdom|SQL|Supabase|trigger|RPC|管理員|後台|待審佇列|feature\/geo|v\d{2}/i));
  // 附近模式（原本的 feature/geo）已經合併上線，更新紀錄要寫得到它
  t.ok('附近模式上線了，更新紀錄有寫', /附近/.test(allText));

  // 第一次來的人：不顯示紅點
  ls.removeItem('sxr_updates_seen');
  win.renderSiteUpdates();
  const tabDot = () => doc.querySelectorAll('.tab[data-tab="mine"] .tab-dot').length;
  t.eq('第一次來的人不會看到小紅點', tabDot(), 0);
  t.eq('第一次來的人直接記成已讀最新一筆', ls.getItem('sxr_updates_seen'), updates[0].date);
  t.eq('第一次來的人看不到 NEW', doc.querySelectorAll('#siteUpdatesList .upd-new').length, 0);

  /* celine：「以後更新一個月內不用跳通知跟 new」——這陣子幾乎每天在改，
     紅點跟彈窗變成純雜訊。UPDATES_QUIET_UNTIL 之前一律安靜，更新紀錄本身照常可以翻。 */
  ls.setItem('sxr_updates_seen', updates[1].date);
  win.eval("UPDATES_QUIET_UNTIL = '2099-01-01'");      // 安靜期間
  win.renderSiteUpdates();
  t.eq('安靜期間不標 NEW', doc.querySelectorAll('#siteUpdatesList .upd-new').length, 0);
  t.eq('安靜期間分頁上也不點紅點', tabDot(), 0);
  t.ok('但更新紀錄本身照常看得到', entries().length > 0);
  t.eq('安靜期間也不跳通知', win.maybeShowUpdatesNudge(), false);

  // 安靜期過了之後，原本的行為要完整回來
  win.eval("UPDATES_QUIET_UNTIL = '2000-01-01'");
  win.renderSiteUpdates();
  t.ok('有新更新時「我的」分頁出現小紅點', tabDot() > 0);
  t.eq('只有比上次看過更新的那幾筆標 NEW', doc.querySelectorAll('#siteUpdatesList .upd-new').length, 1);
  t.ok('NEW 標在最新那筆', !!entries()[0].querySelector('.upd-new'));
  win.markUpdatesSeen();
  t.eq('看過之後小紅點消失', tabDot(), 0);
  t.eq('看過之後 NEW 消失', doc.querySelectorAll('#siteUpdatesList .upd-new').length, 0);
  t.eq('記下看過最新一筆', ls.getItem('sxr_updates_seen'), updates[0].date);

  // 可以摺疊之後：收合時標題旁要看得到 NEW；收合著不算看過，展開並停留才算
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

  // 展開著切到「我的」分頁，停留一下也算看過（原本只有「點標題展開」那一條路）
  ls.setItem('sxr_updates_seen', updates[1].date);
  win.renderSiteUpdates();
  t.ok('展開著', !panel.classList.contains('collapsed'));
  doc.querySelector('.tab[data-tab="mine"]').click();
  await new Promise((r) => win.setTimeout(r, 2800));
  t.eq('展開著停留幾秒就算看過', ls.getItem('sxr_updates_seen'), updates[0].date);

  // 中途切走就不算——人早就離開了，不該幫他標成看過
  ls.setItem('sxr_updates_seen', updates[1].date);
  win.renderSiteUpdates();
  doc.querySelector('.tab[data-tab="mine"]').click();
  await new Promise((r) => win.setTimeout(r, 600));
  doc.querySelector('.tab[data-tab="board"]').click();
  await new Promise((r) => win.setTimeout(r, 2800));
  t.eq('看到一半切走就不算看過', ls.getItem('sxr_updates_seen'), updates[1].date);

  // 直接點進完整那一頁，當然算看過
  doc.querySelector('.tab[data-tab="mine"]').click();
  ls.setItem('sxr_updates_seen', updates[1].date);
  win.renderSiteUpdates();
  entries()[0].click();
  t.eq('點進完整更新紀錄就算看過', ls.getItem('sxr_updates_seen'), updates[0].date);
  h2.click();
  t.ok('再點標題收合', panel.classList.contains('collapsed'));
  h2.click();

  // 更新紀錄文字有跳脫
  win.eval(`SITE_UPDATES.unshift({date:'2099-01-01', title:'<img src=x onerror=alert(1)>', items:['<script>bad()</script>']});`);
  ls.setItem('sxr_updates_seen', '2000-01-01');
  win.renderSiteUpdates();
  t.ok('更新內容有跳脫（不會變成 HTML）', !doc.querySelector('#siteUpdatesList img') && !doc.querySelector('#siteUpdatesList script'));
  win.eval('SITE_UPDATES.shift();');
  win.markUpdatesSeen();

  /* ================= 有新更新時跳通知 ================= */
  const unudge = doc.querySelector('#updatesNudge');
  const snudge = doc.querySelector('#surveyNudge');
  // 嵐：「不要每次更新都跳通知，一週一次就夠了」——每次重設情境時也把「上次跳的時間」清掉
  const resetUpd = () => { ls.setItem('sxr_updates_seen', updates[1].date); ls.removeItem('sxr_updates_nudge_done');
    ls.removeItem('sxr_updates_nudge_at'); unudge.classList.add('hidden'); win.renderSiteUpdates(); };

  // 第一次來的人不跳
  ls.removeItem('sxr_updates_seen'); ls.removeItem('sxr_updates_nudge_done');
  win.renderSiteUpdates();
  t.eq('第一次來的人不跳更新通知', win.maybeShowUpdatesNudge(), false);
  t.eq('沒有新更新不跳', win.maybeShowUpdatesNudge(), false);

  resetUpd();
  win.eval("UPDATES_QUIET_UNTIL = '2000-01-01'");
  t.eq('有新更新時打開網站跳通知', win.maybeShowUpdatesNudge(), true);
  t.ok('通知出現', !unudge.classList.contains('hidden'));
  t.ok('通知寫出最新更新的標題', doc.querySelector('#updNudgeText').textContent.includes(updates[0].title), doc.querySelector('#updNudgeText').textContent);

  // 不跟問卷小卡片疊在一起
  win.eval('LIVE = true; SURVEY_NUDGE_SHOWN = false;');
  ['sxr_survey_snooze_until', 'sxr_survey_last_submit'].forEach((k) => ls.removeItem(k));
  t.eq('更新通知在畫面上時問卷小卡片先不跳', win.maybeShowSurveyNudge('test'), false);
  t.ok('問卷小卡片沒出現', snudge.classList.contains('hidden'));
  unudge.classList.add('hidden');
  win.eval('LIVE = false;');

  // 晚點再看：這次的更新不再跳，但小紅點還在
  resetUpd();
  win.maybeShowUpdatesNudge();
  doc.querySelector('#btnUpdNudgeLater').click();
  t.ok('按「晚點再看」收起通知', unudge.classList.contains('hidden'));
  t.eq('「晚點再看」之後這次的更新不再跳', win.maybeShowUpdatesNudge(), false);
  t.ok('「晚點再看」不算看過，小紅點還在', tabDot() > 0);
  // 一週之內就算又有新的更新也不跳（嵐：不要每次更新都跳）
  t.eq('一週內又有新更新也不再跳',
    (() => { ls.setItem('sxr_updates_nudge_done', updates[1].date); return win.maybeShowUpdatesNudge(); })(), false);
  // 滿一週之後才會再跳
  t.eq('隔一週之後有新的更新才會再跳',
    (() => { ls.setItem('sxr_updates_nudge_at', String(Date.now() - 8 * 864e5)); return win.maybeShowUpdatesNudge(); })(), true);
  t.ok('跳出來的時候記下時間，當作一週的起算點',
    Number(ls.getItem('sxr_updates_nudge_at')) > Date.now() - 5000, ls.getItem('sxr_updates_nudge_at'));
  unudge.classList.add('hidden');
  unudge.classList.add('hidden');

  // 去看看：切到「我的」、展開更新紀錄、捲過去
  resetUpd();
  if (!panel.classList.contains('collapsed')) h2.click();
  doc.querySelector('.tab[data-tab="browse"]').click();
  win.maybeShowUpdatesNudge();
  let scrolledTo = null;
  panel.scrollIntoView = function () { scrolledTo = this.id; };
  doc.querySelector('#btnUpdNudgeGo').click();
  t.ok('按「去看看」收起通知', unudge.classList.contains('hidden'));
  t.eq('按「去看看」切到「我的」分頁', doc.querySelector('.tab[data-tab="mine"]').getAttribute('aria-selected'), 'true');
  t.ok('按「去看看」展開更新紀錄', !panel.classList.contains('collapsed'));
  await new Promise((r) => win.setTimeout(r, 300));
  t.eq('按「去看看」捲到更新紀錄', scrolledTo, 'siteUpdatesPanel');
  await new Promise((r) => win.setTimeout(r, 2700));
  t.eq('看了幾秒後標成已讀', ls.getItem('sxr_updates_seen'), updates[0].date);
  t.eq('看過之後不再跳', win.maybeShowUpdatesNudge(), false);

  // 在別的地方看過更新（例如自己打開「我的」），通知也跟著收起
  resetUpd();
  win.maybeShowUpdatesNudge();
  win.markUpdatesSeen();
  t.ok('更新標成已讀時通知跟著收起', unudge.classList.contains('hidden'));

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
