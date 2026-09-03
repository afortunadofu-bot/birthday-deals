-- =====================================================================
-- v12：審核流程永續化
--   1) 被退回的投稿／修改建議可以「救回」重新審
--   2) 集團優惠改成各品牌獨立卡片，offers 加 group_name 欄位
-- =====================================================================
-- 可重複執行。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 集團歸屬欄位：各品牌已拆成獨立資料列，這裡只留「屬於哪個集團」的標記，
--    讓使用者搜尋「王品」時還是能一次找到旗下所有品牌。
--    （取代 v10 的 sub_offers 做法，sub_offers 欄位留著不刪以免既有資料遺失。）
-- ---------------------------------------------------------------------
alter table public.offers
  add column if not exists group_name text not null default '';
create index if not exists offers_group_idx
  on public.offers(group_name) where group_name <> '';

-- ---------------------------------------------------------------------
-- 2) 救回被退回的投稿：把 status 從 rejected 改回 pending，
--    並清掉上一次的審核結果，讓它重新回到待審佇列。
-- ---------------------------------------------------------------------
create or replace function public.restore_offer(p_offer_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '只有管理員可以救回'; end if;

  update public.offers
     set status = 'pending', reviewed_by = null, reviewed_at = null,
         review_note = ''
   where id = p_offer_id and status = 'rejected';

  if not found then raise exception '找不到這筆被退回的投稿（可能已經被救回或刪除）'; end if;
end $$;

grant execute on function public.restore_offer(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 3) 救回被退回的修改建議
-- ---------------------------------------------------------------------
create or replace function public.restore_offer_edit(p_edit_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '只有管理員可以救回'; end if;

  update public.offer_edits
     set status = 'pending', reviewed_by = null, reviewed_at = null,
         review_note = ''
   where id = p_edit_id and status = 'rejected';

  if not found then raise exception '找不到這筆被退回的修改建議（可能已經被救回或刪除）'; end if;
end $$;

grant execute on function public.restore_offer_edit(bigint) to authenticated;
