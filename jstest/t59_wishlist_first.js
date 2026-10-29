/* v136：待辦清單搬到「我的」最上面

   celine（2026-10-17，問卷回饋）：
   「待辦清單會是生日當月使用最頻繁的，但個人頁面資訊有點多導致我幾次沒辦法
     馬上找到待辦清單」

   本來待辦清單排第 6，前面是問卷、個人資料、推薦給朋友、提醒、幫家人記生日——
   全都是「設定一次就不會再動」的東西，卻擋在每天要看的東西前面。 */
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t59 待辦清單搬到最上面');
  const { win } = await boot();
  const doc = win.document;

  const ids = () => win.eval("blkList('mine').map(el=>el.id)");
  const order = ids();

  t.eq('待辦清單是第一個', order[0], 'wishlistPanel');
  t.eq('它算出來的「註冊死線」跟在後面', order[1], 'planner');
  t.ok('設定一次就不動的那些都排在後面',
    ['surveyPanel', 'profilePanel', 'shareSitePanel', 'altBdayPanel']
      .every((id) => order.indexOf(id) > order.indexOf('wishlistPanel')),
    order.slice(0, 8));
  /* 本來是「至少 18 塊」。v154 把七塊併成兩塊（celine：「block 過多」），所以要守的
     變成：區塊少了，但**原本那十八塊的內容一個都沒有弄丟**——每一個舊 id 都還在
     「我的」裡面，只是有幾個住進了別人的那一塊。 */
  const OLD18 = ['wishlistPanel', 'planner', 'surveyPanel', 'profilePanel', 'layoutPanel',
    'shareSitePanel', 'remindersPanel', 'altBdayPanel', 'mySavingsPanel', 'badgesPanel',
    'myReportsPanel', 'myOffersPanel', 'myFeedbackPanel', 'a2hsPanel', 'freeTierNote',
    'feedbackPanel', 'siteUpdatesPanel', 'devIntroPanel'];
  /* 前三個 id 本身被換掉了（外殼換成 myRecordsPanel），對應的是它們裡面的清單容器 */
  const STILL = { myReportsPanel: 'myReports', myOffersPanel: 'myOffers' };
  const lost = OLD18.filter((id) => !doc.querySelector(`#tab-mine #${STILL[id] || id}`));
  t.eq('原本那十八塊的內容一個都沒有弄丟', lost, []);
  t.ok('區塊數真的變少了', order.length <= 13, order.length);
  t.ok('沒有重複的 id', new Set(order).size === order.length);

  /* 搬動的時候最容易出的事：把區塊從 .wrap 裡搬出去，或搬進別的區塊裡面。 */
  t.ok('兩塊都還在「我的」那一頁的 wrap 底下',
    win.eval(`['wishlistPanel','planner'].every(id=>
      document.querySelector('#tab-mine .wrap').contains(document.getElementById(id))
      && document.getElementById(id).parentElement === document.querySelector('#tab-mine .wrap'))`));
  t.ok('待辦清單裡那顆「看地圖」還在（v120／v127）',
    win.eval("!!document.querySelector('#wishlistPanel .wl-near, #wishlistPanel [id*=\"NearWish\"], #wishlistPanel button')"));

  /* 自己調過順序的人不受影響——版面設定存下來的順序優先 */
  win.eval(`localStorage.setItem('sxr_order_mine', JSON.stringify(
    ['profilePanel','wishlistPanel','planner','surveyPanel']));`);
  win.eval("applyBlockOrder('mine')");
  await tick(win, 1);
  t.eq('自己排過的人，順序照他的', ids()[0], 'profilePanel');
  /* 存檔裡沒有的區塊不會被丟到最後面，而是留在「前一個有存過的」後面
     （blkDesired 刻意這樣寫，不然每次改版都要重排一次）。所以這裡只能驗
     「有存過的那幾個之間的相對順序」，不能驗絕對位置。 */
  const pos = (id) => ids().indexOf(id);
  t.ok('有存過的那幾塊，相對順序照他存的',
    pos('profilePanel') < pos('wishlistPanel')
    && pos('wishlistPanel') < pos('planner')
    && pos('planner') < pos('surveyPanel'),
    ids().slice(0, 10));

  /* 清掉存檔不會把畫面搬回去——沒有存檔就是「維持現狀」。新的預設順序是
     DOM 本身的順序，所以要重開一個乾淨的視窗才驗得到（上面一開始那幾條
     就是在乾淨狀態下驗的）。 */
  win.eval("localStorage.removeItem('sxr_order_mine')");
  const before = ids();
  win.eval("applyBlockOrder('mine')");
  await tick(win, 1);
  t.eq('清掉存檔不會自己亂跳（沒存檔＝維持現狀）', ids(), before);

  t.done();
})();
