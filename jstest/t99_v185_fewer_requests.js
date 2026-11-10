/* v185 celine：「能先繼續砍嗎」。v184 之後剩下的大宗：
   - 登入的人：supabase-js 每次切回分頁、換 token 都再發一次登入事件 → 收藏／用過的／評分／通知整套重載
   - 排行榜頭像：每位看的人、每一張都跟 Supabase Storage 拿
   - 附近地圖的分店點：拖一點點就重查
   - Worker 轉送事件：一個訪客一批 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts } = require('./harness');

function loadWorker() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'offers-cache.js'), 'utf8');
  const file = path.join(require('os').tmpdir(), `offers-cache-v185-${Date.now()}.cjs`);
  fs.writeFileSync(file, src.replace(/export default handler;?/, 'module.exports = handler;'));
  const mod = require(file);
  fs.unlinkSync(file);
  return mod;
}

(async () => {
  const t = makeAsserts('t99 v185：再少打 Supabase');

  /* ================= Worker：/img ================= */
  const worker = loadWorker();
  const store = new Map();
  globalThis.caches = { default: {
    async match(req) { const h = store.get(req.url); return h ? h.clone() : undefined; },
    async put(req, res) { store.set(req.url, res.clone()); },
  } };
  const ctx = { waitUntil: (p) => p };
  let up = [];
  let upStatus = 200;
  globalThis.fetch = async (url) => {
    up.push(String(url));
    if (upStatus !== 200) return new Response('no', { status: upStatus });
    return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  };
  const img = (p) => worker.fetch(new Request('https://api.test/img/' + p), {}, ctx);
  const AV = 'avatars/2e932ada-922a-490d-86de-7400447fef7a/avatar-1791069227508.jpg';
  let res = await img(AV);
  t.ok('/img：跟 Supabase Storage 拿那一張', res.status === 200 && up.length === 1
    && up[0] === `https://lgshwappyjgnzfkwncjk.supabase.co/storage/v1/object/public/${AV}`, up[0]);
  t.eq('回的是圖', res.headers.get('content-type'), 'image/jpeg');
  t.ok('瀏覽器也存 7 天', /max-age=604800/.test(res.headers.get('cache-control')));
  await new Promise((r) => setTimeout(r, 5));
  res = await img(AV);
  t.ok('第二個人看：Cloudflare 那份，不碰 Supabase', res.headers.get('x-cache') === 'HIT' && up.length === 1);
  up = [];
  t.eq('不是頭像的路徑：400', (await img('private/secret.pdf')).status, 400);
  t.eq('想跳出 avatars：400', (await img('avatars/../offers.json')).status, 400);
  t.eq('上面兩個都沒碰 Supabase', up.length, 0);
  upStatus = 404;
  t.eq('那張不存在：404（不快取）', (await img('avatars/2e932ada-922a-490d-86de-7400447fef7a/gone.jpg')).status, 404);
  upStatus = 200;

  /* ================= 網站 ================= */
  const { win } = await boot();
  const doc = win.document;
  win.console.warn = () => {};

  /* ---- 同一個人的登入事件不重載 ---- */
  win.__n = 0;
  win.eval(`onSession=async(s)=>{ window.__n++; me=s?.user||null; }; SESSION_UID=undefined; SESSION_P=null;`);
  const sess = (id) => (id ? { user: { id, email: id + '@x' } } : null);
  win.__s = sess('u-1');
  await win.eval('onSessionOnce(window.__s)');
  await win.eval('onSessionOnce(window.__s)');   // INITIAL_SESSION 跟自己 getSession 各一次
  t.eq('一開站兩次：只載一次', win.__n, 1);
  win.__s = sess('u-1');
  await win.eval('onSessionOnce(window.__s)');   // 切回分頁的 SIGNED_IN、TOKEN_REFRESHED
  t.eq('切回分頁／換 token（同一個人）：不重載', win.__n, 1);
  t.eq('但 me 換成新的那份', win.eval('me.email'), 'u-1@x');
  win.__s = null;
  await win.eval('onSessionOnce(window.__s)');
  t.eq('登出：重跑', win.__n, 2);
  win.__s = sess('u-2');
  await win.eval('onSessionOnce(window.__s)');
  t.eq('換人登入：重跑', win.__n, 3);
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  t.ok('帳號資料改了（USER_UPDATED）會強制重跑', /onAuthStateChange\(\(ev,s\)=>\{ if\(ev==='USER_UPDATED'\) SESSION_UID=undefined; onSessionOnce\(s\); \}\)/.test(src));
  t.ok('開站那一次也走同一道門', /await onSessionOnce\(session\);/.test(src) && !/await onSession\(session\);/.test(src));

  /* ---- 頭像走 Worker ---- */
  win.eval(`CFG={url:'https://lgshwappyjgnzfkwncjk.supabase.co', anonKey:'k'}; window.OFFERS_API='https://api.example';`);
  const sbUrl = `https://lgshwappyjgnzfkwncjk.supabase.co/storage/v1/object/public/${AV}`;
  t.eq('Supabase 的頭像 → Worker', win.eval(`avatarSrc(${JSON.stringify(sbUrl)})`), `https://api.example/img/${AV}`);
  t.eq('Google 的頭像不動', win.eval(`avatarSrc('https://lh3.googleusercontent.com/a/x=s96')`), 'https://lh3.googleusercontent.com/a/x=s96');
  t.eq('不是 avatars 的公開檔不動', win.eval(`avatarSrc('https://lgshwappyjgnzfkwncjk.supabase.co/storage/v1/object/public/other/x.png')`),
    'https://lgshwappyjgnzfkwncjk.supabase.co/storage/v1/object/public/other/x.png');
  win.eval(`window.OFFERS_API='';`);
  t.eq('沒設 Worker：原本的網址', win.eval(`avatarSrc(${JSON.stringify(sbUrl)})`), sbUrl);
  win.eval(`window.OFFERS_API='https://api.example';`);
  const attrs = win.eval(`avatarImgAttrs(${JSON.stringify(sbUrl)})`);
  t.ok('排行榜的 img 帶著原本的網址備用', attrs.includes(`src="https://api.example/img/${AV}"`) && attrs.includes(`data-orig="${sbUrl}"`), attrs);
  const lbSrc = src.match(/<img class="avatar who-avatar"[^`]*`/g) || [];
  t.ok('排行榜兩個地方都改用 avatarImgAttrs', lbSrc.length === 2 && lbSrc.every((s) => /avatarImgAttrs\(r\.avatar_url\)/.test(s)), JSON.stringify(lbSrc));
  const box = doc.createElement('div');
  box.innerHTML = `<img ${attrs} alt="">`;
  doc.body.appendChild(box);
  const im = box.querySelector('img');
  im.dispatchEvent(new win.Event('error'));
  t.eq('Worker 還沒更新（/img 載不到）：換回 Supabase 的網址', im.getAttribute('src'), sbUrl);
  im.dispatchEvent(new win.Event('error'));
  t.eq('原本的也壞了：不會一直換來換去', im.getAttribute('src'), sbUrl);
  box.remove();

  /* ---- 附近地圖：多抓一圈，小幅拖動不重查 ---- */
  const calls = [];
  win.__calls = calls;
  win.__rows = [];
  win.eval(`LIVE=true; sb={ rpc:(n,p)=>{ window.__calls.push([n,p]); return Promise.resolve({data:window.__rows, error:null}); } };
    NEAR_PIN_KEY=''; NEAR_PIN_BOX=null; NEAR_PIN_ROWS=[];
    window.__painted=0; paintNearPins=()=>{ window.__painted++; };
    NEAR_MAP={ getZoom:()=>15, getBounds:()=>window.__b };`);
  const B = (s, w, n, e) => ({ getSouth: () => s, getWest: () => w, getNorth: () => n, getEast: () => e });
  win.__b = B(25.03, 121.50, 25.05, 121.53);
  await win.eval('loadNearPins()');
  t.eq('第一次：查一次', calls.length, 1);
  const p0 = calls[0][1];
  t.ok('抓的範圍比畫面大一圈', p0.p_south < 25.03 && p0.p_north > 25.05 && p0.p_west < 121.50 && p0.p_east > 121.53, JSON.stringify(p0));
  t.eq('一次最多 1000 家（資料庫的上限）', p0.p_limit, 1000);
  win.__b = B(25.032, 121.502, 25.052, 121.532);   // 拖一點點
  await win.eval('loadNearPins()');
  t.ok('拖一點點：不重查，直接重畫', calls.length === 1 && win.__painted === 2);
  win.__b = B(25.035, 121.505, 25.045, 121.52);    // 放大
  await win.eval('loadNearPins()');
  t.eq('放大：不重查', calls.length, 1);
  win.__b = B(24.13, 120.66, 24.15, 120.69);       // 移到台中
  await win.eval('loadNearPins()');
  t.eq('移到別的地方：才再查', calls.length, 2);
  win.__rows = Array.from({ length: 1000 }, (_, i) => ({ offer_id: i, lat: 24.14, lng: 120.67 }));
  win.__b = B(25.03, 121.50, 25.05, 121.53);
  await win.eval('loadNearPins()');
  win.__b = B(25.031, 121.501, 25.051, 121.531);
  await win.eval('loadNearPins()');
  t.eq('被 1000 家上限截斷的那次不算數：拖一點點照樣重查', calls.length, 4);
  win.__rows = [];

  /* ---- paintNearPins 只畫畫面裡的 ---- */
  const paintSrc = src.slice(src.indexOf('function paintNearPins()'), src.indexOf('function paintNearPins()') + 1500);
  t.ok('只畫畫面裡的點（手上的比畫面大一圈）', /if\(!inView\(st\)\) return;/.test(paintSrc));

  /* ---- 清單跟著地圖：門檻放大 ---- */
  win.__loads = 0;
  win.eval(`L={latLng:(a,b)=>({lat:a,lng:b})}; NEAR.active=true; NEAR.lat=25.04; NEAR.lng=121.51; NEAR.km=3;
    loadNear=()=>{ window.__loads++; }; syncNearMapCenter=()=>{};
    NEAR_MAP={getCenter:()=>window.__c, distance:(a,b)=>Math.hypot((a.lat-b.lat)*111000,(a.lng-b.lng)*101000), _popup:null, hasLayer:()=>false};`);
  win.__c = { lat: 25.044, lng: 121.51 };   // 約 440 公尺
  t.ok('3 公里的圈拖 440 公尺：清單不換（門檻 600 公尺）', win.eval('nearFollowMap()') === false && win.__loads === 0);
  win.__c = { lat: 25.048, lng: 121.51 };   // 約 890 公尺
  t.ok('拖 890 公尺：換', win.eval('nearFollowMap()') === true && win.__loads === 1);
  win.eval('NEAR.active=false; NEAR_MAP=null;');

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
