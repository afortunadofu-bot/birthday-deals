/* v171：celine「記得各式各樣的 error 都盡量不要跳英文出來，都要有中文解釋」 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

(async () => {
  const t = makeAsserts('t89 v171：錯誤訊息一律中文');
  const { win } = await boot();
  const doc = win.document;
  win.console.warn = () => {};
  const zh = (e) => win.eval(`zhErr(${JSON.stringify(e)})`);
  const hasEnglish = (s) => /[A-Za-z]{4,}/.test(s.replace(/APP|LINE|Google|Ocard/g, ''));

  const cases = [
    [{ message: 'Service for this project is restricted due to the following violations: exceed_egress_quota.' }, /系統更新中/],
    [{ message: 'TypeError: Failed to fetch' }, /連不上網路/],
    [{ message: 'Load failed' }, /連不上網路/],
    [{ message: 'canceling statement due to statement timeout', code: '57014' }, /太慢/],
    [{ message: 'JWT expired', code: 'PGRST301' }, /登入過期/],
    [{ message: 'new row violates row-level security policy for table "offers"', code: '42501' }, /沒有權限/],
    [{ message: 'duplicate key value violates unique constraint "usage_reports_pkey"', code: '23505' }, /已經有了/],
    [{ message: 'new row for relation "offers" violates check constraint "offers_min_spend_range"', code: '23514' }, /不符合規定/],
    [{ message: 'insert or update on table "plan_items" violates foreign key constraint', code: '23503' }, /已經不在了/],
    [{ message: 'null value in column "brand" violates not-null constraint', code: '23502' }, /必填/],
    [{ message: 'Could not find the function public.admin_event_stats_range in the schema cache', code: 'PGRST202' }, /還沒開放/],
    [{ message: 'column offers.expected_spend does not exist', code: '42703' }, /還沒開放/],
    [{ message: 'Too Many Requests', status: 429 }, /太頻繁/],
    [{ message: 'invalid input syntax for type integer: "abc"', code: '22P02' }, /格式不對/],
    [{ message: 'Internal Server Error' }, /伺服器暫時出了點問題/],
    [{ message: 'Something completely unexpected happened' }, /沒預期到的錯誤/],
  ];
  for (const [e, want] of cases) {
    const out = zh(e);
    t.ok(`「${e.message.slice(0, 40)}」→ ${out}`, want.test(out) && !hasEnglish(out), out);
  }
  t.eq('已經是中文的（trigger 自己寫的）照原樣', zh({ message: '一個人最多 100 趟行程' }), '一個人最多 100 趟行程');
  t.eq('字串也收', zh('Failed to fetch'), '連不上網路或伺服器，請確認網路之後再試一次');
  t.ok('沒有東西也不會壞', typeof zh(null) === 'string');

  t.ok('pubErrText 的後半段也換成中文',
    win.eval(`pubErrText({message:'Failed to fetch'},'讀取失敗：')`) === '讀取失敗：連不上網路或伺服器，請確認網路之後再試一次');
  t.ok('pubErrText「還沒開放」那條照舊', /還沒開放|尚未開放|還沒/.test(win.eval(`pubErrText({message:'relation "x" does not exist'},'讀取失敗：')`)));

  /* 真的畫到畫面上 */
  win.eval(`LIVE=true; sb={ from:()=>({ select:()=>({ order:()=>({ limit:()=>Promise.resolve({data:null,
    error:{message:'Service for this project is restricted due to the following violations: exceed_egress_quota.'}}) }) }) }),
    rpc:()=>Promise.resolve({data:null,error:{message:'x'}}) }; loadMyVenueSuggestions=()=>{};`);
  await win.eval('loadVenues()');
  await tick(win, 2);
  const venueTxt = doc.querySelector('#venueList').textContent;
  t.ok('「一趟用最多」那塊（celine 截圖那一格）：沒有英文', !/restricted|egress|violations/i.test(venueTxt) && /系統更新中/.test(venueTxt), venueTxt);

  /* 原始碼：顯示的地方不再直接拼 error.message */
  const raw = index.split('\n').filter((l) => /(失敗|alert\(|showToast\(|innerHTML|textContent)/.test(l)
    && /\b(error|e0|e1|e2|e3|e4|err|e|mergeError)\.message\b/.test(l)
    && !/\.test\(|\.includes\(|\.match\(|zhErr|const m=|const t=|const raw/.test(l));
  t.eq('顯示錯誤的地方都經過 zhErr（沒有漏網的）', raw.map((l) => l.trim().slice(0, 80)), []);
  t.ok('判斷要不要退回舊查詢的地方還是讀英文原文（不能在源頭翻掉）',
    /\/expected_spend\/\.test\(error\.message\|\|''\)/.test(index));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
