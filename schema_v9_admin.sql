-- =====================================================================
-- v9：修「管理員設定不生效」的真正原因 ＋ 網站內直接新增／移除管理員
-- =====================================================================
-- 真正原因（跟 v7 猜的不一樣，這次是確認過的）：
--   public.profiles 上有一個 profiles_guard 觸發器，邏輯是「如果現在執行
--   這次更新的人自己不是管理員，就把 is_admin / is_banned 都還原成舊值」，
--   目的是防止一般人自己把自己設成管理員。
--
--   問題出在：在 Supabase SQL Editor 執行 update 時是沒有登入身分的
--   （auth.uid() 是 NULL），一樣會被這個觸發器判定成「不是管理員」，
--   所以你會看到 update 說「改了 1 列」、returning 也真的跑出結果，
--   但 is_admin 欄位卻還是 false——不是沒改到，是改了之後又被觸發器
--   立刻還原掉。v7 那份 SQL 沒考慮到這點，所以才會一直「還是沒成功」。
--
-- 用法：
--   1. 整份貼到 SQL Editor 執行一次（第 3 步會暫時關掉觸發器、設完再打開，
--      這次 returning 出來的 is_admin 會真的是 true）。
--   2. 執行完回網站登出、重新登入一次，讓網站重讀你的權限。
--   3. 之後要再加其他管理員，不用再回來跑 SQL——登入後到「審核」分頁，
--      最下面「管理員設定」貼對方的 email 按「設為管理員」就好
--      （對方要先自己登入過網站一次，這樣系統才查得到帳號）。
-- =====================================================================

-- 1) 補建所有缺漏的 profile
insert into public.profiles (id, display_name, avatar_url)
select u.id,
       coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '壽星'),
       u.raw_user_meta_data->>'avatar_url'
from auth.users u
on conflict (id) do nothing;

-- 2) 先看清楚目前有哪些帳號、誰是管理員
select u.email, p.id, p.display_name, p.is_admin, p.is_banned
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at;

-- 3) 設第一個管理員——把下面這行 email 換成你自己的 Gmail 再執行。
--    先關掉防提權觸發器、改完馬上打開，這次才不會被自動還原。
alter table public.profiles disable trigger profiles_guard;

update public.profiles set is_admin = true
 where id = (select id from auth.users where lower(email) = lower('afortunado.fu@gmail.com'))
returning id, display_name, is_admin;

alter table public.profiles enable trigger profiles_guard;

-- =====================================================================
-- 4) 讓「已經是管理員的人」可以直接在網站上用 email 新增／移除其他管理員，
--    不用再回來跑 SQL。security definer 讓這個函式可以查 auth.users 找帳號，
--    但一進來就先檢查呼叫的人是不是管理員，不是的話直接擋掉、什麼都不會改。
--    因為呼叫者本人已經是管理員，走到 profiles_guard 觸發器時也會通過，
--    不會被還原，所以不用再手動關觸發器。
-- =====================================================================
create or replace function public.admin_set_admin(
  p_email      text default null,
  p_target_id  uuid default null,
  p_make_admin boolean default true
)
returns table(id uuid, display_name text, is_admin boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception '只有管理員能新增／移除管理員';
  end if;

  v_id := p_target_id;
  if v_id is null then
    if p_email is null or btrim(p_email) = '' then
      raise exception '請填 email';
    end if;
    select u.id into v_id from auth.users u where lower(u.email) = lower(btrim(p_email));
    if v_id is null then
      raise exception '找不到這個 email 的帳號——對方要先用這個 email 登入過網站一次';
    end if;
  end if;

  update public.profiles p set is_admin = p_make_admin where p.id = v_id;
  if not found then
    raise exception '這個帳號還沒有個人檔案，請對方先登入網站一次';
  end if;

  return query select p.id, p.display_name, p.is_admin from public.profiles p where p.id = v_id;
end $$;

grant execute on function public.admin_set_admin(text, uuid, boolean) to authenticated;
