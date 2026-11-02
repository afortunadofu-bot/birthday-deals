-- v164：大家實際花多少、修改建議也算白名單、待辦清單的已註冊／已收到券、一句回饋
-- ---------------------------------------------------------------------
-- 四段，彼此不相依，不用先跑別支（v144 自動上架那支跑過的話第 2 段才有作用）。
-- 可重複執行。
-- ---------------------------------------------------------------------


-- 1. 每一筆優惠「大家實際花多少」-------------------------------------------
-- 嵐：「統計花費金額／人數，讓其他人有個概念這家會花多少」「進到篩選」。
--
-- 詳情視窗本來自己算（只撈最近 30 筆回報），篩選跟卡片需要每一筆都有，所以彙總成一支。
-- usage_reports 本來就是公開讀得到的（詳情視窗用 anon 在讀），這裡只是幫忙加總，
-- 所以用 security invoker（預設）——權限跟直接讀那張表一樣，不多開任何東西。
-- 只回數字，不回是誰花的。失敗的回報不算（沒領到的花費不代表領優惠要花多少）。

create or replace function public.offer_spend_summary(p_min integer default 3)
returns table(offer_id bigint, n integer, avg_spent integer, min_spent integer, max_spent integer)
language sql
stable
set search_path = public
as $$
  select r.offer_id,
         count(*)::int,
         round(avg(r.spent_twd))::int,
         min(r.spent_twd)::int,
         max(r.spent_twd)::int
    from public.usage_reports r
    join public.offers o on o.id = r.offer_id and o.status = 'approved'
   where r.spent_twd is not null
     and r.result <> 'failed'
   group by r.offer_id
  having count(*) >= greatest(coalesce(p_min, 3), 1)
$$;

comment on function public.offer_spend_summary(integer) is
  '每筆上架優惠的「大家實際花多少」：回報筆數、平均、最少、最多。只回彙總。';
grant execute on function public.offer_spend_summary(integer) to anon, authenticated;


-- 2. 修改建議被核可過，也算進「老手自動上架」的門檻 ---------------------------
-- 嵐：「修改待審有通過也可以當白名單」。
--
-- v162 讓修改建議自動套用時，門檻已經是「投稿＋修改建議被核可的加起來 ≥ 2」，
-- 可是 v144 管「新投稿自動上架」的這一支還是只數投稿——同一個人，改了三筆被核可，
-- 新投稿照樣進待審。這裡改成跟 v162 一樣的算法。其他（開關、停權、留痕跡）照舊。
-- 被管理員退回的自動套用（admin_revert_auto_edit 會改成 rejected）不算。

create or replace function public.auto_approve_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  MIN_APPROVED constant integer := 2;     -- 跟 v144／v162 同一個門檻
  v_on         boolean;
  v_offers     integer;
  v_edits      integer;
begin
  if new.status is distinct from 'pending' or new.submitted_by is null then
    return null;
  end if;

  select enabled into v_on from public.site_settings where key = 'auto_approve';
  if not coalesce(v_on, false) then return null; end if;

  if exists (select 1 from public.profiles p
              where p.id = new.submitted_by and coalesce(p.is_banned, false)) then
    return null;
  end if;

  select count(*) into v_offers
    from public.offers o
   where o.submitted_by = new.submitted_by
     and o.status = 'approved'
     and o.id <> new.id;
  select count(*) into v_edits
    from public.offer_edits x
   where x.proposed_by = new.submitted_by
     and x.status = 'approved';
  if v_offers + v_edits < MIN_APPROVED then return null; end if;

  update public.offers
     set status        = 'approved',
         auto_approved = true,
         reviewed_at   = now(),
         review_note   = '自動上架（投稿者已有 ' || v_offers || ' 筆投稿、'
                         || v_edits || ' 筆修改建議被核可）'
   where id = new.id;

  return null;
end $$;

revoke execute on function public.auto_approve_offer() from public, anon, authenticated;
-- trigger 本身 v144 建過了，函式換掉就生效；保險起見再建一次（可重複執行）
drop trigger if exists offers_auto_approve on public.offers;
create trigger offers_auto_approve
  after insert on public.offers
  for each row execute function public.auto_approve_offer();


-- 3. 待辦清單：已註冊會員／已收到優惠券 -------------------------------------
-- Lena：「建議可以多一個欄位，勾選已註冊會員提醒自己有加入會員，也可以多一個欄位是
-- 勾選已收到優惠券」。跟備註、標籤一樣記在自己那一列，誰能改照舊靠 wishlist_own
-- （只有本人），不用新的權限。

alter table public.wishlist add column if not exists registered boolean not null default false;
alter table public.wishlist add column if not exists got_coupon boolean not null default false;


-- 4. 「回報網站問題」多一種類型：一句回饋 ------------------------------------
-- 嵐：「希望使用多次的人可以跳一個，給這個 app 一句回饋的地方」。
-- 回報用過 5 次以上的人會跳一張小卡片，寫的東西送進同一張表，類型 'praise'，
-- 審核那邊「問題回報」清單裡看得到（標「💬 一句回饋」）。
-- 每台裝置一小時最多 5 筆的限制（v74）照舊適用。

alter table public.site_feedback drop constraint if exists site_feedback_type_check;
alter table public.site_feedback
  add constraint site_feedback_type_check
  check (type in ('bug', 'suggestion', 'duplicate', 'praise'));


-- 【檢查】跑完貼這兩行：
-- select count(*) as 有花費統計的優惠 from public.offer_spend_summary(3);
-- select column_name from information_schema.columns where table_name = 'wishlist' and column_name in ('registered','got_coupon');
