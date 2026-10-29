-- =====================================================================
-- v153：讓「一趟用最多」真的生得出地點，而且使用者可以推薦
--
-- celine：
--   「一趟最多目前沒顯示 也沒投稿」
--   「館名都核對過了」「這個區塊也要能投稿」
--
-- ---------------------------------------------------------------------
-- 為什麼那一區是空的
-- ---------------------------------------------------------------------
-- 公開的一筆都沒有（anon 讀 venues_public 回 []）。至於「不公開的有沒有」，
-- 從外面查不到——RLS 只讓管理員看到不公開的。但有一件事是確定的：
--
-- v142 建了表、建了 `admin_venue_candidates()`（把分店座標切格子、數每格
-- 裡有幾個不同的優惠），但當初規劃裡寫的四塊：
--
--     資料庫 ✓ / 審核頁 ✗ / 前端清單 ✓ / 一鍵收藏 ✓
--
-- **「審核頁：系統列出熱點草稿，你改名／確認／隱藏」那一塊從來沒做**，
-- 所以除非在 SQL Editor 手動 insert，沒有任何一條路可以把熱點變成 venues
-- 的一列。v153 補上那一塊；如果你之前手動建過，它們會出現在那一塊的
-- 「已經建好的」裡（管理員讀得到不公開的），公開開關一按就上架。
--
-- ---------------------------------------------------------------------
-- 寫入權限：明確寫出來
-- ---------------------------------------------------------------------
-- v142 只寫了 `grant select`。Supabase 預設的 default privileges 通常已經把
-- 新表的 insert/update/delete 給了 authenticated，所以**多半本來就寫得進去**
-- ——但這個專案其他表的權限都有明確寫，這一張不該靠預設值。下面那兩行
-- 在預設值已經給了的情況下什麼都不會改變，可以放心跑。
--
-- 給 authenticated 的 insert/update/delete 不會讓一般使用者寫得進去：
-- RLS 那一層只有 `venues_admin`（`public.is_admin()`）提供寫入路徑，
-- 一般使用者連 WITH CHECK 都過不了。
--
-- 可重複執行。
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. venues 的寫入權限（明確寫出來；RLS 仍然只放行管理員）
-- ---------------------------------------------------------------------
grant insert, update, delete on public.venues to authenticated;
grant usage, select on sequence public.venues_id_seq to authenticated;


-- ---------------------------------------------------------------------
-- 2. 使用者推薦一個地點
--
-- 為什麼不是直接寫進 venues：venues 要的是**座標**（lat／lng／radius_m），
-- 那不是表單填得出來的東西。使用者知道的是「新光三越南西店」這個名字，
-- 座標要靠 admin_venue_candidates() 那份熱點清單去對。
--
-- 所以推薦是一張待審的清單，管理員對到熱點之後再按「建立」。
-- 形狀照 site_feedback 那一套，不另外發明寫法。
-- ---------------------------------------------------------------------
create table if not exists public.venue_suggestions (
  id          bigserial primary key,
  name        text not null check (char_length(name) between 2 and 40),
  county      text,
  note        text check (note is null or char_length(note) <= 300),
  status      text not null default 'pending'
              check (status in ('pending','accepted','rejected')),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz
);
create index if not exists venue_suggestions_queue_idx
  on public.venue_suggestions(status, created_at desc);
create index if not exists venue_suggestions_mine_idx
  on public.venue_suggestions(user_id, created_at desc);

alter table public.venue_suggestions enable row level security;

drop policy if exists venue_suggestions_read   on public.venue_suggestions;
drop policy if exists venue_suggestions_insert on public.venue_suggestions;
drop policy if exists venue_suggestions_admin  on public.venue_suggestions;

-- 自己送的自己看得到（「我送出過的」那一塊要列），其餘只有管理員
create policy venue_suggestions_read on public.venue_suggestions
  for select using (user_id = auth.uid() or public.is_admin());
-- 只能用自己的身分送，而且只能送成待審；被停權的人送不出去
create policy venue_suggestions_insert on public.venue_suggestions
  for insert with check (user_id = auth.uid() and not public.is_banned()
                         and status = 'pending');
create policy venue_suggestions_admin on public.venue_suggestions
  for update using (public.is_admin()) with check (public.is_admin());

grant select, insert, update on public.venue_suggestions to authenticated;
grant usage, select on sequence public.venue_suggestions_id_seq to authenticated;

-- 一天 5 個。offers 的投稿是一天 10 筆，推薦地點比投稿輕但也比較容易亂按，
-- 抓一半。擋在 trigger 不是前端——前端的限制任何人都繞得過去。
create or replace function public.venue_suggestions_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.venue_suggestions
       where user_id = new.user_id
         and created_at > now() - interval '1 day') >= 5 then
    raise exception '一天最多推薦 5 個地點，明天再來';
  end if;
  return new;
end;
$$;

drop trigger if exists venue_suggestions_rate on public.venue_suggestions;
create trigger venue_suggestions_rate
  before insert on public.venue_suggestions
  for each row execute function public.venue_suggestions_rate_limit();


-- ---------------------------------------------------------------------
-- 3. 待審的推薦有幾個（審核分頁的紅點用）
-- ---------------------------------------------------------------------
create or replace function public.admin_venue_suggestion_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin()
         then (select count(*)::int from public.venue_suggestions where status = 'pending')
         else 0 end;
$$;

revoke execute on function public.admin_venue_suggestion_count() from public, anon;
grant execute on function public.admin_venue_suggestion_count() to authenticated;


-- ---------------------------------------------------------------------
-- 跑完之後
-- ---------------------------------------------------------------------
-- 到「審核」分頁最上面那塊「一趟用最多：地點」。
-- 系統會列出 95 個熱點（8 家優惠以上的格子），每一個都先填好猜到的名字，
-- 你改完按「建立並公開」就會出現在「排行程」那一頁。
--
-- 名字猜不到的那 33 個留著空白——那多半是「車站周邊」「某條街」這種
-- 沒有單一場館名的地方，要自己取。不想要的直接跳過，不建立就是了。
