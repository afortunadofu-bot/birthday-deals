/* v157：「一趟用最多」第二輪

   celine：「還是跑不出來」
          「幾家店建議有搜尋功能跟核可打勾，可以直接搜尋系統有的然後添加」

   還是空的原因：那一頁只列「建立過、而且公開的地點」，而建立的地方（審核那一塊）
   預設填進名字欄的是那一格裡**所有分店名串起來的一長串**——一格一格刪掉重打，
   等於沒有入口。這一支守兩件事：
   - 審核那邊的預設名字是一個像樣的館名，那一長串退到下面當參考
   - 推薦地點的「裡面有哪幾家」是搜站上已有的＋打勾，跟行程「加店家」同一個元件 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeAsserts, stubHeavy } = require('./harness');

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

(async () => {
  const t = makeAsserts('t76 推薦地點可以搜尋打勾、熱點有像樣的名字');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];
  stubHeavy(win, ['render', 'loadOffers', 'loadVenues', 'loadMyVenueSuggestions',
    'loadPendingBadge', 'maybeShowBirthdayCheer']);

  /* ================= 一、熱點的預設名字 ================= */
  const guess = (s) => win.eval(`guessVenueName(${JSON.stringify(s)})`);
  // 實際的南西那一格（venue_hotspots_report.md 裡的例子）
  const nanxi = '31冰淇淋 誠品南西店、DONQ東客麵包 新光三越南西店、GODIVA 新光三越南西店、'
    + 'GLÖ FROYO 中山地下書街店、POYA寶雅 台北南西店、OWNDAYS 南西店';
  t.eq('從一長串分店名裡挑出館名', guess(nanxi), '新光三越南西店');
  t.ok('不是把整串塞進去', guess(nanxi).length <= 40 && !/、/.test(guess(nanxi)));
  t.eq('出現最多次的贏', guess('星巴克 巨城店、無印良品 巨城店、寶雅 中華店'), '巨城店');
  t.eq('猜不到就留空（車站周邊、某條街本來就要自己取）',
    guess('寶雅 中華店、屈臣氏 中華店、康是美 中正店'), '');
  t.eq('空的也不會壞', guess(''), '');
  t.eq('null 也不會壞', win.eval('guessVenueName(null)'), '');

  win.eval(`LIVE=true; me={id:'u-1'}; myProfile={is_admin:true};
    VENUE_ADMIN={sug:[], mine:[],
      cand:[{offers:17,county:'台北市',lat:25.05,lng:121.52,sample_names:${JSON.stringify(nanxi)}},
            {offers:9,county:'台北市',lat:25.04,lng:121.51,sample_names:'寶雅 中華店、屈臣氏 中華店'}],
      candErr:''};
    renderVenueAdmin();`);
  const box = $('#venueAdminBody');
  t.eq('名字欄先填好像樣的館名', box.querySelector('[data-cname="0"]').value, '新光三越南西店');
  t.eq('猜不到的那格是空的，等你取', box.querySelector('[data-cname="1"]').value, '');
  /* 那一長串沒有不見，退到下面當參考——看了才知道要不要改名 */
  const hints = $$('#venueAdminBody .va-stores').map((e) => e.textContent);
  t.ok('分店名退到下面當參考', /誠品南西店/.test(hints[0]), hints[0]);
  t.ok('太長的只列前幾家', /…等 6 家/.test(hints[0]), hints[0]);
  t.ok('預設名字不再是那一長串', !/value="\$\{esc\(c\.sample_names/.test(index));

  /* ================= 二、推薦地點：搜尋＋打勾 ================= */
  win.eval(`OFFERS=[
      {id:1,brand:'星巴克',offer:'買一送一'},
      {id:2,brand:'康是美',offer:'生日禮'},
      {id:3,brand:'屈臣氏',offer:'禮券'}];
    MY_USED_OFFER_IDS=new Set();`);
  t.ok('「裡面有哪幾家」不再是一格空白', !$('#dlgVenueSuggest textarea#vsNote'));
  win.eval("document.querySelector('#venueCounty').value=''; openVenueSuggest();");
  t.ok('視窗打得開', $('#dlgVenueSuggest').open);
  const search = () => $('#vsPicker .op-search');
  t.ok('裡面有搜尋框', !!search());
  /* 推薦地點沒有合理的預設清單（不像行程有待辦清單），所以一開始空著叫人打字 */
  t.eq('一開始不列東西，叫你打字', $$('#vsPicker [data-pa]').length, 0);
  t.ok('而且講清楚可以不勾', /不勾也可以送出/.test($('#vsPicker').textContent));

  search().value = '星';
  search().dispatchEvent(new win.Event('input'));
  t.eq('搜得到站上已經有的', $$('#vsPicker [data-pa]').map((e) => e.dataset.pa), ['1']);
  win.eval("document.querySelector('#vsPicker [data-pa=\"1\"]').click()");
  search().value = '康';
  search().dispatchEvent(new win.Event('input'));
  t.eq('換字之後勾過的還在、浮在最上面', $$('#vsPicker [data-pa]').map((e) => e.dataset.pa), ['1', '2']);
  win.eval("document.querySelector('#vsPicker [data-pa=\"2\"]').click()");

  const sent = [];
  win.__sent = sent;
  win.eval(`sb={ from:(tb)=>({ insert:(row)=>{ window.__sent.push({tb,row});
    return Promise.resolve({error:null}); } }) };`);
  $('#vsName').value = '新光三越南西店';
  $('#vsNote').value = '還有一家巷口的手搖';
  win.eval("document.querySelector('#btnVsSend').click()");
  await tick(win, 3);
  t.eq('送進推薦那張表', sent[0]?.tb, 'venue_suggestions');
  /* 勾的寫成品牌名、站上找不到的接在後面——管理員看得懂是哪幾家就好，
     對座標用的是熱點清單，不需要優惠的 id（多一欄就多一支 SQL 要跑） */
  t.eq('勾的照勾的順序寫成品牌名，找不到的接在後面',
    sent[0]?.row.note, '星巴克、康是美；還有一家巷口的手搖');

  // 一家都不勾、也沒寫：note 是空的，不是空字串
  sent.length = 0;
  win.eval("openVenueSuggest();");
  $('#vsName').value = '高雄夢時代';
  win.eval("document.querySelector('#btnVsSend').click()");
  await tick(win, 3);
  t.eq('什麼都沒勾也送得出去', sent[0]?.row.name, '高雄夢時代');
  t.eq('那一格存成空的，不是空字串', sent[0]?.row.note, null);
  $('#dlgVenueSuggest').close();

  /* 跟行程「加店家」同一個元件，不是兩份長得像的程式 */
  t.ok('兩邊用同一個元件',
    /PA\.picker=mountOfferPicker\(/.test(index) && /VS_PICKER=mountOfferPicker\(/.test(index));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
