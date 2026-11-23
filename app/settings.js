// Daylog 本体の部品：設定：設定の画面、記録の守り（バックアップ・書き出し・エラー）、Daylogからの通知、PCの見張り役
// ・読み込む順は app/parts.json。全部を1つにつないで、1つの関数の中で動かす（boot.js／tools/build_claude.py）

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

/* ── 設定 ── */
function settingsView() {
  const st = S.settings;
  const sw = (key, label, small) => `<div class="item"><div class="l">${label}${small ? `<small>${small}</small>` : ''}</div><button class="switch" role="switch" aria-checked="${!!st[key]}" data-act="toggleSetting" data-arg="${key}" aria-label="${label}"></button></div>`;
  let h = headerHTML('設定', 'もう一度右上のボタンを押すと、もとの画面に戻る');
  const look = st.look === 'classic' ? 'classic' : 'nova';
  h += `<h2 class="sec"><span>見た目</span></h2><div class="card settings"><div class="item"><div class="l">画面の見た目<small>記録はどちらでも同じ。いつでも切り替えられる。</small></div><div class="seg" role="group" aria-label="画面の見た目"><button data-act="setLook" data-arg="nova" aria-pressed="${look === 'nova'}">新しい見た目</button><button data-act="setLook" data-arg="classic" aria-pressed="${look === 'classic'}">前の見た目</button></div></div><div class="item"><div class="l">画面の動き<small>「控えめ」にすると、画面の切りかえや★・チェックの動きを止める。この端末だけの設定。</small></div><div class="seg" role="group" aria-label="画面の動き"><button data-act="setMotion" data-arg="full" aria-pressed="${!motionCalm()}">ふつう</button><button data-act="setMotion" data-arg="calm" aria-pressed="${motionCalm()}">控えめ</button></div></div><div class="item"><div class="l">ペット<small>今日のタブと星空のタブに出す。隠しても、ほしや成長はそのまま。</small></div><div class="seg" role="group" aria-label="ペット"><button data-act="setPet" data-arg="show" aria-pressed="${!S.settings.petHide}">出す</button><button data-act="setPet" data-arg="hide" aria-pressed="${!!S.settings.petHide}">隠す</button></div></div></div>`;
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
  h += backupCardHTML();
  h += `<p class="faint" style="font-size:12px;margin-top:16px">記録は自分のアカウントだけが読み書きできる。アドレスを誰かに送っても、ログインしないと日記は見えない。</p>`;
  return h;
}

/* ── 記録の守り：Googleドライブへの毎週の保存・書き出し・エラーの記録 ── */
const BK_ERR = {
  scope: 'ドライブへの保存がまだ許可されていない。アプリ版で「ログインし直す」を押して、Googleドライブも許可して。',
  needs_reauth: 'Googleの許可が切れた。アプリ版で「ログインし直す」を押して。',
  no_google: 'Googleの許可がまだない。アプリ版で一度ログインし直して。',
  api_off: 'Google Cloud で「Google Drive API」が有効になっていない。有効にすると、次から保存できる。',
};
const mdhm = ts => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${hm(ts)}`; };
const kb = n => (n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB');
function backupState() {
  const m = S.meta || {}; const b = m.backup || {}; const req = m.backupreq || {};
  const waiting = req.at && req.at > (b.reqAt || 0) && Date.now() - req.at < 10 * 60000;
  return { b, waiting };
}
// 画像の置き場所（Storage）の使用量。無料の枠は1GB。設定を開いたときに数える（1分に1回まで）
const IMG_LIMIT = 1024 ** 3;
const mbText = n => (n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(2) + 'GB' : n >= 1024 ** 2 ? (n / 1024 ** 2).toFixed(1) + 'MB' : Math.max(0, Math.round(n / 1024)) + 'KB');
function ensureImgStat(force) {
  const st = S.imgStat || {};
  if (st.loading || (!force && st.at && Date.now() - st.at < 60000) || !S.db || !S.db.imgStat) return;
  S.imgStat = { ...st, loading: true };
  S.db.imgStat().then(r => { S.imgStat = { n: Number(r && r.n) || 0, bytes: Number(r && r.bytes) || 0, at: Date.now() }; })
    .catch(e => { console.warn('Daylog imgStat', e); S.imgStat = { ...st, loading: false, at: Date.now(), err: true }; })
    .finally(() => { if (S.view === 'settings') render(); });
}
function imgStatHTML() {
  const st = S.imgStat || {};
  let txt, pct = 0;
  if (st.n === undefined) txt = st.err ? '数えられなかった。少しして開き直してみて。' : '数えています…';
  else {
    pct = st.bytes / IMG_LIMIT * 100;
    txt = `画像 ${st.n}枚・${mbText(st.bytes)}／1GB（${pct < 0.1 && st.bytes > 0 ? '0.1%未満' : pct.toFixed(pct < 10 ? 1 : 0) + '%'}）`;
    // 残りの枚数：今の平均の大きさで。まだ少ないうちは平均がぶれるので、1枚150KB以上として数える
    if (st.n) { const per = Math.max(st.bytes / st.n, 150 * 1024); txt += `<br>あと約${Math.max(0, Math.floor((IMG_LIMIT - st.bytes) / per)).toLocaleString()}枚入る（1枚${mbText(per)}として）`; }
  }
  const warn = pct >= 80;
  return `<div class="item imgstat"><div class="l">画像の置き場所<small>${txt}${warn ? '<br><span class="bk-err">そろそろいっぱい。古いノートの画像を整理するか、相談してほしい。</span>' : ''}</small>
    <div class="imgbar${warn ? ' warn' : ''}" role="meter" aria-label="画像の置き場所の使用量" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct.toFixed(1)}"><i style="width:${Math.min(100, Math.max(st.bytes ? 1 : 0, pct)).toFixed(2)}%"></i></div></div></div>`;
}
function backupCardHTML() {
  ensureImgStat();
  const { b, waiting } = backupState();
  const web = !!window.daylogRelogin;
  let txt;
  if (waiting) txt = '保存中…（1分ほどかかる）';
  else if (b.ok === false && b.err) txt = `<span class="bk-err">${esc(BK_ERR[b.err] || `保存に失敗した（${b.err}）。少しして「今すぐ保存」を押してみて。`)}</span>${b.at ? `<br>最後に保存できたのは ${mdhm(b.at)}` : ''}`;
  else if (b.ok && b.at) txt = `最後に保存：${mdhm(b.at)}（${b.reason === 'weekly' ? '毎週の自動' : '手動'}・${kb((b.file && b.file.size) || 0)}）`;
  else txt = 'まだ一度も保存していない。';
  const relog = web && b.ok === false && /^(scope|needs_reauth|no_google)$/.test(b.err || '') && !waiting;
  const E = S.errView || {};
  let h = `<h2 class="sec"><span>記録の守り</span></h2><div class="card settings">
    <div class="item"><div class="l">Googleドライブに保存<small>${txt}<br>毎週月曜の朝4:30に、ドライブの「Daylog バックアップ」フォルダへ自動で保存する（新しい12回分を残す）。</small></div><div class="row">${relog ? '<button class="btn sm" data-act="relogin">ログインし直す</button>' : ''}<button class="btn sm${relog ? ' ghost' : ''}" data-act="backupNow" ${waiting ? 'aria-disabled="true"' : ''}>${waiting ? '保存中…' : '今すぐ保存'}</button></div></div>
    <div class="item"><div class="l">ファイルに書き出す<small>記録をまるごと1つのファイル（JSON）にして、この端末に保存する。ノートの画像も入る。</small></div><button class="btn sm" data-act="exportJson" ${S.exporting ? 'aria-disabled="true"' : ''}>${S.exporting ? '書き出し中…' : '書き出す'}</button></div>
    ${imgStatHTML()}
    <div class="item"><div class="l">画面で起きたエラー<small>こわれた動きがあると、自動でここに記録される（90日で消える）。</small></div><button class="btn sm ghost" data-act="showErrors">${E.open ? '閉じる' : '見る'}</button></div>`;
  if (E.open) {
    let body;
    if (E.loading) body = '<p class="faint">読み込み中…</p>';
    else if (E.error) body = `<p class="faint">${esc(E.error)}</p>`;
    else if (!E.list || !E.list.length) body = '<p class="faint">記録されたエラーはない。</p>';
    else body = `<ol class="errlist">${E.list.map(r => `<li><div class="er-h"><b>${esc(r.msg || '?')}</b>${r.n > 1 ? `<span class="er-n">×${r.n}</span>` : ''}</div><div class="er-m">${mdhm(r.at || r.seen)} · ${esc(r.src || '')} ${esc(r.ver || '')}${r.view ? ' · ' + esc(r.view) : ''} · ${esc(r.kind || '')}</div>${r.stack ? `<details><summary>くわしく</summary><pre>${esc(r.stack)}</pre></details>` : ''}</li>`).join('')}</ol><div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn sm ghost" data-act="clearErrors">すべて消す</button></div>`;
    h += `<div class="item errbox">${body}</div>`;
  }
  return h + '</div>';
}
const actBackupNow = () => {
  if (backupState().waiting) return;
  putDoc('meta/backupreq', { at: Date.now() });
  S.meta = { ...(S.meta || {}), backupreq: { at: Date.now() } };
  toast('Googleドライブへの保存を頼んだ。1分ほどで終わる。'); render();
};
async function loadErrors() {
  S.errView = { ...(S.errView || {}), open: true, loading: true, error: null }; render();
  try {
    const list = await window.DaylogStore.errors.list();
    S.errView = { open: true, loading: false, list: Array.isArray(list) ? list : [] };
  } catch (e) {
    const m = String((e && (e.message || e.code)) || e);
    S.errView = { open: true, loading: false, error: /unknown action/.test(m) ? 'エラーを読む仕組みがまだサーバーに入っていない（準備中）。記録自体はされている。' : 'エラーの記録を読めなかった。少しして開き直してみて。' };
  }
  render();
}
const actShowErrors = () => { if (S.errView && S.errView.open) { S.errView = { open: false }; render(); return; } loadErrors(); };
const actClearErrors = async () => {
  try { await window.DaylogStore.errors.clear(); S.errView = { open: true, list: [] }; toast('エラーの記録を消した。'); }
  catch (_) { toast('消せなかった。少しして、もう一度押してみて。'); }
  render();
};
// 書き出し：画面が持っている記録＋ノートの画像を1つのJSONにする
const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
async function buildExport() {
  const cols = S.db && S.db.dump ? S.db.dump() : null;
  if (!cols) throw new Error('no_dump');
  delete (cols.meta || {}).backupreq;
  const ids = new Set(); Object.values(cols.notes || {}).forEach(n => (n && n.imgs || []).forEach(id => ids.add(id)));
  const blobs = {}; let missing = 0;
  if (S.db.blob) for (const id of ids) { const v = await withTimeout(S.db.blob.get(id), 8000); if (v) blobs[id] = v; else missing++; }
  if (Object.keys(blobs).length) cols.blobs = blobs;
  const counts = {}; for (const [c, m] of Object.entries(cols)) counts[c] = Object.keys(m).length;
  return { file: { app: 'Daylog', kind: 'export', format: 1, exportedAt: new Date().toISOString(), counts, collections: cols }, missing };
}
async function saveFile(filename, text) {
  const dl = await (window.claude && window.claude.use ? window.claude.use('downloads').catch(() => null) : null);
  if (dl && dl.save) { await dl.save({ filename, data: text }); return 'saved'; }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000); return 'saved';
}
const actExportJson = async () => {
  if (S.exporting) return;
  S.exporting = true; render();
  try {
    const { file, missing } = await buildExport();
    const d = new Date(); const name = `Daylog-${today()}_${pad(d.getHours())}${pad(d.getMinutes())}-export.json`;
    await saveFile(name, JSON.stringify(file));
    toast(missing ? `書き出した（画像${missing}枚は読めなかったので入っていない）。` : '書き出した。');
  } catch (e) {
    const code = e && e.code;
    toast(code === 'declined' || code === 'dismissed' || code === 'cancelled' ? '書き出しをやめた。' : code === 'not_granted' ? 'ファイルの保存が許可されていない。' : '書き出せなかった。少しして、もう一度押してみて。');
  } finally { S.exporting = false; render(); }
};
A.setMotion = v => { try { if (v === 'calm') localStorage.setItem(MOTION_KEY, 'calm'); else localStorage.removeItem(MOTION_KEY); } catch (_) {} applyMotion(); render(); };
A.setLook = v => { patchSettings({ look: v === 'classic' ? 'classic' : 'nova' }); applyLook(); };
/* ── Daylogから直接通知（ホーム画面のDaylog・アプリ版） ── */
S.push = { state: null, busy: false, msg: '' };
// スマホに Daylog の通知が届くときだけ、Daylog が入れる予定から Googleカレンダーの通知を外す（2回鳴らないように）。
// スマホがまだなら、Googleカレンダーの通知（15分前）を付けたままにする（スマホで何も鳴らない、を防ぐ）
const isPhoneUA = ua => /Android|iPhone|iPad|iPod|Mobile/i.test(String(ua || ''));
function pushCoversPhone() { return !!(S.settings.pushOn && S.settings.pushMobile); }
const devName = ua => { ua = String(ua || ''); const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : 'この端末'; const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : ''; return os + (br && !/iPhone|iPad/.test(os) ? `（${br}）` : ''); };
async function refreshPush() {
  if (!window.daylogPush) { S.push.state = 'elsewhere'; render(); return; }
  try { S.push.state = await window.daylogPush.state(); } catch (_) { S.push.state = 'unsupported'; }
  try {
    S.push.devs = window.daylogPush.list ? await window.daylogPush.list() : null;
    if (S.push.devs) { const mob = S.push.devs.some(x => isPhoneUA(x.ua)); if (!!S.settings.pushMobile !== mob) patchSettings({ pushMobile: mob }); }
  } catch (_) {}
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
  const small = on ? 'この端末に、予定の15分前・就寝目安の45分前・タイマーの終わりに通知が来る（アプリを閉じていても届く）。'
    : st === 'off' ? '予定の15分前・就寝目安の45分前・タイマーの終わりに、アプリを閉じていてもDaylogから通知を出す。'
    : PUSH_MSG[st] || '確認中…';
  // 通知が届く端末。スマホがまだなら、スマホでオンにする手順
  const devs = p.devs || null; const mob = devs && devs.some(x => isPhoneUA(x.ua));
  const devTxt = devs ? (devs.length ? `<br>届く端末：${devs.map(x => esc(devName(x.ua))).join('、')}` : '<br>届く端末：まだない') : '';
  const phoneTip = devs && !mob ? `<br><span class="bk-err">スマホにはまだ届かない。</span>スマホでホーム画面のDaylogを開き、ここで「オンにする」を押すと届く。それまでは、Daylogが入れる予定にGoogleカレンダーの通知（15分前）も付ける。` : '';
  return `<div class="item"><div class="l">Daylogからの通知${on ? ' <span class="pill">オン</span>' : ''}<small>${esc(small)}${devTxt}${phoneTip}${p.msg ? `<br>${esc(p.msg)}` : ''}</small></div><div class="row" style="gap:6px">${btn}</div></div>`;
}
A.pushOn = async () => {
  S.push.busy = true; S.push.msg = ''; render();
  try { await window.daylogPush.enable(); S.push.state = 'on'; refreshPush(); if (!S.settings.pushOn) patchSettings({ pushOn: true }); toast('この端末に通知が来るようにした。「テスト」で確かめられる。'); }
  catch (e) { const c = e && e.code; S.push.msg = PUSH_MSG[c] || '通知をオンにできなかった。' + (e && e.message ? '（' + e.message + '）' : ''); await refreshPush(); }
  finally { S.push.busy = false; render(); }
};
A.pushOff = async () => {
  S.push.busy = true; render();
  try { await window.daylogPush.disable(); S.push.state = 'off'; refreshPush(); const n = await window.daylogPush.devices().catch(() => 1); if (!n) patchSettings({ pushOn: false }); toast('この端末の通知を止めた。'); }
  catch (_) { toast('通知を止められなかった。'); }
  finally { S.push.busy = false; render(); }
};
A.pushTest = async () => {
  S.push.busy = true; render();
  try { const r = await window.daylogPush.test(); toast(r && r.sent ? 'テストの通知を送った。数秒で届く。' : 'テストの通知を送れなかった。オフ→オンをやり直してほしい。'); }
  catch (_) { toast('テストの通知を送れなかった。'); }
  finally { S.push.busy = false; render(); }
};
// 設定
A.relogin = () => { if (window.daylogRelogin) window.daylogRelogin(); };
A.backupNow = actBackupNow; A.showErrors = actShowErrors; A.clearErrors = actClearErrors; A.exportJson = actExportJson;
A.logout = () => { if (window.daylogLogout) window.daylogLogout(); };
A.toggleClaude = () => { patchSettings({ useClaude: S.settings.useClaude === false }); };
A.toggleSetting = k => { patchSettings({ [k]: !S.settings[k] }); schedulePCPush(); };
A.toggleCal = k => { patchSettings({ cals: { ...S.settings.cals, [k]: !(S.settings.cals[k] !== false) } }); S.events = {}; loadEvents(today(), true); };
A.setWake = v => { if (v) patchSettings({ wakeTime: v }); };
A.craftDay = i => { const n = Number(i); const cur = S.settings.craftDays || []; patchSettings({ craftDays: cur.includes(n) ? cur.filter(x => x !== n) : [...cur, n].sort() }); };
A.syncPC = () => syncPC();
A.pushPC = async () => { await pushPCConfig(true); toast(S.pcCfgErr ? 'PCに送れなかった。' : 'PCに設定を送った。'); };
