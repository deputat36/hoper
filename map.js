import { createTileLayer, earthRadiusKm, rangeRing, worldPosition } from './basemap.js';

export function createMap({ canvas, tiles, pins, out, attribution, status, center, placeLink, escape, icon }) {
  const ctx = canvas.getContext('2d');
  const centerWorld = worldPosition(center);
  const worldKm = 2 * Math.PI * earthRadiusKm * Math.cos(center.lat * Math.PI / 180);
  const zero = { x: 0, y: 0 };
  const view = { x: 0, y: 0, zoom: 1 };
  const rings = [25, 50, 75, 100].map(km => ({ km, points: rangeRing(center, km).map(project) }));
  const messages = { loading:'Загружаем карту дорог', unavailable:'Карта дорог недоступна. Показана схема', scheme:'Схема по координатам' };
  const basemap = createTileLayer(tiles, () => requestAnimationFrame(() => drawCanvas(frame())));
  let places = [];
  let groups = [];
  let order = new Map();
  let road = [];
  let selected = null;
  let drag = null;
  let pendingFrame;
  let showBasemap = true;

  function project(place) {
    const world = worldPosition(place);
    return { x: (world.x - centerWorld.x) * worldKm, y: (world.y - centerWorld.y) * worldKm };
  }

  function frame() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const overview = Math.min(width, height) / 232;
    return { width, height, overview, scale: overview * view.zoom };
  }

  function coords(point, f) {
    return { x: f.width / 2 + (point.x + view.x) * f.scale, y: f.height / 2 + (point.y + view.y) * f.scale };
  }

  function path(points, f, close = false) {
    ctx.beginPath();
    points.forEach((point, index) => {
      const { x, y } = coords(point, f);
      if (index) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    if (close) ctx.closePath();
  }

  function label(text, x, y, color = '#365147') {
    ctx.strokeStyle = '#f7f8ee';
    ctx.lineWidth = 3;
    ctx.fillStyle = color;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }

  function drawCanvas(f) {
    if (!ctx || !f.width || !f.height) return;
    const mode = showBasemap ? basemap.status() : 'scheme';
    attribution.hidden = !showBasemap && !road.length;
    const message = messages[mode] || '';
    status.hidden = !message;
    if (status.textContent !== message) status.textContent = message;

    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(f.width * ratio);
    canvas.height = Math.round(f.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const middle = coords(zero, f);
    if (mode !== 'online') {
      ctx.fillStyle = '#ebeee2';
      ctx.fillRect(0, 0, f.width, f.height);
      ctx.save();
      path(rings.at(-1).points, f, true);
      ctx.clip();
      ctx.fillStyle = '#e1ead5';
      ctx.fillRect(0, 0, f.width, f.height);
      ctx.strokeStyle = '#ccd7c1';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2, 3]);
      for (let n = -100; n <= 100; n += 20) {
        const { x, y } = coords({x:n,y:n}, f);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, f.height);
        ctx.moveTo(0, y);
        ctx.lineTo(f.width, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.font = '600 11px system-ui,sans-serif';
    ctx.textAlign = 'center';
    for (const { km, points } of rings) {
      path(points, f, true);
      ctx.strokeStyle = km === 100 ? '#46674c' : '#647f639c';
      ctx.lineWidth = km === 100 ? 1.6 : 1;
      ctx.setLineDash(km === 100 ? [] : [5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      const edge = coords(points[0], f);
      label(km + ' км', edge.x, edge.y + 14);
    }
    if (road.length > 1) {
      path(road, f);
      ctx.strokeStyle = '#fffaf0';
      ctx.lineWidth = 8;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.strokeStyle = '#1c634b';
      ctx.lineWidth = 4.5;
      ctx.stroke();
      ctx.lineJoin = 'miter';
      ctx.lineCap = 'butt';
    }
    ctx.fillStyle = '#244d3c';
    ctx.beginPath();
    ctx.arc(middle.x, middle.y, 4, 0, 2 * Math.PI);
    ctx.fill();
    if (mode !== 'online') {
      if (!order.size) label('Борисоглебск', middle.x, middle.y + 29);
      const taken = [];
      for (const group of [...groups].sort((a,b) => b.items.length - a.items.length)) {
        const town = group.items[0].locality;
        const x = group.x;
        const y = group.y - 23;
        const w = ctx.measureText(town).width / 2 + 5;
        if (group.items.length < 2 || town === 'Борисоглебск' || town.length > 25) continue;
        if (x-w < 8 || x+w > f.width-8 || y < 12 || taken.some(p => Math.abs(p.y-y)<16 && Math.abs(p.x-x)<p.w+w)) continue;
        if (groups.some(p => p !== group && Math.abs(p.y-y+5)<18 && Math.abs(p.x-x)<w+16)) continue;
        label(town, x, y);
        taken.push({x,y,w});
      }
    }
    ctx.textAlign = 'left';
    label('С ↑', 15, 24);
    const latitude = Math.atan(Math.sinh(Math.PI * (1 - 2 * (centerWorld.y - view.y / worldKm))));
    const pixelsPerKm = f.scale * Math.cos(center.lat * Math.PI / 180) / Math.cos(latitude);
    const km = [0.25,0.5,1,2,5,10,20,25,50,100].filter(n => n * pixelsPerKm < 106).at(-1) || 0.25;
    ctx.beginPath();
    ctx.moveTo(15, f.height-18);
    ctx.lineTo(15+km*pixelsPerKm, f.height-18);
    ctx.strokeStyle='#f7f8ee';
    ctx.lineWidth=4;
    ctx.stroke();
    ctx.strokeStyle='#244d3c';
    ctx.lineWidth=1.3;
    ctx.stroke();
    label(km < 1 ? km * 1000 + ' м' : km + ' км', 15, f.height-25);
  }

  function drawPins(f) {
    groups = [];
    for (const place of places) {
      const p = coords(project(place), f);
      if (p.x < -15 || p.y < -15 || p.x > f.width+15 || p.y > f.height+15) continue;
      const group = groups.find(g => Math.hypot(p.x-g.x, p.y-g.y) < 31);
      if (group) group.items.push(place);
      else groups.push({x:p.x,y:p.y,items:[place]});
    }
    pins.innerHTML = groups.map(({ x, y, items }, index) => {
      const first = items[0];
      const cluster = items.length > 1;
      const approximate = items.every(place => place.precision === 'locality');
      const caption = (cluster ? first.locality + ' · ' + items.length + ' мест' : first.name) + (approximate ? ' · ориентир' : '');
      const css = ['map-pin',cluster?'cluster':'',approximate?'approximate':'',order.size?'itinerary':''].filter(Boolean).join(' ');
      return '<button type="button" class="' + css + '" style="left:' + Math.round(x) + 'px;top:' + Math.round(y) +
        'px;--tone:var(--' + first.category + ')" data-pin="' + index + '" aria-label="' + escape(caption) +
        '" title="' + escape(caption) + '" aria-expanded="' + (first.id === selected) + '">' +
        (cluster ? items.length : order.get(first.id) || icon(first.category)) + '</button>';
    }).join('');
  }

  function refresh() {
    const f = frame();
    if (!f.width || !f.height) return;
    const size = f.scale * worldKm;
    const centerPoint = coords(zero, f);
    basemap.sync({ size, left:centerPoint.x-centerWorld.x*size, top:centerPoint.y-centerWorld.y*size,
      width:f.width, height:f.height, enabled:showBasemap });
    drawPins(f);
    drawCanvas(f);
  }

  function schedule() {
    if (pendingFrame) return;
    pendingFrame = requestAnimationFrame(() => { pendingFrame = null; refresh(); });
  }

  function selection(items = null) {
    const chosen = items || (order.size ? places : []);
    if (!chosen.length) {
      out.innerHTML = '<h3>Места на карте</h3><p>Выберите метку, чтобы открыть карточки.</p>';
      return;
    }
    const localities = [...new Set(chosen.map(place => place.locality))];
    const title = order.size ? 'Остановки маршрута' : localities.length === 1 ? localities[0] : 'Места рядом';
    out.innerHTML = '<h3>' + escape(title) + '</h3><ul>' + chosen.map(place =>
      '<li>' + (order.size ? '<strong>' + order.get(place.id) + '.</strong> ' : '') + placeLink(place) +
      (place.precision === 'locality' ? ' <small>· ориентир</small>' : '') + '</li>').join('') + '</ul>';
  }

  function reset(redraw = true) {
    Object.assign(view,{x:0,y:0,zoom:1});
    selected = null;
    selection();
    if (redraw) refresh();
  }

  function fit() {
    const f = frame();
    if (!f.overview || !places.length) return;
    const positions = road.length ? road : places.map(project);
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const {x, y} of positions) {
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    view.x = -(left + right) / 2;
    view.y = -(top + bottom) / 2;
    view.zoom = Math.min(27, Math.max(0.65, Math.min(
      (f.width-82)/Math.max(3,right-left), (f.height-98)/Math.max(3,bottom-top)
    )/f.overview));
  }

  function pan(dx,dy) {
    const { scale } = frame();
    if (!scale) return;
    view.x = Math.min(170, Math.max(-170, view.x + dx / scale));
    view.y = Math.min(170, Math.max(-170, view.y + dy / scale));
    schedule();
  }

  pins.addEventListener('click', event => {
    const button = event.target.closest('[data-pin]');
    if (!button) return;
    const group = groups[Number(button.dataset.pin)];
    if (!group) return;
    selected = group.items[0].id;
    pins.querySelectorAll('[data-pin]').forEach(item => item.setAttribute('aria-expanded', String(item === button)));
    selection(group.items);
    if (group.items.length === 1) out.querySelector('a')?.click();
    else if (event.detail) out.scrollIntoView({block:'nearest'});
  });
  pins.addEventListener('keydown', event => {
    if (event.target !== pins) return;
    const deltas = {ArrowUp:[0,38],ArrowDown:[0,-38],ArrowLeft:[38,0],ArrowRight:[-38,0]};
    if (!(event.key in deltas)) return;
    event.preventDefault();
    pan(...deltas[event.key]);
  });
  pins.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    drag = { x:event.clientX, y:event.clientY, id:event.pointerId };
    pins.setPointerCapture(event.pointerId);
    pins.classList.add('dragging');
  });
  pins.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    pan(event.clientX-drag.x, event.clientY-drag.y);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  for (const event of ['pointerup','pointercancel','lostpointercapture']) {
    pins.addEventListener(event, () => { drag = null; pins.classList.remove('dragging'); });
  }
  new ResizeObserver(() => { if (places.length) schedule(); }).observe(canvas);

  return {
    draw(rows,{itinerary=false,focus=false,roadPoints=[]}={}) {
      places = rows;
      order = itinerary ? new Map(rows.map((place,index) => [place.id,index+1])) : new Map();
      road = roadPoints.map(project);
      selected = null;
      selection();
      if (focus) fit();
      refresh();
    },
    reset,
    zoom(multiplier) { view.zoom = Math.min(48,Math.max(0.65,view.zoom*multiplier)); refresh(); },
    layer(active) { showBasemap = active; refresh(); }
  };
}
