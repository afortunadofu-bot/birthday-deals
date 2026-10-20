-- =====================================================================
-- v130：防「再出一次事故」——查詢有時間上限，而且事前量得到成本
--
-- celine：「先做預防這幾個的」（SUPABASE-流量.md →「以後怎樣才會爆掉」第 1 條）
--
-- 2026-10-02～10-04 那次：site_stats 每次開網頁就掃全表、offer_stats 每筆優惠
-- 各跑四支子查詢 → Disk IO 燒光 → 資料庫回 522 → Log Ingestion 一天 830 MB
-- （平常 70～110 MB）。10/05 的 f3d8e27 止血，隔天就掉回來。
--
-- 那次之所以變成「事故」而不是「有點慢」，是因為沒有任何東西擋著：一支爛查詢
-- 可以跑到天荒地老，而且要等到用量爆掉才會發現。這一支補兩件事：
--
--   1. 查詢有時間上限 —— 爛查詢會被砍掉，不會把 IO 拖垮
--   2. admin_query_cost() —— 加新的 view／RPC 之後，當場量得出來它多貴
--
-- 沒有改任何資料、沒有改任何權限面。可重複執行。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 跑之前先看現在是多少（跑完再看一次，才知道自己改了什麼）
-- ---------------------------------------------------------------------
select rolname, rolconfig
  from pg_roles
 where rolname in ('anon', 'authenticated', 'authenticator');

-- ---------------------------------------------------------------------
-- 1. 查詢時間上限
--
-- anon（沒登入的訪客）做的事全部都是「讀一包已經算好的東西」，正常都在
-- 一秒內。給 8 秒已經非常寬鬆——跑超過 8 秒的，一定是出事了。
--
-- authenticated 放寬到 20 秒：管理員那邊有幾塊是真的在算東西（洞察分析、
-- 已核可清單）。如果之後真的有一支正常但很慢的管理員查詢被砍掉，把這個
-- 數字調大就好，不要把它拿掉。
--
-- 這兩行對已經連著的連線不會馬上生效，下一次連線才會。
-- ---------------------------------------------------------------------
alter role anon          set statement_timeout = '8s';
alter role authenticated set statement_timeout = '20s';

-- ---------------------------------------------------------------------
-- 2. admin_query_cost()：公開那幾份東西，現在各自多貴
--
-- 回傳每一份的實際執行時間、讀了幾個 8KB 區塊、有沒有出現 Seq Scan
-- （整張表從頭掃到尾）、回了幾列。
--
-- 怎麼用：**加了新的 view 或 RPC 之後跑一次**，把它加進下面的清單裡。
--   ms > 500        → 它已經在拖慢所有人，要處理
--   seq_scan = true 且 rows_out 很大 → 缺索引，資料再長就會變成上面那次事故
--   blocks 很大     → 就算快，也是在燒 Disk IO（免費方案最早爆的就是這個）
--
-- 只有管理員能跑。explain analyze 會真的執行一次，但全部都是唯讀的查詢。
-- ---------------------------------------------------------------------
create or replace function public.admin_query_cost()
returns table (
  name     text,
  ms       numeric,
  blocks   bigint,
  seq_scan boolean,
  rows_out bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  q    record;
  plan jsonb;
begin
  if not public.is_admin() then
    raise exception '只有管理員可以跑';
  end if;

  for q in
    select * from (values
      -- 走 Worker 的（有快取擋著，但快取過期還是要真的跑一次）
      ('offers_public',             'select * from public.offers_public'),
      ('leaderboard',               'select * from public.leaderboard'),
      ('popular_offers',            'select * from public.popular_offers limit 50'),
      ('most_wished',               'select * from public.most_wished limit 15'),
      ('recent_activity',           'select * from public.recent_activity limit 20'),
      ('contribution_leaderboard',  'select * from public.contribution_leaderboard'),
      ('current_announcement',      'select * from public.current_announcement limit 1'),
      -- 前端直接打的（沒有快取擋著，這幾份最危險）
      ('site_stats',                'select * from public.site_stats'),
      ('offer_stats',               'select * from public.offer_stats'),
      ('wishlist_counts',           'select * from public.wishlist_counts'),
      ('offer_store_coverage',      'select * from public.offer_store_coverage')
    ) as t(name, sql)
  loop
    begin
      execute 'explain (analyze, buffers, format json) ' || q.sql into plan;

      name     := q.name;
      ms       := round((plan -> 0 ->> 'Execution Time')::numeric, 1);
      blocks   := coalesce((plan -> 0 -> 'Plan' ->> 'Shared Hit Blocks')::bigint, 0)
                + coalesce((plan -> 0 -> 'Plan' ->> 'Shared Read Blocks')::bigint, 0);
      seq_scan := plan::text like '%Seq Scan%';
      rows_out := coalesce((plan -> 0 -> 'Plan' ->> 'Actual Rows')::bigint, 0);
      return next;
    exception when others then
      -- 某一份不存在（還沒跑那支 SQL）就跳過，不要讓整份報告掛掉
      name := q.name; ms := null; blocks := null; seq_scan := null; rows_out := null;
      return next;
    end;
  end loop;
end;
$$;

revoke execute on function public.admin_query_cost() from public, anon;
grant  execute on function public.admin_query_cost() to authenticated;

-- ---------------------------------------------------------------------
-- 跑完確認
-- ---------------------------------------------------------------------
select rolname, rolconfig
  from pg_roles
 where rolname in ('anon', 'authenticated');

-- 這一行要用管理員帳號跑（SQL Editor 是 service_role，is_admin() 會是 false，
-- 所以在 SQL Editor 裡會看到「只有管理員可以跑」——那是對的，不是壞了。
-- 要看結果的話在網站上用管理員身分呼叫，或暫時把上面那個 if 註解掉跑一次。）
-- select * from public.admin_query_cost() order by ms desc nulls last;
