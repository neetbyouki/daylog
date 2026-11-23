// Daylog 本体の部品：今日：今日の画面（終日・今日の流れ・記録を書く）、就寝の目安、予定の終了・キャンセル、時刻の手直し、朝の予定
// ・読み込む順は app/parts.json。全部を1つにつないで、1つの関数の中で動かす（boot.js／tools/build_claude.py）

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
  h += alldayHTML(d);
  h += `<div class="modes" role="group" aria-label="今日の体調">${Object.entries(MODES).map(([k, m]) => `<button class="mode" style="--c:${m.c}" data-act="setMode" data-arg="${k}" aria-pressed="${mode === k}" title="${m.hint}">${m.label}</button>`).join('')}</div>`;
  h += `<div class="stack">${morningCard(d)}${todayCards(d)}</div>`;
  h += timelineHTML(d);
  h += `<div class="stack" style="margin-top:18px">${claudeCard(d)}</div>`;
  return h;
}
// 終日の予定（Googleカレンダー）：日付のすぐ下に1行。色の線＋名前で、時刻の流れとは分けて置く
const calOfKey = k => CFG.CALS.find(c => c.key === k) || { name: '', color: 'var(--fg-3)' };
function alldayHTML(d) {
  const list = effEvents(d).filter(x => x.allDay && !x.canceled);
  if (!list.length) return '';
  return `<div class="allday-band" aria-label="今日の終日の予定"><span class="ad-lb">終日</span><div class="ad-list">${list.map(x => {
    const c = calOfKey(x.cal), more = x.span > 1 ? `${x.nth}/${x.span}日目` : '';
    return `<button class="ad" style="--c:${c.color}" data-act="calOpen" data-arg="${x.cal}|${esc(x.id)}" aria-label="終日の予定：${esc(x.title)}${more ? '（' + more + '）' : ''}・${esc(c.name)}"><i class="ad-bar" aria-hidden="true"></i><span class="ad-t">${esc(x.title)}</span>${more ? `<span class="ad-n mono">${more}</span>` : ''}<span class="ad-c" aria-hidden="true">${esc(c.name)}</span></button>`;
  }).join('')}</div></div>`;
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
function entryBody(e, ro) {
  if (ro) return `${e.nap ? '<span class="nap" title="昼寝" aria-label="昼寝">💤</span>' : ''}${esc(e.text || '')}${(e.mood || e.body) ? `<div class="meta">${e.mood ? `<span title="気分 ${e.mood}" aria-label="気分 ${e.mood}">${dots(e.mood, 'var(--mood)')}</span>` : ''}${e.body ? `<span title="体調 ${e.body}" aria-label="体調 ${e.body}">${dots(e.body, 'var(--body)')}</span>` : ''}</div>` : ''}`; // 見るだけ（カレンダーの月の画面で選んだ日）
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
// 今日の流れ：時刻はすべて左の列。予定・記録がある時刻だけ行になり、間の時間は「空き」の帯にまとめる
// ・これからの空き（15分以上）は緑の帯「空き 2時間」。帯の高さは長さに合わせる（上限あり）。押すとその時刻から予定を入れられる
// ・過ぎた空きは薄い帯に長さだけ。予定は「始まり」を上、「終わり」を下に、カードの中の記録もその時刻を左に出す
const GAP_MIN = 15 * 6e4;
const durText = ms => { const m = Math.round(ms / 6e4); const h = Math.floor(m / 60), r = m % 60; return h ? `${h}時間${r ? r + '分' : ''}` : `${r}分`; };
// o.ro：見るだけ（カレンダーの月の画面で選んだ日の流れ。記録の⋯・時刻の✎・予定の⋯は出さない）、o.title：見出し
function timelineHTML(d, o = {}) {
  const ro = !!o.ro; const st = S.events[d] || {};
  const evs = effEvents(d);
  const timed = evs.filter(x => !x.allDay);
  const calOf = k => CFG.CALS.find(c => c.key === k) || CFG.CALS[0];
  const now = Date.now(); const isToday = d === today();
  const isOn = x => isToday && !x.canceled && x.start <= now && now < x.end;
  // 予定の時間内に書いた記録は、その予定のカードの中に入れる
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
  const rng = dayRange(d, timed, loose);
  const games = gameSessions(d); // ゲームをした時間（重ねる帯）
  if (rng && games.length) rng.to = Math.max(rng.to, ...games.map(g => g.to)); // 就寝の目安より後までゲームをしていたら、その分まで流れを伸ばす
  const ongoing = timed.filter(isOn);
  // 行：起きた／予定／記録／いま（予定の最中なら、そのカードの中に出す）
  const rows = [];
  // 前の晩に寝た時刻も左の列に（起きた行の上。間は「睡眠」の帯）
  const prevSleep = rng && rng.wake ? sleepAt(addDays(d, -1)) : null;
  if (prevSleep && prevSleep < rng.wake) rows.push({ kind: 'slept', t: prevSleep, o: -1 });
  if (rng && rng.wake) rows.push({ kind: 'wake', t: rng.wake, o: 0 });
  for (const x of timed) rows.push({ kind: isBedEv(x) && !x.canceled ? 'bed' : 'ev', t: x.start, o: 1, x, busy: !x.canceled && !isBedEv(x) ? x.end : 0 });
  for (const e of loose) rows.push({ kind: 'en', t: e.t, o: 2, e });
  if (isToday && !ongoing.length) rows.push({ kind: 'now', t: now, o: 3 });
  rows.sort((a, b) => a.t - b.t || a.o - b.o);
  let h = `<h2 class="sec"><span>${esc(o.title || '今日の流れ')}</span><span class="r">${st.loading ? '<span class="thinking">予定を読み込み中</span>' : ro ? (evSnapped(d) ? '<span class="faint snapnote" data-tip="その日の終わりの予定の形で残している（あとでカレンダーで動かしても変わらない）">その日の予定のまま</span>' : '') : S.mcp ? `<button class="iconbtn plusbtn" data-act="todayPlan" aria-label="今日の予定を足す" title="今日の予定を足す">＋</button><button class="iconbtn" data-act="reloadEvents" aria-label="予定を読み込み直す" title="読み込み直す">${ICON.reload}</button>` : ''}</span></h2>`;
  if (!S.mcp) h += `<div class="err">Googleカレンダーにつながっていないので、予定は表示されない（日記は使える）。</div>`;
  if (st.error) h += `<div class="err">${esc(st.error.msg)}${st.error.code === 'approval_required' ? ' <button class="btn sm" data-act="reloadEvents">許可して読み込む</button>' : ''}</div>`;
  if (!rows.some(r => r.kind !== 'now')) {
    h += ro ? `<div class="empty">${d > today() ? 'まだ予定のない日。' : '予定も記録もない日。'}</div>` : `<div class="empty">まだ何もない一日。下の欄から、今の気分を1行で残せる。スコアだけでもいい。</div>`;
    return h;
  }
  const nowFr = () => `<div class="fr fr-now" data-ts="${now}"><time>${hm(now)}</time><div class="c2"><span>いま</span></div></div>`;
  const kidRows = (list, withNow) => {
    let out = ''; let placed = !withNow;
    for (const e of list) {
      if (!placed && e.t > now) { out += nowFr(); placed = true; }
      out += `<div class="fr fr-k${fxc('ent' + e.id, 'new')}" data-ts="${e.t}"><time>${hm(e.t)}</time><div class="c2">${entryBody(e, ro)}</div></div>`;
    }
    if (!placed) out += nowFr();
    return out;
  };
  // 空きの帯：これから（いまより後）なら緑で押せる、過ぎた分は薄く長さだけ
  const gapLI = (from, to) => {
    const ms = to - from; const fut = isToday && from >= now - 6e4;
    if (ms < (fut ? GAP_MIN : 2 * GAP_MIN)) return ''; // 過ぎた時間は30分以上あいたときだけ
    const mins = ms / 6e4;
    // 過ぎた空きでも、ゲームをしていた時間を含むときは、帯と札が見えるように長さに合わせて伸ばす
    const gameIn = !fut && games.some(g => Math.min(g.to, to) - Math.max(g.from, from) >= GAP_MIN);
    const px = gameIn ? Math.round(Math.min(140, Math.max(44, 22 + mins * 0.5))) : fut ? Math.round(Math.min(96, Math.max(30, 22 + mins * 0.3))) : Math.round(Math.min(26, Math.max(14, 8 + mins * 0.06)));
    if (!fut) return `<li class="gap past" style="--h:${px}px" data-ts="${from}" data-te="${to}" aria-label="${durText(ms)}、予定も記録もない時間"><span class="g-t">${durText(ms)}</span></li>`;
    const m = Math.ceil((from - dayStart(d).getTime()) / (15 * 6e4)) * 15;
    return `<li class="gap fut" style="--h:${px}px" data-ts="${from}" data-te="${to}">${S.mcp ? `<button class="g-pill" data-act="calNew" data-arg="${d}@${m}" aria-label="${hm(from)}から${durText(ms)}空いている。この時間に予定を入れる">` : '<span class="g-pill">'}<b>空き</b> ${durText(ms)}${S.mcp ? '<i aria-hidden="true">＋</i></button>' : '</span>'}</li>`;
  };
  const lis = []; let mark = rng ? Math.min(rng.from, rows[0].t) : rows[0].t;
  const y = addDays(d, -1);
  for (const r of rows) {
    if (r.kind === 'wake' && prevSleep && prevSleep < r.t) lis.push(`<li class="gap sleep" data-ts="${prevSleep}" data-te="${r.t}" style="--h:${Math.round(Math.min(34, Math.max(20, 6 + (r.t - prevSleep) / 36e5 * 3)))}px"><span class="g-t">${r.t - prevSleep > 20 * 3600e3 ? `睡眠 ${durText(r.t - prevSleep)}？（前の晩に寝た時刻が違うかも）` : `睡眠 ${durText(r.t - prevSleep)}`}</span></li>`);
    else lis.push(gapLI(mark, r.t));
    if (r.kind === 'slept') {
      lis.push(`<li class="fl fl-slept" data-ts="${r.t}"><time>${hm(r.t)}</time><div class="c2">${ro ? '<span>🌙 前の晩に寝た</span>' : S.timeFix && S.timeFix.key === 'sleep:' + y ? timeFixHTML() : `<span>🌙 前の晩に寝た</span>${fixBtn('sleep:' + y, '前の晩に寝た時刻を直す')}`}</div></li>`);
    } else if (r.kind === 'wake') {
      lis.push(`<li class="fl fl-wake" data-ts="${r.t}"><time>${hm(r.t)}</time><div class="c2">${ro ? '<span>☀ 起きた</span>' : S.timeFix && S.timeFix.key === 'wake:' + d ? timeFixHTML() : `<span>☀ 起きた</span>${fixBtn('wake:' + d, '起きた時刻を直す')}`}${prevSleep ? '' : ro ? '<span class="wk-prev">前の晩の就寝 —</span>' : S.timeFix && S.timeFix.key === 'sleep:' + y ? timeFixHTML() : `<span class="wk-prev">前の晩の就寝 —${fixBtn('sleep:' + y, '前の晩に寝た時刻を直す')}</span>`}</div></li>`);
    } else if (r.kind === 'now') {
      lis.push(`<li class="fl fl-now" data-ts="${now}"><time>${hm(now)}</time><div class="c2"><span>いま</span></div></li>`);
    } else if (r.kind === 'en') {
      lis.push(`<li class="fl fl-en${fxc('ent' + r.e.id, 'new')}" data-ts="${r.e.t}"><time>${hm(r.e.t)}</time><div class="c2">${entryBody(r.e, ro)}</div></li>`);
    } else if (r.kind === 'bed') {
      const x = r.x; const c = calOf(x.cal); const key = x.cal + '|' + x.id; const done = !/目安/.test(x.title);
      lis.push(`<li class="fl fl-bed ${done ? 'done' : ''}" style="--c:${c.color}" data-ts="${x.start}"><time>${hm(x.start)}</time><div class="c2"><span class="bl-t" ${x.ghost ? '' : `data-act="calOpen" data-arg="${esc(key)}"`}>${done ? '🌙 就寝' : '🌙 就寝の目安'}</span></div></li>`);
    } else {
      const x = r.x; const c = calOf(x.cal); const key = x.cal + '|' + x.id; const on = isOn(x);
      const list = (kids.get(key) || []).sort((a, b) => a.t - b.t);
      const state = x.canceled ? '<span class="evstate">キャンセルした</span>' : x.endedAt ? `<span class="evstate">早めに終えた（予定は${hm(x.plannedEnd)}まで）</span>` : '';
      const meta = state + (x.canceled ? '' : bellHTML(x));
      // 中に記録がない予定は1行：左に「始まり／終わり」を縦に並べる。記録があるときは終わりをカードの一番下に
      const solo = !list.length && !on && S.evMenu !== key;
      const endT = x.canceled ? '' : hm(x.end);
      // 今日の流れでは予定をドラッグで動かさない（動かすのはカレンダーの週の画面だけ）
      lis.push(`<li class="ev ${on ? 'is-now' : ''} ${x.canceled ? 'canceled' : ''} ${x.endedAt ? 'ended' : ''}${fxc('moved' + key, 'moved')}" style="--c:${c.color}" data-t="${x.start}" data-ts="${x.start}" data-te="${x.canceled ? x.start : x.end}">`
        + `<div class="fr fr-h"><time${solo && endT ? ` aria-label="${hm(x.start)}から${endT}"` : ''}>${hm(x.start)}${solo && endT ? `<span class="te">${endT}</span>` : ''}</time><div class="c2 ev-head" ${x.ghost ? '' : `data-act="calOpen" data-arg="${esc(key)}"`}>${isToday && !ro ? `<button class="evmore" data-act="evMenu" data-arg="${esc(key)}" aria-label="この予定を終える・キャンセルする" aria-expanded="${S.evMenu === key}">⋯</button>` : ''}<div class="t">${esc(x.title)}</div>${solo ? `<div class="m">${endT ? `<span class="dur">${durText(x.end - x.start)}</span>` : ''}${meta}</div>` : ''}</div></div>`
        + (S.evMenu === key ? `<div class="fr"><span></span><div class="c2">${evMenuHTML(d, x, key)}</div></div>` : '')
        + kidRows(list, on)
        + (solo ? '' : `<div class="fr fr-e"><time${endT ? ` aria-label="終わり ${endT}"` : ''}>${endT}</time><div class="c2 m">${meta}</div></div>`)
        + `</li>`);
    }
    mark = Math.max(mark, r.t, r.busy || 0);
  }
  // 最後の行から寝るまで（就寝の目安の予定がないときは、終わりの印を出す）
  if (rng && rng.to > mark) {
    lis.push(gapLI(mark, rng.to));
    if (!rows.some(r => r.kind === 'bed')) {
      const bt = getDay(d).bedtime;
      if (bt && bt.time && Math.abs(slotDate(d, bt.time).getTime() - rng.to) < 6e4) lis.push(`<li class="fl fl-bed"><time>${bt.time}</time><div class="c2"><span class="bl-t">🌙 就寝の目安</span></div></li>`);
    }
  }
  // ゲームをした時間は、その時間の上に重ねるうすいオレンジの帯（予定にもかぶる）。位置は描いたあとに gameLinesLayout() が決める
  h += `<ul class="flow${games.length ? ' has-games' : ''}${ro ? ' ro' : ''}" data-day="${d}">${lis.join('')}</ul>`;
  return h;
}
// ゲームの帯：今日の流れは時間に比例していないので、行の「時刻→高さ」を並べて、その間を按分して線の上下を決める
function gameLinesLayout() { document.querySelectorAll('ul.flow[data-day]').forEach(gameLinesFor); }
function gameLinesFor(ul) { // ゲームの帯（今日の画面と、カレンダーの月の画面で選んだ日）
  ul.querySelectorAll('.gm-band, .gm-chip').forEach(el => el.remove());
  const d = ul.dataset.day; const games = gameSessions(d); if (!games.length) return;
  const base = ul.getBoundingClientRect().top;
  const pts = [];
  ul.querySelectorAll('[data-ts]').forEach(el => {
    const r = el.getBoundingClientRect(); const ts = Number(el.dataset.ts), te = Number(el.dataset.te);
    if (!ts) return;
    if (te && te > ts) { pts.push([ts, r.top - base]); pts.push([te, r.bottom - base]); }
    else pts.push([ts, r.top - base + Math.min(11, r.height / 2)]);
  });
  if (!pts.length) return;
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (let i = 1; i < pts.length; i++) if (pts[i][1] < pts[i - 1][1]) pts[i][1] = pts[i - 1][1]; // 下へ向かうだけ（重なる予定があっても逆戻りしない）
  const yAt = t => {
    if (t <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      const [t1, y1] = pts[i]; const [t0, y0] = pts[i - 1];
      if (t <= t1) return t1 === t0 ? y1 : y0 + (y1 - y0) * (t - t0) / (t1 - t0);
    }
    return pts[pts.length - 1][1];
  };
  // うすいオレンジの帯を、その時間の上に重ねる（予定のカードにもかぶる）。右下に「🎮 名前 長さ」の札
  const now = Date.now(); const isToday = d === today(); let lastChip = -1e9;
  // 就寝の目安（その日の目安の時刻。なければ「🌙 就寝の目安」の予定の始まり）。過ぎてからの部分は帯を濃く
  const bt = getDay(d).bedtime; const bedEv = effEvents(d).find(x => !x.canceled && /^🌙\s*就寝の目安/.test(x.title || ''));
  const target = bt && bt.time ? slotDate(d, bt.time).getTime() : bedEv ? bedEv.start : null;
  for (const g of games) {
    const y1 = yAt(g.from), y2 = Math.max(y1 + 26, yAt(g.to)); const live = isToday && now - g.to < 7 * 6e4;
    const dur = durText(g.min * 6e4);
    const lateFrom = target && g.to > target ? Math.max(g.from, target) : null;
    const lateTxt = lateFrom ? `\nうち就寝の目安（${hm(target)}）を過ぎてから ${durText(g.to - lateFrom)}` : '';
    const tip = `🎮 ${g.name}\n${hm(g.from)}〜${live ? 'いま' : hm(g.to)}（${dur}${live ? '・続いている' : ''}）${lateTxt}`;
    const band = document.createElement('div');
    band.className = 'gm-band' + (live ? ' live' : ''); band.setAttribute('aria-hidden', 'true');
    band.style.top = y1 + 'px'; band.style.height = (y2 - y1) + 'px';
    ul.appendChild(band);
    if (lateFrom) { // 目安を過ぎてからの部分：同じ帯の上に、もう一段濃い帯を重ねる
      const ly = Math.max(y1, Math.min(y2, yAt(lateFrom)));
      if (y2 - ly >= 2) { const late = document.createElement('div'); late.className = 'gm-band late'; late.setAttribute('aria-hidden', 'true'); late.style.top = ly + 'px'; late.style.height = (y2 - ly) + 'px'; ul.appendChild(late); }
    }
    // 札は帯の右下（行の「⋯」は右上にあるので、かぶりにくい）。前の札と重なるときは少し下へ
    const chipTop = Math.max(y2 - 26, lastChip + 26); lastChip = chipTop;
    const chip = document.createElement('button');
    chip.type = 'button'; chip.className = 'gm-chip' + (live ? ' live' : '') + (lateFrom ? ' late' : '');
    chip.style.top = chipTop + 'px'; chip.dataset.tip = tip; chip.setAttribute('aria-label', tip.replace('\n', ' '));
    chip.innerHTML = `<span class="gm-ic" aria-hidden="true">🎮</span><span class="gm-n">${esc(g.name)}</span><b>${live ? 'プレイ中 ' : ''}${dur}</b>`;
    ul.appendChild(chip);
  }
}
let gameLinesT = 0;
window.addEventListener('resize', () => { clearTimeout(gameLinesT); gameLinesT = setTimeout(gameLinesLayout, 120); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (S.view === 'today' || S.view === 'cal') gameLinesLayout(); });

/* ── 予定の終了・キャンセル（Daylogの記録。.｡oOの予定はカレンダーにも反映） ── */
const evKey = x => x.cal + '|' + x.id;
// その日の予定の控え（days の evsnap）：その日のうちは読むたびに写し直し、日が終わったら固定する。
// 過ぎた日は控えを使うので、あとでカレンダーで予定を動かしたり消したりしても、その日の流れは当時のまま
const evSnapped = d => d < today() && !!(getDay(d).evsnap && Array.isArray(getDay(d).evsnap.list));
const evSource = d => evSnapped(d) ? getDay(d).evsnap.list : ((S.events[d] && S.events[d].list) || []);
function snapEvents(d, list) {
  if (!canWrite() || d > today() || (!S.days[d] && d !== today())) return; // 記録のない昔の日には作らない
  const old = getDay(d).evsnap;
  if (old && d < today()) return;
  const slim = list.map(x => ({ id: x.id, cal: x.cal, title: x.title, start: x.start, end: x.end, allDay: !!x.allDay, ...(x.allDay ? { date: x.date, ed: x.ed, span: x.span, nth: x.nth } : {}) }));
  if (old && JSON.stringify(old.list) === JSON.stringify(slim)) return;
  patchDay(d, { evsnap: { at: Date.now(), list: slim, ...(d < today() ? { late: true } : {}) } });
}
function effEvents(d) {
  const list = evSource(d).map(x => ({ ...x }));
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
const dots = (n, c) => `<span class="dots" style="--c:${c}" aria-label="${n}/5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= Math.round(n) ? 'on' : ''}"></i>`).join('')}</span>`;
function composerToolsHTML() {
  const c = S.comp;
  const pick = (key, label, color) => `<span class="pick" style="--c:${color}" role="group" aria-label="${label}">${label}${[1, 2, 3, 4, 5].map(i => `<button data-act="pick" data-arg="${key}:${i}" class="${c[key] >= i ? 'on' : ''}" aria-label="${label}${i}"><i></i></button>`).join('')}</span>`;
  return `<button class="toggle" data-act="toggleNap" aria-pressed="${c.nap}">💤 昼寝</button>${pick('mood', '気分', 'var(--mood)')}${pick('body', '体調', 'var(--body)')}`;
}
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
  fx('ent' + e.id); patchDay(d, { entries: [...(day.entries || []), e] });
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
    // 寝た時刻：その日の夜（0〜6時は次の日の深夜、起きた時刻より前の朝は次の日の朝）
    const t = sleepSlot(f.d, v); const day = getDay(f.d); const bt = day.bedtime;
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
A.entryDelete = (id, el) => { if (leaveThen(el, '.fl-en, .fr-k', () => A.entryDelete(id))) return;
  const d = today(); const day = getDay(d); const e = (day.entries || []).find(x => x.id === id); if (!e) return;
  patchDay(d, { entries: day.entries.filter(x => x.id !== id) }); S.openEntry = null;
  S.undo = () => { const cur = getDay(d); patchDay(d, { entries: [...(cur.entries || []), { ...e, id: uid() }].sort((a, b) => a.t - b.t) }); };
  toast('記録を消した。', true);
};
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
    if (evId && evId !== 'unknown') { await updateEvent(evId, { startTime: isoLocal(start), endTime: isoLocal(end), summary: BED_TITLE, overrideReminders: pushCoversPhone() ? [] : [{ method: 'popup', minutes: 45 }] }); await patchDay(d, { bedtime: { ...getDay(d).bedtime, eventTime: bt.time } }); if (!quiet) toast(`通知を${bt.time}に合わせた。`); }
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
A.habitToggle = id => { if (!id) return; fx('habit' + id); const d = S.night ? S.night.date : today(); const day = getDay(d); const on = !habitDone(day, id); patchDay(d, { habits: { ...(day.habits || {}), [id]: on, [id + 'At']: on ? Date.now() : null } }); };
A.bathToggle = () => A.habitToggle('bath');
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
