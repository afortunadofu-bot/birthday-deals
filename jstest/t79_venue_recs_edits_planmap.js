/* v160：嵐的第二批＋celine 的顏色

   嵐：「希望可以看這個人都蒐藏些什麼，建議他可以去哪個商圈一次用掉」
       「使用者也可以投稿編輯」「行程旁邊可以串地圖」
   celine：「不同商圈可以標不同深淺的顏色嗎，辨識度比較高」

   這一支最在意的：
   - 推薦是在這台裝置上算的：你收藏了什麼不送去資料庫
   - v160 的 SQL 沒跑時，什麼都不能壞（推薦不出現、每一格照舊一格一格查）
   - 建議修改「只有」在修改時才帶 venue_id——不然沒跑 v160 的資料庫連推薦新地點都送不出去
   - 行程的地圖：每一家取離中心最近的那間，找不到的要講出來 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, stubHeavy } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sql = fs.readFileSync(path.join(__dirname, '..', 'schema_v160_venue_pairs.sql'), 'utf8');

(async () => {
  const t = makeAsserts('t79 照收藏推薦商圈、建議修改、行程地圖、顏色深淺');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];
  stubHeavy(win, ['render', 'loadOffers', 'loadMyVenueSuggestions', 'loadPendingBadge',
    'maybeShowBirthdayCheer', 'openDetail']);

  win.eval(`LIVE=true; me={id:'u-1'}; myProfile=null;
    OFFERS=[1,2,3,4,5,6].map(i=>({id:i, brand:'品牌'+i, offer:'優惠'+i}));
    VENUES=[
      {id:7,name:'南西',county:'台北市',lat:25.05,lng:121.52,radius_m:180,offer_count:33},
      {id:8,name:'京站',county:'台北市',lat:25.049,lng:121.517,radius_m:180,offer_count:34},
      {id:9,name:'巨城',county:'新竹市',lat:24.81,lng:120.97,radius_m:180,offer_count:38}];
    document.querySelector('#venueCounty').innerHTML='<option value=""></option>';`);

  /* ================= 一、v160 沒跑：什麼都不能壞 ================= */
  win.eval(`VENUE_PAIRS=null; VENUE_PAIRS_TRIED=false;
    sb={ rpc:(fn)=>Promise.resolve(fn==='venue_offer_pairs'
      ? {data:null, error:{message:'Could not find the function public.venue_offer_pairs'}}
      : {data:[{venue_offer_ids:1}], error:null}) };`);
  t.eq('拿不到配對：回 null', await win.eval('loadVenuePairs()'), null);
  win.eval("WISH=new Set(['1','2']); renderVenueRecs();");
  t.eq('拿不到配對：推薦那塊不出現', $('#venueRecs').innerHTML, '');
  win.eval('VENUE_OPEN=7; renderVenues();');
  await tick(win, 4);
  t.eq('拿不到配對：點開一格照舊一格一格查', $$('#venueBody7 .venue-offer').length, 1);

  /* ================= 二、照收藏推薦 ================= */
  const calls = [];
  win.__calls = calls;
  win.eval(`VENUE_PAIRS=null; VENUE_PAIRS_TRIED=false;
    sb={ rpc:(fn,args)=>{ window.__calls.push([fn,args]); return Promise.resolve(fn==='venue_offer_pairs'
      ? {data:[{venue_id:7,offer_id:1},{venue_id:7,offer_id:2},{venue_id:7,offer_id:3},
               {venue_id:8,offer_id:1},{venue_id:8,offer_id:4},
               {venue_id:9,offer_id:5}], error:null}
      : {data:[], error:null}); } };`);
  await win.eval('loadVenuePairs()');
  /* 收藏是誰的、收藏了什麼，都不送去資料庫：那一支沒有參數 */
  t.eq('拿配對的那一支不帶任何參數（收藏不送出去）', calls[0], ['venue_offer_pairs', undefined]);
  t.ok('只拿一次', (await win.eval('loadVenuePairs()')) && calls.length === 1);

  win.eval("WISH=new Set(['1','2','4']); renderVenueRecs();");
  const recs = () => $$('#venueRecs .vr-row').map((b) => [b.querySelector('b').textContent, b.querySelector('.vr-n').textContent]);
  /* 兩個都命中 2 筆；一樣多的時候，裡面家數多的排前面——去了還有別的可以順便用 */
  t.eq('一樣多時，裡面家數多的排前面（京站 34 > 南西 33）', recs(), [['京站', '2 筆'], ['南西', '2 筆']]);
  win.eval("WISH=new Set(['1','2','3']); renderVenueRecs();");
  t.eq('收藏最多落在哪裡就推哪裡（南西 3 筆 > 京站 1 筆）', recs(), [['南西', '3 筆'], ['京站', '1 筆']]);
  win.eval("WISH=new Set(['1','2','4']); renderVenueRecs();");
  t.ok('寫出是哪幾家', /品牌1、品牌2/.test($('#venueRecs').textContent));
  t.ok('講你收藏了幾筆', /你收藏了 3 筆/.test($('#venueRecs').textContent));
  t.ok('沒命中的商圈不列', !/巨城/.test($('#venueRecs').textContent));

  win.eval("WISH=new Set(['6']); renderVenueRecs();");
  t.ok('收藏的都不在任何商圈：講清楚，不是空白', /都不在下面這些商圈裡/.test($('#venueRecs').textContent));
  win.eval("me=null; renderVenueRecs();");
  t.eq('沒登入：不出現', $('#venueRecs').innerHTML, '');

  win.eval("me={id:'u-1'}; WISH=new Set(['1','2','4']); VENUE_OPEN=null; renderVenues();");
  const badge = (id) => $(`#venueList .venue[data-id="${id}"] .venue-mine`)?.textContent || '';
  t.eq('清單上每一格標「收藏 N」', [badge(7), badge(8), badge(9)], ['收藏 2', '收藏 2', '']);

  // 點開一格：有配對就不再查一次
  calls.length = 0;
  win.eval('VENUE_OPEN=7; renderVenues();');
  await tick(win, 4);
  t.ok('點開一格：用手上的配對，不再打 venue_offer_ids',
    !calls.some(([fn]) => fn === 'venue_offer_ids'), JSON.stringify(calls));
  t.eq('列出那一格的三家', $$('#venueBody7 .venue-offer').length, 3);

  t.ok('待辦清單那邊有入口', !!$('#btnWishToVenues'));

  /* ================= 三、建議修改 ================= */
  t.ok('一般人：每一格最下面有「建議修改」', !!$('#venueFix7'));
  const sent = [];
  win.__sent = sent;
  win.eval(`sb={ ...sb, from:(tb)=>({ insert:(row)=>{ window.__sent.push({tb,row}); return Promise.resolve({error:null}); } }) };`);
  win.eval("document.querySelector('#venueFix7').click()");
  t.ok('視窗標題換成「建議修改「南西」」', /建議修改「南西」/.test($('#vsTitle').textContent));
  t.eq('名字先填好', $('#vsName').value, '南西');
  t.eq('縣市先選好', $('#vsCounty').value, '台北市');
  /* 已經算在裡面的那幾家不用再列——要問的是「少了哪幾家」 */
  const search = $('#vsPicker .op-search');
  search.value = '品牌';
  search.dispatchEvent(new win.Event('input'));
  const listed = $$('#vsPicker [data-pa]').map((e) => e.dataset.pa);
  t.ok('已經在裡面的那三家不列', !listed.includes('1') && !listed.includes('2') && !listed.includes('3'), listed.join(','));
  $('#vsName').value = '中山站・南京西路';
  win.eval("document.querySelector('#btnVsSend').click()");
  await tick(win, 3);
  t.eq('送出時帶著「改哪一個」', sent[0]?.row.venue_id, 7);
  t.eq('改過的名字也送', sent[0]?.row.name, '中山站・南京西路');
  $('#dlgVenueSuggest').close();

  // 推薦新地點：不帶 venue_id（沒跑 v160 的資料庫沒有這一欄，不能因此送不出去）
  sent.length = 0;
  win.eval('openVenueSuggest()');
  t.ok('推薦新地點：標題照舊', /推薦一個地點/.test($('#vsTitle').textContent));
  t.eq('推薦新地點：名字是空的', $('#vsName').value, '');
  $('#vsName').value = '高雄夢時代';
  win.eval("document.querySelector('#btnVsSend').click()");
  await tick(win, 3);
  t.ok('推薦新地點：不帶 venue_id 這一欄', sent[0] && !('venue_id' in sent[0].row), JSON.stringify(sent[0]?.row));
  $('#dlgVenueSuggest').close();

  // 管理員自己就地改，不用投稿給自己
  win.eval('myProfile={is_admin:true}; renderVenues();');
  await tick(win, 4);
  t.ok('管理員：沒有「建議修改」', !$('#venueFix7'));
  win.eval('myProfile=null;');

  // 審核：建議改名的，一顆按鈕套用
  win.eval(`myProfile={is_admin:true};
    VENUE_ADMIN={sug:[{id:31,name:'中山站・南京西路',county:'台北市',note:'',status:'pending',venue_id:7},
                      {id:32,name:'高雄夢時代',county:'高雄市',note:'',status:'pending',venue_id:null}],
      mine:[{id:7,name:'南西',county:'台北市',is_public:true,lat:25.05,lng:121.52}], cand:[], candErr:''};
    renderVenueAdmin();`);
  const adm = $('#venueAdminBody');
  t.ok('看得出是「建議修改」哪一個', /建議修改「南西」/.test(adm.textContent));
  t.ok('改名的有「改成這個名字」', !!adm.querySelector('[data-vs-rename="31"]'));
  t.ok('推薦新地點的沒有', !adm.querySelector('[data-vs-rename="32"]'));
  t.ok('審核那邊撈推薦時會帶 venue_id，沒跑 v160 就退回不帶的那一句',
    /select\('id,name,county,note,status,created_at,venue_id'\)/.test(index) && /sugRows===null/.test(index));
  win.eval('myProfile=null;');

  /* ================= 四、行程的地圖 ================= */
  win.eval(`PLANS=[{id:1,plan_date:null,title:'',note:null,items:[
      {id:51,offer_id:1,note:null,sort_order:0,done:false},
      {id:52,offer_id:4,note:null,sort_order:1,done:false},
      {id:53,offer_id:6,note:null,sort_order:2,done:false}]}];`);
  const opts = win.eval(`planCenterOptions(PLANS[0])`);
  /* 預設中心＝這一趟的店最多落在其中的那個商圈 */
  t.ok('中心選項：最多家在裡面的排第一（京站有 1、4）',
    /^<option value="v8">京站（2 家在裡面）<\/option>/.test(opts), opts.slice(0, 80));
  t.ok('也可以選「我現在的位置」', /value="here">我現在的位置/.test(opts));
  t.ok('看地圖的按鈕：有店才出現', /data-pmap/.test(win.eval('planBodyHtml(PLANS[0])')));
  t.ok('沒有店：不出現', !/data-pmap/.test(win.eval("planBodyHtml({...PLANS[0], items:[]})")));
  t.ok('每一家取離中心最近的分店（用現成的 nearest_offer_stores）',
    /rpc\('nearest_offer_stores',\{p_lat:c\.lat, p_lng:c\.lng, p_km:30\}\)/.test(index));
  t.ok('30 公里內找不到的要講出來', /30 公里內找不到分店/.test(index));
  t.ok('「我現在的位置」不快取（人會移動）', /if\(c\.key!=='here'\) PLAN_NEAR_CACHE\.set/.test(index));

  /* ================= 五、顏色深淺 ================= */
  const shade = (n) => win.eval(`venueShade(${n}).fill`);
  const shades = [5, 12, 18, 24, 30, 39].map(shade);
  t.eq('家數越多越深：五階', new Set(shades).size, 5);
  t.eq('門檻是固定的（切縣市時同一個商圈顏色不變）', [shade(11), shade(12), shade(29), shade(30)],
    [shade(1), shade(17), shade(24), shade(39)]);
  /* 淺的兩階用深色外框，在淺色底圖上才不會糊掉 */
  t.ok('淺的用深色外框', win.eval('venueShade(5).stroke') !== '#fff' && win.eval('venueShade(30).stroke') === '#fff');
  win.eval('paintVenuesLegend()');
  t.ok('圖例寫的是固定的數字', /1–11/.test($('#venuesLegend').textContent) && /30\+/.test($('#venuesLegend').textContent));
  t.ok('地圖藏起來時圖例也藏', $('#venuesLegend').classList.contains('hidden'));
  t.ok('由大畫到小（小圈疊在上面，擠在一起時點得到）',
    /\.sort\(\(a,b\)=>\(b\.offer_count\|\|0\)-\(a\.offer_count\|\|0\)\)\.forEach/.test(index));

  /* ================= SQL ================= */
  t.ok('配對只看公開的商圈', /where v\.is_public/.test(sql));
  t.ok('跟算家數同一套範圍（方塊＋真正距離）', /<= v\.radius_m/.test(sql) && /between v\.lat - v\.radius_m/.test(sql));
  t.ok('只看核可的優惠', /o\.status = 'approved'/.test(sql));
  t.ok('訪客也叫得動（公開資料）', /grant\s+execute on function public\.venue_offer_pairs\(\) to anon, authenticated/.test(sql));
  t.ok('建議修改那一欄可以重複跑', /add column if not exists venue_id/.test(sql));
  t.ok('商圈刪掉，指向它的建議一起刪', /references public\.venues\(id\) on delete cascade/.test(sql));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
