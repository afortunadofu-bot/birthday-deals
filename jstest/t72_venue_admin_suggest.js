/* v153：celine 看完 v152 的「一趟用最多」之後

   「這一區還在整理中…（管理員：…）」其他人不該看到這個
   「而且館名都核對過了」
   「而且這個區塊也要能投稿」

   查下去才發現那一頁空著的真正原因：公開的一筆都沒有，而且沒有任何畫面建得出來。
   v142 建了表跟「找熱點」的函式，但當初規劃裡的「審核頁：系統列出熱點草稿，
   你改名／確認／隱藏」那一塊從來沒做，所以沒有任何一條路把熱點變成一列。

   這一支最在意的：
   - 公開的區塊裡**一個字都不能有站務指示**（連管理員自己看也不要）
   - 投稿要有自己的表，不是借「功能建議」那張
   - 一天幾個的上限擋在資料庫，不是前端
   - 最貴的那支查詢（分群 11,473 家分店）不能一進審核就跑 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, stubHeavy } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sql = fs.readFileSync(path.join(__dirname, '..', 'schema_v153_venues_write.sql'), 'utf8');

(async () => {
  const t = makeAsserts('t72 一趟用最多：管理員建地點、使用者推薦地點');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  stubHeavy(win, ['render', 'loadOffers', 'loadVenues', 'loadMyVenueSuggestions',
    'loadPendingBadge', 'renderPlanner', 'maybeShowBirthdayCheer']);

  /* ========== 一、公開的區塊不能有站務指示 ========== */
  const vtxt = () => $('#venueList').textContent;
  win.eval("myProfile=null; VENUES=[]; document.querySelector('#venueCounty').value=''; renderVenues();");
  t.ok('空的時候只講人話', /還在整理中/.test(vtxt()), vtxt().trim());
  /* celine：「其他人不該看到這個」。就算有 is_admin 擋著也不該放在這裡——
     判斷式哪天出錯就是直接漏給所有人看，而且管理員自己看也嫌髒。 */
  t.ok('沒有資料庫的字眼', !/is_public|schema_v|SQL|supabase/i.test(vtxt()), vtxt().trim());
  win.eval('myProfile={is_admin:true}; renderVenues();');
  t.ok('管理員看到的也一樣（話搬到審核那邊了）',
    !/is_public|schema_v/i.test(vtxt()), vtxt().trim());
  t.eq('兩種人看到同一句',
    vtxt().trim(), '這一區還在整理中，整理好就會出現。');

  /* ========== 二、使用者推薦地點：自己的一張表 ========== */
  t.ok('有投稿的按鈕', !!$('#btnVenueSuggest'));
  t.ok('有自己的視窗，不是借功能建議那張', !!$('#dlgVenueSuggest'));
  /* v152 是借 openFeedback('suggestion', …) 送的。座標填不出來是真的，
     但那不代表這件事不能投稿——只代表收到的是名字，座標由管理員去對。 */
  t.ok('不再借「功能建議」那條路',
    !/btnVenueSuggest'\)\.onclick[\s\S]{0,200}openFeedback/.test(index));

  // 沒登入：不要開一張送不出去的表單
  win.eval("LIVE=true; me=null; sb={}; openVenueSuggest();");
  t.ok('沒登入就不開視窗', !$('#dlgVenueSuggest').open);

  const calls = [];
  win.__calls = calls;
  win.eval(`me={id:'u-1'};
    sb={ from:(tb)=>({ insert:(row)=>{ window.__calls.push({tb,row});
           return Promise.resolve({error:window.__err||null}); } }) };`);
  win.eval(`const vc=document.querySelector('#venueCounty');
    vc.innerHTML='<option value=""></option><option value="台南市">台南市</option>';
    vc.value='台南市'; openVenueSuggest();`);
  t.ok('登入之後打得開', $('#dlgVenueSuggest').open);
  t.eq('縣市清單是全台 22 個＋一個「不確定」', $('#vsCounty').options.length, 23);
  t.ok('「全台」不在裡面（那不是一個地點）',
    ![...$('#vsCounty').options].some((o) => o.value === '全台'));
  /* 正在看哪個縣市就先選哪個——多數人就是在幫自己看的那一區補 */
  t.eq('先選好你正在看的縣市', $('#vsCounty').value, '台南市');

  // 太短的名字擋在前面，不要白跑一趟資料庫
  $('#vsName').value = '新';
  win.eval("document.querySelector('#btnVsSend').click()");
  await tick(win, 2);
  t.eq('名字太短不送出', calls.length, 0);
  t.ok('而且講得出為什麼', /至少要兩個字/.test($('#vsMsg').textContent));

  $('#vsName').value = '  新光三越南西店  ';
  $('#vsNote').value = '星巴克、康是美';
  win.eval("document.querySelector('#btnVsSend').click()");
  await tick(win, 3);
  t.eq('送進自己的那張表', calls[0]?.tb, 'venue_suggestions');
  t.eq('名字前後空白有修掉', calls[0]?.row.name, '新光三越南西店');
  t.eq('縣市跟著送', calls[0]?.row.county, '台南市');
  t.eq('裡面有哪幾家也送', calls[0]?.row.note, '星巴克、康是美');
  t.eq('身分是自己', calls[0]?.row.user_id, 'u-1');
  /* status 不從前端送：RLS 的 with check 要求 status='pending'，
     由資料庫的預設值給，前端送什麼都不算數。 */
  t.ok('不自己決定狀態', calls[0]?.row.status === undefined);
  t.ok('送出去之後有回話', /收到了/.test($('#vsMsg').textContent));

  // 表還沒建起來：要講「要跑哪一支」，不是丟 postgres 的英文
  calls.length = 0;
  win.eval("window.__err={message:'Could not find the table public.venue_suggestions in the schema cache'};");
  win.eval("openVenueSuggest(); document.querySelector('#vsName').value='高雄夢時代';");
  win.eval("document.querySelector('#btnVsSend').click()");
  await tick(win, 3);
  t.ok('表還沒建就講要跑哪一支',
    /schema_v153_venues_write\.sql/.test($('#vsMsg').textContent), $('#vsMsg').textContent);
  win.eval('window.__err=null;');
  $('#dlgVenueSuggest').close();
  t.ok('返回鍵有掛上去', /\$\('#dlgVenueSuggest'\)\.addEventListener\('close', consumeDlgHistory\)/.test(index));

  /* ========== 三、審核：三段同一塊 ========== */
  t.ok('有這一塊', !!$('#pnlVenuesAdmin') && !!$('#pnlVenuesAdmin').closest('#tab-admin'));
  /* 它最貴的那支要把 11,473 家分店切格子分群，不能一進審核就跑。
     問那份清單本身，不要比對原始碼的排列順序（見 t53 踩過的坑）。 */
  t.ok('預設收著',
    JSON.parse(win.eval('JSON.stringify([...PANEL_DEFAULT_CLOSED])')).includes('pnlVenuesAdmin'));
  t.ok('打開才去載', /pnlVenuesAdmin:\s*\(\)=>loadVenueAdmin\(\)/.test(index));
  /* 收著的話徽章也不會被畫出來，所以待審幾個另外用一支便宜的 count 拿 */
  t.ok('待審幾個單獨拿（不然沒人知道有人推薦了）',
    /sb\.rpc\('admin_venue_suggestion_count'\)/.test(index));

  win.eval(`VENUE_ADMIN={
    sug:[{id:1,name:'新光三越南西店',county:'台北市',note:'星巴克、康是美',status:'pending'}],
    mine:[{id:9,name:'巨城',county:'新竹市',is_public:false,lat:24.8014,lng:120.9715}],
    cand:[{offers:31,county:'新竹市',lat:24.8015,lng:120.9716,sample_names:'巨城'},
          {offers:27,county:'新北市',lat:24.9751,lng:121.5422,sample_names:''}],
    candErr:''};
    renderVenueAdmin();`);
  const box = $('#venueAdminBody');
  t.ok('待審的推薦列出來了', /新光三越南西店/.test(box.textContent));
  t.ok('連他寫的「裡面有哪幾家」也看得到', /星巴克、康是美/.test(box.textContent));
  t.eq('標題上的紅字跟著', $('#vsPendCount').textContent, '1');
  t.ok('紅字有顯示出來', !$('#vsPendCount').classList.contains('hidden'));
  /* 已經建過的熱點不用再列一次：200 公尺內當同一個地方（venues 預設半徑 180）。
     不去重的話，每次打開都會看到「巨城」排在最上面要你再建一次。 */
  t.ok('建過的熱點不再列一次', /還沒建的（1）/.test(box.textContent), box.textContent.slice(0, 200));
  t.ok('名字可以直接改', !!box.querySelector('[data-vname="9"]'));
  t.ok('公開是一顆開關', !!box.querySelector('[data-vpub="9"]'));
  /* 下面那排輸入框的編號是**去重之後**那一份的編號。第一版的「建立」卻是拿這個
     編號去對原本那一份 cand——建進去的座標會是另一個熱點的，而且名字是你打的，
     完全看不出來。這裡刻意讓「已經建過的」排在熱點清單第一個，所以編號會錯開。 */
  t.eq('去重之後只剩一個', box.querySelectorAll('[data-cname]').length, 1);
  t.ok('猜不到名字的留空白讓你自己取',
    box.querySelector('[data-cname="0"]')?.value === '');
  t.ok('有提醒名字要分得出來（新光三越有四個）',
    /新光三越南西店/.test(box.textContent) && /分得出來/.test(box.textContent));

  // 收下／退回
  const ups = [];
  win.__ups = ups;
  win.eval(`sb={ from:(tb)=>({ update:(row)=>({ eq:(c,v)=>{ window.__ups.push({tb,row,c,v});
    return Promise.resolve({error:null}); } }) }) };
    loadVenueAdmin=()=>{};`);
  box.querySelector('[data-vs-ok="1"]').click();
  await tick(win, 2);
  t.eq('收下寫回那張表', ups[0]?.tb, 'venue_suggestions');
  t.eq('狀態是收下了', ups[0]?.row.status, 'accepted');
  t.ok('記下是誰審的', ups[0]?.row.reviewed_by === 'u-1' && !!ups[0]?.row.reviewed_at);

  // 建立：座標從熱點來，名字從你改的那一格來
  const ins = [];
  win.__ins = ins;
  win.eval(`sb={ from:(tb)=>({ insert:(row)=>{ window.__ins.push({tb,row});
    return Promise.resolve({error:null}); } }) };`);
  box.querySelector('[data-cname="0"]').value = '新店裕隆城';
  box.querySelector('[data-cnew="0"]').click();
  await tick(win, 2);
  t.eq('建進 venues', ins[0]?.tb, 'venues');
  t.eq('名字用你打的', ins[0]?.row.name, '新店裕隆城');
  // 這一條就是上面講的那個：拿錯編號的話會變成巨城的 24.8015／120.9716
  t.eq('座標是「那一格」的，不是被去重擠掉的那一格',
    [ins[0]?.row.lat, ins[0]?.row.lng], [24.9751, 121.5422]);
  t.eq('縣市也跟著那一格', ins[0]?.row.county, '新北市');
  t.eq('建完就是公開的（你已經確認過名字了）', ins[0]?.row.is_public, true);
  t.ok('建完要讓公開清單重抓', win.eval('VENUES') === null);

  // 沒取名字不給建
  ins.length = 0;
  box.querySelector('[data-cname="0"]').value = '新';
  box.querySelector('[data-cnew="0"]').click();
  await tick(win, 2);
  t.eq('沒取名字不給建', ins.length, 0);

  /* permission denied 看起來很像「我不是管理員」，在這裡比較可能是表的 GRANT
     那一層（v142 只明確寫了 select）。要講清楚差哪一步。 */
  t.ok('寫不進去時講得出要跑哪一支',
    /schema_v153_venues_write\.sql/.test(win.eval(
      "venueWriteHint({message:'permission denied for table venues'})")));
  t.ok('不是權限問題就照實講',
    /連不上/.test(win.eval("venueWriteHint({message:'連不上'})")));

  /* ========== 四、SQL ========== */
  t.ok('可以重複執行',
    /create table if not exists public\.venue_suggestions/.test(sql)
    && /drop policy if exists/.test(sql));
  t.ok('寫入權限明確寫出來（不靠 Supabase 的預設值）',
    /grant insert, update, delete on public\.venues to authenticated/.test(sql));
  t.ok('sequence 也要給（不然 insert 還是會失敗）',
    /grant usage, select on sequence public\.venues_id_seq to authenticated/.test(sql));
  /* 給 authenticated 的 grant 不等於一般人寫得進去：RLS 那一層只有
     venues_admin 提供寫入路徑。這件事 SQL 裡要寫出來，不然下一個人會以為漏洞。 */
  t.ok('有解釋為什麼給 authenticated 不危險', /RLS/.test(sql) && /is_admin/.test(sql));
  t.ok('只能用自己的身分送', /user_id = auth\.uid\(\) and not public\.is_banned\(\)/.test(sql));
  t.ok('只能送成待審', /status = 'pending'/.test(sql));
  t.ok('自己看得到自己送的', /for select using \(user_id = auth\.uid\(\) or public\.is_admin\(\)\)/.test(sql));
  /* 一天幾個的上限一定要擋在資料庫：前端的限制任何人都繞得過去 */
  t.ok('上限擋在 trigger，不是前端',
    /before insert on public\.venue_suggestions/.test(sql) && />= 5 then/.test(sql));
  t.ok('待審計數只有管理員叫得動',
    /revoke execute on function public\.admin_venue_suggestion_count\(\) from public, anon/.test(sql));
  t.ok('而且沒權限的人拿到 0，不是整支壞掉', /else 0 end/.test(sql));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
