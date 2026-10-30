'use strict';

/*
 * Эмблема Эхо — ядро со звуковой волной, как на аватарке бота. Общая для страниц mini app:
 * дневник и «Карта сил» (app.js), «Минутка для себя» (practice.js), «Звуки» (sounds-page.js).
 * У полосок волны — порядковый номер --i, чтобы они «пели» вразнобой.
 */
const EMBLEM_INNER = `
    <defs><radialGradient id="emblem-core" cx="40%" cy="35%" r="75%">
      <stop offset="0%" stop-color="#A79DFF"/><stop offset="55%" stop-color="#7C6FF0"/><stop offset="100%" stop-color="#5A4CD6"/>
    </radialGradient></defs>
    <circle cx="132" cy="132" r="132" fill="url(#emblem-core)"/>
    <g fill="#F4F2FF">
      <rect class="bar" style="--i:0" x="48" y="108" width="20" height="48" rx="10"/><rect class="bar" style="--i:1" x="84" y="74" width="20" height="116" rx="10"/>
      <rect class="bar" style="--i:2" x="120" y="38" width="24" height="188" rx="12"/><rect class="bar" style="--i:3" x="160" y="74" width="20" height="116" rx="10"/>
      <rect class="bar" style="--i:4" x="196" y="108" width="20" height="48" rx="10"/>
    </g>`;

window.echoEmblem = (cls = 'emblem') => `<span class="${cls}" aria-hidden="true"><svg viewBox="0 0 264 264">${EMBLEM_INNER}</svg></span>`;

/** Эмблема внутри другой SVG-картинки (центр «Карты сил») */
window.echoEmblemSvg = (x, y, size, cls = '') => `<svg class="${cls}" x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 264 264">${EMBLEM_INNER}</svg>`;

/**
 * Шкала дыхания: по делению на секунду, заполняются слева направо —
 * видно, сколько ещё вдыхать или выдыхать, и воздух легко распределить равномерно.
 */
window.echoBreathBar = (sec, kind = 'in') => `<div class="breath-bar ${kind}" role="progressbar" aria-label="${sec} секунд">${
  Array.from({ length: sec }, (_, i) => `<span><i style="animation-delay:${i}s"></i></span>`).join('')
}</div>`;

/**
 * Вибрация в такт дыханию (Telegram HapticFeedback): на вдохе — лёгкий толчок каждую секунду,
 * на выдохе — мягкий в начале и в середине, на задержке — тишина. Новая фаза отменяет толчки прошлой.
 */
let breathPulses = [];
window.echoBreathHaptic = (sec, kind = 'in') => {
  breathPulses.forEach(clearTimeout);
  breathPulses = [];
  const hf = window.Telegram?.WebApp?.HapticFeedback;
  if (!hf || kind === 'hold') return;
  const pulse = (style) => { try { hf.impactOccurred(style); } catch { /* не поддерживается */ } };
  const times = kind === 'in' ? Array.from({ length: sec }, (_, i) => i) : [0, Math.floor(sec / 2)];
  breathPulses = times.map((t) => setTimeout(() => pulse(kind === 'in' ? 'light' : 'soft'), t * 1000));
};
window.echoBreathHapticStop = () => { breathPulses.forEach(clearTimeout); breathPulses = []; };
