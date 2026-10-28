'use strict';

/*
 * Mini app «Эхо» без сервера. Данные приходят в ссылке после «#d=» (base64url от JSON):
 * эта часть адреса не уходит на хостинг, страница разбирает её прямо в телефоне.
 * Действия (время напоминания, отзыв, удаление) возвращают в чат ссылкой t.me/бот?start=…
 */

const tg = window.Telegram?.WebApp;
const app = document.getElementById('app');
const tabsEl = document.getElementById('tabs');
const BOT = new URLSearchParams(location.search).get('b') || '';

let state = null;
let tab = ['overview', 'entries', 'recipe', 'feedback', 'more', 'settings'].includes(new URLSearchParams(location.search).get('tab')) ? new URLSearchParams(location.search).get('tab') : 'overview';
let chartRange = 7;

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

// ---------- утилиты ----------

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function fmt(n) {
  return (Math.round(n * 10) / 10).toString().replace('.', ',');
}

/** «вы»-вариант или «ты»-вариант — как выбрал человек при знакомстве */
function f(vy, ty) {
  return state.addr === 'ty' ? ty : vy;
}

function decode(hash) {
  const m = hash.match(/(?:^#|&)d=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64 + '==='.slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Сегодня по времени человека (ссылка могла обновиться вчера) */
function todayLocal() {
  return new Date(Date.now() + state.tz * 60000).toISOString().slice(0, 10);
}

function addDays(date, n) {
  return new Date(Date.parse(date) + n * 864e5).toISOString().slice(0, 10);
}

/** Настроение по дням: [{date, mood}] — с поправкой, если ссылка обновлялась не сегодня */
function days() {
  const shift = Math.round((Date.parse(todayLocal()) - Date.parse(state.today)) / 864e5);
  const list = state.days.map((mood, i) => ({ date: addDays(state.today, i - state.days.length + 1), mood, em: state.de?.[i] ?? null, dd: state.dd?.[i] ?? null }));
  for (let i = 0; i < shift; i++) list.push({ date: addDays(state.today, i + 1), mood: null, em: null, dd: null });
  return list.slice(-30);
}

/** Котик или цветок из бакета: avatars/<стиль>/<настроение>-<эмоция>.svg */
function avatarSrc(mood, em) {
  const file = mood === null ? 'empty.svg' : `${Math.min(10, Math.max(1, Math.round(mood)))}-${em ?? 'n'}.svg`;
  return `avatars/${encodeURIComponent(state.st)}/${file}`;
}

/** Цвет настроения: от приглушённого синего через акцент к светлой лаванде */
function moodColor(mood) {
  const stops = [[1, [76, 90, 122]], [5.5, [124, 111, 240]], [10, [183, 169, 255]]];
  const m = Math.min(10, Math.max(1, mood));
  const [a, b] = m <= stops[1][0] ? [stops[0], stops[1]] : [stops[1], stops[2]];
  const t = (m - a[0]) / (b[0] - a[0]);
  const c = a[1].map((v, i) => Math.round(v + (b[1][i] - v) * t));
  return `rgb(${c.join(',')})`;
}

function dayTitle(date) {
  const today = todayLocal();
  if (date === today) return 'Сегодня';
  if (date === addDays(today, -1)) return 'Вчера';
  const d = new Date(date + 'T00:00:00Z');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${WEEKDAYS[d.getUTCDay()]}`;
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function greeting() {
  const h = new Date(Date.now() + state.tz * 60000).getUTCHours();
  if (h < 6) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function haptic(kind = 'light') {
  tg?.HapticFeedback?.impactOccurred?.(kind);
}

/** Вернуться в чат с ботом и выполнить действие там */
function toChat(action) {
  haptic('medium');
  const link = `https://t.me/${BOT}?start=${action}`;
  if (BOT && tg?.openTelegramLink) tg.openTelegramLink(link);
  else if (BOT) location.href = link;
  tg?.close?.();
}

/** Аватары на выбор в «Настройках»: эмблема Эхо — по умолчанию */
const AVATARS = [['emblem', 'Эхо'], ['flower', 'Цветок'], ['cat', 'Котик'], ['cat_coal', 'Уголёк'], ['cat_ginger', 'Рыжик']];

/** Экстренная кнопка: на главном экране и первой карточкой в «Ещё» */
const SOS_LABEL = '🤍 Помощь здесь и сейчас';

/** Практики «Минутки для себя»: открываются страницей practice.html */
const PRACTICES = [
  ['breath', '💨', 'Дыхание 4–6'],
  ['grounding', '🖐', '5-4-3-2-1'],
  ['shoulders', '💆', 'Опустить плечи'],
  ['silence', '🍃', 'Пауза в тишине'],
];

// ---------- экраны ----------

/** Эмблема Эхо — из emblem.js; «дышит» */
const emblem = () => window.echoEmblem();

function ring(value) {
  const r = 42, len = 2 * Math.PI * r;
  const offset = value === null ? len : len * (1 - (value - 1) / 9);
  return `
    <div class="ring pulsing">
      <svg viewBox="0 0 96 96"><circle class="track" cx="48" cy="48" r="${r}"/>
        <circle class="value" cx="48" cy="48" r="${r}" stroke-dasharray="${len}" stroke-dashoffset="${offset}"/></svg>
      ${state.st
        ? `<img class="avatar" src="${avatarSrc(value ?? 6, value === null ? null : state.we)}" alt="">`
        : `<div class="ring-label"><div><b>${value === null ? '–' : fmt(value)}</b><small>из 10</small></div></div>`}
    </div>`;
}

/** Неделя котиками или цветами — как на картинке /stats */
function weekAvatars() {
  const today = todayLocal();
  return `<div class="week-avatars">${days().slice(-7).map((d) => {
    const wd = WEEKDAYS[new Date(d.date + 'T00:00:00Z').getUTCDay()];
    return `<button class="wa${d.date === today ? ' today' : ''}" ${d.dd ? `data-day="${d.date}"` : d.date === today ? 'data-action="record"' : 'disabled'} title="${esc(dayTitle(d.date))}${d.mood === null ? '' : ': ' + fmt(d.mood)}">
      <b>${d.mood === null ? '' : fmt(d.mood)}</b>
      <img src="${avatarSrc(d.mood, d.em)}" alt="">
      <span>${wd}</span>
    </button>`;
  }).join('')}</div>`;
}

function chart(range) {
  if (range === 7 && state.st) return weekAvatars();
  const list = days().slice(-range);
  const today = todayLocal();
  const W = 320, H = 160, top = 10, bottom = 22, plotH = H - top - bottom;
  const step = W / list.length;
  const barW = Math.min(28, step * 0.62);
  const y = (m) => top + plotH * (1 - m / 10);

  let out = '';
  for (const g of [5, 10]) out += `<line class="grid" x1="0" x2="${W}" y1="${y(g)}" y2="${y(g)}"/>`;
  list.forEach((d, i) => {
    const cx = step * i + step / 2;
    if (d.mood === null) {
      out += `<circle class="empty" cx="${cx}" cy="${top + plotH - 3}" r="3"/>`;
    } else {
      const h = Math.max(6, plotH * (d.mood / 10));
      out += `<rect class="bar" ${d.dd ? `data-day="${d.date}"` : ''} x="${cx - barW / 2}" y="${top + plotH - h}" width="${barW}" height="${h}" rx="${Math.min(8, barW / 2)}" fill="${moodColor(d.mood)}"><title>${esc(dayTitle(d.date))}: ${fmt(d.mood)}</title></rect>`;
    }
    const date = new Date(d.date + 'T00:00:00Z');
    const isToday = d.date === today;
    const label = range === 7 ? WEEKDAYS[date.getUTCDay()] : (i % 5 === list.length % 5 || isToday ? date.getUTCDate() : '');
    if (label !== '') out += `<text class="axis${isToday ? ' today' : ''}" x="${cx}" y="${H - 4}" text-anchor="middle">${label}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Настроение по дням">${out}</svg>`;
}

function overview() {
  const week = state.week;
  const last = state.ld;
  const filled = days().filter((d) => d.mood !== null).length;
  const heroText = week
    ? `<p class="big">${esc(week.title)}</p><p>${week.trend ? esc(week.trend[0].toUpperCase() + week.trend.slice(1)) + '.' : 'Ещё пара дней — и станет видно, как идёт неделя.'}</p>${state.st && week.avg !== null ? `<p class="note">В среднем ${fmt(week.avg)} из 10</p>` : ''}`
    : `<p class="big">Неделя только начинается</p><p>${f('Запишите голосовое о дне — и здесь появится ваше настроение.', 'Запиши голосовое о дне — и здесь появится твоё настроение.')}</p>`;

  return `
    <header class="hello">
      <h1>${greeting()}${state.name ? ', ' + esc(state.name) : ''}</h1>
      <p>${last ? `Последняя запись — ${dayTitle(last).toLowerCase()}` : f('Здесь будет ваш дневник настроения', 'Здесь будет твой дневник настроения')}</p>
    </header>

    <section class="card hero"><button class="ring-btn" data-action="record" aria-label="Рассказать, как прошёл день">${ring(week?.avg ?? null)}</button><div class="hero-text">${heroText}<p class="note">${f('Нажмите на аватар, чтобы рассказать, как прошёл день.', 'Нажми на аватар, чтобы рассказать, как прошёл день.')}</p></div></section>

    <div class="stats">
      <div class="stat"><b>${state.streak > 0 ? state.streak + ' 🔥' : 0}</b><span>${plural(state.streak, 'день', 'дня', 'дней')} без перерыва</span></div>
      <div class="stat"><b>${state.total}</b><span>${plural(state.total, 'запись', 'записи', 'записей')}</span></div>
      <div class="stat"><b>${filled}</b><span>${plural(filled, 'день', 'дня', 'дней')} за месяц</span></div>
    </div>

    <section class="card">
      <div class="card-head">
        <h2>Как звучали дни</h2>
        <div class="seg" role="tablist">
          <button data-range="7" class="${chartRange === 7 ? 'is-active' : ''}">7 дней</button>
          <button data-range="30" class="${chartRange === 30 ? 'is-active' : ''}">30 дней</button>
        </div>
      </div>
      ${state.total ? chart(chartRange) : emptyState()}
      ${state.total ? `<p class="note" style="margin:8px 0 0">${f('Нажмите на день, чтобы открыть его запись.', 'Нажми на день, чтобы открыть его запись.')}</p>` : ''}
    </section>

    <button class="sos-btn" data-sos>${SOS_LABEL}</button>
`;
}

// ---------- «Карта сил» ----------

const PM_C = [170, 165];
/** Места на орбитах для того, что даёт силы: угол (°) — сильное ближе к Эхо */
const PM_SLOTS = [-28, 205, 100];
/** Что забирает силы — за волнами, по углам: x, y, выравнивание подписи */
const PM_FAR = [[30, 300, 'start'], [310, 26, 'end'], [310, 300, 'end']];
let pmSel = 0;

/** Общее для карты: волны от Эхо, орбиты и дышащая эмблема в центре */
function pmBase() {
  const [cx, cy] = PM_C;
  return `
    <defs>
      <radialGradient id="pm-sat" cx="38%" cy="32%" r="75%"><stop offset="0%" stop-color="#E4DFFF"/><stop offset="55%" stop-color="#A79DFF"/><stop offset="100%" stop-color="#7C6FF0"/></radialGradient>
      <filter id="pm-glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7"/></filter>
    </defs>
    <circle class="pm-ripple" cx="${cx}" cy="${cy}" r="128"/>
    <circle class="pm-ripple" style="animation-delay:-1.33s" cx="${cx}" cy="${cy}" r="128"/>
    <circle class="pm-ripple" style="animation-delay:-2.66s" cx="${cx}" cy="${cy}" r="128"/>
    <circle cx="${cx}" cy="${cy}" r="80" fill="none" stroke="#7C6FF0" stroke-opacity=".35" stroke-dasharray="2 6"/>
    <circle cx="${cx}" cy="${cy}" r="110" fill="none" stroke="#7C6FF0" stroke-opacity=".22" stroke-dasharray="2 7"/>
    <circle cx="${cx}" cy="${cy}" r="44" fill="#7C6FF0" opacity=".5" filter="url(#pm-glow)"/>
    <g class="pm-core">${window.echoEmblemSvg(cx - 36, cy - 36, 72)}</g>`;
}

function pmQuote(i) {
  const it = state.pm.lift[i];
  if (!it) return '';
  return `<small>${it.e} ${esc(it.l)} · ${esc(it.h)}</small>${it.q ? `«${esc(it.q)}»` : ''}`;
}

function powerMap() {
  const pm = state.pm;
  if (!pm) return '';
  const head = `<h2>Карта сил</h2>`;
  if (pm.days < 7) {
    // Карта собирается: Эхо уже дышит, вокруг — тусклые точки того, что прозвучало; на 7-й день они встанут на орбиты
    const [cx, cy] = PM_C;
    const seen = (pm.seen || []).map((it, i, all) => {
      const a = ((i * 360) / Math.max(all.length, 1) - 90) * Math.PI / 180;
      // ближе к Эхо — то, что чаще в светлых днях; крупнее — то, что звучит чаще
      const r = 96 - (it.k || 0) * 30;
      const x = Math.round(cx + r * Math.cos(a)), y = Math.round(cy + r * Math.sin(a));
      const size = 8 + Math.min(it.n || 1, 5) * 2;
      return `<g class="pm-seed"><circle cx="${x}" cy="${y}" r="${size}" fill="#A79DFF" opacity=".28"/>
        <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="10" opacity=".7">${it.e}</text>
        <text x="${x}" y="${y + size + 14}" text-anchor="middle" font-size="11" fill="currentColor" opacity=".55">${esc(it.l)}</text></g>`;
    }).join('');
    const names = (pm.seen || []).slice(0, 3).map((it) => it.l).join(', ');
    return `<section class="card">${head}
      <svg class="pm" viewBox="0 0 340 330" role="img" aria-label="Карта сил собирается">
        ${pmBase()}
        ${seen}
      </svg>
      <p class="note" style="margin:6px 0 0">Карта собирается: ${pm.days} из 7 дней.${names ? ` Уже прозвучало: ${esc(names)}.` : ''}${pm.days >= 3 ? ' Пока это первые наблюдения.' : ''}</p>
    </section>`;
  }
  if (!pm.lift.length && !pm.drain.length) {
    return `<section class="card">${head}<p class="note" style="margin:0">Пока явных закономерностей не видно — так тоже бывает. Карта обновляется с каждой записью.</p></section>`;
  }
  const [cx, cy] = PM_C;
  const sats = pm.lift.map((it, i) => {
    const r = it.w >= 2 ? 80 : 110;
    const a = (PM_SLOTS[i] * Math.PI) / 180;
    const x = Math.round(cx + r * Math.cos(a)), y = Math.round(cy + r * Math.sin(a));
    const size = [0, 13, 17, 21][it.w];
    return `<g class="pm-sat" style="animation-delay:${-i * 2}s" data-pm="${i}">
      <circle cx="${x}" cy="${y}" r="${size + 3}" fill="#A79DFF" opacity=".5" filter="url(#pm-glow)"/>
      <circle cx="${x}" cy="${y}" r="${size}" fill="url(#pm-sat)"/>
      <text x="${x}" y="${y + size * 0.3}" text-anchor="middle" font-size="${Math.round(size * 0.8)}">${it.e}</text>
      <text x="${x}" y="${y + size + 16}" text-anchor="middle" font-size="12" fill="currentColor">${esc(it.l)}</text>
    </g>`;
  }).join('');
  const far = pm.drain.map((it, i) => {
    const [x, y, anchor] = PM_FAR[i];
    const tx = anchor === 'start' ? x + 14 : x - 14;
    return `<circle cx="${x}" cy="${y}" r="8" fill="none" stroke="#A79DFF" stroke-dasharray="2 3"/>
      <text x="${tx}" y="${y + 4}" text-anchor="${anchor}" font-size="11" fill="currentColor">${esc(it.l)}</text>`;
  }).join('');
  return `
    <section class="card">
      ${head}
      <p class="note" style="margin:0 0 4px">${f('На орбитах — то, что отзывается в ваших светлых днях. За волнами — то, что забирает силы.', 'На орбитах — то, что отзывается в твоих светлых днях. За волнами — то, что забирает силы.')}</p>
      <svg class="pm" viewBox="0 0 340 330" role="img" aria-label="Карта сил">
        ${pmBase()}
        ${sats}
        <g class="pm-far">${far}</g>
      </svg>
      ${pm.lift.length ? `<div class="pm-quote" id="pm-quote">${pmQuote(pmSel)}</div>` : ''}
      <p class="note" style="margin:10px 0 0">Это наблюдение, а не правило. Чем больше записей, тем точнее.</p>
    </section>`;
}

function recipe() {
  const { left, text } = state.recipe;
  const head = `<header class="hello"><h1>Рецепт хорошего дня</h1><p>${f('Из ваших собственных светлых дней', 'Из твоих собственных светлых дней')}</p></header>`;
  if (left > 0) {
    const need = 7;
    const have = need - left;
    return `${head}
      <section class="card">
        <h2>Собираем рецепт</h2>
        <p>Ещё ${left} ${plural(left, 'день', 'дня', 'дней')} с записями — и станет видно, что чаще бывает в светлые дни.</p>
        <div class="progress"><div style="width:${(have / need) * 100}%"></div></div>
        <p class="note">${have} из ${need}</p>
      </section>
      ${powerMap()}`;
  }
  // Текст рецепта — уже готовый, связными абзацами; первую строку-заголовок не повторяем
  const paragraphs = text.split('\n\n').map((p) => p.replace(/^🍀[^\n]*\n?/, '').trim()).filter(Boolean);
  return `${head}<section class="card">${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}</section>${powerMap()}`;
}

function feedback() {
  const asks = [
    ['✨', 'Что добавить', 'Чего не хватает в дневнике'],
    ['🧹', 'Что убрать', 'Что мешает или кажется лишним'],
    ['🛠', 'Что улучшить', 'Где неудобно, непонятно или Эхо ошиблось'],
  ];
  return `
    <header class="hello"><h1>Отзыв</h1><p>${f('Это тестовая версия, и ваше мнение очень помогает', 'Это тестовая версия, и твоё мнение очень помогает')}</p></header>
    <section class="card">
      ${asks.map(([icon, title, hint]) => `
        <div class="ask"><span class="icon">${icon}</span><div><b>${title}</b><p>${hint}</p></div></div>`).join('')}
    </section>
    <section class="card">
      <p>Можно пару слов, можно подробно. Отзыв анонимный: команда прочитает только текст, без имени. В дневник он не попадёт.</p>
      <button class="btn" data-action="feedback" style="margin-top:14px">✍️ Написать отзыв в чате</button>
    </section>`;
}

function more() {
  return `
    <header class="hello"><h1>Ещё</h1></header>

    <section class="card">
      <h2>Минутка для себя</h2>
      <p class="note" style="margin:0 0 12px">Короткие практики на минуту — когда тревожно или нет сил.</p>
      <div class="practices">
        ${PRACTICES.map(([id, emoji, title]) => `<button class="practice-btn" data-practice="${id}"><span>${emoji}</span>${title}</button>`).join('')}
      </div>
    </section>

    <section class="card">
      <h2>${SOS_LABEL}</h2>
      <p class="note" style="margin:0 0 12px">Если накрыло тревогой или страхом — пара минут, чтобы переждать.</p>
      <button class="btn" data-sos>Открыть</button>
    </section>

    ${state.ar ? `<section class="card">
      <h2>📖 Почитать</h2>
      <p class="note" style="margin:0 0 12px">Короткие статьи психологов о том, как бережно относиться к себе.</p>
      <button class="btn" data-read>Открыть</button>
    </section>` : ''}

    <section class="card">
      <h2>🎧 Звуки</h2>
      <p class="note" style="margin:0 0 12px">Тихий фон, чтобы побыть с собой: дождь, море, лес или музыка.</p>
      <button class="btn" data-sounds>Послушать</button>
    </section>

    ${state.topicsOn ? `<section class="card">
      <h2>Тема недели</h2>
      ${state.topic
        ? `<p style="margin:0 0 12px">${esc(state.topic.t)} · ${state.topic.d >= 1 ? `день ${Math.min(state.topic.d, 7)} из 7` : 'начнётся завтра'}</p>`
        : `<p class="note" style="margin:0 0 12px">7 вечеров — один вопрос по теме к напоминанию, в конце — итог из ${f('ваших', 'твоих')} слов.</p>`}
      <button class="btn${state.topic ? ' subtle' : ''}" data-action="theme">${state.topic ? 'Сменить тему' : 'Выбрать тему'}</button>
      ${state.ts ? `<details class="topic-sum"><summary>Итог прошлой темы</summary><p>${esc(state.ts)}</p></details>` : ''}
    </section>` : ''}

    <section class="card">
      <h2>Письмо себе</h2>
      <p class="note" style="margin:0 0 12px">${f('О том, как вы сейчас: что тревожит, о чём мечтается. Через месяц письмо вернётся к вам эхом.', 'О том, как ты сейчас: что тревожит, о чём мечтается. Через месяц письмо вернётся к тебе эхом.')}</p>
      <button class="btn" data-action="letter">✉️ Написать письмо</button>
    </section>`;
}

function settings() {
  const on = state.remind !== null;
  const mOn = state.morning !== null && state.morning !== undefined;
  const mHours = Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === (state.morning ?? 9) ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('');
  const hours = Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === (state.remind ?? 21) ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('');
  // Дневной вопрос: по умолчанию дважды, в 12:00 и 17:00
  const ck = state.ck || { n: 2, h: 12 };
  const ckOn = ck.n > 0;
  const ckHours = Array.from({ length: 8 }, (_, i) => i + 8).map((h) => `<option value="${h}" ${h === ck.h ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('');
  return `
    <header class="hello"><h1>Настройки</h1></header>

    <section class="card">
      <h2>Напоминание</h2>
      <div class="row">
        <div><div>Напоминать о записи</div><p>${f('По вашему времени', 'По твоему времени')}</p></div>
        <label class="switch"><input type="checkbox" id="remind-on" ${on ? 'checked' : ''} aria-label="Напоминания"><span></span></label>
      </div>
      <div class="row" ${on ? '' : 'hidden'} id="remind-row">
        <div>Время</div>
        <select id="remind-hour">${hours}</select>
      </div>
      <div class="row">
        <div><div>Утро: замечать хорошее</div><p>Маленькое приглашение на день</p></div>
        <label class="switch"><input type="checkbox" id="morning-on" ${mOn ? 'checked' : ''} aria-label="Утреннее сообщение"><span></span></label>
      </div>
      <div class="row" ${mOn ? '' : 'hidden'}>
        <div>Время</div>
        <select id="morning-hour">${mHours}</select>
      </div>
      <div class="row">
        <div><div>Вопрос днём</div><p>${f('Как вы сейчас — ответить можно одной кнопкой', 'Как ты сейчас — ответить можно одной кнопкой')}</p></div>
        <label class="switch"><input type="checkbox" id="checkin-on" ${ckOn ? 'checked' : ''} aria-label="Вопрос днём"><span></span></label>
      </div>
      <div class="row" ${ckOn ? '' : 'hidden'}>
        <div>Сколько раз</div>
        <select id="checkin-count">${[1, 2, 3].map((n) => `<option value="${n}" ${n === (ck.n || 2) ? 'selected' : ''}>${n === 1 ? 'Раз в день' : n === 2 ? 'Два раза' : 'Три раза'}</option>`).join('')}</select>
      </div>
      <div class="row" ${ckOn ? '' : 'hidden'}>
        <div>Первый вопрос</div>
        <select id="checkin-hour">${ckHours}</select>
      </div>
      <div class="row">
        <div><div>Минутка для себя</div><p>Короткая практика после тревожных или усталых записей</p></div>
        <label class="switch"><input type="checkbox" id="practices-on" ${state.pr !== false ? 'checked' : ''} aria-label="Минутка для себя"><span></span></label>
      </div>
      <button class="btn subtle" data-action="tz">Часовой пояс</button>
    </section>

    <section class="card">
      <h2>Аватар</h2>
      <p class="note" style="margin:0 0 12px">Он показывает настроение дня.</p>
      <div class="avatar-pick">
        ${AVATARS.map(([id, label]) => `<button class="avatar-opt${state.st === id ? ' is-active' : ''}" data-style="${id}"><img src="avatars/${id}/8-0.svg" alt=""><span>${label}</span></button>`).join('')}
        <button class="avatar-opt" disabled><span class="soon">✨</span><span>Своё — скоро</span></button>
      </div>
    </section>

    <section class="card">
      <h2>Данные</h2>
      <p class="note" style="margin:0 0 14px">Аудио не хранится: после распознавания голосовое удаляется. Эхо — инструмент саморефлексии, а не медицинская помощь.</p>
      <button class="btn ghost" data-action="delete">Удалить все мои данные</button>
    </section>`;
}

/** Пустой дневник: «Пока тихо» */
function emptyState() {
  return `<div class="empty-state view">${emblem()}<p>Пока тихо.<br>${f('Расскажите в чате голосом или текстом, как прошёл день, и здесь появится первое эхо.', 'Расскажи в чате голосом или текстом, как прошёл день, и здесь появится первое эхо.')}</p></div>`;
}

/** Карточка дня: по нажатию на цветок, котика или столбик графика */
function openDay(date) {
  const d = days().find((x) => x.date === date);
  if (!d?.dd) return;
  closeDay();
  const sheet = document.createElement('div');
  sheet.className = 'day-sheet';
  sheet.innerHTML = `
    <div class="day-sheet-card" role="dialog" aria-label="${esc(dayTitle(date))}">
      <div class="day-sheet-head">
        ${state.st ? `<img src="${avatarSrc(d.mood, d.em)}" alt="">` : ''}
        <div><h2>${esc(dayTitle(date))}</h2>${d.mood === null ? '' : `<p class="note" style="margin:0">Настроение ${fmt(d.mood)} из 10</p>`}</div>
      </div>
      ${d.dd.e.length ? `<div class="chips">${d.dd.e.map((x) => `<span class="chip accent">${esc(x)}</span>`).join('')}</div>` : ''}
      ${d.dd.q ? `<p class="day-quote">Прозвучало: «${esc(d.dd.q)}»</p>` : ''}
      <button class="btn" data-fullday="${date}">Вся запись</button>
      <button class="btn subtle" data-closeday>Закрыть</button>
    </div>`;
  document.body.appendChild(sheet);
  sheet.addEventListener('click', (ev) => {
    if (ev.target === sheet || ev.target.closest('[data-closeday]')) closeDay();
    const full = ev.target.closest('[data-fullday]')?.dataset.fullday;
    if (full) toChat(`day_${full.replace(/-/g, '')}`);
  });
}

function closeDay() {
  document.querySelector('.day-sheet')?.remove();
}

// ---------- отрисовка и события ----------

function render() {
  const views = { overview, recipe, feedback, more, settings };
  app.innerHTML = `<div class="view">${views[tab]()}</div>`;
  for (const b of tabsEl.querySelectorAll('.tab')) b.classList.toggle('is-active', b.dataset.tab === tab);
}

tabsEl.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.tab');
  if (!btn || btn.dataset.tab === tab) return;
  haptic('light');
  tab = btn.dataset.tab;
  render();
  window.scrollTo(0, 0);
});

app.addEventListener('click', (ev) => {
  const range = ev.target.closest('[data-range]');
  if (range) {
    chartRange = Number(range.dataset.range);
    haptic('light');
    render();
    return;
  }
  const sat = ev.target.closest('[data-pm]');
  if (sat) {
    pmSel = Number(sat.dataset.pm);
    haptic('light');
    // только подпись под картой — без перерисовки, чтобы волны не начинались заново
    document.getElementById('pm-quote').innerHTML = pmQuote(pmSel);
    return;
  }
  const day = ev.target.closest('[data-day]')?.dataset.day;
  if (day) {
    haptic('light');
    openDay(day);
    return;
  }
  const action = ev.target.closest('[data-action]')?.dataset.action;
  const practice = ev.target.closest('[data-practice]')?.dataset.practice;
  const style = ev.target.closest('[data-style]')?.dataset.style;
  if (style) {
    if (style === state.st) return;
    haptic('light');
    toChat(`style_${style}`);
    return;
  }
  if (ev.target.closest('[data-sos]')) {
    haptic('medium');
    location.href = `sos.html?a=${state.addr}`;
    return;
  }
  if (ev.target.closest('[data-read]')) {
    haptic('light');
    location.href = 'read.html';
    return;
  }
  if (ev.target.closest('[data-sounds]')) {
    haptic('light');
    location.href = 'sounds.html';
    return;
  }
  if (practice) {
    haptic('light');
    location.href = `practice.html?p=${practice}&a=${state.addr}&from=app`;
    return;
  }
  if (['record', 'feedback', 'delete', 'tz', 'letter', 'theme'].includes(action)) {
    toChat(action);
  }
});

// Время напоминания меняет бот: страница только передаёт выбор в чат
app.addEventListener('change', (ev) => {
  if (ev.target.id === 'morning-on' || ev.target.id === 'morning-hour') {
    const on = document.getElementById('morning-on').checked;
    toChat(on ? `morning_${document.getElementById('morning-hour').value}` : 'morning_off');
    return;
  }
  if (['checkin-on', 'checkin-count', 'checkin-hour'].includes(ev.target.id)) {
    const on = document.getElementById('checkin-on').checked;
    toChat(on ? `checkin_${document.getElementById('checkin-count').value}_${document.getElementById('checkin-hour').value}` : 'checkin_off');
    return;
  }
  if (ev.target.id === 'practices-on') {
    toChat(ev.target.checked ? 'practices_on' : 'practices_off');
    return;
  }
  if (ev.target.id !== 'remind-on' && ev.target.id !== 'remind-hour') return;
  const on = document.getElementById('remind-on').checked;
  toChat(on ? `time_${document.getElementById('remind-hour').value}` : 'time_off');
});

/** Старые клиенты Telegram бросают исключение на неподдерживаемых методах — не даём им сломать загрузку */
function safe(...calls) {
  for (const call of calls) {
    try { if (tg) call(); } catch { /* не поддерживается */ }
  }
}

/** Светлая или тёмная — как тема Telegram у человека (вне Telegram — как в системе; ?theme= для скриншотов) */
function applyTheme() {
  const forced = new URLSearchParams(location.search).get('theme');
  const light = forced ? forced === 'light' : tg?.colorScheme ? tg.colorScheme === 'light' : matchMedia('(prefers-color-scheme: light)').matches;
  document.documentElement.classList.toggle('light', light);
  const bg = light ? '#E6DFF7' : '#221E35';
  safe(() => tg.setHeaderColor(bg), () => tg.setBackgroundColor(bg), () => tg.setBottomBarColor(bg));
}

function start() {
  safe(() => tg.ready(), () => tg.expand(), () => tg.onEvent('themeChanged', applyTheme));
  applyTheme();
  try {
    state = decode(location.hash);
  } catch {
    state = null;
  }
  if (!state) {
    app.innerHTML = '<div class="error">Откройте Эхо кнопкой «Эхо» в чате с ботом.</div>';
    return;
  }
  tabsEl.hidden = false;
  render();
}

start();
