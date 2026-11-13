// claude.ai 版 Daylog のつなぎ：データは Supabase（コネクタの execute_sql）、予定は Google Calendar コネクタ。
// アプリ版（GitHub Pages）と同じデータを読み書きする。
const __rt = (() => {
  const SUPA = 'Supabase', PROJECT = 'etsuxjcrnyoevrasdhde', HOST = 'host:Daylog_PC';
  let mcpP = null; const mcp = () => (mcpP || (mcpP = window.claude.use('mcp')));
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
  // Supabase へは、どんなときも `select api_daylog.call('<JSON>'::jsonb) as r` の形だけを送る。
  // api_daylog.call は権限の小さい役割（daylog_api）で動き、持ち主の記録（docs）の読み書きしかできない
  const SHAPE = /^select api_daylog\.call\((\$d[a-z0-9]+\$)[\s\S]*\1::jsonb\) as r$/;
  async function api(req) {
    const query = `select api_daylog.call(${dollar(JSON.stringify(req))}::jsonb) as r`;
    if (!SHAPE.test(query)) throw { code: 'bad_query' };
    const m = await mcp(); if (!m) throw { code: 'server_not_connected' };
    const res = parse(await m.callTool(SUPA, 'execute_sql', { project_id: PROJECT, query }));
    if (!Array.isArray(res) || !res[0] || !('r' in res[0])) throw { code: 'bad_result' };
    return res[0].r;
  }
  const backend = {
    loadAll: () => api({ a: 'load' }),
    since: cur => api({ a: 'since', since: cur || 0 }),
    ids: () => api({ a: 'ids' }),
    patch: (c, id, patch) => api({ a: 'patch', c, id, patch }),
    set: (c, id, data) => api({ a: 'set', c, id, data }),
    del: (c, id) => api({ a: 'del', c, id }),
    isOffline: e => (typeof navigator !== 'undefined' && navigator.onLine === false) || /network|fetch|offline|timeout/i.test(String((e && e.message) || '')),
    // 形がおかしい・権限がない、はやり直しても通らない。それ以外（つながらない・混んでいる）は送り直す
    retryable: e => !/daylog_api: bad|bad_query|not_granted|not_in_manifest|blocked_by_policy/.test(String((e && (e.code + ' ' + e.message)) || '')),
  };
  const makeDb = () => window.DaylogStore.makeStore(backend, { key: 'daylog-claude', owner: 'claude', mustHave: 'settings' });

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
              if (tool === 'set_config') { const db = await this.use('db'); await db.doc('pcconfig/main').update({ ...args, at: Date.now() }); return { payload: { ok: true } }; }
            }
            if (server === SUPA) throw { code: 'not_allowed', message: 'Supabase は記録置き場からだけ使う' }; // 入口は api_daylog.call だけ
            return m.callTool(server, tool, args, opts);
          },
        };
      }
      return null;
    },
  };
})();
