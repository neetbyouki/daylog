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
const ad = (id, title, sd, ed) => ({ id, summary: title, start: { date: sd }, end: { date: ed } });
const addD = (s, n) => new Date(Date.parse(s) + n * 864e5).toISOString().slice(0, 10);
const EVS = [ev('e1', 'メルカリ出品', D, 13, 0, 14, 0), ev('e2', '動画編集', D, 16, 0, 18, 0), ad('a1', '勤労感謝の日', D, addD(D, 1)), ad('a2', '大阪の遊園地マップ 納品週', addD(D, -1), addD(D, 3)), ad('a3', '明日の終日', addD(D, 1), addD(D, 2)), ad('a4', '昨日まで', addD(D, -2), D)];
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
      if (server === 'Google Calendar') { if (tool === 'list_events') return { payload: { events: a.calendarId.startsWith('test-app') ? window.__EVS : [] } }; return { payload: { id: 'x' + Date.now() } }; }
      throw { code: 'server_not_connected' }; } };
    window.claude = { use: async n => (n === 'mcp' ? mcp : n === 'user' ? { isOwner: async () => true } : null) };
  `;
  const PAGE = '<!doctype html><html><head><meta charset="utf-8"><script>' + MOCK + '</script></head><body>' + html + '</body></html>';
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (u.hostname === 'claude.test') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE }); return r.abort(); });
  await p.goto('https://claude.test/');
  await p.waitForTimeout(2500);
  const text = () => p.evaluate(() => document.body.innerText);
  await p.screenshot({ path: 'allday-today.png', clip: { x: 0, y: 0, width: 420, height: 420 } });
  console.log('band', await p.evaluate(() => [...document.querySelectorAll('.allday-band .ad')].map(x => x.getAttribute('aria-label'))));
  console.log('old chips', await p.evaluate(() => document.querySelectorAll('.allday').length));
  await p.click('.allday-band .ad'); await p.waitForTimeout(500); console.log('sheet', (await p.evaluate(() => (document.querySelector('.sheet, [role=dialog]') || {}).innerText || 'none')).slice(0, 160).replace(/\n+/g, ' | '));
  await p.screenshot({ path: 'allday-sheet.png' });
  await p.keyboard.press('Escape'); await p.evaluate(() => document.documentElement.classList.add('classic')); await p.waitForTimeout(200);
  await p.screenshot({ path: 'allday-classic.png', clip: { x: 0, y: 0, width: 420, height: 300 } });
  await p.setViewportSize({ width: 340, height: 800 }); await p.evaluate(() => document.documentElement.classList.remove('classic')); await p.waitForTimeout(300);
  await p.screenshot({ path: 'allday-340.png', clip: { x: 0, y: 0, width: 340, height: 300 } });
  console.log('errors', errs.length ? errs : 'none');
  await b.close();
})();
