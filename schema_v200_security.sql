-- =====================================================================
-- v200：OWASP 檢查找到的資料庫問題
--
-- site_events（每一次瀏覽、點擊都記一筆，幾十萬筆）只有管理員能讀，但：
--   1. anon（沒登入的任何人）還有 select 權限——Supabase 預設就給，v14 只是沒收回。
--   2. 讀取政策寫成 using (public.is_admin())，資料庫會「每一筆」都去問一次是不是管理員。
-- 合起來：任何人拿公開的 anon key 打一個
--     GET /rest/v1/site_events?select=id&limit=1
-- 資料庫就整張表一筆一筆檢查，跑到逾時（2026-11-18 實測：57014 statement timeout）。
-- 讀不到資料，但很便宜就能把免費方案的資料庫拖慢——10/4 整站 522 就是資料庫被拖垮。
--
-- 改法：
--   - 收回 anon 的 select（anon 本來就只需要 insert）
--   - 政策改成 (select public.is_admin())：整個查詢只問一次，不是管理員就直接不掃
--   - 只給 authenticated（管理員也是 authenticated）
--
-- 不影響：記事件（insert）、站台數據（site_stats 是 definer view）、在線人數（definer 函式）、
--        管理員儀表板（admin 用自己的身分讀，結果一樣）。
-- 可重複執行。
-- =====================================================================

revoke select on public.site_events from anon;

drop policy if exists events_admin on public.site_events;
create policy events_admin on public.site_events
  for select to authenticated
  using ((select public.is_admin()));

notify pgrst, 'reload schema';

-- 跑完驗證（anon 應該立刻回 401 permission denied，不是等到逾時）：
--   curl "https://lgshwappyjgnzfkwncjk.supabase.co/rest/v1/site_events?select=id&limit=1" -H "apikey: <anon key>"
