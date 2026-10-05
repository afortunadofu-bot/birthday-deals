-- =====================================================================
-- v78：止血——不要每開一次網頁就把 site_events 整張表掃兩遍
--
--   Supabase 寄信說「Disk IO Budget 快用完，執行個體可能沒有回應」，同一天
--   Threads 上有人回報「點 Google 登入一直跳」，截圖是 supabase.co 的
--   522 Connection timed out。查的時候我直接打 REST API，也是 522、等了 20 秒
--   沒回應——資料庫真的被拖垮了，不是前端的問題。
--
--   root cause 在 site_stats 這個 view（schema_v17_misc.sql）：
--
--     (select count(*) from site_events where event_type = 'pageview')
--     (select count(distinct session_id) from site_events where event_type='pageview')
--
--   而前端「每一次開啟網頁」都會 select * from site_stats（優惠頁的兩顆小藥丸），
--   排行榜分頁再打一次。所以：
--
--     每一次造訪 → 新增一列 site_events，再把整張 site_events 掃過
--
--   造訪數 N 越大，每一次造訪要讀的資料就越多，總 IO 是 O(N²)。平常沒事，
--   Threads 一推、人一多就直接把 Disk IO 預算燒光。現有的索引是
--   (event_type, created_at)，沒有 session_id，所以 count(distinct session_id)
--   還得回原表撈每一列，是真正在吃磁碟的那一段。
--
--   這一版兩件事：
--     1. 加一支涵蓋 session_id 的部分索引 → 兩個計數都能只讀索引
--     2. 把結果快取 10 分鐘 → 一小時最多重算 6 次，不再跟造訪數綁在一起
--
--   可重複執行。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 部分索引：只索引 pageview 這一種事件的 session_id
--    count(*) 與 count(distinct session_id) 都變成 index only scan，
--    不用再回去讀 site_events 的每一列。
--    用 concurrently 會更溫和，但 Supabase SQL Editor 是包在交易裡跑的、
--    不支援 concurrently；這張表的 create index 很快，直接建即可。
-- ---------------------------------------------------------------------
create index if not exists site_events_pageview_session_idx
  on public.site_events (session_id)
  where event_type = 'pageview';

-- ---------------------------------------------------------------------
-- 2. 站台數據快取
--    只有一列（id = 1）。不開任何 RLS policy——這張表只給下面那支
--    security definer 函式用，前端永遠碰不到它本身。
-- ---------------------------------------------------------------------
create table if not exists public.site_stats_cache(
  id          smallint primary key default 1 check (id = 1),
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table public.site_stats_cache enable row level security;

-- 快取版的站台數據。前端改成呼叫這一支，不再直接查 site_stats。
--   - 10 分鐘內有算過就直接回快取，不碰 site_events
--   - 過期了才重算，而且用 advisory lock 擋住「同時好幾個人進來、
--     大家一起重算」的情況：搶不到鎖的直接拿舊的回去（舊 10 分鐘的
--     數字不影響任何判斷，拖垮資料庫才影響）
--   - 不收參數：收了就等於開放任何人指定「我要最新的」，一行迴圈就能
--     逼資料庫一直重算，等於沒有快取
create or replace function public.site_stats_cached()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_cached   jsonb;
  v_age      interval;
  v_fresh    jsonb;
begin
  select data, now() - updated_at into v_cached, v_age
    from public.site_stats_cache where id = 1;

  if v_cached is not null and v_age < interval '10 minutes' then
    return v_cached;
  end if;

  -- 已經有人在重算了就不要跟著重算一次，拿現有的（可能有點舊）回去
  if not pg_try_advisory_xact_lock(hashtext('site_stats_cached')) then
    return coalesce(v_cached, '{}'::jsonb);
  end if;

  select to_jsonb(s) into v_fresh from public.site_stats s;

  insert into public.site_stats_cache(id, data, updated_at)
       values (1, v_fresh, now())
  on conflict (id) do update
       set data = excluded.data, updated_at = excluded.updated_at;

  return v_fresh;
end;
$$;

revoke execute on function public.site_stats_cached() from public;
grant execute on function public.site_stats_cached() to anon, authenticated;

-- 先算一次，第一個進來的人就不用等
select public.site_stats_cached();

-- ---------------------------------------------------------------------
-- 3. 順手：清掉半年前的原始事件
--    site_events 的原始列只有管理員儀表板在用，而儀表板最多看 180 天。
--    留著只會讓上面那支重算越來越慢、備份越來越大。
--
--    注意：pageview_count／visitor_count 是「全部時間」的累計，刪掉舊事件
--    這兩個數字會跟著變小。所以這一段預設是註解掉的——真的覺得資料庫太
--    肥再自己決定要不要跑，跑之前先把現在的數字記下來。
-- ---------------------------------------------------------------------
-- delete from public.site_events where created_at < now() - interval '180 days';
