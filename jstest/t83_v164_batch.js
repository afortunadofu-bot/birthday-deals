/* v164：11/1–11/2 嵐、使用者回饋那一批

   陳：「待辦清單的部分卡牌在上下移動時，備註會消失」
   嵐：「為什麼排行榜寫三個人點進來，底下場館卻有 47 個人」
   楊晴：「可以加個標籤是不需提前加入之類的」「省錢統計…我也想知道我實際花了多少錢」
   嵐：「統計花費金額／人數，讓其他人有個概念這家會花多少」→「進到篩選」
   嵐：「留言太多要可以一次滑到底，也要有摺疊留言的功能」「一開始可以只看到有留言的，
        只有已使用的不用特別標（如果使用數＞10）」
   嵐：「希望使用多次的人可以跳一個，給這個 app 一句回饋的地方」
   Lena：「勾選已註冊會員…勾選已收到優惠券」
   嵐：「商圈可以按照近到遠跟收藏數量排列」
   嵐：「修改待審有通過也可以當白名單」（SQL） */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeSb, makeAsserts, stubHeavy } = require('./harness');

const sql = fs.readFileSync(path.join(__dirname, '..', 'schema_v164_spend_whitelist_flags.sql'), 'utf8');

const base = {
  category: '速食', regions: ['台北市'], membership: '', membershipCost: 'free', freeTier: 'free_min',
  timing: '當月', valueTwd: 60, conditions: '', validity: '', validityType: 'rolling', sources: [],
  bestSource: null, status: 'approved', reportCount: 0, commentCount: 0, ratingAvg: null, ratingCount: 0,
  wishCount: 0, transferable: 'unknown', advanceNote: '',
};
const OFFERS = [
  { ...base, id: 1, brand: '不用會員', membershipType: 'none', advanceDays: null },
  { ...base, id: 2, brand: '當月加入', membershipType: 'ocard', advanceDays: 0, advanceNote: 'Ocard 多數品牌當月加入即可領券，建議提前幾天加入' },
  { ...base, id: 3, brand: '三商巧福', membershipType: 'app', advanceDays: 0, advanceNote: '需提前加入 APP 並完成會員註冊' },
  { ...base, id: 4, brand: '沒寫', membershipType: 'app', advanceDays: null },
  { ...base, id: 5, brand: '要預約', membershipType: 'none', advanceDays: 3 },
  { ...base, id: 6, brand: '提前七天', membershipType: 'line', advanceDays: 7 },
];

(async () => {
  const t = makeAsserts('t83 v164：備註、點進人數、篩選、花費、留言、一句回饋、已註冊、商圈排序');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];
  stubHeavy(win, ['loadMyVenueSuggestions', 'loadPendingBadge', 'maybeShowBirthdayCheer', 'renderReminders']);
  win.__offers = OFFERS;
  win.eval('OFFERS = window.__offers.map(o=>({...o}));');

  /* ================= 一、待辦清單：移動之後備註還在 ================= */
  const sb1 = makeSb({ tables: { wishlist: [] } });
  win.__sb = sb1;
  win.eval(`sb=window.__sb; LIVE=true; me={id:'u-1'}; myProfile={id:'u-1'};
    WL_ROWS=[{offer_id:1,done:false,note:'',sort_order:0,created_at:'2026-11-01T00:00:00Z',year:${new Date().getFullYear()},offers:{brand:'不用會員'}},
             {offer_id:2,done:false,note:'',sort_order:1,created_at:'2026-11-01T00:00:01Z',year:${new Date().getFullYear()},offers:{brand:'當月加入'}}];
    document.querySelector('#wlSort').value='manual'; renderWishlistBody();`);
  const ta = () => $('#myWishlist .wl-note[data-id="2"]');
  ta().value = '記得帶會員卡';
  ta().dispatchEvent(new win.Event('input'));
  await win.eval('moveWishlistItem(2,-1)');
  await tick(win, 3);
  t.eq('移上去之後，剛剛打的備註還在', ta().value, '記得帶會員卡');
  t.eq('而且排到第一個', $('#myWishlist .wl-item').dataset.wlRow, '2');

  /* ================= 二、點分頁列也記「點進這一頁」 ================= */
  win.eval("window.__ev=[]; logEvent=(type,meta)=>window.__ev.push([type,meta]); ACTIVE_TAB='browse';");
  const tab = (k) => $(`.tab[data-tab="${k}"]`);
  tab('trip').click(); tab('trip').click(); tab('board').click();
  const tabs = JSON.parse(win.eval('JSON.stringify(window.__ev.filter(e=>e[0]==="tab_open").map(e=>e[1].tab))'));
  t.eq('點下面的分頁列有記（v163 漏掉的就是這一條）；同一頁點兩次只算一次', tabs, ['trip', 'board']);
  win.eval("showSection('mine')");
  t.ok('從按鈕跳過去的也照樣記', JSON.parse(win.eval('JSON.stringify(window.__ev.map(e=>e[1]&&e[1].tab))')).includes('mine'));
  t.ok('統計那邊講清楚 11/2 以前少算', /11\/2（v164）以前少算很多/.test(win.document.documentElement.innerHTML)
    || /11\/2（v164）以前少算很多/.test(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')));

  /* ================= 三、不用提前加入 ================= */
  const ok = (id) => win.eval(`noAdvanceOk(OFFERS.find(o=>o.id===${id}))`);
  t.ok('不用會員、不用預約：算', ok(1) === true);
  t.ok('寫明 0 天、說明只是「建議」：算', ok(2) === true);
  t.ok('0 天但說明寫「需提前加入 APP」（三商巧福）：不算，照說明', ok(3) === false);
  t.ok('沒寫幾天：不算（不知道就不要說不用）', ok(4) === false);
  t.ok('不用會員但要提前預約：不算', ok(5) === false);
  t.ok('要提前七天：不算', ok(6) === false);
  $('#fNoAdvance').checked = true;
  const shown = () => JSON.parse(win.eval('JSON.stringify(OFFERS.filter(filterPredicate()).map(o=>o.id))'));
  win.eval("document.querySelector('#fLive').checked=false;");
  t.eq('勾起來只剩那兩筆', shown(), [1, 2]);
  t.ok('上面那排「目前的篩選」看得到', JSON.parse(win.eval('JSON.stringify(activeFilterChips().map(c=>c.label))')).includes('不用提前加入'));
  win.eval('saveFilters()');
  t.ok('會記住', JSON.parse(win.localStorage.getItem('sxr_filters_v1')).fNoAdvance === true);
  $('#btnClearFilters').click();
  t.ok('清除篩選會一起清掉', !$('#fNoAdvance').checked);

  /* ================= 四、大家實際花多少 ================= */
  const sb2 = makeSb({ rpcs: { offer_spend_summary: [
    { offer_id: 1, n: 5, avg_spent: 80, min_spent: 0, max_spent: 150 },
    { offer_id: 2, n: 4, avg_spent: 260, min_spent: 100, max_spent: 400 },
    { offer_id: 3, n: 12, avg_spent: 900, min_spent: 300, max_spent: 2000 },
    { offer_id: 4, n: 1, avg_spent: 50, min_spent: 50, max_spent: 50 },
  ] } });
  win.__sb = sb2;
  win.eval('sb=window.__sb; SPEND_TRIED=false;');
  await win.eval('loadSpendSummary()');
  await tick(win, 2);
  t.ok('有資料：篩選裡多一排「實際花費」', !$('#spendRow').classList.contains('hidden'));
  t.eq('只列有東西的區間，括號是幾筆（1 個人回報的不算）',
    $$('#spendChips .chip').map((c) => c.textContent),
    ['不限', '平均花 $100 內（1）', '平均花 $100～300（1）', '平均花 $500 以上（1）']);
  $$('#spendChips .chip')[1].click();
  t.eq('選「$100 內」：只剩那一筆', shown(), [1]);
  $$('#spendChips .chip')[3].click();
  t.eq('可以複選', shown(), [1, 3]);
  t.ok('「目前的篩選」看得到', JSON.parse(win.eval('JSON.stringify(activeFilterChips().map(c=>c.label))')).includes('平均花 $500 以上'));
  $('#btnClearFilters').click();
  t.eq('清除篩選也清掉這一排', shown().length, 6);
  const card = (id) => win.eval(`offerCardHtml(OFFERS.find(o=>o.id===${id}),0)`);
  t.ok('卡片寫「大家平均花」', /大家平均花 \$80/.test(card(1)));
  t.ok('只有一個人回報的不寫（不準）', !/大家平均花/.test(card(4)));
  t.ok('SQL：失敗的回報不算', /r\.result <> 'failed'/.test(sql));
  t.ok('SQL：不用 security definer（權限跟直接讀那張表一樣）',
    !/offer_spend_summary[\s\S]{0,400}security definer/.test(sql));

  /* ================= 五、詳情的回報＋留言 ================= */
  const long = '很長'.repeat(90);
  const reps = [];
  for (let i = 0; i < 14; i++) reps.push({ id: 'r' + i, offer_id: 3, used_on: '2026-10-' + String(10 + i), result: i === 13 ? 'failed' : 'success',
    saved_twd: 100, user_id: 'u-9', note: i < 2 ? (i === 0 ? long : '店員很快') : '' });
  const sb3 = makeSb({ tables: {
    comments: [{ id: 'c1', body: long, created_at: '2026-10-30T03:00:00Z', is_hidden: false, user_id: 'u-2' },
               { id: 'c2', body: '短的', created_at: '2026-10-29T03:00:00Z', is_hidden: false, user_id: 'u-2' }],
    usage_reports: reps, offer_ratings: [], offer_edit_history: [], offer_edits_pending_preview: [],
    profiles_public: [{ id: 'u-2', display_name: '嵐' }],
  } });
  win.__sb = sb3;
  win.eval('sb=window.__sb; me={id:"u-1"};');
  await win.openDetail(3);
  await tick(win, 4);
  const body = $('#dtlBody');
  t.ok('最上面一條：幾筆回報、幾則留言', /使用回報 14 筆・留言 2 則/.test(body.querySelector('.thread-bar').textContent));
  t.eq('回報超過 10 筆：只列有寫字的那幾筆', body.querySelectorAll('.thread-body > .rep').length, 2);
  t.ok('沒寫字的收成一行統計', /另外 12 筆只回報了用過、沒寫字/.test(body.textContent)
    && /成功 11/.test(body.textContent) && /失敗 1/.test(body.textContent));
  body.querySelector('.rep-quiet-show').click();
  t.eq('「列出來」：全部看得到', body.querySelectorAll('.rep-quiet:not(.hidden) .rep').length, 12);
  const clamped = body.querySelectorAll('.clamp');
  t.eq('太長的留言、太長的回報備註先摺起來（短的不摺）', clamped.length, 2);
  body.querySelector('.cmt .txt-more').click();
  t.ok('「展開全文」', !body.querySelector('.cmt .body').classList.contains('clamp') && !body.querySelector('.cmt .txt-more'));
  body.querySelector('.th-fold').click();
  t.ok('「收起」：整串收起來', body.querySelector('.thread-body').classList.contains('hidden'));
  t.ok('…但留言框還在（收起來也能寫）', !!body.querySelector('.ci') && !body.querySelector('.thread-body').contains(body.querySelector('.ci')));
  t.eq('按鈕變「展開」', body.querySelector('.th-fold').textContent, '展開');
  body.querySelector('.th-fold').click();
  t.ok('再按一次打開', !body.querySelector('.thread-body').classList.contains('hidden'));
  let scrolled = null;
  win.HTMLElement.prototype.scrollIntoView = function () { scrolled = this; };
  body.querySelector('.th-bottom').click();
  t.ok('「↓ 到最下面」捲到留言框那一格', scrolled && scrolled.contains(body.querySelector('.ci')));

  // 回報不多的時候照舊全部列（嵐說的是「＞10」）
  sb3.__calls.select.length = 0;
  win.__sb = makeSb({ tables: { comments: [], usage_reports: reps.slice(0, 5), offer_ratings: [], offer_edit_history: [],
    offer_edits_pending_preview: [], profiles_public: [] } });
  win.eval('sb=window.__sb;');
  await win.openDetail(3);
  await tick(win, 4);
  t.eq('5 筆：全部照列，沒有收成一行', $('#dtlBody').querySelectorAll('.thread-body > .rep').length, 5);
  t.ok('沒有統計那一行', !$('#dtlBody .rep-quiet-sum'));
  win.eval("document.querySelector('#dlgDetail').close()");

  /* ================= 六、用很多次的人：一句回饋 ================= */
  const sb4 = makeSb({ tables: { site_feedback: [] } });
  win.__sb = sb4;
  win.eval(`sb=window.__sb; me={id:'u-7'}; localStorage.removeItem('sxr_oneline_u-7');
    ['#updatesNudge','#surveyNudge','#geoNudge','#rateNudge'].forEach(k=>document.querySelector(k).classList.add('hidden'));
    document.querySelectorAll('dialog').forEach(d=>d.open&&d.close());
    MY_REPORTS=[1,2,3,4].map(i=>({id:i,result:'success'}));`);
  t.ok('用了 4 次：不跳', win.eval('maybeShowOneLine()') === false);
  win.eval("MY_REPORTS.push({id:5,result:'success'})");
  t.ok('5 次：跳', win.eval('maybeShowOneLine()') === true && !$('#oneLineNudge').classList.contains('hidden'));
  t.ok('寫出用了幾次', /5 次/.test($('#oneLineTitle').textContent));
  $('#btnOneLineSend').click();
  await tick(win, 2);
  // 只看這一張表：整包跑的時候前面段落排的計時器（問卷、事件…）可能剛好在這裡觸發、寫到別張表
  const fbWrites = () => sb4.__calls.write.filter((w) => w.table === 'site_feedback');
  t.ok('空白不能送', /一句/.test($('#oneLineErr').textContent) && !fbWrites().length,
    JSON.stringify({ err: $('#oneLineErr').textContent, writes: sb4.__calls.write.map((w) => w.table) }));
  $('#oneLineMsg').value = '好用！朋友都在用';
  $('#btnOneLineSend').click();
  await tick(win, 4);
  const w = sb4.__calls.write.find((c) => c.table === 'site_feedback');
  t.ok('送進回報網站問題那張表，類型＝一句回饋', w && w.args[0].type === 'praise' && w.args[0].message === '好用！朋友都在用');
  t.ok('送完收起來、不再跳', $('#oneLineNudge').classList.contains('hidden') && win.eval('maybeShowOneLine()') === false);
  win.eval("localStorage.removeItem('sxr_oneline_u-7')");
  win.eval('maybeShowOneLine()');
  $('#btnOneLineLater').click();
  t.ok('「之後再說」：30 天內不再跳', win.eval('maybeShowOneLine()') === false
    && JSON.parse(win.localStorage.getItem('sxr_oneline_u-7')).until > Date.now() + 29 * 864e5);
  win.eval("localStorage.removeItem('sxr_oneline_u-7'); document.querySelector('#rateNudge').classList.remove('hidden');");
  t.ok('評分小卡在畫面上：讓它，不疊', win.eval('maybeShowOneLine()') === false);
  win.eval("document.querySelector('#rateNudge').classList.add('hidden')");
  t.ok('審核那邊的類型名稱', win.eval('FB_TYPE_LABEL.praise') === '💬 一句回饋');
  t.ok('SQL：類型清單加上 praise', /check \(type in \('bug', 'suggestion', 'duplicate', 'praise'\)\)/.test(sql));

  /* ================= 七、待辦清單：已註冊會員／已收到優惠券 ================= */
  const sb5 = makeSb({ tables: { wishlist: [] } });
  win.__sb = sb5;
  win.eval(`sb=window.__sb; me={id:'u-1'}; WL_FLAGS=true;
    WL_ROWS=[{offer_id:6,done:false,note:'',sort_order:0,created_at:'2026-11-01T00:00:00Z',year:${new Date().getFullYear()},
      registered:false,got_coupon:false,offers:{brand:'提前七天',advance_days:7}}];
    renderWishlistBody();`);
  const flag = (k) => $(`#myWishlist .wl-flag[data-flag="${k}"]`);
  const flip = (k) => { const c = flag(k); c.checked = !c.checked; c.dispatchEvent(new win.Event('change')); };
  t.ok('兩個：已註冊會員、已收到優惠券', !!flag('registered') && !!flag('got_coupon'));
  /* v165 celine：「已註冊會員的地方不夠明顯，而且要可以篩選」 */
  t.ok('是真的勾選框（看得出能勾）', flag('registered').type === 'checkbox');
  t.ok('自己一行，不跟「📝 備註」擠在一起', !!flag('registered').closest('.wl-status')
    && !flag('registered').closest('.wl-chips'));
  flip('registered');
  await tick(win, 3);
  t.ok('勾下去：整顆變綠', flag('registered').checked && flag('registered').closest('.wl-check').classList.contains('on'));
  const up = sb5.__calls.write.find((c) => c.table === 'wishlist' && c.op === 'update');
  t.eq('寫回自己那一列', up && up.args[0], { registered: true });
  win.eval("document.querySelector('#bmonth').value='12'; document.querySelector('#bday').value='1'; renderPlanner();");
  t.ok('註冊死線那邊標「已註冊」', /已註冊/.test($('#deadlines .dl[data-oid="6"]')?.textContent || ''));
  t.ok('優惠卡片上也標「你已註冊會員」', /你已註冊會員/.test(win.eval('offerCardHtml(OFFERS.find(o=>o.id===6),0)')));
  t.ok('沒註冊的卡片不標', !/你已註冊會員/.test(win.eval('offerCardHtml(OFFERS.find(o=>o.id===5),0)')));

  // 篩選
  win.eval(`WL_ROWS.push({offer_id:5,done:false,note:'',sort_order:1,created_at:'2026-11-01T00:00:01Z',year:${new Date().getFullYear()},
      registered:false,got_coupon:true,offers:{brand:'要預約'}}); syncWlReg(); renderWishlistBody();`);
  t.ok('會員篩選出現', !$('#wlRegFilterWrap').classList.contains('hidden'));
  const rows = () => $$('#myWishlist .wl-item').map((e) => e.dataset.wlRow).sort();
  const pick = (v) => { $('#wlRegFilter').value = v; $('#wlRegFilter').dispatchEvent(new win.Event('change')); return rows(); };
  t.eq('已註冊會員', pick('reg'), ['6']);
  t.eq('還沒註冊會員', pick('unreg'), ['5']);
  t.eq('已收到券', pick('coupon'), ['5']);
  t.eq('還沒收到券', pick('nocoupon'), ['6']);
  t.eq('全部', pick('all'), ['5', '6']);
  win.eval("document.querySelector('#wlCompact').checked=true; renderWishlistBody();");
  t.ok('簡易版：標題列上有「✓ 已註冊」', /✓ 已註冊/.test($('#myWishlist [data-wl-row="6"]').textContent));
  win.eval("document.querySelector('#wlCompact').checked=false;");
  win.eval('WL_FLAGS=false; renderWishlistBody();');
  t.ok('v164 沒跑（沒有那兩欄）：勾選框跟篩選都不出現', !flag('registered') && $('#wlRegFilterWrap').classList.contains('hidden'));
  win.eval("WL_ROWS=[]; syncWlReg();");

  /* ================= 八、我實際花了多少 ================= */
  win.eval(`MY_REPORTS=[{result:'success',spent_twd:200,saved_twd:500},{result:'success',spent_twd:100,saved_twd:300},
    {result:'success',spent_twd:null,saved_twd:400},{result:'failed',spent_twd:999,saved_twd:0}]; renderMySpent();`);
  const sp = $('#mySpent').textContent.replace(/\s+/g, ' ');
  /* v165 起花多少、省多少寫在「每一家」那張表跟合計列（t84），這裡只剩一句划不划算 */
  t.ok('有填的加起來（失敗的不算）', /有填「這次花多少」的 2 次/.test(sp) && /花 \$300/.test(sp), sp);
  t.ok('跟同樣那幾次省下的比', /省 \$800/.test(sp), sp);
  t.ok('講出沒填的幾次沒算', /另外 1 次沒填/.test(sp));
  t.ok('划不划算', /每花 1 元，省下 2\.7 元/.test(sp), sp);

  /* ================= 九、商圈排序 ================= */
  win.eval(`me={id:'u-1'}; WISH=new Set(['1','2','3']);
    VENUES=[{id:1,name:'遠的大商圈',county:'台北市',lat:25.10,lng:121.60,offer_count:40},
            {id:2,name:'近的小商圈',county:'台北市',lat:25.047,lng:121.517,offer_count:10},
            {id:3,name:'收藏最多',county:'台北市',lat:25.03,lng:121.56,offer_count:20}];
    VENUE_PAIRS=new Map([[1,new Set(['1'])],[2,new Set([])],[3,new Set(['1','2','3'])]]);
    VENUE_HERE={lat:25.0478,lng:121.5170};`);
  const order = () => $$('#venueList .venue-name').map((e) => e.textContent);
  const setSort = (v) => { $('#venueSort').value = v; $('#venueSort').dispatchEvent(new win.Event('change')); };
  setSort('count');
  t.eq('店家最多（原本的）', order(), ['遠的大商圈', '收藏最多', '近的小商圈']);
  setSort('near');
  t.eq('離我最近', order(), ['近的小商圈', '收藏最多', '遠的大商圈']);
  t.ok('離我最近：寫出距離', !!$('#venueList .venue-dist'));
  setSort('wish');
  t.eq('我收藏最多', order(), ['收藏最多', '遠的大商圈', '近的小商圈']);

  /* ================= 十、白名單（SQL） ================= */
  t.ok('SQL：新投稿自動上架也數被核可的修改建議', /from public\.offer_edits x\s+where x\.proposed_by = new\.submitted_by\s+and x\.status = 'approved'/.test(sql));
  t.ok('SQL：門檻照舊 2', /MIN_APPROVED constant integer := 2/.test(sql) && /v_offers \+ v_edits < MIN_APPROVED/.test(sql));
  t.ok('SQL：停權的照舊不算', /coalesce\(p\.is_banned, false\)\) then\s+return null/.test(sql));
  t.ok('SQL：留痕跡寫出各幾筆', /筆修改建議被核可）/.test(sql));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
