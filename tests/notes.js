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
  const q = sel => p.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : null; }, sel);
  const shot = n => p.screenshot({ path: 'mm-' + n + '.png' });
  // 画像（PNG）をつくる
  const png = Buffer.from(await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 900; c.height = 600; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 900, 600); g.addColorStop(0, '#2b5cff'); g.addColorStop(1, '#f6c35b'); x.fillStyle = g; x.fillRect(0, 0, 900, 600); x.fillStyle = '#fff'; x.font = 'bold 80px sans-serif'; x.fillText('建築メモ', 200, 330); return c.toDataURL('image/png').split(',')[1]; }), 'base64');
  fs.writeFileSync(require('path').join(__dirname, '.out', 'test.png'), png);
  await p.click('[data-act="go"][data-arg="memos"]'); await p.waitForTimeout(400);
  ok('切りかえは ひとこと／ノート の2つ。🔍と★はその横に小さく', (await p.evaluate(() => [...document.querySelectorAll('.mtabs button')].map(b => b.firstChild.textContent).join(','))) === 'ひとこと,ノート' && await p.evaluate(() => { const f = document.querySelector('.mfav-btn'), s = document.querySelector('.msearch-btn'), t = document.querySelector('.mtabs'); return !!f && !!s && Math.abs(f.getBoundingClientRect().top - t.getBoundingClientRect().top) < 2 && Math.abs(s.getBoundingClientRect().top - t.getBoundingClientRect().top) < 2 && f.offsetWidth <= 60 && s.offsetWidth <= 60; }));
  ok('さがす欄はふだん隠れている', !(await p.$('#memo-q')));
  await shot('search-closed');
  await p.click('.msearch-btn'); await p.waitForTimeout(250);
  ok('🔍で開いて、すぐ打てる', await p.evaluate(() => document.activeElement && document.activeElement.id === 'memo-q'));
  await shot('search-open');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  ok('Escで閉じる', !(await p.$('#memo-q')) && !!(await p.$('.msearch-btn')));
  await p.fill('#memo-text', 'スポーン地点の噴水\nもっと高く'); await p.click('[data-act="memoAdd"]'); await p.waitForTimeout(200);
  await p.fill('#memo-text', '買うもの：電池'); await p.click('[data-act="memoAdd"]'); await p.waitForTimeout(200);
  await p.click('.memo .mstar'); await p.waitForTimeout(200);
  ok('ひとことに★を付けられる', await p.evaluate(() => document.querySelector('.memo').classList.contains('fav') && document.querySelector('.memo .mstar').getAttribute('aria-pressed') === 'true'));
  await p.click('.memo:nth-child(2) .mstar'); await p.waitForTimeout(200);
  ok('★を付けても並びは変わらない（新しい順のまま）', (await p.evaluate(() => [...document.querySelectorAll('.memo .txt')].map(x => x.firstChild.textContent.slice(0, 5)).join('|'))) === '買うもの：|スポーン地', await p.evaluate(() => [...document.querySelectorAll('.memo .txt')].map(x => x.firstChild.textContent.slice(0, 5)).join('|')));
  await p.click('.memo:nth-child(2) .mstar'); await p.waitForTimeout(200);
  ok('★と⋯は横に並ぶ（1行のひとことの高さが増えない）', await p.evaluate(() => { const m = [...document.querySelectorAll('.memo')].find(x => x.innerText.includes('電池')); const st = m.querySelector('.mstar').getBoundingClientRect(), mo = m.querySelector('.gmore').getBoundingClientRect(); return Math.abs(st.top + st.height / 2 - (mo.top + mo.height / 2)) < 3 && st.right <= mo.left + 1 && m.offsetHeight < 80; }), await p.evaluate(() => [...document.querySelectorAll('.memo')].map(m => m.offsetHeight).join(',')));
  await shot('quick');
  // ノート：フォルダを作る
  await p.click('[data-act="memoTab"][data-arg="notes"]'); await p.waitForTimeout(200);
  await p.click('[data-act="nfAddOpen"]'); await p.fill('#nf-name', '建築のアイデア'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  await p.click('[data-act="nfAddOpen"]'); await p.fill('#nf-name', '動画の台本'); await p.click('[data-act="nfAdd"]'); await p.waitForTimeout(200);
  ok('フォルダを作れる', (await q('.flist')).includes('建築のアイデア') && (await q('.flist')).includes('動画の台本'));
  await shot('folders');
  await p.click('.fr-main >> text=建築のアイデア'); await p.waitForTimeout(200);
  await p.click('.nfab'); await p.waitForTimeout(300);
  ok('新しいノートを開くと本文に書ける', await p.evaluate(() => document.activeElement && document.activeElement.id === 'ne-body'));
  await p.keyboard.type('和風の城下町'); await p.keyboard.press('Enter'); await p.keyboard.type('屋根は');
  await p.keyboard.down('Control'); await p.keyboard.press('b'); await p.keyboard.up('Control'); await p.keyboard.type('いぶし銀');
  await p.keyboard.down('Control'); await p.keyboard.press('b'); await p.keyboard.up('Control'); await p.keyboard.type('で、');
  await p.click('.ne-b[data-cmd="underline"]'); await p.keyboard.type('石垣は高く'); await p.click('.ne-b[data-cmd="underline"]');
  await p.keyboard.press('Enter'); await p.click('.ne-b[data-cmd="ck"]'); await p.keyboard.type('天守'); await p.keyboard.press('Enter'); await p.keyboard.type('城門');
  await p.keyboard.press('Enter'); await p.keyboard.press('Enter'); await p.keyboard.type('参考：');
  // 画像
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('.ne-b[data-cmd="img"]')]); await fc.setFiles(require('path').join(__dirname, '.out', 'test.png')); await p.waitForTimeout(800);
  await p.keyboard.type('夕方の色');
  await p.waitForTimeout(1200);
  const nh = await p.evaluate(() => document.querySelector('#ne-body').innerHTML);
  ok('太字と下線が入る', /<b>いぶし銀<\/b>/.test(nh) && /<u>石垣は高く<\/u>/.test(nh), nh.slice(0, 300));
  ok('チェックリストが入る', /<ul class="ck"><li>天守<\/li><li>城門<\/li><\/ul>/.test(nh), nh.replace(/src="[^"]+"/g, ''));
  ok('画像が入る', /<img data-blob="b[^"]+" src="data:image\/jpeg/.test(nh));
  await p.click('#ne-body ul.ck li', { position: { x: 10, y: 10 } }); await p.waitForTimeout(800);
  ok('チェックを付けられる', await p.evaluate(() => document.querySelector('#ne-body ul.ck li').dataset.ck === '1'));
  await shot('editor');
  await p.click('.ne-fav'); await p.waitForTimeout(200);
  const sv = [...docs.values()].filter(r => r.c === 'notes');
  ok('サーバーにノートが届く（本文・題・画像の番号・★）', sv.length === 1 && sv[0].data.title === '和風の城下町' && sv[0].data.fav === true && sv[0].data.imgs.length === 1 && !/src=/.test(sv[0].data.html) && sv[0].data.folder, JSON.stringify(sv[0] && { ...sv[0].data, html: undefined }));
  const blob = [...docs.values()].find(r => r.c === 'blobs');
  ok('画像は別の記録で届く（小さくして JPEG）', blob && /^data:image\/jpeg/.test(blob.data.src) && blob.data.src.length < 400000 && blob.data.w <= 1600, blob && blob.data.src.length);
  ok('画像は端末の控え（localStorage）に入らない', await p.evaluate(() => !Object.keys(localStorage).some(k => (localStorage.getItem(k) || '').includes('data:image'))));
  // 戻る → 一覧
  await p.click('.ne-back'); await p.waitForTimeout(300);
  ok('一覧に題・本文の頭・画像の小さな絵', (await q('.nlist')).includes('和風の城下町') && await p.evaluate(() => !!document.querySelector('.nr-th[src]')), await q('.nlist'));
  await shot('list');
  // ★タブ
  await p.click('.mfav-btn'); await p.waitForTimeout(200);
  ok('★タブに両方集まる', (await q('#app-main')).includes('和風の城下町') && (await q('#app-main')).includes('買うもの：電池'));
  ok('★を見ている間は見出しと「閉じる」', (await q('.mfav-head')).includes('お気に入り') && !(await p.$('.mtabs')));
  await shot('fav');
  await p.click('.mfav-btn'); await p.waitForTimeout(200); ok('もう一度★を押すと元の画面へ', await p.evaluate(() => document.querySelector('.mtabs [aria-selected="true"]').firstChild.textContent === 'ノート'));
  // 検索
  await p.click('.msearch-btn'); await p.waitForTimeout(200);
  await p.fill('#memo-q', 'いぶし'); await p.waitForTimeout(200);
  ok('さがすと本文の中も見つかる', (await q('#app-main')).includes('和風の城下町'));
  await p.fill('#memo-q', '電池'); await p.waitForTimeout(200); ok('ひとことも見つかる', (await q('#app-main')).includes('買うもの：電池'));
  await p.click('[data-act="go"][data-arg="today"]'); await p.waitForTimeout(200); await p.click('[data-act="go"][data-arg="memos"]'); await p.waitForTimeout(300);
  ok('何か入っている間は、ほかの画面から戻っても開いたまま', (await p.evaluate(() => document.querySelector('#memo-q') && document.querySelector('#memo-q').value)) === '電池');
  await p.click('[data-act="memoSearchClear"]'); await p.waitForTimeout(200);
  ok('×で消して閉じる', !(await p.$('#memo-q')));
  // ひとこと → ノート
  await p.click('[data-act="memoTab"][data-arg="quick"]'); await p.waitForTimeout(200);
  const mid = await p.evaluate(() => [...document.querySelectorAll('.memo')].find(x => x.innerText.includes('電池')).querySelector('.gmore').dataset.arg);
  await p.click(`.gmore[data-arg="${mid}"]`); await p.click(`[data-act="memoToNote"][data-arg="${mid}"]`); await p.waitForTimeout(400);
  ok('ひとことをノートにすると、そのまま開く', !!(await p.$('#ne-body')) && (await q('#ne-body')).includes('買うもの：電池'));
  await p.click('.ne-back'); await p.waitForTimeout(200);
  // 再読み込みしても残る・画像は取り直せる
  await p.evaluate(() => indexedDB.deleteDatabase('daylog-blobs')); await p.reload(); await p.waitForTimeout(2500);
  await p.click('[data-act="go"][data-arg="memos"]'); await p.waitForTimeout(300); await p.click('[data-act="memoTab"][data-arg="notes"]'); await p.waitForTimeout(300);
  await p.click('.nr-main >> text=和風の城下町'); await p.waitForTimeout(1200);
  ok('開き直しても書式と画像が残る（画像はサーバーから）', await p.evaluate(() => { const b = document.querySelector('#ne-body'); return !!b.querySelector('b') && !!b.querySelector('u') && !!b.querySelector('img[src^="data:image/jpeg"]'); }));
  ok('画像を取りに行くのは get だけ（最初の読み込みには入らない）', queries.some(x => x.includes('"a":"get"')));
  // 消す → 最近削除 → 戻す
  await p.click('.ne-more'); await p.click('[data-m="del"]'); await p.waitForTimeout(300);
  ok('消すと「最近削除した項目」へ', (await q('.flist')).includes('最近削除した項目'));
  await p.click('.fr-main >> text=最近削除した項目'); await p.click('[data-act="noteRestore"]'); await p.waitForTimeout(200);
  await p.click('[data-act="nFolder"][data-arg=""]'); await p.waitForTimeout(200);
  ok('戻せる', (await q('.flist')).includes('建築のアイデア') && !(await q('.flist')).includes('最近削除'));
  // 危ない貼り付けは落とす
  await p.click('.nr-main >> text=和風の城下町'); await p.waitForTimeout(400);
  await p.evaluate(() => { const b = document.querySelector('#ne-body'); b.focus(); const r = document.createRange(); r.selectNodeContents(b); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); const dt = new DataTransfer(); dt.setData('text/html', '<p onclick="alert(1)">貼った<b style="color:red">文字</b><script>window.__x=1</script><img src="https://evil.test/a.png" onerror="window.__x=2"><a href="javascript:alert(1)">リンク</a></p>'); b.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
  await p.waitForTimeout(900);
  const h2 = await p.evaluate(() => document.querySelector('#ne-body').innerHTML);
  ok('貼り付けた危ない中身は落ちる', h2.includes('貼った<b>文字</b>') && !/onclick|script|evil|javascript/.test(h2) && await p.evaluate(() => !window.__x), h2.slice(-200));
  await p.click('.ne-back'); await p.waitForTimeout(200);
  ok('ページのエラーなし', errs.length === 0, errs.join(' | '));
  for (const r of R) console.log(r.join(' '));
  await b.close();
})();
