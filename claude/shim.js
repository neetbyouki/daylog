// claude.ai 版 Daylog のつなぎ：データは Supabase（コネクタの execute_sql）、予定は Google Calendar コネクタ。
// アプリ版（GitHub Pages）と同じデータを読み書きする。
const __rt = (() => {
  const SUPA = 'Supabase', PROJECT = 'etsuxjcrnyoevrasdhde', HOST = 'host:Daylog_PC';
  let mcpP = null; const mcp = () => (mcpP || (mcpP = window.claude.use('mcp')));
  const q = s => "'" + String(s).replace(/'/g, "''") + "'";
  const dollar = s => { let tag; do { tag = '$d' + Math.random().toString(36).slice(2, 8) + '$'; } while (s.includes(tag)); return tag + s + tag; };
  function parse(r) {
    let p = r && r.payload; let txt = typeof p === 'string' ? p : (p && p.result !== undefined ? p.result : null);
    if (txt == null) { const b = r && r.content && r.content.find(c => c.type === 'text'); txt = b ? b.text : '[]'; }
    if (typeof txt !== 'string') return txt;
    try { const j = JSON.parse(txt); if (j && typeof j.result === 'string') txt = j.result; else return j; } catch (_) {}
    // 結果は「…within the below <untrusted-data-ID> boundaries.\n\n<untrusted-data-ID>\n[...]\n</untrusted-data-ID>」の形。
    // 説明文の中にも同じ開始タグがあるので、閉じタグの直前にある開始タグから読む
    const close = txt.match(/<\/untrusted-data-([^>\s]+)>/);
    if (close) {
      const open = '<untrusted-data-' + close[1] + '>';
      const a = txt.lastIndexOf(open, close.index);
      if (a >= 0) return JSON.parse(txt.slice(a + open.length, close.index).trim());
    }
    return JSON.parse(txt);
  }
  async function sql(query) {
    const m = await mcp(); if (!m) throw { code: 'server_not_connected' };
    return parse(await m.callTool(SUPA, 'execute_sql', { project_id: PROJECT, query }));
  }
  async function rows(query) { const r = await sql(`select coalesce(json_agg(x), '[]'::json) as rows from (${query}) x`); return (r && r[0] && r[0].rows) || []; }

  function makeDb() {
    const cache = new Map(); const listeners = new Set(); let loaded = false; let since = 0; const waiters = [];
    const col = c => { if (!cache.has(c)) cache.set(c, new Map()); return cache.get(c); };
    const emit = c => { for (const l of listeners) if (l.collection === c) l.fn(); };
    const ready = () => loaded ? Promise.resolve() : new Promise(r => waiters.push(r));
    const localAt = new Map(); const recent = k => Date.now() - (localAt.get(k) || 0) < 20000;
    const absorb = (list, skipRecent) => { const touched = new Set(); let hold = null; for (const r of list) { if (skipRecent && recent(r.collection + '/' + r.id)) { if (hold === null || r.u < hold) hold = r.u; continue; } if (r.u > since) since = r.u; const cur = col(r.collection).get(r.id); if (JSON.stringify(cur) !== JSON.stringify(r.data)) { col(r.collection).set(r.id, r.data); touched.add(r.collection); } } if (hold !== null && since >= hold) since = hold - 1; return touched; };
    const ALL = `select collection, id, data, (extract(epoch from updated_at) * 1000)::bigint as u from public.docs where user_id = ops.me()`;
    const load = async () => {
      // 読み込みは3回まで試す。空の結果を「記録なし」と取り違えないよう、設定の記録があるかも確かめる（取り違えると空の内容で上書きしてしまう）
      let last;
      for (let i = 0; i < 3; i++) {
        try {
          const list = await rows(ALL);
          if (!Array.isArray(list)) throw { code: 'bad_result' };
          if (!list.some(r => r.collection === 'settings')) throw { code: 'empty_result' }; // 記録はすでにあるので、空なら読み取り失敗とみなす
          absorb(list); loaded = true; waiters.splice(0).forEach(r => r());
          for (const l of listeners) l.fn();
          return;
        } catch (e) { last = e; await new Promise(r => setTimeout(r, 800 * (i + 1))); }
      }
      throw last || { code: 'load_failed' };
    };
    let failErr = null;
    load().catch(e => { console.error('Daylog load failed', e); failErr = { code: 'load_failed', cause: e }; loaded = true; waiters.splice(0).forEach(r => r()); for (const l of listeners) l.err && l.err(failErr); });
    const writable = () => { if (!loaded || failErr) throw { code: 'not_loaded' }; };
    // ほかの端末での変更を15秒ごと・画面に戻ったとき・フォーカスしたときに取り直す（見ているときだけ）。
    // 1分に1回は、ほかで消された記録も反映する。Web版と同じ間隔
    let polling = false, pollN = 0;
    const poll = async () => {
      if (!loaded || failErr || polling || document.visibilityState !== 'visible') return;
      polling = true;
      try {
        const list = await rows(`select collection, id, data, (extract(epoch from updated_at) * 1000)::bigint as u from public.docs where user_id = ops.me() and updated_at > to_timestamp(${since} / 1000.0)`);
        const touched = absorb(list, true);
        if (++pollN % 4 === 0) {
          const ids = await rows(`select collection, id from public.docs where user_id = ops.me()`);
          if (Array.isArray(ids) && ids.length) {
            const have = new Set(ids.map(r => r.collection + '/' + r.id));
            for (const [c, m] of cache) for (const id of [...m.keys()]) if (!have.has(c + '/' + id) && !recent(c + '/' + id)) { m.delete(id); touched.add(c); }
          }
        }
        touched.forEach(emit);
      } catch (_) {} finally { polling = false; }
    };
    setInterval(poll, 15000);
    document.addEventListener('visibilitychange', poll);
    window.addEventListener('focus', poll);

    const OPS = { '==': (a, b) => a === b, '>=': (a, b) => a >= b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '<': (a, b) => a < b, '!=': (a, b) => a !== b };
    const snapOf = (c, f) => { const docs = []; for (const [id, v] of col(c)) if (f.every(([k, op, val]) => (OPS[op] || OPS['=='])(v && v[k], val))) docs.push({ id, data: () => v, exists: true }); docs.sort((a, b) => (a.id < b.id ? -1 : 1)); return { docs, size: docs.length, empty: !docs.length }; };
    const query = (c, f = []) => ({
      where: (k, op, v) => query(c, [...f, [k, op, v]]),
      get: async () => { await ready(); if (failErr) throw failErr; return snapOf(c, f); },
      onSnapshot(cb, err) { const l = { collection: c, fn: () => { if (loaded && !failErr) { try { cb(snapOf(c, f)); } catch (e) { console.error(e); } } }, err }; listeners.add(l); if (loaded) { if (failErr) err && err(failErr); else l.fn(); } return () => listeners.delete(l); },
    });
    const split = p => { const i = p.lastIndexOf('/'); return [p.slice(0, i), p.slice(i + 1)]; };
    return {
      collection: c => query(c),
      doc(path) {
        const [c, id] = split(path);
        return {
          async set(data) { writable(); col(c).set(id, data); localAt.set(c + '/' + id, Date.now()); emit(c); await sql(`select ops.put(${q(c)}, ${q(id)}, ${dollar(JSON.stringify(data))}::jsonb) is not null as ok`); },
          async delete() { writable(); col(c).delete(id); localAt.set(c + '/' + id, Date.now()); emit(c); await sql(`select ops.del(${q(c)}, ${q(id)}) as ok`); },
          async get() { await ready(); const v = col(c).get(id); return { id, exists: v !== undefined, data: () => v }; },
          onSnapshot(cb, err) { const l = { collection: c, fn: () => { if (loaded && !failErr) { const v = col(c).get(id); try { cb({ id, exists: v !== undefined, data: () => v }); } catch (e) { console.error(e); } } }, err }; listeners.add(l); if (loaded) { if (failErr) err && err(failErr); else l.fn(); } return () => listeners.delete(l); },
        };
      },
    };
  }

  let dbP = null;
  return {
    async use(name) {
      if (name === 'db') { const m = await mcp(); if (!m) return null; return dbP || (dbP = makeDb()); }
      if (name === 'user') return window.claude.use('user');
      if (name === 'mcp') {
        const m = await mcp(); if (!m) return null;
        return {
          // PCの記録は、見張り役が送るたびにデータベースの中でまとめているので、ここでは読むだけ
          listTools: async server => (server === HOST ? { servers: [{ name: HOST }] } : m.listTools(server)),
          callTool: async (server, tool, args, opts) => {
            if (server === HOST) {
              if (tool === 'get_activity') return { payload: { days: [] } };
              if (tool === 'set_config') { const db = await this.use('db'); const cur = await db.doc('pcconfig/main').get(); await db.doc('pcconfig/main').set({ ...(cur.exists ? cur.data() : {}), ...args, at: Date.now() }); return { payload: { ok: true } }; }
            }
            return m.callTool(server, tool, args, opts);
          },
        };
      }
      return null;
    },
  };
})();
