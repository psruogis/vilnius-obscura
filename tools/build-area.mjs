// Builds public/data/area.json: the Town Hall Square area in local metres,
// from the seed GRPK footprints (CC BY 4.0, NŽT) and the OSM snapshot (ODbL).
//
// Local frame: X = E - 583000, Z = -(N - 6061000), 1 unit = 1 m, Y up.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { toLks94 } from './lks94.mjs';
import polygonClipping from './vendor/polygon-clipping/index.mjs';

// straight-skeleton (MIT; CGAL via Wasm) is a browser bundle: give it the globals it checks for.
globalThis.self ??= globalThis;
globalThis.window ??= globalThis;
const { SkeletonBuilder } = createRequire(import.meta.url)('./vendor/straight-skeleton/index.cjs');
await SkeletonBuilder.init();

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SEED = path.join(ROOT, 'shadows-of-vilnius-seed');
const OUT = path.join(ROOT, 'public', 'data', 'area.json');
const LIDAR = path.join(ROOT, 'tools', 'lidar', 'heights.json');
const GROUND_GRID = path.join(ROOT, 'tools', 'lidar', 'ground_grid.json');
// Historic-layout reconstructions (tools/reconstruction/, see the READMEs there):
// every *remove_modern.json lists post-war footprints to drop, every *_historic.geojson adds plots.
const RECON_DIR = path.join(ROOT, 'tools', 'reconstruction');
const reconFiles = suffix => (fs.existsSync(RECON_DIR) ? fs.readdirSync(RECON_DIR) : [])
  .filter(f => f.endsWith(suffix)).sort().map(f => path.join(RECON_DIR, f));


const E0 = 583000, N0 = 6061000;
const TOWN_HALL = { E: 582993, N: 6060944 };
const WALK_RADIUS = 110;     // walkable area around the Town Hall (owner: keep it close)
const CONTEXT_RADIUS = 450;  // backdrop buildings beyond it
// Setting: c.1900 (the owner's photographs). Tall shop ground floors, 3-4 storeys, lower metal roofs.
const STOREY_GROUND = 4.4, STOREY_UPPER = 3.7;
const DEFAULT_EAVE = STOREY_GROUND + 2 * STOREY_UPPER + 0.7; // three storeys
const CAP_ORDINARY = STOREY_GROUND + 3 * STOREY_UPPER + 0.9; // four storeys, c.1900 (post-war towers capped)
const CAP_LARGE = 20.0;      // palaces, monasteries, big blocks
const LARGE_FOOTPRINT = 1500;
const RECON_EAVE = STOREY_GROUND + 2 * STOREY_UPPER + 0.7; // three storeys, the common c.1900 house

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

// --- Terrain (LiDAR 2 m ground grid, downsampled) -------------------------
const TERRAIN_CELL = 4;
let terrain = null;
if (fs.existsSync(GROUND_GRID)) {
  const g = JSON.parse(fs.readFileSync(GROUND_GRID, 'utf8'));
  terrain = g;
}
function groundAt(e, n) {
  if (!terrain) return null;
  const { origin, cell, nx, ny, z } = normGrid(terrain);
  const fx = (e - origin[0]) / cell - 0.5, fy = (n - origin[1]) / cell - 0.5;
  const x0 = Math.max(0, Math.min(nx - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(ny - 1, Math.floor(fy)));
  const x1 = Math.min(nx - 1, x0 + 1), y1 = Math.min(ny - 1, y0 + 1);
  const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
  const v = (x, y) => z[y * nx + x];
  return (v(x0, y0) * (1 - tx) + v(x1, y0) * tx) * (1 - ty) + (v(x0, y1) * (1 - tx) + v(x1, y1) * tx) * ty;
}
let _norm = null;
function normGrid(g) {
  if (_norm) return _norm;
  const origin = g.origin || [g.x0 ?? g.e0, g.y0 ?? g.n0];
  const cell = g.cell || g.cell_size || g.res || 2;
  const nx = g.nx || g.cols || g.width, ny = g.ny || g.rows || g.height;
  const z = (g.z || g.values || g.data || g.ground).flat();
  return (_norm = { origin, cell, nx, ny, z });
}

// --- GRPK footprints ----------------------------------------------------
const grpk = JSON.parse(fs.readFileSync(path.join(SEED, 'grpk', 'grpk_pastat_oldtown_epsg3346.geojson'), 'utf8'));
const buildings = [];
const removeIds = new Set(reconFiles('remove_modern.json').flatMap(f => JSON.parse(fs.readFileSync(f, 'utf8')).remove || []));
// Reconstructed plots later found to post-date 1808 (by their feature id in any *_historic.geojson)
const removeRecon = new Set(reconFiles('remove_modern.json').flatMap(f => JSON.parse(fs.readFileSync(f, 'utf8')).remove_recon || []));
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
  if (removeIds.has(id)) { stats.removedModern = (stats.removedModern || 0) + 1; continue; }

  let role = 'ordinary';
  const th = { E: ringCentroid(townHallRing || [[0, 0]]).E, N: ringCentroid(townHallRing || [[0, 0]]).N };
  if (townHallRing && pointInRing(th, outer)) role = 'townhall';
  else if (stCasimirRing && pointInRing(ringCentroid(stCasimirRing), outer)) role = 'stcasimir';

  // GRPK merges St Casimir's with the Jesuit house: split the church (OSM outline) off.
  if (role === 'stcasimir') {
    const close = r => [...r, r[0]];
    const rest = polygonClipping.difference([rings.map(close)], [close(stCasimirRing)]);
    const h = lidar?.[id];
    rest.forEach((poly, i) => {
      const rr = poly.map(dropClosing);
      const a = ringArea(rr[0]);
      if (a < 30) return;
      const cap = a > LARGE_FOOTPRINT ? CAP_LARGE : CAP_ORDINARY;
      const e = h ? Math.min(h.eave - h.ground, cap) : DEFAULT_EAVE;
      buildings.push({
        id: `${id}-rest${i}`, role: 'ordinary', area: Math.round(a), dist: Math.round(dist(ringCentroid(rr[0]), TOWN_HALL)),
        walk: dist(ringCentroid(rr[0]), TOWN_HALL) <= WALK_RADIUS + 40,
        eave: round(e), heightSource: h ? 'lidar' : 'default', capped: !!h && h.eave - h.ground > cap, ground: h ? round(h.ground) : 0,
        rings: rr.map(r => r.map(local)),
      });
    });
    buildings.push({
      id: `${id}-church`, role: 'stcasimir', area: Math.round(ringArea(stCasimirRing)), dist: Math.round(d),
      walk: d <= WALK_RADIUS + 40, eave: h ? round(h.eave - h.ground) : 17.8,
      heightSource: h ? 'lidar' : 'default', capped: false, ground: h ? round(h.ground) : 0,
      rings: [dropClosing(stCasimirRing).map(local)],
    });
    stats.lidar++;
    continue;
  }

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
  // c.1900 rule: cap ordinary houses at four storeys (taller ones are post-war).
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

// Reconstructed c.1800 plots replace the post-war layout on Vokiečių street.
for (const reconFile of reconFiles('_historic.geojson')) {
  const recon = JSON.parse(fs.readFileSync(reconFile, 'utf8'));
  const tag = path.basename(reconFile, '.geojson');
  for (const f of recon.features) {
    const kind = f.properties?.kind;
    if (kind !== 'plot' && kind !== 'block') continue;
    if (removeRecon.has(f.properties?.id)) { stats.removedRecon = (stats.removedRecon || 0) + 1; continue; }
    const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
    polys.forEach((poly, i) => {
      const rings = poly.map(dropClosing);
      const c = ringCentroid(rings[0]);
      const storeys = (Number(f.properties.storeys) || 2) + 1; // plots traced from 1842 gained a storey by 1900
      const eave = storeys ? STOREY_GROUND + (storeys - 1) * STOREY_UPPER + 0.6 : RECON_EAVE;
      buildings.push({
        id: `${tag}-${f.properties.id ?? buildings.length}-${i}`, role: 'recon', area: Math.round(ringArea(rings[0])),
        dist: Math.round(dist(c, TOWN_HALL)), walk: dist(c, TOWN_HALL) <= WALK_RADIUS + 40,
        eave: round(eave), heightSource: storeys ? 'recon-storeys' : 'recon-default', capped: false, ground: 0,
        rings: rings.map(r => r.map(local)), source: f.properties.source || null, grade: f.properties.grade || 'C',
      });
      stats.recon = (stats.recon || 0) + 1;
    });
  }
}

// --- Heights on real terrain, and straight-skeleton roofs ------------------
const townHallB = buildings.find(b => b.role === 'townhall');
const H0 = round((townHallB && lidar?.[townHallB.id]?.ground) ?? groundAt(TOWN_HALL.E, TOWN_HALL.N) ?? 0);
const toEN = ([x, z]) => [x + E0, N0 - z];
const ROOF_MAX = 7;        // m; deep blocks shouldn't tower
const PITCH = 0.7;         // tan(35°): c.1900 sheet-metal roofs are lower than the old tile roofs

function cleanRing(r) {
  const out = [];
  for (const p of r) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.05) out.push(p);
  }
  if (out.length > 2 && Math.hypot(out[0][0] - out.at(-1)[0], out[0][1] - out.at(-1)[1]) <= 0.05) out.pop();
  // drop near-collinear vertices
  for (let i = out.length - 1; i >= 0 && out.length > 3; i--) {
    const a = out[(i - 1 + out.length) % out.length], b = out[i], c = out[(i + 1) % out.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (Math.abs(cross) / (len || 1) < 0.02) out.splice(i, 1);
  }
  return out;
}
const signedArea = r => r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

function buildRoof(localRings) {
  // Skeleton space (x, y) = (X, -Z) = east, north: outer ring CCW, holes CW, closed rings.
  const rings = localRings.map(r => cleanRing(r.map(([x, z]) => [x, -z]))).filter(r => r.length >= 3);
  if (!rings.length) return null;
  rings.forEach((r, i) => { const ccw = signedArea(r) > 0; if ((i === 0) !== ccw) r.reverse(); });
  try {
    const sk = SkeletonBuilder.buildFromPolygon(rings.map(r => [...r, r[0]]));
    if (!sk || !sk.polygons.length) return null;
    let tMax = 0;
    for (const v of sk.vertices) tMax = Math.max(tMax, v[2]);
    return {
      v: sk.vertices.flatMap(([x, y, t]) => [round(x), round(-y), round(t)]),
      f: sk.polygons,
      k: round(Math.min(PITCH, ROOF_MAX / Math.max(tMax, 0.1))),
    };
  } catch { return null; }
}

// Houses near the walk get full façade geometry in the browser (src/world/facades.ts) and roofs that
// overhang the walls by EAVE_OVERHANG; the rest keep painted façades.
const DETAIL_RADIUS = WALK_RADIUS + 70;
const EAVE_OVERHANG = 0.3;

/** Offsets every ring away from the building's inside (outer ring outwards, courtyards inwards). */
function offsetRings(rings, d) {
  const inside = (x, z) => pointInRingXZ(x, z, rings[0]) && !rings.slice(1).some(h => pointInRingXZ(x, z, h));
  return rings.map(ring => {
    const n = ring.length;
    const normals = ring.map((a, i) => {
      const b = ring[(i + 1) % n];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      let nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      if (inside(mx + nx * 0.05, mz + nz * 0.05)) { nx = -nx; nz = -nz; }
      return [nx, nz];
    });
    return ring.map((v, i) => {
      const n0 = normals[(i - 1 + n) % n], n1 = normals[i];
      let mx = n0[0] + n1[0], mz = n0[1] + n1[1];
      const ml = Math.hypot(mx, mz) || 1;
      mx /= ml; mz /= ml;
      const s = 1 / Math.max(0.35, mx * n1[0] + mz * n1[1]);
      return [v[0] + mx * d * s, v[1] + mz * d * s];
    });
  });
}
function pointInRingXZ(x, z, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// Buildings modelled from the owner's photographs (src/world/facades.ts heroFacade): style and height.
// d71a876e: the eclectic corner house east of the Town Hall (1920s photo of the square), 3 storeys.
const HEROES = { 'd71a876e': { style: 'eclectic', eave: 13.4 }, '7228928c': { style: 'hotel', eave: 16.6 } };
// 7228928c: Hotel Italia (today's Astorija, Didžioji 35) on Didžioji opposite St Casimir's (postcard 'Ulica Wielka'), 4 storeys.
for (const b of buildings) {
  const h = Object.entries(HEROES).find(([k]) => b.id.startsWith(k));
  if (h) { b.style = h[1].style; b.eave = h[1].eave; b.capped = false; }
}

let roofFails = 0;
for (const b of buildings) {
  const outerEN = b.rings[0].map(toEN);
  const c = ringCentroid(outerEN);
  const groundAbs = b.heightSource === 'lidar' && b.ground ? b.ground : groundAt(c.E, c.N) ?? H0;
  let minG = groundAbs;
  for (const [e, n] of outerEN) { const g = groundAt(e, n); if (g != null) minG = Math.min(minG, g); }
  b.groundY = round(groundAbs - H0);        // façade floor lines start here
  b.baseY = round(minG - H0 - 0.4);         // walls reach below the lowest ground
  b.eaveY = round(groundAbs - H0 + b.eave);
  b.detail = (b.role === 'ordinary' || b.role === 'recon') && b.dist <= DETAIL_RADIUS;
  b.roof = null;
  if (b.detail) {
    b.roof = buildRoof(offsetRings(b.rings, EAVE_OVERHANG));
    if (b.roof) b.overhang = EAVE_OVERHANG;
  }
  if (!b.roof) b.roof = buildRoof(b.rings);
  if (!b.roof) roofFails++;
  delete b.ground;
}
stats.roofFails = roofFails;
stats.detailed = buildings.filter(b => b.detail).length;
stats.overhangs = buildings.filter(b => b.overhang).length;

// Terrain grid at 4 m, heights relative to H0 (row 0 = south edge).
let terrainOut = null;
if (terrain) {
  const { origin, cell, nx, ny, z } = normGrid(terrain);
  const f = Math.round(TERRAIN_CELL / cell), tx = Math.floor(nx / f), ty = Math.floor(ny / f);
  const h = [];
  for (let y = 0; y < ty; y++) for (let x = 0; x < tx; x++) {
    let sum = 0;
    for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) sum += z[(y * f + j) * nx + (x * f + i)];
    h.push(round(sum / (f * f) - H0));
  }
  // c.1800 streets had slopes but no kerbs, planters or terraces: remove features
  // smaller than ~10 m (3x3 median, then two 3x3 box blurs) and keep the real gradient.
  const filt = (src, fn) => src.map((_, i) => {
    const x = i % tx, y = (i / tx) | 0, win = [];
    for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const xx = Math.min(tx - 1, Math.max(0, x + k)), yy = Math.min(ty - 1, Math.max(0, y + j));
      win.push(src[yy * tx + xx]);
    }
    return fn(win);
  });
  const median = w => w.sort((a, b) => a - b)[4];
  const mean = w => w.reduce((a, b) => a + b, 0) / w.length;
  const smooth = filt(filt(filt(h, median), mean), mean).map(round);
  terrainOut = { e0: origin[0], n0: origin[1], cell: TERRAIN_CELL, nx: tx, ny: ty, h: smooth };
}

const out = {
  meta: {
    generated: new Date().toISOString(),
    crs: 'EPSG:3346', origin: { E: E0, N: N0 },
    frame: 'X = E - 583000, Z = -(N - 6061000), metres, Y up',
    townHall: local([TOWN_HALL.E, TOWN_HALL.N]),
    h0: H0,
    walkRadius: WALK_RADIUS, contextRadius: CONTEXT_RADIUS,
    sources: [
      'GRPK PASTAT © Nacionalinė žemės tarnyba prie Aplinkos ministerijos (CC BY 4.0)',
      'Street layout and height tags © OpenStreetMap contributors (ODbL)',
      ...(lidar ? ['Lidar_DR © Nacionalinė žemės tarnyba prie Aplinkos ministerijos (CC BY 4.0)'] : []),
    ],
    stats,
  },
  buildings,
  terrain: terrainOut,
  areas: osmAreas.map(a => ({ id: a.id, name: a.name, ring: dropClosing(a.ring).map(local) })),
  roads: osmRoads.map(r => ({ id: r.id, kind: r.kind, name: r.name, tunnel: r.tunnel, line: r.line.map(local) })),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const roles = buildings.reduce((m, b) => (m[b.role] = (m[b.role] || 0) + 1, m), {});
console.log(`area.json: ${buildings.length} buildings (${buildings.filter(b => b.walk).length} in walk zone), roles ${JSON.stringify(roles)}`);
console.log(`heights: ${JSON.stringify(stats)}; areas ${osmAreas.length}; roads ${osmRoads.length}`);
console.log(`H0 ${H0} m; terrain ${terrainOut ? terrainOut.nx + 'x' + terrainOut.ny : 'none'}`);
console.log(`townHall ring ${townHallRing ? 'found' : 'MISSING'}, St Casimir ring ${stCasimirRing ? 'found' : 'MISSING'}; ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
