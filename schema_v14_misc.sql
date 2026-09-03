-- =====================================================================
-- v14：投稿可取消、問題回報、成效追蹤／管理員儀表板
-- =====================================================================
-- 可重複執行。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 讓投稿人可以自己撤回還在待審的投稿／修改建議
--    （之前只有 offers_update_own，沒有對應的 delete 版本）
-- ---------------------------------------------------------------------
drop policy if exists offers_delete_own on public.offers;
create policy offers_delete_own on public.offers
  for delete using (submitted_by = auth.uid() and status = 'pending');

drop policy if exists edits_delete_own on public.offer_edits;
create policy edits_delete_own on public.offer_edits
  for delete using (proposed_by = auth.uid() and status = 'pending');

-- ---------------------------------------------------------------------
-- 2) 問題回報（網站本身的問題，跟「優惠使用回報」是分開的兩件事）
--    訪客也能回報，所以開放 anon 可以 insert，但只有管理員能看內容。
-- ---------------------------------------------------------------------
create table if not exists public.site_feedback (
  id         bigserial primary key,
  user_id    uuid references public.profiles(id) on delete set null,
  email      text not null default '',
  message    text not null check (char_length(message) between 1 and 1000),
  page       text not null default '',
  ua         text not null default '',
  status     text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now()
);
create index if not exists site_feedback_status_idx on public.site_feedback(status);

alter table public.site_feedback enable row level security;

drop policy if exists feedback_insert on public.site_feedback;
drop policy if exists feedback_admin  on public.site_feedback;

create policy feedback_insert on public.site_feedback
  for insert with check (true);          -- 訪客也能回報，不用登入

create policy feedback_admin on public.site_feedback
  for all using (public.is_admin()) with check (public.is_admin());

grant insert on public.site_feedback to anon, authenticated;
grant select, update on public.site_feedback to authenticated;   -- 實際能不能看/改仍受上面 RLS 限制，管理員以外看不到別人回報的內容

-- ---------------------------------------------------------------------
-- 3) 成效追蹤：極簡事件記錄（頁面瀏覽 + 幾個關鍵動作），只給管理員儀表板統計用
--    刻意不記錄 IP／裝置指紋等個資，session_id 只是瀏覽器端隨機字串，
--    重整或清 storage 就會換一個，不能拿來反查是誰。
-- ---------------------------------------------------------------------
create table if not exists public.site_events (
  id         bigserial primary key,
  event_type text not null,              -- 'pageview' | 'submit' | 'use_report' | 'wish' | 'rate' ...
  session_id text not null default '',
  user_id    uuid references public.profiles(id) on delete set null,
  meta       jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists site_events_type_idx on public.site_events(event_type, created_at);
create index if not exists site_events_created_idx on public.site_events(created_at);

alter table public.site_events enable row level security;

drop policy if exists events_insert on public.site_events;
drop policy if exists events_admin  on public.site_events;

create policy events_insert on public.site_events
  for insert with check (true);

create policy events_admin on public.site_events
  for select using (public.is_admin());

grant insert on public.site_events to anon, authenticated;
grant select on public.site_events to authenticated;

-- ---------------------------------------------------------------------
-- 4) 管理員儀表板：一次撈回幾個關鍵數字，前端只要呼叫這個 RPC 就好，
--    不用自己拼好幾個 count 查詢（也避免暴露 site_events 給非管理員）。
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception '只有管理員可以看儀表板'; end if;

  select jsonb_build_object(
    'pageviews_total', (select count(*) from public.site_events where event_type='pageview'),
    'pageviews_7d',    (select count(*) from public.site_events where event_type='pageview' and created_at > now()-interval '7 days'),
    'pageviews_30d',   (select count(*) from public.site_events where event_type='pageview' and created_at > now()-interval '30 days'),
    'visitors_7d',     (select count(distinct session_id) from public.site_events where created_at > now()-interval '7 days' and session_id <> ''),
    'visitors_30d',    (select count(distinct session_id) from public.site_events where created_at > now()-interval '30 days' and session_id <> ''),
    'total_users',     (select count(*) from public.profiles),
    'new_users_7d',    (select count(*) from public.profiles where created_at > now()-interval '7 days'),
    'active_users_7d', (select count(distinct user_id) from public.site_events where created_at > now()-interval '7 days' and user_id is not null),
    'total_offers',    (select count(*) from public.offers where status='approved'),
    'pending_offers',  (select count(*) from public.offers where status='pending'),
    'total_use_reports', (select count(*) from public.usage_reports),
    'use_reports_7d',  (select count(*) from public.usage_reports where created_at > now()-interval '7 days'),
    'open_feedback',   (select count(*) from public.site_feedback where status='open'),
    'events_by_type_7d', (select coalesce(jsonb_object_agg(event_type, cnt), '{}'::jsonb)
      from (select event_type, count(*) cnt from public.site_events
            where created_at > now()-interval '7 days' group by event_type) t)
  ) into result;
  return result;
end $$;

grant execute on function public.admin_dashboard_stats() to authenticated;
