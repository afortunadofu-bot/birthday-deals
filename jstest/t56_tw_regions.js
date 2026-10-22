/* v133：標「全台」但其實沒那麼全台的，改成實際縣市

   使用者金信宇 2026-10-01：「我點擊篩選『花蓮縣』時，底下篩選出的建議店家有
   很多都不是花蓮店家」。

   這一支跟 v110 的方向相反——v110 只補空白的（純粹多給），v133 會把範圍改小，
   所以爬蟲漏掉的分店會害那個縣市的人少看到一筆。這支測試在守的就是
   「不會有人整份貼下去就把資料改掉」。 */
const fs = require('fs');
const path = require('path');
const { makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t56 全台改成實際縣市');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const sql = read('schema_v133_tw_to_counties.sql');
  const report = read('region_tw_report.md');

  t.ok('有這支函式', /create or replace function public\.narrow_tw_offer_regions/.test(sql));
  t.ok('預設是只預覽、不改資料', /p_dry_run\s+boolean default true/.test(sql));
  t.ok('整份貼下去只會跑預覽（執行那行是註解掉的）',
    /^--\s*select brand, stores, after from public\.narrow_tw_offer_regions\(10, 5, false\);/m.test(sql)
    && !/^\s*select brand, stores, after from public\.narrow_tw_offer_regions\(10, 5, false\);/m.test(sql));
  t.ok('預覽那段是 dry_run = true', /narrow_tw_offer_regions\(10, 5, true\)/.test(sql));

  /* 2026-10-22 我自己踩過：第一版報告用「臺北市」，offer_stores 跟前端用的都是
     「台北市」，結果每一筆都少了四個縣市，星巴克看起來沒有台北店。 */
  t.ok('縣市用「台」不是「臺」', sql.includes('台北市') && !sql.includes('臺北市'));
  t.ok('縣市順序跟 v110 同一份',
    ['基隆市', '台北市', '花蓮縣', '連江縣'].every((c) => sql.includes(`'${c}'`)));

  t.ok('只動標了「全台」的', /'全台' = any\(o\.regions\)/.test(sql));
  t.ok('只動已上架的', /o\.status = 'approved'/.test(sql));
  t.ok('有分店數／縣市數兩道門檻',
    /p_min_stores/.test(sql) && /p_min_counties/.test(sql));
  t.ok('前端不能呼叫（這是批次改資料）',
    /revoke execute on function public\.narrow_tw_offer_regions[\s\S]{0,80}from public, anon, authenticated/.test(sql));
  t.ok('有寫怎麼單獨還原一筆', /update public\.offers set regions = array\['全台'\]/.test(sql));
  t.ok('有講清楚這支會把範圍改小（跟 v110 不同）', /會把範圍改小/.test(sql));

  t.ok('報告有分成三組（把握不一樣）',
    /## A\./.test(report) && /## B\./.test(report) && /## C\./.test(report));
  t.ok('報告點名了造成抱怨的那幾筆', /就是花蓮使用者抱怨的來源/.test(report));
  t.ok('報告有寫「不改」跟「改」各自錯在哪',
    /看不到一筆本來有的優惠/.test(report));
  t.ok('報告說 C 組不要動', /維持「全台」/.test(report));

  t.done();
})();
