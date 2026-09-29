-- =====================================================================
-- v73：自己看得到自己回報過的問題／建議
--
--   嵐：「我填寫過的回報問題，要可以出現在我的頁面。」
--
--   site_feedback 原本只有兩條 RLS：任何人都能新增（feedback_insert）、
--   只有管理員能讀寫（feedback_admin）。所以送出之後就石沉大海，
--   連自己送過什麼、處理到哪了都看不到。
--
--   這裡只加一條「讀自己那幾筆」的政策：
--     - 只有登入者適用，而且只看得到 user_id 等於自己的那幾筆
--     - 訪客送的沒有 user_id，本來就沒有「自己」可言，不受影響
--     - 仍然不能改（update 還是只有管理員能做），所以狀態跟管理員的回覆
--       都是唯讀的
--
--   可重複執行。
-- =====================================================================

drop policy if exists feedback_own on public.site_feedback;
create policy feedback_own on public.site_feedback
  for select to authenticated
  using (user_id = auth.uid());
