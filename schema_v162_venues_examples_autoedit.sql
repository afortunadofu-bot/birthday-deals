-- =====================================================================
-- v162：商圈中心重新對準、範例行程、修改建議也能自動套用
--
-- celine：
--   「地圖位置有些舊的幫我全部更新，有些店家不在地圖裡」
--   「生日當天最省行程、免費一路拿拿拿這種……我希望它作為預設的出現在
--     大家的行程那裏當範例」
--   「自動上架包含修改建議也能自動改」
--
-- 要先跑過 v156、v160、v161。可重複執行（第 1 段重跑會再往中心收斂一點點，
-- 第 2 段重跑會把範例刪掉重建）。
--
-- 跑完最下面會列一張表：每個商圈的中心這次移了幾公尺。
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 每個商圈的中心，重新對準裡面分店最集中的地方
--
-- 這些商圈的中心是 v142 從「160 公尺見方的格子」算出來的格子平均，常常偏在
-- 一邊（LaLaport 那一格，圓圈中心在商場西邊的路上）。偏了之後，圈裡算到的
-- 店就少了一截——商場另一頭的店在圈外。
--
-- 做法：把中心移到「圈裡所有分店的平均位置」，再用新的中心重算一次，做四輪。
-- 每一輪都往分店密的地方挪一點，四輪就停在那一團店的正中間。
-- 圈裡少於 3 家分店的不動（太少，平均沒有意義）。名字、半徑一個字都不動。
-- ---------------------------------------------------------------------
drop table if exists _v162_venue_before;
create temp table _v162_venue_before as select id, name, lat, lng from public.venues;

do $$
declare i integer;
begin
  for i in 1..4 loop
    update public.venues v
       set lat = round(c.clat::numeric, 6)::double precision,
           lng = round(c.clng::numeric, 6)::double precision
      from (
        select v2.id, avg(s.lat) as clat, avg(s.lng) as clng
          from public.venues v2
          join public.offer_stores s
            on not s.hidden and s.lat is not null
           and s.lat between v2.lat - v2.radius_m / 111000.0 and v2.lat + v2.radius_m / 111000.0
           and s.lng between v2.lng - v2.radius_m / 101000.0 and v2.lng + v2.radius_m / 101000.0
          join public.offers o on o.id = s.offer_id and o.status = 'approved'
         where 111000.0 * sqrt(power(s.lat - v2.lat, 2)
                             + power((s.lng - v2.lng) * cos(radians(v2.lat)), 2)) <= v2.radius_m
         group by v2.id
        having count(*) >= 3
      ) c
     where c.id = v.id;
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 2. 範例行程：出現在「大家的行程」最上面
--
-- 三趟，都用**現在的資料**挑：先挑最適合的那個商圈，再從那個商圈裡挑店。
-- 三趟不會挑到同一個商圈。
--   · 免費一路拿拿拿：完全免費（不用消費）最多的商圈
--   · 生日當天最省行程：「只限生日當天」的優惠加起來最省的商圈
--   · 一個人也可以吃到飽：不用同行、吃的喝的又免費的最多的商圈
-- 掛在第一個管理員帳號底下，標 is_example。那個帳號自己的「我的行程」不會
-- 看到它們（前端排除），「大家的行程」上的作者顯示「壽星日」。
-- ---------------------------------------------------------------------
alter table public.plans add column if not exists is_example boolean not null default false;

delete from public.plans where is_example;

drop table if exists _v162_pairs;
create temp table _v162_pairs as
  select p.venue_id, p.offer_id, o.free_tier, o.timing, o.category,
         coalesce(o.requires_companion, false) as requires_companion,
         coalesce(o.value_twd, 0) as value_twd
    from public.venue_offer_pairs() p
    join public.offers o on o.id = p.offer_id;

do $$
declare
  v_owner uuid;
  v_used  bigint[] := '{}';
  v_venue bigint; v_vname text;
  v_plan  bigint;
  k       integer;
  r       record;
begin
  select id into v_owner from public.profiles where is_admin order by created_at limit 1;
  if v_owner is null then
    raise notice '找不到管理員帳號，範例行程跳過';
    return;
  end if;

  -- 2a. 免費一路拿拿拿 -------------------------------------------------
  select venue_id into v_venue from _v162_pairs
   where free_tier = 'free_no_min'
   group by venue_id order by count(*) desc, venue_id limit 1;
  if v_venue is not null then
    select name into v_vname from public.venues where id = v_venue;
    v_used := v_used || v_venue;
    insert into public.plans (user_id, title, note, is_public, shared_at, is_example)
    values (v_owner, '免費一路拿拿拿',
            '全部在「' || v_vname || '」，走路就到。出示證件就送的先拿，要消費才送的看心情順路。',
            true, now(), true)
    returning id into v_plan;
    k := 0;
    insert into public.plan_items (plan_id, heading, note, sort_order)
    values (v_plan, '先拿不用消費的', '出示證件就送，不用買東西', k); k := k + 1;
    for r in select offer_id from _v162_pairs
              where venue_id = v_venue and free_tier = 'free_no_min'
              order by value_twd desc, offer_id limit 6 loop
      insert into public.plan_items (plan_id, offer_id, sort_order) values (v_plan, r.offer_id, k); k := k + 1;
    end loop;
    insert into public.plan_items (plan_id, heading, note, sort_order)
    values (v_plan, '順路：買一點就送', '要消費才送，看心情', k); k := k + 1;
    for r in select offer_id from _v162_pairs
              where venue_id = v_venue and free_tier = 'free_min'
              order by value_twd desc, offer_id limit 3 loop
      insert into public.plan_items (plan_id, offer_id, sort_order) values (v_plan, r.offer_id, k); k := k + 1;
    end loop;
  end if;

  -- 2b. 生日當天最省行程 -----------------------------------------------
  select venue_id into v_venue from _v162_pairs
   where timing in ('當日', '當月＋當日') and not (venue_id = any(v_used))
   group by venue_id order by sum(value_twd) desc, count(*) desc, venue_id limit 1;
  if v_venue is not null then
    select name into v_vname from public.venues where id = v_venue;
    v_used := v_used || v_venue;
    insert into public.plans (user_id, title, note, is_public, shared_at, is_example)
    values (v_owner, '生日當天最省行程',
            '生日那天排「' || v_vname || '」：只限當天的先用掉，整個月都能用的順路。',
            true, now() - interval '1 second', true)
    returning id into v_plan;
    k := 0;
    insert into public.plan_items (plan_id, heading, note, sort_order)
    values (v_plan, '只有生日當天能用的，先去', '過了今天就沒了', k); k := k + 1;
    for r in select offer_id from _v162_pairs
              where venue_id = v_venue and timing in ('當日', '當月＋當日')
              order by value_twd desc, offer_id limit 4 loop
      insert into public.plan_items (plan_id, offer_id, sort_order) values (v_plan, r.offer_id, k); k := k + 1;
    end loop;
    insert into public.plan_items (plan_id, heading, note, sort_order)
    values (v_plan, '整個月都能用的，順便', null, k); k := k + 1;
    for r in select offer_id from _v162_pairs
              where venue_id = v_venue and timing = '當月'
              order by value_twd desc, offer_id limit 4 loop
      insert into public.plan_items (plan_id, offer_id, sort_order) values (v_plan, r.offer_id, k); k := k + 1;
    end loop;
  end if;

  -- 2c. 一個人也可以吃到飽 ---------------------------------------------
  select venue_id into v_venue from _v162_pairs
   where not requires_companion
     and free_tier in ('free_no_min', 'free_min', 'bogo')
     and category in ('餐廳', '速食', '甜點烘焙', '飲料')
     and not (venue_id = any(v_used))
   group by venue_id order by count(*) desc, venue_id limit 1;
  if v_venue is not null then
    select name into v_vname from public.venues where id = v_venue;
    insert into public.plans (user_id, title, note, is_public, shared_at, is_example)
    values (v_owner, '一個人也可以吃到飽',
            '都不用揪人：「' || v_vname || '」這幾家一個人就能用。先吃正餐，再續甜點飲料。',
            true, now() - interval '2 seconds', true)
    returning id into v_plan;
    k := 0;
    insert into public.plan_items (plan_id, heading, sort_order) values (v_plan, '正餐', k); k := k + 1;
    for r in select offer_id from _v162_pairs
              where venue_id = v_venue and not requires_companion
                and free_tier in ('free_no_min', 'free_min', 'bogo') and category in ('餐廳', '速食')
              order by value_twd desc, offer_id limit 3 loop
      insert into public.plan_items (plan_id, offer_id, sort_order) values (v_plan, r.offer_id, k); k := k + 1;
    end loop;
    insert into public.plan_items (plan_id, heading, sort_order) values (v_plan, '甜點、飲料續攤', k); k := k + 1;
    for r in select offer_id from _v162_pairs
              where venue_id = v_venue and not requires_companion
                and free_tier in ('free_no_min', 'free_min', 'bogo') and category in ('甜點烘焙', '飲料')
              order by value_twd desc, offer_id limit 4 loop
      insert into public.plan_items (plan_id, offer_id, sort_order) values (v_plan, r.offer_id, k); k := k + 1;
    end loop;
  end if;
end $$;

-- 清單：範例排最上面、作者寫「壽星日」、範例永遠不算「你的」
drop function if exists public.shared_plans(integer);
create function public.shared_plans(p_limit integer default 60)
returns table (id bigint, title text, note text, plan_date date, shared_at timestamptz,
               author text, mine boolean, saved boolean, n_stops integer, n_saves integer,
               is_example boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.title, p.note, p.plan_date, p.shared_at,
         case when p.is_example then '壽星日'
              when pr.show_on_leaderboard and coalesce(pr.display_name, '') <> ''
              then pr.display_name else '匿名壽星' end,
         p.user_id = auth.uid() and not p.is_example,
         exists (select 1 from public.plan_saves s where s.plan_id = p.id and s.user_id = auth.uid()),
         (select count(*)::int from public.plan_items i where i.plan_id = p.id and i.offer_id is not null),
         (select count(*)::int from public.plan_saves s where s.plan_id = p.id),
         p.is_example
    from public.plans p
    join public.profiles pr on pr.id = p.user_id
   where p.is_public and (p.is_example or not coalesce(pr.is_banned, false))
   order by p.is_example desc, p.shared_at desc nulls last, p.id desc
   limit least(greatest(coalesce(p_limit, 60), 1), 200);
$$;
revoke execute on function public.shared_plans(integer) from public;
grant  execute on function public.shared_plans(integer) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. 修改建議也能自動套用
--
-- 跟 v144 同一顆開關（auto_approve）、同一條規則：已經有 2 筆被核可的人
-- （投稿或修改建議都算），新的修改建議直接套用，不用等你。
--
-- 「套用一筆修改建議」本來寫在 review_offer_edit() 裡面。抽成一支
-- apply_offer_edit_patch()，管理員按核可跟自動套用走**同一份欄位清單**——
-- 不然哪天加了一個新欄位，只改到其中一邊，自動套用就會默默漏掉那一欄。
--
-- 自動套用的那一筆會先記下「改之前是什麼」（auto_prev），審核那邊的
-- 「自動上架的」可以一鍵還原。
-- ---------------------------------------------------------------------
alter table public.offer_edits add column if not exists auto_applied boolean not null default false;
alter table public.offer_edits add column if not exists auto_prev jsonb;

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
-- 只給下面兩支（都是 security definer）內部用，誰都不能直接叫
revoke execute on function public.apply_offer_edit_patch(bigint, jsonb) from public, anon, authenticated;

-- 管理員核可：行為跟 v52 一字不差，只是套用那一段改叫上面那一支
create or replace function public.review_offer_edit(
  p_edit_id bigint, p_status text, p_note text default '', p_override_patch jsonb default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  e public.offer_edits;
  v_proposer_name text;
  v_patch jsonb;
begin
  if not public.is_admin() then raise exception '只有管理員可以審核'; end if;
  if p_status not in ('approved','rejected') then raise exception '狀態不合法'; end if;

  select * into e from public.offer_edits where id = p_edit_id;
  if e.id is null then raise exception '找不到這筆建議'; end if;
  if e.status <> 'pending' then raise exception '這筆已經審核過了'; end if;

  if p_status = 'approved' then
    v_patch := coalesce(p_override_patch, e.patch);
    select display_name into v_proposer_name from public.profiles where id = e.proposed_by;
    perform set_config('app.edit_reason', coalesce(nullif(e.reason,''), '（民眾建議修改）'), true);
    perform set_config('app.edit_actor_name',
      case when p_override_patch is not null and p_override_patch is distinct from e.patch
        then coalesce(v_proposer_name,'一位使用者') || '（建議修改，管理員調整後核可）'
        else coalesce(v_proposer_name,'一位使用者') || '（建議修改，管理員核可）'
      end, true);
    perform public.apply_offer_edit_patch(e.offer_id, v_patch);
  end if;

  update public.offer_edits
     set status = p_status, reviewed_by = auth.uid(),
         reviewed_at = now(), review_note = coalesce(p_note,'')
   where id = p_edit_id;
end $$;
grant execute on function public.review_offer_edit(bigint, text, text, jsonb) to authenticated;
revoke execute on function public.review_offer_edit(bigint, text, text, jsonb) from public;

-- 自動套用
create or replace function public.auto_apply_offer_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  MIN_APPROVED constant integer := 2;     -- 跟 v144 同一個門檻
  v_on       boolean;
  v_approved integer;
  v_name     text;
  v_prev     jsonb;
  v_offer    public.offers;
begin
  if new.status is distinct from 'pending' or new.proposed_by is null then return null; end if;
  select enabled into v_on from public.site_settings where key = 'auto_approve';
  if not coalesce(v_on, false) then return null; end if;
  if exists (select 1 from public.profiles p
              where p.id = new.proposed_by and coalesce(p.is_banned, false)) then
    return null;
  end if;
  -- 老手：投稿被核可的＋修改建議被核可的，加起來
  select (select count(*) from public.offers o
           where o.submitted_by = new.proposed_by and o.status = 'approved')
       + (select count(*) from public.offer_edits x
           where x.proposed_by = new.proposed_by and x.status = 'approved' and x.id <> new.id)
    into v_approved;
  if v_approved < MIN_APPROVED then return null; end if;

  -- 改之前的樣子：只記這筆建議有動到的那幾欄，還原時原樣套回去
  select * into v_offer from public.offers where id = new.offer_id;
  if v_offer.id is null then return null; end if;
  select coalesce(jsonb_object_agg(k, to_jsonb(v_offer) -> k), '{}'::jsonb)
    into v_prev
    from jsonb_object_keys(new.patch) k;

  select display_name into v_name from public.profiles where id = new.proposed_by;
  perform set_config('app.edit_reason', coalesce(nullif(new.reason,''), '（民眾建議修改）'), true);
  perform set_config('app.edit_actor_name',
    coalesce(v_name,'一位使用者') || '（建議修改，自動套用）', true);
  perform public.apply_offer_edit_patch(new.offer_id, new.patch);

  update public.offer_edits
     set status = 'approved', auto_applied = true, auto_prev = v_prev,
         reviewed_at = now(),
         review_note = '自動套用（建議者已有 ' || v_approved || ' 筆被核可）'
   where id = new.id;
  return null;
end $$;
revoke execute on function public.auto_apply_offer_edit() from public, anon, authenticated;

drop trigger if exists offer_edits_auto_apply on public.offer_edits;
create trigger offer_edits_auto_apply
  after insert on public.offer_edits
  for each row execute function public.auto_apply_offer_edit();

-- 審核那一塊要列得出來
create or replace function public.admin_auto_applied_edits(p_days integer default 14)
returns table (id bigint, offer_id bigint, brand text, proposer text, fields text,
               reviewed_at timestamptz, reverted boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception '只有管理員可以看'; end if;
  return query
  select e.id, e.offer_id, o.brand, coalesce(p.display_name, '匿名'),
         (select string_agg(k, '、') from jsonb_object_keys(e.patch) k),
         e.reviewed_at, e.auto_prev is null
    from public.offer_edits e
    join public.offers o on o.id = e.offer_id
    left join public.profiles p on p.id = e.proposed_by
   where e.auto_applied
     and e.reviewed_at > now() - make_interval(days => p_days)
   order by e.reviewed_at desc;
end $$;
revoke execute on function public.admin_auto_applied_edits(integer) from public, anon;
grant  execute on function public.admin_auto_applied_edits(integer) to authenticated;

-- 一鍵還原：把改之前的那幾欄原樣套回去，這一筆標成退回
create or replace function public.admin_revert_auto_edit(p_edit_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare e public.offer_edits;
begin
  if not public.is_admin() then raise exception '只有管理員可以還原'; end if;
  select * into e from public.offer_edits where id = p_edit_id;
  if e.id is null or not e.auto_applied then raise exception '這筆不是自動套用的'; end if;
  if e.auto_prev is null then raise exception '這筆已經還原過了'; end if;
  perform set_config('app.edit_reason', '自動套用的修改建議，管理員還原', true);
  perform set_config('app.edit_actor_name', '管理員（還原自動套用）', true);
  perform public.apply_offer_edit_patch(e.offer_id, e.auto_prev);
  update public.offer_edits
     set status = 'rejected', auto_prev = null, reviewed_by = auth.uid(),
         review_note = '自動套用後由管理員還原'
   where id = p_edit_id;
end $$;
revoke execute on function public.admin_revert_auto_edit(bigint) from public, anon;
grant  execute on function public.admin_revert_auto_edit(bigint) to authenticated;


-- ---------------------------------------------------------------------
-- 跑完看這一張：每個商圈的中心這次移了幾公尺（5 公尺以內的不列）
-- ---------------------------------------------------------------------
select b.name as "商圈",
       round(111000 * sqrt(power(v.lat - b.lat, 2)
                         + power((v.lng - b.lng) * cos(radians(b.lat)), 2)))::int as "中心移了幾公尺"
  from _v162_venue_before b
  join public.venues v on v.id = b.id
 where 111000 * sqrt(power(v.lat - b.lat, 2) + power((v.lng - b.lng) * cos(radians(b.lat)), 2)) > 5
 order by 2 desc;
