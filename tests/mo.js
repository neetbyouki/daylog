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
put('days', addD(Y, -1), { date: addD(Y, -1), sleepAt: at(addD(Y, -1), 3, 30), entries: [] });
const y = docs.get('days/' + Y).data;
Object.assign(y, { mode: 'bad', wakeAt: at(Y, 12, 40), bedtime: { time: '03:00', by: 'calc' }, close: { at: at(Y, 3, 40), mood: 3, body: 2 }, habits: { bath: true, bathAt: at(Y, 18, 0) },
  entries: [{ id: 'y1', t: at(Y, 15, 22), text: 'なんかしんどい', mood: 2, body: 2 }, { id: 'y2', t: at(Y, 18, 7), text: '⏱ テロップ入れ（20分）' }, { id: 'y3', t: at(Y, 21, 35), text: 'テストプレイ参加した' }] });
put('pc', Y, { date: Y, first: at(Y, 12, 40), last: at(Y, 5, 23), activeMinutes: 700, gameMinutes: 181, games: { 'VALORANT-Win64-Shipping': 181 }, naps: [],
  sessions: [{ g: 'VALORANT-Win64-Shipping', from: at(Y, 15, 47), to: at(Y, 17, 19), min: 92 }, { g: 'VALORANT-Win64-Shipping', from: at(Y, 3, 54), to: at(Y, 5, 23), min: 89 }] });
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
const ev = (id, title, d, h1, m1, h2, m2) => ({ id, summary: title, start: { dateTime: new Date(at(d, h1, m1)).toISOString() }, end: { dateTime: new Date(at(d, h2, m2)).toISOString() } });
const EVS = [ev('p1', '動画編集', Y, 14, 0, 16, 0), ev('p2', 'サムネ制作', Y, 16, 0, 17, 0), ev('p3', '参加型', Y, 22, 0, 2, 0), ev('t1', '買い物', D, 13, 0, 14, 0), ev('f1', '打ち合わせ', F, 15, 0, 16, 0), ev('o1', '昔の予定', O, 15, 0, 16, 0)];
const wrap = j => JSON.stringify({ result: 'Below ... <untrusted-data-u1> boundaries.\n\n<untrusted-data-u1>\n' + JSON.stringify(j) + '\n</untrusted-data-u1>\n\nUse ... <untrusted-data-u1> boundaries.' });
let ok = true; const check = (n, c, x) => { console.log((c ? 'OK  ' : 'NG  ') + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); if (!c) ok = false; };
(async () => {
  const b = await chromium.launch();
  const W = Number(process.env.W || 420);
  const ctx = await b.newContext({ timezoneId: 'Asia/Tokyo', viewport: { width: W, height: 900 }, deviceScaleFactor: Number(process.env.DSF || 1) });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date(at(D, 15, 20)));
  await p.exposeFunction('__sql', q => { const m = q.match(/^select api_daylog\.call\((\$d[a-z0-9]+\$)([\s\S]*)\1::jsonb\) as r$/); return wrap([{ r: api(JSON.parse(m[2])) }]); });
  const MOCK = `window.__EVS = ${JSON.stringify(EVS)}; window.__gcal = [];
    const mcp = { listTools: async () => ({ servers: [] }), callTool: async (server, tool, a) => {
      if (server === 'Supabase') return { payload: await window.__sql(a.query) };
      if (server === 'Google Calendar') { if (tool === 'list_events') { window.__gcal.push(a.startTime); const f = Date.parse(a.startTime), t = Date.parse(a.endTime);
        return { payload: { events: a.calendarId.startsWith('test-app') ? window.__EVS.filter(e => Date.parse(e.start.dateTime) < t && Date.parse(e.end.dateTime) > f) : [] } }; } return { payload: { id: 'x' + Date.now() } }; }
      throw { code: 'server_not_connected' }; } };
    window.claude = { use: async n => (n === 'mcp' ? mcp : n === 'user' ? { isOwner: async () => true } : null) };`;
  const PAGE = '<!doctype html><html><head><meta charset="utf-8"><script>' + MOCK + '</script></head><body>' + html + '</body></html>';
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (u.hostname === 'claude.test') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE }); return r.abort(); });
  await p.goto('https://claude.test/'); await p.waitForTimeout(2500);
  // 今日の分の控えができている
  check('今日の予定の控え', docs.get('days/' + D).data.evsnap && docs.get('days/' + D).data.evsnap.list.map(x => x.title).join(',') === '買い物', docs.get('days/' + D).data.evsnap);
  await p.click('.nav button[data-arg="cal"]'); await p.waitForTimeout(300);
  await p.click('button[data-act="calMode"][data-arg="month"]'); await p.waitForTimeout(800);
  const cell = d => `.mo-c[data-arg="${d}"]`;
  if (!(await p.$(cell(Y)))) await p.click('button[data-act="calMove"][data-arg="-1"]'), await p.waitForTimeout(800);
  await p.click(cell(Y)); await p.waitForTimeout(1200);
  const txt = await p.evaluate(() => { const s = document.querySelector('#mo-day'); return s ? s.innerText : ''; });
  check('選んだ日の流れが出る', /この日の流れ/.test(txt) && /動画編集/.test(txt) && /なんかしんどい/.test(txt) && /起きた/.test(txt), txt.slice(0, 400));
  check('睡眠のまとまり（寝た→起きた）', /睡眠/.test(txt) && /起きた/.test(txt));
  check('体調・ゲーム・締め・習慣のチップ', await p.evaluate(() => [...document.querySelectorAll('.md-chip')].map(x => x.textContent.trim())).then(a => (console.log('  chips', a), a.some(x => /不調/.test(x)) && a.some(x => /3時間1分/.test(x)) && a.some(x => /締め/.test(x)) && a.some(x => /お風呂/.test(x)))));
  check('見るだけ（⋯・✎・予定の⋯なし）', await p.evaluate(() => { const s = document.querySelector('#mo-day'); return !s.querySelector('.more, .fixbtn, .evmore'); }));
  check('ゲームの帯（2本・後ろは目安を過ぎて濃い）', await p.evaluate(() => { const s = document.querySelector('#mo-day'); return [s.querySelectorAll('.gm-band:not(.late)').length, s.querySelectorAll('.gm-band.late').length, s.querySelectorAll('.gm-chip').length]; }).then(a => (console.log('  bands', a), a[0] === 2 && a[1] === 1 && a[2] === 2)));
  check('過ぎた日の控え（あとから作った印）', (() => { const s = docs.get('days/' + Y).data.evsnap; return s && s.late && s.list.length === 3; })(), docs.get('days/' + Y).data.evsnap);
  check('選んだ日の見出しまで流れる', await p.evaluate(() => { const r = document.querySelector('#mo-day').getBoundingClientRect(); return r.top >= -2 && r.top < 60; }), await p.evaluate(() => Math.round(document.querySelector('#mo-day').getBoundingClientRect().top)));
  await p.setViewportSize({ width: W, height: 2000 }); await p.waitForTimeout(400);
  { const el = await p.$('#mo-day'); await el.screenshot({ path: process.env.OUT || 'mo.png' }); }
  await p.setViewportSize({ width: W, height: 900 }); await p.waitForTimeout(200);
  // カレンダーで予定を動かしても、過ぎた日の流れは当時のまま。読みにも行かない
  await p.evaluate(() => { const e = window.__EVS.find(x => x.id === 'p1'); e.start.dateTime = new Date(Date.parse(e.start.dateTime) + 5 * 3600e3).toISOString(); e.end.dateTime = new Date(Date.parse(e.end.dateTime) + 5 * 3600e3).toISOString(); window.__gcal = []; });
  await p.click(cell(Y)); await p.waitForTimeout(200); await p.click(cell(Y)); await p.waitForTimeout(800);
  const t2 = await p.evaluate(() => document.querySelector('#mo-day').innerText);
  check('動かしたあとも14:00の動画編集', /14:00[\s\S]{0,40}動画編集/.test(t2), t2.slice(0, 300));
  check('控えがある日は読みに行かない', (await p.evaluate(y => window.__gcal.filter(s => s.startsWith(y)).length, Y)) === 0);
  check('その日の予定のまま の印', /その日のまま/.test(t2));
  // 記録のない昔の日：控えを作らない（docs を増やさない）
  await p.click(cell(O)).catch(() => {}); await p.waitForTimeout(800);
  check('昔の日には days を作らない', !docs.has('days/' + O));
  // 先の日
  if (await p.$(cell(F))) { await p.click(cell(F)); await p.waitForTimeout(800); const t3 = await p.evaluate(() => document.querySelector('#mo-day').innerText); check('先の日の予定', /打ち合わせ/.test(t3) && /日後/.test(t3), t3.slice(0, 200)); check('先の日に控えを作らない', !docs.has('days/' + F)); }
  // 今日
  await p.click(cell(D)); await p.waitForTimeout(800);
  const t4 = await p.evaluate(() => document.querySelector('#mo-day').innerText);
  check('今日を選ぶと今日の流れ（いま）', /今日の流れ/.test(t4) && /いま/.test(t4) && /買い物/.test(t4));
  // 今日の予定が変わったら控えも変わる
  await p.evaluate(() => { window.__EVS.push({ id: 't2', summary: '散歩', start: { dateTime: new Date(Date.now() + 3600e3).toISOString() }, end: { dateTime: new Date(Date.now() + 7200e3).toISOString() } }); });
  await p.click('.nav button[data-arg="today"]'); await p.waitForTimeout(300); await p.click('button[data-act="reloadEvents"]'); await p.waitForTimeout(800);
  check('今日の控えが新しくなる', docs.get('days/' + D).data.evsnap.list.map(x => x.title).join(',') === '買い物,散歩');
  check('今日の画面は今まで通り（⋯あり）', await p.evaluate(() => !!document.querySelector('.flow .more') && !document.querySelector('.flow.ro')));
  console.log('errs', errs);
  check('エラーなし', !errs.length);
  console.log(ok ? 'ALL OK' : 'SOME NG');
  await b.close();
})();
