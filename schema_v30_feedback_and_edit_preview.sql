-- =====================================================================
-- v30：問題回報分「問題／建議」＋登入者不用另填信箱、管理員看得到帳號信箱
--       ＋修改建議也開放公開預覽（跟投稿新優惠的預覽同一個精神）
-- 可重複執行。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) site_feedback 加一個 type 欄位，分「問題回報」跟「建議」兩種。
-- ---------------------------------------------------------------------
alter table public.site_feedback
  add column if not exists type text not null default 'bug'
  check (type in ('bug','suggestion'));

-- ---------------------------------------------------------------------
-- 2) 管理員看問題回報清單，改用這個 RPC——security definer 可以連
--    auth.users 一起查，把已登入使用者「綁定的帳號信箱」也秀出來，
--    不用再靠他自己填的那個（選填的）聯絡方式欄位。一進來就先檢查
--    呼叫的人是不是管理員，不是的話直接擋掉。
-- ---------------------------------------------------------------------
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
    select f.id, f.type, f.message, f.page, f.status, f.created_at,
           f.email, u.email as account_email, p.display_name
    from public.site_feedback f
    left join auth.users u on u.id = f.user_id
    left join public.profiles p on p.id = f.user_id
    order by f.created_at desc
    limit 200;
end $$;

grant execute on function public.admin_list_feedback() to authenticated;

-- ---------------------------------------------------------------------
-- 3) 修改建議公開預覽：跟「待審投稿公開預覽」（offers_pending_preview）
--    同一套做法——先開一條 RLS policy 讓「登入的人都能看待審中的修改建議」
--    （原本只有提議者本人跟管理員看得到），再包一個 view 只挑安全欄位出來，
--    管理員審核／套用還是走原本的 review_offer_edit RPC，這裡純粹只是多開
--    一個「看」的窗口，不影響審核權限。
-- ---------------------------------------------------------------------
drop policy if exists edits_read_pending_all on public.offer_edits;
create policy edits_read_pending_all on public.offer_edits
  for select using (status = 'pending' and auth.uid() is not null);

create or replace view public.offer_edits_pending_preview
with (security_invoker = true) as
select e.id, e.offer_id, e.patch, e.reason, e.source_url, e.created_at,
       o.brand,
       o.offer        as current_offer,
       o.conditions   as current_conditions,
       o.membership   as current_membership,
       o.timing       as current_timing,
       o.advance_days as current_advance_days,
       o.value_twd    as current_value_twd,
       o.valid_until  as current_valid_until,
       p.display_name as proposed_by_name
from public.offer_edits e
join public.offers o on o.id = e.offer_id
left join public.profiles p on p.id = e.proposed_by
where e.status = 'pending';

grant select on public.offer_edits_pending_preview to authenticated;
