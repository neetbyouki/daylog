// 自分との約束：今日タブ・今日の流れ・夜モード・目標の編集・カレンダー・星空のふりかえり
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
put('days', Y, { date: Y, mode: 'normal', habits: { bath: true, bathAt: at(Y, 19, 0) }, promises: { p1: 'full', p1At: at(Y, 12, 0) }, entries: [] });
Object.assign(docs.get('days/' + D).data, { wakeAt: at(D, 10, 30), wakeFix: true, mode: 'normal' });
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
  const day = () => docs.get('days/' + D).data; const set = () => docs.get('settings/main').data;
  const bar = () => p.$$eval('.yk-b', e => e.map(x => ({ c: x.className, t: x.innerText.replace(/\s+/g, ' ') })));
  const flowTxt = () => p.evaluate(() => document.querySelector('ul.flow').innerText);
  let b0 = await bar();
  check('今日タブに約束が3つ', b0.length === 3 && /着替える/.test(b0[0].t) && /外に出る/.test(b0[1].t) && /アニメ見る/.test(b0[2].t), b0);
  check('ふだんは名前だけ（細いピル1行）', b0[0].t === '着替える' && b0[1].t === '外に出る' && b0[2].t === 'アニメ見る' && !/最低ライン|ふつう|（/.test(JSON.stringify(b0)), b0.map(x => x.t));
  check('半分地点は読み上げと title に残る', await p.$eval('.yk-b[data-arg="p2"]', e => /外に出る（すこし）/.test(e.getAttribute('aria-label')) && e.title === '外に出る（すこし）'));
  check('1行に収まる', await p.evaluate(() => { const b = [...document.querySelectorAll('.yk-b')]; return b.every(x => Math.abs(x.offsetTop - b[0].offsetTop) < 2) && b[0].offsetHeight < 40; }));
  await p.screenshot({ path: 'pr-today-a.png', clip: { x: 0, y: 0, width: 420, height: 320 } });
  check('体調ボタンのすぐ下', await p.evaluate(() => { const m = document.querySelector('.modes'), b = document.querySelector('.yk-bar'); return !!m && !!b && m.nextElementSibling === b; }));
  check('習慣のチェックはもう出ない', !(await p.$('[data-act="habitToggle"]')) && !(await p.$('[data-act="bathToggle"]')));
  // 1回 → 最低ライン
  await p.clock.setFixedTime(new Date(at(D, 13, 5)));
  await p.click('.yk-b[data-arg="p1"]'); await p.waitForTimeout(500);
  check('1回で最低ライン', day().promises && day().promises.p1 === 'min' && day().promises.p1At === at(D, 13, 5), day().promises);
  b0 = await bar(); check('ボタンが半分に・半分地点が一瞬出る', /\bmin\b/.test(b0[0].c) && b0[0].t === '着替える 上だけでOK' && b0.length === 3, b0[0]);
  await p.screenshot({ path: 'pr-today-tip.png', clip: { x: 0, y: 0, width: 420, height: 320 } });
  await p.waitForTimeout(2100); b0 = await bar(); check('吹き出しは消える', b0[0].t === '着替える' && !(await p.$('.yk-tip')), b0[0]);
  let ft = await flowTxt(); check('今日の流れに「① 着替える（上だけ）」', /13:05[\s\S]*① 着替える（上だけ）/.test(ft) && !!(await p.$('.yk-line.min .yk-dot.min')), ft);
  // 2回 → ふつう（時刻は最初のまま）
  await p.clock.setFixedTime(new Date(at(D, 13, 20)));
  await p.click('.yk-b[data-arg="p1"]'); await p.waitForTimeout(500);
  check('2回でふつう・時刻は最初のまま', day().promises.p1 === 'full' && day().promises.p1At === at(D, 13, 5), day().promises);
  ft = await flowTxt(); check('流れは「●」に', /13:05[\s\S]*① 着替える\n/.test(ft) && !/着替える（上だけ）/.test(ft) && !!(await p.$('.yk-line.full .yk-dot.full')) && !(await p.$('.yk-line.min')));
  // 3回 → 戻す
  await p.click('.yk-b[data-arg="p1"]'); await p.waitForTimeout(500);
  check('3回で元に戻る', !day().promises.p1 && !day().promises.p1At, day().promises);
  check('流れからも消える', !/着替える/.test(await flowTxt()));
  // ぜんぶ
  for (const id of ['p1', 'p2', 'p3']) { await p.click(`.yk-b[data-arg="${id}"]`); await p.waitForTimeout(350); }
  check('3つ守れたら知らせ', /ぜんぶ守れた/.test(await p.evaluate(() => document.body.innerText)));
  check('ぜんぶのときは並びが光る', await p.$('.yk-bar.all') !== null);
  // 休養の日：最低ラインだけを出す
  await p.click('.yk-b[data-arg="p3"]'); await p.waitForTimeout(250); await p.click('.yk-b[data-arg="p3"]'); await p.waitForTimeout(300); // p3 を戻す
  await p.click('[data-act="setMode"][data-arg="rest"]'); await p.waitForTimeout(600);
  b0 = await bar(); check('休養の日も同じ形', b0[2].t === 'アニメ見る' && b0.length === 3, b0[2]);
  await p.click('[data-act="setMode"][data-arg="normal"]'); await p.waitForTimeout(600);
  await p.evaluate(() => { const b = document.querySelector('[data-act="closeSheet"]'); if (b) b.click(); }); await p.waitForTimeout(300);
  // 夜モード：目標と約束
  await p.click('[data-act="openNight"]'); await p.waitForTimeout(500);
  let nt0 = await p.evaluate(() => document.body.innerText);
  check('夜モードの1つめは「今日の振り返り」', /今日の振り返り/.test(nt0) && /起きてから/.test(nt0) && /約束/.test(nt0) && !/起きる時刻|明日の予定/.test(nt0), nt0.slice(0, 300));
  await p.screenshot({ path: 'pr-night-review.png' });
  await p.click('[data-act="nightNext"]'); await p.waitForTimeout(500);
  await p.click('[data-act="nightNext"]'); await p.waitForTimeout(500);
  let nt = await p.evaluate(() => document.querySelector('#app-over') ? document.querySelector('#app-over').innerText : document.body.innerText);
  await p.screenshot({ path: 'pr-night.png' });
  check('夜モードの2つめは「目標と約束」', /目標と約束/.test(nt) && /今日の約束/.test(nt) && !/毎日の習慣/.test(nt), nt.slice(0, 200));
  check('夜モードで状態が見える', /① 着替える\s*（上だけ）/.test(nt) && /③ アニメ見る\s*（半分）/.test(nt) && !/最低ライン/.test(nt), nt);
  await p.click('.yk-check[data-arg="p3"]'); await p.waitForTimeout(500);
  check('夜モードでもチェックできる', day().promises.p3 === 'min');
  nt = await p.evaluate(() => document.body.innerText); check('ぜんぶ守れた日の一言', /ぜんぶ守れた日。/.test(nt));
  // 寝る前チェック → ペットの一言 → 星座
  await p.evaluate(() => { window.__nightReq = null; window.daylogChat = async body => { window.__nightReq = body; return { reply: '', night: { comment: 'テスト用の**一言**。おやすみ(´-ω-`)', name: 'テスト座' } }; }; });
  await p.click('[data-act="nightNext"]'); await p.waitForTimeout(500);
  nt = await p.evaluate(() => document.body.innerText); check('4つめは「寝る前チェック」', /寝る前チェック/.test(nt), nt.slice(0, 200));
  await p.click('[data-act="nightNext"]'); await p.waitForTimeout(1200);
  nt = await p.evaluate(() => document.body.innerText);
  await p.screenshot({ path: 'pr-night-pet.png' });
  check('5つめは「ペットの一言」', /ペットの一言/.test(nt) && /テスト用の一言/.test(nt) && /テスト座/.test(nt), nt.slice(0, 300));
  check('太字で出る', await p.evaluate(() => !!document.querySelector('.np-bubble b, .np-bubble strong')));
  check('夜用で呼ぶ', await p.evaluate(() => window.__nightReq && window.__nightReq.kind === 'night'));
  check('一言を保存', day().close && day().close.comment === 'テスト用の**一言**。おやすみ(´-ω-`)' && day().close.name === 'テスト座', day().close);
  check('起床の予定は作らない', !calls.some(x => /create_event|wake/.test(x)));
  await p.click('[data-act="nightNext"]'); await p.waitForTimeout(800);
  nt = await p.evaluate(() => document.body.innerText); check('6つめは「今日の星座」', /今日の星座/.test(nt), nt.slice(0, 200));
  check('星座の名前もペットのもの', /テスト座/.test(await p.evaluate(() => (document.querySelector('#rise .nm') || {}).textContent || '')));
  await p.evaluate(() => document.querySelector('[data-act="nightFinish"]').click()); await p.waitForTimeout(800);
  check('おやすみで閉じて一言が残る', !(await p.$('[aria-label="夜モード"]')) && day().close.done && day().close.comment.startsWith('テスト用'), day().close);
  // 目標の編集：約束を直す・お知らせ
  await p.click('[data-act="go"][data-arg="tasks"]'); await p.waitForTimeout(500);
  let gt = await p.evaluate(() => document.querySelector('.goals').innerText);
  check('目標の欄に「約束」の行', /約束/.test(gt) && !/習慣/.test(gt), gt);
  await p.click('[data-act="goalEdit"]'); await p.waitForTimeout(300);
  gt = await p.evaluate(() => document.querySelector('.goals').innerText);
  check('編集に「自分との約束」と中身', /自分との約束/.test(gt) && /② 外に出る\s*（すこし）/.test(gt) && !/最低ライン/.test(gt) && /まだの約束を知らせる/.test(gt), gt);
  await p.evaluate(() => document.querySelector('.goals').scrollIntoView()); await p.screenshot({ path: 'pr-goals.png' });
  check('3つあるので＋は出ない', !(await p.$('[data-act="promiseEdit"][data-arg="new"]')));
  await p.click('[data-act="promiseEdit"][data-arg="p2"]'); await p.waitForTimeout(300);
  await p.fill('#pr-min', 'ベランダに出る'); await p.click('[data-act="promiseSave"][data-arg="p2"]'); await p.waitForTimeout(500);
  check('最低ラインを直して保存', Array.isArray(set().promises) && set().promises.length === 3 && set().promises[1].min === 'ベランダに出る' && set().promises[1].id === 'p2' && set().promises[1].full === '外に出る', set().promises);
  check('時刻の初期値は18:00', (await p.inputValue('#pr-at')) === '18:00');
  await p.fill('#pr-at', '19:30'); await p.dispatchEvent('#pr-at', 'change'); await p.waitForTimeout(400);
  check('時刻を変えられる', set().promiseAt === '19:30', set().promiseAt);
  await p.click('[data-act="promiseNotify"]'); await p.waitForTimeout(400);
  check('お知らせをオフにできる', set().promiseNotify === false);
  await p.click('[data-act="promiseNotify"]'); await p.waitForTimeout(400);
  check('もう一度押すとオン', set().promiseNotify === true);
  await p.click('[data-act="promiseDel"]').catch(() => {}); // 編集を開いていないので何も起きない
  await p.click('[data-act="promiseEdit"][data-arg="p3"]'); await p.waitForTimeout(300); await p.click('[data-act="promiseDel"][data-arg="p3"]'); await p.waitForTimeout(400);
  check('消せる（元に戻せる）', set().promises.length === 2 && /消した/.test(await p.evaluate(() => document.body.innerText)));
  await p.click('[data-act="undo"]').catch(() => {}); await p.waitForTimeout(400);
  check('元に戻すと3つ', set().promises.length === 3, set().promises.map(x => x.id));
  await p.click('[data-act="goalEdit"]'); await p.waitForTimeout(300);
  // カレンダーの月：その日のチップ
  await p.click('[data-act="go"][data-arg="cal"]'); await p.waitForTimeout(600);
  await p.evaluate(() => { const s = document.querySelector('[data-act="calMode"][data-arg="month"]'); if (s) s.click(); }); await p.waitForTimeout(500);
  await p.evaluate(d => { const b = document.querySelector(`[data-act="calSel"][data-arg="${d}"]`); if (b) b.click(); }, Y); await p.waitForTimeout(700);
  const md = await p.evaluate(() => { const m = document.querySelector('#mo-day'); return m ? m.innerText : ''; });
  check('昨日のチップ：前の習慣と約束', /お風呂/.test(md) && /約束\s*1\/3/.test(md), md.slice(0, 200));
  check('昨日の流れにも約束の行', /① 着替える/.test(md));
  // ふりかえり
  await p.click('[data-act="go"][data-arg="sky"]'); await p.waitForTimeout(800);
  await p.evaluate(() => { const b = document.querySelector('[data-act="openReview"]') || [...document.querySelectorAll('button')].find(x => /ふりかえり/.test(x.innerText)); if (b) b.click(); }); await p.waitForTimeout(700);
  const rv = await p.evaluate(() => document.body.innerText);
  check('ふりかえりに「守った約束」', /守った約束/.test(rv), (rv.match(/.{0,30}守った約束.{0,10}/) || [''])[0]);
  const pc = await p.evaluate(() => { const c = [...document.querySelectorAll('.chart')].find(x => /約束を守れた割合/.test(x.innerText)); return c ? { t: c.innerText, line: !!c.querySelector('polyline'), dots: c.querySelectorAll('circle').length, tips: [...c.querySelectorAll('rect[data-tip]')].map(r => r.dataset.tip) } : null; });
  check('約束の折れ線グラフ', !!pc && /この期間 \d+%/.test(pc.t) && pc.line && pc.dots >= 2, pc && { t: pc.t, dots: pc.dots });
  check('グラフの点：昨日1/3・今日3/3', !!pc && pc.tips.some(t => /守れた 1\/3（33%）・うちふつう 1/.test(t)) && pc.tips.some(t => /守れた 3\/3（100%）[\s\S]*今日はまだ途中/.test(t)), pc && pc.tips.filter(t => /守れた/.test(t)));
  await p.evaluate(() => { const c = [...document.querySelectorAll('.chart')].find(x => /約束を守れた割合/.test(x.innerText)); if (c) c.scrollIntoView(); }); await p.screenshot({ path: 'pr-chart.png' });
  await p.screenshot({ path: 'pr-sky.png' });
  await p.click('[data-act="go"][data-arg="today"]'); await p.waitForTimeout(600);
  await p.screenshot({ path: 'pr-today.png' });
  console.log('errs', errs); check('エラーなし', !errs.length);
  console.log(ok ? 'ALL OK' : 'SOME NG');
  await b.close();
})();
