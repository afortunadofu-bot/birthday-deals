/* celine 的四件事（截圖兩張）

   1.「公告看不到標題」——通知列表的標題吃到 .sub-item b 的 76px 欄寬 + ellipsis，
      公告標題被切成「📢 202610…」，根本看不出是哪一則。
   2.「分享榜單跑版」——圖卡高度寫死 980，排行榜一次畫 5 個名次（5×140，從 390 開始
      畫到 1090）直接超出畫布：第 5 名被切掉，頁尾那行字還壓在它身上。
   3.「新增那邊必填要多加地點及證件」——這兩格本來收在「補充更多細節（選填）」裡。
   4.「證件預設是要」。 */
const fs = require('fs');
const path = require('path');
const { boot, tick, makeSb, makeAsserts, stubHeavy } = require('./harness');

const flat = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\s+/g, ' ');

/* 假的 2D context：jsdom 沒有 canvas，但我們要驗的是「東西畫在哪個 y」，
   記下每一次 fillText 就夠了。 */
function fakeCtx() {
  const ops = [];
  const ctx = {
    ops, font: '', fillStyle: '', textAlign: '', globalAlpha: 1,
    scale() {}, fillRect() {}, beginPath() {}, arc() {}, fill() {},
    createLinearGradient() { return { addColorStop() {} }; },
    measureText(s) {
      const px = Number((/(\d+)px/.exec(ctx.font) || [0, 20])[1]);
      return { width: String(s).length * px * 0.95 };   // 中文一個字約一個 em
    },
    fillText(s, x, y) { ops.push({ text: String(s), x, y, font: ctx.font }); },
  };
  return ctx;
}

(async () => {
  const t = makeAsserts('t32 公告標題、圖卡高度、地點與證件必填');
  const { win } = await boot();
  const doc = win.document;
  const $ = (s) => doc.querySelector(s);
  const $$ = (s) => [...doc.querySelectorAll(s)];

  /* ================= 1. 公告看不到標題 ================= */
  const LONG = '2026/10/04 系統延遲與無法登入的說明';
  win.__sb = makeSb({
    tables: {
      notifications: [
        { id: 1, kind: 'announcement', title: LONG, body_preview: '團隊已完成排查與修復。',
          created_at: '2026-10-05T08:24:00Z', read_at: null },
        { id: 2, kind: 'feedback_reply', body_preview: '你回報的內容我們已經處理完成，謝謝提供！',
          created_at: '2026-10-06T03:30:00Z', read_at: null },
        { id: 3, kind: 'comment', offer_id: 7, brand: '粥大福 JOUK', actor_name: 'Ｙ',
          body_preview: '一個內用一個外帶', created_at: '2026-10-01T12:19:00Z', read_at: '2026-10-02T00:00:00Z' },
      ],
    },
    rpcs: { mark_notifications_read: { data: null, error: null } },
  });
  win.eval('sb = window.__sb; LIVE = true; me = {id:"u-1"};');
  await win.openNotifDialog();
  await tick(win, 4);

  const rows = $$('#notifList .sub-item');
  t.eq('三則通知都列出來', rows.length, 3);
  t.ok('公告標題一個字都沒少', rows[0].querySelector('b').textContent.includes(LONG),
    rows[0].querySelector('b').textContent);
  t.ok('通知列不吃兩欄版面（標題獨佔一行）', rows.every((r) => r.classList.contains('notif-item')));
  t.ok('標題不再被切成 76px 的一行',
    flat.includes('.notif-item>b{display:block;width:auto;white-space:normal;overflow:visible;'));
  t.ok('時間還在', /2026-10-05/.test(rows[0].textContent), rows[0].textContent.replace(/\s+/g, ' '));
  t.ok('留言通知照樣點得開優惠', rows[2].classList.contains('notif-row') && rows[2].dataset.offer === '7');
  t.ok('沒讀過的還是有底色', /accent-soft/.test(rows[0].getAttribute('style') || ''));

  /* ================= 2. 分享榜單跑版 ================= */
  let painted = null;
  win.HTMLCanvasElement.prototype.getContext = function () {
    if (!this.__ctx) this.__ctx = fakeCtx();
    return this.__ctx;
  };
  win.HTMLCanvasElement.prototype.toBlob = function (cb) {
    painted = this;                       // 真正畫的那張（量版面的那張不會走到這裡）
    cb(new win.Blob(['x'], { type: 'image/png' }));
  };

  const FOOT = '一起找生日優惠，去壽星日看看吧';
  const card = (n) => ({
    emoji: '🏆', title: '2026 年 08 月 省錢排行榜',
    sub: '2026 年 08 月　2026-10-06 製作', footer: FOOT,
    lines: Array.from({ length: n }, (_, i) => ({ label: `第 ${i + 1} 名　某某`, value: `$${3416 - i * 40}` })),
  });

  await win.drawStatsCard(card(5));
  const H5 = painted.height / 2;          // 畫布開了 2 倍解析度
  const ops5 = painted.__ctx.ops;
  const foot5 = ops5.find((o) => o.text === FOOT);
  const lastValue = ops5.filter((o) => /^\$/.test(o.text)).pop();

  t.ok('五個名次全部畫得進畫布', ops5.every((o) => o.y <= H5), `畫布高 ${H5}，最低的字在 ${Math.max(...ops5.map((o) => o.y))}`);
  t.ok('第 5 名沒有被切掉', lastValue.y + 54 < H5, `第5名的數字畫在 ${lastValue.y}，畫布高 ${H5}`);
  t.ok('頁尾那行字沒有壓在名次上', foot5.y > lastValue.y + 54, `頁尾 ${foot5.y}、第5名 ${lastValue.y}`);
  t.ok('頁尾也在畫布裡', foot5.y < H5);
  t.ok('五個名次都真的畫了', ops5.filter((o) => /^\$/.test(o.text)).length === 5);
  t.ok('年份日期那行還在', ops5.some((o) => /2026-10-06/.test(o.text)));

  // 只有一兩行的舊圖卡要跟以前一模一樣，不能因為這次改動變高
  await win.drawStatsCard({ emoji: '🎉', title: '我的省錢成果', sub: '總累積　2026-10-06 製作',
    lines: [{ label: '總共省下', value: '$12,480' }], footer: FOOT });
  t.eq('一行的圖卡高度維持 980（沒被這次修改動到）', painted.height / 2, 980);

  // 標題折成兩行時，下面的東西要跟著往下讓，不是疊上去
  await win.drawStatsCard(card(5));
  const base = painted.height / 2;
  await win.drawStatsCard({ ...card(5), title: '2026 年 08 月 省錢排行榜 本月最會省的前五名是這幾位' });
  t.ok('標題折行時畫布跟著變高', painted.height / 2 >= base, `${painted.height / 2} vs ${base}`);
  t.ok('折行後一樣沒有東西掉出畫布',
    painted.__ctx.ops.every((o) => o.y <= painted.height / 2));

  /* ================= 3+4. 地點與證件：必填、證件預設「要」 ================= */
  const moreFields = $('#moreFields');
  t.ok('適用縣市搬出「補充更多細節」了', !moreFields.contains($('#fRegions')));
  t.ok('證件也搬出來了', !moreFields.contains($('#fSubmitTransferable')));
  t.ok('兩格都標了必填 *',
    /適用縣市 \*/.test(flat) && /需要本人出示證件嗎？ \*/.test(flat));

  win.resetSubmitForm();
  const sel = $('#fSubmitTransferable');
  t.eq('證件預設就是「要」', sel.value, 'no');
  t.eq('第一個選項就是「要」（清空表單後會回到這個）', sel.options[0].value, 'no');
  t.ok('「尚未確認」不讓人新選（但舊資料顯示得出來）',
    [...sel.options].find((o) => o.value === 'unknown').disabled);

  // 一筆都沒選縣市 → 擋下來，不送出
  const sb2 = makeSb({ tables: { offers: [] } });
  win.__sb = sb2;
  win.eval('sb = window.__sb; LIVE = true; me = {id:"u-1"}; myProfile = {id:"u-1", is_admin:false}; OFFERS = []; PENDING_PREVIEW = [];');
  stubHeavy(win, ['loadMyStuff', 'logEvent', 'loadOffers', 'render']);
  const f = $('#submitForm').elements;
  f.brand.value = '測試早餐店'; f.offer.value = '生日當月送豆漿';
  f.category.value = f.category.options[0].value;
  f.timing.value = f.timing.options[0].value;
  f.membership_type.value = f.membership_type.options[0].value;
  f.free_tier.value = f.free_tier.options[0].value;

  const submit = () => { $('#submitForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true })); };
  submit();
  await tick(win, 4);
  t.eq('沒選縣市就不會送出', sb2.__calls.write.length, 0);
  t.ok('而且講清楚要選哪一格', /適用縣市/.test($('#submitMsg').textContent), $('#submitMsg').textContent);
  t.ok('送出鈕沒有被卡在 disabled', !$('#btnSubmitOffer').disabled);

  // 選了「全台」就能送，而且證件預設值真的會存進去
  $$('#fRegions .chip').find((c) => c.dataset.r === '全台').click();
  submit();
  await tick(win, 4);
  const ins = sb2.__calls.write.filter((w) => w.table === 'offers' && w.op === 'insert');
  t.eq('選了縣市就送得出去', ins.length, 1);
  t.eq('縣市有跟著送出', ins[0].args[0].regions, ['全台']);
  t.eq('證件存的是「要本人出示」', ins[0].args[0].transferable, 'no');

  process.exit(t.done() ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
