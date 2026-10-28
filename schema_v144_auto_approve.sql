-- =====================================================================
-- v144：自動通過新投稿（管理員的開關，預設關著）
--
-- celine：「管理員可以開啟自動按鈕，可以自動通過修改跟新增的優惠，
--           **打開按鈕才會啟動**」
--
-- ⚠️ **這一支只做「新增的優惠」，修改建議還沒做。** 原因寫在最下面。
--
-- ---------------------------------------------------------------------
-- 為什麼不是「全部自動通過」
-- ---------------------------------------------------------------------
-- 開下去等於沒有人把關。所以**有條件**：只自動通過「已經有投稿被核可過」的人。
--
--   · 老手投的 → 立刻上架，使用者馬上看得到，你也不用點
--   · 新帳號投的 → 照舊進待審佇列
--
-- 一個想亂投的人得先認真投過 MIN_APPROVED 筆才拿得到這個待遇，
-- 那時候他已經是個真的有在貢獻的人了。
--
-- 門檻寫在 auto_approve_offer() 裡（預設 2 筆），想改就改那一行。
-- 可重複執行。
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 開關
--
-- ⚠️ site_settings 有一個 key 白名單的 check。**加新 key 一定要連舊的一起重建**
--    ——2026-10-14 踩過：跑了舊版的 v95（白名單少一個 key），直接噴
--    「site_settings_key_known is violated by some row」。
--    下面這份是 v97 的六個 ＋ auto_approve，一個都不能漏。
-- ---------------------------------------------------------------------
alter table public.site_settings drop constraint if exists site_settings_key_known;
alter table public.site_settings add constraint site_settings_key_known
  check (key in (
    'show_studio_footer',      -- 頁尾「小數據所」整塊
    'show_studio_brandpage',   -- 上面那塊裡，連回品牌頁的連結
    'show_studio_bandary',     -- Bandary 封測報名連結
    'show_studio_relatestats', -- RelateStats 封測報名連結
    'show_coffee',             -- 「請我喝杯咖啡」按鈕
    'show_dev_intro',          -- v97：「我的」頁面底部的開發者介紹區塊
    'auto_approve'             -- v144：老手的新投稿自動上架
  ));

-- 預設**關著**。要開是在審核頁按下去，不是跑這支 SQL 就生效。
insert into public.site_settings (key, enabled)
values ('auto_approve', false)
on conflict (key) do nothing;


-- ---------------------------------------------------------------------
-- 2. 標記：哪幾筆是自動上架的
--
-- 一定要留痕跡。沒有這一欄的話，自動通過的東西就混在幾百筆已核可裡面，
-- 出事了你連「要檢查哪幾筆」都不知道。
-- ---------------------------------------------------------------------
alter table public.offers add column if not exists auto_approved boolean not null default false;
create index if not exists offers_auto_approved_idx
  on public.offers(auto_approved, reviewed_at desc) where auto_approved;


-- ---------------------------------------------------------------------
-- 3. Trigger
--
-- 為什麼是 AFTER INSERT 而不是 BEFORE：
--   offers 的 insert 政策寫著 `with check (… and status = 'pending')`，
--   而 RLS 的 WITH CHECK 是在 BEFORE trigger 跑完之後、對「最後要存進去的那一列」
--   做檢查。所以 BEFORE trigger 把 status 改成 approved 會**被自己的政策擋下來**。
--   AFTER trigger 裡的 update 由這支 security definer 函式執行，不受投稿者的
--   RLS 限制，才過得去。
-- ---------------------------------------------------------------------
create or replace function public.auto_approve_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 要先有幾筆被核可過，才享有自動上架。想調就調這一行。
  MIN_APPROVED constant integer := 2;
  v_on         boolean;
  v_approved   integer;
begin
  -- 只管民眾自己投的待審件。管理員直接建的、或匯入的不碰。
  if new.status is distinct from 'pending' or new.submitted_by is null then
    return null;
  end if;

  select enabled into v_on from public.site_settings where key = 'auto_approve';
  if not coalesce(v_on, false) then return null; end if;

  -- 被停權的人不管投幾筆都照舊進佇列
  if exists (select 1 from public.profiles p
              where p.id = new.submitted_by and coalesce(p.is_banned, false)) then
    return null;
  end if;

  select count(*) into v_approved
    from public.offers o
   where o.submitted_by = new.submitted_by
     and o.status = 'approved'
     and o.id <> new.id;
  if v_approved < MIN_APPROVED then return null; end if;

  update public.offers
     set status        = 'approved',
         auto_approved = true,
         reviewed_at   = now(),
         review_note   = '自動上架（投稿者已有 ' || v_approved || ' 筆被核可）'
   where id = new.id;

  return null;
end $$;

revoke execute on function public.auto_approve_offer() from public, anon, authenticated;

drop trigger if exists offers_auto_approve on public.offers;
create trigger offers_auto_approve
  after insert on public.offers
  for each row execute function public.auto_approve_offer();


-- ---------------------------------------------------------------------
-- 4. 自動上架了哪些（審核頁要用）
--
-- 「留痕跡」的另一半：看得到、而且退得回去。
-- 退回就是照原本的路 review_offer(id, 'rejected', …)，不用新東西。
-- ---------------------------------------------------------------------
create or replace function public.admin_auto_approved(p_days integer default 14)
returns table (id bigint, brand text, offer text, submitter text, reviewed_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '只有管理員可以看';
  end if;
  return query
  select o.id, o.brand, left(o.offer, 80), coalesce(p.display_name, '匿名'), o.reviewed_at
    from public.offers o
    left join public.profiles p on p.id = o.submitted_by
   where o.auto_approved
     and o.reviewed_at > now() - make_interval(days => p_days)
   order by o.reviewed_at desc;
end $$;

revoke execute on function public.admin_auto_approved(integer) from public, anon;
grant  execute on function public.admin_auto_approved(integer) to authenticated;


-- ---------------------------------------------------------------------
-- 跑完確認
-- ---------------------------------------------------------------------
-- 開關在不在（enabled 應該是 false）
select key, enabled from public.site_settings order by key;

-- 現在有幾個人「已經有 2 筆以上被核可」——也就是開了之後誰會享有自動上架
select coalesce(p.display_name, '匿名') as 投稿者, count(*) as 已核可筆數
  from public.offers o
  join public.profiles p on p.id = o.submitted_by
 where o.status = 'approved'
 group by 1
having count(*) >= 2
 order by 2 desc;

-- 自動上架過哪些（現在應該是空的）
-- select * from public.admin_auto_approved(14);


-- =====================================================================
-- 還沒做：修改建議的自動通過
--
-- 新投稿的「通過」只是把 status 改成 approved，trigger 裡做就好。
-- **修改建議不是** —— 通過的意思是「把 patch 套到 offers 上」，而那段邏輯在
-- review_offer_edit() 裡，六十行、三十幾個欄位的 coalesce。
--
-- 從 trigger 直接呼叫它行不通：它第一行是 `if not is_admin()`，而 trigger 是
-- 投稿者的交易在跑，auth.uid() 是投稿者不是管理員。
--
-- 正確的做法是把它拆成「核心邏輯」跟「管理員入口」兩支，trigger 走核心那支。
-- 那是一個會動到現有審核流程的改動，**值得單獨一版、單獨測**，不要跟這支混在
-- 一起——這支壞掉最多是投稿沒自動上架，那支壞掉是審核流程停擺。
-- =====================================================================
