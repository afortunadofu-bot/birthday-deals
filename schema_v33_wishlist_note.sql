-- =====================================================================
-- v33：收藏可以自己加備註（只有自己看得到）
-- wishlist 的 RLS（wishlist_own，見 schema_v8.sql）本來就是「user_id = auth.uid()」
-- 全欄位限定只有本人能讀寫，所以這裡只要加欄位，不用另外調整權限。
-- 可重複執行。
-- =====================================================================
alter table public.wishlist
  add column if not exists note text not null default '' check (char_length(note) <= 200);
