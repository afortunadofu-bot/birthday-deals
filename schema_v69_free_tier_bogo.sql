-- =====================================================================
-- v69：免費層級把「買一送一」從「折扣」拆出來
--
--   使用者回饋：「折扣」跟「買一送一」優惠程度差很多，放在同一類不好找。
--   offers.free_tier 多一個 'bogo'（買一送一），並把目前是 discount、
--   優惠內容寫著「買一送一／買1送1」的優惠搬過去。
--
--   原本的 check constraint 是建表時自動命名的，保險起見：把 offers 上
--   所有跟 free_tier 有關的 check 都拿掉，再加回新的。
--
--   可重複執行。
-- =====================================================================

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.offers'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%free_tier%'
  loop
    execute format('alter table public.offers drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.offers
  add constraint offers_free_tier_check
  check (free_tier in ('free_no_min', 'free_min', 'discount', 'bogo', 'unknown'));

update public.offers
   set free_tier = 'bogo'
 where free_tier = 'discount'
   and offer ~ '買\s*[一1]\s*送\s*[一1]';
