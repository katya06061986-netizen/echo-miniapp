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
