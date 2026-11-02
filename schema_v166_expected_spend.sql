-- v166：投稿多一格「預計會花多少」；修改建議的低消終於套用得上
-- ---------------------------------------------------------------------
-- celine：「投稿的必填選項變多，補充欄位一般人好像都看不到，需要幾天註冊那個都先必填，
-- 然後都要寫預計這家需要花多少錢跟低消多少錢等，使用條件也要必填」
--
-- 必填是前端的事（只擋新投稿，不擋修改建議——改一個錯字不該被逼著補四格）。
-- 這一支只做資料庫要的：
--   1. offers 多一欄 expected_spend（預計會花多少，投稿的人估的）
--   2. offers_public 重建，才讀得到新欄位（view 的 o.* 是建立當下展開的）
--   3. 修改建議的「改前」預覽認得低消、預計花費
--   4. 修改建議核可時套用低消、預計花費
--      ——**低消從 v81 開始就沒被套用過**：v81 加了 min_spend，但核可修改建議的那一支
--        （v52，v162 拆成 apply_offer_edit_patch）欄位清單沒跟著加。有人建議改低消、
--        管理員按核可，畫面說通過了，資料其實沒動。
--
-- 不需要先跑別支（v162 跑過的話第 4 段會蓋掉它的 apply_offer_edit_patch，行為只多兩欄）。
-- 可重複執行。
--
-- ⚠️ 跑完這支之後，再去 Cloudflare 更新 birthdaydeals-api 那支 Worker（worker/offers-cache.js），
--    卡片上才看得到「預計花」。順序反過來的話 Worker 會自己退回不帶新欄位的查詢，不會壞。
-- ---------------------------------------------------------------------


-- 1. 新欄位 ------------------------------------------------------------
alter table public.offers add column if not exists expected_spend integer;
alter table public.offers drop constraint if exists offers_expected_spend_range;
alter table public.offers
  add constraint offers_expected_spend_range
  check (expected_spend is null or (expected_spend >= 0 and expected_spend <= 100000)) not valid;

comment on column public.offers.expected_spend is
  '投稿的人估的「去用這個優惠大概會花多少」（元）。實際花費看 usage_reports.spent_twd（v164 offer_spend_summary）。';


-- 2. offers_public 重建（定義跟 v81 一字不差，只是重新展開 o.*）------------------
-- 有別的 view 依賴它的話 drop 會失敗、整支停下來——那是對的，不要加 cascade。
drop view if exists public.offers_public;
create view public.offers_public
with (security_invoker = true) as
select o.*, s.report_count, s.last_used_on, s.success_rate, s.comment_count,
       s.rating_avg, s.rating_count, s.wish_count
from public.offers o
left join public.offer_stats s on s.offer_id = o.id
where o.status = 'approved';

grant select on public.offers_public to anon, authenticated;
-- v131 的邊緣快取角色：drop 掉的 view 權限會跟著不見，要補回來（沒跑過 v131 就跳過）
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'edge_reader') then
    execute 'grant select on public.offers_public to edge_reader';
  end if;
end $$;


-- 3. 修改建議的「改前」預覽（跟 v81 一樣，多一欄 current_expected_spend）-------------
drop view if exists public.offer_edits_pending_preview;
create view public.offer_edits_pending_preview
with (security_invoker = true) as
select e.id, e.offer_id, e.patch, e.reason, e.source_url, e.created_at,
       o.brand,
       o.offer              as current_offer,
       o.conditions         as current_conditions,
       o.membership         as current_membership,
       o.membership_type    as current_membership_type,
       o.free_tier          as current_free_tier,
       o.timing             as current_timing,
       o.advance_days       as current_advance_days,
       o.value_twd          as current_value_twd,
       o.min_spend          as current_min_spend,
       o.expected_spend     as current_expected_spend,
       o.valid_from         as current_valid_from,
       o.valid_until        as current_valid_until,
       o.category           as current_category,
       o.requires_companion as current_requires_companion,
       o.transferable       as current_transferable,
       o.regions            as current_regions,
       o.sources            as current_sources,
       p.display_name as proposed_by_name
from public.offer_edits e
join public.offers o on o.id = e.offer_id
left join public.profiles_public p on p.id = e.proposed_by
where e.status = 'pending';

grant select on public.offer_edits_pending_preview to authenticated;


-- 4. 套用修改建議：多低消、預計花費 ----------------------------------------
-- 其他欄位跟 v162 一字不差。管理員核可（review_offer_edit）跟老手自動套用
-- （auto_apply_offer_edit）都叫這一支，所以兩條路一起修好。
create or replace function public.apply_offer_edit_patch(p_offer_id bigint, v_patch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.offers o set
    brand              = coalesce(v_patch->>'brand', o.brand),
    category           = coalesce(v_patch->>'category', o.category),
    offer              = coalesce(v_patch->>'offer', o.offer),
    conditions         = coalesce(v_patch->>'conditions', o.conditions),
    membership         = coalesce(v_patch->>'membership', o.membership),
    membership_type    = coalesce(v_patch->>'membership_type', o.membership_type),
    free_tier          = coalesce(v_patch->>'free_tier', o.free_tier),
    transferable       = coalesce(v_patch->>'transferable', o.transferable),
    timing             = coalesce(v_patch->>'timing', o.timing),
    offer_window       = coalesce(v_patch->>'timing', o.offer_window),
    advance_days       = case when v_patch ? 'advance_days'
                              then (v_patch->>'advance_days')::int else o.advance_days end,
    value_twd          = case when v_patch ? 'value_twd'
                              then (v_patch->>'value_twd')::int else o.value_twd end,
    min_spend          = case when v_patch ? 'min_spend'
                              then (v_patch->>'min_spend')::int else o.min_spend end,
    expected_spend     = case when v_patch ? 'expected_spend'
                              then (v_patch->>'expected_spend')::int else o.expected_spend end,
    valid_from         = case when v_patch ? 'valid_from'
                              then nullif(v_patch->>'valid_from','')::date else o.valid_from end,
    valid_until        = case when v_patch ? 'valid_until'
                              then nullif(v_patch->>'valid_until','')::date else o.valid_until end,
    requires_companion = case when v_patch ? 'requires_companion'
                              then (v_patch->>'requires_companion')::boolean else o.requires_companion end,
    regions            = case when v_patch ? 'regions'
                              then array(select jsonb_array_elements_text(v_patch->'regions')) else o.regions end,
    sources            = case when v_patch ? 'sources'
                              then (v_patch->'sources') else o.sources end
  where o.id = p_offer_id;
end $$;
revoke execute on function public.apply_offer_edit_patch(bigint, jsonb) from public, anon, authenticated;


-- 【檢查】跑完貼這兩行：
-- select count(*) from public.offers_public;                       -- 跟跑之前一樣多
-- select column_name from information_schema.columns where table_name = 'offers_public' and column_name = 'expected_spend';
