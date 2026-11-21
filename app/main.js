// Daylog 本体の部品：イベントの配線（押す・書く・キー）と起動
// ・読み込む順は app/parts.json。全部を1つにつないで、1つの関数の中で動かす（boot.js／tools/build_claude.py）

/* ───────── イベント配線 ───────── */
document.addEventListener('click', e => {
  if (e.target.closest('#sky')) { skyClick(e); return; }
  if (e.target.classList && e.target.classList.contains('wk-col')) { const col = e.target; const y = e.clientY - col.getBoundingClientRect().top; A.calNew(col.dataset.day + '@' + Math.max(0, Math.floor(y / H_PX * 2) * 30)); return; }
  const el = e.target.closest('[data-act]'); if (!el) return;
  lastTap = { act: el.dataset.act, arg: el.dataset.arg, at: Date.now() };
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
  if (el.id === 'memo-q') render();
  if (el.id === 'tm-purpose') { const b = $('#tm-start'); if (b) b.setAttribute('aria-disabled', String(!el.value.trim())); const hn = $('#tm-need'); if (hn) hn.hidden = !!el.value.trim(); }
  if (el.id === 'task-title') { const box = el.closest('.taskadd'); if (box) box.classList.toggle('open', !!el.value.trim()); }
  if (el.id === 'composer-text') { el.style.height = 'auto'; el.style.height = Math.min(120, el.scrollHeight) + 'px'; }
  if (el.classList && el.classList.contains('autosize')) autosize(el);
});
document.addEventListener('change', e => {
  const el = e.target; if (el.id && el.hasAttribute('data-draft')) S.drafts[el.id] = el.value;
  const f = el.dataset.onchg && A[el.dataset.onchg]; if (f) f(el.value, el, e);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
  const el = e.target;
  if (el.id === 'composer-text' && !e.shiftKey) { e.preventDefault(); A.sendEntry(); return; }
  // メモは Enter で改行。Ctrl（Macは⌘）＋Enter で置く・保存
  if (el.id === 'memo-text' || el.id === 'memo-edit') { if (e.ctrlKey || e.metaKey) { e.preventDefault(); if (el.id === 'memo-text') A.memoAdd(); else if (S.editMemo) A.memoSave(S.editMemo); } return; }
  const k = el.dataset && el.dataset.enter; if (k && A[k]) { e.preventDefault(); A[k](el.dataset.arg, el, e); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (S.timerOpen) A.timerClose(); else if (S.view === 'memos' && S.nOpen) A.noteClose(); else if (S.calSheet) { S.calSheet = null; render(); } else if (S.sheet) { S.sheet = null; render(); } else if (S.view === 'settings' && !S.night) A.goBack(); } });
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
    if (opts.keepLocal) for (const [id, v] of Object.entries(S[key] || {})) if (v && v.local && !(id in m)) m[id] = v; // まだ送っていない新しいノート
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
  subscribe('notes', 'notes', null, { keepLocal: true });
  subscribe('nfolders', 'nfolders');
  subscribe('pc', 'pc', null, { where: ['date', '>=', cutoff], keepBefore: cutoff });
  subscribe('reviews', 'reviews');
  subscribe('notify', 'notify', null, { where: ['day', '>=', addDays(logicalDate(), -3)] });
  subscribe('meta', 'meta');
  if (window.DaylogStore && window.DaylogStore.errors) window.DaylogStore.errors.context({ view: () => S.view + (S.view === 'memos' && S.nOpen ? '/note' : '') });
  // 起動が落ち着いてから、銀河の部品を裏で読んでおく（星空タブを開いたときに待たせない）
  setTimeout(() => (window.requestIdleCallback || (f => setTimeout(f, 1)))(() => loadGalaxy()), 5000);
}
boot();
