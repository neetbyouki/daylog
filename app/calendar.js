// Daylog 本体の部品：カレンダー：Googleカレンダーの読み書き、カレンダーの画面（週・月）、予定のシート、ドラッグで予定を動かす
// ・読み込む順は app/parts.json。全部を1つにつないで、1つの関数の中で動かす（boot.js／tools/build_claude.py）

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
    const x = { id: e.id, cal: cal.key, title: e.summary || '（タイトルなし）', start, end, allDay, date: allDay ? e.start.date : null };
    // 終日の予定：何日続くか・今日が何日目か（Googleの終わりの日は「次の日」なので含めない）
    if (allDay) { x.ed = (e.end && e.end.date) || addDays(x.date, 1); x.span = Math.max(1, diffDays(x.date, x.ed)); x.nth = diffDays(x.date, d) + 1; }
    return x;
  }).filter(e => !isNaN(e.start) && (!e.allDay || (e.date <= d && d < e.ed)));
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
    overrideReminders: reminder == null || pushCoversPhone() ? [] : [{ method: 'popup', minutes: reminder }], useDefaultReminders: false, description: description || 'Daylogから追加',
  });
  const p = (r && r.payload) || {};
  return p.id || (p.event && p.event.id) || null;
}
async function deleteEvent(id) { return S.mcp.callTool(CFG.GCAL, 'delete_event', { calendarId: CFG.APP_CAL, eventId: id }); }
async function updateEvent(id, patch) { return S.mcp.callTool(CFG.GCAL, 'update_event', { calendarId: CFG.APP_CAL, eventId: id, ...patch }); }

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
      const dg = calEditable(x.e.cal) && !/^(🌙|☀)/.test(x.e.title) ? ` data-drag="${x.e.cal}|${esc(x.e.id)}" data-s="${x.e.start}" data-e="${x.e.end}"` : '';
      return `<button class="wk-ev${dg ? ' can-drag' : ''}${hh < 30 ? ' short' : ''}${fxc('moved' + x.e.cal + '|' + x.e.id, 'moved')}" style="--c:${c.color};top:${top}px;height:${hh}px;left:calc(${x.lane / x.lanes * 100}% + 1px);width:calc(${100 / x.lanes}% - 2px)" data-act="calOpen" data-arg="${x.e.cal}|${esc(x.e.id)}"${dg} title="${esc(x.e.title)}">${dg ? '<i class="rz rz-t" aria-hidden="true"></i>' : ''}<span class="t">${esc(x.e.title)}</span><span class="m">${hh >= 34 ? hm(x.e.start) : ''}</span>${dg ? '<i class="rz rz-b" aria-hidden="true"></i>' : ''}</button>`;
    }).join('');
    const nowLine = d === t ? `<div class="wk-now" style="top:${minFromDayStart(d, now) / 60 * H_PX}px"></div>` : '';
    // ゲームをした時間：列の左はしに細い帯（触れると名前と時間）
    const games = gameSessions(d).map(g => { const top = Math.max(0, minFromDayStart(d, g.from) / 60 * H_PX); return `<i class="wk-game" style="top:${top}px;height:${Math.max(3, (g.to - g.from) / 36e5 * H_PX)}px" data-tip="${esc(`🎮 ${g.name}\n${hm(g.from)}〜${hm(g.to)}（${fmtMin(g.min)}）`)}"></i>`; }).join('');
    return `<div class="wk-col ${d === t ? 'is-today' : ''}" data-day="${d}">${games}${blocks}${nowLine}</div>`;
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
// 予定を動かす：先に画面を変えてから、Googleカレンダーに書く（断られたら元に戻す）
async function moveEvent(cal, id, ns, ne, prev) {
  const upd = (s0, e0) => { const f = e => { if (e && e.cal === cal && e.id === id && !e.allDay) { e.start = s0; e.end = e0; } }; for (const k in S.calCache) (S.calCache[k].list || []).forEach(f); for (const k in S.events) (S.events[k].list || []).forEach(f); };
  upd(ns, ne); fx('moved' + cal + '|' + id); last.main = ''; render();
  if (!S.mcp) return;
  try {
    await S.mcp.callTool(CFG.GCAL, 'update_event', { calendarId: calOf(cal).id, eventId: id, startTime: isoLocal(new Date(ns)), endTime: isoLocal(new Date(ne)) });
    if (prev) { S.undo = () => moveEvent(cal, id, prev.s, prev.e, null); toast(`予定を ${hm(ns)}〜${hm(ne)} にした。`, true); } else toast('もとに戻した。');
    setTimeout(afterCalWrite, 600);
  } catch (e) { if (prev) upd(prev.s, prev.e); toast(calWriteErr(e)); afterCalWrite(); }
}
