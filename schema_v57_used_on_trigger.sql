-- =====================================================================
-- v57：使用回報日期範圍檢查，從 CHECK constraint 改成 trigger
--
-- 為什麼要改：
-- 重新加 usage_reports_used_on_check 時報
--   ERROR 23514: check constraint "usage_reports_used_on_check" of relation
--   "usage_reports" is violated by some row
-- 根因是這個 CHECK 裡用了 now()／current_date——「是否在一年內」是會隨時間
-- 改變的條件。CHECK 在 add constraint 當下會拿「今天」去驗全表每一列：
-- 網站上線初期允許回報「最多 365 天前」的日期，那些列當時合法，但過了一段
-- 時間之後就變成超過 366 天，整個 add constraint 直接失敗。而且就算這次用
-- NOT VALID 跳過舊資料，之後使用者去「編輯」一筆舊回報（只改備註也一樣）
-- 時，UPDATE 會重新驗整列，一樣會被擋下來，變成舊回報永遠改不了。
--
-- 做法：拿掉 CHECK，改成 BEFORE INSERT OR UPDATE trigger，而且只在
-- 「新增」或「used_on 真的有被改」的時候才檢查日期範圍：
--   - 新回報、或把日期改成別天：照舊擋「未來日期」跟「超過一年前」
--   - 只改備註／金額／結果等其他欄位：不檢查日期，舊回報照常能編輯
-- 範圍維持原本那版的定義：台北時間今天 +1 天（吸收時區誤差）～ 366 天前。
--
-- 可重複執行。
-- =====================================================================

alter table public.usage_reports
  drop constraint if exists usage_reports_used_on_check;

create or replace function public.usage_reports_check_used_on()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Taipei')::date;
begin
  if tg_op = 'INSERT' or new.used_on is distinct from old.used_on then
    if new.used_on > v_today + 1 then
      raise exception '使用日期不能是未來的日期（%）', new.used_on
        using errcode = '23514';
    end if;
    if new.used_on < v_today - 366 then
      raise exception '使用日期不能早於一年前（%）', new.used_on
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists usage_reports_check_used_on on public.usage_reports;
create trigger usage_reports_check_used_on
  before insert or update on public.usage_reports
  for each row execute function public.usage_reports_check_used_on();

-- 想看是哪幾筆舊資料擋住原本的 CHECK（只是查看，不會改資料）：
-- select id, user_id, offer_id, used_on, created_at
-- from public.usage_reports
-- where used_on < (now() at time zone 'Asia/Taipei')::date - 366
--    or used_on > (now() at time zone 'Asia/Taipei')::date + 1
-- order by used_on;
