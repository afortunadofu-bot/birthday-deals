/* v144：自動通過新投稿（管理員的開關，預設關著）

   celine：「管理員可以開啟自動按鈕，可以自動通過修改跟新增的優惠，
             **打開按鈕才會啟動**」

   只做「新增的優惠」。修改建議的自動通過還沒做——原因寫在 SQL 檔最下面。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t65 自動上架');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema_v144_auto_approve.sql'), 'utf8');
  const { win } = await boot();
  const $ = (s) => win.document.querySelector(s);

  /* ---- 不是全部自動通過 ---- */
  t.ok('有門檻：要先有幾筆被核可過', /MIN_APPROVED constant integer := 2/.test(sql));
  t.ok('被停權的人不享有', /is_banned/.test(sql));
  t.ok('只管民眾自己投的待審件', /new\.status is distinct from 'pending'/.test(sql)
    && /new\.submitted_by is null/.test(sql));
  t.ok('開關沒開就什麼都不做', /not coalesce\(v_on, false\)/.test(sql));
  t.ok('預設是關著的', /values \('auto_approve', false\)/.test(sql));

  /* ---- 這支是 AFTER 不是 BEFORE，理由要寫下來 ---- */
  t.ok('AFTER INSERT（BEFORE 會被自己的 RLS 擋掉）',
    /after insert on public\.offers/.test(sql));
  t.ok('而且有寫為什麼', /WITH CHECK/.test(sql) && /BEFORE trigger/.test(sql));

  /* ---- 留痕跡 ---- */
  t.ok('有 auto_approved 欄位', /add column if not exists auto_approved/.test(sql));
  t.ok('有查「自動上架了哪些」的函式',
    /create or replace function public\.admin_auto_approved/.test(sql));
  t.ok('那支只有管理員能跑', /if not public\.is_admin\(\)/.test(sql));

  /* ---- site_settings 的白名單陷阱 ---- */
  const keys = ['show_studio_footer', 'show_studio_brandpage', 'show_studio_bandary',
                'show_studio_relatestats', 'show_coffee', 'show_dev_intro', 'auto_approve'];
  t.ok('白名單七個 key 一個都沒漏（漏了會噴 is violated by some row）',
    keys.every((k) => new RegExp("'" + k + "'").test(sql)), keys.length);
  t.ok('而且有寫為什麼要連舊的一起重建', /site_settings_key_known is violated/.test(sql));

  /* ---- 前端 ---- */
  t.ok('開關出現在「網站顯示設定」裡', win.eval("FLAG_KEYS.includes('auto_approve')"));
  t.ok('而且排在第一個（它比顯示開關重要）', win.eval("FLAG_KEYS[0]==='auto_approve'"));
  t.ok('有標籤', !!win.eval("FLAG_LABEL['auto_approve']"));
  t.ok('說明有講清楚「誰」會被自動通過',
    /* v162 起修改建議也算進門檻（「2 筆被核可過（投稿或修改建議都算）」），
       問的是門檻跟對象，不是那一句的原字 */
    /2 筆被核可過/.test(win.eval("FLAG_NOTE['auto_approve']")));
  t.ok('有「自動上架的」那一塊', !!$('#pnlAutoApproved'));
  t.ok('而且是切過去才載（審核頁已經夠重了）',
    win.eval("typeof PANEL_LOADER.pnlAutoApproved === 'function'"));

  const fn = win.eval('String(loadAutoApproved)');
  t.ok('退回走原本的審核路徑，不是另外寫一套', /rpc\('review_offer'/.test(fn));
  t.ok('退回前先問一聲', /confirm\(/.test(fn));
  t.ok('v144 還沒跑的話講人話', /還沒啟用/.test(fn));

  /* ---- 誠實：修改建議還沒做 ---- */
  t.ok('SQL 檔有寫「修改建議還沒做」跟為什麼',
    /還沒做：修改建議的自動通過/.test(sql) && /review_offer_edit/.test(sql));

  t.done();
})();
