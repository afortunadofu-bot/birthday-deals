-- =====================================================================
-- v156：行程
--
-- celine（2026-10-29）：
--   「行程那邊，我的理想狀態是可以寫日期、跟排當天要去哪間店、
--     跟可以寫備註、跟調順序」
--
-- 這是 PLAN-行程分頁.md 裡排在 v146、一直沒做的那一塊。
--
-- ---------------------------------------------------------------------
-- 跟「待辦清單」是兩件事
-- ---------------------------------------------------------------------
--   待辦清單：**想用的優惠**，整年累積，一筆就是一個優惠
--   行程：    **某一天要去哪幾家、照什麼順序**，用完就過去了
--
-- 不混在一起，但互通：行程裡的店是從待辦清單挑的（也可以搜全部的）。
--
-- ---------------------------------------------------------------------
-- 只有自己看得到
-- ---------------------------------------------------------------------
-- 兩張表都只有本人讀寫得到，anon 一個權限都沒有。plan_items 自己沒有
-- user_id，是透過它所屬的 plans 判斷——所以不可能把一間店塞進別人的行程。
--
-- 可重複執行。
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 一趟
-- ---------------------------------------------------------------------
create table if not exists public.plans (
  id         bigserial primary key,
  user_id    uuid not null default auth.uid()
             references public.profiles(id) on delete cascade,
  -- 可以先排、日期之後再定，所以允許空的
  plan_date  date,
  title      text check (title is null or char_length(title) <= 40),
  note       text check (note  is null or char_length(note)  <= 500),
  created_at timestamptz not null default now()
);
create index if not exists plans_user_idx on public.plans(user_id, plan_date);


-- ---------------------------------------------------------------------
-- 2. 那一趟要去的店
--
-- 一筆＝一個優惠。「哪一間分店」寫在 note 裡（例如「南西店 B2」）——
-- 同一個品牌在台北有十幾家店，用選單挑會是一條很長的清單，而使用者
-- 心裡想的通常是「那棟的那一家」，打字比挑快。
-- ---------------------------------------------------------------------
create table if not exists public.plan_items (
  id         bigserial primary key,
  plan_id    bigint  not null references public.plans(id)  on delete cascade,
  offer_id   bigint  not null references public.offers(id) on delete cascade,
  note       text    check (note is null or char_length(note) <= 200),
  sort_order integer not null default 0,
  done       boolean not null default false,
  created_at timestamptz not null default now(),
  -- 同一趟不會去同一家兩次；重複加的話資料庫直接擋
  unique (plan_id, offer_id)
);
create index if not exists plan_items_plan_idx on public.plan_items(plan_id, sort_order);


-- ---------------------------------------------------------------------
-- 3. RLS：只有自己
-- ---------------------------------------------------------------------
alter table public.plans      enable row level security;
alter table public.plan_items enable row level security;

drop policy if exists plans_own      on public.plans;
drop policy if exists plan_items_own on public.plan_items;

create policy plans_own on public.plans
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 沒有自己的 user_id：看它掛在哪一趟底下，那一趟是不是你的
create policy plan_items_own on public.plan_items
  for all
  using (exists (select 1 from public.plans p
                  where p.id = plan_items.plan_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.plans p
                       where p.id = plan_items.plan_id and p.user_id = auth.uid()));

-- 明確寫出來，不靠 Supabase 的 default privileges（見 v153 的說明）
revoke all on public.plans, public.plan_items from anon;
grant select, insert, update, delete on public.plans, public.plan_items to authenticated;
grant usage, select on sequence public.plans_id_seq, public.plan_items_id_seq to authenticated;


-- ---------------------------------------------------------------------
-- 4. 上限（擋在資料庫：前端的限制任何人都繞得過去）
--
--   一個人 100 趟、一趟 40 家。一般人一年過一次生日、排個幾趟；
--   這兩個數字是「不可能是正常使用」的那條線，不是「一般人的用量」。
-- ---------------------------------------------------------------------
create or replace function public.plans_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.plans where user_id = new.user_id) >= 100 then
    raise exception '行程最多存 100 趟，先刪掉幾趟舊的';
  end if;
  return new;
end;
$$;
drop trigger if exists plans_limit on public.plans;
create trigger plans_limit before insert on public.plans
  for each row execute function public.plans_limit();

create or replace function public.plan_items_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.plan_items where plan_id = new.plan_id) >= 40 then
    raise exception '一趟最多 40 家';
  end if;
  return new;
end;
$$;
drop trigger if exists plan_items_limit on public.plan_items;
create trigger plan_items_limit before insert on public.plan_items
  for each row execute function public.plan_items_limit();
