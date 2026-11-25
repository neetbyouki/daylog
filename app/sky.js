// Daylog 本体の部品：星空：銀河（galaxy.js の読み込み）、前からの星空の描きかた、まとめ（ふりかえり）
// ・読み込む順は app/parts.json。全部を1つにつないで、1つの関数の中で動かす（boot.js／tools/build_claude.py）

/* ── 星空 ── */
function skyView() {
  const sk = S.sky; const age = moonAge(new Date());
  const [yy, mm] = sk.month.split('-').map(Number);
  let h = headerHTML('星空', `<span class="row" style="gap:5px">${moonSVG(age, 14)}今夜は${moonName(age)}（月齢 ${age.toFixed(1)}）</span>`);
  h += `<div class="crumbs"><button data-act="skyLevel" data-arg="universe" aria-current="${sk.level === 'universe'}">${sk.year}年の宇宙</button><span class="sep">›</span><button data-act="skyLevel" data-arg="month" aria-current="${sk.level === 'month'}">${mm}月の銀河</button>${sk.level === 'day' ? `<span class="sep">›</span><button aria-current="true">${shortLabel(sk.day)}の星座</button>` : ''}${sk.level === 'day' && sk.day === today() ? '' : `<span class="spacer"></span><button class="crumb-today" data-act="skyToday">今日へ</button>`}</div>`;
  // 銀河（galaxy.js）が使えるときはそれで描く。読み込み中・WebGLが使えない端末は、前からの描きかた
  h += `<div class="skybox">${galaxyOk() ? '<div id="gx-host" class="gx-host"></div>' : '<canvas id="sky" aria-label="星空。星をタップするとその記録が読める"></canvas>'}<div class="skynav"><button data-act="skyPrev" aria-label="前へ">‹</button><button data-act="skyNext" aria-label="次へ">›</button></div>${petMiniHTML('sky')}</div>`;
  h += `<div class="legend"><span><i style="--c:${STAR_C.diary}"></i>日記</span><span><i style="--c:${STAR_C.task}"></i>タスク</span><span><i style="--c:${STAR_C.gold}"></i>習慣・目標</span><span><i style="--c:${STAR_C.night}"></i>夜モード</span><span><i class="neb"></i>星雲</span>${info(sk.level === 'universe' ? '1年が12個の銀河。明るい銀河ほど記録が多い月。銀河をタップすると、その月の中へ進む。下の目盛りをなぞっても選べる。' : sk.level === 'month' ? '1か月が1つの渦巻銀河。腕の内側が月初、外側が月末で、点線の輪が10日・20日・30日の目安。星の集まりをタップすると、その日の星座へ進む。下の目盛りは日ごとの星の数（色はその日の体調）で、なぞると日を選べる。中心の金色は今月の目標の星座。星雲は不調・休養の日。横にドラッグすると銀河が回る。' : '星をタップすると、その時の記録が読める。線は記録した順で、数字はその時刻。下の目盛りをなぞると、ほかの日へ移れる。星雲は不調・休養の日。')}</div>`;
  if (sk.level === 'day') {
    const day = getDay(sk.day); const nm = day.close && day.close.name;
    h += `<div class="card" style="margin-top:12px"><div class="cname">${nm ? esc(nm) : `${shortLabel(sk.day)}の星座`}</div><div class="faint" style="font-size:12px">${dayLabel(sk.day)} · 星 ${starsForDay(sk.day).length} 個${isNebula(sk.day) ? ' · 星雲の日' : ''}</div>${day.close && day.close.comment ? `<div class="claude" style="margin-top:8px">${esc(day.close.comment)}</div>` : ''}</div>`;
  }
  if (sk.sel) h += `<div class="card" style="margin-top:8px"><div class="eyebrow">${esc(sk.sel.when || '')}</div><div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(sk.sel.label)}</div>${sk.sel.day ? `<button class="link" data-act="skyDay" data-arg="${sk.sel.day}" style="margin-top:6px">この日の星座を見る</button>` : ''}</div>`;
  h += reviewSection();
  return h;
}

/* ── まとめ ── */
function periodDays() {
  const r = S.review;
  if (r.kind === 'week') { const s = addDays(r.anchor, -6); return Array.from({ length: 7 }, (_, i) => addDays(s, i)); } // 過去7日間（最後が今日）
  const mk = monthKey(r.anchor); return Array.from({ length: daysInMonth(mk) }, (_, i) => `${mk}-${pad(i + 1)}`);
}
function reviewKey() { const r = S.review; return r.kind === 'week' ? 'd7-' + r.anchor : 'm-' + monthKey(r.anchor); }
function reviewSection() {
  const r = S.review; const days = periodDays(); const t = today();
  const past = days.filter(d => d <= t);
  const label = r.kind === 'week' ? `${shortLabel(days[0])} 〜 ${shortLabel(days[6])}` : `${days[0].slice(0, 4)}年${Number(days[0].slice(5, 7))}月`;
  const wroteN = past.filter(wrote).length;
  const nightN = past.filter(d => getDay(d).close && getDay(d).close.done).length;
  const taskN = Object.values(S.tasks).filter(x => x.status === 'done' && x.doneAt && days.includes(logicalDate(x.doneAt))).length;
  // 約束：守れた数／約束を始めてからの日数×約束の数（連続は数えない）
  const pl = promiseList(); const prFrom = Object.keys(S.days).filter(x => S.days[x] && S.days[x].promises).sort()[0];
  const prDays = prFrom ? past.filter(d => d >= prFrom) : []; const prN = prDays.reduce((a, d) => a + promisesKept(d).length, 0);
  const stat = (n, unit, l) => `<div class="stat"><div><b>${n}</b><small>${unit}</small></div><span>${l}</span></div>`;
  let h = `<section class="rev"><div class="revhead"><h2>ふりかえり</h2>
    <div class="row"><div class="seg" role="group" aria-label="期間"><button data-act="revKind" data-arg="week" aria-pressed="${r.kind === 'week'}">週</button><button data-act="revKind" data-arg="month" aria-pressed="${r.kind === 'month'}">月</button></div><span class="spacer"></span><button class="btn sm" data-act="revMove" data-arg="-1" aria-label="前の期間">‹</button><span class="revlabel">${label}</span><button class="btn sm" data-act="revMove" data-arg="1" aria-label="次の期間">›</button></div></div>`;
  h += `<div class="stats">${stat(wroteN, ` / ${past.length}日`, '書いた日')}${stat(nightN, '日', '夜モード')}${stat(taskN, '個', '終えたタスク')}${pl.length && prDays.length ? stat(prN, ` / ${prDays.length * pl.length}`, '守った約束') : ''}</div>`;
  h += colorCal(days);
  h += moodChart(days) + sleepChart(days) + gameChart(days);
  const rv = S.reviews[reviewKey()];
  if (claudeReady()) h += `<div class="chart"><div class="ct"><span>Claudeの気づき</span></div>${S.busy.rev ? '<div class="thinking" style="margin:6px 0">記録を読んでいる</div>' : rv && rv.text ? `<div class="insight" style="margin-top:6px">${esc(rv.text)}</div>` : '<div class="faint" style="font-size:13px;margin-top:4px">この期間の記録から、傾向を3つ拾ってもらえる。</div>'}
    ${claudeReady() ? `<div class="row" style="margin:8px 0 6px"><button class="btn sm" data-act="revInsight" ${S.busy.rev ? 'disabled' : ''}>${rv && rv.text ? '作り直す' : '気づきを出してもらう'}</button></div>` : '<div class="faint" style="font-size:12px;margin:6px 0">Claudeが使えるときに出せる。</div>'}</div>`;
  return h + '</section>';
}
function colorCal(days) {
  const t = today();
  const rolling = days.length === 7; // 過去7日間は1行で並べる
  const first = parseYmd(days[0]); const lead = rolling ? 0 : (first.getDay() + 6) % 7;
  const heads = rolling ? days.map(d => WD[parseYmd(d).getDay()]) : ['月', '火', '水', '木', '金', '土', '日'];
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<div class="c blank"></div>');
  for (const d of days) {
    const m = moodOf(d); const c = m ? MOOD_C[clamp(Math.round(m), 1, 5)] : 'var(--m0)';
    const tip = `${dayLabel(d)}\n${m ? '気分 ' + m : wrote(d) ? '気分の記録なし' : '記録なし'}${getDay(d).mode ? '\n体調モード ' + MODES[getDay(d).mode].label : ''}`;
    cells.push(`<div class="c ${d === t ? 'today' : ''}" style="background:${c};${d > t ? 'opacity:.35' : ''}" data-tip="${esc(tip)}">${isNebula(d) ? '<span class="neb"></span>' : ''}<span style="position:relative">${Number(d.slice(8))}</span></div>`);
  }
  return `<div class="chart"><div class="ct"><span>気分の色</span><span class="ramp">低 ${[1, 2, 3, 4, 5].map(i => `<i style="background:${MOOD_C[i]}"></i>`).join('')} 高</span></div><div class="cal7">${heads.map(w => `<div class="h">${w}</div>`).join('')}${cells.join('')}</div>
    <div class="faint" style="font-size:11px;margin:6px 0 4px" hidden>光の輪は不調・休養の日（星雲）。マスをタップすると中身が出る。</div></div>`;
}
function chartFrame(title, legend, svg, note = '') { return `<div class="chart"><div class="ct"><span>${title}${note ? info(note) : ''}</span><span class="lg">${legend}</span></div>${svg}</div>`; }
const chartW = () => (window.innerWidth < 560 ? 360 : 600);
function xLabels(days, W, L, R) {
  const n = days.length; const step = n > 10 ? Math.ceil(n / (W < 500 ? 5 : 8)) : 1;
  return days.map((d, i) => i % step === 0 || i === n - 1 ? `<text x="${L + (n === 1 ? (W - L - R) / 2 : i * (W - L - R) / (n - 1))}" y="${0}" text-anchor="middle">${shortLabel(d)}</text>` : '').join('');
}
function moodChart(days) {
  const W = chartW(), H = 170, L = 26, R = 30, T = 10, B = 24; const n = days.length;
  const x = i => L + (n === 1 ? (W - L - R) / 2 : i * (W - L - R) / (n - 1)); const y = v => T + (5 - v) / 4 * (H - T - B);
  const ser = [{ k: '気分', c: 'var(--mood)', f: moodOf }, { k: '体調', c: 'var(--body)', f: bodyOf }];
  let g = '';
  for (let v = 1; v <= 5; v++) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 8}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
  let marks = ''; let any = false;
  for (const s of ser) {
    const pts = days.map((d, i) => { const v = s.f(d); return v ? [x(i), y(v), v, d] : null; });
    let seg = []; const segs = [];
    pts.forEach(p => { if (p) seg.push(p); else if (seg.length) { segs.push(seg); seg = []; } }); if (seg.length) segs.push(seg);
    segs.forEach(sg => { if (sg.length > 1) marks += `<polyline points="${sg.map(p => p[0] + ',' + p[1]).join(' ')}" fill="none" stroke="${s.c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`; });
    pts.forEach(p => { if (p) { any = true; marks += `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${s.c}" stroke="var(--panel)" stroke-width="2"/>`; } });
    const lastP = [...pts].reverse().find(Boolean); if (lastP) marks += `<text x="${lastP[0] + 7}" y="${lastP[1] + 3}" style="fill:var(--fg-2)">${s.k}</text>`;
  }
  const hits = days.map((d, i) => `<rect x="${x(i) - (W - L - R) / Math.max(1, n - 1) / 2}" y="${T}" width="${(W - L - R) / Math.max(1, n - 1)}" height="${H - T - B}" fill="transparent" data-tip="${esc(`${dayLabel(d)}\n気分 ${moodOf(d) ?? '—'} · 体調 ${bodyOf(d) ?? '—'}`)}"/>`).join('');
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="気分と体調の推移">${g}${marks}<g transform="translate(0 ${H - 6})">${xLabels(days, W, L, R)}</g>${hits}</svg>`;
  return chartFrame('気分と体調', `<span><i style="--c:var(--mood)"></i>気分</span><span><i style="--c:var(--body)"></i>体調</span>`, svg, any ? '1〜5。締めのスコア（締めていない日は日中の平均）。' : 'スコアをつけると線になる。');
}
function sleepChart(days) {
  const W = chartW(), H = 200, L = 40, R = 30, T = 10, B = 24; const n = days.length;
  const pts = days.map(d => { const s = sleepAt(d), w = wakeAt(d); return { d, s: s ? minFromDayStart(d, s) : null, w: w ? minFromDayStart(d, w) : null }; });
  const vals = pts.flatMap(p => [p.s, p.w]).filter(v => v != null);
  let lo = 120, hi = 1320; if (vals.length) { lo = Math.min(lo, Math.floor((Math.min(...vals) - 30) / 120) * 120); hi = Math.max(hi, Math.ceil((Math.max(...vals) + 30) / 120) * 120); }
  const x = i => L + (n === 1 ? (W - L - R) / 2 : i * (W - L - R) / (n - 1)); const y = v => T + (v - lo) / (hi - lo) * (H - T - B);
  const stp = hi - lo > 720 ? 240 : 120; let g = ''; for (let v = lo; v <= hi; v += stp) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 8}" y="${y(v) + 3}" text-anchor="end">${clockFromMin(v)}</text>`;
  const goal = y(1200), goal2 = y(1320);
  g += `<rect x="${L}" y="${goal}" width="${W - L - R}" height="${goal2 - goal}" fill="rgba(184,167,255,.07)"/><text x="${W - R + 4}" y="${(goal + goal2) / 2 + 3}" style="fill:var(--fg-3)">目標</text>`;
  let marks = '';
  pts.forEach((p, i) => {
    if (p.w != null) marks += `<circle cx="${x(i)}" cy="${y(p.w)}" r="4" fill="var(--body)" stroke="var(--panel)" stroke-width="2"/>`;
    if (p.s != null) marks += `<circle cx="${x(i)}" cy="${y(p.s)}" r="4" fill="var(--mood)" stroke="var(--panel)" stroke-width="2"/>`;
  });
  const hits = pts.map((p, i) => `<rect x="${x(i) - (W - L - R) / Math.max(1, n - 1) / 2}" y="${T}" width="${(W - L - R) / Math.max(1, n - 1)}" height="${H - T - B}" fill="transparent" data-tip="${esc(`${dayLabel(p.d)}\n起きた ${p.w != null ? clockFromMin(p.w) : '—'} · 寝た ${p.s != null ? clockFromMin(p.s) : '—'}`)}"/>`).join('');
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="起きた時刻と寝た時刻">${g}${marks}<g transform="translate(0 ${H - 6})">${xLabels(days, W, L, R)}</g>${hits}</svg>`;
  return chartFrame('起きた・寝た時刻', `<span><i class="dot" style="--c:var(--body)"></i>起きた</span><span><i class="dot" style="--c:var(--mood)"></i>寝た</span>`, svg, vals.length ? '薄い帯は就寝目標（2〜4時）。' : 'まだ記録がない。体調を選んだ時刻と夜モードを終えた時刻が入る。');
}
/* ゲームの名前と時間 */
const GAME_NAMES = { 'valorant-win64-shipping': 'Valorant', 'valorant': 'Valorant' };
const GAME_JUNK = ['crashpad_handler', 'crashreportclient', 'unrealcefsubprocess', 'cefsharp.browsersubprocess', 'unitycrashhandler64', 'unitycrashhandler32', 'easyanticheat', 'easyanticheat_eos', 'start_protected_game'];
// ゲームではないのに見張り役に拾われるもの（数えない）
const NOT_GAME = ['wallpaperui', 'wallpaper32', 'wallpaper64', 'wallpaperengine'];
const notGame = raw => NOT_GAME.includes(String(raw || '').toLowerCase());
function gameName(raw) {
  const k = String(raw || '').toLowerCase();
  if (NOT_GAME.includes(k)) return null;
  if (GAME_NAMES[k]) return GAME_NAMES[k];
  if (GAME_JUNK.includes(k)) return null; // ゲームに付いてくる裏方のプログラム
  const base = String(raw).replace(/-(Win64|Win32|WinGDK)-Shipping$/i, '').replace(/[_-]+/g, ' ');
  return base.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').trim() || String(raw);
}
const BLANK = '~blank';
// ゲームをした時間帯（pc/<日付> の sessions：{ g: プロセス名, from, to, min }）。裏方のプログラムは除く。同じゲームで5分以内につながるものは1つに
function gameSessions(d) {
  const list = ((S.pc[d] && S.pc[d].sessions) || []).map(x => ({ raw: x.g, name: gameName(x.g), from: Number(x.from), to: Number(x.to), min: Number(x.min) || Math.round((x.to - x.from) / 6e4) }))
    .filter(x => x.name && x.to > x.from).sort((a, b) => a.from - b.from);
  const out = [];
  for (const x of list) { const p = out.find(o => o.name === x.name && x.from - o.to <= 5 * 6e4 && x.from >= o.from); if (p) { p.to = Math.max(p.to, x.to); p.min += x.min; } else out.push({ ...x }); }
  return out.sort((a, b) => a.from - b.from);
}
const pcBlank = d => (S.pc[d] && S.pc[d].games && S.pc[d].games[BLANK]) || 0;
const pcNotGame = d => Object.entries((S.pc[d] && S.pc[d].games) || {}).reduce((a, [k, v]) => a + (notGame(k) ? v : 0), 0);
const pcGame = d => S.pc[d] ? Math.max(0, (S.pc[d].gameMinutes || 0) - pcBlank(d) - pcNotGame(d)) : 0;
const fmtMin = m => { m = Math.round(m || 0); return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? (m % 60) + '分' : ''}` : `${m}分`; };
function gameBreakdown(d) {
  const g = (S.pc[d] && S.pc[d].games) || {}; const sum = {}; let junk = 0;
  for (const [raw, min] of Object.entries(g)) { if (raw === BLANK || notGame(raw)) continue; const n = gameName(raw); if (n) sum[n] = (sum[n] || 0) + min; else junk += min; }
  const list = Object.entries(sum).sort((a, b) => b[1] - a[1]);
  if (junk) { // 裏方の分はSteamのゲームのものなので、いちばん長いSteamのゲームに足す
    const steam = list.find(([n]) => !Object.values(GAME_NAMES).includes(n));
    if (steam) steam[1] += junk; else list.push(['Steamのゲーム', junk]);
    list.sort((a, b) => b[1] - a[1]);
  }
  return list;
}
function gameTip(d) {
  const pc = S.pc[d]; const total = pcGame(d); const blank = pcBlank(d);
  const bl = blank ? `\n空白時間 ${fmtMin(blank)}（触らずに動画や音楽が流れていた）` : '';
  if (!pc) return `${dayLabel(d)}\nゲームの記録はまだ届いていない（PCの見張り役から届く）`;
  if (!total) return `${dayLabel(d)}\nゲーム 0分${bl}`;
  const br = gameBreakdown(d).map(([n, m]) => `${n} ${fmtMin(m)}`).join('／');
  return `${dayLabel(d)}\nゲーム ${fmtMin(total)}${br ? '\n' + br : ''}${bl}`;
}
function gameChart(days) {
  const W = chartW(), H = 150, L = 34, R = 10, T = 10, B = 24; const n = days.length;
  const v = days.map(d => pcGame(d)); const max = Math.max(60, ...v);
  const top = Math.ceil(max / 60) * 60;
  const band = (W - L - R) / n; const bw = Math.min(24, band * 0.6);
  const y = m => T + (1 - m / top) * (H - T - B);
  let g = ''; for (let m = 0; m <= top; m += Math.max(60, Math.ceil(top / 3 / 60) * 60)) g += `<line x1="${L}" x2="${W - R}" y1="${y(m)}" y2="${y(m)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(m) + 3}" text-anchor="end">${m / 60}h</text>`;
  let marks = '';
  v.forEach((m, i) => { if (!m) return; const x0 = L + band * i + (band - bw) / 2, y0 = y(m), hgt = H - B - y0; const r = Math.min(4, hgt); marks += `<path d="M${x0} ${H - B} V${y0 + r} Q${x0} ${y0} ${x0 + r} ${y0} H${x0 + bw - r} Q${x0 + bw} ${y0} ${x0 + bw} ${y0 + r} V${H - B} Z" fill="var(--game)"/>`; });
  const labels = days.map((d, i) => { const step = n > 10 ? Math.ceil(n / (W < 500 ? 5 : 8)) : 1; return i % step === 0 ? `<text x="${L + band * i + band / 2}" y="${H - 6}" text-anchor="middle">${shortLabel(d)}</text>` : ''; }).join('');
  const hits = days.map((d, i) => `<rect x="${L + band * i}" y="${T}" width="${band}" height="${H - T - B}" fill="transparent" data-tip="${esc(gameTip(d))}"/>`).join('');
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="ゲームの時間">${g}${marks}${labels}${hits}</svg>`;
  return chartFrame('ゲームの時間', '', svg, v.some(Boolean) ? 'ValorantとSteamのゲーム（マイクラは数えない）。棒をタップすると内訳が出る。' : 'PCのClaudeアプリでDaylogを開くと入る。');
}

/* ───────── キャンバス ───────── */
// 銀河（galaxy.js）は星空タブを開くときに読み込む。アプリの起動時には読まない
try { for (const k of Object.keys(localStorage)) if (k.startsWith('daylog-orr-') || k === 'daylog-sky-kind') localStorage.removeItem(k); } catch (_) {} // 天球（やめた機能）の設定の残りを片付ける
const galaxyOk = () => !!(window.DaylogGalaxy && !window.DaylogGalaxy.dead);
function loadGalaxy() {
  if (window.DaylogGalaxy || S.gxLoading || !window.__daylogGalaxySrc) return;
  S.gxLoading = true;
  const el = document.createElement('script'); el.src = window.__daylogGalaxySrc;
  el.onload = () => { S.gxLoading = false; render(); }; el.onerror = () => { S.gxLoading = false; el.remove(); };
  document.head.appendChild(el);
}
function galaxyApi() {
  return {
    sky: S.sky, today: today(), colors: STAR_C, hm,
    day: d => { const day = getDay(d); const m = MODES[day.mode]; return { stars: layoutDay(d, starsForDay(d)), neb: isNebula(d), mode: m ? m.label : null, color: m ? m.c : null, name: (day.close && day.close.name) || null, boost: boostFor(d) }; },
    count: d => starsForDay(d).length,
    goals: mk => activeGoals('month', mk).map(g => { const linked = Object.values(S.tasks).filter(t => t.goalId === g.id); const total = Math.max(3, linked.length + 1); const done = g.status === 'done'; return { id: g.id, title: g.title, done, total, lit: done ? total : Math.min(total, linked.filter(t => t.status === 'done').length) }; }),
    pick: skyPick, failed: () => render(),
  };
}
// 星空で何かを選んだとき（銀河からも、前からの描きかたからも、ここに来る）
function skyPick(h) {
  const sk = S.sky;
  if (h.up) { sk.level = sk.level === 'day' ? 'month' : 'universe'; sk.year = Number(sk.month.slice(0, 4)); sk.sel = null; if (sk.level === 'universe') ensureOlder(`${sk.year}-01-01`); }
  else if (h.month) { sk.month = h.month; sk.year = Number(h.month.slice(0, 4)); sk.level = 'month'; sk.sel = null; ensureOlder(h.month + '-01'); }
  else if (h.goal) sk.sel = { id: 'g' + h.goal.id, when: '今月の目標の星座', label: `${h.goal.title}\n${h.goal.done ? '達成して星座が完成した' : `灯った星 ${h.goal.lit} / ${h.goal.total}`}` };
  else if (h.star) sk.sel = { id: h.star.id, when: `${dayLabel(h.day)} ${hm(h.star.t)}`, label: h.star.label };
  else if (h.day) { sk.level = 'day'; sk.day = h.day; sk.month = monthKey(h.day); sk.year = Number(h.day.slice(0, 4)); sk.sel = null; ensureOlder(h.day); }
  else { if (!sk.sel) return; sk.sel = null; }
  render();
}
function afterMain() {
  document.querySelectorAll('.autosize').forEach(autosize);
  if (S.view === 'today' || S.view === 'cal') gameLinesLayout();
  if (S.view === 'cal' && S.cal.scrollSel) { // 月の画面で日を選んだら、その日の流れの見出しが見えるところまで
    S.cal.scrollSel = false; const sec = $('#mo-day');
    if (sec && sec.getBoundingClientRect().top > innerHeight * 0.45) sec.scrollIntoView({ block: 'start', behavior: document.documentElement.dataset.motion === 'calm' ? 'auto' : 'smooth' });
  }
  // ノートを書く画面：開いていれば差し込み、離れたら閉じる（書いた分は送る）
  const neHost = $('#ne-host');
  if (neHost && S.nOpen && S.notes[S.nOpen]) NE.mount(neHost, S.nOpen); else if (NE.id) NE.unmount();
  if (S.view === 'memos') { fillBlobs($('#app-main')); if (!S.notePurged && S.loaded.notes) { S.notePurged = true; setTimeout(purgeNoteTrash, 3000); } }
  if (S.view !== 'sky') { if (window.DaylogGalaxy) window.DaylogGalaxy.detach(); return; }
  loadGalaxy();
  const host = $('#gx-host');
  if (host && !window.DaylogGalaxy.attach(host, galaxyApi())) { render(); return; } // WebGLが使えなかった：前からの描きかたに切りかえる
  if (!host) drawSky();
}
function afterOver() { if (S.night && S.night.step === 6) playRise(); }
function fitCanvas(cv, hRatio, maxH) {
  const w = cv.parentElement.clientWidth; const h = Math.min(maxH, Math.round(w * hRatio));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + 'px';
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { ctx, w, h };
}
function drawStar(ctx, x, y, k, small, boost = 1) {
  const c = STAR_C[k]; const r = (k === 'night' ? 3.6 : k === 'gold' ? (small ? 1.7 : 2.4) : small ? 1.4 : 2) * boost;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
  g.addColorStop(0, c + 'cc'); g.addColorStop(0.25, c + '44'); g.addColorStop(1, c + '00');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (k === 'night') { ctx.strokeStyle = c + '99'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - r * 4, y); ctx.lineTo(x + r * 4, y); ctx.moveTo(x, y - r * 4); ctx.lineTo(x, y + r * 4); ctx.stroke(); }
}
function bgStars(ctx, w, h, seed, n = 160) { const R = rng(seed); for (let i = 0; i < n; i++) { const a = R() * 0.5 + 0.05; ctx.fillStyle = `rgba(243,239,226,${a * 0.6})`; ctx.fillRect(R() * w, R() * h, R() < 0.9 ? 1 : 1.6, R() < 0.9 ? 1 : 1.6); } }
function layoutDay(d, stars) {
  const R = rng('c' + d); let x = 0.5 + (R() - 0.5) * 0.25, y = 0.5 + (R() - 0.5) * 0.25, ang = R() * Math.PI * 2;
  const k = stars.length > 12 ? 0.65 : stars.length > 7 ? 0.8 : 1;
  return stars.map((s, i) => {
    if (i > 0) {
      ang += (R() - 0.5) * 2.4; const st = (0.12 + R() * 0.12) * k; x += Math.cos(ang) * st; y += Math.sin(ang) * st;
      if (x < 0.1 || x > 0.9) { ang = Math.PI - ang; x = clamp(x, 0.1, 0.9); }
      if (y < 0.12 || y > 0.88) { ang = -ang; y = clamp(y, 0.12, 0.88); }
    }
    return { ...s, x, y };
  });
}
function nebula(ctx, x, y, r, seed) {
  const R = rng('n' + seed);
  for (let i = 0; i < 4; i++) {
    const ox = x + (R() - 0.5) * r * 0.8, oy = y + (R() - 0.5) * r * 0.6, rr = r * (0.5 + R() * 0.6);
    const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, rr);
    const hue = R() < 0.5 ? '150,125,235' : '110,150,235';
    g.addColorStop(0, `rgba(${hue},0.22)`); g.addColorStop(1, `rgba(${hue},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ox, oy, rr, 0, Math.PI * 2); ctx.fill();
  }
}
function drawConstellation(ctx, d, cx, cy, size, { hits, alpha = 1, lines = true, boost = 1 } = {}) {
  const stars = layoutDay(d, starsForDay(d));
  const pts = stars.map(s => ({ ...s, px: cx + (s.x - 0.5) * size, py: cy + (s.y - 0.5) * size }));
  if (lines && pts.length > 1) { ctx.strokeStyle = `rgba(200,195,240,${0.28 * alpha})`; ctx.lineWidth = 1; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.px, p.py) : ctx.moveTo(p.px, p.py)); ctx.stroke(); }
  ctx.globalAlpha = alpha; pts.forEach(p => drawStar(ctx, p.px, p.py, p.k, p.small, boost)); ctx.globalAlpha = 1;
  if (hits) pts.forEach(p => hits.push({ x: p.px, y: p.py, r: 16, star: p, day: d }));
  return pts;
}
const boostFor = d => isNebula(addDays(d, -1)) && !isNebula(d) ? 1.3 : 1;
function galaxyPoint(i, n, cx, cy, R) {
  const arm = i % 2; const t = n > 1 ? i / (n - 1) : 0;
  const th = arm * Math.PI + t * Math.PI * 2.3 + 0.4; const r = (0.14 + t * 0.8) * R;
  return { x: cx + Math.cos(th) * r, y: cy + Math.sin(th) * r * 0.62 };
}
function drawSky() {
  const cv = $('#sky'); if (!cv) return; const sk = S.sky;
  const { ctx, w, h } = fitCanvas(cv, sk.level === 'day' ? 0.8 : 0.85, 620);
  const hits = []; S.skyHits = hits;
  ctx.clearRect(0, 0, w, h); bgStars(ctx, w, h, sk.level + sk.month + sk.day);
  if (sk.level === 'day') {
    if (isNebula(sk.day)) nebula(ctx, w / 2, h / 2, Math.min(w, h) * 0.45, sk.day);
    const pts = drawConstellation(ctx, sk.day, w / 2, h / 2, Math.min(w, h) * 0.85, { hits, boost: boostFor(sk.day) });
    if (!pts.length) { ctx.fillStyle = 'rgba(168,173,202,.8)'; ctx.font = '14px ' + getComputedStyle(document.body).fontFamily; ctx.textAlign = 'center'; ctx.fillText('この日はまだ星がない', w / 2, h / 2); }
  } else if (sk.level === 'month') {
    const mk = sk.month, n = daysInMonth(mk), cx = w / 2, cy = h / 2, R = Math.min(w / 2, h / 0.62 / 2) * 0.92;
    const D = rng('dust' + mk);
    for (let i = 0; i < 900; i++) { const t = D(); const arm = D() < 0.5 ? 0 : 1; const th = arm * Math.PI + t * Math.PI * 2.3 + 0.4 + (D() - 0.5) * 0.35; const r = (0.08 + t * 0.86) * R + (D() - 0.5) * R * 0.08; ctx.fillStyle = `rgba(190,185,240,${0.05 + D() * 0.12})`; ctx.fillRect(cx + Math.cos(th) * r, cy + Math.sin(th) * r * 0.62, 1.2, 1.2); }
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.22); core.addColorStop(0, 'rgba(233,200,115,.22)'); core.addColorStop(1, 'rgba(233,200,115,0)'); ctx.fillStyle = core; ctx.beginPath(); ctx.arc(cx, cy, R * 0.22, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < n; i++) {
      const d = `${mk}-${pad(i + 1)}`; const p = galaxyPoint(i, n, cx, cy, R);
      if (isNebula(d)) nebula(ctx, p.x, p.y, R * 0.07, d);
      const has = starsForDay(d).length;
      drawConstellation(ctx, d, p.x, p.y, R * 0.13, { alpha: 0.95, boost: boostFor(d) * 0.75 });
      if (d === today()) { ctx.strokeStyle = 'rgba(184,167,255,.5)'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(p.x, p.y, R * 0.09, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      hits.push({ x: p.x, y: p.y, r: Math.max(18, R * 0.07), day: d, dayHit: true, has });
    }
    // 目標の星座
    const goals = activeGoals('month', mk);
    goals.forEach((g, gi) => {
      const a = -Math.PI / 2 + gi * Math.PI * 2 / Math.max(1, goals.length); const gx = cx + Math.cos(a) * R * 0.09, gy = cy + Math.sin(a) * R * 0.06;
      const linked = Object.values(S.tasks).filter(t => t.goalId === g.id); const doneN = linked.filter(t => t.status === 'done').length;
      const total = Math.max(3, linked.length + 1); const G = rng('goal' + g.id); const pts = [];
      for (let k = 0; k < total; k++) pts.push({ x: gx + (G() - 0.5) * R * 0.12, y: gy + (G() - 0.5) * R * 0.08 });
      const lit = g.status === 'done' ? total : Math.min(total, doneN);
      if (lit > 1) { ctx.strokeStyle = 'rgba(233,200,115,.35)'; ctx.beginPath(); pts.slice(0, lit).forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); }
      pts.forEach((p, k) => { if (k < lit) drawStar(ctx, p.x, p.y, 'gold', false, 0.9); else { ctx.strokeStyle = 'rgba(233,200,115,.35)'; ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2); ctx.stroke(); } });
      hits.push({ x: gx, y: gy, r: 20, goal: g, lit, total });
    });
  } else {
    const yr = sk.year; const cols = w > 520 ? 4 : 3; const rows = Math.ceil(12 / cols); const cw = w / cols, ch = h / rows;
    for (let m = 1; m <= 12; m++) {
      const mk = `${yr}-${pad(m)}`; const col = (m - 1) % cols, row = Math.floor((m - 1) / cols);
      const J = rng('u' + mk); const cx = cw * col + cw / 2 + (J() - 0.5) * cw * 0.15, cy = ch * row + ch / 2 + (J() - 0.5) * ch * 0.12;
      let cnt = 0; for (let i = 1; i <= daysInMonth(mk); i++) cnt += starsForDay(`${mk}-${pad(i)}`).length;
      const R = Math.min(cw, ch) * 0.36; const bright = cnt ? clamp(0.25 + cnt / 120, 0.3, 1) : 0.12;
      const D = rng('ud' + mk);
      for (let i = 0; i < 220; i++) { const t = D(); const arm = D() < 0.5 ? 0 : 1; const th = arm * Math.PI + t * Math.PI * 2.2 + J() * 6; const r = (0.08 + t * 0.9) * R; ctx.fillStyle = `rgba(200,195,245,${bright * (0.15 + D() * 0.5)})`; ctx.fillRect(cx + Math.cos(th) * r, cy + Math.sin(th) * r * 0.6, 1.3, 1.3); }
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.3); g.addColorStop(0, `rgba(243,239,226,${bright * 0.5})`); g.addColorStop(1, 'rgba(243,239,226,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = cnt ? 'rgba(228,230,242,.85)' : 'rgba(110,116,148,.8)'; ctx.font = '12px ' + getComputedStyle(document.body).fontFamily; ctx.textAlign = 'center'; ctx.fillText(`${m}月${cnt ? ' · ' + cnt : ''}`, cx, cy + R * 0.75 + 6);
      hits.push({ x: cx, y: cy, r: R, month: mk });
    }
  }
}
function skyClick(ev) {
  const cv = ev.target.closest('#sky'); if (!cv) return;
  const rect = cv.getBoundingClientRect(); const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
  let best = null, bd = Infinity;
  for (const h of S.skyHits || []) { const dd = Math.hypot(h.x - x, h.y - y); if (dd < h.r && dd < bd) { best = h; bd = dd; } }
  if (!best) skyPick({});
  else if (best.month) skyPick({ month: best.month });
  else if (best.goal) skyPick({ goal: { id: best.goal.id, title: best.goal.title, done: best.goal.status === 'done', lit: best.lit, total: best.total } });
  else if (best.star) skyPick({ star: best.star, day: best.day });
  else if (best.dayHit) skyPick({ day: best.day });
}
let riseToken = 0;
function playRise() {
  const box = $('#rise'), cv = $('#rise-canvas'); if (!cv || !box) return;
  const tok = ++riseToken; const d = S.night.date;
  const { ctx, w, h } = fitCanvas(cv, 0.75, 420);
  const quiet = box.classList.contains('static') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stars = layoutDay(d, starsForDay(d)); const size = Math.min(w, h) * 0.8;
  const t0 = performance.now(), dur = quiet ? 0 : 4200;
  if (!quiet) requestAnimationFrame(() => box.classList.add('go'));
  const frame = now => {
    if (tok !== riseToken || !document.body.contains(cv)) return;
    const p = dur ? Math.min(1, (now - t0) / dur) : 1;
    const lift = (1 - Math.pow(1 - clamp((p - 0.45) / 0.55, 0, 1), 3)) * h * 0.12;
    ctx.clearRect(0, 0, w, h); bgStars(ctx, w, h, 'rise' + d, 120);
    if (isNebula(d)) nebula(ctx, w / 2, h / 2 + h * 0.12 - lift, size * 0.5, d);
    const shown = Math.ceil(clamp(p / 0.5, 0, 1) * stars.length);
    const pts = stars.slice(0, Math.max(shown, quiet ? stars.length : 0)).map(s => ({ ...s, px: w / 2 + (s.x - 0.5) * size, py: h / 2 + h * 0.12 + (s.y - 0.5) * size * 0.8 - lift }));
    if (pts.length > 1) { ctx.strokeStyle = 'rgba(200,195,240,.3)'; ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.px, q.py) : ctx.moveTo(q.px, q.py)); ctx.stroke(); }
    pts.forEach(q => drawStar(ctx, q.px, q.py, q.k, q.small, boostFor(d)));
    if (p < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
A.skyToday = () => skyPick({ day: today() });
// 星空
A.skyLevel = lv => { S.sky.level = lv; S.sky.sel = null; if (lv === 'universe') ensureOlder(`${S.sky.year}-01-01`); render(); };
A.skyDay = d => { S.sky.level = 'day'; S.sky.day = d; S.sky.month = monthKey(d); S.sky.sel = null; render(); };
A.skyPrev = () => skyMove(-1); A.skyNext = () => skyMove(1);
function skyMove(dir) {
  const sk = S.sky; sk.sel = null;
  if (sk.level === 'day') { sk.day = addDays(sk.day, dir); sk.month = monthKey(sk.day); }
  else if (sk.level === 'month') { const [y, m] = sk.month.split('-').map(Number); const dt = new Date(y, m - 1 + dir, 1); sk.month = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`; sk.year = dt.getFullYear(); }
  else sk.year += dir;
  ensureOlder(sk.level === 'universe' ? `${sk.year}-01-01` : sk.level === 'month' ? sk.month + '-01' : sk.day);
  render();
}
// 最初は直近400日分だけ読み込む。それより前を見に行ったときに、その分を読み足す
async function ensureOlder(from) {
  if (!S.db || !S.oldFrom || !from || from >= S.oldFrom) return;
  const to = S.oldFrom; S.oldFrom = from;
  for (const [col, key] of [['days', 'days'], ['pc', 'pc']]) {
    try {
      const snap = await S.db.collection(col).where('date', '>=', from).where('date', '<', to).get();
      snap.docs.forEach(doc => { const v = doc.data(); if (v) S[key][doc.id] = v; });
    } catch (e) { S.oldFrom = to; toast('古い記録を読めなかった。もう一度開くと読めることがある。'); }
  }
  render();
}
// まとめ
A.revKind = k => { S.review.kind = k; render(); };
A.revMove = dir => { const r = S.review; if (r.kind === 'week') r.anchor = addDays(r.anchor, 7 * Number(dir)); else { const [y, m] = r.anchor.split('-').map(Number); const dt = new Date(y, m - 1 + Number(dir), 1); r.anchor = ymd(dt); } ensureOlder(periodDays()[0]); render(); };
A.revInsight = async () => {
  const days = periodDays().filter(d => d <= today()); const key = reviewKey();
  const rows = days.map(d => { const day = getDay(d); const s = sleepAt(d), w = wakeAt(d); return `${d}: 気分${moodOf(d) ?? '-'} 体調${bodyOf(d) ?? '-'} モード${day.mode ? MODES[day.mode].label : '-'} 起きた${w ? hm(w) : '-'} 寝た${s ? hm(s) : '-'} ゲーム${pcGame(d)}分 空白時間${pcBlank(d)}分 記録${(day.entries || []).length}件 夜モード${day.close && day.close.done ? '済' : '-'} 約束${promisesKept(d).length}/${promiseList().length}`; }).join('\n');
  const tasksDone = Object.values(S.tasks).filter(t => t.status === 'done' && t.doneAt && days.includes(logicalDate(t.doneAt))).map(t => t.title).slice(0, 20).join(' / ') || 'なし';
  S.busy.rev = true; render();
  try {
    const text = await askText(`この期間の記録から気づいたことを3つ、箇条書き（「・」で始める）で。各45字以内。傾向を中心に（例: 寝るのが4時を過ぎた翌日は気分が低め）。データが少なければそう言う。責めない。本文だけ返して。\n日ごとの記録:\n${rows}\n終えたタスク: ${tasksDone}`, 'default', false);
    S.reviews[key] = { text: text.slice(0, 600), at: Date.now() }; render(); await putDoc('reviews/' + key, S.reviews[key]);
  } catch (e) { const m = claudeErr(e); if (m) toast(m); }
  finally { S.busy.rev = false; render(); }
};
