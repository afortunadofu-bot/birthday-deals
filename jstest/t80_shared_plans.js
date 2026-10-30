/* v161：大家的行程

   嵐：「行程有一塊是民眾投稿之類的，大家可以分享自己規劃的行程，不一定要同個商圈，
        可以加段落跟備注。例：免費一路拿拿拿／一個人也可以吃到飽／生日當天最省行程」
   celine：「公開給所有人看的內容不用審核」「行程可以分享收藏跟一鍵加入的功能」

   這一支最在意的：
   - 段落跟店家在同一張清單：編號、家數、完成數、地圖都只算店家
   - 不審核，但底線在資料庫：停權的不能公開、管理員只碰得到公開的、私人的管理員也看不到
   - 公開要有名稱跟至少一家店
   - 複製出去的是**一份新的、私人的**行程，日期不帶
   - v161 沒跑：行程照常（退回舊的查詢），「大家的行程」整塊不出現 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, stubHeavy } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sql = fs.readFileSync(path.join(__dirname, '..', 'schema_v161_shared_plans.sql'), 'utf8');

(async () => {
  const t = makeAsserts('t80 大家的行程：段落、公開、收藏、一鍵加入');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];
  stubHeavy(win, ['render', 'loadOffers', 'loadVenues', 'loadMyVenueSuggestions', 'loadPendingBadge',
    'maybeShowBirthdayCheer', 'openDetail', 'renderMyWishlist', 'renderReminders']);

  win.eval(`LIVE=true; me={id:'u-1'}; myProfile=null;
    OFFERS=[1,2,3,4,5].map(i=>({id:i, brand:'品牌'+i, offer:'優惠'+i}));
    WISH=new Set(); MY_USED_OFFER_IDS=new Set();`);

  /* ================= 一、v161 沒跑：行程照常 ================= */
  const asked = [];
  win.__asked = asked;
  win.eval(`sb={ from:(tb)=>{ const o={}; o.select=(cols)=>{ window.__asked.push(cols); return o; };
      o.eq=()=>o;   // v162：排除範例行程（is_example）
      o.order=()=>o; o.limit=()=>Promise.resolve(/is_public/.test(window.__asked.slice(-1)[0])
        ? {data:null, error:{message:'column plans.is_public does not exist'}}
        : {data:[{id:1,plan_date:null,title:'舊的',note:null,plan_items:[{id:9,offer_id:1,note:null,sort_order:0,done:false}]}], error:null});
      return o; },
    rpc:()=>Promise.resolve({data:null, error:{message:'Could not find the function public.shared_plans'}}) };
    PLANS=null; PLAN_V161=true; PLAN_COLS='id,plan_date,title,note,created_at,is_public,shared_at,plan_items(id,offer_id,heading,note,sort_order,done)';`);
  await win.eval('loadPlans()');
  t.eq('先試新的查詢，失敗就退回舊的', asked.length, 2);
  t.ok('退回之後行程照常', /舊的/.test($('#planBody').textContent));
  win.eval('PLAN_OPEN=1; renderPlans();');
  t.ok('沒跑 v161：沒有「＋ 段落」', !$('[data-psec]'));
  t.ok('沒跑 v161：沒有「公開給大家看」', !$('[data-ppub]'));
  await win.eval('loadShared()');
  t.ok('沒跑 v161：「大家的行程」整塊不出現（不是放一行「還沒開放」）', $('#pnlShared').classList.contains('hidden'));

  /* ================= 二、段落 ================= */
  win.eval(`PLAN_V161=true; PLANS_OWNER='u-1'; PLANS_ERR=''; PLAN_OPEN=1;
    PLANS=[{id:1,plan_date:null,title:'',note:null,is_public:false,shared_at:null,items:[
      {id:20,offer_id:null,heading:'上午・免費一路拿',note:'十點開門',sort_order:0,done:false},
      {id:21,offer_id:1,heading:null,note:null,sort_order:1,done:true},
      {id:22,offer_id:2,heading:null,note:null,sort_order:2,done:false},
      {id:23,offer_id:null,heading:'中午',note:null,sort_order:3,done:false},
      {id:24,offer_id:3,heading:null,note:null,sort_order:4,done:false}]}];
    renderPlans();`);
  t.eq('編號只數店家，跨段落接著數', $$('#planBody .pi-no').map((e) => e.textContent), ['1', '2', '3']);
  t.eq('兩個段落標題', $$('#planBody .pi-head').length, 2);
  t.ok('家數不算段落', /3 家 · 1 完成/.test($('#planBody .plan-n').textContent), $('#planBody .plan-n').textContent);
  t.ok('段落沒有「完成」可以勾', !$('#planBody .pi-head [data-idone]'));
  t.ok('段落也能調順序', !!$('#planBody .pi-head [data-idown]'));
  t.eq('地圖的中心選項只看店家', win.eval("JSON.stringify(planStops(PLANS[0]).map(i=>i.offer_id))"), '[1,2,3]');
  t.ok('挑店時已經在裡面的照樣排除，段落不算', /exclude:planStops\(plan\)/.test(index));

  const writes = [];
  win.__w = writes;
  win.eval(`sb={ from:(tb)=>{ const o={};
      o.insert=(row)=>{ o._op='insert'; o._row=row; return o; };
      o.update=(row)=>{ o._op='update'; o._row=row; return o; };
      o.delete=()=>{ o._op='delete'; return o; };
      o.select=()=>o; o.single=()=>o; o.order=()=>o; o.limit=()=>o;
      o.eq=(c,v)=>{ o._eq=(o._eq||[]).concat([[c,v]]); return o; };
      o.then=(res)=>{ window.__w.push({tb, op:o._op, row:o._row, eq:o._eq});
        const fail=window.__fail&&window.__fail(tb,o._op,o._row);
        if(fail) return Promise.resolve({data:null,error:{message:fail}}).then(res);
        const d=o._op==='insert'?(Array.isArray(o._row)?o._row.map((r,i)=>({id:500+i,...r})):{id:900,offer_id:null,done:false,note:null,...o._row}):null;
        return Promise.resolve({data:d,error:null}).then(res); };
      return o; },
    rpc:()=>Promise.resolve({data:[],error:null}) };`);

  win.eval("document.querySelector('[data-psec=\"1\"]').click()");
  await tick(win, 3);
  t.eq('加段落：接在最後面', writes[0]?.row, { plan_id: 1, heading: '新的一段', sort_order: 5 });
  t.ok('加完畫出來', $$('#planBody .pi-head').length === 3);

  writes.length = 0;
  const h = $('[data-ihead="20"]');
  h.value = '  早上・免費一路拿拿拿  ';
  h.dispatchEvent(new win.Event('change'));
  await tick(win, 2);
  t.eq('改段落標題', writes[0]?.row, { heading: '早上・免費一路拿拿拿' });
  writes.length = 0;
  $('[data-ihead="20"]').value = '   ';
  $('[data-ihead="20"]').dispatchEvent(new win.Event('change'));
  await tick(win, 2);
  t.eq('標題清空不送，退回原本的字', [writes.length, $('[data-ihead="20"]').value], [0, '早上・免費一路拿拿拿']);

  /* ================= 三、公開 ================= */
  writes.length = 0;
  const pub = () => $('[data-ppub="1"]');
  pub().checked = true; pub().dispatchEvent(new win.Event('change'));
  await tick(win, 2);
  t.eq('沒有名稱不能公開', writes.length, 0);
  t.ok('而且勾勾退回去', !pub().checked);
  t.ok('講清楚為什麼', /取個名稱/.test($$('.toast').map((e) => e.textContent).join(' ')));

  win.eval("PLANS[0].title='生日當天最省行程'; renderPlans();");
  pub().checked = true; pub().dispatchEvent(new win.Event('change'));
  await tick(win, 3);
  const up = writes.find((w) => w.tb === 'plans' && w.op === 'update');
  t.eq('公開：is_public 跟時間一起送', [up?.row.is_public, typeof up?.row.shared_at], [true, 'string']);
  t.ok('標題上標「公開中」', /公開中/.test($('[data-plan="1"] .plan-head').textContent));
  t.ok('講清楚別人看得到什麼、日期不顯示', /日期不會顯示/.test(index));

  // 送失敗（例如被停權，RLS 擋下來）：退回去
  writes.length = 0;
  win.__fail = (tb, op, row) => tb === 'plans' && op === 'update' && row && row.is_public === false ? 'new row violates row-level security policy' : null;
  pub().checked = false; pub().dispatchEvent(new win.Event('change'));
  await tick(win, 3);
  t.ok('收回送失敗：畫面退回「公開中」', win.eval('PLANS[0].is_public') === true && pub().checked);
  win.__fail = null;

  /* ================= 四、大家的行程 ================= */
  win.eval(`SHARED=[
      {id:9,title:'一個人也可以吃到飽',note:'全程搭捷運',author:'嵐',mine:false,saved:false,n_stops:2,n_saves:4},
      {id:10,title:'我自己的',note:null,author:'celine',mine:true,saved:false,n_stops:1,n_saves:0}];
    SHARED_ITEMS.set(9,[{id:1,offer_id:null,heading:'午餐',note:'先排隊',sort_order:0},
      {id:2,offer_id:4,heading:null,note:'B1',sort_order:1},{id:3,offer_id:5,heading:null,note:null,sort_order:2}]);
    SHARED_ITEMS.set(10,[]);
    document.querySelector('#pnlShared').classList.remove('hidden');
    SHARED_OPEN=9; renderShared();`);
  const sbox = $('#sharedBody');
  t.ok('看得到作者跟收藏數', /嵐/.test(sbox.textContent) && /♡ 4/.test(sbox.textContent));
  t.ok('自己的那一趟寫「你的」', /你的/.test($('[data-shared="10"] .plan-head').textContent));
  t.ok('段落、備註、店家都看得到', /午餐/.test(sbox.textContent) && /先排隊/.test(sbox.textContent) && /品牌4/.test(sbox.textContent));
  t.eq('編號只數店家', $$('#sharedBody .pi-no').map((e) => e.textContent), ['1', '2']);

  // 收藏
  writes.length = 0;
  win.eval("document.querySelector('[data-ssave=\"9\"]').click()");
  await tick(win, 3);
  t.eq('收藏寫進 plan_saves', [writes[0]?.tb, writes[0]?.op, writes[0]?.row], ['plan_saves', 'insert', { user_id: 'u-1', plan_id: 9 }]);
  t.ok('數字跟著加', /♡ 5/.test($('#sharedBody').textContent));
  t.ok('按鈕變成「已收藏」', /已收藏/.test($('[data-ssave="9"]').textContent));
  win.eval("document.querySelector('#sharedSavedOnly').checked=true; document.querySelector('#sharedSavedOnly').onchange();");
  t.eq('只看我收藏的', $$('#sharedBody [data-shared]').map((e) => e.dataset.shared), ['9']);
  win.eval("document.querySelector('#sharedSavedOnly').checked=false; document.querySelector('#sharedSavedOnly').onchange();");
  t.ok('自己的那一趟沒有收藏鈕（收藏自己的沒有意義）',
    !win.eval("sharedBodyHtml(SHARED[1])").includes('data-ssave'));

  // 沒登入不能收藏，但看得到
  win.eval("me=null; SHARED[0].saved=false; renderShared();");
  writes.length = 0;
  win.eval("document.querySelector('[data-ssave=\"9\"]').click()");
  await tick(win, 2);
  t.eq('沒登入：不送', writes.length, 0);
  t.ok('沒登入：講要登入', /要先登入/.test($$('.toast').map((e) => e.textContent).join(' ')));
  win.eval("me={id:'u-1'};");

  // 一鍵加入：整趟複製
  writes.length = 0;
  win.eval('loadPlans=()=>Promise.resolve();');
  await win.eval('copySharedPlan(9)');
  const np = writes.find((w) => w.tb === 'plans' && w.op === 'insert');
  t.eq('複製：新的一趟是自己的', np?.row.user_id, 'u-1');
  t.ok('複製：不帶日期（那是原作者那一天）', !('plan_date' in (np?.row || {})));
  t.ok('複製：不會自己公開出去', !('is_public' in (np?.row || {})));
  const its = writes.find((w) => w.tb === 'plan_items' && w.op === 'insert');
  t.eq('複製：段落、店家、備註、順序都帶', its?.row.map((r) => [r.offer_id, r.heading, r.note, r.sort_order]),
    [[null, '午餐', '先排隊', 0], [4, null, 'B1', 1], [5, null, null, 2]]);
  t.eq('複製完打開那一趟', win.eval('PLAN_OPEN'), 900);

  // 一鍵加入：店家加進待辦清單（同一張勾選清單）
  win.eval("WISH=new Set(['4']); renderShared();");
  t.ok('已經收藏的不算', /店家加進待辦清單（1）/.test($('[data-swish="9"]').textContent));
  win.eval("document.querySelector('[data-swish=\"9\"]').click()");
  await tick(win, 2);
  t.ok('打開勾選清單', $('#dlgBulkAdd').open);
  t.ok('標題是那一趟的名字', /一個人也可以吃到飽/.test($('#bulkAddSub').textContent), $('#bulkAddSub').textContent);
  $('#dlgBulkAdd').close();
  t.ok('加完重畫這一塊，不是去找商圈那一格', /typeof venueId==='number'\) fillVenue\(venueId\); else renderShared\(\)/.test(index));

  // 管理員
  t.ok('一般人沒有管理的按鈕', !$('[data-sunpub]'));
  win.eval("myProfile={is_admin:true}; renderShared();");
  t.ok('管理員：別人的有「取消公開」「刪除」', !!$('[data-sunpub="9"]') && !!$('[data-sdel="9"]'));
  t.ok('管理員：自己的不出現（自己在上面改就好）', !win.eval("sharedBodyHtml(SHARED[1])").includes('data-sunpub'));

  /* ================= SQL ================= */
  t.ok('段落：店家可以是空的，但兩個不能都空', /alter column offer_id drop not null/.test(sql)
    && /check \(offer_id is not null or heading is not null\)/.test(sql));
  t.ok('讀：自己的或公開的', /for select using \(user_id = auth\.uid\(\) or is_public\)/.test(sql));
  t.ok('公開要沒被停權（擋在資料庫）', /\(not is_public or not public\.is_banned\(\)\)/.test(sql));
  /* for all 會讓管理員連私人行程都讀得到 */
  t.ok('管理員只碰得到公開的，而且不是 for all',
    /plans_admin_update on public\.plans\s+for update using \(public\.is_admin\(\) and is_public\)/.test(sql)
    && !/plans_admin\w* on public\.plans\s+for all/.test(sql));
  t.ok('寫店家：只能寫進自己的行程', /plan_items_insert on public\.plan_items\s+for insert with check \(exists \(select 1 from public\.plans p\s+where p\.id = plan_items\.plan_id and p\.user_id = auth\.uid\(\)\)\)/.test(sql));
  t.ok('只能收藏公開的', /plan_saves_insert[\s\S]{0,200}p\.is_public/.test(sql));
  t.ok('清單不列停權的人', /not coalesce\(pr\.is_banned, false\)/.test(sql));
  t.ok('作者名字照排行榜那一套', /when pr\.show_on_leaderboard and coalesce\(pr\.display_name, ''\) <> ''/.test(sql)
    && /'匿名壽星'/.test(sql));
  t.ok('可以重複跑', /add column if not exists heading/.test(sql) && /when duplicate_object then null/.test(sql));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
