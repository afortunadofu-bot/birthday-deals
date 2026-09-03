-- =====================================================================
-- v46：公告改成有歷史紀錄的表，可編輯／刪除／調整顯示天數，不用登入也看得到
--
--   schema_v39 的公告只會寫進每個人的 notifications（通知鈴鐺），寫完就
--   「消失」了——管理員自己也查不回發過什麼、改不了內容、也沒辦法設定
--   要顯示多久。這裡另外開一張 announcements 表，公告本身是一筆「有生命
--   週期」的紀錄，通知鈴鐺只是它發布時順便做的「推播」，不是唯一的存放
--   位置：
--     - announcements 本表：管理員可以看歷史、編輯、刪除、調整顯示天數
--       （duration_days，從發布時間起算還要顯示多久）。
--     - 發布當下一樣會廣播到 notifications，讓已經登入過的人在鈴鐺看到
--       （沿用 schema_v39 的 admin_broadcast_notification，不重複寫一次
--       邏輯）。
--     - 編輯／刪除公告本身不會去動已經發送出去的 notifications——那些是
--       每個人自己通知列表裡的歷史紀錄，跟公告横幅是否還在展示是兩件事，
--       編輯公告不應該偷偷改掉別人通知列表裡看到的內容，刪除公告也不
--       應該把人家通知鈴鐺裡的紀錄一起清掉。
--     - 未登入的訪客本來就沒有 notifications 可看，所以另外開一個公開
--       view（current_announcement）只吐出「還在效期內的最新一則」，
--       不需要登入就讀得到，也不會洩漏歷史上已經過期的公告內容。
-- 可重複執行。
-- =====================================================================

create table if not exists public.announcements (
  id            bigserial primary key,
  title         text not null check (char_length(title) between 1 and 60),
  body          text not null default '' check (char_length(body) <= 300),
  duration_days int  not null default 14 check (duration_days between 1 and 365),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.announcements enable row level security;

drop policy if exists announcements_admin_all on public.announcements;
create policy announcements_admin_all on public.announcements
  for all using (public.is_admin()) with check (public.is_admin());

-- 公開子集：只吐「還在效期內」的最新一則，不用登入也讀得到；不用
-- security_invoker——本表本身鎖給管理員，這個 view 是刻意開的公開窗口，
-- 只挑一列、只挑三個安全欄位出來，不會洩漏歷史已過期的公告內容。
create or replace view public.current_announcement as
select id, title, body, created_at
from public.announcements
where now() < created_at + (duration_days || ' days')::interval
order by created_at desc
limit 1;

grant select on public.current_announcement to anon, authenticated;

-- touch_updated_at() 是 schema_v32 已經有的通用 trigger 函式，直接掛上來用。
drop trigger if exists announcements_touch on public.announcements;
create trigger announcements_touch before update on public.announcements
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 管理員 CRUD：都走 RPC，不直接開表格 insert/update/delete 給前端，
-- 這樣「發布時順便廣播到 notifications」這件事才能保證跟寫入 announcements
-- 綁在同一個函式裡，不會有人繞過廣播直接寫表。
-- ---------------------------------------------------------------------
create or replace function public.admin_create_announcement(
  p_title text, p_body text default '', p_duration_days int default 14
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not public.is_admin() then raise exception '只有管理員可以發公告'; end if;
  insert into public.announcements (title, body, duration_days, created_by)
  values (trim(coalesce(p_title,'')), left(trim(coalesce(p_body,'')),300),
          greatest(1, least(365, coalesce(p_duration_days,14))), auth.uid())
  returning id into v_id;
  -- 沿用 schema_v39 的廣播函式，一次幫每個登入過、沒被封鎖的帳號插一筆通知。
  perform public.admin_broadcast_notification(p_title, p_body);
  return v_id;
end $$;

create or replace function public.admin_update_announcement(
  p_id bigint, p_title text, p_body text default '', p_duration_days int default 14
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '只有管理員可以編輯公告'; end if;
  update public.announcements set
    title = trim(coalesce(p_title,'')),
    body = left(trim(coalesce(p_body,'')),300),
    duration_days = greatest(1, least(365, coalesce(p_duration_days,14)))
  where id = p_id;
  if not found then raise exception '找不到這則公告'; end if;
end $$;

create or replace function public.admin_delete_announcement(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '只有管理員可以刪除公告'; end if;
  delete from public.announcements where id = p_id;
end $$;

grant execute on function public.admin_create_announcement(text, text, int) to authenticated;
grant execute on function public.admin_update_announcement(bigint, text, text, int) to authenticated;
grant execute on function public.admin_delete_announcement(bigint) to authenticated;
revoke execute on function public.admin_create_announcement(text, text, int) from public;
revoke execute on function public.admin_update_announcement(bigint, text, text, int) from public;
revoke execute on function public.admin_delete_announcement(bigint) from public;
