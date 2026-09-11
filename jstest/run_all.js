/* 一次跑完整批迴歸測試。每支測試各自開一個乾淨的 jsdom（互相不污染狀態，
   例如 ADMIN_EMAIL_CACHE 這種 module 層級的 cache），所以是分行程跑，
   不是 require 進來跑。有任何一支失敗就以非 0 結束，方便之後接 CI。 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const files = fs.readdirSync(__dirname)
  .filter((f) => /^t\d+_.*\.js$/.test(f))
  .sort();

// _smoke 先跑：harness 自己壞掉時，這支會第一個亮紅燈，不用去猜是哪支測試的問題
files.unshift('_smoke.js');

let failed = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: '--no-warnings' },
  });
  if (r.status !== 0) failed.push(f);
}

console.log('\n=========================================');
if (failed.length) {
  console.log(`FAILED ${failed.length}/${files.length}：${failed.join(', ')}`);
  process.exit(1);
}
console.log(`ALL PASS（${files.length} 支）`);
process.exit(0);
