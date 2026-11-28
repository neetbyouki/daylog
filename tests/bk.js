// バックアップ・書き出し・エラーの自動報告（claude.ai版のつなぎで確かめる）
const { chromium } = require('playwright');
const fs = require('fs'); const vm = require('vm');
const { seedDocs } = require('./common');
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
let saved = null; let fail = 0; const ok = (c, m) => { console.log((c ? 'OK  ' : 'NG  ') + m); if (!c) fail++; };
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
  await p.goto('https://claude.test/'); await p.waitForTimeout(2500); console.log((await p.evaluate(() => document.body.innerText)).slice(0, 300), perr);
  await p.click('[data-act="toggleSettings"]'); await p.waitForTimeout(500);
  const txt = () => p.evaluate(() => document.body.innerText);
  ok((await txt()).includes('最後に保存：'), '最後の保存が出る');
  await p.waitForTimeout(600);
  ok((await txt()).includes('画像 2枚・3.3MB／1GB（0.3%）') && (await txt()).includes('あと約'), '画像の置き場所の使用量が出る: ' + ((await txt()).match(/画像 .*?）/) || [''])[0]);
  await p.locator('text=記録の守り').scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
  await p.screenshot({ path: 'bk-settings.png' });
  // エラーを起こす（同じものは1行にまとまる）
  await p.evaluate(() => { for (let i = 0; i < 3; i++) setTimeout(() => { throw new Error('テスト用のエラー'); }, 10 * i); Promise.reject(new Error('約束のエラー')); });
  await p.waitForTimeout(4500);
  ok(errRows.length === 2, 'エラーが2種類届いた: ' + errRows.length);
  const e1 = errRows.find(r => r.msg === 'テスト用のエラー');
  ok(e1 && e1.n === 3 && e1.src === 'claude' && /^20\d\d-/.test(e1.ver) && e1.view === 'settings', 'まとめ・出どころ・版・画面: ' + JSON.stringify(e1 && { n: e1.n, src: e1.src, ver: e1.ver, view: e1.view }));
  await p.click('[data-act="showErrors"]'); await p.waitForTimeout(500);
  ok((await txt()).includes('テスト用のエラー') && (await txt()).includes('×3'), 'エラー一覧が読める');
  await p.locator('.errlist').scrollIntoViewIfNeeded(); await p.screenshot({ path: 'bk-errors.png' });
  await p.click('[data-act="clearErrors"]'); await p.waitForTimeout(500);
  ok(errRows.length === 0 && (await txt()).includes('記録されたエラーはない'), 'エラーを消せる');
  // 今すぐ保存
  await p.click('[data-act="backupNow"]'); await p.waitForTimeout(2500);
  const req = docs.get('meta/backupreq');
  ok(req && req.data.at > 0, '保存の依頼が書かれた');
  ok((await txt()).includes('保存中…'), '保存中と出る');
  // サーバーが失敗を書く → 15秒の見回りで出る
  put('meta', 'backup', { ok: false, err: 'scope', errMsg: 'x', triedAt: Date.now(), reqAt: req.data.at, busyAt: 0, at: Date.now() - 86400e3 });
  await p.waitForTimeout(17000);
  const t2 = await txt();
  ok(t2.includes('ドライブへの保存がまだ許可されていない') && !t2.includes('保存中…'), '失敗の理由が出る');
  await p.locator('text=記録の守り').scrollIntoViewIfNeeded(); await p.screenshot({ path: 'bk-scope.png' });
  // 書き出し
  await p.click('[data-act="exportJson"]'); await p.waitForTimeout(2500);
  ok(saved && /^Daylog-\d{4}-\d\d-\d\d_\d{4}-export\.json$/.test(saved.filename), 'ファイル名: ' + (saved && saved.filename));
  const j = saved && JSON.parse(saved.data);
  ok(j && j.app === 'Daylog' && j.collections.settings && j.collections.notes.n1 && j.collections.blobs && j.collections.blobs.b1 && !j.collections.meta?.backupreq, '中身（設定・ノート・画像あり、依頼は入れない）');
  ok((await txt()).includes('書き出した'), '書き出したと出る');
  ok(perr.filter(m => !/テスト用のエラー|約束のエラー/.test(m)).length === 0, 'ほかの画面エラーなし: ' + perr.join(' / '));
  await b.close(); console.log(fail ? `NG ${fail}` : 'ALL OK'); process.exit(fail ? 1 : 0);
})();
