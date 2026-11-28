import { readFile, writeFile } from 'node:fs/promises';
import catalog from '../data/catalog.js';
import { canNavigate, placeMapUrl } from '../trip.js';
import { fields, placeType } from './place-types.mjs';

const { sources: sourceIndex, places: editorial } = JSON.parse(await readFile(new URL('../data/place-visits.json', import.meta.url), 'utf8'));
const formatDistance = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const formatDate = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeZone: 'UTC' });
const accessLabels = {
  booking: 'По предварительной записи', schedule: 'По расписанию', outdoor: 'На открытом воздухе',
  restricted: 'Особые правила доступа', verify: 'Условия посещения уточняются',
};

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const icon = (id) => `<svg class="icon" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const external = (url, label, className = '') => `<a href="${escape(url)}"${className ? ` class="${className}"` : ''} target="_blank" rel="noopener noreferrer">${escape(label)}</a>`;
const row = (label, value) => `<div><dt>${escape(label)}</dt><dd>${value}</dd></div>`;
const evidenceLink = (id) => `<a class="place-fact-source" href="#evidence-${id}">Источник</a>`;
const factRow = (id, { text, source }) => row(fields[id], `${escape(text)} ${evidenceLink(source)}`);

function validWebUrl(value) {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
}

function validateEditorial(place, edit, profile) {
  const { sources = {}, facts = {}, questions = [], action } = edit;
  for (const [id, source] of Object.entries(sources)) {
    if (!/^[a-z0-9-]+$/.test(id) || !source.label || !validWebUrl(source.url) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(source.checked) || Number.isNaN(Date.parse(source.checked))) {
      throw new Error(`${place.id}: invalid source ${id}`);
    }
  }
  for (const [id, fact] of Object.entries(facts)) {
    if (!fields[id] || (!profile.priorities.includes(id) && !['location', 'format', 'contacts'].includes(id)) ||
        !fact.text?.trim() || !Object.hasOwn(sources, fact.source)) {
      throw new Error(`${place.id}: invalid fact ${id}`);
    }
  }
  for (const item of questions) {
    if (!item.question?.trim() || !item.answer?.trim() || !Object.hasOwn(sources, item.source)) {
      throw new Error(`${place.id}: invalid question`);
    }
  }
  if (action && (!action.label?.trim() || !Object.hasOwn(sources, action.source))) {
    throw new Error(`${place.id}: invalid visit link`);
  }
}

function marked(html, name, body, fallback) {
  const pattern = new RegExp(`<!-- ${name}:start -->[\\s\\S]*?<!-- ${name}:end -->`);
  const replacement = `<!-- ${name}:start -->\n${body}\n<!-- ${name}:end -->`;
  if (pattern.test(html)) return html.replace(pattern, () => replacement);
  if (!fallback?.test(html)) throw new Error(`Missing insertion point: ${name}`);
  return html.replace(fallback, match => `${replacement}\n${match}`);
}

function migrateLayout(html, id) {
  if (html.includes('<!-- place-visit:start -->')) return html;

  const legacy = /<aside class="guide-aside" aria-labelledby="visit-h">([\s\S]*?)<\/aside>/;
  const aside = html.match(legacy)?.[1];
  if (!aside) throw new Error(`${id}: missing visit sidebar`);

  const checked = aside.match(/<div class="visit-verified">[\s\S]*?(?=<div class="guide-actions">)/)?.[0].trim();
  const advice = aside.match(/<details class="visit-more" open><summary>Перед поездкой<\/summary>([\s\S]*?)<\/details>/)?.[1];
  if (!advice) throw new Error(`${id}: missing visit advice`);
  const plan = `<section class="guide-section place-plan" aria-labelledby="planning-h">
<h2 id="planning-h">Перед поездкой</h2>${advice.trim()}
${checked || ''}
</section>`;

  return html
    .replace('<article class="guide-article"', '<article class="guide-article place-page"')
    .replace('<div class="guide-heading">', '<div class="guide-heading place-heading">')
    .replace(/<nav class="place-jumps"[\s\S]*?<\/nav>\n/, '')
    .replace('<div class="guide-detail-grid">', '<div class="guide-detail-grid place-detail-grid">')
    .replace(legacy, '<!-- place-visit:start --><!-- place-visit:end -->')
    .replace('<div class="guide-main">', '<div class="guide-main place-content">')
    .replace(/(<section class="guide-section" aria-labelledby="highlights-h">[\s\S]*?<\/section>)/,
      (_, highlights) => `${highlights}\n${plan}`)
    .replace('href="/guide.css"', 'href="/guide.css?v=places-1"')
    .replace('src="/guide-actions.js"', 'src="/guide-actions.js?v=places-1"');
}

function visitCard(place, profile, edit, quickFacts) {
  const { facts = {}, sources = {}, action } = edit;
  const exact = canNavigate(place);
  const restricted = place.access === 'restricted';
  const approximate = place.precision === 'locality';
  const address = place.address || place.locality;
  const location = [...new Set([place.locality, place.area, place.region])].join(' · ');
  const distance = place.distanceKm < 1 ? 'Менее 1 км' : `${approximate ? '≈ ' : ''}${formatDistance.format(place.distanceKm)} км`;
  const access = place.access === 'outdoor' && place.category === 'history' ? 'Осмотр снаружи' : accessLabels[place.access];
  const addressLabel = !place.address ? 'Населённый пункт' : exact ? 'Адрес' : 'Адрес или ориентир';
  const precisionNote = restricted ? 'Карта показывает общий ориентир. Точку входа сверяйте с правилами посещения.' :
    approximate ? 'Метка на карте указывает населённый пункт. Точный вход уточняйте перед поездкой.' :
    'Вход или подъезд требует уточнения.';
  const mapLabel = exact ? 'На карте' : (approximate || restricted) ? 'Ориентир на карте' : 'Поиск на карте';
  const reservationsFirst = action && (place.category === 'stay' || ['MovieTheater', 'PerformingArtsTheater'].includes(profile.schema));
  const mapFirst = exact && !reservationsFirst;
  const map = external(placeMapUrl(place), mapLabel, mapFirst ? 'button primary' : 'button outline');
  const website = action ? external(sources[action.source].url, action.label, mapFirst ? 'button outline' : 'button primary') :
    place.official && validWebUrl(place.official) ? external(place.official, profile.sourceLabel, 'button outline') : '';
  const buttons = mapFirst ? [map, website] : [website, map];

  return `<aside class="guide-aside place-visit" aria-labelledby="visit-h">
<h2 id="visit-h">${escape(profile.visit)}</h2>
<p class="place-access${restricted || place.access === 'verify' ? ' caution' : ''}">${escape(access)}</p>
<dl class="place-key-details">
${row(addressLabel, escape(address))}
</dl>
<div class="guide-actions place-visit-actions">${buttons.join('')}
<button class="button outline" data-guide-trip="${place.id}" type="button" aria-pressed="false" hidden>${icon('route')}<span>В маршрут</span></button>
<button class="button outline guide-save" data-guide-save="${place.id}" type="button" aria-pressed="false" aria-label="В избранное" title="В избранное" hidden>${icon('bookmark')}</button>
<button class="button outline guide-save" data-guide-share type="button" aria-label="Поделиться карточкой" title="Поделиться карточкой" hidden>${icon('share')}</button>
</div>
${exact ? '' : `<p class="place-location-note">${escape(precisionNote)}</p>`}
${quickFacts.length ? `<dl class="place-key-details place-quick-facts">${quickFacts.map(id => factRow(id, facts[id])).join('\n')}</dl>` : ''}
<a class="place-plan-link" href="#planning-h">Подробности поездки</a>
<details class="place-address-details"><summary>Район и расстояние</summary><p>${escape(location)}</p>${approximate && place.locality === 'Борисоглебск' ? '' : `<p>От Борисоглебска ${escape(distance.toLowerCase())} по прямой.</p>`}</details>
</aside>`;
}

function editorialDetails(profile, edit, remainingFacts) {
  const { facts = {}, questions = [], sources = {} } = edit;
  const factsHtml = remainingFacts.length ? `<dl class="place-verified-facts">${remainingFacts.map(id => factRow(id, facts[id])).join('\n')}</dl>` : '';
  const toConfirm = profile.checks.filter(([id]) => !Object.hasOwn(facts, id)).map(([, question]) => question);
  const checksHtml = toConfirm.length ? `<details class="place-questions"><summary>Что уточнить перед поездкой</summary>
<ul>${toConfirm.map(question => `<li>${escape(question)}</li>`).join('')}</ul></details>` : '';
  const faq = questions.length ? `<div class="place-questions-list"><h3>Частые вопросы</h3>
${questions.map(({ question, answer, source }) => `<details class="place-questions"><summary>${escape(question)}</summary><p>${escape(answer)} ${evidenceLink(source)}</p></details>`).join('\n')}
</div>` : '';
  const cited = Object.entries(sources);
  const links = cited.length ? `<ul class="place-cited-sources">${cited.map(([id, { label, url, checked }]) =>
    `<li id="evidence-${id}">${external(url, label)} <small>Сверено <time datetime="${checked}">${escape(formatDate.format(new Date(checked)))}</time></small></li>`).join('\n')}</ul>` : '';
  return { factsHtml, faq, checksHtml, links };
}

function withSchema(html, profile, place) {
  return html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/,
    (_, start, json, end) => {
      const data = JSON.parse(json);
      const node = data['@graph'][0];
      node['@type'] = profile.schema;
      if (place.cover) node.image = new URL(place.cover.src, node.url).href;
      else delete node.image;
      return start + JSON.stringify(data).replaceAll('<', '\\u003c') + end;
    });
}

function withCover(html, cover) {
  if (!cover || html.includes('id="place-photo"')) return html;
  const original = /<figure class="guide-figure">[\s\S]*?<\/figure>/;
  if (!original.test(html)) throw new Error(`No cover to replace: ${cover.asset}`);
  const figure = `<figure class="guide-figure guide-photo" id="place-photo">
<a href="${escape(cover.src)}" aria-label="Открыть снимок «${escape(cover.caption)}»">
<img src="${escape(cover.src)}" srcset="${escape(cover.thumb)} ${cover.thumbWidth}w, ${escape(cover.src)} ${cover.width}w" sizes="(max-width: 860px) calc(100vw - 32px), 60vw" width="${cover.width}" height="${cover.height}" fetchpriority="high" decoding="async" alt="${escape(cover.alt)}"></a>
<figcaption><span class="photo-title">${escape(cover.caption)} · ${cover.year}</span>
<span>Фото ${escape(cover.author)} · ${external(cover.source, 'Оригинал')} · ${external(cover.licenseUrl, cover.license)} · Размер изменён</span></figcaption>
</figure>`;
  return html.replace(original, () => figure)
    .replace(/(<meta property="og:image" content=")[^"]+(">)/, (_, start, end) => {
      const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      return start + escape(new URL(cover.src, canonical).href) + end;
    })
    .replace(/(<meta property="og:image:alt" content=")[^"]*(">)/, (_, start, end) => start + escape(cover.alt) + end);
}

function renderCard(source, place, edit, profile) {
  const facts = Object.keys(edit.facts ?? {});
  const factOrder = [...new Set([...profile.priorities, 'format', 'location', 'contacts'])];
  const quickFacts = factOrder.filter(id => facts.includes(id) && edit.facts[id].text.length <= 145).slice(0, 2);
  const remainingFacts = factOrder.filter(id => facts.includes(id) && !quickFacts.includes(id));
  const { factsHtml, faq, checksHtml, links } = editorialDetails(profile, edit, remainingFacts);
  let html = withCover(migrateLayout(source, place.id), place.cover);
  html = html.replace(/<p class="guide-kicker">[\s\S]*?<\/p>/,
    () => `<p class="guide-kicker">${icon(place.category)}<span>${escape(profile.label)} · ${escape(place.locality)}</span></p>`);
  html = html.replace(/(<h2 id="story-h">).*?(<\/h2>)/, `$1${escape(profile.story)}$2`);
  html = html.replace(/(<h2 id="highlights-h">).*?(<\/h2>)/, `$1${escape(profile.highlights)}$2`);

  html = marked(html, 'place-visit', visitCard(place, profile, edit, quickFacts));
  const photo = html.includes('id="place-photo"') ? '<a href="#place-photo">Фото</a>' : '';
  const navigation = `<nav class="place-sections" aria-label="Разделы карточки"><a href="#highlights-h">${escape(profile.highlights)}</a><a href="#planning-h">Перед поездкой</a>${photo}<a href="#sources-h">Источники</a></nav>`;
  html = marked(html, 'place-sections', navigation, /<section class="guide-section" aria-labelledby="story-h">/);

  const factMarker = '<h2 id="planning-h">Перед поездкой</h2>';
  if (!html.includes('<!-- place-facts:start -->')) {
    html = html.replace(factMarker, `${factMarker}\n<!-- place-facts:start --><!-- place-facts:end -->`);
  }
  html = marked(html, 'place-facts', factsHtml);
  html = marked(html, 'place-questions', faq + checksHtml, /<section class="guide-section" aria-labelledby="sources-h">/);

  const sourceMarker = '<h2 id="sources-h">Источники и ссылки</h2>';
  if (!html.includes('<!-- place-citations:start -->')) {
    html = html.replace(sourceMarker, `${sourceMarker}\n<!-- place-citations:start --><!-- place-citations:end -->`);
  }
  html = marked(html, 'place-citations', links);
  const editLink = `<p class="place-editor-link"><a href="/pomoch/?place=${place.id}">Предложить уточнение</a></p>`;
  html = marked(html, 'place-editor-link', editLink, /<ul class="guide-tags">/);
  return withSchema(html, profile, place);
}

const cardIds = new Set(catalog.places.map(place => place.id));
for (const id of Object.keys(editorial)) {
  if (!cardIds.has(id)) throw new Error(`Unknown place ${id}`);
}

const changes = [];
for (const place of catalog.places) {
  const profile = placeType(place);
  const draft = editorial[place.id] ?? {};
  const sourceIds = new Set([
    ...Object.values(draft.facts ?? {}).map(fact => fact.source),
    ...(draft.questions ?? []).map(question => question.source),
    ...(draft.action ? [draft.action.source] : []),
  ]);
  const sources = Object.fromEntries([...sourceIds].map(id => {
    if (!Object.hasOwn(sourceIndex, id)) throw new Error(`${place.id}: unknown source ${id}`);
    return [id, sourceIndex[id]];
  }));
  const edit = { ...draft, sources };
  validateEditorial(place, edit, profile);
  const path = new URL(`../mesta/${place.id}/index.html`, import.meta.url);
  const before = await readFile(path, 'utf8');
  const after = renderCard(before, place, edit, profile);
  if (before !== after) changes.push([path, after]);
}
for (const [path, html] of changes) await writeFile(path, html);
console.log(`Карточек проверено: ${cardIds.size}. Обновлено: ${changes.length}.`);
