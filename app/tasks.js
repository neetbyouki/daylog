// Daylog 本体の部品：タスク：タスクの画面、目標、タイマー、タスクの並べかえ
// ・読み込む順は app/parts.json。全部を1つにつないで、1つの関数の中で動かす（boot.js／tools/build_claude.py）

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
  return `<li class="task ${t.status === 'done' ? 'done' : ''}${fl.cls}${fxc('new' + t.id, 'new')}${fxc('drop' + t.id, 'dropped')}"${t.status === 'open' ? ` data-sort="${t.id}"` : ''}>
    <div class="head"><button class="check ${t.status === 'done' ? 'on' + fxc('task' + t.id) : ''}" data-act="${t.status === 'done' ? 'taskUndo' : 'taskDone'}" data-arg="${t.id}" aria-label="完了にする">${t.status === 'done' ? CHECK : ''}</button>
      <div class="title" data-act="taskOpen" data-arg="${t.id}" style="cursor:pointer">${esc(t.title)}
        <div class="chips">${fl.icons}${weightMark(t.weight)}${deadlinePill(t)}${goal ? `<span class="pill gold">✦ ${esc(goal.title)}</span>` : ''}${t.plannedDate && t.status === 'open' && !(t.plannedDate < today()) ? `<span class="pill" title="${shortLabel(t.plannedDate)}にやる予定">▸ ${shortLabel(t.plannedDate)}</span>` : ''}${steps.length ? `<span class="pill">${done}/${steps.length}</span>` : ''}</div>
      </div>
      ${t.status === 'open' ? `<span class="grip" aria-hidden="true" title="ドラッグで並べかえ"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></span>` : ''}<button class="iconbtn chev ${open ? 'open' : ''}" data-act="taskOpen" data-arg="${t.id}" aria-expanded="${open}" aria-label="${open ? '閉じる' : '開く'}">${ICON.chev}</button></div>
    ${steps.length ? `<div class="bar" aria-hidden="true"><i style="width:${Math.round(done / steps.length * 100)}%"></i></div>` : ''}
    ${open ? `<ul class="steps${fxc('open' + t.id, 'fx')}">${steps.map(s => `<li class="${s.done ? 'done' : ''}"><button class="check ${s.done ? 'on' + fxc('step' + s.id) : ''}" style="width:18px;height:18px" data-act="stepToggle" data-arg="${t.id}:${s.id}" aria-label="ステップを完了">${s.done ? CHECK : ''}</button><span>${esc(s.title)}</span><span class="spacer"></span><button class="btn ghost sm" data-act="stepDel" data-arg="${t.id}:${s.id}" aria-label="ステップを消す">×</button></li>`).join('')}
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
  // 自分で並べかえたあとは、その順（order）。並べかえる前は締切順（不調・休養の日は軽い順）
  const manual = all.some(t => t.status === 'open' && t.order != null);
  const autoSort = (a, b) => easy ? (urgent(b) - urgent(a)) || (wv(a) - wv(b)) || byDeadline(a, b) : byDeadline(a, b);
  const open = all.filter(t => t.status === 'open').sort(manual ? (a, b) => (a.order ?? -Infinity) - (b.order ?? -Infinity) || (b.createdAt || 0) - (a.createdAt || 0) : autoSort);
  const held = all.filter(t => t.status === 'held').sort(byDeadline);
  const done = all.filter(t => t.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 20);
  let h = headerHTML('タスク', `<span>やること ${num('todo', open.length)} 件</span>${held.length ? `<span>保留箱 ${held.length} 件</span>` : ''}`);
  h += goalsSection();
  h += `<h2 class="sec"><span>タスク</span>${manual ? `<button class="r link" data-act="taskAutoOrder">締切順に戻す</button>` : easy ? `<span class="r faint">${MODES[mode].label}の日は軽い順</span>` : open.length > 1 ? `<span class="r faint">⠿ をつまむと並べかえ</span>` : ''}</h2>`;
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

/* ── 目標（タスクの画面の上に出す） ── */
function goalsSection() {
  const d = today(); const mk = monthKey(d), wk = weekStart(d);
  const month = activeGoals('month', mk), week = activeGoals('week', wk);
  const day = getDay(d);
  const habitDays = id => Object.keys(S.days).filter(x => x.startsWith(mk) && habitDone(S.days[x], id)).length;
  const block = (label, list, scope, canAdd, ph, extra = '') => {
    const open = S.goalAddOpen === scope;
    const plus = canAdd ? `<button class="gplus" data-act="goalAddOpen" data-arg="${scope}" aria-expanded="${open}" aria-label="${ph}">${open ? '×' : '＋'}</button>` : '';
    const input = canAdd && open ? `<div class="row gadd"><input class="field grow" id="goal-${scope}" data-draft placeholder="${ph}" value="${esc(draft('goal-' + scope))}" data-enter="goalAdd" data-arg="${scope}" aria-label="${ph}"><button class="btn ghost sm" data-act="goalAdd" data-arg="${scope}">置く</button></div>` : '';
    return `<div class="gblock"><div class="gk"><span>${label}</span><span class="row" style="gap:6px">${extra}${plus}</span></div>${list.map(goalRow).join('') || (open ? '' : '<div class="faint gempty">まだない</div>')}${input}</div>`;
  };
  // 毎日の習慣（編集のとき）：今日のチェック・直す・消す・足す
  const habitEditor = h => `<div class="habit-ed" role="group" aria-label="${h ? '習慣を直す' : '習慣を足す'}">
      <label class="hb-l">ふだん<input class="field" id="hb-title" maxlength="60" placeholder="例：お風呂：19時30分までに湯船に浸かる" value="${esc(h ? h.title : '')}" data-enter="habitSave" data-arg="${h ? esc(h.id) : ''}"></label>
      <label class="hb-l">不調の日<input class="field" id="hb-bad" maxlength="60" placeholder="空ならふだんと同じ（例：シャワーだけでいい）" value="${esc(h && h.bad ? h.bad : '')}" data-enter="habitSave" data-arg="${h ? esc(h.id) : ''}"></label>
      <label class="hb-c"><input type="checkbox" id="hb-rest" ${h && h.rest ? 'checked' : ''}>休養の日もやる</label>
      <div class="row hb-btns">${h ? `<button class="link danger" data-act="habitDel" data-arg="${esc(h.id)}">この習慣を消す</button>` : ''}<span class="spacer"></span><button class="btn ghost sm" data-act="habitEdit" data-arg="">やめる</button><button class="btn primary sm" data-act="habitSave" data-arg="${h ? esc(h.id) : ''}">${h ? '保存' : '足す'}</button></div></div>`;
  const hl = habitList();
  let habit = hl.map(h => {
    if (S.habitEdit === h.id) return habitEditor(h);
    const tx = habitFor(h, day.mode); const done = habitDone(day, h.id);
    const chk = tx ? `<button class="check gold ${done ? 'on' + fxc('habit' + h.id) : ''}" data-act="habitToggle" data-arg="${esc(h.id)}" aria-pressed="${done}" aria-label="${esc(habitShort(h.title))}を今日やった">${done ? CHECK : ''}</button>` : '<span class="check gold off" aria-hidden="true"></span>';
    return `<div class="goal habit ${tx ? '' : 'resting'}">${chk}<div class="title">${esc(tx || h.title)}${!tx ? '<span class="faint">（休養の日はお休み）</span>' : ''}<span class="hb-n">今月 ${habitDays(h.id)} 日</span></div><button class="link hb-edit" data-act="habitEdit" data-arg="${esc(h.id)}" aria-label="${esc(habitShort(h.title))}を直す">直す</button></div>`;
  }).join('') || (S.habitEdit === 'new' ? '' : '<div class="faint gempty">まだない</div>');
  if (S.habitEdit === 'new') habit += habitEditor(null);
  const past = Object.values(S.goals).filter(g => !(g.scope === 'month' && g.period === mk) && !(g.scope === 'week' && g.period === wk)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 30);
  if (!S.goalEdit) {
    // ふだんは眺めるだけのコンパクト表示。操作は「編集」ひとつ
    const line = list => list.length ? list.map(g => `<span class="gc-g ${g.status === 'done' ? 'done' : ''}"><i aria-hidden="true">${g.status === 'done' ? '✦' : '✧'}</i>${esc(g.title)}</span>`).join('') : '<span class="faint">まだない</span>';
    const tl = habitsToday(day.mode);
    const bath = !habitList().length ? '<span class="faint">まだない</span>' : !tl.length ? '<span class="faint">休養の日はお休み</span>' : tl.map(h => `<span class="gc-g ${habitDone(day, h.id) ? 'done' : ''}"><i aria-hidden="true">${habitDone(day, h.id) ? '✦' : '✧'}</i>${esc(habitShort(h.text))}${habitDone(day, h.id) ? '（今日は済み）' : ''}</span>`).join('');
    return `<section class="card goals compact" aria-label="目標"><div class="gc-head"><span class="goals-title">目標</span><button class="gedit" data-act="goalEdit">編集</button></div>
      <div class="gc-row"><span class="gc-k">${Number(mk.slice(5))}月</span><div class="gc-v">${line(month)}</div></div>
      <div class="gc-row"><span class="gc-k">今週</span><div class="gc-v">${line(week)}</div></div>
      <div class="gc-row"><span class="gc-k">習慣</span><div class="gc-v">${bath}</div></div></section>`;
  }
  return `<section class="card goals" aria-label="目標"><div class="gc-head"><span class="goals-title">目標</span><button class="gedit on" data-act="goalEdit">閉じる</button></div><div class="goals-sub" style="margin-bottom:4px">こなすものではなく、心に置いておく言葉</div>
    ${block(`${Number(mk.slice(5))}月の目標`, month, 'month', month.length < 3, '今月、大事にしたいこと（3つまで）', month.length ? `${month.length}/3` : '')}
    ${block('今週の目標', week, 'week', true, '今週、大事にしたいこと')}
    <div class="gblock"><div class="gk"><span>毎日の習慣</span><span class="row" style="gap:6px">${hl.length ? `<span class="faint">${hl.length}/${HABIT_MAX}</span>` : ''}${hl.length < HABIT_MAX && !S.habitEdit ? '<button class="gplus" data-act="habitEdit" data-arg="new" aria-label="習慣を足す">＋</button>' : ''}</span></div>${habit}${day.mode === 'bad' ? '<div class="faint hb-note">今日は不調の日なので、軽い形を出している。</div>' : ''}</div>
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
/* ── タイマー（タスクの画面の右上から開く。全画面。端末ごとに覚え、閉じても・開き直しても進み続ける） ── */
const TM_KEY = 'daylog-timer';
const TM = Object.assign({ state: 'idle', dur: 900, purpose: '', endAt: 0, left: 0, spent: 0, early: false, sound: true, logged: false }, (() => { try { return JSON.parse(localStorage.getItem(TM_KEY)) || {}; } catch (_) { return {}; } })());
const tmSave = () => { try { localStorage.setItem(TM_KEY, JSON.stringify(TM)); } catch (_) {} };
const tmLeft = () => (TM.state === 'run' ? Math.max(0, (TM.endAt - Date.now()) / 1000) : TM.state === 'pause' ? TM.left : TM.state === 'done' ? 0 : TM.dur);
const tmFmt = sec => { const t = Math.ceil(sec - 0.001), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), ss = t % 60; return h ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`; };
const tmMin = sec => (sec < 60 ? `${Math.max(1, Math.round(sec))}秒` : sec >= 3600 && sec % 3600 === 0 ? `${sec / 3600}時間` : sec >= 3600 ? `${Math.floor(sec / 3600)}時間${Math.round(sec % 3600 / 60)}分` : `${Math.round(sec / 60)}分`);
const TM_R = 132, TM_C = 2 * Math.PI * TM_R;
const TM_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.6 1.6M9.5 3h5M12 3v3"/></svg>';
// 右上のボタン：タスクの画面ではいつも出す。ほかの画面では、タイマーが動いている間だけ残り時間を小さく出す
function timerChipHTML() {
  const active = TM.state !== 'idle';
  if (S.view !== 'tasks' && !active) return '';
  const label = TM.state === 'done' ? '終了' : active ? `<span class="mono" id="tm-chip-t">${tmFmt(tmLeft())}</span>` : (S.view === 'tasks' ? 'タイマー' : '');
  return `<button class="night-btn tm-btn ${active ? 'on ' + TM.state : ''}${S.view !== 'tasks' ? ' mini' : ''}" data-act="timerOpen" aria-label="タイマーを開く${active ? '（' + (TM.state === 'done' ? '終了' : '残り ' + tmFmt(tmLeft())) + '）' : ''}">${TM_ICON}${label}</button>`;
}
// タイマーの画面のアイコン（文字の代わり。押せるものには必ず aria-label と title を付ける）
const TI = (d, sw = 2) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const TMI = {
  back: TI('<path d="M14.5 5.5l-6.5 6.5 6.5 6.5"/>'),
  snd: TI('<path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"/><path d="M15.8 9a4 4 0 0 1 0 6M18.3 6.5a7.5 7.5 0 0 1 0 11"/>', 1.8),
  mute: TI('<path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>', 1.8),
  play: '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z" fill="currentColor"/></svg>',
  pause: '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>',
  stop: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.2" fill="currentColor"/></svg>',
  again: TI('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>'),
  close: TI('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  log: TI('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.2),
  aim: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".8" fill="currentColor"/></svg>',
};
const tmBtn = (act, icon, label, cls = '', arg = '', extra = '') => `<button class="tm-ic ${cls}" data-act="${act}"${arg !== '' ? ` data-arg="${arg}"` : ''} aria-label="${label}" title="${label}" ${extra}>${icon}</button>`;
function timerHTML() {
  const st = TM.state, left = tmLeft();
  // 円：動いている間は残りの割合。終わったら、やった分（途中でやめたらその分だけ）を金色で
  const frac = st === 'idle' ? 1 : st === 'done' ? (TM.dur ? clamp(TM.spent / TM.dur, 0, 1) : 1) : TM.dur ? left / TM.dur : 0;
  const purpose = st === 'idle' ? draft('tm-purpose', '') : TM.purpose;
  const ok = !!String(purpose).trim();
  const digits = st === 'done' ? tmFmt(TM.spent) : tmFmt(left);
  const stateTx = st === 'idle' ? tmMin(TM.dur) : st === 'run' ? `${hm(TM.endAt)} まで` : st === 'pause' ? '一時停止中' : TM.early ? `${tmMin(TM.dur)}のうち` : 'おつかれさま';
  const ring = `<div class="tm-ring ${st}${st === 'done' && TM.early ? ' early' : ''}"><svg viewBox="0 0 300 300" aria-hidden="true"><circle class="tm-track" cx="150" cy="150" r="${TM_R}"/><circle class="tm-arc" id="tm-arc" cx="150" cy="150" r="${TM_R}" stroke-dasharray="${TM_C.toFixed(2)}" stroke-dashoffset="${(TM_C * (1 - frac)).toFixed(2)}" transform="rotate(-90 150 150)"/></svg>
    <div class="tm-center">${st === 'done' && !TM.early ? `<span class="tm-ok${fxc('tmdone', 'in')}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M6 12.5l4 4 8-9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>` : ''}${st === 'done' && TM.early ? `<div class="tm-state">${stateTx}</div>` : ''}<div class="tm-digits mono${fxc('tmadd', 'bump')}" id="tm-digits" role="timer" aria-live="off">${digits}</div>${st === 'done' && TM.early ? '<div class="tm-state">やった</div>' : `<div class="tm-state" id="tm-state">${stateTx}</div>`}</div></div>`;
  let top, bottom;
  if (st === 'idle') {
    top = `<input class="field tm-purpose" id="tm-purpose" data-draft maxlength="60" placeholder="この時間の目的" value="${esc(purpose)}" data-enter="timerStart" autocomplete="off" aria-label="この時間の目的（書くと始められる）">`;
    bottom = `<div class="tm-presets" role="group" aria-label="時間をえらぶ">${[[300, '5分'], [900, '15分'], [1800, '30分'], [3600, '1時間']].map(([v, l]) => `<button data-act="timerSet" data-arg="${v}" aria-pressed="${TM.dur === v}">${l}</button>`).join('')}</div>
      <div class="tm-adj">${tmBtn('timerAdj', '−5', '5分へらす', 'sm', -300, TM.dur <= 300 ? 'disabled' : '')}${tmBtn('timerAdj', '−1', '1分へらす', 'sm', -60, TM.dur <= 60 ? 'disabled' : '')}${tmBtn('timerAdj', '＋1', '1分ふやす', 'sm', 60)}${tmBtn('timerAdj', '＋5', '5分ふやす', 'sm', 300)}</div>
      <div class="tm-row">${tmBtn('timerStart', TMI.play, '始める', 'big primary', '', `id="tm-start" aria-disabled="${!ok}"`)}</div><div class="tm-need" id="tm-need" ${ok ? 'hidden' : ''}>目的を書くと始められる</div>`;
  } else {
    top = `<div class="tm-what"><span class="tm-aim">${TMI.aim}</span>${esc(TM.purpose)}</div>`;
    if (st === 'done') bottom = `<div class="tm-row">${tmBtn('timerReset', TMI.close, TM.logged ? '閉じて、別のタイマーにする' : '記録せずに閉じて、別のタイマーにする')}${tmBtn('timerLog', TM.logged ? TMI.log : TMI.log, TM.logged ? '記録に残した' : `${tmMin(TM.spent)}を記録に残す`, 'big primary log' + fxc('tmlog', 'pop'), '', TM.logged || TM.spent < 1 ? 'disabled' : '')}${TM.early && !TM.logged ? tmBtn('timerResume', TMI.play, '続ける（残り ' + tmFmt(TM.left) + '）') : tmBtn('timerAgain', TMI.again, 'もう一度同じ時間で')}</div><div class="tm-need">${TM.logged ? '今日の流れに残した' : `✓ で「${tmMin(TM.spent)}」を記録に残す`}</div>`;
    else bottom = `<div class="tm-row">${tmBtn('timerStop', TMI.stop, 'ここでやめる（やった分を記録できる）')}${st === 'run' ? tmBtn('timerPause', TMI.pause, '一時停止', 'big primary') : tmBtn('timerPause', TMI.play, '再開', 'big primary')}${tmBtn('timerAdd', '＋1', '1分のばす', '', 60)}</div>`;
  }
  return `<div class="overlay tm" role="dialog" aria-modal="true" aria-label="タイマー"><div class="tm-top">${tmBtn('timerClose', TMI.back, '戻る', 'flat')}${tmBtn('timerSound', TM.sound ? TMI.snd : TMI.mute, `終わりの音：${TM.sound ? 'あり' : 'なし'}（押すと切りかえ）`, 'flat' + (TM.sound ? '' : ' off'), '', `aria-pressed="${TM.sound}"`)}</div>
    <div class="tm-body"><div class="tm-head">${top}</div>${ring}<div class="tm-foot">${bottom}</div></div></div>`;
}
let tmTimer = 0, tmAudio = null, tmLock = null;
function tmPaint() { // 毎秒の更新は、画面を作り直さずに数字と円だけ書きかえる
  const left = tmLeft(), t = tmFmt(left);
  const dg = $('#tm-digits'); if (dg && dg.textContent !== t) dg.textContent = t;
  const arc = $('#tm-arc'); if (arc) arc.setAttribute('stroke-dashoffset', (TM_C * (1 - (TM.dur ? left / TM.dur : 0))).toFixed(2));
  const chip = $('#tm-chip-t'); if (chip && chip.textContent !== t) chip.textContent = t;
}
function tmTick() {
  if (TM.state !== 'run') { clearInterval(tmTimer); tmTimer = 0; return; }
  if (Date.now() >= TM.endAt) { tmFinish(Date.now() - TM.endAt < 60000); return; }
  tmPaint();
}
function tmRun() { clearInterval(tmTimer); tmTimer = setInterval(tmTick, 250); tmWake(); }
async function tmWake() { // 全画面で動いている間は、画面が勝手に消えないようにする（対応している端末だけ）
  const want = S.timerOpen && TM.state === 'run';
  try { if (want && !tmLock && navigator.wakeLock) { tmLock = await navigator.wakeLock.request('screen'); tmLock.addEventListener('release', () => { tmLock = null; }); } else if (!want && tmLock) { const l = tmLock; tmLock = null; await l.release(); } } catch (_) { tmLock = null; }
}
function tmChime() { // 終わりの合図：やわらかい音を3つ
  if (!TM.sound || !tmAudio) return;
  try {
    const ctx = tmAudio, t0 = ctx.currentTime + 0.05;
    [659.25, 783.99, 1046.5].forEach((hz, i) => { const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + i * 0.32; o.type = 'sine'; o.frequency.value = hz; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5); o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 1.6); });
  } catch (_) {}
}
function tmFinish(live) {
  clearInterval(tmTimer); tmTimer = 0; TM.state = 'done'; TM.left = 0; TM.spent = TM.dur; TM.early = false; TM.logged = false; tmSave();
  if (live) fx('tmdone');
  if (live) { tmChime(); try { if (navigator.vibrate) navigator.vibrate([200, 120, 200]); } catch (_) {} S.timerOpen = true; }
  tmWake(); render();
}
A.timerOpen = () => { S.timerOpen = true; render(); tmWake(); if (TM.state === 'idle') setTimeout(() => { const el = $('#tm-purpose'); if (el && !el.value) el.focus(); }, 60); };
A.timerClose = () => { S.timerOpen = false; render(); tmWake(); };
A.timerSet = v => { if (TM.state !== 'idle') return; TM.dur = Number(v); tmSave(); render(); };
A.timerAdj = v => { if (TM.state !== 'idle') return; TM.dur = clamp(TM.dur + Number(v), 60, 6 * 3600); tmSave(); render(); };
A.timerStart = () => {
  if (TM.state !== 'idle') return;
  const purpose = String(S.drafts['tm-purpose'] || '').trim();
  if (!purpose) { shake($('#tm-purpose')); const n = $('#tm-need'); if (n) { n.hidden = false; n.classList.remove('flash'); void n.offsetWidth; n.classList.add('flash'); } return; }
  try { const AC = window.AudioContext || window.webkitAudioContext; if (AC && !tmAudio) tmAudio = new AC(); if (tmAudio && tmAudio.state === 'suspended') tmAudio.resume(); } catch (_) {}
  Object.assign(TM, { state: 'run', purpose, endAt: Date.now() + TM.dur * 1000, logged: false }); delete S.drafts['tm-purpose']; tmSave(); tmRun(); render();
};
A.timerPause = () => {
  if (TM.state === 'run') { TM.left = tmLeft(); TM.state = 'pause'; clearInterval(tmTimer); tmTimer = 0; }
  else if (TM.state === 'pause') { TM.endAt = Date.now() + TM.left * 1000; TM.state = 'run'; tmRun(); }
  tmSave(); tmWake(); render();
};
A.timerAdd = v => { fx('tmadd'); const n = Number(v); if (TM.state === 'run') TM.endAt += n * 1000; else if (TM.state === 'pause') TM.left += n; else return; TM.dur += n; tmSave(); render(); };
A.timerReset = () => { clearInterval(tmTimer); tmTimer = 0; S.drafts['tm-purpose'] = TM.state === 'done' ? '' : TM.purpose; Object.assign(TM, { state: 'idle', endAt: 0, left: 0, spent: 0, early: false, logged: false }); tmSave(); tmWake(); render(); };
// 途中でやめる：やった分（決めた時間−残り）を出して、記録に残すか選べる。止めただけなので「続ける」もできる
A.timerStop = () => {
  if (TM.state !== 'run' && TM.state !== 'pause') return;
  const left = tmLeft(); clearInterval(tmTimer); tmTimer = 0;
  Object.assign(TM, { state: 'done', left, spent: Math.max(0, Math.round(TM.dur - left)), early: left > 0.5, logged: false }); tmSave(); tmWake(); render();
};
A.timerResume = () => { if (TM.state !== 'done' || !TM.early || TM.logged || TM.left <= 0) return; Object.assign(TM, { state: 'run', endAt: Date.now() + TM.left * 1000, early: false, logged: false }); tmSave(); tmRun(); render(); };
A.timerAgain = () => { Object.assign(TM, { state: 'run', endAt: Date.now() + TM.dur * 1000, spent: 0, early: false, logged: false }); tmSave(); tmRun(); render(); };
A.timerSound = () => { TM.sound = !TM.sound; tmSave(); render(); };
A.timerLog = () => {
  if (TM.state !== 'done' || TM.logged) return;
  const d = today(), day = getDay(d);
  patchDay(d, { entries: [...(day.entries || []), { id: uid(), t: Date.now(), text: `⏱ ${TM.purpose}（${tmMin(TM.spent || TM.dur)}${TM.early ? ` / 予定${tmMin(TM.dur)}` : ''}）` }] });
  TM.logged = true; fx('tmlog'); tmSave(); render();
};
// 開き直したとき：動いていたタイマーを続ける（もう時間が過ぎていたら「終了」にする）
if (TM.state === 'run') { if (Date.now() >= TM.endAt) { TM.state = 'done'; TM.left = 0; TM.spent = TM.dur; TM.early = false; tmSave(); } else tmRun(); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) { tmTick(); tmWake(); } });

// タスク
A.taskAdd = () => {
  const title = (S.drafts['task-title'] || '').trim(); if (!title) return;
  const id = uid();
  const t = clean({ id, title, weight: S.drafts['task-w'] || undefined, deadline: S.drafts['task-dl'] || undefined, goalId: S.drafts['task-goal'] || undefined, status: 'open', steps: [], createdAt: Date.now() });
  S.drafts['task-title'] = ''; S.drafts['task-w'] = ''; S.drafts['task-dl'] = ''; S.drafts['task-goal'] = ''; S.taskAddOpen = false; S.tasks[id] = t; fx('new' + id); render(); putDoc('tasks/' + id, t);
};
A.taskAutoOrder = () => { const ids = Object.values(S.tasks).filter(t => t.order != null).map(t => t.id); for (const id of ids) { const t = { ...S.tasks[id] }; delete t.order; S.tasks[id] = t; putDoc('tasks/' + id, t); } render(); toast('締切順に戻した。'); };
A.taskOpen = id => { S.openTask = S.openTask === id ? null : id; if (S.openTask) fx('open' + id); render(); };
A.taskDone = id => { const t = S.tasks[id]; if (!t) return; fx('task' + id); patchTask(id, { status: 'done', doneAt: Date.now() }); toast('終わった。青い星がひとつ増えた。'); };
A.taskUndo = id => patchTask(id, { status: 'open', doneAt: null });
A.taskHold = id => patchTask(id, { status: 'held', heldAt: Date.now() });
A.taskRestore = id => patchTask(id, { status: 'open', plannedDate: null, heldAt: null });
A.taskDelete = (id, el) => { if (leaveThen(el, 'li.task', () => A.taskDelete(id))) return; const t = S.tasks[id]; if (!t) return; delete S.tasks[id]; S.openTask = null; render(); delDoc('tasks/' + id); S.undo = () => { S.tasks[id] = t; render(); putDoc('tasks/' + id, t); }; toast('タスクを消した。', true); };
A.taskWeight = arg => { const [id, w] = arg.split(':'); const t = S.tasks[id]; if (!t) return; patchTask(id, { weight: t.weight === w ? null : w }); };
A.newWeight = w => { S.drafts['task-w'] = S.drafts['task-w'] === w ? '' : w; render(); };
A.taskDeadline = (v, el) => patchTask(el.dataset.arg, { deadline: v || null });
A.taskGoal = (v, el) => patchTask(el.dataset.arg, { goalId: v || null });
A.stepAdd = id => { const k = 'step-' + id; const title = (S.drafts[k] || '').trim(); if (!title) return; S.drafts[k] = ''; const t = S.tasks[id]; patchTask(id, { steps: [...(t.steps || []), { id: uid(), title, done: false }] }); };
A.stepToggle = arg => { const [tid, sid] = arg.split(':'); const t = S.tasks[tid]; fx('step' + sid); patchTask(tid, { steps: (t.steps || []).map(s => s.id === sid ? { ...s, done: !s.done, doneAt: !s.done ? Date.now() : null } : s) }); };
A.stepDel = arg => { const [tid, sid] = arg.split(':'); const t = S.tasks[tid]; patchTask(tid, { steps: (t.steps || []).filter(s => s.id !== sid) }); };
// 目標
A.taskFilter = id => { S.taskFilter = id && S.taskFilter !== id ? id : null; if (S.taskFilter) S.drafts['task-goal'] = S.taskFilter; render(); };
A.goalAddOpen = scope => { S.goalAddOpen = S.goalAddOpen === scope ? null : scope; render(); if (S.goalAddOpen) setTimeout(() => { const el = document.getElementById('goal-' + scope); if (el) el.focus(); }, 0); };
A.goalEdit = () => { S.goalEdit = !S.goalEdit; S.goalMenu = null; S.goalAddOpen = null; S.habitEdit = null; render(); };
// 習慣を直す・足す・消す（settings.habits）
A.habitEdit = id => { S.habitEdit = id || null; render(); if (id) setTimeout(() => { const el = $('#hb-title'); if (el) el.focus(); }, 30); };
A.habitSave = id => {
  const title = String(($('#hb-title') || {}).value || '').trim(); const bad = String(($('#hb-bad') || {}).value || '').trim(); const rest = !!($('#hb-rest') || {}).checked;
  if (!title) { shake($('#hb-title')); return; }
  const list = habitList().map(h => ({ ...h }));
  if (id) { const h = list.find(x => x.id === id); if (!h) return; Object.assign(h, { title, bad: bad || null, rest }); }
  else { if (list.length >= HABIT_MAX) { toast(`習慣は${HABIT_MAX}つまで。`); return; } list.push({ id: 'h' + Date.now().toString(36), title, bad: bad || null, rest }); }
  S.habitEdit = null; patchSettings({ habits: list }); toast(id ? '習慣を直した。' : '習慣を足した。');
};
A.habitDel = id => {
  const before = habitList().map(h => ({ ...h })); const h = before.find(x => x.id === id); if (!h) return;
  S.habitEdit = null; patchSettings({ habits: before.filter(x => x.id !== id) });
  S.undo = () => patchSettings({ habits: before }); toast(`「${habitShort(h.title)}」を消した（今までのチェックは残る）。`, true);
};
A.goalMenu = id => { S.goalMenu = S.goalMenu === id ? null : id; render(); };
A.goalAdd = scope => {
  const k = scope === 'month' ? 'goal-month' : 'goal-week'; const title = (S.drafts[k] || '').trim(); if (!title) return;
  const d = today(); const period = scope === 'month' ? monthKey(d) : weekStart(d);
  if (scope === 'month' && activeGoals('month', period).length >= 3) { toast('今月の目標は3つまで。'); return; }
  const id = uid(); const g = { id, title, scope, period, status: 'active', createdAt: Date.now() }; S.drafts[k] = ''; S.goalAddOpen = null; S.goals[id] = g; render(); putDoc('goals/' + id, g);
};
A.goalToggle = id => { const g = S.goals[id]; if (!g) return; S.goalMenu = null; const done = g.status !== 'done'; patchGoal(id, { status: done ? 'done' : 'active', doneAt: done ? Date.now() : null }); if (done) toast('目標を達成。星座がひとつ完成した。'); };
A.goalDelete = id => { const g = S.goals[id]; if (!g) return; S.goalMenu = null; delete S.goals[id]; render(); delDoc('goals/' + id); S.undo = () => { S.goals[id] = g; render(); putDoc('goals/' + id, g); }; toast('目標を消した。', true); };
// 並べかえた順を order に書く（前後の間の数を入れる。間がなくなったら全部を振り直す）
function taskReorder(ids, moved) {
  const T = id => S.tasks[id], has = ids.every(i => T(i) && T(i).order != null);
  fx('drop' + moved);
  if (!has) { ids.forEach((i, k) => { if (T(i) && T(i).order !== (k + 1) * 1024) patchTask(i, { order: (k + 1) * 1024 }); }); return; }
  const k = ids.indexOf(moved), a = k > 0 ? T(ids[k - 1]).order : null, b = k < ids.length - 1 ? T(ids[k + 1]).order : null;
  let o = a == null ? b - 1024 : b == null ? a + 1024 : (a + b) / 2;
  if (a != null && b != null && b - a < 1e-6) { ids.forEach((i, j) => patchTask(i, { order: (j + 1) * 1024 })); return; }
  patchTask(moved, { order: o });
}
