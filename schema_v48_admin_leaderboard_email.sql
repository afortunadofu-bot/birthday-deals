-- v48：管理員可以看到排行榜上榜人的電子信箱
-- ---------------------------------------------------------------------
-- 嵐的回饋：管理員要能看到排行榜（省錢排行榜／貢獻度排行榜）上榜使用者的
-- email，方便聯絡/查證。
--
-- 背景：v44 把排行榜相關的 view 全部改成 join profiles_public（只有
-- id/display_name/avatar_url/is_banned/show_on_leaderboard 這幾欄），
-- 而且 email 這欄本來就不在 public.profiles 這張表——Supabase 是把
-- email 放在 auth.users（受保護的 schema，PostgREST 不能直接查），
-- 所以要看 email 一定要透過 SECURITY DEFINER 函式，跟 admin_list_feedback／
-- admin_set_admin 這幾支既有的管理員 RPC 是同一套做法。
--
-- 「本月／本週」榜的 view（leaderboard_monthly / leaderboard_weekly /
-- contribution_leaderboard_monthly / contribution_leaderboard_weekly）
-- 本來就有回傳 user_id（前端要拿來比對「哪一列是我」），可以直接查
-- admin_user_emails() 就好。
--
-- 「全部時間」榜的 view（leaderboard / contribution_leaderboard）當初
-- 刻意不回傳 user_id（見 v46 註解「隱私考量」），這裡不去動那兩張公開
-- view（維持一般使用者看不到任何 user_id 的原本設計），另外寫兩支管理員
-- 專用 RPC，用一模一樣的排序/篩選邏輯算出「第幾名對應哪個 user_id」，
-- 前端再拿排名去對應，兩張表都只有管理員能執行。
-- 可重複執行。
-- ---------------------------------------------------------------------

-- 1) 通用：管理員用一批 user_id 換一批 email。
create or replace function public.admin_user_emails(p_ids uuid[])
returns table(id uuid, email text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception '只有管理員能看使用者信箱';
  end if;
  return query
    select u.id, u.email::text
    from auth.users u
    where u.id = any(p_ids);
end $$;

grant execute on function public.admin_user_emails(uuid[]) to authenticated;
revoke execute on function public.admin_user_emails(uuid[]) from public;

-- 2) 省錢排行榜「全部時間」：rank -> user_id（邏輯跟 public.leaderboard 一致）
create or replace function public.admin_leaderboard_all_ids()
returns table(rnk bigint, user_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception '只有管理員能看排行榜使用者信箱';
  end if;
  return query
    select row_number() over (order by sum(r.saved_twd) desc nulls last) as rnk,
           p.id as user_id
    from public.usage_reports r
    join public.profiles_public p on p.id = r.user_id
    join public.offers o on o.id = r.offer_id
    where p.is_banned = false
      and r.used_on >= current_date - interval '365 days'
    group by p.id
    having coalesce(sum(r.saved_twd), 0) > 0
    order by rnk
    limit 100;
end $$;

grant execute on function public.admin_leaderboard_all_ids() to authenticated;
revoke execute on function public.admin_leaderboard_all_ids() from public;

-- 3) 貢獻度排行榜「全部時間」：rank -> user_id（邏輯跟
--    public.contribution_leaderboard 一致）
create or replace function public.admin_contrib_leaderboard_all_ids()
returns table(rnk bigint, user_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception '只有管理員能看貢獻度排行榜使用者信箱';
  end if;
  return query
    with sub as (
      select submitted_by as user_id, count(*)::int as submitted_count
      from public.offers
      where status = 'approved' and submitted_by is not null
        and reviewed_at >= current_date - interval '365 days'
      group by submitted_by
    ), edt as (
      select proposed_by as user_id, count(*)::int as edit_count
      from public.offer_edits
      where status = 'approved' and proposed_by is not null
        and reviewed_at >= current_date - interval '365 days'
      group by proposed_by
    ), uids as (
      select user_id from sub
      union
      select user_id from edt
    )
    select
      row_number() over (
        order by (coalesce(sub.submitted_count,0) + coalesce(edt.edit_count,0)) desc
      ) as rnk,
      uids.user_id
    from uids
    join public.profiles_public p on p.id = uids.user_id
    left join sub on sub.user_id = uids.user_id
    left join edt on edt.user_id = uids.user_id
    where p.is_banned = false
    order by rnk
    limit 100;
end $$;

grant execute on function public.admin_contrib_leaderboard_all_ids() to authenticated;
revoke execute on function public.admin_contrib_leaderboard_all_ids() from public;
