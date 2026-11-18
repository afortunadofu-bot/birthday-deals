/* v165：celine
   「已註冊會員的地方不夠明顯，而且要可以篩選」（看 t83 第七段）
   「我要能直接看到我在這家店花了多少跟省多少，然後要可以看到統計加總，我省下跟使用回報區域合併」 */
const { boot, tick, makeSb, makeAsserts, stubHeavy } = require('./harness');

(async () => {
  const t = makeAsserts('t84 v165：我省下多少＋使用回報合併、每一家花多少省多少');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];
  stubHeavy(win, ['loadMyVenueSuggestions', 'loadPendingBadge', 'maybeShowBirthdayCheer', 'renderReminders']);

  /* ---- 合併 ---- */
  t.ok('使用回報住在「我省下多少」裡', $('#mySavingsPanel').contains($('#myReports')));
  t.ok('「我送出過的」不再有使用回報那一格', !$('#myRecordsPanel .rec-tab[data-rec="Reports"]') && !$('#recReports'));
  t.ok('在地圖上看那顆也跟著搬過來', $('#mySavingsPanel').contains($('#btnReportsMap')));

  win.eval(`LIVE=true; me={id:'u-1'};
    MY_REPORTS=[
      {id:1,offer_id:7,used_on:'2026-10-01',result:'success',saved_twd:300,spent_twd:200,offers:{brand:'王品'}},
      {id:2,offer_id:7,used_on:'2026-10-20',result:'success',saved_twd:300,spent_twd:null,offers:{brand:'王品'}},
      {id:3,offer_id:8,used_on:'2026-10-05',result:'success',saved_twd:80,spent_twd:0,offers:{brand:'星巴克'}},
      {id:4,offer_id:9,used_on:'2026-10-06',result:'failed',saved_twd:0,spent_twd:150,offers:{brand:'失敗那家'}}];
    renderMyReports({success:['成功','ok'],partial:['部分','partial'],failed:['失敗','fail']});`);

  t.ok('有回報：那一段出現', !$('#myRepWrap').classList.contains('hidden'));
  t.ok('預設看「每一家」', !$('#myShopTotals').classList.contains('hidden') && $('#myReports').classList.contains('hidden'));

  // v197 起「每一家」也是一張表：店家／次／花／省／評分，格子只放數字
  const shops = $$('#myShopTotals tbody tr.rl-row');
  const txt = (el) => el.textContent.replace(/\s+/g, ' ').trim();
  const cell = (row, cls) => txt(row.querySelector(cls));
  t.eq('表頭：店家、次、花、省、評分', $$('#myShopTotals thead th').map(txt), ['店家', '次', '花', '省', '評分']);
  t.eq('一家一列（同一家的回報加起來），省最多的在上面', shops.map((r) => cell(r, '.rl-brand')), ['王品', '星巴克', '失敗那家']);
  t.eq('王品：2 次、花 $200、省 $600', [cell(shops[0], '.rl-n'), cell(shops[0], '.rl-spent'), cell(shops[0], '.rl-saved')], ['2', '$200', '$600']);
  t.eq('花 0 元的照樣寫 $0（填了 0 跟沒填不一樣）', cell(shops[1], '.rl-spent'), '$0');
  const total = $('#myShopTotals tfoot tr');
  t.ok('最下面一列合計：3 家、4 次', /合計 3 家/.test(txt(total)) && cell(total, '.rl-n') === '4', txt(total));
  t.eq('合計花＝有填的加起來', cell(total, '.rl-spent'), '$350');
  t.eq('合計省＝全部加起來', cell(total, '.rl-saved'), '$680');
  t.ok('幾次沒填寫在表格下面，不塞進格子', /另外 1 次沒填/.test(txt($('#myShopTotals .rl-note'))) && !/沒填/.test(txt(total)));

  let opened = null, openedRep = null;
  win.openDetail = (id) => { opened = id; };
  win.openReport = (oid, r) => { openedRep = [oid, r && r.id]; };
  win.eval('openDetail=window.openDetail; openReport=window.openReport');
  shops[0].click();
  t.eq('點那一列（花、省）：打開這家的使用回報', openedRep, [7, 1]);
  t.eq('…不是開詳情', opened, null);
  shops[0].querySelector('.rl-brand-link').click();
  t.eq('點店名：開那筆的詳情', opened, '7');

  $('#myRepWrap [data-rv="each"]').click();
  t.ok('切「每一次」：一筆一列', !$('#myReports').classList.contains('hidden') && $('#myShopTotals').classList.contains('hidden'));
  // v197 起「每一次」是一張表：表頭寫花／省，格子只放數字
  const eachRows = $$('#myReports tr.rl-row');
  t.eq('四筆都在', eachRows.length, 4);
  t.ok('每一筆寫出花多少、省多少', eachRows[0].querySelector('.rl-spent').textContent.trim() === '$200'
    && /\$300/.test(eachRows[0].querySelector('.rl-saved').textContent), txt(eachRows[0]));
  t.eq('沒填的那一筆寫「—」', eachRows[1].querySelector('.rl-spent').textContent.trim(), '—');
  t.eq('記住上次看哪一種', win.localStorage.getItem('sxr_my_rep_view'), 'each');
  $('#myRepWrap [data-rv="shop"]').click();

  win.eval('MY_REPORTS=[]; renderMyReports();');
  t.ok('一筆回報都沒有：那一段整個不出現', $('#myRepWrap').classList.contains('hidden'));

  /* ---- 詳情：你在這家花了多少、省了多少 ---- */
  const real = await boot();      // 上面把 openDetail 換掉了，開一個乾淨的
  const w2 = real.win;
  w2.__sb = makeSb({ tables: { comments: [], usage_reports: [], offer_ratings: [], offer_edit_history: [],
    offer_edits_pending_preview: [], profiles_public: [] } });
  w2.eval(`sb=window.__sb; LIVE=true; me={id:'u-1'};
    MY_REPORTS=[{id:1,offer_id:7,used_on:'2026-10-01',result:'success',saved_twd:300,spent_twd:200,offers:{brand:'王品'}},
                {id:2,offer_id:7,used_on:'2026-10-21',result:'success',saved_twd:300,spent_twd:250,offers:{brand:'王品'}}];
    OFFERS=[{id:7,brand:'王品',category:'餐廳',regions:[],offer:'送牛排',membership:'',membershipType:'app',membershipCost:'free',
      freeTier:'free_min',advanceDays:0,advanceNote:'',timing:'當月',valueTwd:300,conditions:'',validity:'',validityType:'rolling',
      sources:[],bestSource:null,status:'approved',reportCount:2,commentCount:0,ratingAvg:null,ratingCount:0,wishCount:0,transferable:'unknown'}];`);
  await w2.openDetail(7);
  await tick(w2, 4);
  const here = w2.document.querySelector('#dtlBody .my-shop-here');
  t.ok('詳情裡寫「你在這家用了 2 次：花 $450 省 $600」', here && /用了 2 次/.test(here.textContent)
    && /花 \$450/.test(here.textContent) && /省 \$600/.test(here.textContent), here && here.textContent);
  w2.eval("document.querySelector('#dlgDetail').close(); me=null;");
  await w2.openDetail(7);
  await tick(w2, 4);
  t.ok('沒登入：不寫', !w2.document.querySelector('#dtlBody .my-shop-here'));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
