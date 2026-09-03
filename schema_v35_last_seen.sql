-- =====================================================================
-- v35：「本週新上架／自上次來訪新增」入口要用的欄位
--   profiles.last_seen_at：登入者上次來訪的時間戳，前端每次連上 Supabase
--   都會直接更新成現在時間（用來算「上次來訪後新增了幾筆」）。
--   不用另外開 RPC——schema.sql 裡的 profiles_self_write 政策
--   （for update using (id = auth.uid()) with check (id = auth.uid())）
--   本來就允許使用者自己更新 profiles 的任何欄位，只有 is_admin／is_banned
--   兩欄被 guard_profile_privileges() trigger 額外保護，其餘欄位（含這個
--   新欄位）前端可以直接 .update()。
-- 可重複執行。
-- =====================================================================
alter table public.profiles
  add column if not exists last_seen_at timestamptz;
