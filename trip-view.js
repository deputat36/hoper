import { canNavigate, navigationLabel, routeIn2Gis, routeInYandex, sharedTripLimit, tripShareUrl, tripText } from './trip.js';

export function createTripView({ trip, icon, escape, linkPlace, onChange, onMap, onBuild, onMode }) {
  const $ = id => document.getElementById(id);
  const stops = $('trip-stops');
  const summary = $('trip-summary');
  const directions = $('trip-directions');
  const gis = $('trip-2gis');
  const build = $('trip-build');
  const navNote = $('trip-nav-note');
  const mode = $('trip-mode');
  const text = $('trip-text');
  const copyButton = $('trip-copy');
  const shareButton = $('trip-share');
  let copyFeedbackTimer;

  function updateButtons() {
    const count = trip.places().length;
    $('trip-count').hidden = !count;
    $('trip-count').textContent = count;
    $('trip-nav').setAttribute('aria-label', count ? 'Мой маршрут · остановок ' + count : 'Мой маршрут');
    document.querySelectorAll('[data-plan-toggle]').forEach(button => {
      const marked = trip.has(button.dataset.planToggle);
      button.setAttribute('aria-pressed', String(marked));
      button.setAttribute('aria-label', marked ? 'Убрать из маршрута' : 'Добавить в маршрут');
      button.title = button.getAttribute('aria-label');
      const caption = button.querySelector('span');
      if (caption) caption.textContent = marked ? 'В маршруте' : 'В маршрут';
    });
  }

  function updateDirections(ordered) {
    const result = routeInYandex(ordered, mode.value);
    directions.hidden = !result.url;
    if (result.url) directions.href = result.url;
    else directions.removeAttribute('href');
    const gisUrl = routeIn2Gis(ordered, mode.value);
    gis.hidden = !gisUrl;
    if (gisUrl) gis.href = gisUrl;
    else gis.removeAttribute('href');
    build.hidden = !result.url && !result.tooLong;
    summary.textContent = 'Остановок ' + ordered.length + ' · доступно для навигации ' + result.count;
    let message = '';
    if (result.tooLong) message = 'Для этой подборки скопируйте план и открывайте остановки по очереди.';
    else if (!result.url) message = 'Для расчёта дороги нужны две разные точки, доступные для навигации.';
    else if (result.count < ordered.length) message = 'Дорожный расчёт охватывает ' + result.count + ' из ' + ordered.length +
      ' остановок. Уточните вход и правила посещения у остальных мест в плане.';
    navNote.textContent = message;
    navNote.hidden = !message;
  }

  function stop(place, index, count) {
    const where = [place.locality, place.address].filter(Boolean).join(' · ');
    const navigable = canNavigate(place);
    const controls = [
      ['up', 'Поднять', index === 0],
      ['down', 'Опустить', index === count - 1],
      ['remove', 'Убрать', false]
    ].map(([move, label, disabled]) =>
      '<button class="trip-step-button" type="button" data-step="' + move + '" data-stop="' + place.id + '" aria-label="' +
      escape(label + ' — ' + place.name) + '" title="' + label + '"' + (disabled ? ' disabled' : '') + '>' +
      icon(move === 'remove' ? 'close' : move) + '</button>').join('');
    return '<li><span class="stop-number">' + (index + 1) + '</span><div class="trip-stop-text">' +
      linkPlace(place, escape(place.name), 'trip-stop-name') + '<p>' + escape(where) + '</p>' +
      '<span class="trip-stop-location' + (navigable ? '' : ' uncertain') + '">' +
      navigationLabel(place) + '</span></div><div class="trip-step-buttons">' + controls + '</div></li>';
  }

  function render() {
    const ordered = trip.places();
    $('trip-empty').hidden = !!ordered.length;
    $('trip-plan').hidden = !ordered.length;
    stops.innerHTML = ordered.map((place, index) => stop(place, index, ordered.length)).join('');
    text.hidden = true;
    text.value = '';
    shareButton.hidden = ordered.length > sharedTripLimit;
    if (ordered.length) updateDirections(ordered);
    updateButtons();
  }

  stops.addEventListener('click', event => {
    const button = event.target.closest('[data-step]');
    if (!button || button.disabled) return;
    const { step, stop: id } = button.dataset;
    const index = trip.places().findIndex(place => place.id === id);
    if (step === 'remove') trip.remove(id);
    else trip.move(id, step === 'up' ? -1 : 1);
    render();
    onChange();
    const current = stops.querySelector('[data-stop="' + id + '"][data-step="' + step + '"]:not([disabled])');
    const next = stops.children[Math.min(index, stops.children.length - 1)]?.querySelector('.trip-stop-name');
    (current || next || $('trip-empty').querySelector('a')).focus({ preventScroll: true });
  });

  mode.addEventListener('change', () => {
    updateDirections(trip.places());
    onMode();
  });
  $('trip-map').addEventListener('click', onMap);
  build.addEventListener('click', () => onBuild(mode.value));
  async function copyPlan(button, content, feedback, defaultLabel) {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      const caption = button.querySelector('span');
      caption.textContent = feedback;
      clearTimeout(copyFeedbackTimer);
      for (const other of [copyButton, shareButton]) {
        if (other !== button) other.querySelector('span').textContent = other === copyButton ? 'Скопировать план' : 'Поделиться ссылкой';
      }
      copyFeedbackTimer = setTimeout(() => { caption.textContent = defaultLabel; }, 2200);
    } catch {
      text.hidden = false;
      text.value = content;
      text.focus();
      text.select();
    }
  }
  copyButton.addEventListener('click', () =>
    copyPlan(copyButton, tripText(trip.places()), 'План скопирован', 'Скопировать план'));
  shareButton.addEventListener('click', () =>
    copyPlan(shareButton, tripShareUrl(trip.places(), mode.value, location.origin), 'Ссылка скопирована', 'Поделиться ссылкой'));
  return { render, updateButtons };
}
