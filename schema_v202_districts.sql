-- =====================================================================
-- v202：選了縣市之後，可以再選行政區
--
-- 問卷（2026-11-18）：「希望加入近哪個捷運站、哪一區（ex 士林區、信義區等等）做搜尋，
-- 不然光找台北市很難分辨。」台北市一選就是 382 筆。
--
-- 行政區不用另外填：offer_stores 每一家分店都有 Google 地圖的地址
-- （例如「114臺北市內湖區港華里環山路二段48-1號」），從地址抓出「內湖區」就好。
-- 2026-11-19 用 9779 家分店測過：96% 抓得到；抓不到的多半是簡體字地址或英文順序，
-- 這裡兩種都有處理。
--
-- 前端只在使用者選了「一個」縣市時，才問那個縣市的資料（台北市約幾 KB），
-- 同一台裝置記一天。
--
-- 只新增兩支函式，不動任何資料表。可重複執行。
-- 沒跑的話：篩選面板不會出現「行政區」那一列，其他照舊。
-- =====================================================================

-- 從地址抓行政區。p_county 是 offer_stores.county（已經是「台北市」這種寫法）。
--   114臺北市內湖區港華里…            → 內湖區
--   台中市西區市府路…                 → 西區（一個字的區先比，不會變成「西區市」）
--   桃園市平鎮區… / 台南市新市區…      → 平鎮區 / 新市區（先比兩個字，不會變成「平鎮」）
--   嘉義縣阿里山鄉…                   → 阿里山鄉
--   112台北市北投区…（簡體）           → 北投區
--   1樓, No. 57號木柵路三段木柵里文山區臺北市116（英文順序）→ 文山區
create or replace function public.tw_district(p_addr text, p_county text)
returns text
language plpgsql
immutable
as $$
declare
  a text; rest text; d text; i int;
begin
  if p_addr is null or p_county is null or p_county = '' then return null; end if;
  -- 臺→台，加上 Google 偶爾回的簡體字（只收台灣地名會用到的字；「后」不換，台中有后里區）
  a := regexp_replace(translate(p_addr,
         '臺区乡镇县东万丰义内凤乐归兴庄营势桥树芦华门鸟莺冈头罗苏兰杨龟园莲恒盐关庙学铜锣坜宝贡双峡乌雾龙栖线员仑云连',
         '台區鄉鎮縣東萬豐義內鳳樂歸興莊營勢橋樹蘆華門鳥鶯岡頭羅蘇蘭楊龜園蓮恆鹽關廟學銅鑼壢寶貢雙峽烏霧龍棲線員崙雲連'),
         '[0-9０-９]', '', 'g');
  i := strpos(a, p_county);
  if i = 0 then return null; end if;
  rest := substr(a, i + char_length(p_county));
  d := substring(rest from '^([東西南北中]區)');
  if d is null then d := substring(rest from '^([^\s,，]{2}[區鄉鎮市])'); end if;
  if d is null then d := substring(rest from '^([^\s,，]{3}[區鄉鎮市])'); end if;
  if d is null and i > 1 then
    -- 英文順序：行政區在縣市前面
    d := substring(substr(a, 1, i - 1) from '([^\s,，]{2}[區鄉鎮市])$');
    if d ~ '^[里路街段號樓]' then d := substr(d, 2); end if;
  end if;
  return d;
end $$;

-- 一個縣市裡，每個行政區有哪些優惠：{"內湖區":[12,45,…], "士林區":[…]}
-- 已隱藏、永久歇業的分店不算。
create or replace function public.offer_districts(p_county text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(d, ids), '{}'::jsonb)
  from (
    select d, jsonb_agg(offer_id order by offer_id) as ids
    from (
      select distinct s.offer_id, public.tw_district(s.address, p_county) as d
      from public.offer_stores s
      where s.county = p_county
        and not s.hidden
        and coalesce(s.business_status, '') <> 'CLOSED_PERMANENTLY'
    ) x
    where d is not null
    group by d
  ) y;
$$;

revoke execute on function public.offer_districts(text) from public;
grant execute on function public.offer_districts(text) to anon, authenticated;
grant execute on function public.tw_district(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- 跑完驗證（應該看到「中山區」「大安區」…各自一串優惠編號）：
--   select public.offer_districts('台北市');
