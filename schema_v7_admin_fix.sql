-- =====================================================================
-- v7：修管理員權限沒生效的問題（可重複執行）
-- =====================================================================
-- RLS 規則本身沒有錯。最常見的原因是：你曾經在執行 schema.sql（也就是
-- 自動建立 profile 的 trigger 安裝）之前就登入過一次，那次登入不會建立
-- profiles 資料列。之後執行「update profiles set is_admin=true where...」
-- 其實影響了 0 列——但 Supabase SQL Editor 對「影響 0 列」一樣顯示
-- Success，看起來像成功了，其實什麼都沒改到。
--
-- 用法：整份貼到 SQL Editor 執行，照著結果做：
--   第 3 步如果回傳 0 列 → email 打錯，或這個帳號根本沒登入過網站，
--                          先用該帳號登入一次網站再重跑這份 SQL。
--   第 3 步如果回傳 1 列且 is_admin = true → 成功了，回網站登出重新登入。
-- =====================================================================

-- 1) 補建所有缺漏的 profile
insert into public.profiles (id, display_name, avatar_url)
select u.id,
       coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '壽星'),
       u.raw_user_meta_data->>'avatar_url'
from auth.users u
on conflict (id) do nothing;

-- 2) 先看清楚目前有哪些帳號、誰是管理員（確認你要設的 email 有沒有出現在這裡）
select u.email, p.id, p.display_name, p.is_admin, p.is_banned
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at;

-- 3) 設管理員——把下面這行的 email 換成你自己的 Gmail，然後執行。
--    用 returning 讓你直接看到「有沒有真的改到」。
update public.profiles set is_admin = true
 where id = (select id from auth.users where lower(email) = lower('afortunado.fu@gmail.com'))
returning id, display_name, is_admin;
