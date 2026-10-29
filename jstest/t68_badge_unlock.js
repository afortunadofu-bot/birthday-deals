/* v147：celine「成就徽章每次達成都會跳 popup 是希望妳改成要跳」

   原本解鎖徽章完全沒有任何反應——格子從灰的變成彩色，但你要自己捲到「我的」
   才會發現。現在新解鎖會跳一張卡片。

   這一支最在意的不是「會不會跳」，而是**不該跳的時候不要跳**：
   1. 這個功能上線以前就拿到的徽章，第一次開不能一次噴八個
   2. 同一個徽章只恭喜一次
   3. 別的視窗開著的時候不要疊上去（送出回報之後會先自動開詳情問星等） */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, stubHeavy } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/* my_savings 這個 view 會回的欄位，只取徽章門檻用得到的那幾個 */
const SV = (o = {}) => ({
  saved_total: 0, saved_this_year: 0, success_count: 0, brands_used: 0, ...o,
});

(async () => {
  const t = makeAsserts('t68 解鎖新徽章會跳出來');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  const dlg = $('#dlgBadgeUnlock');
  t.ok('有這張卡片', !!dlg);
  t.ok('一開始是關著的', !dlg.open);
  t.ok('有「看我的徽章」', !!$('#btnBuSee'));

  /* 徽章要有穩定的 id——用 label 當鍵的話，哪天把「老饕」改個名字，
     所有人都會被重新恭喜一次。 */
  t.ok('每個徽章都有 id', win.eval('BADGE_DEFS.every(b=>!!b.id)'));
  t.ok('id 沒有重複',
    win.eval('new Set(BADGE_DEFS.map(b=>b.id)).size===BADGE_DEFS.length'));

  stubHeavy(win, ['render', 'renderMyWishlist', 'renderReminders', 'loadOffers']);
  win.eval("LIVE=true; me={id:'u-1'};");
  const seenKey = 'sxr_badges_seen_u-1';
  win.localStorage.clear();

  /* ---- 1. 第一次：只建檔，不恭喜 ----
     功能上線前已經有 3 次回報、省了 2000 的人，第一次打開「我的」會同時符合
     初體驗／小資達人／省錢高手。如果把「沒紀錄」當成「剛解鎖」就一次噴三個。 */
  win.renderBadges(SV({ success_count: 3, saved_total: 2000 }));
  await tick(win, 2);
  t.ok('第一次不跳', !dlg.open);
  const seeded = JSON.parse(win.localStorage.getItem(seenKey) || '[]');
  t.ok('但已經把現況記下來了', seeded.length === 3, seeded);
  t.ok('記的是 id 不是名字', seeded.includes('first') && seeded.includes('save2k'), seeded);

  /* ---- 2. 之後多出來的才跳 ---- */
  win.renderBadges(SV({ success_count: 10, saved_total: 2000 }));
  await tick(win, 2);
  t.ok('再解鎖一個就跳了', dlg.open);
  t.ok('標題是單數', /解鎖新徽章/.test($('#buTitle').textContent), $('#buTitle').textContent);
  t.ok('只列這次新拿到的那一個', doc.querySelectorAll('#buList .bu-row').length === 1);
  t.ok('列的是「常客」', /常客/.test($('#buList').textContent), $('#buList').textContent);
  t.ok('大圖示就是那個徽章', $('#buHero').textContent === '🔥', $('#buHero').textContent);
  /* nt() 自己會加 $，次數用它會印成「$10次」 */
  t.ok('次數不要變成「$10次」', !/\$10/.test($('#buList').textContent), $('#buList').textContent);
  t.ok('而且有講目前幾次', /10\s*次/.test($('#buList').textContent), $('#buList').textContent);

  /* ---- 3. 同一個徽章不會恭喜第二次 ---- */
  dlg.close();
  win.renderBadges(SV({ success_count: 10, saved_total: 2000 }));
  await tick(win, 2);
  t.ok('同一組條件再算一次不會再跳', !dlg.open);

  /* ---- 4. 資料被改小也不要之後再恭喜一次（只增不減）---- */
  win.renderBadges(SV({ success_count: 1, saved_total: 0 }));
  await tick(win, 2);
  t.ok('掉回去不跳', !dlg.open);
  win.renderBadges(SV({ success_count: 10, saved_total: 2000 }));
  await tick(win, 2);
  t.ok('再回來也不跳（已經恭喜過了）', !dlg.open);

  /* ---- 5. 一次解鎖好幾個：一張卡列完，不是連跳三張 ---- */
  win.renderBadges(SV({ success_count: 30, saved_total: 5000, brands_used: 10 }));
  await tick(win, 2);
  t.ok('一次多解鎖幾個也只跳一張', dlg.open);
  t.ok('標題講出幾個', /解鎖 \d+ 個新徽章/.test($('#buTitle').textContent), $('#buTitle').textContent);
  t.ok('全部列出來', doc.querySelectorAll('#buList .bu-row').length >= 3,
    doc.querySelectorAll('#buList .bu-row').length);
  t.ok('金額的那一個寫 $，不是「$5,000元」',
    /\$5,000/.test($('#buList').textContent) && !/\$5,000元/.test($('#buList').textContent),
    $('#buList').textContent.replace(/\s+/g, ' '));
  dlg.close();

  /* ---- 6. 別的視窗開著的時候不要疊上去 ----
     送出使用回報之後會自動開「優惠詳情」問星等（POST_REPORT_PROMPT_ID），
     那時候 loadMyStuff() 才剛算完徽章。兩張卡疊起來的話，關掉上面那張底下
     還有一張，看起來像沒關掉。 */
  win.localStorage.clear();
  win.renderBadges(SV({ success_count: 1 }));          // 先建檔
  await tick(win, 2);
  const detail = $('#dlgDetail');
  detail.showModal();
  win.renderBadges(SV({ success_count: 10 }));
  await tick(win, 2);
  t.ok('有別的視窗開著就先不要跳', !dlg.open);
  detail.close();
  /* 真機上是靠 close 事件馬上跳，但 jsdom 的 <dialog> 是 harness 自己補的，
     close() 不會派送 close 事件（真瀏覽器會）。這裡等的是另一條路：定時重試。
     那條保險本來就是為了「有瀏覽器不派送 close」才加的，等於順便測到它。 */
  await new Promise((r) => setTimeout(r, 1100));
  t.ok('那張關掉之後才跳', dlg.open);
  dlg.close();

  /* ---- 7. 生日卡片那天不跟它搶 ----
     生日卡片是一整頁的 overlay（不是 dialog），而且那天螢幕上已經有一場了。 */
  win.localStorage.clear();
  win.renderBadges(SV({ success_count: 1 }));
  await tick(win, 2);
  let toast = '';
  win.__toast = (m) => { toast = m; };
  win.eval('showToast=(m,d)=>window.__toast(m);');
  $('#bdayCheer').classList.remove('hidden');
  win.renderBadges(SV({ success_count: 10 }));
  await tick(win, 3);
  t.ok('生日卡片開著的時候不跳卡片', !dlg.open);
  t.ok('但還是有講一句', /新徽章/.test(toast) && /常客/.test(toast), toast);
  $('#bdayCheer').classList.add('hidden');

  /* ---- 8. 沒有回報紀錄（sv 是 null）不要炸 ---- */
  win.localStorage.clear();
  let threw = false;
  try { win.renderBadges(null); } catch (e) { threw = true; }
  t.ok('沒有紀錄的人不要炸', !threw);
  t.ok('而且不要替他建一份空檔', !win.localStorage.getItem(seenKey));

  /* ---- 9. 分帳號存，換帳號不會互相影響 ---- */
  t.ok('鍵帶著帳號 id', /sxr_badges_seen'\+\(me\?\.id\?\('_'\+me\.id\)/.test(index));

  /* ---- 10. 返回鍵關得掉，而且多推的那筆歷史紀錄要吐掉 ----
     開場有 pushDlgHistory() 卻沒掛 consumeDlgHistory 的話，返回鍵第一下會被
     那筆幽靈紀錄吃掉、畫面沒反應（dlgNotif／dlgCoffee 都犯過這個）。
     v145 的 dlgBulkAdd 當初也漏掛，這裡一起守住。 */
  t.ok('返回鍵的關閉清單裡有它', /dlgBadgeUnlock'\)\]\.forEach/.test(index.replace(/\$\('#/g, "('#")));
  ['dlgBadgeUnlock', 'dlgBulkAdd'].forEach((id) => {
    t.ok(`${id} 關掉會把歷史紀錄吐掉`,
      index.includes(`$('#${id}').addEventListener('close', consumeDlgHistory)`));
  });

  t.done();
})().catch((e) => { console.error(e); process.exit(1); });
