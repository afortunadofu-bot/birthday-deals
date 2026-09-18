/* 合併重複優惠（管理員）＋自己上傳大頭貼（v70）

   合併：
   - 「可能重複的優惠」自動列出品牌名稱去掉空白／大小寫後一樣、或其中一個包含另一個的組合；
     回報比較多的那張當「保留」；同一個集團拆出來的不算重複
   - 選了兩張才能按合併；兩張一樣不能合併；按下去先確認、呼叫 admin_merge_offers(保留, 併掉)
   - v70 沒跑時講要跑哪支 SQL
   大頭貼：
   - 「我的」個人資料有上傳照片的按鈕；上傳到 avatars/<自己的 id>/，檔名每次不同
   - 上傳完更新 profiles.avatar_url、右上角頭像跟著換、舊照片刪掉
   - 只收 JPG／PNG／WebP；v70 沒跑（沒有儲存空間）時講人話
   - 有 Google 頭像時可以用回去 */
const { boot, tick, makeSb, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t17 合併重複優惠＋大頭貼');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  /* ================= 合併重複優惠 ================= */
  win.eval(`OFFERS = [
    {id:75, brand:'硬咖啡', offer:'香草霜淇淋折 $50', reportCount:0, commentCount:0, wishCount:1, regions:['台北市'], groupName:''},
    {id:101, brand:'CAFE!N 硬咖啡', offer:'$50 折價券', reportCount:2, commentCount:0, wishCount:3, regions:['台北市'], groupName:''},
    {id:59, brand:'gonna EAT', offer:'咖啡一杯', reportCount:4, commentCount:0, wishCount:0, regions:[], groupName:''},
    {id:214, brand:'gonnaEAT', offer:'黑咖啡或拿鐵', reportCount:1, commentCount:0, wishCount:0, regions:[], groupName:''},
    {id:3, brand:'肯德基', offer:'$50', reportCount:19, groupName:'PK雙饗卡', regions:[]},
    {id:400, brand:'必勝客', offer:'$50', reportCount:0, groupName:'PK雙饗卡', regions:[]},
    {id:9, brand:'麥當勞', offer:'薯條', reportCount:5, groupName:'', regions:[]},
    {id:198, brand:'GU', offer:'折價券', reportCount:2, groupName:'', regions:[]},
    {id:248, brand:'龜記茗品 Guiji', offer:'飲料', reportCount:6, groupName:'', regions:[]}];`);
  win.renderMergePanel();
  const sugg = [...doc.querySelectorAll('#mergeSugg .merge-sugg-btn')].map((b) => b.textContent.replace(/\s+/g, ' ').trim());
  t.ok('列出「gonna EAT」跟「gonnaEAT」（去掉空白後一樣）', sugg.some((x) => /#59 gonna EAT/.test(x) && /#214 gonnaEAT/.test(x)), sugg);
  t.ok('列出「硬咖啡」跟「CAFE!N 硬咖啡」（一個包含另一個）', sugg.some((x) => /硬咖啡/.test(x) && /CAFE!N/.test(x)), sugg);
  t.ok('回報比較多的當保留（CAFE!N 硬咖啡 在前面）', sugg.some((x) => /^#101 CAFE!N 硬咖啡.*⇄.*#75 硬咖啡/.test(x)), sugg);
  t.ok('同一個集團拆出來的不算重複', !sugg.some((x) => /肯德基/.test(x) && /必勝客/.test(x)));
  t.ok('不相干的不列', !sugg.some((x) => /麥當勞/.test(x)));
  t.ok('很短的英文不亂比（GU 不會比到 Guiji）', !sugg.some((x) => /#198 GU/.test(x)), sugg);
  t.ok('還沒選兩張時不能按合併', $('#btnMerge').disabled);

  // 點建議帶進上面
  const btn = [...doc.querySelectorAll('#mergeSugg .merge-sugg-btn')].find((b) => /gonnaEAT/.test(b.textContent));
  btn.click();
  t.eq('點建議把兩張帶進上面', [$('#mergeKeep').value, $('#mergeDrop').value], ['#59 gonna EAT', '#214 gonnaEAT']);
  t.ok('兩張的內容都看得到', /咖啡一杯/.test($('#mergeKeepCard').textContent) && /黑咖啡或拿鐵/.test($('#mergeDropCard').textContent));
  t.ok('選好兩張可以按合併', !$('#btnMerge').disabled);
  $('#btnMergeSwap').click();
  t.eq('可以對調', [$('#mergeKeep').value, $('#mergeDrop').value], ['#214 gonnaEAT', '#59 gonna EAT']);
  $('#btnMergeSwap').click();

  // 同一張不能合併
  $('#mergeDrop').value = '#59'; $('#mergeDrop').dispatchEvent(new win.Event('input'));
  t.ok('兩張一樣不能合併', $('#btnMerge').disabled);
  $('#mergeDrop').value = '#214 gonnaEAT'; $('#mergeDrop').dispatchEvent(new win.Event('input'));

  // 合併
  const calls = [];
  win.__sb = makeSb({ rpcs: { admin_merge_offers: (p) => { calls.push(p); return { data: { reports: 1, comments: 0, ratings: 0, wishlist: 0 }, error: null }; } } });
  win.eval('sb = window.__sb; LIVE = true; myProfile = {id:"a", is_admin:true};');
  win.confirm = () => true;
  win.loadOffers = async () => {}; win.render = () => {};
  $('#btnMerge').click();
  await tick(win, 4);
  t.eq('呼叫 admin_merge_offers(保留, 併掉)', calls[0], { p_keep: 59, p_drop: 214 });
  t.ok('講清楚搬了什麼、哪張下架', /搬了 1 筆回報/.test($('#mergeMsg').textContent) && /gonnaEAT」已下架/.test($('#mergeMsg').textContent), $('#mergeMsg').textContent);

  // v70 還沒跑
  win.__sb = makeSb({ rpcs: { admin_merge_offers: { data: null, error: { message: 'function public.admin_merge_offers(bigint, bigint) does not exist' } } } });
  win.eval('sb = window.__sb;');
  $('#mergeKeep').value = '#59'; $('#mergeDrop').value = '#214'; win.renderMergePanel();
  $('#btnMerge').click();
  await tick(win, 4);
  t.ok('v70 沒跑時講要跑哪支 SQL', /schema_v70/.test($('#mergeMsg').textContent));

  /* ================= 大頭貼 ================= */
  t.ok('「我的」個人資料有上傳照片', !!$('#profilePanel #avatarFile') && /上傳照片/.test($('#profilePanel').textContent));
  const uploads = [], removed = [], updates = [];
  const sbA = makeSb({});
  const realFrom = sbA.from;
  sbA.from = (tb) => tb === 'profiles'
    ? { update: (row) => { updates.push(row); return { eq: () => Promise.resolve({ error: null }) }; } }
    : realFrom(tb);
  sbA.storage = { from: (bucket) => ({
    upload: (path, blob, opts) => { uploads.push({ bucket, path, type: opts.contentType }); return Promise.resolve({ error: null }); },
    getPublicUrl: (path) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${bucket}/${path}` } }),
    remove: (paths) => { removed.push(...paths); return Promise.resolve({ error: null }); },
  }) };
  win.__sb = sbA;
  win.eval(`sb = window.__sb; me = {id:'u-1', user_metadata:{avatar_url:'https://lh3.googleusercontent.com/g.jpg'}};
    myProfile = {id:'u-1', display_name:'嵐', avatar_url:'https://x.supabase.co/storage/v1/object/public/avatars/u-1/avatar-1.jpg'};`);
  // jsdom 沒有真的影像解碼／canvas：裁切縮圖這一步換成假的
  win.squareJpeg = async () => new win.Blob(['x'], { type: 'image/jpeg' });
  win.renderAvatarEditor();
  t.ok('有 Google 頭像、目前不是它時，可以用回去', !$('#btnAvatarGoogle').classList.contains('hidden'));

  const file = new win.File(['x'], 'me.png', { type: 'image/png' });
  await win.uploadAvatar(file);
  await tick(win, 3);
  t.eq('上傳到 avatars／自己的資料夾', uploads.length && [uploads[0].bucket, uploads[0].path.split('/')[0], uploads[0].type], ['avatars', 'u-1', 'image/jpeg']);
  t.ok('檔名每次不一樣（避免快取到舊照片）', /^u-1\/avatar-\d+\.jpg$/.test(uploads[0].path), uploads[0].path);
  t.ok('更新 profiles.avatar_url', updates.length === 1 && /\/avatars\/u-1\/avatar-\d+\.jpg$/.test(updates[0].avatar_url));
  t.ok('右上角頭像跟著換', /\/avatars\/u-1\/avatar-\d+\.jpg$/.test($('#uAvatar').src));
  t.eq('舊照片刪掉', removed, ['u-1/avatar-1.jpg']);
  t.ok('顯示換好了', /換好了/.test($('#avatarMsg').textContent));

  await win.uploadAvatar(new win.File(['x'], 'a.gif', { type: 'image/gif' }));
  t.ok('只收 JPG／PNG／WebP', /JPG、PNG 或 WebP/.test($('#avatarMsg').textContent));

  // 沒有儲存空間（v70 沒跑）
  sbA.storage = { from: () => ({ upload: () => Promise.resolve({ error: { message: 'Bucket not found' } }), getPublicUrl: () => ({ data: {} }), remove: () => Promise.resolve({}) }) };
  await win.uploadAvatar(file);
  t.ok('v70 沒跑時講要跑哪支 SQL', /schema_v70/.test($('#avatarMsg').textContent), $('#avatarMsg').textContent);

  // 用回 Google 頭像
  $('#btnAvatarGoogle').click();
  await tick(win, 3);
  t.eq('用回 Google 頭像', updates[updates.length - 1], { avatar_url: 'https://lh3.googleusercontent.com/g.jpg' });

  // 沒登入
  win.eval('me = null;');
  await win.uploadAvatar(file);
  t.ok('沒登入不能換', /要登入/.test($('#avatarMsg').textContent));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
