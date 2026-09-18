-- =====================================================================
-- v70：拆集團優惠、管理員合併重複優惠、自己上傳大頭貼
--
--   使用者回饋（celine 拍板「照你說的做」）：
--
--   1. 集團優惠拆成一個品牌一張卡，網友回報時才看得到特定店家的資訊：
--      PK雙饗卡（肯德基 × 必勝客）、多那之/卡啡那/ MINI.D COFFEE、瓦城泰統集團。
--      做法跟 v16 拆王品集團一樣：舊的那張沿用同一個 id 改成第一個品牌（原本掛在上面的
--      回報／留言／收藏／評分都留著，排行榜的累積省下不會少），其他品牌另外新增，
--      共用同一個 group_name。
--      為什麼不把舊卡下架、另外全部新增：排行榜是用「看的人」的權限讀 offers，
--      下架（archived）的卡片上的回報，一般使用者看排行榜時會整筆消失，大家的累積省下會變少。
--
--   2. 重複店家（例如「硬咖啡」vs「CAFE!N 硬咖啡」、「gonna EAT」vs「gonnaEAT」）：
--      新增 admin_merge_offers(保留的 id, 併掉的 id)，把併掉那張的回報、留言、評分、收藏、
--      修改建議、歷史、通知、分店都搬到保留的那張，再把併掉那張下架（archived，不刪除）。
--      同一個人兩張都評過分／都收藏過時，保留「保留那張」上的那一筆。
--      只有管理員能執行，後台「合併重複優惠」按鈕會呼叫它。
--
--   3. 自己上傳大頭貼：Supabase Storage 開一個 avatars bucket（公開讀取、2MB、只收 jpg/png/webp），
--      每個人只能寫自己資料夾（avatars/<自己的 user id>/…）。
--      profiles.avatar_url 只接受：空值、自己資料夾裡的圖、Google 帳號的頭像——
--      不讓人把大頭貼設成任意外部網址（別人看排行榜時會載入那個網址）。
--
--   可重複執行。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 拆集團優惠
-- ---------------------------------------------------------------------
do $$
declare
  old_row public.offers%rowtype;
begin
  -- ---------------- PK雙饗卡（肯德基 × 必勝客）----------------
  select * into old_row from public.offers where brand like 'PK雙饗卡%' limit 1;
  if found then
    update public.offers set
      brand = '肯德基', offer = 'PK雙饗卡會員生日禮：肯德基 $50 折價券',
      free_tier = 'discount', value_twd = 50, group_name = 'PK雙饗卡'
    where id = old_row.id;
    insert into public.offers (
      brand, category, regions, region_note, offer, membership, membership_type, membership_cost,
      free_tier, advance_days, advance_note, offer_window, timing, conditions, validity, validity_type,
      valid_from, valid_until, sources, status, verified, last_checked, submitted_by, reviewed_by,
      reviewed_at, review_note, group_name, value_twd, requires_companion, transferable
    )
    select '必勝客', old_row.category, old_row.regions, old_row.region_note,
      'PK雙饗卡會員生日禮：必勝客 $50 折價券', old_row.membership, old_row.membership_type,
      old_row.membership_cost, 'discount', old_row.advance_days, old_row.advance_note, old_row.offer_window,
      old_row.timing, old_row.conditions, old_row.validity, old_row.validity_type, old_row.valid_from,
      old_row.valid_until, old_row.sources, old_row.status, old_row.verified, old_row.last_checked,
      old_row.submitted_by, old_row.reviewed_by, old_row.reviewed_at, old_row.review_note,
      'PK雙饗卡', 50, old_row.requires_companion, old_row.transferable
    where not exists (select 1 from public.offers where brand = '必勝客' and group_name = 'PK雙饗卡');
    raise notice 'PK雙饗卡：拆成肯德基、必勝客。';
  end if;

  -- ---------------- 多那之／卡啡那／MINI.D COFFEE ----------------
  select * into old_row from public.offers where brand like '多那之/卡啡那%' limit 1;
  if found then
    update public.offers set
      brand = '多那之',
      offer = E'1. 實體門市飲品系列 95 折（結帳前出示券）\n2. $10 蛋糕折價券\n（多那之、卡啡那、MINI.D COFFEE 都能用）',
      free_tier = 'discount', group_name = '多那之／卡啡那／MINI.D COFFEE'
    where id = old_row.id;
    insert into public.offers (
      brand, category, regions, region_note, offer, membership, membership_type, membership_cost,
      free_tier, advance_days, advance_note, offer_window, timing, conditions, validity, validity_type,
      valid_from, valid_until, sources, status, verified, last_checked, submitted_by, reviewed_by,
      reviewed_at, review_note, group_name, value_twd, requires_companion, transferable
    )
    select v.brand, old_row.category, old_row.regions, old_row.region_note,
      E'1. 實體門市飲品系列 95 折（結帳前出示券）\n2. $10 蛋糕折價券\n（多那之、卡啡那、MINI.D COFFEE 都能用）',
      old_row.membership, old_row.membership_type, old_row.membership_cost, 'discount',
      old_row.advance_days, old_row.advance_note, old_row.offer_window, old_row.timing, old_row.conditions,
      old_row.validity, old_row.validity_type, old_row.valid_from, old_row.valid_until, old_row.sources,
      old_row.status, old_row.verified, old_row.last_checked, old_row.submitted_by, old_row.reviewed_by,
      old_row.reviewed_at, old_row.review_note, '多那之／卡啡那／MINI.D COFFEE', old_row.value_twd,
      old_row.requires_companion, old_row.transferable
    from (values ('卡啡那'), ('MINI.D COFFEE')) as v(brand)
    where not exists (select 1 from public.offers o where o.brand = v.brand and o.group_name = '多那之／卡啡那／MINI.D COFFEE');
    raise notice '多那之／卡啡那／MINI.D COFFEE：拆成 3 張。';
  end if;

  -- ---------------- 瓦城泰統集團（誠品會員卡 × 瓦城集團，各品牌指定誠品店、門檻不同）----------------
  select * into old_row from public.offers where brand = '瓦城泰統集團' limit 1;
  if found then
    update public.offers set
      brand = 'YABI KITCHEN',
      offer = E'憑券＋誠品會員卡，到誠品南西店的 YABI 用餐\n消費滿 1,000 元送招牌飲品乙份',
      region_note = '限誠品南西店', free_tier = 'free_min', group_name = '瓦城泰統集團（誠品聯名）'
    where id = old_row.id;
    insert into public.offers (
      brand, category, regions, region_note, offer, membership, membership_type, membership_cost,
      free_tier, advance_days, advance_note, offer_window, timing, conditions, validity, validity_type,
      valid_from, valid_until, sources, status, verified, last_checked, submitted_by, reviewed_by,
      reviewed_at, review_note, group_name, value_twd, requires_companion, transferable
    )
    select v.brand, old_row.category, old_row.regions, v.region_note, v.offer, old_row.membership,
      old_row.membership_type, old_row.membership_cost, 'free_min', old_row.advance_days, old_row.advance_note,
      old_row.offer_window, old_row.timing, old_row.conditions, old_row.validity, old_row.validity_type,
      old_row.valid_from, old_row.valid_until, old_row.sources, old_row.status, old_row.verified,
      old_row.last_checked, old_row.submitted_by, old_row.reviewed_by, old_row.reviewed_at,
      old_row.review_note, '瓦城泰統集團（誠品聯名）', old_row.value_twd, old_row.requires_companion,
      old_row.transferable
    from (values
      ('大心新泰式麵食', '限誠品南西店', E'憑券＋誠品會員卡，到誠品南西店的大心用餐\n任點主食乙碗送招牌飲品乙份'),
      ('1010湘', '限誠品新板店', E'憑券＋誠品會員卡，到誠品新板店的 1010湘用餐\n消費滿 1,300 元送招牌飲品乙份'),
      ('瓦城泰國料理', '限誠品新店店', E'憑券＋誠品會員卡，到誠品新店店的瓦城用餐\n消費滿 1,300 元送招牌飲品乙份'),
      ('時時香', '限誠品新店店', E'憑券＋誠品會員卡，到誠品新店店的時時香用餐\n消費滿 1,300 元送招牌飲品乙份'),
      ('1010湘食堂', '限誠品 480 店', E'憑券＋誠品會員卡，到誠品 480 的 1010湘食堂用餐\n消費滿 1,300 元送招牌飲品乙份'),
      ('非常泰', '限誠品 480 店', E'憑券＋誠品會員卡，到誠品 480 的非常泰用餐\n消費滿 1,300 元送招牌飲品乙份')
    ) as v(brand, region_note, offer)
    where not exists (select 1 from public.offers o where o.brand = v.brand and o.group_name = '瓦城泰統集團（誠品聯名）');
    raise notice '瓦城泰統集團：拆成 7 張。';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. 管理員合併重複優惠
-- ---------------------------------------------------------------------
create or replace function public.admin_merge_offers(p_keep bigint, p_drop bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n_reports int; n_comments int; n_ratings int; n_wish int;
begin
  if not public.is_admin() then raise exception '只有管理員可以合併優惠'; end if;
  if p_keep is null or p_drop is null or p_keep = p_drop then raise exception '要選兩張不同的優惠'; end if;
  if not exists (select 1 from public.offers where id = p_keep) then raise exception '找不到要保留的優惠 #%', p_keep; end if;
  if not exists (select 1 from public.offers where id = p_drop) then raise exception '找不到要併掉的優惠 #%', p_drop; end if;

  update public.usage_reports set offer_id = p_keep where offer_id = p_drop;
  get diagnostics n_reports = row_count;
  update public.comments set offer_id = p_keep where offer_id = p_drop;
  get diagnostics n_comments = row_count;

  -- 評分、收藏：同一個人兩張都有的，保留「保留那張」上的，併掉那張的刪掉
  delete from public.offer_ratings d where d.offer_id = p_drop
    and exists (select 1 from public.offer_ratings k where k.offer_id = p_keep and k.user_id = d.user_id);
  update public.offer_ratings set offer_id = p_keep where offer_id = p_drop;
  get diagnostics n_ratings = row_count;
  delete from public.wishlist d where d.offer_id = p_drop
    and exists (select 1 from public.wishlist k where k.offer_id = p_keep and k.user_id = d.user_id);
  update public.wishlist set offer_id = p_keep where offer_id = p_drop;
  get diagnostics n_wish = row_count;

  update public.offer_edits set offer_id = p_keep where offer_id = p_drop;
  update public.offer_edit_history set offer_id = p_keep where offer_id = p_drop;
  update public.notifications set offer_id = p_keep where offer_id = p_drop;
  if to_regclass('public.offer_stores') is not null then
    delete from public.offer_stores d where d.offer_id = p_drop
      and exists (select 1 from public.offer_stores k where k.offer_id = p_keep and k.place_id = d.place_id);
    update public.offer_stores set offer_id = p_keep where offer_id = p_drop;
  end if;

  update public.offers
     set status = 'archived',
         review_note = trim(both ' ' from coalesce(review_note, '') || ' 已合併到 #' || p_keep),
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_drop;

  return jsonb_build_object('reports', n_reports, 'comments', n_comments, 'ratings', n_ratings, 'wishlist', n_wish);
end $$;

grant execute on function public.admin_merge_offers(bigint, bigint) to authenticated;
revoke execute on function public.admin_merge_offers(bigint, bigint) from public, anon;

-- ---------------------------------------------------------------------
-- 3. 自己上傳大頭貼
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_read       on storage.objects;
drop policy if exists avatars_insert_own on storage.objects;
drop policy if exists avatars_update_own on storage.objects;
drop policy if exists avatars_delete_own on storage.objects;

create policy avatars_read on storage.objects
  for select using (bucket_id = 'avatars');
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 大頭貼網址只接受：空值、自己資料夾裡的圖、Google 帳號頭像（管理員不受限）
create or replace function public.guard_profile_avatar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.avatar_url is distinct from old.avatar_url
     and new.avatar_url is not null
     and not public.is_admin()
     and new.avatar_url !~ ('^https://[^/]+/storage/v1/object/public/avatars/' || new.id::text || '/')
     and new.avatar_url !~ '^https://[a-z0-9]+\.googleusercontent\.com/'
  then
    raise exception '大頭貼只能用自己上傳的照片或 Google 帳號的頭像' using errcode = '22023';
  end if;
  return new;
end $$;
revoke execute on function public.guard_profile_avatar() from public;

drop trigger if exists profiles_avatar_guard on public.profiles;
create trigger profiles_avatar_guard before update on public.profiles
  for each row execute function public.guard_profile_avatar();
