// 複製這個檔案成 config.js，填入你的 Supabase 專案資訊。
// 這兩個值是「公開」的，可以放在前端，安全性靠資料庫的 RLS 規則把關。
// 位置：Supabase Dashboard → Project Settings → Data API
window.SUPABASE_CONFIG = {
  url: "https://你的專案代號.supabase.co",
  anonKey: "eyJhbGciOi....（很長的一串 anon public key）",
};

// 邊緣快取 Worker（worker/offers-cache.js）。設了這一行之後，優惠清單與站台數據
// 會先跟它要——所有訪客共用同一份，Supabase 每 10 分鐘只被打一次；Supabase 掛掉時
// 它還會把最後一份好資料頂出來。不設就跟以前一樣直接問 Supabase，功能完全不受影響。
// 部署方式見 worker/README.md。
// window.OFFERS_API = "https://birthdaydeals-api.你的帳號.workers.dev";

// 「附近」功能的地圖圖磚：不設的話用預設值（CARTO Voyager，不用金鑰、可以承受一般流量）。
// 想換成別家（MapTiler、Stadia…）再打開下面其中一個：
// window.MAPTILER_KEY = "你的 MapTiler 金鑰";
// window.MAP_TILES = {
//   url: "https://圖磚服務/{z}/{x}/{y}.png?key=…",
//   attribution: "&copy; 圖磚服務 &copy; OpenStreetMap",
//   maxZoom: 20,
// };

// App（Capacitor）裡的 Google 登入要用的用戶端 ID。網頁版用不到，不填也不影響網站。
// App 裡不能用一般的 OAuth 轉址——Google 不准在內嵌 WebView 做 OAuth，會回
// 403 disallowed_useragent——所以改成由原生端拿 id token 再交給 Supabase。
// 要填「Web 應用程式」那一個，且必須跟 Supabase 的 Google provider 設定一致。
// 完整步驟（含 Android 要登記的 SHA-1）寫在 app/README.md。
// window.GOOGLE_WEB_CLIENT_ID = "……-…….apps.googleusercontent.com";
// window.GOOGLE_IOS_CLIENT_ID = "……-…….apps.googleusercontent.com";   // iOS 版才要

// ⚠️ 絕對不要把 service_role key 放進這裡。
//    那把鑰匙可以繞過所有 RLS 規則，只能用在後端腳本（例如 seed.py）。
