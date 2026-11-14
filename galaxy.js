/* Daylog 銀河（星空タブの本体。WebGLで描く）
   ・1年＝12個の銀河、1か月＝1つの渦巻銀河、1日＝渦の腕の上の小さな星座。奥へ進むほど拡大していく（年 → 月 → 日）
   ・ちり（背景の粒）はGPUで描き、記録の星・線・文字は上に重ねた2Dの面にくっきり描く
   ・この部品は星空タブを初めて開いたときに読み込む。開くまでは何も動かさない（起動を遅くしない）
   ・WebGLが使えない端末では attach が false を返し、本体（daylog.js）が前の描きかたで出す
   使いかた: DaylogGalaxy.attach(host, api) / DaylogGalaxy.detach() */
(() => {
  'use strict';
  const TAU = Math.PI * 2, STD_TILT = 0.76, CL = 0.15, OMEGA = 0.012;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const pad = n => String(n).padStart(2, '0');
  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  function rng(seed) {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const daysIn = mk => { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  const wdOf = d => { const [y, m, dd] = d.split('-').map(Number); return WD[new Date(y, m - 1, dd).getDay()]; };
  // 日 i（0始まり）が渦の腕のどこにあるか：内側が月初、外側が月末。2本の腕に交互に並ぶ
  const armOf = (i, n) => { const t = n > 1 ? i / (n - 1) : 0; return { r: 0.2 + 0.76 * t, th: (i % 2) * Math.PI + t * 2.2 * Math.PI + 0.4 }; };

  const E = {
    el: null, gl: null, api: null, sky: null, dead: false, w: 0, h: 0, dpr: 1,
    cam: { x: 0, y: 0, z: 1 }, tr: null, spin: 0, vel: 0, time: 0, last: 0, raf: 0, fade: 0,
    gal: new Map(), year: 0, months: new Map(), yearStat: null, dayF: new Map(), dayT0: 0,
    hits: [], hover: null, drag: null, meteor: null, nextMeteor: 6, skip: false, quality: 1, ft: [], ready: false,
    rm: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  };

  /* ────────────── GL ────────────── */
  const VS_P = `attribute vec4 a_p;attribute vec4 a_c;
uniform vec2 u_res,u_center;uniform float u_scale,u_rot,u_tilt,u_pa,u_wind,u_alpha,u_time,u_dpr,u_psize,u_dof;uniform vec3 u_tint;
varying vec4 v_c;
void main(){
  float a=a_p.y+u_wind*a_p.x-u_rot;
  vec3 q=vec3(a_p.x*cos(a),a_p.x*sin(a),a_p.z);
  float ct=cos(u_tilt),st=sin(u_tilt);
  vec2 s=vec2(q.x,q.y*ct-q.z*st);
  float depth=q.y*st+q.z*ct;
  float cp=cos(u_pa),sp=sin(u_pa);
  s=vec2(s.x*cp-s.y*sp,s.x*sp+s.y*cp);
  vec2 px=u_center+s*u_scale;
  gl_Position=vec4(px.x/u_res.x*2.0-1.0,1.0-px.y/u_res.y*2.0,0.0,1.0);
  float tw=0.78+0.22*sin(u_time*(0.5+a_c.a*1.9)+a_c.a*61.0);
  float blur=1.0+abs(depth)*u_dof;
  float ps=a_p.w*u_psize*blur*(1.0+depth*0.18);
  gl_PointSize=max(ps,1.0)*u_dpr;
  v_c=vec4(a_c.rgb*u_tint,u_alpha*tw*min(1.0,ps)/(blur*blur));
}`;
  const FS_P = `precision mediump float;varying vec4 v_c;
void main(){vec2 d=gl_PointCoord-0.5;float r2=dot(d,d);if(r2>0.25)discard;float a=exp(-r2*15.0)-0.023;gl_FragColor=vec4(v_c.rgb*v_c.a*a,1.0);}`;
  const VS_Q = `attribute vec2 a_q;uniform vec2 u_res,u_center,u_size;uniform float u_pa;varying vec2 v_q;
void main(){v_q=a_q;vec2 s=a_q*u_size;float cp=cos(u_pa),sp=sin(u_pa);s=vec2(s.x*cp-s.y*sp,s.x*sp+s.y*cp);vec2 px=u_center+s;
gl_Position=vec4(px.x/u_res.x*2.0-1.0,1.0-px.y/u_res.y*2.0,0.0,1.0);}`;
  const FS_Q = `precision mediump float;varying vec2 v_q;uniform vec4 u_color;
void main(){float d=length(v_q);if(d>1.0)discard;float a=pow(1.0-d,2.2);gl_FragColor=vec4(u_color.rgb*u_color.a*a,1.0);}`;

  function program(gl, vs, fs) {
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader'); return s; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u, a: name => gl.getAttribLocation(p, name) };
  }
  // 渦巻銀河のちり：中心のふくらみ・短い棒・2本の腕・うすい円盤・まわりのかさ。先頭から何個使っても同じ形になるよう、順番はばらばら
  function buildDust(N) {
    const R = rng('daylog-galaxy-1'); const P = new Float32Array(N * 8);
    const g = () => (R() + R() + R() + R() - 2) / 0.577;
    const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    const CREAM = [1, 0.9, 0.74], GOLD = [1, 0.74, 0.42], BLUEW = [0.72, 0.84, 1], VIOLET = [0.56, 0.58, 1], PINK = [1, 0.46, 0.72], TEAL = [0.45, 1, 0.9], ICE = [0.78, 0.9, 1];
    for (let i = 0; i < N; i++) {
      const u = R(); let r, th, z, size, col, lum;
      if (u < 0.15) { // 中心のふくらみ
        r = Math.abs(g()) * 0.07 + R() * 0.02; th = R() * TAU; z = g() * 0.03 * Math.max(0.2, 1 - r * 4);
        size = 1.1 + R() * 1.4; col = mix(CREAM, GOLD, R()); lum = 0.5 + R() * 0.25;
      } else if (u < 0.21) { // 腕の付け根をつなぐ短い棒
        r = R() * 0.21; th = 0.4 + (R() < 0.5 ? 0 : Math.PI) + g() * 0.22; z = g() * 0.012;
        size = 1 + R() * 1.2; col = mix(CREAM, GOLD, R() * 0.7); lum = 0.42;
      } else if (u < 0.8) { // 腕
        const arm = R() < 0.5 ? 0 : 1; const t = Math.pow(R(), 0.85) * 1.16 - 0.02; const rr = 0.2 + 0.76 * t;
        const wide = R() < 0.3 ? 2.6 : 1;
        th = arm * Math.PI + t * 2.2 * Math.PI + 0.4 + g() * 0.06 / Math.max(0.16, rr) * wide; r = rr + g() * 0.03 * wide; z = g() * 0.012;
        col = t < 0.5 ? mix(CREAM, BLUEW, t / 0.5) : mix(BLUEW, VIOLET, (t - 0.5) / 0.66);
        size = 1.25 + R() * 1.5; lum = 0.55 + R() * 0.35;
        const k = R();
        if (k < 0.065) { col = PINK; size = 1.6 + R() * 1.8; lum = 0.6; } // 星が生まれている場所
        else if (k < 0.1) { col = ICE; size = 2.4 + R() * 2; lum = 0.95; } // 明るい若い星
        else if (k < 0.118) { col = TEAL; size = 1.4 + R() * 1.2; lum = 0.55; }
        if (t > 1) lum *= Math.max(0, 1 - (t - 1) / 0.14);
      } else if (u < 0.95) { // 腕のあいだのうすい円盤
        r = Math.sqrt(R()) * 0.98; th = R() * TAU; z = g() * 0.014; size = 0.9 + R() * 0.8; col = [0.6, 0.66, 0.95]; lum = 0.2 + R() * 0.14;
      } else { // まわりのかさ
        r = Math.pow(R(), 0.6) * 1.25; th = R() * TAU; z = g() * 0.24; size = 0.9 + R() * 1; col = [0.85, 0.88, 1]; lum = 0.16 + R() * 0.12;
      }
      P.set([r, th, z, size, col[0] * lum, col[1] * lum, col[2] * lum, R()], i * 8);
    }
    return P;
  }
  function buildBg(N) {
    const R = rng('daylog-bg-1'); const P = new Float32Array(N * 8);
    for (let i = 0; i < N; i++) {
      const lum = 0.14 + Math.pow(R(), 3) * 0.75; const tint = R();
      const col = tint < 0.2 ? [1, 0.86, 0.7] : tint < 0.5 ? [0.75, 0.85, 1] : [1, 1, 1];
      P.set([Math.sqrt(R()) * 1.35, R() * TAU, 0, 0.9 + Math.pow(R(), 4) * 2.2, col[0] * lum, col[1] * lum, col[2] * lum, R()], i * 8);
    }
    return P;
  }
  function initGL() {
    const gl = E.gl;
    E.pp = program(gl, VS_P, FS_P); E.qp = program(gl, VS_Q, FS_Q);
    const low = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || Math.min(screen.width, screen.height) < 500;
    E.N = low ? 10000 : 18000; E.nMini = low ? 1100 : 1600; E.nBg = 700;
    E.dustBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, E.dustBuf); gl.bufferData(gl.ARRAY_BUFFER, buildDust(E.N), gl.STATIC_DRAW);
    E.bgBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, E.bgBuf); gl.bufferData(gl.ARRAY_BUFFER, buildBg(E.nBg), gl.STATIC_DRAW);
    E.quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, E.quadBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.clearColor(0.006, 0.01, 0.024, 1);
    E.ready = true;
  }

  /* ────────────── 画面の部品 ────────────── */
  function build() {
    const el = document.createElement('div'); el.className = 'gx';
    el.innerHTML = `<canvas class="gx-gl"></canvas><canvas class="gx-ov"></canvas>
      <div class="gx-hud"><button class="gx-back" type="button" aria-label="ひとつ外へ戻る"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 6l-6 6 6 6"/></svg></button><div><div class="gx-title"></div><div class="gx-sub"></div></div></div>
      <div class="gx-rail" role="slider" tabindex="0" aria-orientation="horizontal"></div>`;
    const cv = el.querySelector('.gx-gl');
    let gl = null;
    try { gl = cv.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false }); } catch (_) {}
    if (!gl) return false;
    E.el = el; E.cv = cv; E.gl = gl; E.ov = el.querySelector('.gx-ov'); E.ctx = E.ov.getContext('2d');
    try { initGL(); } catch (e) { console.warn('galaxy', e); E.el = null; return false; }
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); E.ready = false; cancelAnimationFrame(E.raf); E.raf = 0; });
    cv.addEventListener('webglcontextrestored', () => { try { initGL(); kick(); } catch (_) { E.dead = true; if (E.api) E.api.failed(); } });
    cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', () => { E.drag = null; });
    cv.addEventListener('pointerleave', () => { if (E.hover && !E.hover.rail) { E.hover = null; hud(); kick(); } });
    el.querySelector('.gx-back').addEventListener('click', () => E.api && E.api.pick({ up: true }));
    const rail = E.rail = el.querySelector('.gx-rail');
    const railIdx = e => { const n = rail.children.length; if (!n) return -1; const b = rail.getBoundingClientRect(); const pl = parseFloat(getComputedStyle(rail).paddingLeft) || 0; return clamp(Math.floor((e.clientX - b.left - pl) / ((b.width - pl * 2) / n)), 0, n - 1); };
    const railHover = i => { const it = E.railItems && E.railItems[i]; if (!it) return; E.hover = { rail: true, key: it.key, i }; railMark(); hud(); kick(); };
    rail.addEventListener('pointerdown', e => { rail.setPointerCapture(e.pointerId); E.railDown = true; railHover(railIdx(e)); });
    rail.addEventListener('pointermove', e => { if (E.railDown || e.pointerType === 'mouse') railHover(railIdx(e)); });
    rail.addEventListener('pointerup', e => { if (!E.railDown) return; E.railDown = false; const it = E.railItems[railIdx(e)]; E.hover = null; if (it) pickRail(it); });
    rail.addEventListener('pointercancel', () => { E.railDown = false; E.hover = null; railMark(); hud(); });
    rail.addEventListener('pointerleave', () => { if (!E.railDown && E.hover && E.hover.rail) { E.hover = null; railMark(); hud(); kick(); } });
    rail.addEventListener('keydown', e => {
      const n = E.railItems ? E.railItems.length : 0; if (!n) return;
      let i = E.hover && E.hover.rail ? E.hover.i : railSel();
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') i = Math.min(n - 1, i + 1); else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') i = Math.max(0, i - 1);
      else if (e.key === 'Home') i = 0; else if (e.key === 'End') i = n - 1;
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const it = E.railItems[i]; E.hover = null; if (it) pickRail(it); return; }
      else return;
      e.preventDefault(); railHover(i);
    });
    rail.addEventListener('blur', () => { if (E.hover && E.hover.rail) { E.hover = null; railMark(); hud(); kick(); } });
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (E.el && E.el.isConnected && resize()) { snap(); kick(); } }).observe(el);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
    E.spr = {};
    return true;
  }
  function pickRail(it) { if (it.month) E.api.pick({ month: it.month }); else E.api.pick({ day: it.day }); }
  function sprite(kind) {
    if (E.spr[kind]) return E.spr[kind];
    const c = (E.api.colors[kind] || '#ffffff'); const n = parseInt(c.slice(1), 16); const rgb = `${n >> 16},${(n >> 8) & 255},${n & 255}`;
    const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const x = cv.getContext('2d'), m = S / 2;
    const g = x.createRadialGradient(m, m, 0, m, m, m);
    g.addColorStop(0, '#fff'); g.addColorStop(0.07, `rgba(${rgb},1)`); g.addColorStop(0.17, `rgba(${rgb},.72)`); g.addColorStop(0.2, `rgba(${rgb},.3)`); g.addColorStop(0.5, `rgba(${rgb},.07)`); g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    if (kind === 'night' || kind === 'gold') { // 光の筋
      const len = kind === 'night' ? m : m * 0.6; x.globalCompositeOperation = 'lighter';
      for (const [dx, dy] of [[1, 0], [0, 1]]) { const lg = x.createLinearGradient(m - dx * len, m - dy * len, m + dx * len, m + dy * len); lg.addColorStop(0, `rgba(${rgb},0)`); lg.addColorStop(0.5, `rgba(${rgb},.85)`); lg.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = lg; x.fillRect(dx ? m - len : m - 1, dy ? m - len : m - 1, dx ? len * 2 : 2, dy ? len * 2 : 2); }
    }
    return (E.spr[kind] = cv);
  }
  function resize() {
    const host = E.el.parentElement; if (!host) return false;
    const w = Math.round(host.clientWidth); if (!w) return false;
    const h = Math.round(clamp(w * (w > 520 ? 0.8 : 1.1), 340, 640));
    const dpr = Math.min(E.quality < 1 ? 1.5 : 2, window.devicePixelRatio || 1);
    if (w === E.w && h === E.h && dpr === E.dpr) return false;
    E.w = w; E.h = h; E.dpr = dpr; E.el.style.height = h + 'px';
    for (const c of [E.cv, E.ov]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    E.font = getComputedStyle(document.body).fontFamily;
    layout(); return true;
  }
  // 1年の並び（世界の座標＝年の画面でのピクセル）と、月・日の画面での拡大率
  function layout() {
    const { w, h } = E; const top = 50, bottom = 58;
    const cols = w > 520 ? 4 : 3, rows = 12 / cols, cw = w / cols, ch = (h - top - bottom) / rows;
    E.r0 = Math.min(cw, ch) * 0.45; E.ax = w / 2; E.ay = h / 2 - 4;
    E.Rm = Math.min(w * 0.5, (h - 96) * 0.5 / Math.cos(STD_TILT)) * 0.92; E.Zm = E.Rm / E.r0;
    E.Sd = Math.min(w, h - 120) * 0.8; E.Zd = E.Sd / (CL * E.r0);
    for (const g of E.gal.values()) {
      const col = (g.m - 1) % cols, row = Math.floor((g.m - 1) / cols);
      g.wx = cw * (col + 0.5) + g.jx * cw * 0.1; g.wy = top + ch * (row + 0.46) + g.jy * ch * 0.08;
    }
  }
  function ensureYear(y) {
    if (E.year === y && E.gal.size) return false;
    E.year = y; E.gal.clear();
    for (let m = 1; m <= 12; m++) {
      const mk = `${y}-${pad(m)}`, R = rng('gx' + mk);
      const tints = [[1, 1, 1], [1, 0.93, 0.86], [0.88, 0.96, 1.08], [0.96, 0.88, 1.1], [0.9, 1.04, 1]];
      E.gal.set(mk, { mk, m, jx: R() - 0.5, jy: R() - 0.5, tilt0: 0.45 + R() * 0.65, pa0: (R() - 0.5) * 1.2, wind0: -0.6 + R() * 1.6, sc0: 0.84 + R() * 0.2, rot0: R() * TAU, tint: tints[Math.floor(R() * tints.length)], f: 0 });
    }
    layout(); return true;
  }
  // その月の日ごとの星（必要になったときに1回だけ作る。画面が描き直されたら作り直す）
  function month(mk) {
    let M = E.months.get(mk); if (M) return M;
    const api = E.api, n = daysIn(mk), days = []; let stars = 0, wrote = 0, max = 1;
    for (let i = 0; i < n; i++) {
      const d = `${mk}-${pad(i + 1)}`, info = api.day(d), a = armOf(i, n);
      // その日を開いたときは、星座が枠いっぱいになるように広げる（星が固まっている日でも読みやすい）
      let fit = null;
      if (info.stars.length > 1) { let x0 = 1, x1 = 0, y0 = 1, y1 = 0; for (const st of info.stars) { x0 = Math.min(x0, st.x); x1 = Math.max(x1, st.x); y0 = Math.min(y0, st.y); y1 = Math.max(y1, st.y); } fit = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, k: Math.min(2.4, 0.78 / Math.max(0.05, x1 - x0), 0.74 / Math.max(0.05, y1 - y0)) }; }
      else if (info.stars.length === 1) fit = { cx: info.stars[0].x, cy: info.stars[0].y, k: 1 };
      days.push({ d, i, r: a.r, th: a.th, fit, stars: info.stars, neb: info.neb, mode: info.mode, color: info.color, name: info.name, boost: info.boost || 1, future: d > api.today });
      stars += info.stars.length; if (info.stars.length) wrote++; max = Math.max(max, info.stars.length);
    }
    const goals = api.goals(mk).map((g, gi, all) => {
      const a = -Math.PI / 2 + gi * TAU / Math.max(1, all.length), G = rng('goal' + g.id), pts = [];
      for (let k = 0; k < g.total; k++) pts.push([(G() - 0.5) * 0.13, (G() - 0.5) * 0.09]);
      return { ...g, ox: Math.cos(a) * 0.1, oy: Math.sin(a) * 0.065, pts };
    });
    M = { mk, n, days, goals, stars, wrote, max }; E.months.set(mk, M); return M;
  }
  function yearStat() {
    if (E.yearStat) return E.yearStat;
    const api = E.api, list = []; let stars = 0, wrote = 0, max = 1; const cur = api.today.slice(0, 7);
    for (let m = 1; m <= 12; m++) {
      const mk = `${E.year}-${pad(m)}`; let c = 0, w = 0;
      if (mk <= cur) for (let i = 1, n = daysIn(mk); i <= n; i++) { const k = api.count(`${mk}-${pad(i)}`); c += k; if (k) w++; }
      list.push({ mk, m, count: c, wrote: w, future: mk > cur }); stars += c; wrote += w; max = Math.max(max, c);
    }
    return (E.yearStat = { list, stars, wrote, max });
  }

  /* ────────────── 状態を合わせる ────────────── */
  const yearOf = s => (s.level === 'universe' ? s.year : Number(s.month.slice(0, 4)));
  function sync(api) {
    E.api = api; const s = api.sky, prev = E.sky;
    E.sky = { level: s.level, year: yearOf(s), month: s.month, day: s.day, selId: (s.sel && s.sel.id) || null };
    E.months.clear(); E.yearStat = null;
    const fresh = E.fresh; E.fresh = false;
    const sized = resize(); const newYear = ensureYear(E.sky.year);
    if (!prev || fresh || newYear || sized) {
      for (const g of E.gal.values()) g.f = fT(g);
      E.dayF.clear(); if (E.sky.level === 'day') E.dayF.set(E.sky.day, 1);
      snap(); E.dayT0 = E.time - 5;
      if (fresh && !E.rm) { E.fade = 0; E.tr = { fx: E.cam.x, fy: E.cam.y, fz: E.cam.z * 0.72, t0: E.time, dur: 0.9, dip: 0 }; }
      else if (newYear && prev && !E.rm) { E.fade = 0.25; E.warp = 1; }
    } else if (prev.level !== E.sky.level || prev.month !== E.sky.month || (E.sky.level === 'day' && prev.day !== E.sky.day)) {
      const same = prev.level === E.sky.level; const span = (prev.level === 'universe') !== (E.sky.level === 'universe') && (prev.level === 'day' || E.sky.level === 'day');
      if (E.rm) { for (const g of E.gal.values()) g.f = fT(g); E.dayF.clear(); if (E.sky.level === 'day') E.dayF.set(E.sky.day, 1); snap(); }
      else E.tr = { fx: E.cam.x, fy: E.cam.y, fz: E.cam.z, t0: E.time, dur: span ? 1.25 : same ? (E.sky.level === 'day' ? 0.65 : 0.85) : 0.95, dip: same ? (E.sky.level === 'day' ? 0.3 : 0.5) : 0 };
      if (E.sky.level === 'day') E.dayT0 = E.time + (same ? 0.25 : 0.45);
    }
    E.hover = null; hud(); rail(); frame(performance.now(), true); kick();
  }
  const fT = g => (E.sky.level !== 'universe' && g.mk === E.sky.month ? 1 : 0);
  function snap() { E.tr = null; pose(); const t = target(); E.cam.x = t.x; E.cam.y = t.y; E.cam.z = t.z; }
  // 銀河ごとの今の向き（年の画面ではばらばら、月の画面に入ると決まった向きにそろう）
  function pose() {
    for (const g of E.gal.values()) {
      const f = ease(g.f); g.tilt = lerp(g.tilt0, STD_TILT, f); g.pa = lerp(g.pa0, 0, f); g.wind = lerp(g.wind0, 0, f); g.sc = lerp(g.sc0, 1, f);
      g.rot = g.rot0 + E.spin; g.ct = Math.cos(g.tilt); g.st = Math.sin(g.tilt); g.cp = Math.cos(g.pa); g.sp = Math.sin(g.pa);
    }
  }
  // 銀河の面の上の点（r, th）→ 世界の座標と奥行き。シェーダーと同じ式
  function gworld(g, r, th) {
    const a = th + g.wind * r - g.rot, X = r * Math.cos(a), Y = r * Math.sin(a), sy = Y * g.ct, k = E.r0 * g.sc;
    return [g.wx + (X * g.cp - sy * g.sp) * k, g.wy + (X * g.sp + sy * g.cp) * k, Y * g.st];
  }
  const sx = wx => (wx - E.cam.x) * E.cam.z + E.ax, sy = wy => (wy - E.cam.y) * E.cam.z + E.ay;
  function target() {
    const s = E.sky, g = E.gal.get(s.month);
    if (s.level === 'universe' || !g) return { x: E.ax, y: E.ay, z: 1 };
    if (s.level === 'month') return { x: g.wx, y: g.wy, z: E.Zm };
    const n = daysIn(s.month), i = clamp(Number(s.day.slice(8)) - 1, 0, n - 1), a = armOf(i, n), p = gworld(g, a.r, a.th);
    return { x: p[0], y: p[1], z: E.Zd };
  }

  /* ────────────── 毎フレーム ────────────── */
  function kick() { if (!E.raf && E.ready && E.el && E.el.isConnected && !document.hidden) E.raf = requestAnimationFrame(frame); }
  function frame(now, once) {
    if (once !== true) E.raf = 0;
    if (!E.ready || !E.el || !E.el.isConnected || !E.w) return;
    const dt = E.last ? Math.min(0.05, (now - E.last) / 1000) : 0.016; E.last = now;
    const busy = !!(E.tr || E.drag || Math.abs(E.vel) > 0.004 || E.fade < 1 || E.meteor || E.warp > 0.01 || settling());
    if (once !== true && !E.rm && !busy && (E.skip = !E.skip)) { E.raf = requestAnimationFrame(frame); return; } // 動きが小さい間は半分のコマ数で電池を節約
    if (!E.rm) { E.time += dt; E.spin += OMEGA * dt + E.vel * dt; E.vel *= Math.exp(-dt * 2.6); E.fade = Math.min(1, E.fade + dt / 0.7); } else { E.fade = 1; }
    const k = 1 - Math.exp(-dt * 5.5);
    for (const g of E.gal.values()) { const t = fT(g); g.f = Math.abs(t - g.f) < 0.004 ? t : g.f + (t - g.f) * k; }
    const sd = E.sky.level === 'day' ? E.sky.day : null; if (sd && !E.dayF.has(sd)) E.dayF.set(sd, 0);
    for (const [d, v] of E.dayF) { const t = d === sd ? 1 : 0, nv = Math.abs(t - v) < 0.004 ? t : v + (t - v) * k; if (nv <= 0) E.dayF.delete(d); else E.dayF.set(d, nv); }
    pose();
    const T = target(); let zv = 0;
    if (E.tr) {
      const tr = E.tr, raw = clamp((E.time - tr.t0) / tr.dur, 0, 1), p = ease(raw);
      let z = Math.exp(lerp(Math.log(tr.fz), Math.log(T.z), p)); if (tr.dip) z *= 1 - tr.dip * Math.sin(Math.PI * p);
      // 目的地が画面の上をまっすぐ中心へ寄ってくるように動かす（拡大しながら流れていかない）
      const q = tr.fz * (1 - p) / z; zv = Math.abs(Math.log(z / E.cam.z)) / Math.max(dt, 0.001);
      E.cam.x = T.x - (T.x - tr.fx) * q; E.cam.y = T.y - (T.y - tr.fy) * q; E.cam.z = z;
      if (raw >= 1) E.tr = null;
    } else { E.cam.x = T.x; E.cam.y = T.y; E.cam.z = T.z; }
    E.warp = Math.max((E.warp || 0) * Math.exp(-dt * 4), clamp(zv / 5, 0, 1));
    scene(); drawGL(); drawOverlay(dt);
    // 重い端末では粒を減らす（最初の1秒ほどを測って1回だけ）
    if (once !== true && busy && !E.lockQ && E.quality === 1 && E.ft.length < 50) { E.ft.push(dt); if (E.ft.length === 50) { const avg = E.ft.slice(10).reduce((a, b) => a + b, 0) / 40; if (avg > 0.026) { E.quality = 0.6; resize(); } } }
    if (!E.rm && once !== true) E.raf = requestAnimationFrame(frame);
  }
  const settling = () => { for (const g of E.gal.values()) if (g.f !== fT(g)) return true; for (const [d, v] of E.dayF) if (v !== (E.sky.level === 'day' && d === E.sky.day ? 1 : 0)) return true; return false; };

  // このフレームで見えるもの（銀河と、その中の日）を先に並べる。GLと上の面の両方が使う
  function scene() {
    const z = E.cam.z, list = []; E.dfAny = 0; for (const v of E.dayF.values()) E.dfAny = Math.max(E.dfAny, v);
    const uni = 1 - sstep(1.25, Math.max(1.6, E.Zm * 0.6), z);
    const stat = uni > 0.01 ? yearStat() : null;
    for (const g of E.gal.values()) {
      const x = sx(g.wx), y = sy(g.wy), scale = E.r0 * g.sc * z;
      if (x < -scale * 1.4 || x > E.w + scale * 1.4 || y < -scale * 1.4 || y > E.h + scale * 1.4) continue;
      const st = stat ? stat.list[g.m - 1] : null;
      const bright = st ? (st.future ? 0.16 : st.count ? clamp(0.36 + st.count / 110, 0.42, 1) : 0.25) : 0.5;
      const it = { g, x, y, scale, bright, st, uni, F: g.f * sstep(E.Zm * 0.38, E.Zm * 0.8, z), cl: [] };
      if (it.F > 0.02) {
        const M = it.M = month(g.mk), cs = CL * scale, m = cs * 0.8;
        for (const c of M.days) {
          const p = gworld(g, c.r, c.th), px = sx(p[0]), py = sy(p[1]);
          if (px < -m || px > E.w + m || py < -m || py > E.h + m) continue;
          const foc = E.dayF.get(c.d) || 0;
          it.cl.push({ c, x: px, y: py, cs, depth: p[2], foc, a: it.F * (foc + (1 - foc) * (1 - 0.82 * E.dfAny)) });
        }
      }
      list.push(it);
    }
    E.scene = list;
  }
  function drawGL() {
    const gl = E.gl, { w, h, cam } = E, z = cam.z, fade = E.fade;
    gl.viewport(0, 0, E.cv.width, E.cv.height); gl.clear(gl.COLOR_BUFFER_BIT);
    const px = (E.ax - cam.x) * 0.06, py = (E.ay - cam.y) * 0.06, big = Math.max(w, h);
    // ぼんやりした光（奥の空の色むら・銀河の芯とかさ・星雲）
    const q = E.qp; gl.useProgram(q.p); gl.bindBuffer(gl.ARRAY_BUFFER, E.quadBuf);
    const aq = q.a('a_q'); gl.enableVertexAttribArray(aq); gl.vertexAttribPointer(aq, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(q.u.u_res, w, h);
    const blob = (x, y, rx, ry, pa, r, g, b, a) => { if (a <= 0.002) return; gl.uniform2f(q.u.u_center, x, y); gl.uniform2f(q.u.u_size, rx, ry); gl.uniform1f(q.u.u_pa, pa); gl.uniform4f(q.u.u_color, r, g, b, a); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
    blob(w * 0.5 + px, h * 0.45 + py, big * 0.95, big * 0.8, 0, 0.03, 0.07, 0.2, 1 * fade);
    blob(w * 0.2 + px * 2, h * 0.25 + py * 2, big * 0.6, big * 0.5, 0.4, 0.05, 0.1, 0.3, 0.55 * fade);
    blob(w * 0.82 + px * 2, h * 0.78 + py * 2, big * 0.6, big * 0.45, -0.5, 0.16, 0.06, 0.3, 0.5 * fade);
    const dayK = sstep(E.Zm * 1.5, E.Zd, z);
    for (const it of E.scene) {
      const g = it.g, f = ease(g.f), al = lerp(it.bright * (0.4 + 0.6 * it.uni), 1, f) * fade * (1 - 0.55 * dayK), s = it.scale, t = g.tint;
      blob(it.x, it.y, s * 1.05, s * 1.05 * Math.max(0.2, g.ct), g.pa, 0.1 * t[0], 0.14 * t[1], 0.36 * t[2], 0.55 * al);
      blob(it.x, it.y, s * 0.34, s * 0.34 * (0.5 + 0.5 * g.ct), g.pa, 1, 0.72, 0.4, 0.5 * al);
      blob(it.x, it.y, s * 0.1, s * 0.1 * (0.6 + 0.4 * g.ct), g.pa, 1, 0.93, 0.8, 0.8 * al);
      for (const k of it.cl) { // 不調・休養の日の星雲
        if (!k.c.neb) continue; const R = rng('n' + k.c.d);
        for (let i = 0; i < 4; i++) {
          const ph = R() * TAU, ox = (R() - 0.5) * k.cs * 0.8 + Math.sin(E.time * 0.25 + ph) * k.cs * 0.07, oy = (R() - 0.5) * k.cs * 0.6 + Math.cos(E.time * 0.2 + ph) * k.cs * 0.05, rr = k.cs * (0.55 + R() * 0.6);
          const violet = R() < 0.5; blob(k.x + ox, k.y + oy, rr, rr * 0.8, ph, violet ? 0.46 : 0.26, violet ? 0.3 : 0.42, 0.95, 0.3 * k.a * fade);
        }
      }
    }
    // 粒（奥の星 → 銀河のちり）
    const p = E.pp; gl.useProgram(p.p);
    const bind = buf => { gl.bindBuffer(gl.ARRAY_BUFFER, buf); const ap = p.a('a_p'), ac = p.a('a_c'); gl.enableVertexAttribArray(ap); gl.enableVertexAttribArray(ac); gl.vertexAttribPointer(ap, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribPointer(ac, 4, gl.FLOAT, false, 32, 16); };
    gl.uniform2f(p.u.u_res, w, h); gl.uniform1f(p.u.u_time, E.time); gl.uniform1f(p.u.u_dpr, E.dpr);
    const set = (x, y, scale, rot, tilt, pa, wind, tint, alpha, psize, dof) => { gl.uniform2f(p.u.u_center, x, y); gl.uniform1f(p.u.u_scale, scale); gl.uniform1f(p.u.u_rot, rot); gl.uniform1f(p.u.u_tilt, tilt); gl.uniform1f(p.u.u_pa, pa); gl.uniform1f(p.u.u_wind, wind); gl.uniform3f(p.u.u_tint, tint[0], tint[1], tint[2]); gl.uniform1f(p.u.u_alpha, alpha); gl.uniform1f(p.u.u_psize, psize); gl.uniform1f(p.u.u_dof, dof); };
    bind(E.bgBuf); set(w / 2 + px * 1.6, h / 2 + py * 1.6, big * 0.8 * (1 + 0.05 * Math.log2(Math.max(1, z))), E.spin * 0.12, 0, 0, 0, [1, 1, 1], 0.9 * fade, 1, 0); gl.drawArrays(gl.POINTS, 0, E.nBg);
    bind(E.dustBuf);
    const dof = lerp(0.2, 1.5, sstep(E.Zm, E.Zd, z)), q8 = E.quality;
    for (const it of E.scene) {
      const g = it.g, f = ease(g.f), s = it.scale;
      const n = Math.floor(lerp(E.nMini * (0.35 + 0.65 * it.bright), E.N, f * f) * q8);
      const alpha = lerp(it.bright * 0.9 * (0.3 + 0.7 * it.uni), 1.15, f) * fade * (1 - 0.3 * dayK);
      set(it.x, it.y, s, g.rot, g.tilt, g.pa, g.wind, g.tint, alpha, clamp(Math.pow(s / E.Rm, 0.55), 0.62, 3.4) * (E.w < 520 ? 1 : 1.15), dof);
      gl.drawArrays(gl.POINTS, 0, n);
    }
  }

  function drawOverlay(dt) {
    const c = E.ctx, { w, h, cam } = E, z = cam.z, hits = [], fade = E.fade, t = E.time, s = E.sky;
    c.setTransform(E.dpr, 0, 0, E.dpr, 0, 0); c.clearRect(0, 0, w, h); c.lineCap = 'round';
    const dayK = sstep(E.Zm * 1.3, E.Zd * 0.9, z), small = `500 10px ${E.font}`;
    let hov = null; // 強調する場所（マウス・下の目盛り・選んだ星）
    for (const it of E.scene) {
      const g = it.g;
      // 年の画面：月の名前と星の数
      if (it.uni > 0.02 && it.st) {
        const a = it.uni * fade, cur = g.mk === E.api.today.slice(0, 7), ly = it.y + E.r0 * z * 0.7 + 15;
        c.textAlign = 'center'; c.font = `600 12px ${E.font}`; c.fillStyle = cur ? `rgba(142,197,255,${a})` : `rgba(226,232,246,${a * (it.st.future ? 0.3 : it.st.count ? 0.9 : 0.5)})`;
        const nm = `${g.m}月`, nw = c.measureText(nm).width; c.font = small; const ct = it.st.count ? ` · ${it.st.count}` : '', tw = nw + c.measureText(ct).width;
        c.textAlign = 'left'; c.font = `600 12px ${E.font}`; c.fillText(nm, it.x - tw / 2, ly);
        if (ct) { c.font = small; c.fillStyle = `rgba(170,184,214,${a * 0.8})`; c.fillText(ct, it.x - tw / 2 + nw, ly); }
        if (s.level === 'universe') hits.push({ x: it.x, y: it.y, r: Math.max(34, E.r0 * 1.05), rr: E.r0 * z * 0.9, month: g.mk, key: g.mk });
      }
      if (it.F <= 0.02) continue;
      const F = it.F * fade, M = it.M, calm = 1 - E.dfAny;
      // 日付の目安の輪（10日・20日・30日）：内側が月初、外側が月末
      if (calm > 0.05) {
        c.setLineDash([2, 7]); c.lineWidth = 1;
        for (const dn of [10, 20, 30]) {
          if (dn > M.n) continue; const r = armOf(dn - 1, M.n).r; c.strokeStyle = `rgba(150,180,240,${0.13 * F * calm})`; c.beginPath();
          for (let i = 0; i <= 72; i++) { const p = gworld(g, r, g.rot + i / 72 * TAU); i ? c.lineTo(sx(p[0]), sy(p[1])) : c.moveTo(sx(p[0]), sy(p[1])); }
          c.stroke(); const lp = gworld(g, r, g.rot - Math.PI / 2); c.font = `500 9px ${E.font}`; c.textAlign = 'center'; c.fillStyle = `rgba(160,188,244,${0.5 * F * calm})`; c.fillText(`${dn}日`, sx(lp[0]), sy(lp[1]) - 4);
        }
        c.setLineDash([]);
      }
      const rs = lerp(0.74, 1.35, dayK);
      for (const k of it.cl) {
        const d = k.c, a = k.a * fade, dk = 1 + 0.1 * clamp(k.depth, -1, 1) * (1 - k.foc), isToday = d.d === E.api.today;
        const ff = ease(k.foc), ft = d.fit;
        const pts = d.stars.map(st => { const ux = ft ? lerp(st.x - 0.5, (st.x - ft.cx) * ft.k, ff) : st.x - 0.5, uy = ft ? lerp(st.y - 0.5, (st.y - ft.cy) * ft.k, ff) : st.y - 0.5; return { st, x: k.x + ux * k.cs, y: k.y + uy * k.cs }; });
        const placed = [];
        if (pts.length > 1) { // 星座の線（その日を開いたときは、時刻の順に引かれていく）
          const prog = k.foc > 0 && d.d === s.day ? clamp((t - E.dayT0) / (0.25 + pts.length * 0.09), 0, 1) : 1;
          c.strokeStyle = `rgba(190,205,255,${lerp(0.24, 0.5, k.foc) * a})`; c.lineWidth = lerp(1, 1.3, k.foc); c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
          const upto = prog * (pts.length - 1);
          for (let i = 1; i < pts.length; i++) { if (i <= upto) c.lineTo(pts[i].x, pts[i].y); else { const fr = upto - (i - 1); if (fr > 0) c.lineTo(lerp(pts[i - 1].x, pts[i].x, fr), lerp(pts[i - 1].y, pts[i].y, fr)); break; } }
          c.stroke();
        }
        pts.forEach((p, i) => {
          const st = p.st, base = (st.k === 'night' ? 3.6 : st.k === 'gold' ? 2.6 : st.small ? 1.5 : 2.1) * d.boost * rs * dk, tw = 1 + 0.09 * Math.sin(t * 2.1 + i * 1.7 + d.i), size = base * 11 * tw;
          c.globalAlpha = Math.min(1, a * 1.05); c.drawImage(sprite(st.k), p.x - size / 2, p.y - size / 2, size, size);
          if (k.foc > 0.4 && d.d === s.day) {
            // 時刻の文字：ほかの文字や星と重ならない向き（右・左・上・下）をさがして置く
            c.globalAlpha = 1; c.font = small; const tx = E.api.hm(st.t), tw2 = 30, th2 = 12;
            const cand = [[p.x + 9, p.y - 6], [p.x - 9 - tw2, p.y - 6], [p.x - tw2 / 2, p.y - 12 - th2], [p.x - tw2 / 2, p.y + 11]];
            const free = ([bx, by]) => bx > 4 && bx + tw2 < w - 4 && !placed.some(q => bx < q[0] + q[2] && bx + tw2 > q[0] && by < q[1] + q[3] && by + th2 > q[1]) && !pts.some(o => o !== p && o.x > bx - 5 && o.x < bx + tw2 + 5 && o.y > by - 4 && o.y < by + th2 + 4);
            const spot = cand.find(free);
            if (spot) { placed.push([spot[0], spot[1], tw2, th2]); c.textAlign = 'left'; c.fillStyle = `rgba(206,218,244,${0.8 * k.foc * fade})`; c.fillText(tx, spot[0] + 1, spot[1] + 10); }
            if (s.level === 'day') hits.push({ x: p.x, y: p.y, r: 20, rr: 13, star: st, day: d.d, key: 's' + st.id });
            if (E.sky.selId && st.id === E.sky.selId) hov = { x: p.x, y: p.y, rr: 14, sel: true };
          }
        });
        c.globalAlpha = 1;
        if (!pts.length) { // 星のない日：小さな輪だけ置く
          c.strokeStyle = `rgba(170,190,235,${(d.future ? 0.16 : 0.34) * a})`; c.lineWidth = 1; c.beginPath(); c.arc(k.x, k.y, d.future ? 1.6 : 2.4, 0, TAU); c.stroke();
          if (k.foc > 0.5) { c.font = `13px ${E.font}`; c.textAlign = 'center'; c.fillStyle = `rgba(170,184,214,${0.8 * k.foc * fade})`; c.fillText(d.future ? 'まだ来ていない日' : 'この日は星がない', k.x, k.y + 28); }
        }
        if (isToday) { // 今日：ゆっくり広がる輪
          const rr = Math.max(9, k.cs * 0.62) * (1 - 0.45 * k.foc), ph = (t * 0.45) % 1;
          c.strokeStyle = `rgba(142,197,255,${0.7 * a * (1 - k.foc)})`; c.lineWidth = 1.2; c.beginPath(); c.arc(k.x, k.y, rr, 0, TAU); c.stroke();
          if (!E.rm) { c.strokeStyle = `rgba(142,197,255,${0.5 * (1 - ph) * a * (1 - k.foc)})`; c.beginPath(); c.arc(k.x, k.y, rr * (1 + ph * 0.9), 0, TAU); c.stroke(); }
        }
        // 日付の数字
        const la = a * (1 - k.foc) * (isToday ? 1 : d.stars.length ? 0.62 : d.future ? 0.22 : 0.36);
        if (la > 0.03) { c.font = isToday ? `700 10.5px ${E.font}` : small; c.textAlign = 'center'; c.fillStyle = isToday ? `rgba(142,197,255,${la})` : `rgba(214,224,246,${la})`; c.fillText(isToday ? `${d.i + 1} 今日` : String(d.i + 1), k.x, k.y + Math.max(11, k.cs * 0.5) + 9); }
        if (s.level === 'month' && g.mk === s.month) hits.push({ x: k.x, y: k.y, r: Math.max(17, k.cs * 0.62), rr: Math.max(13, k.cs * 0.6), day: d.d, key: d.d });
        else if (s.level === 'day' && d.d !== s.day) hits.push({ x: k.x, y: k.y, r: 44, rr: 30, day: d.d, key: d.d, far: true });
      }
      // 今月の目標の星座（銀河の芯。関わるタスクが済むほど星が灯る）
      const ga = F * calm;
      if (ga > 0.05 && M.goals.length) {
        const sc = it.scale;
        for (const go of M.goals) {
          const gx = it.x + go.ox * sc, gy = it.y + go.oy * sc, pts = go.pts.map(p => [gx + p[0] * sc, gy + p[1] * sc]);
          if (go.lit > 1) { c.strokeStyle = `rgba(233,200,115,${0.45 * ga})`; c.lineWidth = 1; c.beginPath(); pts.slice(0, go.lit).forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); }
          pts.forEach((p, i) => { if (i < go.lit) { const size = 2.3 * 11 * (1 + 0.08 * Math.sin(t * 1.7 + i)); c.globalAlpha = ga; c.drawImage(sprite('gold'), p[0] - size / 2, p[1] - size / 2, size, size); c.globalAlpha = 1; } else { c.strokeStyle = `rgba(233,200,115,${0.42 * ga})`; c.beginPath(); c.arc(p[0], p[1], 1.9, 0, TAU); c.stroke(); } });
          if (s.level === 'month') hits.push({ x: gx, y: gy, r: 20, rr: 15, goal: go, key: 'g' + go.id });
        }
      }
    }
    E.hits = hits;
    // 強調の印（四隅のかぎ。ゆっくり回る）
    if (E.hover) { const hh = hits.find(x => x.key === E.hover.key); if (hh) hov = { x: hh.x, y: hh.y, rr: hh.rr + 5 }; }
    if (hov) {
      const rr = hov.rr, rot = E.rm ? 0.4 : t * 0.9; c.strokeStyle = hov.sel ? 'rgba(255,255,255,.9)' : 'rgba(142,197,255,.95)'; c.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) { const a0 = rot + i * TAU / 4; c.beginPath(); c.arc(hov.x, hov.y, rr, a0, a0 + 0.62); c.stroke(); }
    }
    // 奥へ進むときの光の筋
    if (E.warp > 0.03 && !E.rm) {
      const R = rng('warp'), n = 64, mx = Math.hypot(w, h) * 0.5; c.lineWidth = 1.1;
      for (let i = 0; i < n; i++) { const a = R() * TAU, r0 = (0.12 + R() * 0.88) * mx, len = (10 + R() * 70) * E.warp, al = (0.1 + R() * 0.3) * E.warp; c.strokeStyle = `rgba(190,215,255,${al})`; c.beginPath(); c.moveTo(E.ax + Math.cos(a) * r0, E.ay + Math.sin(a) * r0); c.lineTo(E.ax + Math.cos(a) * (r0 + len), E.ay + Math.sin(a) * (r0 + len)); c.stroke(); }
    }
    // ときどき流れ星
    if (!E.rm) {
      E.nextMeteor -= dt;
      if (!E.meteor && E.nextMeteor <= 0) { const R = Math.random; E.meteor = { x: w * (0.15 + R() * 0.7), y: h * (0.05 + R() * 0.3), a: Math.PI * (0.12 + R() * 0.2) * (R() < 0.5 ? 1 : -1) + (R() < 0.5 ? 0 : Math.PI), p: 0 }; E.nextMeteor = 8 + Math.random() * 12; }
      if (E.meteor) {
        const m = E.meteor; m.p += dt / 0.75; const hd = m.p * 150, tl = Math.max(0, hd - 70), ca = Math.cos(m.a), sa = Math.abs(Math.sin(m.a)), al = Math.sin(Math.PI * clamp(m.p, 0, 1));
        const lg = c.createLinearGradient(m.x + ca * tl, m.y + sa * tl, m.x + ca * hd, m.y + sa * hd); lg.addColorStop(0, 'rgba(200,220,255,0)'); lg.addColorStop(1, `rgba(235,244,255,${0.85 * al})`);
        c.strokeStyle = lg; c.lineWidth = 1.4; c.beginPath(); c.moveTo(m.x + ca * tl, m.y + sa * tl); c.lineTo(m.x + ca * hd, m.y + sa * hd); c.stroke();
        if (m.p >= 1) E.meteor = null;
      }
    }
  }

  /* ────────────── 文字の表示と、下の目盛り ────────────── */
  function hud() {
    if (!E.el) return; const s = E.sky, api = E.api, hv = E.hover;
    let title, sub;
    const dayLine = d => { const M = month(d.slice(0, 7)), c = M.days[Number(d.slice(8)) - 1]; return [`${Number(d.slice(5, 7))}.${d.slice(8)} ${wdOf(d)}`, c ? [c.future ? 'まだ来ていない日' : `星 ${c.stars.length}`, c.mode, c.name].filter(Boolean).join(' · ') : '']; };
    const monthLine = mk => { const M = month(mk); return [`${mk.slice(0, 4)}.${mk.slice(5)}`, `記録 ${M.wrote}/${M.n}日 · 星 ${M.stars}`]; };
    if (hv && hv.goal) { title = '今月の目標'; sub = `${hv.goal.title} · ${hv.goal.done ? '達成' : `灯った星 ${hv.goal.lit}/${hv.goal.total}`}`; }
    else if (hv && /^\d{4}-\d\d-\d\d$/.test(hv.key)) [title, sub] = dayLine(hv.key);
    else if (hv && /^\d{4}-\d\d$/.test(hv.key)) { const st = yearStat().list[Number(hv.key.slice(5)) - 1]; title = `${hv.key.slice(0, 4)}.${hv.key.slice(5)}`; sub = st.future ? 'まだ来ていない月' : `記録 ${st.wrote}日 · 星 ${st.count}`; }
    else if (s.level === 'universe') { const y = yearStat(); title = String(E.year); sub = `記録 ${y.wrote}日 · 星 ${y.stars}`; }
    else if (s.level === 'month') [title, sub] = monthLine(s.month);
    else [title, sub] = dayLine(s.day);
    E.el.querySelector('.gx-title').textContent = title; E.el.querySelector('.gx-sub').textContent = sub;
    E.el.querySelector('.gx-back').hidden = s.level === 'universe'; E.el.dataset.level = s.level;
    E.rail.setAttribute('aria-valuetext', `${title}（${sub}）`);
  }
  const railSel = () => { const s = E.sky; return s.level === 'universe' ? clamp(Number((s.month || '').slice(5)) - 1, 0, 11) : s.level === 'day' ? Number(s.day.slice(8)) - 1 : Math.max(0, E.railItems.findIndex(x => x.today)); };
  function rail() {
    const s = E.sky, api = E.api; let items;
    if (s.level === 'universe') { const y = yearStat(); items = y.list.map(m => ({ key: m.mk, month: m.mk, n: m.count, max: y.max, color: '#8ec5ff', label: String(m.m), today: m.mk === api.today.slice(0, 7), sel: false, future: m.future })); }
    else { const M = month(s.month); items = M.days.map(d => ({ key: d.d, day: d.d, n: d.stars.length, max: M.max, color: d.color || '#aebbdc', label: (d.i === 0 || (d.i + 1) % 5 === 0) && Math.abs(Number(api.today.slice(8)) - 1 - d.i) > (api.today.slice(0, 7) === s.month ? 2 : -1) ? String(d.i + 1) : '', today: d.d === api.today, sel: s.level === 'day' && d.d === s.day, future: d.future })); }
    E.railItems = items;
    E.rail.innerHTML = items.map(it => `<i class="${it.n ? '' : 'z'}${it.today ? ' today' : ''}${it.sel ? ' sel' : ''}${it.future ? ' fut' : ''}" style="--c:${it.color};--h:${it.n ? Math.round(5 + 21 * Math.pow(it.n / it.max, 0.6)) : 3}px" data-l="${it.today && s.level !== 'universe' ? '今日' : it.label}"><b></b></i>`).join('');
    E.rail.setAttribute('aria-label', s.level === 'universe' ? '月をえらぶ' : '日をえらぶ'); E.rail.setAttribute('aria-valuemin', '1'); E.rail.setAttribute('aria-valuemax', String(items.length)); E.rail.setAttribute('aria-valuenow', String(railSel() + 1));
  }
  function railMark() { const i = E.hover && E.hover.rail ? E.hover.i : -1; [...E.rail.children].forEach((el, k) => el.classList.toggle('on', k === i)); if (i >= 0) E.rail.setAttribute('aria-valuenow', String(i + 1)); }

  /* ────────────── 指・マウス ────────────── */
  const local = e => { const b = E.cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  function hitAt(x, y) { // 星を優先して、いちばん近いものを選ぶ
    let best = null, bd = Infinity;
    for (const h of E.hits) { const d = Math.hypot(h.x - x, h.y - y) / h.r; if (d >= 1) continue; const better = best && !!h.star !== !!best.star ? !!h.star : d < bd; if (!best || better) { best = h; bd = d; } }
    return best;
  }
  function onDown(e) { const [x, y] = local(e); E.drag = { x, y, lx: x, moved: false, id: e.pointerId, t: performance.now() }; kick(); }
  function onMove(e) {
    const [x, y] = local(e), d = E.drag;
    if (d && d.id === e.pointerId) {
      if (!d.moved && Math.abs(x - d.x) > 7) { d.moved = true; try { E.cv.setPointerCapture(e.pointerId); } catch (_) {} }
      if (d.moved) { const dx = x - d.lx, now = performance.now(), dtm = Math.max(8, now - d.t) / 1000; E.spin -= dx * 0.006; E.vel = clamp(-dx * 0.006 / dtm, -3, 3) * 0.5; d.lx = x; d.t = now; if (E.rm) frame(now, true); else kick(); }
      return;
    }
    if (e.pointerType !== 'mouse') return;
    const h = hitAt(x, y), key = h ? h.key : null;
    if ((E.hover ? E.hover.key : null) !== key) { E.hover = h ? { key, goal: h.goal } : null; E.cv.style.cursor = h ? 'pointer' : ''; hud(); if (E.rm) frame(performance.now(), true); else kick(); }
  }
  function onUp(e) {
    const d = E.drag; E.drag = null; if (!d || d.moved || !E.api) return;
    const [x, y] = local(e), h = hitAt(x, y);
    if (!h) { E.api.pick({}); return; }
    if (h.month) E.api.pick({ month: h.month }); else if (h.goal) E.api.pick({ goal: h.goal }); else if (h.star) E.api.pick({ star: h.star, day: h.day }); else if (h.day) E.api.pick({ day: h.day });
  }

  function attach(host, api) {
    if (E.dead) return false;
    if (!E.el && !build()) { E.dead = true; return false; }
    if (E.el.parentElement !== host) { host.appendChild(E.el); E.fresh = !E.attached; E.attached = true; E.last = 0; }
    sync(api); return true;
  }
  function detach() { if (!E.el) return; cancelAnimationFrame(E.raf); E.raf = 0; E.attached = false; E.sky = null; E.hover = null; E.drag = null; if (E.el.parentElement) E.el.remove(); }
  window.DaylogGalaxy = { attach, detach, get dead() { return E.dead; }, _quality: q => { E.lockQ = true; E.quality = q; E.w = 0; if (E.el && resize()) snap(); }, _hits: () => E.hits.map(h => ({ ...h })), _debug: () => ({ level: E.sky && E.sky.level, z: E.cam.z, Zm: E.Zm, Zd: E.Zd, N: E.N, quality: E.quality, hits: E.hits.length, raf: !!E.raf, tr: !!E.tr, fade: E.fade, w: E.w, h: E.h, scene: (E.scene || []).length }) };
})();
