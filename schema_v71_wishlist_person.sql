-- =====================================================================
-- v71：待辦清單分成「我的」跟「幫家人／另一半記的」
--
--   嵐：「我希望幫別人記生日的話，待辦清單要獨立出來，不同份清單。」
--   wishlist 多一欄 person：空白＝自己的清單，填了稱呼（就是 profiles.alt_label）
--   就是那個人的清單。前端上面有一排「我的／媽媽／全部」可以切換，
--   入會死線也照那個人的生日算。
--
--   沿用既有的 wishlist_own RLS（只能看／改自己的那幾列），不用新的政策。
--   前端在這支還沒跑時會自動改成不帶 person 查詢，清單照樣看得到（只是不能分清單）。
--
--   可重複執行。
-- =====================================================================

alter table public.wishlist
  add column if not exists person text
    check (person is null or char_length(person) <= 10);

create index if not exists wishlist_user_person_idx on public.wishlist(user_id, person);

notify pgrst, 'reload schema';
