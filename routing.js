import { routePoints } from './trip.js';

const streetService = 'https://routing.openstreetmap.de/';
const maxStops = 20;
const maxSnapDistance = 200;
const routeCache = new Map();
let lastRequest = 0;
let activeRequest = null;

export function routeRequest(places, mode) {
  const points = routePoints(places);
  if (new Set(points.map(({ lat, lon }) => lat + ',' + lon)).size < 2) return { issue: 'few' };
  if (points.length > maxStops) return { issue: 'many', maxStops };
  const coordinates = points.map(({ lat, lon }) => lon + ',' + lat).join(';');
  const profile = mode === 'pd' ? 'foot' : 'car';
  const url = new URL('routed-' + profile + '/route/v1/driving/' + coordinates, streetService);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('steps', 'false');
  url.searchParams.set('generate_hints', 'false');
  url.searchParams.set('radiuses', points.map(() => maxSnapDistance).join(';'));
  return { url: url.href, points };
}

function parseRoute(answer, request) {
  const route = answer.routes?.[0];
  if (answer.code !== 'Ok' || !route) return { issue: 'missing' };
  if (answer.waypoints?.length !== request.points.length || answer.waypoints.some(point => point.distance > maxSnapDistance)) {
    return { issue: 'missing' };
  }
  const coords = route.geometry?.coordinates;
  if (route.geometry?.type !== 'LineString' || !Array.isArray(coords) || coords.length < 2 ||
    !coords.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)) ||
    !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) return { issue: 'unavailable' };
  return {
    points: coords.map(([lon, lat]) => ({ lat, lon })),
    km: route.distance / 1000,
    minutes: Math.max(1, Math.round(route.duration / 60))
  };
}

export async function requestRoadPath(request) {
  if (request.issue) return request;
  if (routeCache.has(request.url)) return routeCache.get(request.url);
  if (activeRequest?.url === request.url) return activeRequest.promise;
  if (activeRequest || Date.now() - lastRequest < 1100) return { issue: 'busy' };
  lastRequest = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8500);

  const promise = (async () => {
    try {
      const response = await fetch(request.url, { signal: controller.signal, referrerPolicy: 'origin', credentials: 'omit' });
      if (!response.ok && response.status !== 400) return { issue: 'unavailable' };
      const result = parseRoute(await response.json(), request);
      if (!result.issue) {
        if (routeCache.size === 8) routeCache.delete(routeCache.keys().next().value);
        routeCache.set(request.url, result);
      }
      return result;
    } catch {
      return { issue: 'unavailable' };
    } finally {
      clearTimeout(timer);
      activeRequest = null;
    }
  })();
  activeRequest = { url: request.url, promise };
  return promise;
}
