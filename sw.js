/* 壽星日 service worker
   目的：讓網站能加到手機桌面，且沒網路時仍能開啟看已快取的內容。

   策略：
   - 靜態檔（HTML / manifest / icon）：Network first，抓不到才用快取。
     這樣改版後使用者一定拿到新版，離線時也還開得起來。
   - Supabase API：完全不攔截。優惠資料必須是最新的，
     快取住反而會給人過期的優惠資訊，那比開不了還糟。
*/
const CACHE = 'shouxing-v8';
/* v138：Supabase SDK 也一起預先快取。本來它是跟 CDN 拿的，CDN 一慢或被擋就整個
   降級成離線模式（使用者 tomoe_hot 連續兩天回報）。放自己站上＋預先快取之後，
   連沒網路都還能用快取那一份把畫面跑起來。

   v152：SDK 列兩個位置。上傳時 vendor/ 那層資料夾被攤平了，檔案實際上在根目錄，
   所以 './vendor/supabase.min.js' 線上是 404。兩個都列，有哪個就快取哪個。 */
const ASSETS = ['./', './index.html', './manifest.json', './icon.svg',
                './icon-192.png', './icon-512.png'];
const ASSETS_MAYBE = ['./vendor/supabase.min.js', './supabase.min.js'];

/* 一個一個加，不要用 addAll。
   addAll 是「全有全無」的：清單裡只要有一個 404，整個 Promise 就 reject，
   **一個檔案都不會被快取**——原本後面還接了 .catch(()=>{})，所以連失敗都看不出來，
   表面上裝好了，實際上離線快取整個是空的（vendor/ 那一支 404 之後就是這個狀態）。 */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(ASSETS.concat(ASSETS_MAYBE)
        .map(a => c.add(a).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 不是 GET、或是跨網域請求（Supabase、CDN、Google 登入）一律放行不快取
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
