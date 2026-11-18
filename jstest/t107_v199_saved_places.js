/* v199 楊晴（11/11）：「附近地圖現在可以自己填地址查詢了！那想問可以有常用地址的收藏嗎？
   就是輸入過一次，然後我按收藏的話，到時候就可以直接用選單選！」 */
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t107 v199 附近的常用地點');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];
  const chips = () => $$('#nearSaved .near-saved-go').map((b) => b.textContent.trim());
  const stored = () => JSON.parse(win.localStorage.getItem('sxr_near_places') || '[]');

  win.localStorage.removeItem('sxr_near_places');
  win.eval(`NEAR_MAP=null; window.__loads=0; loadNear=async()=>{ window.__loads++; }; syncNearMapCenter=()=>{};
    window.__ev=[]; logEvent=(type,meta)=>window.__ev.push(type);
    NEAR.active=true; NEAR.loading=false; NEAR.lat=null; NEAR.lng=null; renderNearBar();`);
  t.ok('還沒有位置、也沒存過：不出現那一排', $('#nearSaved').classList.contains('hidden'));

  // 換地點查到台北車站
  win.eval(`NEAR.lat=25.04776; NEAR.lng=121.51706; NEAR.label='台北車站'; renderNearBar();`);
  t.ok('有位置了：出現「☆ 存這裡」', !$('#nearSaved').classList.contains('hidden') && !!$('#btnNearSave'));
  $('#btnNearSave').click();
  t.eq('按下去：先取名字，預填查到的地名', $('#nearSaveName') && $('#nearSaveName').value, '台北車站');
  $('#nearSaveName').value = '公司';
  $('#btnNearSaveOk').click();
  t.eq('存到這台裝置', stored().map((p) => p.name), ['公司']);
  t.ok('座標存下來了', Math.abs(stored()[0].lat - 25.04776) < 1e-4 && Math.abs(stored()[0].lng - 121.51706) < 1e-4);
  t.eq('出現一顆「公司」', chips(), ['公司']);
  t.ok('現在就在這裡：那顆亮著、不再出現「存這裡」',
    $('#nearSaved .near-saved-chip').classList.contains('on') && !$('#btnNearSave'));
  t.ok('狀態列改寫成「公司」附近', /公司/.test($('#nearStatus').textContent), $('#nearStatus').textContent);

  // 自己的定位：沒有真的地名，輸入框不預填
  win.eval(`NEAR.lat=24.99; NEAR.lng=121.30; NEAR.label='你目前的位置'; renderNearBar();`);
  $('#btnNearSave').click();
  t.eq('自己的定位：名字留空讓人填（提示家、公司）', $('#nearSaveName').value, '');
  t.ok('…有提示', /家/.test($('#nearSaveName').getAttribute('placeholder')));
  // 打到一半，清單重查導致狀態列重畫：打的字不能不見
  $('#nearSaveName').value = '家';
  win.eval(`NEAR.loading=true; renderNearBar(); NEAR.loading=false; renderNearBar();`);
  t.eq('打到一半狀態列重畫：字還在', $('#nearSaveName') && $('#nearSaveName').value, '家');
  $('#nearSaveName').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  t.eq('按 Enter 也能存', stored().map((p) => p.name), ['公司', '家']);

  // 換到別的地方，點「公司」就換回去
  win.eval(`NEAR.lat=22.6; NEAR.lng=120.3; NEAR.label='地圖中間'; window.__loads=0; renderNearBar();`);
  t.eq('兩顆都在', chips(), ['公司', '家']);
  const seq0 = win.eval('NEAR.pickSeq');
  $$('#nearSaved .near-saved-go')[0].click();
  await tick(win);
  t.ok('點「公司」：查詢位置換過去', Math.abs(win.eval('NEAR.lat') - 25.04776) < 1e-4 && win.eval('NEAR.label') === '公司');
  t.eq('…而且重查附近', win.eval('window.__loads'), 1);
  t.ok('定位晚回來不會把它蓋掉（pickSeq 往前推了）', win.eval('NEAR.pickSeq') > seq0);

  // 刪掉
  $$('#nearSaved .near-saved-del')[1].click();
  t.eq('✕ 刪掉「家」', stored().map((p) => p.name), ['公司']);
  t.eq('畫面也少一顆', chips(), ['公司']);

  // 上限 8 個
  win.localStorage.setItem('sxr_near_places', JSON.stringify(
    Array.from({ length: 8 }, (_, i) => ({ name: '點' + i, lat: 23 + i * 0.1, lng: 120 }))));
  let alerted = '';
  win.alert = (m) => { alerted = m; };
  win.eval(`alert=window.alert; NEAR.lat=25.2; NEAR.lng=121.6; NEAR.label='淡水'; renderNearBar();`);
  $('#btnNearSave').click();
  t.ok('存滿 8 個：講清楚要先刪一個', /最多存 8 個/.test(alerted) && !$('#nearSaveName'), alerted);

  // 壞掉的資料不讓整排壞
  win.localStorage.setItem('sxr_near_places', '{壞掉');
  win.eval('renderNearBar()');
  t.eq('存的資料壞掉：當成沒有', chips(), []);

  win.eval('NEAR.active=false; renderNearBar()');
  t.ok('關掉附近：那一排收起來', $('#nearSaved').classList.contains('hidden'));

  t.ok('說明寫清楚只存在這台裝置', /留在這台裝置/.test($('#nearNotes').textContent));

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
