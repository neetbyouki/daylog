// テスト用：今日（論理日・日本時間）と、最初の記録
const fs = require('fs');
const jnow = new Date(Date.now() + 9 * 3600e3 - 6 * 3600e3); const D = jnow.toISOString().slice(0, 10);
const Y = new Date(Date.parse(D) - 864e5).toISOString().slice(0, 10);
const at = (d, h, m = 0) => Date.parse(d + 'T00:00:00+09:00') + ((h < 6 ? 24 : 0) + h) * 3600e3 + m * 6e4;
function seedDocs() {
  const settings = JSON.parse(fs.readFileSync(__dirname + '/fixtures/settings.json')); settings.lastOpenDay = D;
  return [
    ['settings', 'main', settings],
    ['days', D, { date: D, mode: 'good', modeAt: at(D, 10, 12), wakeAt: at(D, 10, 12), morningPlan: { done: true, at: at(D, 10, 20) }, bedtime: { time: '02:30', by: 'calc', reason: 't' }, entries: [{ id: 'a1', t: at(D, 11, 5), text: '最初の記録', mood: 3 }] }],
    ['days', Y, { date: Y, mode: 'good', sleepAt: at(Y, 2, 10), entries: [] }],
  ];
}
module.exports = { D, Y, at, seedDocs };
