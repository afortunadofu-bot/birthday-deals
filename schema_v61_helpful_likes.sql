-- =====================================================================
-- v61：使用回報、留言可以按讚
--
--   背景：celine 回饋「不知道能不能幫回報人或是分享經驗的人按讚，有些他們提供的
--   資訊很好、很想按讚」。使用回報（usage_reports）跟留言（comments）原本只能看，
--   沒有任何方式表示「這則很有幫助」。
--
--   設計：
--   - 回報、留言各一張表（report_likes／comment_likes），不做一張「target_type +
--     target_id」的通用表——那樣沒辦法用外鍵，回報或留言被刪掉時讚會變成孤兒資料；
--     分兩張表就能 on delete cascade，刪回報／留言時讚一起清掉
--   - 主鍵 (被按讚的那則, user_id)：同一個人對同一則只能按一次，重複按資料庫直接擋
--   - 讀：所有人都能讀（前端要算讚數），跟回報／留言本身一樣是公開資訊
--   - 寫：要登入、沒被停權、只能用自己的 user_id、不能幫自己的回報／留言按讚；
--     收回讚只能收自己的。規則跟 schema.sql 裡 reports_insert／comments_insert 同一套
--   - 被隱藏的留言（is_hidden）不能再被按讚
--
--   純新增，不動既有資料表。可重複執行。
-- =====================================================================

create table if not exists public.report_likes (
  report_id   bigint not null references public.usage_reports(id) on delete cascade,
  user_id     uuid   not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (report_id, user_id)
);
create index if not exists report_likes_user_idx on public.report_likes(user_id);

create table if not exists public.comment_likes (
  comment_id  bigint not null references public.comments(id) on delete cascade,
  user_id     uuid   not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index if not exists comment_likes_user_idx on public.comment_likes(user_id);

alter table public.report_likes  enable row level security;
alter table public.comment_likes enable row level security;

-- ---- report_likes ----
drop policy if exists report_likes_read   on public.report_likes;
drop policy if exists report_likes_insert on public.report_likes;
drop policy if exists report_likes_delete on public.report_likes;

create policy report_likes_read on public.report_likes
  for select using (true);

create policy report_likes_insert on public.report_likes
  for insert with check (
    auth.uid() is not null
    and not public.is_banned()
    and user_id = auth.uid()
    and exists (select 1 from public.usage_reports r
                where r.id = report_id and r.user_id <> auth.uid())
  );

create policy report_likes_delete on public.report_likes
  for delete using (user_id = auth.uid() or public.is_admin());

-- ---- comment_likes ----
drop policy if exists comment_likes_read   on public.comment_likes;
drop policy if exists comment_likes_insert on public.comment_likes;
drop policy if exists comment_likes_delete on public.comment_likes;

create policy comment_likes_read on public.comment_likes
  for select using (true);

create policy comment_likes_insert on public.comment_likes
  for insert with check (
    auth.uid() is not null
    and not public.is_banned()
    and user_id = auth.uid()
    and exists (select 1 from public.comments c
                where c.id = comment_id and c.user_id <> auth.uid() and not c.is_hidden)
  );

create policy comment_likes_delete on public.comment_likes
  for delete using (user_id = auth.uid() or public.is_admin());

grant select on public.report_likes, public.comment_likes to anon, authenticated;
grant insert, delete on public.report_likes, public.comment_likes to authenticated;
