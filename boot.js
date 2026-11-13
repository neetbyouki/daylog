// Daylog の起動：ログイン → Googleカレンダーの許可を保存 → データベースとつなぐ → 本体（daylog.js）を読み込む
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import './store.js?v=2026-11-13f';

const SUPABASE_URL = 'https://etsuxjcrnyoevrasdhde.supabase.co';
// 公開してよい鍵（データは行ごとの権限で本人だけが読み書きできる）
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0c3V4amNybnlvZXZyYXNkaGRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzNDM5OTQsImV4cCI6MjEwOTkxOTk5NH0.ae7iJE6mtN0-wEbiEAaPS5A7j7n3Y_zd-qRVREoBJ9o';
const VERSION = '2026-11-13l';
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

// ── データベース：記録置き場（store.js、claude.ai版と共通）に、アプリ版のつなぎ方を渡す
const isOfflineErr = e => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const m = String((e && (e.message || e.details)) || e || '');
  return e instanceof TypeError || /Failed to fetch|NetworkError|Load failed|network|fetch failed|timeout/i.test(m);
};
function webBackend(uid) {
  const row = r => ({ c: r.collection, id: r.id, data: r.data, u: r.updated_at });
  const must = ({ data, error }) => { if (error) throw error; return data; };
  return {
    async loadAll() {
      const got = [];
      for (let from = 0; ; from += 1000) {
        const data = must(await sb.from('docs').select('collection,id,data,updated_at').order('collection').order('id').range(from, from + 999));
        got.push(...data.map(row));
        if (data.length < 1000) break;
      }
      return got;
    },
    async since(cur) {
      let q = sb.from('docs').select('collection,id,data,updated_at');
      if (cur) q = q.gte('updated_at', cur);
      return must(await q).map(row);
    },
    async ids() { return must(await sb.from('docs').select('collection,id')).map(r => ({ c: r.collection, id: r.id })); },
    // 差分を送ると、サーバーで足し合わせた結果が返る
    async patch(c, id, patch) { return must(await sb.rpc('docs_patch', { p_col: c, p_id: id, p_patch: patch })); },
    async set(c, id, data) { must(await sb.from('docs').upsert({ user_id: uid, collection: c, id, data })); },
    async del(c, id) { must(await sb.from('docs').delete().eq('collection', c).eq('id', id)); },
    isOffline: isOfflineErr,
    // 送り直せば通りそうな失敗か（電波・ログインの期限切れ・サーバーの一時的な不調）
    retryable(e) {
      if (isOfflineErr(e)) return true;
      const code = String((e && e.code) || ''); const m = String((e && e.message) || '');
      if (/JWT|expired|not signed in|PGRST301|PGRST303|28000/i.test(code + ' ' + m)) return true;
      if (/^(22|23|42)|^PGRST[12]/.test(code)) return false;
      return true;
    },
    live(h) {
      let ch = null; let retry = null;
      const connect = () => {
        if (ch) { sb.removeChannel(ch); ch = null; }
        ch = sb.channel('docs-' + uid)
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'docs' }, p => {
            const o = p.old || {}; if (o.user_id && o.user_id !== uid) return;
            if (o.collection) h.del(o.collection, o.id);
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: `user_id=eq.${uid}` }, p => {
            if (p.eventType === 'DELETE') return;
            const r = p.new; if (r && r.collection) h.rows([row(r)]);
          })
          .subscribe(st => {
            if (st === 'SUBSCRIBED') { h.resync(); return; }
            if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') { clearTimeout(retry); retry = setTimeout(connect, 20000); }
          });
      };
      connect();
    },
  };
}
function makeDb(uid, token) {
  // ログインの鍵をリアルタイム側にも渡してからつなぐ（渡さないと本人の記録の通知が届かない）
  if (token) sb.realtime.setAuth(token);
  sb.auth.onAuthStateChange((ev, ses) => { if (ses && ses.access_token && (ev === 'TOKEN_REFRESHED' || ev === 'SIGNED_IN')) sb.realtime.setAuth(ses.access_token); });
  return window.DaylogStore.makeStore(webBackend(uid), { key: 'daylog', owner: uid });
}

// ── ホーム画面のDaylogから直接通知（Web Push）
const VAPID_PUBLIC = 'BMcRoNXICVHJ9Kh4tl1zPCMuxIXCNFVVdCcTLsfQwg-Jl-zBZETYVrAw9XrU0PVZdjIJXeA8loNKGmujScF0si4';
const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// サービスワーカーの用意を待つ（来ないときは4秒であきらめる）
const swReady = () => Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 4000))]);
const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
window.daylogPush = {
  // 'on' | 'off' | 'denied' | 'need-home'（iPhoneはホーム画面に追加して開く必要がある）| 'unsupported'
  async state() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return isIOS() && !standalone() ? 'need-home' : 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    try { const reg = await swReady(); if (!reg) return 'off'; const sub = await reg.pushManager.getSubscription(); return sub ? 'on' : 'off'; } catch (_) { return 'off'; }
  },
  async enable() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw { code: isIOS() && !standalone() ? 'need-home' : 'unsupported' };
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw { code: 'denied' };
    const reg = await swReady(); if (!reg) throw { code: 'unsupported' };
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID_PUBLIC) });
    const j = sub.toJSON();
    const { error } = await sb.from('push_subs').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 200) }, { onConflict: 'endpoint' });
    if (error) throw { code: 'save_failed', message: error.message };
    return 'on';
  },
  async disable() {
    const reg = await swReady(); const sub = reg && await reg.pushManager.getSubscription();
    if (sub) { await sb.from('push_subs').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
    return 'off';
  },
  async devices() { const { data } = await sb.from('push_subs').select('id'); return (data || []).length; },
  async test() {
    const { data, error } = await sb.functions.invoke('daylog-push', { body: { action: 'test' } });
    if (error) throw { code: 'test_failed', message: error.message };
    return data;
  },
};

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
          await db.doc('pcconfig/main').update({ ...args, at: Date.now() });
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

// 電波がないとログインの更新ができず、ログインが無いように見えることがある → 端末に残っているログインで開く
function storedSession() {
  try { const j = JSON.parse(localStorage.getItem('sb-etsuxjcrnyoevrasdhde-auth-token') || 'null'); return j && j.user && j.user.id ? j : null; } catch (_) { return null; }
}
async function start() {
  let session = null;
  try { ({ data: { session } } = await sb.auth.getSession()); } catch (e) { console.warn(e); }
  if (!session && navigator.onLine === false) session = storedSession();
  if (!session) { showLogin(); return; }
  if (location.search || location.hash) history.replaceState(null, '', location.pathname);
  // ログインした直後だけ、Googleカレンダーの更新用の鍵がもらえる → サーバーに預ける
  let gcalLinked = null;
  if (session.provider_refresh_token) {
    try { await fn('save_google', { refresh_token: session.provider_refresh_token }); gcalLinked = true; } catch (e) { console.warn(e); }
  }
  $boot.textContent = '予定を読み込み中…';
  window.__daylogCals = await loadCalendars();
  const db = makeDb(session.user.id, session.access_token);
  const mcp = makeMcp(db);
  const user = { id: session.user.id, email: session.user.email, isOwner: async () => true };
  window.claude = {
    use: async name => (name === 'db' ? db : name === 'user' ? user : name === 'mcp' ? mcp : null),
  };
  $boot.remove();
  // 天球（orrery.js）を先に読み、続けて本体
  const o = document.createElement('script'); o.src = 'orrery.js?v=' + VERSION; o.async = false; document.body.appendChild(o);
  const s = document.createElement('script'); s.async = false;
  s.src = 'daylog.js?v=' + VERSION;
  s.onload = () => { if (gcalLinked === null) fn('google_status').then(r => { if (window.__daylogState) window.__daylogState.gcalLinked = r.linked; }).catch(() => {}); };
  document.body.appendChild(s);
}

sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') location.reload(); });
start().catch(e => { console.error(e); showLogin('読み込みに失敗した。もう一度ログインしてみて。'); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
