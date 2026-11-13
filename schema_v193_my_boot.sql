-- =====================================================================
-- v193：登入後一次問完自己的四樣東西（原本四支查詢）
--
-- celine（11/13）：「你先繼續砍」。Supabase 11/2 寬限期結束，超過額度專案可能被
-- 限制（請求回 402）。Logs Explorer 11/12～13 的 24 小時：
--
--   wishlist        1,201   收藏（卡片上的書籤）
--   usage_reports     589   用過了（卡片上的「已用」）
--   offer_ratings     287   我的評分（排行榜的「還沒評分」、詳情頁的星等）
--   notifications     273   鈴鐺的未讀數字
--
-- 這四支是每個登入的人每次打開網站都會打的。併成一支，回一包 jsonb。
-- 沒有新的資料表、沒有新的權限面：每一塊都只回「呼叫者自己的」，
-- 不接受任何 user_id 參數。
--
-- 前端沒跑這一支也不會壞：呼叫失敗就退回原本那四支（見 loadMyBoot()）。
-- 可重複執行。
-- =====================================================================

create or replace function public.my_boot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception '要先登入才看得到自己的資料';
  end if;

  return jsonb_build_object(
    'wish', coalesce((
      select jsonb_agg(w.offer_id) from public.wishlist w where w.user_id = uid), '[]'::jsonb),

    'used', coalesce((
      select jsonb_agg(distinct r.offer_id) from public.usage_reports r where r.user_id = uid), '[]'::jsonb),

    'ratings', coalesce((
      select jsonb_agg(jsonb_build_object('offer_id', x.offer_id, 'score', x.score))
        from public.offer_ratings x where x.user_id = uid), '[]'::jsonb),

    -- 前端原本是拉最近 200 筆的 read_at 自己數，這裡直接數好
    'unread', (select count(*) from (
        select n.read_at from public.notifications n
         where n.user_id = uid order by n.created_at desc limit 200) t
       where t.read_at is null)
  );
end $$;

comment on function public.my_boot() is
  '登入後開場要的四樣（收藏、用過的、我的評分、未讀通知數）一次回傳。只回呼叫者自己的資料。';

grant execute on function public.my_boot() to authenticated;
revoke execute on function public.my_boot() from public, anon;

notify pgrst, 'reload schema';
