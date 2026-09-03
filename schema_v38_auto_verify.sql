-- =====================================================================
-- v38：使用回報「成功」時自動標記已查證，不用管理員手動點。
--   跟既有的 setVerified()／bulkVerifyOffers() 一樣的邏輯：同一個品牌
--   （同店可能有多筆優惠，例如不同分店/不同期間）只要有一筆被查證，
--   同品牌已上架（status='approved'）的優惠就一起標記，省得每筆分開點。
--   用 trigger 而不是前端呼叫：不管是投稿新回報還是把舊回報從
--   failed/partial 改成 success，資料庫這邊都會自動處理，不怕漏掉
--   某個前端路徑忘記呼叫。security definer 可以繞過 RLS 直接改
--   offers.verified（一般使用者本來就不能自己改這個欄位）。
-- 可重複執行。
-- =====================================================================

create or replace function public.auto_verify_on_success_report()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_brand text;
begin
  if NEW.result = 'success' then
    select brand into v_brand from public.offers where id = NEW.offer_id;
    if v_brand is not null then
      update public.offers
        set verified = true, last_checked = now()
        where brand = v_brand and status = 'approved' and verified = false;
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists usage_reports_auto_verify on public.usage_reports;
create trigger usage_reports_auto_verify
  after insert or update of result on public.usage_reports
  for each row execute function public.auto_verify_on_success_report();
