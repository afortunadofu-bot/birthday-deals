/* 嵐：「大家都在用什麼跟最多人收藏，可以看到每個月份的人數，現在都是混在一起」
       「現在地圖跟打開定位的頁面有點佔版面，看能不能縮小一點垂直空間，
         你的灰色小字能不能拿 ⓘ 隱藏之類的」

   1. 兩張榜多一個月份選單：選了月份就跟資料庫要那個月的彙總（v83），
      而且多一欄「人數」——同一個人用好幾次只算一個人。
   2. 「附近」那一塊：說明文字收進 ⓘ，按了才展開；地圖載入失敗這種錯誤不能被藏起來。 */
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t30 榜單看月份＋附近面板瘦身');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const offers = win.eval('OFFERS');

  /* ================= 1. 月份選單 ================= */
  const ym = new Date().toISOString().slice(0, 7);
  t.ok('「大家都在用什麼」有月份選單', !!$('#popMonth'));
  t.ok('「最多人收藏」也有', !!$('#wishMonth'));
  t.eq('預設是全部時間（跟以前一樣）', $('#popMonth').value, '');
  const opts = [...$('#popMonth').options].map((o) => o.value);
  t.eq('第一個選項是全部時間', opts[0], '');
  t.ok('列得出最近 12 個月', opts.length === 13 && opts[1] === ym, opts.slice(0, 3));
  t.ok('本月那一格標出來', /本月/.test($('#popMonth').options[1].textContent));

  const calls = [];
  win.__sb = {
    rpc: (name, p) => {
      calls.push([name, p]);
      if (name === 'offer_usage_by_month') {
        return Promise.resolve({ data: [
          { offer_id: offers[1].id, user_count: 9, report_count: 12, success_count: 10, saved_total: 900 },
          { offer_id: offers[0].id, user_count: 4, report_count: 20, success_count: 18, saved_total: 800 },
        ], error: null });
      }
      if (name === 'offer_wish_by_month') {
        return Promise.resolve({ data: [
          { offer_id: offers[2].id, wish_count: 7 },
          { offer_id: offers[0].id, wish_count: 3 },
        ], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
  win.eval('sb = window.__sb; LIVE = true;');

  $('#popMonth').value = ym; $('#popMonth').dispatchEvent(new win.Event('change'));
  await tick(win, 3);
  t.eq('選了月份才去查那個月', calls[0], ['offer_usage_by_month', { p_ym: ym }]);
  const head = () => [...doc.querySelectorAll('#popBody thead th')].map((x) => x.textContent.trim());
  const rows = () => [...doc.querySelectorAll('#popBody tbody tr')].map((tr) => tr.textContent.replace(/\s+/g, ' ').trim());
  t.ok('多一欄人數', head().includes('人數'), head());
  t.ok('照人數排，不是照次數',
    rows()[0].includes(offers[1].brand) && /9 人/.test(rows()[0]), rows()[0]);
  t.ok('次數多但人數少的排後面', rows()[1].includes(offers[0].brand) && /4 人/.test(rows()[1]), rows()[1]);
  t.ok('說明寫清楚一個人只算一次',
    /同一個人用好幾次只算一個人/.test($('#popBody').closest('.panel').querySelector('.sub').textContent));

  $('#wishMonth').value = ym; $('#wishMonth').dispatchEvent(new win.Event('change'));
  await tick(win, 3);
  t.eq('收藏也查那個月', calls[1], ['offer_wish_by_month', { p_ym: ym }]);
  const whead = [...doc.querySelectorAll('#wishBody thead th')].map((x) => x.textContent.trim());
  t.ok('收藏那欄改寫「收藏人數」', whead.includes('收藏人數'), whead);
  t.ok('列出那個月收藏最多的',
    [...doc.querySelectorAll('#wishBody tbody tr')][0].textContent.includes(offers[2].brand));

  // 切回全部時間：不用再查一次，回到原本的榜
  calls.length = 0;
  $('#popMonth').value = ''; $('#popMonth').dispatchEvent(new win.Event('change'));
  await tick(win, 2);
  t.eq('切回全部時間不用再查', calls.length, 0);
  t.ok('人數那一欄收起來', !head().includes('人數'), head());

  // v83 還沒跑
  win.__sb = { rpc: () => Promise.resolve({ data: null, error: { message: 'function public.offer_usage_by_month does not exist' } }) };
  win.eval('sb = window.__sb;');
  $('#popMonth').value = ym; $('#popMonth').dispatchEvent(new win.Event('change'));
  await tick(win, 3);
  t.ok('v83 沒跑時只講暫時讀不到（v155：排行榜不提 SQL）', /暫時讀不到/.test($('#popBody').textContent)
    && !/schema_|SQL|Supabase|管理員/.test($('#popBody').textContent), $('#popBody').textContent.slice(0, 120));

  /* ================= 2. 附近面板瘦身 ================= */
  t.ok('有一顆 ⓘ', !!$('#btnNearInfo'));
  t.ok('說明文字預設收起來', $('#nearNotes').classList.contains('hidden'));
  t.ok('位置說明在 ⓘ 裡面', /不會存起來/.test($('#nearNotes').textContent));
  $('#btnNearInfo').click();
  t.ok('按了才展開', !$('#nearNotes').classList.contains('hidden'));
  t.eq('按鈕狀態跟著改', $('#btnNearInfo').getAttribute('aria-expanded'), 'true');
  $('#btnNearInfo').click();
  t.ok('再按一次收起來', $('#nearNotes').classList.contains('hidden'));

  // 地圖載入失敗這種錯誤不能被藏起來
  win.eval('LIVE = true; NEAR.active = true;');
  win.loadLeaflet = async () => false;
  await win.openNearMap();
  await tick(win, 2);
  t.ok('地圖載不到時把說明打開讓人看得到', !$('#nearNotes').classList.contains('hidden'));
  t.ok('錯誤訊息講人話', /地圖載入失敗/.test($('#nearMapHint').textContent), $('#nearMapHint').textContent);

  // 垂直空間：狀態列跟工具列分兩行，按鈕高度壓低
  const css = [...doc.querySelectorAll('style')].map((s) => s.textContent).join('');
  t.ok('附近面板的按鈕有壓低高度', /\.near-bar \.btn\.sm\{[^}]*min-height:30px/.test(css));
  t.ok('面板本身的留白也縮了', /\.near-bar\{[^}]*padding:8px 10px/.test(css));
  t.ok('ⓘ 跟 ✕ 在同一行、工具按鈕在下一行',
    !!$('.near-head #btnNearInfo') && !!$('.near-tools #btnNearMap'));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
