-- =====================================================================
-- v45：優惠加「可轉讓」欄位
--
--   跟會員取得方式（membership_type）是兩件事：本人怎麼拿到券，跟拿到
--   券之後能不能轉手給別人用。App／網路會員發的票券常常只是帳號裡的一組
--   序號或 QR code，兌換時店員只掃碼、不會另外核對是不是本人——這種
--   「免出示證件」的券形同可轉讓，跟需要臨櫃出示身分證/健保卡的優惠是
--   完全不同的使用體驗，值得獨立成一個欄位、可以篩選。
--
--   三態設計（不是布林值）：多數既有優惠目前沒人查證過這件事，預設
--   'unknown'（尚未確認），不要一律當作「否」，避免看起來像是「查過了、
--   確定不能轉讓」。
--
--   offers_public 用 o.* 展開所有欄位，PostgreSQL 的 view 會在「建立當下」
--   把 o.* 展開成固定欄位清單記住，用 alter table add column 加的新欄位
--   不會自動補進舊的 view 定義——這裡沿用 schema_v13 就踩過的做法，drop
--   掉重建，讓 o.* 重新展開才吃得到新欄位。
-- 可重複執行。
-- =====================================================================

alter table public.offers
  add column if not exists transferable text not null default 'unknown'
    check (transferable in ('yes','no','unknown'));

drop view if exists public.offers_public;
create view public.offers_public
with (security_invoker = true) as
select o.*, s.report_count, s.last_used_on, s.success_rate, s.comment_count,
       s.rating_avg, s.rating_count, s.wish_count
from public.offers o
left join public.offer_stats s on s.offer_id = o.id
where o.status = 'approved';

grant select on public.offers_public to anon, authenticated;
