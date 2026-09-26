// Builds public/data/area.json: the Town Hall Square area in local metres,
// from the seed GRPK footprints (CC BY 4.0, NŽT) and the OSM snapshot (ODbL).
//
// Local frame: X = E - 583000, Z = -(N - 6061000), 1 unit = 1 m, Y up.
import fs from 'node:fs';
import path from 'node:path';
import { toLks94 } from './lks94.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SEED = path.join(ROOT, 'shadows-of-vilnius-seed');
const OUT = path.join(ROOT, 'public', 'data', 'area.json');
const LIDAR = path.join(ROOT, 'tools', 'lidar', 'heights.json');


const E0 = 583000, N0 = 6061000;
const TOWN_HALL = { E: 582993, N: 6060944 };
const WALK_RADIUS = 200;     // walkable area around the Town Hall
const CONTEXT_RADIUS = 520;  // backdrop buildings beyond it
const STOREY_GROUND = 4.0, STOREY_UPPER = 3.4;
const DEFAULT_EAVE = 11.0;
const CAP_ORDINARY = STOREY_GROUND + 2 * STOREY_UPPER + 0.7; // three storeys, c.1800
const CAP_LARGE = 16.0;      // palaces, monasteries, big blocks
const LARGE_FOOTPRINT = 1500;

const local = ([e, n]) => [round(e - E0), round(-(n - N0))];
const round = v => Math.round(v * 100) / 100;
const dist = (a, b) => Math.hypot(a.E - b.E, a.N - b.N);

function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}
function ringCentroid(r) {
  let x = 0, y = 0, a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    x += (r[j][0] + r[i][0]) * f; y += (r[j][1] + r[i][1]) * f; a += f;
  }
  if (Math.abs(a) < 1e-9) return { E: r[0][0], N: r[0][1] };
  return { E: x / (3 * a), N: y / (3 * a) };
}
function pointInRing(p, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > p.N) !== (yj > p.N) && p.E < ((xj - xi) * (p.N - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function dropClosing(r) {
  const [a, b] = [r[0], r[r.length - 1]];
  return a[0] === b[0] && a[1] === b[1] ? r.slice(0, -1) : r;
}

// --- OSM ---------------------------------------------------------------
const osm = JSON.parse(fs.readFileSync(path.join(SEED, 'osm', 'overpass_oldtown_bbox_2026-09-26T1341Z.json'), 'utf8'));
const nodes = new Map();
for (const el of osm.elements) if (el.type === 'node') nodes.set(el.id, el);
const wayRing = w => w.nodes.map(id => nodes.get(id)).filter(Boolean).map(n => toLks94(n.lon, n.lat));

const osmBuildings = [];   // {centroid, height, levels, name, id}
const osmAreas = [];       // pedestrian areas and squares
const osmRoads = [];       // street centrelines
let townHallRing = null, stCasimirRing = null;

for (const el of osm.elements) {
  if (el.type !== 'way' || !el.tags) continue;
  const t = el.tags;
  if (t.building || t['building:part']) {
    const ring = wayRing(el);
    if (ring.length < 3) continue;
    const c = ringCentroid(ring);
    if (dist(c, TOWN_HALL) > CONTEXT_RADIUS + 50) continue;
    const h = parseFloat(t.height), lv = parseFloat(t['building:levels']);
    if (t.building) osmBuildings.push({ id: el.id, centroid: c, height: isFinite(h) ? h : null, levels: isFinite(lv) ? lv : null });
    if (el.id === 111866535) townHallRing = ring;
    if (t.building && /kazimier/i.test(t.name || '')) stCasimirRing = ring;
  }
  if (t.highway === 'pedestrian' && (t.area === 'yes' || el.nodes[0] === el.nodes[el.nodes.length - 1])) {
    const ring = wayRing(el);
    if (ring.length >= 3 && dist(ringCentroid(ring), TOWN_HALL) < CONTEXT_RADIUS) osmAreas.push({ id: el.id, name: t.name || null, ring });
  } else if (t.highway && !t.area && ['pedestrian', 'living_street', 'residential', 'footway', 'service', 'secondary', 'tertiary', 'primary', 'unclassified', 'steps'].includes(t.highway)) {
    const line = wayRing(el);
    if (line.length >= 2 && line.some(p => dist({ E: p[0], N: p[1] }, TOWN_HALL) < CONTEXT_RADIUS)) {
      osmRoads.push({ id: el.id, kind: t.highway, name: t.name || null, tunnel: t.tunnel || null, line });
    }
  }
}

// --- LiDAR (optional) ---------------------------------------------------
let lidar = null;
if (fs.existsSync(LIDAR)) {
  try { lidar = JSON.parse(fs.readFileSync(LIDAR, 'utf8')).buildings || null; } catch { lidar = null; }
}

// --- GRPK footprints ----------------------------------------------------
const grpk = JSON.parse(fs.readFileSync(path.join(SEED, 'grpk', 'grpk_pastat_oldtown_epsg3346.geojson'), 'utf8'));
const buildings = [];
const stats = { lidar: 0, osmHeight: 0, osmLevels: 0, default: 0, capped: 0 };

for (const f of grpk.features) {
  const rings = f.geometry.coordinates.map(dropClosing);
  const outer = rings[0];
  const area = ringArea(outer);
  if (area < 15) continue;
  const c = ringCentroid(outer);
  const d = dist(c, TOWN_HALL);
  if (d > CONTEXT_RADIUS) continue;
  const id = f.properties.TOP_ID;

  let role = 'ordinary';
  const th = { E: ringCentroid(townHallRing || [[0, 0]]).E, N: ringCentroid(townHallRing || [[0, 0]]).N };
  if (townHallRing && pointInRing(th, outer)) role = 'townhall';
  else if (stCasimirRing && pointInRing(ringCentroid(stCasimirRing), outer)) role = 'stcasimir';

  let eave = null, source = null, ground = 0;
  if (lidar && lidar[id] && isFinite(lidar[id].eave)) {
    ground = lidar[id].ground ?? 0;
    eave = lidar[id].eave - ground; source = 'lidar'; stats.lidar++;
  }
  if (eave == null) {
    const match = osmBuildings.find(b => pointInRing(b.centroid, outer));
    if (match && match.height) { eave = match.height * 0.8; source = 'osm-height'; stats.osmHeight++; }
    else if (match && match.levels) { eave = STOREY_GROUND + (match.levels - 1) * STOREY_UPPER + 0.5; source = 'osm-levels'; stats.osmLevels++; }
    else { eave = DEFAULT_EAVE; source = 'default'; stats.default++; }
  }
  // c.1800 rule: many houses gained storeys later. Cap ordinary houses at three storeys.
  let capped = false;
  if (role === 'ordinary') {
    const cap = area > LARGE_FOOTPRINT ? CAP_LARGE : CAP_ORDINARY;
    if (eave > cap) { eave = cap; capped = true; stats.capped++; }
  }
  eave = Math.max(3, round(eave));

  buildings.push({
    id, role, area: Math.round(area), dist: Math.round(d),
    walk: d <= WALK_RADIUS + 40,
    eave, heightSource: source, capped, ground: round(ground),
    rings: rings.map(r => r.map(local)),
  });
}

const out = {
  meta: {
    generated: new Date().toISOString(),
    crs: 'EPSG:3346', origin: { E: E0, N: N0 },
    frame: 'X = E - 583000, Z = -(N - 6061000), metres, Y up',
    townHall: local([TOWN_HALL.E, TOWN_HALL.N]),
    walkRadius: WALK_RADIUS, contextRadius: CONTEXT_RADIUS,
    sources: [
      'GRPK PASTAT © Nacionalinė žemės tarnyba prie Aplinkos ministerijos (CC BY 4.0)',
      'Street layout and height tags © OpenStreetMap contributors (ODbL)',
      ...(lidar ? ['Lidar_DR © Nacionalinė žemės tarnyba prie Aplinkos ministerijos (CC BY 4.0)'] : []),
    ],
    stats,
  },
  buildings,
  areas: osmAreas.map(a => ({ id: a.id, name: a.name, ring: dropClosing(a.ring).map(local) })),
  roads: osmRoads.map(r => ({ id: r.id, kind: r.kind, name: r.name, tunnel: r.tunnel, line: r.line.map(local) })),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const roles = buildings.reduce((m, b) => (m[b.role] = (m[b.role] || 0) + 1, m), {});
console.log(`area.json: ${buildings.length} buildings (${buildings.filter(b => b.walk).length} in walk zone), roles ${JSON.stringify(roles)}`);
console.log(`heights: ${JSON.stringify(stats)}; areas ${osmAreas.length}; roads ${osmRoads.length}`);
console.log(`townHall ring ${townHallRing ? 'found' : 'MISSING'}, St Casimir ring ${stCasimirRing ? 'found' : 'MISSING'}; ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
