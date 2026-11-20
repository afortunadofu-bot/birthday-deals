-- =====================================================================
-- v204：使用者推薦的地點直接上架，不用管理員審
--
-- celine：「民眾投稿的行程可以直接上架 不用我審核」。
-- 「排行程」裡要審的只有「推薦一個地點」：原本只收名字、縣市，
-- 座標要管理員自己對，所以一定得等人審。
--
-- 現在推薦的人自己指出位置（查地名或用目前位置），送出時呼叫 submit_venue()，
-- 資料庫直接建立並公開。三種情況不直接上：
--   1. 方圓 200 公尺內已經有公開的地點 → 不重複建，告訴他是哪一個
--   2. 方圓 180 公尺內站上找不到 2 家以上有優惠的店 → 照舊留給管理員看
--      （名字取得再好，裡面沒有店，上架了也只是一個空殼）
--   3. 一天 5 個的上限、被停權的人：照舊擋（同一張 venue_suggestions、同一個 trigger）
--
-- 「建議修改」既有地點的那種不在這裡：大多是「少了哪幾家」，還是要人去看。
--
-- 每一筆照樣記在 venue_suggestions（status='accepted'、published=true、venue_id=建好的那個），
-- 管理員在審核頁看得到「最近自動上架的」，不對就取消公開。
--
-- 要先跑過 v142、v153、v160。可重複執行。
-- 沒跑的話：前端退回原本的「送給管理員審」，什麼都不會壞。
-- =====================================================================

alter table public.venue_suggestions
  add column if not exists published boolean not null default false;

create or replace function public.submit_venue(
  p_name text, p_county text, p_lat double precision, p_lng double precision, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text := btrim(coalesce(p_name, ''));
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_near  record;
  v_n     integer;
  v_sid   bigint;
  v_vid   bigint;
begin
  if v_uid is null then raise exception '要先登入'; end if;
  if public.is_banned() then raise exception '這個帳號目前不能推薦地點'; end if;
  if char_length(v_name) < 2 then raise exception '地點名稱至少要兩個字'; end if;
  v_name := left(v_name, 40);
  if p_lat is null or p_lng is null
     or p_lat not between 21.8 and 26.5 or p_lng not between 118.0 and 122.2 then
    raise exception '位置不在台灣，換一個再試';
  end if;

  -- 1. 附近已經有了
  select v.id, v.name,
         111000.0 * sqrt(power(v.lat - p_lat, 2) + power((v.lng - p_lng) * cos(radians(p_lat)), 2)) as d
    into v_near
    from public.venues v
   where v.is_public
     and v.lat between p_lat - 0.003 and p_lat + 0.003
     and v.lng between p_lng - 0.003 and p_lng + 0.003
   order by 3
   limit 1;
  if v_near.id is not null and v_near.d < 200 then
    insert into public.venue_suggestions (name, county, note, user_id, status, reviewed_at, venue_id)
    values (v_name, p_county, v_note, v_uid, 'pending', null, null)
    returning id into v_sid;   -- 先用 pending 進去（insert 政策跟 rate limit 都照舊），再改
    update public.venue_suggestions
       set status = 'accepted', reviewed_at = now(), venue_id = v_near.id
     where id = v_sid;
    return jsonb_build_object('result', 'exists', 'venue_id', v_near.id, 'name', v_near.name);
  end if;

  -- 2. 裡面有幾家（不同的優惠）
  select count(distinct s.offer_id) into v_n
    from public.offer_stores s
    join public.offers o on o.id = s.offer_id and o.status = 'approved'
   where not s.hidden
     and s.lat between p_lat - 0.0017 and p_lat + 0.0017
     and s.lng between p_lng - 0.0019 and p_lng + 0.0019
     and 111000.0 * sqrt(power(s.lat - p_lat, 2) + power((s.lng - p_lng) * cos(radians(p_lat)), 2)) <= 180;

  insert into public.venue_suggestions (name, county, note, user_id, status)
  values (v_name, p_county,
          left(concat_ws('；', v_note, '位置 ' || round(p_lat::numeric, 5) || ',' || round(p_lng::numeric, 5)), 300),
          v_uid, 'pending')
  returning id into v_sid;

  if v_n < 2 then
    return jsonb_build_object('result', 'pending', 'offers', v_n);
  end if;

  -- 3. 直接上架
  insert into public.venues (name, county, lat, lng, is_public, created_by)
  values (v_name, nullif(p_county, ''), round(p_lat::numeric, 6), round(p_lng::numeric, 6), true, v_uid)
  returning id into v_vid;
  update public.venue_suggestions
     set status = 'accepted', reviewed_at = now(), venue_id = v_vid, published = true
   where id = v_sid;
  return jsonb_build_object('result', 'published', 'venue_id', v_vid, 'name', v_name, 'offers', v_n);
end;
$$;

revoke execute on function public.submit_venue(text, text, double precision, double precision, text) from public, anon;
grant  execute on function public.submit_venue(text, text, double precision, double precision, text) to authenticated;

notify pgrst, 'reload schema';

-- 跑完驗證（應該看到 published 這一欄）：
--   select id, name, status, published from public.venue_suggestions order by id desc limit 5;
