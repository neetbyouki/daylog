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
  const ctx = await b.newContext({ timezoneId: 'Asia/Tokyo', viewport: { width: 420, height: 900 } });
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
      if (server === 'Google Calendar') { if (tool === 'list_events') return { payload: { events: a.calendarId.startsWith('test-app') ? window.__EVS : [] } }; (window.__calls = window.__calls || []).push({ tool, a }); if (tool === 'update_event') { const e = window.__EVS.find(x => x.id === a.eventId); if (e) { e.start = { dateTime: new Date(a.startTime).toISOString() }; e.end = { dateTime: new Date(a.endTime).toISOString() }; } } return { payload: { id: 'x' + Date.now() } }; }
      throw { code: 'server_not_connected' }; } };
    window.claude = { use: async n => (n === 'mcp' ? mcp : n === 'user' ? { isOwner: async () => true } : null) };
  `;
  const PAGE = '<!doctype html><html><head><meta charset="utf-8"><script>' + MOCK + '</script></head><body>' + html + '</body></html>';
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (u.hostname === 'claude.test') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE }); return r.abort(); });
  await p.goto('https://claude.test/');
  await p.waitForTimeout(2500);

  const R = []; const ok = (n, c, x = '') => R.push([c ? 'OK ' : 'NG ', n, x]);
  const q = sel => p.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : null; }, sel);
  const calls = () => p.evaluate(() => (window.__calls || []).splice(0));
  const box = async sel => (await p.$(sel)).boundingBox();
  const drag = async (x0, y0, x1, y1, steps = 12) => { await p.mouse.move(x0, y0); await p.mouse.down(); for (let i = 1; i <= steps; i++) { await p.mouse.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await p.waitForTimeout(16); } await p.waitForTimeout(80); };
  // ── タスク
  await p.click('[data-act="go"][data-arg="tasks"]'); await p.waitForTimeout(400);
  for (const t of ['あ：構成', 'い：撮影', 'う：編集', 'え：投稿']) { await p.fill('#task-title', t); await p.keyboard.press('Enter'); await p.waitForTimeout(150); }
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  const order = () => p.evaluate(() => [...document.querySelectorAll('ul.tasks > li.task .title')].map(x => x.firstChild.textContent.trim().slice(0, 1)).join(''));
  const o0 = await order();
  ok('タスクの行に ⠿（つまむ所）がある', await p.evaluate(() => document.querySelectorAll('ul.tasks .grip').length >= 4), o0);
  { const g = await box('ul.tasks > li.task:nth-child(4) .grip'), f = await box('ul.tasks > li.task:nth-child(1)');
    await drag(g.x + g.width / 2, g.y + g.height / 2, g.x + g.width / 2, f.y + 6);
    ok('ドラッグ中はつまんだ行が浮き、ほかの行がよける', await p.evaluate(() => !!document.querySelector('li.task.lifted') && [...document.querySelectorAll('ul.tasks > li.task')].some(r => /translateY\(\d/.test(r.style.transform))));
    await p.screenshot({ path: 'dg-task.png', clip: { x: 0, y: 0, width: 420, height: 700 } });
    await p.mouse.up(); await p.waitForTimeout(500); }
  const o1 = await order();
  ok('4番目を一番上へ動かせる', o1 === o0.slice(3) + o0.slice(0, 3), o0 + ' → ' + o1);
  ok('順番はサーバーにも残る（order）', [...docs.values()].filter(r => r.c === 'tasks' && r.data.order != null).length >= 4);
  ok('ドラッグのあと、タスクが開いたりしない', !(await p.$('ul.steps')));
  { const g = await box('ul.tasks > li.task:nth-child(1) .grip'), f = await box('ul.tasks > li.task:nth-child(3)');
    await drag(g.x + g.width / 2, g.y + g.height / 2, g.x + g.width / 2, f.y + f.height - 4); await p.mouse.up(); await p.waitForTimeout(500); }
  const o2 = await order(); ok('下へも動かせる（間に入る）', o2 === o1[1] + o1[2] + o1[0] + o1[3], o1 + ' → ' + o2);
  await p.reload(); await p.waitForTimeout(2500); await p.click('[data-act="go"][data-arg="tasks"]'); await p.waitForTimeout(400);
  ok('開き直しても並びが残る', (await order()) === o2, await order());
  ok('「締切順に戻す」が出る', !!(await p.$('[data-act="taskAutoOrder"]')));
  // 指（長押し）でも
  { const t = await box('ul.tasks > li.task:nth-child(4) .title'), f = await box('ul.tasks > li.task:nth-child(1)');
    const cdp = await ctx.newCDPSession(p); const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await tp('touchStart', t.x + 20, t.y + t.height / 2); await p.waitForTimeout(500);
    for (let i = 1; i <= 10; i++) { await tp('touchMove', t.x + 20, t.y + t.height / 2 + (f.y + 4 - t.y - t.height / 2) * i / 10); await p.waitForTimeout(20); }
    await p.waitForTimeout(80); await tp('touchEnd', 0, 0); await p.waitForTimeout(500);
    const o3 = await order(); ok('指で長押ししてから動かしても並べかえられる', o3 === o2[3] + o2.slice(0, 3), o2 + ' → ' + o3); }
  // ── カレンダー（週）
  await p.click('[data-act="go"][data-arg="cal"]'); await p.waitForTimeout(1500); await calls();
  const ev1 = '.wk-ev[data-drag$="|e1"]';
  ok('週の予定に、上下の端（つまむ所）がある', await p.evaluate(s => { const e = document.querySelector(s); return !!e && !!e.querySelector('.rz-t') && !!e.querySelector('.rz-b'); }, ev1));
  await p.evaluate(() => { const w = document.querySelector('#wk-scroll'); w.scrollTop = 4 * 44; }); await p.waitForTimeout(200);
  { const b = await box(ev1); await drag(b.x + b.width / 2, b.y + b.height / 2, b.x + b.width / 2, b.y + b.height / 2 + 88);
    ok('ドラッグ中は時刻が出る', (await q('.drag-time')) === '15:00–16:00', await q('.drag-time'));
    await p.screenshot({ path: 'dg-week.png' }); await p.mouse.up(); await p.waitForTimeout(800); }
  let c = await calls(); let u = c.find(x => x.tool === 'update_event');
  ok('予定を2時間あとへ動かせる（Googleカレンダーへ）', u && u.a.startTime.endsWith('T15:00:00') && u.a.endTime.endsWith('T16:00:00') && u.a.eventId === 'e1', JSON.stringify(u && u.a));
  ok('動かしたあと「元に戻す」が出る', /元に戻す/.test(await q('#app-toast')), await q('#app-toast'));
  await p.click('[data-act="undo"]'); await p.waitForTimeout(800); c = await calls(); u = c.find(x => x.tool === 'update_event');
  ok('元に戻すと、前の時刻へ', u && u.a.startTime.endsWith('T13:00:00'), JSON.stringify(u && u.a));
  await p.waitForTimeout(1200);
  { const b = await box(ev1 + ' .rz-b'); await drag(b.x + b.width / 2, b.y + b.height / 2, b.x + b.width / 2, b.y + b.height / 2 + 44); await p.mouse.up(); await p.waitForTimeout(800); }
  c = await calls(); u = c.find(x => x.tool === 'update_event');
  ok('下の端をつまむと終わりだけ変わる', u && u.a.startTime.endsWith('T13:00:00') && u.a.endTime.endsWith('T15:00:00'), JSON.stringify(u && u.a)); await p.waitForTimeout(1200);
  { const b = await box(ev1 + ' .rz-t'); await drag(b.x + b.width / 2, b.y + b.height / 2, b.x + b.width / 2, b.y + b.height / 2 - 22); await p.mouse.up(); await p.waitForTimeout(800); }
  c = await calls(); u = c.find(x => x.tool === 'update_event');
  ok('上の端をつまむと始まりだけ変わる', u && u.a.startTime.endsWith('T12:30:00') && u.a.endTime.endsWith('T15:00:00'), JSON.stringify(u && u.a)); await p.waitForTimeout(1200);
  { const b = await box(ev1); const col = await p.evaluate(s => { const cs = [...document.querySelectorAll('.wk-col')]; const i = cs.indexOf(document.querySelector(s).parentElement); return i; }, ev1);
    if (col < 6) { await drag(b.x + b.width / 2, b.y + 8, b.x + b.width / 2 + (b.width + 4), b.y + 8); await p.mouse.up(); await p.waitForTimeout(800); c = await calls(); u = c.find(x => x.tool === 'update_event');
      ok('横へ動かすと次の日へ（時刻はそのまま）', !!u && u.a.startTime.endsWith('T12:30:00') && u.a.startTime.slice(0, 10) > D, JSON.stringify(u && u.a)); await p.waitForTimeout(1200); } }
  // タップは今まで通り開く
  await calls(); await p.click(ev1); await p.waitForTimeout(400);
  ok('動かさずに押すと予定が開く', !!(await p.$('#cs-title')) && (await calls()).length === 0); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  // ── 今日の流れ：ドラッグでは動かさない（押すと開くだけ）
  await p.click('[data-act="go"][data-arg="today"]'); await p.waitForTimeout(1500); await calls();
  ok('今日の流れの予定にはドラッグの端がない', await p.evaluate(() => !document.querySelector('ul.flow [data-drag], ul.flow .rz')));
  { const h = await box('ul.flow li.ev .ev-head'); await drag(h.x + 30, h.y + 10, h.x + 30, h.y + 10 + 72); await p.mouse.up(); await p.waitForTimeout(800); }
  c = await calls(); ok('今日の流れでつまんで動かしても、予定は変わらない', !c.some(x => x.tool === 'update_event'), JSON.stringify(c.map(x => x.tool)));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok('ページのエラーなし', errs.length === 0, errs.join(' | '));
  for (const r of R) console.log(r.join(' '));
  await b.close();
})();
