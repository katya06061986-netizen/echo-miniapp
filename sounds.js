'use strict';

/*
 * Плеер фоновых звуков «Эхо». Дождь, море и лес синтезируются в фоновом потоке
 * (sound-worker.js → sounds-gen.js) и играют бесшовным циклом; музыка — запись ritual.mp3.
 * Данных человека здесь нет.
 * Выбор звука запоминается на устройстве (localStorage).
 */
(function () {
  const KEY = 'echo-sound';
  /** 32 кГц хватает для шума дождя и птиц, а рендер на телефоне заметно быстрее */
  const SR = 32000;
  const VOLUME = 0.7;
  const version = (document.currentScript?.src.split('?')[1]) || '';

  /** Музыка — живая запись: играет потоком из файла, не дожидаясь загрузки всех 10 МБ */
  const FILES = { music: { src: 'ritual.mp3', volume: 0.45 } };
  const CREDIT = 'Музыка: Kevin MacLeod, «Ritual» (incompetech.com), CC BY 4.0';

  let ctx = null, current = null, token = 0, worker = null;
  const cache = {}, pending = {}, elements = {};

  function context() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
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

  /** У каждого звука своя громкость: при смене один плавно уходит, другой плавно входит */
  function fade(gain, to, sec) {
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(to, now + sec);
  }

  /** Аудиоэлемент музыки создаётся один раз: подключить его к Web Audio можно только однажды */
  function element(kind) {
    if (!elements[kind]) {
      const el = new Audio(FILES[kind].src);
      el.loop = true;
      el.preload = 'auto';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      // громкость — через Web Audio: на iPhone свойство volume у аудио не работает
      ctx.createMediaElementSource(el).connect(gain);
      gain.connect(ctx.destination);
      elements[kind] = { el, gain };
    }
    return elements[kind];
  }

  function startFile(kind, my, onReady) {
    const { el, gain } = element(kind);
    // play() — сразу, в обработчике нажатия: иначе браузер не даст включить звук
    el.play().catch(() => {});
    fade(gain, FILES[kind].volume * VOLUME, 2.5);
    current = { kind, gain, end: () => el.pause() };
    if (el.readyState >= 3) onReady?.();
    else el.addEventListener('playing', () => { if (my === token) onReady?.(); }, { once: true });
  }

  /** Включить звук; если играл другой — мягко сменить. onReady — когда звук пошёл */
  async function play(kind, onReady) {
    if (!context()) return;
    const my = ++token;
    if (current?.kind === kind) { fade(current.gain, (FILES[kind]?.volume ?? 1) * VOLUME, 1.5); onReady?.(); return; }
    if (FILES[kind]) {
      stopCurrent(1);
      startFile(kind, my, onReady);
      return;
    }
    const b = await buffer(kind);
    if (my !== token) return;
    stopCurrent(1);
    const s = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    s.buffer = b;
    s.loop = true;
    s.connect(gain);
    gain.connect(ctx.destination);
    s.start();
    fade(gain, VOLUME, 2.5);
    current = { kind, gain, end: () => { s.stop(); gain.disconnect(); } };
    onReady?.();
  }

  function stopCurrent(sec) {
    if (!current) return;
    const { gain, end } = current;
    current = null;
    fade(gain, 0, sec);
    setTimeout(end, sec * 1000 + 50);
  }

  /** Плавно затихнуть */
  function stop(sec = 1.5) {
    token++;
    if (ctx) stopCurrent(sec);
  }

  /** Подготовить звук заранее, пока человек читает текст */
  function warm(kind) {
    if (!context()) return;
    if (FILES[kind]) element(kind);
    else buffer(kind).catch(() => {});
  }

  const saved = () => {
    try { return localStorage.getItem(KEY); } catch { return null; }
  };

  window.EchoSound = {
    KINDS: [['rain', '🌧 Дождь'], ['sea', '🌊 Море'], ['forest', '🌲 Лес'], ['music', '🎶 Музыка']],
    /** Подпись автора музыки — условие лицензии CC BY; показывать, когда выбрана музыка */
    CREDIT,
    play,
    stop,
    warm,
    isPlaying: () => Boolean(current),
    /** Выбранный звук: 'rain' | 'sea' | 'forest' | 'music' или null — без звука */
    get choice() {
      const v = saved();
      return ['rain', 'sea', 'forest', 'music'].includes(v) ? v : null;
    },
    set choice(v) {
      try { localStorage.setItem(KEY, v ?? 'off'); } catch { /* приватный режим */ }
    },
  };
})();
