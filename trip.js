export const stopKey = 'prikhoperye100.trip.v1';
export const bookmarkKey = 'prikhoperye100.saved.v1';
export const sharedTripLimit = 40;

export function readIds(getStorage, key) {
  try {
    const value = JSON.parse(getStorage().getItem(key) || '[]');
    if (Array.isArray(value)) return [...new Set(value.filter(id => typeof id === 'string'))];
  } catch {
    // The catalog also works without browser storage.
  }
  return [];
}

export function writeIds(getStorage, key, ids) {
  try {
    getStorage().setItem(key, JSON.stringify(ids));
    return true;
  } catch {
    return false;
  }
}

export function createTrip(places, getStorage) {
  const byId = new Map(places.map(place => [place.id, place]));
  const storedIds = () => readIds(getStorage, stopKey).filter(id => byId.has(id));
  let ids = storedIds();

  function save() {
    writeIds(getStorage, stopKey, ids);
  }

  return {
    has(id) { return ids.includes(id); },
    reload() { ids = storedIds(); },
    places() { return ids.map(id => byId.get(id)); },
    add(list) {
      const added = list.filter(id => byId.has(id) && !ids.includes(id));
      if (added.length) {
        ids = [...ids, ...new Set(added)];
        save();
      }
    },
    remove(id) {
      ids = ids.filter(value => value !== id);
      save();
    },
    move(id, offset) {
      const index = ids.indexOf(id);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= ids.length) return;
      [ids[index], ids[target]] = [ids[target], ids[index]];
      save();
    }
  };
}

export function canNavigate(place) {
  if (place.precision !== 'place' || place.nav === false || place.access === 'restricted' ||
    !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) return false;
  return place.nav === true || place.access !== 'verify';
}

export function navigationLabel(place) {
  if (canNavigate(place)) return 'Точка для навигатора';
  if (place.access === 'restricted') return 'Особый режим посещения';
  if (place.precision === 'locality') return 'Ориентир по населённому пункту';
  return 'Вход или подъезд уточняется';
}

export function placeMapUrl(place) {
  const query = canNavigate(place)
    ? place.lat + ', ' + place.lon
    : [place.locality, place.region, place.access === 'restricted' || place.nav === false ? '' : (place.address || place.name)].filter(Boolean).join(', ');
  const url = new URL('https://yandex.ru/maps/');
  url.searchParams.set('text', query);
  return url.href;
}

export function routeInYandex(ordered, mode = 'auto') {
  const eligible = ordered.filter(canNavigate);
  const coordinates = uniqueConsecutivePoints(eligible).map(point => point.lat + ',' + point.lon);
  if (new Set(coordinates).size < 2) return { url: '', count: eligible.length, tooLong: false };
  const url = new URL('https://yandex.ru/maps/');
  url.searchParams.set('mode', 'routes');
  url.searchParams.set('rtext', coordinates.join('~'));
  url.searchParams.set('rtt', mode === 'pd' ? 'pd' : 'auto');
  const tooLong = url.href.length > 1900;
  return { url: tooLong ? '' : url.href, count: eligible.length, tooLong };
}

function uniqueConsecutivePoints(places) {
  return places.filter((p, i, points) => i === 0 || p.lat !== points[i - 1].lat || p.lon !== points[i - 1].lon);
}

export function routePoints(ordered) {
  return uniqueConsecutivePoints(ordered.filter(canNavigate));
}

export function routeIn2Gis(ordered, mode) {
  const points = routePoints(ordered);
  if (points.length !== 2) return '';
  const tab = mode === 'pd' ? 'pedestrian' : 'car';
  return 'https://2gis.ru/directions/tab/' + tab + '/points/' + points.map(p => p.lon + ',' + p.lat).join('|');
}

export function tripText(places) {
  const stops = places.map((place, index) => [
    (index + 1) + '. ' + place.name,
    [place.locality, place.region, place.address].filter(Boolean).join(', '),
    canNavigate(place) ? placeMapUrl(place) : place.visit
  ].join('\n'));
  return ['Маршрут по Прихопёрью', ...stops].join('\n\n');
}

export function tripShareUrl(places, mode, origin) {
  if (!places.length || places.length > sharedTripLimit) return '';
  const url = new URL('/#planner', origin);
  url.searchParams.set('trip', places.map(place => place.id).join(','));
  if (mode === 'pd') url.searchParams.set('move', 'pd');
  return url.href;
}

export function readSharedTrip(params, byId) {
  const parts = (params.get('trip') || '').split(',', sharedTripLimit + 1);
  if (parts.length > sharedTripLimit) return { places: [], mode: 'auto' };
  return {
    places: [...new Set(parts)].filter(id => byId.has(id)).map(id => byId.get(id)),
    mode: params.get('move') === 'pd' ? 'pd' : 'auto'
  };
}
