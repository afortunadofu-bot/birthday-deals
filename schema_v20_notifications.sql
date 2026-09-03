-- =====================================================================
-- v20：收藏留言通知 + 排行榜「最近動態」
-- 可重複執行。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 通知表：收藏的店家有新留言時，通知收藏的人（不含留言者本人）。
--    只能靠底下的 trigger（security definer）寫入，一般使用者沒有
--    insert 權限，避免有人塞假通知。
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id           bigserial primary key,
  user_id      uuid   not null references public.profiles(id) on delete cascade,
  offer_id     bigint references public.offers(id) on delete cascade,
  comment_id   bigint references public.comments(id) on delete cascade,
  kind         text   not null default 'wishlist_comment' check (kind in ('wishlist_comment')),
  brand        text   not null default '',
  body_preview text   not null default '',
  actor_name   text   not null default '',
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_own_select on public.notifications;
create policy notifications_own_select on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists notifications_own_update on public.notifications;
create policy notifications_own_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_own_delete on public.notifications;
create policy notifications_own_delete on public.notifications
  for delete using (user_id = auth.uid());

grant select, update, delete on public.notifications to authenticated;
grant usage, select on sequence public.notifications_id_seq to authenticated;

-- ---------------------------------------------------------------------
-- 2) 留言送出時，自動通知有把這家店放進「待辦清單」的人（排除留言者自己、
--    已勾選完成的項目）。
-- ---------------------------------------------------------------------
create or replace function public.notify_wishlist_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_brand text; v_actor text;
begin
  if new.is_hidden then return new; end if;
  select brand into v_brand from public.offers where id = new.offer_id;
  select coalesce(display_name, '一位使用者') into v_actor from public.profiles where id = new.user_id;
  insert into public.notifications (user_id, offer_id, comment_id, kind, brand, body_preview, actor_name)
  select w.user_id, new.offer_id, new.id, 'wishlist_comment',
         coalesce(v_brand, ''), left(new.body, 80), coalesce(v_actor, '一位使用者')
  from public.wishlist w
  where w.offer_id = new.offer_id
    and w.user_id <> new.user_id
    and w.done = false;
  return new;
end $$;

drop trigger if exists comments_notify_wishlist on public.comments;
create trigger comments_notify_wishlist after insert on public.comments
  for each row execute function public.notify_wishlist_comment();

-- ---------------------------------------------------------------------
-- 3) 一鍵標記全部已讀。
-- ---------------------------------------------------------------------
create or replace function public.mark_notifications_read()
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null;
$$;
grant execute on function public.mark_notifications_read() to authenticated;

-- ---------------------------------------------------------------------
-- 4) 排行榜「最近動態」：混合最近的成功使用回報＋公開留言，各取近期
--    幾筆給首頁排行榜當預覽用。暱稱顯示跟排行榜本身一樣，尊重
--    show_on_leaderboard（關掉的人一樣顯示匿名使用者，不會露出真名）。
-- ---------------------------------------------------------------------
create or replace view public.recent_activity
with (security_invoker = true) as
select * from (
  select 'usage'::text as kind, r.id, r.offer_id, o.brand,
    case when p.show_on_leaderboard then p.display_name
         else '匿名使用者' || substr(p.id::text, 1, 4) end as display_name,
    null::text as body,
    r.created_at
  from public.usage_reports r
  join public.offers   o on o.id = r.offer_id
  join public.profiles p on p.id = r.user_id
  where r.result = 'success' and p.is_banned = false and o.status = 'approved'
  order by r.created_at desc
  limit 30
) u
union all
select * from (
  select 'comment'::text as kind, c.id, c.offer_id, o.brand,
    case when p.show_on_leaderboard then p.display_name
         else '匿名使用者' || substr(p.id::text, 1, 4) end as display_name,
    left(c.body, 60) as body,
    c.created_at
  from public.comments c
  join public.offers   o on o.id = c.offer_id
  join public.profiles p on p.id = c.user_id
  where c.is_hidden = false and p.is_banned = false and o.status = 'approved'
  order by c.created_at desc
  limit 30
) cm
order by created_at desc
limit 20;

grant select on public.recent_activity to anon, authenticated;
