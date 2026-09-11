-- v56：offer_edits_pending_preview 補齊 #228 之後才有的欄位，
--       並讓優惠詳細頁能顯示「這筆優惠目前有沒有待審的修改建議」
-- ---------------------------------------------------------------------
-- celine 回饋：店家如果有人新增修改建議，要能夠在詳細頁面看得到。
-- 查現況發現：目前修改建議待審清單只有兩個地方看得到——1) 管理員審核
-- 區塊 2) 登入後首頁的「待審投稿/修改建議」全站預覽區（offer_edits_
-- pending_preview 這張 view）。但優惠自己的詳情彈窗完全沒有顯示「這筆
-- 優惠現在有沒有待審的修改建議」，使用者點進某家店的詳情，看不出來
-- 已經有人提過同樣的建議，可能會重複提交。這支在詳情彈窗補上一個區塊，
-- 直接查這張 view（改成過濾 offer_id）就好，不用另開新 view。
--
-- 順便補一個 #228 遺留的缺口：offer_edits_pending_preview 的 current_*
-- 欄位是 schema_v44 當初訂的舊 8 欄位版本（current_offer/conditions/
-- membership/timing/advance_days/value_twd/valid_until），#228 把
-- OFFER_DIFF_FIELDS 從 8 個擴充到 16 個（多了 category/membership_type/
-- free_tier/valid_from/requires_companion/transferable/regions/sources）
-- 之後沒有跟著補這張 view，導致這幾個欄位被建議修改時，「改前內容」在
-- 預覽區顯示不出來（只會看到「改前內容未提供預覽」）——這次牛排店的
-- 案例剛好就是改 category/regions，正好補上。
--
-- 可重複執行。
--
-- 注意：這裡是 drop + create，不是 create or replace——Postgres 的
-- create or replace view 只允許「在既有欄位後面 append 新欄位」，既有
-- 欄位的名稱／型別／順序都不能動。這次補的 current_membership_type／
-- current_free_tier／current_valid_from 是照 offers 本身的欄位邏輯插在
-- 中間（這樣讀起來才跟資料表對得起來），第 5 個位置從 current_timing
-- 變成 current_membership_type，直接 replace 會被擋下來報
-- 「42P16: cannot change name of view column ...」。這張 view 沒有其他
-- 物件依賴（只有前端直接查），drop 再建是安全的。
-- ---------------------------------------------------------------------

drop view if exists public.offer_edits_pending_preview;

create view public.offer_edits_pending_preview
with (security_invoker = true) as
select e.id, e.offer_id, e.patch, e.reason, e.source_url, e.created_at,
       o.brand,
       o.offer              as current_offer,
       o.conditions         as current_conditions,
       o.membership         as current_membership,
       o.membership_type    as current_membership_type,
       o.free_tier          as current_free_tier,
       o.timing             as current_timing,
       o.advance_days       as current_advance_days,
       o.value_twd          as current_value_twd,
       o.valid_from         as current_valid_from,
       o.valid_until        as current_valid_until,
       o.category           as current_category,
       o.requires_companion as current_requires_companion,
       o.transferable       as current_transferable,
       o.regions            as current_regions,
       o.sources            as current_sources,
       p.display_name as proposed_by_name
from public.offer_edits e
join public.offers o on o.id = e.offer_id
left join public.profiles_public p on p.id = e.proposed_by
where e.status = 'pending';

grant select on public.offer_edits_pending_preview to authenticated;
