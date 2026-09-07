-- v53：省錢排行榜／貢獻度排行榜「全部時間」分頁也要有名次升降箭頭
-- ---------------------------------------------------------------------
-- 嵐的回饋：省錢跟貢獻度排行榜也要有上下移動的符號。
--
-- 查現況發現：這兩張榜其實「本月」「本週」分頁早就有名次升降箭頭了
-- （schema_v45/v46, template.html 的 rankDeltaHtml），問題是兩張榜預設
-- 一打開都是「全部時間」分頁，而「全部時間」完全沒有升降箭頭——因為
-- leaderboard／contribution_leaderboard 這兩張 view 本身就是「全部時間
-- 累計」，沒有「上個全部時間」這種東西可以比，跟 v49 的
-- popular_offers/most_wished 當初遇到的問題一模一樣。
--
-- 沿用 v49 的解法：改跟「7 天前」比——算出「如果只算 7 天前以前的資料，
-- 名次會是多少」，再跟現在的名次一比，就能看出最近這 7 天有沒有竄升或
-- 下滑。leaderboard_prev 用 usage_reports.created_at 當切點（回報建立
-- 時間），contribution_leaderboard_prev 用 offers/offer_edits 的
-- reviewed_at 當切點（管理員核可時間，跟 contribution_leaderboard 本身
-- 抓資料用的時間欄位一致）。
--
-- 全部時間榜（leaderboard／contribution_leaderboard）本身刻意不回傳
-- user_id（schema_v44 的隱私設計，只有本月/本週版本才回傳），這兩張
-- _prev view 比照辦理，改回傳 display_name（含匿名使用者的
-- '匿名使用者'||substr(id,1,4) 那組尾碼名稱）當比對鍵——這串名稱本身
-- 已經是畫面上看得到的東西，且是 template.html 原本用來在全部時間榜
-- 找「哪一列是我」的同一套近似比對法（見 renderLbBody() 註解），不算
-- 多洩漏什麼。
--
-- 可重複執行。
-- ---------------------------------------------------------------------

create or replace view public.leaderboard_prev
with (security_invoker = true) as
select
  case when p.show_on_leaderboard then p.display_name
       else '匿名使用者' || substr(p.id::text, 1, 4) end as display_name,
  coalesce(sum(r.saved_twd), 0) as saved_total
from public.usage_reports r
join public.profiles_public p on p.id = r.user_id
join public.offers   o on o.id = r.offer_id
where p.is_banned = false
  and r.used_on >= current_date - interval '365 days'
  and r.created_at <= now() - interval '7 days'
group by p.id, p.display_name, p.show_on_leaderboard
having coalesce(sum(r.saved_twd), 0) > 0
order by saved_total desc
limit 100;

grant select on public.leaderboard_prev to anon, authenticated;

create or replace view public.contribution_leaderboard_prev
with (security_invoker = true) as
with sub as (
  select submitted_by as user_id, count(*)::int as submitted_count
  from public.offers
  where status = 'approved' and submitted_by is not null
    and reviewed_at >= current_date - interval '365 days'
    and reviewed_at <= now() - interval '7 days'
  group by submitted_by
), edt as (
  select proposed_by as user_id, count(*)::int as edit_count
  from public.offer_edits
  where status = 'approved' and proposed_by is not null
    and reviewed_at >= current_date - interval '365 days'
    and reviewed_at <= now() - interval '7 days'
  group by proposed_by
), uids as (
  select user_id from sub
  union
  select user_id from edt
)
select
  case when p.show_on_leaderboard then p.display_name
       else '匿名使用者' || substr(p.id::text, 1, 4) end as display_name,
  coalesce(sub.submitted_count,0) + coalesce(edt.edit_count,0) as total_count
from uids
join public.profiles_public p on p.id = uids.user_id
left join sub on sub.user_id = uids.user_id
left join edt on edt.user_id = uids.user_id
where p.is_banned = false
order by total_count desc
limit 100;

grant select on public.contribution_leaderboard_prev to anon, authenticated;
