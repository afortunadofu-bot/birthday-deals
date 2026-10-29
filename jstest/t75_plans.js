/* v156：行程

   celine：「行程那邊，我的理想狀態是可以寫日期、跟排當天要去哪間店、
            跟可以寫備註、跟調順序」

   這一支最在意的：
   - 四件事都做得到：日期、哪幾家、備註（整趟＋每一家）、調順序
   - 先改畫面再送資料庫；**送失敗要退回去**，不能畫面上是 A、資料庫裡是 B
   - 只有自己看得到：換帳號不能看到上一個人的行程
   - 公開區塊不放站務字（celine：「其他人不該看到這個」） */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, stubHeavy } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sql = fs.readFileSync(path.join(__dirname, '..', 'schema_v156_plans.sql'), 'utf8');

/* 一個很小的假 Supabase：記下每一次寫入，可以指定某一種寫入要失敗 */
function fakeSb(win, state) {
  win.__w = state.writes;
  win.__state = state;
  win.eval(`(()=>{
    const S=window.__state;
    const done=(v)=>Promise.resolve(v);
    const q=(tb)=>{
      const o={_tb:tb,_op:null,_row:null,_eq:null};
      o.select=()=>o; o.order=()=>o; o.limit=()=>o;
      o.eq=(c,v)=>{ o._eq=[c,v]; return o; };
      o.single=()=>o;
      o.insert=(row)=>{ o._op='insert'; o._row=row; return o; };
      o.update=(row)=>{ o._op='update'; o._row=row; return o; };
      o.delete=()=>{ o._op='delete'; return o; };
      o.then=(res,rej)=>{
        if(!o._op) return done({data:S.read(tb), error:S.readErr||null}).then(res,rej);
        window.__w.push({tb, op:o._op, row:o._row, eq:o._eq});
        if(S.fail && S.fail(tb,o._op,o._row)) return done({data:null, error:{message:S.failMsg||'網路斷了'}}).then(res,rej);
        if(o._op==='insert'){
          const rows=(Array.isArray(o._row)?o._row:[o._row]).map(r=>({id:++S.seq, note:null, done:false,
            plan_date:null, title:null, ...r}));
          return done({data:Array.isArray(o._row)?rows:rows[0], error:null}).then(res,rej);
        }
        return done({data:null, error:null}).then(res,rej);
      };
      return o;
    };
    sb={ from:q };
  })()`);
}

(async () => {
  const t = makeAsserts('t75 行程：日期、店家、備註、順序');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];
  stubHeavy(win, ['render', 'loadOffers', 'loadVenues', 'loadMyVenueSuggestions',
    'loadPendingBadge', 'maybeShowBirthdayCheer', 'openDetail']);

  t.ok('「我的行程」在「排行程」那一頁', !!$('#pnlPlans') && !!$('#pnlPlans').closest('#tab-trip'));
  t.ok('放在「一趟用最多」上面（打開這頁的人多半是回來看自己排好的那一趟）',
    $('#pnlPlans').compareDocumentPosition($('#pnlVenues')) & 4);

  /* ================= 沒登入 ================= */
  win.eval('LIVE=true; me=null; PLANS=null; PLANS_OWNER=null; renderPlans();');
  t.ok('沒登入：講登入之後能做什麼', /登入之後就能排行程/.test($('#planBody').textContent));

  /* ================= 表還沒建 ================= */
  const state = { writes: [], seq: 100, read: () => [], readErr: null, fail: null };
  fakeSb(win, state);
  state.readErr = { message: 'Could not find the table public.plans in the schema cache' };
  win.eval("me={id:'u-1'};");
  await win.eval('loadPlans()');
  const btxt = () => $('#planBody').textContent;
  t.ok('表還沒建：講「還沒開放」', /還沒開放/.test(btxt()), btxt().trim());
  t.ok('而且不講 SQL、不講管理員', !/schema_|SQL|管理員/i.test(btxt()));
  state.readErr = null;

  /* ================= 讀進來、排順序 ================= */
  win.eval(`OFFERS=[
    {id:1,brand:'星巴克',offer:'生日當月買一送一'},
    {id:2,brand:'康是美',offer:'生日禮 100 元'},
    {id:3,brand:'屈臣氏',offer:'生日禮券'},
    {id:4,brand:'無印良品',offer:'85 折'},
    {id:5,brand:'寶雅',offer:'生日點數'}];
    WISH=new Set(['1','2','3']); MY_USED_OFFER_IDS=new Set(['3']);`);
  const today = win.eval('planToday()');
  const y = Number(today.slice(0, 4));
  state.read = () => [
    { id: 10, plan_date: `${y - 1}-01-05`, title: '去年那趟', note: null, plan_items: [] },
    { id: 11, plan_date: null, title: '還沒定', note: null, plan_items: [] },
    { id: 12, plan_date: `${y + 1}-03-02`, title: '明年', note: null,
      plan_items: [
        { id: 51, offer_id: 2, note: null, sort_order: 1, done: false },
        { id: 50, offer_id: 1, note: '南西店', sort_order: 0, done: true },
      ] },
  ];
  await win.eval('loadPlans()');
  const heads = () => $$('#planBody .plan-head .plan-title').map((e) => e.textContent);
  /* 打開這一頁的人要找的幾乎都是「下一趟」，不是去年那一趟 */
  t.eq('還沒到的排最上面、沒日期的接著、過去的收在最下面', heads(), ['明年', '還沒定', '去年那趟']);
  t.ok('過去的收進可以展開的那一段', !!$('#planBody details.plan-past') &&
    $('#planBody details.plan-past').contains($('[data-plan="10"]')));
  t.ok('沒定日期的寫「還沒定日期」', /還沒定日期/.test($('[data-plan="11"]').textContent));
  /* 日期要看得出星期幾——排行程的人第一個想知道的是「那天是週末嗎」 */
  t.ok('日期有寫星期幾', /（[日一二三四五六]）/.test($('[data-plan="12"] .plan-date').textContent));
  t.ok('看得出幾家、幾家完成', /2 家 · 1 完成/.test($('[data-plan="12"]').textContent));

  /* 店家照 sort_order 排，不是照 id */
  win.eval("document.querySelector('[data-popen=\"12\"]').click()");
  const names = () => $$('[data-plan="12"] .pi .pi-brand').map((e) => e.textContent.trim());
  t.eq('打開之後店家照順序排', names(), ['星巴克', '康是美']);
  t.eq('編號就是第幾站', $$('[data-plan="12"] .pi-no').map((e) => e.textContent), ['1', '2']);
  t.ok('完成的那一家有劃掉', $('[data-item="50"]').classList.contains('done'));
  t.eq('每一家的備註讀得進來（哪一間分店寫在這裡）',
    $('[data-inote="50"]').value, '南西店');

  /* ================= 一、日期 ================= */
  state.writes.length = 0;
  const d = $('[data-pdate="12"]');
  d.value = `${y + 1}-03-09`;
  d.dispatchEvent(new win.Event('change'));
  await tick(win, 2);
  t.eq('改日期送進資料庫', state.writes[0]?.row, { plan_date: `${y + 1}-03-09` });
  t.eq('送的是那一趟', state.writes[0]?.eq, ['id', 12]);
  t.ok('畫面跟著變', /3\/9/.test($('[data-plan="12"] .plan-date').textContent));

  /* ================= 二、加店家 ================= */
  win.eval("document.querySelector('[data-padd=\"12\"]').click()");
  t.ok('「加店家」打得開', $('#dlgPlanAdd').open);
  const paIds = () => $$('#paPicker [data-pa]').map((e) => e.dataset.pa);
  /* 沒打字：列待辦清單裡、還沒排進這一趟的（1、2 已經在裡面了） */
  t.eq('先列待辦清單裡還沒排進來的', paIds(), ['3']);
  t.ok('用過的會標出來', /用過了/.test($('#paPicker').textContent));
  // 打字：搜全部的
  $('#paPicker .op-search').value = '寶';
  $('#paPicker .op-search').dispatchEvent(new win.Event('input'));
  t.eq('打字就搜全部的優惠', paIds(), ['5']);
  win.eval("document.querySelector('[data-pa=\"5\"]').click()");
  // 勾的會留著：換一個字再勾一個
  $('#paPicker .op-search').value = '屈';
  $('#paPicker .op-search').dispatchEvent(new win.Event('input'));
  /* 換了搜尋字，勾過的浮到最上面——不用記自己勾了哪幾家 */
  t.eq('勾過的浮在最上面', paIds(), ['5', '3']);
  win.eval("document.querySelector('[data-pa=\"3\"]').click()");
  t.eq('換搜尋字，前面勾的還在', $('#btnPaAdd').textContent, '加入（2 家）');
  state.writes.length = 0;
  win.eval("document.querySelector('#btnPaAdd').click()");
  await tick(win, 3);
  const ins = state.writes[0];
  t.eq('一次加進去', ins?.tb, 'plan_items');
  /* 勾的順序就是排進去的順序——多數人是照要去的順序勾 */
  t.eq('照勾的順序接在最後面', (ins?.row || []).map((r) => [r.offer_id, r.sort_order]), [[5, 2], [3, 3]]);
  t.ok('視窗關掉', !$('#dlgPlanAdd').open);
  t.eq('畫面上多了兩家', names(), ['星巴克', '康是美', '寶雅', '屈臣氏']);

  /* ================= 三、備註 ================= */
  state.writes.length = 0;
  const pn = $('[data-pnote="12"]');
  pn.value = '十點出門，記得帶身分證';
  pn.dispatchEvent(new win.Event('change'));
  await tick(win, 2);
  t.eq('整趟的備註存得進去', state.writes[0]?.row, { note: '十點出門，記得帶身分證' });
  const inote = $('[data-inote="51"]');
  inote.value = 'B2，先去這家';
  inote.dispatchEvent(new win.Event('change'));
  await tick(win, 2);
  t.eq('每一家的備註也存得進去', [state.writes[1]?.tb, state.writes[1]?.row], ['plan_items', { note: 'B2，先去這家' }]);

  /* ================= 四、調順序 ================= */
  state.writes.length = 0;
  win.eval("document.querySelector('[data-idown=\"50\"]').click()");
  await tick(win, 3);
  t.eq('往後移一格', names(), ['康是美', '星巴克', '寶雅', '屈臣氏']);
  /* 重新編號 0,1,2…，只送真的變了的——通常就是對調的那兩筆 */
  t.eq('只送對調的那兩筆', state.writes.map((w) => [w.eq[1], w.row.sort_order]).sort(),
    [[50, 1], [51, 0]]);
  t.ok('第一家的「往前」按不下去', $$('[data-plan="12"] [data-iup]')[0].disabled);
  t.ok('最後一家的「往後」按不下去', $$('[data-plan="12"] [data-idown]').slice(-1)[0].disabled);

  /* 送失敗要退回去：畫面上是 A、資料庫裡是 B 是最糟的那種錯 */
  state.writes.length = 0;
  state.fail = (tb, op) => tb === 'plan_items' && op === 'update';
  const toasts = () => $$('.toast').map((e) => e.textContent).join(' ');
  win.eval("document.querySelectorAll('[data-plan=\"12\"] [data-iup]')[2].click()");   // 寶雅往前
  await tick(win, 4);
  t.ok('真的有送出去（不是根本沒送）', state.writes.length > 0);
  t.eq('調順序送失敗：退回原本的順序', names(), ['康是美', '星巴克', '寶雅', '屈臣氏']);
  t.ok('而且講出來', /沒存到/.test(toasts()), toasts());
  state.fail = null;

  /* ================= 完成打勾 ================= */
  state.writes.length = 0;
  const cb = $('[data-idone="51"]');
  cb.checked = true; cb.dispatchEvent(new win.Event('change'));
  await tick(win, 2);
  t.eq('打勾存得進去', state.writes[0]?.row, { done: true });
  t.ok('數字跟著變', /4 家 · 2 完成/.test($('[data-plan="12"] .plan-n').textContent),
    $('[data-plan="12"] .plan-n').textContent);

  // 打勾失敗：勾勾要退回去
  state.fail = (tb, op, row) => tb === 'plan_items' && op === 'update' && row && 'done' in row;
  const cb2 = $('[data-idone="51"]');
  cb2.checked = false; cb2.dispatchEvent(new win.Event('change'));
  await tick(win, 3);
  t.ok('取消打勾送失敗：還是勾著', $('[data-idone="51"]').checked);
  state.fail = null;

  /* ================= 拿掉一家、刪掉一趟 ================= */
  state.writes.length = 0;
  win.eval("document.querySelector('[data-idel=\"50\"]').click()");
  await tick(win, 2);
  t.ok('拿掉一家', !names().includes('星巴克'));
  t.eq('送的是 delete', [state.writes[0]?.tb, state.writes[0]?.op], ['plan_items', 'delete']);

  win.__confirmAnswer = false;
  win.eval("document.querySelector('[data-pdel=\"12\"]').click()");
  t.ok('刪一整趟會先問', win.__confirms.some((m) => /刪掉/.test(m) && /家會一起刪掉/.test(m)));
  t.ok('說不要就不刪', !!$('[data-plan="12"]'));
  win.__confirmAnswer = true;
  win.eval("document.querySelector('[data-pdel=\"12\"]').click()");
  await tick(win, 2);
  t.ok('說好就刪', !$('[data-plan="12"]'));

  /* ================= 新的一趟 ================= */
  state.writes.length = 0;
  win.eval("document.querySelector('#btnPlanNew').click()");
  await tick(win, 3);
  t.eq('新的一趟送的是自己的身分', state.writes[0]?.row, { user_id: 'u-1' });
  t.ok('新的一趟直接打開', !!$('.plan-body [data-pdate]'));

  /* ================= 只有自己看得到 ================= */
  /* 同一個分頁登出再登入另一個人：手上那份是上一個人的，不能拿出來畫 */
  win.eval("me={id:'u-2'}");
  t.ok('換了帳號：手上那份不算數', win.eval('plansReady()') === false);
  win.eval('renderPlans()');
  t.ok('換了帳號：不會畫出上一個人的行程', !/還沒定/.test($('#planBody').textContent));
  t.ok('切到排行程會重新載', /if\(!plansReady\(\)\) loadPlans\(\)/.test(index));
  t.ok('人站在排行程上登入／登出，也會重新載',
    /if\(ACTIVE_TAB==='trip'\)\{ loadPlans\(\); loadMyVenueSuggestions\(\); \}/.test(index));

  /* ================= SQL ================= */
  t.ok('可以重複執行', /create table if not exists public\.plans/.test(sql)
    && /drop policy if exists plans_own/.test(sql));
  t.ok('一趟只有本人讀寫得到',
    /create policy plans_own on public\.plans\s+for all using \(user_id = auth\.uid\(\)\) with check \(user_id = auth\.uid\(\)\)/.test(sql));
  /* plan_items 沒有自己的 user_id，要看它掛在哪一趟底下——不然可以把一間店塞進別人的行程 */
  t.ok('每一家是看「掛在誰的那一趟」',
    /with check \(exists \(select 1 from public\.plans p\s+where p\.id = plan_items\.plan_id and p\.user_id = auth\.uid\(\)\)\)/.test(sql));
  t.ok('訪客一個權限都沒有', /revoke all on public\.plans, public\.plan_items from anon/.test(sql));
  t.ok('同一趟不會去同一家兩次', /unique \(plan_id, offer_id\)/.test(sql));
  t.ok('上限擋在資料庫', /before insert on public\.plans/.test(sql) && /before insert on public\.plan_items/.test(sql));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
