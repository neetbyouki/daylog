// 育成の3問：問題を受け取る・答える・スキップ・評価・成長となつき・もう一度開く・エラー
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
    if (req.a === 'chat') { (global.__chatReqs ||= []).push(req); if (global.__chatMode === 'nokey') return { error: { code: 'no_key', message: 'x' } };
      if (req.kind === 'quiz') return { quiz: { date: D, qs: [
        { id: 'q1', genre: '哲学', title: '思考実験：古いセーブデータ', prompt: '10年前のセーブデータを今の自分が続けたら、それは「同じ冒険」？', sec: 30, trains: '同一性を言葉にする力', ref: 'テセウスの船' },
        { id: 'q2', genre: '経済学', title: '逆から：損する店', prompt: '売るほど損する商品で、店がもうかる仕組みを1つ。', sec: 30, trains: 'ビジネスモデルを逆算する力', ref: 'ロスリーダー' },
        { id: 'q3', genre: '文学', title: '今日の言葉：木漏れ日', prompt: '「木漏れ日」を使って、朝の部屋を1文で。', sec: 60, trains: '情景を描く力', ref: '木漏れ日（日本語の美しい言葉）' } ] } };
      if (req.kind === 'quizReview') return { review: { overall: '3問、**ちゃんと考えた**のが伝わった。', items: [
        { good: '「続きを始めた自分」という見方がいい。', angle: '記憶が同じなら同じ、とも言える。', answer: '**テセウスの船**：部品が全部入れかわっても同じ船か。' },
        { good: '', angle: '赤字の目玉で人を呼ぶ店もある。', answer: '**ロスリーダー**：わざと安い商品で客を集める。' },
        { good: '光の粒、という言い方がきれい。', angle: '音で描くこともできる。', answer: '木漏れ日は英語に一語で訳しにくい言葉として知られる。' } ] } };
      return { reply: 'x' }; }
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
  global.__chatMode = 'ok';
  await run('育成の3問', (put) => {
    put('pet', 'main', { born: Date.now() - 5 * 864e5, bornDay: addD(D, -5), v: 1, name: 'モチ', hatchedAt: Date.now() - 4 * 864e5 });
    put('days', addD(D, -1), { date: addD(D, -1), entries: ents(addD(D, -1), 5), close: { done: true, at: at(addD(D, -1), 23, 0) } });
  }, async ({ p, docs }) => {
    const day = () => docs.get('days/' + D).data;
    await p.click('.pet-mini'); await p.waitForTimeout(500);
    let t = await p.evaluate(() => document.querySelector('.pq-go').innerText);
    check('部屋に「育成」ボタン', /育成/.test(t) && /30秒くらいの問題が3つ/.test(t), t);
    const before = await p.evaluate(() => [...document.querySelectorAll('.pr-m')].map(x => x.innerText.replace(/\s+/g, ' ')));
    await p.click('.pq-go'); await p.waitForTimeout(700);
    check('問題を作ってもらう（kind quiz）', global.__chatReqs.some(r => r.kind === 'quiz'));
    check('今日の問題を保存', day().quiz && day().quiz.qs.length === 3 && day().quiz.ans.every(a => a === null), day().quiz);
    t = await p.evaluate(() => document.querySelector('.pq').innerText);
    check('1問目：ジャンル・ミッション名・問題・鍛えられる・目安', /哲学/.test(t) && /［思考実験：古いセーブデータ］/.test(t) && /同じ冒険/.test(t) && /鍛えられる：同一性を言葉にする力/.test(t) && /目安 30秒/.test(t), t);
    check('答えの元ネタは先に見せない', !/テセウス/.test(t));
    check('入力欄にすぐ打てる', await p.evaluate(() => document.activeElement && document.activeElement.id === 'pq-a0'));
    await p.screenshot({ path: 'quiz-q1.png' });
    await p.fill('#pq-a0', '続きを始めた自分の冒険だから、別の冒険'); await p.click('[data-act="petQuizNext"]:not([data-arg])'); await p.waitForTimeout(400);
    check('1問目の答えを保存', day().quiz.ans[0] === '続きを始めた自分の冒険だから、別の冒険', day().quiz.ans);
    t = await p.evaluate(() => document.querySelector('.pq').innerText); check('2問目へ', /損する店/.test(t), t.slice(0, 80));
    await p.click('[data-act="petQuizNext"][data-arg="skip"]'); await p.waitForTimeout(400);
    check('スキップは空で保存', day().quiz.ans[1] === '', day().quiz.ans);
    t = await p.evaluate(() => document.querySelector('.pq').innerText); check('3問目は1分の目安・ボタンは「答えを渡す」', /木漏れ日/.test(t) && /目安 1分/.test(t) && /答えを渡す/.test(t), t);
    // 目安の時間を過ぎても書ける（3問目を開いたまま時計を進めて、ペットを押して描き直す）
    const t3 = await p.evaluate(() => Date.now());
    await p.fill('#pq-a2', 'カーテンのすき間から光の粒がこぼれる');
    await p.clock.setFixedTime(new Date(t3 + 70e3)); await p.click('.pr-pet'); await p.waitForTimeout(300);
    t = await p.evaluate(() => document.querySelector('.pq').innerText); check('目安を過ぎたら「そのまま書いていい」', /目安の時間/.test(t) && /そのまま書いていい/.test(t), t.slice(0, 200));
    check('描き直しても下書きは残る', (await p.inputValue('#pq-a2')) === 'カーテンのすき間から光の粒がこぼれる');
    await p.click('[data-act="petQuizBack"]'); await p.waitForTimeout(300);
    check('戻ると2問目（スキップ済み・空）', /損する店/.test(await p.evaluate(() => document.querySelector('.pq').innerText)) && (await p.inputValue('#pq-a1')) === '');
    await p.click('[data-act="petQuizNext"][data-arg="skip"]'); await p.waitForTimeout(300);
    check('3問目に戻っても答えは残る', (await p.inputValue('#pq-a2')) === 'カーテンのすき間から光の粒がこぼれる');
    await p.click('[data-act="petQuizNext"]:not([data-arg])'); await p.waitForTimeout(900);
    const rq = global.__chatReqs.find(r => r.kind === 'quizReview');
    check('評価を頼む（答えも渡す）', rq && rq.quiz && rq.quiz.ans[0].startsWith('続きを') && rq.quiz.ans[1] === '' && rq.quiz.ans[2].startsWith('カーテン') && !('sec' in rq.quiz.qs[0]), rq && rq.quiz);
    check('渡した時刻と評価を保存', day().quiz.doneAt && day().quiz.review && /ちゃんと考えた/.test(day().quiz.review.overall), day().quiz);
    t = await p.evaluate(() => document.querySelector('.pq').innerText);
    check('評価：ひとこと・よかった・別の見方・答え', /ちゃんと考えた/.test(t) && /よかった/.test(t) && /別の見方/.test(t) && /答え・元ネタ/.test(t) && /テセウスの船/.test(t) && /ロスリーダー/.test(t), t.slice(0, 400));
    check('スキップした問題は「スキップ」・よかったは出さない', /スキップ/.test(t) && (t.match(/よかった/g) || []).length === 2);
    check('太字で出る', await p.evaluate(() => !!document.querySelector('.pq-rv-say b')));
    check('成長＋8・なつき＋2', /成長 ＋8/.test(t) && /なつき ＋2/.test(t));
    await p.screenshot({ path: 'quiz-review.png', fullPage: true });
    await p.click('[data-act="petQuizClose"]'); await p.waitForTimeout(400);
    const after = await p.evaluate(() => [...document.querySelectorAll('.pr-m')].map(x => x.innerText.replace(/\s+/g, ' ')));
    const num = (a, i) => Number((a[i].match(/(\d+)\s*$/) || [])[1]);
    check('なつきが2増えた', num(after, 1) === num(before, 1) + 2, [before, after]);
    const st = docs.get('pet/main').data.stats; check('成長（xp）に8入った', st && st.xp >= 8, st);
    t = await p.evaluate(() => document.querySelector('.pq-go').innerText); check('ボタンは済み・2/3', /済み/.test(t) && /2\/3/.test(t), t);
    const n0 = global.__chatReqs.length; await p.click('.pq-go'); await p.waitForTimeout(400);
    check('もう一度開くと評価だけ（新しく作らない）', global.__chatReqs.length === n0 && /ちゃんと考えた/.test(await p.evaluate(() => document.querySelector('.pq').innerText)));
  });
  await run('つながらないとき', (put) => { put('pet', 'main', { born: Date.now(), bornDay: D, v: 1 }); }, async ({ p, docs }) => {
    global.__chatMode = 'nokey';
    await p.click('.pet-mini'); await p.waitForTimeout(400); await p.click('.pq-go'); await p.waitForTimeout(600);
    const t = await p.evaluate(() => document.querySelector('.pq').innerText);
    check('案内ともう一度', /APIキー|キー/.test(t) && /もう一度/.test(t), t);
    check('問題は保存しない', !(docs.get('days/' + D).data.quiz));
    global.__chatMode = 'ok'; await p.click('.pq [data-act="petQuizOpen"]'); await p.waitForTimeout(600);
    check('もう一度で受け取れる', /古いセーブデータ/.test(await p.evaluate(() => document.querySelector('.pq').innerText)));
  });
  console.log(ok ? 'ALL OK' : 'SOME NG');
})();
