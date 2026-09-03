-- =====================================================================
-- v6 增量更新：讓投稿者可以編輯自己「還在待審」的投稿
-- 在 Supabase SQL Editor 貼上整份執行即可，可重複執行。
-- =====================================================================

drop policy if exists offers_update_own on public.offers;

-- 只能改自己投的、而且還沒審過的（status = pending）。
-- using：能被改到的列必須符合這個條件。
-- with check：改完之後的新內容也必須繼續符合——擋掉「偷改 status/verified/submitted_by
-- 讓自己直接上架」這種招數，狀態一定要維持 pending、verified 一定要維持 false、
-- 送出者不能換人。已經核可或退回的投稿，因為 status 不再是 pending，
-- using 條件就不成立，自然就編輯不了了。
create policy offers_update_own on public.offers
  for update
  using (submitted_by = auth.uid() and status = 'pending')
  with check (submitted_by = auth.uid() and status = 'pending' and verified = false);
