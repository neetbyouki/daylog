// Daylog の「天球」：天球儀 × 頭上のプラネタリウム
// ・1日＝1本の輪。今日が地平線（いちばん大きい輪）、過去の日ほど天頂に近い小さな輪。真上から見ると時計の銀河になる
// ・輪の上の角度＝時刻（真上から見て 0時が上、時計回り）。星＝その時刻の記録・タスク・習慣・夜モード
// ・子午線（再生線）が回り、横切った星が鳴る。同じ時刻の星は日をまたいで同時に鳴る（毎日のくせが和音になる）
// ・「外から」は指で回す天球儀、「見上げる」はドームの中から見上げるプラネタリウム（スマホの傾きでも見回せる）
// 画面（daylog.js）からは DaylogOrrery.attach(置き場, データの窓口) と DaylogOrrery.refresh(窓口) だけを呼ぶ
(function () {
  'use strict';
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const pad2 = n => String(n).padStart(2, '0');
  const reduce = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('daylog-orr-' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem('daylog-orr-' + k, JSON.stringify(v)); } catch (_) {} },
  };

  /* ────────────── 音 ──────────────
     まとまりのための決まり
     1. 音階はひとつだけ（Dのメジャー・ペンタトニック）。どの音どうしが重なっても濁らない
     2. 鳴るタイミングは 8分音符の拍（84BPM）にそろえる。ばらばらの時刻の記録でもリズムになる
     3. 1拍に鳴る音は4つまで。全体でも同時に18音まで（今日の星は優先）。同じ楽器・同じ高さの重なりは1つにまとめる
     4. 種類ごとに楽器を分ける（日記＝ガラスの鐘、タスク＝カリンバ、習慣・目標＝高いチャイム、夜モード＝低い鈴）
     5. 低いドローン（根音と5度）がずっと下で鳴り、6時間ごとに低音が区切りを打つ
     6. 残響でひとつの空間にまとめ、最後にコンプレッサーで音量のでこぼこを抑える
     7. 不調・休養の日の星は、同じ音階のまま少しくぐもった音にする（悲しい音にはしない） */
  const SCALE = [0, 2, 4, 7, 9];
  const ROOT = 146.83; // D3
  const BPM = 84, STEP = 60 / BPM / 2;
  const noteHz = idx => { idx = clamp(Math.round(idx), 0, 22); return ROOT * Math.pow(2, (Math.floor(idx / 5) * 12 + SCALE[((idx % 5) + 5) % 5]) / 12); };
  const AU = { ctx: null, out: null, wet: null, dry: null, drone: null, slots: new Map(), voices: 0, on: store.get('sound', true), vol: 0.75 };
  function audioInit() {
    if (AU.ctx) return AU.ctx;
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch (_) {} // iPhoneのマナーモードに従う
    const ctx = AU.ctx = new C();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 3.5; comp.attack.value = 0.006; comp.release.value = 0.35;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 9000;
    const master = ctx.createGain(); master.gain.value = AU.on ? AU.vol : 0;
    comp.connect(tone); tone.connect(master); master.connect(ctx.destination);
    // 残響：その場で作る、2.8秒で消えていく広がり
    const len = Math.floor(ctx.sampleRate * 2.8); const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const a = ir.getChannelData(ch); for (let i = 0; i < len; i++) { const t = i / len; a[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < ctx.sampleRate * 0.012 ? i / (ctx.sampleRate * 0.012) : 1); } }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.42; const dry = ctx.createGain(); dry.gain.value = 0.8;
    conv.connect(wet); wet.connect(comp); dry.connect(comp);
    AU.out = master; AU.comp = comp; AU.wet = conv; AU.dry = dry;
    return ctx;
  }
  function setSound(on) {
    AU.on = on; store.set('sound', on);
    if (AU.ctx && AU.out) AU.out.gain.setTargetAtTime(on ? AU.vol : 0, AU.ctx.currentTime, 0.08);
  }
  // 1つの声：右左の位置と、くぐもり具合を付けて、乾いた音と残響の両方へ
  function voiceOut(t, pan, dark, dur) {
    const ctx = AU.ctx; const g = ctx.createGain(); g.gain.value = 0;
    let node = g;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = dark ? 1900 : 7200; f.Q.value = 0.3;
    g.connect(f); node = f;
    let p = null; if (ctx.createStereoPanner) { p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -0.85, 0.85); node.connect(p); node = p; }
    node.connect(AU.dry); node.connect(AU.wet);
    AU.voices++; setTimeout(() => { AU.voices = Math.max(0, AU.voices - 1); try { g.disconnect(); } catch (_) {} }, (t - ctx.currentTime + dur + 0.3) * 1000);
    return g;
  }
  const env = (gp, t, peak, atk, dec) => { gp.setValueAtTime(0.0001, t); gp.exponentialRampToValueAtTime(peak, t + atk); gp.exponentialRampToValueAtTime(0.0001, t + atk + dec); };
  const INST = {
    // 日記：ガラスの鐘（FMで金属的な倍音を少しだけ）
    diary(t, hz, v, pan, dark) {
      const ctx = AU.ctx, dur = 3.2; const g = voiceOut(t, pan, dark, dur);
      const c = ctx.createOscillator(); c.type = 'sine'; c.frequency.value = hz;
      const m = ctx.createOscillator(); m.type = 'sine'; m.frequency.value = hz * 3.5;
      const mi = ctx.createGain(); mi.gain.setValueAtTime(hz * 1.6, t); mi.gain.exponentialRampToValueAtTime(hz * 0.02, t + 1.1);
      m.connect(mi); mi.connect(c.frequency); c.connect(g);
      const o2 = ctx.createOscillator(); o2.frequency.value = hz * 2.003; const g2 = ctx.createGain(); g2.gain.value = 0.18; o2.connect(g2); g2.connect(g);
      env(g.gain, t, 0.22 * v, 0.005, dur);
      [c, m, o2].forEach(o => { o.start(t); o.stop(t + dur + 0.1); });
    },
    // タスク：カリンバ（短く、木の響き）
    task(t, hz, v, pan, dark) {
      const ctx = AU.ctx, dur = 1.1; const g = voiceOut(t, pan, dark, dur);
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = hz * 4.02; const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.25, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o2.connect(g2); g2.connect(g); o.connect(g);
      env(g.gain, t, 0.26 * v, 0.003, dur);
      [o, o2].forEach(x => { x.start(t); x.stop(t + dur + 0.1); });
    },
    // 習慣・目標：高いチャイム（きらめき）
    gold(t, hz, v, pan, dark) {
      const ctx = AU.ctx, dur = 3.8; const g = voiceOut(t, pan, dark, dur);
      [[1, 1], [2.0, 0.35], [3.01, 0.18]].forEach(([r, a]) => { const o = ctx.createOscillator(); o.frequency.value = hz * r; const ga = ctx.createGain(); ga.gain.value = a; o.connect(ga); ga.connect(g); o.start(t); o.stop(t + dur + 0.1); });
      env(g.gain, t, 0.13 * v, 0.01, dur);
    },
    // 夜モード：低い鈴（ゆっくりうなる）
    night(t, hz, v, pan) {
      const ctx = AU.ctx, dur = 5.2; const g = voiceOut(t, pan, true, dur);
      [[1, 1], [2.76, 0.32], [5.4, 0.12], [1.004, 0.6]].forEach(([r, a]) => { const o = ctx.createOscillator(); o.frequency.value = hz * r; const ga = ctx.createGain(); ga.gain.value = a; o.connect(ga); ga.connect(g); o.start(t); o.stop(t + dur + 0.1); });
      env(g.gain, t, 0.2 * v, 0.02, dur);
    },
    // 6時間ごとの区切り：やわらかい低音
    bass(t, hz, v) {
      const ctx = AU.ctx, dur = 2.4; const g = voiceOut(t, 0, true, dur);
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz; o.connect(g);
      env(g.gain, t, 0.2 * v, 0.03, dur); o.start(t); o.stop(t + dur + 0.1);
    },
  };
  // 拍にそろえて鳴らす。返り値は実際に鳴る時刻（画面の光と合わせるため）。鳴らさなかったら null
  function playNote(inst, idx, v, pan, dark, prio = 1) {
    const ctx = AU.ctx; if (!ctx || !AU.on || ctx.state !== 'running') return null;
    const hz = inst === 'bass' ? noteHz(idx) / 2 : noteHz(idx);
    let t = Math.ceil((ctx.currentTime + 0.04) / STEP) * STEP;
    for (let spill = 0; spill < 3; spill++, t += STEP) {
      const key = t.toFixed(3); const slot = AU.slots.get(key) || [];
      if (slot.some(s => s.inst === inst && Math.abs(s.hz - hz) < 1)) return t; // 同じ音はまとめる
      if (slot.length >= 4) continue;
      if (AU.voices >= 18 && prio < 2) return null; // 鳴っている音が多すぎるときは、今日以外の星を休ませる
      slot.push({ inst, hz }); AU.slots.set(key, slot);
      const tt = t + Math.random() * 0.012; // ほんの少しだけ揺らす（機械っぽさを消す）
      INST[inst](tt, hz, v * (0.9 + Math.random() * 0.2), pan, dark);
      if (AU.slots.size > 64) { const now = ctx.currentTime; for (const k of AU.slots.keys()) if (Number(k) < now - 1) AU.slots.delete(k); }
      return tt;
    }
    return null;
  }
  function drone(on) {
    const ctx = AU.ctx; if (!ctx) return;
    if (on && !AU.drone) {
      const g = ctx.createGain(); g.gain.value = 0;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.7;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06; const lg = ctx.createGain(); lg.gain.value = 140; lfo.connect(lg); lg.connect(f.frequency);
      const os = [[ROOT / 2, 'triangle', 0.5], [ROOT * 0.75, 'triangle', 0.35], [ROOT / 2 * 1.003, 'sine', 0.4]].map(([hz, ty, a]) => { const o = ctx.createOscillator(); o.type = ty; o.frequency.value = hz; const ga = ctx.createGain(); ga.gain.value = a; o.connect(ga); ga.connect(f); o.start(); return o; });
      f.connect(g); g.connect(AU.dry); g.connect(AU.wet); lfo.start();
      g.gain.setTargetAtTime(0.05, ctx.currentTime, 1.2);
      AU.drone = { g, os: [...os, lfo] };
    } else if (!on && AU.drone) {
      const d = AU.drone; AU.drone = null; d.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
      setTimeout(() => d.os.forEach(o => { try { o.stop(); } catch (_) {} }), 2500);
    }
  }

  /* ────────────── 天球 ────────────── */
  const KIND_NAME = { diary: '日記', task: 'タスク', gold: '習慣・目標', night: '夜モード' };
  const E = {
    el: null, cv: null, ctx: null, api: null, sig: '', w: 0, h: 0, dpr: 1,
    mode: store.get('mode', 'outside'), range: store.get('range', 14),
    yaw: -0.5, pitch: 0.62, dist: 3.15, lookYaw: 0, lookPitch: 0.35,
    play: false, speed: 1, playT: null, lastTs: 0, raf: 0, lastInteract: 0,
    rings: [], stars: [], dust: [], hits: [], ringHits: [], flashes: [], sel: null, selRing: null,
    drag: null, pinch: null, gyro: null, gyroOn: false, sprites: {},
  };
  const hourOf = ts => { const d = new Date(ts); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; };
  const azim = h => (h / 24) * TAU; // 0時が上（奥）、時計回り
  const onRing = (r, y, th) => [Math.sin(th) * r, y, -Math.cos(th) * r];
  const hm = ts => { const d = new Date(ts); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  const hmH = h => `${pad2(Math.floor(h) % 24)}:${pad2(Math.floor((h % 1) * 60))}`;
  const WD = '日月火水木金土';
  const md = d => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  const wdOf = d => WD[new Date(d + 'T12:00:00').getDay()];

  function buildData() {
    const api = E.api; const N = E.range; const t = api.today;
    const days = Array.from({ length: N }, (_, i) => api.addDays(t, i - (N - 1)));
    const LAT = 74 * DEG;
    E.rings = days.map((d, i) => {
      const f = N > 1 ? (N - 1 - i) / (N - 1) : 0; const lat = f * LAT;
      const info = api.dayInfo(d);
      const wake = api.wake(d), sleep = api.sleep(d);
      return { d, i, f, lat, r: Math.cos(lat), y: Math.sin(lat), wake, sleep, info, isToday: d === t, monday: new Date(d + 'T12:00:00').getDay() === 1, first: d.slice(8) === '01', stars: [] };
    });
    E.stars = [];
    for (const ring of E.rings) {
      const list = api.dayStars(ring.d);
      const placed = [];
      for (const s of list) {
        const h = hourOf(s.t);
        // 同じ時刻に近い星は、外側へ少しずらして重ならないようにする
        let k = 0; while (placed.some(p => p.k === k && Math.abs(p.h - h) < 0.35)) k++;
        placed.push({ h, k });
        const rr = ring.r * (1 + k * 0.035), yy = ring.y + k * 0.012;
        const mood = s.mood || null;
        const star = { ...s, ring, h, th: azim(h), pos: onRing(rr, yy, azim(h)), mood };
        ring.stars.push(star); E.stars.push(star);
      }
    }
    if (E.playT == null) E.playT = hourOf(Date.now());
  }
  // 星の音の高さ：空の高い所（昔の日）ほど高い音。日記は気分で上下、夜モードは低く
  function starNote(s) {
    const base = 5 + Math.round(s.ring.f * 5);
    if (s.k === 'diary') return base + 5 + (s.mood ? [-2, -1, 0, 1, 2][clamp(s.mood, 1, 5) - 1] : 0);
    if (s.k === 'task') return base + 5 + (s.small ? 3 : 1);
    if (s.k === 'gold') return base + 10;
    return base - 3; // night
  }
  const darkDay = r => r.info && (r.info.mode === 'bad' || r.info.mode === 'rest');

  /* ── 見る位置（カメラ） ── */
  function camera() {
    if (E.mode === 'inside') {
      const yaw = E.lookYaw + (E.gyroOn && E.gyro ? E.gyro.yaw : 0);
      const pitch = clamp(E.gyroOn && E.gyro ? E.gyro.pitch : E.lookPitch, -0.05, 1.5);
      const fw = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
      const right = [Math.cos(yaw), 0, Math.sin(yaw)];
      const up = cross(right, fw);
      return { pos: [0, -0.02, 0], fw, right, up, f: E.w * 0.62, inside: true };
    }
    const cp = Math.cos(E.pitch); const pos = [E.dist * cp * Math.sin(E.yaw), 0.3 + E.dist * Math.sin(E.pitch), E.dist * cp * Math.cos(E.yaw)];
    const target = [0, 0.4, 0];
    const fw = norm(sub(target, pos)); const right = norm(cross(fw, [0, 1, 0])); const up = cross(right, fw);
    const avail = E.h - 56 - 74; // 上のボタンと下の操作バーをよけた高さ
    return { pos, fw, right, up, f: Math.min(E.w, avail * 1.1) * 1.12, inside: false, cy: 56 + avail / 2 };
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  function proj(cam, p) {
    const v = sub(p, cam.pos); const z = dot(v, cam.fw); if (z < 0.04) return null;
    const x = dot(v, cam.right), y = dot(v, cam.up);
    return { x: E.w / 2 + cam.f * x / z, y: (cam.cy || E.h / 2) - cam.f * y / z, z };
  }
  // 手前ほど明るく（外から見るとき）
  const depthA = (cam, z) => cam.inside ? 1 : clamp(1 - (z - (E.dist - 1.1)) / 2.2, 0.16, 1);

  function sprite(color) {
    if (E.sprites[color]) return E.sprites[color];
    const s = 64; const c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d');
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, color); g.addColorStop(0.18, color + 'aa'); g.addColorStop(0.45, color + '30'); g.addColorStop(1, color + '00');
    x.fillStyle = g; x.fillRect(0, 0, s, s); return (E.sprites[color] = c);
  }

  /* ── 描く ── */
  function draw() {
    const ctx = E.ctx; if (!ctx) return; const cam = camera(); const W = E.w, H = E.h;
    ctx.setTransform(E.dpr, 0, 0, E.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    const bg = ctx.createRadialGradient(W / 2, H * 0.62, 0, W / 2, H * 0.62, Math.max(W, H) * 0.75);
    bg.addColorStop(0, cam.inside ? '#081430' : '#07112a'); bg.addColorStop(1, '#000');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    for (const d of E.dust) { ctx.fillStyle = `rgba(200,215,255,${d.a})`; ctx.fillRect(d.x * W, d.y * H, d.s, d.s); }
    E.hits = []; E.ringHits = [];
    const playTh = azim(E.playT);

    // 輪（1日）：手前と奥で明るさを変える。起きていた時間の部分は明るく
    for (const ring of E.rings) {
      const sel = E.selRing === ring.d;
      const dense = E.rings.length > 20;
      const baseA = ring.isToday ? 0.62 : sel ? 0.9 : ring.monday || ring.first ? (dense ? 0.24 : 0.3) : dense ? 0.08 : 0.15;
      const col = sel ? '255,255,255' : ring.isToday ? '142,197,255' : '120,160,235';
      strokeRing(ctx, cam, ring.r, ring.y, 0, TAU, `rgba(${col},A)`, baseA, ring.isToday || sel ? 1.4 : 1, ring);
      const awake = awakeSpan(ring);
      if (awake) strokeRing(ctx, cam, ring.r, ring.y, azim(awake[0]), azim(awake[0]) + (awake[1] - awake[0]) / 24 * TAU, `rgba(${ring.isToday ? '185,215,255' : '150,190,255'},A)`, ring.isToday ? 0.85 : dense ? 0.3 : 0.42, ring.isToday ? 2 : dense ? 1.1 : 1.4, null);
    }
    // 時刻の目盛り（地平線＝今日の輪の外側）
    ctx.font = '500 11px "Google Sans Flex","Figtree",system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let h = 0; h < 24; h++) {
      const th = azim(h); const big = h % 6 === 0;
      const a = proj(cam, onRing(1.0, 0, th)), b = proj(cam, onRing(big ? 1.09 : 1.045, 0, th));
      if (!a || !b) continue; const al = depthA(cam, a.z) * (big ? 0.7 : 0.35);
      ctx.strokeStyle = `rgba(185,215,255,${al})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      if (big) { const l = proj(cam, onRing(1.2, 0, th)); if (l) { ctx.fillStyle = `rgba(214,228,255,${depthA(cam, l.z) * 0.85})`; ctx.fillText(`${h}時`, l.x, l.y); } }
    }
    // 天球儀の骨組み（外から見るとき）：縦の大円と、天頂の小さな印
    if (!cam.inside) {
      strokeGreat(ctx, cam, 0, 'rgba(120,160,235,A)', 0.12);
      strokeGreat(ctx, cam, Math.PI / 2, 'rgba(120,160,235,A)', 0.12);
    }
    // 再生線（子午線）：今鳴っている時刻
    drawPlayhead(ctx, cam, playTh);

    // 星：奥から手前の順に
    const pts = [];
    const now = performance.now();
    for (const s of E.stars) { const p = proj(cam, s.pos); if (p) pts.push({ s, p }); }
    pts.sort((a, b) => b.p.z - a.p.z);
    ctx.globalCompositeOperation = 'lighter';
    for (const { s, p } of pts) {
      const col = E.api.colors[s.k] || '#ffffff';
      const a = depthA(cam, p.z); const sz = (s.k === 'night' ? 30 : s.k === 'gold' ? 24 : s.small ? 15 : 21) * (cam.inside ? 1.15 : clamp(3.2 / p.z, 0.7, 1.4));
      const fl = E.flashes.find(f => f.s === s && now >= f.t0 && now < f.t0 + 900);
      const boost = fl ? 1 + 1.4 * (1 - (now - fl.t0) / 900) : 1;
      ctx.globalAlpha = clamp(a * (s.ring.isToday ? 1 : 0.85), 0, 1);
      ctx.drawImage(sprite(col), p.x - sz * boost / 2, p.y - sz * boost / 2, sz * boost, sz * boost);
      E.hits.push({ x: p.x, y: p.y, z: p.z, s });
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    for (const { s, p } of pts) {
      const col = E.api.colors[s.k] || '#ffffff'; const a = depthA(cam, p.z);
      ctx.fillStyle = col; ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(p.x, p.y, s.k === 'night' ? 2.4 : s.small ? 1.3 : 1.8, 0, TAU); ctx.fill();
      if (E.sel && E.sel === s) { ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, TAU); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    // 鳴った星の波紋
    E.flashes = E.flashes.filter(f => now < f.t0 + 1100);
    for (const f of E.flashes) {
      if (now < f.t0) continue; const p = proj(cam, f.s.pos); if (!p) continue; const k = (now - f.t0) / 1100;
      ctx.strokeStyle = `rgba(214,232,255,${(1 - k) * 0.75})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, 6 + k * 26, 0, TAU); ctx.stroke();
    }
    // 日付の札：今日・月曜・1日・選んだ日（手前側に）
    drawRingLabels(ctx, cam);
    // 見上げるとき：真ん中に「聞いている範囲」
    if (cam.inside) {
      ctx.strokeStyle = 'rgba(185,215,255,.22)'; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.min(W, H) * 0.24, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(185,215,255,.5)'; ctx.beginPath(); ctx.moveTo(W / 2 - 6, H / 2); ctx.lineTo(W / 2 + 6, H / 2); ctx.moveTo(W / 2, H / 2 - 6); ctx.lineTo(W / 2, H / 2 + 6); ctx.stroke();
    }
    const tEl = E.el && E.el.querySelector('.orr-clock'); if (tEl) { const txt = hmH(E.playT); if (tEl.textContent !== txt) tEl.textContent = txt; }
  }
  function awakeSpan(ring) {
    let w = ring.wake ? hourOf(ring.wake) : null; if (w == null) return null;
    let endTs = ring.sleep || (ring.isToday ? Date.now() : null); if (!endTs || !ring.wake) return null;
    let len = (endTs - ring.wake) / 3600e3; if (!(len > 0.2)) return null; len = Math.min(len, 23.5);
    return [w, w + len];
  }
  // 輪を細かい区間に分けて、区間ごとに手前・奥の明るさを付けて描く
  function strokeRing(ctx, cam, r, y, a0, a1, colT, baseA, width, ring) {
    const n = Math.max(8, Math.ceil(Math.abs(a1 - a0) / TAU * 120));
    let prev = null;
    ctx.lineWidth = width; ctx.lineCap = 'round';
    for (let i = 0; i <= n; i++) {
      const th = a0 + (a1 - a0) * i / n; const p = proj(cam, onRing(r, y, th));
      if (p && prev) {
        const a = baseA * depthA(cam, (p.z + prev.z) / 2);
        ctx.strokeStyle = colT.replace('A', a.toFixed(3)); ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        if (ring && i % 4 === 0) E.ringHits.push({ x: p.x, y: p.y, z: p.z, ring });
      }
      prev = p;
    }
  }
  function strokeGreat(ctx, cam, az, colT, baseA) {
    let prev = null; ctx.lineWidth = 1;
    for (let i = 0; i <= 96; i++) {
      const t = i / 96 * TAU; const p = proj(cam, [Math.sin(az) * Math.cos(t), Math.sin(t), -Math.cos(az) * Math.cos(t)]);
      if (p && prev) { ctx.strokeStyle = colT.replace('A', (baseA * depthA(cam, p.z)).toFixed(3)); ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
      prev = p;
    }
  }
  function drawPlayhead(ctx, cam, th) {
    const top = E.rings.length ? E.rings[0].lat : 74 * DEG; const pts = [];
    for (let i = 0; i <= 40; i++) { const lat = top * 1.06 * i / 40; const p = proj(cam, onRing(Math.cos(lat) * 1.0, Math.sin(lat), th)); if (p) pts.push(p); }
    if (pts.length < 2) return;
    const line = (w, c) => { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); };
    ctx.globalCompositeOperation = 'lighter';
    line(7, 'rgba(77,141,255,.10)'); line(3, 'rgba(110,165,255,.22)'); line(1.2, E.play ? 'rgba(225,238,255,.95)' : 'rgba(225,238,255,.6)');
    ctx.globalCompositeOperation = 'source-over';
    // 輪と交わる点
    for (const ring of E.rings) { const p = proj(cam, onRing(ring.r, ring.y, th)); if (!p) continue; ctx.fillStyle = `rgba(225,238,255,${0.55 * depthA(cam, p.z)})`; ctx.beginPath(); ctx.arc(p.x, p.y, ring.isToday ? 2.6 : 1.3, 0, TAU); ctx.fill(); }
  }
  function drawRingLabels(ctx, cam) {
    // 外から：カメラに一番近い向きに札を出す。見上げる：視線の少し右に出す
    const th = cam.inside ? (E.lookYaw + (E.gyroOn && E.gyro ? E.gyro.yaw : 0)) + 0.32 : Math.atan2(cam.pos[0], -cam.pos[2]) + 0.55;
    ctx.font = '500 11px "Google Sans Flex","Figtree","Zen Kaku Gothic New",system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    // 札どうしが重ならないように、今日・選んだ日を先に置き、近すぎる札は出さない
    const placed = [];
    const order = [...E.rings].sort((a, b) => (b.isToday - a.isToday) || ((E.selRing === b.d) - (E.selRing === a.d)) || (b.monday - a.monday) || (b.i - a.i));
    for (const ring of order) {
      const sel = E.selRing === ring.d;
      if (!(ring.isToday || sel || ring.monday || ring.first || ring.i === 0)) continue;
      const p = proj(cam, onRing(ring.r * 1.02, ring.y, th)); if (!p) continue;
      if (placed.some(q => Math.abs(q.y - p.y) < 14 && Math.abs(q.x - p.x) < 90)) continue;
      placed.push(p);
      const a = depthA(cam, p.z);
      const txt = ring.isToday ? '今日' : `${md(ring.d)}（${wdOf(ring.d)}）`;
      ctx.fillStyle = sel ? `rgba(255,255,255,${a})` : ring.isToday ? `rgba(185,215,255,${a})` : `rgba(160,180,220,${a * 0.75})`;
      ctx.fillText(txt, p.x + 6, p.y);
    }
  }

  /* ── 時間を進めて、再生線が横切った星を鳴らす ── */
  function tick(ts) {
    E.raf = 0; if (!E.el || !E.el.isConnected || document.hidden) { stopLoop(); return; }
    const dt = E.lastTs ? Math.min(0.1, (ts - E.lastTs) / 1000) : 0; E.lastTs = ts;
    const idle = Date.now() - E.lastInteract > 2500;
    if (E.mode === 'outside' && idle && !E.drag && !reduce()) E.yaw += dt * 0.05; // ゆっくり自転
    // 何もしないまま1分たったら止まる（電池のため）。触れば動き出す
    if (!E.play && !E.gyroOn && Date.now() - E.lastInteract > 60000 && !E.flashes.length) { draw(); E.raf = 0; return; }
    if (E.play) {
      const prev = E.playT; E.playT = (E.playT + dt * E.speed * (24 / 36)) % 24; // 1倍で 36秒＝1日
      crossings(prev, E.playT);
    }
    draw();
    E.raf = requestAnimationFrame(tick);
  }
  function crossings(a, b) {
    const between = h => (a <= b ? h > a && h <= b : h > a || h <= b);
    // 6時間ごとの区切りの低音
    [0, 6, 12, 18].forEach((h, i) => { if (between(h)) playNote('bass', [0, 4, 3, 4][i] + 5, 0.9, 0, true, 2); }); // 根音・5度・4度・5度
    const cam = camera();
    for (const s of E.stars) {
      if (!between(s.h)) continue;
      let v = 1, pan = 0;
      const p = proj(cam, s.pos);
      if (cam.inside) {
        // 見上げているとき：視線の真ん中に近い星ほど大きく。外れた星はかすかに
        const dir = norm(sub(s.pos, cam.pos)); const ang = Math.acos(clamp(dot(dir, cam.fw), -1, 1));
        v = 0.1 + 0.9 * Math.exp(-Math.pow(ang / (30 * DEG), 2));
      } else if (p) v = 0.45 + 0.55 * depthA(cam, p.z);
      else v = 0.35;
      if (p) pan = (p.x / E.w - 0.5) * 1.6;
      // 今日に近い日ほど少し大きく
      v *= 0.75 + 0.25 * (1 - s.ring.f);
      const t = playNote(s.k, starNote(s), v, pan, darkDay(s.ring), s.ring.isToday ? 2 : 1);
      if (t != null) E.flashes.push({ s, t0: performance.now() + Math.max(0, (t - AU.ctx.currentTime) * 1000) });
    }
  }
  function startLoop() { if (!E.raf) { E.lastTs = 0; E.raf = requestAnimationFrame(tick); } }
  function stopLoop() { if (E.raf) cancelAnimationFrame(E.raf); E.raf = 0; }

  /* ── 操作 ── */
  function resize() {
    if (!E.cv) return; const w = E.cv.parentElement.clientWidth; const h = Math.round(clamp(w * 1.02, 300, 560));
    E.dpr = Math.min(2, window.devicePixelRatio || 1); E.w = w; E.h = h;
    E.cv.width = Math.round(w * E.dpr); E.cv.height = Math.round(h * E.dpr); E.cv.style.height = h + 'px';
    if (!E.dust.length) { let s = 7; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647); E.dust = Array.from({ length: 90 }, () => ({ x: R(), y: R(), a: 0.05 + R() * 0.25, s: R() < 0.9 ? 1 : 1.5 })); }
  }
  function pick(x, y) {
    let best = null, bd = 22;
    for (const h of E.hits) { const d = Math.hypot(h.x - x, h.y - y) - (E.mode === 'outside' ? (3.5 - h.z) * 2 : 0); if (d < bd) { bd = d; best = h.s; } }
    if (best) return { star: best };
    let br = null, rd = 12; for (const h of E.ringHits) { const d = Math.hypot(h.x - x, h.y - y); if (d < rd) { rd = d; br = h.ring; } }
    return br ? { ring: br } : null;
  }
  function onTap(x, y) {
    const r = pick(x, y);
    if (r && r.star) {
      E.sel = r.star; E.selRing = r.star.ring.d;
      ensureAudio(); const t = playNote(r.star.k, starNote(r.star), 0.9, (x / E.w - 0.5) * 1.6, darkDay(r.star.ring), 2);
      if (t != null) E.flashes.push({ s: r.star, t0: performance.now() + Math.max(0, (t - AU.ctx.currentTime) * 1000) });
    } else if (r && r.ring) { E.sel = null; E.selRing = E.selRing === r.ring.d ? null : r.ring.d; }
    else { E.sel = null; E.selRing = null; }
    renderDetail(); draw();
  }
  function bindCanvas(cv) {
    const pts = new Map();
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY, x0: e.offsetX, y0: e.offsetY, t: Date.now() }); E.lastInteract = Date.now(); if (pts.size === 2) { const [a, b] = [...pts.values()]; E.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: E.dist }; } hideHint(); startLoop(); });
    cv.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId); if (!p) return; const dx = e.offsetX - p.x, dy = e.offsetY - p.y; p.x = e.offsetX; p.y = e.offsetY; E.lastInteract = Date.now();
      if (pts.size === 2 && E.pinch && E.mode === 'outside') { const [a, b] = [...pts.values()]; E.dist = clamp(E.pinch.dist * E.pinch.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), 2.1, 5.2); return; }
      if (Math.hypot(e.offsetX - p.x0, e.offsetY - p.y0) > 6) E.drag = true;
      if (E.mode === 'outside') { E.yaw -= dx * 0.009; E.pitch = clamp(E.pitch + dy * 0.007, -0.1, 1.5); }
      else { E.lookYaw -= dx * 0.0065; if (!E.gyroOn) E.lookPitch = clamp(E.lookPitch + dy * 0.0065, 0.1, 1.5); } // 空をつかんで動かす向き
      if (!E.raf) draw();
    });
    const up = e => {
      const p = pts.get(e.pointerId); pts.delete(e.pointerId); if (pts.size < 2) E.pinch = null;
      if (p && !E.drag && Date.now() - p.t < 450 && pts.size === 0) onTap(e.offsetX, e.offsetY);
      if (pts.size === 0) setTimeout(() => { E.drag = null; }, 0);
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { if (E.mode !== 'outside') return; e.preventDefault(); E.dist = clamp(E.dist * (1 + e.deltaY * 0.0012), 2.1, 5.2); E.lastInteract = Date.now(); startLoop(); }, { passive: false });
    // キーボード：矢印で回す、スペースで再生
    cv.tabIndex = 0;
    cv.addEventListener('keydown', e => {
      const k = e.key; let hit = true;
      if (k === 'ArrowLeft') { if (E.mode === 'outside') E.yaw += 0.12; else E.lookYaw -= 0.12; }
      else if (k === 'ArrowRight') { if (E.mode === 'outside') E.yaw -= 0.12; else E.lookYaw += 0.12; }
      else if (k === 'ArrowUp') { if (E.mode === 'outside') E.pitch = clamp(E.pitch + 0.1, -0.1, 1.5); else E.lookPitch = clamp(E.lookPitch + 0.1, -0.05, 1.5); }
      else if (k === 'ArrowDown') { if (E.mode === 'outside') E.pitch = clamp(E.pitch - 0.1, -0.1, 1.5); else E.lookPitch = clamp(E.lookPitch - 0.1, -0.05, 1.5); }
      else if (k === ' ') togglePlay(); else hit = false;
      if (hit) { e.preventDefault(); E.lastInteract = Date.now(); draw(); }
    });
  }
  function hideHint() { const h = E.el && E.el.querySelector('.orr-hint'); if (h && !h.hidden) { h.hidden = true; store.set('hinted', true); } }
  function ensureAudio() { const ctx = audioInit(); if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); return ctx; }
  function togglePlay() {
    E.play = !E.play;
    if (E.play) { ensureAudio(); drone(AU.on); startLoop(); } else drone(false);
    syncControls();
  }
  // スマホの傾きで見回す（iPhoneは最初に許可がいる）
  async function toggleGyro() {
    if (E.gyroOn) { E.gyroOn = false; E.gyro = null; window.removeEventListener('deviceorientation', onOrient); syncControls(); return; }
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') throw new Error('denied');
      }
      E.gyroBase = null; E.gyroOn = true; window.addEventListener('deviceorientation', onOrient); setMsg('スマホを空に向けると、その方向の日と時刻が見える。');
    } catch (_) { setMsg('傾きを使えなかった。指でなぞって見回せる。'); }
    syncControls();
  }
  function onOrient(e) {
    if (e.alpha == null || e.beta == null) return;
    if (!E.gyroBase) E.gyroBase = { alpha: e.alpha, yaw: E.lookYaw };
    let da = (E.gyroBase.alpha - e.alpha) * DEG; // 右を向くと時刻が進む方向へ
    E.gyro = { yaw: da, pitch: clamp((e.beta - 90) * DEG, -0.05, 1.5) };
    E.lastInteract = Date.now(); startLoop();
  }
  function setMsg(t) { const m = E.el && E.el.querySelector('.orr-msg'); if (m) { m.textContent = t; m.hidden = !t; clearTimeout(E.msgT); E.msgT = setTimeout(() => { m.hidden = true; }, 4500); } }

  /* ── 画面の部品 ── */
  const IC = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5.5" width="4" height="13" rx="1.2" fill="currentColor"/><rect x="13.5" y="5.5" width="4" height="13" rx="1.2" fill="currentColor"/></svg>',
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
    now: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/></svg>',
    tilt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="3.5" width="10" height="17" rx="2.5" transform="rotate(-18 12 12)"/><path d="M3.5 8.5a9 9 0 0 1 3-4M20.5 15.5a9 9 0 0 1-3 4"/></svg>',
  };
  function build() {
    const el = document.createElement('div'); el.className = 'orr';
    el.innerHTML = `
      <div class="orr-stage">
        <canvas class="orr-cv" role="img" aria-label="天球。1日が1本の輪で、地平線の輪が今日、天頂に近いほど昔の日。輪の上の位置が時刻。星をタップすると記録が読める"></canvas>
        <div class="orr-top">
          <div class="orr-seg" role="group" aria-label="見かた"><button data-o="mode" data-v="outside">外から</button><button data-o="mode" data-v="inside">見上げる</button></div>
          <div class="orr-seg sm" role="group" aria-label="期間"><button data-o="range" data-v="14">2週間</button><button data-o="range" data-v="30">1か月</button></div>
        </div>
        <div class="orr-hint" ${store.get('hinted', false) ? 'hidden' : ''}>指でなぞって回す・▶で星が鳴る</div>
        <div class="orr-msg" hidden></div>
        <div class="orr-bar">
          <button class="orr-play" data-o="play" aria-label="再生"></button>
          <div class="orr-clock" aria-live="off">--:--</div>
          <button class="orr-btn" data-o="speed" aria-label="速さ">1×</button>
          <button class="orr-btn ic" data-o="now" aria-label="今の時刻へ">${IC.now}</button>
          <button class="orr-btn ic" data-o="gyro" aria-label="傾きで見回す" hidden>${IC.tilt}</button>
          <button class="orr-btn ic" data-o="sound" aria-label="音"></button>
        </div>
      </div>
      <div class="orr-detail" aria-live="polite" hidden></div>`;
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-o]'); if (!b) return; const o = b.dataset.o, v = b.dataset.v;
      E.lastInteract = Date.now(); hideHint(); startLoop();
      if (o === 'mode') { E.mode = v; store.set('mode', v); if (v === 'inside') { E.lookYaw = azim(E.playT); E.lookPitch = 0.35; } else if (E.gyroOn) toggleGyro(); syncControls(); draw(); }
      else if (o === 'range') { E.range = Number(v); store.set('range', E.range); if (E.api.need) E.api.need(E.range); buildData(); E.sel = null; renderDetail(); syncControls(); draw(); }
      else if (o === 'play') togglePlay();
      else if (o === 'speed') { E.speed = E.speed === 1 ? 2 : E.speed === 2 ? 4 : E.speed === 4 ? 0.5 : 1; syncControls(); }
      else if (o === 'now') { E.playT = hourOf(Date.now()); if (E.mode === 'inside') E.lookYaw = azim(E.playT); draw(); }
      else if (o === 'sound') { setSound(!AU.on); if (AU.on) { ensureAudio(); if (E.play) drone(true); } else drone(false); syncControls(); }
      else if (o === 'gyro') toggleGyro();
      else if (o === 'close') { E.sel = null; E.selRing = null; renderDetail(); draw(); }
    });
    E.el = el; E.cv = el.querySelector('canvas'); E.ctx = E.cv.getContext('2d');
    bindCanvas(E.cv);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { if (E.play) { E.play = false; drone(false); syncControls(); } if (AU.ctx && AU.ctx.state === 'running') AU.ctx.suspend().catch(() => {}); } else if (E.el && E.el.isConnected) startLoop(); });
    window.addEventListener('resize', () => { if (E.el && E.el.isConnected) { resize(); draw(); } });
  }
  function syncControls() {
    const el = E.el; if (!el) return;
    el.querySelectorAll('[data-o="mode"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === E.mode)));
    el.querySelectorAll('[data-o="range"]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === E.range)));
    const pb = el.querySelector('[data-o="play"]'); pb.innerHTML = E.play ? IC.pause : IC.play; pb.setAttribute('aria-label', E.play ? '止める' : '再生'); pb.setAttribute('aria-pressed', String(E.play));
    el.querySelector('[data-o="speed"]').textContent = (E.speed === 0.5 ? '½' : E.speed) + '×';
    const sb = el.querySelector('[data-o="sound"]'); sb.innerHTML = AU.on ? IC.sound : IC.mute; sb.setAttribute('aria-label', AU.on ? '音を消す' : '音を出す'); sb.setAttribute('aria-pressed', String(AU.on));
    const gb = el.querySelector('[data-o="gyro"]'); gb.hidden = E.mode !== 'inside' || !('DeviceOrientationEvent' in window); gb.setAttribute('aria-pressed', String(E.gyroOn));
    el.classList.toggle('inside', E.mode === 'inside');
  }
  function renderDetail() {
    const box = E.el && E.el.querySelector('.orr-detail'); if (!box) return; const api = E.api;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    if (E.sel) {
      const s = E.sel; const col = api.colors[s.k];
      box.innerHTML = `<div class="orr-dh"><span class="orr-dot" style="--c:${col}"></span><b>${md(s.ring.d)}（${wdOf(s.ring.d)}） ${hm(s.t)}</b><span class="orr-kind">${KIND_NAME[s.k] || ''}</span><button class="orr-x" data-o="close" aria-label="閉じる">×</button></div><div class="orr-dt">${esc(s.label)}</div>`;
      box.hidden = false; return;
    }
    if (E.selRing) {
      const r = E.rings.find(x => x.d === E.selRing); if (!r) { box.hidden = true; return; }
      const cnt = r.stars.length; const name = r.info && r.info.name;
      const wake = r.wake ? hm(r.wake) : '—', sleep = r.sleep ? hm(r.sleep) : r.isToday ? 'まだ' : '—';
      box.innerHTML = `<div class="orr-dh"><b>${r.isToday ? '今日' : md(r.d)}（${wdOf(r.d)}）</b>${name ? `<span class="orr-name">${esc(name)}</span>` : ''}<button class="orr-x" data-o="close" aria-label="閉じる">×</button></div><div class="orr-dt"><span>起きた ${wake}</span><span>寝た ${sleep}</span><span>星 ${cnt}個</span>${r.info && (r.info.mode === 'bad' || r.info.mode === 'rest') ? '<span>くもりの日</span>' : ''}</div>`;
      box.hidden = false; return;
    }
    box.hidden = true; box.innerHTML = '';
  }

  /* ── 画面からの呼び出し ── */
  function signature(api) {
    const N = E.range; let s = api.today + '|' + N;
    for (let i = 0; i < N; i++) { const d = api.addDays(api.today, -i); const st = api.dayStars(d); s += '|' + d + ':' + st.length + ':' + (st.length ? st[st.length - 1].t : 0) + ':' + (api.wake(d) || 0) + ':' + (api.sleep(d) || 0); }
    return s;
  }
  window.DaylogOrrery = {
    attach(host, api) {
      E.api = api; if (!E.el) build();
      if (E.el.parentElement !== host) host.appendChild(E.el);
      if (api.need) api.need(E.range);
      const sig = signature(api); if (sig !== E.sig) { E.sig = sig; buildData(); }
      E.lastInteract = Date.now(); resize(); syncControls(); renderDetail(); draw(); startLoop();
    },
    refresh(api) {
      if (!E.el || !E.el.isConnected) return; E.api = api;
      const sig = signature(api); if (sig !== E.sig) { E.sig = sig; buildData(); renderDetail(); draw(); }
    },
    detach() {
      stopLoop(); if (E.play) { E.play = false; drone(false); syncControls(); }
      if (E.gyroOn) { E.gyroOn = false; window.removeEventListener('deviceorientation', onOrient); }
      if (AU.ctx && AU.ctx.state === 'running') AU.ctx.suspend().catch(() => {});
    },
    // 音の大きさを測る（確認用）：最大値と平均の強さ
    _meter() { if (!AU.ctx) return null; if (!AU.an) { AU.an = AU.ctx.createAnalyser(); AU.an.fftSize = 2048; AU.out.connect(AU.an); AU.peak = 0; AU.sum = 0; AU.n = 0; const buf = new Float32Array(2048); setInterval(() => { AU.an.getFloatTimeDomainData(buf); let pk = 0, ss = 0; for (const v of buf) { pk = Math.max(pk, Math.abs(v)); ss += v * v; } AU.peak = Math.max(AU.peak, pk); AU.sum += Math.sqrt(ss / buf.length); AU.n++; }, 40); } return { peak: AU.peak, rms: AU.n ? AU.sum / AU.n : 0 }; },
    _debug: () => ({ rings: E.rings.length, stars: E.stars.length, mode: E.mode, play: E.play, playT: E.playT, audio: AU.ctx ? AU.ctx.state : 'none', voices: AU.voices }),
  };
})();
