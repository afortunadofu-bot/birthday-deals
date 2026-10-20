-- =====================================================================
-- v131：防「anon key 被拿去打」——優惠整包只給 Worker 讀
--
-- celine：「先做預防這幾個的」（SUPABASE-流量.md →「以後怎樣才會爆掉」第 2 條）
--
-- ⚠️ 這一支跟別支不一樣：**不要照順序跑，先把下面「上線順序」讀完。**
--    順序弄錯的話，站上的優惠清單會整個讀不到（可以復原，但會有一段空窗）。
--
-- ---------------------------------------------------------------------
-- 要防的是什麼
-- ---------------------------------------------------------------------
-- config.js 裡的 anon key 是公開的（本來就該公開，RLS 才是真正的守門員）。
-- 但是 `offers_public?select=*` 任何人都打得到，一次 145 KB（gzip 後）。
-- **35,000 次就是一整個月的 5 GB 額度** —— 一個寫爛的爬蟲一個晚上就打得到，
-- 而且 Worker 擋不到「不經過 Worker、直接打 Supabase」的人，免費方案也沒有
-- 速率限制可以開。
--
-- 做法：整包優惠清單只有 Worker 讀得到。Worker 用一把**不在前端出現**的金鑰
-- （放 Cloudflare 的環境變數），角色是專門開的 edge_reader。
--
-- ---------------------------------------------------------------------
-- 代價（先知道再決定要不要做）
-- ---------------------------------------------------------------------
-- 現在前端有一條「Worker 拿不到就自己直接問 Supabase」的退路。做完之後：
--
--   · 登入的人（authenticated）—— **退路還在**，權限沒動。
--     管理員改完上架狀態要馬上看到結果，那條路不能斷。
--   · 沒登入的訪客 —— 退路斷了。Worker 真的掛掉的時候，他們會看到
--     「優惠資料暫時讀不到」那塊橫幅，而不是自己去跟 Supabase 要。
--
-- 這個代價可以接受，因為網站本身就是掛在 Cloudflare 上的：Cloudflare 掛了
-- 的話連網頁都打不開，那條退路本來也救不了。而且 Worker 上游掛掉時本來就會
-- 拿 24 小時內的舊資料頂著（STALE_TTL）。真正會用到那條退路的，只有
-- 「birthdaydeals-api 這一支 Worker 被我部署壞掉、但網站還活著」的情況。
--
-- ---------------------------------------------------------------------
-- 上線順序（照這個順序，中間不會有空窗）
-- ---------------------------------------------------------------------
--   1. 跑本檔的【步驟 A】：開 edge_reader 角色、把 Worker 要讀的東西授權給它。
--      （這一步什麼都不會壞，anon 的權限一點都沒動。）
--   2. 在本機產生一把 edge_reader 的金鑰：
--         python mint_edge_jwt.py
--      （它會跟你要 Supabase 的 JWT Secret：Dashboard → Settings → API →
--        JWT Settings → JWT Secret。**那把祕密不要貼進任何網站、不要進 git。**）
--   3. Cloudflare → Workers → birthdaydeals-api → Settings → Variables：
--      **新增**一個變數 SUPABASE_EDGE_KEY，值是第 2 步印出來的那串，
--      型態選 Secret（不是純文字）。存檔之後重新部署。
--
--      ⚠️ 不要去動原本的 SUPABASE_ANON_KEY。Supabase 的閘道是看 apikey 這個
--         標頭，它必須一直是專案的公開金鑰；決定「用哪個角色查」的是
--         authorization 標頭，Worker 會拿 SUPABASE_EDGE_KEY 去填那一個。
--         沒設 SUPABASE_EDGE_KEY 的話，Worker 行為跟以前一模一樣。
--   4. **確認 Worker 還活著**：開 https://birthdaydeals-api.celine-fu-work.workers.dev/offers
--      要看得到資料。看不到就先把環境變數改回原本的 anon key，不要往下做。
--   5. 確認沒問題之後，才跑本檔的【步驟 B】：把 anon 讀 offers_public 的權限收掉。
--
-- 要復原：跑最下面的【還原】那一段，再把 Cloudflare 的 SUPABASE_EDGE_KEY 刪掉。
-- 可重複執行。
-- =====================================================================


-- =====================================================================
-- 【步驟 A】開一個只能讀、而且只讀得到 Worker 要的那幾份的角色
-- =====================================================================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'edge_reader') then
    create role edge_reader nologin noinherit;
  end if;
end;
$$;

-- PostgREST 是用 authenticator 這個角色連進來，再 set role 成 JWT 裡寫的角色。
-- 沒有這一行，拿著 edge_reader 的金鑰打進來會是 500。
grant edge_reader to authenticator;

grant usage on schema public to edge_reader;

-- Worker 讀得到的，就是下面這些，一個不多。
-- （對照 worker/offers-cache.js 的 fromSupabase() 與 boardBundle()）
grant select on
  public.offers_public,
  public.site_stats,
  public.current_announcement,
  public.site_settings,
  public.leaderboard,
  public.leaderboard_prev,
  public.popular_offers,
  public.popular_offers_prev,
  public.most_wished,
  public.most_wished_prev,
  public.recent_activity,
  public.contribution_leaderboard,
  public.contribution_leaderboard_prev
to edge_reader;

grant execute on function
  public.site_stats_cached(),
  public.site_usage_daily(integer),
  public.site_offer_usage(integer),
  public.site_usage_hour_distribution(integer),
  public.site_wish_conversion()
to edge_reader;

-- 確認：這個角色讀得到什麼
select table_name, privilege_type
  from information_schema.role_table_grants
 where grantee = 'edge_reader'
 order by table_name;


-- =====================================================================
-- 【步驟 B】⚠️ 第 4 步確認過 Worker 還活著，才跑這一段
--
-- 只收「沒登入的訪客」讀整包優惠的權限。登入的人不動。
-- =====================================================================
-- revoke select on public.offers_public from anon;

-- 確認：anon 應該查不到 offers_public，authenticated 應該還查得到
-- select grantee, privilege_type
--   from information_schema.role_table_grants
--  where table_name = 'offers_public'
--  order by grantee;


-- =====================================================================
-- 【還原】把權限放回去（Worker 壞掉、或決定不做了的時候）
-- =====================================================================
-- grant select on public.offers_public to anon;
