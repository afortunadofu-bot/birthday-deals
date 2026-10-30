/* v134：地圖上的橘點按不到、按到了資訊又很快消失

   使用者陳（2026-10-16，問卷回饋，滿意度 5／推薦 10）：
   「有地圖看附近優惠超方便！不過橘點有時候較難按(會觸發成圖釘)，
     或是按到橘點後顯示的資訊很快就消失得再按一次橘點」

   問卷的「最希望接下來加什麼」第一名就是「找離我最近的分店」（99 人、34%）
   —— 那個功能已經做好了，所以按不到才更可惜。

   兩件事其實是同一條因果：
     按偏了 → 地圖的 click → 換查詢位置 → 重查分店 → paintNearPins()
     → clearLayers() → 剛打開的 popup 跟著被清掉 */
const fs = require('fs');
const path = require('path');
const { makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t57 地圖橘點按得到、資訊留得住');
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const paint = src.slice(src.indexOf('function paintNearPins()'),
                          src.indexOf('$(\'#btnNear\').onclick'));

  // 1. 判定範圍
  t.ok('每個點都鋪一圈看不見的大判定圈', /radius:16,weight:0,opacity:0,fillOpacity:0/.test(paint));
  t.ok('判定圈有 fillColor（SVG 要有 fill 才吃得到點擊）',
    /fillOpacity:0,\s*[\r\n ]*fillColor/.test(paint));
  /* v159 把點的顏色跟大小抽成 PIN_STYLE（附近的地圖跟商圈的地圖共用），
     原始碼裡就找不到「r:10}」了——問那個常數本身。v163 在後面多了一種 used，
     所以每一種各自找，不要求整個物件剛好長那樣。 */
  const r = (k) => { const m = src.match(new RegExp(k + ':\\{[^}]*r:(\\d+)\\}')); return m ? Number(m[1]) : undefined; };
  const pin = { wished: { r: r('wished') }, normal: { r: r('normal') } };
  t.ok('看得見的點也變大了（7/9 → 8/10）', pin.wished.r === 10 && pin.normal.r === 8, JSON.stringify(pin));
  t.ok('附近的地圖用的是那個共用的常數', /PIN_STYLE\.wished : PIN_STYLE\.normal/.test(paint));
  t.ok('判定圈先畫、在看得見的點下面',
    paint.indexOf('radius:16') < paint.indexOf('radius:c.r'));

  // 2. 按偏了不要順手換位置
  const init = src.slice(src.indexOf('NEAR_MAP=L.map('), src.indexOf('function closeNearMap'));
  t.ok('有 popup 開著時，按地圖只關掉它、不換查詢位置',
    /if\(NEAR_MAP\._popup\)\{ NEAR_MAP\.closePopup\(\); return; \}/.test(init));
  t.ok('沒有 popup 時照舊可以點地圖換位置', /setNearCenter\(e\.latlng\.lat/.test(init));

  // 3. 資訊不要自己消失
  t.ok('popup 不會被「按一下地圖」關掉', /closeOnClick:false/.test(paint));
  t.ok('重畫前先記住開著的是哪一家', /const reopen=NEAR_POPUP_KEY;/.test(paint));
  t.ok('重畫後再把它開回來', /if\(dot\._sxKey===reopen\) dot\.openPopup\(\);/.test(paint));
  t.ok('關掉時要把記號清掉（不然下次重畫會自己跳出來）',
    /popupclose'[\s\S]{0,60}NEAR_POPUP_KEY=''/.test(init));
  t.ok('打開時記下是哪一家', /NEAR_POPUP_KEY=e\.popup\._source\?\._sxKey/.test(init));

  // 4. 不要讓點擊冒泡到地圖（冒上去就等於又換了一次位置）
  t.eq('兩個圈都擋掉冒泡', (paint.match(/bubblingMouseEvents:false/g) || []).length, 2);

  t.done();
})();
