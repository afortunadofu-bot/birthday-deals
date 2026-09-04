-- =====================================================================
-- v52：「建議修改」補齊漏掉的欄位（適用縣市／類別／會員種類…），
--       review_offer_edit() 核可時真的會套用這些欄位
--
-- celine 回饋：建議修改時只改「適用縣市」，填了修改原因還是被「沒有偵測
-- 到任何欄位變動」擋下來送不出去。前端那邊（比對「改之前 vs 改之後」的
-- 欄位清單）已經在 template.html 補齊了，這支 SQL 補的是更深一層、光改
-- 前端還不夠的問題：
--
--   review_offer_edit() 核可時把 patch 套到 offers 表，v42 那時只處理了
--   brand/offer/conditions/membership/timing/advance_days/value_twd/
--   valid_until 這 8 個欄位——就算前端把 regions 正確塞進 patch 送出、
--   管理員也核可了，這支函式完全沒有 regions 這一行，套用時就是「靜靜
--   忽略」，民眾會看到「已核可」卻發現網站上的縣市根本沒變，比原本擋
--   下來送不出去更誤導人。這支把 category／regions／membership_type／
--   free_tier／valid_from／requires_companion／transferable／sources
--   全部補進去。
--
-- 型別對照（跟 schema.sql 的 offers 表一致）：
--   regions text[]、sources jsonb、valid_from date、
--   requires_companion boolean、其餘都是 text。
-- 可重複執行。
-- =====================================================================

create or replace function public.review_offer_edit(
  p_edit_id bigint, p_status text, p_note text default '', p_override_patch jsonb default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  e public.offer_edits;
  v_proposer_name text;
  v_patch jsonb;
begin
  if not public.is_admin() then raise exception '只有管理員可以審核'; end if;
  if p_status not in ('approved','rejected') then raise exception '狀態不合法'; end if;

  select * into e from public.offer_edits where id = p_edit_id;
  if e.id is null then raise exception '找不到這筆建議'; end if;
  if e.status <> 'pending' then raise exception '這筆已經審核過了'; end if;

  if p_status = 'approved' then
    v_patch := coalesce(p_override_patch, e.patch);
    select display_name into v_proposer_name from public.profiles where id = e.proposed_by;
    perform set_config('app.edit_reason', coalesce(nullif(e.reason,''), '（民眾建議修改）'), true);
    perform set_config('app.edit_actor_name',
      case when p_override_patch is not null and p_override_patch is distinct from e.patch
        then coalesce(v_proposer_name,'一位使用者') || '（建議修改，管理員調整後核可）'
        else coalesce(v_proposer_name,'一位使用者') || '（建議修改，管理員核可）'
      end, true);

    update public.offers o set
      brand              = coalesce(v_patch->>'brand', o.brand),
      category           = coalesce(v_patch->>'category', o.category),
      offer              = coalesce(v_patch->>'offer', o.offer),
      conditions         = coalesce(v_patch->>'conditions', o.conditions),
      membership         = coalesce(v_patch->>'membership', o.membership),
      membership_type    = coalesce(v_patch->>'membership_type', o.membership_type),
      free_tier          = coalesce(v_patch->>'free_tier', o.free_tier),
      transferable       = coalesce(v_patch->>'transferable', o.transferable),
      timing             = coalesce(v_patch->>'timing', o.timing),
      offer_window       = coalesce(v_patch->>'timing', o.offer_window),
      advance_days       = case when v_patch ? 'advance_days'
                                then (v_patch->>'advance_days')::int else o.advance_days end,
      value_twd          = case when v_patch ? 'value_twd'
                                then (v_patch->>'value_twd')::int else o.value_twd end,
      valid_from         = case when v_patch ? 'valid_from'
                                then nullif(v_patch->>'valid_from','')::date else o.valid_from end,
      valid_until        = case when v_patch ? 'valid_until'
                                then nullif(v_patch->>'valid_until','')::date else o.valid_until end,
      requires_companion = case when v_patch ? 'requires_companion'
                                then (v_patch->>'requires_companion')::boolean else o.requires_companion end,
      regions            = case when v_patch ? 'regions'
                                then array(select jsonb_array_elements_text(v_patch->'regions')) else o.regions end,
      sources            = case when v_patch ? 'sources'
                                then (v_patch->'sources') else o.sources end
    where o.id = e.offer_id;
  end if;

  update public.offer_edits
     set status = p_status, reviewed_by = auth.uid(),
         reviewed_at = now(), review_note = coalesce(p_note,'')
   where id = p_edit_id;
end $$;

grant execute on function public.review_offer_edit(bigint, text, text, jsonb) to authenticated;
revoke execute on function public.review_offer_edit(bigint, text, text, jsonb) from public;
