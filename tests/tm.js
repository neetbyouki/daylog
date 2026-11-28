// claude.ai版のテスト：Supabaseには api_daylog.call の形だけを送るか／同時書き込み／オフライン／時刻を直す
const { chromium } = require('playwright');
const fs = require('fs'); const vm = require('vm');
const { D, Y, at, seedDocs } = require('./common');
const html = fs.readFileSync(__dirname + '/.out/daylog.html', 'utf8');
const sbx = { window: {}, document: { addEventListener() {} }, console };
vm.runInNewContext(fs.readFileSync(__dirname + '/../store.js', 'utf8'), sbx);
const { mergeDoc } = sbx.window.DaylogStore;
// サーバー役（api_daylog.call と同じ動き。足し合わせは store.js の mergeDoc = SQL と同じ決まり）
let clock = Date.now() - 3600e3; const docs = new Map();
const put = (c, id, data) => docs.set(c + '/' + id, { c, id, data, u: (clock = Math.max(clock + 1, Date.now())) });
for (const [c, id, d] of seedDocs()) put(c, id, d);
{ // 今月と先月に、ばらつきのある記録を入れる
  const R = (() => { let a = 12345; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })();
  const dn = Number(D.slice(8)); const modes = ['good', 'normal', 'good', 'bad', 'normal', 'rest', 'good'];
  for (let back = 1; back < 75; back++) {
    const dd = new Date(Date.parse(D) - back * 864e5).toISOString().slice(0, 10); if (R() < 0.22) continue;
    const n = 1 + Math.floor(R() * 9), entries = [];
    for (let i = 0; i < n; i++) entries.push({ id: 'x' + back + '_' + i, t: at(dd, 10 + Math.floor(R() * 14), Math.floor(R() * 60)), text: '記録 ' + i, mood: 1 + Math.floor(R() * 5) });
    entries.sort((a, b) => a.t - b.t);
    const day = { date: dd, mode: modes[Math.floor(R() * modes.length)], entries, wakeAt: at(dd, 10, 5) };
    if (R() < 0.6) { day.habits = { bath: true, bathAt: at(dd, 19, 10) }; }
    if (R() < 0.7) day.close = { done: true, at: at(dd, 1, 30), name: 'しずかな舟座', text: 'よく眠れそう' };
    put('days', dd, day);
  }
  put('goals', 'g1', { id: 'g1', scope: 'month', period: D.slice(0, 7), title: '動画を1本出す', status: 'open', createdAt: 1 });
  put('goals', 'g2', { id: 'g2', scope: 'month', period: D.slice(0, 7), title: '朝の散歩', status: 'done', createdAt: 2, doneAt: Date.now() - 864e5 });
  put('tasks', 't1', { id: 't1', title: '構成を書く', status: 'done', goalId: 'g1', doneAt: Date.now() - 2 * 864e5, createdAt: 1 });
  put('tasks', 't2', { id: 't2', title: '撮影', status: 'done', goalId: 'g1', doneAt: Date.now() - 864e5, createdAt: 2 });
  put('tasks', 't3', { id: 't3', title: '編集', status: 'open', goalId: 'g1', createdAt: 3 });
}

const queries = []; let netDown = false; let fails = 0;
function api(req) {
  if (req.a === 'load') return [...docs.values()];
  if (req.a === 'since') return [...docs.values()].filter(r => r.u >= req.since);
  if (req.a === 'ids') return [...docs.values()].map(r => ({ c: r.c, id: r.id }));
  if (req.a === 'patch') { const cur = docs.get(req.c + '/' + req.id); put(req.c, req.id, mergeDoc(cur && cur.data, req.patch)); return docs.get(req.c + '/' + req.id).data; }
  if (req.a === 'set') { const cur = docs.get(req.c + '/' + req.id); const data = req.c === 'days' && cur ? { ...req.data, entries: mergeDoc(cur.data, { entries: req.data.entries || [] }).entries } : req.data; put(req.c, req.id, data); return data; }
  if (req.a === 'del') { docs.delete(req.c + '/' + req.id); return true; }
  throw new Error('daylog_api: unknown action');
}
const ev = (id, title, d, h1, m1, h2, m2) => ({ id, summary: title, start: { dateTime: new Date(at(d, h1, m1)).toISOString() }, end: { dateTime: new Date(at(d, h2, m2)).toISOString() } });
const EVS = [ev('e1', 'メルカリ出品', D, 13, 0, 14, 0), ev('e2', '動画編集', D, 16, 0, 18, 0), ev('bed1', '🌙 就寝の目安', D, 2, 30, 2, 45), ev('bed0', '🌙 就寝', D, 23, 50, 0, 5)];
const wrap = j => JSON.stringify({ result: 'Below ... <untrusted-data-u1> boundaries.\n\n<untrusted-data-u1>\n' + JSON.stringify(j) + '\n</untrusted-data-u1>\n\nUse ... <untrusted-data-u1> boundaries.' });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ timezoneId: 'Asia/Tokyo', viewport: { width: 420, height: 900 }, deviceScaleFactor: 2, reducedMotion: process.env.MODE === 'rm' ? 'reduce' : 'no-preference' });
  if (process.env.MODE === 'nogl') await ctx.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); }; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.exposeFunction('__sql', q => {
    queries.push(q);
    if (netDown) { fails++; throw new Error('network error: fetch failed'); }
    const m = q.match(/^select api_daylog\.call\((\$d[a-z0-9]+\$)([\s\S]*)\1::jsonb\) as r$/);
    if (!m) throw new Error('bad shape');
    return wrap([{ r: api(JSON.parse(m[2])) }]);
  });
  const MOCK = `window.__EVS = ${JSON.stringify(EVS)};
    const mcp = { listTools: async () => ({ servers: [] }), callTool: async (server, tool, a) => {
      if (server === 'Supabase') { try { return { payload: await window.__sql(a.query) }; } catch (e) { throw { code: 'tool_error', message: String(e.message || e) }; } }
      if (server === 'Google Calendar') { if (tool === 'list_events') return { payload: { events: a.calendarId.startsWith('test-app') ? window.__EVS : [] } }; return { payload: { id: 'x' + Date.now() } }; }
      throw { code: 'server_not_connected' }; } };
    window.claude = { use: async n => (n === 'mcp' ? mcp : n === 'user' ? { isOwner: async () => true } : null) };
  `;
  const PAGE = '<!doctype html><html><head><meta charset="utf-8"><script>' + MOCK + '</script></head><body>' + html + '</body></html>';
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (u.hostname === 'claude.test') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE }); return r.abort(); });
  await p.goto('https://claude.test/');
  await p.waitForTimeout(2500);
  const text = () => p.evaluate(() => document.body.innerText);
  const R = []; const ok = (n, c, x = '') => R.push([c ? 'OK ' : 'NG ', n, x]);
  const q = sel => p.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : null; }, sel);
  ok('今日の画面にはタイマーのボタンを出さない（動いていない間）', !(await p.$('.tm-btn')));
  await p.click('[data-act="go"][data-arg="tasks"]'); await p.waitForTimeout(400);
  ok('タスクの画面の右上にタイマーのボタン', (await q('.top .tm-btn')) === 'タイマー');
  await p.screenshot({ path: 'tm-tasks.png', clip: { x: 0, y: 0, width: 420, height: 200 } });
  await p.click('.tm-btn'); await p.waitForTimeout(400);
  ok('全画面で開く', await p.evaluate(() => { const o = document.querySelector('.overlay.tm').getBoundingClientRect(); return o.width === innerWidth && o.height === innerHeight; }));
  ok('目的を書くまで始められない', await p.evaluate(() => document.querySelector('#tm-start').getAttribute('aria-disabled') === 'true' && !document.querySelector('#tm-need').hidden));
  await p.screenshot({ path: 'tm-idle.png' });
  await p.click('#tm-start', { force: true }); await p.waitForTimeout(60);
  ok('目的なしで▶を押すと欄が揺れる', await p.evaluate(() => document.querySelector('#tm-purpose').classList.contains('shake') && document.activeElement.id === 'tm-purpose'));
  await p.waitForTimeout(400); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  ok('目的なしでは押してもEnterでも始まらない', await p.evaluate(() => !!document.querySelector('#tm-purpose')));
  for (const [v, t] of [[300, '05:00'], [1800, '30:00'], [3600, '1:00:00'], [900, '15:00']]) { await p.click(`[data-act="timerSet"][data-arg="${v}"]`); await p.waitForTimeout(120); ok('すぐ選べる ' + t, (await q('#tm-digits')) === t); }
  await p.click('[data-act="timerAdj"][data-arg="60"]'); await p.waitForTimeout(100); ok('1分ずつ足せる', (await q('#tm-digits')) === '16:00');
  await p.click('[data-act="timerSet"][data-arg="300"]');
  await p.fill('#tm-purpose', '   '); ok('空白だけでは始められない', await p.evaluate(() => document.querySelector('#tm-start').getAttribute('aria-disabled') === 'true'));
  await p.fill('#tm-purpose', '動画の構成を書く'); ok('目的を書くと始めるボタンが使える', await p.evaluate(() => document.querySelector('#tm-start').getAttribute('aria-disabled') === 'false' && document.querySelector('#tm-need').hidden));
  await p.click('#tm-start'); await p.waitForTimeout(2300);
  const d1 = await q('#tm-digits'); ok('数字が減っていく', d1 === '04:58' || d1 === '04:57', d1);
  ok('動いている間のボタンはアイコンだけ（名前は読み上げ用に付いている）', await p.evaluate(() => [...document.querySelectorAll('.tm .tm-ic')].every(b => b.getAttribute('aria-label') && (b.querySelector('svg') || /^[＋−]\d$/.test(b.textContent.trim())))), await p.evaluate(() => [...document.querySelectorAll('.tm .tm-ic')].map(b => b.getAttribute('aria-label') + ':' + b.textContent.trim()).join(' / ')));
  ok('円が減っていく', await p.evaluate(() => { const a = document.querySelector('#tm-arc'); return +a.getAttribute('stroke-dashoffset') > 2 && +a.getAttribute('stroke-dashoffset') < 12; }), await p.evaluate(() => document.querySelector('#tm-arc').getAttribute('stroke-dashoffset')));
  ok('目的が表示される', (await q('.tm-what')).trim() === '動画の構成を書く');
  await p.screenshot({ path: 'tm-run.png' });
  await p.click('[data-act="timerClose"]'); await p.waitForTimeout(300);
  ok('戻るで閉じる。タスクの画面に残り時間', !(await p.$('.overlay.tm')) && /^04:5\d$/.test(await q('.top .tm-btn')), await q('.top .tm-btn'));
  await p.click('[data-act="go"][data-arg="today"]'); await p.waitForTimeout(1300);
  const c1 = await q('.top .tm-btn'); await p.waitForTimeout(1200); const c2 = await q('.top .tm-btn');
  ok('ほかの画面でも残り時間が出て、進む', /^04:5\d$/.test(c1) && c1 !== c2, c1 + ' → ' + c2);
  await p.screenshot({ path: 'tm-chip.png', clip: { x: 0, y: 0, width: 420, height: 120 } });
  await p.reload(); await p.waitForTimeout(2500);
  ok('開き直しても続いている', /^04:[45]\d$/.test(await q('.top .tm-btn')), await q('.top .tm-btn'));
  await p.click('.tm-btn'); await p.waitForTimeout(300); await p.click('[data-act="timerPause"]'); await p.waitForTimeout(300); const p1 = await q('#tm-digits'); await p.waitForTimeout(1300);
  ok('一時停止で止まる', (await q('#tm-digits')) === p1 && (await q('#tm-state')) === '一時停止中');
  await p.click('[data-act="timerPause"]'); await p.waitForTimeout(1300); ok('再開で進む', (await q('#tm-digits')) !== p1);
  // 途中でやめる → やった分を記録
  const before = await p.evaluate(() => { const t = JSON.parse(localStorage.getItem('daylog-timer')); return t.dur; });
  await p.evaluate(() => { const t = JSON.parse(localStorage.getItem('daylog-timer')); t.endAt = Date.now() + 180500; localStorage.setItem('daylog-timer', JSON.stringify(t)); }); await p.reload(); await p.waitForTimeout(1500); await p.click('.tm-btn'); await p.waitForTimeout(300);
  await p.click('[data-act="timerStop"]'); await p.waitForTimeout(300);
  ok('途中でやめると、やった時間が出る', /^02:0\d$/.test(await q('#tm-digits')) && (await q('.tm-center')).includes('5分のうち'), (await q('.tm-center')).replace(/\n/g, ' '));
  await p.screenshot({ path: 'tm-early.png' });
  ok('途中でやめたら「続ける」が出る', !!(await p.$('[data-act="timerResume"]')));
  await p.click('[data-act="timerResume"]'); await p.waitForTimeout(400); ok('続けると残りから再開', /^0[23]:\d\d$/.test(await q('#tm-digits')) && !!(await p.$('[data-act="timerStop"]')), await q('#tm-digits'));
  await p.click('[data-act="timerStop"]'); await p.waitForTimeout(300);
  await p.click('[data-act="timerLog"]'); await p.waitForTimeout(400);
  ok('やった分を記録したら「続ける」は消える（二重に記録しない）', !(await p.$('[data-act="timerResume"]')) && await p.evaluate(() => document.querySelector('[data-act="timerLog"]').disabled));
  await p.click('[data-act="timerReset"]'); await p.waitForTimeout(200); await p.fill('#tm-purpose', '動画の構成を書く'); await p.click('[data-act="timerSet"][data-arg="300"]'); await p.click('#tm-start'); await p.waitForTimeout(300);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200); ok('Escでも閉じる', !(await p.$('.overlay.tm')));
  // 終わり：残りを2秒にして待つ
  await p.evaluate(() => { const t = JSON.parse(localStorage.getItem('daylog-timer')); t.endAt = Date.now() + 2000; localStorage.setItem('daylog-timer', JSON.stringify(t)); }); await p.reload(); await p.waitForTimeout(5200);
  ok('終わると自動で全画面が開く（やった時間を表示）', (await q('#tm-state')) === 'おつかれさま' && (await q('#tm-digits')) === '05:00', (await q('#tm-state')) + '');
  await p.screenshot({ path: 'tm-done.png' });
  await p.click('[data-act="timerLog"]'); await p.waitForTimeout(400); ok('記録に残すは1回だけ', await p.evaluate(() => document.querySelector('[data-act="timerLog"]').disabled));
  await p.click('[data-act="timerReset"]'); await p.waitForTimeout(300); ok('次のタイマーは目的が空から', await p.evaluate(() => document.querySelector('#tm-purpose').value === '' && document.querySelector('#tm-start').getAttribute('aria-disabled') === 'true'));
  await p.click('[data-act="timerClose"]'); await p.waitForTimeout(600);
  ok('今日の流れに記録が入る（途中でやめた分も）', (await q('#app-main')).includes('⏱ 動画の構成を書く（5分）') && (await q('#app-main')).includes('⏱ 動画の構成を書く（2分 / 予定5分）'), (await q('#app-main')).match(/⏱[^\n]*/g) + '');
  ok('動いていなければ、ほかの画面のボタンは消える', !(await p.$('.tm-btn')));
  // メモ：改行できる
  await p.click('[data-act="go"][data-arg="memos"]').catch(() => {}); await p.waitForTimeout(400);
  if (await p.$('#memo-text')) {
    await p.click('#memo-text'); await p.keyboard.type('買うもの'); await p.keyboard.press('Enter'); await p.keyboard.type('・牛乳'); await p.keyboard.press('Enter'); await p.keyboard.type('・電池');
    ok('メモはEnterで改行（置かれない）', (await p.evaluate(() => document.querySelector('#memo-text').value)) === '買うもの\n・牛乳\n・電池' && !(await p.$('.memo .txt')));
    ok('書いた分だけ欄が伸びる', await p.evaluate(() => document.querySelector('#memo-text').offsetHeight > 60), await p.evaluate(() => document.querySelector('#memo-text').offsetHeight));
    await p.screenshot({ path: 'memo-typing.png', clip: { x: 0, y: 0, width: 420, height: 320 } });
    await p.keyboard.press('Control+Enter'); await p.waitForTimeout(300);
    ok('Ctrl+Enterで置ける。改行が残る', (await p.evaluate(() => document.querySelector('.memo .txt').firstChild.textContent)) === '買うもの\n・牛乳\n・電池', JSON.stringify(await p.evaluate(() => document.querySelector('.memo .txt').firstChild.textContent)));
    await p.fill('#memo-text', '二行目のある\nメモ'); await p.click('[data-act="memoAdd"]'); await p.waitForTimeout(300);
    ok('＋ボタンでも置ける', (await p.evaluate(() => document.querySelector('.memo .txt').firstChild.textContent)) === '二行目のある\nメモ');
    await p.screenshot({ path: 'memo-list.png', clip: { x: 0, y: 0, width: 420, height: 420 } });
  } else ok('メモの画面が見つからない', false, await p.evaluate(() => [...document.querySelectorAll('[data-act=go]')].map(b => b.dataset.arg).join(',')));
  ok('ページのエラーなし', errs.length === 0, errs.join(' | '));
  for (const r of R) console.log(r.join(' '));
  console.log('errors', errs.length ? errs : 'none');
  await b.close();
})();
