/* 壽星日 service worker
   目的：讓網站能加到手機桌面，且沒網路時仍能開啟看已快取的內容。

   策略：
   - 靜態檔（HTML / manifest / icon）：Network first，抓不到才用快取。
     這樣改版後使用者一定拿到新版，離線時也還開得起來。
   - Supabase API：完全不攔截。優惠資料必須是最新的，
     快取住反而會給人過期的優惠資訊，那比開不了還糟。
*/
const CACHE = 'shouxing-v5';
const ASSETS = ['./', './index.html', './manifest.json', './icon.svg',
                './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS).catch(() => {}))
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
