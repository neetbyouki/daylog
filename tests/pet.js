// ペット：たまご → ちび → おとな、ほし（自動のごはん）、おやつ、名前、旅とおみやげ、手紙、しんどい日、寝ている
const { chromium } = require('playwright');
const fs = require('fs'); const vm = require('vm');
const { D, Y, at, seedDocs } = require('./common');
const html = fs.readFileSync(__dirname + '/.out/daylog.html', 'utf8');
const sbx = { window: {}, document: { addEventListener() {} }, console };
vm.runInNewContext(fs.readFileSync(__dirname + '/../store.js', 'utf8'), sbx);
const { mergeDoc } = sbx.window.DaylogStore;
const addD = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const wrap = j => JSON.stringify({ result: 'Below ... <untrusted-data-u1> boundaries.\n\n<untrusted-data-u1>\n' + JSON.stringify(j) + '\n</untrusted-data-u1>\n\nUse ... <untrusted-data-u1> boundaries.' });
let ok = true; const check = (n, c, x) => { console.log((c ? 'OK  ' : 'NG  ') + n + (x !== undefined ? '  ' + JSON.stringify(x).slice(0, 300) : '')); if (!c) ok = false; };
const ents = (d, n) => Array.from({ length: n }, (_, i) => ({ id: d + 'e' + i, t: at(d, 12 + i, 0), text: '記録' + i }));
async function run(name, setup, body, opts = {}) {
  console.log('── ' + name);
  let clock = Date.now() - 3600e3; const docs = new Map();
  const put = (c, id, data) => docs.set(c + '/' + id, { c, id, data, u: (clock = Math.max(clock + 1, Date.now())) });
  for (const [c, id, d] of seedDocs()) put(c, id, d);
  setup(put, docs);
  function api(req) {
    if (req.a === 'load') return [...docs.values()];
    if (req.a === 'since') return [...docs.values()].filter(r => r.u >= req.since);
    if (req.a === 'ids') return [...docs.values()].map(r => ({ c: r.c, id: r.id }));
    if (req.a === 'patch') { const cur = docs.get(req.c + '/' + req.id); put(req.c, req.id, mergeDoc(cur && cur.data, req.patch)); return docs.get(req.c + '/' + req.id).data; }
    if (req.a === 'set') { put(req.c, req.id, req.data); return req.data; }
    if (req.a === 'del') { docs.delete(req.c + '/' + req.id); return true; }
    if (req.a === 'err') { console.log('  client err', JSON.stringify(req.rows).slice(0, 300)); return true; }
    if (req.a === 'chat') { global.__chatReq = req; if (global.__chatMode === 'nokey') return { error: { code: 'no_key', message: 'x' } }; put('meta', 'chatuse', { month: D.slice(0, 7), calls: 3, usd: 0.0123, day: D, dayCalls: 3 }); return { reply: '今日は**2回**書いたね。<i>x</i> おつかれさま。', used: { tools: ['get_days'], usd: 0.002, monthUsd: 0.0123 } }; }
    throw new Error('daylog_api: unknown action');
  }
  const b = await chromium.launch();
  const W = Number(process.env.W || 420);
  const ctx = await b.newContext({ timezoneId: 'Asia/Tokyo', viewport: { width: W, height: 900 }, deviceScaleFactor: Number(process.env.DSF || 1) });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date(opts.now || at(D, 15, 20)));
  await p.exposeFunction('__sql', q => { const m = q.match(/^select api_daylog\.call\((\$d[a-z0-9]+\$)([\s\S]*)\1::jsonb\) as r$/); return wrap([{ r: api(JSON.parse(m[2])) }]); });
  const MOCK = `const mcp = { listTools: async () => ({ servers: [] }), callTool: async (server, tool, a) => {
      if (server === 'Supabase') return { payload: await window.__sql(a.query) };
      if (server === 'Google Calendar') return { payload: tool === 'list_events' ? { events: [] } : { id: 'x' } };
      throw { code: 'server_not_connected' }; } };
    window.claude = { use: async n => (n === 'mcp' ? mcp : n === 'user' ? { isOwner: async () => true } : null) };`;
  const PAGE = '<!doctype html><html><head><meta charset="utf-8"><script>' + MOCK + '</script></head><body>' + html + '</body></html>';
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (u.hostname === 'claude.test') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE }); return r.abort(); });
  await p.goto('https://claude.test/'); await p.waitForTimeout(2200);
  const rerender = async slot => { await p.evaluate(s => { if (s) window.__daylogState.petSlot = s; }, slot); await p.click('.nav button[data-arg="tasks"]'); await p.waitForTimeout(150); await p.click('.nav button[data-arg="today"]'); await p.waitForTimeout(400); };
  const key = sel => p.evaluate(s => { const e = document.querySelector(s + ' .pet-body'); return e ? e.dataset.k : null; }, sel);
  await body({ p, docs, put, rerender, key, at });
  if (errs.length) console.log('  errs', errs);
  check(name + '：エラーなし', !errs.length);
  await b.close();
}
(async () => {
  // A：はじめて → たまご
  await run('はじめて（たまご）', (put) => {}, async ({ p, docs, rerender, key }) => {
    const pd = docs.get('pet/main'); check('たまごを置いた', pd && pd.data.bornDay === D, pd && pd.data);
    check('会いに来た日に印', docs.get('days/' + D).data.pet && docs.get('days/' + D).data.pet.seen === true);
    await rerender('sec');
    check('今日の流れの見出しにたまご', (await key('h2.sec')) === 'egg', await key('h2.sec'));
    await p.screenshot({ path: 'pet-today-egg.png' });
    await rerender('gap');
    check('これからの空きにたまご（gap）', !!(await p.$('.flow li.gap.fut .pet-mini')));
    // 記録を書くとほしが増えて、うれしい（たまごはゆれる）
    await p.fill('#composer-text', 'ペットのテスト'); await p.click('[data-act="sendEntry"]'); await p.waitForTimeout(500);
    check('ほし＋2の印', (await p.evaluate(() => (document.querySelector('.pet-gain') || {}).textContent)) === '＋2', await p.evaluate(() => (document.querySelector('.pet-gain') || {}).textContent));
    await p.click('.nav button[data-arg="sky"]'); await p.waitForTimeout(1500);
    check('星空の左下にもいる', !!(await p.$('.skybox .pet-at-sky .pet-mini')));
    await p.click('.skybox .pet-mini'); await p.waitForTimeout(400);
    const room = await p.evaluate(() => document.querySelector('.pet-room') && document.querySelector('.pet-room').innerText);
    check('部屋：たまご・おやつは食べられない', /たまご/.test(room) && /たまごはまだ食べられない/.test(room), room && room.slice(0, 300));
    await p.screenshot({ path: 'pet-room-egg.png' });
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    check('Escで閉じる', !(await p.$('.pet-room')));
  });
  // B：ちび（名前・おやつ）
  await run('ちび', (put) => {
    put('pet', 'main', { born: Date.now(), bornDay: addD(D, -3), v: 1 });
    for (let i = 1; i <= 3; i++) put('days', addD(D, -i), { date: addD(D, -i), entries: ents(addD(D, -i), 5), pet: { seen: true } });
  }, async ({ p, docs, rerender, key }) => {
    await rerender('gap'); await p.screenshot({ path: 'pet-today-gap.png' });
    await p.click('.nav button[data-arg="sky"]'); await p.waitForTimeout(1500); await p.screenshot({ path: 'pet-sky.png' });
    await rerender('sec');
    check('ちびがいる', (await key('h2.sec')) === 'chibi-normal', await key('h2.sec'));
    check('まばたきの絵も重ねている', !!(await p.$('h2.sec .pet-blink')));
    await p.click('h2.sec .pet-mini'); await p.waitForTimeout(400);
    check('名前を付けるカード', /生まれた！/.test(await p.evaluate(() => document.querySelector('.pet-room').innerText)));
    await p.fill('#pet-name', 'ぽち'); await p.click('[data-act="petName"]'); await p.waitForTimeout(300);
    check('名前を保存', docs.get('pet/main').data.name === 'ぽち');
    check('見出しに名前', (await p.evaluate(() => document.querySelector('.pr-title b').textContent)) === 'ぽち');
    const n0 = await p.evaluate(() => document.querySelector('[data-act="petFeed"][data-arg="veg"] .pf-n').textContent);
    check('おにくは棚にない（押せない）', await p.evaluate(() => document.querySelector('[data-act="petFeed"][data-arg="meat"]').disabled));
    await p.click('[data-act="petFeed"][data-arg="veg"]'); await p.waitForTimeout(300);
    check('やさいのおかわり → 今日の extra.veg=1', docs.get('days/' + D).data.pet.extra.veg === 1, docs.get('days/' + D).data.pet);
    check('おかわりでうれしい顔', (await key('.pr-pet')) === 'chibi-happy', await key('.pr-pet'));
    check('やさい＋3の印', !!(await p.$('.pr-pet .pet-gain .pg-veg')));
    check('棚のやさいが1回分減る', (await p.evaluate(() => document.querySelector('[data-act="petFeed"][data-arg="veg"] .pf-n').textContent)) !== n0, [n0]);
    await p.waitForTimeout(2800);
    const line0 = await p.evaluate(() => document.querySelector('.pr-bubble').textContent);
    await p.click('.pr-pet'); await p.waitForTimeout(200);
    check('話しかけるとひとことが変わる', (await p.evaluate(() => document.querySelector('.pr-bubble').textContent)) !== line0);
    await p.screenshot({ path: 'pet-room-chibi.png' });
  });
  // H：ごはんの種類と能力
  await run('ごはんの種類', (put, docs) => {
    put('pet', 'main', { born: Date.now(), bornDay: Y, v: 1, name: 'ぽち', hatchedAt: 1 });
    Object.assign(docs.get('days/' + Y).data, { close: { done: true, at: at(Y, 1, 50) }, bedtime: { time: '02:30', by: 'calc' } });
    const d = docs.get('days/' + D).data; d.wakeAt = at(D, 9, 30); d.wakeFix = true; d.entries.push({ id: 'tm1', t: at(D, 13, 0), text: '⏱ テロップ（20分）' });
    put('tasks', 't1', { id: 't1', title: 'サムネ', status: 'done', doneAt: at(D, 14, 0), weight: 'mid', createdAt: at(D, 9, 0) });
  }, async ({ p, docs, rerender }) => {
    await rerender('sec');
    await p.click('h2.sec .pet-mini'); await p.waitForTimeout(400);
    const v = await p.evaluate(() => [...document.querySelectorAll('.ps-row')].map(r => r.querySelector('.ps-n').textContent + r.querySelector('.ps-v').textContent));
    // 2026-11-27c：いちばん低い能力のごはんは1.5倍（前の日まで全部0なので、同点の先頭＝おにく）→ ちから 6×1.5＝9
    check('能力：ちから9（(タスク4＋タイマー2)×1.5）・かしこさ7（夜モード5＋日記2）・ひかり9（早寝4＋早起き5）', v.join(',') === 'ちから9,かしこさ7,ひかり9', v);
    check('今日のボーナスはおにく', /今日はおにくが1.5倍/.test(await p.evaluate(() => document.querySelector('.pf-bonus').textContent)));
    check('いまの能力なら ほしドラ（同点はほしドラが先）', /ほしドラ/.test(await p.evaluate(() => document.querySelector('.ps-lean').textContent)));
    const st = docs.get('pet/main').data.stats; check('チャット用の控えに能力', st && st.power === 9 && st.wisdom === 7 && st.light === 9, st);
    await p.screenshot({ path: 'pet-room-food.png', fullPage: false });
    await p.setViewportSize({ width: 420, height: 1500 }); await p.waitForTimeout(200); await p.screenshot({ path: 'pet-room-food-full.png' }); await p.setViewportSize({ width: 420, height: 900 });
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    await p.fill('#composer-text', '日記を書いた'); await p.click('[data-act="sendEntry"]'); await p.waitForTimeout(400);
    check('日記を書くと「やさい＋2」', !!(await p.$('h2.sec .pet-gain .pg-veg')) && /＋2/.test(await p.evaluate(() => document.querySelector('h2.sec .pet-gain').textContent)));
  });
  // I：夜ふかしが多くても よるコウモリ にはならない（今は出さない）
  await run('よるコウモリは出ない', (put) => {
    put('pet', 'main', { born: Date.now(), bornDay: addD(D, -20), v: 1, name: 'ぽち', hatchedAt: 1 });
    for (let i = 1; i <= 20; i++) { const d = addD(D, -i); put('days', d, { date: d, entries: ents(d, 5), close: { done: true, at: at(d, 5, 0) }, wakeAt: at(d, 14, 0), pet: { seen: true } }); }
  }, async ({ docs }) => {
    check('夜ふかしでも、いちばん高い能力の姿（ゆきうさ）', docs.get('pet/main').data.form === 'usa', docs.get('pet/main').data.form);
  });
  // J：おはなし（Claude API はサーバー側。ここでは api_daylog.call の 'chat' を模す）
  await run('おはなし', (put) => {
    put('pet', 'main', { born: Date.now(), bornDay: addD(D, -3), v: 1, name: 'ぽち', hatchedAt: 1 });
    for (let i = 1; i <= 3; i++) put('days', addD(D, -i), { date: addD(D, -i), entries: ents(addD(D, -i), 5), pet: { seen: true } });
    put('petchat', 'c0', { role: 'assistant', text: 'やあ', at: at(D, 14, 0) });
    put('petchat', 'c1', { role: 'user', text: 'きのうはどうだった？', at: at(D, 14, 1) });
    put('petchat', 'c2', { role: 'assistant', text: '5回書いてたよ。', at: at(D, 14, 2) });
  }, async ({ p, docs, rerender }) => {
    global.__chatMode = 'ok';
    await rerender('sec'); await p.click('h2.sec .pet-mini'); await p.waitForTimeout(300);
    await p.click('[data-act="petTab"][data-arg="chat"]'); await p.waitForTimeout(300);
    check('前の会話が見える', (await p.$$eval('.pc-m', e => e.length)) === 3);
    await p.fill('#pet-chat-in', '今日はどう？'); await p.keyboard.press('Enter'); await p.waitForTimeout(800);
    const req = global.__chatReq;
    check('これまでの会話＋いまの言葉を送る', req && req.messages.length === 4 && req.messages[3].content === '今日はどう？' && req.messages[3].role === 'user', req && req.messages);
    const txt = await p.evaluate(() => document.querySelector('.pc-log').innerText);
    check('返事が出る（自分の言葉のあと）', /今日はどう？[\s\S]*今日は2回書いたね/.test(txt), txt);
    const bold = await p.$$eval('.pc-m.pet .pc-b b', e => e.map(x => x.textContent));
    check('**ことば** が太字になる', bold.includes('2回'), bold);
    check('ほかのタグは文字のまま', (await p.$$eval('.pc-m.pet .pc-b i', e => e.length)) === 0 && txt.includes('<i>x</i>'), txt);
    check('自分の言葉は太字にしない', (await p.$$eval('.pc-m.me .pc-b b', e => e.length)) === 0);
    const pcs = [...docs.values()].filter(r => r.c === 'petchat');
    check('会話を保存（自分と返事）', pcs.length === 5 && pcs.some(r => r.data.role === 'assistant' && /2回\*\*書いた/.test(r.data.text)), pcs.length);
    check('使った量（今月）', /今月 1回・約2円/.test(await p.evaluate(() => document.querySelector('.pc-foot').innerText)), await p.evaluate(() => document.querySelector('.pc-foot').innerText));
    await p.screenshot({ path: 'pet-chat.png' });
    global.__chatMode = 'nokey';
    await p.fill('#pet-chat-in', 'もう一回'); await p.click('[data-act="petChatSend"]'); await p.waitForTimeout(600);
    check('キーがないときの案内', /APIキーが入っていない/.test(await p.evaluate(() => document.querySelector('.pc-log').innerText)));
    await p.click('[data-act="petChatClear"]'); await p.waitForTimeout(200); await p.click('[data-act="petChatClear"][data-arg="yes"]'); await p.waitForTimeout(500);
    check('会話を消す', ![...docs.values()].some(r => r.c === 'petchat'));
    // 設定：前もって伝えておくこと
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    await p.click('[data-act="toggleSettings"]'); await p.waitForTimeout(400);
    await p.fill('#chat-prompt', '結論から短く。'); await p.click('[data-act="petChatPromptSave"]'); await p.waitForTimeout(400);
    check('指示を保存', docs.get('settings/main').data.chatPrompt === '結論から短く。');
  });
  // C：おとなに進化（記録が多い2週間 → ゆきうさ）
  // J2：おはなしのスクロール（描き直しても上に戻らない）と、小見出し・箇条書き
  await run('おはなしのスクロール', (put) => {
    put('pet', 'main', { born: Date.now(), bornDay: addD(D, -3), v: 1, name: 'ぽち', hatchedAt: 1 });
    for (let i = 0; i < 30; i++) put('petchat', 'k' + String(i).padStart(2, '0'), { role: i % 2 ? 'assistant' : 'user', text: i === 29 ? '## まとめ\n- **起きた** 12:46\n- 記録 5回\nふつうの行' : 'メッセージ' + i + '\n'.repeat(2), at: at(D, 13, i) });
  }, async ({ p, rerender }) => {
    global.__chatMode = 'ok';
    await rerender('sec'); await p.click('h2.sec .pet-mini'); await p.waitForTimeout(300);
    await p.click('[data-act="petTab"][data-arg="chat"]'); await p.waitForTimeout(400);
    const pos = () => p.evaluate(() => { const o = document.querySelector('.pet-over'), l = document.querySelector('#pc-log'); return { o: o.scrollTop, ob: o.scrollHeight - o.clientHeight, gap: l.scrollHeight - l.scrollTop - l.clientHeight }; });
    let a = await pos();
    check('開くと会話のいちばん下', a.gap < 4, a);
    { const r = await p.evaluate(() => { const r = document.querySelector('#pet-chat-in').getBoundingClientRect(); return { t: r.top, b: r.bottom, h: innerHeight }; }); check('入力欄が見える', r.b <= r.h + 1 && r.t >= 0, { r, a }); }
    const redraw = async () => { await p.evaluate(() => document.querySelector('[data-act="petChatClear"]').click()); await p.waitForTimeout(250); await p.evaluate(() => document.querySelector('[data-act="petChatClear"][data-arg="no"]').click()); await p.waitForTimeout(250); };
    await p.evaluate(() => { document.querySelector('.pet-over').scrollTop = 60; }); a = await pos();
    await redraw();
    const b = await pos();
    check('描き直しても部屋の位置が戻らない', Math.abs(b.o - a.o) < 2, { a, b });
    check('描き直しても会話は下のまま', b.gap < 4, b);
    await p.evaluate(() => { document.querySelector('#pc-log').scrollTop = 40; });
    await redraw();
    check('上を読んでいる途中なら、その位置のまま', (await p.evaluate(() => document.querySelector('#pc-log').scrollTop)) === 40);
    const last = await p.$$eval('.pc-m.pet .pc-b', e => e[e.length - 1].innerHTML);
    check('小見出しと箇条書き', /<b class="pc-h">まとめ<\/b>/.test(last) && /・<b>起きた<\/b> 12:46/.test(last) && /・記録 5回/.test(last), last);
    await p.fill('#pet-chat-in', 'ねえ'); await p.keyboard.press('Enter'); await p.waitForTimeout(800);
    check('送ったあとも会話のいちばん下', (await pos()).gap < 4, await pos());
  });

  await run('おとな（進化）', (put) => {
    put('pet', 'main', { born: Date.now(), bornDay: addD(D, -20), v: 1, name: 'ぽち', hatchedAt: 1 });
    for (let i = 1; i <= 20; i++) { const d = addD(D, -i); put('days', d, { date: d, entries: ents(d, 5), close: { done: true, at: at(d, 2, 0) }, wakeAt: at(d, 13, 0), pet: { seen: true } }); }
  }, async ({ p, docs, rerender, key }) => {
    const pd = docs.get('pet/main').data;
    check('姿を決めた：ゆきうさ', pd.form === 'usa' && pd.evoSeen === false, pd);
    check('チャット用の控え（stats）', pd.stats && pd.stats.stage === 'adult' && pd.stats.form === 'usa', pd.stats);
    await rerender('sec');
    check('ゆきうさの顔', /^usa-/.test(await key('h2.sec')), await key('h2.sec'));
    await p.click('h2.sec .pet-mini'); await p.waitForTimeout(400);
    check('進化のカード', /おとなになった：ゆきうさ/.test(await p.evaluate(() => document.querySelector('.pet-room').innerText)));
    await p.screenshot({ path: 'pet-room-adult.png' });
    await p.click('[data-act="petEvoSeen"]'); await p.waitForTimeout(300);
    check('わかった → evoSeen', docs.get('pet/main').data.evoSeen === true);
  });
  // D：何日もあいた → 旅とおみやげ
  await run('旅', (put) => {
    put('pet', 'main', { born: Date.now(), bornDay: addD(D, -10), v: 1, name: 'ぽち', hatchedAt: 1 });
    put('days', addD(D, -5), { date: addD(D, -5), entries: ents(addD(D, -5), 5), pet: { seen: true } });
    put('days', addD(D, -6), { date: addD(D, -6), entries: ents(addD(D, -6), 5), pet: { seen: true } });
  }, async ({ p, docs, rerender }) => {
    const pd = docs.get('pet/main').data;
    check('旅に出ていた', pd.trip && pd.trip.from === addD(D, -5) && pd.trip.to === D && !pd.trip.seen && pd.souvenirs.length === 1, pd.trip);
    await rerender('sec');
    check('手紙の印（✉）', !!(await p.$('h2.sec .pet-badge')));
    await p.click('h2.sec .pet-mini'); await p.waitForTimeout(400);
    const room = await p.evaluate(() => document.querySelector('.pet-room').innerText);
    check('おかえりと絵はがき', /おかえり/.test(room) && /5日のあいだ/.test(room) && !!(await p.$('.pr-postcard svg')), room.slice(0, 200));
    await p.screenshot({ path: 'pet-room-trip.png' });
    await p.click('[data-act="petTripSeen"]'); await p.waitForTimeout(300);
    check('しまっておく → seen', docs.get('pet/main').data.trip.seen === true);
  });
  // E：しんどい日（不調）＋ 手紙
  await run('しんどい日と手紙', (put, docs) => {
    put('pet', 'main', { born: Date.now(), bornDay: addD(D, -3), v: 1, name: 'ぽち', hatchedAt: 1 });
    for (let i = 1; i <= 3; i++) put('days', addD(D, -i), { date: addD(D, -i), entries: ents(addD(D, -i), 5), pet: { seen: true } });
    const d = docs.get('days/' + D).data; d.mode = 'bad';
    put('petmail', 'm1', { id: 'm1', text: 'きのうもおつかれさま。\nゆっくりでいいよ。', at: Date.now() - 1000, read: false });
  }, async ({ p, docs, rerender }) => {
    await rerender('sec');
    check('不調の日は歩かない（still）', !!(await p.$('h2.sec .pet-lane.still')));
    await p.click('h2.sec .pet-mini'); await p.waitForTimeout(400);
    const room = await p.evaluate(() => document.querySelector('.pet-room').innerText);
    check('手紙が読める', /手紙が届いた/.test(room) && /ゆっくりでいいよ/.test(room));
    check('元気は「休む日」', /休む日/.test(room));
    check('何もしないを肯定するひとこと', /手紙が届いてるよ|ここにいるだけでいい|なにもしない日|ごろごろ|ここにいるよ|ごはんは気にしないで/.test(await p.evaluate(() => document.querySelector('.pr-bubble').textContent)));
    await p.click('[data-act="petLetterRead"]'); await p.waitForTimeout(300);
    check('読んだ → read', docs.get('petmail/m1').data.read === true);
    await p.click('.pr-pet'); await p.waitForTimeout(200);
    const t = await p.evaluate(() => document.querySelector('.pr-bubble').textContent);
    check('叱らない（不調の日の言葉）', /ここにいるだけでいい|なにもしない日|ごろごろ|書かなくても|ごはんは気にしないで/.test(t), t);
  });
  // F：夜モードのあと → 寝ている
  await run('寝ている', (put, docs) => {
    put('pet', 'main', { born: Date.now(), bornDay: addD(D, -3), v: 1, name: 'ぽち', hatchedAt: 1 });
    for (let i = 1; i <= 3; i++) put('days', addD(D, -i), { date: addD(D, -i), entries: ents(addD(D, -i), 5), pet: { seen: true } });
    const d = docs.get('days/' + D).data; d.close = { done: true, at: at(D, 15, 0), mood: 3 };
  }, async ({ p, rerender, key }) => {
    await rerender('sec');
    check('寝ている顔', (await key('h2.sec')) === 'chibi-sleep', await key('h2.sec'));
    await p.click('h2.sec .pet-mini'); await p.waitForTimeout(400);
    const room = await p.evaluate(() => document.querySelector('.pet-room').innerText);
    check('おやつは明日', /ねているから、また明日/.test(room));
    check('部屋が夜', !!(await p.$('.pr-scene.night')));
  });
  // G：隠す設定
  await run('隠す', (put, docs) => { docs.get('settings/main').data.petHide = true; put('pet', 'main', { born: Date.now(), bornDay: D, v: 1 }); }, async ({ p, rerender }) => {
    await rerender('sec'); check('隠すと出ない', !(await p.$('.pet-mini')));
  });
  console.log(ok ? 'ALL OK' : 'SOME NG');
})();
