-- =====================================================================
-- v40：已上架優惠的修改歷史，改成大家都看得到，不只投稿人跟管理員
--
--   背景：原本 offers.admin_edit_diff 只有「投稿審核當下」被改了哪裡會記錄
--   （而且只存最新一次，會被覆蓋），只有投稿人跟管理員看得到，這個維持
--   不變，服務的是不同情境（審核前的原始內容 vs 實際發布內容）。
--
--   真正的「上架後修改歷史」目前完全沒有記錄——管理員直接編輯已上架優惠
--   （detail 頁「編輯（管理員）」）是直接覆蓋 offers，什麼痕跡都不留；
--   使用者建議修改被核可套用（review_offer_edit）雖然 offer_edits 那筆
--   本身有 reason／時間，但一般人看不到（RLS 只開放本人跟管理員）。
--
--   這裡改用一張新表 + trigger 統一記錄：不管是管理員直接編輯，還是
--   核可使用者的修改建議，只要是「已上架優惠的內容欄位」被改動，
--   offers 的 update trigger 都會自動比對 OLD/NEW 寫一筆歷史紀錄，
--   不用前端自己算 diff、也不怕漏記。核可使用者建議修改時，額外用
--   set_config() 把該筆建議的「理由」跟「投稿人」帶給 trigger，
--   歷史紀錄才能顯示「這是誰、為什麼提的」，而不是只顯示核可的管理員。
--
--   剛通過審核（pending → approved）不算「修改」，是「核可上架」，
--   trigger 特別排除這種轉場，不會生出一筆奇怪的「品牌名稱：空的→XX」。
-- 可重複執行。
-- =====================================================================

create table if not exists public.offer_edit_history (
  id          bigint generated always as identity primary key,
  offer_id    bigint not null references public.offers(id) on delete cascade,
  changed_by  uuid references public.profiles(id) on delete set null,
  actor_name  text not null default '',
  reason      text not null default '',
  changes     jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists offer_edit_history_offer_idx
  on public.offer_edit_history(offer_id, created_at desc);

alter table public.offer_edit_history enable row level security;

-- 誰都能讀（跟優惠內容本身一樣是公開資訊），只有底下的 trigger
-- （security definer）能寫，一般使用者沒有 insert 權限。
drop policy if exists edit_history_read_all on public.offer_edit_history;
create policy edit_history_read_all on public.offer_edit_history
  for select using (true);

grant select on public.offer_edit_history to anon, authenticated;

create or replace function public.log_offer_edit_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  changes jsonb := '{}'::jsonb;
  v_actor text;
begin
  -- 只記錄「本來就已上架、改完還是上架」的異動。剛核可（pending→approved）
  -- 或下架／退回（→ 非 approved）都不算「修改」，跳過。
  if OLD.status <> 'approved' or NEW.status <> 'approved' then
    return NEW;
  end if;

  if OLD.brand is distinct from NEW.brand then
    changes := changes || jsonb_build_object('brand', jsonb_build_object('from',OLD.brand,'to',NEW.brand));
  end if;
  if OLD.offer is distinct from NEW.offer then
    changes := changes || jsonb_build_object('offer', jsonb_build_object('from',OLD.offer,'to',NEW.offer));
  end if;
  if OLD.conditions is distinct from NEW.conditions then
    changes := changes || jsonb_build_object('conditions', jsonb_build_object('from',OLD.conditions,'to',NEW.conditions));
  end if;
  if OLD.membership is distinct from NEW.membership then
    changes := changes || jsonb_build_object('membership', jsonb_build_object('from',OLD.membership,'to',NEW.membership));
  end if;
  if coalesce(OLD.timing,OLD.offer_window) is distinct from coalesce(NEW.timing,NEW.offer_window) then
    changes := changes || jsonb_build_object('timing',
      jsonb_build_object('from',coalesce(OLD.timing,OLD.offer_window),'to',coalesce(NEW.timing,NEW.offer_window)));
  end if;
  if OLD.advance_days is distinct from NEW.advance_days then
    changes := changes || jsonb_build_object('advance_days', jsonb_build_object('from',OLD.advance_days,'to',NEW.advance_days));
  end if;
  if OLD.value_twd is distinct from NEW.value_twd then
    changes := changes || jsonb_build_object('value_twd', jsonb_build_object('from',OLD.value_twd,'to',NEW.value_twd));
  end if;
  if OLD.valid_until is distinct from NEW.valid_until then
    changes := changes || jsonb_build_object('valid_until', jsonb_build_object('from',OLD.valid_until,'to',NEW.valid_until));
  end if;
  if OLD.category is distinct from NEW.category then
    changes := changes || jsonb_build_object('category', jsonb_build_object('from',OLD.category,'to',NEW.category));
  end if;
  if OLD.requires_companion is distinct from NEW.requires_companion then
    changes := changes || jsonb_build_object('requires_companion', jsonb_build_object('from',OLD.requires_companion,'to',NEW.requires_companion));
  end if;
  if OLD.regions is distinct from NEW.regions then
    changes := changes || jsonb_build_object('regions', jsonb_build_object('from',to_jsonb(OLD.regions),'to',to_jsonb(NEW.regions)));
  end if;

  if changes = '{}'::jsonb then
    return NEW;
  end if;

  select display_name into v_actor from public.profiles where id = auth.uid();

  insert into public.offer_edit_history (offer_id, changed_by, actor_name, reason, changes)
  values (
    NEW.id, auth.uid(),
    coalesce(nullif(current_setting('app.edit_actor_name', true), ''), v_actor, '管理員'),
    coalesce(current_setting('app.edit_reason', true), ''),
    changes
  );
  return NEW;
end $$;

drop trigger if exists offers_log_edit_history on public.offers;
create trigger offers_log_edit_history after update on public.offers
  for each row execute function public.log_offer_edit_history();

-- review_offer_edit() 核可使用者建議修改時，把該筆建議的理由跟投稿人
-- 名字先塞進當前交易的 session 設定，上面的 trigger 才抓得到，不然
-- 歷史紀錄只會顯示「管理員」+ 空白理由，看不出這其實是某個人提的建議。
-- set_config 第三個參數 true 代表只在這次交易內生效，交易結束自動清掉。
create or replace function public.review_offer_edit(p_edit_id bigint, p_status text, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare e public.offer_edits; v_proposer_name text;
begin
  if not public.is_admin() then raise exception '只有管理員可以審核'; end if;
  if p_status not in ('approved','rejected') then raise exception '狀態不合法'; end if;

  select * into e from public.offer_edits where id = p_edit_id;
  if e.id is null then raise exception '找不到這筆建議'; end if;
  if e.status <> 'pending' then raise exception '這筆已經審核過了'; end if;

  if p_status = 'approved' then
    select display_name into v_proposer_name from public.profiles where id = e.proposed_by;
    perform set_config('app.edit_reason', coalesce(nullif(e.reason,''), '（民眾建議修改）'), true);
    perform set_config('app.edit_actor_name', coalesce(v_proposer_name,'一位使用者') || '（建議修改，管理員核可）', true);

    update public.offers o set
      brand        = coalesce(e.patch->>'brand', o.brand),
      offer        = coalesce(e.patch->>'offer', o.offer),
      conditions   = coalesce(e.patch->>'conditions', o.conditions),
      membership   = coalesce(e.patch->>'membership', o.membership),
      timing       = coalesce(e.patch->>'timing', o.timing),
      offer_window = coalesce(e.patch->>'timing', o.offer_window),
      advance_days = case when e.patch ? 'advance_days'
                          then (e.patch->>'advance_days')::int else o.advance_days end,
      value_twd    = case when e.patch ? 'value_twd'
                          then (e.patch->>'value_twd')::int else o.value_twd end,
      valid_until  = case when e.patch ? 'valid_until'
                          then (e.patch->>'valid_until')::date else o.valid_until end
    where o.id = e.offer_id;
  end if;

  update public.offer_edits
     set status = p_status, reviewed_by = auth.uid(),
         reviewed_at = now(), review_note = coalesce(p_note,'')
   where id = p_edit_id;
end $$;

grant execute on function public.review_offer_edit(bigint, text, text) to authenticated;
revoke execute on function public.review_offer_edit(bigint, text, text) from public;
