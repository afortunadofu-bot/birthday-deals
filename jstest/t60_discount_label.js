/* v137：「折扣」那一格把實際折數標出來

   使用者陳（2026-10-09，問題回報）：
   「很多優惠層級是折扣但都被選錯成其他的，或許可以在折扣後面括號標示
     (如：打9折、折100元) 之類的，讓篩選功能真正達到分類目的~」

   「折扣」本來在卡片上**什麼都不顯示**（其他三種都有標籤，只有它沒有），
   所以 180 筆折扣長得一模一樣，篩出來也分不出哪個划算。

   這支的重點不是「讀得出幾筆」，是**不要讀錯**——標錯數字比不標更糟。 */
const fs = require('fs');
const path = require('path');
const { makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t60 折扣標出實際折數');
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const a = src.indexOf('const RE_ZHE='), b = src.indexOf('function fromRow(r){return{');
  t.ok('找得到這段（之後搬家的話這支要跟著改）', a > 0 && b > a);
  const label = new Function(src.slice(a, b) + '; return discountLabel;')();

  /* ---- 讀得出來的 ---- */
  t.eq('打幾折', label('當月壽星全桌9折'), '9折');
  t.eq('兩位數的折數', label('單筆消費88折'), '88折');
  t.eq('小數點', label('全單 8.5 折'), '8.5折');
  t.eq('「起」要留著（不然會看起來比實際便宜）', label('生日券5折起'), '5折起');
  t.eq('半價', label('飲品半價 + 生日餐盤'), '半價');
  t.eq('折多少錢', label('單筆消費滿 $500 折 $100'), '折 $100');
  t.eq('數字寫在前面的講法', label('生日禮金 $20 折價券'), '折 $20');
  t.eq('「NNN元優惠券」', label('當月壽星300元優惠券'), '折 $300');

  /* ---- 踩過的坑 ---- */
  t.eq('「96折」不可以讀成「6折」（只抓一位數就會錯）', label('96折優惠券'), '96折');
  t.eq('「$20 折價券」不是「20 折」', label('生日禮金 $20 折價券'), '折 $20');
  t.eq('「折扣」「折抵」是一般用詞，不是折數', label('生日優惠折扣券乙張'), '');
  t.eq('一段話裡好幾種折數就不標（標哪個都在誤導）',
    label('4 位以下 85 折、4 位以上 65 折'), '');
  t.eq('好幾個折抵金額也不標', label('滿1000折100、滿2000折300'), '');
  t.eq('沒提到折數就不要猜', label('會員憑券可兌換唐揚雞塊'), '');
  t.eq('空的不會爆', label(''), '');
  t.eq('null 不會爆', label(null), '');

  /* ---- 卡片上真的有用到 ---- */
  t.ok('卡片上「折扣」現在有標籤了（本來是空字串）',
    /o\.freeTier==='discount'\?`<span class="flag">折扣\$\{discountLabel\(o\.offer\)/.test(src));
  t.ok('詳情視窗也有', (src.match(/折扣\$\{discountLabel\(o\.offer\)/g) || []).length >= 2);
  t.ok('讀出來的字有跳脫（內文是使用者投稿的）',
    /esc\(discountLabel\(o\.offer\)\)/.test(src));

  /* ---- 拿線上那 180 筆跑一次，確定沒有整批失效 ---- */
  const data = path.join(__dirname, 'fixtures', 'offers_tier.json');
  if (fs.existsSync(data)) {
    const rows = JSON.parse(fs.readFileSync(data, 'utf8')).filter((r) => r.free_tier === 'discount');
    const got = rows.filter((r) => label(r.offer)).length;
    t.ok(`線上 ${rows.length} 筆折扣，讀得出來 ${got} 筆（六成上下才正常）`,
      got / rows.length > 0.5 && got / rows.length < 0.8, got);
  }

  t.done();
})();
