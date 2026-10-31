'use strict';

/*
 * «Минутка для себя» — короткая практика после тревожной или усталой записи.
 * Ссылка: practice.html?p=breath|grounding|shoulders|silence|kind&a=vy|ty[&s=rain|sea|forest|music]. Данных человека здесь нет.
 * Тексты практик согласованы (docs/approvals/2026-10-28.md); «ты»-формы — парные к ним.
 */

const tg = window.Telegram?.WebApp;
const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const ty = params.get('a') === 'ty';
const f = (vy, t) => (ty ? t : vy);
/** Открыта из mini app (а не кнопкой под записью) — возвращаемся назад, а не в чат */
const fromApp = params.get('from') === 'app';

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
  kind: {
    title: 'Бережная пауза',
    text: 'Одна минута, три шага. Можно просто читать и отвечать себе мысленно.',
    steps: [
      ['1', 'Первое: признать, что сейчас тяжело. Можно сказать про себя: «Мне сейчас трудно». Без «но» и без «надо держаться».'],
      ['2', f('Второе: это чувство знакомо многим. Прямо сейчас кто-то чувствует что-то похожее, и с этим вы не в одиночку.', 'Второе: это чувство знакомо многим. Прямо сейчас кто-то чувствует что-то похожее, и с этим ты не в одиночку.')],
      ['3', f('Третье: что могло бы поддержать вас прямо сейчас? Что-то маленькое: чай, плед, пара тёплых слов себе, звонок близкому.', 'Третье: что могло бы поддержать тебя прямо сейчас? Что-то маленькое: чай, плед, пара тёплых слов себе, звонок близкому.')],
    ],
    done: 'Пауза сделана 🌿 Пусть хотя бы что-то одно из этого сегодня случится.',
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

/** Вместо простого круга дышит эмблема Эхо */
const orbEmblem = () => window.echoEmblem('orb-emblem');

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
  const bg = light ? '#D2C8EA' : '#221E35';
  safe(() => tg.setHeaderColor(bg), () => tg.setBackgroundColor(bg), () => tg.setBottomBarColor(bg));
}

function intro() {
  clearTimeout(timer);
  window.echoBreathHapticStop();
  app.innerHTML = `
    <section class="practice-card">
      <h1>${practice.title}</h1>
      <p>${practice.text}</p>
      <div class="orb">${orbEmblem()}</div>
      <button class="btn" id="go">Начать</button>
    </section>`;
  document.getElementById('go').onclick = () => {
    startSound();
    if (practice.steps) step(0);
    else run(0, 0);
  };
}

/** Круг дышит вместе с человеком: растёт на вдохе, сжимается на выдохе */
function run(round, phase) {
  if (round >= practice.rounds) return done();
  const [label, sec, kind] = practice.phases[phase];
  const counter = practice.quiet ? '' : `${round + 1} из ${practice.rounds}`;
  app.innerHTML = `
    <section class="practice-card">
      <h1>${practice.title}</h1>
      <div class="orb ${kind}" style="--sec:${sec}s">${orbEmblem()}</div>
      <div class="phase">${label}</div>
      ${practice.quiet ? '' : window.echoBreathBar(sec, kind)}
      <p class="note">${counter}</p>
    </section>`;
  // Тихая пауза — без вибрации, остальное дышит и в руке
  if (!practice.quiet) window.echoBreathHaptic(sec, kind);
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
      ${what.length > 40 ? `<p class="phase-text">${what}</p>` : `<div class="phase">${what}</div>`}
      <button class="btn" id="next">Дальше</button>
    </section>`;
  document.getElementById('next').onclick = () => step(i + 1);
}

function done() {
  window.echoBreathHapticStop();
  safe(() => tg.HapticFeedback.notificationOccurred('success'));
  window.EchoSound?.stop(4);
  // Отклик: помогла ли практика — ответ уходит в чат (и в статистику), «Эхо» закрывается
  const bot = params.get('b');
  app.innerHTML = `
    <section class="practice-card">
      <h1>${practice.done ? practice.title : 'Готово 🌿'}</h1>
      ${practice.done ? `<p>${practice.done}</p>` : ''}
      <p>Стало хоть немного легче?</p>
      <div class="orb">${orbEmblem()}</div>
      ${bot ? `<button class="btn" data-pf="yes">Да, легче</button>
      <button class="btn subtle" data-pf="no">Не особо</button>` : ''}
      <button class="btn subtle" id="again">Ещё раз</button>
      ${bot ? '' : `<button class="btn subtle" id="close">${fromApp ? 'Назад' : 'Вернуться в чат'}</button>`}
    </section>`;
  document.getElementById('again').onclick = intro;
  document.getElementById('close')?.addEventListener('click', () => (fromApp || !tg ? history.back() : tg.close()));
  for (const btn of app.querySelectorAll('[data-pf]')) {
    btn.onclick = () => {
      const link = `https://t.me/${bot}?start=pf_${id}_${btn.dataset.pf}`;
      if (tg) {
        safe(() => tg.openTelegramLink(link), () => tg.close());
      } else {
        location.href = link;
      }
    };
  }
}

// ——— Фоновый звук под практику: по умолчанию без звука, выбор запоминается ———
const sound = window.EchoSound;
const soundRow = document.getElementById('sound-row');

function startSound() {
  if (sound?.choice) sound.play(sound.choice);
}

function renderSoundRow() {
  if (!sound) return;
  const current = sound.choice;
  const options = [[null, '🔇 Без звука'], ...sound.KINDS];
  soundRow.innerHTML = options
    .map(([kind, label]) => `<button class="chip${kind === current ? ' accent' : ''}" data-sound="${kind ?? 'off'}">${label}</button>`)
    .join('');
  document.getElementById('sound-credit').textContent = current === 'music' ? sound.CREDIT : '';
}

soundRow.addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-sound]');
  if (!btn) return;
  const kind = btn.dataset.sound === 'off' ? null : btn.dataset.sound;
  sound.choice = kind;
  safe(() => tg.HapticFeedback.selectionChanged());
  // выбор сразу слышен — как примерка
  if (kind) sound.play(kind);
  else sound.stop();
  renderSoundRow();
});

// ?s=rain — звук предложен ссылкой (например, из новости «Новое в Эхо»); дальше человек выбирает сам
if (sound && sound.KINDS.some(([k]) => k === params.get('s'))) sound.choice = params.get('s');
renderSoundRow();
if (sound?.choice) sound.warm(sound.choice);

safe(() => tg.ready(), () => tg.expand(), () => tg.onEvent('themeChanged', applyTheme));
if (fromApp) safe(() => tg.BackButton.show(), () => tg.BackButton.onClick(() => history.back()));
applyTheme();
intro();
