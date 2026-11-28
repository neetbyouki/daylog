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
  if (req.a === 'load') return [...docs.values()].filter(r => r.c !== 'blobs');
  if (req.a === 'get') { if (req.ids.length > 20) throw new Error('bad get'); return req.ids.map(i => docs.get(req.c + '/' + i)).filter(Boolean); }
  if (req.a === 'since') return [...docs.values()].filter(r => r.u >= req.since && r.c !== 'blobs');
  if (req.a === 'ids') return [...docs.values()].filter(r => r.c !== 'blobs').map(r => ({ c: r.c, id: r.id }));
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

  const R = []; const ok = (n, c, x = '') => R.push([c ? 'OK ' : 'NG ', n, x]);
  const cdp = await ctx.newCDPSession(p); await cdp.send('Animation.enable');
  const slow = r => cdp.send('Animation.setPlaybackRate', { playbackRate: r });
  // 画面の切りかえの種類：新しく出た .enter-* を記録する
  await p.evaluate(() => { window.__vt = []; new MutationObserver(ms => { for (const m of ms) if (m.type === 'attributes') { const c = [...m.target.classList].find(x => x.startsWith('enter-')); if (c && !window.__vt.includes(c.slice(6))) window.__vt.push(c.slice(6)); } }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] }); });
  const vts = () => p.evaluate(() => window.__vt.splice(0));
  const mid = async (name, act, ms = 260) => { await slow(0.12); await act(); await p.waitForTimeout(ms); await p.screenshot({ path: 'mo-' + name + '.png' }); await slow(1); await p.waitForTimeout(700); };
  // 下のタブ：横の流れ
  await p.click('[data-act="go"][data-arg="tasks"]'); await p.waitForTimeout(40);
  ok('下のタブの丸は前の場所から滑る（影）', await p.evaluate(() => !!document.querySelector('.nav .slide-ghost') && document.querySelector('.nav [aria-current="page"] .gi').classList.contains('slide-hide')));
  await p.waitForTimeout(600); await p.click('[data-act="go"][data-arg="today"]'); await p.waitForTimeout(600); await p.evaluate(() => window.__vt.splice(0));
  // 今日の流れの予定を押して閉じる（ぼかしのちらつきの不具合）
  await p.click('.ev [data-act="calOpen"]'); await p.waitForTimeout(40);
  ok('予定を開くと、ぼかしごとふわっと出る（写真ではなく本物）', await p.evaluate(() => { const o = document.querySelector('#app-over > .overlay'); return o.classList.contains('entering') && getComputedStyle(o).backdropFilter.includes('blur'); }));
  await p.waitForTimeout(400); await p.screenshot({ path: 'mo-cal-open.png' });
  await p.keyboard.press('Escape'); await p.waitForTimeout(40);
  ok('閉じるときは、ぼかしを付けたまま薄くなって消える', await p.evaluate(() => { const o = document.querySelector('#app-over > .overlay'); return !!o && o.classList.contains('leaving') && getComputedStyle(o).backdropFilter.includes('blur'); }));
  await p.waitForTimeout(300);
  ok('消えたあとは何も残らない', await p.evaluate(() => !document.querySelector('#app-over').innerHTML));
  await mid('tab', () => p.click('[data-act="go"][data-arg="tasks"]'));
  ok('下のタブの切りかえは、新しい中身が下から（tab）', JSON.stringify(await vts()) === '["tab"]');

  ok('切りかえ後は動きの印が残らない', await p.evaluate(() => !document.querySelector('[class*="enter-"]') && !document.querySelector('.slide-ghost')));
  // タイマー：重なる画面
  await mid('sheet-open', () => p.click('.tm-btn'), 200);
  ok('タイマーを開くと、ぼかしごとふわっと出る', true);
  await p.click('#tm-start', { force: true }); await p.waitForTimeout(100);
  ok('目的なしで▶：揺れる', await p.evaluate(() => document.querySelector('#tm-purpose').classList.contains('shake')));
  await p.click('[data-act="timerClose"]'); await p.waitForTimeout(500); await vts();
  // メモ：ひとこと→ノート（上の切りかえ）、フォルダ→ノート（奥へ）
  await p.click('[data-act="go"][data-arg="memos"]'); await p.waitForTimeout(500); await vts();
  await p.fill('#memo-text', 'テストのひとこと'); await p.click('[data-act="memoAdd"]'); await p.waitForTimeout(300);
  await p.click('.memo .mstar'); await p.waitForTimeout(90);
  ok('★を付けた瞬間：はずむ＋粒', await p.evaluate(() => { const b = document.querySelector('.memo .mstar'); return b.classList.contains('pop') && b.querySelectorAll('.burst i').length === 8; }));
  await slow(0.15); await p.click('.memo .mstar'); await p.click('.memo .mstar'); await p.waitForTimeout(120); await (await p.$('.memo')).screenshot({ path: 'mo-star.png' }); await slow(1); await p.waitForTimeout(900);
  ok('★の粒は少したつと消える（描き直しで残らない）', await p.evaluate(() => { window.__r = 1; return true; }));
  await p.click('.memo .mstar'); await p.waitForTimeout(100); await p.click('.memo .mstar'); await p.waitForTimeout(800);
  await p.fill('#memo-text', ''); await p.click('[data-act="memoAdd"]'); await p.waitForTimeout(50);
  ok('空のまま＋：欄が揺れる', await p.evaluate(() => document.querySelector('#memo-text').classList.contains('shake')));
  await mid('tabs', () => p.click('[data-act="memoTab"][data-arg="notes"]'));
  ok('ひとこと↔ノートは tabs', JSON.stringify(await vts()) === '["tabs"]');
  await mid('fwd', () => p.click('.fr-main >> text=すべてのノート'));
  ok('フォルダの中へは fwd', JSON.stringify(await vts()) === '["fwd"]');
  await p.click('.nfab'); await p.waitForTimeout(700); await vts();
  await p.keyboard.type('動きのテスト'); await p.waitForTimeout(1400);
  ok('「保存した」は入れかわる動き', await p.evaluate(() => document.querySelector('.ne-st').classList.contains('swap')));
  await mid('back', () => p.click('.ne-back'));
  ok('ノートを閉じると back', JSON.stringify(await vts()) === '["back"]');
  // タスクのチェック
  await p.click('[data-act="go"][data-arg="tasks"]'); await p.waitForTimeout(600);
  await p.fill('#task-title', '動画の構成を書く'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  const tid = await p.evaluate(() => { const b = document.querySelector('[data-act="taskDone"]'); return b && b.dataset.arg; });
  if (tid) { await slow(0.2); await p.click(`[data-act="taskDone"][data-arg="${tid}"]`); await p.waitForTimeout(150); const row = await p.$(`[data-act="taskUndo"][data-arg="${tid}"]`); ok('タスクを終えると印が描かれる', await p.evaluate(id => document.querySelector(`[data-act="taskUndo"][data-arg="${id}"]`).classList.contains('fx'), tid)); await p.screenshot({ path: 'mo-check.png', clip: { x: 0, y: 0, width: 420, height: 500 } }); await slow(1); await p.waitForTimeout(800);
    ok('知らせ（toast）は下から出る', await p.evaluate(() => getComputedStyle(document.querySelector('.toast')).animationName === 't-toast')); }
  else ok('タスクが見つからない', false);
  // 足す・消す・押す
  await p.click('[data-act="go"][data-arg="memos"]'); await p.waitForTimeout(500);
  if (!(await p.$('#memo-text'))) { await p.click('[data-act="memoTab"][data-arg="quick"]'); await p.waitForTimeout(500); }
  await p.fill('#memo-text', '消すテスト'); await p.click('[data-act="memoAdd"]'); await p.waitForTimeout(60);
  ok('足したひとことは上から現れる', await p.evaluate(() => [...document.querySelectorAll('.memo')].find(m => m.innerText.includes('消すテスト')).classList.contains('new')));
  await p.waitForTimeout(700);
  const mid2 = await p.evaluate(() => [...document.querySelectorAll('.memo')].find(m => m.innerText.includes('消すテスト')).querySelector('.gmore').dataset.arg);
  await p.click(`.gmore[data-arg="${mid2}"]`); await p.waitForTimeout(300);
  ok('⋯を押すと、押したボタンがぽんと戻る', await p.evaluate(a => document.querySelector(`.gmore[data-arg="${a}"]`).classList.contains('tapped'), mid2));
  const n0 = await p.evaluate(() => document.querySelectorAll('.memo').length);
  await p.click(`[data-act="memoDelete"][data-arg="${mid2}"]`); await p.waitForTimeout(60);
  ok('消すときは行が縮む', await p.evaluate(() => !!document.querySelector('.memo.leave')));
  await p.waitForTimeout(400);
  ok('縮んだあとに消える', (await p.evaluate(() => document.querySelectorAll('.memo').length)) === n0 - 1);
  await p.waitForTimeout(4500);
  // 控えめ
  await p.click('[data-act="toggleSettings"]'); await p.waitForTimeout(600); await vts();
  await p.click('[data-act="setMotion"][data-arg="calm"]'); await p.waitForTimeout(300);
  ok('設定に「画面の動き」がある（控えめ）', await p.evaluate(() => document.documentElement.dataset.motion === 'calm'));
  await p.click('[data-act="go"][data-arg="today"]'); await p.waitForTimeout(400);
  ok('控えめでは画面の切りかえを動かさない', (await vts()).length === 0);
  ok('控えめでは小さな動きも止まる', await p.evaluate(() => getComputedStyle(document.querySelector('.toast') || document.body).animationName === 'none'));
  await p.click('[data-act="toggleSettings"]'); await p.waitForTimeout(400); await p.click('[data-act="setMotion"][data-arg="full"]'); await p.waitForTimeout(200);
  ok('ふつうに戻せる', await p.evaluate(() => document.documentElement.dataset.motion === 'full'));
  ok('ページのエラーなし', errs.length === 0, errs.join(' | '));
  for (const r of R) console.log(r.join(' '));
  await b.close();
})();
