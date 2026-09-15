/* 管理員點頭貼看註冊信箱（嵐回饋：不管排行榜還是留言，點頭貼要看得到 gmail）

   兩條路要分開驗，因為資料來源不一樣：
   - 排行榜：email 是隨榜單批次查好、預先藏在 .who-email 裡（attachAdminEmails），
     所以 wireEmailPeek 只是「點一下切換顯示」。這裡最容易回歸的是
     stopPropagation——排行榜那一列本身可以點開品牌明細，如果沒擋住，點頭貼
     會連帶把整列展開。舊版是長按 550ms，改成點擊之後這個風險更高。
   - 留言：清單只有 user_id、沒有 email 欄位，所以是「按了才查」
     （adminLookupEmail → admin_user_emails RPC），查過要進 cache 不再打第二次。

   另外一定要驗「非管理員完全不該出現信封鈕」——這顆按鈕會曝露別人的註冊信箱。 */
const { boot, tick, makeSb, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t02 管理員看註冊信箱');
  const { win } = await boot();
  const doc = win.document;

  /* ================= A. 排行榜：點頭貼切換 email ================= */
  win.eval('LIVE = true; me = {id:"admin-1"}; myProfile = {id:"admin-1", is_admin:true, display_name:"管理員"};');
  win.eval(`LB_ROWS = [
    {rank:1, display_name:"小明", email:"ming@gmail.com", avatar_url:null,
     success_count:5, brands_used:3, saved_total:1200, brands:[], user_id:"u-1"},
    {rank:2, display_name:"小華", email:null, avatar_url:null,
     success_count:2, brands_used:2, saved_total:300, brands:[], user_id:"u-2"}
  ]; LB_MONTHLY = true; LB_WEEKLY = false; LB_HAS_PREV = false;`);
  win.renderLbBody();
  await tick(win, 1);

  const avatars = [...doc.querySelectorAll('#lbBody .who-avatar')];
  t.eq('兩列都有頭貼', avatars.length, 2);
  t.ok('有 email 的那列頭貼可點（data-email）', avatars[0].hasAttribute('data-email'));
  t.ok('沒 email 的那列頭貼不可點', !avatars[1].hasAttribute('data-email'));
  t.eq('頭貼有提示文字', avatars[0].title, '點一下看註冊信箱');

  const emailSpan = doc.querySelector('#lbBody .who-email');
  t.ok('email 預設是藏著的', emailSpan.classList.contains('hidden'));

  // 點頭貼 → 顯示；再點一次 → 收回去
  avatars[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await tick(win, 1);
  t.ok('點一下頭貼就顯示 email', !emailSpan.classList.contains('hidden'));
  t.ok('顯示的是註冊信箱本身', /ming@gmail\.com/.test(emailSpan.textContent), emailSpan.textContent);

  avatars[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await tick(win, 1);
  t.ok('再點一次收回去', emailSpan.classList.contains('hidden'));

  // 點信箱文字本身也要能收回，而且不能連帶展開整列
  avatars[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await tick(win, 1);
  const lbDetail = doc.querySelector('#lbBody .lb-detail[data-lbd="0"]');
  const wasHidden = lbDetail.classList.contains('hidden');
  emailSpan.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await tick(win, 1);
  t.ok('點排行榜的信箱文字就收起來', emailSpan.classList.contains('hidden'));
  t.eq('點信箱文字不會連帶展開整列', lbDetail.classList.contains('hidden'), wasHidden);

  // stopPropagation：點頭貼不能連帶把那一列的品牌明細展開
  const detail = doc.querySelector('#lbBody .lb-detail[data-lbd="0"]');
  t.ok('明細列一開始是收合的', detail.classList.contains('hidden'));
  avatars[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await tick(win, 1);
  t.ok('點頭貼不會連帶展開整列', detail.classList.contains('hidden'));
  // 對照組：點這一列別的地方（暱稱）本來就該展開，確認上面不是因為整列都失效
  doc.querySelector('#lbBody .who-name').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await tick(win, 1);
  t.ok('點同一列其他地方仍然展開明細', !detail.classList.contains('hidden'));

  /* ================= B. 留言：按信封才查 ================= */
  const sb = makeSb({
    tables: {
      comments: [
        { id: 'c1', body: '超好用', created_at: '2026-09-01T03:00:00Z', is_hidden: false, offer_id: 7, user_id: 'u-1', offers: { brand: '早餐店' } },
        { id: 'c2', body: '已失效了', created_at: '2026-09-02T03:00:00Z', is_hidden: false, offer_id: 8, user_id: 'u-2', offers: { brand: '拉麵店' } },
      ],
      profiles_public: [{ id: 'u-1', display_name: '小明' }, { id: 'u-2', display_name: '小華' }],
    },
    rpcs: {
      admin_user_emails: (p) => ({
        data: (p.p_ids || []).map((id) => ({ id, email: `${id}@gmail.com` })),
        error: null,
      }),
    },
  });
  win.__sb = sb;
  win.eval('sb = window.__sb;');

  await win.loadAdminCommentList();
  await tick(win, 2);

  let btns = [...doc.querySelectorAll('#adminCommentList .admin-email-btn')];
  t.eq('管理員：每則留言都有信封鈕', btns.length, 2);
  t.eq('信封鈕帶著留言者的 user_id', btns.map((b) => b.dataset.uid), ['u-1', 'u-2']);
  t.eq('按之前完全沒查過信箱', sb.__calls.rpc.filter((c) => c.name === 'admin_user_emails').length, 0);

  btns[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await tick(win, 3);

  const rpcCalls = sb.__calls.rpc.filter((c) => c.name === 'admin_user_emails');
  t.eq('按下去才查一次', rpcCalls.length, 1);
  t.eq('只查這一個人', rpcCalls[0].params, { p_ids: ['u-1'] });
  t.ok('查完把按鈕換成信箱文字',
    /u-1@gmail\.com/.test(doc.querySelector('#adminCommentList').textContent),
    doc.querySelector('#adminCommentList').textContent.slice(0, 120));
  // celine 回饋：打開之後收不回去。信封鈕要一直留著，再點一次或點信箱文字都能收起來
  t.eq('打開信箱後信封鈕還在（才收得回去）',
    doc.querySelectorAll('#adminCommentList .admin-email-btn').length, 2);
  t.eq('信封鈕標示為已展開', btns[0].getAttribute('aria-expanded'), 'true');
  btns[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await tick(win, 2);
  t.ok('再點一次信封就收起來',
    !/u-1@gmail\.com/.test(doc.querySelector('#adminCommentList').textContent));
  t.eq('收起來後標示為未展開', btns[0].getAttribute('aria-expanded'), 'false');
  btns[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await tick(win, 3);
  t.eq('再打開走 cache，不重打 API', sb.__calls.rpc.filter((c) => c.name === 'admin_user_emails').length, 1);
  const peek = doc.querySelector('#adminCommentList .admin-email-peek');
  t.ok('再打開信箱又出現', peek && /u-1@gmail\.com/.test(peek.textContent));
  const rowOpened = [];
  const realOpen = win.openDetail;
  win.openDetail = (id) => rowOpened.push(id);
  peek.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await tick(win, 2);
  win.openDetail = realOpen;
  t.eq('點信箱文字本身也能收起來', doc.querySelectorAll('#adminCommentList .admin-email-peek').length, 0);
  t.eq('點信箱文字不會順便打開那則留言的優惠詳情', rowOpened.length, 0);

  // 重新渲染一次清單，同一個人再按一次 → 應該吃 cache，不再打 RPC
  await win.loadAdminCommentList();
  await tick(win, 2);
  btns = [...doc.querySelectorAll('#adminCommentList .admin-email-btn')];
  btns[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await tick(win, 3);
  t.eq('同一個人第二次按吃 cache、不再打 API',
    sb.__calls.rpc.filter((c) => c.name === 'admin_user_emails').length, 1);

  /* ================= B2. 查詢失敗不能被記住 ================= */
  // 之前失敗也存進 cache，網路閃一下之後這個人永遠顯示「查不到信箱」
  let failOnce = true;
  const sbFlaky = makeSb({
    tables: {
      comments: [{ id: 'c9', body: '測試', created_at: '2026-09-03T03:00:00Z', is_hidden: false, offer_id: 7, user_id: 'u-77', offers: { brand: '早餐店' } }],
      profiles_public: [{ id: 'u-77', display_name: '小美' }],
    },
    rpcs: {
      admin_user_emails: (p) => {
        if (failOnce) { failOnce = false; return { data: null, error: { message: 'network' } }; }
        return { data: p.p_ids.map((id) => ({ id, email: `${id}@gmail.com` })), error: null };
      },
    },
  });
  win.__sb = sbFlaky; win.eval('sb = window.__sb;');
  await win.loadAdminCommentList();
  await tick(win, 2);
  const fb = doc.querySelector('#adminCommentList .admin-email-btn[data-uid="u-77"]');
  fb.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await tick(win, 3);
  t.ok('查詢失敗時講清楚、提示重試', /查詢失敗/.test(doc.querySelector('#adminCommentList').textContent));
  fb.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));   // 收起失敗訊息
  await tick(win, 2);
  fb.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));   // 再打開 → 應該重查
  await tick(win, 3);
  t.eq('失敗那次沒進 cache，重試會再查一次', sbFlaky.__calls.rpc.filter((c) => c.name === 'admin_user_emails').length, 2);
  t.ok('重試成功顯示信箱', /u-77@gmail\.com/.test(doc.querySelector('#adminCommentList').textContent));

  /* ================= C. 非管理員一顆信封鈕都不該有 ================= */
  win.eval('myProfile = {id:"u-9", is_admin:false, display_name:"路人"};');
  t.eq('非管理員 adminEmailBtnHtml 回空字串', win.adminEmailBtnHtml('u-1'), '');
  t.eq('沒有 user_id 時也回空字串（管理員也一樣）', win.adminEmailBtnHtml(null), '');
  // 非管理員其實載不到管理員清單（loadAdminCommentList 開頭就擋掉），
  // 這裡直接驗那道守門，確保不是只靠「查不到資料」剛好沒渲染出來。
  doc.querySelector('#adminCommentList').innerHTML = '<i>未變動</i>';
  await win.loadAdminCommentList();
  await tick(win, 2);
  t.eq('非管理員呼叫 loadAdminCommentList 直接返回、不動畫面',
    doc.querySelector('#adminCommentList').innerHTML, '<i>未變動</i>');

  win.eval('myProfile = {id:"admin-1", is_admin:true, display_name:"管理員"};');
  t.ok('管理員 adminEmailBtnHtml 有產生信封鈕',
    /admin-email-btn/.test(win.adminEmailBtnHtml('u-1')));
  t.ok('uid 有經過跳脫，不會被塞 HTML',
    !/<img/.test(win.adminEmailBtnHtml('"><img src=x>')), win.adminEmailBtnHtml('"><img src=x>'));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
