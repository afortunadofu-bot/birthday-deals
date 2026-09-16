-- =====================================================================
-- v65：第二組生日（幫家人／另一半記）＋待辦清單標籤
--
--   背景（嵐許願、celine 拍板）：
--   1. 「我的」多一欄「幫家人／另一半也記一個生日」，預設收著。提醒跟入會死線
--      會一起幫他算。只記一組，不做多筆管理——越麻瓜越好。
--   2. 待辦清單可以貼標籤（例如「這次生日」「離家遠」「媽媽」），上面用標籤篩選。
--      一筆一個標籤就夠，不做多標籤。
--
--   兩個都存在原本的表上，沒有新表：
--   - profiles.alt_label / alt_birth_month / alt_birth_day（RLS 沿用「只能改自己的」）
--   - wishlist.tag（RLS 沿用 wishlist_own）
--   公開的 profiles view 沒有動，別人看不到你幫誰記生日。
--
--   前端在這支還沒跑時：待辦清單會自動改成不帶 tag 查詢（清單照樣看得到，
--   只是沒有標籤），第二組生日按儲存會提示管理員要先跑這支 SQL。
--
--   可重複執行。
-- =====================================================================

alter table public.profiles
  add column if not exists alt_label text
    check (alt_label is null or char_length(alt_label) <= 10),
  add column if not exists alt_birth_month smallint
    check (alt_birth_month is null or alt_birth_month between 1 and 12),
  add column if not exists alt_birth_day smallint
    check (alt_birth_day is null or alt_birth_day between 1 and 31);

alter table public.wishlist
  add column if not exists tag text
    check (tag is null or char_length(tag) <= 12);

create index if not exists wishlist_user_tag_idx on public.wishlist(user_id, tag);

-- 讓 PostgREST 馬上認得新欄位
notify pgrst, 'reload schema';
