-- =====================================================================
-- v8 增量更新（可重複執行）
--   1. 讓使用者可以編輯自己的使用回報（原本只能新增/刪除，不能改）
--   2. 待辦清單（wishlist）新表
-- =====================================================================

-- ---- 1) usage_reports 補一條 update policy ----
drop policy if exists reports_own_update on public.usage_reports;
create policy reports_own_update on public.usage_reports
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- 2) 待辦清單 ----
create table if not exists public.wishlist (
  user_id    uuid   not null references public.profiles(id) on delete cascade,
  offer_id   bigint not null references public.offers(id) on delete cascade,
  done       boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, offer_id)
);
alter table public.wishlist enable row level security;

drop policy if exists wishlist_own on public.wishlist;
create policy wishlist_own on public.wishlist
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
