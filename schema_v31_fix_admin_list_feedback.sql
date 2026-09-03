-- =====================================================================
-- v31：修 admin_list_feedback() 讀取失敗
-- 錯誤：structure of query does not match function result type
-- 原因：auth.users.email 實際型別是 character varying(255)，不是 text；
--       RETURN QUERY 對型別比對比一般 SELECT 嚴格，沒有自動轉型就會炸掉。
--       這裡把每個欄位都明確轉型，避免再有類似的隱性型別落差。
-- 可重複執行。
-- =====================================================================
create or replace function public.admin_list_feedback()
returns table(
  id bigint, type text, message text, page text, status text, created_at timestamptz,
  email text, account_email text, display_name text
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception '只有管理員能看問題回報清單';
  end if;

  return query
    select f.id::bigint, f.type::text, f.message::text, f.page::text, f.status::text,
           f.created_at::timestamptz, f.email::text, u.email::text as account_email,
           p.display_name::text
    from public.site_feedback f
    left join auth.users u on u.id = f.user_id
    left join public.profiles p on p.id = f.user_id
    order by f.created_at desc
    limit 200;
end $$;

grant execute on function public.admin_list_feedback() to authenticated;
