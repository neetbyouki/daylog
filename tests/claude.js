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
  const MOCK = `
    const mcp = { listTools: async () => ({ servers: [] }), callTool: async (server, tool, a) => {
      if (server === 'Supabase') { try { return { payload: await window.__sql(a.query) }; } catch (e) { throw { code: 'tool_error', message: String(e.message || e) }; } }
      if (server === 'Google Calendar') { if (tool === 'list_events') return { payload: { events: [] } }; return { payload: { id: 'x' + Date.now() } }; }
      throw { code: 'server_not_connected' }; } };
    window.claude = { use: async n => (n === 'mcp' ? mcp : n === 'user' ? { isOwner: async () => true } : null) };
  `;
  const PAGE = '<!doctype html><html><head><meta charset="utf-8"><script>' + MOCK + '</script></head><body>' + html + '</body></html>';
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (u.hostname === 'claude.test') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE }); return r.abort(); });
  await p.goto('https://claude.test/');
  await p.waitForTimeout(2500);
  const text = () => p.evaluate(() => document.body.innerText);
  await p.screenshot({ path: 'start.png' }); console.log((await text()).slice(0, 400).replace(/\n+/g, ' | '));
  const R = []; const ok = (name, cond, extra = '') => { R.push([cond ? 'OK ' : 'NG ', name, extra]); };
  ok('起動して記録が出る', (await text()).includes('最初の記録'));
  // 1) 記録を書く
  await p.click('#composer-text').catch(() => {}); await p.fill('#composer-text', 'PCで書いた記録', { timeout: 3000 }); await p.press('#composer-text', 'Enter'); await p.waitForTimeout(800);
  ok('書いた記録がサーバーに届く', docs.get('days/' + D).data.entries.some(e => e.text === 'PCで書いた記録'));
  // 2) 同時書き込み：画面が知らないうちに、スマホで記録が足された → こちらでも書く → 両方残る
  { const cur = docs.get('days/' + D).data; put('days', D, { ...cur, entries: [...cur.entries, { id: 'ph1', t: Date.now() - 1000, text: 'スマホで書いた記録', u: Date.now() }] }); }
  await p.fill('#composer-text', 'PCでほぼ同時に書いた記録'); await p.press('#composer-text', 'Enter'); await p.waitForTimeout(1200);
  const ents = docs.get('days/' + D).data.entries.map(e => e.text);
  ok('同時に書いても両方残る（サーバー）', ents.includes('スマホで書いた記録') && ents.includes('PCでほぼ同時に書いた記録'), ents.join(' / '));
  ok('画面にもすぐ両方出る', (await text()).includes('スマホで書いた記録') && (await text()).includes('PCでほぼ同時に書いた記録'));
  // 3) 記録を消す → 消した印が残り、ほかの端末の古い内容で復活しない
  const delId = docs.get('days/' + D).data.entries.find(e => e.text === 'PCで書いた記録').id;
  await p.click(`[data-act="entryMenu"][data-arg="${delId}"]`); await p.click(`[data-act="entryDelete"][data-arg="${delId}"]`); await p.waitForTimeout(800);
  ok('消した記録はサーバーから消える', !docs.get('days/' + D).data.entries.some(e => e.id === delId) && (docs.get('days/' + D).data.entriesDel || []).includes(delId));
  { const cur = docs.get('days/' + D).data; const stale = mergeDoc(cur, { entries: [...cur.entries, { id: delId, t: 1, text: '古い端末が持っていた消したはずの記録' }] }); ok('古い端末が送っても復活しない', !stale.entries.some(e => e.id === delId)); }
  // 4) オフライン：送れない間は端末にためる → つながったら送る
  netDown = true;
  await p.fill('#composer-text', '電波がないときの記録'); await p.press('#composer-text', 'Enter'); await p.waitForTimeout(600);
  ok('電波がなくても画面に出る', (await text()).includes('電波がないときの記録'));
  const box = await p.evaluate(() => JSON.parse(localStorage.getItem('daylog-claude-outbox') || '[]').length);
  ok('端末の送る箱にたまる', box >= 1, 'box=' + box);
  await p.waitForTimeout(5000);
  ok('送信待ちの印が出る', /⇡\d|オフライン/.test(await p.evaluate(() => document.querySelector('.top').innerText)), await p.evaluate(() => document.querySelector('.top').innerText.replace(/\n/g, ' ')));
  netDown = false; await p.evaluate(() => window.dispatchEvent(new Event('online'))); await p.waitForTimeout(1500);
  ok('つながったら送られる', docs.get('days/' + D).data.entries.some(e => e.text === '電波がないときの記録'));
  ok('送る箱が空になる', await p.evaluate(() => JSON.parse(localStorage.getItem('daylog-claude-outbox') || '[]').length) === 0);
  // 5) 起きた時刻・前の晩に寝た時刻を ✎ で直す
  await p.click(`[data-act="timeFix"][data-arg="wake:${D}"]`); await p.fill('#tf-time', '09:40'); await p.click('[data-act="timeFixSave"]'); await p.waitForTimeout(800);
  const dd = docs.get('days/' + D).data;
  ok('起きた時刻を直せる', dd.wakeFix === true && dd.wakeAt === at(D, 9, 40), new Date(dd.wakeAt).toISOString());
  ok('今日の流れの起きた時刻も変わる', (await p.evaluate(() => document.querySelector('li.fl-wake').innerText)).includes('09:40'));
  await p.click(`[data-act="timeFix"][data-arg="sleep:${Y}"]`); await p.fill('#tf-time', '01:55'); await p.click('[data-act="timeFixSave"]'); await p.waitForTimeout(800);
  const yd = docs.get('days/' + Y).data;
  ok('前の晩に寝た時刻を直せる', yd.sleepFix === true && yd.sleepAt === at(Y, 1, 55), new Date(yd.sleepAt).toISOString());
  ok('前の晩の表示も変わる', (await p.evaluate(() => document.querySelector('li.fl-slept').innerText)).includes('01:55'));
  // 6) 通知の設定：claude.ai版ではアプリ版でオンにする案内
  await p.click('[data-act="toggleSettings"]'); await p.waitForTimeout(500);
  ok('通知の案内が出る', (await text()).includes('ホーム画面のDaylog（アプリ版）でオンにする'));
  // 7) Supabaseへ送ったのは決まった形だけ
  const badQ = queries.filter(q => !/^select api_daylog\.call\((\$d[a-z0-9]+\$)[\s\S]*\1::jsonb\) as r$/.test(q));
  ok('Supabaseへは api_daylog.call の形だけ', badQ.length === 0, `${queries.length}回中 ${badQ.length}回`);
  // 8) ページからSupabaseを直接呼ぼうとしても止まる
  const blocked = await p.evaluate(async () => { try { const m = await __rt.use('mcp'); await m.callTool('Supabase', 'execute_sql', { query: 'drop table public.docs' }); return false; } catch (e) { return e.code === 'not_allowed'; } }).catch(() => 'n/a');
  ok('ページから直接SQLは送れない', blocked === true, String(blocked));
  ok('ページのエラーなし', errs.length === 0, errs.join(' | '));
  for (const r of R) console.log(r.join(' '));
  await p.screenshot({ path: 'claude.png' });
  await b.close();
})();
