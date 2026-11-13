(() => {
'use strict';

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
  loaded: { settings: false, days: false, tasks: false, goals: false, memos: false, pc: false, reviews: false, notify: false, meta: false },
  settings: { ...DEFAULTS }, days: {}, tasks: {}, memos: {}, goals: {}, pc: {}, reviews: {}, notify: {}, meta: {},
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
function habitText(mode) {
  if (mode === 'rest') return null;
  if (mode === 'bad') return 'お風呂（時間は自由。シャワーでもいい）';
  return 'お風呂：19時30分までに湯船に浸かる';
}
function starsForDay(d) {
  const day = getDay(d); const out = [];
  (day.entries || []).forEach(e => out.push({ k: 'diary', t: e.t, id: 'e' + e.id, label: (e.nap ? '💤 ' : '') + (e.text || '（スコアだけの記録）') }));
  for (const t of Object.values(S.tasks)) {
    if (t.status === 'done' && t.doneAt && logicalDate(t.doneAt) === d) out.push({ k: 'task', t: t.doneAt, id: 't' + t.id, label: 'タスク完了：' + t.title });
    (t.steps || []).forEach(s => { if (s.done && s.doneAt && logicalDate(s.doneAt) === d) out.push({ k: 'task', small: true, t: s.doneAt, id: 's' + s.id, label: 'ステップ完了：' + s.title }); });
  }
  if (day.habits && day.habits.bath) out.push({ k: 'gold', t: day.habits.bathAt || dayStart(d).getTime() + 13.5 * 3600e3, id: 'b' + d, label: 'お風呂' });
  for (const g of Object.values(S.goals)) if (g.status === 'done' && g.doneAt && logicalDate(g.doneAt) === d) out.push({ k: 'gold', t: g.doneAt, id: 'g' + g.id, label: '目標達成：' + g.title });
  if (day.close && day.close.done) out.push({ k: 'night', t: day.close.at, id: 'n' + d, label: '夜モード完了' + (day.close.text ? '：' + day.close.text : '') });
  return out.sort((a, b) => a.t - b.t);
}

/* ───────── カレンダー ───────── */
function calErr(e) {
  const c = e && e.code;
  if (c === 'needs_reauth') return 'Googleカレンダーの接続が切れている。claude.aiの「設定 → コネクタ」でつなぎ直すと戻る。';
  if (c === 'server_not_connected') return 'Googleカレンダーがつながっていない。claude.aiの「設定 → コネクタ」で追加すると表示される。';
  if (c === 'selection_required') return 'Googleカレンダーのつなぎ先が複数ある。表示された選択画面で1つ選んでほしい。';
  if (c === 'not_in_manifest' || c === 'blocked_by_policy') return 'このページでGoogleカレンダーが許可されていない。右上のメニューの「権限」から許可できる。';
  if (c === 'approval_required') return 'Googleカレンダーを読む許可がまだ。下のボタンで許可できる。';
  return 'Googleカレンダーを一時的に読めなかった。少ししてから再読み込みしてほしい。';
}
function normEvents(payload, cal, d) {
  const list = (payload && payload.events) || [];
  return list.filter(e => e && e.status !== 'cancelled').map(e => {
    const allDay = !!(e.start && e.start.date && !e.start.dateTime);
    const start = allDay ? parseYmd(e.start.date).getTime() : Date.parse(e.start && e.start.dateTime);
    const end = allDay ? parseYmd((e.end && e.end.date) || e.start.date).getTime() : Date.parse((e.end && e.end.dateTime) || e.start.dateTime);
    return { id: e.id, cal: cal.key, title: e.summary || '（タイトルなし）', start, end, allDay, date: allDay ? e.start.date : null };
  }).filter(e => !isNaN(e.start) && (!e.allDay || e.date === d));
}
async function loadEvents(d, force) {
  if (!S.mcp) return;
  const st = S.events[d] || (S.events[d] = { list: [], loading: false, error: null, at: 0 });
  if (st.loading) return;
  st.loading = true; render();
  const from = isoLocal(dayStart(d)), to = isoLocal(dayStart(addDays(d, 1)));
  const cals = CFG.CALS.filter(c => S.settings.cals[c.key] !== false);
  const cache = force ? { staleTime: 120000, gcTime: 900000, refresh: true } : { staleTime: 120000, gcTime: 900000 };
  const res = await Promise.allSettled(cals.map(c => S.mcp.callTool(CFG.GCAL, 'list_events', { calendarId: c.id, startTime: from, endTime: to, pageSize: 100, orderBy: 'startTime' }, { cache })));
  const list = []; let err = null;
  res.forEach((r, i) => { if (r.status === 'fulfilled') list.push(...normEvents(r.value && r.value.payload, cals[i], d)); else err = err || r.reason; });
  const failedAll = res.every(r => r.status === 'rejected');
  st.list = failedAll ? st.list : list.sort((a, b) => a.start - b.start);
  st.error = err ? { code: err.code, msg: calErr(err), partial: !failedAll } : null;
  st.loading = false; st.at = Date.now(); render();
  if (!failedAll) cleanBedDupes(d, st.list);
}
// 同じ夜に「🌙 就寝の目安」が2つ以上あったら、記録が指している1つだけ残して消す（以前の不具合で増えた分の片付け）
let bedCleaning = false;
async function cleanBedDupes(d, list) {
  const bt = getDay(d).bedtime; if (bedCleaning || !canWrite() || d !== today() || !bt || !bt.eventId) return;
  const beds = list.filter(e => e.cal === 'app' && e.title === '🌙 就寝の目安');
  if (beds.length < 2 || !beds.some(e => e.id === bt.eventId)) return;
  bedCleaning = true;
  try { for (const e of beds) if (e.id !== bt.eventId) { try { await deleteEvent(e.id); } catch (_) {} } }
  finally { bedCleaning = false; loadEvents(d, true); }
}
async function createEvent({ summary, start, end, reminder = 15, description }) {
  const r = await S.mcp.callTool(CFG.GCAL, 'create_event', {
    calendarId: CFG.APP_CAL, summary, startTime: isoLocal(start), endTime: isoLocal(end),
    overrideReminders: reminder == null || S.settings.pushOn ? [] : [{ method: 'popup', minutes: reminder }], useDefaultReminders: false, description: description || 'Daylogから追加',
  });
  const p = (r && r.payload) || {};
  return p.id || (p.event && p.event.id) || null;
}
async function deleteEvent(id) { return S.mcp.callTool(CFG.GCAL, 'delete_event', { calendarId: CFG.APP_CAL, eventId: id }); }
async function updateEvent(id, patch) { return S.mcp.callTool(CFG.GCAL, 'update_event', { calendarId: CFG.APP_CAL, eventId: id, ...patch }); }

/* ───────── Claude ───────── */
function claudeErr(e) {
  const c = e && e.code;
  if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(c)) { S.claudeOff = true; return null; }
  if (c === 'rate_limited') return 'Claudeが混み合っているか、使える量の上限に近い。少し時間をおいて。';
  if (c === 'session_expired') return 'claude.aiにログインし直すとClaudeが使えるようになる。';
  if (c === 'cancelled') return null;
  return 'Claudeから返事をもらえなかった。もう一度押してみて。';
}
async function askJSON(prompt, tier = 'default', cache) {
  if (!S.sample || S.claudeOff) throw { code: 'not_granted' };
  const opts = { modelTier: tier }; if (cache !== undefined) opts.cache = cache;
  return S.sample.json(PERSONA + '\n\n' + prompt, opts);
}
async function askText(prompt, tier = 'default', cache) {
  if (!S.sample || S.claudeOff) throw { code: 'not_granted' };
  const opts = { modelTier: tier }; if (cache !== undefined) opts.cache = cache;
  const r = await S.sample(PERSONA + '\n\n' + prompt, opts);
  return r.text.trim();
}
const claudeReady = () => !!S.sample && !S.claudeOff && S.settings.useClaude !== false;
function entriesText(d, max = 30) {
  return (getDay(d).entries || []).slice(-max).map(e => `${hm(e.t)} ${e.nap ? '[💤昼寝] ' : ''}${e.text || ''}${e.mood ? ` (気分${e.mood})` : ''}${e.body ? ` (体調${e.body})` : ''}`).join('\n') || '（記録なし）';
}

function bedtimeFallback(d) {
  const prev = sleepAt(addDays(d, -1));
  let m = 180; // 3:00
  if (prev) { const late = minFromDayStart(addDays(d, -1), prev); if (late >= 1320) m = 120; else if (late >= 1260) m = 150; }
  const naps = (getDay(d).entries || []).filter(e => e.nap).length;
  if (naps) m = Math.min(240, m + 30);
  if (isCraftDay(d)) m = Math.max(m, 120);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
function clampBed(t) {
  if (!/^\d{1,2}:\d{2}$/.test(t || '')) return null;
  let m = hmToMin(t); if (m >= 720) return '02:00'; // 夕方〜深夜は2時に寄せる
  m = clamp(m, 120, 240); return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
async function proposeBedtime(d, manual) {
  const day = getDay(d); const fb = bedtimeFallback(d);
  if (!claudeReady()) { if (!day.bedtime || manual) patchDay(d, { bedtime: { time: fb, reason: '前の晩の就寝時刻と昼寝の記録から計算した目安。', by: 'calc', at: Date.now() } }).then(() => autoBedEvent(d)); return; }
  S.busy.bed = true; render();
  const prev = sleepAt(addDays(d, -1));
  const prompt = `今夜の就寝目標を1つ決めて。\nルール: 2:00〜4:00の間で決める。前の晩に遅く寝たら今夜は早めにする。昼寝をした日は少し遅めでもいい。体調が悪い日は無理に早めない。参加型（22時〜1時）がある日は1時より後にする。\n` +
    `データ:\n- 前の晩に寝た時刻: ${prev ? hm(prev) : '不明'}\n- 今日起きた時刻: ${wakeAt(d) ? hm(wakeAt(d)) : '不明'}\n- 体調モード: ${day.mode ? MODES[day.mode].label : '未設定'}\n- 今日は参加型（22時〜1時）がある日: ${isCraftDay(d) ? 'はい' : 'いいえ'}\n- 参考の計算値: ${fb}\n- 今日の記録:\n${entriesText(d, 15)}\n` +
    `JSONだけで返して: {"time":"HH:MM","reason":"理由を1文、45字以内"}`;
  try {
    const r = await askJSON(prompt, 'default', manual ? false : undefined);
    const t = clampBed(r && r.time) || fb;
    await patchDay(d, { bedtime: { ...(getDay(d).bedtime || {}), time: t, reason: String((r && r.reason) || '').slice(0, 80), by: 'claude', at: Date.now() } });
    schedulePCPush(); autoBedEvent(d);
  } catch (e) {
    const m = claudeErr(e); if (m) toast(m);
    if (!getDay(d).bedtime) await patchDay(d, { bedtime: { time: fb, reason: '前の晩の就寝時刻と昼寝の記録から計算した目安。', by: 'calc', at: Date.now() } });
  } finally { S.busy.bed = false; render(); autoBedEvent(d); }
}
const SUG = {
  good: { k: 'プラスの一言', ask: '今日の体調モードは「好調」。今日の調子を活かせるプラスの提案を1つだけ。1〜2文、70字以内。' },
  normal: { k: 'ひとこと', ask: '今日の体調モードは「普通」。いつも通りの一日に合う、さりげない一言を1つだけ。提案するなら小さく1つ。1〜2文、70字以内。' },
  bad: { k: '気楽にの一言', ask: '今日の体調モードは「不調」。気が楽になるような小さい提案を1つだけ。やることを増やす提案はしない。1〜2文、70字以内。' },
  rest: { k: '休む日の一言', ask: '今日の体調モードは「休養」。何もしなくていいと思えるような一言だけ。やることの提案はしない。1〜2文、60字以内。' },
};
async function modeSuggestion(d, mode, manual) {
  if (!claudeReady() || !SUG[mode]) return;
  S.busy.sug = true; render();
  const evs = effEvents(d).filter(e => !e.allDay && !e.canceled).map(e => `${hm(e.start)} ${e.title}`).join(' / ') || 'なし';
  const tasks = openTasks().sort(byDeadline).slice(0, 4).map(t => t.title).join(' / ') || 'なし';
  const goals = activeGoals('month', monthKey(d)).filter(g => g.status !== 'done').map(g => g.title).join(' / ') || 'なし';
  try {
    const text = await askText(`${SUG[mode].ask}\n参考: 今の時刻 ${hm(Date.now())}\n今日の予定 ${evs}\n未完了のタスク ${tasks}\n今月の目標（概念的な言葉） ${goals}\n本文だけ返して。`, 'quick', manual ? false : undefined);
    await patchDay(d, { suggest: { mode, text: text.slice(0, 160), at: Date.now() } });
  } catch (e) { const m = claudeErr(e); if (m) toast(m); }
  finally { S.busy.sug = false; render(); }
}

/* ───────── PC見張り役（つながっているときだけ） ───────── */
async function syncPC() {
  if (!S.mcp) return;
  try {
    const lt = await S.mcp.listTools(CFG.HOST);
    if (!lt || !lt.servers || !lt.servers.length) { S.pcStatus = 'none'; render(); return; }
  } catch (e) { S.pcStatus = 'none'; render(); return; }
  try {
    const known = Object.keys(S.pc).sort(); const from = known.length && known[known.length - 1] >= addDays(today(), -3) ? addDays(today(), -3) : addDays(today(), -40);
    const r = await S.mcp.callTool(CFG.HOST, 'get_activity', { from, to: today() }, { cache: false });
    if (r && r.payload && r.payload.lastSeen) S.pcLastSeen = r.payload.lastSeen;
    const days = (r && r.payload && r.payload.days) || [];
    for (const pd of days) {
      if (!pd || !pd.date) continue;
      const cur = S.pc[pd.date];
      if (!cur || JSON.stringify(cur) !== JSON.stringify(pd)) { S.pc[pd.date] = pd; await putDoc('pc/' + pd.date, pd); }
    }
    S.pcStatus = 'ok'; S.pcAt = Date.now();
    await pushPCConfig();
  } catch (e) { S.pcStatus = e && e.code === 'server_not_connected' ? 'none' : 'error'; }
  render();
}
async function pushPCConfig(force) {
  if (S.pcStatus !== 'ok') return;
  const d = today(); const day = getDay(d); const st = S.settings;
  const cfg = {
    autoOpenBoot: !!st.autoOpenBoot, autoOpenGame: false, gameExes: st.gameExes || [],
    bedtime: day.bedtime ? day.bedtime.time : null, bedtimeDate: d,
    notify: !!st.bedtimeNotify && day.mode !== 'rest' && !closedAt(d), quiet: day.mode === 'rest' && !!st.restQuiet,
  };
  // 見張り役が使う項目が変わったときだけ送る
  const key = JSON.stringify(cfg);
  let sent = S.pcCfgSent || null; if (!sent) { try { sent = localStorage.getItem('daylog-pc-cfg'); } catch (_) {} }
  if (!force && (key === sent || S.pcCfgDeclined)) return;
  try {
    await S.mcp.callTool(CFG.HOST, 'set_config', cfg, { cache: false });
    S.pcCfgErr = null; S.pcCfgDeclined = false; S.pcCfgSent = key; try { localStorage.setItem('daylog-pc-cfg', key); } catch (_) {}
  } catch (e) { S.pcCfgErr = (e && e.code) || 'error'; if (S.pcCfgErr === 'cancelled') S.pcCfgDeclined = true; }
  render();
}
let pcPushT = 0;
function schedulePCPush() { clearTimeout(pcPushT); pcPushT = setTimeout(() => pushPCConfig(), 2500); }

/* ───────── 描画 ───────── */
let raf = 0, composing = false, compAt = 0; const last = { main: '', over: '', toast: '', comp: '' };
function render() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; paint(); }); }
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
  applyLook();
  // 日本語入力の途中では描き直さない（ただし入力が止まって4秒たったら描き直す）
  if (composing) { if (Date.now() - compAt < 4000) { setTimeout(render, 500); return; } composing = false; }
  const fx = captureFocus();
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
  if (over !== last.over) { $('#app-over').innerHTML = over; last.over = over; afterOver(); }
  if (t !== last.toast) { $('#app-toast').innerHTML = t; last.toast = t; }
  restoreFocus(fx);
  if (changedMain) afterMain();
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
  return `<header class="top"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div class="top-actions">${dbStateHTML()}${actions}<button class="icon-btn" data-act="toggleSettings" aria-pressed="${S.view === 'settings'}" aria-label="${S.view === 'settings' ? '設定を閉じる' : '設定'}"><svg class="gi" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9M4 12h3.5M11.5 12H20"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/><circle cx="9.5" cy="12" r="2"/></svg><svg class="ico-classic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg></button></div></header>`;
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

/* ── 今日 ── */
function todayView() {
  const d = today(); const day = getDay(d); const mode = day.mode;
  const mk = monthKey(d); const age = moonAge(new Date());
  const gm = S.pc[d] ? pcGame(d) : null;
  const gameSub = gm != null ? `<button class="gamechip ichip" data-tip="${esc(gameTip(d))}" aria-label="${esc(gameTip(d))}">${ICON.pad}<b class="mono">${fmtMin(gm)}</b></button>` : '';
  const blank = S.pc[d] ? pcBlank(d) : 0;
  const sub = `<button class="gamechip ichip" data-tip="今月 ${monthWroteCount(mk)} 日書いた" aria-label="今月 ${monthWroteCount(mk)} 日書いた">${ICON.pen}<b class="mono">${monthWroteCount(mk)}</b></button>${gameSub}${blank ? `<button class="gamechip ichip" data-tip="空白時間 ${fmtMin(blank)}：触らずに動画や音楽が流れていた時間。睡眠には数えない。" aria-label="空白時間 ${fmtMin(blank)}">${ICON.wave}<b class="mono">${fmtMin(blank)}</b></button>` : ''}<button class="gamechip ichip" data-tip="${esc(moonName(age))}" aria-label="${esc(moonName(age))}">${moonSVG(age, 14)}</button>`;
  const actions = `<button class="night-btn" data-act="openNight"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>夜モード</button>`;
  let h = headerHTML(dayLabel(d), sub, actions);
  h += `<div class="modes" role="group" aria-label="今日の体調">${Object.entries(MODES).map(([k, m]) => `<button class="mode" style="--c:${m.c}" data-act="setMode" data-arg="${k}" aria-pressed="${mode === k}" title="${m.hint}">${m.label}</button>`).join('')}</div>`;
  h += `<div class="stack">${morningCard(d)}${todayCards(d)}</div>`;
  h += timelineHTML(d);
  h += `<div class="stack" style="margin-top:18px">${claudeCard(d)}</div>`;
  return h;
}
function todayCards(d) {
  const day = getDay(d); const out = [];
  const w = wakeAt(d);
  if (w && day.mode !== 'rest' && minFromDayStart(d, w) > 360 && !(day.replan && day.replan.dismissed)) {
    out.push(`<div class="card"><div class="note"><span class="k">組み直し</span><div class="v"><div>${hm(w)}に起きた日。残りの予定を短縮版にする？</div>
      ${day.replan && day.replan.text ? `<div class="claude" style="margin-top:8px">${esc(day.replan.text)}</div>` : ''}
      ${!claudeReady() ? replanLocal(d) : ''}
      <div class="row" style="margin-top:8px">${claudeReady() ? `<button class="btn sm" data-act="replan" ${S.busy.replan ? 'disabled' : ''}>${S.busy.replan ? '考え中…' : (day.replan && day.replan.text ? 'もう一度考える' : 'Claudeに短縮版を考えてもらう')}</button>` : ''}<button class="btn ghost sm" data-act="dismissReplan">今日はこのままでいい</button></div></div></div></div>`);
  }
  return out.join('');
}
function replanLocal(d) {
  const later = openTasks().filter(t => t.weight === 'heavy' && !(t.deadline && diffDays(d, t.deadline) <= 0)).slice(0, 3);
  const keep = openTasks().filter(t => t.deadline && diffDays(d, t.deadline) <= 0);
  if (!later.length && !keep.length) return '';
  return `<div class="note-local" style="margin-top:8px">${keep.length ? `今日まで：${keep.map(t => esc(t.title)).join('、')}\n` : ''}${later.length ? `明日に回してもいい重いタスク：${later.map(t => esc(t.title)).join('、')}` : ''}</div>`;
}
function morningCard(d) {
  if (!needsMorningPlan(d) || new Date().getHours() >= 22) return '';
  return `<div class="card note"><span class="k">今日の予定</span><div class="v"><div style="font-size:14px">今日の予定はまだ。入れる？</div><div class="row" style="margin-top:8px"><button class="btn sm primary" data-act="morningPlan">入れる</button><button class="btn sm ghost" data-act="morningSkip">今日はなし</button></div></div></div>`;
}
function claudeCard(d) {
  const day = getDay(d); const mode = day.mode; const bt = day.bedtime; const restQ = mode === 'rest';
  let say;
  if (!mode) say = '<div class="cl-say faint">上で今日の体調を選ぶと、ここにClaudeの一言と今夜の就寝目安が出る。</div>';
  else if (S.busy.sug) say = '<div class="cl-say thinking">考えている</div>';
  else if (day.suggest && day.suggest.mode === mode) say = `<div class="cl-say">${esc(day.suggest.text)}</div>`;
  else say = `<div class="cl-say faint">${claudeReady() ? 'まだ一言がない。' : 'Claudeが使えないので、一言はお休み。'}</div>`;
  const m = mode ? MODES[mode] : null;
  const head = `<div class="cl-h"><span class="cl-badge"><span aria-hidden="true">✦</span> Claude</span>${m ? `<span class="cl-mode" style="--c:${m.c}">${m.label}</span>` : ''}<span class="spacer"></span>${mode && claudeReady() ? `<button class="iconbtn" data-act="reSuggest" ${S.busy.sug ? 'disabled' : ''} aria-label="${day.suggest && day.suggest.mode === mode ? '別の一言' : '一言をもらう'}" title="${day.suggest && day.suggest.mode === mode ? '別の一言' : '一言をもらう'}">${ICON.reload}</button>` : ''}</div>`;
  let bed = '';
  if (mode) {
    const act = closedAt(d) ? ((bt && bt.actual) || closedAt(d)) : null;
    if (act) {
      const diff = bt && bt.time ? Math.round((act - slotDate(d, bt.time).getTime()) / 6e4) : null;
      const diffTxt = diff == null ? '' : Math.abs(diff) < 5 ? '目安どおり' : diff > 0 ? `目安より${fmtMin(diff)}遅い` : `目安より${fmtMin(-diff)}早い`;
      bed = `<div class="cl-bed"><div class="cl-bk">就寝（夜モードで記録）</div>
      ${S.timeFix && S.timeFix.key === 'sleep:' + d ? timeFixHTML() : ''}
      <div class="row" style="gap:10px"><span class="big-time">${hm(act)}</span>${fixBtn('sleep:' + d, '寝た時刻を直す')}${bt && bt.time ? `<span class="faint" style="font-size:12px">目安 ${bt.time}${diffTxt ? `・${diffTxt}` : ''}</span>` : ''}</div></div>`;
    } else
    bed = `<div class="cl-bed"><div class="cl-bk">今夜の就寝目安</div>
      <div class="row" style="gap:10px"><span class="big-time">${bt ? bt.time : '—'}</span>${bt && bt.eventId && !restQ ? `<span class="bell" data-tip="45分前にスマホへ通知が来る" aria-label="45分前にスマホへ通知">${ICON.bell}</span>` : ''}<span class="spacer"></span>
      ${S.busy.bed ? '<span class="thinking" style="font-size:12px">考え中</span>' : bt ? `<button class="iconbtn" data-act="proposeBed" aria-label="${claudeReady() ? '考え直す' : '計算し直す'}" title="${claudeReady() ? '考え直す' : '計算し直す'}">${ICON.reload}</button>` : '<button class="cl-link" data-act="proposeBed">目安を出す</button>'}</div>
      ${bt && bt.reason ? `<div class="cl-reason">${esc(bt.reason)}</div>` : ''}
      ${S.busy.bedEv ? '<div class="faint" style="font-size:12px;margin-top:4px">通知の予定を入れている…</div>' : ''}
      ${restQ ? '<div class="faint" style="font-size:12px;margin-top:4px">休養の日なので通知は入れない。記録だけする。</div>' : ''}</div>`;
  }
  if (!claudeReady()) {
    // Claudeがいない日：一言はなし。就寝目安（計算）だけ出す
    if (!mode) return `<section class="card"><div class="cl-bk">今夜の就寝目安</div><div class="faint" style="font-size:13px;margin-top:4px">上で今日の体調を選ぶと、前の晩の就寝時刻と昼寝から目安を出す。</div></section>`;
    return `<section class="card">${bed.replace('<div class="cl-bed">', '<div class="cl-bed" style="margin-top:0;padding-top:0;border-top:0">')}${closedAt(d) ? '' : '<div class="faint" style="font-size:11px;margin-top:6px">前の晩の就寝時刻と昼寝から計算した目安。</div>'}</section>`;
  }
  return `<section class="card clcard" aria-label="Claudeから">${head}${say}${bed}</section>`;
}
function entryBody(e) {
  if (S.editEntry === e.id) return entryEditor(e);
  const open = S.openEntry === e.id;
  return `<button class="more" data-act="entryMenu" data-arg="${e.id}" aria-label="この記録の操作">⋯</button>${e.nap ? '<span class="nap" title="昼寝" aria-label="昼寝">💤</span>' : ''}${esc(e.text || '')}${(e.mood || e.body) ? `<div class="meta">${e.mood ? `<span title="気分 ${e.mood}" aria-label="気分 ${e.mood}">${dots(e.mood, 'var(--mood)')}</span>` : ''}${e.body ? `<span title="体調 ${e.body}" aria-label="体調 ${e.body}">${dots(e.body, 'var(--body)')}</span>` : ''}</div>` : ''}${open ? `<div class="row" style="margin-top:6px;white-space:normal"><button class="btn sm" data-act="entryEdit" data-arg="${e.id}">直す</button><button class="btn ghost sm" data-act="entryDelete" data-arg="${e.id}">消す</button><button class="btn ghost sm" data-act="entryMenu" data-arg="">閉じる</button></div>` : ''}`;
}
function entryEditor(e) {
  const sel = (k, label) => `<label class="faint" style="font-size:12px">${label} <select class="field" id="ee-${k}" data-draft style="padding:3px 6px">${['', 1, 2, 3, 4, 5].map(v => `<option value="${v}" ${String(draft('ee-' + k, e[k] || '')) === String(v) ? 'selected' : ''}>${v || '－'}</option>`).join('')}</select></label>`;
  return `<div class="ee" style="white-space:normal"><textarea class="field" id="ee-text" data-draft rows="2" style="width:100%;min-height:56px" aria-label="記録を直す">${esc(draft('ee-text', e.text || ''))}</textarea>
    <div class="row" style="margin-top:6px">${sel('mood', '気分')}${sel('body', '体調')}<label class="faint" style="font-size:12px"><input type="checkbox" id="ee-nap" ${draft('ee-nap', e.nap ? 'on' : '') ? 'checked' : ''} data-onchg="eeNap"> 💤昼寝</label><span class="spacer"></span><button class="btn ghost sm" data-act="entryEditCancel">やめる</button><button class="btn primary sm" data-act="entrySave" data-arg="${e.id}">保存</button></div></div>`;
}
// 就寝・就寝の目安の予定（今日の流れでは控えめな1行にする。時間の幅は持たせない）
const isBedEv = x => /^🌙\s*就寝/.test(x.title || '');
function timelineHTML(d) {
  const st = S.events[d] || {};
  const evs = effEvents(d);
  const timed = evs.filter(x => !x.allDay);
  const allDay = evs.filter(x => x.allDay);
  const calOf = k => CFG.CALS.find(c => c.key === k) || CFG.CALS[0];
  const now = Date.now();
  const isOn = x => d === today() && !x.canceled && x.start <= now && now < x.end;
  // 予定の時間内に書いた記録は、その予定の中に一段下げて入れる
  // （重なっていたら、今進んでいる予定を優先。なければ後から始まった予定の中）
  const kids = new Map(); const loose = [];
  for (const e of (getDay(d).entries || [])) {
    let host = null;
    for (const x of timed) {
      if (x.canceled || isBedEv(x) || !(x.start <= e.t && e.t < x.end)) continue;
      if (!host || (isOn(x) && !isOn(host)) || (isOn(x) === isOn(host) && x.start > host.start)) host = x;
    }
    if (host) { const k = host.cal + '|' + host.id; if (!kids.has(k)) kids.set(k, []); kids.get(k).push(e); } else loose.push(e);
  }
  // 1段目＝予定と1時間ごとの線、2段目＝その時間に書いた記録。予定の外で書いた記録は、その時刻の「時の線」の下に入れる
  // 今進んでいる予定は、すでに始まったほかの予定や記録より後ろ（「いま」の位置）に並べる
  const HOUR = 3600e3; const floorH = t => { const x = new Date(t); x.setMinutes(0, 0, 0); return x.getTime(); };
  const hours = new Map(); // 時の線: 時刻 -> その1時間に書いた記録（予定の外）
  const addHour = t => { if (!hours.has(t)) hours.set(t, []); return hours.get(t); };
  for (const e of loose) addHour(floorH(e.t)).push(e);
  // 起きた時刻〜就寝の目安までは線を引く。それより外は、過ごした時間（今まで）だけ
  const rng = dayRange(d, timed, loose);
  if (rng) for (let t = floorH(rng.from) + (floorH(rng.from) < rng.from ? HOUR : 0); t <= rng.to; t += HOUR) addHour(t);
  // 予定の最中・予定がちょうど始まる時刻の線は出さない（予定のカードが時間を持っている）
  const inEv = t => timed.some(x => !x.canceled && !isBedEv(x) && x.start <= t && t < x.end);
  const raw = [...timed.map(x => ({ kind: 'ev', o: 1, t: isOn(x) ? now : x.start, s: x.start, x })),
    ...[...hours].filter(([t, list]) => list.length || !inEv(t)).map(([t, list]) => ({ kind: 'hr', o: 0, t, s: t, list: list.sort((a, b) => a.t - b.t) }))];
  if (rng && rng.wake) raw.push({ kind: 'wake', o: -1, t: rng.wake, s: rng.wake });
  const items = raw.sort((a, b) => a.t - b.t || a.o - b.o || a.s - b.s);
  let h = `<h2 class="sec"><span>今日の流れ</span><span class="r">${st.loading ? '<span class="thinking">予定を読み込み中</span>' : S.mcp ? `<button class="iconbtn plusbtn" data-act="todayPlan" aria-label="今日の予定を足す" title="今日の予定を足す">＋</button><button class="iconbtn" data-act="reloadEvents" aria-label="予定を読み込み直す" title="読み込み直す">${ICON.reload}</button>` : ''}</span></h2>`;
  if (!S.mcp) h += `<div class="err">Googleカレンダーにつながっていないので、予定は表示されない（日記は使える）。</div>`;
  if (st.error) h += `<div class="err">${esc(st.error.msg)}${st.error.code === 'approval_required' ? ' <button class="btn sm" data-act="reloadEvents">許可して読み込む</button>' : ''}</div>`;
  if (allDay.length) h += `<div class="allday">${allDay.map(x => `<span style="--c:${calOf(x.cal).color}">${esc(calOf(x.cal).name)} ${esc(x.title)}</span>`).join('')}</div>`;
  if (!items.length) {
    h += `<div class="empty">まだ何もない一日。下の欄から、今の気分を1行で残せる。スコアだけでもいい。</div>`;
    return h;
  }
  let nowPlaced = d !== today();
  const ongoing = new Set(timed.filter(isOn).map(x => x.cal + '|' + x.id));
  if (ongoing.size) nowPlaced = true;
  const nowHost = [...items].reverse().find(it => it.kind === 'ev' && ongoing.has(it.x.cal + '|' + it.x.id));
  const nowKey = nowHost ? nowHost.x.cal + '|' + nowHost.x.id : null;
  const kidsHTML = (list, withNow) => {
    let inner = ''; let placed = !withNow;
    for (const e of list) {
      if (!placed && e.t > now) { inner += nowRow(now); placed = true; }
      inner += `<div class="sub"><time>${hm(e.t)}</time><div class="sub-b">${entryBody(e)}</div></div>`;
    }
    if (!placed) inner += nowRow(now);
    return inner ? `<div class="kids">${inner}</div>` : '';
  };
  const lis = [];
  for (const it of items) {
    if (!nowPlaced && it.t > now) { lis.push(nowLI(now)); nowPlaced = true; }
    if (it.kind === 'ev') {
      const c = calOf(it.x.cal); const key = it.x.cal + '|' + it.x.id; const isNow = key === nowKey;
      const list = (kids.get(key) || []).sort((a, b) => a.t - b.t);
      const x = it.x;
      // 就寝・就寝の目安は、ほかの予定と分けて控えめな1行にする
      if (!x.canceled && isBedEv(x)) {
        const done = !/目安/.test(x.title);
        lis.push(`<li class="ev bedline ${done ? 'done' : ''}" style="--c:${c.color}"><time>${hm(x.start)}</time><div class="tl-b"><span class="bl-t" ${x.ghost ? '' : `data-act="calOpen" data-arg="${esc(key)}"`}>${done ? '🌙 就寝' : '🌙 就寝の目安'}</span>${kidsHTML(list, isNow)}</div></li>`);
        continue;
      }
      const endTxt = x.canceled ? '<span class="evstate">キャンセルした</span>' : x.endedAt ? `〜${hm(x.end)}<span class="evstate">（予定は${hm(x.plannedEnd)}まで）</span>` : `〜${hm(x.end)}`;
      lis.push(`<li class="ev ${isNow ? 'is-now' : ''} ${x.canceled ? 'canceled' : ''} ${x.endedAt ? 'ended' : ''}" style="--c:${c.color}"><time>${hm(x.start)}</time><div class="tl-b"><div class="ev-head" ${x.ghost ? '' : `data-act="calOpen" data-arg="${esc(key)}"`}>${d === today() ? `<button class="evmore" data-act="evMenu" data-arg="${esc(key)}" aria-label="この予定を終える・キャンセルする" aria-expanded="${S.evMenu === key}">⋯</button>` : ''}<div class="t">${esc(x.title)}</div><div class="m">${endTxt}${x.canceled ? '' : bellHTML(x)}</div></div>${S.evMenu === key ? evMenuHTML(d, x, key) : ''}${kidsHTML(list, isNow)}</div></li>`);
    } else if (it.kind === 'wake') {
      const y = addDays(d, -1); const sl = sleepAt(y);
      lis.push(`<li class="wakeline"><time>${hm(it.t)}</time><div class="tl-b">${S.timeFix && S.timeFix.key === 'wake:' + d ? timeFixHTML() : `<span>☀ 起きた</span>${fixBtn('wake:' + d, '起きた時刻を直す')}`}
        ${S.timeFix && S.timeFix.key === 'sleep:' + y ? timeFixHTML() : `<span class="wk-prev">前の晩 ${sl ? hm(sl) + ' 就寝' : 'の就寝 —'}${fixBtn('sleep:' + y, '前の晩に寝た時刻を直す')}</span>`}</div></li>`);
    } else {
      const future = d === today() && it.t > now;
      lis.push(`<li class="hr ${it.list.length ? 'has' : ''} ${future ? 'future' : ''}" style="--c:var(--fg-3)"><time>${hm(it.t)}</time><div class="tl-b">${it.list.length ? kidsHTML(it.list, false) : ''}</div></li>`);
    }
  }
  if (!nowPlaced) lis.push(nowLI(now));
  h += `<ul class="tl">${lis.join('')}</ul>`;
  return h;
}
/* ── 予定の終了・キャンセル（Daylogの記録。.｡oOの予定はカレンダーにも反映） ── */
const evKey = x => x.cal + '|' + x.id;
function effEvents(d) {
  const list = ((S.events[d] && S.events[d].list) || []).map(x => ({ ...x }));
  const log = getDay(d).evlog || {};
  for (const x of list) {
    const l = log[evKey(x)]; if (!l) continue;
    if (l.canceled) x.canceled = true;
    else if (l.endedAt) { x.plannedEnd = l.end || x.end; x.endedAt = l.endedAt; x.end = Math.min(x.end, l.endedAt); }
  }
  // カレンダーから消した（.｡oOでキャンセルした）予定も、記録として残して見せる
  for (const [k, l] of Object.entries(log)) if (l.canceled && !list.some(x => evKey(x) === k)) list.push({ id: l.id, cal: l.cal, title: l.title, start: l.start, end: l.end, allDay: false, canceled: true, ghost: true });
  return list.sort((a, b) => a.start - b.start);
}
function evMenuHTML(d, x, key) {
  const now = Date.now(); const started = x.start <= now; const over = x.end <= now;
  const b = [];
  if (x.canceled) b.push(`<button class="link" data-act="evRestore" data-arg="${esc(key)}">キャンセルを取り消す</button>`);
  else if (x.endedAt) b.push(`<button class="link" data-act="evRestore" data-arg="${esc(key)}">終了を取り消す</button>`);
  else {
    if (started && !over) b.push(`<button class="link" data-act="evEnd" data-arg="${esc(key)}">いま終わった（${hm(now)}）</button>`);
    b.push(`<button class="link danger" data-act="evCancel" data-arg="${esc(key)}">${over || started ? 'やらなかった（キャンセル）' : 'キャンセルする'}</button>`);
  }
  const note = x.cal === 'app' && !x.canceled && !x.endedAt ? '<span class="faint">.｡oOの予定はカレンダーにも反映する</span>' : '';
  return `<div class="evmenu">${b.join('')}${note}</div>`;
}
// Claudeの通知係が残した記録：予約したら「🔔予約済み」、送ったら「🔔✓」（控えめに）
function bellHTML(x) {
  const n = x.cal === 'app' && S.notify[x.id]; if (!n) return '';
  const at = n.notifyAt ? hm(Date.parse(n.notifyAt)) : '';
  if (n.status === 'sent') return `<span class="bell sent" data-tip="${esc(`${n.sentAt ? hm(Date.parse(n.sentAt)) : at}にスマホへ通知を送った`)}">${ICON.bell}✓</span>`;
  return `<span class="bell" data-tip="${esc(`${at}にスマホへ通知する予定`)}">${ICON.bell}</span>`;
}
// 時の線を引く範囲：起きた時刻〜就寝の目安（夜モード後はその時刻）。今日はそれを過ぎても「いま」まで伸ばす
function dayRange(d, timed, loose) {
  const day = getDay(d); const now = Date.now(); const isToday = d === today();
  const wake = wakeAt(d);
  const firstT = Math.min(...timed.filter(x => !x.canceled).map(x => x.start), ...loose.map(e => e.t), isToday ? now : Infinity);
  const from = wake || (isFinite(firstT) ? firstT : null);
  if (!from) return null;
  const bt = day.bedtime; const closed = closedAt(d);
  let to = closed || (bt && bt.time ? slotDate(d, bt.time).getTime() : (sleepAt(d) || null));
  if (!to) to = isToday ? Math.max(now, slotDate(d, '02:00').getTime()) : from;
  if (isToday && !closed) to = Math.max(to, now);
  to = Math.min(to, dayStart(addDays(d, 1)).getTime() + 6 * 3600e3);
  return { from, to, wake };
}
const nowRow = now => `<div class="nowtrack"><div class="nowmark" style="top:50%" aria-label="いま ${hm(now)}"><span><small>いま</small>${hm(now)}</span></div></div>`;
const nowLI = now => `<li class="now"><time>${hm(now)}</time><div class="tl-b"></div></li>`;
const dots = (n, c) => `<span class="dots" style="--c:${c}" aria-label="${n}/5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= Math.round(n) ? 'on' : ''}"></i>`).join('')}</span>`;
function composerToolsHTML() {
  const c = S.comp;
  const pick = (key, label, color) => `<span class="pick" style="--c:${color}" role="group" aria-label="${label}">${label}${[1, 2, 3, 4, 5].map(i => `<button data-act="pick" data-arg="${key}:${i}" class="${c[key] >= i ? 'on' : ''}" aria-label="${label}${i}"><i></i></button>`).join('')}</span>`;
  return `<button class="toggle" data-act="toggleNap" aria-pressed="${c.nap}">💤 昼寝</button>${pick('mood', '気分', 'var(--mood)')}${pick('body', '体調', 'var(--body)')}`;
}

/* ── タスク ── */
const WEIGHTS = { light: { label: '軽い', n: 1, min: 30 }, mid: { label: 'ふつう', n: 2, min: 60 }, heavy: { label: '重い', n: 3, min: 120 } };
const weightLabel = w => (WEIGHTS[w] ? WEIGHTS[w].label : '');
const weightMark = w => WEIGHTS[w] ? `<span class="wmark" title="重さ：${WEIGHTS[w].label}" aria-label="重さ：${WEIGHTS[w].label}">${[1, 2, 3].map(i => `<i class="${i <= WEIGHTS[w].n ? 'on' : ''}"></i>`).join('')}</span>` : '';
const weightSeg = (cur, act, arg) => `<span class="wseg" role="group" aria-label="重さ">${Object.entries(WEIGHTS).map(([k, w]) => `<button data-act="${act}" data-arg="${arg ? arg + ':' : ''}${k}" aria-pressed="${cur === k}">${weightMark(k)}${w.label}</button>`).join('')}</span>`;
// 締切が近い／前の日にやる予定だったもの を、欄を分けずにアイコンと色で示す
function taskFlags(t) {
  const d = today(); const f = { cls: '', icons: '' };
  if (t.status !== 'open') return f;
  if (t.deadline) {
    const left = diffDays(d, t.deadline);
    if (left < 0) { f.cls += ' late'; f.icons += `<span class="flag late" title="締切を過ぎている">⏳ ${-left}日過ぎ</span>`; }
    else if (left <= 2) { f.cls += ' soon'; f.icons += `<span class="flag soon" title="締切が近い">⏳ ${left === 0 ? '今日まで' : left === 1 ? '明日まで' : 'あさってまで'}</span>`; }
  }
  if (t.plannedDate && t.plannedDate < d) { f.cls += ' past'; f.icons += `<span class="flag past" title="${shortLabel(t.plannedDate)}にやる予定だった">↺ ${shortLabel(t.plannedDate)}</span>`; }
  return f;
}
const byDeadline = (a, b) => (a.deadline || '9999') < (b.deadline || '9999') ? -1 : (a.deadline || '9999') > (b.deadline || '9999') ? 1 : (a.createdAt || 0) - (b.createdAt || 0);
function deadlinePill(t) {
  if (!t.deadline) return '';
  const left = diffDays(today(), t.deadline);
  if (t.status === 'open' && left <= 2) return ''; // 近いものは ⏳ の印で出す
  const txt = left < 0 ? `${shortLabel(t.deadline)}（${-left}日過ぎ）` : left === 0 ? '今日' : shortLabel(t.deadline);
  return `<span class="pill ${left <= 1 ? 'warn' : ''}" title="締切 ${shortLabel(t.deadline)}（あと${left}日）">⏱ ${txt}</span>`;
}
function taskHTML(t) {
  const steps = t.steps || []; const done = steps.filter(s => s.done).length;
  const goal = t.goalId && S.goals[t.goalId];
  const open = S.openTask === t.id;
  const fl = taskFlags(t);
  return `<li class="task ${t.status === 'done' ? 'done' : ''}${fl.cls}">
    <div class="head"><button class="check ${t.status === 'done' ? 'on' : ''}" data-act="${t.status === 'done' ? 'taskUndo' : 'taskDone'}" data-arg="${t.id}" aria-label="完了にする">${t.status === 'done' ? CHECK : ''}</button>
      <div class="title" data-act="taskOpen" data-arg="${t.id}" style="cursor:pointer">${esc(t.title)}
        <div class="chips">${fl.icons}${weightMark(t.weight)}${deadlinePill(t)}${goal ? `<span class="pill gold">✦ ${esc(goal.title)}</span>` : ''}${t.plannedDate && t.status === 'open' && !(t.plannedDate < today()) ? `<span class="pill" title="${shortLabel(t.plannedDate)}にやる予定">▸ ${shortLabel(t.plannedDate)}</span>` : ''}${steps.length ? `<span class="pill">${done}/${steps.length}</span>` : ''}</div>
      </div>
      <button class="iconbtn chev ${open ? 'open' : ''}" data-act="taskOpen" data-arg="${t.id}" aria-expanded="${open}" aria-label="${open ? '閉じる' : '開く'}">${ICON.chev}</button></div>
    ${steps.length ? `<div class="bar" aria-hidden="true"><i style="width:${Math.round(done / steps.length * 100)}%"></i></div>` : ''}
    ${open ? `<ul class="steps">${steps.map(s => `<li class="${s.done ? 'done' : ''}"><button class="check ${s.done ? 'on' : ''}" style="width:18px;height:18px" data-act="stepToggle" data-arg="${t.id}:${s.id}" aria-label="ステップを完了">${s.done ? CHECK : ''}</button><span>${esc(s.title)}</span><span class="spacer"></span><button class="btn ghost sm" data-act="stepDel" data-arg="${t.id}:${s.id}" aria-label="ステップを消す">×</button></li>`).join('')}
      <li><input class="field grow" id="step-${t.id}" data-draft placeholder="ステップを足す（Enterで追加）" value="${esc(draft('step-' + t.id))}" data-enter="stepAdd" data-arg="${t.id}"><button class="btn sm" data-act="stepAdd" data-arg="${t.id}">追加</button></li></ul>
      <div class="row" style="margin-top:10px;padding-left:32px">
        ${weightSeg(t.weight, 'taskWeight', t.id)}
        <input class="field" type="date" id="tdl-${t.id}" value="${t.deadline || ''}" data-onchg="taskDeadline" data-arg="${t.id}" aria-label="締切">
        <select class="field" id="tgoal-${t.id}" data-onchg="taskGoal" data-arg="${t.id}" aria-label="目標">${goalOpts(t.goalId)}</select>
        <span class="spacer"></span>
        ${t.status === 'held' ? `<button class="btn sm" data-act="taskRestore" data-arg="${t.id}">保留箱から戻す</button>` : t.status === 'open' ? `<button class="btn ghost sm" data-act="taskHold" data-arg="${t.id}">保留箱へ</button>` : ''}
        <button class="btn ghost sm" data-act="taskDelete" data-arg="${t.id}">消す</button>
      </div>` : ''}
  </li>`;
}
function goalOpts(cur) {
  const d = today(); const gs = [...activeGoals('month', monthKey(d)), ...activeGoals('week', weekStart(d))];
  if (cur && S.goals[cur] && !gs.find(g => g.id === cur)) gs.push(S.goals[cur]);
  return `<option value="">目標なし</option>` + gs.map(g => `<option value="${g.id}" ${g.id === cur ? 'selected' : ''}>${g.scope === 'month' ? '月' : '週'}：${esc(g.title)}</option>`).join('');
}
function tasksView() {
  const d = today();
  const f = S.taskFilter && S.goals[S.taskFilter] ? S.taskFilter : null;
  const byF = t => !f || t.goalId === f;
  const all = Object.values(S.tasks).filter(byF);
  const mode = getDay(d).mode; const easy = mode === 'bad' || mode === 'rest';
  const wv = t => (WEIGHTS[t.weight] ? WEIGHTS[t.weight].n : 2);
  const urgent = t => t.deadline && diffDays(d, t.deadline) <= 0;
  const open = all.filter(t => t.status === 'open').sort((a, b) => easy ? (urgent(b) - urgent(a)) || (wv(a) - wv(b)) || byDeadline(a, b) : byDeadline(a, b));
  const held = all.filter(t => t.status === 'held').sort(byDeadline);
  const done = all.filter(t => t.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 20);
  let h = headerHTML('タスク', `<span>やること ${open.length} 件</span>${held.length ? `<span>保留箱 ${held.length} 件</span>` : ''}`);
  h += goalsSection();
  h += `<h2 class="sec"><span>タスク</span>${easy ? `<span class="r faint">${MODES[mode].label}の日は軽い順</span>` : ''}</h2>`;
  if (f) h += `<div class="filterbar"><span>△ ${esc(S.goals[f].title)} のタスクだけ表示中</span><button class="link" data-act="taskFilter" data-arg="">すべて表示</button></div>`;
  // 書き込むまでは1行だけ。書き始める（または欄に触れる）と、重さ・締切・目標が出る
  const tOpen = S.taskAddOpen || !!String(draft('task-title')).trim() || !!draft('task-w') || !!draft('task-dl') || !!draft('task-goal');
  h += `<div class="taskadd ${tOpen ? 'open' : ''}"><div class="line"><span class="plus" aria-hidden="true">＋</span><input class="field grow" id="task-title" data-draft placeholder="タスクを足す" value="${esc(draft('task-title'))}" data-enter="taskAdd" aria-label="タスク名"><button class="btn primary sm add" data-act="taskAdd">追加</button></div>
    <div class="more">${weightSeg(draft('task-w'), 'newWeight')}<input class="field" type="date" id="task-dl" data-draft value="${esc(draft('task-dl'))}" aria-label="締切" title="締切"><select class="field" id="task-goal" data-draft aria-label="目標">${goalOpts(draft('task-goal'))}</select></div>
  </div>`;
  h += open.length ? `<ul class="tasks">${open.map(taskHTML).join('')}</ul>` : `<div class="empty">${f ? 'この目標のタスクはまだない。上の欄から足すと、この目標につながる。' : 'やることは空っぽ。思いついたら上の欄から足せる。'}</div>`;
  h += `<details class="fold" ${S.foldHeld ? 'open' : ''} data-fold="foldHeld"><summary>保留箱（${held.length}）</summary>${held.length ? `<ul class="tasks" style="margin-top:8px">${held.map(taskHTML).join('')}</ul>` : '<div class="faint" style="margin-top:6px;font-size:13px">保留箱は空。</div>'}</details>`;
  h += `<details class="fold" ${S.foldDone ? 'open' : ''} data-fold="foldDone"><summary>終わったタスク（最近${done.length}件）</summary>${done.length ? `<ul class="tasks" style="margin-top:8px">${done.map(taskHTML).join('')}</ul>` : ''}</details>`;
  return h;
}

/* ── メモ ── */
function memosView() {
  const list = Object.values(S.memos).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  let h = headerHTML('メモ', `<span>${list.length} 件</span>`);
  h += `<div class="card" style="margin-top:12px"><div class="form"><div class="line"><input class="field grow" id="memo-text" data-draft placeholder="思いついたことを1行で" value="${esc(draft('memo-text'))}" data-enter="memoAdd" aria-label="メモ"><button class="btn primary" data-act="memoAdd" aria-label="メモを置く">＋</button></div></div></div>`;
  const when = m => m.createdAt ? `${shortLabel(logicalDate(m.createdAt))} ${hm(m.createdAt)}${m.editedAt ? '（直した）' : ''}` : '';
  const item = m => {
    if (S.editMemo === m.id) return `<li class="memo editing"><div class="txt"><textarea class="field" id="memo-edit" data-draft rows="2" aria-label="メモを直す">${esc(draft('memo-edit', m.text))}</textarea><div class="row" style="margin-top:6px"><span class="spacer"></span><button class="btn ghost sm" data-act="memoEditCancel">やめる</button><button class="btn primary sm" data-act="memoSave" data-arg="${m.id}">保存</button></div></div></li>`;
    const open = S.memoMenu === m.id;
    return `<li class="memo"><div class="txt">${esc(m.text)}<div class="when">${when(m)}</div>${open ? `<div class="mmenu"><button class="link" data-act="memoEdit" data-arg="${m.id}">直す</button><button class="link danger" data-act="memoDelete" data-arg="${m.id}">消す</button></div>` : ''}</div><button class="gmore" data-act="memoMenu" data-arg="${m.id}" aria-expanded="${open}" aria-label="このメモの操作">⋯</button></li>`;
  };
  h += list.length ? `<ul class="memos">${list.map(item).join('')}</ul>`
    : `<div class="empty">まだメモはない。建築のアイデア、動画のネタ、買うもの、なんでも1行で置いておける。</div>`;
  return h;
}

/* ── 目標（タスクの画面の上に出す） ── */
function goalsSection() {
  const d = today(); const mk = monthKey(d), wk = weekStart(d);
  const month = activeGoals('month', mk), week = activeGoals('week', wk);
  const day = getDay(d); const ht = habitText(day.mode);
  const bathDays = Object.keys(S.days).filter(x => x.startsWith(mk) && S.days[x].habits && S.days[x].habits.bath).length;
  const block = (label, list, scope, canAdd, ph, extra = '') => {
    const open = S.goalAddOpen === scope;
    const plus = canAdd ? `<button class="gplus" data-act="goalAddOpen" data-arg="${scope}" aria-expanded="${open}" aria-label="${ph}">${open ? '×' : '＋'}</button>` : '';
    const input = canAdd && open ? `<div class="row gadd"><input class="field grow" id="goal-${scope}" data-draft placeholder="${ph}" value="${esc(draft('goal-' + scope))}" data-enter="goalAdd" data-arg="${scope}" aria-label="${ph}"><button class="btn ghost sm" data-act="goalAdd" data-arg="${scope}">置く</button></div>` : '';
    return `<div class="gblock"><div class="gk"><span>${label}</span><span class="row" style="gap:6px">${extra}${plus}</span></div>${list.map(goalRow).join('') || (open ? '' : '<div class="faint gempty">まだない</div>')}${input}</div>`;
  };
  let habit;
  if (!day.mode) habit = '<div class="faint gempty">今日の体調を選ぶと、お風呂の目安が決まる。</div>';
  else if (!ht) habit = '<div class="faint gempty">休養の日なのでお休み。</div>';
  else habit = `<div class="goal"><button class="check gold ${day.habits && day.habits.bath ? 'on' : ''}" data-act="bathToggle" aria-label="お風呂">${day.habits && day.habits.bath ? CHECK : ''}</button><div class="title">${esc(ht)}</div></div>`;
  const past = Object.values(S.goals).filter(g => !(g.scope === 'month' && g.period === mk) && !(g.scope === 'week' && g.period === wk)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 30);
  if (!S.goalEdit) {
    // ふだんは眺めるだけのコンパクト表示。操作は「編集」ひとつ
    const line = list => list.length ? list.map(g => `<span class="gc-g ${g.status === 'done' ? 'done' : ''}"><i aria-hidden="true">${g.status === 'done' ? '✦' : '✧'}</i>${esc(g.title)}</span>`).join('') : '<span class="faint">まだない</span>';
    const bath = !day.mode ? '<span class="faint">体調を選ぶと決まる</span>' : !ht ? '<span class="faint">休養の日はお休み</span>' : `<span class="gc-g ${day.habits && day.habits.bath ? 'done' : ''}"><i aria-hidden="true">${day.habits && day.habits.bath ? '✦' : '✧'}</i>${esc(ht.split('：')[0])}${day.habits && day.habits.bath ? '（今日は済み）' : ''}</span>`;
    return `<section class="card goals compact" aria-label="目標"><div class="gc-head"><span class="goals-title">目標</span><button class="gedit" data-act="goalEdit">編集</button></div>
      <div class="gc-row"><span class="gc-k">${Number(mk.slice(5))}月</span><div class="gc-v">${line(month)}</div></div>
      <div class="gc-row"><span class="gc-k">今週</span><div class="gc-v">${line(week)}</div></div>
      <div class="gc-row"><span class="gc-k">習慣</span><div class="gc-v">${bath}</div></div></section>`;
  }
  return `<section class="card goals" aria-label="目標"><div class="gc-head"><span class="goals-title">目標</span><button class="gedit on" data-act="goalEdit">閉じる</button></div><div class="goals-sub" style="margin-bottom:4px">こなすものではなく、心に置いておく言葉</div>
    ${block(`${Number(mk.slice(5))}月の目標`, month, 'month', month.length < 3, '今月、大事にしたいこと（3つまで）', month.length ? `${month.length}/3` : '')}
    ${block('今週の目標', week, 'week', true, '今週、大事にしたいこと')}
    <div class="gblock"><div class="gk"><span>毎日の習慣</span><span>今月 ${bathDays} 日</span></div>${habit}</div>
    ${past.length ? `<details class="fold"><summary>前の目標（${past.length}）</summary>${past.map(g => `<div class="goal ${g.status === 'done' ? 'done' : ''}"><span class="pill">${g.scope === 'month' ? g.period.replace('-', '年') + '月' : shortLabel(g.period) + '〜の週'}</span><div class="title">${esc(g.title)}</div>${g.status === 'done' ? '<span class="pill gold">叶った</span>' : ''}</div>`).join('')}</details>` : ''}
  </section>`;
}
function goalRow(g) {
  const linked = Object.values(S.tasks).filter(t => t.goalId === g.id);
  const dn = linked.filter(t => t.status === 'done').length;
  const on = S.taskFilter === g.id; const done = g.status === 'done'; const menu = S.goalMenu === g.id;
  const tl = linked.length ? `<button class="link gtask" data-act="taskFilter" data-arg="${g.id}" aria-pressed="${on}">関わるタスク ${dn}/${linked.length}${on ? '（表示中）' : ''}</button>` : '';
  return `<div class="goal concept ${done ? 'done' : ''}"><span class="gmark" aria-hidden="true">${done ? '✦' : '✧'}</span>
    <div class="title">${esc(g.title)}${tl ? `<div>${tl}</div>` : ''}</div>
    <button class="gmore" data-act="goalMenu" data-arg="${g.id}" aria-expanded="${menu}" aria-label="この目標のメニュー">⋯</button></div>
    ${menu ? `<div class="gmenu"><button class="link" data-act="goalToggle" data-arg="${g.id}">${done ? '達成を取り消す' : '叶ったことにする'}</button>${linked.length ? '' : `<button class="link" data-act="taskFilter" data-arg="${g.id}">タスクとつなげる</button>`}<button class="link danger" data-act="goalDelete" data-arg="${g.id}">消す</button></div>` : ''}`;
}

/* ── 星空 ── */
function skyView() {
  const sk = S.sky; const age = moonAge(new Date());
  const [yy, mm] = sk.month.split('-').map(Number);
  let h = headerHTML('星空', `<span class="row" style="gap:5px">${moonSVG(age, 14)}今夜は${moonName(age)}（月齢 ${age.toFixed(1)}）</span>`);
  h += `<div class="crumbs"><button data-act="skyLevel" data-arg="universe" aria-current="${sk.level === 'universe'}">${sk.year}年の宇宙</button><span class="sep">›</span><button data-act="skyLevel" data-arg="month" aria-current="${sk.level === 'month'}">${mm}月の銀河</button>${sk.level === 'day' ? `<span class="sep">›</span><button aria-current="true">${shortLabel(sk.day)}の星座</button>` : ''}</div>`;
  h += `<div class="skybox"><canvas id="sky" aria-label="星空。星をタップするとその記録が読める"></canvas><div class="skynav"><button data-act="skyPrev" aria-label="前へ">‹</button><button data-act="skyNext" aria-label="次へ">›</button></div></div>`;
  h += `<div class="legend"><span><i style="--c:${STAR_C.diary}"></i>日記</span><span><i style="--c:${STAR_C.task}"></i>タスク</span><span><i style="--c:${STAR_C.gold}"></i>習慣・目標</span><span><i style="--c:${STAR_C.night}"></i>夜モード</span><span><i class="neb"></i>星雲</span>${info(sk.level === 'universe' ? '月をタップすると、その月の銀河に入れる。星雲は不調・休養の日。' : sk.level === 'month' ? '星の集まりをタップすると、その日の星座に入れる。中心の金色は今月の目標の星座。星雲は不調・休養の日。' : '星をタップすると、その時の記録が読める。星雲は不調・休養の日。')}</div>`;
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
  const bathN = past.filter(d => getDay(d).habits && getDay(d).habits.bath).length;
  const stat = (n, unit, l) => `<div class="stat"><div><b>${n}</b><small>${unit}</small></div><span>${l}</span></div>`;
  let h = `<section class="rev"><div class="revhead"><h2>ふりかえり</h2>
    <div class="row"><div class="seg" role="group" aria-label="期間"><button data-act="revKind" data-arg="week" aria-pressed="${r.kind === 'week'}">週</button><button data-act="revKind" data-arg="month" aria-pressed="${r.kind === 'month'}">月</button></div><span class="spacer"></span><button class="btn sm" data-act="revMove" data-arg="-1" aria-label="前の期間">‹</button><span class="revlabel">${label}</span><button class="btn sm" data-act="revMove" data-arg="1" aria-label="次の期間">›</button></div></div>`;
  h += `<div class="stats">${stat(wroteN, ` / ${past.length}日`, '書いた日')}${stat(nightN, '日', '夜モード')}${stat(taskN, '個', '終えたタスク')}${stat(bathN, '日', 'お風呂')}</div>`;
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
function gameName(raw) {
  const k = String(raw || '').toLowerCase();
  if (GAME_NAMES[k]) return GAME_NAMES[k];
  if (GAME_JUNK.includes(k)) return null; // ゲームに付いてくる裏方のプログラム
  const base = String(raw).replace(/-(Win64|Win32|WinGDK)-Shipping$/i, '').replace(/[_-]+/g, ' ');
  return base.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').trim() || String(raw);
}
const BLANK = '~blank';
const pcBlank = d => (S.pc[d] && S.pc[d].games && S.pc[d].games[BLANK]) || 0;
const pcGame = d => S.pc[d] ? Math.max(0, (S.pc[d].gameMinutes || 0) - pcBlank(d)) : 0;
const fmtMin = m => { m = Math.round(m || 0); return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? (m % 60) + '分' : ''}` : `${m}分`; };
function gameBreakdown(d) {
  const g = (S.pc[d] && S.pc[d].games) || {}; const sum = {}; let junk = 0;
  for (const [raw, min] of Object.entries(g)) { if (raw === BLANK) continue; const n = gameName(raw); if (n) sum[n] = (sum[n] || 0) + min; else junk += min; }
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

/* ── 設定 ── */
function settingsView() {
  const st = S.settings;
  const sw = (key, label, small) => `<div class="item"><div class="l">${label}${small ? `<small>${small}</small>` : ''}</div><button class="switch" role="switch" aria-checked="${!!st[key]}" data-act="toggleSetting" data-arg="${key}" aria-label="${label}"></button></div>`;
  let h = headerHTML('設定', 'もう一度右上のボタンを押すと、もとの画面に戻る');
  const look = st.look === 'classic' ? 'classic' : 'nova';
  h += `<h2 class="sec"><span>見た目</span></h2><div class="card settings"><div class="item"><div class="l">画面の見た目<small>記録はどちらでも同じ。いつでも切り替えられる。</small></div><div class="seg" role="group" aria-label="画面の見た目"><button data-act="setLook" data-arg="nova" aria-pressed="${look === 'nova'}">新しい見た目</button><button data-act="setLook" data-arg="classic" aria-pressed="${look === 'classic'}">前の見た目</button></div></div></div>`;
  h += `<h2 class="sec"><span>朝と夜</span></h2><div class="card settings">
    <div class="item"><div class="l">「起きる」予定の時刻<small>夜モードで翌朝の予定として.｡oOに入る。夜モードでその日だけ変えることもできる。</small></div><input class="field" type="time" id="set-wake" value="${esc(st.wakeTime)}" data-onchg="setWake" aria-label="起きる時刻"></div>
    ${pushItemHTML()}
    ${sw('bedtimeNotify', '就寝目安の通知', st.pushOn ? '目安が決まると.｡oOに「🌙 就寝の目安」が入り、45分前にDaylogから通知が来る。PCにも30分前に出す。' : '目安が決まると.｡oOに「🌙 就寝の目安」が自動で入る。スマホはGoogleカレンダーのアプリが45分前に知らせる。PCにも30分前に出す。')}
    <div class="item"><div class="l">参加型の曜日<small>この曜日は、就寝目安を1時より後にする。</small></div><div class="wd">${WD.map((w, i) => `<button data-act="craftDay" data-arg="${i}" aria-pressed="${(st.craftDays || []).includes(i)}">${w}</button>`).join('')}</div></div>
  </div>`;
  h += `<h2 class="sec"><span>続ける仕組み</span></h2><div class="card settings">
    ${sw('autoOpenBoot', 'PCを起動したときにDaylogを開く', 'PCの見張り役が開く。')}
    ${sw('okaeri', 'おかえり画面', '3日以上あいたときに、責めずに迎える画面を出す。')}
    ${sw('restQuiet', '休養の日は演出を止める', '自動で開く機能と、星空のアニメーションを止める。')}
  </div>`;
  h += `<h2 class="sec"><span>今日の画面に出すカレンダー</span></h2><div class="card settings">${CFG.CALS.map(c => `<div class="item"><div class="l"><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${c.color};margin-right:8px"></span>${esc(c.name)}${c.key === 'app' ? '<small>Daylogが予定を入れる専用カレンダー</small>' : ''}</div><button class="switch" role="switch" aria-checked="${st.cals[c.key] !== false}" data-act="toggleCal" data-arg="${c.key}" aria-label="${esc(c.name)}を表示"></button></div>`).join('')}</div>`;
  const pcTxt = { ok: `つながっている（${S.pcAt ? hm(S.pcAt) + 'に同期' : ''}${S.pcLastSeen ? ` · 見張り役の最後の連絡 ${hm(S.pcLastSeen)}` : ''}）`, none: 'まだつながっていない。PCの見張り役に合言葉を入れると届くようになる。', error: '同期に失敗した。少しして「今すぐ同期」を押してみて。', unknown: '確認中' }[S.pcStatus];
  h += `<h2 class="sec"><span>つながり</span></h2><div class="card settings">
    <div class="item"><div class="l">Googleカレンダー<small>${S.mcp ? (S.gcalLinked === false ? 'まだ許可されていない。ログインし直すと許可できる。' : 'ログインしたGoogleアカウントのカレンダーを読み書きできる') : '準備中'}</small></div><button class="btn sm" data-act="relogin">ログインし直す</button></div>
    <div class="item"><div class="l">PCの見張り役<small>${pcTxt}</small></div>${S.pcStatus === 'ok' || S.pcStatus === 'error' ? `<div class="row"><button class="btn sm" data-act="syncPC">今すぐ同期</button></div>` : ''}</div>
    <div class="item"><div class="l">ログイン中<small>${esc((S.user && S.user.email) || '')}</small></div><button class="btn sm ghost" data-act="logout">ログアウト</button></div>
  </div>`;
  h += `<p class="faint" style="font-size:12px;margin-top:16px">記録は自分のアカウントだけが読み書きできる。アドレスを誰かに送っても、ログインしないと日記は見えない。</p>`;
  return h;
}

/* ── カレンダー ── */
const H_PX = 44; // 1時間の高さ
const calOf = k => CFG.CALS.find(c => c.key === k) || CFG.CALS[0];
const calEditable = k => k !== 'holiday';
function normCal(e, cal) {
  const title = e.summary || '（タイトルなし）';
  if (e.start && e.start.date && !e.start.dateTime) {
    const sd = e.start.date, ed = (e.end && e.end.date) || addDays(sd, 1);
    return { id: e.id, cal: cal.key, title, allDay: true, sd, ed, start: parseYmd(sd).getTime(), end: parseYmd(ed).getTime(), rec: !!e.recurringEventId };
  }
  const start = Date.parse(e.start && e.start.dateTime), end = Date.parse((e.end && e.end.dateTime) || (e.start && e.start.dateTime));
  return { id: e.id, cal: cal.key, title, allDay: false, start, end, rec: !!e.recurringEventId };
}
function calRange() {
  const c = S.cal;
  if (c.mode === 'week') { const s = c.anchor; return { days: Array.from({ length: 7 }, (_, i) => addDays(s, i)), from: s, to: addDays(s, 7) }; }
  const mk = monthKey(c.anchor); const gs = weekStart(mk + '-01');
  return { days: Array.from({ length: 42 }, (_, i) => addDays(gs, i)), from: gs, to: addDays(gs, 42), mk };
}
const calKey = r => r.from + '_' + r.to;
async function fetchCal(c, from, to, force) {
  const out = []; let token = null;
  for (let i = 0; i < 4; i++) {
    const input = { calendarId: c.id, startTime: from, endTime: to, pageSize: 250, orderBy: 'startTime' };
    if (token) input.pageToken = token;
    const r = await S.mcp.callTool(CFG.GCAL, 'list_events', input, { cache: force ? { staleTime: 60000, gcTime: 600000, refresh: true } : { staleTime: 60000, gcTime: 600000 } });
    const p = (r && r.payload) || {};
    (p.events || []).forEach(e => { if (e && e.status !== 'cancelled') { const n = normCal(e, c); if (!isNaN(n.start)) out.push(n); } });
    token = p.nextPageToken; if (!token) break;
  }
  return out;
}
async function loadCal(force) {
  if (!S.mcp) return;
  const r = calRange(); const key = calKey(r);
  const st = S.calCache[key] || (S.calCache[key] = { list: [], loading: false, error: null, at: 0 });
  if (st.loading) return;
  if (!force && st.at && Date.now() - st.at < 60000) return;
  st.loading = true; render();
  const from = isoLocal(dayStart(r.from)), to = isoLocal(dayStart(r.to));
  const res = await Promise.allSettled(CFG.CALS.map(c => fetchCal(c, from, to, force)));
  const list = []; let err = null;
  res.forEach(x => { if (x.status === 'fulfilled') list.push(...x.value); else err = err || x.reason; });
  if (!res.every(x => x.status === 'rejected')) st.list = list.sort((a, b) => a.start - b.start);
  st.error = err ? { code: err.code, msg: calErr(err) } : null;
  st.loading = false; st.at = Date.now(); render();
}
function calEventsFor(list, d) {
  const ws = dayStart(d).getTime(), we = dayStart(addDays(d, 1)).getTime(); const hide = S.settings.calHide || {};
  return list.filter(e => !hide[e.cal] && (e.allDay ? (e.sd <= d && d < e.ed) : (e.start < we && e.end > ws)));
}
function lanes(evs, d) {
  const ws = dayStart(d).getTime();
  const items = evs.map(e => { const s = Math.max(0, (e.start - ws) / 6e4); const t = Math.min(1440, (e.end - ws) / 6e4); return { e, s, t: Math.max(t, s + 20) }; }).sort((a, b) => a.s - b.s || b.t - a.t);
  const out = []; let cluster = [], end = -1;
  const flush = () => { const n = Math.max(1, ...cluster.map(x => x.lane + 1)); cluster.forEach(x => { x.lanes = n; out.push(x); }); cluster = []; };
  for (const it of items) {
    if (cluster.length && it.s >= end) { flush(); end = -1; }
    const used = new Set(cluster.filter(x => x.t > it.s).map(x => x.lane)); let lane = 0; while (used.has(lane)) lane++;
    it.lane = lane; cluster.push(it); end = Math.max(end, it.t);
  }
  if (cluster.length) flush();
  return out;
}
const evChip = e => `<button class="ev-chip" style="--c:${calOf(e.cal).color}" data-act="calOpen" data-arg="${e.cal}|${esc(e.id)}" title="${esc(e.title)}">${e.allDay ? '' : `<span class="mono">${hm(e.start)}</span> `}${esc(e.title)}</button>`;
function calView() {
  const c = S.cal; const r = calRange(); const st = S.calCache[calKey(r)] || {}; const list = st.list || [];
  const hide = S.settings.calHide || {};
  const label = c.mode === 'week' ? `${shortLabel(r.days[0])} 〜 ${shortLabel(r.days[6])}` : `${r.mk.slice(0, 4)}年${Number(r.mk.slice(5))}月`;
  let h = headerHTML('カレンダー', `<span>${label}</span>${st.loading ? '<span class="thinking">読み込み中</span>' : ''}`, `<button class="btn primary" data-act="calNew" data-arg="">＋ 予定</button>`);
  h += `<div class="row" style="margin-top:10px"><div class="seg" role="group" aria-label="表示の切り替え"><button data-act="calMode" data-arg="week" aria-pressed="${c.mode === 'week'}">週</button><button data-act="calMode" data-arg="month" aria-pressed="${c.mode === 'month'}">月</button></div><button class="btn sm" data-act="calToday">今日</button><span class="spacer"></span>${S.mcp ? `<button class="iconbtn" data-act="calReload" aria-label="読み込み直す" title="読み込み直す">${ICON.reload}</button>` : ''}<button class="btn sm" data-act="calMove" data-arg="-1" aria-label="前へ">‹</button><button class="btn sm" data-act="calMove" data-arg="1" aria-label="次へ">›</button></div>`;
  h += `<div class="calchips" role="group" aria-label="表示するカレンダー">${CFG.CALS.map(k => `<button class="calchip" style="--c:${k.color}" data-act="calHide" data-arg="${k.key}" aria-pressed="${!hide[k.key]}">${esc(k.name)}</button>`).join('')}</div>`;
  if (!S.mcp) h += `<div class="err" style="margin-top:8px">Googleカレンダーにつながっていないので、予定を出せない。</div>`;
  if (st.error) h += `<div class="err" style="margin-top:8px">${esc(st.error.msg)}${st.error.code === 'approval_required' ? ' <button class="btn sm" data-act="calReload">許可して読み込む</button>' : ''}</div>`;
  h += c.mode === 'week' ? weekGrid(r, list) : monthGrid(r, list);
  h += `<div class="faint" style="font-size:12px;margin-top:8px;text-align:right">${info(`1日は朝6時で区切っている（深夜1時の予定は前の日の列に入る）。予定をタップすると変更・削除、${c.mode === 'week' ? '空いている時間' : '日付'}をタップすると追加できる。`)}</div>`;
  return h;
}
function weekGrid(r, list) {
  const t = today(); const now = Date.now();
  const head = r.days.map(d => { const dt = parseYmd(d); return `<div class="wk-h ${d === t ? 'is-today' : ''} ${dt.getDay() === 0 ? 'sun' : dt.getDay() === 6 ? 'sat' : ''}"><span>${WD[dt.getDay()]}</span><b>${dt.getDate()}</b></div>`; }).join('');
  const allRow = r.days.map(d => `<div class="wk-a">${calEventsFor(list, d).filter(e => e.allDay).map(evChip).join('')}</div>`).join('');
  const hours = Array.from({ length: 24 }, (_, i) => `<div class="wk-hr" style="top:${i * H_PX}px">${(i + 6) % 24}</div>`).join('');
  const cols = r.days.map(d => {
    const blocks = lanes(calEventsFor(list, d).filter(e => !e.allDay), d).map(x => {
      const c = calOf(x.e.cal); const top = x.s / 60 * H_PX, hh = Math.max(18, (x.t - x.s) / 60 * H_PX - 2);
      return `<button class="wk-ev" style="--c:${c.color};top:${top}px;height:${hh}px;left:calc(${x.lane / x.lanes * 100}% + 1px);width:calc(${100 / x.lanes}% - 2px)" data-act="calOpen" data-arg="${x.e.cal}|${esc(x.e.id)}" title="${esc(x.e.title)}"><span class="t">${esc(x.e.title)}</span>${hh >= 34 ? `<span class="m">${hm(x.e.start)}</span>` : ''}</button>`;
    }).join('');
    const nowLine = d === t ? `<div class="wk-now" style="top:${minFromDayStart(d, now) / 60 * H_PX}px"></div>` : '';
    return `<div class="wk-col ${d === t ? 'is-today' : ''}" data-day="${d}">${blocks}${nowLine}</div>`;
  }).join('');
  return `<div class="wk"><div class="wk-row wk-head"><div class="wk-g"></div>${head}</div>
    <div class="wk-row wk-all"><div class="wk-g">終日</div>${allRow}</div>
    <div class="wk-scroll" id="wk-scroll" data-key="${calKey(r)}"><div class="wk-row wk-body" style="height:${24 * H_PX}px"><div class="wk-g wk-hours">${hours}</div>${cols}</div></div></div>`;
}
function monthGrid(r, list) {
  const t = today(); const sel = S.cal.sel;
  const sortEv = (a, b) => (b.allDay - a.allDay) || a.start - b.start;
  const cells = r.days.map(d => {
    const dt = parseYmd(d); const evs = calEventsFor(list, d).sort(sortEv);
    return `<button class="mo-c ${monthKey(d) !== r.mk ? 'out' : ''} ${d === t ? 'is-today' : ''} ${d === sel ? 'sel' : ''}" data-act="calSel" data-arg="${d}" aria-label="${dayLabel(d)} 予定${evs.length}件"><span class="n ${dt.getDay() === 0 ? 'sun' : dt.getDay() === 6 ? 'sat' : ''}">${dt.getDate()}</span>${evs.slice(0, 3).map(e => `<span class="mo-e" style="--c:${calOf(e.cal).color}">${esc(e.title)}</span>`).join('')}${evs.length > 3 ? `<span class="mo-more">+${evs.length - 3}</span>` : ''}</button>`;
  }).join('');
  let h = `<div class="mo"><div class="mo-w">${['月', '火', '水', '木', '金', '土', '日'].map(w => `<span>${w}</span>`).join('')}</div><div class="mo-g">${cells}</div></div>`;
  if (sel) {
    const evs = calEventsFor(list, sel).sort(sortEv);
    h += `<div class="card" style="margin-top:10px"><div class="row"><b>${dayLabel(sel)}</b><span class="spacer"></span><button class="btn sm" data-act="calWeekOf" data-arg="${sel}">この週を見る</button><button class="btn sm primary" data-act="calNew" data-arg="${sel}">＋ 予定</button></div>
      <div class="mo-list">${evs.map(e => `<button class="mo-li" style="--c:${calOf(e.cal).color}" data-act="calOpen" data-arg="${e.cal}|${esc(e.id)}"><span class="mono faint">${e.allDay ? '終日' : `${hm(e.start)}〜${hm(e.end)}`}</span><span class="t">${esc(e.title)}</span><span class="faint">${esc(calOf(e.cal).name)}</span></button>`).join('') || '<div class="faint" style="font-size:13px;padding:6px 0">予定はない</div>'}</div></div>`;
  }
  return h;
}
function wkDefaultScroll() {
  const r = calRange(); const t = today();
  if (r.days.includes(t)) return Math.max(0, (minFromDayStart(t, Date.now()) / 60 - 1.5) * H_PX);
  return 4 * H_PX; // 10時
}
function findEvent(cal, id) {
  for (const k in S.calCache) { const e = (S.calCache[k].list || []).find(x => x.cal === cal && x.id === id); if (e) return e; }
  for (const k in S.events) { const e = (S.events[k].list || []).find(x => x.cal === cal && x.id === id); if (e) return e.allDay ? { ...e, sd: e.date, ed: ymd(new Date(e.end)) > e.date ? ymd(new Date(e.end)) : addDays(e.date, 1) } : e; }
  return null;
}
function calSheetHTML() {
  const s = S.calSheet; const g = (k, fb = '') => draft(k, fb);
  const isNew = s.mode === 'new'; const editable = isNew || s.editable;
  const c = calOf(isNew ? (g('cs-cal') || 'app') : s.cal); const dis = editable ? '' : 'disabled';
  const calSel = isNew ? `<select class="field" id="cs-cal" data-draft aria-label="カレンダー">${CFG.CALS.filter(k => calEditable(k.key)).map(k => `<option value="${k.key}" ${k.key === (g('cs-cal') || 'app') ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}</select>` : `<span class="pill" style="border-color:${c.color};color:var(--fg)">${esc(c.name)}</span>`;
  const rem = [['10', '10分前'], ['0', '開始時'], ['30', '30分前'], ['60', '1時間前'], ['default', 'カレンダーの既定'], ['none', 'なし']];
  return `<div class="sheet"><div class="card">
    <div class="row"><span class="eyebrow">${isNew ? '予定を追加' : editable ? '予定を変える' : '予定'}</span><span class="spacer"></span><button class="btn ghost sm" data-act="csClose">閉じる</button></div>
    ${editable ? `<input class="field" style="width:100%;font-size:17px;margin-top:8px" id="cs-title" data-draft placeholder="予定の名前" value="${esc(g('cs-title'))}" aria-label="予定の名前">` : `<h3 style="margin-top:6px">${esc(s.title)}</h3>`}
    <div class="cs-grid">
      <span class="lb">カレンダー</span><div>${calSel}</div>
      <span class="lb">終日</span><div><input type="checkbox" id="cs-allday" ${s.allDay ? 'checked' : ''} data-onchg="csAllDay" ${dis} aria-label="終日"></div>
      <span class="lb">始まり</span><div class="row"><input class="field" type="date" id="cs-sd" data-draft value="${g('cs-sd')}" ${dis} aria-label="始まりの日">${s.allDay ? '' : `<input class="field" type="time" id="cs-st" data-draft value="${g('cs-st')}" ${dis} aria-label="始まりの時刻">`}</div>
      <span class="lb">終わり</span><div class="row"><input class="field" type="date" id="cs-ed" data-draft value="${g('cs-ed')}" ${dis} aria-label="終わりの日">${s.allDay ? '' : `<input class="field" type="time" id="cs-et" data-draft value="${g('cs-et')}" ${dis} aria-label="終わりの時刻">`}</div>
      ${isNew ? `<span class="lb">通知</span><div><select class="field" id="cs-rem" data-draft aria-label="通知">${rem.map(([v, l]) => `<option value="${v}" ${g('cs-rem', '10') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}
    </div>
    ${s.rec ? '<div class="faint" style="font-size:12px;margin-top:10px">繰り返しの予定。変える・消すのはこの回だけ。</div>' : ''}
    ${!editable ? '<div class="faint" style="font-size:12px;margin-top:10px">祝日のカレンダーは変えられない。</div>' : ''}
    ${s.err ? `<div class="err" style="margin-top:10px">${esc(s.err)}</div>` : ''}
    ${editable ? `<div class="row" style="margin-top:16px">${!isNew ? `<button class="btn ${s.confirmDel ? 'danger' : 'ghost'}" data-act="csDelete" ${s.saving ? 'disabled' : ''}>${s.confirmDel ? '本当に消す' : '消す'}</button>${s.confirmDel ? '<button class="btn ghost" data-act="csKeep">やめる</button>' : ''}` : ''}<span class="spacer"></span><button class="btn primary" data-act="csSave" ${s.saving ? 'disabled' : ''}>${s.saving ? '送っている…' : isNew ? '追加する' : '保存する'}</button></div>` : ''}
  </div></div>`;
}

/* ───────── 重ねる画面（夜モード・シート） ───────── */
function overHTML() {
  if (S.night) return `<div class="overlay" role="dialog" aria-modal="true" aria-label="夜モード">${nightHTML()}</div>`;
  if (S.calSheet) return `<div class="overlay" role="dialog" aria-modal="true" aria-label="予定">${calSheetHTML()}</div>`;
  if (S.sheet) return `<div class="overlay" role="dialog" aria-modal="true">${sheetHTML()}</div>`;
  return '';
}
function sheetHTML() {
  const s = S.sheet; const d = today(); const day = getDay(d);
  const modeRow = `<div class="modes" role="group" aria-label="今日の体調">${Object.entries(MODES).map(([k, m]) => `<button class="mode" style="--c:${m.c}" data-act="setMode" data-arg="${k}" aria-pressed="${day.mode === k}">${m.label}<small>${m.hint}</small></button>`).join('')}</div>`;
  if (s.kind === 'welcome') {
    return `<div class="sheet"><div class="card"><h3>Daylogへようこそ</h3><p class="muted" style="margin:0 0 10px">ここは毎日戻ってくる場所。書く量は少なくていい。</p>
      <ul style="margin:0 0 12px;padding-left:1.2em;color:var(--fg-2);font-size:14px"><li>日中は、思いついたときに1行ずつ記録</li><li>寝る前は「夜モード」で締めて、明日の予定を.｡oOに送る</li><li>記録するたびに星が増えて、1日が星座になる</li></ul>
      <div class="eyebrow">今日の体調は？</div>${modeRow}<div class="row" style="margin-top:14px"><span class="spacer"></span><button class="btn primary" data-act="closeSheet">はじめる</button></div></div></div>`;
  }
  if (s.kind === 'okaeri') {
    return `<div class="sheet"><div class="card"><h3>おかえり</h3><p class="muted" style="margin:0 0 12px">${s.gap}日ぶり。あいた日はそのまま残るだけで、何も減っていない。今の気分を1行だけ置いたら、いつもの画面に戻る。</p>
      <input class="field" style="width:100%" id="okaeri-text" data-draft placeholder="いまの気分を1行で" value="${esc(draft('okaeri-text'))}" data-enter="okaeriSave">
      <div class="eyebrow" style="margin-top:12px">今日の体調は？</div>${modeRow}
      <div class="row" style="margin-top:14px"><button class="btn ghost" data-act="closeSheet">書かずに戻る</button><span class="spacer"></span><button class="btn primary" data-act="okaeriSave">置いて戻る</button></div></div></div>`;
  }
  if (s.kind === 'first') {
    const mk = monthKey(d), wk = weekStart(d);
    const mg = activeGoals('month', mk), wg = activeGoals('week', wk); const ht = habitText(day.mode);
    const list = gs => gs.length ? gs.map(g => `<div class="row" style="padding:3px 0"><span style="color:${g.status === 'done' ? 'var(--gold)' : 'var(--fg-3)'}">${g.status === 'done' ? '★' : '△'}</span><span style="min-width:0;overflow-wrap:anywhere">${esc(g.title)}</span></div>`).join('') : '<div class="faint" style="font-size:13px">まだない</div>';
    return `<div class="sheet"><div class="card"><div class="eyebrow">${dayLabel(d)}</div><h3>今日の目標</h3>
      <div class="note" style="margin-top:8px"><span class="k">今月</span><div class="v">${list(mg)}</div></div>
      <div class="note" style="margin-top:8px"><span class="k">今週</span><div class="v">${list(wg)}</div></div>
      <div class="note" style="margin-top:8px"><span class="k">習慣</span><div class="v">${ht ? esc(ht) : day.mode === 'rest' ? '休養の日はお休み' : '<span class="muted">体調を選ぶと決まる</span>'}</div></div>
      <div class="eyebrow" style="margin-top:14px">今日の体調は？（あとで変えられる）</div>${modeRow}
      <div class="row" style="margin-top:14px">${!mg.length ? '<button class="btn ghost" data-act="sheetGoGoals">目標を置く</button>' : ''}<span class="spacer"></span><button class="btn primary" data-act="closeSheet">閉じる</button></div></div></div>`;
  }
  if (s.kind === 'which') {
    const y = addDays(d, -1);
    return `<div class="sheet"><div class="card"><h3>どの日の締め？</h3><p class="muted" style="margin:0 0 12px">もう朝6時を過ぎているので、日付が変わっている。</p>
      <div class="row"><button class="btn primary" data-act="nightFor" data-arg="${y}">昨日（${dayLabel(y)}）の分として書く</button><button class="btn" data-act="nightFor" data-arg="${d}">今日（${dayLabel(d)}）の分にする</button></div>
      <div class="row" style="margin-top:12px"><button class="btn ghost" data-act="closeSheet">やめる</button></div></div></div>`;
  }
  return '';
}

const NIGHT_STEPS = ['締め', '目標と習慣', '明日の予定', '送る', '寝る前チェック', 'Claudeの一言', '今日の星座'];
function nightHTML() {
  const n = S.night; const d = n.date; const day = getDay(d);
  const dotsH = `<div class="steps-dots" aria-hidden="true">${NIGHT_STEPS.map((_, i) => `<i class="${i === n.step ? 'on' : i < n.step ? 'done' : ''}"></i>`).join('')}</div>`;
  const head = n.morning ? `<div class="nm-title">${n.step === 2 ? '今日の予定' : '送る'}</div><div class="nm-sub">${dayLabel(addDays(d, 1))}${n.adhoc ? ' · 今から足す' : ' · 昨夜入れていなかった分'}</div>` : `${dotsH}<div class="nm-title">${NIGHT_STEPS[n.step]}</div><div class="nm-sub">${dayLabel(d)}の夜${n.step <= 3 ? ` · 明日は${dayLabel(addDays(d, 1))}` : ''}</div>`;
  let body = '', foot = '';
  const back = n.morning ? (n.step === 2 ? (n.adhoc ? `<button class="btn ghost" data-act="nightClose">やめる</button>` : `<button class="btn ghost" data-act="morningSkip">今日はなしでいい</button>`) : `<button class="btn ghost" data-act="nightBack">戻る</button>`) : n.step > 0 && n.step < 5 ? `<button class="btn ghost" data-act="nightBack">戻る</button>` : `<button class="btn ghost" data-act="nightClose">${n.step >= 5 ? '' : 'あとで'}</button>`;
  if (n.step === 0) {
    const scale = (key, label, color) => `<div style="margin-top:12px"><div class="eyebrow">${label}</div><div class="scale" role="group" aria-label="${label}">${[1, 2, 3, 4, 5].map(i => `<button style="--c:${color}" data-act="nightScore" data-arg="${key}:${i}" aria-pressed="${n[key] === i}">${i}</button>`).join('')}</div><div class="scale-l"><span>低い</span><span>高い</span></div></div>`;
    body = `${scale('mood', '今日の気分', 'var(--mood)')}${scale('body', '今日の体調', 'var(--body)')}
      <div style="margin-top:14px"><div class="eyebrow">今日のまとめ（なくてもいい）</div><textarea class="field" id="night-text" data-draft placeholder="今日あったこと、思ったこと">${esc(draft('night-text', n.text || ''))}</textarea></div>
      <div class="faint" style="font-size:12px;margin-top:6px">今日の記録 ${(day.entries || []).length} 件${(!n.mood || !n.body) ? ' · スコアをつけない場合は日中のスコアの平均を使う' : ''}</div>`;
    foot = `${back}<span class="spacer"></span>${day.mode === 'rest' ? '<button class="btn" data-act="nightQuick">ここで締める</button>' : ''}<button class="btn primary" data-act="nightNext">次へ</button>`;
  } else if (n.step === 1) {
    const mg = activeGoals('month', monthKey(d)), wg = activeGoals('week', weekStart(d)); const ht = habitText(day.mode);
    const row = g => `<div class="goal concept ${g.status === 'done' ? 'done' : ''}"><span class="gmark" aria-hidden="true">${g.status === 'done' ? '✦' : '·'}</span><div class="title">${esc(g.title)}</div><span class="pill">${g.scope === 'month' ? '今月' : '今週'}</span></div>`;
    body = `<div class="faint" style="font-size:12px;margin-bottom:6px">今日を振り返りながら、眺めるだけでいい。</div><div class="card">${[...mg, ...wg].map(row).join('') || '<div class="faint" style="font-size:13px">今月・今週の目標はまだない。タスクの画面の上から置ける。</div>'}</div>
      <div class="eyebrow" style="margin-top:14px">毎日の習慣</div>
      ${ht ? `<button class="bigcheck" data-act="bathToggle" aria-pressed="${!!(day.habits && day.habits.bath)}" style="margin-top:6px"><span class="box">${day.habits && day.habits.bath ? CHECK : ''}</span><span>${esc(ht)}</span></button>` : `<div class="muted" style="font-size:14px;margin-top:6px">${day.mode === 'rest' ? '休養の日なので今日の習慣はお休み。' : '体調を選んでいないので、習慣はつけなくていい。'}</div>`}`;
    foot = `${back}<span class="spacer"></span><button class="btn primary" data-act="nightNext">次へ</button>`;
  } else if (n.step === 2) {
    const tm = addDays(d, 1); const st = S.events[tm] || {};
    const used = new Set(n.plan.map(p => p.taskId).filter(Boolean));
    const cands = [...carryTasks(tm), ...openTasks().filter(t => !(t.plannedDate && t.plannedDate < tm))].filter((t, i, a) => a.indexOf(t) === i && !used.has(t.id)).sort(byDeadline);
    const evs = (st.list || []).filter(e => !e.allDay);
    const plan = [...n.plan].sort((a, b) => slotDate(tm, a.start) - slotDate(tm, b.start));
    body = `<div class="eyebrow">タスクから選ぶ（タップで追加）</div><div class="pick-list" style="margin-top:6px">${cands.slice(0, 14).map(t => `<button data-act="planAdd" data-arg="${t.id}">${esc(t.title)}${t.weight ? ` · ${weightLabel(t.weight)}` : ''}${t.deadline ? ` · 締切${shortLabel(t.deadline)}` : ''}</button>`).join('') || '<span class="faint" style="font-size:13px">タスクは空。下から直接入れられる。</span>'}</div>
      <div class="row" style="margin-top:10px"><input class="field grow" id="plan-free" data-draft placeholder="タスクにない予定を入れる" value="${esc(draft('plan-free'))}" data-enter="planFree"><button class="btn sm" data-act="planFree">入れる</button></div>
      <div class="eyebrow" style="margin-top:14px">${n.morning ? '今日' : '明日'}の予定（${plan.length}）</div>
      <div class="card" style="margin-top:6px;padding:4px 12px">${plan.map(p => `<div class="plan-item"><input class="field" type="time" id="pt-${p.id}" value="${p.start}" data-onchg="planTime" data-arg="${p.id}" aria-label="開始時刻"><select class="field" id="pm-${p.id}" data-onchg="planMin" data-arg="${p.id}" aria-label="長さ">${[15, 30, 45, 60, 90, 120, 180, 240].map(m => `<option value="${m}" ${p.minutes === m ? 'selected' : ''}>${m}分</option>`).join('')}</select><span class="nm">${esc(p.title)}</span><button class="btn ghost sm del" data-act="planDel" data-arg="${p.id}" aria-label="外す">×</button></div>`).join('') || '<div class="faint" style="font-size:13px;padding:8px 0">まだ空。予定を入れない日があってもいい。</div>'}</div>
      ${evs.length ? `<div class="eyebrow" style="margin-top:12px">${n.morning ? '今日' : '明日'}もともと入っている予定</div><div style="font-size:13px;color:var(--fg-2);margin-top:4px">${evs.map(e => `<div>${hm(e.start)}〜${hm(e.end)} ${esc(e.title)}</div>`).join('')}</div>` : st.loading ? '<div class="thinking" style="margin-top:10px">明日の予定を読み込み中</div>' : ''}
      ${n.check ? `<div class="${n.check.local ? 'note-local' : 'claude'}" style="margin-top:12px">${esc(n.check.note)}</div>` : ''}${S.busy.check ? '<div class="thinking" style="margin-top:12px">Claudeが詰め込みすぎていないか見ている</div>' : ''}${n.check && n.check.local && !n.check.ok ? '<div class="faint" style="font-size:12px;margin-top:4px">直さずにこのまま「次へ」で進んでもいい。</div>' : ''}`;
    foot = `${back}<span class="spacer"></span>${n.plan.length && !n.check ? `<button class="btn" data-act="planCheck" ${S.busy.check ? 'disabled' : ''}>詰め込みチェック</button>` : ''}<button class="btn primary" data-act="nightNext">次へ</button>`;
  } else if (n.step === 3) {
    const tm = addDays(d, 1);
    const plan = [...n.plan].sort((a, b) => slotDate(tm, a.start) - slotDate(tm, b.start));
    const mark = s => s === 'ok' ? '<span style="color:var(--good)">✓</span>' : s === 'ng' ? '<span style="color:var(--warn)">!</span>' : s === 'run' ? '<span class="faint">…</span>' : '<span class="faint">·</span>';
    body = `<div class="card"><ul class="sendlist">${n.morning ? '' : `<li><span class="st">${mark(n.sent.wake)}</span><span class="mono faint">${n.wake}</span><span>起きる</span><span class="spacer"></span>${n.sentDone ? '' : `<input class="field" type="time" id="night-wake" value="${n.wake}" data-onchg="nightWake" aria-label="起きる時刻" style="width:108px">`}</li>`}
      ${plan.map(p => `<li><span class="st">${mark(n.sent[p.id])}</span><span class="mono faint">${p.start}</span><span style="min-width:0;overflow-wrap:anywhere">${esc(p.title)}（${p.minutes}分）</span></li>`).join('')}</ul></div>
      <div class="faint" style="font-size:12px;margin-top:8px">.｡oOに入る。スマホの通知はGoogleカレンダーのアプリから（.｡oOの通知をオンにしておく）。</div>
      ${n.sendErr ? `<div class="err" style="margin-top:8px">${esc(n.sendErr)}</div>` : ''}
      ${!S.mcp ? '<div class="err" style="margin-top:8px">Googleカレンダーにつながっていないので送れない。予定はDaylogの中にだけ残す。</div>' : ''}`;
    foot = `${back}<span class="spacer"></span>${n.sentDone ? '<button class="btn primary" data-act="nightNext">次へ</button>' : `<button class="btn ghost" data-act="nightSkipSend">送らずに次へ</button><button class="btn primary" data-act="nightSend" ${n.sending || !S.mcp ? 'disabled' : ''}>${n.sending ? '送っている…' : 'カレンダーに送る'}</button>`}`;
  } else if (n.step === 4) {
    body = `<button class="bigcheck" data-act="nightMeds" aria-pressed="${!!n.meds}"><span class="box">${n.meds ? CHECK : ''}</span><span>薬を飲んだ</span></button>`;
    foot = `${back}<span class="spacer"></span><button class="btn primary" data-act="nightNext">次へ</button>`;
  } else if (n.step === 5) {
    body = `<div class="card">${n.comment ? `<div class="claude">${esc(n.comment)}</div>` : S.busy.close ? '<div class="thinking">Claudeが今日の記録を読んでいる</div>' : n.commentErr ? `<div class="err">${esc(n.commentErr)}</div>` : !claudeReady() ? '<div class="muted">今日もおつかれさま。記録は残った。</div>' : ''}</div>
      ${n.name ? `<div class="faint" style="font-size:12px;margin-top:10px">今日の星座の名前：<span class="cname" style="font-size:16px;color:var(--fg)">${esc(n.name)}</span></div>` : ''}`;
    foot = `<span class="spacer"></span>${n.commentErr && claudeReady() ? '<button class="btn" data-act="nightComment">もう一度</button>' : ''}<button class="btn primary" data-act="nightNext" ${S.busy.close ? 'disabled' : ''}>星座を見る</button>`;
  } else if (n.step === 6) {
    const quiet = day.mode === 'rest' && S.settings.restQuiet;
    body = `<div class="rise ${quiet ? 'static' : ''}" id="rise"><canvas id="rise-canvas" aria-label="今日の星座"></canvas><div class="nm">${esc(n.name || `${shortLabel(d)}の星座`)}</div></div>
      <div class="faint" style="text-align:center;font-size:12px;margin-top:8px">星 ${starsForDay(d).length} 個${isNebula(d) ? ' · 星雲の日' : ''}</div>`;
    foot = `<span class="spacer"></span><button class="btn primary" data-act="nightFinish">おやすみ</button><span class="spacer"></span>`;
  }
  return `<div class="sheet">${head}<div>${body}</div><div class="row" style="margin-top:16px">${foot}</div></div>`;
}

/* ───────── キャンバス ───────── */
function afterMain() { if (S.view === 'sky') drawSky(); }
function afterOver() { if (S.night && S.night.step === 6) playRise(); }
function fitCanvas(cv, hRatio, maxH) {
  const w = cv.parentElement.clientWidth; const h = Math.min(maxH, Math.round(w * hRatio));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + 'px';
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { ctx, w, h };
}
function drawStar(ctx, x, y, k, small, boost = 1) {
  const c = STAR_C[k]; const r = (k === 'night' ? 3.6 : k === 'gold' ? 2.4 : small ? 1.4 : 2) * boost;
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
  if (!best) { S.sky.sel = null; render(); return; }
  if (best.month) { S.sky.month = best.month; S.sky.level = 'month'; S.sky.sel = null; }
  else if (best.goal) { S.sky.sel = { when: '今月の目標の星座', label: `${best.goal.title}\n${best.goal.status === 'done' ? '達成して星座が完成した' : `灯った星 ${best.lit} / ${best.total}`}` }; }
  else if (best.star) { S.sky.sel = { when: `${dayLabel(best.day)} ${hm(best.star.t)}`, label: best.star.label }; }
  else if (best.dayHit) { S.sky.level = 'day'; S.sky.day = best.day; S.sky.sel = null; }
  render();
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

/* ───────── 操作 ───────── */
function toast(msg, action) { S.toast = { msg, action, id: uid() }; render(); const id = S.toast.id; setTimeout(() => { if (S.toast && S.toast.id === id) { S.toast = null; render(); } }, action ? 6000 : 4200); }
function toastHTML() { const t = S.toast; if (!t) return ''; return `<div class="toast" role="status"><span>${esc(t.msg)}</span>${t.action ? `<button class="link" data-act="undo">元に戻す</button>` : ''}</div>`; }

const A = {};
A.setLook = v => { patchSettings({ look: v === 'classic' ? 'classic' : 'nova' }); applyLook(); };
/* ── Daylogから直接通知（ホーム画面のDaylog・アプリ版） ── */
S.push = { state: null, busy: false, msg: '' };
async function refreshPush() {
  if (!window.daylogPush) { S.push.state = 'elsewhere'; render(); return; }
  try { S.push.state = await window.daylogPush.state(); } catch (_) { S.push.state = 'unsupported'; }
  render();
}
const PUSH_MSG = {
  'need-home': 'iPhoneは、Safariの共有ボタン →「ホーム画面に追加」から開いたDaylogでオンにできる（iOS 16.4以降）。',
  unsupported: 'このブラウザは通知に対応していない。',
  denied: '通知が「許可しない」になっている。端末の設定 → 通知 → Daylog（またはブラウザ）で許可すると使える。',
  elsewhere: 'この画面（claude.ai版）からは出せない。ホーム画面のDaylog（アプリ版）でオンにすると、どちらで書いた予定でも通知が来る。',
};
function pushItemHTML() {
  const p = S.push; const st = p.state; const on = st === 'on';
  const btn = p.busy ? '<span class="thinking" style="font-size:12px">設定中</span>'
    : on ? '<button class="btn sm" data-act="pushTest">テスト</button><button class="btn ghost sm" data-act="pushOff">オフ</button>'
    : (st === 'off' ? '<button class="btn primary sm" data-act="pushOn">オンにする</button>' : '');
  const small = on ? 'この端末に、予定の15分前・就寝目安の45分前に通知が来る（Googleカレンダーの通知が無くても届く）。'
    : st === 'off' ? '予定の15分前・就寝目安の45分前に、Googleカレンダーを通さずDaylogから通知を出す。'
    : PUSH_MSG[st] || '確認中…';
  return `<div class="item"><div class="l">Daylogからの通知${on ? ' <span class="pill">オン</span>' : ''}<small>${esc(small)}${p.msg ? `<br>${esc(p.msg)}` : ''}</small></div><div class="row" style="gap:6px">${btn}</div></div>`;
}
A.pushOn = async () => {
  S.push.busy = true; S.push.msg = ''; render();
  try { await window.daylogPush.enable(); S.push.state = 'on'; if (!S.settings.pushOn) patchSettings({ pushOn: true }); toast('この端末に通知が来るようにした。「テスト」で確かめられる。'); }
  catch (e) { const c = e && e.code; S.push.msg = PUSH_MSG[c] || '通知をオンにできなかった。' + (e && e.message ? '（' + e.message + '）' : ''); await refreshPush(); }
  finally { S.push.busy = false; render(); }
};
A.pushOff = async () => {
  S.push.busy = true; render();
  try { await window.daylogPush.disable(); S.push.state = 'off'; const n = await window.daylogPush.devices().catch(() => 1); if (!n) patchSettings({ pushOn: false }); toast('この端末の通知を止めた。'); }
  catch (_) { toast('通知を止められなかった。'); }
  finally { S.push.busy = false; render(); }
};
A.pushTest = async () => {
  S.push.busy = true; render();
  try { const r = await window.daylogPush.test(); toast(r && r.sent ? 'テストの通知を送った。数秒で届く。' : 'テストの通知を送れなかった。オフ→オンをやり直してほしい。'); }
  catch (_) { toast('テストの通知を送れなかった。'); }
  finally { S.push.busy = false; render(); }
};
A.toggleSettings = () => (S.view === 'settings' ? A.goBack() : A.go('settings'));
A.goBack = () => A.go(S.prevView && S.prevView !== 'settings' ? S.prevView : 'today');
A.go = v => { if (v === 'settings' && S.view !== 'settings') { S.prevView = S.view; refreshPush(); } S.view = v; S.sky.sel = null; S.openTask = null; window.scrollTo(0, 0); render(); if (v === 'today') loadEvents(today()); if (v === 'cal') loadCal(); };
A.setMode = async m => {
  const d = today(); const day = getDay(d); const patch = { mode: m, modeAt: Date.now() };
  if (!day.wakeAt && !day.mode) patch.wakeAt = Date.now();
  await patchDay(d, patch);
  if (m !== day.mode) { modeSuggestion(d, m); maybeBed(true); schedulePCPush(); if (m === 'rest') dropBedEvent(d); else autoBedEvent(d); }
};
const bedTried = {};
function maybeBed(modeChanged) {
  const d = today(); const day = getDay(d);
  if (!S.ready || !day.mode || S.busy.bed || closedAt(d)) return;
  if (!day.bedtime) { proposeBedtime(d); return; }
  if (day.bedtime.by === 'calc' && claudeReady() && (modeChanged || !bedTried[d])) { bedTried[d] = true; proposeBedtime(d); }
}
A.pick = arg => { const [k, v] = arg.split(':'); const n = Number(v); S.comp[k] = S.comp[k] === n ? 0 : n; render(); };
A.toggleNap = () => { S.comp.nap = !S.comp.nap; render(); };
A.sendEntry = () => {
  const ta = $('#composer-text'); const text = (ta ? ta.value : '').trim(); const c = S.comp;
  if (!text && !c.mood && !c.body && !c.nap) { toast('1行書くか、スコアを選ぶと記録できる。'); return; }
  const d = today(); const day = getDay(d);
  const e = clean({ id: uid(), t: Date.now(), text, mood: c.mood || undefined, body: c.body || undefined, nap: c.nap || undefined });
  S.comp = { mood: 0, body: 0, nap: false };
  if (ta) { ta.value = ''; ta.style.height = 'auto'; ta.blur(); }
  setTimeout(compSync, 150);
  patchDay(d, { entries: [...(day.entries || []), e] });
};
A.entryMenu = id => { S.openEntry = id || null; render(); };
A.entryEdit = id => { const e = (getDay(today()).entries || []).find(x => x.id === id); if (!e) return; S.editEntry = id; S.openEntry = null; Object.assign(S.drafts, { 'ee-text': e.text || '', 'ee-mood': e.mood || '', 'ee-body': e.body || '', 'ee-nap': e.nap ? 'on' : '' }); render(); setTimeout(() => { const t = $('#ee-text'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 50); };
A.entryEditCancel = () => { S.editEntry = null; render(); };
A.eeNap = (v, el) => { S.drafts['ee-nap'] = el.checked ? 'on' : ''; };
/* ── 起きた・寝た時刻を手で直す（さりげない ✎ から） ── */
const fixBtn = (key, label) => `<button class="fixbtn" data-act="timeFix" data-arg="${key}" aria-label="${label}" title="${label}">✎</button>`;
function timeFixHTML() {
  const f = S.timeFix; const label = f.kind === 'wake' ? '起きた時刻' : '寝た時刻';
  return `<span class="timefix" role="group" aria-label="${label}を直す"><span class="faint">${label}</span><input type="time" class="field" id="tf-time" value="${esc(f.value || '')}" aria-label="${label}"><button class="btn primary sm" data-act="timeFixSave">保存</button><button class="btn ghost sm" data-act="timeFixCancel">やめる</button></span>`;
}
A.timeFix = key => {
  const [kind, d] = key.split(':'); const t = kind === 'wake' ? wakeAt(d) : sleepAt(d);
  S.timeFix = { key, kind, d, value: t ? hm(t) : '' }; render();
  setTimeout(() => { const el = $('#tf-time'); if (el) el.focus(); }, 30);
};
A.timeFixCancel = () => { S.timeFix = null; render(); };
A.timeFixSave = async () => {
  const f = S.timeFix; const el = $('#tf-time'); const v = el ? el.value : '';
  if (!f || !/^\d{1,2}:\d{2}$/.test(v)) { toast('時刻を入れてほしい。'); return; }
  S.timeFix = null;
  if (f.kind === 'wake') {
    // 起きた時刻：その日の朝（6時より前を選んだら、その日の早朝として扱う）
    const [h, m] = v.split(':').map(Number); const t = parseYmd(f.d); t.setHours(h, m, 0, 0);
    await patchDay(f.d, { wakeAt: t.getTime(), wakeFix: true });
    toast(`起きた時刻を${v}にした。`);
  } else {
    // 寝た時刻：その日の夜（0〜6時は次の日の深夜）
    const t = slotDate(f.d, v).getTime(); const day = getDay(f.d); const bt = day.bedtime;
    const patch = { sleepAt: t, sleepFix: true };
    if (bt && (bt.actual || closedAt(f.d))) patch.bedtime = { ...bt, actual: t, eventTime: bt.recorded ? v : bt.eventTime };
    await patchDay(f.d, patch);
    // カレンダーの「🌙 就寝」の記録も動かす
    if (bt && bt.recorded && bt.eventId && bt.eventId !== 'unknown' && S.mcp) {
      try { await updateEvent(bt.eventId, { startTime: isoLocal(new Date(t)), endTime: isoLocal(new Date(t + 15 * 6e4)) }); loadEvents(f.d, true); } catch (e) { toast(calWriteErr(e)); }
    }
    toast(`寝た時刻を${v}にした。`);
  }
  render();
};
A.entrySave = id => {
  const d = today(); const day = getDay(d); const g = k => S.drafts[k];
  const entries = (day.entries || []).map(e => e.id !== id ? e : clean({ ...e, text: String(g('ee-text') || '').trim(), mood: Number(g('ee-mood')) || undefined, body: Number(g('ee-body')) || undefined, nap: g('ee-nap') ? true : undefined, editedAt: Date.now() }));
  S.editEntry = null; patchDay(d, { entries }); toast('記録を直した。');
};
A.entryDelete = id => {
  const d = today(); const day = getDay(d); const e = (day.entries || []).find(x => x.id === id); if (!e) return;
  patchDay(d, { entries: day.entries.filter(x => x.id !== id) }); S.openEntry = null;
  S.undo = () => { const cur = getDay(d); patchDay(d, { entries: [...(cur.entries || []), { ...e, id: uid() }].sort((a, b) => a.t - b.t) }); };
  toast('記録を消した。', true);
};
A.undo = () => { const f = S.undo; S.undo = null; S.toast = null; if (f) f(); render(); };
A.reloadPage = () => location.reload();
A.reloadEvents = () => loadEvents(S.view === 'today' ? today() : today(), true);
A.proposeBed = () => proposeBedtime(today(), true);
A.evMenu = key => { S.evMenu = S.evMenu === key ? null : key; render(); };
function findTodayEv(key) { return effEvents(today()).find(x => evKey(x) === key); }
async function writeEvLog(key, val) {
  const d = today(); const log = { ...(getDay(d).evlog || {}) };
  if (val) log[key] = val; else delete log[key];
  await patchDay(d, { evlog: log });
}
A.evEnd = async key => {
  const x = findTodayEv(key); if (!x) return; S.evMenu = null; const now = Date.now();
  await writeEvLog(key, { id: x.id, cal: x.cal, title: x.title, start: x.start, end: x.plannedEnd || x.end, endedAt: now, at: now });
  toast(`「${x.title}」を${hm(now)}に終わったことにした。`);
  if (x.cal === 'app' && S.mcp) { try { await updateEvent(x.id, { startTime: isoLocal(new Date(x.start)), endTime: isoLocal(new Date(now)) }); afterCalWrite(); } catch (e) { toast(calWriteErr(e)); } }
};
A.evCancel = async key => {
  const x = findTodayEv(key); if (!x) return; S.evMenu = null; const now = Date.now();
  await writeEvLog(key, { id: x.id, cal: x.cal, title: x.title, start: x.start, end: x.plannedEnd || x.end, canceled: true, at: now });
  toast(`「${x.title}」をキャンセルにした。`);
  if (x.cal === 'app' && S.mcp && x.start > now) { try { await deleteEvent(x.id); afterCalWrite(); } catch (e) { toast(calWriteErr(e)); } }
};
A.evRestore = async key => {
  const d = today(); const l = (getDay(d).evlog || {})[key]; if (!l) return; S.evMenu = null;
  const wasGhost = l.canceled && l.cal === 'app' && !((S.events[d] && S.events[d].list) || []).some(x => evKey(x) === key);
  await writeEvLog(key, null);
  if (l.cal === 'app' && S.mcp) {
    try {
      if (wasGhost) await createEvent({ summary: l.title, start: new Date(l.start), end: new Date(l.end), reminder: 15 });
      else if (l.endedAt) await updateEvent(l.id, { startTime: isoLocal(new Date(l.start)), endTime: isoLocal(new Date(l.end)) });
      afterCalWrite();
    } catch (e) { toast(calWriteErr(e)); }
  }
  toast('もとに戻した。');
};

A.reSuggest = () => { const d = today(); const mode = getDay(d).mode; if (mode) modeSuggestion(d, mode, true); };
// 就寝目安が決まったら、自動で.｡oOに「🌙 就寝の目安」を入れる（Claudeの予定済みタスクが45分前にスマホへ通知する）
function autoBedEvent(d) {
  const day = getDay(d); const bt = day.bedtime;
  if (!bt || !S.mcp || !canWrite() || !S.settings.bedtimeNotify || day.mode === 'rest' || S.busy.bedEv || d !== today() || closedAt(d)) return;
  if (bt.eventId && bt.eventTime === bt.time) return;
  A.bedEvent(true);
}
async function dropBedEvent(d) {
  const bt = getDay(d).bedtime; if (!bt || !bt.eventId || !S.mcp || bt.eventId === 'unknown') return;
  try { await deleteEvent(bt.eventId); } catch (_) {}
  await patchDay(d, { bedtime: { ...getDay(d).bedtime, eventId: null, eventTime: null } }); loadEvents(d, true);
}
const BED_TITLE = '🌙 就寝の目安';
// その夜（論理日の6時〜翌日の昼）の.｡oOにある就寝目安の予定を探す。読めなかったら null
async function findBedEvents(d) {
  try {
    const r = await S.mcp.callTool(CFG.GCAL, 'list_events', { calendarId: CFG.APP_CAL, startTime: isoLocal(dayStart(d)), endTime: isoLocal(new Date(dayStart(addDays(d, 1)).getTime() + 6 * 3600e3)), pageSize: 100, orderBy: 'startTime' }, { cache: { staleTime: 0, gcTime: 60000, refresh: true } });
    const list = (r && r.payload && r.payload.events) || [];
    return list.filter(e => e && e.status !== 'cancelled' && (e.summary || '').trim() === BED_TITLE).map(e => e.id);
  } catch (_) { return null; }
}
A.bedEvent = async quiet => {
  const d = today(); const bt = getDay(d).bedtime; if (!bt || !S.mcp || !canWrite() || closedAt(d)) return; quiet = quiet === true;
  if (S.busy.bedEv) return;
  S.busy.bedEv = true; render();
  const start = slotDate(d, bt.time); const end = new Date(start.getTime() + 15 * 6e4);
  try {
    const found = await findBedEvents(d);
    if (found) {
      // 1つだけ残す（今の記録が指している予定を優先）。残りは重複なので消す
      const keep = found.includes(bt.eventId) ? bt.eventId : (found[0] || null);
      for (const id of found) if (id !== keep) { try { await deleteEvent(id); } catch (_) {} }
      if (keep !== bt.eventId) await patchDay(d, { bedtime: { ...getDay(d).bedtime, eventId: keep, eventTime: null } });
    } else if ((!bt.eventId || bt.eventId === 'unknown') && quiet) return; // カレンダーを確かめられないときは、重複を作らないよう自動では入れない
    const evId = getDay(d).bedtime.eventId;
    if (evId && evId !== 'unknown') { await updateEvent(evId, { startTime: isoLocal(start), endTime: isoLocal(end), summary: BED_TITLE, overrideReminders: S.settings.pushOn ? [] : [{ method: 'popup', minutes: 45 }] }); await patchDay(d, { bedtime: { ...getDay(d).bedtime, eventTime: bt.time } }); if (!quiet) toast(`通知を${bt.time}に合わせた。`); }
    else { const id = await createEvent({ summary: BED_TITLE, start, end, reminder: 45, description: 'Daylogの就寝目安' }); await patchDay(d, { bedtime: { ...getDay(d).bedtime, eventId: id || 'unknown', eventTime: bt.time } }); if (!quiet) toast(`${bt.time}の就寝目安をカレンダーに入れた。45分前に通知が来る。`); }
    pushPCConfig();
  } catch (e) { if (!quiet) toast(calErr(e)); }
  finally { S.busy.bedEv = false; render(); loadEvents(d, true); }
};
A.replan = async () => {
  const d = today(); S.busy.replan = true; render();
  const evs = effEvents(d).filter(e => !e.allDay && !e.canceled && e.end > Date.now()).map(e => `${hm(e.start)}〜${hm(e.end)} ${e.title}`).join('\n') || 'なし';
  const tasks = [...carryTasks(d), ...openTasks()].filter((t, i, a) => a.indexOf(t) === i).sort(byDeadline).slice(0, 8).map(t => `${t.title}${t.weight ? `（重さ:${weightLabel(t.weight)}）` : ''}${t.deadline ? ` 締切${shortLabel(t.deadline)}` : ''}`).join('\n') || 'なし';
  try {
    const text = await askText(`今日は${hm(wakeAt(d))}に起きた。体調モードは${getDay(d).mode ? MODES[getDay(d).mode].label : '未設定'}。今の時刻は${hm(Date.now())}。残りの今日を短縮版にする提案をして。何を残して、何を明日に回すか。箇条書き3〜4行、各30字以内。本文だけ返して。\n残りの予定:\n${evs}\nタスク:\n${tasks}`, 'default', false);
    await patchDay(d, { replan: { text: text.slice(0, 400), at: Date.now() } });
  } catch (e) { const m = claudeErr(e); if (m) toast(m); }
  finally { S.busy.replan = false; render(); }
};
A.dismissReplan = () => { const d = today(); patchDay(d, { replan: { ...(getDay(d).replan || {}), dismissed: true } }); };

// タスク
A.taskAdd = () => {
  const title = (S.drafts['task-title'] || '').trim(); if (!title) return;
  const id = uid();
  const t = clean({ id, title, weight: S.drafts['task-w'] || undefined, deadline: S.drafts['task-dl'] || undefined, goalId: S.drafts['task-goal'] || undefined, status: 'open', steps: [], createdAt: Date.now() });
  S.drafts['task-title'] = ''; S.drafts['task-w'] = ''; S.drafts['task-dl'] = ''; S.drafts['task-goal'] = ''; S.taskAddOpen = false; S.tasks[id] = t; render(); putDoc('tasks/' + id, t);
};
A.taskOpen = id => { S.openTask = S.openTask === id ? null : id; render(); };
A.taskDone = id => { const t = S.tasks[id]; if (!t) return; patchTask(id, { status: 'done', doneAt: Date.now() }); toast('終わった。青い星がひとつ増えた。'); };
A.taskUndo = id => patchTask(id, { status: 'open', doneAt: null });
A.taskHold = id => patchTask(id, { status: 'held', heldAt: Date.now() });
A.taskRestore = id => patchTask(id, { status: 'open', plannedDate: null, heldAt: null });
A.taskDelete = id => { const t = S.tasks[id]; if (!t) return; delete S.tasks[id]; S.openTask = null; render(); delDoc('tasks/' + id); S.undo = () => { S.tasks[id] = t; render(); putDoc('tasks/' + id, t); }; toast('タスクを消した。', true); };
A.taskWeight = arg => { const [id, w] = arg.split(':'); const t = S.tasks[id]; if (!t) return; patchTask(id, { weight: t.weight === w ? null : w }); };
A.newWeight = w => { S.drafts['task-w'] = S.drafts['task-w'] === w ? '' : w; render(); };
A.taskDeadline = (v, el) => patchTask(el.dataset.arg, { deadline: v || null });
A.taskGoal = (v, el) => patchTask(el.dataset.arg, { goalId: v || null });
A.stepAdd = id => { const k = 'step-' + id; const title = (S.drafts[k] || '').trim(); if (!title) return; S.drafts[k] = ''; const t = S.tasks[id]; patchTask(id, { steps: [...(t.steps || []), { id: uid(), title, done: false }] }); };
A.stepToggle = arg => { const [tid, sid] = arg.split(':'); const t = S.tasks[tid]; patchTask(tid, { steps: (t.steps || []).map(s => s.id === sid ? { ...s, done: !s.done, doneAt: !s.done ? Date.now() : null } : s) }); };
A.stepDel = arg => { const [tid, sid] = arg.split(':'); const t = S.tasks[tid]; patchTask(tid, { steps: (t.steps || []).filter(s => s.id !== sid) }); };
// メモ
A.memoMenu = id => { S.memoMenu = S.memoMenu === id ? null : id; render(); };
A.memoEdit = id => { const m = S.memos[id]; if (!m) return; S.editMemo = id; S.memoMenu = null; S.drafts['memo-edit'] = m.text; render(); setTimeout(() => { const t = $('#memo-edit'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 30); };
A.memoEditCancel = () => { S.editMemo = null; render(); };
A.memoSave = id => { const m = S.memos[id]; if (!m) return; const text = String(S.drafts['memo-edit'] || '').trim(); if (!text) return; const nm = { ...m, text, editedAt: Date.now() }; S.memos[id] = nm; S.editMemo = null; render(); putDoc('memos/' + id, nm); toast('メモを直した。'); };
A.memoAdd = () => { const text = (S.drafts['memo-text'] || '').trim(); if (!text) return; const id = uid(); const m = { id, text, createdAt: Date.now() }; S.drafts['memo-text'] = ''; S.memos[id] = m; render(); putDoc('memos/' + id, m); };
A.memoDelete = id => { const m = S.memos[id]; if (!m) return; delete S.memos[id]; render(); delDoc('memos/' + id); S.undo = () => { S.memos[id] = m; render(); putDoc('memos/' + id, m); }; toast('メモを消した。', true); };
A.memoToTask = id => { const m = S.memos[id]; if (!m) return; const tid = uid(); const t = { id: tid, title: m.text.split('\n')[0].slice(0, 120), status: 'open', steps: [], createdAt: Date.now(), fromMemo: id }; S.tasks[tid] = t; delete S.memos[id]; render(); putDoc('tasks/' + tid, t); delDoc('memos/' + id); toast('タスクにした。タスクの画面にある。'); };
// 目標
A.taskFilter = id => { S.taskFilter = id && S.taskFilter !== id ? id : null; if (S.taskFilter) S.drafts['task-goal'] = S.taskFilter; render(); };
A.goalAddOpen = scope => { S.goalAddOpen = S.goalAddOpen === scope ? null : scope; render(); if (S.goalAddOpen) setTimeout(() => { const el = document.getElementById('goal-' + scope); if (el) el.focus(); }, 0); };
A.goalEdit = () => { S.goalEdit = !S.goalEdit; S.goalMenu = null; S.goalAddOpen = null; render(); };
A.goalMenu = id => { S.goalMenu = S.goalMenu === id ? null : id; render(); };
A.goalAdd = scope => {
  const k = scope === 'month' ? 'goal-month' : 'goal-week'; const title = (S.drafts[k] || '').trim(); if (!title) return;
  const d = today(); const period = scope === 'month' ? monthKey(d) : weekStart(d);
  if (scope === 'month' && activeGoals('month', period).length >= 3) { toast('今月の目標は3つまで。'); return; }
  const id = uid(); const g = { id, title, scope, period, status: 'active', createdAt: Date.now() }; S.drafts[k] = ''; S.goalAddOpen = null; S.goals[id] = g; render(); putDoc('goals/' + id, g);
};
A.goalToggle = id => { const g = S.goals[id]; if (!g) return; S.goalMenu = null; const done = g.status !== 'done'; patchGoal(id, { status: done ? 'done' : 'active', doneAt: done ? Date.now() : null }); if (done) toast('目標を達成。星座がひとつ完成した。'); };
A.goalDelete = id => { const g = S.goals[id]; if (!g) return; S.goalMenu = null; delete S.goals[id]; render(); delDoc('goals/' + id); S.undo = () => { S.goals[id] = g; render(); putDoc('goals/' + id, g); }; toast('目標を消した。', true); };
A.bathToggle = () => { const d = S.night ? S.night.date : today(); const day = getDay(d); const on = !(day.habits && day.habits.bath); patchDay(d, { habits: { ...(day.habits || {}), bath: on, bathAt: on ? Date.now() : null } }); };
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
  const rows = days.map(d => { const day = getDay(d); const s = sleepAt(d), w = wakeAt(d); return `${d}: 気分${moodOf(d) ?? '-'} 体調${bodyOf(d) ?? '-'} モード${day.mode ? MODES[day.mode].label : '-'} 起きた${w ? hm(w) : '-'} 寝た${s ? hm(s) : '-'} ゲーム${pcGame(d)}分 空白時間${pcBlank(d)}分 記録${(day.entries || []).length}件 夜モード${day.close && day.close.done ? '済' : '-'} お風呂${day.habits && day.habits.bath ? '済' : '-'}`; }).join('\n');
  const tasksDone = Object.values(S.tasks).filter(t => t.status === 'done' && t.doneAt && days.includes(logicalDate(t.doneAt))).map(t => t.title).slice(0, 20).join(' / ') || 'なし';
  S.busy.rev = true; render();
  try {
    const text = await askText(`この期間の記録から気づいたことを3つ、箇条書き（「・」で始める）で。各45字以内。傾向を中心に（例: 寝るのが4時を過ぎた翌日は気分が低め）。データが少なければそう言う。責めない。本文だけ返して。\n日ごとの記録:\n${rows}\n終えたタスク: ${tasksDone}`, 'default', false);
    S.reviews[key] = { text: text.slice(0, 600), at: Date.now() }; render(); await putDoc('reviews/' + key, S.reviews[key]);
  } catch (e) { const m = claudeErr(e); if (m) toast(m); }
  finally { S.busy.rev = false; render(); }
};
// 設定
A.relogin = () => { if (window.daylogRelogin) window.daylogRelogin(); };
A.logout = () => { if (window.daylogLogout) window.daylogLogout(); };
A.toggleClaude = () => { patchSettings({ useClaude: S.settings.useClaude === false }); };
A.toggleSetting = k => { patchSettings({ [k]: !S.settings[k] }); schedulePCPush(); };
A.toggleCal = k => { patchSettings({ cals: { ...S.settings.cals, [k]: !(S.settings.cals[k] !== false) } }); S.events = {}; loadEvents(today(), true); };
A.setWake = v => { if (v) patchSettings({ wakeTime: v }); };
A.craftDay = i => { const n = Number(i); const cur = S.settings.craftDays || []; patchSettings({ craftDays: cur.includes(n) ? cur.filter(x => x !== n) : [...cur, n].sort() }); };
A.syncPC = () => syncPC();
A.pushPC = async () => { await pushPCConfig(true); toast(S.pcCfgErr ? 'PCに送れなかった。' : 'PCに設定を送った。'); };

// カレンダー
A.calMode = m => { const c = S.cal; if (m === 'week' && c.mode !== 'week' && monthKey(c.anchor) === monthKey(today())) c.anchor = today(); c.mode = m; c.sel = null; render(); loadCal(); };
A.calToday = () => { S.cal.anchor = today(); S.cal.sel = S.cal.mode === 'month' ? today() : null; render(); loadCal(); };
A.calMove = dir => { const c = S.cal; const n = Number(dir); if (c.mode === 'week') c.anchor = addDays(c.anchor, 7 * n); else { const [y, m] = c.anchor.split('-').map(Number); c.anchor = ymd(new Date(y, m - 1 + n, 1)); } c.sel = null; render(); loadCal(); };
A.calReload = () => loadCal(true);
A.calHide = k => { const h = { ...(S.settings.calHide || {}) }; h[k] = !h[k]; patchSettings({ calHide: h }); };
A.calSel = d => { S.cal.sel = S.cal.sel === d ? null : d; render(); };
A.calWeekOf = d => { S.cal.mode = 'week'; S.cal.anchor = d; S.cal.sel = null; render(); loadCal(); };
A.calNew = arg => {
  let d = today(), m = null;
  if (arg) { const [dd, mm] = String(arg).split('@'); d = dd; if (mm != null) m = Number(mm); }
  let start;
  if (m != null) start = new Date(dayStart(d).getTime() + m * 6e4);
  else if (d === today()) { start = new Date(); start.setMinutes(0, 0, 0); start.setHours(start.getHours() + 1); }
  else start = new Date(dayStart(d).getTime() + 4 * 3600e3);
  const end = new Date(start.getTime() + 3600e3);
  S.calSheet = { mode: 'new', allDay: false, editable: true };
  Object.assign(S.drafts, { 'cs-title': '', 'cs-cal': 'app', 'cs-sd': ymd(start), 'cs-st': hm(start), 'cs-ed': ymd(end), 'cs-et': hm(end), 'cs-rem': '10' });
  render(); setTimeout(() => { const el = $('#cs-title'); if (el) el.focus(); }, 60);
};
A.calOpen = arg => {
  const i = String(arg).indexOf('|'); const cal = arg.slice(0, i), id = arg.slice(i + 1);
  const e = findEvent(cal, id); if (!e) { toast('予定が見つからなかった。再読み込みしてみて。'); return; }
  S.calSheet = { mode: 'edit', id, cal, rec: !!e.rec, editable: calEditable(cal), title: e.title, allDay: !!e.allDay, wasAllDay: !!e.allDay };
  if (e.allDay) Object.assign(S.drafts, { 'cs-title': e.title, 'cs-sd': e.sd, 'cs-ed': addDays(e.ed, -1) < e.sd ? e.sd : addDays(e.ed, -1), 'cs-st': '10:00', 'cs-et': '11:00' });
  else Object.assign(S.drafts, { 'cs-title': e.title, 'cs-sd': ymd(new Date(e.start)), 'cs-st': hm(e.start), 'cs-ed': ymd(new Date(e.end)), 'cs-et': hm(e.end) });
  render();
};
A.csClose = () => { S.calSheet = null; render(); };
A.csKeep = () => { if (S.calSheet) { S.calSheet.confirmDel = false; render(); } };
A.csAllDay = (v, el) => { if (S.calSheet) { S.calSheet.allDay = !!el.checked; render(); } };
function csFail(msg) { S.calSheet.err = msg; S.calSheet.saving = false; render(); }
function calWriteErr(e) { return e && e.code === 'tool_error' ? 'Googleカレンダーに断られた。自分が作っていない予定（招待された予定など）は変えられないことがある。' : calErr(e); }
function afterCalWrite() { try { if (S.mcp.invalidate) S.mcp.invalidate(CFG.GCAL).catch(() => {}); } catch (_) {} S.calCache = {}; S.events = {}; render(); loadCal(true); loadEvents(today(), true); }
A.csSave = async () => {
  const s = S.calSheet; if (!s || s.saving || !S.mcp) return; const g = k => (S.drafts[k] != null ? String(S.drafts[k]) : '');
  const title = g('cs-title').trim() || '（タイトルなし）';
  const cal = s.mode === 'new' ? (g('cs-cal') || 'app') : s.cal; const c = calOf(cal);
  let startTime, endTime;
  const sd = g('cs-sd'); let ed = g('cs-ed') || sd;
  if (!sd) return csFail('始まりの日を入れてほしい。');
  if (s.allDay) {
    if (ed < sd) return csFail('終わりの日が始まりより前になっている。');
    startTime = sd + 'T00:00:00'; endTime = addDays(ed, 1) + 'T00:00:00';
  } else {
    const st = g('cs-st'), et = g('cs-et'); if (!st || !et) return csFail('時刻を入れてほしい。');
    if (`${ed}T${et}` <= `${sd}T${st}`) { if (ed === sd) ed = addDays(sd, 1); else return csFail('終わりが始まりより前になっている。'); }
    startTime = `${sd}T${st}:00`; endTime = `${ed}T${et}:00`;
  }
  s.saving = true; s.err = null; render();
  try {
    if (s.mode === 'new') {
      const input = { calendarId: c.id, summary: title, startTime, endTime };
      if (s.allDay) input.allDay = true;
      const rem = g('cs-rem') || '10';
      if (rem === 'default') input.useDefaultReminders = true; else if (rem === 'none') input.useDefaultReminders = false; else input.overrideReminders = [{ method: 'popup', minutes: Number(rem) }];
      await S.mcp.callTool(CFG.GCAL, 'create_event', input);
      toast(`${c.name}に予定を入れた。`);
    } else {
      const input = { calendarId: c.id, eventId: s.id, summary: title, startTime, endTime };
      if (s.allDay) input.allDay = true; else if (s.wasAllDay) input.allDay = false;
      await S.mcp.callTool(CFG.GCAL, 'update_event', input);
      toast('予定を変えた。');
    }
    S.calSheet = null; afterCalWrite();
  } catch (e) { csFail(calWriteErr(e)); }
};
A.csDelete = async () => {
  const s = S.calSheet; if (!s || s.saving || !S.mcp) return;
  if (!s.confirmDel) { s.confirmDel = true; render(); return; }
  s.saving = true; s.err = null; render();
  try { await S.mcp.callTool(CFG.GCAL, 'delete_event', { calendarId: calOf(s.cal).id, eventId: s.id }); S.calSheet = null; toast('予定を消した。'); afterCalWrite(); }
  catch (e) { csFail(calWriteErr(e)); }
};
// シート
A.showGoals = () => { S.sheet = { kind: 'first' }; render(); };
A.closeSheet = () => { S.sheet = null; render(); };
A.sheetGoGoals = () => { S.sheet = null; A.go('tasks'); };
A.okaeriSave = () => { const text = (S.drafts['okaeri-text'] || '').trim(); if (text) { const d = today(); const day = getDay(d); patchDay(d, { entries: [...(day.entries || []), { id: uid(), t: Date.now(), text }] }); } S.drafts['okaeri-text'] = ''; S.sheet = null; render(); };

// 夜モード
A.openNight = () => {
  const now = new Date(); const d = today(); const y = addDays(d, -1);
  if (now.getHours() >= 6 && now.getHours() < 12 && !(getDay(y).close && getDay(y).close.done) && ((getDay(y).entries || []).length || getDay(y).mode)) { S.sheet = { kind: 'which' }; render(); return; }
  startNight(d);
};
A.nightFor = d => { S.sheet = null; startNight(d); };
function startNight(d) {
  const day = getDay(d); const c = day.close || {};
  S.night = { date: d, step: 0, mood: c.mood || 0, body: c.body || 0, text: c.text || '', plan: (day.plan || []).filter(p => !p.eventId), sent: {}, wake: S.settings.wakeTime || '10:00', meds: !!day.meds, comment: c.comment || '', name: c.name || '' };
  S.drafts['night-text'] = c.text || '';
  render(); loadEvents(addDays(d, 1));
}
A.nightClose = () => { if (S.night && S.night.morning) { S.night = null; render(); return; } saveNightPartial(); S.night = null; render(); };
A.nightBack = () => { const n = S.night; n.step = Math.max(0, n.step - 1); if (n.step === 1 && getDay(n.date).mode === 'rest') n.step = 0; render(); };
A.nightScore = arg => { const [k, v] = arg.split(':'); S.night[k] = S.night[k] === Number(v) ? 0 : Number(v); render(); };
function saveNightPartial() {
  const n = S.night; if (!n) return; const day = getDay(n.date);
  const text = (S.drafts['night-text'] != null ? S.drafts['night-text'] : n.text || '').trim(); n.text = text;
  const close = clean({ ...(day.close || {}), mood: n.mood || moodAvg(n.date, 'mood') || undefined, body: n.body || moodAvg(n.date, 'body') || undefined, text: text || undefined });
  return patchDay(n.date, { close, meds: !!n.meds });
}
function moodAvg(d, k) { const v = (getDay(d).entries || []).map(e => e[k]).filter(Boolean); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0; }
A.nightNext = () => {
  const n = S.night;
  if (n.step === 0) saveNightPartial();
  if (n.step === 2 && n.plan.length && !n.check && !S.busy.check) {
    if (claudeReady()) { A.planCheck(true); return; }
    n.check = localPlanCheck(n); if (!n.check.ok) { render(); return; }
  }
  if (n.step === 4) saveNightPartial();
  if (n.step === 4 && !claudeReady()) { n.step = 6; render(); return; }
  if (n.morning && n.step === 3) { finishMorning(); return; }
  n.step++;
  if (n.step === 1 && getDay(n.date).mode === 'rest') n.step = 2;
  if (n.step === 5 && !n.comment) nightComment();
  render();
};
A.nightQuick = () => { saveNightPartial(); S.night.step = 4; render(); };
A.planAdd = id => {
  const t = S.tasks[id]; if (!t) return; const n = S.night;
  n.plan.push({ id: uid(), taskId: id, title: t.title, start: nextSlot(), minutes: (WEIGHTS[t.weight] && WEIGHTS[t.weight].min) || t.minutes || 60 }); n.check = null; render();
};
A.planFree = () => { const title = (S.drafts['plan-free'] || '').trim(); if (!title) return; S.drafts['plan-free'] = ''; S.night.plan.push({ id: uid(), title, start: nextSlot(), minutes: 60 }); S.night.check = null; render(); };
A.planDel = id => { S.night.plan = S.night.plan.filter(p => p.id !== id); S.night.check = null; render(); };
A.planTime = (v, el) => { const p = S.night.plan.find(x => x.id === el.dataset.arg); if (p && v) { p.start = v; S.night.check = null; render(); } };
A.planMin = (v, el) => { const p = S.night.plan.find(x => x.id === el.dataset.arg); if (p) { p.minutes = Number(v); S.night.check = null; render(); } };
function nextSlot() {
  const n = S.night; const tm = addDays(n.date, 1);
  let t = n.morning ? Date.now() + 15 * 6e4 : slotDate(tm, n.wake || '10:00').getTime() + 60 * 6e4;
  for (const p of n.plan) { const e = slotDate(tm, p.start).getTime() + p.minutes * 6e4; if (e > t) t = e; }
  const d = new Date(t); const m = Math.ceil(d.getMinutes() / 15) * 15; d.setMinutes(m, 0, 0);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localPlanCheck(n) {
  const tm = addDays(n.date, 1); const notes = [];
  const items = n.plan.map(p => { const s0 = slotDate(tm, p.start).getTime(); return { t: p.title, s: s0, e: s0 + p.minutes * 6e4, p }; }).sort((a, b) => a.s - b.s);
  const evs = ((S.events[tm] && S.events[tm].list) || []).filter(e => !e.allDay).map(e => ({ t: e.title, s: e.start, e: e.end }));
  const clash = [];
  items.forEach((a, i) => { [...items.slice(i + 1), ...evs].forEach(b => { if (a.s < b.e && b.s < a.e) clash.push(`「${a.t}」と「${b.t}」`); }); });
  if (clash.length) notes.push(`${clash.slice(0, 2).join('、')}の時間が重なっている。`);
  const wake = slotDate(tm, n.wake).getTime(); const early = items.filter(x => x.s < wake);
  if (early.length) notes.push(n.morning ? `「${early[0].t}」がもう過ぎた時刻（${n.wake}より前）になっている。` : `「${early[0].t}」が起きる予定（${n.wake}）より前になっている。`);
  const total = items.reduce((a, x) => a + (x.e - x.s) / 6e4, 0); const mode = getDay(n.date).mode;
  const limit = mode === 'bad' || mode === 'rest' ? 180 : 360;
  if (total > limit) notes.push(`入れる予定が合わせて${fmtMin(total)}。${mode === 'bad' || mode === 'rest' ? '今日の調子だと' : ''}少し多いかも。`);
  const heavy = n.plan.filter(p => p.taskId && S.tasks[p.taskId] && S.tasks[p.taskId].weight === 'heavy').length;
  if (heavy >= 2) notes.push(`重いタスクが${heavy}つ。1つにすると楽になる。`);
  return { ok: !notes.length, note: notes.length ? notes.join('\n') : 'ちょうどよさそう。重なりもない。', local: true };
}
A.planCheck = async advanceAfter => {
  if (!claudeReady()) { S.night.check = localPlanCheck(S.night); render(); return; }
  const n = S.night; const tm = addDays(n.date, 1); S.busy.check = true; render();
  const plan = [...n.plan].sort((a, b) => slotDate(tm, a.start) - slotDate(tm, b.start)).map(p => `${p.start} ${p.minutes}分 ${p.title}`).join('\n');
  const evs = ((S.events[tm] && S.events[tm].list) || []).filter(e => !e.allDay).map(e => `${hm(e.start)}〜${hm(e.end)} ${e.title}`).join('\n') || 'なし';
  try {
    const r = await askJSON(`明日の予定が詰め込みすぎか見て。今日の体調モード: ${getDay(n.date).mode ? MODES[getDay(n.date).mode].label : '未設定'}。明日起きる予定: ${n.wake}。\n入れる予定:\n${plan}\nもともと入っている予定:\n${evs}\nJSONだけで返して: {"ok":true か false,"note":"1〜2文、70字以内。詰め込みすぎなら何を外すか具体的に。ちょうどいいならそう言う"}`, 'quick', false);
    n.check = { ok: !!(r && r.ok), note: String((r && r.note) || 'ちょうどよさそう。').slice(0, 140) };
  } catch (e) { const m = claudeErr(e); n.check = localPlanCheck(n); if (m) toast(m); }
  finally { S.busy.check = false; render(); }
};
A.nightWake = v => { if (v) { S.night.wake = v; render(); } };
A.nightSend = async () => {
  const n = S.night; if (n.sending) return; const tm = addDays(n.date, 1);
  n.sending = true; n.sendErr = null; render();
  const day = getDay(n.date); const planSaved = [...(day.plan || []).filter(p => p.eventId)];
  let failed = 0;
  for (const p of n.plan) {
    if (n.sent[p.id] === 'ok') continue;
    n.sent[p.id] = 'run'; render();
    const start = slotDate(tm, p.start); const end = new Date(start.getTime() + p.minutes * 6e4);
    try { const id = await createEvent({ summary: p.title, start, end, reminder: 15 }); n.sent[p.id] = 'ok'; planSaved.push({ ...p, eventId: id || 'unknown', date: tm }); if (p.taskId && S.tasks[p.taskId]) patchTask(p.taskId, { plannedDate: tm }); }
    catch (e) { n.sent[p.id] = 'ng'; failed++; n.sendErr = calErr(e); }
  }
  if (n.sent.wake !== 'ok') {
    n.sent.wake = 'run'; render();
    const start = slotDate(tm, n.wake); const end = new Date(start.getTime() + 15 * 6e4);
    try { const id = await createEvent({ summary: '☀ 起きる', start, end, reminder: 0, description: 'Daylogの起きる予定' }); n.sent.wake = 'ok'; await patchDay(tm, { wakePlan: { time: n.wake, eventId: id || 'unknown' } }); }
    catch (e) { n.sent.wake = 'ng'; failed++; n.sendErr = calErr(e); }
  }
  await patchDay(n.date, { plan: planSaved });
  n.sending = false; n.sentDone = failed === 0; if (failed) n.sendErr = (n.sendErr || '') + ' 失敗したものだけもう一度送れる。';
  render(); loadEvents(tm, true);
};
A.nightSkipSend = () => {
  const n = S.night; const tm = addDays(n.date, 1);
  n.plan.forEach(p => { if (p.taskId && S.tasks[p.taskId]) patchTask(p.taskId, { plannedDate: tm }); });
  patchDay(n.date, { plan: [...(getDay(n.date).plan || []).filter(p => p.eventId), ...n.plan.map(p => ({ ...p, date: tm }))] });
  if (n.morning) { finishMorning(); return; }
  n.step = 4; render();
};
A.nightMeds = () => { S.night.meds = !S.night.meds; render(); };
A.nightComment = () => nightComment(true);
async function nightComment(manual) {
  const n = S.night; if (!claudeReady()) return; const d = n.date; const day = getDay(d);
  S.busy.close = true; n.commentErr = null; render();
  const doneT = Object.values(S.tasks).filter(t => t.status === 'done' && t.doneAt && logicalDate(t.doneAt) === d).map(t => t.title).join(' / ') || 'なし';
  try {
    const r = await askJSON(`今日の締めに一言返して。2〜3文、90字以内。いいところがあれば具体的に拾う。落ち込んでいる日は、そのままでいいと伝える。\nそれと、今日の星座に、ファンタジーの物語や古い神話に出てきそうな名前を付けて。今日の出来事をそのまま書かず、魔法・伝承・遠い国の言葉に置き換える（雰囲気の例：建築をした日→石積みの竪琴座、寝坊した日→眠れる時計塔座、ゲームの日→銀の弓の狩人座。例そのものは使わない）。「〇〇座」の形で、座を含めて14字以内。ゆるさや冗談は入れず、少しだけ物語の匂いがする響きにする。\n` +
      `データ:\n- 体調モード: ${day.mode ? MODES[day.mode].label : '未設定'}\n- 気分 ${n.mood || '-'} / 体調 ${n.body || '-'}（5段階）\n- 締めのメモ: ${n.text || 'なし'}\n- 今日の記録:\n${entriesText(d)}\n- 終えたタスク: ${doneT}\n- お風呂: ${day.habits && day.habits.bath ? 'できた' : '記録なし'}\n` +
      `JSONだけで返して: {"comment":"...","name":"〇〇座"}`, 'default', manual ? false : undefined);
    n.comment = String((r && r.comment) || '').slice(0, 200); n.name = String((r && r.name) || '').slice(0, 24);
    await patchDay(d, { close: { ...(getDay(d).close || {}), comment: n.comment, name: n.name } });
  } catch (e) { n.commentErr = claudeErr(e) || 'Claudeの一言はなしで進める。'; }
  finally { S.busy.close = false; render(); }
}
A.nightFinish = async () => {
  const n = S.night; const d = n.date; const now = Date.now();
  if (!n.name) n.name = fantasyName(d);
  const close = { ...(getDay(d).close || {}), done: true, at: now, comment: n.comment || undefined, name: n.name || undefined };
  await patchDay(d, { close: clean(close), sleepAt: now, meds: !!n.meds });
  S.night = null; render(); toast('おやすみ。今日の星座が空に昇った。');
  recordBedActual(d, now);
};
// 夜モードを終えた時刻を「実際に寝た時刻」として記録する。
// .｡oOの「🌙 就寝の目安」はその時刻へ動かして「🌙 就寝」にする（予定がなければ記録として1つ作る）
const BED_DONE_TITLE = '🌙 就寝';
async function recordBedActual(d, at) {
  const bt = getDay(d).bedtime || {};
  await patchDay(d, { bedtime: { ...bt, actual: at } });
  pushPCConfig();
  if (!S.mcp || !canWrite()) return;
  const start = new Date(at), end = new Date(at + 15 * 6e4);
  const desc = `Daylogの就寝記録（夜モードを終えた時刻）${bt.time ? `。目安は${bt.time}` : ''}`;
  try {
    let id = bt.eventId && bt.eventId !== 'unknown' ? bt.eventId : null;
    if (!id) { const found = await findBedEvents(d); id = found && found[0] || null; }
    if (id) { try { await updateEvent(id, { summary: BED_DONE_TITLE, startTime: isoLocal(start), endTime: isoLocal(end), description: desc, overrideReminders: [], useDefaultReminders: false }); } catch (_) { id = null; } }
    if (!id) id = await createEvent({ summary: BED_DONE_TITLE, start, end, reminder: null, description: desc });
    await patchDay(d, { bedtime: { ...getDay(d).bedtime, actual: at, eventId: id || 'unknown', eventTime: hm(at), recorded: true } });
  } catch (e) { toast('就寝の記録はDaylogに残した。' + calWriteErr(e)); }
  loadEvents(d, true);
}

/* ───────── イベント配線 ───────── */
document.addEventListener('click', e => {
  if (e.target.closest('#sky')) { skyClick(e); return; }
  if (e.target.classList && e.target.classList.contains('wk-col')) { const col = e.target; const y = e.clientY - col.getBoundingClientRect().top; A.calNew(col.dataset.day + '@' + Math.max(0, Math.floor(y / H_PX * 2) * 30)); return; }
  const el = e.target.closest('[data-act]'); if (!el) return;
  const f = A[el.dataset.act]; if (f) { e.preventDefault(); f(el.dataset.arg, el, e); }
});
// 入力欄は、触る・打ち始めるまで1行だけ。空のまま離れたら小さく戻る
function compSync() { const c = $('#composer'), ta = $('#composer-text'); if (!c || !ta) return; const active = c.contains(document.activeElement) || ta.value.trim() || S.comp.mood || S.comp.body || S.comp.nap; c.classList.toggle('compact', !active); }
document.addEventListener('focusin', e => { if (e.target.closest && e.target.closest('#composer')) compSync(); });
document.addEventListener('focusout', () => setTimeout(compSync, 120));
// タスクを足す欄：触れたら開き、何も書かずに外へ出たら閉じる
let taskAddTouch = 0;
document.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('.taskadd')) taskAddTouch = Date.now(); }, true);
document.addEventListener('focusin', e => { const box = e.target.closest && e.target.closest('.taskadd'); if (box) { S.taskAddOpen = true; box.classList.add('open'); } });
document.addEventListener('focusout', e => {
  if (!(e.target.closest && e.target.closest('.taskadd'))) return;
  setTimeout(() => {
    const box = $('.taskadd'); if (!box || box.contains(document.activeElement) || Date.now() - taskAddTouch < 400) return;
    if (String(S.drafts['task-title'] || '').trim() || S.drafts['task-w'] || S.drafts['task-dl'] || S.drafts['task-goal']) return;
    S.taskAddOpen = false; box.classList.remove('open');
  }, 150);
});
document.addEventListener('input', e => {
  const el = e.target; if (el.id && el.hasAttribute('data-draft')) S.drafts[el.id] = el.value;
  if (el.id === 'task-title') { const box = el.closest('.taskadd'); if (box) box.classList.toggle('open', !!el.value.trim()); }
  if (el.id === 'composer-text') { el.style.height = 'auto'; el.style.height = Math.min(120, el.scrollHeight) + 'px'; }
});
document.addEventListener('change', e => {
  const el = e.target; if (el.id && el.hasAttribute('data-draft')) S.drafts[el.id] = el.value;
  const f = el.dataset.onchg && A[el.dataset.onchg]; if (f) f(el.value, el, e);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
  const el = e.target;
  if (el.id === 'composer-text' && !e.shiftKey) { e.preventDefault(); A.sendEntry(); return; }
  const k = el.dataset && el.dataset.enter; if (k && A[k]) { e.preventDefault(); A[k](el.dataset.arg, el, e); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (S.calSheet) { S.calSheet = null; render(); } else if (S.sheet) { S.sheet = null; render(); } else if (S.view === 'settings' && !S.night) A.goBack(); } });
document.addEventListener('toggle', e => { const el = e.target; if (el.dataset && el.dataset.fold) S[el.dataset.fold] = el.open; }, true);
const tip = $('#tip');
function placeTip(x0, y0) { const x = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, x0 + 12)); tip.style.left = x + 'px'; tip.style.top = Math.max(8, y0 - tip.offsetHeight - 10) + 'px'; }
// マウスは乗せただけで、指はタップで出す（もう一度タップするかほかをタップで消す）
let tipFrom = null;
document.addEventListener('pointerover', e => { if (e.pointerType !== 'mouse') return; const el = e.target.closest('[data-tip]'); if (!el) { tip.hidden = true; return; } tip.textContent = el.dataset.tip; tip.hidden = false; placeTip(e.clientX, e.clientY); });
document.addEventListener('pointerup', e => { if (e.pointerType === 'mouse') return; const el = e.target.closest('[data-tip]'); if (!el || (tipFrom === el && !tip.hidden)) { tip.hidden = true; tipFrom = null; return; } tipFrom = el; tip.textContent = el.dataset.tip; tip.hidden = false; placeTip(e.clientX, e.clientY); });
document.addEventListener('scroll', () => { tip.hidden = true; }, true);
document.addEventListener('pointermove', e => { if (tip.hidden || e.pointerType !== 'mouse') return; const x = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 12); tip.style.left = x + 'px'; tip.style.top = Math.max(8, e.clientY - tip.offsetHeight - 10) + 'px'; });
document.documentElement.addEventListener('mouseleave', () => { tip.hidden = true; });
let rzT = 0; window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { if (S.view === 'sky') drawSky(); render(); }, 150); });

/* ───────── 起動 ───────── */
function markLoaded(k) { S.loaded[k] = true; if (S.loadFailed) return; if (!S.ready && S.loaded.settings && S.loaded.days && S.loaded.tasks && S.loaded.goals) { S.ready = true; onReady(); } render(); }
function onReady() { runDaily(); loadEvents(today()); syncPC(); }
// 昨夜、今日の予定を入れていない（夜モードで送っていない）か
function needsMorningPlan(d) {
  const y = addDays(d, -1); const yd = getDay(y); const day = getDay(d);
  if (day.morningPlan) return false; // 入れた・今日はなしにした
  const planned = (yd.plan || []).some(p => p.date === d) || !!day.wakePlan;
  return !planned;
}
function startMorning(d, adhoc) {
  const y = addDays(d, -1); const now = new Date(Date.now() + 15 * 6e4);
  S.sheet = null;
  S.night = { morning: true, adhoc: !!adhoc, date: y, step: 2, mood: 0, body: 0, text: '', plan: [], sent: { wake: 'ok' }, wake: `${pad(now.getHours())}:${pad(now.getMinutes())}`, meds: false, comment: '', name: '' };
  render(); loadEvents(d);
}
A.morningPlan = () => startMorning(today());
A.todayPlan = () => startMorning(today(), true);
A.morningSkip = () => { const d = today(); patchDay(d, { morningPlan: { skipped: true, at: Date.now() } }); S.night = null; render(); };
function finishMorning() { const d = today(); const n = S.night; if (!getDay(d).morningPlan) patchDay(d, { morningPlan: { done: true, at: Date.now(), count: (n && n.plan.length) || 0 } }); S.night = null; render(); loadEvents(d, true); toast('今日の予定に入れた。'); }
function runDaily() {
  const d = today(); if (S.dailyDone === d) return; S.dailyDone = d;
  // 3日たった予定のタスクを保留箱へ
  for (const t of openTasks()) if (t.plannedDate && diffDays(t.plannedDate, d) >= 3) patchTask(t.id, { status: 'held', heldAt: Date.now() });
  const lastOpen = S.settings.lastOpenDay;
  if (lastOpen !== d) {
    if (!lastOpen) S.sheet = { kind: 'welcome' };
    else if (S.settings.okaeri && diffDays(lastOpen, d) >= 3) S.sheet = { kind: 'okaeri', gap: diffDays(lastOpen, d) };
    else if (needsMorningPlan(d)) setTimeout(() => { if (!S.night && !S.sheet) startMorning(d); }, 600);
    else S.sheet = { kind: 'first' };
    patchSettings({ lastOpenDay: d, lastOpenAt: Date.now() });
  }
  if (S.sample) maybeBed();
}
setInterval(() => {
  const d = today();
  if (d !== S.lastDay) { S.lastDay = d; S.sky.day = d; if (S.ready) { runDaily(); loadEvents(d); } }
  remindSoon();
  render();
}, 60000);
const reminded = new Set();
function remindSoon() {
  const now = Date.now();
  for (const k of [today(), addDays(today(), 1)]) for (const e of ((S.events[k] && S.events[k].list) || [])) {
    if (e.allDay || reminded.has(e.cal + e.id + e.start)) continue;
    const m = (e.start - now) / 6e4;
    if (m > 0 && m <= 10) { reminded.add(e.cal + e.id + e.start); S.toast = { msg: `${Math.ceil(m)}分後に「${e.title}」が始まる（${hm(e.start)}）`, id: uid() }; const id = S.toast.id; setTimeout(() => { if (S.toast && S.toast.id === id) { S.toast = null; render(); } }, 5 * 60000); }
  }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.ready) { const d = today(); if (d !== S.lastDay) { S.lastDay = d; runDaily(); } loadEvents(d); } });

// 開いている間は、5分ごとにPCのゲーム時間などを取り直す
setInterval(() => { if (S.ready && S.pcStatus !== 'none' && document.visibilityState === 'visible') syncPC(); }, 5 * 60000);
function subscribe(path, key, toMap, opts = {}) {
  let q = S.db.collection(path); if (opts.where) q = q.where(...opts.where);
  q.onSnapshot(snap => {
    const m = {}; snap.docs.forEach(doc => { const v = doc.data(); if (v) m[doc.id] = toMap ? toMap(doc.id, v) : v; });
    // あとから読み込んだ古い日（読み込み範囲より前）は消さずに残す
    if (opts.keepBefore) for (const [id, v] of Object.entries(S[key] || {})) if (id < opts.keepBefore && !(id in m)) m[id] = v;
    S[key] = m; markLoaded(key);
  }, err => loadErr(key, err));
}
// 最初の読み込みに失敗したとき：空の状態で始めると「毎回体調を聞かれる・記録が消える・就寝目安が増える」が起きるので、止めて知らせる
function loadErr(key, err) {
  if (err && err.code === 'revoked') { S.fatal = 'ログインが切れた。開き直してほしい。'; render(); return; }
  if (S.loaded[key]) { toast('記録の一部を読めなかった。開き直すと戻ることがある。'); render(); return; }
  S.loadFailed = true; S.ready = false;
  S.fatal = '記録を読み込めなかった。今の記録は消えていない（読み込めるまで何も書き込まない）。少し待ってもう一度読み込んでほしい。';
  console.error('Daylog load failed', key, err); render();
}
async function boot() {
  render();
  if (!window.claude || typeof window.claude.use !== 'function') { S.fatal = 'Daylogを読み込めなかった。開き直してほしい。'; render(); return; }
  const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
  S.user = user;
  if (!db) { S.fatal = '記録の保存先につながらなかった。開き直してほしい。'; render(); return; }
  S.owner = user ? await user.isOwner().catch(() => false) : false;
  if (!S.owner) { S.fatal = 'Daylogは持ち主だけが使える個人用のページ。'; render(); return; }
  S.db = db;
  window.claude.use('mcp').then(m => { S.mcp = m; if (S.ready) { loadEvents(today()); syncPC(); } render(); });
  db.doc('settings/main').onSnapshot(snap => { const v = snap.exists ? snap.data() : null; S.settings = { ...DEFAULTS, ...(v || {}), cals: { ...DEFAULTS.cals, ...((v && v.cals) || {}) } }; markLoaded('settings'); }, err => loadErr('settings', err));
  const cutoff = addDays(today(), -400); S.oldFrom = cutoff;
  subscribe('days', 'days', null, { where: ['date', '>=', cutoff], keepBefore: cutoff });
  subscribe('tasks', 'tasks');
  subscribe('goals', 'goals');
  subscribe('memos', 'memos');
  subscribe('pc', 'pc', null, { where: ['date', '>=', cutoff], keepBefore: cutoff });
  subscribe('reviews', 'reviews');
  subscribe('notify', 'notify', null, { where: ['day', '>=', addDays(logicalDate(), -3)] });
  subscribe('meta', 'meta');
}
boot();
})();
