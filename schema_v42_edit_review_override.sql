-- =====================================================================
-- v42：管理員審核「修改建議」時可以先調整內容再核可，不是只能整筆照收或退回
--
--   review_offer_edit() 多一個參數 p_override_patch（可省略/傳 null）。
--   有傳的話核可時套用管理員調整後的內容；沒傳（null）就跟原本一樣，
--   照民眾原始送出的 patch 套用。offer_edits.patch 這欄本身不會被
--   覆寫——民眾原始送出的內容還是完整留著，只有「實際套用到 offers
--   的值」跟「歷史紀錄（schema_v40 的 offer_edit_history）顯示的
--   actor_name 措辭」會反映管理員是否調整過，方便日後回溯「這筆到底
--   是照原樣通過，還是管理員動過手」。
-- 可重複執行。
-- =====================================================================

-- 加了新參數，函式簽章（識別身分）跟著變，先把舊版 drop 掉再建，避免
-- PostgREST 同時看到兩個不同參數個數的同名函式而選擇模稜兩可。
drop function if exists public.review_offer_edit(bigint, text, text);

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
      brand        = coalesce(v_patch->>'brand', o.brand),
      offer        = coalesce(v_patch->>'offer', o.offer),
      conditions   = coalesce(v_patch->>'conditions', o.conditions),
      membership   = coalesce(v_patch->>'membership', o.membership),
      timing       = coalesce(v_patch->>'timing', o.timing),
      offer_window = coalesce(v_patch->>'timing', o.offer_window),
      advance_days = case when v_patch ? 'advance_days'
                          then (v_patch->>'advance_days')::int else o.advance_days end,
      value_twd    = case when v_patch ? 'value_twd'
                          then (v_patch->>'value_twd')::int else o.value_twd end,
      valid_until  = case when v_patch ? 'valid_until'
                          then (v_patch->>'valid_until')::date else o.valid_until end
    where o.id = e.offer_id;
  end if;

  update public.offer_edits
     set status = p_status, reviewed_by = auth.uid(),
         reviewed_at = now(), review_note = coalesce(p_note,'')
   where id = p_edit_id;
end $$;

grant execute on function public.review_offer_edit(bigint, text, text, jsonb) to authenticated;
revoke execute on function public.review_offer_edit(bigint, text, text, jsonb) from public;
