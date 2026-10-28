'use strict';

/*
 * Плеер фоновых звуков «Эхо»: дождь, море, лес. Звук синтезируется в фоновом потоке
 * (sound-worker.js → sounds-gen.js) и играет бесшовным циклом. Файлов и данных человека нет.
 * Выбор звука запоминается на устройстве (localStorage).
 */
(function () {
  const KEY = 'echo-sound';
  /** 32 кГц хватает для шума дождя и птиц, а рендер на телефоне заметно быстрее */
  const SR = 32000;
  const VOLUME = 0.7;
  const version = (document.currentScript?.src.split('?')[1]) || '';

  let ctx = null, master = null, source = null, playing = null, token = 0, worker = null;
  const cache = {}, pending = {};

  function context() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function channels(kind) {
    try {
      if (!worker) worker = new Worker(`sound-worker.js${version ? `?${version}` : ''}`);
    } catch {
      worker = false;
    }
    if (worker === false) return Promise.resolve(window.EchoSoundGen.render(kind, SR));
    return new Promise((resolve, reject) => {
      const onMessage = (ev) => {
        if (ev.data.kind !== kind) return;
        worker.removeEventListener('message', onMessage);
        resolve(ev.data.channels);
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', reject, { once: true });
      worker.postMessage({ kind, sr: SR });
    });
  }

  function buffer(kind) {
    if (cache[kind]) return Promise.resolve(cache[kind]);
    pending[kind] ??= channels(kind).then(([L, R]) => {
      const b = ctx.createBuffer(2, L.length, SR);
      b.getChannelData(0).set(L);
      b.getChannelData(1).set(R);
      cache[kind] = b;
      return b;
    });
    return pending[kind];
  }

  function ramp(to, sec) {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(to, now + sec);
  }

  /** Включить звук; если играл другой — мягко сменить. onReady — когда звук пошёл */
  async function play(kind, onReady) {
    if (!context()) return;
    const my = ++token;
    if (playing === kind && source) { ramp(VOLUME, 1.5); onReady?.(); return; }
    const b = await buffer(kind);
    if (my !== token) return;
    stopSource(0.6);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.loop = true;
    s.connect(master);
    s.start(ctx.currentTime + (source ? 0.6 : 0));
    source = s;
    playing = kind;
    ramp(VOLUME, 2.5);
    onReady?.();
  }

  function stopSource(sec) {
    if (!source) return;
    const s = source;
    source = null;
    playing = null;
    ramp(0, sec);
    s.stop(ctx.currentTime + sec + 0.05);
  }

  /** Плавно затихнуть */
  function stop(sec = 1.5) {
    token++;
    if (ctx) stopSource(sec);
  }

  /** Подготовить звук заранее, пока человек читает текст */
  function warm(kind) {
    if (context()) buffer(kind).catch(() => {});
  }

  const saved = () => {
    try { return localStorage.getItem(KEY); } catch { return null; }
  };

  window.EchoSound = {
    KINDS: [['rain', '🌧 Дождь'], ['sea', '🌊 Море'], ['forest', '🌲 Лес']],
    play,
    stop,
    warm,
    isPlaying: () => Boolean(source),
    /** Выбранный звук: 'rain' | 'sea' | 'forest' или null — без звука */
    get choice() {
      const v = saved();
      return ['rain', 'sea', 'forest'].includes(v) ? v : null;
    },
    set choice(v) {
      try { localStorage.setItem(KEY, v ?? 'off'); } catch { /* приватный режим */ }
    },
  };
})();
