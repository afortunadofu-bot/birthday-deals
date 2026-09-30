-- =====================================================================
-- v74：資安體檢後的兩處補強
--
--   celine 看到 Threads 上在講「vibe coding 的 app 反編譯之後，Supabase 權限
--   沒設好、資料隨便撈」，要我檢查壽星日。體檢結果寫在 CHANGELOG，結論是
--   權限本身沒有漏洞：
--     - 16 張表全部開了 RLS
--     - 所有會改資料的 security definer 函式都有檢查權限
--       （admin_* 一律 is_admin()，mark_notifications_read 只動 auth.uid() 自己的）
--     - profiles 讀取只剩自己跟管理員；公開的 profiles_public 只有暱稱／頭像
--     - 前端只放 anon key（role=anon），沒有 service_role
--     - avatars 儲存桶只能寫自己的資料夾
--
--   但有兩個地方「不是漏洞、是會被鬧」的缺口，這一版補起來：
--
--   1. site_events 任何人都能新增（匿名造訪統計就是靠它），而且 meta 是沒有
--      大小上限的 jsonb、event_type 也沒有限制。有人寫個迴圈灌幾 MB 的 meta，
--      資料庫容量跟免費額度很快就被吃掉。
--      → event_type 限縮成已知的幾種，meta 限制大小與深度。
--
--   2. site_feedback 任何人都能新增，而且完全沒有頻率限制，一個迴圈就能
--      灌爆後台的「問題回報／建議」。
--      → 加一個 session_id 欄位（跟問卷同一套做法），限制「同一台裝置／同一個
--        帳號一小時最多 5 筆」。前端送出時會一起帶上 session_id。
--
--   3. survey_can_submit(p_session, p_user) 開放給 anon 執行，而且可以帶任何人的
--      user id 進去問「這個人最近填過問卷嗎」。雖然只能問出是非，還是收掉：
--      只能問自己（或不帶 user id 的訪客情境）。
--
--   順便補一個嵐要的東西：
--
--   4. site_wish_conversion()：收藏之後真的去用的比例。
--      wishlist 的 RLS 是「只看得到自己的」，前端沒辦法把「誰收藏了什麼」跟
--      「誰回報用了什麼」配起來，所以在資料庫算完只回三個彙總數字。
--
--   可重複執行。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. site_events：限制事件種類與 meta 大小
-- ---------------------------------------------------------------------
-- 一開始寫成「白名單」，但實際比對前端送出的名稱時發現會擋掉 survey_open、
-- survey_submit、suggest_edit、edit_offer——而且 logEvent() 的錯誤是吞掉不顯示的，
-- 以後任何一個新事件名稱都會變成「靜靜地寫不進去」，很難發現。
-- 改成限制「形狀」而不是列舉名稱：小寫英數字加底線、最長 40 個字。
-- 擋掉灌垃圾字串的效果一樣，但不會因為新增一個事件名稱就壞掉。
alter table public.site_events drop constraint if exists site_events_type_known;
alter table public.site_events drop constraint if exists site_events_type_shape;
alter table public.site_events add constraint site_events_type_shape
  check (event_type ~ '^[a-z][a-z0-9_]{0,39}$') not valid;

-- CHECK 條件裡不能寫子查詢（Postgres 會回 0A000: cannot use subquery in check
-- constraint），所以不用 count(jsonb_object_keys(...)) 去數有幾個鍵。
-- 只限制「必須是物件」＋「整包序列化後不超過 1000 字元」就夠擋灌爆了：
-- 鍵再多也塞不進 1000 字元，正常的 meta 都在 100 字元以內。
alter table public.site_events drop constraint if exists site_events_meta_small;
alter table public.site_events add constraint site_events_meta_small
  check (
    jsonb_typeof(meta) = 'object'
    and length(meta::text) <= 1000
  ) not valid;

-- ---------------------------------------------------------------------
-- 2. site_feedback：加裝置代號 ＋ 一小時最多 5 筆
-- ---------------------------------------------------------------------
alter table public.site_feedback
  add column if not exists session_id text not null default '';

alter table public.site_feedback drop constraint if exists site_feedback_session_len;
alter table public.site_feedback add constraint site_feedback_session_len
  check (char_length(session_id) <= 80) not valid;

create index if not exists site_feedback_session_idx
  on public.site_feedback(session_id, created_at desc);

-- security definer：RLS 政策裡要查同一張表，但送出的人（訪客或一般會員）
-- 沒有 select 權限，直接寫子查詢永遠查不到東西，限制就形同虛設。
create or replace function public.feedback_can_submit(p_session text, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (
    select count(*) from public.site_feedback f
     where f.created_at > now() - interval '1 hour'
       and (
         (p_user is not null and f.user_id = p_user)
         or (p_user is null and p_session <> '' and f.session_id = p_session)
       )
  ) < 5;
$$;
grant execute on function public.feedback_can_submit(text, uuid) to anon, authenticated;

drop policy if exists feedback_insert on public.site_feedback;
create policy feedback_insert on public.site_feedback
  for insert
  with check (
    (user_id is null or user_id = auth.uid())
    and (auth.uid() is null or not public.is_banned())
    and public.feedback_can_submit(session_id, auth.uid())
  );

-- ---------------------------------------------------------------------
-- 3. survey_can_submit：只能問自己
-- ---------------------------------------------------------------------
create or replace function public.survey_can_submit(p_session text, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    -- 帶了別人的 user id 進來就直接當作「不能填」，不回答任何實情
    when p_user is not null and p_user is distinct from auth.uid() then false
    -- 其餘維持 v62 原本的判斷（同一台裝置或同一個帳號 24 小時內填過就不能再填）
    else not exists (
      select 1 from public.survey_responses s
       where s.created_at > now() - interval '24 hours'
         and ((coalesce(p_session,'') <> '' and s.session_id = p_session)
              or (p_user is not null and s.user_id = p_user))
    )
  end;
$$;
grant execute on function public.survey_can_submit(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. 收藏 → 真的去用的轉換率（嵐：「能顯示收藏到使用的轉換率嗎」）
-- ---------------------------------------------------------------------
-- 前端算不出來：wishlist 的 RLS 是「只看得到自己的」，所以沒辦法在瀏覽器裡
-- 把「誰收藏了什麼」跟「誰回報用了什麼」對起來。這支 security definer 函式
-- 在資料庫裡配對完，只回傳三個彙總數字，不吐任何個人資料。
--   wished  收藏過的組合數（同一個人＋同一筆優惠算一組）
--   used    其中後來真的有成功回報使用的組合數
--   rate    百分比（沒有收藏時回 null）
create or replace function public.site_wish_conversion()
returns jsonb language sql stable security definer set search_path = public as $$
  with w as (
    select distinct user_id, offer_id from public.wishlist
  ),
  u as (
    select distinct r.user_id, r.offer_id
    from public.usage_reports r
    join w on w.user_id = r.user_id and w.offer_id = r.offer_id
    where r.result = 'success'
  )
  select jsonb_build_object(
    'wished', (select count(*) from w),
    'used',   (select count(*) from u),
    'rate',   case when (select count(*) from w) > 0
                then round(100.0 * (select count(*) from u) / (select count(*) from w))
              end);
$$;
grant execute on function public.site_wish_conversion() to anon, authenticated;
revoke execute on function public.site_wish_conversion() from public;
