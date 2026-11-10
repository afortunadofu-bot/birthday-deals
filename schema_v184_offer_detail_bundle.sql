-- v184：優惠詳情一次拿齊（少打 Supabase，Log Ingestion）
--
-- 為什麼：2026-11-10 早上 Logs Explorer 一小時 2,968 個請求，其中**點開一筆優惠的詳情**
-- 就佔了大約 1,090 個（37%）——每點開一次要分開問 6 張表：
--   留言（comments）、使用回報（usage_reports）、修改歷史（offer_edit_history）、
--   暱稱（profiles_public）、回報的愛心（report_likes）、留言的愛心（comment_likes）
-- 每一個在瀏覽器還會先送一個 OPTIONS，等於點開一次 10～12 個請求。
-- 這支把它們打包成一個 RPC：點開一次變 2 個（POST＋OPTIONS）。
--
-- 權限：security invoker——用「呼叫的人自己」的身分去讀，每張表的 RLS 照樣生效，
-- 拿到的東西跟網站原本分開查一模一樣（沒登入的看不到被隱藏的留言…等等規則都不變），
-- 沒有多開任何權限。
--
-- 網站那邊：叫不到這支（還沒跑這個檔）就自動退回原本分開查，所以前端先上、SQL 後跑也不會壞。
-- 可重複執行。

create or replace function public.offer_detail_bundle(p_offer_id bigint)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_c     jsonb;
  v_r     jsonb;
  v_h     jsonb;
  v_names jsonb;
  v_rl    jsonb;
  v_cl    jsonb;
  v_my    int;
begin
  -- 跟網站原本的查詢同一個條件、同一個排序、同一個上限
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into v_c
    from (select id, body, created_at, is_hidden, user_id
            from comments
           where offer_id = p_offer_id
           order by created_at desc
           limit 50) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.used_on desc), '[]'::jsonb) into v_r
    from (select *
            from usage_reports
           where offer_id = p_offer_id
           order by used_on desc
           limit 30) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into v_h
    from (select changes, reason, actor_name, created_at
            from offer_edit_history
           where offer_id = p_offer_id
           order by created_at desc
           limit 10) x;

  -- 上面兩份出現過的人的暱稱（profiles_public 只公開暱稱／頭像）
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name)), '[]'::jsonb)
    into v_names
    from profiles_public p
   where p.id in (
     select (e->>'user_id')::uuid from jsonb_array_elements(v_c) e where e->>'user_id' is not null
     union
     select (e->>'user_id')::uuid from jsonb_array_elements(v_r) e where e->>'user_id' is not null);

  select coalesce(jsonb_agg(jsonb_build_object('report_id', l.report_id, 'user_id', l.user_id)), '[]'::jsonb)
    into v_rl
    from report_likes l
   where l.report_id in (select (e->>'id')::bigint from jsonb_array_elements(v_r) e);

  select coalesce(jsonb_agg(jsonb_build_object('comment_id', l.comment_id, 'user_id', l.user_id)), '[]'::jsonb)
    into v_cl
    from comment_likes l
   where l.comment_id in (select (e->>'id')::bigint from jsonb_array_elements(v_c) e);

  -- 自己給過幾顆星（沒登入就沒有）
  if auth.uid() is not null then
    select score into v_my from offer_ratings where offer_id = p_offer_id and user_id = auth.uid();
  end if;

  return jsonb_build_object(
    'comments', v_c, 'reports', v_r, 'history', v_h, 'names', v_names,
    'report_likes', v_rl, 'comment_likes', v_cl, 'my_score', v_my);
end $$;

comment on function public.offer_detail_bundle(bigint) is
  'v184：優惠詳情要的留言、使用回報、修改歷史、暱稱、愛心一次拿齊（security invoker，RLS 照常）。';

revoke execute on function public.offer_detail_bundle(bigint) from public;
grant execute on function public.offer_detail_bundle(bigint) to anon, authenticated;

-- 檢查：隨便挑一筆有留言的優惠，看拿回來的東西齊不齊
-- select jsonb_array_length(b->'comments') as 留言, jsonb_array_length(b->'reports') as 回報,
--        jsonb_array_length(b->'history') as 修改歷史, jsonb_array_length(b->'names') as 暱稱
--   from (select public.offer_detail_bundle((select offer_id from public.comments limit 1)) as b) t;
