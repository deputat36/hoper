export const earthRadiusKm = 6371.0088;
const rad = Math.PI / 180;

export function worldPosition({ lat, lon }) {
  const phi = Math.max(-85.05112878, Math.min(85.05112878, lat)) * rad;
  return { x: (lon + 180) / 360, y: (1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2 };
}

export function rangeRing(center, distanceKm) {
  const lat = center.lat * rad;
  const lon = center.lon * rad;
  const distance = distanceKm / earthRadiusKm;
  return Array.from({ length: 96 }, (_, index) => {
    const heading = index / 96 * 2 * Math.PI;
    const edgeLat = Math.asin(Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(heading));
    const edgeLon = lon + Math.atan2(
      Math.sin(heading) * Math.sin(distance) * Math.cos(lat),
      Math.cos(distance) - Math.sin(lat) * Math.sin(edgeLat)
    );
    return { lat: edgeLat / rad, lon: edgeLon / rad };
  });
}

export function createTileLayer(pane, onChange) {
  const tiles = new Map();
  let status = 'idle';

  function updateStatus() {
    const states = [...tiles.values()].map(tile => tile.state);
    const next = states.includes('loaded') ? 'online' : states.includes('loading') ? 'loading' : 'unavailable';
    if (next === status) return;
    status = next;
    onChange();
  }

  function sync({ size, left, top, width, height, enabled }) {
    pane.hidden = !enabled;
    if (!enabled) return;
    const zoom = Math.max(4, Math.min(16, Math.round(Math.log2(size / 256))));
    const n = 2 ** zoom;
    const span = size / n;
    const fromX = Math.max(0, Math.floor(-left / span));
    const toX = Math.min(n - 1, Math.floor((width - left - 1) / span));
    const fromY = Math.max(0, Math.floor(-top / span));
    const toY = Math.min(n - 1, Math.floor((height - top - 1) / span));
    const visible = new Set();

    for (let y = fromY; y <= toY; y += 1) {
      for (let x = fromX; x <= toX; x += 1) {
        const key = zoom + '/' + x + '/' + y;
        visible.add(key);
        let tile = tiles.get(key);
        if (!tile) {
          const img = document.createElement('img');
          img.alt = '';
          img.draggable = false;
          img.decoding = 'async';
          img.referrerPolicy = 'origin';
          tile = { img, state: 'loading' };
          const done = state => {
            if (tiles.get(key) !== tile) return;
            tile.state = state;
            img.classList.toggle('loaded', state === 'loaded');
            updateStatus();
          };
          img.addEventListener('load', () => done('loaded'), { once: true });
          img.addEventListener('error', () => done('failed'), { once: true });
          tiles.set(key, tile);
          img.src = 'https://tile.openstreetmap.org/' + key + '.png';
          pane.append(img);
        }
        const x1 = Math.round(left + x * span);
        const y1 = Math.round(top + y * span);
        tile.img.style.cssText = 'left:' + x1 + 'px;top:' + y1 + 'px;width:' +
          (Math.round(left + (x + 1) * span) - x1) + 'px;height:' +
          (Math.round(top + (y + 1) * span) - y1) + 'px';
      }
    }
    for (const [key, tile] of tiles) {
      if (!visible.has(key)) {
        tile.img.remove();
        tiles.delete(key);
      }
    }
    updateStatus();
  }

  return { sync, status: () => status };
}
