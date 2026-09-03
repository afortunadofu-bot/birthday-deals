-- =====================================================================
-- v32：處理 Security Advisor 的 40 個 warnings 裡，可以放心處理的部分
-- 可重複執行。
-- =====================================================================
-- 這批 warning 大致三種：
--   1) touch_updated_at() 沒設 search_path —— 唯一一個真的漏設的，補上。
--   2) 一堆 SECURITY DEFINER 函式「anon 沒登入也能呼叫」——這些函式一進來
--      都會先 if not is_admin() then raise exception，所以就算被呼叫也只
--      會拿到權限錯誤，不會真的動到資料；但既然 anon 本來就不該碰這些，
--      乾脆把預設的 PUBLIC 執行權收回，只留 authenticated（管理員判斷還是
--      靠函式內部的 is_admin()，這裡只是縮小「誰可以嘗試呼叫」的範圍）。
--      trigger 專用的幾個函式（handle_new_user／fill_saved_amount／
--      guard_profile_privileges／notify_wishlist_comment）也一樣收回——
--      trigger 是資料庫自己觸發的，不需要任何角色有 EXECUTE 權限。
--   3) is_admin()／is_banned()／submissions_today()／comments_today() 這
--      四個「刻意」不動：它們被寫在 comments 等表格的 RLS 政策裡（例如
--      comments_read using (... or public.is_admin())），這些政策連未登入
--      的訪客查留言都會用到；收回 PUBLIC 的執行權會讓訪客連留言都讀不到，
--      風險比 warning 本身還大，所以維持現狀。
--   4) 「Leaked Password Protection Disabled」是 Auth 設定，不是 SQL 能
--      改的——去 Supabase 後台 Authentication → Policies（或 Auth 設定）
--      裡開啟「洩漏密碼防護」即可，跟這份檔案無關。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 補 search_path
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------------
-- 2) 收回不需要的 PUBLIC 執行權（管理員 RPC：內部本來就有 is_admin() 檢查）
-- ---------------------------------------------------------------------
revoke execute on function public.review_offer(bigint, text, boolean, text) from public;
revoke execute on function public.review_offer_edit(bigint, text, text) from public;
revoke execute on function public.restore_offer(bigint) from public;
revoke execute on function public.restore_offer_edit(bigint) from public;
revoke execute on function public.admin_set_admin(text, uuid, boolean) from public;
revoke execute on function public.admin_dashboard_stats() from public;
revoke execute on function public.admin_dashboard_series(int) from public;
revoke execute on function public.admin_birthday_distribution() from public;
revoke execute on function public.admin_list_feedback() from public;
revoke execute on function public.mark_notifications_read() from public;

grant execute on function public.review_offer(bigint, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3) 收回 trigger 專用函式的 PUBLIC 執行權（trigger 觸發不需要角色有權限）
-- ---------------------------------------------------------------------
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.fill_saved_amount() from public;
revoke execute on function public.guard_profile_privileges() from public;
revoke execute on function public.notify_wishlist_comment() from public;
