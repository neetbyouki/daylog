// タイマーの終わりを、閉じていても通知できるように timer/<端末> に置く
const { chromium } = require('playwright');
const fs = require('fs'); const vm = require('vm');
const { seedDocs, D } = require('./common');
const html = fs.readFileSync(__dirname + '/.out/daylog.html', 'utf8');
const sbx = { window: {}, document: { addEventListener() {} }, console };
vm.runInNewContext(fs.readFileSync(__dirname + '/../store.js', 'utf8'), sbx);
const { mergeDoc } = sbx.window.DaylogStore;
let clock = Date.now() - 3600e3; const docs = new Map(); const errRows = []; let errId = 1;
const put = (c, id, data) => docs.set(c + '/' + id, { c, id, data, u: (clock = Math.max(clock + 1, Date.now())) });
for (const [c, id, d] of seedDocs()) put(c, id, d);
put('notes', 'n1', { title: '画像つき', html: '<p>a</p><img data-blob="b1">', text: 'a', imgs: ['b1'], updatedAt: Date.now(), createdAt: Date.now() });
put('blobs', 'b1', { id: 'b1', mime: 'image/png', src: 'data:image/png;base64,AAAA' });
put('blobs', 'b2', { id: 'b2', mime: 'image/jpeg', path: 'u/b2.jpg', size: 3 * 1024 * 1024 + 300 * 1024 });
put('meta', 'backup', { ok: true, at: Date.now() - 86400e3, reason: 'weekly', file: { name: 'Daylog-x.json', size: 52000 }, reqAt: 0 });
function api(req) {
  if (req.a === 'load') return [...docs.values()].filter(r => r.c !== 'blobs');
  if (req.a === 'since') return [...docs.values()].filter(r => r.c !== 'blobs' && r.u >= req.since);
  if (req.a === 'ids') return [...docs.values()].filter(r => r.c !== 'blobs').map(r => ({ c: r.c, id: r.id }));
  if (req.a === 'get') return req.ids.map(id => docs.get(req.c + '/' + id)).filter(Boolean);
  if (req.a === 'patch') { const cur = docs.get(req.c + '/' + req.id); put(req.c, req.id, mergeDoc(cur && cur.data, req.patch)); return docs.get(req.c + '/' + req.id).data; }
  if (req.a === 'set') { put(req.c, req.id, req.data); return req.data; }
  if (req.a === 'del') { docs.delete(req.c + '/' + req.id); return true; }
  if (req.a === 'err') { if (req.rows.length > 20) throw new Error('daylog_api: bad err'); req.rows.forEach(r => errRows.push({ ...r, id: errId++, at: Date.now(), seen: r.t })); return true; }
  if (req.a === 'errs') return errRows.slice().reverse().map(({ ua, ...r }) => r);
  if (req.a === 'imgstat') { const bl = [...docs.values()].filter(r => r.c === 'blobs'); return { n: bl.length, bytes: bl.reduce((a, r) => a + (r.data.size || 0), 0) }; }
  if (req.a === 'errclear') { errRows.length = 0; return true; }
  throw new Error('daylog_api: unknown action');
}
const wrap = j => JSON.stringify({ result: 'Below ... <untrusted-data-u1> boundaries.\n\n<untrusted-data-u1>\n' + JSON.stringify(j) + '\n</untrusted-data-u1>\n\nUse ...' });
let saved = null; let fail = 0; const ok = (m, c, x = '') => { console.log((c ? 'OK  ' : 'NG  ') + m + ' ' + x); if (!c) fail++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ timezoneId: 'Asia/Tokyo', viewport: { width: 420, height: 900 } });
  const p = await ctx.newPage(); const perr = []; p.on('pageerror', e => perr.push(e.message));
  await p.exposeFunction('__sql', q => { const m = q.match(/^select api_daylog\.call\((\$d[a-z0-9]+\$)([\s\S]*)\1::jsonb\) as r$/); if (!m) throw new Error('bad shape'); return wrap([{ r: api(JSON.parse(m[2])) }]); });
  await p.exposeFunction('__save', o => { saved = o; return true; });
  const MOCK = `const mcp = { listTools: async () => ({ servers: [] }), callTool: async (server, tool, a) => {
      if (server === 'Supabase') { try { return { payload: await window.__sql(a.query) }; } catch (e) { throw { code: 'tool_error', message: String(e.message || e) }; } }
      if (server === 'Google Calendar') return { payload: { events: [] } };
      throw { code: 'server_not_connected' }; } };
    window.claude = { use: async n => (n === 'mcp' ? mcp : n === 'user' ? { isOwner: async () => true } : n === 'downloads' ? { save: o => window.__save(o) } : null) };`;
  const PAGE = '<!doctype html><html><head><meta charset="utf-8"><script>' + MOCK + '</script></head><body>' + html + '</body></html>';
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (u.hostname === 'claude.test') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE }); return r.abort(); });
  await p.goto('https://claude.test/'); await p.waitForTimeout(2500);
  const tdoc = () => [...docs.values()].find(r => r.c === 'timer');
  ok('開いただけでは置かない（動いていない）', !tdoc() || tdoc().data.state === 'idle', JSON.stringify(tdoc() && tdoc().data));
  await p.click('[data-act="go"][data-arg="tasks"]'); await p.waitForTimeout(300);
  await p.click('[data-act="timerOpen"]'); await p.waitForTimeout(300);
  await p.fill('#tm-purpose', '動画のサムネを作る'); await p.click('[data-act="timerSet"][data-arg="900"]'); await p.waitForTimeout(100);
  const t0 = Date.now(); await p.click('[data-act="timerStart"]'); await p.waitForTimeout(1500);
  let t = tdoc();
  ok('始めると、終わりの時刻と目的を置く', t && t.data.state === 'run' && Math.abs(t.data.endAt - (t0 + 900e3)) < 3000 && t.data.purpose === '動画のサムネを作る' && t.data.dur === 900 && /^timer$/.test(t.c) && /^d/.test(t.id), JSON.stringify(t && { id: t.id, ...t.data }));
  await p.click('[data-act="timerPause"]'); await p.waitForTimeout(1200);
  t = tdoc(); ok('一時停止すると、終わりの時刻を消す（通知しない）', t.data.state === 'pause' && t.data.endAt === 0);
  await p.click('[data-act="timerPause"]'); await p.waitForTimeout(1200);
  t = tdoc(); ok('再開すると、新しい終わりの時刻', t.data.state === 'run' && t.data.endAt > Date.now() + 800e3);
  await p.click('[data-act="timerAdd"][data-arg="60"]'); await p.waitForTimeout(1200);
  const e2 = tdoc().data.endAt; ok('＋1分で終わりの時刻ものびる', e2 > t.data.endAt + 55e3, `${e2 - t.data.endAt}`);
  await p.click('[data-act="timerStop"]'); await p.waitForTimeout(1200);
  t = tdoc(); ok('やめると、通知しない状態に', t.data.state !== 'run' && t.data.endAt === 0, JSON.stringify(t.data));
  ok('ページのエラーなし', perr.length === 0, perr.join(' / '));
  await b.close(); console.log(fail ? `NG ${fail}` : 'ALL OK'); process.exit(fail ? 1 : 0);
})();
