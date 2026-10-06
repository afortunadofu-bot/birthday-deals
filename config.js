// 複製這個檔案成 config.js，填入你的 Supabase 專案資訊。
// 這兩個值是「公開」的，可以放在前端，安全性靠資料庫的 RLS 規則把關。
// 位置：Supabase Dashboard → Project Settings → Data API
window.SUPABASE_CONFIG = {
  url: "https://lgshwappyjgnzfkwncjk.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxnc2h3YXBweWpnbnpma3duY2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MDgxNTAsImV4cCI6MjEwMTM4NDE1MH0.YEAjEdKM8x7wYU_xvS463xw7EAYA5uQZeqE5ATIgqyQ",
};

// 邊緣快取 Worker（worker/offers-cache.js，已部署）。優惠清單與站台數據會先跟它要，
// 所有訪客共用同一份，Supabase 每 10 分鐘只被打一次；Supabase 掛掉時它還會把最後
// 一份好資料頂出來。要暫時停用就把這一行註解掉，網站會變回直接問 Supabase。
window.OFFERS_API = "https://birthdaydeals-api.celine-fu-work.workers.dev";

// ⚠️ 絕對不要把 service_role key 放進這裡。
//    那把鑰匙可以繞過所有 RLS 規則，只能用在後端腳本（例如 seed.py）。
