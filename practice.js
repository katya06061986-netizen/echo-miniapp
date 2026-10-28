'use strict';

/*
 * «Минутка для себя» — короткая практика после тревожной или усталой записи.
 * Ссылка: practice.html?p=breath|grounding|shoulders|silence&a=vy|ty. Данных человека здесь нет.
 * Тексты практик согласованы (docs/approvals/2026-10-28.md); «ты»-формы — парные к ним.
 */

const tg = window.Telegram?.WebApp;
const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const ty = params.get('a') === 'ty';
const f = (vy, t) => (ty ? t : vy);

const PRACTICES = {
  breath: {
    title: 'Дыхание 4–6',
    text: 'Вдох на четыре счёта, выдох на шесть. Выдох длиннее вдоха — так телу проще успокоиться. Пять кругов, около минуты.',
    // фазы: подпись, секунды, круг растёт (in) или сжимается (out)
    rounds: 5,
    phases: [['Вдох', 4, 'in'], ['Выдох', 6, 'out']],
  },
  shoulders: {
    title: 'Опустить плечи',
    text: f(
      'Поднимите плечи к ушам на вдохе, задержите на пару секунд и опустите на выдохе. Три раза. Заметьте, где ещё в теле есть напряжение.',
      'Подними плечи к ушам на вдохе, задержи на пару секунд и опусти на выдохе. Три раза. Заметь, где ещё в теле есть напряжение.',
    ),
    rounds: 3,
    phases: [['Плечи вверх', 4, 'in'], ['Задержать', 2, 'hold'], ['Опустить', 4, 'out']],
  },
  silence: {
    title: 'Пауза в тишине',
    text: 'Одна минута без телефона. Можно закрыть глаза и просто послушать, что вокруг.',
    rounds: 6,
    phases: [['', 5, 'in'], ['', 5, 'out']],
    quiet: true,
  },
  grounding: {
    title: '5-4-3-2-1',
    text: f(
      'Назовите про себя пять вещей, которые видите, четыре — которые слышите, три — которые можете потрогать, две — запаха, одну — вкус. Это возвращает в «здесь и сейчас».',
      'Назови про себя пять вещей, которые видишь, четыре — которые слышишь, три — которые можешь потрогать, две — запаха, одну — вкус. Это возвращает в «здесь и сейчас».',
    ),
    steps: [
      ['5', f('вещей, которые видите', 'вещей, которые видишь')],
      ['4', f('звука, которые слышите', 'звука, которые слышишь')],
      ['3', f('вещи, которые можете потрогать', 'вещи, которые можешь потрогать')],
      ['2', 'запаха'],
      ['1', 'вкус'],
    ],
  },
};

const id = Object.hasOwn(PRACTICES, params.get('p')) ? params.get('p') : 'breath';
const practice = PRACTICES[id];
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

function intro() {
  clearTimeout(timer);
  app.innerHTML = `
    <section class="practice-card">
      <h1>${practice.title}</h1>
      <p>${practice.text}</p>
      <div class="orb"></div>
      <button class="btn" id="go">Начать</button>
    </section>`;
  document.getElementById('go').onclick = practice.steps ? () => step(0) : () => run(0, 0);
}

/** Круг дышит вместе с человеком: растёт на вдохе, сжимается на выдохе */
function run(round, phase) {
  if (round >= practice.rounds) return done();
  const [label, sec, kind] = practice.phases[phase];
  const counter = practice.quiet ? '' : `${round + 1} из ${practice.rounds}`;
  app.innerHTML = `
    <section class="practice-card">
      <h1>${practice.title}</h1>
      <div class="orb ${kind}" style="--sec:${sec}s"></div>
      <div class="phase">${label}</div>
      <p class="note">${counter}</p>
    </section>`;
  const next = phase + 1 < practice.phases.length ? [round, phase + 1] : [round + 1, 0];
  timer = setTimeout(() => run(...next), sec * 1000);
}

/** 5-4-3-2-1 — в своём темпе, по кнопке */
function step(i) {
  if (i >= practice.steps.length) return done();
  const [n, what] = practice.steps[i];
  app.innerHTML = `
    <section class="practice-card">
      <h1>${practice.title}</h1>
      <div class="big-num">${n}</div>
      <div class="phase">${what}</div>
      <button class="btn" id="next">Дальше</button>
    </section>`;
  document.getElementById('next').onclick = () => step(i + 1);
}

function done() {
  safe(() => tg.HapticFeedback.notificationOccurred('success'));
  app.innerHTML = `
    <section class="practice-card">
      <h1>Готово 🌿</h1>
      <div class="orb"></div>
      <button class="btn" id="again">Ещё раз</button>
      <button class="btn subtle" id="close">Вернуться в чат</button>
    </section>`;
  document.getElementById('again').onclick = intro;
  document.getElementById('close').onclick = () => (tg ? tg.close() : history.back());
}

safe(() => tg.ready(), () => tg.expand(), () => tg.onEvent('themeChanged', applyTheme));
applyTheme();
intro();
