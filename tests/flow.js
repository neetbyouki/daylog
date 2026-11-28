// 今日の流れ：時刻は左の列だけ・空きの帯・コンパクトさ（時刻を 15:20 と 13:20 に止めて確かめる）
const { chromium } = require('playwright');
const fs = require('fs'); const vm = require('vm');
const { D, Y, at, seedDocs } = require('./common');
const html = fs.readFileSync(__dirname + '/.out/daylog.html', 'utf8');
const sbx = { window: {}, document: { addEventListener() {} }, console };
vm.runInNewContext(fs.readFileSync(__dirname + '/../store.js', 'utf8'), sbx);
const { mergeDoc } = sbx.window.DaylogStore;

let clock = Date.now() - 3600e3; const docs = new Map();
const put = (c, id, data) => docs.set(c + '/' + id, { c, id, data, u: (clock = Math.max(clock + 1, Date.now())) });
for (const [c, id, d] of seedDocs()) put(c, id, d);
const day = docs.get('days/' + D).data;
day.entries = [
  { id: 'a1', t: at(D, 10, 40), text: '起きた。少しだるい', mood: 3, body: 2 },
  { id: 'a2', t: at(D, 12, 35), text: 'お昼ごはん。コンビニのパスタ' },
  { id: 'a3', t: at(D, 13, 40), text: '3点出品できた', mood: 4 },
  { id: 'a4', t: at(D, 15, 5), text: '休憩。外の空気を吸った' },
];
put('pc', D, { date: D, first: at(D, 10, 12), last: null, activeMinutes: 200, gameMinutes: 145, games: { 'VALORANT-Win64-Shipping': 125, wallpaperui: 20 }, naps: [],
  sessions: [{ g: 'VALORANT-Win64-Shipping', from: at(D, 11, 5), to: at(D, 12, 20), min: 75 }, { g: 'VALORANT-Win64-Shipping', from: at(D, 13, 30), to: at(D, 14, 20), min: 50 }, { g: 'wallpaperui', from: at(D, 14, 30), to: at(D, 14, 50), min: 20 }] });
function api(req) {
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
const EVS = [ev('e1', 'メルカリ出品', D, 13, 0, 14, 0), ev('e2', '動画編集', D, 16, 0, 18, 0), ev('e3', 'ゆいこさん テストプレイ', D, 20, 0, 21, 0), ev('e4', '参加型', D, 22, 0, 1, 0), ev('bed1', '🌙 就寝の目安', D, 2, 30, 2, 45)];
const wrap = j => JSON.stringify({ result: 'Below ... <untrusted-data-u1> boundaries.\n\n<untrusted-data-u1>\n' + JSON.stringify(j) + '\n</untrusted-data-u1>\n\nUse ... <untrusted-data-u1> boundaries.' });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ timezoneId: 'Asia/Tokyo', viewport: { width: Number(process.env.W || 420), height: 1400 }, deviceScaleFactor: Number(process.env.DSF || 1) });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date(at(D, 15, 20)));
  await p.exposeFunction('__sql', q => { const m = q.match(/^select api_daylog\.call\((\$d[a-z0-9]+\$)([\s\S]*)\1::jsonb\) as r$/); return wrap([{ r: api(JSON.parse(m[2])) }]); });
  const MOCK = `window.__EVS = ${JSON.stringify(EVS)};
    const mcp = { listTools: async () => ({ servers: [] }), callTool: async (server, tool, a) => {
      if (server === 'Supabase') return { payload: await window.__sql(a.query) };
      if (server === 'Google Calendar') { if (tool === 'list_events') return { payload: { events: a.calendarId.startsWith('test-app') ? window.__EVS : [] } }; return { payload: { id: 'x' + Date.now() } }; }
      throw { code: 'server_not_connected' }; } };
    window.claude = { use: async n => (n === 'mcp' ? mcp : n === 'user' ? { isOwner: async () => true } : null) };`;
  const PAGE = '<!doctype html><html><head><meta charset="utf-8"><script>' + MOCK + '</script></head><body>' + html + '</body></html>';
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (u.hostname === 'claude.test') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE }); return r.abort(); });
  const R = []; const ok = (n, c, x = '') => R.push([c ? 'OK ' : 'NG ', n, x]);
  await p.goto('https://claude.test/'); await p.waitForTimeout(2500);
  const info = () => p.evaluate(() => {
    const fl = document.querySelector('ul.flow');
    const rightTimes = [...fl.querySelectorAll('.c2')].filter(c => !c.closest('.evmenu')).map(c => c.innerText).filter(t => /\b\d{1,2}:\d{2}\b/.test(t));
    const leftTimes = [...fl.querySelectorAll('time')].map(t => t.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const fut = [...fl.querySelectorAll('li.gap.fut')].map(li => ({ t: li.innerText.replace(/\s+/g, ' ').replace('＋', '').trim(), h: li.getBoundingClientRect().height }));
    const past = [...fl.querySelectorAll('li.gap.past')].map(li => li.innerText.trim());
    return { rightTimes, leftTimes, fut, past, h: fl.getBoundingClientRect().height, nowLi: !!fl.querySelector('li.fl-now'), nowIn: !!fl.querySelector('li.ev .fr-now'), sleep: (fl.querySelector('li.gap.sleep') || {}).innerText };
  });
  let I = await info();
  ok('時刻は左の列だけ（右側の文に時刻がない）', I.rightTimes.length === 0, JSON.stringify(I.rightTimes));
  ok('左の列に、寝た・起きた・記録・予定の始まりと終わり・いま・就寝の目安', ['02:10', '10:12', '10:40', '12:35', '13:00', '13:40', '14:00', '15:05', '15:20', '16:00 18:00', '20:00 21:00', '22:00 01:00', '02:30'].every(t => I.leftTimes.includes(t)) && !I.leftTimes.includes('11:05 12:20'), JSON.stringify(I.leftTimes));
  ok('これからの空きが帯で出る（いま〜16:00・18〜20時・21〜22時・1時〜2:30）', JSON.stringify(I.fut.map(f => f.t)) === JSON.stringify(['空き 40分', '空き 2時間', '空き 1時間', '空き 1時間30分']), JSON.stringify(I.fut.map(f => f.t)));
  ok('空きの帯は長いほど高い', I.fut[1].h > I.fut[2].h && I.fut[2].h > I.fut[0].h, I.fut.map(f => f.h).join(','));
  ok('過ぎた空きは30分以上だけ、長さを薄く', JSON.stringify(I.past) === JSON.stringify(['1時間55分', '1時間5分']), JSON.stringify(I.past));
  const gm = await p.evaluate(() => {
    const ul = document.querySelector('ul.flow');
    const row = t => { const el = [...ul.querySelectorAll('li[data-ts]')].find(e => e.innerText.includes(t)); return el ? el.getBoundingClientRect().top : null; };
    const card = [...ul.querySelectorAll('li.ev')].find(li => li.innerText.includes('メルカリ')).getBoundingClientRect();
    const bands = [...ul.querySelectorAll('.gm-band')].map(b => { const r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
    const chips = [...ul.querySelectorAll('.gm-chip')].map(c => { const r = c.getBoundingClientRect(); return { t: c.innerText.replace(/\s+/g, ' ').trim(), tip: c.dataset.tip, top: r.top, bottom: r.bottom }; });
    return { rows: ul.querySelectorAll('li.fl-game, .fr-g, .gm-line').length, bands, chips, card: { top: card.top, bottom: card.bottom, left: card.left, right: card.right }, a: row('起きた。少しだるい'), b: row('お昼ごはん') };
  });
  ok('ゲームは行にしない（その時間に重ねる帯）', gm.rows === 0 && gm.bands.length === 2 && gm.chips.length === 2, JSON.stringify(gm.chips.map(c => c.t)));
  const [b1, b2] = gm.bands; const [c1, c2] = gm.chips;
  ok('札は横書きで「名前 長さ」', c1.t === '🎮 Valorant 1時間15分' && c2.t === '🎮 Valorant 50分', JSON.stringify([c1.t, c2.t]));
  ok('札に触れると時刻も出る', /Valorant\n11:05〜12:20（1時間15分）/.test(c1.tip) && /Valorant\n13:30〜14:20（50分）/.test(c2.tip));
  ok('予定のない時間のゲーム：記録の行の間に帯', b1.top > gm.a && b1.bottom <= gm.b + 2, JSON.stringify({ b1, a: gm.a, b: gm.b }));
  ok('予定と重なったゲーム：帯が予定のカードにかぶる（はみ出した分は下へ）', b2.top > gm.card.top && b2.top < gm.card.bottom && b2.bottom > gm.card.bottom && b2.right >= gm.card.right, JSON.stringify({ b2, card: gm.card }));
  ok('札は帯の右下（帯の中）', c1.bottom <= b1.bottom + 1 && c1.top >= b1.top && c2.bottom <= b2.bottom + 1, JSON.stringify({ c1, b1, c2, b2 }));
  ok('ゲームではないもの（壁紙）は出さない', !gm.chips.some(c => /wallpaper/i.test(c.t)));
  ok('今日の流れの予定はドラッグで動かせない', await p.evaluate(() => !document.querySelector('ul.flow [data-drag], ul.flow .rz, ul.flow .can-drag')));
  ok('今日のゲームの合計は壁紙を数えない（2時間5分）', (await p.evaluate(() => document.querySelector('.top').innerText)).includes('2時間5分'), await p.evaluate(() => document.querySelector('.top').innerText.replace(/\n/g, ' ')));
  await p.click('[data-act="go"][data-arg="cal"]'); await p.waitForTimeout(800);
  const wg = await p.evaluate(() => [...document.querySelectorAll('.wk-col.is-today .wk-game')].map(e => e.dataset.tip));
  ok('カレンダーの週の画面にも、ゲームの時間の細い帯', wg.length === 2 && /Valorant\n11:05〜12:20（1時間15分）/.test(wg[0]) && /13:30〜14:20/.test(wg[1]), JSON.stringify(wg));
  await p.click('[data-act="go"][data-arg="today"]'); await p.waitForTimeout(500);
  ok('前の晩からの睡眠の長さ', I.sleep === '睡眠 8時間2分', I.sleep);
  ok('予定の外の「いま」は1行', I.nowLi && !I.nowIn);
  ok('縦にコンパクト（1時間ごとの線がない）', I.h < 860 && !(await p.$('ul.flow li.hr')), Math.round(I.h));
  // 空きを押すと、その時刻から予定を入れられる
  await p.click('li.gap.fut >> nth=1 >> button.g-pill'); await p.waitForTimeout(400);
  const sd = await p.evaluate(() => ({ d: (document.querySelector('#cs-sd') || {}).value, t: (document.querySelector('#cs-st') || {}).value, e: (document.querySelector('#cs-et') || {}).value }));
  ok('18時からの空きを押すと、18:00から予定を入れる画面', sd.d === D && sd.t === '18:00' && sd.e === '19:00', JSON.stringify(sd));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // 予定の最中は「いま」がカードの中
  await p.clock.setFixedTime(new Date(at(D, 13, 20))); await p.evaluate(() => window.dispatchEvent(new Event('focus'))); await p.click('[data-act="go"][data-arg="tasks"]'); await p.waitForTimeout(300); await p.click('[data-act="go"][data-arg="today"]'); await p.waitForTimeout(600);
  I = await info();
  ok('予定の最中は「いま」がそのカードの中に出る', I.nowIn && !I.nowLi);
  // 就寝の目安（02:30）を過ぎてもゲームをしていた夜：過ぎてからの部分だけ帯が濃い
  await p.clock.setFixedTime(new Date(at(D, 3, 20)));
  await p.evaluate(([f, t]) => { const S = window.__daylogState; const D0 = Object.keys(S.pc).sort().pop(); S.pc[D0] = { ...S.pc[D0], sessions: [...S.pc[D0].sessions, { g: 'VALORANT-Win64-Shipping', from: f, to: t, min: 100 }] }; }, [at(D, 1, 30), at(D, 3, 10)]);
  await p.click('[data-act="go"][data-arg="tasks"]'); await p.waitForTimeout(300); await p.click('[data-act="go"][data-arg="today"]'); await p.waitForTimeout(800);
  const late = await p.evaluate(() => {
    const ul = document.querySelector('ul.flow');
    const bed = [...ul.querySelectorAll('li.fl-bed')].pop().getBoundingClientRect();
    const bands = [...ul.querySelectorAll('.gm-band')].map(b => ({ late: b.classList.contains('late'), top: b.getBoundingClientRect().top, bottom: b.getBoundingClientRect().bottom, bg: getComputedStyle(b).backgroundImage }));
    const chips = [...ul.querySelectorAll('.gm-chip')].map(c => ({ late: c.classList.contains('late'), tip: c.dataset.tip }));
    return { bedTop: bed.top, bands, chips };
  });
  const lb = late.bands.filter(b => b.late); const lc = late.chips.filter(c => c.late);
  ok('就寝の目安を過ぎてからの部分だけ、濃い帯が重なる', lb.length === 1 && Math.abs(lb[0].top - late.bedTop) < 14 && lb[0].bottom > late.bedTop + 20, JSON.stringify({ lb, bed: late.bedTop }));
  ok('濃い帯の色はふつうの帯より濃い', lb.length === 1 && /26%|0\.26/.test(lb[0].bg) || (lb[0] && lb[0].bg !== late.bands.find(b => !b.late).bg), lb[0] && lb[0].bg.slice(0, 80));
  ok('その札だけ目印つき・触れると「目安を過ぎてから◯分」', lc.length === 1 && /就寝の目安（02:30）を過ぎてから 40分/.test(lc[0].tip) && late.chips.filter(c => !c.late).every(c => !/過ぎてから/.test(c.tip)), JSON.stringify(lc));
  ok('ページのエラーなし', errs.length === 0, errs.join(' | '));
  R.forEach(r => console.log(r.join(' '))); const ng = R.filter(r => r[0] === 'NG ').length; console.log(ng ? 'NG ' + ng : 'ALL OK');
  await b.close(); process.exit(ng ? 1 : 0);
})();
