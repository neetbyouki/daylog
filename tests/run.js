// Daylog のテストを回す：node tests/run.js [名前 …]（名前を省くと全部）
// 1. 作り物のカレンダー（fixtures/cals.json）で claude.ai 版を tests/.out/daylog.html に作る
// 2. 各テストを tests/.out の中で動かす（画面写真もそこに出る。.out は git に入れない）
// 先に一度：cd tests && npm install && npx playwright install chromium
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const OUT = path.join(__dirname, '.out'); fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.join(__dirname, '..');
const py = process.platform === 'win32' ? 'python' : 'python3';
execFileSync(py, [path.join(ROOT, 'tools/build_claude.py'), path.join(__dirname, 'fixtures/cals.json'), path.join(OUT, 'daylog.html')], { stdio: 'inherit' });
const ALL = require('./suites.json');
const names = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const results = [];
for (const n of names) {
  const r = spawnSync(process.execPath, [path.join(__dirname, n + '.js')], { cwd: OUT, encoding: 'utf8', timeout: 600e3 });
  const out = (r.stdout || '') + (r.stderr || '');
  const ng = out.split('\n').filter(l => l.startsWith('NG'));
  const pass = r.status === 0 && !ng.length && !/SOME NG|Error:/.test(out);
  results.push({ n, pass, ng: ng.length });
  console.log(`${pass ? 'OK ' : 'NG '} ${n}${ng.length ? `（NG ${ng.length}件）` : ''}`);
  if (!pass) console.log(ng.slice(0, 5).join('\n') || out.slice(-800));
}
const bad = results.filter(r => !r.pass);
console.log(bad.length ? `\n${bad.length}個のテストが通らなかった：${bad.map(r => r.n).join(' ')}` : '\nぜんぶ通った');
process.exit(bad.length ? 1 : 0);
