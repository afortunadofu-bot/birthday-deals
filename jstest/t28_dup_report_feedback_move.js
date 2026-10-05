/* 嵐這一批：回報重複的按鈕、回報網站問題搬到「我的」、排行榜店家標籤排版

   1.「多一個發現重複可以回報的按鈕」：優惠詳情裡一顆「🔁 這筆重複了」，
      按了開回報視窗、先把「#編號 店名」填好，類型自動選「重複的優惠」。
      v80 還沒跑的站台 type 會被 check constraint 擋下來，要自動退回 bug 並標 [重複]。
   2.「回報網站問題移到我的」：按鈕在「我的」分頁，頁尾只留信箱。
   3.「排版不統一」：排行榜「顯示全部」展開的那段，要跟前 15 個在同一個 flex 容器裡
      （display:contents），不然前後兩套間距。 */
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t28 回報重複＋回報入口搬家');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  /* ================= 1. 回報網站問題搬到「我的」 ================= */
  const btn = $('#btnFeedback');
  t.ok('按鈕在「我的」分頁裡', !!btn && !!btn.closest('#tab-mine'));
  t.ok('不在頁尾了', !btn.closest('footer'));
  t.ok('訪客也看得到（不在會員專屬區塊裡）', !btn.closest('#mineAuthedPanels'));
  t.ok('頁尾還留著聯絡信箱', /celine\.fu@gmail\.com/.test(doc.querySelector('footer').textContent));
  t.ok('頁尾有指路到「我的」', /我的/.test(doc.querySelector('footer').textContent),
    doc.querySelector('footer').textContent.replace(/\s+/g, ' ').trim());

  /* ================= 2. 排行榜店家標籤：前後同一套間距 ================= */
  win.eval(`OFFERS = [];`);
  const brands = Array.from({ length: 20 }, (_, i) => `店家${i + 1}`);
  const html = win.brandChipsHtml(brands, 0);
  const box = doc.createElement('div');
  box.innerHTML = html;
  const more = box.querySelector('.regchips-more');
  t.ok('超過 15 個才需要「顯示全部」', !!more && !!box.querySelector('.brand-showmore'));
  t.ok('展開的那段不是另一個 .regchips（不會變成第二套排版）',
    more && !more.classList.contains('regchips'), more && more.className);
  t.ok('展開的那段沒有被寫死 display:inline', more && !/display:\s*inline/.test(more.getAttribute('style') || ''),
    more && more.getAttribute('style'));
  t.eq('前 15 個直接放在 flex 容器裡', box.querySelectorAll('.regchips > .chip').length, 15);
  t.eq('其餘的放在 display:contents 的盒子裡', more.querySelectorAll('.chip').length, 5);
  const css = [...doc.querySelectorAll('style')].map((s) => s.textContent).join('');
  t.ok('.regchips-more 用 display:contents 併進同一個 flex', /\.regchips-more\{display:contents\}/.test(css));
  t.ok('收起來時還是 display:none', /\.regchips-more\.hidden\{display:none\}/.test(css));
  t.ok('chip 高度統一（button 跟 span 的行高不一樣）',
    /\.regchips \.chip\{[^}]*inline-flex/.test(css), css.match(/\.regchips \.chip\{[^}]*\}/));

  /* ================= 3. 回報重複 ================= */
  t.ok('詳情視窗有「這筆重複了」', !!$('#btnDtlDup') && /重複/.test($('#btnDtlDup').textContent));
  t.ok('類型選單多一個「重複的優惠」',
    [...$('#fbType').options].map((o) => o.value).includes('duplicate'));

  win.eval(`OFFERS = [{id:41, brand:'再睡5分鐘', offer:'生日免費', regions:[], sources:[]}];
    dtlId = 41; me = null;`);
  $('#btnDtlDup').click();
  await tick(win, 2);
  t.eq('類型自動選重複', $('#fbType').value, 'duplicate');
  t.eq('先幫忙填好是哪一筆', $('#fbMsg').value, '#41 再睡5分鐘 這筆跟別筆重複：');
  t.ok('標題跟著換', /重複/.test($('#fbDlgTitle').textContent), $('#fbDlgTitle').textContent);
  t.ok('提示寫清楚要填什麼', /同一家/.test($('#fbMsg').placeholder), $('#fbMsg').placeholder);
  t.ok('詳情視窗關掉了（不然兩個視窗疊在一起）', !$('#dlgDetail').open);

  /* ---- 送出：v80 跑過的站台 ---- */
  const inserts = [];
  win.__sb = { from: () => ({ insert: (row) => { inserts.push(row); return Promise.resolve({ error: null }); } }) };
  win.eval('sb = window.__sb; LIVE = true;');
  $('#btnFbSubmit').click();
  await tick(win, 3);
  t.eq('送出的類型是 duplicate', inserts[0].type, 'duplicate');
  t.ok('內容有帶編號', /#41/.test(inserts[0].message));

  /* ---- 送出：v80 還沒跑，type 被 check constraint 擋下來 ---- */
  inserts.length = 0;
  let nth = 0;
  win.__sb2 = {
    from: () => ({
      insert: (row) => {
        inserts.push(row);
        nth += 1;
        // 第一次（duplicate）被擋，退回 bug 之後才成功
        return Promise.resolve(nth === 1
          ? { error: { message: 'new row for relation "site_feedback" violates check constraint "site_feedback_type_check"' } }
          : { error: null });
      },
    }),
  };
  win.eval('sb = window.__sb2;');
  win.openFeedback('duplicate', '#41 再睡5分鐘 這筆跟別筆重複：跟 #391 一樣');
  $('#btnFbSubmit').click();
  await tick(win, 4);
  t.eq('被擋下來會再送一次', inserts.length, 2);
  t.eq('退回成一般的問題回報', inserts[1].type, 'bug');
  t.ok('內文前面標 [重複]，後台看得出來', /^\[重複\]/.test(inserts[1].message), inserts[1].message);
  t.ok('使用者看到的是成功', /已收到/.test($('#fbMsgBox').textContent), $('#fbMsgBox').textContent);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
