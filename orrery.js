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
     pluggnb（プラッグ＋R&B）寄りの、キラキラ・ピロピロしたアンビエント＋星のさざめき
     まとまりのための決まり
     1. 調は D メジャーだけ。和音は Gmaj7 → F#m7 → Em9 → Dmaj9 を1小節ずつ回す
     2. 星の音は、そのとき鳴っている和音の音にだけ寄せる（はみ出さない）。高すぎる音は使わない（D6 まで）
     3. 鳴るタイミングは16分音符の拍にそろえる。1拍に4音、全体で同時24音まで
     4. 耳が痛くならないように：全体で 4.5kHz より上をなだらかに下げ、8kHz より上は切る。
        音の立ち上がりは最低でも数ミリ秒かけて「カチッ」を出さない。矩形波は使わない。ハイハットは小さく、角を丸める
     5. 星のさざめき：和音の高い音が、小さく・ふわっと・ばらばらに光る（画面の背景の星も一緒にまたたく）。
        ときどき、さらさらと流れる音（ノイズのうねり）が通る
     6. 大きな残響（4.5秒）と左右のディレイで、ひとつの空間にまとめる。最後にコンプレッサー
     ボタン（すべて枠の中）
     ・ビート：あり／なし。🎲 でパターンを入れかえる（808・クラップ・ハイハット。毎回少しずつ違う組み合わせ）
     ・808：まるい／すべる／あたたかい／はずむ の4種類から選ぶ
     ・コード：音色を ガラス／エレピ／ハープ／雲／なし から選ぶ。⟳ で進行を入れかえる（やさしい／王道／ゆらぎ／夜／ひかり。全部 D メジャーの音だけ）
     ・作業：集中向け。16Hz のうなり（左右の耳でわずかに違う高さ＝バイノーラル。イヤホンで効く）。
            急に目立つ音を減らし、同じ質感がずっと続くようにする
     ・睡眠：ピンクノイズ。ビートを止め、ゆっくり・暗く・やわらかく。うなりは 4Hz から 2Hz へゆっくり下がる。タイマーで静かに消える */
  const D3 = 146.83;
  // コード進行（D からの半音。全部 D メジャーの中の音だけ）。▸ で入れかえる
  const PROGS = [
    { id: 'soft', name: 'やさしい', chords: [
      { name: 'Gmaj9', root: 5, tones: [5, 9, 12, 16, 19] }, { name: 'F#m7', root: 4, tones: [4, 7, 11, 14, 16] },
      { name: 'Em9', root: 2, tones: [2, 5, 9, 12, 16] }, { name: 'Dmaj9', root: 0, tones: [0, 4, 7, 11, 14] }] },
    { id: 'royal', name: '王道', chords: [
      { name: 'Gmaj9', root: 5, tones: [5, 9, 12, 16, 19] }, { name: 'A6/9', root: 7, tones: [7, 11, 14, 16, 21] },
      { name: 'F#m7', root: 4, tones: [4, 7, 11, 14, 16] }, { name: 'Bm9', root: 9, tones: [9, 12, 16, 19, 23] }] },
    { id: 'drift', name: 'ゆらぎ', chords: [
      { name: 'Dmaj9', root: 0, tones: [0, 4, 7, 11, 14] }, { name: 'Bm9', root: 9, tones: [9, 12, 16, 19, 23] },
      { name: 'Gmaj9', root: 5, tones: [5, 9, 12, 16, 19] }, { name: 'A9sus4', root: 7, tones: [7, 12, 14, 17, 21] }] },
    { id: 'night', name: '夜', chords: [
      { name: 'Em9', root: 2, tones: [2, 5, 9, 12, 16] }, { name: 'A9', root: 7, tones: [7, 11, 14, 17, 21] },
      { name: 'Dmaj9', root: 0, tones: [0, 4, 7, 11, 14] }, { name: 'Bm7', root: 9, tones: [9, 12, 16, 19, 21] }] },
    { id: 'light', name: 'ひかり', chords: [
      { name: 'Bm9', root: 9, tones: [9, 12, 16, 19, 23] }, { name: 'Gmaj7', root: 5, tones: [5, 9, 12, 16, 19] },
      { name: 'Dmaj9', root: 0, tones: [0, 4, 7, 11, 14] }, { name: 'Aadd9', root: 7, tones: [7, 11, 14, 19, 21] }] },
  ];
  // コードの音色（のこぎり波はやめた。どれも角のない音）
  const PADS = [
    { id: 'glass', name: 'ガラス' },   // 正弦波を少しずらして重ねた、すきとおった和音
    { id: 'keys', name: 'エレピ' },    // やわらかいエレピを、小節の頭と裏で軽く弾く
    { id: 'harp', name: 'ハープ' },    // 和音を1音ずつ、ゆっくり上り下り
    { id: 'cloud', name: '雲' },       // 息のようなノイズを和音の高さで鳴らす。いちばん空気っぽい
    { id: 'off', name: 'なし' },
  ];
  const K808 = [
    { id: 'round', name: 'まるい' },
    { id: 'glide', name: 'すべる' },
    { id: 'warm', name: 'あたたかい' },
    { id: 'bounce', name: 'はずむ' },
  ];
  const hzOf = semi => D3 * Math.pow(2, semi / 12);
  const AU = {
    ctx: null, on: store.get('sound', true), vol: 0.8, voices: 0, slots: new Map(),
    smode: ['listen', 'work', 'sleep'].includes(store.get('smode', 'listen')) ? store.get('smode', 'listen') : 'listen',
    beat: store.get('beat', true), k808: clamp(store.get('k808', 0), 0, K808.length - 1),
    pad: clamp(store.get('pad', 0), 0, PADS.length - 1), prog: clamp(store.get('prog', 0), 0, PROGS.length - 1), pat: store.get('pat', 1), timerMin: store.get('timer', 60),
  };
  // 今の設定から、各層の大きさを決める
  function M() {
    const sleep = AU.smode === 'sleep', work = AU.smode === 'work', beat = AU.beat && !sleep;
    return {
      bpm: sleep ? 56 : 75,
      kick: beat ? (work ? 0.2 : 0.3) : 0, hat: beat ? (work ? 0.012 : 0.018) : 0, clap: beat ? (work ? 0.03 : 0.05) : 0,
      pad: sleep ? 0.05 : 0.042, padCut: sleep ? 560 : work ? 1000 : 1350,
      noise: sleep ? 'pink' : null, noiseG: sleep ? 0.05 : 0,
      shimmer: sleep ? 0.45 : work ? 0.7 : 1, swish: sleep ? 0.4 : work ? 0.5 : 1,
      arp: sleep ? 0 : work ? 0.5 : 1, star: sleep ? 0.55 : work ? 0.72 : 1, cut: sleep ? 1500 : work ? 3200 : 4200,
      beatHz: work ? { hz: 16, gain: 0.032 } : sleep ? { from: 4, to: 2, minutes: 15, gain: 0.03 } : null,
    };
  }
  function audioInit() {
    if (AU.ctx) return AU.ctx;
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch (_) {} // iPhoneのマナーモードに従う
    const ctx = AU.ctx = new C();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.4;
    // 耳が痛くならないように：4.5kHz から上をなだらかに下げ、8kHz より上は切る
    const shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 4500; shelf.gain.value = -7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 8000; lp.Q.value = 0.5;
    const master = ctx.createGain(); master.gain.value = AU.on ? AU.vol : 0;
    comp.connect(shelf); shelf.connect(lp); lp.connect(master); master.connect(ctx.destination);
    // 残響：4.5秒で消えていく広がり（高い音から先に消える）
    const sr = ctx.sampleRate, len = Math.floor(sr * 4.5); const ir = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) { const a = ir.getChannelData(ch); let l = 0; for (let i = 0; i < len; i++) { const t = i / len; l += ((Math.random() * 2 - 1) - l) * (0.6 - t * 0.5); a[i] = l * Math.pow(1 - t, 2.6) * (i < sr * 0.02 ? i / (sr * 0.02) : 1); } }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    const revRet = ctx.createGain(); revRet.gain.value = 0.6; conv.connect(revRet); revRet.connect(comp);
    // 左右にはねるディレイ（付点8分）
    const beat = 60 / 75; const dl = ctx.createDelay(2), dr = ctx.createDelay(2); dl.delayTime.value = beat * 0.75; dr.delayTime.value = beat * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.36; const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2600;
    const merger = ctx.createChannelMerger(2); const dlyIn = ctx.createGain();
    dlyIn.connect(dl); dl.connect(dlp); dlp.connect(dr); dr.connect(fb); fb.connect(dl);
    dl.connect(merger, 0, 0); dr.connect(merger, 0, 1); const dlyRet = ctx.createGain(); dlyRet.gain.value = 0.3; merger.connect(dlyRet); dlyRet.connect(comp); dlyRet.connect(conv);
    const dry = ctx.createGain(); dry.gain.value = 0.85; dry.connect(comp);
    // 808 は専用の道：低いところだけを残し、残響にはほとんど送らない
    const bass = ctx.createGain(); bass.gain.value = 1; const blp = ctx.createBiquadFilter(); blp.type = 'lowpass'; blp.frequency.value = 900; bass.connect(blp); blp.connect(comp);
    Object.assign(AU, { master, comp, rev: conv, dly: dlyIn, dry, bass });
    return ctx;
  }
  const stepLen = () => 60 / M().bpm / 4; // 16分音符
  const barLen = () => 60 / M().bpm * 4;
  const curProg = () => PROGS[AU.prog].chords;
  const chordAt = t => curProg()[((Math.floor(((t || 0) - (AU.t0 || 0)) / barLen()) % 4) + 4) % 4];
  function snap(semi, chord) {
    semi = Math.min(semi, 36); // D6 より上は使わない
    let best = semi, bd = 99;
    for (let o = -24; o <= 36; o += 12) for (const c of chord.tones) { const v = c + o; if (v > 36) continue; const d = Math.abs(v - semi); if (d < bd) { bd = d; best = v; } }
    return best;
  }
  function voice(t, { pan = 0, dark = false, dur = 2, rev = 0.5, dly = 0, cut = 4200 }) {
    const ctx = AU.ctx; const g = ctx.createGain(); g.gain.value = 0;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.min(dark ? 1500 : cut, M().cut); f.Q.value = 0.3;
    g.connect(f); let node = f;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -0.9, 0.9); node.connect(p); node = p; }
    node.connect(AU.dry);
    if (rev) { const s = ctx.createGain(); s.gain.value = rev; node.connect(s); s.connect(AU.rev); }
    if (dly) { const s = ctx.createGain(); s.gain.value = dly; node.connect(s); s.connect(AU.dly); }
    AU.voices++; setTimeout(() => { AU.voices = Math.max(0, AU.voices - 1); try { g.disconnect(); } catch (_) {} }, (t - ctx.currentTime + dur + 0.5) * 1000);
    return g;
  }
  const env = (gp, t, peak, atk, dec) => { gp.setValueAtTime(0.0001, t); gp.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + Math.max(atk, 0.004)); gp.exponentialRampToValueAtTime(0.0001, t + Math.max(atk, 0.004) + dec); };
  const osc = (type, hz, t, stop, dest, gain = 1, detune = 0) => { const o = AU.ctx.createOscillator(); o.type = type; o.frequency.value = hz; o.detune.value = detune; const g = AU.ctx.createGain(); g.gain.value = gain; o.connect(g); g.connect(dest); o.start(t); o.stop(stop); return o; };
  const INST = {
    // キラキラのベル（FMは控えめ。金属っぽさは少しだけ）。左右にはねる
    bell(t, hz, v, o) {
      const dur = 2.6; const g = voice(t, { ...o, dur, rev: 0.55, dly: 0.32 });
      const c = AU.ctx.createOscillator(); c.frequency.value = hz;
      const m = AU.ctx.createOscillator(); m.frequency.value = hz * 3.01; const mi = AU.ctx.createGain(); mi.gain.setValueAtTime(hz * 0.55, t); mi.gain.exponentialRampToValueAtTime(hz * 0.01, t + 0.6);
      m.connect(mi); mi.connect(c.frequency); c.connect(g); c.start(t); m.start(t); c.stop(t + dur + 0.1); m.stop(t + dur + 0.1);
      osc('sine', hz * 2, t, t + dur, g, 0.14);
      env(g.gain, t, 0.14 * v, 0.006, dur);
    },
    // ピロピロ：やわらかい三角波の短い音（少しだけビブラート）
    piro(t, hz, v, o) {
      const dur = 0.34; const g = voice(t, { ...o, dur, rev: 0.45, dly: 0.42, cut: 3000 });
      const a = osc('triangle', hz, t, t + dur + 0.05, g, 0.8); const b = osc('sine', hz * 2, t, t + dur + 0.05, g, 0.18);
      const lfo = AU.ctx.createOscillator(); lfo.frequency.value = 8; const lg = AU.ctx.createGain(); lg.gain.value = 8; lfo.connect(lg); lg.connect(a.detune); lg.connect(b.detune); lfo.start(t); lfo.stop(t + dur + 0.05);
      env(g.gain, t, 0.09 * v, 0.006, dur);
    },
    pluck(t, hz, v, o) {
      const dur = 0.9; const g = voice(t, { ...o, dur, rev: 0.45, dly: 0.18, cut: 3600 });
      osc('triangle', hz, t, t + dur, g, 1); osc('sine', hz * 2, t, t + 0.25, g, 0.2);
      env(g.gain, t, 0.15 * v, 0.005, dur);
    },
    glass(t, hz, v, o) {
      const dur = 3.4; const g = voice(t, { ...o, dur, rev: 0.75, dly: 0.28, cut: 4200 });
      osc('sine', hz, t, t + dur, g, 1); osc('sine', hz * 2.001, t, t + dur, g, 0.2);
      env(g.gain, t, 0.08 * v, 0.02, dur);
    },
    swell(t, hz, v, o) {
      const dur = 4.5; const g = voice(t, { ...o, dark: true, dur, rev: 0.8, cut: 1200 });
      osc('triangle', hz, t, t + dur + 0.6, g, 0.5, -6); osc('triangle', hz, t, t + dur + 0.6, g, 0.5, 6); osc('sine', hz / 2, t, t + dur + 0.6, g, 0.6);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.055 * v, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    },
    // 星のさざめきの1粒：ふわっと立ち上がって、すっと消える正弦波
    grain(t, hz, v, pan) {
      const dur = 0.5 + Math.random() * 0.9; const g = voice(t, { pan, dur, rev: 0.95, dly: 0.25, cut: 5000 });
      osc('sine', hz, t, t + dur + 0.1, g, 1, (Math.random() - 0.5) * 12); osc('sine', hz * 2, t, t + dur * 0.5, g, 0.08);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03 * v, t + 0.02 + Math.random() * 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    },
    // さらさら：ノイズを細い帯で通し、帯をゆっくり動かす（流れ星が通るような音）
    swish(t, v, pan) {
      const ctx = AU.ctx, dur = 2.6; const src = ctx.createBufferSource(); src.buffer = noiseBuf('pink');
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6; bp.frequency.setValueAtTime(1800, t); bp.frequency.exponentialRampToValueAtTime(5200, t + dur * 0.6); bp.frequency.exponentialRampToValueAtTime(2600, t + dur);
      const g = voice(t, { pan, dur, rev: 0.9, dly: 0, cut: 6000 }); src.connect(bp); bp.connect(g);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 * v, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.start(t, Math.random() * 1.2); src.stop(t + dur + 0.1);
    },
    // 808：4種類。スマホのスピーカーでも聞こえるよう、まるい・すべる も少しだけ倍音を足す
    kick(t, hz, v, slideFrom) {
      const ctx = AU.ctx, kind = K808[AU.k808].id;
      const dur = kind === 'bounce' ? 0.42 : kind === 'warm' ? 1.0 : kind === 'glide' ? 1.3 : 1.15;
      const g = ctx.createGain(); g.gain.value = 0;
      const o = ctx.createOscillator(); o.type = 'sine';
      if (kind === 'glide' && slideFrom) { o.frequency.setValueAtTime(slideFrom, t); o.frequency.exponentialRampToValueAtTime(hz, t + 0.14); }
      else if (kind === 'bounce') { o.frequency.setValueAtTime(hz * 1.5, t); o.frequency.exponentialRampToValueAtTime(hz, t + 0.05); }
      else { o.frequency.setValueAtTime(hz * 1.06, t); o.frequency.exponentialRampToValueAtTime(hz, t + 0.05); }
      let node = o;
      if (kind === 'warm') { const sh = ctx.createWaveShaper(); const cv = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = i / 256 - 1; cv[i] = Math.tanh(x * 2.4) / Math.tanh(2.4); } sh.curve = cv; sh.oversample = '2x'; o.connect(sh); node = sh; }
      node.connect(g);
      // 2倍・3倍の音を少し（小さいスピーカーで低音の輪郭が分かるように）
      const h2 = osc('sine', hz * 2, t, t + dur, g, kind === 'warm' ? 0 : 0.16); const h3 = osc('sine', hz * 3, t, t + dur * 0.6, g, kind === 'bounce' ? 0.12 : 0.05);
      if (kind === 'glide' && slideFrom) { h2.frequency.setValueAtTime(slideFrom * 2, t); h2.frequency.exponentialRampToValueAtTime(hz * 2, t + 0.14); }
      g.connect(AU.bass);
      const atk = kind === 'bounce' ? 0.004 : 0.008; const peak = v * (kind === 'warm' ? 0.75 : 1);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + atk);
      if (kind === 'glide') { g.gain.setValueAtTime(peak, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
      else g.gain.exponentialRampToValueAtTime(0.0001, t + atk + dur);
      o.start(t); o.stop(t + dur + 0.1);
      AU.voices++; setTimeout(() => { AU.voices = Math.max(0, AU.voices - 1); }, (t - ctx.currentTime + dur + 0.3) * 1000);
    },
    // クラップ：やわらかいノイズを少しずらして重ねる（pluggnbの軽いスネア）
    clap(t, v) {
      const ctx = AU.ctx; const g = voice(t, { pan: 0.05, dur: 0.5, rev: 0.5, dly: 0, cut: 4500 });
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.9; bp.connect(g);
      [0, 0.012, 0.025].forEach((d, i) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf('white'); const eg = ctx.createGain(); env(eg.gain, t + d, i === 2 ? 1 : 0.6, 0.002, i === 2 ? 0.22 : 0.03); s.connect(eg); eg.connect(bp); s.start(t + d, Math.random()); s.stop(t + d + 0.3); });
      g.gain.setValueAtTime(v, t);
    },
    // ハイハット：小さく、角を丸めた短いノイズ
    hat(t, v, pan = 0, open = false) {
      const ctx = AU.ctx; const src = ctx.createBufferSource(); src.buffer = noiseBuf('white');
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6500;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 10000;
      const g = ctx.createGain(); env(g.gain, t, v, 0.003, open ? 0.22 : 0.035);
      let node = g; if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
      src.connect(hp); hp.connect(lp); lp.connect(g); node.connect(AU.dry); src.start(t, Math.random() * 1.5); src.stop(t + (open ? 0.3 : 0.08));
    },
  };
  const NB = {};
  function noiseBuf(kind) {
    if (NB[kind]) return NB[kind];
    const ctx = AU.ctx, len = ctx.sampleRate * 4; const b = ctx.createBuffer(1, len, ctx.sampleRate); const a = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'pink') { b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; a[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
      else a[i] = w;
    }
    for (let i = 0; i < 2000; i++) { const k = i / 2000; a[i] *= k; a[len - 1 - i] *= k; }
    return (NB[kind] = b);
  }

  /* ── ビートのパターン（🎲で入れかえる）：決まった型を土台に、毎回少しずつ変える ── */
  function makePattern(seed) {
    let s = (seed * 9301 + 49297) % 233280 || 7; const R = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const KICKS = [[0, 10], [0, 7, 10], [0, 3, 10], [0, 11], [0, 6, 10, 14], [0, 10, 13]];
    const kickA = KICKS[Math.floor(R() * KICKS.length)]; const kickB = R() < 0.5 ? kickA : KICKS[Math.floor(R() * KICKS.length)];
    const hatDiv = R() < 0.6 ? 2 : 1; // 8分か16分
    const rolls = []; for (let i = 0; i < 2; i++) if (R() < 0.75) rolls.push({ bar: Math.floor(R() * 4), step: [6, 12, 14, 4][Math.floor(R() * 4)], n: R() < 0.5 ? 3 : 4 });
    const clapGhost = R() < 0.4; const openHat = R() < 0.5 ? 14 : null; const slide = R() < 0.7;
    return { kickA, kickB, hatDiv, rolls, clapGhost, openHat, slide, id: seed };
  }
  let PAT = makePattern(AU.pat);

  /* ── 下で鳴り続ける層：パッド・ノイズ・うなり。小節ごとに、ビートとさざめきを先回りして予約する ── */
  const TR = { on: false, timer: 0, nextBar: 0, bar: 0, layers: null, endAt: 0 };
  function bedStart() {
    const ctx = AU.ctx; if (!ctx || TR.on) return; const m = M();
    TR.on = true; AU.t0 = ctx.currentTime + 0.12; TR.nextBar = AU.t0; TR.bar = 0;
    const L = TR.layers = { nodes: [] };
    if (m.noise) {
      const ns = ctx.createBufferSource(); ns.buffer = noiseBuf(m.noise); ns.loop = true;
      const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 1800; // 高いシャーという成分を抑えた、やわらかいピンクノイズ
      const ng = ctx.createGain(); ng.gain.value = 0; ng.gain.setTargetAtTime(m.noiseG, ctx.currentTime, 2.5);
      ns.connect(nf); nf.connect(ng); ng.connect(AU.comp); ns.start(); L.nodes.push(ns); L.noiseG = ng;
    }
    // うなり（バイノーラル）：左は D3、右は D3＋うなりの数。左右を分けて直接出す
    if (m.beatHz) {
      const merger = ctx.createChannelMerger(2); const bg = ctx.createGain(); bg.gain.value = 0; bg.gain.setTargetAtTime(m.beatHz.gain, ctx.currentTime, 3);
      const l = ctx.createOscillator(); l.frequency.value = D3; const r = ctx.createOscillator();
      r.frequency.value = D3 + (m.beatHz.hz || m.beatHz.from);
      if (m.beatHz.from) { r.frequency.setValueAtTime(D3 + m.beatHz.from, ctx.currentTime); r.frequency.linearRampToValueAtTime(D3 + m.beatHz.to, ctx.currentTime + m.beatHz.minutes * 60); }
      l.connect(merger, 0, 0); r.connect(merger, 0, 1); merger.connect(bg); bg.connect(AU.master); l.start(); r.start();
      L.nodes.push(l, r); L.beatG = bg;
    }
    sched(); TR.timer = setInterval(sched, 120);
  }
  function bedStop(fade = 0.6) {
    if (!TR.on) return; TR.on = false; clearInterval(TR.timer);
    const ctx = AU.ctx, L = TR.layers; TR.layers = null; if (!L) return;
    [L.noiseG, L.beatG, ...(L.pads || []).map(p => p.g)].forEach(g => { if (!g) return; const gp = g.gain, now = ctx.currentTime; if (gp.cancelAndHoldAtTime) gp.cancelAndHoldAtTime(now); else { gp.cancelScheduledValues(now); gp.setValueAtTime(gp.value, now); } gp.setTargetAtTime(0.0001, now, fade); });
    setTimeout(() => L.nodes.forEach(n => { try { n.stop(); } catch (_) {} }), fade * 6000);
  }
  function bedRestart() { if (!E.play || !AU.on) return; bedStop(0.25); setTimeout(() => { if (E.play && AU.on) bedStart(); }, 350); }
  function sched() {
    const ctx = AU.ctx; if (!TR.on || !ctx) return; const m = M();
    while (TR.nextBar < ctx.currentTime + 0.6) {
      const t = TR.nextBar, bar = TR.bar, ch = curProg()[bar % 4], bl = barLen(), st = stepLen();
      padChord(t, ch, bl, m);
      const root = hzOf(ch.root - 24);
      if (m.kick) {
        const ks = bar % 2 ? PAT.kickB : PAT.kickA;
        ks.forEach((k, i) => { const second = i > 0 && PAT.slide; const hz = second && i === ks.length - 1 ? hzOf(ch.root - 24 + 7) : root; INST.kick(t + k * st, hz, m.kick * (i ? 0.85 : 1), second ? root : null); });
      }
      if (m.clap) { INST.clap(t + 8 * st, m.clap); if (PAT.clapGhost && bar % 2) INST.clap(t + 15 * st, m.clap * 0.35); }
      if (m.hat) {
        for (let i = 0; i < 16; i += PAT.hatDiv) { if (PAT.openHat === i && bar % 2) INST.hat(t + i * st, m.hat * 0.8, 0.3, true); else INST.hat(t + i * st, m.hat * (i % 4 === 0 ? 1 : 0.55), i % 4 ? 0.25 : -0.15); }
        for (const r of PAT.rolls) if (r.bar === bar % 4) for (let k = 1; k < r.n; k++) INST.hat(t + r.step * st + k * st * 2 / r.n, m.hat * (0.5 + k * 0.1), 0.35);
      }
      // 星のさざめき：和音の高い音が、ばらばらに小さく光る。星が多い日ほど多く
      const dens = clamp(E.stars.length / 60, 0.4, 1.4) * m.shimmer;
      for (let i = 0; i < 16; i++) {
        if (Math.random() < 0.16 * dens) {
          const semi = snap(ch.tones[Math.floor(Math.random() * ch.tones.length)] + 24 + (Math.random() < 0.3 ? 12 : 0), ch);
          const tt = t + i * st + Math.random() * st * 0.6; INST.grain(tt, hzOf(semi), 0.6 + Math.random() * 0.5, Math.random() * 1.8 - 0.9);
          twinkle(tt);
        }
      }
      // ときどき：きらきらが流れ落ちる（4〜6粒が順に下がる）
      if (Math.random() < 0.22 * m.shimmer) {
        const start = 5 + Math.floor(Math.random() * 8); const tones = [...ch.tones].sort((a, b) => b - a);
        tones.slice(0, 4 + Math.floor(Math.random() * 2)).forEach((x, k) => { const tt = t + (start + k * 0.66) * st; INST.grain(tt, hzOf(snap(x + 24, ch)), 0.75 - k * 0.1, 0.6 - k * 0.3); twinkle(tt); });
      }
      if (Math.random() < 0.18 * m.swish) INST.swish(t + Math.floor(Math.random() * 8) * st, 0.8, Math.random() * 1.2 - 0.6);
      TR.nextBar += bl; TR.bar++;
    }
  }
  /* コードの層。t＝小節の頭、from＝実際に鳴らし始める時刻（音色を途中で変えたとき、小節の途中から入る） */
  function padChord(t, ch, bl, m, from = t) {
    const kind = PADS[AU.pad].id; if (kind === 'off') return;
    const ctx = AU.ctx, start = Math.max(t, from), end = t + bl + 1.8;
    const g = ctx.createGain(); g.gain.value = 0;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.4;
    g.connect(f); f.connect(AU.dry);
    const rs = ctx.createGain(); f.connect(rs); rs.connect(AU.rev);
    const ds = ctx.createGain(); ds.gain.value = 0; f.connect(ds); ds.connect(AU.dly);
    const four = ch.tones.slice(0, 4), sleep = AU.smode === 'sleep';
    const pad = { g, t, end }; if (TR.layers) { TR.layers.pads = (TR.layers.pads || []).filter(p => p.end > ctx.currentTime); TR.layers.pads.push(pad); TR.layers.padG = g; }
    // 持続する和音の大きさ：ゆっくりふくらんで、次の小節と重なりながら消える
    const swellEnv = (peak, atk) => { g.gain.setValueAtTime(0.0001, start); g.gain.exponentialRampToValueAtTime(peak, start + atk); g.gain.setValueAtTime(peak, t + bl); g.gain.exponentialRampToValueAtTime(0.0001, end); };
    if (kind === 'glass') {
      f.frequency.value = m.padCut * 1.8; rs.gain.value = 0.8;
      four.forEach((semi, i) => { const hz = hzOf(semi - 12); osc('sine', hz, start, end, g, 0.5, -4); osc('sine', hz, start, end, g, 0.5, 4); if (i) osc('sine', hz * 2, start, end, g, 0.07, 2); });
      // ほんの少しだけ、ゆっくり明るさがゆれる
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.1; const lg = ctx.createGain(); lg.gain.value = m.padCut * 0.3; lfo.connect(lg); lg.connect(f.frequency); lfo.start(start); lfo.stop(end);
      swellEnv(m.pad * 1.35, 1.2);
    } else if (kind === 'cloud') {
      // 息のような音：ピンクノイズを和音の高さの細い帯に通す＋ごく小さな正弦波で音程を支える
      f.frequency.value = m.padCut * 2.4; rs.gain.value = 1.1;
      const src = ctx.createBufferSource(); src.buffer = noiseBuf('pink'); src.loop = true;
      four.forEach((semi, i) => {
        const hz = hzOf(semi + (i ? 0 : -12)); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = hz; bp.Q.value = 38;
        const bg = ctx.createGain(); bg.gain.value = 7; src.connect(bp); bp.connect(bg); bg.connect(g);
        osc('sine', hz, start, end, g, 0.09, (i - 1.5) * 3);
      });
      src.start(start, Math.random() * 2); src.stop(end + 0.05);
      swellEnv(m.pad * 1.6, 1.8);
    } else if (kind === 'keys') {
      // エレピ：FMでやわらかいアタック。小節の頭・裏・終わり際で弾く（睡眠は頭だけ）
      f.frequency.value = m.padCut * 2.2; rs.gain.value = 0.55; ds.gain.value = sleep ? 0 : 0.14;
      g.gain.setValueAtTime(1, t);
      const st = bl / 16; const hits = sleep ? [[0, 1]] : [[0, 1], [6, 0.55], [10, 0.7]];
      hits.forEach(([step, vel]) => {
        const ht = t + step * st; if (ht < from - 0.01) return;
        four.forEach((semi, i) => {
          const nt = ht + i * 0.014, hz = hzOf(semi - 12), dur = step === 0 ? 2.6 : 1.6;
          const ng = ctx.createGain(); ng.connect(g); env(ng.gain, nt, m.pad * 0.9 * vel, 0.006, dur);
          const c = ctx.createOscillator(); c.frequency.value = hz; const mo = ctx.createOscillator(); mo.frequency.value = hz;
          const mi = ctx.createGain(); mi.gain.setValueAtTime(hz * 1.1, nt); mi.gain.exponentialRampToValueAtTime(hz * 0.05, nt + 0.7);
          mo.connect(mi); mi.connect(c.frequency); c.connect(ng); c.start(nt); mo.start(nt); c.stop(nt + dur + 0.1); mo.stop(nt + dur + 0.1);
          osc('sine', hz * 2, nt, nt + 0.5, ng, 0.06);
        });
      });
    } else if (kind === 'harp') {
      // ハープ：和音の音を8分で上って下りる。下にごく小さな和音を敷いて、すき間を埋める
      f.frequency.value = m.padCut * 2.4; rs.gain.value = 0.75; ds.gain.value = sleep ? 0.1 : 0.2;
      const st = bl / 16; const up = [...ch.tones.map(x => x - 12), ch.tones[0], ch.tones[1]];
      const seq = sleep ? [0, 2, 4, 6] : [0, 1, 2, 3, 4, 5, 6, 4];
      const step = sleep ? 4 : 2;
      seq.forEach((k, i) => {
        const nt = t + i * step * st; if (nt < from - 0.01) return; const hz = hzOf(up[k % up.length]);
        const ng = ctx.createGain(); ng.connect(g); env(ng.gain, nt, m.pad * (i ? 0.75 : 1), 0.005, sleep ? 2.4 : 1.6);
        osc('triangle', hz, nt, nt + 2.6, ng, 0.8); osc('sine', hz * 2, nt, nt + 0.4, ng, 0.12);
      });
      const bed = ctx.createGain(); bed.connect(g); four.forEach(semi => osc('sine', hzOf(semi - 12), start, end, bed, 0.25));
      bed.gain.setValueAtTime(0.0001, start); bed.gain.exponentialRampToValueAtTime(m.pad * 0.5, start + 1.4); bed.gain.setValueAtTime(m.pad * 0.5, t + bl); bed.gain.exponentialRampToValueAtTime(0.0001, end);
      g.gain.setValueAtTime(1, t);
    }
  }
  // 音色・進行を変えたとき：今鳴っている和音をすっと消し、新しい音で小節の途中から入りなおす
  function repad() {
    const ctx = AU.ctx; if (!ctx) return;
    if (!TR.on) return previewPad();
    const now = ctx.currentTime + 0.03, m = M(), bl = barLen();
    for (const p of (TR.layers && TR.layers.pads) || []) { if (p.end <= now) continue; const gp = p.g.gain; if (gp.cancelAndHoldAtTime) gp.cancelAndHoldAtTime(now); else { gp.cancelScheduledValues(now); gp.setValueAtTime(gp.value, now); } gp.setTargetAtTime(0.0001, now, 0.15); }
    for (let s = TR.nextBar - bl; s > now - bl; s -= bl) padChord(s, chordAt(s + 0.01), bl, m, now + 0.05);
  }
  // 止まっているときは、押した音色で今の進行の1つめの和音を少しだけ鳴らす
  function previewPad() {
    const ctx = ensureAudio(); if (!ctx || !AU.on) return;
    const go = () => { const t = ctx.currentTime + 0.05; if (AU.master) { TR.fading = false; AU.master.gain.cancelScheduledValues(t); AU.master.gain.setTargetAtTime(AU.vol, t, 0.05); } padChord(t, curProg()[0], 2.2, M()); };
    if (ctx.state === 'running') go(); else ctx.resume().then(go).catch(() => {});
  }
  // 画面の背景の星を、音に合わせてまたたかせる
  function twinkle(t) { if (!E.dust.length || !AU.ctx) return; E.twinks.push({ i: Math.floor(Math.random() * E.dust.length), t0: performance.now() + Math.max(0, (t - AU.ctx.currentTime) * 1000) }); if (E.twinks.length > 60) E.twinks.splice(0, E.twinks.length - 60); }

  function starSound(kind, semiWant, v, pan, dark, prio = 1, mood = null) {
    const ctx = AU.ctx; if (!ctx || !AU.on || ctx.state !== 'running') return null;
    const m = M(); const st = stepLen();
    let t = Math.ceil((ctx.currentTime + 0.03) / st) * st;
    for (let spill = 0; spill < 3; spill++, t += st) {
      const ch = chordAt(t); const semi = snap(semiWant, ch);
      const key = t.toFixed(3); const slot = AU.slots.get(key) || [];
      if (slot.some(s => s.kind === kind && s.semi === semi)) return t;
      if (slot.length >= 4) continue;
      if (AU.voices >= 24 && prio < 2) return null;
      slot.push({ kind, semi }); AU.slots.set(key, slot);
      const tt = t + Math.random() * 0.01; const vv = v * m.star * (0.9 + Math.random() * 0.2); const o = { pan, dark };
      if (kind === 'diary') {
        INST.bell(tt, hzOf(semi), vv, o);
        if (m.arp && (mood == null || mood >= 3) && Math.random() < m.arp) {
          const up = ch.tones.map(x => x + 12 * Math.ceil((semi - x) / 12)).filter(x => x >= semi && x <= 36).sort((a, b) => a - b);
          const seq = [...new Set([...up, ...up.map(x => x + 12)])].filter(x => x <= 36).slice(1, mood >= 5 ? 6 : 4);
          seq.forEach((s2, i) => INST.piro(tt + (i + 1) * st * 2 / 3, hzOf(s2), vv * (0.9 - i * 0.12), { pan: pan + (i % 2 ? 0.3 : -0.3), dark }));
        }
      } else if (kind === 'task') {
        INST.pluck(tt, hzOf(semi), vv, o);
        if (m.arp) INST.piro(tt + st / 2, hzOf(snap(semi + 3, ch)), vv * 0.55, o);
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
    drag: null, pinch: null, gyro: null, gyroOn: false, sprites: {}, twinks: [],
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
    const avail = E.h - 56 - 142; // 上のボタンと、下の音のボタン・操作バーをよけた高さ
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
    // さざめきの音に合わせて、背景の星がまたたく
    { const nowT = performance.now(); E.twinks = E.twinks.filter(k => nowT < k.t0 + 900); ctx.globalCompositeOperation = 'lighter';
      for (const k of E.twinks) { if (nowT < k.t0) continue; const d = E.dust[k.i]; const a = Math.sin(Math.PI * (nowT - k.t0) / 900); const x = d.x * W, y = d.y * H; ctx.globalAlpha = a * 0.9; ctx.drawImage(sprite('#cfe0ff'), x - 7, y - 7, 14, 14); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
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
    if (!E.cv) return; const w = E.cv.parentElement.clientWidth; const h = Math.round(clamp(w * 1.2, 380, 640));
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
  // 作業・睡眠：どちらか片方（もう一度押すと外れる）。睡眠を入れるとビートは止まり、外すと元に戻る
  function setSmode(v) {
    const next = AU.smode === v ? 'listen' : v; AU.smode = next; store.set('smode', next);
    if (next === 'sleep' && E.speed > 1) E.speed = 0.5;
    if (E.play) { bedRestart(); TR.endAt = next === 'sleep' ? Date.now() + AU.timerMin * 60000 : 0; TR.fading = false; wake(next === 'sleep'); }
    setMsg(next === 'work' ? '作業：16Hzのうなり（イヤホンで）。目立つ音を減らした' : next === 'sleep' ? '睡眠：ピンクノイズ。ビートを止め、やわらかい音に' : '作業・睡眠を外した');
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
    beat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M5 15v4M9.5 10v9M14 6v13M18.5 12v7"/></svg>',
    dice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/></svg>',
    wave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M3 12c2.2 0 2.2-6 4.5-6s2.3 12 4.5 12 2.3-9 4.5-9 2.2 3 4.5 3"/></svg>',
    focus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/></svg>',
    chord: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="17" r="2.6"/><circle cx="12.5" cy="11.5" r="2.6"/><circle cx="17" cy="6" r="2.6"/><path d="M10.6 17h9M15.1 11.5h4.5" opacity=".45"/></svg>',
    cycle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 10a7 7 0 0 1 12.2-3.6L19 8.5"/><path d="M19 4.5v4h-4"/><path d="M19 14a7 7 0 0 1-12.2 3.6L5 15.5"/><path d="M5 19.5v-4h4"/></svg>',
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
        <div class="orr-mix" role="group" aria-label="音">
          <div class="mx-beat"><button class="mx" data-o="beat"><span class="mx-i">${IC.beat}</span><span class="mx-l">ビート</span><span class="mx-s"></span></button><button class="mx-dice" data-o="dice" aria-label="ビートのパターンを変える">${IC.dice}</button></div>
          <button class="mx" data-o="k808"><span class="mx-i">${IC.wave}</span><span class="mx-l">808</span><span class="mx-s"></span></button>
          <div class="mx-beat"><button class="mx" data-o="pad"><span class="mx-i">${IC.chord}</span><span class="mx-l">コード</span><span class="mx-s"></span></button><button class="mx-dice" data-o="prog" aria-label="コード進行を変える" title="コード進行を変える">${IC.cycle}</button></div>
          <button class="mx" data-o="work"><span class="mx-i">${IC.focus}</span><span class="mx-l">作業</span><span class="mx-s">16Hz</span></button>
          <button class="mx" data-o="sleep"><span class="mx-i">${IC.moon}</span><span class="mx-l">睡眠</span><span class="mx-s">ノイズ</span></button>
        </div>
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
      else if (o === 'work' || o === 'sleep') setSmode(o);
      else if (o === 'beat') { AU.beat = !AU.beat; store.set('beat', AU.beat); if (AU.beat && AU.smode === 'sleep') { AU.smode = 'listen'; store.set('smode', 'listen'); bedRestart(); TR.endAt = 0; wake(false); } syncControls(); }
      else if (o === 'dice') { AU.pat = (AU.pat % 997) + 1 + Math.floor(Math.random() * 50); store.set('pat', AU.pat); PAT = makePattern(AU.pat); if (!AU.beat) { AU.beat = true; store.set('beat', true); } if (AU.smode === 'sleep') { AU.smode = 'listen'; store.set('smode', 'listen'); bedRestart(); TR.endAt = 0; wake(false); } if (!E.play) setPlay(true); setMsg(`ビートのパターンを変えた（No.${AU.pat}）`); syncControls(); }
      else if (o === 'k808') { AU.k808 = (AU.k808 + 1) % K808.length; store.set('k808', AU.k808); ensureAudio(); if (AU.ctx && AU.ctx.state === 'running') INST.kick(AU.ctx.currentTime + 0.05, hzOf(-24), 0.3); syncControls(); }
      else if (o === 'pad') { AU.pad = (AU.pad + 1) % PADS.length; store.set('pad', AU.pad); repad(); setMsg(`コードの音色：${PADS[AU.pad].name}`); syncControls(); }
      else if (o === 'prog') { AU.prog = (AU.prog + 1) % PROGS.length; store.set('prog', AU.prog); if (PADS[AU.pad].id === 'off') { AU.pad = 0; store.set('pad', 0); } repad(); setMsg(`コード進行：${PROGS[AU.prog].name}（${curProg().map(c => c.name).join(' → ')}）`); syncControls(); }
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
    listen: '星のさざめき、キラキラのベル、ピロピロ駆け上がる音。',
    work: '作業：🎧 イヤホンで、左右でわずかに高さの違う音（16Hzのうなり）。急に目立つ音を減らした。ほかの画面に移っても鳴り続ける。',
    sleep: '睡眠：ピンクノイズ。ビートなし・ゆっくり・やわらかい音。🎧 4Hzから2Hzへ下がるうなり。タイマーで静かに消える。',
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
    const pr = (sel, on) => { const b = el.querySelector(sel); if (b) b.setAttribute('aria-pressed', String(!!on)); };
    const beatOn = AU.beat && AU.smode !== 'sleep';
    pr('[data-o="beat"]', beatOn); pr('[data-o="work"]', AU.smode === 'work'); pr('[data-o="sleep"]', AU.smode === 'sleep');
    el.querySelector('[data-o="beat"] .mx-s').textContent = beatOn ? `No.${AU.pat}` : 'なし';
    el.querySelector('[data-o="k808"] .mx-s').textContent = K808[AU.k808].name;
    el.querySelector('[data-o="k808"]').setAttribute('aria-label', `808の音：${K808[AU.k808].name}（押すと変わる）`);
    el.querySelector('[data-o="pad"] .mx-s').textContent = PADS[AU.pad].name;
    el.querySelector('[data-o="pad"]').setAttribute('aria-label', `コードの音色：${PADS[AU.pad].name}（押すと変わる）`);
    el.querySelectorAll('[data-o="timer"]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === AU.timerMin)));
    el.querySelector('.orr-sleep').hidden = AU.smode !== 'sleep';
    el.querySelector('.orr-snote').textContent = SNOTE[AU.smode] + (AU.smode === 'sleep' ? '' : (beatOn ? ` ビート No.${AU.pat}・808「${K808[AU.k808].name}」。` : ' ビートなし。')) + (PADS[AU.pad].id === 'off' ? ' コードなし。' : ` コード「${PROGS[AU.prog].name}」を${PADS[AU.pad].name}の音で。`);
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
    _debug: () => ({ rings: E.rings.length, stars: E.stars.length, mode: E.mode, play: E.play, playT: E.playT, audio: AU.ctx ? AU.ctx.state : 'none', voices: AU.voices, smode: AU.smode, beat: AU.beat, k808: K808[AU.k808].name, pad: PADS[AU.pad].name, prog: PROGS[AU.prog].name, pads: (TR.layers && TR.layers.pads || []).length, pat: AU.pat, bed: TR.on, bars: TR.bar, endAt: TR.endAt, twinks: E.twinks.length }),
  };
})();
