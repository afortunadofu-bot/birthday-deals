-- =====================================================================
-- v18：生日存到個人資料 + 管理員可看會員生日月份分布
-- 可重複執行。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 生日從「篩選」搬到「我的」分頁，存成個人資料，不用每次都重選。
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists birth_month int check (birth_month is null or birth_month between 1 and 12),
  add column if not exists birth_day   int check (birth_day   is null or birth_day   between 1 and 31);

-- ---------------------------------------------------------------------
-- 2) 管理員看會員生日落在哪個月份（方便抓哪個月要準備比較多優惠）。
--    只回傳「月份 → 人數」的彙總，不會讓管理員看到個別會員的完整生日。
-- ---------------------------------------------------------------------
create or replace function public.admin_birthday_distribution()
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception '只有管理員可以看這個'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('month', m, 'count', c) order by m), '[]'::jsonb)
  into result
  from (
    select bm.m, count(p.id) as c
    from generate_series(1,12) as bm(m)
    left join public.profiles p on p.birth_month = bm.m and p.is_banned = false
    group by bm.m
  ) x;
  return result;
end $$;

grant execute on function public.admin_birthday_distribution() to authenticated;
