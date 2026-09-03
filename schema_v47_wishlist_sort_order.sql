-- v47：待辦清單可手動排序
-- ---------------------------------------------------------------------
-- 嵐的回饋：待辦清單希望可以移動順序。新增一個 sort_order 欄位，使用者
-- 選「自訂順序」時，前端用上／下移動按鈕交換相鄰兩筆的 sort_order，
-- 直接靠既有的 wishlist_own RLS policy（for all using/with check
-- user_id = auth.uid()）就能寫入，不需要另外開 RPC。
-- ---------------------------------------------------------------------
alter table public.wishlist add column if not exists sort_order integer;
