// Daylog の記録置き場（アプリ版・claude.ai版で共通）
// ・画面はこの置き場だけを見る。書き込みはまず端末の「送る箱」に入れ、つながっていれば順に送る
// ・送れない（電波がない）ときは箱にためておき、つながったら送る。開き直しても箱は残る
// ・同じ日の記録は差分だけ送り、サーバー側で足し合わせる（スマホとPCでほぼ同時に書いても消えない）
// ・最後に読み込めた内容を端末に覚えておき、電波がないときはそれで開く
(function () {
  'use strict';

  // 差分の足し合わせ（サーバーの public.docs_merge と同じ決まり）
  //   上の段のキーは差分で上書き。entries は id ごとに新しい方（u か t が大きい方、同じなら差分の方）を残し、
  //   entriesDel（消した印）にある id は除く。時刻順に並べる
  const num = v => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));
  const ekey = e => num(e.u) ?? num(e.t) ?? 0;
  const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  function mergeDels(a, b) { return [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].map(String))].sort(cmpStr); }
  function mergeEntries(oldE, newE, del) {
    const by = new Map(); const order = [];
    const put = (e, fromNew) => {
      if (!e || typeof e !== 'object' || e.id == null) return;
      const id = String(e.id); const cur = by.get(id);
      if (!cur) { by.set(id, e); order.push(id); return; }
      if (fromNew ? ekey(e) >= ekey(cur) : ekey(e) > ekey(cur)) by.set(id, e);
    };
    for (const e of Array.isArray(oldE) ? oldE : []) put(e, false);
    for (const e of Array.isArray(newE) ? newE : []) put(e, true);
    const dels = new Set(del);
    return [...by.entries()].filter(([id]) => !dels.has(id)).map(([, e]) => e)
      .sort((a, b) => ((num(a.t) ?? 0) - (num(b.t) ?? 0)) || cmpStr(String(a.id), String(b.id)));
  }
  function mergeDoc(oldD, patch) {
    const o = oldD && typeof oldD === 'object' ? oldD : {}; const p = patch && typeof patch === 'object' ? patch : {};
    const res = { ...o };
    for (const [k, v] of Object.entries(p)) if (k !== 'entries' && k !== 'entriesDel') res[k] = v;
    if ('entries' in p || 'entriesDel' in p) {
      const del = mergeDels(o.entriesDel, p.entriesDel);
      res.entries = mergeEntries(o.entries, p.entries, del);
      if (del.length) res.entriesDel = del; else delete res.entriesDel;
    }
    return res;
  }

  function makeStore(be, opt = {}) {
    const KEY = opt.key || 'daylog';
    const ls = {
      get(k) { try { return localStorage.getItem(KEY + '-' + k); } catch (_) { return null; } },
      set(k, v) { try { localStorage.setItem(KEY + '-' + k, v); } catch (_) {} },
    };
    const cache = new Map(); const listeners = new Set(); const waiters = [];
    let loaded = false, failErr = null, offline = false, cursor = null, syncing = false, syncN = 0, lastErr = null;
    const col = c => { if (!cache.has(c)) cache.set(c, new Map()); return cache.get(c); };
    const emit = c => { for (const l of listeners) if (l.collection === c) l.fn(); };
    const ready = () => (loaded ? Promise.resolve() : new Promise(r => waiters.push(r)));
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // ── 送る箱（端末に残る）
    let outbox = [];
    try { outbox = JSON.parse(ls.get('outbox') || '[]'); if (!Array.isArray(outbox)) outbox = []; } catch (_) { outbox = []; }
    const saveOutbox = () => ls.set('outbox', JSON.stringify(outbox));
    const localAt = new Map(); // この端末で書いた時刻（届く前の古い内容で上書きし返さないため）
    const busy = k => Date.now() - (localAt.get(k) || 0) < 20000 || outbox.some(o => o.c + '/' + o.id === k);
    const status = () => {
      const s = { pending: outbox.length, oldest: outbox.length ? outbox[0].at : null, offline, error: lastErr, loaded: loaded && !failErr };
      try { window.dispatchEvent(new CustomEvent('daylog-db', { detail: s })); } catch (_) {}
      return s;
    };

    // ── 最後に読み込めた内容（電波がないときに開くため）
    let snapT = null;
    const saveSnap = () => {
      clearTimeout(snapT);
      snapT = setTimeout(() => {
        const docs = []; for (const [c, m] of cache) for (const [id, data] of m) docs.push([c, id, data]);
        ls.set('snap', JSON.stringify({ at: Date.now(), owner: opt.owner || '', cursor, docs }));
      }, 1000);
    };
    const readSnap = () => { try { const s = JSON.parse(ls.get('snap') || 'null'); return s && s.owner === (opt.owner || '') && Array.isArray(s.docs) ? s : null; } catch (_) { return null; } };

    const applyLocal = op => {
      const m = col(op.c);
      if (op.op === 'patch') m.set(op.id, mergeDoc(m.get(op.id), op.data));
      else if (op.op === 'set') m.set(op.id, op.data);
      else m.delete(op.id);
    };
    const replay = () => { for (const op of outbox) applyLocal(op); };
    // サーバーからの行を取り込む。この端末で書いている途中の記録は飛ばし、次回また取る（cursor を進めない）
    const applyRows = (rows, skipBusy) => {
      const touched = new Set(); let hold = null; let max = cursor;
      for (const r of rows || []) {
        const k = r.c + '/' + r.id;
        if (skipBusy && busy(k)) { if (hold === null || r.u < hold) hold = r.u; continue; }
        if (max === null || r.u > max) max = r.u;
        const cur = col(r.c).get(r.id);
        if (JSON.stringify(cur) !== JSON.stringify(r.data)) { col(r.c).set(r.id, r.data); touched.add(r.c); }
      }
      cursor = hold !== null && (max === null || hold < max) ? hold : max;
      return touched;
    };

    // ── 最初の読み込み。だめなら3回まで。それでもだめなら、端末に覚えている内容で開く（なければ止める）
    const finishLoad = () => { loaded = true; waiters.splice(0).forEach(r => r()); for (const l of listeners) l.fn(); status(); };
    const fullLoad = async () => {
      const rows = await be.loadAll();
      if (!Array.isArray(rows)) throw { code: 'bad_result' };
      if (opt.mustHave && !rows.some(r => r.c === opt.mustHave)) throw { code: 'empty_result' };
      const before = new Set(cache.keys());
      cache.clear(); cursor = null; applyRows(rows, false); replay();
      for (const c of cache.keys()) before.add(c);
      return before;
    };
    let reloadT = null;
    const reload = async () => {
      clearTimeout(reloadT);
      try { const touched = await fullLoad(); offline = false; touched.forEach(emit); saveSnap(); status(); flush(); }
      catch (_) { reloadT = setTimeout(reload, 15000); }
    };
    (async () => {
      let last;
      for (let i = 0; i < 3; i++) {
        try { await fullLoad(); offline = false; finishLoad(); saveSnap(); flush(); return; }
        catch (e) { last = e; console.warn('Daylog load', e); await sleep(800 * (i + 1)); }
      }
      const snap = readSnap();
      if (snap) {
        for (const [c, id, data] of snap.docs) col(c).set(id, data);
        cursor = snap.cursor ?? null; replay(); offline = true; finishLoad();
        reloadT = setTimeout(reload, 10000);
        return;
      }
      console.error('Daylog load failed', last);
      failErr = { code: 'load_failed', cause: last }; loaded = true; waiters.splice(0).forEach(r => r());
      for (const l of listeners) l.err && l.err(failErr);
      status();
    })();

    // ── 送る
    const writable = () => { if (!loaded || failErr) throw { code: 'not_loaded' }; };
    let flushing = false;
    const flush = async () => {
      if (flushing || !loaded || failErr || !outbox.length) return;
      flushing = true;
      try {
        while (outbox.length) {
          const op = outbox[0];
          try {
            let res;
            if (op.op === 'patch') res = await be.patch(op.c, op.id, op.data);
            else if (op.op === 'set') await be.set(op.c, op.id, op.data);
            else await be.del(op.c, op.id);
            outbox.shift(); saveOutbox(); lastErr = null; if (offline) { offline = false; reload(); }
            // サーバーで足し合わせた結果を反映（まだ送っていない分は、その上に重ねる）
            if (op.op === 'patch' && res && typeof res === 'object') {
              let v = res;
              for (const o of outbox) if (o.c === op.c && o.id === op.id) v = o.op === 'patch' ? mergeDoc(v, o.data) : o.op === 'set' ? o.data : undefined;
              const cur = col(op.c).get(op.id);
              if (v === undefined) col(op.c).delete(op.id); else col(op.c).set(op.id, v);
              if (JSON.stringify(cur) !== JSON.stringify(v)) emit(op.c);
              saveSnap();
            }
          } catch (e) {
            op.tries = (op.tries || 0) + 1;
            const retry = be.retryable ? be.retryable(e) : true;
            if (retry && op.tries < 40) { saveOutbox(); offline = !!(be.isOffline && be.isOffline(e)) || offline; break; }
            // 送っても受け付けてもらえない内容は捨てて知らせる（権限がない・形がおかしい など）
            console.error('Daylog drop write', op, e);
            outbox.shift(); saveOutbox();
            lastErr = { code: (e && e.code) || 'write_failed', message: e && e.message, at: Date.now() };
          }
        }
      } finally { flushing = false; status(); }
    };
    const queue = op => {
      writable();
      op.at = Date.now(); localAt.set(op.c + '/' + op.id, op.at);
      applyLocal(op); emit(op.c);
      outbox.push(op); saveOutbox(); saveSnap(); status();
      flush();
    };

    // ── ほかの端末での変更を取り込む：15秒ごと・画面に戻ったとき・フォーカス時。1分に1回は消された記録も見る
    const sync = async () => {
      if (!loaded || failErr || offline || syncing || document.visibilityState !== 'visible') return;
      syncing = true;
      try {
        const rows = await be.since(cursor);
        const touched = applyRows(rows, true);
        if (++syncN % 4 === 0) {
          const ids = await be.ids();
          if (Array.isArray(ids) && ids.length) {
            const have = new Set(ids.map(r => r.c + '/' + r.id));
            for (const [c, m] of cache) for (const id of [...m.keys()]) if (!have.has(c + '/' + id) && !busy(c + '/' + id)) { m.delete(id); touched.add(c); }
          }
        }
        if (touched.size) { touched.forEach(emit); saveSnap(); }
      } catch (e) { if (be.isOffline && be.isOffline(e)) { offline = true; status(); reloadT = setTimeout(reload, 15000); } }
      finally { syncing = false; }
    };
    document.addEventListener('visibilitychange', () => { sync(); flush(); });
    window.addEventListener('focus', () => { sync(); flush(); });
    window.addEventListener('online', () => { flush(); if (offline) reload(); });
    setInterval(() => { sync(); flush(); }, 15000);
    if (be.live) be.live({
      rows: rows => { if (!loaded || failErr) return; const t = applyRows(rows, true); if (t.size) { t.forEach(emit); saveSnap(); } },
      del: (c, id) => { if (!loaded || failErr || busy(c + '/' + id)) return; if (col(c).has(id)) { col(c).delete(id); emit(c); saveSnap(); } },
      resync: sync,
    });

    // ── 画面向けの形（今までの「コレクション／ドキュメント」の形）
    const OPS = { '==': (a, b) => a === b, '>=': (a, b) => a >= b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '<': (a, b) => a < b, '!=': (a, b) => a !== b };
    const snapOf = (c, f) => {
      const docs = [];
      for (const [id, v] of col(c)) if (f.every(([k, op, val]) => (OPS[op] || OPS['=='])(v && v[k], val))) docs.push({ id, data: () => v, exists: true });
      docs.sort((a, b) => cmpStr(a.id, b.id));
      return { docs, size: docs.length, empty: !docs.length };
    };
    const query = (c, f = []) => ({
      where: (k, op, v) => query(c, [...f, [k, op, v]]),
      get: async () => { await ready(); if (failErr) throw failErr; return snapOf(c, f); },
      onSnapshot(cb, err) {
        const l = { collection: c, err, fn: () => { if (loaded && !failErr) { try { cb(snapOf(c, f)); } catch (e) { console.error(e); } } } };
        listeners.add(l); if (loaded) { if (failErr) err && err(failErr); else l.fn(); }
        return () => listeners.delete(l);
      },
    });
    const split = p => { const i = p.lastIndexOf('/'); return [p.slice(0, i), p.slice(i + 1)]; };
    return {
      collection: c => query(c),
      doc(path) {
        const [c, id] = split(path);
        return {
          async set(data) { queue({ op: 'set', c, id, data }); },
          async update(patch) { queue({ op: 'patch', c, id, data: patch }); },
          async delete() { queue({ op: 'del', c, id }); },
          async get() { await ready(); if (failErr) throw failErr; const v = col(c).get(id); return { id, exists: v !== undefined, data: () => v }; },
          onSnapshot(cb, err) {
            const l = { collection: c, err, fn: () => { if (loaded && !failErr) { const v = col(c).get(id); try { cb({ id, exists: v !== undefined, data: () => v }); } catch (e) { console.error(e); } } } };
            listeners.add(l); if (loaded) { if (failErr) err && err(failErr); else l.fn(); }
            return () => listeners.delete(l);
          },
        };
      },
      status, flush, sync,
    };
  }

  window.DaylogStore = { makeStore, mergeDoc };
})();
