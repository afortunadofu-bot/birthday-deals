-- v179：投稿、修改建議可以填營業時間
-- ---------------------------------------------------------------------
-- celine（11/5）：「先不爬營業時間，但使用者投稿跟編輯都可以輸入及更改營業時間」
--
-- v178 是「分店」的營業時間（Google 抓的，先不抓）。這一支是「優惠」本身的營業時間，
-- 投稿的人自己填：
--   1. offers 多兩欄
--      hours      jsonb：[[開, 關], …]，一週裡的第幾分鐘（週日 00:00＝0，到 10080），
--                 跟 v178 的 open_week 同一套算法。24 小時營業＝[[0,10080]]。
--                 null＝沒填（不知道）——跟「整週都沒開」分開
--      hours_note text：補充，例如「各分店不同，以門市為準」「國定假日公休」
--   2. offers_public 重建，才讀得到新欄位
--   3. 修改建議的「改前」預覽多 current_hours、current_hours_note
--   4. 修改建議核可（管理員、老手自動套用都走這支）時套用營業時間
--
-- 要先跑過 schema_v166_expected_spend.sql（第 4 段的欄位清單包含 v166 的 expected_spend）。
-- 可重複執行。
--
-- ⚠️ 跑完這支之後，再去 Cloudflare 更新 birthdaydeals-api 那支 Worker（worker/offers-cache.js），
--    卡片上的營業時間才會從快取出來。順序反過來的話 Worker 會自己退回舊的欄位清單，不會壞。
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'offers' and column_name = 'expected_spend') then
    raise exception '還沒跑過 schema_v166_expected_spend.sql，先跑那一支再跑這一支。';
  end if;
end $$;


-- 1. 新欄位 ------------------------------------------------------------
-- 格式檢查：最多 28 段，每段兩個整數，0 ≤ 開 < 關 ≤ 10080。
-- 用 case 一層一層判斷，不讓壞資料在轉型時直接噴錯。
create or replace function public.valid_week_hours(h jsonb)
returns boolean
language sql
immutable
as $$
  select case
    when h is null or jsonb_typeof(h) = 'null' then true
    when jsonb_typeof(h) <> 'array' or jsonb_array_length(h) > 28 then false
    else not exists (
      select 1 from jsonb_array_elements(h) e
      where case
        when jsonb_typeof(e) <> 'array' or jsonb_array_length(e) <> 2 then true
        when jsonb_typeof(e->0) <> 'number' or jsonb_typeof(e->1) <> 'number' then true
        else not ((e->>0)::numeric >= 0 and (e->>1)::numeric <= 10080
                  and (e->>0)::numeric < (e->>1)::numeric
                  and (e->>0)::numeric = trunc((e->>0)::numeric)
                  and (e->>1)::numeric = trunc((e->>1)::numeric))
      end)
  end
$$;

alter table public.offers add column if not exists hours jsonb;
alter table public.offers add column if not exists hours_note text;
alter table public.offers drop constraint if exists offers_hours_valid;
alter table public.offers
  add constraint offers_hours_valid check (public.valid_week_hours(hours)) not valid;
alter table public.offers drop constraint if exists offers_hours_note_len;
alter table public.offers
  add constraint offers_hours_note_len check (hours_note is null or char_length(hours_note) <= 120) not valid;

comment on column public.offers.hours is
  'v179：投稿的人填的營業時間。[[開,關],…]，一週裡的第幾分鐘（週日 00:00＝0）。null＝沒填。';
comment on column public.offers.hours_note is
  'v179：營業時間補充，例如「各分店不同」「國定假日公休」。';


-- 2. offers_public 重建（定義跟 v166 一字不差，只是重新展開 o.*）------------------
drop view if exists public.offers_public;
create view public.offers_public
with (security_invoker = true) as
select o.*, s.report_count, s.last_used_on, s.success_rate, s.comment_count,
       s.rating_avg, s.rating_count, s.wish_count
from public.offers o
left join public.offer_stats s on s.offer_id = o.id
where o.status = 'approved';

grant select on public.offers_public to anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'edge_reader') then
    execute 'grant select on public.offers_public to edge_reader';
  end if;
end $$;


-- 3. 修改建議的「改前」預覽（跟 v166 一樣，多兩欄）-----------------------------
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
       o.hours              as current_hours,
       o.hours_note         as current_hours_note,
       p.display_name as proposed_by_name
from public.offer_edits e
join public.offers o on o.id = e.offer_id
left join public.profiles_public p on p.id = e.proposed_by
where e.status = 'pending';

grant select on public.offer_edits_pending_preview to authenticated;


-- 4. 套用修改建議：多營業時間 ----------------------------------------------
-- 其他欄位跟 v166 一字不差。patch 裡 hours 是 null＝「把營業時間清掉」（有這個 key 才動）。
create or replace function public.apply_offer_edit_patch(p_offer_id bigint, v_patch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if v_patch ? 'hours' and not public.valid_week_hours(v_patch->'hours') then
    raise exception '營業時間格式不對';
  end if;
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
                              then (v_patch->'sources') else o.sources end,
    hours              = case when v_patch ? 'hours'
                              then (case when jsonb_typeof(v_patch->'hours') = 'array' then v_patch->'hours' end)
                              else o.hours end,
    hours_note         = case when v_patch ? 'hours_note'
                              then nullif(btrim(v_patch->>'hours_note'), '') else o.hours_note end
  where o.id = p_offer_id;
end $$;
revoke execute on function public.apply_offer_edit_patch(bigint, jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';


-- 【檢查】跑完貼這兩行：
-- select count(*) from public.offers_public;                       -- 跟跑之前一樣多
-- select public.valid_week_hours('[[600,1260]]'), public.valid_week_hours('[[1260,600]]');  -- true, false
