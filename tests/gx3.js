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
  const MODE = process.env.MODE || 'tap';
  await p.click('[data-act="go"][data-arg="sky"]'); await p.waitForTimeout(1800);
  const dbg = () => p.evaluate(() => window.DaylogGalaxy._debug());
  if (MODE === 'nogl') {
    ok('WebGLが使えない端末では前の描きかたで出る', await p.evaluate(() => !!document.querySelector('#sky') && !document.querySelector('.gx') && window.DaylogGalaxy.dead === true));
    const bb = await (await p.$('#sky')).boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(400);
    ok('前の描きかたでもタップで動く・エラーなし', errs.length === 0, errs.join('|'));
    await (await p.$('.skybox')).screenshot({ path: 'gx-fallback.png' });
  } else if (MODE === 'rm') {
    const d0 = await dbg(); ok('動きを減らす設定：すぐ月の画面', d0.level === 'month' && Math.abs(d0.z - d0.Zm) < 0.01 && d0.fade === 1 && !d0.raf, JSON.stringify(d0));
    await p.click('[data-act="skyToday"]'); await p.waitForTimeout(250); const d1 = await dbg(); ok('動きを減らす設定：切りかえは一瞬', d1.level === 'day' && Math.abs(d1.z - d1.Zd) < 0.01 && !d1.tr && !d1.raf, JSON.stringify(d1));
    await (await p.$('.skybox')).screenshot({ path: 'gx-rm.png' });
  } else {
    // 目盛りから10日へ → 星をタップ → 記録が読める
    const ri = await p.evaluate(() => { const it = [...document.querySelectorAll('.gx-rail i')]; let best = -1; it.forEach((e, i) => { if (!e.classList.contains('z') && !e.classList.contains('fut') && i < 18 && best < 0 && i > 4) best = i; }); return [best, it.length]; });
    const rb = await (await p.$('.gx-rail')).boundingBox(); await p.mouse.click(rb.x + 12 + (rb.width - 24) * ((ri[0] + 0.5) / ri[1]), rb.y + 30); await p.waitForTimeout(1700);
    ok('目盛りで日を選べる', (await dbg()).level === 'day' && (await p.evaluate(() => document.querySelector('.gx-title').textContent)).startsWith('11.' + String(ri[0] + 1).padStart(2, '0')), await p.evaluate(() => document.querySelector('.gx-title').textContent));
    const star = await p.evaluate(() => { const d = window.DaylogGalaxy._debug(); return d.hits; });
    const pos = await p.evaluate(() => window.DaylogGalaxy._hits().filter(h => h.star).map(h => [h.x, h.y, h.star.label]).slice(-1)[0]);
    const gb = await (await p.$('.gx-gl')).boundingBox(); await p.mouse.click(gb.x + pos[0], gb.y + pos[1]); await p.waitForTimeout(500);
    const card = await p.evaluate(() => [...document.querySelectorAll('#app-main .card')].map(c => c.innerText).join(' || '));
    ok('星をタップすると記録が出る', card.includes(pos[2]), card.slice(0, 120).replace(/\n/g, ' '));
    ok('タップしても銀河は作り直されない（同じ画面のまま）', await p.evaluate(() => !!document.querySelector('.gx') && window.DaylogGalaxy._debug().level === 'day'));
    await (await p.$('.skybox')).screenshot({ path: 'gx-star-sel.png' });
    // 空いた場所をタップ → 選択が外れる
    await p.mouse.click(gb.x + 30, gb.y + gb.height * 0.75); await p.waitForTimeout(400);
    ok('空いた場所をタップで選択が外れる', !(await p.evaluate(() => [...document.querySelectorAll('#app-main .card')].map(c => c.innerText).join(' || '))).includes(pos[2]));
    // まわりの日（うすい星座）をタップ → その日へ
    const far = await p.evaluate(() => window.DaylogGalaxy._hits().filter(h => h.far).map(h => [h.x, h.y, h.day]).find(h => h[0] > 20 && h[0] < 360 && h[1] > 70 && h[1] < 340));
    if (far) { await p.mouse.click(gb.x + far[0], gb.y + far[1]); await p.waitForTimeout(1200); ok('まわりの日をタップで移れる', (await p.evaluate(() => document.querySelector('.gx-title').textContent)).startsWith('11.' + far[2].slice(8)), far[2]); }
    // 月の画面：目標の星座をタップ
    await p.click('.gx-back'); await p.waitForTimeout(1500);
    const goal = await p.evaluate(() => window.DaylogGalaxy._hits().filter(h => h.goal).map(h => [h.x, h.y, h.goal.title])[0]);
    await p.mouse.click(gb.x + goal[0], gb.y + goal[1]); await p.waitForTimeout(500);
    const card2 = await p.evaluate(() => [...document.querySelectorAll('#app-main .card')].map(c => c.innerText).join(' || '));
    ok('目標の星座をタップすると目標が出る', card2.includes('今月の目標の星座'), card2.slice(0, 100).replace(/\n/g, ' '));
    // 日の集まりをタップ → その日へ
    const dayHit = await p.evaluate(() => window.DaylogGalaxy._hits().filter(h => h.day && !h.far).map(h => [h.x, h.y, h.day]).find(h => h[2].endsWith('-12')));
    await p.mouse.click(gb.x + dayHit[0], gb.y + dayHit[1]); await p.waitForTimeout(1600);
    ok('月の画面で日をタップすると星座へ', (await dbg()).level === 'day' && (await p.evaluate(() => document.querySelector('.gx-title').textContent)).startsWith('11.12'));
    // キーボード
    await p.focus('.gx-rail'); await p.keyboard.press('ArrowRight'); await p.keyboard.press('Enter'); await p.waitForTimeout(1000);
    ok('目盛りは矢印キーとEnterでも選べる', (await p.evaluate(() => document.querySelector('.gx-title').textContent)).startsWith('11.13'), await p.evaluate(() => document.querySelector('.gx-title').textContent));
    // 前の月・年またぎ
    await p.click('.gx-back'); await p.waitForTimeout(1200); for (let i = 0; i < 11; i++) { await p.click('[data-act="skyPrev"]'); await p.waitForTimeout(120); } await p.waitForTimeout(1200);
    ok('年をまたいで前の月へ行ける', (await p.evaluate(() => document.querySelector('.gx-title').textContent)) === '2025.12', await p.evaluate(() => document.querySelector('.gx-title').textContent));
    await p.click('[data-act="go"][data-arg="today"]'); await p.waitForTimeout(400); await p.click('[data-act="go"][data-arg="sky"]'); await p.waitForTimeout(1500);
    ok('ほかの画面から戻っても出る', await p.evaluate(() => !!document.querySelector('.gx canvas') && window.DaylogGalaxy._debug().raf));
    ok('ページのエラーなし', errs.length === 0, errs.join(' | '));
  }
  for (const r of R) console.log(r.join(' '));
  console.log('errors', errs.length ? errs : 'none');
  await b.close();
})();
