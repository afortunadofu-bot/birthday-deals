// 只是確認 jsdom 開得起來、離線模式開機沒噴錯，harness 本身壞掉時先在這裡看得出來。
const { boot, makeAsserts } = require('./harness');

(async () => {
  const t = makeAsserts('smoke：離線模式開機');
  const { win } = await boot();
  t.ok('種子資料有畫出卡片', win.document.querySelectorAll('.card').length > 0,
    win.document.querySelectorAll('.card').length);
  t.ok('LIVE 為 false（離線）', win.eval('LIVE') === false, win.eval('LIVE'));
  t.ok('待審佇列批次工具列存在', !!win.document.querySelector('#pendBulkBar'));
  t.ok('全選 checkbox 存在', !!win.document.querySelector('#pendSelectAll'));
  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
