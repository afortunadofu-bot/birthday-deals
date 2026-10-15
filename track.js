/* 靜態頁（about / privacy / terms / updates）的瀏覽人次與站外連結點擊。

   celine：「連到 about privacy 小數據所 bandary relatestat 都要紀錄人次」

   為什麼要獨立一支：這幾頁沒有載主程式（index.html 那一大包），所以 logEvent
   用不到。這裡刻意**不**載 Supabase 的 JS 函式庫——為了兩筆記錄多拉一包 100KB
   不划算，直接 POST 到 REST 端點就好（site_events 的 insert 政策本來就對所有人
   開放，select 才是管理員限定）。

   session_id 讀的是跟主程式同一把 localStorage key（同一個網域），所以同一個人
   在首頁跟「關於」之間走來走去都算同一個人。

   用法：<script src="config.js"></script>
         <script src="track.js" data-page="about"></script>

   事件：
     static_view   {page}      這一頁被打開（刻意不叫 pageview——那是主程式在用的，
                               混進來會讓排行榜上公開的「總瀏覽人次」默默變成另一個意思）
     studio_click  {to, from}  點了連到品牌頁／兩個 app 報名表的連結

   整段包在 try 裡、fetch 也 catch 掉：記錄失敗絕對不能擋住頁面或連結本身。 */
(function () {
  var me = document.currentScript;
  var page = (me && me.dataset && me.dataset.page) || '';
  var cfg = window.SUPABASE_CONFIG;
  if (!cfg || !cfg.url || !cfg.anonKey) return;

  var OUT = [
    { to: 'brandpage', re: /afortunadofu-bot\.github\.io\/celinefubrandpage/i },
    // 新舊網址都算同一個 app（2026-10-15 從封測報名表換成 Google Play）
    { to: 'bandary', re: /id=com\.bandary\.app|forms\.gle\/FhBJgWBWb72MCg5x5/i },
    { to: 'relatestats', re: /id=com\.relatestats\.app|forms\.gle\/6HT4LzRSsPA76b6s7/i },
  ];

  var sid = '';
  try {
    sid = localStorage.getItem('sxr_sid') || '';
    if (!sid) {
      sid = 's' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('sxr_sid', sid);
    }
  } catch (e) {}

  function send(type, meta) {
    try {
      fetch(cfg.url + '/rest/v1/site_events', {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg.anonKey,
          Authorization: 'Bearer ' + cfg.anonKey,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ event_type: type, session_id: sid, meta: meta }),
      }).catch(function () {});
    } catch (err) {}
  }

  if (page) send('static_view', { page: page });

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    for (var i = 0; i < OUT.length; i++) {
      if (OUT[i].re.test(href)) { send('studio_click', { to: OUT[i].to, from: page }); return; }
    }
  }, true);
})();
