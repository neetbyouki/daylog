// カレンダーの月の画面で日を押す → 下にその日の流れ（見るだけ）。過ぎた日は予定の控え（evsnap）で当時のまま
const { chromium } = require('playwright');
const fs = require('fs'); const vm = require('vm');
const { D, Y, at, seedDocs } = require('./common');
const html = fs.readFileSync(__dirname + '/.out/daylog.html', 'utf8');
const sbx = { window: {}, document: { addEventListener() {} }, console };
vm.runInNewContext(fs.readFileSync(__dirname + '/../store.js', 'utf8'), sbx);
const { mergeDoc } = sbx.window.DaylogStore;
const addD = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const F = addD(D, 2), O = addD(D, -5); // 先の日・記録のない昔の日
let clock = Date.now() - 3600e3; const docs = new Map();
const put = (c, id, data) => docs.set(c + '/' + id, { c, id, data, u: (clock = Math.max(clock + 1, Date.now())) });
for (const [c, id, d] of seedDocs()) put(c, id, d);
put('days', Y, { date: Y, mode: 'bad', wakeAt: at(Y, 12, 40), wakeFix: true, sleepAt: at(Y, 9, 8), sleepFix: true, entries: [] });
Object.assign(docs.get('days/' + D).data, { wakeAt: at(D, 12, 46), wakeFix: true });
const calls = [];
function api(req) {
  calls.push(req.a + ':' + (req.c || '') + '/' + (req.id || ''));
  if (req.a === 'load') return [...docs.values()];
  if (req.a === 'since') return [...docs.values()].filter(r => r.u >= req.since);
  if (req.a === 'ids') return [...docs.values()].map(r => ({ c: r.c, id: r.id }));
  if (req.a === 'patch') { const cur = docs.get(req.c + '/' + req.id); put(req.c, req.id, mergeDoc(cur && cur.data, req.patch)); return docs.get(req.c + '/' + req.id).data; }
  if (req.a === 'set') { put(req.c, req.id, req.data); return req.data; }
  if (req.a === 'del') { docs.delete(req.c + '/' + req.id); return true; }
  if (req.a === 'err') return true;
  throw new Error('daylog_api: unknown action');
}

const wrap = j => JSON.stringify({ result: 'Below ... <untrusted-data-u1> boundaries.\n\n<untrusted-data-u1>\n' + JSON.stringify(j) + '\n</untrusted-data-u1>\n\nUse ... <untrusted-data-u1> boundaries.' });
let ok = true; const check = (n, c, x) => { console.log((c ? 'OK  ' : 'NG  ') + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); if (!c) ok = false; };
const fmt = t => new Date(t + 9 * 3600e3).toISOString().slice(5, 16).replace('T', ' ');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ timezoneId: 'Asia/Tokyo', viewport: { width: 420, height: 1200 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date(at(D, 13, 0)));
  await p.exposeFunction('__sql', q => { const m = q.match(/^select api_daylog\.call\((\$d[a-z0-9]+\$)([\s\S]*)\1::jsonb\) as r$/); return wrap([{ r: api(JSON.parse(m[2])) }]); });
  const MOCK = `const mcp = { listTools: async () => ({ servers: [] }), callTool: async (server, tool, a) => {
      if (server === 'Supabase') return { payload: await window.__sql(a.query) };
      if (server === 'Google Calendar') return { payload: tool === 'list_events' ? { events: [] } : { id: 'x' } };
      throw { code: 'server_not_connected' }; } };
    window.claude = { use: async n => (n === 'mcp' ? mcp : n === 'user' ? { isOwner: async () => true } : null) };`;
  const PAGE = '<!doctype html><html><head><meta charset="utf-8"><script>' + MOCK + '</script></head><body>' + html + '</body></html>';
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (u.hostname === 'claude.test') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE }); return r.abort(); });
  await p.goto('https://claude.test/'); await p.waitForTimeout(2500);
  const flowTxt = () => p.evaluate(() => document.querySelector('ul.flow').innerText);
  check('はじめ：27時間ほどに「？」', /睡眠 27時間38分？/.test(await flowTxt()), (await flowTxt()).slice(0, 120));
  const setSleep = async v => {
    await p.click(`.fixbtn[data-arg="sleep:${Y}"]`); await p.waitForTimeout(200);
    await p.fill('#tf-time', v); await p.click('[data-act="timeFixSave"]'); await p.waitForTimeout(600);
    return docs.get('days/' + Y).data.sleepAt;
  };
  let t = await setSleep('09:08'); check('09:08 → 次の日の朝', t === at(D, 9, 8) - 0 && fmt(t).startsWith(D.slice(5)), fmt(t));
  check('睡眠 3時間38分', /睡眠 3時間38分/.test(await flowTxt()) && !/？/.test(await flowTxt()));
  t = await setSleep('02:30'); check('02:30 → 次の日の深夜', fmt(t) === D.slice(5) + ' 02:30', fmt(t));
  t = await setSleep('23:10'); check('23:10 → その日の夜', fmt(t) === Y.slice(5) + ' 23:10', fmt(t));
  t = await setSleep('12:50'); check('起きた12:40より後の12:50 → その日の昼', fmt(t) === Y.slice(5) + ' 12:50', fmt(t));
  t = await setSleep('11:00'); check('起きた12:40より前の11:00 → 次の日の朝', fmt(t) === D.slice(5) + ' 11:00', fmt(t));
  console.log('errs', errs); check('エラーなし', !errs.length);
  console.log(ok ? 'ALL OK' : 'SOME NG');
  await b.close();
})();
