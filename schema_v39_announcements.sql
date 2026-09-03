-- =====================================================================
-- v39：管理員可以發公告到大家的通知鈴鐺
--   1) notifications 加 title 欄位（公告用來放標題；其他既有的通知種類
--      不用這欄，維持空字串，不影響原本的顯示邏輯）。
--   2) kind 的 check constraint 多開一種 'announcement'。
--   3) admin_broadcast_notification(p_title, p_body)：管理員專用，一次
--      幫「每一個有登入過、沒被封鎖的帳號」各插一筆通知。跟 notify_
--      wishlist_comment／admin_resolve_feedback 一樣的模式：一般使用者
--      對 notifications 沒有 insert 權限，只能靠這種 security definer
--      函式寫入，不怕有人自己塞假公告。回傳實際發送的人數，前端用來
--      顯示「已發送給 N 位使用者」。
-- 可重複執行。
-- =====================================================================

alter table public.notifications
  add column if not exists title text not null default '';

do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
    where rel.relname = 'notifications' and con.contype = 'c' and att.attname = 'kind'
  loop
    execute format('alter table public.notifications drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.notifications
  add constraint notifications_kind_check check (kind in ('wishlist_comment','feedback_reply','announcement'));

create or replace function public.admin_broadcast_notification(p_title text, p_body text default '')
returns int language plpgsql security definer set search_path = public as $$
declare
  v_title text := trim(coalesce(p_title, ''));
  v_body  text := left(trim(coalesce(p_body, '')), 300);
  v_count int;
begin
  if not public.is_admin() then
    raise exception '只有管理員可以發公告';
  end if;
  if v_title = '' then
    raise exception '公告標題不能空白';
  end if;

  insert into public.notifications (user_id, kind, title, body_preview, actor_name)
  select id, 'announcement', v_title, v_body, '管理員公告'
  from public.profiles
  where is_banned = false;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

grant execute on function public.admin_broadcast_notification(text, text) to authenticated;
revoke execute on function public.admin_broadcast_notification(text, text) from public;
