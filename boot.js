// Daylog の起動：ログイン → Googleカレンダーの許可を保存 → データベースとつなぐ → 本体（daylog.js）を読み込む
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const SUPABASE_URL = 'https://etsuxjcrnyoevrasdhde.supabase.co';
// 公開してよい鍵（データは行ごとの権限で本人だけが読み書きできる）
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0c3V4amNybnlvZXZyYXNkaGRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzNDM5OTQsImV4cCI6MjEwOTkxOTk5NH0.ae7iJE6mtN0-wEbiEAaPS5A7j7n3Y_zd-qRVREoBJ9o';
const VERSION = '2026-11-11b';
const GCAL = 'Google Calendar', HOST = 'host:Daylog_PC';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });

const $boot = document.getElementById('boot');
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};

// ── ログイン
async function signIn() {
  await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: location.origin + location.pathname,
      scopes: 'https://www.googleapis.com/auth/calendar',
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
}
window.daylogRelogin = signIn;
window.daylogLogout = async () => { await sb.auth.signOut(); location.reload(); };

function showLogin(msg) {
  $boot.outerHTML = `<div class="login"><h1>Daylog</h1><p>${msg || '自分だけの、一日の記録'}</p>
    <button class="gbtn" id="login"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6C6.6 42.6 14.6 48 24 48z"/></svg>Googleでログイン</button>
    <div class="small">Googleカレンダーの読み書きも、このログインで許可する。</div></div>`;
  document.getElementById('login').onclick = signIn;
}

// ── サーバーの関数（Googleカレンダーの中継・PCの記録のまとめ）
async function fn(action, body = {}) {
  const { data, error } = await sb.functions.invoke('daylog', { body: { action, ...body } });
  if (error) {
    let code = 'unavailable', message = String(error.message || error);
    try { const j = await error.context.json(); if (j && j.error) { code = j.error.code; message = j.error.message; } } catch (_) {}
    throw { code, message };
  }
  return data;
}

// ── データベース（今までの「コレクション／ドキュメント」の形をそのまま再現する）
function makeDb(uid) {
  const cache = new Map(); // collection -> Map(id -> data)
  const listeners = new Set(); // {collection, fn}
  let loaded = false; let failErr = null; const waiters = [];
  let syncAt = null; let syncing = false;
  const col = c => { if (!cache.has(c)) cache.set(c, new Map()); return cache.get(c); };
  const emit = c => { for (const l of listeners) if (l.collection === c) l.fn(); };
  const ready = () => loaded ? Promise.resolve() : new Promise(r => waiters.push(r));

  // 最初の読み込み。失敗したら3回まで試し、それでもだめなら「読めなかった」と知らせる
  // （以前は失敗しても空のまま始めてしまい、空の内容でサーバーの記録を上書きしていた）
  const loadAll = async () => {
    const got = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('docs').select('collection,id,data,updated_at').order('collection').order('id').range(from, from + 999);
      if (error) throw error;
      got.push(...data);
      if (data.length < 1000) break;
    }
    return got;
  };
  (async () => {
    let last;
    for (let i = 0; i < 3; i++) {
      try {
        const t0 = new Date(Date.now() - 5 * 60e3).toISOString();
        const list = await loadAll();
        for (const r of list) col(r.collection).set(r.id, r.data);
        syncAt = t0; loaded = true; waiters.splice(0).forEach(r => r());
        for (const l of listeners) l.fn();
        return;
      } catch (e) { last = e; console.warn('load', e); await new Promise(r => setTimeout(r, 1000 * (i + 1))); }
    }
    console.error('Daylog load failed', last);
    failErr = { code: 'load_failed', message: last && last.message };
    loaded = true; waiters.splice(0).forEach(r => r());
    for (const l of listeners) l.err && l.err(failErr);
  })();
  const writable = () => { if (!loaded || failErr) throw { code: 'not_loaded' }; };

  sb.channel('docs-' + uid)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'docs' }, p => {
      const o = p.old || {}; if (o.user_id && o.user_id !== uid) return;
      if (o.collection && cache.has(o.collection) && cache.get(o.collection).has(o.id)) { cache.get(o.collection).delete(o.id); emit(o.collection); }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: `user_id=eq.${uid}` }, p => {
      if (p.eventType === 'DELETE') return;
      const r = p.new; if (!r || !r.collection) return;
      const cur = col(r.collection).get(r.id);
      if (JSON.stringify(cur) === JSON.stringify(r.data)) return;
      col(r.collection).set(r.id, r.data); emit(r.collection);
    })
    .subscribe();
  // 画面に戻ってきたとき・開いている間は2分ごとに、ほかの端末での変更を取り直す
  // （リアルタイムの接続は切れることがあるので、その取りこぼしを拾う。時刻はサーバー側で付く）
  const sync = async () => {
    if (document.visibilityState !== 'visible' || !loaded || failErr || !syncAt || syncing) return;
    syncing = true;
    try {
      const t0 = new Date(Date.now() - 5 * 60e3).toISOString();
      const { data, error } = await sb.from('docs').select('collection,id,data,updated_at').gte('updated_at', syncAt);
      if (error) return;
      const touched = new Set();
      for (const r of data || []) { if (JSON.stringify(col(r.collection).get(r.id)) !== JSON.stringify(r.data)) { col(r.collection).set(r.id, r.data); touched.add(r.collection); } }
      syncAt = t0; touched.forEach(emit);
    } finally { syncing = false; }
  };
  document.addEventListener('visibilitychange', sync);
  setInterval(sync, 120000);

  const OPS = { '==': (a, b) => a === b, '>=': (a, b) => a >= b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '<': (a, b) => a < b, '!=': (a, b) => a !== b };
  const snapOf = (c, filters) => {
    const docs = [];
    for (const [id, v] of col(c)) if (filters.every(([f, op, val]) => (OPS[op] || OPS['=='])(v && v[f], val))) docs.push({ id, data: () => v, exists: true });
    docs.sort((a, b) => (a.id < b.id ? -1 : 1));
    return { docs, size: docs.length, empty: !docs.length };
  };
  const query = (c, filters = []) => ({
    where: (f, op, val) => query(c, [...filters, [f, op, val]]),
    get: async () => { await ready(); if (failErr) throw failErr; return snapOf(c, filters); },
    onSnapshot(cb, err) {
      const l = { collection: c, fn: () => { if (loaded && !failErr) { try { cb(snapOf(c, filters)); } catch (e) { console.error(e); } } }, err };
      listeners.add(l); if (loaded) { if (failErr) err && err(failErr); else l.fn(); }
      return () => listeners.delete(l);
    },
  });
  const split = path => { const i = path.lastIndexOf('/'); return [path.slice(0, i), path.slice(i + 1)]; };
  const fail = e => { console.error(e); throw { code: e && /quota|limit/i.test(e.message || '') ? 'quota_exceeded' : 'unavailable', message: e && e.message }; };
  return {
    collection: c => query(c),
    doc(path) {
      const [c, id] = split(path);
      return {
        async set(data) {
          writable(); col(c).set(id, data); emit(c);
          const { error } = await sb.from('docs').upsert({ user_id: uid, collection: c, id, data });
          if (error) fail(error);
        },
        async delete() {
          writable(); col(c).delete(id); emit(c);
          const { error } = await sb.from('docs').delete().eq('collection', c).eq('id', id);
          if (error) fail(error);
        },
        async get() { await ready(); if (failErr) throw failErr; const v = col(c).get(id); return { id, exists: v !== undefined, data: () => v }; },
        onSnapshot(cb, err) {
          const l = { collection: c, fn: () => { if (loaded && !failErr) { const v = col(c).get(id); try { cb({ id, exists: v !== undefined, data: () => v }); } catch (e) { console.error(e); } } }, err };
          listeners.add(l); if (loaded) { if (failErr) err && err(failErr); else l.fn(); }
          return () => listeners.delete(l);
        },
      };
    },
  };
}

// ── つなぎ口（Googleカレンダー／PCの見張り役）
function makeMcp(db) {
  const memo = new Map();
  return {
    async listTools(server) {
      if (server === HOST) { const r = await fn('pc_activity', { from: todayStr(), to: todayStr() }); return { servers: r.payload && r.payload.paired ? [{ name: HOST }] : [] }; }
      return { servers: [{ name: GCAL }] };
    },
    async callTool(server, tool, args = {}, opts = {}) {
      if (server === HOST) {
        if (tool === 'get_activity') return fn('pc_activity', { from: args.from, to: args.to });
        if (tool === 'set_config') {
          const cur = await db.doc('pcconfig/main').get();
          await db.doc('pcconfig/main').set({ ...(cur.exists ? cur.data() : {}), ...args, at: Date.now() });
          return { payload: { ok: true } };
        }
        throw { code: 'unknown_tool' };
      }
      const key = tool + JSON.stringify(args);
      const c = opts.cache;
      if (tool === 'list_events' && c && !c.refresh) { const hit = memo.get(key); if (hit && Date.now() - hit.at < (c.staleTime || 120000)) return hit.v; }
      const v = await fn('call', { tool, args });
      if (tool === 'list_events') memo.set(key, { at: Date.now(), v }); else memo.clear();
      return v;
    },
  };
}
const todayStr = () => { const d = new Date(Date.now() - 6 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ── カレンダーのid（名前から探す）
async function loadCalendars() {
  let map = null;
  try {
    const r = await fn('calendars');
    const items = r.items || []; map = {};
    const by = name => (items.find(c => (c.summary || '').trim() === name) || {}).id;
    map.app = by('.｡oO'); map.star = by('★'); map.i1lz = by('𖦹'); map.panda = by('🐼');
    map.main = (items.find(c => c.primary) || {}).id;
    map.holiday = (items.find(c => /#holiday@group\.v\.calendar\.google\.com$/.test(c.id)) || {}).id || 'ja.japanese#holiday@group.v.calendar.google.com';
    store.set('daylog-cals', JSON.stringify(map));
  } catch (e) {
    console.warn('calendars', e);
    try { map = JSON.parse(store.get('daylog-cals') || 'null'); } catch (_) {}
  }
  return map || {};
}

async function start() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { showLogin(); return; }
  if (location.search || location.hash) history.replaceState(null, '', location.pathname);
  // ログインした直後だけ、Googleカレンダーの更新用の鍵がもらえる → サーバーに預ける
  let gcalLinked = null;
  if (session.provider_refresh_token) {
    try { await fn('save_google', { refresh_token: session.provider_refresh_token }); gcalLinked = true; } catch (e) { console.warn(e); }
  }
  $boot.textContent = '予定を読み込み中…';
  window.__daylogCals = await loadCalendars();
  const db = makeDb(session.user.id);
  const mcp = makeMcp(db);
  const user = { id: session.user.id, email: session.user.email, isOwner: async () => true };
  window.claude = {
    use: async name => (name === 'db' ? db : name === 'user' ? user : name === 'mcp' ? mcp : null),
  };
  $boot.remove();
  const s = document.createElement('script');
  s.src = 'daylog.js?v=' + VERSION;
  s.onload = () => { if (gcalLinked === null) fn('google_status').then(r => { if (window.__daylogState) window.__daylogState.gcalLinked = r.linked; }).catch(() => {}); };
  document.body.appendChild(s);
}

sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') location.reload(); });
start().catch(e => { console.error(e); showLogin('読み込みに失敗した。もう一度ログインしてみて。'); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
