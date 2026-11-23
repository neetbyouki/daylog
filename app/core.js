// Daylog 本体の部品：設定・小道具・状態・書き込み・集計、描画の土台（render・動き・下のタブ・見出し）、知らせ、共通の操作（A）
// ・読み込む順は app/parts.json。全部を1つにつないで、1つの関数の中で動かす（boot.js／tools/build_claude.py）

/* ───────── 設定 ───────── */
const CFG = {
  GCAL: 'Google Calendar',
  HOST: 'host:Daylog_PC',
  APP_CAL: '',
  CALS: [
    { key: 'app', name: '.｡oO', id: '', color: 'var(--lav)' },
    { key: 'star', name: '★', id: '', color: 'var(--gold)' },
    { key: 'i1lz', name: '𖦹', id: '', color: 'var(--blue)' },
    { key: 'panda', name: '🐼', id: '', color: 'var(--mint)' },
    { key: 'main', name: 'メイン', id: '', color: 'var(--main)' },
    { key: 'holiday', name: '祝日', id: '', color: 'var(--rose)' },
  ],
};
// カレンダーのidは、ログインしたGoogleアカウントのカレンダー一覧から起動時に入れる
if (window.__daylogCals) { for (const c of CFG.CALS) if (window.__daylogCals[c.key]) c.id = window.__daylogCals[c.key]; CFG.APP_CAL = (window.__daylogCals.app || ''); }
CFG.CALS = CFG.CALS.filter(c => c.id);
const MODES = {
  good: { label: '好調', hint: 'いい感じ', c: '#7fd1a5' },
  normal: { label: '普通', hint: 'いつも通り', c: '#86b6ff' },
  bad: { label: '不調', hint: '軽めに', c: '#e6b363' },
  rest: { label: '休養', hint: '目標ゼロ', c: '#b8a7ff' },
};
const DEFAULTS = {
  wakeTime: '10:00',
  craftDays: [0, 1, 2, 4, 5],
  cals: { app: true, star: true, i1lz: true, panda: true, holiday: true, main: false },
  calHide: {},
  okaeri: true,
  useClaude: true,
  restQuiet: true,
  autoOpenBoot: true,
  autoOpenGame: true,
  bedtimeNotify: true,
  gameExes: ['VALORANT-Win64-Shipping'],
  lastOpenDay: null,
};
const STAR_C = { diary: '#f3efe2', task: '#86b6ff', gold: '#e9c873', night: '#b8a7ff' };
const MOOD_C = ['var(--m0)', 'var(--m1)', 'var(--m2)', 'var(--m3)', 'var(--m4)', 'var(--m5)'];
const PERSONA = '';

/* ───────── 小道具 ───────── */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clean = o => JSON.parse(JSON.stringify(o));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const diffDays = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
const logicalDate = (ts = Date.now()) => ymd(new Date(ts - 6 * 3600e3));
const today = () => logicalDate();
const dayStart = s => { const d = parseYmd(s); d.setHours(6, 0, 0, 0); return d; };
const isoLocal = d => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
const hm = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const dayLabel = s => { const d = parseYmd(s); return `${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`; };
const shortLabel = s => { const d = parseYmd(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const monthKey = s => s.slice(0, 7);
const weekStart = s => { const d = parseYmd(s); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return ymd(d); };
const daysInMonth = mk => { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const slotDate = (logical, t) => { const [h, m] = t.split(':').map(Number); const d = parseYmd(logical); if (h < 6) d.setDate(d.getDate() + 1); d.setHours(h, m, 0, 0); return d; };
const minFromDayStart = (d, ts) => Math.round((ts - dayStart(d).getTime()) / 6e4);
const clockFromMin = m => { const t = ((m + 360) % 1440 + 1440) % 1440; return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`; };
const hmToMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const isCraftDay = d => (S.settings.craftDays || []).includes(parseYmd(d).getDay());
const ICON = {
  reload: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  pen: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  pad: '<svg width="14" height="12" viewBox="0 0 28 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2h12a7 7 0 0 1 0 14c-2 0-3-2-6-2s-4 2-6 2A7 7 0 0 1 8 2z"/><path d="M8 7v4M6 9h4"/><circle cx="19" cy="8" r=".6" fill="currentColor"/><circle cx="21" cy="10" r=".6" fill="currentColor"/></svg>',
  wave: '<svg width="13" height="12" viewBox="0 0 24 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 11h2M7 7v8M11 4v14M15 8v6M19 10v2"/></svg>',
  bell: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/></svg>',
  chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
};
const info = text => `<button class="info" data-tip="${esc(text)}" aria-label="${esc(text)}">i</button>`;
const CHECK = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.5l2.2 2.2 4.8-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Claudeがいない日の星座の名前（その日の日付から決まる、物語っぽい名前）
function fantasyName(d) {
  const r = rng('name' + d);
  const A1 = ['星屑の', '月影の', '琥珀の', '翡翠の', '銀の', '灯火の', '霧の', '夜明けの', '古の', '眠れる', '黄昏の', '水晶の', '風見の', '忘れられた', '蒼き'];
  const B1 = ['竪琴', '灯台', '錬金術師', '旅人', '竜', '時計塔', '羅針盤', '鍵', '聖杯', '渡り鳥', '書庫', '方舟', '狩人', '冠', '庭師'];
  return A1[Math.floor(r() * A1.length)] + B1[Math.floor(r() * B1.length)] + '座';
}
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = hash(String(seed)); return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ───────── 状態 ───────── */
const S = {
  view: 'today', ready: false, fatal: null, owner: false,
  db: null, mcp: null, sample: null, user: null,
  loaded: { settings: false, days: false, tasks: false, goals: false, memos: false, notes: false, nfolders: false, pc: false, reviews: false, notify: false, meta: false },
  settings: { ...DEFAULTS }, days: {}, tasks: {}, memos: {}, notes: {}, nfolders: {}, goals: {}, pc: {}, reviews: {}, notify: {}, meta: {},
  events: {}, drafts: {}, comp: { mood: 0, body: 0, nap: false },
  claudeOff: false, busy: {}, sheet: null, night: null, toast: null, undo: null,
  openTask: null, sky: { level: 'month', month: monthKey(logicalDate()), day: logicalDate(), year: Number(logicalDate().slice(0, 4)), sel: null },
  review: { kind: 'week', anchor: logicalDate() }, cal: { mode: 'week', anchor: logicalDate(), sel: null }, calCache: {}, calSheet: null, pcStatus: 'unknown', lastDay: logicalDate(), dailyDone: false,
};

window.__daylogState = S;
/* ───────── 書き込み ───────── */
// 記録置き場の状態（送信待ち・オフライン・送れなかった）を受け取る
S.dbState = { pending: 0, offline: false, error: null };
window.addEventListener('daylog-db', e => {
  const s = e.detail || {}; const prevErr = S.dbState.error;
  S.dbState = s;
  if (s.error && (!prevErr || prevErr.at !== s.error.at)) toast('書き込みを1つ保存できなかった（受け付けてもらえない内容だった）。もう一度試してほしい。');
  render();
});
function dbStateHTML() {
  const s = S.dbState || {};
  if (s.offline) return `<span class="dbstate off" title="電波がないので、書いた分は端末にためている。つながったら自動で送る" aria-label="オフライン。未送信${s.pending || 0}件">オフライン${s.pending ? ` ・${s.pending}` : ''}</span>`;
  // 書いてすぐ送れたものは出さない（数秒たっても残っているときだけ）
  if (s.pending > 0 && s.oldest && Date.now() - s.oldest > 4000) return `<span class="dbstate" title="送信待ち${s.pending}件（自動で送る）" aria-label="送信待ち${s.pending}件">⇡${s.pending}</span>`;
  return '';
}
const queues = new Map();
function enqueue(key, fn) {
  const prev = queues.get(key) || Promise.resolve();
  const p = prev.catch(() => {}).then(fn);
  queues.set(key, p);
  return p.catch(e => { toast(dbMsg(e)); });
}
function dbMsg(e) {
  const c = e && e.code;
  if (c === 'quota_exceeded') return '保存先がいっぱいで保存できなかった。古いメモやタスクを消すと空く。';
  if (c === 'resource_exhausted') return '書き込みが続きすぎて保存が止まった。少し待ってからもう一度。';
  if (c === 'revoked' || c === 'not_granted') return '保存の権限がなくなった。ページを開き直してほしい。';
  return '保存できなかった。通信が戻ったらもう一度試して。';
}
// 記録をまだ読み込めていないときに書くと、サーバーの記録を空の内容で上書きしてしまうので、書かない
function canWrite() { return !!S.db && S.ready && !S.loadFailed; }
function putDoc(path, data) { if (!canWrite()) return Promise.resolve(); return enqueue(path, () => S.db.doc(path).set(clean(data))); }
// 変えたところだけ送る（サーバー側で足し合わせる。ほかの端末で同時に変えたところを消さない）
function updDoc(path, patch) { if (!canWrite()) return Promise.resolve(); return enqueue(path, () => S.db.doc(path).update(clean(patch))); }
function delDoc(path) { if (!canWrite()) return Promise.resolve(); return enqueue(path, () => S.db.doc(path).delete()); }
const getDay = d => S.days[d] || { date: d, entries: [] };
function patchDay(d, patch) {
  const prev = getDay(d); const p = { ...patch, date: d };
  if (Array.isArray(patch.entries)) {
    // 記録は1件ずつ「いつ変えたか（u）」を付けて送る。消した記録は「消した印」を送る（サーバーで足し合わせるため）
    const old = new Map((prev.entries || []).map(e => [e.id, e])); const now = Date.now();
    p.entries = patch.entries.map(e => { const o = old.get(e.id); return !o || JSON.stringify(o) !== JSON.stringify(e) ? { ...e, u: now } : e; });
    const keep = new Set(p.entries.map(e => e.id));
    const gone = (prev.entries || []).filter(e => !keep.has(e.id)).map(e => e.id);
    if (gone.length) p.entriesDel = [...new Set([...(prev.entriesDel || []), ...gone])];
  }
  const next = { ...prev, ...p }; S.days[d] = next; render();
  return updDoc('days/' + d, p);
}
function patchTask(id, patch) { const t = { ...S.tasks[id], ...patch, id }; S.tasks[id] = t; render(); return updDoc('tasks/' + id, { ...patch, id }); }
function patchGoal(id, patch) { const g = { ...S.goals[id], ...patch, id }; S.goals[id] = g; render(); return updDoc('goals/' + id, { ...patch, id }); }
function patchSettings(patch) { S.settings = { ...S.settings, ...patch }; render(); return updDoc('settings/main', patch); }

/* ───────── 集計 ───────── */
function wakeAt(d) {
  // PCの記録は前の日の記録があるときだけ「起きた時刻」に使う（入れた初日は寝ていた時間がわからないため）
  const pcFirst = S.pc[d] && S.pc[d].first && S.pc[addDays(d, -1)] ? S.pc[d].first : null;
  if (getDay(d).wakeFix && getDay(d).wakeAt) return getDay(d).wakeAt; // 手で直した時刻を優先
  const c = [getDay(d).wakeAt, pcFirst].filter(Boolean); return c.length ? Math.min(...c) : null;
}
// 夜モードを終えた時刻（その日の「寝た」の記録）
const closedAt = d => { const c = getDay(d).close; return c && c.done && c.at ? c.at : null; };
// 手で直す寝た時刻（時:分）→ その日の夜の時刻。0〜6時は次の日の深夜。起きた時刻より前（その日の朝）になるときは、次の日の朝として扱う
// （例：12:40に起きた日に「09:08」→ 次の日の朝 9:08。前は同じ日の朝 9:08 になり、睡眠が27時間になっていた）
function sleepSlot(d, v) {
  let t = slotDate(d, v).getTime();
  const floor = wakeAt(d) || dayStart(d).getTime() + 6 * 3600e3; // 起きた時刻がわからない日は昼12時より前を次の日の朝に
  if (t <= floor) t += 864e5;
  return t;
}
function sleepAt(d) { const day = getDay(d); return day.sleepAt || (S.pc[d] && S.pc[d].last) || null; }
function moodOf(d) {
  const day = getDay(d);
  if (day.close && day.close.mood) return day.close.mood;
  const v = (day.entries || []).map(e => e.mood).filter(Boolean);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null;
}
function bodyOf(d) {
  const day = getDay(d);
  if (day.close && day.close.body) return day.close.body;
  const v = (day.entries || []).map(e => e.body).filter(Boolean);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null;
}
const wrote = d => { const day = getDay(d); return (day.entries || []).length > 0 || !!(day.close && day.close.at); };
const isNebula = d => ['bad', 'rest'].includes(getDay(d).mode);
function monthWroteCount(mk) { let n = 0; for (const d in S.days) if (d.startsWith(mk) && wrote(d)) n++; return n; }
function activeGoals(scope, key) { return Object.values(S.goals).filter(g => g.scope === scope && g.period === key).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); }
function openTasks() { return Object.values(S.tasks).filter(t => t.status === 'open'); }
function carryTasks(d) { return openTasks().filter(t => t.plannedDate && t.plannedDate < d); }
// 毎日の習慣：タスクの画面の「目標 → 編集」で、足す・直す・消すことができる（settings.habits）
// { id, title: ふだんの形, bad: 不調の日の軽い形（空ならふだんと同じ）, rest: 休養の日もやるか }
// その日にやったかは days の habits[id]（true）と habits[id + 'At']（時刻）。お風呂は id 'bath'（前からの記録もそのまま）
const DEFAULT_HABITS = [{ id: 'bath', title: 'お風呂：19時30分までに湯船に浸かる', bad: 'お風呂（時間は自由。シャワーでもいい）', rest: false }];
const HABIT_MAX = 6;
function habitList() { return Array.isArray(S.settings.habits) ? S.settings.habits : DEFAULT_HABITS; }
function habitFor(h, mode) { if (mode === 'rest' && !h.rest) return null; return mode === 'bad' && h.bad ? h.bad : h.title; }
function habitsToday(mode) { return habitList().map(h => ({ ...h, text: habitFor(h, mode) })).filter(h => h.text); }
const habitDone = (day, id) => !!(day && day.habits && day.habits[id] === true);
const habitShort = t => String(t || '').split(/[：:（(]/)[0].trim() || String(t || '');
function habitText(mode) { const l = habitsToday(mode); return l.length ? l.map(h => h.text).join('／') : null; }
function starsForDay(d) {
  const day = getDay(d); const out = [];
  (day.entries || []).forEach(e => out.push({ k: 'diary', t: e.t, id: 'e' + e.id, mood: e.mood, label: (e.nap ? '💤 ' : '') + (e.text || '（スコアだけの記録）') }));
  for (const t of Object.values(S.tasks)) {
    if (t.status === 'done' && t.doneAt && logicalDate(t.doneAt) === d) out.push({ k: 'task', t: t.doneAt, id: 't' + t.id, label: 'タスク完了：' + t.title });
    (t.steps || []).forEach(s => { if (s.done && s.doneAt && logicalDate(s.doneAt) === d) out.push({ k: 'task', small: true, t: s.doneAt, id: 's' + s.id, label: 'ステップ完了：' + s.title }); });
  }
  for (const [id, v] of Object.entries(day.habits || {})) {
    if (v !== true || id.endsWith('At')) continue;
    const h = habitList().find(x => x.id === id);
    out.push({ k: 'gold', t: day.habits[id + 'At'] || dayStart(d).getTime() + 13.5 * 3600e3, id: id === 'bath' ? 'b' + d : 'h' + id + d, label: h ? habitShort(h.title) : id === 'bath' ? 'お風呂' : '習慣' });
  }
  for (const g of Object.values(S.goals)) if (g.status === 'done' && g.doneAt && logicalDate(g.doneAt) === d) out.push({ k: 'gold', t: g.doneAt, id: 'g' + g.id, label: '目標達成：' + g.title });
  if (day.close && day.close.done) out.push({ k: 'night', t: day.close.at, id: 'n' + d, label: '夜モード完了' + (day.close.text ? '：' + day.close.text : '') });
  return out.sort((a, b) => a.t - b.t);
}

/* ───────── 描画 ───────── */
let raf = 0, composing = false, compAt = 0; const last = { main: '', over: '', toast: '', comp: '' };
/* ── 動き（transitions.dev の無料の部品をもとに調整。速さと曲線は index.html の --t-* にまとめてある）
   ・画面の切りかえ：描き直しの前後を View Transitions（ブラウザの標準機能）でつなぐ。使えない端末ではそのまま切りかわる
   ・小さな動き（★・チェック・数字など）：押した直後の描き直しだけで1回鳴らす（fx）
   ・端末の「視差効果を減らす」か、設定の「画面の動き：控えめ」では動かさない */
const MOTION_KEY = 'daylog-motion';
const reduceMQ = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const motionCalm = () => { try { if (localStorage.getItem(MOTION_KEY) === 'calm') return true; } catch (_) {} return !!(reduceMQ && reduceMQ.matches); };
const applyMotion = () => { document.documentElement.dataset.motion = motionCalm() ? 'calm' : 'full'; };
applyMotion(); if (reduceMQ && reduceMQ.addEventListener) reduceMQ.addEventListener('change', applyMotion);
let vtKind = null;
// 押したボタン：描き直しで作り直されても、新しい同じボタンを「ぽんと戻る」ように動かす
let lastTap = null;
/* ── ドラッグ（タスクの並べかえ・予定を動かす・予定の上下の端で時刻を変える）
   ・マウス：押して少し動かすと始まる。指：⠿ や予定の端はすぐ、ほかは長押し（0.35秒）で始まる（ふつうのスクロールをじゃましない）
   ・ドラッグ中は描き直さない（終わってからまとめて描く） */
const DRAG = { on: false, pending: false, st: null };
function tapBack() {
  const t = lastTap; if (!t || Date.now() - t.at > 450) return; lastTap = null;
  const sel = `[data-act="${CSS.escape(t.act)}"]` + (t.arg != null ? `[data-arg="${CSS.escape(t.arg)}"]` : ':not([data-arg])');
  const el = document.querySelector(sel); if (!el || el.classList.contains('pop') || el.classList.contains('fx')) return;
  el.classList.remove('tapped'); void el.offsetWidth; el.classList.add('tapped'); setTimeout(() => el.classList.remove('tapped'), 300);
}
const vt = k => { vtKind = k; }; // 次の描き直しを、なめらかにつなぐ（tab：下のタブ／fwd・back：奥へ・手前へ／tabs：上の切りかえ／sheet：重なる画面）
const FX = new Map();
const fx = k => FX.set(k, Date.now());
const fxc = (k, cls = 'fx') => (Date.now() - (FX.get(k) || 0) < 650 ? ' ' + cls : '');
const NUMS = new Map(); // 数字が変わったときだけ、ふわっと入れかえる
const num = (k, n) => { const p = NUMS.get(k); NUMS.set(k, n); return `<span class="num${p != null && p !== n ? ' pop' : ''}">${n}</span>`; };
// 消すとき：その行をすっと縮めてから消す（true を返したら、あとで fn が呼ばれる）
function leaveThen(el, sel, fn) {
  const row = el && el.closest && el.closest(sel);
  if (!row || motionCalm() || row.classList.contains('leave')) return false;
  row.style.height = row.offsetHeight + 'px'; void row.offsetWidth; row.classList.add('leave');
  setTimeout(fn, 200); return true;
}
// 足りないとき：欄を小さく揺らして知らせる（文字の注意書きの代わり）
function shake(el) { if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 400); el.focus({ preventScroll: true }); }
// ★を付けた瞬間の小さな粒（8つ）
const BURST = `<span class="burst" aria-hidden="true">${[0, 1, 2, 3, 4, 5, 6, 7].map(i => { const a = i / 8 * Math.PI * 2 - Math.PI / 2, d = i % 2 ? 15 : 19; return `<i style="--px:${(Math.cos(a) * d).toFixed(1)}px;--py:${(Math.sin(a) * d).toFixed(1)}px;--pd:${i % 2 ? 40 : 0}ms"></i>`; }).join('')}</span>`;
function render() { if (DRAG.on) { DRAG.pending = true; return; } if (raf) return; raf = requestAnimationFrame(() => { raf = 0; paint(); }); }
document.addEventListener('compositionstart', () => { composing = true; compAt = Date.now(); });
document.addEventListener('compositionupdate', () => { compAt = Date.now(); });
document.addEventListener('compositionend', () => { composing = false; render(); });
document.addEventListener('focusout', () => { if (composing) { composing = false; render(); } });
// 見た目：新しい（Nova）／前の見た目（classic）。開いた直後のちらつきを防ぐため端末にも覚える
function applyLook() {
  const classic = (S.settings && S.settings.look) === 'classic';
  document.documentElement.classList.toggle('classic', classic);
  try { localStorage.setItem('daylog-look', classic ? 'classic' : 'nova'); } catch (_) {}
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = classic ? '#0b0e1b' : '#000000';
  const mode = S.ready ? (getDay(today()).mode || '') : '';
  if (document.documentElement.dataset.mode !== mode) document.documentElement.dataset.mode = mode;
  if (document.documentElement.dataset.view !== S.view) document.documentElement.dataset.view = S.view || '';
}
try { if (localStorage.getItem('daylog-look') === 'classic') document.documentElement.classList.add('classic'); } catch (_) {}
function paint() {
  // 日本語入力の途中では描き直さない（ただし入力が止まって4秒たったら描き直す）
  if (composing) { applyLook(); if (Date.now() - compAt < 4000) { setTimeout(render, 500); return; } composing = false; }
  paintNow();
}
/* 画面の切りかえの動き（View Transitions はやめた：ガラスのぼかしが写真に写らず、終わりにちらつくため）
   ・新しい中身だけを、下から／横から短く出す（前の画面は消すだけ）。上の「ひとこと｜ノート」から下だけを動かす画面もある
   ・選んだタブの丸や背景は、前の場所から新しい場所へ「影」を滑らせる
   ・重なる画面は、開くときにふくらみ、閉じるときは消える前に縮む（ぼかしごと薄くなるので、ちらつかない） */
const SLIDES = [['.nav button[aria-current="page"] .gi', '.nav'], ['.mtabs [aria-selected="true"]', '.mtabs'], ['.tm-presets [aria-pressed="true"]', '.tm-presets']];
const slidePrep = () => SLIDES.map(([sel]) => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect() : null; });
function slideRun(prev) {
  if (motionCalm()) return;
  SLIDES.forEach(([sel, box], i) => {
    const o = prev[i], e = document.querySelector(sel); if (!o || !e) return;
    const n = e.getBoundingClientRect(); if (Math.abs(o.left - n.left) < 1 && Math.abs(o.top - n.top) < 1) return;
    const c = e.closest(box); if (!c) return; const cr = c.getBoundingClientRect(), cs = getComputedStyle(e);
    const g = document.createElement('i'); g.className = 'slide-ghost'; g.setAttribute('aria-hidden', 'true');
    Object.assign(g.style, { left: o.left - cr.left + 'px', top: o.top - cr.top + 'px', width: o.width + 'px', height: o.height + 'px', background: cs.backgroundColor, borderRadius: cs.borderRadius, boxShadow: cs.boxShadow });
    c.appendChild(g); e.classList.add('slide-hide');
    requestAnimationFrame(() => requestAnimationFrame(() => { g.style.transform = `translate(${n.left - o.left}px,${n.top - o.top}px)`; g.style.width = n.width + 'px'; g.style.height = n.height + 'px'; }));
    setTimeout(() => { e.classList.remove('slide-hide'); g.remove(); }, 300);
  });
}
function enterRun(kind) {
  if (!kind || motionCalm()) return;
  const main = $('#app-main .main'); if (!main) return;
  const anchor = kind !== 'tab' && main.querySelector('.mtabs, .mfav-head');
  let targets = [main];
  if (anchor && anchor.parentElement) { targets = []; let n = anchor.nextElementSibling; while (n) { targets.push(n); n = n.nextElementSibling; } }
  for (const t of targets) { t.classList.add('enter-' + kind); setTimeout(() => t.classList.remove('enter-' + kind), 400); }
}
let overLeave = 0;
function paintOver(over) {
  const host = $('#app-over'), wasOpen = !!last.over, calm = motionCalm();
  clearTimeout(overLeave);
  if (!over && wasOpen && !calm && host.firstElementChild) {
    const el = host.firstElementChild; last.over = '';
    el.classList.add('leaving'); el.setAttribute('aria-hidden', 'true');
    overLeave = setTimeout(() => { if (!last.over) { host.innerHTML = ''; afterOver(); } }, 170);
    return;
  }
  host.innerHTML = over; last.over = over;
  if (over && (!wasOpen || host.dataset.leaving) && !calm && host.firstElementChild) host.firstElementChild.classList.add('entering');
  afterOver();
}
function paintNow() {
  applyLook();
  const fx = captureFocus();
  const slides = slidePrep(), kind = vtKind; vtKind = null;
  const main = mainHTML(), over = overHTML(), t = toastHTML();
  const showComp = S.ready && !S.fatal && S.view === 'today';
  $('#app-comp').hidden = !showComp;
  if (showComp) { const c = composerToolsHTML(); if (c !== last.comp) { $('#comp-tools').innerHTML = c; last.comp = c; } }
  let changedMain = false;
  const wkOld = $('#wk-scroll'); const wkPrev = wkOld ? { top: wkOld.scrollTop, key: wkOld.dataset.key } : null;
  if (main !== last.main) {
    $('#app-main').innerHTML = main; last.main = main; changedMain = true;
    const wk = $('#wk-scroll'); if (wk) wk.scrollTop = wkPrev && wkPrev.key === wk.dataset.key ? wkPrev.top : wkDefaultScroll();
  }
  if (over !== last.over) paintOver(over);
  if (t !== last.toast) { $('#app-toast').innerHTML = t; last.toast = t; }
  restoreFocus(fx);
  tapBack(); if (changedMain) enterRun(kind); slideRun(slides);
  if (changedMain) afterMain();
  else if (S.view === 'memos' && S.nOpen) NE.sync();
  else if (S.view === 'sky' && galaxyOk() && $('#gx-host')) window.DaylogGalaxy.attach($('#gx-host'), galaxyApi());
}
function captureFocus() {
  const a = document.activeElement; if (!a || !a.id) return null;
  return { id: a.id, s: a.selectionStart, e: a.selectionEnd, scroll: a.scrollTop };
}
function restoreFocus(fx) {
  if (!fx) return; const el = document.getElementById(fx.id); if (!el || el === document.activeElement) return;
  el.focus({ preventScroll: true });
  try { if (fx.s != null) el.setSelectionRange(fx.s, fx.e); } catch (_) {}
  el.scrollTop = fx.scroll || 0;
}
// 書いた分だけ欄の高さを伸ばす（上限あり）
const autosize = el => { el.style.height = 'auto'; el.style.height = Math.min(320, el.scrollHeight + 2) + 'px'; };
const draft = (id, fb = '') => S.drafts[id] != null ? S.drafts[id] : fb;

function mainHTML() {
  if (S.fatal) return `<div class="center-msg"><h1>Daylog</h1><p class="muted">${esc(S.fatal)}</p>${S.loadFailed ? '<button class="btn" data-a="reloadPage">もう一度読み込む</button>' : ''}</div>`;
  if (!S.ready) return `<div class="center-msg"><h1>Daylog</h1><p class="thinking">記録を読み込んでいる</p></div>`;
  const views = { today: todayView, cal: calView, tasks: tasksView, memos: memosView, goals: tasksView, sky: skyView, review: skyView, settings: settingsView };
  const body = (views[S.view] || todayView)();
  return `<div class="frame ${S.view === 'today' ? 'has-composer' : ''}">${navHTML()}<main class="main">${body}</main></div>`;
}
function navTaskDot() { const d = today(); return openTasks().some(t => t.deadline && diffDays(d, t.deadline) <= 1); }
// 線のアイコン（新しい見た目で使う）
const svgI = d => `<svg class="gi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const NAV_ICON = {
  today: svgI('<circle cx="12" cy="12" r="3.6"/><path d="M12 3.2v2.2M12 18.6v2.2M3.2 12h2.2M18.6 12h2.2M5.8 5.8l1.5 1.5M16.7 16.7l1.5 1.5M5.8 18.2l1.5-1.5M16.7 7.3l1.5-1.5"/>'),
  tasks: svgI('<circle cx="12" cy="12" r="8.6"/><path d="M8.4 12.3l2.5 2.5 4.8-5.1"/>'),
  memos: svgI('<path d="M4.5 19.5l1.1-4.2L15.7 5.2a2.1 2.1 0 0 1 3 3L8.6 18.4l-4.1 1.1z"/><path d="M13.8 7.1l3 3"/>'),
  cal: svgI('<rect x="3.6" y="5.2" width="16.8" height="15" rx="3.4"/><path d="M3.6 10h16.8M8.2 3.2v3.6M15.8 3.2v3.6"/>'),
  sky: svgI('<circle cx="12" cy="12" r="5"/><path d="M5.1 15.9c-1.9 1.9-2.6 3.5-1.9 4.2 1.2 1.2 5.9-1.5 10.5-6.1s7.3-9.3 6.1-10.5c-.7-.7-2.3 0-4.2 1.9"/>'),
};
function navHTML() {
  const tabs = [['today', '◐', '今日'], ['tasks', '◇', 'タスク'], ['memos', '≡', 'メモ'], ['cal', '▦', 'カレンダー'], ['sky', '✦', '星空']];
  return `<nav class="nav" aria-label="画面の切り替え">${tabs.map(([k, g, l]) => `<button data-act="go" data-arg="${k}" ${S.view === k ? 'aria-current="page"' : ''}><span class="g" aria-hidden="true">${g}</span>${NAV_ICON[k]}${l}${k === 'tasks' && navTaskDot() ? '<i class="navdot" aria-label="締切が近いタスクがある"></i>' : ''}</button>`).join('')}</nav>`;
}
function headerHTML(title, sub, actions = '') {
  if (S.view !== 'tasks') sub = (sub || '') + timerChipHTML(); // タイマーが動いている間は、ほかの画面にも残り時間を小さく出す
  return `<header class="top"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div class="top-actions">${dbStateHTML()}${S.view === 'tasks' ? timerChipHTML() : ''}${actions}<button class="icon-btn" data-act="toggleSettings" aria-pressed="${S.view === 'settings'}" aria-label="${S.view === 'settings' ? '設定を閉じる' : '設定'}"><svg class="gi" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9M4 12h3.5M11.5 12H20"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/><circle cx="9.5" cy="12" r="2"/></svg><svg class="ico-classic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg></button></div></header>`;
}

/* 月の満ち欠け */
const SYN = 29.530588853;
function moonAge(date = new Date()) { const ref = Date.UTC(2000, 0, 6, 18, 14); let a = ((date.getTime() - ref) / 864e5) % SYN; if (a < 0) a += SYN; return a; }
function moonName(a) {
  if (a < 1.5 || a > 28) return '新月'; if (a < 5.5) return '三日月'; if (a < 9) return '上弦の月'; if (a < 13.5) return '十三夜';
  if (a < 16) return '満月'; if (a < 20.5) return '寝待月'; if (a < 24) return '下弦の月'; return '有明の月';
}
function moonSVG(a, size = 20) {
  const p = a / SYN, r = size / 2, k = Math.cos(2 * Math.PI * p), rx = Math.abs(k) * r;
  let outer, term;
  if (p < 0.5) { outer = 1; term = k > 0 ? 0 : 1; } else { outer = 0; term = k > 0 ? 1 : 0; }
  const path = `M ${r} 0 A ${r} ${r} 0 0 ${outer} ${r} ${size} A ${rx} ${r} 0 0 ${term} ${r} 0 Z`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${r}" cy="${r}" r="${r - 0.5}" fill="#1e2340" stroke="#323a62"/><path d="${path}" fill="#efe9d6"/></svg>`;
}

/* ───────── 操作 ───────── */
function toast(msg, action) { S.toast = { msg, action, id: uid() }; render(); const id = S.toast.id; setTimeout(() => { if (S.toast && S.toast.id === id) { const el = $('#app-toast .toast'); if (el && !motionCalm()) { el.classList.add('out'); setTimeout(() => { if (S.toast && S.toast.id === id) { S.toast = null; render(); } }, 160); } else { S.toast = null; render(); } } }, action ? 6000 : 4200); }
function toastHTML() { const t = S.toast; if (!t) return ''; return `<div class="toast" role="status"><span>${esc(t.msg)}</span>${t.action ? `<button class="link" data-act="undo">元に戻す</button>` : ''}</div>`; }

const A = {};
A.toggleSettings = () => (S.view === 'settings' ? A.goBack() : A.go('settings'));
A.goBack = () => A.go(S.prevView && S.prevView !== 'settings' ? S.prevView : 'today');
A.go = v => { if (v !== S.view) vt(v === 'settings' ? 'fwd' : S.view === 'settings' ? 'back' : 'tab'); if (v === 'settings' && S.view !== 'settings') { S.prevView = S.view; refreshPush(); } S.view = v; S.sky.sel = null; S.openTask = null; window.scrollTo(0, 0); render(); if (v === 'today') loadEvents(today()); if (v === 'cal') loadCal(); };
A.undo = () => { const f = S.undo; S.undo = null; S.toast = null; if (f) f(); render(); };
A.reloadPage = () => location.reload();
