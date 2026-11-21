// Daylog 本体の部品：ドラッグの仕組み（押す→動かす→離す。タスクの並べかえと予定を動かすときの共通部分）
// ・読み込む順は app/parts.json。全部を1つにつないで、1つの関数の中で動かす（boot.js／tools/build_claude.py）

/* ── ドラッグの中身 ── */
const SNAP = 15; // 分きざみ
let dragNoClick = 0;
document.addEventListener('click', e => { if (Date.now() - dragNoClick < 450) { e.stopPropagation(); e.preventDefault(); } }, true);
document.addEventListener('touchmove', e => { if (DRAG.on) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', e => { if (DRAG.on || (DRAG.st && DRAG.st.type !== 'mouse')) e.preventDefault(); });
const scroller = () => document.body.scrollHeight > document.body.clientHeight ? document.body : (document.scrollingElement || document.documentElement);
document.addEventListener('pointerdown', e => {
  if (e.button !== 0 || DRAG.st || S.calSheet || S.timerOpen) return;
  const task = e.target.closest('li.task[data-sort]'), ev = !task && e.target.closest('[data-drag]');
  if (!task && !ev) return;
  const handle = e.target.closest('.grip, .rz');
  if (task && !handle && e.target.closest('.check, .steps, .row, input, select, textarea, .gmenu, a')) return;
  if (ev && !handle && ev.tagName === 'LI' && !e.target.closest('.ev-head, time')) return;
  if (ev && e.target.closest('.evmore, .evmenu')) return;
  const kind = task ? 'task' : e.target.closest('.rz-t') ? 'start' : e.target.closest('.rz-b') ? 'end' : 'move';
  const st = DRAG.st = { kind, el: task || ev, pid: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, started: false, timer: 0, handle: !!handle };
  if (handle && e.pointerType !== 'mouse') { e.preventDefault(); dragBegin(st); }
  else if (e.pointerType !== 'mouse') st.timer = setTimeout(() => { if (DRAG.st === st && !st.started) dragBegin(st); }, 350);
}, true);
document.addEventListener('pointermove', e => {
  const st = DRAG.st; if (!st || e.pointerId !== st.pid) return;
  st.x = e.clientX; st.y = e.clientY;
  const dist = Math.hypot(st.x - st.x0, st.y - st.y0);
  if (!st.started) {
    if (st.type === 'mouse' ? dist > 5 : false) dragBegin(st);
    else if (st.type !== 'mouse' && dist > 9) { clearTimeout(st.timer); DRAG.st = null; } // 長押しの前に動いた＝スクロール
    return;
  }
  e.preventDefault(); dragMove(st);
}, { passive: false });
const dragStop = e => { const st = DRAG.st; if (!st || (e && e.pointerId !== st.pid)) return; clearTimeout(st.timer); DRAG.st = null; if (st.started) dragFinish(st, e && e.type === 'pointercancel'); };
document.addEventListener('pointerup', dragStop); document.addEventListener('pointercancel', dragStop);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && DRAG.st && DRAG.st.started) { const st = DRAG.st; DRAG.st = null; dragFinish(st, true); } });

function dragBegin(st) {
  st.started = true; DRAG.on = true; clearTimeout(st.timer);
  document.documentElement.classList.add('dragging');
  try { if (navigator.vibrate) navigator.vibrate(8); } catch (_) {}
  try { getSelection().removeAllRanges(); } catch (_) {}
  const el = st.el; el.classList.add('lifted');
  if (st.kind === 'task') {
    st.rows = [...el.parentElement.querySelectorAll(':scope > li.task[data-sort]')];
    st.rects = st.rows.map(r => r.getBoundingClientRect()); st.i0 = st.rows.indexOf(el); st.to = st.i0;
    st.gap = st.rows.length > 1 ? st.rects[1].top - st.rects[0].bottom : 8; st.h = st.rects[st.i0].height + st.gap;
    st.sc = scroller(); st.scroll0 = st.sc.scrollTop;
  } else {
    st.s0 = Number(el.dataset.s); st.e0 = Number(el.dataset.e); st.ns = st.s0; st.ne = st.e0;
    st.wk = el.classList.contains('wk-ev');
    if (st.wk) {
      st.sc = $('#wk-scroll'); st.scroll0 = st.sc.scrollTop; st.cols = [...document.querySelectorAll('.wk-col')]; st.col0 = st.cols.indexOf(el.parentElement); st.col = st.col0;
      st.top0 = parseFloat(el.style.top); st.h0 = parseFloat(el.style.height);
    } else {
      // 今日の流れは時間に比例していない（先の時間は詰めて出す）ので、指で動かした距離をそのまま時間にする：72px で1時間（15分＝18px）
      st.sc = scroller(); st.scroll0 = st.sc.scrollTop;
    }
    st.badge = document.createElement('span'); st.badge.className = 'drag-time mono'; el.appendChild(st.badge); dragBadge(st);
  }
  st.auto = setInterval(() => dragAuto(st), 16);
}
const TL_PX_PER_H = 72;
const snapT = t => Math.round(t / (SNAP * 6e4)) * SNAP * 6e4;
function dragBadge(st) { if (st.badge) st.badge.textContent = `${hm(st.ns)}–${hm(st.ne)}`; }
function dragAuto(st) { // 端に近づいたら、ゆっくりスクロールする
  if (!st.sc) return; const r = st.sc === $('#wk-scroll') ? st.sc.getBoundingClientRect() : { top: 0, bottom: innerHeight - 90 };
  // つかんだ場所から、その端の方へ動かしたときだけ（端の近くでつかんだだけでは流れない）
  const Z = 48, v = st.y < r.top + Z && st.y < st.y0 - 12 ? -Math.ceil((r.top + Z - st.y) / 6) : st.y > r.bottom - Z && st.y > st.y0 + 12 ? Math.ceil((st.y - r.bottom + Z) / 6) : 0;
  if (v) { const before = st.sc.scrollTop; st.sc.scrollTop += Math.max(-14, Math.min(14, v)); if (st.sc.scrollTop !== before) dragMove(st); }
}
function dragMove(st) {
  const el = st.el, dScroll = st.sc ? st.sc.scrollTop - st.scroll0 : 0, dy = st.y - st.y0 + dScroll;
  if (st.kind === 'task') {
    el.style.transform = `translateY(${dy}px) scale(1.02)`;
    const c = st.rects[st.i0].top + st.rects[st.i0].height / 2 + dy;
    let to = 0; st.rows.forEach((r, i) => { if (i !== st.i0 && st.rects[i].top + st.rects[i].height / 2 - (st.scroll0 - st.scroll0) < c) to++; });
    st.to = to;
    st.rows.forEach((r, i) => { if (i === st.i0) return; const sh = st.i0 < to && i > st.i0 && i <= to ? -st.h : st.i0 > to && i >= to && i < st.i0 ? st.h : 0; r.style.transform = sh ? `translateY(${sh}px)` : ''; });
    return;
  }
  if (st.wk) {
    const dMin = Math.round(dy / H_PX * 60 / SNAP) * SNAP; let col = st.col0;
    if (st.kind === 'move') { st.cols.forEach((c, i) => { const r = c.getBoundingClientRect(); if (st.x >= r.left && st.x < r.right) col = i; }); }
    const dDay = col - st.col0, len = st.e0 - st.s0;
    if (st.kind === 'move') { st.ns = st.s0 + dMin * 6e4 + dDay * 864e5; st.ne = st.ns + len; }
    else if (st.kind === 'start') { st.ns = Math.min(st.e0 - SNAP * 6e4, st.s0 + dMin * 6e4); st.ne = st.e0; }
    else { st.ne = Math.max(st.s0 + SNAP * 6e4, st.e0 + dMin * 6e4); st.ns = st.s0; }
    const top = st.top0 + (st.ns - st.s0) / 6e4 / 60 * H_PX - dDay * 0, h = Math.max(18, (st.ne - st.ns) / 3600e3 * H_PX - 2);
    if (col !== st.col) { st.cols[col].appendChild(el); st.col = col; }
    el.style.top = (st.kind === 'move' ? st.top0 + dMin / 60 * H_PX : top) + 'px'; el.style.height = h + 'px';
    if (st.kind === 'move') { el.style.left = '1px'; el.style.width = 'calc(100% - 2px)'; }
    dragBadge(st); return;
  }
  // 今日の流れ
  const off = snapT(dy / TL_PX_PER_H * 3600e3);
  if (st.kind === 'move') { st.ns = st.s0 + off; st.ne = st.e0 + off; el.style.transform = `translateY(${dy}px)`; }
  else if (st.kind === 'start') st.ns = Math.min(st.e0 - SNAP * 6e4, st.s0 + off);
  else st.ne = Math.max(st.s0 + SNAP * 6e4, st.e0 + off);
  dragBadge(st);
}
function dragFinish(st, cancel) {
  clearInterval(st.auto); dragNoClick = Date.now();
  const el = st.el;
  document.documentElement.classList.remove('dragging');
  if (st.badge) st.badge.remove();
  if (st.kind === 'task') {
    const ids = st.rows.map(r => r.dataset.sort); const id = ids.splice(st.i0, 1)[0]; ids.splice(st.to, 0, id);
    st.rows.forEach(r => { r.style.transform = ''; }); el.classList.remove('lifted');
    DRAG.on = false; DRAG.pending = false;
    if (!cancel && st.to !== st.i0) taskReorder(ids, id); else render();
    return;
  }
  el.classList.remove('lifted'); el.style.transform = '';
  DRAG.on = false; DRAG.pending = false;
  const [cal, ...rest] = el.dataset.drag.split('|'), id = rest.join('|');
  if (cancel || (st.ns === st.s0 && st.ne === st.e0)) { last.main = ''; render(); return; }
  moveEvent(cal, id, st.ns, st.ne, { s: st.s0, e: st.e0 });
}
