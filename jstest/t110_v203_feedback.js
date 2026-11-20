/* v203 楊晴（11/19）兩則：
   1.「可以增加當月至下個月都能用的優惠標籤嗎？…很想一次蒐集其他家！」
   2.「一趟用最多」照你的待辦清單：「能夠有地方選說排除收藏裡面已用過的，再去看哪個地點最多我剩下可以去換的」 */
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t110 v203 用到下個月、待辦清單不算用過的');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];

  /* ---- 1. 用到下個月 ---- */
  const nm = (o) => win.eval(`nextMonthOk(${JSON.stringify(o)})`);
  t.ok('「生日該月份至隔月月底」', nm({ validity: '生日該月份至隔月月底' }));
  t.ok('「生日當日起 60 天內」', nm({ validity: '生日當日起 60 天內' }));
  t.ok('寫在優惠內容裡的「效期到生日隔月月底」', nm({ offer: '主廚特製壽桃乙份 優惠券效期到生日隔月月底' }));
  t.ok('「生日當月至次月7日」', nm({ validity: '生日當月至次月7日' }));
  t.ok('「次月壽星會在 5 月發送」講的是發券時間，不算', !nm({ advanceNote: '既有會員：於每月25日發送給次月壽星' }));
  t.ok('「前 2 個月加入」不算', !nm({ conditions: '須於生日月份「前 2 個月」加入會員' }));
  t.ok('「365 天內消費滿」不算', !nm({ conditions: '會員級別:七分熟(365天內消費滿$6,000)' }));
  t.ok('「生日當日起 30 天」不到下個月，不算', !nm({ validity: '生日當日起 30 天內' }));

  const target = win.eval(`(()=>{ const o=OFFERS.find(x=>!nextMonthOk(x)); o.validity='生日該月份至隔月月底'; return o.id; })()`);
  win.eval('render()');
  t.ok('卡片上有「用到下個月」', /用到下個月/.test(win.eval(`offerCardHtml(OFFERS.find(o=>o.id===${JSON.stringify(target)}),0)`)));
  const before = win.eval('OFFERS.filter(filterPredicate()).length');
  $('#fNextMonth').click();
  const shown = win.eval('OFFERS.filter(filterPredicate()).map(o=>o.id)');
  t.ok('勾起來只剩用得到下個月的', shown.includes(target) && shown.length < before && win.eval(`OFFERS.filter(filterPredicate()).every(nextMonthOk)`), shown.length + ' / ' + before);
  t.ok('篩選中看得到「用到下個月」', $$('#activeFilters .af-chip').some((b) => /用到下個月/.test(b.textContent)));
  t.eq('篩選按鈕的數字 +1', $('#filterBadge').textContent, '1');
  win.eval('saveFilters(); $("#fNextMonth").checked=false; loadFilters();');
  t.ok('篩選會記住', $('#fNextMonth').checked);
  $('#btnClearFilters').click();
  t.ok('全部清除也清掉', !$('#fNextMonth').checked);

  /* ---- 2. 照你的待辦清單：不算用過的 ---- */
  const ids = win.eval('OFFERS.slice(0,3).map(o=>String(o.id))');
  win.eval(`(()=>{ me={id:'u1'};
    WISH=new Set(${JSON.stringify(ids)});
    MY_USED_OFFER_IDS=new Set(${JSON.stringify(ids.slice(0, 2))});
    VENUES=[{id:1,name:'甲商圈',county:'台北市',lat:25,lng:121,offer_count:30},{id:2,name:'乙商圈',county:'台北市',lat:25,lng:121,offer_count:5}];
    VENUE_PAIRS=new Map([[1,new Set(${JSON.stringify(ids.slice(0, 2))})],[2,new Set([${JSON.stringify(ids[2])}])]]);
    try{ localStorage.removeItem(PREF_KEY); }catch{}
    renderVenueRecs(); })()`);
  const names = () => $$('#venueRecs .vr-row b').map((b) => b.textContent);
  t.ok('收藏裡有用過的：出現勾選，預設勾著', !!$('#vrSkipUsed') && $('#vrSkipUsed').checked);
  t.eq('預設只看剩下能換的：甲商圈的兩筆都用過了，不推', names(), ['乙商圈']);
  t.ok('說明寫的是還沒用過的筆數', /還沒用過的有 1 筆/.test($('#venueRecs').textContent), $('#venueRecs').textContent.replace(/\s+/g, ' '));
  $('#vrSkipUsed').click();
  t.eq('取消勾選：照全部收藏排（甲 2 筆在前）', names(), ['甲商圈', '乙商圈']);
  t.ok('選擇記在這台裝置', win.eval('loadPrefs().venueRecsSkipUsed') === false);
  win.eval('renderVenueRecs()');
  t.ok('重畫還是不勾', !$('#vrSkipUsed').checked);
  win.eval('MY_USED_OFFER_IDS=new Set(); renderVenueRecs();');
  t.ok('收藏裡沒有用過的：不出現那個勾選', !$('#vrSkipUsed'));

  /* ---- 2.5 有效月份（celine：「選有效期限月份的功能，可以選區間」）---- */
  const nov = 'new Date(2026,10,20)';
  const inM = (o, a, b, bm) => win.eval(`(()=>{ $('#fMonthFrom').value='${a}'; $('#fMonthTo').value='${b}';
    return offerInMonths(${JSON.stringify(o)}, monthRange(), ${bm}, ${nov}); })()`);
  const rolling = { validityType: 'rolling', validity: '生日當月' };
  const rolling2 = { validityType: 'rolling', validity: '生日該月份至隔月月底' };
  t.ok('生日 11 月：選 11 月 → 一般生日優惠算', inM(rolling, 11, '', 11) === true);
  t.ok('生日 11 月：選 12 月 → 一般的不算', inM(rolling, 12, '', 11) === false);
  t.ok('生日 11 月：選 12 月 → 用到下個月的算', inM(rolling2, 12, '', 11) === true);
  t.ok('跨年區間（12～2 月），生日 1 月算', inM(rolling, 12, 2, 1) === true);
  t.ok('沒填生日：生日優惠推不出來，先不擋（null）', inM(rolling, 3, 4, 0) === null);
  const dated = { validityType: 'fixed', validFrom: '2026-09-01', validUntil: '2026-09-30', validity: '' };
  t.ok('活動 9 月：選 11～12 月不算', inM(dated, 11, 12, 11) === false);
  t.ok('活動到 12/31：選 12 月算', inM({ validityType: 'fixed', validUntil: '2026-12-31' }, 12, '', 0) === true);
  t.ok('今天 11 月選 1～2 月＝明年：到 2026-12-31 的不算', inM({ validityType: 'fixed', validUntil: '2026-12-31' }, 1, 2, 0) === false);
  t.ok('派券日至生日當月月底（fixed 但沒日期）照生日算', inM({ validityType: 'fixed', validity: '派券日至生日當月月底' }, 5, '', 5) === true);

  win.eval(`$('#bmonth').value='11'; $('#fMonthFrom').value='12'; $('#fMonthTo').value='1'; render();`);
  const shown12 = win.eval('OFFERS.filter(filterPredicate()).length');
  const total12 = win.eval('OFFERS.length');
  t.ok('生日 11 月選 12～1 月：只剩用得到下個月、或活動期間有重疊的', shown12 > 0 && shown12 < total12, `${shown12}/${total12}`);
  t.ok('篩選中看得到「12～1 月能用」', $$('#activeFilters .af-chip').some((b) => /12～1 月能用/.test(b.textContent)));
  t.ok('有生日：不出現「先填生日」那句', $('#monthNote').classList.contains('hidden'));
  win.eval(`$('#bmonth').value=''; render();`);
  t.ok('沒生日：講清楚只篩有寫日期的', !$('#monthNote').classList.contains('hidden') && /填了生日/.test($('#monthNote').textContent));
  win.eval('saveFilters(); $("#fMonthFrom").value=""; $("#fMonthTo").value=""; loadFilters();');
  t.eq('篩選會記住', [$('#fMonthFrom').value, $('#fMonthTo').value], ['12', '1']);
  $$('#activeFilters .af-chip').find((b) => /月能用/.test(b.textContent)).click();
  t.eq('從篩選中拿掉', [$('#fMonthFrom').value, $('#fMonthTo').value], ['', '']);

  /* ---- 3. 好康地圖的視窗（celine：「你跳一個 popup 然後有超連結」）---- */
  const go = $('#btnPromoGo');
  t.ok('視窗裡有好康地圖的連結（新分頁、帶來源）', !!go && /^https:\/\/tw-deals\.pages\.dev\/\?utm_source=shouxingri/.test(go.getAttribute('href'))
    && go.getAttribute('target') === '_blank' && /noopener/.test(go.getAttribute('rel')));
  t.ok('測試環境預設不跳', !$('#dlgPromo').open);
  t.ok('日期內才跳', win.eval(`promoActive(new Date(2026,10,20))`) && win.eval(`promoActive(new Date(2026,11,4))`)
    && !win.eval(`promoActive(new Date(2026,11,5))`) && !win.eval(`promoActive(new Date(2026,10,19))`));
  win.eval(`window.__SXR_NO_PROMO=false; promoActive=()=>true; localStorage.removeItem(PROMO_KEY);
    $$('dialog').forEach(d=>{ if(d.open) d.close(); }); window.__ev2=[]; const _l=logEvent; logEvent=(a,b)=>{ window.__ev2.push([a,b]); };`);
  t.ok('第一次：跳出來', win.eval('maybeShowPromo()') === true && $('#dlgPromo').open);
  t.ok('記一筆「看到視窗」', win.eval('window.__ev2.some(e=>e[0]==="promo_open")'));
  go.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  t.ok('點連結：記成從視窗點的（跟頁尾分開算）', win.eval('window.__ev2.some(e=>e[0]==="studio_click" && e[1].to==="haokang" && e[1].from==="popup")'),
    JSON.stringify(win.eval('window.__ev2')));
  await tick(win, 2);
  t.ok('點完視窗自己關', !$('#dlgPromo').open);
  t.ok('同一台裝置不再跳', win.eval('maybeShowPromo()') === false);
  win.eval(`localStorage.removeItem(PROMO_KEY); $('#dlgDetail').showModal();`);
  t.ok('有別的視窗開著時不跳', win.eval('maybeShowPromo()') === false);
  win.eval(`$('#dlgDetail').close();`);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
