/* v184：點開一筆優惠詳情，原本要分開問 6 張表（每個再加一個 OPTIONS），11/10 早上一小時
   2,968 個請求裡佔了約 1,090 個。改成 offer_detail_bundle 一次拿齊；叫不到就照原本分開查。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeSb, makeAsserts } = require('./harness');

const OFFER = {
  id: 7, brand: '早餐店', category: '速食', regions: ['台北市'], offer: '生日送蛋餅',
  membership: '', membershipType: 'app', membershipCost: 'free', freeTier: 'free_min',
  advanceDays: 0, advanceNote: '', timing: '當月', valueTwd: 60, conditions: '',
  validity: '', validityType: 'rolling', sources: [], bestSource: null, status: 'approved',
  reportCount: 2, commentCount: 2, ratingAvg: null, ratingCount: 0, wishCount: 0, transferable: 'unknown',
};
const COMMENTS = [
  { id: 501, body: '超好用', created_at: '2026-09-01T03:00:00Z', is_hidden: false, user_id: 'u-2' },
  { id: 502, body: '我自己的留言', created_at: '2026-09-02T03:00:00Z', is_hidden: false, user_id: 'u-1' },
];
const REPORTS = [
  { id: 61, used_on: '2026-09-02', result: 'success', store: '忠孝店', note: '要出示身分證', saved_twd: 80, user_id: 'u-2', created_at: '2026-09-02T01:00:00Z' },
  { id: 62, used_on: '2026-09-03', result: 'success', store: '', note: '', saved_twd: null, user_id: 'u-1', created_at: '2026-09-03T01:00:00Z' },
];
const HISTORY = [{ changes: { offer: ['舊', '新'] }, reason: '官網改了', actor_name: '嵐', created_at: '2026-09-05T00:00:00Z' }];
const NAMES = [{ id: 'u-1', display_name: 'celine' }, { id: 'u-2', display_name: '嵐' }];
const BUNDLE = {
  comments: COMMENTS, reports: REPORTS, history: HISTORY, names: NAMES,
  report_likes: [{ report_id: 61, user_id: 'u-3' }, { report_id: 61, user_id: 'u-4' }],
  comment_likes: [{ comment_id: 501, user_id: 'u-1' }],
  my_score: 4,
};
const TABLES = {
  comments: COMMENTS, usage_reports: REPORTS, offer_edit_history: HISTORY, profiles_public: NAMES,
  report_likes: BUNDLE.report_likes, comment_likes: BUNDLE.comment_likes,
  offer_ratings: [{ score: 4 }], offer_edits_pending_preview: [],
};

(async () => {
  const t = makeAsserts('t98 v184：詳情一次拿齊');
  const { win } = await boot();
  const doc = win.document;
  win.__offer = OFFER;
  win.eval('LIVE=true; me={id:"u-1"}; myProfile={id:"u-1", is_admin:false, display_name:"celine"}; OFFERS=[window.__offer];');

  const snapshot = () => {
    const body = doc.querySelector('#dtlBody');
    const likes = [...body.querySelectorAll('.like-btn')].map((b) => `${b.dataset.kind}${b.dataset.id}:${b.querySelector('.like-n').textContent}${b.classList.contains('on') ? '♥' : ''}`);
    return {
      text: body.textContent.replace(/\s+/g, ' ').trim(),
      likes: likes.sort(),
      stars: body.querySelectorAll('.star-btn.on').length,
    };
  };
  const open = async (sb) => {
    win.__sb = sb; win.eval('sb=window.__sb; dtlId=null;');
    if (doc.querySelector('#dlgDetail').open) doc.querySelector('#dlgDetail').close();
    await win.openDetail(7);
    await tick(win, 8);
    return snapshot();
  };

  /* 有 offer_detail_bundle：一個 RPC 拿齊 */
  const sbB = makeSb({ tables: { offer_edits_pending_preview: [] }, rpcs: { offer_detail_bundle: BUNDLE } });
  const withBundle = await open(sbB);
  t.ok('叫了 offer_detail_bundle，帶的是這一筆的 id',
    sbB.__calls.rpc.some((c) => c.name === 'offer_detail_bundle' && c.params.p_offer_id === 7));
  const tablesRead = [...new Set(sbB.__calls.select.map((s) => s.table))];
  t.eq('其他表一張都沒有另外問（只剩登入才看得到的待審修改）', tablesRead, ['offer_edits_pending_preview']);
  t.ok('留言、回報、修改歷史都畫出來', /超好用/.test(withBundle.text) && /忠孝店/.test(withBundle.text) && /官網改了/.test(withBundle.text), withBundle.text.slice(0, 200));
  t.ok('暱稱接得上', /嵐/.test(withBundle.text) && /celine/.test(withBundle.text));
  t.ok('愛心數字對：回報 61 兩顆、留言 501 一顆（是我按的）',
    withBundle.likes.includes('report61:2') && withBundle.likes.includes('comment501:1♥'), JSON.stringify(withBundle.likes));
  t.eq('自己給的星等', withBundle.stars, 4);

  /* 沒有這支（SQL 還沒跑）：照原本分開查，畫出來一模一樣 */
  const sbOld = makeSb({ tables: TABLES, rpcs: {
    offer_detail_bundle: { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.offer_detail_bundle(p_offer_id) in the schema cache' } } } });
  win.eval('DETAIL_BUNDLE_OK=true;');
  const without = await open(sbOld);
  t.eq('退回分開查：畫面一模一樣', without, withBundle);
  t.ok('而且真的是分開查的', ['comments', 'usage_reports', 'offer_edit_history', 'profiles_public', 'report_likes']
    .every((tb) => sbOld.__calls.select.some((s) => s.table === tb)));
  t.ok('這次造訪之後不再試那支（不白打）', win.eval('DETAIL_BUNDLE_OK') === false);
  const n0 = sbOld.__calls.rpc.length;
  await open(sbOld);
  t.eq('再點開一筆：沒有再叫 offer_detail_bundle', sbOld.__calls.rpc.length, n0);

  /* 一時失敗（網路）：只這一次退回，下次還會試 */
  win.eval('DETAIL_BUNDLE_OK=true;');
  const sbFlaky = makeSb({ tables: TABLES, rpcs: { offer_detail_bundle: { data: null, error: { message: 'Failed to fetch' } } } });
  const flaky = await open(sbFlaky);
  t.eq('網路一時不通：這次照分開查，畫面一樣', flaky, withBundle);
  t.ok('下次還會再試', win.eval('DETAIL_BUNDLE_OK') === true);

  /* 回來的東西缺一塊：不要拿半份畫 */
  const sbHalf = makeSb({ tables: TABLES, rpcs: { offer_detail_bundle: { ...BUNDLE, history: null } } });
  const half = await open(sbHalf);
  t.eq('缺一塊：照分開查', half, withBundle);

  /* SQL */
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema_v184_offer_detail_bundle.sql'), 'utf8');
  t.ok('SQL：security invoker（用呼叫的人自己的身分讀，RLS 照常）', /security invoker/.test(sql) && !/security definer/.test(sql));
  t.ok('SQL：給 anon 跟 authenticated 叫', /grant execute on function public\.offer_detail_bundle\(bigint\) to anon, authenticated/.test(sql));
  t.ok('SQL：跟網站原本同樣的上限（留言 50、回報 30、歷史 10）',
    /limit 50/.test(sql) && /limit 30/.test(sql) && /limit 10/.test(sql));
  t.ok('SQL：自己的星等只在登入時查', /if auth\.uid\(\) is not null then/.test(sql));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
