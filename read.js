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

/** В конце каждой статьи: мнение автора и куда обратиться, если очень тяжело */
const FOOTER = `
  <p class="note">Статья выражает мнение автора и не заменяет консультацию специалиста.</p>
  <p class="note">Если сейчас очень тяжело, можно поговорить с живым человеком, это анонимно:<br>
  📞 <a href="tel:+74959895050">8 (495) 989-50-50</a> — экстренная психологическая помощь МЧС, круглосуточно<br>
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
  const bg = light ? '#E6DFF7' : '#221E35';
  safe(() => tg.setHeaderColor(bg), () => tg.setBackgroundColor(bg), () => tg.setBottomBarColor(bg));
}

/** Фото автора или первая буква имени в круге */
function avatar(author, cls = 'author-photo') {
  return author.photo
    ? `<img class="${cls}" src="authors/${esc(author.photo)}" alt="">`
    : `<span class="${cls}">${esc(author.name[0])}</span>`;
}

function authorChip(id, author) {
  return `<a class="author-chip" href="read.html?author=${encodeURIComponent(id)}">${avatar(author, 'author-photo small')}<span><b>${esc(author.name)}</b>${esc(author.role)}</span></a>`;
}

function articleCard(a, lib) {
  return `
    <a class="card article-card" href="read.html?a=${encodeURIComponent(a.id)}">
      <h2>${esc(a.title)}</h2>
      <p>${esc(a.lead)}</p>
      <p class="note">${esc(lib.authors[a.author].name)} · ${a.min} мин</p>
    </a>`;
}

function list(lib) {
  return `
    <header class="hello"><h1>Почитать</h1><p>Короткие статьи психологов о том, как бережно относиться к себе</p></header>
    ${lib.articles.length ? lib.articles.map((a) => articleCard(a, lib)).join('') : '<section class="card"><p>Скоро здесь появятся первые статьи.</p></section>'}`;
}

function article(lib, id) {
  const a = lib.articles.find((x) => x.id === id);
  if (!a) return list(lib);
  return `
    <article class="article">
      <h1>${esc(a.title)}</h1>
      <p class="note">${dateText(a.date)} · ${a.min} мин</p>
      ${authorChip(a.author, lib.authors[a.author])}
      <div class="article-body">${a.html}</div>
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
      ${avatar(au)}
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
  const contact = document.getElementById('contact');
  if (contact) contact.onclick = () => openExternal(lib.authors[author].link);
  // ссылки внутри статьи — во внешнем браузере, чтобы не уводить из «Эхо»
  app.addEventListener('click', (ev) => {
    const link = ev.target.closest('.article-body a');
    if (!link) return;
    ev.preventDefault();
    openExternal(link.href);
  });
}

start();
