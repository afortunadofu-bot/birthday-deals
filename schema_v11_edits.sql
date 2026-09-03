-- =====================================================================
-- v11：民眾可以對「已上架」的優惠提出修改建議，管理員審核通過才會真的改到
-- =====================================================================
-- 跟投稿新優惠不一樣：投稿新優惠是「整筆新增」，這裡是針對現有一筆優惠，
-- 只記錄「哪些欄位、改成什麼」，管理員在審核清單可以看到新舊對照，核可
-- 才會真的套用到 public.offers；退回的話原本的資料完全不動。
-- 可重複執行。
-- =====================================================================

create table if not exists public.offer_edits (
  id          bigserial primary key,
  offer_id    bigint not null references public.offers(id) on delete cascade,
  proposed_by uuid   not null references public.profiles(id) on delete cascade,
  patch       jsonb  not null,              -- 只存有改動的欄位，例如 {"offer":"...","advance_days":7}
  reason      text   not null default '' check (char_length(reason) <= 300),
  source_url  text   not null default '',
  source_tier int    not null default 3,
  status      text   not null default 'pending'
              check (status in ('pending','approved','rejected')),
  reviewed_by uuid   references public.profiles(id),
  reviewed_at timestamptz,
  review_note text   not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists offer_edits_status_idx on public.offer_edits(status);
create index if not exists offer_edits_offer_idx  on public.offer_edits(offer_id);

alter table public.offer_edits enable row level security;

drop policy if exists edits_read_own on public.offer_edits;
drop policy if exists edits_insert   on public.offer_edits;
drop policy if exists edits_admin    on public.offer_edits;

-- 自己投的建議自己看得到狀態，管理員看得到全部
create policy edits_read_own on public.offer_edits
  for select using (proposed_by = auth.uid() or public.is_admin());

create policy edits_insert on public.offer_edits
  for insert with check (
    auth.uid() is not null
    and not public.is_banned()
    and proposed_by = auth.uid()
    and status = 'pending'
  );

create policy edits_admin on public.offer_edits
  for all using (public.is_admin()) with check (public.is_admin());

-- 核可／退回用 RPC：security definer + 內部檢查是不是管理員，
-- 核可時用 patch 裡「有出現的欄位」覆蓋 offers，沒出現的欄位維持原樣。
create or replace function public.review_offer_edit(p_edit_id bigint, p_status text, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare e public.offer_edits;
begin
  if not public.is_admin() then raise exception '只有管理員可以審核'; end if;
  if p_status not in ('approved','rejected') then raise exception '狀態不合法'; end if;

  select * into e from public.offer_edits where id = p_edit_id;
  if e.id is null then raise exception '找不到這筆建議'; end if;
  if e.status <> 'pending' then raise exception '這筆已經審核過了'; end if;

  if p_status = 'approved' then
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
