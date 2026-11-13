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
     pluggnb（プラッグ＋R&B）寄りの、キラキラ・ピロピロしたアンビエント
     まとまりのための決まり
     1. 調は D メジャーだけ。和音は Gmaj7 → F#m7 → Em9 → Dmaj9 を1小節ずつ回す（R&Bの柔らかい和音）
     2. 星の音は、そのとき鳴っている和音の音にだけ寄せる（どの星が鳴っても和音からはみ出さない）
     3. 鳴るタイミングは16分音符の拍にそろえる（75BPM・半分のノリ＝pluggnbの速さ）。1拍に4音、全体で同時22音まで
     4. 楽器：日記＝キラキラのベル（左右にはねる残響つき）＋気分がいい日は「ピロピロ」と和音を駆け上がる音
              タスク＝短いプラック＋装飾音、習慣・目標＝高いグラス、夜モード＝やわらかい膨らむ音
     5. 下には、ゆらぐ和音のパッド、808の低音、細かいハイハット（作業ではひかえめ、睡眠では無し）、
        ときどき遠くで光る小さな音（グリッター）、ごく小さなノイズ（空気の質感）
     6. 大きな残響（4.5秒）と左右のディレイでひとつの空間にまとめ、最後にコンプレッサーで音量をならす
     7. 不調・休養の日の星は、同じ和音のまま少しくぐもらせる（悲しい音にはしない）
     使い方（音のモード）
     ・聴く：いちばん華やか
     ・作業：ビートを弱め、ピンクノイズと16Hzのうなり（左右の耳でわずかに違う高さ＝バイノーラル。イヤホンで効く）
     ・睡眠：ビート無し・ゆっくり・暗め。うなりは 6Hz から 2Hz へ15分かけて下がる。ブラウンノイズ。タイマーで静かに消える */
  const D3 = 146.83;
  const PROG = [ // D からの半音（和音の音）
    { name: 'Gmaj7', root: 5, tones: [5, 9, 12, 16, 19] },
    { name: 'F#m7', root: 4, tones: [4, 7, 11, 14, 16] },
    { name: 'Em9', root: 2, tones: [2, 5, 9, 12, 18] },
    { name: 'Dmaj9', root: 0, tones: [0, 4, 7, 11, 16] },
  ];
  const SMODES = {
    listen: { label: '聴く', bpm: 75, kick: 0.26, hat: 0.05, pad: 0.05, padCut: 1700, noise: 'pink', noiseG: 0.004, glitter: 0.07, arp: true, star: 1, beat: null },
    work: { label: '作業', bpm: 75, kick: 0.12, hat: 0.022, pad: 0.045, padCut: 1300, noise: 'pink', noiseG: 0.012, glitter: 0.04, arp: true, star: 0.8, beat: { hz: 16, gain: 0.035 } },
    sleep: { label: '睡眠', bpm: 56, kick: 0, hat: 0, pad: 0.055, padCut: 650, noise: 'brown', noiseG: 0.03, glitter: 0.015, arp: false, star: 0.55, beat: { from: 6, to: 2, minutes: 15, gain: 0.04 } },
  };
  const hzOf = semi => D3 * Math.pow(2, semi / 12);
  const AU = { ctx: null, on: store.get('sound', true), vol: 0.8, voices: 0, slots: new Map(), smode: store.get('smode', 'listen'), timerMin: store.get('timer', 60) };
  function audioInit() {
    if (AU.ctx) return AU.ctx;
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch (_) {} // iPhoneのマナーモードに従う
    const ctx = AU.ctx = new C();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 3; comp.attack.value = 0.008; comp.release.value = 0.4;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 11000;
    const master = ctx.createGain(); master.gain.value = AU.on ? AU.vol : 0;
    comp.connect(tone); tone.connect(master); master.connect(ctx.destination);
    // 残響：その場で作る、4.5秒で消えていく広がり（高い音から先に消える）
    const sr = ctx.sampleRate, len = Math.floor(sr * 4.5); const ir = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) { const a = ir.getChannelData(ch); let lp = 0; for (let i = 0; i < len; i++) { const t = i / len; lp += ((Math.random() * 2 - 1) - lp) * (0.9 - t * 0.75); a[i] = lp * Math.pow(1 - t, 2.6) * (i < sr * 0.02 ? i / (sr * 0.02) : 1); } }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    const revRet = ctx.createGain(); revRet.gain.value = 0.55; conv.connect(revRet); revRet.connect(comp);
    // 左右にはねるディレイ（付点8分）
    const beat = 60 / 75; const dl = ctx.createDelay(2), dr = ctx.createDelay(2); dl.delayTime.value = beat * 0.75; dr.delayTime.value = beat * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.38; const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 3200;
    const merger = ctx.createChannelMerger(2); const dlyIn = ctx.createGain();
    dlyIn.connect(dl); dl.connect(dlp); dlp.connect(dr); dr.connect(fb); fb.connect(dl);
    dl.connect(merger, 0, 0); dr.connect(merger, 0, 1); const dlyRet = ctx.createGain(); dlyRet.gain.value = 0.32; merger.connect(dlyRet); dlyRet.connect(comp); dlyRet.connect(conv);
    const dry = ctx.createGain(); dry.gain.value = 0.85; dry.connect(comp);
    Object.assign(AU, { master, comp, rev: conv, dly: dlyIn, dry });
    return ctx;
  }
  const M = () => SMODES[AU.smode] || SMODES.listen;
  const stepLen = () => 60 / M().bpm / 4; // 16分音符
  const barLen = () => 60 / M().bpm * 4;
  // 今の小節の和音（再生を始めた時刻からの小節数で回す）
  const chordAt = t => PROG[((Math.floor(((t || 0) - (AU.t0 || 0)) / barLen()) % 4) + 4) % 4];
  // 欲しい高さに一番近い、和音の音
  function snap(semi, chord) {
    let best = semi, bd = 99;
    for (let o = -24; o <= 36; o += 12) for (const c of chord.tones) { const v = c + o; const d = Math.abs(v - semi); if (d < bd) { bd = d; best = v; } }
    return best;
  }
  // 1つの声：左右の位置・くぐもり・残響とディレイへの送り
  function voice(t, { pan = 0, dark = false, dur = 2, rev = 0.5, dly = 0, cut = 9000 }) {
    const ctx = AU.ctx; const g = ctx.createGain(); g.gain.value = 0;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = dark ? Math.min(cut, 1800) : cut; f.Q.value = 0.4;
    g.connect(f); let node = f;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -0.9, 0.9); node.connect(p); node = p; }
    node.connect(AU.dry);
    if (rev) { const s = ctx.createGain(); s.gain.value = rev; node.connect(s); s.connect(AU.rev); }
    if (dly) { const s = ctx.createGain(); s.gain.value = dly; node.connect(s); s.connect(AU.dly); }
    AU.voices++; setTimeout(() => { AU.voices = Math.max(0, AU.voices - 1); try { g.disconnect(); } catch (_) {} }, (t - ctx.currentTime + dur + 0.5) * 1000);
    return g;
  }
  const env = (gp, t, peak, atk, dec) => { gp.setValueAtTime(0.0001, t); gp.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + atk); gp.exponentialRampToValueAtTime(0.0001, t + atk + dec); };
  const osc = (type, hz, t, stop, dest, gain = 1, detune = 0) => { const o = AU.ctx.createOscillator(); o.type = type; o.frequency.value = hz; o.detune.value = detune; const g = AU.ctx.createGain(); g.gain.value = gain; o.connect(g); g.connect(dest); o.start(t); o.stop(stop); return o; };
  const INST = {
    // キラキラのベル（FMの金属的な倍音＋1オクターブ上のきらめき）。左右にはねる
    bell(t, hz, v, o) {
      const dur = 2.6; const g = voice(t, { ...o, dur, rev: 0.55, dly: 0.35 });
      const c = AU.ctx.createOscillator(); c.frequency.value = hz;
      const m = AU.ctx.createOscillator(); m.frequency.value = hz * 3.01; const mi = AU.ctx.createGain(); mi.gain.setValueAtTime(hz * 1.2, t); mi.gain.exponentialRampToValueAtTime(hz * 0.01, t + 0.8);
      m.connect(mi); mi.connect(c.frequency); c.connect(g); c.start(t); m.start(t); c.stop(t + dur + 0.1); m.stop(t + dur + 0.1);
      osc('sine', hz * 2, t, t + dur, g, 0.22); osc('triangle', hz * 4.0, t, t + 0.4, g, 0.05);
      env(g.gain, t, 0.15 * v, 0.004, dur);
    },
    // ピロピロ：細い矩形波の短い音（少しだけビブラート）
    piro(t, hz, v, o) {
      const dur = 0.32; const g = voice(t, { ...o, dur, rev: 0.4, dly: 0.45, cut: 4200 });
      const a = osc('square', hz, t, t + dur + 0.05, g, 0.5); const b = osc('sine', hz * 2, t, t + dur + 0.05, g, 0.35);
      const lfo = AU.ctx.createOscillator(); lfo.frequency.value = 9; const lg = AU.ctx.createGain(); lg.gain.value = 9; lfo.connect(lg); lg.connect(a.detune); lg.connect(b.detune); lfo.start(t); lfo.stop(t + dur + 0.05);
      env(g.gain, t, 0.07 * v, 0.003, dur);
    },
    // タスク：短いプラック
    pluck(t, hz, v, o) {
      const dur = 0.9; const g = voice(t, { ...o, dur, rev: 0.45, dly: 0.2, cut: 5000 });
      osc('triangle', hz, t, t + dur, g, 1); osc('sine', hz * 2, t, t + 0.25, g, 0.3);
      env(g.gain, t, 0.17 * v, 0.003, dur);
    },
    // 習慣・目標：高いグラス
    glass(t, hz, v, o) {
      const dur = 3.4; const g = voice(t, { ...o, dur, rev: 0.7, dly: 0.3 });
      osc('sine', hz, t, t + dur, g, 1); osc('sine', hz * 2.001, t, t + dur, g, 0.3); osc('sine', hz * 3.003, t, t + 1.2, g, 0.1);
      env(g.gain, t, 0.09 * v, 0.02, dur);
    },
    // 夜モード：やわらかく膨らむ音
    swell(t, hz, v, o) {
      const dur = 4.5; const g = voice(t, { ...o, dark: true, dur, rev: 0.8, cut: 1400 });
      osc('sawtooth', hz, t, t + dur + 0.6, g, 0.4, -7); osc('sawtooth', hz, t, t + dur + 0.6, g, 0.4, 7); osc('sine', hz / 2, t, t + dur + 0.6, g, 0.6);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06 * v, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    },
    // 808：低い正弦波が少し下がる。わずかに歪ませて芯を出す
    kick(t, hz, v) {
      const ctx = AU.ctx, dur = 1.5; const g = ctx.createGain(); g.gain.value = 0;
      const sh = ctx.createWaveShaper(); const cv = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; cv[i] = Math.tanh(x * 1.8); } sh.curve = cv;
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(hz * 2.2, t); o.frequency.exponentialRampToValueAtTime(hz, t + 0.06);
      o.connect(sh); sh.connect(g); g.connect(AU.dry); o.start(t); o.stop(t + dur + 0.1);
      env(g.gain, t, v, 0.004, dur);
      AU.voices++; setTimeout(() => { AU.voices = Math.max(0, AU.voices - 1); }, (t - ctx.currentTime + dur + 0.3) * 1000);
    },
    // ハイハット：高い所だけ残したノイズの、ごく短い音
    hat(t, v, pan = 0) {
      const ctx = AU.ctx; const src = ctx.createBufferSource(); src.buffer = noiseBuf('white');
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7500;
      const g = ctx.createGain(); env(g.gain, t, v, 0.001, 0.045);
      let node = g; if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
      src.connect(hp); hp.connect(g); node.connect(AU.dry); src.start(t, Math.random() * 1.5); src.stop(t + 0.08);
    },
  };
  const NB = {};
  function noiseBuf(kind) {
    if (NB[kind]) return NB[kind];
    const ctx = AU.ctx, len = ctx.sampleRate * 4; const b = ctx.createBuffer(1, len, ctx.sampleRate); const a = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'pink') { b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; a[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
      else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; a[i] = last * 3.5; }
      else a[i] = w;
    }
    // つなぎ目のぷつっという音を消す
    for (let i = 0; i < 2000; i++) { const k = i / 2000; a[i] *= k; a[len - 1 - i] *= k; }
    return (NB[kind] = b);
  }

  /* ── 下で鳴り続ける層：パッド・ノイズ・うなり・ビート（小節ごとに先回りして予約する） ── */
  const TR = { on: false, timer: 0, nextBar: 0, bar: 0, layers: null, endAt: 0 };
  function bedStart() {
    const ctx = AU.ctx; if (!ctx || TR.on) return; const m = M();
    TR.on = true; AU.t0 = ctx.currentTime + 0.12; TR.nextBar = AU.t0; TR.bar = 0;
    const L = TR.layers = { nodes: [] };
    // ノイズ（空気の質感・作業ではピンク、睡眠ではブラウン）
    const ns = ctx.createBufferSource(); ns.buffer = noiseBuf(m.noise); ns.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = m.noise === 'brown' ? 900 : 5200;
    const ng = ctx.createGain(); ng.gain.value = 0; ng.gain.setTargetAtTime(m.noiseG, ctx.currentTime, 2);
    ns.connect(nf); nf.connect(ng); ng.connect(AU.comp); ns.start(); L.nodes.push(ns); L.noiseG = ng;
    // うなり（バイノーラル）：左は D3、右は D3＋うなりの数。左右を分けて直接出す（残響を通さない）
    if (m.beat) {
      const merger = ctx.createChannelMerger(2); const bg = ctx.createGain(); bg.gain.value = 0; bg.gain.setTargetAtTime(m.beat.gain, ctx.currentTime, 3);
      const l = ctx.createOscillator(); l.frequency.value = D3; const r = ctx.createOscillator();
      const start = m.beat.hz || m.beat.from; r.frequency.value = D3 + start;
      if (m.beat.from) { r.frequency.setValueAtTime(D3 + m.beat.from, ctx.currentTime); r.frequency.linearRampToValueAtTime(D3 + m.beat.to, ctx.currentTime + m.beat.minutes * 60); }
      l.connect(merger, 0, 0); r.connect(merger, 0, 1); merger.connect(bg); bg.connect(AU.master); l.start(); r.start();
      L.nodes.push(l, r); L.beatG = bg;
    }
    sched(); TR.timer = setInterval(sched, 120);
  }
  function bedStop(fade = 0.6) {
    if (!TR.on) return; TR.on = false; clearInterval(TR.timer);
    const ctx = AU.ctx, L = TR.layers; TR.layers = null; if (!L) return;
    [L.noiseG, L.beatG, L.padG].forEach(g => { if (g) g.gain.setTargetAtTime(0.0001, ctx.currentTime, fade); });
    setTimeout(() => L.nodes.forEach(n => { try { n.stop(); } catch (_) {} }), fade * 6000);
  }
  // 小節を先回りして予約する（パッドの和音・808・ハイハット・グリッター）
  function sched() {
    const ctx = AU.ctx; if (!TR.on || !ctx) return; const m = M();
    while (TR.nextBar < ctx.currentTime + 0.6) {
      const t = TR.nextBar, bar = TR.bar, ch = PROG[bar % 4], bl = barLen(), st = stepLen();
      padChord(t, ch, bl, m);
      if (m.kick) { INST.kick(t, hzOf(ch.root - 24), m.kick); if (bar % 2 === 1) INST.kick(t + st * 10, hzOf(ch.root - 24), m.kick * 0.7); }
      if (m.hat) for (let i = 0; i < 16; i += 2) {
        INST.hat(t + i * st, m.hat * (i % 4 === 0 ? 1 : 0.6), i % 4 ? 0.25 : -0.15);
        if (bar % 4 === 3 && i === 12) for (let k = 1; k < 4; k++) INST.hat(t + i * st + k * st * 2 / 3, m.hat * 0.5, 0.35); // 3連のロール
      }
      // 遠くで光る小さな音（和音の音の高いところ）
      for (let i = 0; i < 16; i++) if (Math.random() < m.glitter) {
        const semi = ch.tones[Math.floor(Math.random() * ch.tones.length)] + 24 + (Math.random() < 0.4 ? 12 : 0);
        INST.glass(t + i * st, hzOf(semi), 0.35, { pan: Math.random() * 1.6 - 0.8 });
      }
      TR.nextBar += bl; TR.bar++;
    }
  }
  function padChord(t, ch, bl, m) {
    const ctx = AU.ctx; const g = ctx.createGain(); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = m.padCut; f.Q.value = 0.6;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.15; const lg = ctx.createGain(); lg.gain.value = m.padCut * 0.25; lfo.connect(lg); lg.connect(f.frequency);
    g.connect(f); f.connect(AU.dry); const rs = ctx.createGain(); rs.gain.value = 0.7; f.connect(rs); rs.connect(AU.rev);
    const end = t + bl + 1.6;
    ch.tones.slice(0, 4).forEach((semi, i) => { const hz = hzOf(semi - 12 + (i === 0 ? 0 : 0)); osc('sawtooth', hz, t, end, g, 0.25, -9); osc('sawtooth', hz, t, end, g, 0.25, 9); osc('triangle', hz, t, end, g, 0.35); });
    lfo.start(t); lfo.stop(end);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(m.pad, t + 0.9); g.gain.setValueAtTime(m.pad, t + bl); g.gain.exponentialRampToValueAtTime(0.0001, end);
    if (TR.layers) TR.layers.padG = g;
  }

  // 星を鳴らす：和音に寄せた高さで、16分の拍にそろえる。返り値は鳴る時刻（画面の光と合わせる）。鳴らさなかったら null
  function starSound(kind, semiWant, v, pan, dark, prio = 1, mood = null) {
    const ctx = AU.ctx; if (!ctx || !AU.on || ctx.state !== 'running') return null;
    const m = M(); const st = stepLen();
    let t = Math.ceil((ctx.currentTime + 0.03) / st) * st;
    for (let spill = 0; spill < 3; spill++, t += st) {
      const ch = chordAt(t); const semi = snap(semiWant, ch);
      const key = t.toFixed(3); const slot = AU.slots.get(key) || [];
      if (slot.some(s => s.kind === kind && s.semi === semi)) return t; // 同じ音はまとめる
      if (slot.length >= 4) continue;
      if (AU.voices >= 22 && prio < 2) return null; // 鳴っている音が多すぎるときは、今日以外の星を休ませる
      slot.push({ kind, semi }); AU.slots.set(key, slot);
      const tt = t + Math.random() * 0.01; const vv = v * m.star * (0.9 + Math.random() * 0.2); const o = { pan, dark };
      if (kind === 'diary') {
        INST.bell(tt, hzOf(semi), vv, o);
        // ピロピロ：気分がいい記録は、和音の音を16分の3連で駆け上がる
        if (m.arp && (mood == null || mood >= 3)) {
          const up = ch.tones.map(x => x + 12 * Math.ceil((semi - x) / 12)).filter(x => x >= semi).sort((a, b) => a - b);
          const seq = [...new Set([...up, ...up.map(x => x + 12)])].slice(1, mood >= 5 ? 6 : 4);
          seq.forEach((s2, i) => INST.piro(tt + (i + 1) * st * 2 / 3, hzOf(s2), vv * (0.9 - i * 0.12), { pan: pan + (i % 2 ? 0.3 : -0.3), dark }));
        }
      } else if (kind === 'task') {
        INST.pluck(tt, hzOf(semi), vv, o);
        if (m.arp) INST.piro(tt + st / 2, hzOf(snap(semi + 3, ch)), vv * 0.6, o); // 小さな装飾音
      } else if (kind === 'gold') INST.glass(tt, hzOf(semi), vv * 1.2, o);
      else INST.swell(tt, hzOf(semi), vv, o);
      if (AU.slots.size > 96) { const now = ctx.currentTime; for (const k of AU.slots.keys()) if (Number(k) < now - 1) AU.slots.delete(k); }
      return tt;
    }
    return null;
  }
  function setSound(on) {
    AU.on = on; store.set('sound', on);
    if (AU.ctx && AU.master) AU.master.gain.setTargetAtTime(on ? AU.vol : 0, AU.ctx.currentTime, 0.1);
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
  // 星の音の高さ（D3からの半音。このあと和音の音に寄せる）：空の高い所（昔の日）ほど高い。日記は気分で上下、夜モードは低く
  function starNote(s) {
    const up = Math.round(s.ring.f * 10);
    if (s.k === 'diary') return 14 + up + (s.mood ? [-4, -2, 0, 2, 4][clamp(s.mood, 1, 5) - 1] : 0);
    if (s.k === 'task') return 12 + up + (s.small ? 7 : 3);
    if (s.k === 'gold') return 26 + Math.round(s.ring.f * 7);
    return -2 + Math.round(s.ring.f * 4); // night
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
    if (E.play) advance(dt);
    draw();
    E.raf = requestAnimationFrame(tick);
  }
  function advance(dt) {
    const prev = E.playT; E.playT = (E.playT + dt * E.speed * (24 / 36)) % 24; // 1倍で 36秒＝1日
    crossings(prev, E.playT);
    // 睡眠タイマー：最後の90秒で静かに消えて止まる
    if (TR.endAt && AU.ctx) {
      const left = TR.endAt - Date.now();
      if (left <= 0) { setPlay(false); setMsg('おやすみ。音を止めた。'); }
      else if (left < 90000 && !TR.fading) { TR.fading = true; AU.master.gain.setTargetAtTime(0.0001, AU.ctx.currentTime, 25); }
      updateTimerText();
    }
  }
  function crossings(a, b) {
    const between = h => (a <= b ? h > a && h <= b : h > a || h <= b);
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
      const t = starSound(s.k, starNote(s), v, pan, darkDay(s.ring), s.ring.isToday ? 2 : 1, s.mood);
      if (t != null) E.flashes.push({ s, t0: performance.now() + Math.max(0, (t - AU.ctx.currentTime) * 1000) });
    }
  }
  // 画面を離れても（作業・睡眠のとき）時間を進めて鳴らし続ける
  let bgTimer = 0, bgLast = 0;
  function bgRun(on) {
    clearInterval(bgTimer); bgTimer = 0;
    if (on) { bgLast = performance.now(); bgTimer = setInterval(() => { const n = performance.now(); const dt = Math.min(0.5, (n - bgLast) / 1000); bgLast = n; if (E.play) advance(dt); E.flashes.length = 0; }, 100); }
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
      ensureAudio(); const t = starSound(r.star.k, starNote(r.star), 0.9, (x / E.w - 0.5) * 1.6, darkDay(r.star.ring), 2, r.star.mood);
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
  function togglePlay() { setPlay(!E.play); }
  function setPlay(on) {
    E.play = on;
    if (on) {
      ensureAudio(); if (AU.master) { TR.fading = false; AU.master.gain.cancelScheduledValues(AU.ctx.currentTime); AU.master.gain.setTargetAtTime(AU.on ? AU.vol : 0, AU.ctx.currentTime, 0.1); }
      if (AU.on) bedStart();
      TR.endAt = AU.smode === 'sleep' ? Date.now() + AU.timerMin * 60000 : 0;
      wake(AU.smode === 'sleep'); startLoop();
    } else { bedStop(); TR.endAt = 0; wake(false); dim(false); }
    syncControls();
  }
  // 音のモードを変える（鳴っていたら、下の層を作り直す）
  function setSmode(v) {
    if (!SMODES[v]) return; AU.smode = v; store.set('smode', v);
    if (v === 'sleep' && E.speed > 1) E.speed = 0.5;
    if (E.play) { bedStop(0.3); setTimeout(() => { if (E.play && AU.on) bedStart(); }, 400); TR.endAt = v === 'sleep' ? Date.now() + AU.timerMin * 60000 : 0; wake(v === 'sleep'); }
    syncControls();
  }
  // 睡眠のとき：画面が消えないようにする（音が止まらないように）。暗い幕で画面の明るさを抑える
  let lock = null;
  async function wake(on) {
    try { if (on && !lock && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } else if (!on && lock) { await lock.release(); lock = null; } } catch (_) {}
  }
  function dim(on) {
    let d = document.querySelector('.orr-dim');
    if (!on) { if (d) d.remove(); return; }
    if (!d) { d = document.createElement('div'); d.className = 'orr-dim'; d.setAttribute('role', 'button'); d.setAttribute('aria-label', '暗い幕を閉じる'); d.innerHTML = '<div class="orr-dim-t"></div><div class="orr-dim-s"></div><div class="orr-dim-h">タップで戻る</div>'; d.addEventListener('click', () => dim(false)); document.body.appendChild(d); }
    updateTimerText();
  }
  function updateTimerText() {
    const left = TR.endAt ? Math.max(0, Math.ceil((TR.endAt - Date.now()) / 60000)) : null;
    const txt = left != null ? `残り ${left}分` : '';
    const a = E.el && E.el.querySelector('.orr-left'); if (a && a.textContent !== txt) a.textContent = txt;
    const d = document.querySelector('.orr-dim'); if (d) { const n = new Date(); d.querySelector('.orr-dim-t').textContent = `${pad2(n.getHours())}:${pad2(n.getMinutes())}`; d.querySelector('.orr-dim-s').textContent = txt ? `睡眠の音 ・ ${txt}` : ''; }
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
      <div class="orr-sound">
        <div class="orr-seg2" role="group" aria-label="音の使い方"><button data-o="smode" data-v="listen">聴く</button><button data-o="smode" data-v="work">作業</button><button data-o="smode" data-v="sleep">睡眠</button></div>
        <div class="orr-snote"></div>
        <div class="orr-sleep" hidden><div class="orr-seg2 sm" role="group" aria-label="睡眠タイマー"><button data-o="timer" data-v="30">30分</button><button data-o="timer" data-v="60">60分</button><button data-o="timer" data-v="90">90分</button></div><span class="orr-left"></span><button class="orr-btn wide" data-o="dim">画面を暗くする</button></div>
      </div>
      <div class="orr-detail" aria-live="polite" hidden></div>`;
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-o]'); if (!b) return; const o = b.dataset.o, v = b.dataset.v;
      E.lastInteract = Date.now(); hideHint(); startLoop();
      if (o === 'mode') { E.mode = v; store.set('mode', v); if (v === 'inside') { E.lookYaw = azim(E.playT); E.lookPitch = 0.35; } else if (E.gyroOn) toggleGyro(); syncControls(); draw(); }
      else if (o === 'range') { E.range = Number(v); store.set('range', E.range); if (E.api.need) E.api.need(E.range); buildData(); E.sel = null; renderDetail(); syncControls(); draw(); }
      else if (o === 'play') togglePlay();
      else if (o === 'speed') { E.speed = AU.smode === 'sleep' ? (E.speed === 0.5 ? 1 : 0.5) : E.speed === 1 ? 2 : E.speed === 2 ? 4 : E.speed === 4 ? 0.5 : 1; syncControls(); }
      else if (o === 'now') { E.playT = hourOf(Date.now()); if (E.mode === 'inside') E.lookYaw = azim(E.playT); draw(); }
      else if (o === 'sound') { setSound(!AU.on); if (AU.on) { ensureAudio(); if (E.play) bedStart(); } else bedStop(); syncControls(); }
      else if (o === 'smode') setSmode(v);
      else if (o === 'timer') { AU.timerMin = Number(v); store.set('timer', AU.timerMin); if (E.play && AU.smode === 'sleep') { TR.endAt = Date.now() + AU.timerMin * 60000; TR.fading = false; AU.master && AU.master.gain.setTargetAtTime(AU.on ? AU.vol : 0, AU.ctx.currentTime, 0.2); } syncControls(); updateTimerText(); }
      else if (o === 'dim') { if (!E.play) setPlay(true); dim(true); }
      else if (o === 'gyro') toggleGyro();
      else if (o === 'close') { E.sel = null; E.selRing = null; renderDetail(); draw(); }
    });
    E.el = el; E.cv = el.querySelector('canvas'); E.ctx = E.cv.getContext('2d');
    bindCanvas(E.cv);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // 聴くモードは止める。作業・睡眠は鳴らし続ける（iPhoneは画面を消すと止まることがある）
        if (E.play && AU.smode === 'listen') setPlay(false);
        if (!E.play && AU.ctx && AU.ctx.state === 'running') AU.ctx.suspend().catch(() => {});
        if (E.play) bgRun(true);
      } else { bgRun(false); if (E.play) { ensureAudio(); if (AU.smode === 'sleep') wake(true); } if (E.el && E.el.isConnected) startLoop(); else if (E.play) bgRun(true); }
    });
    window.addEventListener('resize', () => { if (E.el && E.el.isConnected) { resize(); draw(); } });
  }
  const SNOTE = {
    listen: 'キラキラのベル、ピロピロ駆け上がる音、やわらかい808とハイハット。',
    work: '🎧 イヤホン推奨：左右でわずかに高さの違う音（16Hzのうなり）とピンクノイズ。ビートはひかえめ。ほかの画面に移っても鳴り続ける。',
    sleep: '🎧 イヤホン推奨：6Hzから2Hzへゆっくり下がるうなりとブラウンノイズ。ビートなし・ゆっくり。タイマーで静かに消える。',
  };
  function syncControls() {
    const el = E.el; if (!el) return;
    el.querySelectorAll('[data-o="mode"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === E.mode)));
    el.querySelectorAll('[data-o="range"]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === E.range)));
    const pb = el.querySelector('[data-o="play"]'); pb.innerHTML = E.play ? IC.pause : IC.play; pb.setAttribute('aria-label', E.play ? '止める' : '再生'); pb.setAttribute('aria-pressed', String(E.play));
    el.querySelector('[data-o="speed"]').textContent = (E.speed === 0.5 ? '½' : E.speed) + '×';
    const sb = el.querySelector('[data-o="sound"]'); sb.innerHTML = AU.on ? IC.sound : IC.mute; sb.setAttribute('aria-label', AU.on ? '音を消す' : '音を出す'); sb.setAttribute('aria-pressed', String(AU.on));
    const gb = el.querySelector('[data-o="gyro"]'); gb.hidden = E.mode !== 'inside' || !('DeviceOrientationEvent' in window); gb.setAttribute('aria-pressed', String(E.gyroOn));
    el.classList.toggle('inside', E.mode === 'inside');
    el.querySelectorAll('[data-o="smode"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === AU.smode)));
    el.querySelectorAll('[data-o="timer"]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === AU.timerMin)));
    el.querySelector('.orr-sleep').hidden = AU.smode !== 'sleep';
    el.querySelector('.orr-snote').textContent = SNOTE[AU.smode];
    el.classList.toggle('sleepy', AU.smode === 'sleep');
    updateTimerText();
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
      bgRun(false); E.lastInteract = Date.now(); resize(); syncControls(); renderDetail(); draw(); startLoop();
    },
    refresh(api) {
      if (!E.el || !E.el.isConnected) return; E.api = api;
      const sig = signature(api); if (sig !== E.sig) { E.sig = sig; buildData(); renderDetail(); draw(); }
    },
    detach() {
      stopLoop();
      if (E.gyroOn) { E.gyroOn = false; window.removeEventListener('deviceorientation', onOrient); }
      // 作業・睡眠で鳴っているときは、ほかの画面でも鳴らし続ける。聴くモードは止める
      if (E.play && AU.smode !== 'listen') { bgRun(true); return; }
      if (E.play) setPlay(false);
      if (AU.ctx && AU.ctx.state === 'running') AU.ctx.suspend().catch(() => {});
    },
    // 音の大きさを測る（確認用）：最大値と平均の強さ
    _meter() { if (!AU.ctx) return null; if (!AU.an) { AU.an = AU.ctx.createAnalyser(); AU.an.fftSize = 2048; AU.master.connect(AU.an); AU.peak = 0; AU.sum = 0; AU.n = 0; const buf = new Float32Array(2048); setInterval(() => { AU.an.getFloatTimeDomainData(buf); let pk = 0, ss = 0; for (const v of buf) { pk = Math.max(pk, Math.abs(v)); ss += v * v; } AU.peak = Math.max(AU.peak, pk); AU.sum += Math.sqrt(ss / buf.length); AU.n++; }, 40); } return { peak: AU.peak, rms: AU.n ? AU.sum / AU.n : 0 }; },
    // 出ている音を録音する（確認用）
    _stream() { if (!AU.ctx) return null; if (!AU.rec) { AU.rec = AU.ctx.createMediaStreamDestination(); AU.master.connect(AU.rec); } return AU.rec.stream; },
    _debug: () => ({ rings: E.rings.length, stars: E.stars.length, mode: E.mode, play: E.play, playT: E.playT, audio: AU.ctx ? AU.ctx.state : 'none', voices: AU.voices, smode: AU.smode, bed: TR.on, bars: TR.bar, endAt: TR.endAt }),
  };
})();
