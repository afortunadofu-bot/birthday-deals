-- v54：修「適用期間」check constraint 漏了「其他」，導致核可/編輯直接失敗
-- ---------------------------------------------------------------------
-- 嵐回饋：修改建議待審清單「全選」核可時失敗，錯誤訊息「new row for
-- relation "offers" violates check constraint "offers_timing_check"」，
-- 案例是「19to1鮮選牛排專賣店」。
--
-- 查程式碼找到根因：template.html 的 TIMINGS 陣列（新增/編輯表單的「適用
-- 期間 *」下拉選單 #fTiming 用的選項清單）是
--   ['當日','當月','當週','當月＋當日','前後3天','前後7天','其他']
-- 共 7 個選項，「其他」是其中之一，使用者一直都能選。但資料庫的
-- offers_timing_check（schema_v4.sql 當初訂的，之後從沒更新過）只允許
-- 前 6 個，沒有「其他」：
--   check (timing in ('當日','當月','當週','當月＋當日','前後3天','前後7天'))
-- 只要有人（不管是新增優惠、投稿修改建議、或管理員直接編輯）把「適用期間」
-- 選成「其他」，送到資料庫那一刻就會被這條 check constraint 擋下來——
-- 新增優惠的話送出當下就會看到錯誤；但如果是「修改建議」，前端當下看不
-- 出來（patch 先存進 offer_edits，不會馬上套用），要等管理員核可、
-- review_offer_edit() 真的去 update offers 表時才會炸開，難怪一開始看
-- 不出原因、而且偏偏在「全選批次核可」時最容易踩到（一次核可很多筆，
-- 其中一筆包到「其他」就會讓整批失敗）。
--
-- 修法：資料庫這邊補上「其他」，跟前端選項對齊即可，不用改 template.html。
-- 可重複執行。
-- ---------------------------------------------------------------------

alter table public.offers drop constraint if exists offers_timing_check;
alter table public.offers add constraint offers_timing_check
  check (timing in ('當日','當月','當週','當月＋當日','前後3天','前後7天','其他'));
