import type { AreaData, XZ } from '../world/area';

/**
 * The map: a small round plan in the corner that follows the walker, and the same plan full-screen
 * (pan, zoom, street names, and a note on where every layer of it comes from).
 *
 * It is drawn from public/data/area.json, so it shows exactly what stands in the 3D world. The note
 * in ABOUT_HTML must be kept in step with docs/map-sources.md and with tools/build-area.mjs.
 */
export interface MapPose { x: number; z: number; yaw: number }
export interface MapHooks { onOpen(): void; onClose(): void }
export interface MapUI {
  readonly isOpen: boolean;
  /** The corner map shows while walking and hides on the title and pause screens. */
  setWalking(v: boolean): void;
  open(): void;
  close(): void;
  /** Once a frame: redraws whichever map is showing, only if something changed. */
  update(): void;
}

// A dark plan in the game's own colours: a warm black a step below its screens (style.css body,
// #1a1714), cream ink, and the amber of its jog ring. The legend swatches read these too.
const GROUND = '#100e0b';
const SQUARE = '#19150f';
const INK = '#f4efe6';
const TODAY = { fill: '#2a241d', line: '#4e4336' };                 // houses on today's plots
const PLAN = { fill: '#1e262e', line: '#465a6b', hatch: '#63777f' }; // houses redrawn from the 1842 plan
const HALL = { fill: '#a98650', line: '#d8ba84' };                  // Town Hall and St Casimir's
const STREET = 'rgba(244, 239, 230, 0.15)';
const STREET_NAME = 'rgba(244, 239, 230, 0.72)';
const EDGE = 'rgba(233, 184, 114, 0.85)';
const HALO = 'rgba(16, 14, 11, 0.92)';
const VEIL = 'rgba(16, 14, 11, 0.66)';
const YOU = '#ff6a3d';

const MINI_SPAN = 170;       // metres across the corner map
const S_MAX = 9;             // closest zoom of the full map, CSS px per metre
const ZOOM_STEP = 1.6;       // the + and - buttons

interface Box { x0: number; z0: number; x1: number; z1: number }
interface Shape extends Box { path: Path2D }
type RoadClass = 'main' | 'street' | 'lane' | 'foot';
interface Road extends Shape { cls: RoadClass }
interface Label { text: string; x: number; z: number; ang: number; len: number; main: boolean }
interface Layers {
  areas: Shape[];
  roads: Record<RoadClass, Road[]>;
  today: Shape[];
  plan: Shape[];
  hall: Shape[];
  labels: Label[];
  square: { text: string; x: number; z: number } | null;
  landmarks: { text: string; x: number; z: number }[];
  veil: Path2D;
  edge: Path2D;
  centre: XZ;
  radius: number;
}
interface View { cx: number; cz: number; s: number }

const ROAD_CLASS: Record<string, RoadClass> = {
  primary: 'main', secondary: 'main',
  residential: 'street', living_street: 'street', unclassified: 'street', pedestrian: 'street',
  service: 'lane', footway: 'foot', steps: 'foot',
};

function shapeOf(rings: XZ[][], close: boolean): Shape {
  const path = new Path2D();
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  rings.forEach((ring, k) => {
    ring.forEach(([x, z], i) => {
      if (i) path.lineTo(x, z); else path.moveTo(x, z);
      if (k === 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    });
    if (close) path.closePath();
  });
  return { path, x0, z0, x1, z1 };
}

const centroid = (ring: XZ[]): XZ => [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length];

/** The point half way along a polyline, and the direction of the line there. */
function midpoint(line: XZ[]): { x: number; z: number; ang: number; len: number } {
  let len = 0;
  for (let i = 1; i < line.length; i++) len += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  let run = len / 2;
  for (let i = 1; i < line.length; i++) {
    const dx = line[i][0] - line[i - 1][0], dz = line[i][1] - line[i - 1][1], d = Math.hypot(dx, dz);
    if (run <= d || i === line.length - 1) {
      const t = d ? run / d : 0;
      let ang = Math.atan2(dz, dx);
      if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI; // read left to right
      return { x: line[i - 1][0] + dx * t, z: line[i - 1][1] + dz * t, ang, len };
    }
    run -= d;
  }
  return { x: line[0][0], z: line[0][1], ang: 0, len };
}

function prepare(data: AreaData): Layers {
  const [thx, thz] = data.meta.townHall;
  const radius = data.meta.walkRadius;
  const named = data.areas.find(a => a.name);
  const roads: Layers['roads'] = { main: [], street: [], lane: [], foot: [] };
  const labels: Label[] = [];
  for (const r of data.roads) {
    const cls = ROAD_CLASS[r.kind];
    if (!cls || r.tunnel || r.line.length < 2) continue;
    roads[cls].push({ ...shapeOf([r.line], false), cls });
    if (r.name && cls !== 'foot' && r.name !== named?.name) { // the square is named once, across it
      const m = midpoint(r.line);
      if (m.len >= 30) labels.push({ text: r.name, x: m.x, z: m.z, ang: m.ang, len: m.len, main: cls === 'main' || r.name === 'Didžioji g.' });
    }
  }
  labels.sort((a, b) => b.len - a.len);
  const today: Shape[] = [], plan: Shape[] = [], hall: Shape[] = [];
  const landmarks: Layers['landmarks'] = [];
  for (const b of data.buildings) {
    const s = shapeOf(b.rings, true);
    if (b.role === 'recon') plan.push(s);
    else if (b.role === 'townhall' || b.role === 'stcasimir') {
      hall.push(s);
      const [x, z] = centroid(b.rings[0]);
      landmarks.push({ text: b.role === 'townhall' ? 'Town Hall' : "St Casimir's", x, z });
    } else today.push(s);
  }
  const veil = new Path2D();
  veil.rect(-6000, -6000, 12000, 12000);
  veil.arc(thx, thz, radius, 0, Math.PI * 2);
  const edge = new Path2D();
  edge.arc(thx, thz, radius, 0, Math.PI * 2);
  return {
    areas: data.areas.map(a => shapeOf([a.ring], true)),
    roads, today, plan, hall, labels, landmarks, veil, edge,
    square: named ? { text: named.name!, x: centroid(named.ring)[0], z: centroid(named.ring)[1] } : null,
    centre: [thx, thz], radius,
  };
}

/** A fine diagonal hatch that stays one device pixel thick however far the map is zoomed. */
function hatchPattern(g: CanvasRenderingContext2D, dpr: number): CanvasPattern | null {
  const n = Math.max(4, Math.round(5 * dpr));
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const h = c.getContext('2d')!;
  h.strokeStyle = PLAN.hatch;
  h.globalAlpha = 0.5;
  h.lineWidth = Math.max(1, dpr * 0.9);
  h.beginPath();
  h.moveTo(-1, n + 1); h.lineTo(n + 1, -1);
  h.moveTo(-1, 1); h.lineTo(1, -1);
  h.moveTo(n - 1, n + 1); h.lineTo(n + 1, n - 1);
  h.stroke();
  return g.createPattern(c, 'repeat');
}

function drawMap(g: CanvasRenderingContext2D, W: number, H: number, dpr: number, v: View, pose: MapPose, L: Layers, hatch: CanvasPattern | null, full: boolean): void {
  const s = v.s;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = GROUND;
  g.fillRect(0, 0, W, H);
  g.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W / 2 - v.cx * s), dpr * (H / 2 - v.cz * s));
  const x0 = v.cx - W / 2 / s, x1 = v.cx + W / 2 / s, z0 = v.cz - H / 2 / s, z1 = v.cz + H / 2 / s;
  const seen = (b: Box) => b.x1 >= x0 && b.x0 <= x1 && b.z1 >= z0 && b.z0 <= z1;
  const px = 1 / s; // one CSS pixel, in metres

  g.fillStyle = SQUARE;
  for (const a of L.areas) if (seen(a)) g.fill(a.path);

  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = STREET;
  for (const cls of ['foot', 'lane', 'street', 'main'] as const) {
    g.lineWidth = px * (cls === 'main' ? 1.6 : cls === 'street' ? 1.2 : 0.9);
    g.setLineDash(cls === 'foot' ? [3 * px, 3 * px] : []);
    for (const r of L.roads[cls]) if (seen(r)) g.stroke(r.path);
  }
  g.setLineDash([]);

  g.lineWidth = px;
  g.strokeStyle = TODAY.line;
  g.fillStyle = TODAY.fill;
  for (const b of L.today) if (seen(b)) { g.fill(b.path, 'evenodd'); g.stroke(b.path); }

  g.fillStyle = PLAN.fill;
  g.strokeStyle = PLAN.line;
  for (const b of L.plan) if (seen(b)) { g.fill(b.path, 'evenodd'); }
  if (hatch) {
    hatch.setTransform(new DOMMatrix().scale(1 / (dpr * s)));
    g.fillStyle = hatch;
    for (const b of L.plan) if (seen(b)) g.fill(b.path, 'evenodd');
  }
  for (const b of L.plan) if (seen(b)) g.stroke(b.path);

  g.fillStyle = HALL.fill;
  g.strokeStyle = HALL.line;
  for (const b of L.hall) if (seen(b)) { g.fill(b.path, 'evenodd'); g.stroke(b.path); }

  // Past the walk the town is only to be looked at: fade it, and mark the edge.
  g.fillStyle = VEIL;
  g.fill(L.veil, 'evenodd');
  g.strokeStyle = EDGE;
  g.lineWidth = px * (full ? 1.6 : 1.3);
  g.setLineDash([6 * px, 5 * px]);
  g.stroke(L.edge);
  g.setLineDash([]);

  // Screen space from here: labels and the walker.
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sx = (x: number) => W / 2 + (x - v.cx) * s, sy = (z: number) => H / 2 + (z - v.cz) * s;
  if (full) drawLabels(g, W, H, v, L, sx, sy);
  drawYou(g, sx(pose.x), sy(pose.z), pose.yaw, full);
  if (full) {
    g.font = '600 12px Georgia, serif';
    g.textAlign = 'left';
    g.fillStyle = INK;
    halo(g, 'You', sx(pose.x) + 12, sy(pose.z) + 4);
  }
}

function halo(g: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  g.lineWidth = 3.5;
  g.lineJoin = 'round';
  g.strokeStyle = HALO;
  g.strokeText(text, x, y);
  g.fillText(text, x, y);
}

function drawLabels(g: CanvasRenderingContext2D, W: number, H: number, v: View, L: Layers, sx: (x: number) => number, sy: (z: number) => number): void {
  const s = v.s;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = INK;
  const placed: { x: number; y: number; r: number; name: string }[] = [];
  const room = (x: number, y: number, r: number, name: string) => placed.every(p => Math.hypot(p.x - x, p.y - y) > (p.name === name ? 150 : p.r + r));

  // Places first: the square, the two landmarks, the edge of the walk.
  if (L.square && s > 0.9) {
    g.font = 'italic 600 13px Georgia, serif';
    const text = L.square.text.toUpperCase().split('').join('\u200A'), x = sx(L.square.x), y = sy(L.square.z);
    halo(g, text, x, y);
    placed.push({ x, y, r: g.measureText(text).width / 2 + 4, name: text });
  }
  g.font = '600 12.5px Georgia, serif';
  for (const m of L.landmarks) {
    const x = sx(m.x), y = sy(m.z);
    if (x < -60 || y < -20 || x > W + 60 || y > H + 20) continue;
    halo(g, m.text, x, y + 4);
    placed.push({ x, y, r: g.measureText(m.text).width / 2 + 6, name: m.text });
  }
  if (s > 0.7) {
    g.font = 'italic 11px Georgia, serif';
    g.fillStyle = '#e9b872';
    const x = sx(L.centre[0]), y = sy(L.centre[1] - L.radius) + 15;
    halo(g, 'edge of the walk', x, y);
    placed.push({ x, y, r: g.measureText('edge of the walk').width / 2 + 4, name: 'edge' });
  }

  // Streets, longest first, each only where its name fits along it.
  g.fillStyle = STREET_NAME;
  for (const l of L.labels) {
    const x = sx(l.x), y = sy(l.z);
    if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
    g.font = `italic ${l.main ? 13 : 11.5}px Georgia, serif`;
    const w = g.measureText(l.text).width;
    if (w + 14 > l.len * s) continue;
    const r = w / 2 * 0.9 + 4;
    if (!room(x, y, r, l.text)) continue;
    placed.push({ x, y, r, name: l.text });
    g.save();
    g.translate(x, y);
    g.rotate(l.ang);
    halo(g, l.text, 0, 4);
    g.restore();
  }
}

function drawYou(g: CanvasRenderingContext2D, x: number, y: number, yaw: number, full: boolean): void {
  // yaw 0 looks along -Z (north); forward is (-sin, -cos) on the ground, which is the screen's (x, y)
  const a = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
  const R = full ? 34 : 30, half = 0.62;
  const grad = g.createRadialGradient(x, y, 4, x, y, R);
  grad.addColorStop(0, 'rgba(255, 106, 61, 0.6)');
  grad.addColorStop(1, 'rgba(255, 106, 61, 0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(x, y);
  g.arc(x, y, R, a - half, a + half);
  g.closePath();
  g.fill();
  g.beginPath();
  g.arc(x, y, 5.5, 0, Math.PI * 2);
  g.fillStyle = YOU;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = INK;
  g.stroke();
}

const ABOUT_HTML = (walk: number) => `
  <p>This is a plan of the town you are walking through, set around 1900. It is not a copy of one old
  map. No survey of the square from 1900 has been used yet: the plan is put together from newer data,
  and redrawn from an older plan where the two disagree.</p>
  <dl>
    <dt><i class="sw today"></i>Houses on today's plots</dt>
    <dd><b>Source:</b> the national cadastre (GRPK), Nacionalinė žemės tarnyba, downloaded September 2026.
    <b>Time:</b> today. Each plot is taken to hold a house of about 1900, and a few post-war buildings are left out.</dd>
    <dt><i class="sw plan"></i>Houses from the 1842 plan</dt>
    <dd><b>Source:</b> the 1842 plan of Vilnius, National Library of Poland (Polona). <b>Time:</b> 1842.
    West of the square, around Vokiečių and Rūdninkų, today's buildings are mostly post-war, so the blocks
    are traced from the plan and fitted to today's map to within a few metres. The lines between plots and
    the number of storeys are guesses.</dd>
    <dt><i class="sw hall"></i>Town Hall and St Casimir's</dt>
    <dd>Modelled by hand: the Town Hall as it was finished in 1799, the church in its Orthodox form after the
    rebuilding of 1864–68, from the heritage register and period pictures.</dd>
    <dt><i class="sw street"></i>Streets and names</dt>
    <dd><b>Source:</b> OpenStreetMap, September 2026. <b>Time:</b> today. These are today's street lines and
    today's names. Around 1900 many streets had other, Russian names.</dd>
    <dt><i class="sw walk"></i>Edge of the walk</dt>
    <dd>You can walk ${walk} m from the Town Hall. Past the dashed line the town is there to be seen, not walked.</dd>
  </dl>
  <p class="dim">The 1866 plan of Vilnius is in the project files to check against, but it is not drawn here.
  No plan made around 1900 is used yet.</p>
  <p class="dim">GRPK © Nacionalinė žemės tarnyba prie Aplinkos ministerijos, CC BY 4.0 · © OpenStreetMap
  contributors, ODbL · 1842 plan: public domain.</p>`;

const ICON = {
  plus: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 3V15M3 9H15"/></svg>',
  minus: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M3 9H15"/></svg>',
  here: '<svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="3.2"/><path d="M10 2V5.5M10 14.5V18M2 10H5.5M14.5 10H18"/></svg>',
};

export function createMap(data: AreaData, pose: () => MapPose, hooks: MapHooks): MapUI {
  const L = prepare(data);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // The corner map
  const mini = document.createElement('button');
  mini.type = 'button';
  mini.className = 'minimap';
  mini.hidden = true;
  mini.title = 'Map (Tab)';
  mini.setAttribute('aria-label', 'Open the map');
  mini.innerHTML = '<canvas></canvas><span class="n" aria-hidden="true">N</span>';
  const miniCanvas = mini.querySelector('canvas')!;
  const miniG = miniCanvas.getContext('2d')!;

  // The full map
  const full = document.createElement('div');
  full.className = 'mapview';
  full.hidden = true;
  full.setAttribute('role', 'dialog');
  full.setAttribute('aria-label', 'Map of the walk');
  full.innerHTML = `
    <canvas></canvas>
    <div class="mv-title"><h2>Town Hall Square · c. 1900</h2><p>A plan of the walk, and what it is made from</p><div class="mv-scale"><i></i><span></span></div></div>
    <button type="button" class="mv-btn mv-close"><span class="long">Back to the walk</span><span class="short">Back</span> <kbd>Tab</kbd></button>
    <div class="mv-zoom">
      <button type="button" class="mv-btn mv-icon" data-zoom="in" aria-label="Zoom in">${ICON.plus}</button>
      <button type="button" class="mv-btn mv-icon" data-zoom="out" aria-label="Zoom out">${ICON.minus}</button>
      <button type="button" class="mv-btn mv-icon" data-here aria-label="Show where I am">${ICON.here}</button>
    </div>
    <aside class="mv-about">
      <button type="button" class="mv-about-head" aria-expanded="true"><span>About this map</span><i aria-hidden="true"></i></button>
      <div class="mv-about-body">${ABOUT_HTML(L.radius)}</div>
    </aside>`;
  const canvas = full.querySelector('canvas')!;
  const g = canvas.getContext('2d')!;
  const scaleBar = full.querySelector<HTMLElement>('.mv-scale')!;
  const scaleLine = scaleBar.querySelector('i')!, scaleText = scaleBar.querySelector('span')!;
  const aboutHead = full.querySelector<HTMLButtonElement>('.mv-about-head')!;
  const closeBtn = full.querySelector<HTMLButtonElement>('.mv-close')!;
  const hatchFull = hatchPattern(g, dpr), hatchMini = hatchPattern(miniG, dpr);
  document.body.append(mini, full);
  // One palette: the constants above also colour the two containers and the legend swatches (style.css)
  const palette: Record<string, string> = {
    '--map-ground': GROUND, '--sw-today': TODAY.fill, '--sw-today-line': TODAY.line, '--sw-plan': PLAN.fill,
    '--sw-plan-line': PLAN.line, '--sw-hatch': PLAN.hatch, '--sw-hall': HALL.fill, '--sw-hall-line': HALL.line, '--sw-edge': EDGE,
  };
  for (const el of [mini, full]) for (const [name, value] of Object.entries(palette)) el.style.setProperty(name, value);

  let walking = false, isOpen = false, dirty = true;
  let miniSize = 0, last = { x: NaN, z: NaN, yaw: NaN };
  let W = 0, H = 0;
  const view: View = { cx: L.centre[0], cz: L.centre[1], s: 1 };

  const sMin = () => Math.min(W, H) / 1000;
  const narrow = () => window.matchMedia('(max-width: 760px)').matches;
  /** Screen the walk wants: the whole walkable circle, clear of the note on the right. */
  const inset = () => (!narrow() && !full.classList.contains('about-closed') ? 372 : 0);
  const fit = () => {
    const free = Math.max(160, W - inset());
    view.s = Math.min(S_MAX, Math.max(sMin(), Math.min(free, H - (narrow() ? 200 : 150)) / (L.radius * 2 + 40)));
    view.cx = L.centre[0] + inset() / 2 / view.s;
    view.cz = L.centre[1];
  };
  const clamp = () => {
    view.s = Math.min(S_MAX, Math.max(sMin(), view.s));
    const reach = data.meta.contextRadius + 60;
    view.cx = Math.min(L.centre[0] + reach, Math.max(L.centre[0] - reach, view.cx));
    view.cz = Math.min(L.centre[1] + reach, Math.max(L.centre[1] - reach, view.cz));
    dirty = true;
  };
  const zoomAt = (px: number, py: number, k: number) => {
    const wx = view.cx + (px - W / 2) / view.s, wz = view.cz + (py - H / 2) / view.s;
    view.s *= k;
    view.s = Math.min(S_MAX, Math.max(sMin(), view.s));
    view.cx = wx - (px - W / 2) / view.s;
    view.cz = wz - (py - H / 2) / view.s;
    clamp();
  };
  const sizeFull = () => {
    W = window.innerWidth; H = window.innerHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    dirty = true;
  };
  const drawFull = () => {
    drawMap(g, W, H, dpr, view, pose(), L, hatchFull, true);
    // scale bar: the longest round number of metres that fits in about 120 px
    const want = 120 / view.s;
    const metres = [5, 10, 20, 25, 50, 100, 200, 250, 500].reduce((b, m) => (m <= want ? m : b), 5);
    scaleLine.style.width = `${Math.round(metres * view.s)}px`;
    scaleText.textContent = `${metres} m`;
  };
  const drawMini = () => {
    const p = pose();
    const size = mini.clientWidth;
    if (!size) return;
    if (size !== miniSize) { miniSize = size; miniCanvas.width = miniCanvas.height = Math.round(size * dpr); last.x = NaN; }
    if (Math.abs(p.x - last.x) < 0.03 && Math.abs(p.z - last.z) < 0.03 && Math.abs(p.yaw - last.yaw) < 0.004) return;
    last = { x: p.x, z: p.z, yaw: p.yaw };
    drawMap(miniG, size, size, dpr, { cx: p.x, cz: p.z, s: size / MINI_SPAN }, p, L, hatchMini, false);
  };

  const setAbout = (openIt: boolean) => {
    full.classList.toggle('about-closed', !openIt);
    aboutHead.setAttribute('aria-expanded', String(openIt));
    dirty = true;
  };
  const open = () => {
    if (isOpen || !walking) return;
    isOpen = true;
    full.hidden = false;
    setAbout(!narrow());
    sizeFull();
    fit();
    dirty = true;
    hooks.onOpen();
    closeBtn.focus({ preventScroll: true });
  };
  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    full.hidden = true;
    (document.activeElement as HTMLElement | null)?.blur();
    last.x = NaN;
    hooks.onClose();
  };

  mini.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  aboutHead.addEventListener('click', () => setAbout(full.classList.contains('about-closed')));
  full.querySelectorAll<HTMLElement>('[data-zoom]').forEach(b => b.addEventListener('click', () => {
    zoomAt(W / 2, H / 2, b.dataset.zoom === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP);
  }));
  full.querySelector('[data-here]')!.addEventListener('click', () => {
    const p = pose();
    view.s = Math.max(view.s, 2.2);
    view.cx = p.x + inset() / 2 / view.s;
    view.cz = p.z;
    clamp();
  });
  window.addEventListener('resize', () => { if (isOpen) sizeFull(); last.x = NaN; });

  // Tab opens and closes the map while walking; Esc closes it; + - and the arrows work it from the keyboard.
  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Tab' && !e.shiftKey && (walking || isOpen)) { e.preventDefault(); if (isOpen) close(); else open(); return; }
    if (!isOpen) return;
    if (e.code === 'Escape') { e.preventDefault(); close(); return; }
    const pan = 60 / view.s;
    if (e.code === 'Equal' || e.code === 'NumpadAdd') zoomAt(W / 2, H / 2, ZOOM_STEP);
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract') zoomAt(W / 2, H / 2, 1 / ZOOM_STEP);
    else if (e.code === 'ArrowLeft') { view.cx -= pan; clamp(); }
    else if (e.code === 'ArrowRight') { view.cx += pan; clamp(); }
    else if (e.code === 'ArrowUp') { view.cz -= pan; clamp(); }
    else if (e.code === 'ArrowDown') { view.cz += pan; clamp(); }
    else return;
    e.preventDefault();
  });

  // Pan by dragging, pinch with two fingers, wheel to zoom about the cursor.
  const pointers = new Map<number, { x: number; y: number }>();
  const spread = () => { const [a, b] = [...pointers.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.classList.add('grab');
  });
  canvas.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (pointers.size === 2) {
      const before = spread();
      const [a, b] = [...pointers.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      p.x = e.clientX; p.y = e.clientY;
      const after = spread();
      if (before && after) zoomAt(mx, my, after / before);
      return;
    }
    view.cx -= (e.clientX - p.x) / view.s;
    view.cz -= (e.clientY - p.y) / view.s;
    p.x = e.clientX; p.y = e.clientY;
    clamp();
  });
  const lift = (e: PointerEvent) => { pointers.delete(e.pointerId); if (!pointers.size) canvas.classList.remove('grab'); };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    e.stopPropagation(); // the walk's own wheel handler must not bank the scroll as camera zoom
    const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    zoomAt(e.clientX, e.clientY, Math.exp(-px * 0.0016));
  }, { passive: false });

  return {
    get isOpen() { return isOpen; },
    setWalking(v: boolean) {
      walking = v;
      if (!v && isOpen) { isOpen = false; full.hidden = true; } // paused from under it: the pause screen takes over
      mini.hidden = !v || isOpen;
      if (v) last.x = NaN;
    },
    open, close,
    update() {
      if (isOpen) {
        mini.hidden = true;
        if (dirty) { drawFull(); dirty = false; }
      } else if (walking) {
        mini.hidden = false;
        drawMini();
      }
    },
  };
}
