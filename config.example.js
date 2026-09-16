// 複製這個檔案成 config.js，填入你的 Supabase 專案資訊。
// 這兩個值是「公開」的，可以放在前端，安全性靠資料庫的 RLS 規則把關。
// 位置：Supabase Dashboard → Project Settings → Data API
window.SUPABASE_CONFIG = {
  url: "https://你的專案代號.supabase.co",
  anonKey: "eyJhbGciOi....（很長的一串 anon public key）",
};

// 「附近」功能的地圖圖磚：不設的話用預設值（CARTO Voyager，不用金鑰、可以承受一般流量）。
// 想換成別家（MapTiler、Stadia…）再打開下面其中一個：
// window.MAPTILER_KEY = "你的 MapTiler 金鑰";
// window.MAP_TILES = {
//   url: "https://圖磚服務/{z}/{x}/{y}.png?key=…",
//   attribution: "&copy; 圖磚服務 &copy; OpenStreetMap",
//   maxZoom: 20,
// };

// ⚠️ 絕對不要把 service_role key 放進這裡。
//    那把鑰匙可以繞過所有 RLS 規則，只能用在後端腳本（例如 seed.py）。
