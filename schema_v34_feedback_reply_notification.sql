-- =====================================================================
-- v34：問題回報改成用「站內通知」回覆，不用再留信箱
--   1) site_feedback 加 admin_reply（管理員標記已處理時可以順便留一句回覆）
--   2) notifications 的 kind 多開一種 'feedback_reply'
--   3) admin_resolve_feedback()：管理員標記已處理＋（可選）寫回覆時一次做完，
--      如果送出的人有登入（user_id 不是 null），自動幫他插一筆通知。
--      訪客送出的（user_id 是 null）沒有帳號可以通知，就只更新狀態。
-- 可重複執行。
-- =====================================================================

alter table public.site_feedback
  add column if not exists admin_reply text not null default '';

-- 用 DO block 動態找出 kind 欄位現有的 check constraint 名稱再刪，
-- 不猜死名字（Postgres 自動命名不一定剛好是 notifications_kind_check）。
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
  add constraint notifications_kind_check check (kind in ('wishlist_comment','feedback_reply'));

create or replace function public.admin_resolve_feedback(p_id bigint, p_reply text default '')
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_reply text;
begin
  if not public.is_admin() then
    raise exception '只有管理員可以處理問題回報';
  end if;

  v_reply := coalesce(nullif(trim(p_reply), ''), '你回報的內容我們已經處理完成，謝謝提供！');

  update public.site_feedback
     set status = 'resolved', admin_reply = v_reply
   where id = p_id
   returning user_id into v_user;

  if v_user is not null then
    insert into public.notifications (user_id, kind, brand, body_preview, actor_name)
    values (v_user, 'feedback_reply', '', left(v_reply, 160), '管理員');
  end if;
end $$;

grant execute on function public.admin_resolve_feedback(bigint, text) to authenticated;
revoke execute on function public.admin_resolve_feedback(bigint, text) from public;

-- admin_list_feedback() 也要跟著補上 admin_reply 欄位，不然管理員清單看不到
-- 已經回覆過的內容（沿用 v31 的明確轉型寫法，避免又踩到型別對不上的雷）。
-- 回傳欄位有變動（多一欄），create or replace 不允許改動 return type，
-- 要先 drop 掉舊的再建新的。
drop function if exists public.admin_list_feedback();
create function public.admin_list_feedback()
returns table(
  id bigint, type text, message text, page text, status text, created_at timestamptz,
  email text, account_email text, display_name text, admin_reply text
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception '只有管理員能看問題回報清單';
  end if;

  return query
    select f.id::bigint, f.type::text, f.message::text, f.page::text, f.status::text,
           f.created_at::timestamptz, f.email::text, u.email::text as account_email,
           p.display_name::text, f.admin_reply::text
    from public.site_feedback f
    left join auth.users u on u.id = f.user_id
    left join public.profiles p on p.id = f.user_id
    order by f.created_at desc
    limit 200;
end $$;

grant execute on function public.admin_list_feedback() to authenticated;
revoke execute on function public.admin_list_feedback() from public;
