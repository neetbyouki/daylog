// Daylog 本体の部品：メモ：ひとこと、ノート（フォルダ・書く画面・画像）、お気に入り
// ・読み込む順は app/parts.json。全部を1つにつないで、1つの関数の中で動かす（boot.js／tools/build_claude.py）

/* ── メモ（ひとこと＝短いメモ ／ ノート＝フォルダに入れる長いメモ ／ ★＝お気に入り） ── */
const NOTE_TRASH_DAYS = 30;
const MI = {
  star: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.5l-5.1 2.7 1-5.6-4.1-4 5.7-.8z" fill="currentColor"/></svg>',
  starO: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.5l-5.1 2.7 1-5.6-4.1-4 5.7-.8z"/></svg>',
  folder: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>',
  all: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 8.5h8M8 12h8M8 15.5h5"/></svg>',
  trash: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2a1.5 1.5 0 0 0 1.5 1.3h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7"/></svg>',
  chev: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>',
  back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5l-6.5 6.5 6.5 6.5"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  compose: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 4.5H6a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h11.5a2 2 0 0 0 2-2v-6.5"/><path d="M17.8 3.7a1.8 1.8 0 0 1 2.5 2.5L12 14.5l-3.3.8.8-3.3z"/></svg>',
  img: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M20.5 16l-5-5-8.5 8"/></svg>',
  search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>',
};
const liveNotes = () => Object.values(S.notes).filter(n => !n.trashed && !n.local);
const trashNotes = () => Object.values(S.notes).filter(n => n.trashed);
const folderName = id => (id && S.nfolders[id] ? S.nfolders[id].name : '');
const noteWhen = t => { if (!t) return ''; const d = logicalDate(t), td = today(); return d === td ? hm(t) : d === addDays(td, -1) ? '昨日' : d.slice(0, 4) === td.slice(0, 4) ? shortLabel(d) : d.replace(/-/g, '/'); };
const byFavNew = (a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0); // 新しい順（★は並びを変えない）
const starBtn = (act, id, on, what) => { const pop = on ? fxc('star' + id, 'pop') : ''; return `<button class="mstar${on ? ' on' : ''}${pop}" data-act="${act}" data-arg="${id}" aria-pressed="${!!on}" aria-label="${what}をお気に入り${on ? 'から外す' : 'にする'}" title="お気に入り"><span class="mi">${on ? MI.star : MI.starO}</span>${pop ? BURST : ''}</button>`; };
function noteRowHTML(n, opts = {}) {
  const lines = String(n.text || '').split('\n').map(x => x.trim()).filter(Boolean);
  const title = n.title || lines[0] || '新しいノート', rest = lines.slice(1).join(' ');
  const fol = opts.showFolder && n.folder ? `<span class="nr-f">${MI.folder}${esc(folderName(n.folder))}</span>` : '';
  const th = n.imgs && n.imgs.length ? `<img class="nr-th" data-blob="${esc(n.imgs[0])}" alt="">` : '';
  const right = opts.trash
    ? `<div class="nr-act"><button class="btn sm" data-act="noteRestore" data-arg="${n.id}">戻す</button><button class="btn sm nr-kill" data-act="noteDestroy" data-arg="${n.id}">完全に消す</button></div>`
    : starBtn('noteFav', n.id, n.fav, 'このノート');
  return `<li class="nrow"><button class="nr-main" ${opts.trash ? 'disabled' : `data-act="noteOpen" data-arg="${n.id}"`}><span class="nr-t">${esc(title)}</span><span class="nr-s"><span class="nr-d">${noteWhen(n.updatedAt || n.createdAt)}</span>${esc(rest.slice(0, 80)) || '<span class="faint">本文なし</span>'}</span>${fol}</button>${th}${right}</li>`;
}
function memoItemHTML(m) {
  const when = m.createdAt ? `${shortLabel(logicalDate(m.createdAt))} ${hm(m.createdAt)}${m.editedAt ? '（直した）' : ''}` : '';
  if (S.editMemo === m.id) return `<li class="memo editing"><div class="txt"><textarea class="field autosize" id="memo-edit" data-draft rows="2" aria-label="メモを直す。Ctrl＋Enterで保存">${esc(draft('memo-edit', m.text))}</textarea><div class="row" style="margin-top:6px"><span class="spacer"></span><button class="btn ghost sm" data-act="memoEditCancel">やめる</button><button class="btn primary sm" data-act="memoSave" data-arg="${m.id}">保存</button></div></div></li>`;
  const open = S.memoMenu === m.id;
  return `<li class="memo${m.fav ? ' fav' : ''}${fxc('new' + m.id, 'new')}"><div class="txt">${esc(m.text)}<div class="when">${when}</div>${open ? `<div class="mmenu"><button class="link" data-act="memoEdit" data-arg="${m.id}">直す</button><button class="link" data-act="memoToNote" data-arg="${m.id}">ノートにする</button><button class="link" data-act="memoToTask" data-arg="${m.id}">タスクにする</button><button class="link danger" data-act="memoDelete" data-arg="${m.id}">消す</button></div>` : ''}</div><div class="memo-side">${starBtn('memoFav', m.id, m.fav, 'このメモ')}<button class="gmore" data-act="memoMenu" data-arg="${m.id}" aria-expanded="${open}" aria-label="このメモの操作">⋯</button></div></li>`;
}
function memosView() {
  if (S.nOpen && S.notes[S.nOpen]) return '<div id="ne-host" class="ne-host"></div>'; // ノートを開いている間は、書く画面（noteEditor）だけ
  const memos = Object.values(S.memos), notes = liveNotes();
  const favN = memos.filter(m => m.fav).length + notes.filter(n => n.fav).length;
  const tab = S.memoTab || 'quick';
  let h = headerHTML('メモ', `<span>ひとこと ${memos.length}</span><span>ノート ${notes.length}</span>`);
  const q = String(draft('memo-q')).trim();
  // お気に入りは、検索欄の右にある小さな★から（押すと★だけの一覧。もう一度押すと戻る）
  h += `<div class="mbar"><div class="msearch">${MI.search}<input id="memo-q" data-draft type="search" enterkeyhint="search" placeholder="ひとこと・ノートをさがす" value="${esc(draft('memo-q'))}" aria-label="メモをさがす" autocomplete="off">${q ? '<button class="msearch-x" data-act="memoSearchClear" aria-label="さがすのをやめる">×</button>' : ''}</div><button class="mfav-btn${tab === 'fav' ? ' on' : ''}" data-act="memoTab" data-arg="${tab === 'fav' ? (S.memoTabPrev || 'quick') : 'fav'}" aria-pressed="${tab === 'fav'}" aria-label="お気に入り（${favN}件）${tab === 'fav' ? 'を閉じる' : 'を見る'}" title="お気に入り">${tab === 'fav' ? MI.star : MI.starO}${favN ? `<span>${num('fav', favN)}</span>` : ''}</button></div>`;
  if (q) return h + memoSearchHTML(q.toLowerCase());
  if (tab === 'fav') h += `<div class="mfav-head"><span class="mfav-t">${MI.star}お気に入り</span><button class="link" data-act="memoTab" data-arg="${S.memoTabPrev || 'quick'}">閉じる</button></div>`;
  else h += `<div class="mtabs" role="tablist" aria-label="メモの種類">${[['quick', 'ひとこと', memos.length], ['notes', 'ノート', notes.length]].map(([k, l, n]) => `<button role="tab" data-act="memoTab" data-arg="${k}" aria-selected="${tab === k}">${l}<span class="mt-n">${num('mt' + k, n)}</span></button>`).join('')}</div>`;
  if (tab === 'quick') {
    h += `<div class="card" style="margin-top:12px"><div class="form"><div class="line memo-add"><textarea class="field grow autosize" id="memo-text" data-draft rows="1" placeholder="思いついたことを書く（改行できる）" aria-label="メモ。改行できる。Ctrl＋Enterで置く">${esc(draft('memo-text'))}</textarea><button class="btn primary" data-act="memoAdd" aria-label="メモを置く">＋</button></div></div></div>`;
    const list = memos.sort(byFavNew);
    h += list.length ? `<ul class="memos">${list.map(memoItemHTML).join('')}</ul>`
      : `<div class="empty">まだメモはない。建築のアイデア、動画のネタ、買うもの、なんでも置いておける。Enterで改行、＋（PCはCtrl＋Enter）で置く。長く書きたいときや画像を入れたいときは「ノート」へ。</div>`;
    return h;
  }
  if (tab === 'fav') {
    const fn = notes.filter(n => n.fav).sort(byFavNew), fm = memos.filter(m => m.fav).sort(byFavNew);
    if (!fn.length && !fm.length) return h + `<div class="empty">★を付けたひとこととノートがここに集まる。よく見返すものに付けておくと、すぐ開ける。</div>`;
    if (fn.length) h += `<h2 class="sec"><span>ノート</span></h2><ul class="nlist">${fn.map(n => noteRowHTML(n, { showFolder: true })).join('')}</ul>`;
    if (fm.length) h += `<h2 class="sec"><span>ひとこと</span></h2><ul class="memos">${fm.map(memoItemHTML).join('')}</ul>`;
    return h;
  }
  // ノート：フォルダの一覧 → フォルダの中のノート
  const f = S.nFolder;
  if (!f) {
    const folders = Object.values(S.nfolders).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const cnt = id => notes.filter(n => n.folder === id).length, tn = trashNotes().length;
    const row = (id, icon, name, n, extra = '') => `<li class="frow"><button class="fr-main" data-act="nFolder" data-arg="${id}"><span class="fr-i">${icon}</span><span class="fr-n">${esc(name)}</span><span class="fr-c">${n}</span>${MI.chev}</button>${extra}</li>`;
    h += `<div class="nhead"><h2 class="sec"><span>フォルダ</span></h2><button class="btn sm" data-act="nfAddOpen">${MI.plus}フォルダ</button></div>`;
    if (S.nfAdd) h += `<div class="nf-add"><input class="field grow" id="nf-name" data-draft maxlength="40" placeholder="フォルダの名前（例：建築のアイデア）" value="${esc(draft('nf-name'))}" data-enter="nfAdd" autocomplete="off"><button class="btn primary" data-act="nfAdd">作る</button><button class="btn ghost" data-act="nfAddOpen">やめる</button></div>`;
    h += `<ul class="flist">${row('all', MI.all, 'すべてのノート', notes.length)}`;
    for (const fo of folders) {
      if (S.nfEdit === fo.id) { h += `<li class="frow editing"><input class="field grow" id="nf-rename" data-draft maxlength="40" value="${esc(draft('nf-rename', fo.name))}" data-enter="nfRename" data-arg="${fo.id}" aria-label="フォルダの名前"><button class="btn primary sm" data-act="nfRename" data-arg="${fo.id}">保存</button><button class="btn ghost sm" data-act="nfEditCancel">やめる</button></li>`; continue; }
      const open = S.nfMenu === fo.id;
      h += row(fo.id, MI.folder, fo.name, cnt(fo.id), `<button class="gmore" data-act="nfMenu" data-arg="${fo.id}" aria-expanded="${open}" aria-label="このフォルダの操作">⋯</button>${open ? `<div class="mmenu fr-menu"><button class="link" data-act="nfEdit" data-arg="${fo.id}">名前を変える</button><button class="link danger" data-act="nfDelete" data-arg="${fo.id}">フォルダを消す（中のノートは残る）</button></div>` : ''}`);
    }
    if (tn) h += row('trash', MI.trash, '最近削除した項目', tn);
    h += `</ul>`;
    if (!folders.length) h += `<div class="empty">フォルダを作ると、ノートを分けて入れておける（例：建築のアイデア・動画の台本・勉強）。フォルダなしでも「すべてのノート」から書ける。</div>`;
    const recent = notes.sort(byFavNew).slice(0, 5);
    if (recent.length) h += `<h2 class="sec"><span>最近のノート</span></h2><ul class="nlist">${recent.map(n => noteRowHTML(n, { showFolder: true })).join('')}</ul>`;
    h += `<button class="nfab" data-act="noteNew" aria-label="新しいノート">${MI.compose}</button>`;
    return h;
  }
  const trash = f === 'trash', name = f === 'all' ? 'すべてのノート' : trash ? '最近削除した項目' : folderName(f) || 'フォルダ';
  const list = (trash ? trashNotes() : f === 'all' ? notes : notes.filter(n => n.folder === f)).sort(trash ? (a, b) => b.trashed - a.trashed : byFavNew);
  h += `<div class="nhead"><button class="nback" data-act="nFolder" data-arg="">${MI.back}フォルダ</button><h2 class="nh-t">${esc(name)}<span class="mt-n">${list.length}</span></h2></div>`;
  if (trash) h += `<p class="faint small">消したノートは${NOTE_TRASH_DAYS}日たつと完全に消える。それまでは「戻す」で元のフォルダに戻せる。</p>`;
  h += list.length ? `<ul class="nlist">${list.map(n => noteRowHTML(n, { trash, showFolder: f === 'all' })).join('')}</ul>`
    : `<div class="empty">${trash ? '最近消したノートはない。' : 'まだノートはない。右下のボタンで書き始められる。'}</div>`;
  if (!trash) h += `<button class="nfab" data-act="noteNew" aria-label="このフォルダに新しいノート">${MI.compose}</button>`;
  return h;
}
function memoSearchHTML(q) {
  const hit = s => String(s || '').toLowerCase().includes(q);
  const fn = liveNotes().filter(n => hit(n.text) || hit(n.title)).sort(byFavNew), fm = Object.values(S.memos).filter(m => hit(m.text)).sort(byFavNew);
  if (!fn.length && !fm.length) return `<div class="empty">「${esc(q)}」は見つからなかった。</div>`;
  let h = '';
  if (fn.length) h += `<h2 class="sec"><span>ノート ${fn.length}</span></h2><ul class="nlist">${fn.map(n => noteRowHTML(n, { showFolder: true })).join('')}</ul>`;
  if (fm.length) h += `<h2 class="sec"><span>ひとこと ${fm.length}</span></h2><ul class="memos">${fm.map(memoItemHTML).join('')}</ul>`;
  return h;
}
// メモ
A.memoMenu = id => { S.memoMenu = S.memoMenu === id ? null : id; render(); };
A.memoEdit = id => { const m = S.memos[id]; if (!m) return; S.editMemo = id; S.memoMenu = null; S.drafts['memo-edit'] = m.text; render(); setTimeout(() => { const t = $('#memo-edit'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 30); };
A.memoEditCancel = () => { S.editMemo = null; render(); };
A.memoSave = id => { const m = S.memos[id]; if (!m) return; const text = String(S.drafts['memo-edit'] || '').replace(/\n{3,}/g, '\n\n').trim(); if (!text) return; const nm = { ...m, text, editedAt: Date.now() }; S.memos[id] = nm; S.editMemo = null; render(); putDoc('memos/' + id, nm); toast('メモを直した。'); };
A.memoAdd = () => { const text = (S.drafts['memo-text'] || '').replace(/\n{3,}/g, '\n\n').trim(); if (!text) { shake($('#memo-text')); return; } const id = uid(); const m = { id, text, createdAt: Date.now() }; fx('new' + id); S.drafts['memo-text'] = ''; S.memos[id] = m; render(); putDoc('memos/' + id, m); };
A.memoDelete = (id, el) => { if (leaveThen(el, 'li.memo', () => A.memoDelete(id))) return; const m = S.memos[id]; if (!m) return; delete S.memos[id]; render(); delDoc('memos/' + id); S.undo = () => { S.memos[id] = m; render(); putDoc('memos/' + id, m); }; toast('メモを消した。', true); };
A.memoToTask = id => { const m = S.memos[id]; if (!m) return; const tid = uid(); const t = { id: tid, title: m.text.split('\n')[0].slice(0, 120), status: 'open', steps: [], createdAt: Date.now(), fromMemo: id }; S.tasks[tid] = t; delete S.memos[id]; render(); putDoc('tasks/' + tid, t); delDoc('memos/' + id); toast('タスクにした。タスクの画面にある。'); };
/* ── ノートを書く画面（太字・下線・斜体・取り消し線・見出し・リスト・チェックリスト・画像）
   画面の描き直しで消えないよう、この部分だけは自分で持っている要素を #ne-host に差し込む ── */
const NOTE_TAGS = { B: 'b', STRONG: 'b', U: 'u', INS: 'u', I: 'i', EM: 'i', S: 's', STRIKE: 's', DEL: 's', BR: 'br', DIV: 'div', P: 'div', SECTION: 'div', ARTICLE: 'div', HEADER: 'div', FOOTER: 'div', PRE: 'div', TR: 'div', UL: 'ul', OL: 'ol', LI: 'li', H1: 'h2', H2: 'h2', H3: 'h3', H4: 'h3', H5: 'h3', H6: 'h3', BLOCKQUOTE: 'blockquote' };
const NOTE_SKIP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE', 'NOSCRIPT', 'TITLE', 'META', 'LINK', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'VIDEO', 'AUDIO', 'CANVAS']);
// 許した形だけを残す（貼り付け・保存・読み込みのたびに通す）。画像は data-blob の番号だけ（withSrc のときだけ表示用の中身も残す）
function noteClean(root, withSrc) {
  const out = [];
  const walk = n => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { out.push(esc(c.nodeValue)); continue; }
      if (c.nodeType !== 1 || NOTE_SKIP.has(c.tagName)) continue;
      if (c.tagName === 'IMG') {
        const b = c.getAttribute('data-blob');
        if (b && /^[A-Za-z0-9_-]{1,40}$/.test(b)) { const src = withSrc && /^data:image\//.test(c.getAttribute('src') || '') ? ` src="${c.getAttribute('src')}"` : ''; out.push(`<img data-blob="${b}" alt=""${src}>`); }
        continue;
      }
      const t = NOTE_TAGS[c.tagName] || null; const st = (c.getAttribute('style') || '').toLowerCase();
      if (t === 'br') { out.push('<br>'); continue; }
      const wraps = [];
      if (t !== 'b' && /font-weight:\s*(bold|[6-9]00)/.test(st)) wraps.push('b');
      if (t !== 'u' && /text-decoration[^;]*underline/.test(st)) wraps.push('u');
      if (t !== 'i' && /font-style:\s*italic/.test(st)) wraps.push('i');
      if (t !== 's' && /text-decoration[^;]*line-through/.test(st)) wraps.push('s');
      let attrs = '';
      if (t === 'ul' && c.classList.contains('ck')) attrs = ' class="ck"';
      if (t === 'li' && c.getAttribute('data-ck') === '1') attrs = ' data-ck="1"';
      if (t) out.push(`<${t}${attrs}>`); wraps.forEach(w => out.push(`<${w}>`));
      walk(c);
      wraps.reverse().forEach(w => out.push(`</${w}>`)); if (t) out.push(`</${t}>`);
    }
  };
  walk(root);
  return out.join('').replace(/(<div><br><\/div>){3,}/g, '<div><br></div><div><br></div>');
}
const noteParse = html => { const t = document.createElement('template'); t.innerHTML = html || ''; return t.content; }; // template の中は画像も読み込まれず、何も動かない
function noteText(html) { // 一覧と検索に使う、ふつうの文字（行ごと）
  const box = document.createElement('div'); box.innerHTML = noteClean(noteParse(String(html || '').replace(/<img[^>]*>/g, '')));
  const lines = []; let cur = '';
  const BLOCK = new Set(['DIV', 'LI', 'H2', 'H3', 'BLOCKQUOTE', 'UL', 'OL']);
  const walk = n => { for (const c of n.childNodes) { if (c.nodeType === 3) cur += c.nodeValue; else if (c.tagName === 'BR') { lines.push(cur); cur = ''; } else { const blk = BLOCK.has(c.tagName); if (blk && cur) { lines.push(cur); cur = ''; } if (c.tagName === 'LI') cur += c.parentNode && c.parentNode.classList && c.parentNode.classList.contains('ck') ? (c.getAttribute('data-ck') === '1' ? '☑ ' : '☐ ') : '・'; walk(c); if (blk && cur) { lines.push(cur); cur = ''; } } } };
  walk(box); if (cur) lines.push(cur);
  return lines.map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}
// 画像を小さくする：長い辺を1600pxまで、JPEG。大きすぎるときはもう一段小さく
function noteImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      const enc = (max, q) => { const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)); const w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k)); const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h); return { src: cv.toDataURL('image/jpeg', q), w, h }; };
      let r = enc(1600, 0.8); if (r.src.length > 700000) r = enc(1280, 0.72); if (r.src.length > 1100000) r = enc(1024, 0.65);
      resolve(r);
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('この画像は読めなかった')); };
    im.src = url;
  });
}
function fillBlobs(root) { // data-blob の画像に中身を入れる（手元 → 端末 → サーバー）
  if (!S.db || !S.db.blob) return;
  root.querySelectorAll('img[data-blob]').forEach(img => {
    if (img.getAttribute('src')) return; const id = img.dataset.blob;
    const v = S.db.blob.peek(id); if (v && v.src) { img.src = v.src; return; }
    img.classList.add('loading');
    S.db.blob.get(id).then(d => { img.classList.remove('loading'); if (d && d.src) { img.classList.add('reveal'); img.src = d.src; } else img.classList.add('missing'); });
  });
}
const NE = (() => {
  const E = { el: null, id: null, timer: 0, dirty: false, loadedAt: 0, menu: false };
  const BTN = (cmd, label, icon, extra = '') => `<button type="button" class="ne-b" data-cmd="${cmd}" aria-label="${label}" title="${label}" ${extra}>${icon}</button>`;
  const IC = d => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const TOOLS = [
    BTN('bold', '太字（Ctrl＋B）', '<b class="ne-tx">B</b>'), BTN('underline', '下線（Ctrl＋U）', '<u class="ne-tx">U</u>'), BTN('italic', '斜体（Ctrl＋I）', '<i class="ne-tx">I</i>'), BTN('strikeThrough', '取り消し線', '<s class="ne-tx">S</s>'),
    '<span class="ne-sep"></span>',
    BTN('h2', '見出し', '<span class="ne-tx">Aa</span>'), BTN('ul', '箇条書き', IC('<path d="M9.5 7h10M9.5 12h10M9.5 17h10"/><circle cx="5" cy="7" r="1" fill="currentColor"/><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="5" cy="17" r="1" fill="currentColor"/>')),
    BTN('ck', 'チェックリスト', IC('<rect x="3.5" y="4.5" width="6" height="6" rx="1.5"/><path d="M5 7.6l1.2 1.2 2-2.3"/><rect x="3.5" y="13.5" width="6" height="6" rx="1.5"/><path d="M13 7.5h7.5M13 16.5h7.5"/>')),
    '<span class="ne-sep"></span>',
    BTN('img', '画像を入れる', IC('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M20.5 16l-5-5-8.5 8"/>')),
  ].join('');
  function build() {
    const el = document.createElement('div'); el.className = 'ne';
    el.innerHTML = `<div class="ne-top"><button type="button" class="nback ne-back" aria-label="もどる">${MI.back}<span class="ne-fn"></span></button><span class="ne-st" aria-live="polite"></span><span class="spacer"></span><button type="button" class="mstar ne-fav"></button><button type="button" class="gmore ne-more" aria-haspopup="true" aria-label="このノートの操作">⋯</button></div>
      <div class="ne-menu" hidden></div>
      <div class="ne-tools" role="toolbar" aria-label="書式">${TOOLS}</div>
      <div class="ne-meta"></div>
      <div class="ne-body" id="ne-body" contenteditable="true" role="textbox" aria-multiline="true" aria-label="ノートの本文" ></div>
      <input type="file" accept="image/*" multiple hidden class="ne-file">`;
    const body = el.querySelector('.ne-body');
    // 書式ボタン：押しても本文の選択が外れないよう、押した瞬間の動きを止める
    el.querySelector('.ne-tools').addEventListener('pointerdown', e => { if (e.target.closest('.ne-b')) e.preventDefault(); });
    el.querySelector('.ne-tools').addEventListener('click', e => { const b = e.target.closest('.ne-b'); if (b) cmd(b.dataset.cmd); });
    el.querySelector('.ne-back').addEventListener('click', () => A.noteClose());
    el.querySelector('.ne-fav').addEventListener('click', () => { flush(); const n = S.notes[E.id]; if (!n) return; if (!n.fav) fx('star' + E.id); save({ fav: !n.fav }, true); top(); });
    el.querySelector('.ne-more').addEventListener('click', () => { E.menu = !E.menu; menu(); });
    el.querySelector('.ne-menu').addEventListener('click', e => {
      const b = e.target.closest('[data-m]'); if (!b) return; const m = b.dataset.m;
      if (m === 'move') { flush(); save({ folder: b.dataset.f || null }, true); E.menu = false; menu(); top(); toast(b.dataset.f ? `「${folderName(b.dataset.f)}」に移した。` : 'フォルダから出した。'); }
      else if (m === 'copy') { const t = noteText(clean()); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('文字だけコピーした。'), () => toast('コピーできなかった。')); E.menu = false; menu(); }
      else if (m === 'del') { E.menu = false; menu(); A.noteTrash(E.id); }
    });
    body.addEventListener('input', () => { firstLine(); E.dirty = true; status('…'); clearTimeout(E.timer); E.timer = setTimeout(flush, 700); syncTools(); });
    body.addEventListener('blur', () => flush());
    body.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); flush(); }
    });
    // チェックリストの四角を押したら、チェックを付け外し
    body.addEventListener('click', e => {
      const li = e.target.closest && e.target.closest('ul.ck > li'); if (!li || !body.contains(li)) return;
      if (e.clientX - li.getBoundingClientRect().left > 28) return;
      e.preventDefault(); li.dataset.ck = li.dataset.ck === '1' ? '0' : '1'; if (li.dataset.ck === '0') li.removeAttribute('data-ck'); E.dirty = true; flush();
    });
    // 貼り付け：画像はノートに入れ、文字は余計な飾りを落として入れる
    body.addEventListener('paste', e => {
      const dt = e.clipboardData; if (!dt) return;
      const files = [...dt.files].filter(f => /^image\//.test(f.type));
      if (files.length) { e.preventDefault(); addImages(files); return; }
      const html = dt.getData('text/html');
      e.preventDefault();
      if (html) { document.execCommand('insertHTML', false, noteClean(noteParse(html))); tidy(); }
      else document.execCommand('insertText', false, dt.getData('text/plain'));
    });
    body.addEventListener('dragover', e => { if ([...(e.dataTransfer?.items || [])].some(i => i.kind === 'file')) e.preventDefault(); });
    body.addEventListener('drop', e => { const files = [...(e.dataTransfer?.files || [])].filter(f => /^image\//.test(f.type)); if (!files.length) return; e.preventDefault(); const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null; if (r) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); } addImages(files); });
    el.querySelector('.ne-file').addEventListener('change', e => { const files = [...e.target.files]; e.target.value = ''; addImages(files); });
    document.addEventListener('selectionchange', () => { if (E.el && E.el.isConnected && document.activeElement === body) { syncTools(); saveRange(); } });
    return el;
  }
  // 1行目はタイトルの大きさで見せる。1行目が囲まれていない文字のときは div で包む（カーソルの位置はそのまま）
  const INLINE = /^(B|U|I|S|SPAN|BR|STRONG|EM|FONT)$/;
  function firstLine() {
    const body = E.el.querySelector('.ne-body'); const f = body.firstChild;
    if (f && (f.nodeType === 3 || (f.nodeType === 1 && INLINE.test(f.tagName)))) {
      const sel = getSelection(), r = sel.rangeCount ? sel.getRangeAt(0) : null, node = r && body.contains(r.startContainer) ? r.startContainer : null, off = r ? r.startOffset : 0;
      const div = document.createElement('div');
      while (body.firstChild && (body.firstChild.nodeType === 3 || (body.firstChild.nodeType === 1 && INLINE.test(body.firstChild.tagName)))) div.appendChild(body.firstChild);
      body.insertBefore(div, body.firstChild);
      if (node) { try { const r2 = document.createRange(); r2.setStart(node, off); r2.collapse(true); sel.removeAllRanges(); sel.addRange(r2); } catch (_) {} }
    }
    body.classList.toggle('is-empty', !body.textContent.trim() && !body.querySelector('img'));
  }
  let lastRange = null;
  const saveRange = () => { const s = getSelection(); if (s.rangeCount && E.el && E.el.querySelector('.ne-body').contains(s.anchorNode)) lastRange = s.getRangeAt(0).cloneRange(); };
  // 本文から外れていたときだけ、前の位置に戻す（選び直すと、太字などの「次に打つ文字の書式」が消えてしまうため）
  const restoreRange = () => {
    const body = E.el.querySelector('.ne-body'), s = getSelection();
    if (document.activeElement === body && s.rangeCount && body.contains(s.anchorNode)) return;
    body.focus({ preventScroll: true }); if (lastRange && body.contains(lastRange.startContainer)) { s.removeAllRanges(); s.addRange(lastRange); }
  };
  // 貼り付け・画像のあと：ブラウザが勝手に付けた見た目の指定（style）と、意味のない span を外す
  const tidy = () => { const body = E.el.querySelector('.ne-body'); body.querySelectorAll('[style]').forEach(e => e.removeAttribute('style')); body.querySelectorAll('span,font').forEach(e => e.replaceWith(...e.childNodes)); };
  const blockOf = () => { const s = getSelection(); let n = s.anchorNode; const body = E.el.querySelector('.ne-body'); while (n && n !== body) { if (n.nodeType === 1 && /^(DIV|H2|H3|LI|BLOCKQUOTE)$/.test(n.tagName)) return n; n = n.parentNode; } return null; };
  function cmd(c) {
    const body = E.el.querySelector('.ne-body'); restoreRange();
    if (c === 'img') { E.el.querySelector('.ne-file').click(); return; }
    if (c === 'h2') { const b = blockOf(); document.execCommand('formatBlock', false, b && b.tagName === 'H2' ? '<div>' : '<h2>'); }
    else if (c === 'ul' || c === 'ck') {
      const inList = () => { let n = getSelection().anchorNode; while (n && n !== body) { if (n.tagName === 'UL') return n; n = n.parentNode; } return null; };
      let ul = inList();
      if (!ul) { document.execCommand('insertUnorderedList'); ul = inList(); if (ul && c === 'ck') ul.classList.add('ck'); }
      else if (c === 'ck' && !ul.classList.contains('ck')) ul.classList.add('ck');
      else if (c === 'ul' && ul.classList.contains('ck')) { ul.classList.remove('ck'); ul.querySelectorAll('li').forEach(li => li.removeAttribute('data-ck')); }
      else document.execCommand('insertUnorderedList'); // もう一度押すとリストをやめる
    } else document.execCommand(c);
    E.dirty = true; clearTimeout(E.timer); E.timer = setTimeout(flush, 500); syncTools(); saveRange();
  }
  function syncTools() {
    if (!E.el) return; const body = E.el.querySelector('.ne-body');
    for (const b of E.el.querySelectorAll('.ne-b')) {
      const c = b.dataset.cmd; let on = false;
      try {
        if (c === 'strikeThrough') { let n = document.activeElement === body ? getSelection().anchorNode : null; while (n && n !== body && !/^(S|STRIKE|DEL)$/.test(n.tagName || '')) n = n.parentNode; on = !!n && n !== body; } // チェック済みの線は数えない
        else if (['bold', 'underline', 'italic'].includes(c)) on = document.activeElement === body && document.queryCommandState(c);
        else if (c === 'h2') { const bl = document.activeElement === body && blockOf(); on = !!bl && bl.tagName === 'H2'; }
        else if (c === 'ul' || c === 'ck') { let n = document.activeElement === body ? getSelection().anchorNode : null; while (n && n !== body && n.tagName !== 'UL') n = n.parentNode; on = !!n && n !== body && (c === 'ck') === n.classList.contains('ck'); }
      } catch (_) {}
      if (c !== 'img') b.setAttribute('aria-pressed', String(on));
    }
  }
  async function addImages(files) {
    const n = S.notes[E.id]; if (!n) return; restoreRange();
    for (const f of files.slice(0, 10)) {
      status('画像を入れている…');
      try {
        const r = await noteImage(f); const id = 'b' + uid();
        S.db.blob.put(id, { id, note: E.id, mime: 'image/jpeg', w: r.w, h: r.h, src: r.src, at: Date.now() });
        document.execCommand('insertHTML', false, `<img data-blob="${id}" src="${r.src}" alt=""><div><br></div>`); tidy();
        E.imgs.add(id);
      } catch (e) { toast((e && e.message) || '画像を入れられなかった。'); }
    }
    E.dirty = true; flush();
  }
  const clean = () => noteClean(E.el.querySelector('.ne-body'), false);
  function status(t) { const s = E.el && E.el.querySelector('.ne-st'); if (!s || s.textContent === t) return; s.textContent = t; s.classList.remove('swap'); void s.offsetWidth; s.classList.add('swap'); }
  function save(patch, now) {
    const n = S.notes[E.id]; if (!n) return;
    const nd = { ...n, ...patch, updatedAt: Object.keys(patch).every(k => k === 'fav') ? (n.updatedAt || Date.now()) : Date.now() }; delete nd.local;
    const empty = !String(nd.text || '').trim() && !(nd.imgs && nd.imgs.length);
    S.notes[E.id] = nd;
    if (empty && n.local) { S.notes[E.id] = { ...nd, local: true }; return; } // まだ何も書いていない新しいノートは送らない
    putDoc('notes/' + E.id, nd); E.loadedAt = nd.updatedAt;
    if (now) render();
  }
  function flush() {
    clearTimeout(E.timer); if (!E.dirty || !E.el || !S.notes[E.id]) return; E.dirty = false;
    const html = clean(), text = noteText(html);
    const inHtml = [...html.matchAll(/data-blob="([^"]+)"/g)].map(m => m[1]);
    inHtml.forEach(id => E.imgs.add(id));
    const n = S.notes[E.id];
    if (html === n.html) { status(''); return; }
    save({ html, text, title: (text.split('\n')[0] || '').slice(0, 80), imgs: [...new Set([...inHtml, ...[...E.imgs].filter(id => !inHtml.includes(id))])] });
    status('保存した'); setTimeout(() => status(''), 1500); meta();
  }
  function top() {
    const n = S.notes[E.id]; if (!n || !E.el) return;
    const fav = E.el.querySelector('.ne-fav'), pop = n.fav ? fxc('star' + E.id, 'pop') : ''; fav.className = 'mstar ne-fav' + (n.fav ? ' on' : '') + pop; fav.innerHTML = `<span class="mi">${n.fav ? MI.star : MI.starO}</span>${pop ? BURST : ''}`; fav.setAttribute('aria-pressed', String(!!n.fav)); fav.setAttribute('aria-label', n.fav ? 'お気に入りから外す' : 'お気に入りにする');
    const from = S.nFolder && S.nFolder !== 'all' && S.nFolder !== 'trash' ? folderName(S.nFolder) : S.nFolder === 'all' ? 'すべて' : S.memoTab === 'fav' ? '★' : 'ノート';
    E.el.querySelector('.ne-fn').textContent = from || 'ノート';
    meta();
  }
  function meta() { const n = S.notes[E.id]; if (!n || !E.el) return; const t = n.updatedAt || n.createdAt; E.el.querySelector('.ne-meta').textContent = `${t ? new Date(t).toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}${n.folder ? '・' + folderName(n.folder) : ''}`; }
  function menu() {
    const box = E.el.querySelector('.ne-menu'); box.hidden = !E.menu; E.el.querySelector('.ne-more').setAttribute('aria-expanded', String(E.menu));
    if (!E.menu) return; const n = S.notes[E.id] || {};
    const fs = Object.values(S.nfolders).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    box.innerHTML = `<div class="ne-m-l">フォルダに移す</div><div class="ne-m-f">${fs.map(f => `<button type="button" data-m="move" data-f="${f.id}" aria-pressed="${n.folder === f.id}">${MI.folder}${esc(f.name)}</button>`).join('')}<button type="button" data-m="move" data-f="" aria-pressed="${!n.folder}">フォルダなし</button></div>${fs.length ? '' : '<div class="faint small">フォルダはメモの「ノート」で作れる。</div>'}<div class="ne-m-row"><button type="button" class="link" data-m="copy">文字だけコピー</button><button type="button" class="link danger" data-m="del">このノートを消す</button></div>`;
  }
  function load() {
    const n = S.notes[E.id]; const body = E.el.querySelector('.ne-body');
    body.innerHTML = noteClean(noteParse(n.html || ''), false) || '<div><br></div>'; firstLine(); fillBlobs(body);
    try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch (_) {}
    E.imgs = new Set(n.imgs || []); E.dirty = false; E.loadedAt = n.updatedAt || 0; E.menu = false; menu(); top(); status('');
  }
  return {
    mount(host, id) {
      if (!E.el) E.el = build();
      if (E.id !== id) { if (E.id) this.unmount(); E.id = id; load(); if (!S.notes[id].html) setTimeout(() => { const b = E.el.querySelector('.ne-body'); b.focus(); }, 50); }
      if (E.el.parentElement !== host) host.appendChild(E.el);
      top();
    },
    // ほかの端末で書きかえられたとき：書いている途中でなければ取り込む。消されたら閉じる
    sync() {
      if (!E.el || !E.id || !E.el.isConnected) return;
      const n = S.notes[E.id]; if (!n || n.trashed) { E.id = null; S.nOpen = null; render(); return; }
      if ((n.updatedAt || 0) > E.loadedAt && !E.dirty && document.activeElement !== E.el.querySelector('.ne-body')) load();
      else top();
    },
    flush,
    unmount() { // 閉じる：まだ送っていない分を送る。何も書いていない新しいノートは消す
      if (!E.id) return; flush(); const n = S.notes[E.id];
      if (n && n.local) delete S.notes[E.id];
      E.id = null; if (E.el) E.el.remove();
    },
    get id() { return E.id; },
  };
})();
document.addEventListener('visibilitychange', () => { if (document.hidden) NE.flush(); });
window.addEventListener('pagehide', () => NE.flush());

// ── メモの画面の操作
A.memoTab = t => { if (t !== S.memoTab) vt(t === 'fav' || S.memoTab === 'fav' ? 'fade' : 'tabs'); if (t === 'fav' && S.memoTab !== 'fav') S.memoTabPrev = S.memoTab || 'quick'; S.memoTab = t; S.memoMenu = null; S.editMemo = null; window.scrollTo(0, 0); render(); };
A.memoSearchClear = () => { S.drafts['memo-q'] = ''; render(); };
A.memoFav = id => { const m = S.memos[id]; if (!m) return; const nm = { ...m, fav: !m.fav }; if (nm.fav) fx('star' + id); S.memos[id] = nm; render(); putDoc('memos/' + id, nm); };
A.noteFav = id => { const n = S.notes[id]; if (!n) return; const nn = { ...n, fav: !n.fav }; if (nn.fav) fx('star' + id); S.notes[id] = nn; render(); putDoc('notes/' + id, nn); };
A.nFolder = f => { vt(f ? 'fwd' : 'back'); S.nFolder = f || null; S.nfMenu = null; S.memoTab = 'notes'; window.scrollTo(0, 0); render(); };
A.nfAddOpen = () => { S.nfAdd = !S.nfAdd; render(); if (S.nfAdd) setTimeout(() => { const el = $('#nf-name'); if (el) el.focus(); }, 30); };
A.nfAdd = () => { const name = String(S.drafts['nf-name'] || '').trim(); if (!name) return; const id = 'f' + uid(); const f = { id, name: name.slice(0, 40), createdAt: Date.now() }; S.nfolders[id] = f; S.drafts['nf-name'] = ''; S.nfAdd = false; render(); putDoc('nfolders/' + id, f); };
A.nfMenu = id => { S.nfMenu = S.nfMenu === id ? null : id; render(); };
A.nfEdit = id => { S.nfEdit = id; S.nfMenu = null; S.drafts['nf-rename'] = (S.nfolders[id] || {}).name || ''; render(); setTimeout(() => { const el = $('#nf-rename'); if (el) el.focus(); }, 30); };
A.nfEditCancel = () => { S.nfEdit = null; render(); };
A.nfRename = id => { const f = S.nfolders[id]; const name = String(S.drafts['nf-rename'] || '').trim(); if (!f || !name) return; const nf = { ...f, name: name.slice(0, 40) }; S.nfolders[id] = nf; S.nfEdit = null; render(); putDoc('nfolders/' + id, nf); };
A.nfDelete = id => {
  const f = S.nfolders[id]; if (!f) return; const moved = Object.values(S.notes).filter(n => n.folder === id && !n.local);
  delete S.nfolders[id]; S.nfMenu = null; delDoc('nfolders/' + id);
  for (const n of moved) { const nn = { ...n, folder: null }; S.notes[n.id] = nn; putDoc('notes/' + n.id, nn); }
  render();
  S.undo = () => { S.nfolders[id] = f; putDoc('nfolders/' + id, f); for (const n of moved) { const cur = S.notes[n.id]; if (cur) { const nn = { ...cur, folder: id }; S.notes[n.id] = nn; putDoc('notes/' + n.id, nn); } } render(); };
  toast(`フォルダ「${f.name}」を消した。中のノート${moved.length}件は「すべてのノート」にある。`, true);
};
A.noteNew = () => {
  const id = 'n' + uid(), now = Date.now();
  S.notes[id] = { id, folder: S.nFolder && S.nFolder !== 'all' && S.nFolder !== 'trash' ? S.nFolder : null, html: '', text: '', title: '', createdAt: now, updatedAt: now, local: true };
  vt('fwd'); S.nOpen = id; render();
};
A.noteOpen = id => { if (!S.notes[id]) return; vt('fwd'); S.nOpen = id; window.scrollTo(0, 0); render(); };
A.noteClose = () => { vt('back'); NE.unmount(); S.nOpen = null; render(); };
A.noteTrash = id => {
  const n = S.notes[id]; if (!n) return; NE.flush();
  if (NE.id === id) NE.unmount(); S.nOpen = null;
  if (n.local) { delete S.notes[id]; render(); return; }
  const nn = { ...S.notes[id], trashed: Date.now() }; S.notes[id] = nn; putDoc('notes/' + id, nn); render();
  S.undo = () => { const cur = S.notes[id]; if (!cur) return; const back = { ...cur }; delete back.trashed; S.notes[id] = back; putDoc('notes/' + id, back); render(); };
  toast(`ノートを「最近削除した項目」に移した（${NOTE_TRASH_DAYS}日で完全に消える）。`, true);
};
A.noteRestore = id => { const n = S.notes[id]; if (!n) return; const nn = { ...n }; delete nn.trashed; if (nn.folder && !S.nfolders[nn.folder]) nn.folder = null; S.notes[id] = nn; putDoc('notes/' + id, nn); render(); toast('ノートを戻した。'); };
function noteDestroy(id) { const n = S.notes[id]; if (!n) return; delete S.notes[id]; delDoc('notes/' + id); for (const b of n.imgs || []) if (S.db && S.db.blob) S.db.blob.del(b); }
A.noteDestroy = id => { noteDestroy(id); render(); toast('ノートを完全に消した。'); };
// ひとこと → ノート：本文をそのままノートにして開く（元のひとことは消す。元に戻せる）
A.memoToNote = id => {
  const m = S.memos[id]; if (!m) return; const nid = 'n' + uid(), now = Date.now();
  const html = String(m.text).split('\n').map(l => `<div>${esc(l) || '<br>'}</div>`).join('');
  const n = { id: nid, folder: S.nFolder && S.nFolder !== 'all' && S.nFolder !== 'trash' ? S.nFolder : null, html, text: noteText(html), title: String(m.text).split('\n')[0].slice(0, 80), fav: !!m.fav, createdAt: m.createdAt || now, updatedAt: now, fromMemo: id };
  S.notes[nid] = n; delete S.memos[id]; S.memoMenu = null; putDoc('notes/' + nid, n); delDoc('memos/' + id);
  S.memoTab = 'notes'; S.nOpen = nid; render();
  S.undo = () => { if (NE.id === nid) NE.unmount(); S.nOpen = null; delete S.notes[nid]; delDoc('notes/' + nid); S.memos[id] = m; putDoc('memos/' + id, m); S.memoTab = 'quick'; render(); };
  toast('ノートにした。続きを書ける。', true);
};
// 「最近削除した項目」で30日たったノートを片付ける（1日1回）
function purgeNoteTrash() { const lim = Date.now() - NOTE_TRASH_DAYS * 864e5; for (const n of trashNotes()) if (n.trashed < lim) noteDestroy(n.id); }
