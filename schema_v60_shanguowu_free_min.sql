-- =====================================================================
-- v60：善菓屋 生日禮改成「免費・需消費」
--
--   背景：資料庫原本寫「免費・無低消」（free_no_min），條件欄只有「—」。
--   9/2 使用者分享的生日優惠紀錄寫「任意消費即可兌換焦糖達克瓦茲」，網路上的
--   整理文章也寫「生日禮消費送達克瓦茲」，兩個來源都說要消費才能換。celine
--   確認改成需消費；其他欄位（會員管道、優惠內容、地區）不動。
--
--   用 set_config 帶入修改原因，v40 的 offers_log_edit_history trigger 會把「條件」欄
--   的異動（— → 需任意消費才能兌換）連同原因記進公開的修改歷史。那支 trigger 沒有追蹤
--   free_tier 欄位，所以「免費層級」本身不會出現在歷史裡，但條件欄已經寫明要消費。
--   只在還沒改過時更新，可重複執行。
-- =====================================================================

begin;

select set_config('app.edit_actor_name', '管理員', true),
       set_config('app.edit_reason', '使用者實際使用紀錄與網路整理文章都寫生日禮需任意消費才能兌換', true);

update public.offers
set free_tier  = 'free_min',
    conditions = '需任意消費才能兌換'
where id = 106
  and brand = '善菓屋 ARTISAN BAKERY'
  and (free_tier is distinct from 'free_min' or conditions is distinct from '需任意消費才能兌換');

commit;
