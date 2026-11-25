// Daylog 本体の部品：重ねる画面：夜モード（締め・明日の予定）、シート
// ・読み込む順は app/parts.json。全部を1つにつないで、1つの関数の中で動かす（boot.js／tools/build_claude.py）

/* ───────── 重ねる画面（夜モード・シート） ───────── */
function overHTML() {
  if (S.timerOpen) return timerHTML();
  if (S.petOpen) return petRoomHTML();
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
    const mg = activeGoals('month', mk), wg = activeGoals('week', wk); const pl = promiseList();
    const list = gs => gs.length ? gs.map(g => `<div class="row" style="padding:3px 0"><span style="color:${g.status === 'done' ? 'var(--gold)' : 'var(--fg-3)'}">${g.status === 'done' ? '★' : '△'}</span><span style="min-width:0;overflow-wrap:anywhere">${esc(g.title)}</span></div>`).join('') : '<div class="faint" style="font-size:13px">まだない</div>';
    return `<div class="sheet"><div class="card"><div class="eyebrow">${dayLabel(d)}</div><h3>今日の目標</h3>
      <div class="note" style="margin-top:8px"><span class="k">今月</span><div class="v">${list(mg)}</div></div>
      <div class="note" style="margin-top:8px"><span class="k">今週</span><div class="v">${list(wg)}</div></div>
      <div class="note" style="margin-top:8px"><span class="k">約束</span><div class="v">${pl.length ? pl.map((p, i) => `<div>${PROMISE_NUM[i]} ${esc(p.title)}<span class="faint">（最低ライン：${esc(p.min)}）</span></div>`).join('') : '<span class="muted">まだ置いていない</span>'}</div></div>
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

const NIGHT_STEPS = ['締め', '目標と約束', '明日の予定', '送る', '寝る前チェック', 'Claudeの一言', '今日の星座'];
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
    const mg = activeGoals('month', monthKey(d)), wg = activeGoals('week', weekStart(d)); const pl = promiseList();
    const row = g => `<div class="goal concept ${g.status === 'done' ? 'done' : ''}"><span class="gmark" aria-hidden="true">${g.status === 'done' ? '✦' : '·'}</span><div class="title">${esc(g.title)}</div><span class="pill">${g.scope === 'month' ? '今月' : '今週'}</span></div>`;
    body = `<div class="faint" style="font-size:12px;margin-bottom:6px">今日を振り返りながら、眺めるだけでいい。</div><div class="card">${[...mg, ...wg].map(row).join('') || '<div class="faint" style="font-size:13px">今月・今週の目標はまだない。タスクの画面の上から置ける。</div>'}</div>
      <div class="eyebrow" style="margin-top:14px">今日の約束</div>
      ${pl.length ? pl.map((p, i) => { const lv = promiseLv(day, p.id); return `<button class="bigcheck yk-check ${lv || ''}" data-act="promiseTap" data-arg="${esc(p.id)}" aria-pressed="${!!lv}" style="margin-top:6px"><span class="box" aria-hidden="true">${promiseDot(lv)}</span><span>${PROMISE_NUM[i]} ${esc(p.title)}<span class="faint yk-st">${lv ? promiseLvText(lv) : 'タップで最低ライン・もう1回でふつう'}</span></span></button>`; }).join('')
        + `<div class="faint" style="font-size:12px;margin-top:8px">${pl.every(p => promiseLv(day, p.id)) ? 'ぜんぶ守れた日。' : '守れなかった約束は、そのままでいい。明日また。'}</div>` : '<div class="muted" style="font-size:14px;margin-top:6px">約束はまだ置いていない。タスクの画面の「目標 → 編集」から置ける。</div>'}`;
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
      `データ:\n- 体調モード: ${day.mode ? MODES[day.mode].label : '未設定'}\n- 気分 ${n.mood || '-'} / 体調 ${n.body || '-'}（5段階）\n- 締めのメモ: ${n.text || 'なし'}\n- 今日の記録:\n${entriesText(d)}\n- 終えたタスク: ${doneT}\n- 自分との約束: ${promiseList().map(p => `${p.title}（${promiseLvText(promiseLv(day, p.id))}）`).join(' / ') || 'なし'}\n` +
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
