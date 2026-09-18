/* 使用者回饋的幾個小改動

   1. 內文可以換行：優惠內容、條件在卡片跟詳情保留換行（條列式 1. 2. 3. 比較好讀）
   2. 「折扣」跟「買一送一」拆開：篩選多一個「買一送一」、卡片有標籤
   3. 需同行的說明改成「例如內用買一送一」
   4. 「可轉讓」改成直接講「要不要本人出示證件」 */
const { boot, tick, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('t16 換行／買一送一／用語');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);

  /* ---- 1. 換行 ---- */
  const css = [...doc.querySelectorAll('style')].map((x) => x.textContent).join(' ');
  t.ok('卡片的優惠內容保留換行', /\.card p\.offer[^{]*\{white-space:pre-line\}/.test(css));
  t.ok('卡片的條件保留換行', /\.card dl\.kv dd[^{]*\{white-space:pre-line\}/.test(css));
  t.ok('表單提示可以換行、寫成 1. 2. 3.', /1\. 2\. 3\./.test($('#submitForm').textContent));
  const o = win.eval('OFFERS[0]');
  win.eval(`OFFERS[0].conditions = '1. 需 4 人以上\\n2. 每桌限用一次';`);
  win.render();
  await tick(win, 1);
  // 卡片（如果 OFFERS[0] 在目前列表裡）跟詳情都要把換行原封不動放進畫面，交給 CSS 顯示
  const dd = [...doc.querySelectorAll('#grid .card dl.kv dd')].find((x) => /每桌限用一次/.test(x.textContent));
  const factBox = doc.createElement('div');
  factBox.innerHTML = win.offerFactsHtml(win.eval('OFFERS[0]'));
  const fact = [...factBox.querySelectorAll('.fact-v')].find((x) => /每桌限用一次/.test(x.textContent));
  t.ok('換行原封不動放進畫面（卡片、詳情都是）',
    (!dd || dd.textContent.includes('\n')) && !!fact && fact.textContent.includes('\n'), fact && fact.textContent);

  /* ---- 2. 買一送一 ---- */
  const labels = win.eval('FREE_LABEL');
  t.eq('免費層級多一個買一送一、折扣獨立', [labels.bogo, labels.discount], ['買一送一', '折扣']);
  t.ok('篩選多一個「買一送一」', [...doc.querySelectorAll('#freeChips .chip')].some((c) => /買一送一/.test(c.textContent) && c.dataset.v === 'bogo'));
  t.ok('投稿表單也選得到', [...doc.querySelectorAll('#fFreeTier option')].some((x) => x.value === 'bogo'));
  win.eval(`OFFERS[0].freeTier = 'bogo';`);
  win.render();
  await tick(win, 1);
  t.ok('卡片標出買一送一', [...doc.querySelectorAll('#grid .card .flag')].some((f) => f.textContent === '買一送一'));

  /* ---- 3. 需同行 ---- */
  t.ok('需同行的說明改成內用買一送一', /例如內用買一送一/.test(doc.querySelector('#fRequiresCompanion').parentElement.textContent));

  /* ---- 4. 要不要本人出示證件 ---- */
  t.ok('篩選改成「不用本人出示證件」', /不用本人出示證件/.test($('#fTransferable').parentElement.textContent));
  t.ok('表單直接問要不要本人出示證件', /需要本人出示證件嗎/.test($('#fSubmitTransferable').closest('.field').textContent));
  // 只看畫面上的字（排除程式碼裡的註解）
  const visible = doc.body.cloneNode(true);
  visible.querySelectorAll('script, style').forEach((x) => x.remove());
  t.ok('畫面上不再出現「可轉讓」', !/可轉讓/.test(visible.textContent), (visible.textContent.match(/.{10}可轉讓.{10}/) || [''])[0]);

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
