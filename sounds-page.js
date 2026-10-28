'use strict';

/*
 * «Звуки» из вкладки «Ещё»: тихий фон на 5, 10 или 15 минут, к концу звук плавно затихает.
 * Открывается из mini app — «Назад» возвращает туда.
 */

const tg = window.Telegram?.WebApp;
const sound = window.EchoSound;
const params = new URLSearchParams(location.search);
const MINUTES = [5, 10, 15];
/** Последние 20 секунд звук медленно стихает */
const FADE_SEC = 20;

let kind = sound.choice ?? 'rain';
let minutes = 10;
let endsAt = 0, endTimer = null, tick = null;

const $ = (id) => document.getElementById(id);

function safe(...calls) {
  for (const call of calls) {
    try { if (tg) call(); } catch { /* не поддерживается */ }
  }
}

function applyTheme() {
  const forced = params.get('theme');
  const light = forced ? forced === 'light' : tg?.colorScheme ? tg.colorScheme === 'light' : matchMedia('(prefers-color-scheme: light)').matches;
  document.documentElement.classList.toggle('light', light);
  const bg = light ? '#E6DFF7' : '#221E35';
  safe(() => tg.setHeaderColor(bg), () => tg.setBackgroundColor(bg), () => tg.setBottomBarColor(bg));
}

const chip = (attr, value, label, on) => `<button class="chip${on ? ' accent' : ''}" data-${attr}="${value}">${label}</button>`;

function render() {
  const on = endsAt > 0;
  $('kinds').innerHTML = sound.KINDS.map(([k, label]) => chip('kind', k, label, k === kind)).join('');
  $('minutes').innerHTML = MINUTES.map((m) => chip('min', m, `${m} минут`, m === minutes)).join('');
  $('toggle').textContent = on ? 'Выключить' : 'Включить';
  $('orb').classList.toggle('still', !on);
  const left = Math.ceil((endsAt - Date.now()) / 60000);
  $('left').textContent = on ? `Осталось ${left} мин` : '';
  $('credit').textContent = kind === 'music' ? sound.CREDIT : '';
}

function finish() {
  clearTimeout(endTimer);
  clearInterval(tick);
  endsAt = 0;
  render();
}

function start() {
  endsAt = Date.now() + minutes * 60000;
  let ready = false;
  sound.play(kind, () => { ready = true; render(); });
  // на телефоне звук собирается секунду-другую
  setTimeout(() => { if (!ready && endsAt) $('left').textContent = 'Звук готовится…'; }, 300);
  clearTimeout(endTimer);
  endTimer = setTimeout(() => {
    sound.stop(FADE_SEC);
    endTimer = setTimeout(finish, FADE_SEC * 1000);
  }, minutes * 60000 - FADE_SEC * 1000);
  clearInterval(tick);
  tick = setInterval(render, 15000);
  render();
}

document.addEventListener('click', (ev) => {
  const k = ev.target.closest('[data-kind]')?.dataset.kind;
  const m = ev.target.closest('[data-min]')?.dataset.min;
  if (k) {
    kind = k;
    sound.choice = k;
    if (endsAt) sound.play(k);
    else sound.warm(k);
  } else if (m) {
    minutes = Number(m);
    if (endsAt) start();
  } else if (ev.target.closest('#toggle')) {
    if (endsAt) {
      sound.stop();
      finish();
    } else start();
  } else return;
  safe(() => tg.HapticFeedback.selectionChanged());
  render();
});

safe(() => tg.ready(), () => tg.expand(), () => tg.onEvent('themeChanged', applyTheme));
safe(() => tg.BackButton.show(), () => tg.BackButton.onClick(() => history.back()));
applyTheme();
sound.warm(kind);
render();
