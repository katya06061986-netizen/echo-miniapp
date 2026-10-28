'use strict';

/*
 * «Мне сейчас плохо»: пара минут, чтобы переждать волну тревоги или страха.
 * Выдох с дышащей эмблемой → опора → «волна спадает» → либо «стало легче», либо телефоны помощи.
 * Без диагнозов и слова «паническая атака». Данных человека здесь нет. ?a=ty — на «ты».
 */

const tg = window.Telegram?.WebApp;
const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const ty = params.get('a') === 'ty';
const f = (vy, t) => (ty ? t : vy);
const sound = window.EchoSound;
const orbEmblem = () => window.echoEmblem('orb-emblem');

/** Дыхание: вдох 4, выдох 6, шесть кругов — около минуты */
const ROUNDS = 6;
const PHASES = [['Вдох', 4, 'in'], ['Выдох', 6, 'out']];
let timer = null;

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

function screen(html) {
  clearTimeout(timer);
  app.innerHTML = `<section class="practice-card">${html}</section>`;
}

function rainChip() {
  if (!sound) return '';
  const on = sound.isPlaying();
  return `<button class="chip${on ? ' accent' : ''}" id="rain">${on ? '🌧 Звук дождя включён' : '🌧 Включить звук дождя'}</button>`;
}

function bindRain() {
  const btn = document.getElementById('rain');
  if (!btn) return;
  btn.onclick = () => {
    if (sound.isPlaying()) sound.stop();
    else sound.play('rain');
    btn.outerHTML = rainChip();
    setTimeout(bindRain, 0);
  };
}

/** Шаг 1: сразу выдох, без лишних нажатий */
function breathe(round = 0, phase = 0) {
  if (round >= ROUNDS) return ground();
  const [label, sec, kind] = PHASES[phase];
  screen(`
    <h1>${f('Давайте переждём это вместе', 'Давай переждём это вместе')}</h1>
    <p>Шаг за шагом. Сначала — выдох.</p>
    <div class="orb ${kind}" style="--sec:${sec}s">${orbEmblem()}</div>
    <div class="phase">${label}</div>
    ${rainChip()}
    <button class="btn subtle" id="next">Дальше</button>`);
  bindRain();
  document.getElementById('next').onclick = ground;
  const next = phase + 1 < PHASES.length ? [round, phase + 1] : [round + 1, 0];
  timer = setTimeout(() => breathe(...next), sec * 1000);
}

/** Шаг 2: опора */
function ground() {
  screen(`
    <h1>Опора</h1>
    <p>${f(
      'Почувствуйте опору: стопы на полу, спина касается стула. Назовите про себя три вещи, которые видите.',
      'Почувствуй опору: стопы на полу, спина касается стула. Назови про себя три вещи, которые видишь.',
    )}</p>
    <div class="orb">${orbEmblem()}</div>
    <button class="btn" id="next">Дальше</button>`);
  document.getElementById('next').onclick = wave;
}

/** Шаг 3: волна спадает */
function wave() {
  screen(`
    <h1>Это пройдёт</h1>
    <p>Такие волны поднимаются и спадают. Эта тоже пройдёт.</p>
    <div class="orb">${orbEmblem()}</div>
    <button class="btn" id="better">Стало чуть легче</button>
    <button class="btn subtle" id="worse">Всё ещё плохо</button>`);
  document.getElementById('better').onclick = better;
  document.getElementById('worse').onclick = worse;
}

function better() {
  sound?.stop(3);
  screen(`
    <h1>Хорошо 🌿</h1>
    <p>Хорошо, что чуть отпустило. Можно повторить, если нужно.</p>
    <div class="orb">${orbEmblem()}</div>
    <button class="btn" id="again">Ещё раз</button>
    <button class="btn subtle" id="back">Вернуться</button>`);
  document.getElementById('again').onclick = () => breathe();
  document.getElementById('back').onclick = () => history.back();
}

function worse() {
  screen(`
    <h1>Помощь рядом</h1>
    <p>Сейчас лучше поговорить с живым человеком, это анонимно и бесплатно:</p>
    <a class="btn" href="tel:+74959895050">📞 8 (495) 989-50-50</a>
    <p class="note">Экстренная психологическая помощь МЧС, круглосуточно</p>
    <a class="btn subtle" href="tel:112">📞 112 — если есть угроза жизни</a>
    <p>${f('Можно написать или позвонить тому, кому доверяете.', 'Можно написать или позвонить тому, кому доверяешь.')}</p>
    <button class="btn subtle" id="back">Вернуться</button>`);
  document.getElementById('back').onclick = () => history.back();
}

safe(() => tg.ready(), () => tg.expand(), () => tg.onEvent('themeChanged', applyTheme));
safe(() => tg.BackButton.show(), () => tg.BackButton.onClick(() => history.back()));
applyTheme();
breathe();
