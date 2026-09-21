-- =====================================================================
-- v72：管理員可以刪除優惠、合併時同一天的重複回報不再卡住
--
--   使用者回饋（嵐）：
--
--   1.「管理員要可以刪除優惠」：原本後台只有「下架」（status='archived'，資料都還在）。
--      重複匯入、測試資料、亂投稿這種東西下架之後還是會佔著編號跟後台清單，
--      所以另外開 admin_delete_offer()，真的把那一筆連同底下的回報／留言／評分／
--      收藏／修改建議／歷史／通知／分店一起刪掉（外鍵本來就是 on delete cascade）。
--      刪掉就救不回來，所以：
--        - 只有管理員能執行
--        - p_confirm 預設 false＝只試算，回傳「會一起刪掉幾筆什麼」，不動資料。
--          後台先用試算把數字寫進確認視窗，管理員再確認一次才真的刪。
--      有別人的使用回報在上面的，建議還是用「下架」或「合併」，不要刪——
--      回報一刪，那些人的「累積省下」跟排行榜名次就會跟著變少。
--
--   2. 合併重複優惠失敗：
--        duplicate key value violates unique constraint "usage_reports_offer_id_user_id_used_on_key"
--      同一個人同一天在兩張卡上都回報過（例如天成飯店集團跟花比麵包坊本來是同一檔），
--      搬過去就撞到「同一人同一天同一筆優惠只能回報一次」。
--      處理方式跟評分／收藏一致：保留「保留那張」上面的那一筆，併掉那張上重複的刪掉，
--      回傳值多一個 dropped_reports 讓後台講清楚有幾筆被合併掉。
--
--   可重複執行。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 管理員刪除優惠（p_confirm=false 只試算）
-- ---------------------------------------------------------------------
create or replace function public.admin_delete_offer(p_offer_id bigint, p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_brand text; v_status text;
  n_reports int; n_comments int; n_ratings int; n_wish int; n_edits int; n_stores int;
begin
  if not public.is_admin() then raise exception '只有管理員可以刪除優惠'; end if;
  select brand, status into v_brand, v_status from public.offers where id = p_offer_id;
  if v_brand is null then raise exception '找不到優惠 #%', p_offer_id; end if;

  select count(*) into n_reports  from public.usage_reports where offer_id = p_offer_id;
  select count(*) into n_comments from public.comments      where offer_id = p_offer_id;
  select count(*) into n_ratings  from public.offer_ratings where offer_id = p_offer_id;
  select count(*) into n_wish     from public.wishlist      where offer_id = p_offer_id;
  select count(*) into n_edits    from public.offer_edits   where offer_id = p_offer_id;
  if to_regclass('public.offer_stores') is not null then
    select count(*) into n_stores from public.offer_stores  where offer_id = p_offer_id;
  else
    n_stores := 0;
  end if;

  -- 真的刪：底下的回報／留言／評分／收藏／修改建議／歷史／通知／分店都是
  -- on delete cascade，刪 offers 這一筆就會一起帶走。
  if p_confirm then
    delete from public.offers where id = p_offer_id;
  end if;

  return jsonb_build_object(
    'deleted', coalesce(p_confirm, false), 'id', p_offer_id, 'brand', v_brand, 'status', v_status,
    'reports', n_reports, 'comments', n_comments, 'ratings', n_ratings,
    'wishlist', n_wish, 'edits', n_edits, 'stores', n_stores);
end $$;

grant execute on function public.admin_delete_offer(bigint, boolean) to authenticated;
revoke execute on function public.admin_delete_offer(bigint, boolean) from public, anon;

-- ---------------------------------------------------------------------
-- 2. 合併重複優惠：同一人同一天的重複回報先拿掉再搬
-- ---------------------------------------------------------------------
create or replace function public.admin_merge_offers(p_keep bigint, p_drop bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n_reports int; n_comments int; n_ratings int; n_wish int; n_dropped int;
begin
  if not public.is_admin() then raise exception '只有管理員可以合併優惠'; end if;
  if p_keep is null or p_drop is null or p_keep = p_drop then raise exception '要選兩張不同的優惠'; end if;
  if not exists (select 1 from public.offers where id = p_keep) then raise exception '找不到要保留的優惠 #%', p_keep; end if;
  if not exists (select 1 from public.offers where id = p_drop) then raise exception '找不到要併掉的優惠 #%', p_drop; end if;

  -- 同一個人同一天兩張都回報過：usage_reports 有 unique(offer_id, user_id, used_on)，
  -- 直接搬會撞鍵。跟評分／收藏一樣保留「保留那張」上面的那一筆。
  delete from public.usage_reports d
   where d.offer_id = p_drop
     and exists (select 1 from public.usage_reports k
                  where k.offer_id = p_keep and k.user_id = d.user_id and k.used_on = d.used_on);
  get diagnostics n_dropped = row_count;

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

  return jsonb_build_object('reports', n_reports, 'comments', n_comments, 'ratings', n_ratings,
                            'wishlist', n_wish, 'dropped_reports', n_dropped);
end $$;

grant execute on function public.admin_merge_offers(bigint, bigint) to authenticated;
revoke execute on function public.admin_merge_offers(bigint, bigint) from public, anon;
