/* 嵐這一批的後半：每個月的人數、低消／實際花費、連不上時自己重試

   1.「收藏跟使用都可以區分成月份看，看每個月的人數」
      → 站台數據多一個「每月人數」分頁，切過去才查（不要一進排行榜就多打一次）
   2.「增加每人平均消費或是低消之類的，讓人知道大概會花多少錢」
      → 投稿表單多一個「低消」；詳情頁用大家回報的實際花費算平均
   3. celine／嵐：「google 登入還是按不下去」「回報紀錄都是 0」
      → 兩個症狀同一個原因：SDK／config 載超過 5 秒就永久降級成離線模式。
        現在逾時放寬、多一個備援 CDN、而且降級後背景重試，接上就自動升級回來。 */
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t29 每月人數＋低消＋自動重連');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  /* ================= 1. 每月人數 ================= */
  t.ok('站台數據有「每月人數」分頁', !!doc.querySelector('.subtabs[data-group="boardStats"] [data-pane="bsMonthly"]'));
  t.ok('可以切「幾個人／幾筆」', [...$('#monthlyMetric').options].map((o) => o.value).join(',') === 'users,count');
  t.ok('可以切範圍', [...$('#monthlyMonths').options].map((o) => o.value).join(',') === '6,12,24');
  t.eq('預設看 12 個月', $('#monthlyMonths').value, '12');

  const rpc = [];
  win.__sb = {
    rpc: (name, p) => {
      rpc.push([name, p]);
      return Promise.resolve({
        data: [
          { ym: '2026-08', wish_users: 10, wish_count: 22, use_users: 4, use_count: 6, saved_total: 900 },
          { ym: '2026-09', wish_users: 25, wish_count: 60, use_users: 11, use_count: 19, saved_total: 2600 },
          { ym: '2026-10', wish_users: 7, wish_count: 12, use_users: 3, use_count: 4, saved_total: 500 },
        ],
        error: null,
      });
    },
  };
  win.eval('sb = window.__sb; LIVE = true; MONTHLY_ROWS = null;');
  await win.refreshMonthlyActivity(true);
  await tick(win, 2);
  t.eq('查的是 v81 的每月活動', rpc[0], ['site_monthly_activity', { p_months: 12 }]);
  const box = () => $('#boardMonthlyChart').textContent.replace(/\s+/g, ' ');
  t.ok('收藏跟使用分成兩張圖', /每月收藏的人數/.test(box()) && /每月真的去用的人數/.test(box()), box().slice(0, 120));
  t.ok('最高的那個月標出數字', /25 人/.test(box()), box().slice(0, 200));
  t.ok('寫出這段期間合計', /合計 42 人/.test(box()), box().slice(0, 200));
  t.ok('同一個人跨月各算一次要講清楚', /各算一次/.test(box()));
  t.ok('這個月還沒結束要標出來', /這個月還沒結束/.test(box()));

  $('#monthlyMetric').value = 'count';
  $('#monthlyMetric').dispatchEvent(new win.Event('change'));
  t.ok('切成「幾筆」不用再查一次資料庫', rpc.length === 1, rpc);
  t.ok('改看筆數', /每月收藏的筆數/.test(box()) && /60 筆/.test(box()), box().slice(0, 150));

  // v81 還沒跑
  win.__sb = { rpc: () => Promise.resolve({ data: null, error: { message: 'function public.site_monthly_activity does not exist' } }) };
  win.eval('sb = window.__sb; MONTHLY_ROWS = null;');
  await win.refreshMonthlyActivity(true);
  await tick(win, 2);
  t.ok('v81 沒跑時講要跑哪支 SQL', /schema_v81/.test(box()), box().slice(0, 160));

  /* ================= 2. 低消 ================= */
  const f = $('#submitForm').elements;
  t.ok('投稿表單有低消欄位', !!f.min_spend);
  t.ok('說明寫清楚「不用消費」要選哪個', /免費・無低消/.test($('#submitForm').textContent));
  t.ok('低消有進欄位比對清單（建議修改改得到）', win.eval('OFFER_DIFF_FIELDS').includes('min_spend'));
  t.ok('低消有進「補齊彼此沒填的欄位」', win.eval('FILL_FIELDS.map(x=>x[0])').includes('min_spend'));
  t.eq('新舊對照看得懂的中文名', win.eval('EDIT_FIELD_LABEL.min_spend'), '低消');
  // fromRow 要把 min_spend 帶進畫面用的物件
  const o = win.fromRow({ id: 1, brand: 'A', offer: 'x', regions: [], sources: [], min_spend: 350 });
  t.eq('fromRow 帶得出低消', o.minSpend, 350);

  /* ================= 3. 連不上時自己重試 ================= */
  const src = doc.documentElement.innerHTML;
  t.ok('SDK 有備援 CDN', /unpkg\.com\/@supabase\/supabase-js/.test(src) && /cdn\.jsdelivr\.net\/npm\/@supabase/.test(src));
  t.ok('逾時放寬到 10 秒（原本 5 秒）', /loadScriptTag\(url, 10000\)/.test(src), (src.match(/loadScriptTag\([^)]*\)/g) || []).slice(0, 4));
  t.ok('降級之後會自己再試', /connectLive\(retry\+1\)/.test(src));
  t.ok('重試有上限，不會無限打', /retry<3/.test(src));
  t.ok('接上之後把登入鈕的字復原', /#btnLogin'\)\.textContent = 'Google 登入'/.test(src));
  t.ok('瀏覽次數不會因為重試被記兩次', /PAGEVIEW_LOGGED/.test(src));

  /* ---- 讀不到真資料時，不能讓人以為「回報都不見了」 ---- */
  win.__sb = { from: () => ({ select: () => ({ limit: () => Promise.resolve({ data: null, error: { message: 'timeout' } }) }) }) };
  win.eval('sb = window.__sb; LIVE = true;');
  win.localStorage.removeItem('sxr_offers_cache');
  await win.loadOffers(true);
  const mb = $('#modeBanner').textContent.replace(/\s+/g, ' ');
  t.ok('講清楚現在是內建示範資料', /示範資料/.test(mb), mb);
  t.ok('講清楚回報次數不是真的', /不是真的/.test(mb), mb);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
