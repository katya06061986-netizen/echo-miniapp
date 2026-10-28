'use strict';

/*
 * Фоновые звуки «Эхо» — синтез, без файлов и лицензий: дождь, море, лес, поющие чаши.
 * render(kind, sampleRate, seconds) → [левый, правый] Float32Array, бесшовный цикл.
 * Один и тот же код работает в mini app (window.EchoSoundGen) и в Node (для прослушки WAV).
 */
(function (root) {
  const TAU = Math.PI * 2;

  /** Детерминированный генератор: звук одинаковый при каждом открытии */
  // Состояние генераторов и фильтров — в типизированных массивах: изменяемые числа в замыканиях
  // V8 каждый раз заново размещает в куче, и рендер на телефоне тормозил бы из-за сборки мусора.
  function rng(seed) {
    const st = new Uint32Array([seed >>> 0]);
    return () => {
      st[0] += 0x6d2b79f5;
      let t = st[0];
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pinkNoise(rand) {
    const b = new Float64Array(7);
    return () => {
      const w = rand() * 2 - 1;
      b[0] = 0.99886 * b[0] + w * 0.0555179;
      b[1] = 0.99332 * b[1] + w * 0.0750759;
      b[2] = 0.969 * b[2] + w * 0.153852;
      b[3] = 0.8665 * b[3] + w * 0.3104856;
      b[4] = 0.55 * b[4] + w * 0.5329522;
      b[5] = -0.7616 * b[5] - w * 0.016898;
      const out = b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + w * 0.5362;
      b[6] = w * 0.115926;
      return out * 0.11;
    };
  }

  function brownNoise(rand) {
    const b = new Float64Array(1);
    return () => {
      b[0] = (b[0] + 0.02 * (rand() * 2 - 1)) / 1.02;
      return b[0] * 3.5;
    };
  }

  /** Однополюсный фильтр нижних частот; частоту можно менять на ходу */
  function lowpass(sr) {
    const st = new Float64Array(3); // y, последняя частота, коэффициент
    st[1] = -1;
    return (x, fc) => {
      // экспонента — только когда частота сменилась
      if (fc !== st[1]) { st[1] = fc; st[2] = 1 - Math.exp((-TAU * fc) / sr); }
      st[0] += st[2] * (x - st[0]);
      return st[0];
    };
  }

  function highpass(sr) {
    const lp = lowpass(sr);
    return (x, fc) => x - lp(x, fc);
  }

  /** Полосовой биквад (RBJ) с постоянной частотой */
  function bandpass(sr, fc, q) {
    const w = (TAU * fc) / sr;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    const b0 = alpha / a0, b2 = -alpha / a0, a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - alpha) / a0;
    const z = new Float64Array(4); // x1, x2, y1, y2
    return (x) => {
      const y = b0 * x + b2 * z[1] - a1 * z[2] - a2 * z[3];
      z[1] = z[0]; z[0] = x; z[3] = z[2]; z[2] = y;
      return y;
    };
  }

  /** Медленное «дыхание» громкости: сумма нескольких несоизмеримых синусов, 0…1 */
  function slowWave(rand, periods) {
    const ph = periods.map(() => rand() * TAU);
    const w = periods.map((p) => TAU / p);
    return (t) => {
      let s = 0;
      for (let i = 0; i < w.length; i++) s += Math.sin(w[i] * t + ph[i]);
      return 0.5 + s / (2 * w.length);
    };
  }

  // ——— Дождь: ровный шум капель плюс отдельные капли разной высоты ———
  function rainChannel(sr, n, rand) {
    const out = new Float32Array(n);
    const pink = pinkNoise(rand);
    const lp = lowpass(sr), hp = highpass(sr);
    const swell = slowWave(rand, [17, 29]);
    const drops = [];
    const dropRate = 70 / sr;
    const plopRate = 1.2 / sr;
    let level = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if ((i & 63) === 0) level = 0.55 * (0.8 + 0.2 * swell(t));
      let s = hp(lp(pink(), 5500), 350) * level;
      if (rand() < dropRate) {
        const amp = rand() ** 2 * 0.35;
        drops.push({ left: Math.floor(sr * (0.006 + rand() * 0.02)), decay: Math.exp(-1 / (sr * 0.004)), amp, bp: bandpass(sr, 1800 + rand() * 4500, 2 + rand() * 4), noise: true });
      }
      if (rand() < plopRate) {
        const f = 500 + rand() * 600;
        drops.push({ left: Math.floor(sr * 0.08), decay: Math.exp(-1 / (sr * 0.018)), amp: 0.04 + rand() * 0.05, f, ph: 0, noise: false });
      }
      for (let d = drops.length - 1; d >= 0; d--) {
        const drop = drops[d];
        if (drop.noise) {
          s += drop.bp((rand() * 2 - 1) * drop.amp);
        } else {
          drop.ph += (TAU * drop.f) / sr;
          drop.f *= 1.00002;
          s += Math.sin(drop.ph) * drop.amp;
        }
        drop.amp *= drop.decay;
        if (--drop.left <= 0) drops.splice(d, 1);
      }
      out[i] = s;
    }
    return out;
  }

  // ——— Море: волны с периодом 7–12 с — гул нарастает, разбивается и уходит шипением ———
  /** Огибающая волн, общая для обоих каналов: гул нарастает к гребню и медленно уходит */
  function seaEnvelope(sr, n, rand) {
    const out = new Float32Array(n);
    const env = lowpass(sr);
    let start = 0, period = (7 + rand() * 5) * sr, size = 0.8;
    for (let i = 0; i < n; i++) {
      if (i - start >= period) {
        start += period;
        period = (7 + rand() * 5) * sr;
        size = 0.6 + rand() * 0.4;
      }
      const p = (i - start) / period;
      out[i] = env((p < 0.38 ? (p / 0.38) ** 2 : Math.exp(-(p - 0.38) * 5)) * size, 3);
    }
    return out;
  }

  function seaChannel(sr, n, rand, envelope, delaySec) {
    const out = new Float32Array(n);
    const brown = brownNoise(rand), pink = pinkNoise(rand), bed = brownNoise(rand);
    const lpR = lowpass(sr), lpW = lowpass(sr), hpW = highpass(sr), lpB = lowpass(sr);
    const shift = Math.floor(delaySec * sr);
    let e = 0, washGain = 0;
    for (let i = 0; i < n; i++) {
      // волна меняется за секунды — частоты фильтров пересчитываем раз в 64 отсчёта
      if ((i & 63) === 0) { e = envelope[Math.max(0, i - shift)]; washGain = 1.3 * e ** 1.6; }
      const rumble = lpR(brown(), 180 + 700 * e) * (0.25 + 0.9 * e);
      const wash = hpW(lpW(pink(), 900 + 4200 * e), 450) * washGain;
      const distant = lpB(bed(), 260) * 0.35;
      out[i] = rumble + wash + distant;
    }
    return out;
  }

  // ——— Лес: ветер в листве и редкие далёкие птицы ———
  /** Эхо леса: две поздние тихие копии */
  const ECHO = [[0, 1], [0.13, 0.28], [0.29, 0.12]];

  const BIRDS = [
    // короткие чириканья вниз
    (rand) => {
      const notes = [];
      const count = 3 + Math.floor(rand() * 4), f0 = 3200 + rand() * 1200;
      for (let k = 0; k < count; k++) notes.push({ at: k * (0.08 + rand() * 0.04), dur: 0.05 + rand() * 0.03, f1: f0, f2: f0 * 0.72, vib: 0 });
      return notes;
    },
    // свист в две ноты
    (rand) => {
      const f = 1900 + rand() * 700;
      return [
        { at: 0, dur: 0.28, f1: f, f2: f * 1.02, vib: 6 },
        { at: 0.36, dur: 0.34, f1: f * 0.82, f2: f * 0.8, vib: 6 },
      ];
    },
    // трель
    (rand) => [{ at: 0, dur: 0.5 + rand() * 0.4, f1: 3800 + rand() * 900, f2: 3500 + rand() * 900, vib: 26, depth: 0.08 }],
  ];

  function forestChannels(sr, n, rand) {
    const L = new Float32Array(n), R = new Float32Array(n);
    for (const [ch, seedShift] of [[L, 0.1], [R, 0.7]]) {
      const r = rng(Math.floor(rand() * 1e9 + seedShift));
      const brown = brownNoise(r), pink = pinkNoise(r);
      const lpW = lowpass(sr), hpL = highpass(sr), lpL = lowpass(sr);
      const gust = slowWave(r, [11, 19, 31]);
      let g = 0, rustle = 0;
      for (let i = 0; i < n; i++) {
        // порывы меняются за секунды — пересчитываем раз в 64 отсчёта
        if ((i & 63) === 0) {
          g = gust(i / sr);
          const over = Math.max(0, g - 0.35);
          rustle = 0.5 * over * Math.sqrt(Math.sqrt(over));
        }
        const wind = lpW(brown(), 250 + 450 * g) * (0.35 + 0.45 * g);
        const leaves = lpL(hpL(pink(), 1800), 6000) * rustle;
        ch[i] = wind + leaves;
      }
    }
    // Птицы: события раз в 1,5–5 с, далеко (тихо), с лёгким эхом леса
    let t = 0.8 + rand();
    while (t < n / sr - 1.5) {
      const notes = BIRDS[Math.floor(rand() * BIRDS.length)](rand);
      const amp = 0.035 + rand() * 0.06, pan = 0.2 + rand() * 0.6;
      for (const note of notes) {
        const len = Math.floor(note.dur * sr), s0 = Math.floor((t + note.at) * sr);
        let ph = 0;
        for (let k = 0; k < len; k++) {
          const x = k / len;
          const vib = note.vib ? 1 + (note.depth ?? 0.01) * Math.sin(TAU * note.vib * (k / sr)) : 1;
          ph += (TAU * (note.f1 + (note.f2 - note.f1) * x) * vib) / sr;
          const v = Math.sin(ph) * Math.sin(Math.PI * x) ** 1.5 * amp;
          for (const [delay, g] of ECHO) {
            const j = s0 + k + Math.floor(delay * sr);
            if (j >= n) continue;
            L[j] += v * g * (1 - pan);
            R[j] += v * g * pan;
          }
        }
      }
      t += 1.5 + rand() * 3.5;
    }
    return [L, R];
  }

  // ——— Поющие чаши: редкие мягкие удары, долгий тающий звон, «зал» ———
  const TABLE = new Float32Array(4096);
  for (let i = 0; i < TABLE.length; i++) TABLE[i] = Math.sin((TAU * i) / TABLE.length);

  /** Простой «зал» по Шрёдеру: четыре гребенчатых фильтра и два всепропускающих */
  function reverb(sr, spread) {
    const combs = [1557, 1617, 1491, 1422].map((d) => ({ buf: new Float32Array(Math.floor(((d + spread) * sr) / 44100)), i: 0 }));
    const alls = [225, 556].map((d) => ({ buf: new Float32Array(Math.floor(((d + spread) * sr) / 44100)), i: 0 }));
    return (x) => {
      let y = 0;
      for (const c of combs) {
        const v = c.buf[c.i];
        c.buf[c.i] = x + v * 0.84;
        c.i = (c.i + 1) % c.buf.length;
        y += v;
      }
      y *= 0.25;
      for (const a of alls) {
        const v = a.buf[a.i];
        a.buf[a.i] = y + v * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        y = v - y * 0.5;
      }
      return y;
    };
  }

  /**
   * Три чаши (фа, ля, до). Обертоны у чаши негармоничные — 1 : 2,71 : 5,15 : 8,17, — каждый
   * чуть раздвоен, отсюда характерное «пение» с биениями. Удар раз в 6–10 с, звон тает 10–20 с.
   */
  const BOWLS = [174.6, 220, 261.6];
  const PARTIALS = [[1, 1, 11], [2.71, 0.45, 6], [5.15, 0.2, 3.5], [8.17, 0.08, 2]]; // кратность, громкость, затухание (с)
  const BOWL_LEAD_SEC = 20;

  function bowlsChannels(sr, n, rand) {
    const out = [new Float32Array(n), new Float32Array(n)];
    const size = TABLE.length;
    const strikes = [];
    let last = -1;
    for (let t = 0.5; t < n / sr - 0.5; t += 6 + rand() * 4) {
      let b = Math.floor(rand() * BOWLS.length);
      if (b === last) b = (b + 1) % BOWLS.length;
      last = b;
      strikes.push({ at: Math.floor(t * sr), f: BOWLS[b], amp: 0.7 + rand() * 0.3, pan: 0.3 + rand() * 0.4, beats: PARTIALS.map(() => 0.4 + rand() * 1.6) });
    }
    for (let ch = 0; ch < 2; ch++) {
      const dry = new Float32Array(n);
      for (const st of strikes) {
        const side = ch ? st.pan : 1 - st.pan;
        PARTIALS.forEach(([ratio, gain, tau], pi) => {
          const f = st.f * ratio;
          if (f > sr / 2.5) return;
          const len = Math.min(n - st.at, Math.floor(tau * 5 * sr));
          const fall = Math.exp(-1 / (tau * sr));
          const attack = 0.012 * sr;
          // раздвоенный обертон: две близкие частоты дают медленное «пение»
          const i0 = (f * size) / sr, i1 = ((f + st.beats[pi]) * size) / sr;
          let p0 = 0, p1 = rand() * size, env = gain * st.amp * side * 0.5;
          for (let k = 0; k < len; k++) {
            const a = k < attack ? k / attack : 1;
            dry[st.at + k] += (TABLE[p0 | 0] + TABLE[p1 | 0]) * env * a;
            env *= fall;
            p0 += i0; if (p0 >= size) p0 -= size;
            p1 += i1; if (p1 >= size) p1 -= size;
          }
        });
      }
      const lp = lowpass(sr), wet = reverb(sr, ch ? 23 : 0);
      const o = out[ch];
      for (let i = 0; i < n; i++) {
        const x = lp(dry[i], 4000);
        o[i] = x * 0.75 + wet(x) * 0.5;
      }
    }
    return out;
  }

  const XFADE_SEC = 3;

  /** Склеить конец с началом, чтобы цикл не щёлкал */
  function loopable(buf, n, xf) {
    const out = buf.slice(0, n);
    for (let i = 0; i < xf; i++) {
      const a = Math.sin((Math.PI / 2) * (i / xf));
      out[i] = buf[i] * a + buf[n + i] * Math.cos((Math.PI / 2) * (i / xf));
    }
    return out;
  }

  const SEED = { rain: 11, sea: 23, forest: 37, bowls: 41 };
  const LENGTH = { rain: 30, sea: 47, forest: 60, bowls: 48 };

  function render(kind, sr, seconds = LENGTH[kind]) {
    const rand = rng(SEED[kind]);
    const n = Math.floor(seconds * sr), xf = XFADE_SEC * sr, total = n + xf;
    let L, R;
    if (kind === 'rain') { L = rainChannel(sr, total, rand); R = rainChannel(sr, total, rand); }
    else if (kind === 'sea') {
      const env = seaEnvelope(sr, total, rand);
      L = seaChannel(sr, total, rand, env, 0); R = seaChannel(sr, total, rand, env, 0.2);
    }
    else if (kind === 'bowls') {
      // начало отбрасываем: к началу цикла прошлые удары ещё звучат, как и на стыке
      const lead = BOWL_LEAD_SEC * sr;
      [L, R] = bowlsChannels(sr, total + lead, rand).map((c) => c.slice(lead));
    }
    else [L, R] = forestChannels(sr, total, rand);
    L = loopable(L, n, xf); R = loopable(R, n, xf);
    // одинаковая громкость у всех звуков (по среднему уровню), но без перегруза на пиках
    let peak = 0, sum = 0;
    for (let i = 0; i < n; i++) {
      peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      sum += L[i] * L[i] + R[i] * R[i];
    }
    const rms = Math.sqrt(sum / (2 * n));
    const k = rms ? Math.min(0.09 / rms, 0.9 / peak) : 1;
    for (let i = 0; i < n; i++) { L[i] *= k; R[i] *= k; }
    return [L, R];
  }

  const api = { render, KINDS: ['rain', 'sea', 'forest', 'bowls'] };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EchoSoundGen = api;
})(typeof window !== 'undefined' ? window : globalThis);
