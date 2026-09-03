-- =====================================================================
-- v17：這一輪雜項修改的 SQL（會員種類加「其他」等）
-- 可重複執行。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 會員種類加「其他」，跟分類／來源類型看齊，都有一個保底選項。
-- ---------------------------------------------------------------------
alter table public.offers drop constraint if exists offers_membership_type_check;
alter table public.offers add constraint offers_membership_type_check
  check (membership_type in ('none','app','line','ocard','card','tier','brand','other'));

-- ---------------------------------------------------------------------
-- 2) 排行榜隱私重新設計：
--    - 新註冊的使用者預設「顯示暱稱」（原本預設關閉，現在改成預設開）。
--      只影響新註冊的人，既有使用者的設定值不會被這份 SQL 改動。
--    - show_on_leaderboard 的意義從「要不要上榜」改成「要不要顯示暱稱／頭像」：
--      每個人只要有成功回報就會上榜（金額本來就算），只是關掉這個選項的人
--      名字跟頭像會被換成「匿名使用者XXXX」，不會整個人從榜上消失。
-- ---------------------------------------------------------------------
alter table public.profiles alter column show_on_leaderboard set default true;

create or replace view public.leaderboard
with (security_invoker = true) as
select
  row_number() over (order by sum(r.saved_twd) desc nulls last) as rank,
  case when p.show_on_leaderboard then p.display_name
       else '匿名使用者' || substr(p.id::text, 1, 4) end as display_name,
  case when p.show_on_leaderboard then p.avatar_url else null end as avatar_url,
  coalesce(sum(r.saved_twd), 0)                as saved_total,
  count(*) filter (where r.result = 'success') as success_count,
  count(distinct r.offer_id)                   as brands_used,
  max(r.used_on)                               as last_used_on,
  coalesce(
    array_agg(distinct o.brand order by o.brand)
      filter (where r.result = 'success'),
    '{}'
  )                                             as brands
from public.usage_reports r
join public.profiles p on p.id = r.user_id
join public.offers   o on o.id = r.offer_id
where p.is_banned = false
  and r.used_on >= current_date - interval '365 days'
group by p.id, p.display_name, p.avatar_url, p.show_on_leaderboard
having coalesce(sum(r.saved_twd), 0) > 0
order by saved_total desc
limit 100;

grant select on public.leaderboard to anon, authenticated;

create or replace view public.leaderboard_monthly
with (security_invoker = true) as
select
  p.id                              as user_id,
  case when p.show_on_leaderboard then p.display_name
       else '匿名使用者' || substr(p.id::text, 1, 4) end as display_name,
  case when p.show_on_leaderboard then p.avatar_url else null end as avatar_url,
  to_char(r.used_on, 'YYYY-MM')     as ym,
  sum(coalesce(r.saved_twd, 0))::int as saved_total,
  count(*)::int                     as success_count,
  count(distinct o.brand)::int      as brands_used,
  array_agg(distinct o.brand)       as brands
from public.usage_reports r
join public.profiles p on p.id = r.user_id
join public.offers   o on o.id = r.offer_id
where r.result = 'success' and p.is_banned = false
group by p.id, p.display_name, p.avatar_url, p.show_on_leaderboard, to_char(r.used_on, 'YYYY-MM');

grant select on public.leaderboard_monthly to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) 刪除權限擴大：
--    - 投稿人自己除了「待審」也能刪掉「已退回」的投稿紀錄。
--    - 管理員在「已退回清單」可以直接永久刪除任何一筆退回的投稿／修改建議
--      （不是只能救回重審）。
-- ---------------------------------------------------------------------
drop policy if exists offers_delete_own on public.offers;
create policy offers_delete_own on public.offers
  for delete using (submitted_by = auth.uid() and status in ('pending','rejected'));

drop policy if exists offers_delete_admin on public.offers;
create policy offers_delete_admin on public.offers
  for delete using (public.is_admin());

drop policy if exists edits_delete_admin on public.offer_edits;
create policy edits_delete_admin on public.offer_edits
  for delete using (public.is_admin());

-- ---------------------------------------------------------------------
-- 4) 首頁公開顯示累計瀏覽次數／訪客數（原本只有管理員儀表板看得到）。
--    site_events 本身仍然只開放管理員直接查（見 schema_v14_misc.sql 的
--    events_admin 政策），這裡改成不用 security_invoker，讓 view 用建立者
--    權限跑聚合，caller 拿到的只有兩個數字，不會因此看到 site_events 的
--    原始列（session_id／user_id／meta 都不會外流）。
-- ---------------------------------------------------------------------
create or replace view public.site_stats
with (security_invoker = false) as
select
  (select count(*) from public.offers where status = 'approved')          as offer_count,
  (select count(*) from public.offers
     where status = 'approved' and free_tier = 'free_no_min')             as free_count,
  (select coalesce(sum(value_twd), 0) from public.offers
     where status = 'approved')                                          as total_value,
  (select count(*) from public.usage_reports)                            as report_count,
  (select coalesce(sum(saved_twd), 0) from public.usage_reports)         as saved_total,
  (select count(distinct user_id) from public.usage_reports)             as user_count,
  (select count(*) from public.site_events where event_type = 'pageview')                   as pageview_count,
  (select count(distinct nullif(session_id,'')) from public.site_events where event_type = 'pageview') as visitor_count;

grant select on public.site_stats to anon, authenticated;
