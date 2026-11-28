import catalog from './data/catalog.js?v=places-1';
import { createMap } from './map.js';
import { bookmarkKey, canNavigate, createTrip, navigationLabel, placeMapUrl, readIds, readSharedTrip, routeInYandex, stopKey } from './trip.js';
import { createTripView } from './trip-view.js';
import { requestRoadPath, routeRequest } from './routing.js';

const $ = id => document.getElementById(id);
const icon = name => '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
const categories = {
  all: { label: 'Все места', icon: 'compass' },
  nature: { label: 'Природа', icon: 'nature' },
  museums: { label: 'Музеи', icon: 'museums' },
  history: { label: 'История', icon: 'history' },
  culture: { label: 'Культура', icon: 'culture' },
  leisure: { label: 'Досуг', icon: 'leisure' },
  stay: { label: 'Ночлег', icon: 'stay' }
};
const accessLabels = {
  outdoor: 'Под открытым небом', schedule: 'По расписанию', booking: 'По записи',
  restricted: 'Особый режим', verify: 'Доступ уточнить'
};
const regionOrder = ['Воронежская область', 'Тамбовская область', 'Саратовская область', 'Волгоградская область'];
const collator = new Intl.Collator('ru');
const kmFormat = new Intl.NumberFormat('ru', { maximumFractionDigits: 1 });
const pageSize = 12;
const filterDefaults = { region: '', locality: '', radius: '100', access: '', lodging: '', navigable: false, 'has-photo': false };
const filterParams = { region: 'region', locality: 'town', radius: 'radius', access: 'access', lodging: 'lodging' };
const checkboxFilters = { navigable: 'nav', 'has-photo': 'photo' };
const appearance = new Map(catalog.featured.map((id, index) => [id, index]));

const state = { category: 'all', savedOnly: false, tripOnly: false, view: 'list', limit: pageSize };
const filterDialog = $('filter-dialog');
let appliedFilters = { ...filterDefaults };
let shownFilters;
let road = null;
let roadRun = 0;
const trip = createTrip(catalog.places, () => localStorage);
let saved;
try {
  const ids = JSON.parse(localStorage.getItem(bookmarkKey) || '[]');
  saved = new Set(Array.isArray(ids) ? ids : []);
} catch {
  saved = new Set();
}
const placeById = new Map(catalog.places.map(place => [place.id, place]));
const routeById = new Map(catalog.routes.map(route => [route.id, route]));
for (const id of saved) if (!placeById.has(id)) saved.delete(id);

function html(value) {
  return String(value ?? '').replace(/[&<>"']/g, match => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[match]);
}

function normalize(value) {
  return String(value || '').toLocaleLowerCase('ru').replaceAll('ё', 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function plural(n, forms) {
  const teen = n % 100;
  const unit = n % 10;
  return forms[teen >= 11 && teen <= 14 ? 2 : unit === 1 ? 0 : unit >= 2 && unit <= 4 ? 1 : 2];
}

function distance(place) {
  if (place.locality === 'Борисоглебск' && place.precision === 'locality') return 'В городе';
  if (place.distanceKm < 1) return 'Менее 1 км';
  return (place.precision === 'locality' ? '≈ ' : '') + kmFormat.format(place.distanceKm) + ' км';
}

function detailUrl(kind, id) {
  const url = new URL(location.href);
  url.searchParams.delete('place');
  url.searchParams.delete('route');
  url.searchParams.set(kind, id);
  return url.pathname + url.search;
}

function localityKey(place) {
  const name = normalize(place.locality.replace(/^(г\.|р\.\s*п\.|с\.|д\.|п\.)\s*/u, ''));
  return [place.region, place.area, name].join('|');
}

const localities = new Map();
for (const place of catalog.places) {
  const id = localityKey(place);
  if (!localities.has(id)) localities.set(id, { id, name: place.locality, area: place.area, region: place.region, places: [] });
  localities.get(id).places.push(place);
}

function fillLocalities() {
  const select = $('locality');
  const previous = select.value;
  const region = $('region').value;
  select.replaceChildren(new Option('Все населённые пункты', ''));
  const groups = [...localities.values()].sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.area, b.area));
  for (const label of region ? [region] : regionOrder) {
    const column = document.createElement('optgroup');
    column.label = label;
    const items = groups.filter(group => group.region === label);
    for (const group of items) {
      const duplicate = items.some(other => other.name === group.name && other !== group);
      const name = duplicate ? group.name + ' · ' + group.area : group.name;
      column.append(new Option(name + ' · ' + group.places.length, group.id, false, group.id === previous));
    }
    if (column.children.length) select.append(column);
  }
}

function readFilterFields() {
  const selection = {};
  for (const id of Object.keys(filterParams)) selection[id] = $(id).value;
  for (const id of Object.keys(checkboxFilters)) selection[id] = $(id).checked;
  return selection;
}

function writeFilterFields(selection) {
  $('region').value = selection.region;
  fillLocalities();
  for (const id of Object.keys(filterParams)) $(id).value = selection[id];
  for (const id of Object.keys(checkboxFilters)) $(id).checked = selection[id];
}

function selectValue(id, value, fallback) {
  return [...$(id).options].some(option => option.value === value) ? value : fallback;
}

function readFilterUrl() {
  const params = new URLSearchParams(location.search);
  if (Object.hasOwn(categories, params.get('cat'))) state.category = params.get('cat');
  state.view = params.get('view') === 'map' ? 'map' : 'list';
  const nearby = placeById.get(params.get('near'));
  $('region').value = nearby?.region || selectValue('region', params.get('region'), filterDefaults.region);
  fillLocalities();
  for (const id of ['locality', 'radius', 'access', 'lodging']) {
    const value = id === 'locality' && nearby ? localityKey(nearby) : params.get(filterParams[id]);
    $(id).value = selectValue(id, value, filterDefaults[id]);
  }
  if (state.category !== 'stay') $('lodging').value = '';
  for (const [id, param] of Object.entries(checkboxFilters)) $(id).checked = params.get(param) === '1';
  appliedFilters = readFilterFields();
  $('query').value = (params.get('q') || '').slice(0, 120);
  $('hero-search').value = $('query').value;
  $('sort').value = selectValue('sort', params.get('sort'), 'featured');
}

function filterUrl() {
  const url = new URL(location.href);
  url.searchParams.delete('near');
  for (const [key, value] of [
    ...Object.entries(filterParams).map(([id, param]) => [param, appliedFilters[id] === filterDefaults[id] ? '' : appliedFilters[id]]),
    ...Object.entries(checkboxFilters).map(([id, param]) => [param, appliedFilters[id] ? '1' : '']),
    ['q', $('query').value.trim()],
    ['sort', $('sort').value === 'featured' ? '' : $('sort').value],
    ['cat', state.category === 'all' ? '' : state.category],
    ['view', state.view === 'map' && !state.tripOnly ? 'map' : '']
  ]) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  return url;
}

function syncFilterUrl() {
  const url = filterUrl();
  if (url.href === location.href) return;
  history.replaceState(history.state, '', url);
  $('catalog-share-fallback').hidden = true;
}

function nearPlaces(place) {
  return (localities.get(localityKey(place))?.places || []).filter(other => other.id !== place.id).sort((a, b) =>
    Number(a.category === 'stay') - Number(b.category === 'stay') ||
    (appearance.get(a.id) ?? 1000) - (appearance.get(b.id) ?? 1000) || collator.compare(a.name, b.name)).slice(0, 3);
}

function tripButton(place, compact = false) {
  const chosen = trip.has(place.id);
  const label = chosen ? 'Убрать из маршрута' : 'Добавить в маршрут';
  return '<button class="' + (compact ? 'card-add' : 'button primary') + '" type="button" data-plan-toggle="' + place.id +
    '" aria-pressed="' + chosen + '" aria-label="' + label + '" title="' + label + '">' + icon('route') +
    (compact ? '' : '<span>' + (chosen ? 'В маршруте' : 'В маршрут') + '</span>') + '</button>';
}

function bookmark(place, className) {
  const marked = saved.has(place.id);
  return '<button class="' + className + '" type="button" data-save="' + place.id + '" aria-pressed="' + marked +
    '" aria-label="' + (marked ? 'Убрать из избранного' : 'Сохранить в избранное') + '" title="' +
    (marked ? 'Убрать из избранного' : 'Сохранить в избранное') + '">' +
    icon('bookmark') + (className.includes('button ') ? '<span>' + (marked ? 'Сохранено' : 'Сохранить') + '</span>' : '') + '</button>';
}

function linkPlace(place, label, className = '') {
  return '<a class="' + className + '" href="' + html(place.path || detailUrl('place', place.id)) + '">' + label + '</a>';
}

function placeImage(place, loading = 'lazy') {
  const cover = place.cover;
  if (!cover) {
    return '<img src="/media/places/' + place.id + '.webp" loading="' + loading + '" decoding="async" width="880" height="400" alt="' +
      html('Тематическая иллюстрация и схема расположения: ' + place.visual) + '">';
  }
  const src = loading === 'eager' ? cover.src : cover.thumb;
  return '<img src="' + html(src) + '" loading="' + loading + '" decoding="async" width="' + cover.width +
    '" height="' + cover.height + '" alt="' + html(cover.alt) + '">';
}

function photoCredit(cover, className) {
  if (!cover) return '';
  return '<div class="' + className + '">Фото ' + html(cover.author) +
    ' · <a href="' + html(cover.source) + '" title="' + html(cover.title) + '" target="_blank" rel="noopener noreferrer">Источник</a>' +
    ' · <a href="' + html(cover.licenseUrl) + '" target="_blank" rel="noopener noreferrer">' + html(cover.license) + '</a></div>';
}

function tinyCategory(place) {
  const label = catalog.lodgingTypes[place.lodgingType] || categories[place.category].label;
  return '<div class="card-category">' + icon(place.category) + html(label) + '</div>';
}

function addressLine(place) {
  return '<div class="card-address">' + icon('pin') + '<span>' + html(place.locality) + ' · ' + html(distance(place)) + '</span></div>';
}

function positionTag(place) {
  const style = canNavigate(place) ? 'ready' : 'caution';
  return '<span class="position-tag ' + style + '">' + navigationLabel(place) + '</span>';
}

function card(place) {
  return '<article class="place-card" style="--tone:var(--' + place.category + ')">' +
    '<div class="card-media">' + linkPlace(place, placeImage(place)) +
    '<span class="card-photo-caption">' + (place.cover ? 'Фото' : 'Иллюстрация') + '</span><div class="card-tools">' +
    tripButton(place, true) + bookmark(place, 'card-bookmark') + '</div></div>' + photoCredit(place.cover, 'card-photo-credit') +
    '<div class="card-body">' + tinyCategory(place) + '<h3>' + linkPlace(place, html(place.name)) + '</h3>' + addressLine(place) + positionTag(place) +
    '<p>' + html(place.lead || place.intro) + '</p><div class="card-bottom"><span class="access-label" data-kind="' + place.access + '">' +
    html(accessLabels[place.access]) + '</span>' + linkPlace(place, 'Подробнее ' + icon('arrow'), 'card-open') + '</div></div></article>';
}

function external(url, label, className = '') {
  return '<a class="' + className + '" href="' + html(url) + '" target="_blank" rel="noopener noreferrer">' + html(label) + ' ' + icon('external') + '</a>';
}

function sourcesList(sources) {
  return '<ul>' + sources.map(source => '<li>' + external(source.url, source.label) + '</li>').join('') + '</ul>';
}

function placeDetail(place) {
  const mapLabel = canNavigate(place) ? 'Точка в Яндекс Картах'
    : place.access === 'restricted' || place.nav === false ? 'Населённый пункт на карте' : 'Найти в Яндекс Картах';
  const mapButton = external(placeMapUrl(place), mapLabel, 'button outline');
  const official = place.official ? external(place.official, 'Ресурс площадки', 'button outline') : '';
  const positionNote = place.precision === 'place'
    ? 'Метка объекта или точки с опубликованными координатами.'
    : 'Метка и расстояние относятся к населённому пункту.';
  const related = catalog.routes.filter(route => route.stops.includes(place.id)).slice(0, 4);
  const relatedRoutes = related.length ? '<h3>Идеи для поездки</h3><ul>' + related.map(route =>
    '<li><a href="' + html(route.path || detailUrl('route', route.id)) + '" data-route="' + route.id + '">' + html(route.name) + '</a></li>').join('') + '</ul>' : '';
  const neighbors = nearPlaces(place);
  const nearby = neighbors.length ? '<h3>Ещё в этом населённом пункте</h3><ul class="nearby-places">' + neighbors.map(other =>
    '<li>' + icon(other.category) + linkPlace(other, html(other.name)) + '</li>').join('') + '</ul>' : '';
  return '<div class="detail-img">' + placeImage(place, 'eager') + '<span class="card-photo-caption">' +
    (place.cover ? 'Фото' : 'Авторская иллюстрация') + '</span></div>' + photoCredit(place.cover, 'detail-photo-credit') +
    '<article class="detail-main" style="--tone:var(--' + place.category + ')">' + tinyCategory(place) +
    '<h2 id="detail-title">' + html(place.name) + '</h2><div class="card-address">' + icon('pin') +
    '<span>' + html([place.locality, place.area, place.region].filter((val, i, vals) => vals.indexOf(val) === i).join(' · ')) +
    ' · ' + html(distance(place)) + '</span></div><p class="detail-intro">' + html(place.lead || place.intro) + '</p>' +
    '<div class="detail-actions">' + linkPlace(place, 'Полное описание ' + icon('arrow'), 'button primary') +
    tripButton(place) + mapButton + official + bookmark(place, 'button outline') +
    '<button class="button outline" type="button" data-share>' + icon('share') + ' <span>Ссылка</span></button></div>' +
    '<h3>На что обратить внимание</h3><p>' + html(place.see) + '</p>' +
    '<h3>Как посетить</h3><p><span class="access-label" data-kind="' + place.access + '">' + html(accessLabels[place.access]) + '</span> ' + positionTag(place) + '</p>' +
    '<p style="margin-top:7px">' + html([place.address, place.visit].filter(Boolean).join('. ')) + '</p>' +
    '<h3>Источники</h3><div id="legacy-place-sources"><a href="' + html(place.path + '#sources-h') + '">Источники на странице места</a></div>' +
    nearby + relatedRoutes +
    '<p class="detail-footnote">' + html([place.locationNote, positionNote].filter(Boolean).join(' ')) + ' Расстояние по прямой от Борисоглебска.</p></article>';
}

function routeCard(route) {
  return '<article class="route-card"><div class="route-label">' + icon('route') + html(route.area) + '</div>' +
    '<h3>' + html(route.name) + '</h3><p>' + html(route.summary) + '</p>' +
    '<p class="route-meta' + (route.navigationPoints < 2 ? ' caution' : '') + '">' +
    route.stops.length + ' ' + plural(route.stops.length, ['остановка', 'остановки', 'остановок']) +
    ' · точек для навигатора ' + route.navigationPoints + '</p><a class="card-open" href="' +
    html(route.path || detailUrl('route', route.id)) + '">Открыть маршрут ' + icon('arrow') + '</a></article>';
}

function routeDetail(route) {
  const links = route.stops.map((id, index) => '<li><span class="stop-number">' + (index + 1) + '</span>' +
    linkPlace(placeById.get(id), html(placeById.get(id).name)) + '</li>').join('');
  return '<article class="detail-main"><div class="route-label">' + icon('route') + html(route.area) + '</div>' +
    '<h2 id="detail-title">' + html(route.name) + '</h2><p class="detail-intro">' + html(route.summary) + '</p>' +
    '<h3>' + (route.published ? 'Точки ориентирования' : 'Остановки') + '</h3><ol class="route-stops">' + links + '</ol>' +
    '<h3>Перед поездкой</h3><p>' + html(route.visit) + '</p>' +
    (route.sources.length ? '<h3>Источники</h3>' + sourcesList(route.sources) : '') +
    '<div class="detail-actions"><button class="button primary" type="button" data-add-idea="' + route.id + '">' + icon('plus') +
    '<span>Добавить остановки</span></button><button class="button outline" type="button" data-open-planner>' + icon('route') +
    ' Мой маршрут</button><a class="button outline" href="' + html(route.path || detailUrl('route', route.id)) + '">Страница маршрута</a>' +
    '<button class="button outline" type="button" data-share>' + icon('share') + ' <span>Ссылка</span></button></div>' +
    '<p class="detail-footnote">' + (route.published ? 'Описание опубликованного маршрута доступно у организатора.' : 'Редакционная идея. Время в дороге и вход на каждую площадку планируйте отдельно.') + '</p></article>';
}

const map = createMap({
  canvas: $('map-canvas'), tiles: $('map-tiles'), pins: $('map-pins'), out: $('map-items'),
  attribution: $('map-attribution'), status: $('map-layer-status'), center: catalog.center,
  placeLink: place => linkPlace(place, html(place.name)), escape: html, icon
});
const tripView = createTripView({
  trip, icon, escape: html, linkPlace,
  onChange: refreshItinerary,
  onMap: openItinerary,
  onBuild: buildRoad,
  onMode: refreshItinerary
});

const queryFillers = new Set('где куда когда что посмотреть посещение сходить съездить поехать недалеко рядом возле в во на из от до для с со по и как можно есть добраться находится находиться расположен расположена располагается достопримечательности поставить'.split(' '));
const wordPrefixes = /^(?:борисоглебск|новохоперск|урюпинск|балашов|музе(?=[йеяию])|дет(?=ьми$|ей$)|экскурси|выходн|экотроп|хоп(?=ер|р)|палат(?=к|оч)|кемпинг|лошад)/u;
function queryTerms(value) {
  return normalize(value).split(' ').filter(word => word && !queryFillers.has(word))
    .map(word => word.match(wordPrefixes)?.[0] || word);
}

function matchesTerm(words, term) {
  return words.some(word => word.startsWith(term) && (term !== 'дет' || !word.startsWith('детал')));
}

const prepared = catalog.places.map(place => ({
  place,
  name: normalize(place.name).split(' '),
  words: [...new Set(normalize([place.name, place.locality, place.area, place.region, place.address, place.visual,
    categories[place.category].label, place.lead, place.intro, place.see, ...(place.aliases || []), ...(place.intents || [])].join(' ')).split(' '))]
}));

function filtered(selection = appliedFilters) {
  if (state.tripOnly) return trip.places();
  const terms = queryTerms($('query').value);
  const { region, locality, radius, access, lodging, navigable, 'has-photo': hasPhoto } = selection;
  const maxDistance = Number(radius);
  const matched = prepared.filter(({ place, words }) =>
    (state.category === 'all' || place.category === state.category) &&
    (!state.savedOnly || saved.has(place.id)) &&
    (!region || region === place.region) &&
    (!locality || locality === localityKey(place)) &&
    place.distanceKm <= maxDistance &&
    (!access || access === place.access) &&
    (!lodging || lodging === place.lodgingType) &&
    (!navigable || canNavigate(place)) &&
    (!hasPhoto || place.cover) &&
    terms.every(term => term === 'палат' || term === 'кемпинг'
      ? place.lodgingType === 'camping' : matchesTerm(words, term)));
  const relevance = new Map(matched.map(({ place, name }) => [place.id, terms.filter(term => matchesTerm(name, term)).length]));
  const results = matched.map(({ place }) => place);
  const byName = (a, b) => collator.compare(a.name, b.name);
  const byDistance = (a, b) => a.distanceKm - b.distanceKm || byName(a, b);
  const sort = $('sort').value;
  if (sort === 'name') return results.sort(byName);
  if (sort === 'nearest') return results.sort(byDistance);
  return results.sort((a, b) =>
    relevance.get(b.id) - relevance.get(a.id) ||
    (appearance.get(a.id) ?? 1000) - (appearance.get(b.id) ?? 1000) || byDistance(a, b));
}

function updateSaved() {
  $('saved-count').hidden = !saved.size;
  $('saved-count').textContent = saved.size;
  $('saved-nav').setAttribute('aria-pressed', String(state.savedOnly));
  document.querySelectorAll('[data-save]').forEach(button => {
    const marked = saved.has(button.dataset.save);
    button.setAttribute('aria-pressed', String(marked));
    button.setAttribute('aria-label', marked ? 'Убрать из избранного' : 'Сохранить в избранное');
    button.title = button.getAttribute('aria-label');
    const label = button.querySelector('span');
    if (label) label.textContent = marked ? 'Сохранено' : 'Сохранить';
  });
}

function activeFilterLabels() {
  const { region, locality, radius, access, lodging, navigable, 'has-photo': hasPhoto } = appliedFilters;
  return [
    ['region', region],
    ['locality', localities.get(locality)?.name],
    ['radius', radius === filterDefaults.radius ? '' : 'До ' + radius + ' км'],
    ['access', accessLabels[access]],
    ['lodging', catalog.lodgingTypes[lodging]],
    ['navigable', navigable ? 'Точка для навигатора' : ''],
    ['has-photo', hasPhoto ? 'С фото' : '']
  ].filter(([, label]) => label);
}

function renderFilters(listMode) {
  const labels = activeFilterLabels();
  const query = $('query').value.trim();
  const hasChoices = Boolean(labels.length || query || state.category !== 'all' || $('sort').value !== 'featured');
  $('catalog-search').hidden = state.tripOnly;
  $('open-filters').hidden = state.tripOnly;
  $('clear-query').hidden = !$('query').value;
  const categoryBar = $('category-options');
  categoryBar.hidden = state.tripOnly;
  const previous = categoryBar.querySelector('[aria-pressed="true"]');
  const selected = categoryBar.querySelector('[data-category="' + state.category + '"]');
  if (previous !== selected) {
    previous?.setAttribute('aria-pressed', 'false');
    selected.setAttribute('aria-pressed', 'true');
    if (categoryBar.scrollWidth > categoryBar.clientWidth) {
      const strip = categoryBar.getBoundingClientRect();
      const chip = selected.getBoundingClientRect();
      categoryBar.scrollLeft += Math.min(0, chip.left - strip.left - 4) + Math.max(0, chip.right - strip.right + 4);
    }
  }
  $('catalog-applied').hidden = state.tripOnly || !labels.length;
  $('filter-count').textContent = labels.length;
  $('filter-count').hidden = !labels.length;
  $('open-filters').setAttribute('aria-label', labels.length ? 'Фильтры, выбрано ' + labels.length : 'Фильтры');
  $('catalog-share').hidden = state.savedOnly || state.tripOnly || (!hasChoices && listMode);
  $('sort-control').hidden = !listMode || state.tripOnly;
  if (shownFilters === appliedFilters) return;
  shownFilters = appliedFilters;
  $('applied-filters').innerHTML = labels.map(([id, label]) =>
    '<button class="filter-chip" type="button" data-remove-filter="' + id + '" aria-label="Убрать фильтр: ' + html(label) + '">' +
    '<span>' + html(label) + '</span>' + icon('close') + '</button>').join('');
}

function updateFilterPreview() {
  const selection = readFilterFields();
  const count = filtered(selection).length;
  const label = count + ' ' + plural(count, ['место', 'места', 'мест']);
  $('filter-preview').textContent = count ? 'Подходит ' + label : 'С этими условиями ничего не найдено.';
  $('filter-preview').classList.toggle('sr-only', count > 0);
  $('apply-filters').textContent = count ? 'Показать ' + label : 'Нет подходящих мест';
  $('apply-filters').disabled = count === 0;
  $('reset-filter-draft').disabled = Object.keys(filterDefaults).every(id => selection[id] === filterDefaults[id]);
}

function render() {
  const results = filtered();
  const listMode = state.view === 'list';
  const count = results.length;
  const visible = Math.min(count, state.limit);
  const noun = plural(count, state.tripOnly ? ['остановка', 'остановки', 'остановок'] : ['место', 'места', 'мест']);
  $('catalog-title').textContent = state.tripOnly ? 'Остановки маршрута' : state.savedOnly ? 'Избранное' : 'Каталог мест';
  renderFilters(listMode);
  $('exit-itinerary').hidden = !state.tripOnly && !state.savedOnly;
  $('list-view').setAttribute('aria-pressed', String(listMode));
  $('map-view').setAttribute('aria-pressed', String(!listMode));
  const status = count + ' ' + noun;
  if ($('result-status').textContent !== status) $('result-status').textContent = status;
  $('empty-state').hidden = !!count;
  $('empty-title').textContent = state.savedOnly && !saved.size ? 'Избранное пока пусто' : 'Места не найдены';
  $('empty-copy').textContent = state.savedOnly && !saved.size
    ? 'Нажмите на закладку возле понравившейся карточки.'
    : 'Проверьте запрос или снимите часть условий.';
  $('empty-reset').hidden = state.tripOnly || (state.savedOnly && !saved.size);
  syncFilterUrl();
  $('card-grid').hidden = !listMode || !count;
  $('card-grid').innerHTML = listMode ? results.slice(0, visible).map(card).join('') : '';
  $('map-panel').hidden = listMode || !count;
  $('pagination').hidden = !listMode || count <= state.limit;
  if (!listMode && count) {
    $('map-note-copy').textContent = state.tripOnly
      ? 'Номера показывают порядок остановок. Пунктирная рамка означает ориентир по населённому пункту.'
      : 'Число на метке означает несколько мест рядом. Пунктирная рамка означает ориентир по населённому пункту. Кольца показывают расстояние по прямой.';
    map.draw(results, {
      itinerary: state.tripOnly, focus: state.tripOnly || !!appliedFilters.locality,
      roadPoints: state.tripOnly ? road?.points : undefined
    });
  }
  renderRoadStatus();
  if (filterDialog.open) updateFilterPreview();
  updateSaved();
  tripView.updateButtons();
}

function clearSearchAndFilters() {
  appliedFilters = { ...filterDefaults };
  $('query').value = '';
  $('hero-search').value = '';
  $('sort').value = 'featured';
  state.category = 'all';
}

function clearFilters() {
  clearSearchAndFilters();
  state.savedOnly = false;
  state.tripOnly = false;
  state.limit = pageSize;
  resetRoad();
}

function refreshCatalog() {
  state.limit = pageSize;
  map.reset(false);
  render();
}

function resetFilters() {
  clearSearchAndFilters();
  refreshCatalog();
  $('query').focus({ preventScroll: true });
}

function updateIdeaButton() {
  const button = detail.querySelector('[data-add-idea]');
  if (!button) return;
  const route = routeById.get(button.dataset.addIdea);
  button.disabled = route.stops.every(id => trip.has(id));
  button.querySelector('span').textContent = button.disabled ? 'Остановки добавлены' : 'Добавить остановки';
}

function refreshItinerary() {
  resetRoad();
  if (!state.tripOnly) return;
  if (!trip.places().length) clearFilters();
  render();
}

function resetRoad() {
  road = null;
  roadRun += 1;
}

function openItinerary() {
  clearFilters();
  state.tripOnly = true;
  showView('map', true);
}

function roadCaption() {
  if (road?.points) {
    return (road.mode === 'pd' ? 'Пешком' : 'На машине') + ' · ' + kmFormat.format(road.km) +
      ' км · около ' + road.minutes + ' мин без остановок';
  }
  switch (road?.issue) {
    case 'loading': return 'Строим маршрут по дорогам…';
    case 'few': return 'Для расчёта нужны две разные точки, доступные для навигации.';
    case 'many': return 'Разбейте план на части до ' + road.maxStops + ' точек или откройте остановки в Яндекс Картах.';
    case 'missing': return 'В дорожной сети не найден путь через все точки. Проверьте подходы к остановкам в Яндекс Картах.';
    case 'busy': return 'Расчёт уже запущен. Попробуйте ещё раз через несколько секунд.';
    case 'unavailable': return 'Сервис расчёта временно недоступен. Остановки можно открыть в Яндекс Картах.';
    default: return 'На карте показаны остановки в порядке поездки.';
  }
}

function renderRoadStatus() {
  const onMap = state.tripOnly && state.view === 'map' && trip.places().length > 0;
  $('road-result').hidden = !onMap;
  if (!onMap) return;
  const status = roadCaption();
  if ($('road-status').textContent !== status) $('road-status').textContent = status;
  const result = routeInYandex(trip.places(), $('trip-mode').value);
  const external = $('road-yandex');
  external.hidden = !result.url;
  if (result.url) external.href = result.url;
  else external.removeAttribute('href');
  const build = $('map-trip-build');
  build.hidden = !!road?.points || !(result.url || result.tooLong);
  build.disabled = road?.issue === 'loading';
  $('road-fix').hidden = !road?.points;
  $('map-canvas').setAttribute('aria-label', road?.points ? 'Маршрут по дорожной сети' : 'Расстояния по прямой от Борисоглебска');
}

async function buildRoad(mode) {
  const request = routeRequest(trip.places(), mode);
  openItinerary();
  const run = ++roadRun;
  road = request.issue ? request : {issue: 'loading'};
  renderRoadStatus();
  if (request.issue) return;
  const result = await requestRoadPath(request);
  if (run !== roadRun) return;
  road = {...result, mode};
  render();
}

function updateTrip() {
  tripView.render();
  updateIdeaButton();
  refreshItinerary();
}

function jumpToPlanner() {
  const url = new URL(location.href);
  url.searchParams.delete('place');
  url.searchParams.delete('route');
  url.hash = 'planner';
  history.replaceState(null, '', url);
  renderDetailFromUrl();
  $('planner').scrollIntoView({ block: 'start' });
  $('planner-title').focus({ preventScroll: true });
}

function flagFavorite(id) {
  if (!placeById.has(id)) return;
  if (saved.has(id)) saved.delete(id);
  else saved.add(id);
  try {
    localStorage.setItem(bookmarkKey, JSON.stringify([...saved]));
  } catch {
    if (!$('detail').open) notify('Избранное сохранено до закрытия страницы');
  }
  if (state.savedOnly) render();
  else updateSaved();
}

function moveToCatalog() {
  $('catalog').scrollIntoView({ block: 'start' });
  $('catalog-title').focus({ preventScroll: true });
}

function showView(view, scroll = false) {
  state.view = view;
  state.limit = pageSize;
  render();
  if (scroll) moveToCatalog();
}

let toastTimer;
function notify(message) {
  const toast = $('toast');
  toast.hidden = false;
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
}

const detail = $('detail');
let placeSources;
function renderDetailFromUrl() {
  const active = new URL(location.href);
  const place = placeById.get(active.searchParams.get('place'));
  const route = routeById.get(active.searchParams.get('route'));
  if (!place && !route) {
    if (detail.open) detail.close();
    $('detail-content').replaceChildren();
    return;
  }
  $('detail-content').innerHTML = place ? placeDetail(place) : routeDetail(route);
  if (place) {
    const container = $('legacy-place-sources');
    placeSources ||= import('./data/place-sources.js').then(module => module.default);
    placeSources.then(sources => {
      if (container.isConnected && sources[place.id]?.length) container.innerHTML = sourcesList(sources[place.id]);
    }).catch(() => {});
  }
  updateIdeaButton();
  detail.setAttribute('aria-labelledby', 'detail-title');
  if (!detail.open) detail.showModal();
  detail.scrollTop = 0;
  $('detail-close').focus({ preventScroll: true });
}

function openDetail(kind, id) {
  history.pushState({ portalDetail: true }, '', detailUrl(kind, id) + location.hash);
  renderDetailFromUrl();
}

function closeDetail() {
  if (history.state?.portalDetail) {
    history.back();
    return;
  }
  const url = new URL(location.href);
  url.searchParams.delete('place');
  url.searchParams.delete('route');
  history.replaceState(null, '', url);
  renderDetailFromUrl();
}

async function share(button) {
  const current = new URL(location.href);
  const place = placeById.get(current.searchParams.get('place'));
  const route = routeById.get(current.searchParams.get('route'));
  const url = new URL(place?.path || route?.path || current, location.origin);
  url.hash = '';
  try {
    await navigator.clipboard.writeText(url.href);
  } catch {
    const field = document.createElement('textarea');
    field.value = url.href;
    field.setAttribute('aria-label', 'Ссылка на карточку');
    field.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:.01';
    detail.append(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    if (!copied) window.prompt('Скопируйте ссылку на карточку', url.href);
    button.focus();
    if (!copied) return;
  }
  const caption = button.querySelector('span');
  caption.textContent = 'Скопировано';
  setTimeout(() => { caption.textContent = 'Ссылка'; }, 2000);
}

$('category-options').innerHTML = Object.entries(categories).map(([key, category]) =>
  '<button class="category" type="button" data-category="' + key + '" aria-pressed="false">' +
  icon(category.icon) + '<span>' + html(category.label) + '</span></button>').join('');
for (const region of regionOrder) if (catalog.places.some(place => place.region === region)) $('region').add(new Option(region, region));
for (const [type, label] of Object.entries(catalog.lodgingTypes)) {
  if (catalog.places.some(place => place.lodgingType === type)) $('lodging').add(new Option(label, type));
}
readFilterUrl();
$('routes-grid').innerHTML = catalog.routes.map(routeCard).join('');
$('about-count').textContent = catalog.places.length + ' ' + plural(catalog.places.length, ['место', 'места', 'мест']);
document.addEventListener('click', event => {
  if ((state.tripOnly || state.savedOnly) && event.target.closest('a[href="#catalog"]')) {
    clearFilters();
    refreshCatalog();
  }
  const tripToggle = event.target.closest('[data-plan-toggle]');
  if (tripToggle) {
    const id = tripToggle.dataset.planToggle;
    const selected = trip.has(id);
    if (selected) trip.remove(id);
    else trip.add([id]);
    updateTrip();
    if (!detail.open) notify(selected ? 'Остановка убрана' : 'Остановка в вашем маршруте');
    return;
  }
  const importIdea = event.target.closest('[data-add-idea]');
  if (importIdea) {
    trip.add(routeById.get(importIdea.dataset.addIdea).stops);
    updateTrip();
    return;
  }
  if (event.target.closest('[data-open-planner]')) {
    jumpToPlanner();
    return;
  }
  const bookmarkButton = event.target.closest('[data-save]');
  if (bookmarkButton) { flagFavorite(bookmarkButton.dataset.save); return; }
  const categoryButton = event.target.closest('[data-category]');
  if (categoryButton) {
    state.category = categoryButton.dataset.category;
    if (state.category !== 'stay' && appliedFilters.lodging) appliedFilters = { ...appliedFilters, lodging: '' };
    refreshCatalog();
    return;
  }
  const shareButton = event.target.closest('[data-share]');
  if (shareButton) { void share(shareButton); return; }
  const detailLink = event.target.closest('[data-route]');
  if (!detailLink || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  openDetail('route', detailLink.dataset.route);
});

function refreshSearch() {
  $('hero-search').value = $('query').value;
  refreshCatalog();
}

$('query').addEventListener('input', refreshSearch);
$('clear-query').addEventListener('click', () => {
  $('query').value = '';
  refreshSearch();
  $('query').focus();
});
$('sort').addEventListener('change', refreshCatalog);

$('open-filters').addEventListener('click', () => {
  writeFilterFields(appliedFilters);
  $('lodging-control').hidden = state.category !== 'stay';
  updateFilterPreview();
  filterDialog.showModal();
});
$('close-filters').addEventListener('click', () => filterDialog.close());
filterDialog.addEventListener('click', event => {
  if (event.target !== filterDialog) return;
  const { left, right, top, bottom } = filterDialog.getBoundingClientRect();
  if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) filterDialog.close();
});
$('filter-form').addEventListener('change', event => {
  if (event.target.id === 'region') fillLocalities();
  updateFilterPreview();
});
$('reset-filter-draft').addEventListener('click', () => {
  writeFilterFields(filterDefaults);
  updateFilterPreview();
  const apply = $('apply-filters');
  (apply.disabled ? $('region') : apply).focus();
});
$('filter-form').addEventListener('submit', event => {
  event.preventDefault();
  if ($('apply-filters').disabled) return;
  appliedFilters = readFilterFields();
  filterDialog.close();
  refreshCatalog();
});
$('applied-filters').addEventListener('click', event => {
  const chip = event.target.closest('[data-remove-filter]');
  if (!chip) return;
  const index = [...$('applied-filters').children].indexOf(chip);
  const id = chip.dataset.removeFilter;
  appliedFilters = { ...appliedFilters, [id]: filterDefaults[id] };
  if (id === 'region') appliedFilters.locality = '';
  refreshCatalog();
  const chips = $('applied-filters').children;
  (chips[Math.min(index, chips.length - 1)] ?? $('open-filters')).focus({ preventScroll: true });
});

$('catalog-share').addEventListener('click', async () => {
  const url = filterUrl();
  for (const name of ['place', 'route', 'trip', 'move']) url.searchParams.delete(name);
  url.hash = 'catalog';
  try {
    await navigator.clipboard.writeText(url.href);
    notify('Ссылка на подборку скопирована');
  } catch {
    const field = $('catalog-share-url');
    field.value = url.href;
    $('catalog-share-fallback').hidden = false;
    field.focus();
    field.select();
  }
});

const incoming = readSharedTrip(new URLSearchParams(location.search), placeById);
if (incoming.places.length) {
  $('incoming-trip-stops').innerHTML = incoming.places.map(place => '<li>' +
    linkPlace(place, html(place.name)) + '</li>').join('');
  $('incoming-trip').hidden = false;
}

function closeIncoming() {
  const url = new URL(location.href);
  url.searchParams.delete('trip');
  url.searchParams.delete('move');
  history.replaceState(history.state, '', url);
  $('incoming-trip').hidden = true;
  $('planner-title').focus({ preventScroll: true });
}

$('incoming-trip-add').addEventListener('click', () => {
  trip.add(incoming.places.map(place => place.id));
  $('trip-mode').value = incoming.mode;
  closeIncoming();
  updateTrip();
  notify('Остановки добавлены в ваш маршрут');
});
$('incoming-trip-close').addEventListener('click', closeIncoming);
$('hero-form').addEventListener('submit', event => {
  event.preventDefault();
  const term = $('hero-search').value.trim();
  clearFilters();
  $('hero-search').value = term;
  $('query').value = term;
  showView('list', true);
});
$('saved-nav').addEventListener('click', () => {
  const show = !state.savedOnly;
  clearFilters();
  state.savedOnly = show;
  showView('list', true);
});
$('open-map').addEventListener('click', () => showView('map', true));
$('list-view').addEventListener('click', () => showView('list'));
$('map-view').addEventListener('click', () => showView('map'));
$('map-trip-build').addEventListener('click', () => buildRoad($('trip-mode').value));
$('reset-filters').addEventListener('click', resetFilters);
$('exit-itinerary').addEventListener('click', () => {
  clearFilters();
  refreshCatalog();
  $('catalog-title').focus({ preventScroll: true });
});
for (const name of ['roads', 'scheme']) {
  $('layer-' + name).addEventListener('click', () => {
    const enabled = name === 'roads';
    $('layer-roads').setAttribute('aria-pressed', String(enabled));
    $('layer-scheme').setAttribute('aria-pressed', String(!enabled));
    map.layer(enabled);
  });
}
$('empty-reset').addEventListener('click', resetFilters);
$('more').addEventListener('click', () => {
  const oldLimit = state.limit;
  state.limit += pageSize;
  render();
  $('card-grid').children[oldLimit]?.querySelector('h3 a')?.focus({ preventScroll: false });
});
$('zoom-in').addEventListener('click', () => map.zoom(1.4));
$('zoom-out').addEventListener('click', () => map.zoom(1 / 1.4));
$('zoom-reset').addEventListener('click', () => map.reset());
$('detail-close').addEventListener('click', closeDetail);
detail.addEventListener('cancel', event => { event.preventDefault(); closeDetail(); });
detail.addEventListener('click', event => {
  if (event.target === detail) {
    const rect = detail.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDetail();
  }
});
window.addEventListener('popstate', renderDetailFromUrl);
function syncPageLists() {
  saved = new Set(readIds(() => localStorage, bookmarkKey).filter(id => placeById.has(id)));
  trip.reload();
  tripView.render();
  resetRoad();
  if (state.tripOnly && !trip.places().length) clearFilters();
  render();
}
window.addEventListener('storage', event => {
  if ([bookmarkKey, stopKey].includes(event.key)) syncPageLists();
});
window.addEventListener('pageshow', event => {
  if (event.persisted) syncPageLists();
});
tripView.render();
render();
renderDetailFromUrl();
