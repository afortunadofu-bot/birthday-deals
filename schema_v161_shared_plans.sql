-- =====================================================================
-- v161：大家的行程（分享、收藏、一鍵加入）＋行程裡的段落
--
-- 嵐：「行程有一塊是民眾投稿之類的，大家可以分享自己規劃的行程，不一定要同個
--      商圈，可以加段落跟備注。例：免費一路拿拿拿／一個人也可以吃到飽／
--      生日當天最省行程」
-- celine：「公開給所有人看的內容不用審核」「行程可以分享收藏跟一鍵加入的功能」
--
-- 不審核，但有幾條底線（擋在資料庫，不是前端）：
--   · 被停權的人不能公開；已經公開的，停權之後也不再出現在清單上
--   · 只能公開**自己的**行程；收回、刪掉隨時可以
--   · 管理員可以把別人公開的收回或刪掉——但**只限公開的**，私人行程管理員也看不到
--   · 作者名字照排行榜那一套：沒選擇上排行榜的人顯示「匿名壽星」
--
-- 可重複執行。要先跑過 v156（plans／plan_items）。
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 段落：plan_items 的一列可以是「一家店」或「一個段落標題」
--
-- 段落跟店放在同一張清單裡，調順序就是同一套 ↑↓——不用另外記「這家屬於哪一段」，
-- 標題下面到下一個標題之前的店就是那一段。
-- ---------------------------------------------------------------------
alter table public.plan_items alter column offer_id drop not null;
alter table public.plan_items
  add column if not exists heading text
  check (heading is null or char_length(heading) between 1 and 40);
do $$ begin
  alter table public.plan_items
    add constraint plan_items_offer_or_heading check (offer_id is not null or heading is not null);
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------
-- 2. 公開
-- ---------------------------------------------------------------------
alter table public.plans add column if not exists is_public boolean not null default false;
alter table public.plans add column if not exists shared_at timestamptz;
create index if not exists plans_public_idx on public.plans(shared_at desc) where is_public;


-- ---------------------------------------------------------------------
-- 3. RLS：讀＝自己的或公開的；寫＝自己的；管理員只碰得到公開的
--
-- v156 的 plans_own／plan_items_own 是「for all」——讀寫都只有本人。拆開成
-- 讀跟寫，讀多一個「或者是公開的」。
-- ---------------------------------------------------------------------
drop policy if exists plans_own     on public.plans;
drop policy if exists plans_read    on public.plans;
drop policy if exists plans_insert  on public.plans;
drop policy if exists plans_update  on public.plans;
drop policy if exists plans_delete  on public.plans;
drop policy if exists plans_admin_update on public.plans;
drop policy if exists plans_admin_delete on public.plans;

create policy plans_read on public.plans
  for select using (user_id = auth.uid() or is_public);
-- 公開這件事要「沒被停權」；私人的照舊誰都能存
create policy plans_insert on public.plans
  for insert with check (user_id = auth.uid() and (not is_public or not public.is_banned()));
create policy plans_update on public.plans
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid() and (not is_public or not public.is_banned()));
create policy plans_delete on public.plans
  for delete using (user_id = auth.uid());
-- 管理員：只有公開的。用 for all 的話管理員連別人的私人行程都讀得到，那不行
create policy plans_admin_update on public.plans
  for update using (public.is_admin() and is_public) with check (public.is_admin());
create policy plans_admin_delete on public.plans
  for delete using (public.is_admin() and is_public);

drop policy if exists plan_items_own    on public.plan_items;
drop policy if exists plan_items_read   on public.plan_items;
drop policy if exists plan_items_insert on public.plan_items;
drop policy if exists plan_items_update on public.plan_items;
drop policy if exists plan_items_delete on public.plan_items;

create policy plan_items_read on public.plan_items
  for select using (exists (select 1 from public.plans p
    where p.id = plan_items.plan_id and (p.user_id = auth.uid() or p.is_public)));
create policy plan_items_insert on public.plan_items
  for insert with check (exists (select 1 from public.plans p
    where p.id = plan_items.plan_id and p.user_id = auth.uid()));
create policy plan_items_update on public.plan_items
  for update using (exists (select 1 from public.plans p
    where p.id = plan_items.plan_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.plans p
    where p.id = plan_items.plan_id and p.user_id = auth.uid()));
create policy plan_items_delete on public.plan_items
  for delete using (exists (select 1 from public.plans p
    where p.id = plan_items.plan_id and p.user_id = auth.uid()));

-- 沒登入也看得到「大家的行程」：讀的權限給 anon，RLS 只放行公開的那幾趟
grant select on public.plans, public.plan_items to anon;


-- ---------------------------------------------------------------------
-- 4. 收藏別人的行程
-- ---------------------------------------------------------------------
create table if not exists public.plan_saves (
  user_id    uuid   not null default auth.uid() references public.profiles(id) on delete cascade,
  plan_id    bigint not null references public.plans(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, plan_id)
);
alter table public.plan_saves enable row level security;
drop policy if exists plan_saves_read   on public.plan_saves;
drop policy if exists plan_saves_insert on public.plan_saves;
drop policy if exists plan_saves_delete on public.plan_saves;
create policy plan_saves_read on public.plan_saves
  for select using (user_id = auth.uid());
-- 只能收藏公開的（作者收回之後，收藏的人也就看不到了——那一列留著，重新公開時還在）
create policy plan_saves_insert on public.plan_saves
  for insert with check (user_id = auth.uid() and exists (
    select 1 from public.plans p where p.id = plan_saves.plan_id and p.is_public));
create policy plan_saves_delete on public.plan_saves
  for delete using (user_id = auth.uid());
revoke all on public.plan_saves from anon;
grant select, insert, delete on public.plan_saves to authenticated;


-- ---------------------------------------------------------------------
-- 5. 清單：shared_plans()
--
-- 為什麼是函式不是 view：要數「幾個人收藏」，而 plan_saves 的 RLS 只讓你看到
-- 自己那一列；要拿作者暱稱，profiles 也有 RLS。security definer 的函式可以數
-- 全部、讀暱稱，但只吐出公開的行程跟遮好的名字。
-- ---------------------------------------------------------------------
create or replace function public.shared_plans(p_limit integer default 60)
returns table (id bigint, title text, note text, plan_date date, shared_at timestamptz,
               author text, mine boolean, saved boolean, n_stops integer, n_saves integer)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.title, p.note, p.plan_date, p.shared_at,
         case when pr.show_on_leaderboard and coalesce(pr.display_name, '') <> ''
              then pr.display_name else '匿名壽星' end,
         p.user_id = auth.uid(),
         exists (select 1 from public.plan_saves s where s.plan_id = p.id and s.user_id = auth.uid()),
         (select count(*)::int from public.plan_items i where i.plan_id = p.id and i.offer_id is not null),
         (select count(*)::int from public.plan_saves s where s.plan_id = p.id)
    from public.plans p
    join public.profiles pr on pr.id = p.user_id
   where p.is_public and not coalesce(pr.is_banned, false)
   order by p.shared_at desc nulls last, p.id desc
   limit least(greatest(coalesce(p_limit, 60), 1), 200);
$$;

revoke execute on function public.shared_plans(integer) from public;
grant  execute on function public.shared_plans(integer) to anon, authenticated;
