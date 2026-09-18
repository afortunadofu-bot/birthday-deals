-- =====================================================================
-- v68：問題回報／建議多一個「修改中」狀態
--
--   嵐：修改建議可以篩選已完成、未完成跟修改中。
--   site_feedback.status 原本只有 open（待處理）／resolved（已處理），
--   加一個 in_progress（修改中）：看過、正在改，但還沒改好。
--   管理員本來就能直接更新這張表（改回待處理也是這樣做），不用新的 RPC；
--   「標記已處理」照舊走 admin_resolve_feedback()（會通知送出者）。
--
--   可重複執行。
-- =====================================================================

alter table public.site_feedback drop constraint if exists site_feedback_status_check;
alter table public.site_feedback
  add constraint site_feedback_status_check check (status in ('open', 'in_progress', 'resolved'));
