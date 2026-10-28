/* v140：排行榜的灰色小字剪短；回報完先問評分

   celine（看著排行榜的截圖）：
   「灰色小字太多　心裡有不一樣的底不用寫　然後記得提醒使用完優惠可以評分」 */
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t63 小字剪短＋回報完提醒評分');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const subOf = (id) => {
    const p = $('#' + id + ' p.sub');
    return p ? p.textContent.replace(/\s+/g, ' ').trim() : '';
  };

  /* ---- 1. 灰色小字 ---- */
  t.ok('「心裡要有不一樣的底」拿掉了', !subOf('pnlTopRated').includes('心裡'));
  t.ok('右邊兩欄的解釋也拿掉（欄位標題本來就寫著）',
    !subOf('pnlTopRated').includes('右邊兩欄'));
  t.ok('但「至少兩個人評過才上榜」要留著（那是會影響判讀的規則）',
    /兩個人/.test(subOf('pnlTopRated')));
  t.ok('「用過之後給幾顆星」也留著', /給幾顆星/.test(subOf('pnlTopRated')));

  const long = ['pnlBoardStats', 'pnlBoardInsights', 'pnlRecentActivity', 'pnlPopular',
                'pnlWished', 'pnlTopRated', 'pnlLb', 'pnlContrib']
    .map((id) => [id, subOf(id).length]).filter(([, n]) => n > 40);
  t.eq('排行榜每一塊的小字都在 40 字以內', long, []);

  t.ok('省錢榜還是有講暱稱可以關（那是使用者真的會想知道的）',
    /暱稱/.test(subOf('pnlLb')));
  t.ok('貢獻榜還是有講「退回的不算」', /退回/.test(subOf('pnlContrib')));

  /* ---- 2. 回報完的提示 ---- */
  const src = win.eval('String(openDetail)');
  t.ok('會算「這個人能不能評分」', /const canRate = !!me && !MY_RATED\.has/.test(src));
  t.ok('能評分的人，整句話只講評分', /給它幾顆星/.test(src));
  t.ok('不能評分的人換一句（不要叫他做他做不到的事）',
    /canRate \? '<b>用得還順利嗎/.test(src) && /要不要留個言說說好不好用/.test(src));
  t.ok('評分按鈕也跟著同一個條件', /\$\{canRate\?`<button[^`]*id="btnInlineRate"/.test(src));
  t.ok('能評分時「留言」就不是主要按鈕（不要兩顆都搶）',
    /class="btn sm\$\{canRate\?'':' primary'\}" id="btnInlineComment"/.test(src));
  t.ok('已經評過的人不會再被問評分',
    src.indexOf('MY_RATED.has') > 0 && /已經評過|canRate/.test(src));

  t.done();
})();
