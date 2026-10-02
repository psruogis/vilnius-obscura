import type { AreaData, XZ } from '../world/area';
import { WalkZone } from '../world/zone';
import { SUBACIUS_GATE, type GateLook } from '../world/subacius';
import { RUDNINKAI_GATE } from '../world/rudninkai';
import { LOST_GATES, lostGatePlan } from '../world/lostgates';
import { CITY_GATES, type CityGate } from '../world/citygates';
import { loadFonts } from './fonts';

/**
 * The map: a small round plan in the corner that follows the walker, and the same plan full-screen
 * (pan, zoom, street names, and a note on where every layer of it comes from).
 *
 * It is drawn from public/data/area.json, so it shows exactly what stands in the 3D world, in the
 * style of a vellum manuscript: ink, hatching, hand-wobbled outlines, in one of three looks (pastel, dark,
 * glow). The legend and the note in ABOUT_HTML must be kept in step with docs/map-sources.md and with
 * tools/build-area.mjs.
 */
export interface MapPose { x: number; z: number; yaw: number }
export interface MapHooks { onOpen(): void; onClose(): void; /** The player picked a look with the switch on the full map. */ onLook?(look: Look): void }
export interface MapUI {
  readonly isOpen: boolean;
  /** The corner map shows while walking and hides on the title and pause screens. */
  setWalking(v: boolean): void;
  open(): void;
  close(): void;
  /** Once a frame: redraws whichever map is showing, only if something changed. */
  update(): void;
  readonly look: Look;
  /** Shows the map in this look (does not call onLook: the caller already knows). */
  setLook(look: Look): void;
}

// ---- the look --------------------------------------------------------------------------------
/** The map comes in three looks: faded pastel ink on dusky vellum (the default), dark vellum in gold ink, and the
 *  dark one lit from behind. A look is one table of colours; nothing below it names a colour. */
export type Look = 'pastel' | 'dark' | 'glow';
const LOOKS: Look[] = ['pastel', 'dark', 'glow'];
interface Theme {
  glow: boolean;
  ground: string;
  grain: number; seed: number;                       // vellum: brightness noise, and the noise's seed
  fibre: string; fibreBase: number; fibreRange: number; // vellum: the few fibres (rgb, alpha = base + range * chance)
  square: string; foot: string;                      // open squares, footway dots
  todayFill: string; todayHat: string; todayLine: string; todayInk: string; // today's houses
  planFill: string; planHat: string; planLine: string; planInk: string;     // the 1842 plan
  hall: string; hallLine: string;                    // Town Hall and St Casimir's
  wall: string;                                      // the line of the city wall
  castle: string;                                    // the edge of the castles' precinct
  edge: string;                                      // the edge of the walk
  veil: string;                                      // rgb of the vellum, for what lies beyond the walk
  vignette: string; vignetteAlpha: number;           // the aged edge of the full map (rgb)
  you: string; youRgb: string; ring: string;
  text: string; name: string; halo: string; note: string; // place names, street names, their halo, the edge note
  compassDisc: string;
}
const DARK: Theme = {
  glow: false,
  ground: '#1e1710',                                 // dark umber vellum
  grain: 10, seed: 1234,
  fibre: '255, 240, 210', fibreBase: 0.02, fibreRange: 0.03,
  square: 'rgba(194, 160, 102, 0.07)', foot: 'rgba(232, 217, 182, 0.17)',
  todayFill: 'rgba(179, 144, 79, 0.09)', todayHat: 'rgba(179, 144, 79, 0.26)', todayLine: 'rgba(179, 144, 79, 0.78)', todayInk: '#b3904f', // gold ink
  planFill: 'rgba(70, 88, 82, 0.34)', planHat: 'rgba(150, 170, 160, 0.3)', planLine: 'rgba(150, 170, 160, 0.62)', planInk: '#96aaa0',       // cool grey-green
  hall: '#7b2a1b', hallLine: '#c9a45f',              // vermilion, gold-edged
  wall: 'rgba(170, 72, 44, 0.2)',
  castle: 'rgba(190, 92, 62, 0.62)',
  edge: 'rgba(201, 164, 95, 0.85)',
  veil: '30, 23, 16',
  vignette: '13, 10, 7', vignetteAlpha: 0.55,
  you: '#d24a26', youRgb: '210, 74, 38', ring: '#f0e2bd',
  text: '#f0e2bd', name: 'rgba(232, 217, 182, 0.84)', halo: 'rgba(24, 18, 12, 0.92)', note: '#c9a45f',
  compassDisc: 'rgba(20, 15, 10, 0.7)',
};
const THEMES: Record<Look, Theme> = {
  dark: DARK,
  // the same ink on warmer ground, with light given off by the ink and the landmarks
  glow: { ...DARK, glow: true, ground: '#2a1e13', seed: 4242, todayHat: 'rgba(179, 144, 79, 0.34)', planHat: 'rgba(150, 170, 160, 0.38)' },
  // faded and dark: a dusky ground with chalky pastel ink, low in contrast and see-through, so that layers blend
  pastel: {
    glow: false,
    ground: '#26221f',
    grain: 7, seed: 909,
    fibre: '255, 244, 224', fibreBase: 0.018, fibreRange: 0.025,
    square: 'rgba(230, 216, 188, 0.05)', foot: 'rgba(230, 216, 188, 0.16)',
    todayFill: 'rgba(214, 196, 158, 0.09)', todayHat: 'rgba(214, 196, 158, 0.15)', todayLine: 'rgba(214, 196, 158, 0.38)', todayInk: '#cdbb94', // sand
    planFill: 'rgba(120, 148, 148, 0.2)', planHat: 'rgba(170, 192, 190, 0.16)', planLine: 'rgba(170, 192, 190, 0.38)', planInk: '#a9bfbc',       // powder blue-green
    hall: 'rgba(176, 118, 106, 0.72)', hallLine: 'rgba(232, 214, 180, 0.7)', // dusty rose, cream-edged
    wall: 'rgba(176, 118, 106, 0.16)',
    castle: 'rgba(200, 146, 132, 0.5)',
    edge: 'rgba(214, 196, 158, 0.5)',
    veil: '38, 34, 31',
    vignette: '14, 12, 11', vignetteAlpha: 0.45,
    you: '#e2937a', youRgb: '226, 147, 122', ring: 'rgba(248, 239, 220, 0.92)',
    text: '#e6dcc6', name: 'rgba(222, 211, 190, 0.66)', halo: 'rgba(34, 30, 28, 0.85)', note: '#cdbb94',
    compassDisc: 'rgba(28, 24, 22, 0.5)',
  },
};
const F_STREET = 'italic 400 15px Almendra, Georgia, serif';
const F_MAIN = 'italic 700 18px Almendra, Georgia, serif';
const F_PLACE = '600 19px Cinzel, Georgia, serif';
const F_NOTE = 'italic 400 14px Almendra, Georgia, serif';
const F_GATE = '600 13px Cinzel, Georgia, serif';

const MINI_SPAN = 170;       // metres across the corner map
const S_MAX = 9;             // closest zoom of the full map, CSS px per metre
const ZOOM_STEP = 1.6;       // the + and - buttons
const WOBBLE = 0.22;         // metres an outline strays from the true line, as a hand's does
const CELL = 48;             // metres: hatching is drawn in chunks this size, only where it is on screen

// ---- geometry --------------------------------------------------------------------------------
interface Box { x0: number; z0: number; x1: number; z1: number }
interface Plot extends Box { path: Path2D }
interface Label { text: string; x: number; z: number; ang: number; len: number; main: boolean }
interface Hats { today: Chunks; plan: Chunks }
interface Layers {
  areas: Plot[];
  foot: Plot[];
  today: Plot[];
  plan: Plot[];
  hall: Plot[];
  todayRings: XZ[][][];
  planRings: XZ[][][];
  labels: Label[];
  square: { text: string; x: number; z: number } | null;
  landmarks: { text: string; x: number; z: number }[];
  veil: Path2D;
  edge: Path2D;
  /** The Subačius Gate (world/subacius.ts): standing, as in the walk by default, or gone, where it stood. */
  gate: Plot[];
  gateLook: GateLook;
  /** The ten gates of the city wall (world/citygates.ts). */
  gates: CityGate[];
  /** The rest of the Old Town out to the gates, and the wall's line (data/oldtown.json), once the full map has it. */
  old: { today: Plot[]; areas: Plot[]; wall: Plot | null; castle: Plot | null; castleWalls: Plot[]; monastery: Plot | null } | null;
  /** How far the full map pans: the town round the walk, and the gates. x0, z0, x1, z1. */
  reach: [number, number, number, number];
  centre: XZ;
  radius: number;
  /** The walk's bounding box: x0, z0, x1, z1. */
  walkBox: [number, number, number, number];
  hats: { fine?: Hats; coarse?: Hats };
}
interface View { cx: number; cz: number; s: number }

function hash2(a: number, b: number): number {
  let t = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  t = Math.imul(t ^ (t >>> 13), 1274126177);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967295;
}
/** Smooth value noise, 0 to 1, from world position: the same everywhere it is asked, so neighbours match. */
function noise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (hash2(xi, yi) * (1 - u) + hash2(xi + 1, yi) * u) * (1 - v) + (hash2(xi, yi + 1) * (1 - u) + hash2(xi + 1, yi + 1) * u) * v;
}

/** An outline that wanders a little from the true line, one point about every 1.3 m. */
function roughen(ring: XZ[]): XZ[] {
  const out: XZ[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const steps = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.3));
    for (let k = 0; k < steps; k++) {
      const t = k / steps, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      out.push([x + (noise(x * 0.42 + 11.3, z * 0.42 + 4.1) - 0.5) * 2 * WOBBLE, z + (noise(x * 0.42 + 71.7, z * 0.42 + 33.9) - 0.5) * 2 * WOBBLE]);
    }
  }
  return out;
}

function plotOf(rings: XZ[][], rough: boolean, close = true): Plot {
  const path = new Path2D();
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  rings.forEach((ring, k) => {
    const pts = rough ? roughen(ring) : ring;
    pts.forEach(([x, z], i) => {
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

/** Hatching kept in 48 m chunks, so a frame strokes only the chunks that are on screen. */
class Chunks {
  private cells = new Map<string, { path: Path2D; x0: number; z0: number }>();
  add(ax: number, az: number, bx: number, bz: number, qx: number, qz: number): void {
    const ix = Math.floor((ax + bx) / 2 / CELL), iz = Math.floor((az + bz) / 2 / CELL), key = `${ix},${iz}`;
    let c = this.cells.get(key);
    if (!c) { c = { path: new Path2D(), x0: ix * CELL, z0: iz * CELL }; this.cells.set(key, c); }
    c.path.moveTo(ax, az);
    c.path.quadraticCurveTo(qx, qz, bx, bz);
  }
  draw(g: CanvasRenderingContext2D, x0: number, z0: number, x1: number, z1: number): void {
    const m = 70; // a stroke can run this far out of its chunk
    for (const c of this.cells.values()) if (c.x0 + CELL + m >= x0 && c.x0 - m <= x1 && c.z0 + CELL + m >= z0 && c.z0 - m <= z1) g.stroke(c.path);
  }
}

/** Parallel lines at `deg`, `gap` metres apart, kept inside the rings (holes and all). Lines are laid on
 *  one grid for the whole map, so hatching carries on from one house into the next, as an engraver's does. */
function hatchRings(rings: XZ[][], deg: number, gap: number, out: Chunks): void {
  const a = deg * Math.PI / 180, ux = Math.cos(a), uz = Math.sin(a), vx = -uz, vz = ux;
  const R = rings.map(r => r.map(([x, z]): XZ => [x * ux + z * uz, x * vx + z * vz]));
  let vmin = Infinity, vmax = -Infinity;
  for (const r of R) for (const p of r) { vmin = Math.min(vmin, p[1]); vmax = Math.max(vmax, p[1]); }
  for (let v = Math.ceil(vmin / gap) * gap; v <= vmax; v += gap) {
    const us: number[] = [];
    for (const r of R) for (let i = 0; i < r.length; i++) {
      const p = r[i], q = r[(i + 1) % r.length];
      if ((p[1] <= v) !== (q[1] <= v)) us.push(p[0] + (v - p[1]) * (q[0] - p[0]) / (q[1] - p[1]));
    }
    us.sort((m, n) => m - n);
    for (let k = 0; k + 1 < us.length; k += 2) {
      const u0 = us[k], u1 = us[k + 1];
      if (u1 - u0 < 0.35) continue;
      const ax = u0 * ux + v * vx, az = u0 * uz + v * vz, bx = u1 * ux + v * vx, bz = u1 * uz + v * vz;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, bow = (noise(mx * 0.35 + 9, mz * 0.35 + 2) - 0.5) * 0.32;
      out.add(ax, az, bx, bz, mx + vx * bow, mz + vz * bow);
    }
  }
}
function hatchSet(all: XZ[][][], angles: number[], gap: number): Chunks {
  const set = new Chunks();
  for (const rings of all) for (const deg of angles) hatchRings(rings, deg, gap, set);
  return set;
}
/** Fine hatching for the full map, coarse for the corner map and for zoomed-out views. Built when first wanted. */
function hatsFor(L: Layers, kind: 'fine' | 'coarse'): Hats {
  return L.hats[kind] ??= kind === 'fine'
    ? { today: hatchSet(L.todayRings, [50], 1.05), plan: hatchSet(L.planRings, [50, -40], 1.15) }
    : { today: hatchSet(L.todayRings, [50], 2.3), plan: hatchSet(L.planRings, [50, -40], 2.5) };
}

function prepare(data: AreaData, gateLook: GateLook): Layers {
  const [thx, thz] = data.meta.townHall;
  const radius = data.meta.walkRadius;
  const named = data.areas.find(a => a.name);
  const foot: Plot[] = [], labels: Label[] = [];
  for (const r of data.roads) {
    if (r.tunnel || r.line.length < 2) continue;
    if (r.kind === 'footway' || r.kind === 'steps') { foot.push(plotOf([r.line], false, false)); continue; }
    if (r.name && r.name !== named?.name && ['primary', 'secondary', 'residential', 'living_street', 'unclassified', 'pedestrian'].includes(r.kind)) { // the square is named once, across it
      const m = midpoint(r.line);
      if (m.len >= 30) labels.push({ text: r.name, x: m.x, z: m.z, ang: m.ang, len: m.len, main: r.kind === 'primary' || r.kind === 'secondary' || r.name === 'Didžioji g.' });
    }
  }
  labels.sort((a, b) => b.len - a.len);
  const today: Plot[] = [], plan: Plot[] = [], hall: Plot[] = [], todayRings: XZ[][][] = [], planRings: XZ[][][] = [];
  const landmarks: Layers['landmarks'] = [];
  for (const b of data.buildings) {
    if (!b.rings[0] || b.rings[0].length < 3) continue;
    const s = plotOf(b.rings, true);
    if (b.role === 'recon') { plan.push(s); planRings.push(b.rings); }
    else if (b.role === 'townhall' || b.role === 'stcasimir') {
      hall.push(s);
      const [x, z] = centroid(b.rings[0]);
      landmarks.push({ text: b.role === 'townhall' ? 'Town Hall' : "St Casimir's", x, z });
    } else { today.push(s); todayRings.push(b.rings); }
  }
  for (const [g, dz] of [[SUBACIUS_GATE, 16], [RUDNINKAI_GATE, 18], [SAVIOUR_GATE, 16]] as const) landmarks.push({ text: gateLook === 'solid' ? g.name : `${g.name} site`, x: g.x, z: g.z + dz });
  // the walk's edge: the square and the road out to the gate (world/zone.ts)
  const zone = new WalkZone(data);
  const veil = new Path2D();
  veil.rect(-6000, -6000, 12000, 12000);
  const edge = new Path2D();
  for (const poly of zone.outline) for (const ring of poly) {
    for (const path of [veil, edge]) { ring.forEach(([x, z], i) => (i ? path.lineTo(x, z) : path.moveTo(x, z))); path.closePath(); }
  }
  return {
    areas: data.areas.map(a => plotOf([a.ring], false)),
    foot, today, plan, hall, todayRings, planRings, labels, landmarks, veil, edge,
    gate: [...SUBACIUS_GATE.plan, ...RUDNINKAI_GATE.plan, ...SAVIOUR_GATE.plan].map(r => plotOf([r], false)), gateLook,
    gates: CITY_GATES, old: null, reach: reachOf(data, CITY_GATES),
    square: named ? { text: named.name!, x: centroid(named.ring)[0], z: centroid(named.ring)[1] } : null,
    centre: [thx, thz], radius, walkBox: zone.box, hats: {},
  };
}

/** The Saviour's Gate, the one lost gate in the walk's world besides the Subačius and Rūdninkai gates (world/lostgates.ts). */
const SAVIOUR_GATE = lostGatePlan(LOST_GATES.find(g => g.key === 'saviour')!);

/** The castles the city wall met at the Castle Gate, and the Bernardine monastery that joined them on the east (OSM), named with the gates. */
const CASTLES = [{ name: 'Upper Castle', x: 241, z: -926 }, { name: 'Lower Castle', x: 110, z: -800 }, { name: 'Bernardines', x: 440, z: -572 }];

/** The town the walk loads (contextRadius round the Town Hall), the ring of gates and the castles, with room round them. */
function reachOf(data: AreaData, gates: CityGate[]): Layers['reach'] {
  const [cx, cz] = data.meta.townHall, r = data.meta.contextRadius + 60;
  const pts = [...gates.map(g => ({ x: g.x, z: g.z, m: 120 })), ...CASTLES.map(c => ({ ...c, m: 200 }))];
  return [
    Math.min(cx - r, ...pts.map(p => p.x - p.m)), Math.min(cz - r, ...pts.map(p => p.z - p.m)),
    Math.max(cx + r, ...pts.map(p => p.x + p.m)), Math.max(cz + r, ...pts.map(p => p.z + p.m)),
  ];
}

/** The rest of the Old Town out to the gates, and the line of the wall (tools/build-oldtown.mjs), for the full map. */
async function loadOldTown(L: Layers): Promise<void> {
  const res = await fetch('data/oldtown.json');
  if (!res.ok) return;
  const o: {
    buildings: XZ[][]; areas: { ring: XZ[] }[]; roads: { kind: string; name: string; line: XZ[] }[];
    wall: XZ[] | null; castle?: XZ[] | null; castleWalls?: XZ[][]; monastery?: XZ[] | null;
  } = await res.json();
  L.old = {
    today: o.buildings.map(r => plotOf([r], true)), areas: o.areas.map(a => plotOf([a.ring], false)),
    wall: o.wall ? plotOf([o.wall], false) : null,
    castle: o.castle ? plotOf([o.castle], false) : null, castleWalls: (o.castleWalls ?? []).map(l => plotOf([l], false, false)),
    monastery: o.monastery ? plotOf([o.monastery], false, false) : null,
  };
  for (const r of o.roads) {
    const m = midpoint(r.line);
    if (m.len >= 30) L.labels.push({ text: r.name, x: m.x, z: m.z, ang: m.ang, len: m.len, main: r.kind === 'primary' || r.kind === 'secondary' });
  }
  L.labels.sort((a, b) => b.len - a.len);
}

/** A tile of vellum: the look's ground, grain, a few fibres. One tile pixel is one device pixel. */
function paperTile(dpr: number, T: Theme): HTMLCanvasElement {
  const n = Math.round(256 * dpr);
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const t = c.getContext('2d')!;
  t.fillStyle = T.ground;
  t.fillRect(0, 0, n, n);
  const img = t.getImageData(0, 0, n, n), d = img.data;
  let seed = T.seed;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < d.length; i += 4) { const k = (rnd() - 0.5) * T.grain; d[i] += k; d[i + 1] += k; d[i + 2] += k; }
  t.putImageData(img, 0, 0);
  t.lineWidth = Math.max(1, dpr * 0.6);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * n, y = rnd() * n, a = rnd() * Math.PI, l = (6 + rnd() * 14) * dpr;
    t.strokeStyle = `rgba(${T.fibre}, ${T.fibreBase + rnd() * T.fibreRange})`;
    t.beginPath(); t.moveTo(x, y); t.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + rnd() * 3, y + Math.sin(a) * l * 0.5 + rnd() * 3, x + Math.cos(a) * l, y + Math.sin(a) * l); t.stroke();
  }
  return c;
}

// ---- drawing ---------------------------------------------------------------------------------
interface Paint { theme: Theme; paper: CanvasPattern | null; full: boolean; hats: Hats | null; compass?: { x: number; y: number } }

function outlines(g: CanvasRenderingContext2D, list: Plot[], seen: (b: Box) => boolean): void { for (const b of list) if (seen(b)) g.stroke(b.path); }
function fills(g: CanvasRenderingContext2D, list: Plot[], seen: (b: Box) => boolean): void { for (const b of list) if (seen(b)) g.fill(b.path, 'evenodd'); }

function drawMap(g: CanvasRenderingContext2D, W: number, H: number, dpr: number, v: View, pose: MapPose, L: Layers, p: Paint): void {
  const s = v.s, full = p.full, T = p.theme, glow = T.glow;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = p.paper ?? T.ground;
  g.fillRect(0, 0, W, H);
  g.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W / 2 - v.cx * s), dpr * (H / 2 - v.cz * s));
  const x0 = v.cx - W / 2 / s, x1 = v.cx + W / 2 / s, z0 = v.cz - H / 2 / s, z1 = v.cz + H / 2 / s;
  const seen = (b: Box) => b.x1 >= x0 && b.x0 <= x1 && b.z1 >= z0 && b.z0 <= z1;
  const px = 1 / s; // one CSS pixel, in metres
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // squares, and footways as dots of ink
  g.fillStyle = T.square;
  fills(g, L.areas, seen);
  g.strokeStyle = T.foot;
  g.lineWidth = px;
  g.setLineDash([px * 1.5, px * 5]);
  outlines(g, L.foot, seen);
  g.setLineDash([]);

  // today's houses: gold hatching and outline
  g.fillStyle = T.todayFill;
  fills(g, L.today, seen);
  if (p.hats) { g.strokeStyle = T.todayHat; g.lineWidth = px * 0.8; p.hats.today.draw(g, x0, z0, x1, z1); }
  g.strokeStyle = T.todayLine;
  g.lineWidth = px * (full ? 1.2 : 1);
  outlines(g, L.today, seen);
  // the rest of the Old Town, out to the gates: today's outlines, unhatched
  if (L.old) {
    g.fillStyle = T.square;
    fills(g, L.old.areas, seen);
    g.fillStyle = T.todayFill;
    fills(g, L.old.today, seen);
    g.strokeStyle = T.todayLine;
    g.lineWidth = px * (full ? 1.1 : 0.9);
    outlines(g, L.old.today, seen);
  }

  // the 1842 plan: cross-hatched in grey-green
  g.fillStyle = T.planFill;
  fills(g, L.plan, seen);
  if (p.hats) { g.strokeStyle = T.planHat; g.lineWidth = px * 0.8; p.hats.plan.draw(g, x0, z0, x1, z1); }
  g.strokeStyle = T.planLine;
  g.lineWidth = px * (full ? 1.05 : 0.9);
  outlines(g, L.plan, seen);

  // Town Hall and St Casimir's, with a warm halo behind them when the map glows
  if (glow) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const m of L.landmarks) {
      const rw = Math.min(220, Math.max(45, 26 * s)) * px;
      if (!seen({ x0: m.x - rw, x1: m.x + rw, z0: m.z - rw, z1: m.z + rw })) continue;
      const h = g.createRadialGradient(m.x, m.z, rw * 0.05, m.x, m.z, rw);
      h.addColorStop(0, 'rgba(226, 120, 62, 0.36)');
      h.addColorStop(1, 'rgba(226, 120, 62, 0)');
      g.fillStyle = h;
      g.fillRect(m.x - rw, m.z - rw, rw * 2, rw * 2);
    }
    g.restore();
  }
  g.save();
  g.globalAlpha = full ? 0.95 : 0.8;
  g.fillStyle = T.hall;
  fills(g, L.hall, seen);
  g.restore();
  g.strokeStyle = T.hallLine;
  g.lineWidth = px * (full ? 1.8 : 1.4);
  outlines(g, L.hall, seen);
  // the Subačius Gate: standing, drawn like the Town Hall; or, with the ghost, a faint fill and a broken line
  g.save();
  const standing = L.gateLook === 'solid';
  g.globalAlpha = standing ? (full ? 0.95 : 0.8) : (full ? 0.3 : 0.25);
  g.fillStyle = T.hall;
  fills(g, L.gate, seen);
  g.globalAlpha = standing ? 1 : (full ? 0.9 : 0.75);
  if (!standing) g.setLineDash([px * 3, px * 3]);
  outlines(g, L.gate, seen);
  g.restore();

  // glow: the ink gives off light, as wide faint strokes added on top
  if (glow) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    const halo = (list: Plot[], colour: string, w: number, passes: [number, number][]) => {
      g.strokeStyle = colour;
      for (const [k, a] of passes) { g.globalAlpha = a; g.lineWidth = px * w * k; outlines(g, list, seen); }
    };
    halo(L.today, T.todayInk, full ? 1.2 : 1, [[5.5, 0.05], [2.8, 0.1]]);
    halo(L.plan, T.planInk, full ? 1.05 : 0.9, [[5.5, 0.03], [2.8, 0.055]]);
    halo(L.hall, T.hallLine, full ? 1.8 : 1.4, [[6, 0.09], [3, 0.16]]);
    g.restore();
  }

  // Past the walk the town is only to be looked at: it fades into the vellum, and the edge is marked.
  if (full) {
    veilBeyond(g, W, H, dpr, v, L, T);
  } else {
    g.fillStyle = `rgba(${T.veil}, 0.55)`;
    g.fill(L.veil, 'evenodd');
  }
  g.strokeStyle = T.edge;
  g.globalAlpha = full ? 1 : 0.7;
  g.lineWidth = px * (full ? 2.4 : 1.8);
  g.setLineDash([px * 2, px * 7]);
  g.stroke(L.edge);
  if (glow) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.16;
    g.lineWidth = px * (full ? 9 : 6);
    g.stroke(L.edge);
    g.restore();
  }
  g.setLineDash([]);
  g.globalAlpha = 1;

  // The city wall and its gates belong to the whole town, so they lie over the veil: the wall's line (the strip the
  // heritage register protects along it), and a dotted ring round each gate whose site was never found.
  if (L.old?.wall && seen(L.old.wall)) {
    g.fillStyle = T.wall;
    g.fill(L.old.wall.path, 'evenodd');
  }
  // The castles the wall met at the Castle Gate: the edge of their precinct, and what stands of the Upper Castle's walls
  if (L.old?.castle && seen(L.old.castle)) {
    g.strokeStyle = T.castle;
    g.lineWidth = Math.max(3.5, px * 2);
    g.stroke(L.old.castle.path);
    g.strokeStyle = T.hallLine;
    g.lineWidth = Math.max(2.5, px * 1.6);
    outlines(g, L.old.castleWalls, seen);
  }
  // From the Bernardine Gate to the castles the ring was closed by the Bernardine monastery (KVR 642), the church built
  // into the wall; where its line ran is not known. Dashed: about here, along today's enclosure on the side facing the
  // Vilnia and a wall that still stands to the castle site (tools/build-oldtown.mjs)
  if (L.old?.monastery && seen(L.old.monastery)) {
    g.strokeStyle = T.castle;
    g.lineWidth = Math.max(3.5, px * 2);
    g.lineCap = 'butt';
    g.setLineDash([px * 8, px * 5]);
    g.stroke(L.old.monastery.path);
    g.setLineDash([]);
    g.lineCap = 'round';
  }
  g.strokeStyle = T.note;
  g.lineWidth = px * 1.3;
  g.setLineDash([px * 1.5, px * 4.5]);
  for (const gt of L.gates) {
    if (gt.within < 25 || gt.state === 'built' || !seen({ x0: gt.x - gt.within, x1: gt.x + gt.within, z0: gt.z - gt.within, z1: gt.z + gt.within })) continue;
    g.beginPath();
    g.arc(gt.x, gt.z, gt.within, 0, Math.PI * 2);
    g.stroke();
  }
  g.setLineDash([]);

  // Screen space from here: light, names, the walker.
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sx = (x: number) => W / 2 + (x - v.cx) * s, sy = (z: number) => H / 2 + (z - v.cz) * s;
  if (glow) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    const cx = sx(L.centre[0]), cz = sy(L.centre[1]), R = L.radius * s * 1.2;
    const lit = g.createRadialGradient(cx, cz, R * 0.12, cx, cz, R);
    lit.addColorStop(0, 'rgba(255, 196, 110, 0.16)');
    lit.addColorStop(0.7, 'rgba(255, 170, 80, 0.07)');
    lit.addColorStop(1, 'rgba(255, 170, 80, 0)');
    g.fillStyle = lit;
    g.fillRect(0, 0, W, H);
    g.restore();
  }
  drawGates(g, W, H, L, T, sx, sy, full);
  if (full) {
    // an aged edge, darker towards the corners
    const vig = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    vig.addColorStop(0, `rgba(${T.vignette}, 0)`);
    vig.addColorStop(1, `rgba(${T.vignette}, ${T.vignetteAlpha})`);
    g.fillStyle = vig;
    g.fillRect(0, 0, W, H);
    drawLabels(g, W, H, v, L, T, sx, sy);
    if (p.compass) drawCompass(g, p.compass.x, p.compass.y, 34, T);
  }
  drawYou(g, sx(pose.x), sy(pose.z), pose.yaw, full, T);
  if (full) {
    g.font = 'italic 700 16px Almendra, Georgia, serif';
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = T.text;
    halo(g, 'you', sx(pose.x) + 14, sy(pose.z) + 5, T.halo);
  }
}

/**
 * Past the walk the town fades into the vellum with distance from the walk's edge: a veil, cleared inside the walk
 * and thinned near its edge by strokes of shrinking width (clear at the edge, 0.62 at 70 m, 0.88 by 190 m).
 */
let veilCanvas: HTMLCanvasElement | null = null;
function veilBeyond(g: CanvasRenderingContext2D, W: number, H: number, dpr: number, v: View, L: Layers, T: Theme): void {
  const c = (veilCanvas ??= document.createElement('canvas'));
  const cw = Math.round(W * dpr), ch = Math.round(H * dpr);
  if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
  const f = c.getContext('2d')!;
  f.setTransform(1, 0, 0, 1, 0, 0);
  f.globalCompositeOperation = 'source-over';
  f.globalAlpha = 1;
  f.clearRect(0, 0, cw, ch);
  f.fillStyle = `rgba(${T.veil}, 0.88)`;
  f.fillRect(0, 0, cw, ch);
  f.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * (W / 2 - v.cx * v.s), dpr * (H / 2 - v.cz * v.s));
  f.globalCompositeOperation = 'destination-out';
  f.lineJoin = 'round';
  f.strokeStyle = '#000';
  f.fillStyle = '#000';
  let left = 0.88;
  for (const [d, a] of [[190, 0.8], [150, 0.72], [110, 0.62], [70, 0.45], [45, 0.25], [25, 0.08], [10, 0]]) {
    f.globalAlpha = 1 - a / left;       // what is left beyond d, down to a within it
    f.lineWidth = 2 * d;
    f.stroke(L.edge);
    left = a || 1;
  }
  f.globalAlpha = 1;
  f.fill(L.edge, 'evenodd');
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(c, 0, 0);
  g.restore();
}

/** Each gate as a ring of ink: filled where it stood in 1900, open where it was gone. The Subačius Gate is drawn as its plan. */
function drawGates(g: CanvasRenderingContext2D, W: number, H: number, L: Layers, T: Theme, sx: (x: number) => number, sy: (z: number) => number, full: boolean): void {
  const r = full ? 5.5 : 4;
  g.lineWidth = full ? 1.8 : 1.4;
  for (const gt of L.gates) {
    if (gt.state === 'built') continue;
    const x = sx(gt.x), y = sy(gt.z);
    if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = gt.state === 'standing' ? T.hall : T.halo;
    g.fill();
    g.strokeStyle = gt.state === 'standing' ? T.hallLine : T.note;
    g.stroke();
  }
}

function halo(g: CanvasRenderingContext2D, text: string, x: number, y: number, colour: string): void {
  g.lineWidth = 4;
  g.lineJoin = 'round';
  g.strokeStyle = colour;
  g.strokeText(text, x, y);
  g.fillText(text, x, y);
}

function drawLabels(g: CanvasRenderingContext2D, W: number, H: number, v: View, L: Layers, T: Theme, sx: (x: number) => number, sy: (z: number) => number): void {
  const s = v.s;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const placed: { x: number; y: number; r: number; name: string }[] = [];
  const room = (x: number, y: number, r: number, name: string) => placed.every(p => Math.hypot(p.x - x, p.y - y) > (p.name === name ? 170 : p.r + r));

  // Places first: the square, the two landmarks, the edge of the walk.
  if (L.square && s > 0.9) {
    g.font = F_PLACE;
    g.fillStyle = T.text;
    const text = L.square.text.toUpperCase().split('').join(' '), x = sx(L.square.x), y = sy(L.square.z);
    halo(g, text, x, y, T.halo);
    placed.push({ x, y, r: g.measureText(text).width / 2 + 4, name: text });
  }
  g.font = F_PLACE;
  for (const m of L.landmarks) {
    const x = sx(m.x), y = sy(m.z);
    if (x < -60 || y < -20 || x > W + 60 || y > H + 20) continue;
    g.fillStyle = T.text;
    halo(g, m.text, x, y + 5, T.halo);
    placed.push({ x, y, r: g.measureText(m.text).width / 2 + 6, name: m.text });
  }
  g.font = F_GATE;
  for (const gt of L.gates) {
    if (gt.state === 'built') continue;              // named with the landmarks
    const x = sx(gt.x), y = sy(gt.z) + 21;
    if (x < -80 || y < -20 || x > W + 80 || y > H + 20) continue;
    g.fillStyle = gt.state === 'standing' ? T.text : T.note;
    halo(g, gt.name, x, y, T.halo);
    placed.push({ x, y: y - 5, r: g.measureText(gt.name).width / 2 + 4, name: gt.name });
  }
  if (L.old?.castle) for (const c of CASTLES) {
    const x = sx(c.x), y = sy(c.z);
    if (x < -80 || y < -20 || x > W + 80 || y > H + 20) continue;
    g.fillStyle = T.note;
    halo(g, c.name, x, y, T.halo);
    placed.push({ x, y: y - 5, r: g.measureText(c.name).width / 2 + 4, name: c.name });
  }
  if (s > 0.7) {
    g.font = F_NOTE;
    g.fillStyle = T.note;
    const a = Math.PI * 0.72, x = sx(L.centre[0] + Math.cos(a) * (L.radius - 9)), y = sy(L.centre[1] + Math.sin(a) * (L.radius - 9));
    halo(g, 'edge of the walk', x, y, T.halo);
    placed.push({ x, y, r: g.measureText('edge of the walk').width / 2 + 4, name: 'edge' });
  }

  // Streets, longest first, each only where its name fits along it.
  g.fillStyle = T.name;
  for (const l of L.labels) {
    const x = sx(l.x), y = sy(l.z);
    if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
    g.font = l.main ? F_MAIN : F_STREET;
    const w = g.measureText(l.text).width;
    if (w + 14 > l.len * s) continue;
    const r = w / 2 * 0.9 + 4;
    if (!room(x, y, r, l.text)) continue;
    placed.push({ x, y, r, name: l.text });
    g.save();
    g.translate(x, y);
    g.rotate(l.ang);
    halo(g, l.text, 0, 5, T.halo);
    g.restore();
  }
}

function drawYou(g: CanvasRenderingContext2D, x: number, y: number, yaw: number, full: boolean, T: Theme): void {
  // yaw 0 looks along -Z (north); forward is (-sin, -cos) on the ground, which is the screen's (x, y)
  const a = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
  const R = full ? 44 : 32, half = 0.6;
  const grad = g.createRadialGradient(x, y, 4, x, y, R);
  grad.addColorStop(0, `rgba(${T.youRgb}, ${full ? 0.6 : 0.5})`);
  grad.addColorStop(1, `rgba(${T.youRgb}, 0)`);
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(x, y);
  g.arc(x, y, R, a - half, a + half);
  g.closePath();
  g.fill();
  // seven fine lines fan out, as if drawn with a pen
  g.strokeStyle = `rgba(${T.youRgb}, 0.6)`;
  g.lineWidth = 1;
  g.beginPath();
  for (let k = -3; k <= 3; k++) {
    const b = a + k * half / 3.4;
    g.moveTo(x + Math.cos(b) * 8, y + Math.sin(b) * 8);
    g.lineTo(x + Math.cos(b) * R * 0.94, y + Math.sin(b) * R * 0.94);
  }
  g.stroke();
  g.beginPath();
  g.arc(x, y, full ? 6 : 5.5, 0, Math.PI * 2);
  g.fillStyle = full ? T.you : `rgba(${T.youRgb}, 0.92)`;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = T.ring;
  g.stroke();
}

/** A compass rose: a fleur for north, points in two-tone gold. */
function drawCompass(g: CanvasRenderingContext2D, x: number, y: number, r: number, T: Theme): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = T.compassDisc;
  g.beginPath(); g.arc(0, 0, r * 1.5, 0, Math.PI * 2); g.fill();
  g.strokeStyle = T.todayInk;
  g.lineWidth = 1.2;
  g.beginPath(); g.arc(0, 0, r * 0.62, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(0, 0, r * 0.7, 0, Math.PI * 2); g.stroke();
  const point = (ang: number, len: number, wid: number) => {
    g.save();
    g.rotate(ang);
    g.beginPath(); g.moveTo(0, -len); g.lineTo(wid, 0); g.lineTo(0, 0); g.closePath(); g.fillStyle = T.todayInk; g.fill(); g.lineWidth = 1; g.stroke();
    g.beginPath(); g.moveTo(0, -len); g.lineTo(-wid, 0); g.lineTo(0, 0); g.closePath(); g.fillStyle = T.ground; g.fill(); g.stroke();
    g.restore();
  };
  for (let k = 0; k < 4; k++) point(Math.PI / 4 + k * Math.PI / 2, r * 0.55, r * 0.11);
  for (let k = 0; k < 4; k++) point(k * Math.PI / 2, r, r * 0.16);
  g.fillStyle = T.todayInk;
  g.beginPath(); g.moveTo(0, -r * 1.34); g.quadraticCurveTo(r * 0.16, -r * 1.16, 0, -r * 1.02); g.quadraticCurveTo(-r * 0.16, -r * 1.16, 0, -r * 1.34); g.fill();
  g.font = '700 12px Cinzel, Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = T.text;
  g.fillText('S', 0, r * 1.22);
  g.fillText('E', r * 1.22, 1);
  g.fillText('W', -r * 1.22, 1);
  g.restore();
}

const ABOUT_HTML = (walk: number, gate: GateLook) => `
  <ul class="mv-legend">
    <li><i class="sw today"></i>Today's houses</li>
    <li><i class="sw plan"></i>1842 plan houses</li>
    <li><i class="sw hall"></i>Town Hall, St Casimir's${gate === 'solid' ? ', the Subačius, Rūdninkai and Saviour’s gates' : ''}</li>
    <li><i class="sw you"></i>You</li>
    ${gate === 'solid' ? '' : '<li><i class="sw gone"></i>Subačius, Rūdninkai and Saviour’s gates, gone</li>'}
    <li><i class="sw gate"></i>City gates: open if gone by 1900</li>
    <li><i class="sw wall"></i>Line of the city wall</li>
    <li><i class="sw castle"></i>Castles; dashed, the Bernardines</li>
    <li><i class="sw walk"></i>Edge of the walk</li>
  </ul>
  <h3>Where it comes from</h3>
  <ul class="mv-src">
    <li><b>Today's houses:</b> the national cadastre (GRPK), 2026. Each plot is taken to hold a house of about 1900.</li>
    <li><b>1842 plan houses:</b> the 1842 plan of Vilnius (National Library of Poland), fitted to today's map to within a few metres, west of the square. Plot lines and storeys are guesses.</li>
    <li><b>Town Hall, St Casimir's:</b> modelled by hand: the Town Hall as finished in 1799, the church in its Orthodox form after 1864–68.</li>
    <li><b>Streets and names:</b> OpenStreetMap, 2026: today's names. Around 1900 many streets had other, Russian names.</li>
    <li><b>Subačius Gate:</b> the city wall's east gate, after P. Smuglevičius's drawing of 1785–86. ${gate === 'solid'
      ? 'It was pulled down in 1801–02, with the wall; here it stands, with the wall either side, a century out of its time, on purpose.'
      : 'It was pulled down in 1801–02; in the street it is a ghost, where it stood.'}</li>
    <li><b>Rūdninkai Gate:</b> the west gate, on the road to Grodno and Poland, after P. Smuglevičius's drawing of 1785: the tower, and the barbican of 1675–79 on its outer side. ${gate === 'solid'
      ? 'It was pulled down in 1800; here it stands, like the Subačius Gate, out of its time, on purpose.'
      : 'It was pulled down in 1800; it is a ghost, where it stood.'}</li>
    <li><b>Saviour’s Gate:</b> the east gate by the Užupis bridge, rebuilt in 1624 and 1799 and said to be ornate; no picture of it survives, so its Baroque front is a design, and its site, never dug, is the likeliest one. ${gate === 'solid'
      ? 'It stands at the far edge of the town the walk shows.'
      : 'It is a ghost, where it stood.'}</li>
    <li><b>City gates and wall:</b> the wall of 1503–22 and its ten gates, pulled down from 1799, all but the Gate of Dawn (here filled). Sites from the heritage register (KVR), Wikipedia and V. Drėma's <i>Dingęs Vilnius</i>; a dotted ring where the site was never found. All nine lost gates are modelled, as the sources describe them, at <a href="https://vilnius.gg/gates" target="_blank" rel="noopener">vilnius.gg/gates</a>. The wall's line is the strip the register protects along it. At the Castle Gate the wall met the castles: the edge of their precinct is the register's (KVR 141), along the Vilnia's old channel (now Šventaragio g.); the firmer line is what stands of the Upper Castle's walls (OpenStreetMap). From the Bernardine Gate the Bernardine monastery closed the ring up to the castles: its church was built into the wall in the early 16th century, with gun-ports. Where its line ran is not known, so it is dashed: about here, along today's enclosure on the side facing the Vilnia (the register's, KVR 766) and a wall that still stands from it to the castles (OpenStreetMap).</li>
    <li><b>The rest of the Old Town:</b> OpenStreetMap outlines, 2026, unhatched, out to the gates.</li>
    <li><b>Edge of the walk:</b> the square, ${walk} m round the Town Hall, and the road out to the gate. Beyond it the town is only to be seen.</li>
  </ul>
  <p class="dim">This is not a copy of one old map: no plan from about 1900 is used yet, and the 1866 plan is not drawn.</p>
  <p class="dim">GRPK © Nacionalinė žemės tarnyba prie Aplinkos ministerijos, CC BY 4.0 · © OpenStreetMap contributors, ODbL · KVR © Kultūros paveldo departamentas, CC BY 4.0 · 1842 plan: public domain.</p>`;

const ICON = {
  plus: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 3V15M3 9H15"/></svg>',
  minus: '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M3 9H15"/></svg>',
  here: '<svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="3.2"/><path d="M10 2V5.5M10 14.5V18M2 10H5.5M14.5 10H18"/></svg>',
};

const LOOK_NAMES: Record<Look, string> = { pastel: 'Pastel', dark: 'Dark', glow: 'Glow' };
export function createMap(data: AreaData, pose: () => MapPose, hooks: MapHooks, initialLook: Look = 'pastel', gateLook: GateLook = 'solid'): MapUI {
  const L = prepare(data, gateLook);
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
    <div class="mv-title"><h2>Town Hall Square</h2><p>c. 1900, on a plan of today</p><div class="mv-scale"><i></i><span></span></div></div>
    <button type="button" class="mv-btn mv-close"><span class="long">Back to the walk</span><span class="short">Back</span> <kbd>Tab</kbd></button>
    <div class="mv-zoom">
      <button type="button" class="mv-btn mv-icon" data-zoom="in" aria-label="Zoom in">${ICON.plus}</button>
      <button type="button" class="mv-btn mv-icon" data-zoom="out" aria-label="Zoom out">${ICON.minus}</button>
      <button type="button" class="mv-btn mv-icon" data-here aria-label="Show where I am">${ICON.here}</button>
      <div class="mv-looks" role="group" aria-label="Look of the map">${LOOKS.map(k => `<button type="button" data-look="${k}" aria-pressed="false">${LOOK_NAMES[k]}</button>`).join('')}</div>
    </div>
    <aside class="mv-about">
      <button type="button" class="mv-about-head" aria-expanded="true"><span>About this map</span><i aria-hidden="true"></i></button>
      <div class="mv-about-body">${ABOUT_HTML(L.radius, gateLook)}</div>
    </aside>`;
  const canvas = full.querySelector('canvas')!;
  const g = canvas.getContext('2d')!;
  const titleEl = full.querySelector<HTMLElement>('.mv-title')!;
  const scaleBar = full.querySelector<HTMLElement>('.mv-scale')!;
  const scaleLine = scaleBar.querySelector('i')!, scaleText = scaleBar.querySelector('span')!;
  const aboutHead = full.querySelector<HTMLButtonElement>('.mv-about-head')!;
  const closeBtn = full.querySelector<HTMLButtonElement>('.mv-close')!;
  const lookBtns = [...full.querySelectorAll<HTMLButtonElement>('[data-look]')];
  document.body.append(mini, full);

  // Vellum in each look, as a pattern for each canvas; made when a look is first shown
  const tiles = new Map<Look, HTMLCanvasElement>();
  const patterns = new Map<string, CanvasPattern | null>();
  const paperFor = (which: 'full' | 'mini', k: Look) => {
    const key = `${which}/${k}`;
    if (!patterns.has(key)) {
      if (!tiles.has(k)) tiles.set(k, paperTile(dpr, THEMES[k]));
      const pat = (which === 'full' ? g : miniG).createPattern(tiles.get(k)!, 'repeat');
      pat?.setTransform(new DOMMatrix().scale(1 / dpr));
      patterns.set(key, pat);
    }
    return patterns.get(key)!;
  };

  let look = initialLook;
  const applyLook = () => {
    for (const el of [mini, full]) {
      for (const k of LOOKS) el.classList.toggle(`look-${k}`, k === look);
      for (const v of ['--map-ground', '--sw-ground']) el.style.setProperty(v, THEMES[look].ground);
    }
    for (const b of lookBtns) b.setAttribute('aria-pressed', String(b.dataset.look === look));
    dirty = true;
    last.x = NaN;
  };

  let walking = false, isOpen = false, dirty = true;
  let miniSize = 0, last = { x: NaN, z: NaN, yaw: NaN };
  let W = 0, H = 0;
  const view: View = { cx: L.centre[0], cz: L.centre[1], s: 1 };

  // Names need their fonts; redraw once they have arrived. The coarse hatching for the corner map is made while the game is idle.
  loadFonts().then(() => { dirty = true; last.x = NaN; });
  setTimeout(() => hatsFor(L, 'coarse'), 400);

  // far enough out to take in the whole ring of gates
  const sMin = () => Math.min(Math.min(W, H) / 1000, W / (L.reach[2] - L.reach[0]), H / (L.reach[3] - L.reach[1]));
  const narrow = () => window.matchMedia('(max-width: 760px)').matches;
  /** Screen the walk wants: the whole walkable circle, clear of the note on the right. */
  const inset = () => (!narrow() && !full.classList.contains('about-closed') ? 372 : 0);
  const fit = () => {
    const free = Math.max(160, W - inset());
    const [bx0, bz0, bx1, bz1] = L.walkBox;
    view.s = Math.min(S_MAX, Math.max(sMin(), Math.min(free / (bx1 - bx0 + 40), (H - (narrow() ? 200 : 150)) / (bz1 - bz0 + 40))));
    view.cx = (bx0 + bx1) / 2 + inset() / 2 / view.s;
    view.cz = (bz0 + bz1) / 2;
  };
  const clamp = () => {
    view.s = Math.min(S_MAX, Math.max(sMin(), view.s));
    const [rx0, rz0, rx1, rz1] = L.reach;
    view.cx = Math.min(rx1, Math.max(rx0, view.cx));
    view.cz = Math.min(rz1, Math.max(rz0, view.cz));
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
  /** Hatching that suits the zoom: fine when close, coarse in between, none when far out. */
  const hatsAt = (s: number): Hats | null => (s >= 2.4 ? hatsFor(L, 'fine') : s >= 0.9 ? hatsFor(L, 'coarse') : null);
  const drawFull = () => {
    const tb = titleEl.getBoundingClientRect();
    drawMap(g, W, H, dpr, view, pose(), L, {
      theme: THEMES[look], full: true, paper: paperFor('full', look), hats: hatsAt(view.s),
      compass: { x: tb.left + 48, y: tb.bottom + 68 },
    });
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
    const s = size / MINI_SPAN;
    drawMap(miniG, size, size, dpr, { cx: p.x, cz: p.z, s }, p, L, { theme: THEMES[look], full: false, paper: paperFor('mini', look), hats: hatsAt(s) });
  };

  const setAbout = (openIt: boolean) => {
    full.classList.toggle('about-closed', !openIt);
    aboutHead.setAttribute('aria-expanded', String(openIt));
    dirty = true;
  };
  let oldTown: Promise<void> | null = null;
  const open = () => {
    if (isOpen || !walking) return;
    isOpen = true;
    oldTown ??= loadOldTown(L).then(() => { dirty = true; }, () => {});
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

  applyLook();
  mini.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  aboutHead.addEventListener('click', () => setAbout(full.classList.contains('about-closed')));
  for (const b of lookBtns) b.addEventListener('click', () => {
    look = b.dataset.look as Look;
    hooks.onLook?.(look);
    applyLook();
  });
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
    get look() { return look; },
    setLook(k: Look) { look = k; applyLook(); },
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
