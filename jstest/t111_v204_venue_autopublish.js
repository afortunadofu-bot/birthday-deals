/* v204 celine：「民眾投稿的行程可以直接上架 不用我審核」。
   「推薦一個地點」多一個「在哪裡」，送出呼叫 submit_venue()：直接公開／附近已經有／店太少先留著。
   SQL 還沒跑就退回原本的「送給管理員」，座標寫進備註。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t111 v204 推薦的地點直接上架');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];

  const calls = { rpc: [], insert: [] };
  let rpcReply = { data: { result: 'published', venue_id: 501, name: '測試商圈', offers: 6 }, error: null };
  win.__sb = {
    rpc: (name, p) => { calls.rpc.push([name, p]); return Promise.resolve(rpcReply); },
    from: (tbl) => ({
      insert: (row) => { calls.insert.push([tbl, row]); return Promise.resolve({ error: null }); },
      select: () => { const q = { eq: () => q, order: () => q, limit: () => Promise.resolve({ data: [], error: null }) }; return q; },
    }),
  };
  win.eval(`sb=window.__sb; LIVE=true; me={id:'u1'}; window.__loads=0; loadVenues=async()=>{ window.__loads++; };
    window.__ev=[]; logEvent=(a,b)=>window.__ev.push([a,b]);`);

  win.eval('openVenueSuggest()');
  t.ok('推薦新地點：多一格「在哪裡」', !$('#vsLocField').classList.contains('hidden'));
  t.ok('說明改成送出就會出現', /送出就會出現/.test($('#vsSub').textContent));
  $('#vsName').value = '測試商圈';
  $('#btnVsSend').click();
  await tick(win, 3);
  t.ok('沒選位置：先講要指出在哪裡，不送', /指出在哪裡/.test($('#vsMsg').textContent) && !calls.rpc.length);

  win.eval(`vsSetLoc(25.0418, 121.5654, '台北101')`);
  t.ok('選好位置會寫出來', /台北101/.test($('#vsPlaceMsg').textContent));
  $('#btnVsSend').click();
  await tick(win, 4);
  t.eq('呼叫 submit_venue 帶名字跟座標', calls.rpc[0] && [calls.rpc[0][0], calls.rpc[0][1].p_name, calls.rpc[0][1].p_lat, calls.rpc[0][1].p_lng],
    ['submit_venue', '測試商圈', 25.0418, 121.5654]);
  t.ok('直接上架：講清楚現在就看得到、幾家', /上架了/.test($('#vsMsg').textContent) && /6 家/.test($('#vsMsg').textContent), $('#vsMsg').textContent);
  t.ok('重新載入地點清單、打開新的那一格', win.eval('window.__loads') >= 1 && win.eval('VENUE_OPEN') === 501);
  t.ok('沒有另外寫一筆待審', !calls.insert.length);

  // 附近已經有了
  rpcReply = { data: { result: 'exists', venue_id: 7, name: '高雄漢神巨蛋' }, error: null };
  win.eval(`openVenueSuggest(); $('#vsName').value='漢神巨蛋'; vsSetLoc(22.67,120.30,'漢神巨蛋');`);
  $('#btnVsSend').click();
  await tick(win, 4);
  t.ok('附近已經有：告訴他是哪一個', /已經有「高雄漢神巨蛋」/.test($('#vsMsg').textContent), $('#vsMsg').textContent);

  // 店太少：留給管理員
  rpcReply = { data: { result: 'pending', offers: 1 }, error: null };
  win.eval(`openVenueSuggest(); $('#vsName').value='某條小巷'; vsSetLoc(23.5,120.5,'某條小巷');`);
  $('#btnVsSend').click();
  await tick(win, 4);
  t.ok('店太少：講「看過之後再上架」', /看過之後再上架/.test($('#vsMsg').textContent));

  // SQL 還沒跑：退回原本的待審，座標寫進備註
  rpcReply = { data: null, error: { message: 'Could not find the function public.submit_venue in the schema cache' } };
  win.eval(`openVenueSuggest(); $('#vsName').value='舊流程'; vsSetLoc(24.1,120.6,'某處');`);
  $('#btnVsSend').click();
  await tick(win, 4);
  const ins = calls.insert.find((c) => c[0] === 'venue_suggestions');
  t.ok('SQL 還沒跑：退回寫一筆待審', !!ins && ins[1].name === '舊流程');
  t.ok('…座標寫進備註，管理員不用自己對', !!ins && /位置 24\.10000,120\.60000/.test(ins[1].note || ''), ins && ins[1].note);
  t.ok('…畫面不提 SQL', !/SQL|schema|函式/.test($('#vsMsg').textContent));

  // 其他錯誤（例如一天 5 個）照實講
  rpcReply = { data: null, error: { message: '一天最多推薦 5 個地點，明天再來' } };
  win.eval(`openVenueSuggest(); $('#vsName').value='第六個'; vsSetLoc(24.1,120.6,'某處');`);
  const before = calls.insert.length;
  $('#btnVsSend').click();
  await tick(win, 4);
  t.ok('一天 5 個的上限照實講、不另外寫待審', /一天最多推薦 5 個/.test($('#vsMsg').textContent) && calls.insert.length === before);

  // 建議修改既有地點：不出現「在哪裡」，照舊送審
  win.eval(`openVenueSuggest({id:9, name:'台北京站', county:'台北市'})`);
  t.ok('建議修改：不出現「在哪裡」', $('#vsLocField').classList.contains('hidden'));
  $('#btnVsSend').click();
  await tick(win, 4);
  const edit = calls.insert.filter((c) => c[0] === 'venue_suggestions').pop();
  t.ok('建議修改照舊送審（帶 venue_id）', !!edit && edit[1].venue_id === 9);

  // 我推薦過的：已上架
  t.eq('狀態字：已上架', win.eval('VS_STATUS.published[0]'), '✓ 已上架');

  /* ---- SQL ---- */
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema_v204_venue_autopublish.sql'), 'utf8');
  t.ok('只給登入的人呼叫', /grant\s+execute on function public\.submit_venue\([^)]*\) to authenticated/.test(sql)
    && /revoke execute on function public\.submit_venue\([^)]*\) from public, anon/.test(sql));
  t.ok('被停權的擋', /is_banned\(\)/.test(sql));
  t.ok('200 公尺內有了不重複建', /d < 200/.test(sql));
  t.ok('180 公尺內少於 2 家先留著', /v_n < 2/.test(sql) && /<= 180/.test(sql));
  t.ok('位置要在台灣', /between 21\.8 and 26\.5/.test(sql));
  t.ok('一樣走 venue_suggestions（一天 5 個的 trigger 照舊）', /insert into public\.venue_suggestions/.test(sql));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
