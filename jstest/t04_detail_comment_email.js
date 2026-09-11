/* 優惠詳情彈窗的留言，管理員也要看得到留言者的註冊信箱。

   跟 t02 的「最近留言」清單是同一套 adminEmailBtnHtml / wireAdminEmailBtns，
   但這是第二個接線點，很容易改一邊忘了另一邊（openDetail 裡漏了那行
   wireAdminEmailBtns(body)，按鈕會畫出來但按了完全沒反應），所以獨立驗一次。 */
const { boot, tick, makeSb, makeAsserts } = require('./harness');

function sbFor(rpcs) {
  return makeSb({
    tables: {
      comments: [
        { id: 'c1', body: '今天用成功', created_at: '2026-09-01T03:00:00Z', is_hidden: false, user_id: 'u-1' },
        { id: 'c2', body: '店員說沒這活動', created_at: '2026-09-02T03:00:00Z', is_hidden: false, user_id: 'u-2' },
      ],
      usage_reports: [],
      offer_ratings: [],
      offer_edit_history: [],
      offer_edits_pending_preview: [],
      profiles_public: [{ id: 'u-1', display_name: '小明' }, { id: 'u-2', display_name: '小華' }],
    },
    rpcs,
  });
}

const OFFER = {
  id: 7, brand: '早餐店', category: '速食', regions: ['台北市'], offer: '生日送蛋餅',
  membership: '', membershipType: 'app', membershipCost: 'free', freeTier: 'free_min',
  advanceDays: 0, advanceNote: '', timing: '當月', valueTwd: 60, conditions: '',
  validity: '', validityType: 'rolling', sources: [], bestSource: null,
  status: 'approved', reportCount: 0, commentCount: 2, ratingAvg: null, ratingCount: 0,
  wishCount: 0, transferable: 'unknown',
};

(async () => {
  const t = makeAsserts('t04 詳情彈窗留言看信箱');
  const { win } = await boot();
  const doc = win.document;

  /* ---- 管理員 ---- */
  const sb = sbFor({
    admin_user_emails: (p) => ({
      data: (p.p_ids || []).map((id) => ({ id, email: `${id}@gmail.com` })),
      error: null,
    }),
  });
  win.__sb = sb;
  win.__offer = OFFER;
  win.eval('sb = window.__sb; LIVE = true; me = {id:"admin-1"};'
    + ' myProfile = {id:"admin-1", is_admin:true, display_name:"管理員"};'
    + ' OFFERS = [window.__offer];');

  await win.openDetail(7);
  await tick(win, 4);

  const body = doc.querySelector('#dtlBody');
  t.eq('兩則留言都畫出來', body.querySelectorAll('.cmt').length, 2);
  const btns = [...body.querySelectorAll('.admin-email-btn')];
  t.eq('管理員：每則留言都有信封鈕', btns.length, 2);
  t.eq('信封鈕帶著留言者的 user_id', btns.map((b) => b.dataset.uid), ['u-1', 'u-2']);
  t.eq('還沒按之前不查信箱', sb.__calls.rpc.filter((c) => c.name === 'admin_user_emails').length, 0);

  btns[1].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await tick(win, 3);

  const rpc = sb.__calls.rpc.filter((c) => c.name === 'admin_user_emails');
  t.eq('按了才查，而且只查這一個人', rpc.length && rpc[0].params, { p_ids: ['u-2'] });
  t.ok('信箱顯示在那則留言裡',
    /u-2@gmail\.com/.test(body.querySelectorAll('.cmt')[1].textContent),
    body.querySelectorAll('.cmt')[1].textContent.trim());
  t.ok('另一則留言沒被連帶展開信箱',
    !/@gmail\.com/.test(body.querySelectorAll('.cmt')[0].textContent),
    body.querySelectorAll('.cmt')[0].textContent.trim());

  /* ---- 查不到信箱時要講人話，不是空白 ---- */
  const sbNone = sbFor({ admin_user_emails: () => ({ data: [], error: null }) });
  win.__sb = sbNone;
  win.eval('sb = window.__sb;');
  await win.openDetail(7);
  await tick(win, 4);
  const b2 = doc.querySelector('#dtlBody .admin-email-btn[data-uid="u-1"]');
  b2.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await tick(win, 3);
  t.ok('查不到就顯示「（查不到信箱）」',
    /查不到信箱/.test(doc.querySelector('#dtlBody').textContent));

  /* ---- 非管理員：一顆都不該有 ---- */
  win.eval('me = {id:"u-9"}; myProfile = {id:"u-9", is_admin:false, display_name:"路人"};');
  const sb3 = sbFor({});
  win.__sb = sb3;
  win.eval('sb = window.__sb;');
  await win.openDetail(7);
  await tick(win, 4);
  t.eq('非管理員看不到任何信封鈕',
    doc.querySelectorAll('#dtlBody .admin-email-btn').length, 0);
  t.eq('留言本身照常顯示', doc.querySelectorAll('#dtlBody .cmt').length, 2);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
