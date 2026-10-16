-- =====================================================================
-- v124：「我的」那一頁一次問完（原本四支查詢）
--
-- celine：「繼續砍 完整規劃繼續省流量」（見 SUPABASE-流量.md 第 2 項）
--
-- Supabase 免費方案的 Log Ingestion 是按「請求數」算的，2026-10-16 超額
-- （1.235/1 GB）。切到「我的」分頁本來會打四支：
--
--   my_savings                    我省下多少、幾次、幾個品牌（徽章也靠它）
--   usage_reports + offers        我的回報清單
--   offers_pending_preview        審核中的投稿（投稿表單的重複比對也用這份）
--   offer_edits_pending_preview   審核中的修改建議
--
-- 四支併成一支，回一包 jsonb。沒有新的資料表、沒有新的權限面：每一塊都還是
-- 「原本那個使用者本來就讀得到的東西」，只是在資料庫這邊組好再一起回去。
--
-- security definer + 自己比對 auth.uid()：回報跟省下金額只回「呼叫者自己的」，
-- 不接受傳入任何 user_id 參數——沒有參數就沒有「改一個 id 去看別人的」這種事。
--
-- 前端沒跑這一支也不會壞：呼叫失敗就退回原本那四支（見 loadMyTab()）。
-- 可重複執行。
-- =====================================================================

create or replace function public.my_dashboard()
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
    -- 累積省下／今年省下／成功次數／用過幾個品牌（my_savings 是每人一列的 view）
    'savings', (select to_jsonb(s) from public.my_savings s where s.user_id = uid),

    -- 我的回報，照使用日期由新到舊。欄位跟前端原本那一支 select 一字不差，
    -- 包含 v109 補上的 spent_twd（漏掉的話編輯回報時金額會被清掉）。
    'reports', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.used_on desc, x.created_at desc)
        from (
          select r.id, r.used_on, r.result, r.saved_twd, r.spent_twd, r.store, r.note,
                 r.created_at, r.offer_id,
                 jsonb_build_object(
                   'id', o.id, 'brand', o.brand, 'offer', o.offer,
                   'timing', o.timing, 'value_twd', o.value_twd) as offers
            from public.usage_reports r
            left join public.offers o on o.id = r.offer_id
           where r.user_id = uid
        ) x), '[]'::jsonb),

    -- 審核中的投稿／修改建議。這兩個 view 本來就是給所有登入者看的
    -- （投稿前先比對有沒有人投過同一家），所以不依使用者篩。
    'pending', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at desc)
        from (select * from public.offers_pending_preview
               order by created_at desc limit 30) p), '[]'::jsonb),

    'pending_edits', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at desc)
        from (select * from public.offer_edits_pending_preview
               order by created_at desc limit 30) e), '[]'::jsonb)
  );
end $$;

comment on function public.my_dashboard() is
  '「我的」那一頁要的四塊（省下多少、我的回報、審核中的投稿與修改建議）一次回傳。只回呼叫者自己的資料。';

grant execute on function public.my_dashboard() to authenticated;
revoke execute on function public.my_dashboard() from public, anon;
