'use strict';

/*
 * «Почитать»: статьи психологов-партнёров (articles.json собирает бот из bot/content).
 * read.html — список, ?a=<статья> — статья, ?author=<автор> — страница автора.
 * Данных человека здесь нет. Тексты статей уже очищены от HTML при сборке.
 */

const tg = window.Telegram?.WebApp;
const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const version = (document.currentScript?.src.split('?')[1]) || '';
/** Бот — чтобы отзыв о статье вернулся в чат */
const BOT = params.get('b') || '';
const keep = () => `${version ? `&${version}` : ''}${BOT ? `&b=${encodeURIComponent(BOT)}` : ''}`;

/** В конце каждой статьи: мнение автора и куда обратиться, если очень тяжело */
const FOOTER = `
  <p class="note">Статья выражает мнение автора и не заменяет консультацию специалиста.</p>
  <p class="note">Если сейчас очень тяжело, можно поговорить с живым человеком, это анонимно:<br>
  📞 <a href="tel:88003334434">8 (800) 333-44-34</a> — кризисная линия доверия, бесплатно по России<br>
  📞 <a href="tel:112">112</a> — если есть угроза жизни</p>`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const dateText = (d) => (d ? `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}` : '');

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

/** Фото автора или первая буква имени в круге */
function avatar(author, cls = 'author-photo', id = '') {
  // У редакции Эхо вместо фото — эмблема
  if (!author.photo && id === 'echo' && window.echoEmblem) return window.echoEmblem(`${cls} emblem-avatar`);
  return author.photo
    ? `<img class="${cls}" src="authors/${esc(author.photo)}" alt="">`
    : `<span class="${cls}">${esc(author.name[0])}</span>`;
}

function authorChip(id, author) {
  return `<a class="author-chip" href="read.html?author=${encodeURIComponent(id)}${keep()}">${avatar(author, 'author-photo small', id)}<span><b>${esc(author.name)}</b>${esc(author.role)}</span></a>`;
}

/** Прочитанные статьи — только на устройстве (localStorage), на сервер не уходят */
const READ_KEY = 'echo_read_articles';
function readIds() {
  try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]')); } catch { return new Set(); }
}
function markRead(id) {
  const ids = readIds();
  if (ids.has(id)) return;
  ids.add(id);
  try { localStorage.setItem(READ_KEY, JSON.stringify([...ids])); } catch { /* хранилище недоступно */ }
}

/** Статья только из платных дней курса — «Эхо+»; закрыта, лишь когда закончится тест (plusLocked) */
const locked = (a, lib) => Boolean(lib.plusLocked && a.plus);

function articleCard(a, lib, read = false) {
  return `
    <a class="card article-card${read ? ' read' : ''}" href="read.html?a=${encodeURIComponent(a.id)}${keep()}">
      <h2>${esc(a.title)}</h2>
      <p>${esc(a.lead)}</p>
      <p class="note">${esc(lib.authors[a.author].name)} · ${a.min} мин${locked(a, lib) ? ' · ✨ Эхо+' : ''}${read ? ' · ✓ прочитано' : ''}</p>
    </a>`;
}

/** Две вкладки «Почитать» (31.10.2026): психологи — первыми, «Редакция Эхо» — рядом */
const EDITORIAL = 'echo';
const TABS = [['psy', 'Психологи'], ['echo', 'Редакция Эхо']];
const tabOf = (a) => (a.author === EDITORIAL ? 'echo' : 'psy');

function tabsBar(current) {
  return `<div class="seg read-tabs" role="tablist">${TABS.map(([id, label]) => `<a role="tab" class="${current === id ? 'is-active' : ''}" href="read.html?t=${id}${keep()}">${label}</a>`).join('')}</div>`;
}

/** Разделы для быстрого поиска по темам — когда их хотя бы два */
function sections(articles, current, tab) {
  const names = [...new Set(articles.map((a) => a.section))];
  if (names.length < 2) return '';
  const chip = (name, label) => `<a class="chip${current === name ? ' accent' : ''}" href="read.html?t=${tab}${name ? `&s=${encodeURIComponent(name)}` : ''}${keep()}">${esc(label)}</a>`;
  return `<div class="chips read-sections">${chip('', 'Все')}${names.map((n) => chip(n, n)).join('')}</div>`;
}

function list(lib) {
  const tab = params.get('t') === 'echo' ? 'echo' : 'psy';
  const current = params.get('s') || '';
  const inTab = lib.articles.filter((a) => tabOf(a) === tab);
  const shown = current ? inTab.filter((a) => a.section === current) : inTab;
  // Прочитанные прячутся вниз, под кнопку — их всегда можно найти
  const done = readIds();
  const fresh = shown.filter((a) => !done.has(a.id));
  const read = shown.filter((a) => done.has(a.id));
  const empty = shown.length
    ? '<section class="card"><p>Всё прочитано 🌿 Новые статьи скоро появятся.</p></section>'
    : tab === 'psy'
      ? '<section class="card"><p>Скоро здесь появятся статьи психологов. А пока можно почитать «Редакцию Эхо».</p></section>'
      : '<section class="card"><p>Скоро здесь появятся первые статьи.</p></section>';
  return `
    <header class="hello"><h1>Почитать</h1><p>Короткие статьи о том, как бережно относиться к себе</p></header>
    ${tabsBar(tab)}
    ${sections(inTab, current, tab)}
    ${fresh.length ? fresh.map((a) => articleCard(a, lib)).join('') : empty}
    ${read.length ? `<button class="btn subtle" data-read-toggle>📚 Прочитанные (${read.length})</button>
    <div class="read-list" hidden>${read.map((a) => articleCard(a, lib, true)).join('')}</div>` : ''}
    ${BOT ? '<button class="btn subtle" data-suggest>💡 О чём хотелось бы прочитать?</button>' : ''}`;
}

function article(lib, id) {
  const a = lib.articles.find((x) => x.id === id);
  if (!a) return list(lib);
  // TODO: integrate признак подписки в ссылке на «Почитать», когда появится оплата Эхо+
  if (locked(a, lib)) {
    return `
    <article class="article">
      <h1>${esc(a.title)}</h1>
      <p>${esc(a.lead)}</p>
      <section class="card"><p>✨ Эта статья — часть курса «Мягче к себе» и входит в «Эхо+».</p></section>
    </article>`;
  }
  return `
    <article class="article">
      <h1>${esc(a.title)}</h1>
      <p class="note">${dateText(a.date)} · ${a.min} мин</p>
      ${authorChip(a.author, lib.authors[a.author])}
      <div class="article-body">${a.html}</div>
      ${BOT ? `<section class="article-feedback">
        <p>Было полезно?</p>
        <button class="btn" data-af="yes">Да</button>
        <button class="btn subtle" data-af="no">Не очень</button>
      </section>` : ''}
      <hr>
      ${FOOTER}
    </article>`;
}

function authorPage(lib, id) {
  const au = lib.authors[id];
  if (!au) return list(lib);
  const own = lib.articles.filter((a) => a.author === id);
  return `
    <section class="author">
      ${avatar(au, 'author-photo', id)}
      <h1>${esc(au.name)}</h1>
      <p class="note">${esc(au.role)}</p>
      <p>${esc(au.about)}</p>
      ${au.link ? `<button class="btn" id="contact">${esc(au.linkText || 'Записаться на консультацию')}</button>` : ''}
    </section>
    ${own.length ? `<h2 class="section-title">Статьи автора</h2>${own.map((a) => articleCard(a, lib)).join('')}` : ''}`;
}

function openExternal(url) {
  if (!tg) return window.open(url, '_blank');
  if (/^https:\/\/t\.me\//.test(url)) safe(() => tg.openTelegramLink(url));
  else safe(() => tg.openLink(url));
}

async function start() {
  safe(() => tg.ready(), () => tg.expand(), () => tg.onEvent('themeChanged', applyTheme));
  safe(() => tg.BackButton.show(), () => tg.BackButton.onClick(() => history.back()));
  applyTheme();
  let lib;
  try {
    lib = await (await fetch(`articles.json${version ? `?${version}` : ''}`)).json();
  } catch {
    app.innerHTML = '<section class="card"><p>Не получилось загрузить статьи. Попробуйте открыть ещё раз.</p></section>';
    return;
  }
  const id = params.get('a'), author = params.get('author');
  app.innerHTML = `<div class="view">${id ? article(lib, id) : author ? authorPage(lib, author) : list(lib)}</div>`;
  // Дочитал до конца — статья уходит в «Прочитанные»
  const end = app.querySelector('.article hr');
  if (id && end && 'IntersectionObserver' in window) {
    const seen = new IntersectionObserver((items) => {
      if (items.some((i) => i.isIntersecting)) { markRead(id); seen.disconnect(); }
    });
    seen.observe(end);
  }
  const contact = document.getElementById('contact');
  if (contact) contact.onclick = () => openExternal(lib.authors[author].link);
  // ссылки внутри статьи — во внешнем браузере, чтобы не уводить из «Эхо»
  app.addEventListener('click', (ev) => {
    const toggle = ev.target.closest('[data-read-toggle]');
    if (toggle) {
      const box = app.querySelector('.read-list');
      box.hidden = !box.hidden;
      toggle.textContent = box.hidden ? `📚 Прочитанные (${box.children.length})` : 'Скрыть прочитанные';
      return;
    }
    if (ev.target.closest('[data-suggest]')) {
      const link = `https://t.me/${BOT}?start=suggest`;
      if (tg) safe(() => tg.openTelegramLink(link), () => tg.close());
      else location.href = link;
      return;
    }
    const af = ev.target.closest('[data-af]')?.dataset.af;
    if (af && id) {
      markRead(id);
      // Отзыв о статье — в чат (и в статистику)
      const link = `https://t.me/${BOT}?start=af_${id}_${af}`;
      if (tg) safe(() => tg.openTelegramLink(link), () => tg.close());
      else location.href = link;
      return;
    }
    const link = ev.target.closest('.article-body a');
    if (!link) return;
    ev.preventDefault();
    openExternal(link.href);
  });
}

start();
