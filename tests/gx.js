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
  const ctx = await b.newContext({ timezoneId: 'Asia/Tokyo', viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
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
  const W = +(process.env.W || 420);
  await p.setViewportSize({ width: W, height: 900 });
  const t0 = Date.now(); await p.click('[data-act="go"][data-arg="sky"]'); await p.waitForSelector('.gx'); console.log('open ms', Date.now() - t0);
  await p.evaluate(() => window.DaylogGalaxy._quality(1));
  const dbg = () => p.evaluate(() => JSON.stringify(window.DaylogGalaxy._debug()));
  const shot = async n => { const el = await p.$('.skybox'); await el.screenshot({ path: 'gx-' + n + '.png' }); };
  await p.waitForTimeout(1600); console.log('month', await dbg()); await shot('month');
  await p.screenshot({ path: 'gx-page.png' });
  console.log('hud', await p.evaluate(() => document.querySelector('.gx-title').textContent + ' | ' + document.querySelector('.gx-sub').textContent));
  // 日へ
  const hit = await p.evaluate(() => { const d = window.DaylogGalaxy._debug(); return d.hits; });
  await p.evaluate(d => document.querySelector('[data-act="skyToday"]').click(), null); await p.waitForTimeout(450); await shot('to-day-mid'); await p.waitForTimeout(1500); console.log('day', await dbg()); await shot('day');
  console.log('hud', await p.evaluate(() => document.querySelector('.gx-title').textContent + ' | ' + document.querySelector('.gx-sub').textContent));
  // 目盛りで10日を選ぶ → 星をタップ
  { const rb = await (await p.$('.gx-rail')).boundingBox(); const x = rb.x + 12 + (rb.width - 24) * (9.5 / 30), y = rb.y + 30; await p.mouse.move(x, y); await p.waitForTimeout(250); await shot('rail-hover'); console.log('hover hud', await p.evaluate(() => document.querySelector('.gx-title').textContent + ' | ' + document.querySelector('.gx-sub').textContent)); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(350); await shot('day-pan-mid'); await p.waitForTimeout(1400); await shot('day10');
    const st = await p.evaluate(() => 1); const gb = await (await p.$('.gx-gl')).boundingBox(); }

  const box = await (await p.$('.gx-gl')).boundingBox();
  await p.click('.gx-back'); await p.waitForTimeout(1300); await p.click('.gx-back'); await p.waitForTimeout(500); await shot('to-uni-mid'); await p.waitForTimeout(1200); console.log('uni', await dbg()); await shot('universe');
  console.log('hud', await p.evaluate(() => document.querySelector('.gx-title').textContent + ' | ' + document.querySelector('.gx-sub').textContent));
  console.log('errors', errs.length ? errs : 'none');
  await b.close();
})();
