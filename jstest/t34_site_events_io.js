/* celine：「site_events 問題處理」

   嵐的截圖：站台儀表板顯示「讀取失敗：canceling statement due to statement timeout」。

   原因不是沒有索引（v14 就建了兩支、v78 又補一支），是**查詢沒有範圍**：
   admin_dashboard_series 只要最近 14 天，但裡面每個 CTE 都先把整張 site_events
   group by 日期算完（含 count(distinct session_id)）再 left join 回那 14 天。

   SQL 沒辦法在 jsdom 裡跑，所以這一支守的是「那幾條規則還在不在」——
   避免之後有人改這幾支函式時又把範圍條件拿掉，逾時整批回來。
   前端的部分驗那句英文錯誤訊息有沒有被翻成「該做什麼」。 */
const fs = require('fs');
const path = require('path');
const { boot, makeAsserts } = require('./harness');

const sql = fs.readFileSync(path.join(__dirname, '..', 'schema_v92_site_events_io.sql'), 'utf8');
// 取出某一支函式的本體，才不會把別支的條件算到這一支頭上
function body(name) {
  const i = sql.indexOf(`create or replace function public.${name}(`);
  if (i < 0) return '';
  const j = sql.indexOf('$$;', i);
  return sql.slice(i, j < 0 ? undefined : j);
}

(async () => {
  const t = makeAsserts('t34 site_events 的 IO');

  /* ================= 1. 折線圖：每個 CTE 都要有日期範圍 ================= */
  const series = body('admin_dashboard_series');
  t.ok('折線圖那一支還在', series.length > 0);
  t.ok('先算出起始日期', /v_from\s*:=\s*current_date\s*-\s*\(p_days\s*-\s*1\)/.test(series));
  // 五個來源表各一個 CTE（瀏覽數、新會員、使用回報、投稿、審核），每個都要被日期夾住
  const ctes = series.split(/\b(?:pv|nu|ur|sub|rev) as \(/).slice(1);
  t.eq('五個 CTE 都在', ctes.length, 5);
  ctes.forEach((c, i) => t.ok(`第 ${i + 1} 個 CTE 有日期範圍，不是整張表`, /v_from/.test(c), c.slice(0, 120)));
  t.ok('天數上限還是 90 天', /p_days > 90 then p_days := 90/.test(series));

  /* ================= 2.「全部時間」不能再變成 epoch 全表掃描 ================= */
  ['admin_dashboard_stats', 'admin_visit_stats'].forEach((fn) => {
    const b = body(fn);
    t.ok(`${fn}：不再用 epoch 當下限`, !/to_timestamp\(0\)/.test(b), b.match(/to_timestamp\(0\)/) || '');
    t.ok(`${fn}：改用資料表裡最早那一筆`, /min\(created_at\) from public\.site_events/.test(b));
  });

  /* ================= 3. 涵蓋式索引 ================= */
  // (created_at, session_id) 的順序是重點：反過來排，範圍條件就用不到索引
  t.ok('pageview 的區間索引', /site_events \(created_at, session_id\)\s*\n\s*where event_type = 'pageview'/.test(sql));
  t.ok('所有事件的區間索引', /site_events_range_session_idx[\s\S]{0,80}\(created_at, session_id\)/.test(sql));
  t.ok('活躍會員的區間索引', /site_events_range_user_idx[\s\S]{0,120}\(created_at, user_id\)/.test(sql));
  t.ok('建完索引有 analyze，planner 才選得對計畫', /analyze public\.site_events;/.test(sql));

  /* ================= 4. 公開端點不給無上限查詢 ================= */
  const pub = body('site_usage_hour_distribution');
  t.ok('公開的時段分布還在', pub.length > 0);
  t.ok('null 會被夾成 30 天，不是整張表', /p_days is null or p_days < 1 or p_days > 90 then p_days := 30/.test(pub));
  t.ok('而且沒有別的路徑可以不設下限', !/to_timestamp\(0\)/.test(pub));

  /* ================= 5. 清理工具：刪掉之前先結算 ================= */
  const prune = body('admin_events_prune');
  t.ok('清理函式在', prune.length > 0);
  t.ok('只有管理員能清', /if not public\.is_admin\(\) then raise exception/.test(prune));
  t.ok('最少保留 30 天（折線圖畫得到 90 天，清太狠等於把儀表板清空）',
    /p_keep_days < 30 then p_keep_days := 30/.test(prune));
  t.ok('先把總數存進 archive', prune.indexOf('update public.site_events_archive') < prune.indexOf('delete from public.site_events'));
  t.ok('有一支只看不動的預覽', body('admin_events_prune_preview').length > 0);
  t.ok('archive 不開任何 policy（只給 security definer 函式用）',
    /site_events_archive enable row level security/.test(sql) && !/policy[^\n]*site_events_archive/.test(sql));

  /* ================= 6. 累計數字不會因為清理掉下來 ================= */
  const view = sql.slice(sql.indexOf('create or replace view public.site_stats'));
  t.ok('累計瀏覽 = archive + 現存', /site_events_archive[\s\S]{0,200}as pageview_count/.test(view));
  t.ok('不重複裝置也一樣', /site_events_archive[\s\S]{0,260}as visitor_count/.test(view));
  // create or replace view 不准改欄位名稱／順序，抄錯一個整支就跑不起來
  t.eq('欄位名稱與順序跟 v17 一模一樣',
    [...view.matchAll(/\bas (\w+)[,;]/g)].map((m) => m[1]),
    ['offer_count', 'free_count', 'total_value', 'report_count', 'saved_total', 'user_count',
      'pageview_count', 'visitor_count']);
  t.ok('free_count 還是看 free_no_min（不是 free）', /free_tier = 'free_no_min'/.test(view));
  t.ok('user_count 還是「回報過的人數」，不是 profiles 總數',
    /count\(distinct user_id\) from public\.usage_reports\)\s+as user_count/.test(view));
  t.ok('view 的 security_invoker 設定沒掉', /with \(security_invoker = false\)/.test(view));

  /* ================= 7. 前端：把那句英文翻成「該做什麼」 ================= */
  const { win } = await boot();
  const timeout = win.dbErrHint({ message: 'canceling statement due to statement timeout' }, 'schema_v41_dashboard_range.sql');
  t.ok('逾時會說要跑哪一支 SQL', /schema_v92/.test(timeout), timeout);
  t.ok('而且講得出發生什麼事', /跑太久|中止/.test(timeout));
  t.ok('函式不存在還是指向原本那一支',
    /schema_v41/.test(win.dbErrHint({ message: 'function public.x does not exist' }, 'schema_v41_dashboard_range.sql')));
  t.eq('一般錯誤不要亂加括號', win.dbErrHint({ message: 'permission denied' }, 'schema_v41_dashboard_range.sql'), '');
  t.eq('沒有 error 也不會爆掉', win.dbErrHint(null, 'x.sql'), '');

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
