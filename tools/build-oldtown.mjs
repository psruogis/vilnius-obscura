// Builds public/data/oldtown.json: the rest of the Old Town for the full map, past the walk's own data
// (area.json), out to the city gates: OpenStreetMap building outlines, squares and named streets (ODbL), inside
// the protected Old Town boundary (KVR 16073) and the box round the gates, wherever area.json has no house; and
// the strip the heritage register protects along the city wall (KVR 39, "Vilniaus miesto gynybinių įtvirtinimų
// liekanų kompleksas"), which follows the wall's course from the Wet Gate round to the Bernardine Gate; and the
// castles the wall met at the Castle Gate: the edge of the castle site (KVR 141, "Vilniaus piliavietė"), and the
// Upper Castle's surviving walls (OSM barrier=city_wall inside it); and between them the Bernardine monastery,
// whose enclosure closed the ring from the Bernardine Gate to the castles (KVR 642): the ensemble's edge (KVR 766)
// up its side facing the Vilnia, and the wall that still stands from its northern tip to the castle site (OSM).
// The walk never loads it; the map fetches it when it is first opened.
//
// Local frame: X = E - 583000, Z = -(N - 6061000), 1 unit = 1 m.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toLks94 } from './lks94.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = path.join(ROOT, 'shadows-of-vilnius-seed');
const OUT = path.join(ROOT, 'public', 'data', 'oldtown.json');
const E0 = 583000, N0 = 6061000;

// The gates' box (src/world/citygates.ts) and the castle site north of it (KVR 141, to z -1130), with room round them
const [BX0, BZ0, BX1, BZ1] = [-576 - 150, -1130 - 60, 425 + 150, 469 + 150];
const CELL = 8;              // m: the grid that tells where area.json already has houses

const area = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'area.json'), 'utf8'));
const osm = JSON.parse(fs.readFileSync(path.join(SEED, 'osm', 'overpass_oldtown_bbox_2026-09-26T1341Z.json'), 'utf8'));
const boundary = JSON.parse(fs.readFileSync(path.join(SEED, 'boundary', 'kvr_16073_oldtown_epsg3346.geojson'), 'utf8'));
const kvr = JSON.parse(fs.readFileSync(path.join(SEED, 'kvr', 'kvr_objects_polygons_details.json'), 'utf8'));
const oldTown = (boundary.features ? boundary.features[0] : boundary).geometry.coordinates[0].map(([e, n]) => [e - E0, -(n - N0)]);

const round = v => Math.round(v * 10) / 10;
const inside = ([x, z], ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};
const centroid = r => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
const inBox = ([x, z]) => x >= BX0 && x <= BX1 && z >= BZ0 && z <= BZ1;

// where area.json already draws houses: every cell one of its rings touches, and the cells round them
const taken = new Set();
const key = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
for (const b of area.buildings) for (const r of b.rings) for (let i = 0; i < r.length; i++) {
  const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length], n = Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL / 2)) || 1;
  for (let k = 0; k <= n; k++) {
    const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
    for (const dx of [-CELL, 0, CELL]) for (const dz of [-CELL, 0, CELL]) taken.add(key(x + dx, z + dz));
  }
}

const nodes = new Map();
for (const el of osm.elements) if (el.type === 'node') nodes.set(el.id, el);
const line = w => w.nodes.map(id => nodes.get(id)).filter(Boolean).map(n => { const [e, nn] = toLks94(n.lon, n.lat); return [round(e - E0), round(-(nn - N0))]; });
const open = r => (r.length > 1 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1] ? r.slice(0, -1) : r);

const buildings = [], areas = [], roads = [];
const kinds = ['pedestrian', 'living_street', 'residential', 'secondary', 'tertiary', 'primary', 'unclassified'];
const haveRoad = new Set(area.roads.map(r => r.id)), haveArea = new Set(area.areas.map(a => a.id));
for (const el of osm.elements) {
  if (el.type !== 'way' || !el.tags) continue;
  const t = el.tags;
  if (t.building && !t['building:part']) {
    const r = open(line(el));
    if (r.length < 3) continue;
    const c = centroid(r);
    if (!inBox(c) || !inside(c, oldTown) || taken.has(key(...c))) continue;
    buildings.push(r);
  } else if (t.highway === 'pedestrian' && (t.area === 'yes' || el.nodes[0] === el.nodes.at(-1))) {
    const r = open(line(el));
    if (r.length >= 3 && !haveArea.has(el.id) && inBox(centroid(r))) areas.push({ name: t.name || null, ring: r });
  } else if (t.highway && t.name && !t.area && !t.tunnel && kinds.includes(t.highway)) {
    const l = line(el);
    if (l.length >= 2 && !haveRoad.has(el.id) && l.some(inBox)) roads.push({ kind: t.highway, name: t.name, line: l });
  }
}

const kvrRing = code => {
  const o = Object.values(kvr).find(v => v.attr.Code === code);
  return o ? open(o.geom.rings[0].map(([lon, lat]) => { const [e, n] = toLks94(lon, lat); return [round(e - E0), round(-(n - N0))]; })) : null;
};
const wall = kvrRing('39'), castle = kvrRing('141'), bernardines = kvrRing('766');
// what stands of the castles' own walls: OSM city_wall lines inside the castle site
const castleWalls = castle ? osm.elements.filter(el => el.type === 'way' && el.tags?.barrier === 'city_wall')
  .map(line).filter(l => l.length >= 2 && l.every(p => inside(p, castle))) : [];

// The Bernardines' line: from the ensemble's south-east corner, where the city wall's strip ends, round its east side
// (the arc of the two with the greater mean x) to its northernmost point; on along the OSM wall that starts there
// and ends at the castle site; and on to the site's edge.
let monastery = null;
if (bernardines && castle) {
  const n = bernardines.length, at = i => bernardines[((i % n) + n) % n];
  const pick = f => bernardines.reduce((b, p, i) => (f(p) > f(bernardines[b]) ? i : b), 0);
  const se = pick(p => p[0] + p[1]), north = pick(p => -p[1]);
  const arc = step => { const out = []; for (let i = se; ; i += step) { out.push(at(i)); if (((i % n) + n) % n === north) return out; } };
  const meanX = a => a.reduce((t, p) => t + p[0], 0) / a.length;
  const [a, b] = [arc(1), arc(-1)];
  const east = meanX(a) > meanX(b) ? a : b;
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const nearest = (pts, q) => pts.reduce((b, p) => (dist(p, q) < dist(b, q) ? p : b));
  const tip = at(north);
  const link = osm.elements.filter(el => el.type === 'way' && el.tags?.barrier === 'wall').map(line).filter(l => l.length >= 2)
    .map(l => (dist(l.at(-1), tip) < dist(l[0], tip) ? [...l].reverse() : l))
    .find(l => dist(l[0], tip) < 12 && dist(l.at(-1), nearest(castle, l.at(-1))) < 15);
  monastery = link ? [...east, ...link, nearest(castle, link.at(-1))] : null;
}

const out = {
  meta: {
    generated: new Date().toISOString(),
    frame: 'X = E - 583000, Z = -(N - 6061000), metres',
    box: [BX0, BZ0, BX1, BZ1],
    sources: [
      'Building outlines, squares and streets © OpenStreetMap contributors (ODbL)',
      'Old Town boundary (KVR 16073), the city wall\'s protected strip (KVR 39), the castle site (KVR 141) and the Bernardine ensemble (KVR 766): Kultūros vertybių registras, Kultūros paveldo departamentas (CC BY 4.0)',
    ],
  },
  buildings, areas, roads, wall, castle, castleWalls, monastery,
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`oldtown.json: ${buildings.length} buildings, ${areas.length} squares, ${roads.length} named streets, wall strip ${wall ? wall.length + ' points' : 'MISSING'}, castle site ${castle ? castle.length + ' points' : 'MISSING'}, ${castleWalls.length} castle walls, Bernardine line ${monastery ? monastery.length + ' points' : 'MISSING'}; ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
