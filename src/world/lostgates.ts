import type { XZ } from './area';
import { buildTowerGate, gatePlan, type GateSpec } from './towergate';

/*
 * The seven lost gates of the city wall that no drawing of their time shows whole, built from what the sources say of
 * them (docs/gates.md §10) on the tower-gate kit (world/towergate.ts): the Trakai, Vilija, Tatar, Wet, Castle,
 * Bernardine and Saviour's gates. Where a source gives a form, it is followed and cited in the docs [V]; the
 * measurements, and everything the sources leave open, are conjecture, kept in proportion with the Subačius and
 * Rūdninkai gates [U]. The Tatar Gate follows J. Kamarauskas's paintings of 1894–97, themselves imagined [U].
 * Each stands square to the wall's line in the heritage register (KVR 39) where that line is clear, or to the street
 * that ran through it, and is moved off the houses that stand on its site today. Only the Saviour's Gate lies in the
 * walk's world yet; the others are seen at vilnius.gg/gates and drawn on the map.
 */

const norm = (x: number, z: number): XZ => { const l = Math.hypot(x, z); return [x / l, z / l]; };

export interface LostGate {
  /** the viewer's key (vilnius.gg/gates#trakai) */ key: string;
  spec: GateSpec;
  /** how much of the brick the render still covers, and the render's colour (world/materials.ts createGateMaterials) */
  cover: number; plaster?: [number, number, number];
  /** the roof tiles' tint, if not the usual weathered clay */ roof?: string;
  /** the viewer's caption */ sub: string; note: string;
  /** a picture to stand where the painter stood, in place of the plain corner view: the camera's bearing in the
   *  gate's frame (out along the road, along the wall), its pitch, and the button's label */
  view?: { label: string; dir: XZ; pitch: number };
}

export const LOST_GATES: LostGate[] = [
  {
    key: 'saviour', cover: 0.96,
    sub: 'Išganytojo (Spaso) vartai, Vilnius · as it may have stood before 1801',
    note: 'The east gate by the bridge to Užupis, at the end of Išganytojo g.; built with the wall, rebuilt in 1624 by the burgomaster Jokūbas Gibelis and again in 1799, pulled down soon after. It was said to be ornate and Baroque, but no picture of it survives, so the gabled front is a design in the manner of its time, not a record.',
    spec: {
      name: "Saviour's Gate", site: [320.8, -228.8], out: norm(0.92, 0.392),
      tower: { depth: 9, hw: 6, eave: 11, roof: { kind: 'saddle', rise: 4.2, ridge: 'road', gable: 'baroque' }, bands: [6.4], pilasters: [-5.7, -2.8, 2.8, 5.7] },
      passage: { aw: 1.9, spring: 3.4 },
      holes: [
        { on: 'town', kind: 'window', y: 8.6, at: [-4.25, 4.25], w: 0.9, h: 1.5, ornate: true },
        { on: 'field', kind: 'window', y: 8.6, at: [-4.25, 4.25], w: 0.9, h: 1.5, ornate: true },
        { on: 'town', kind: 'niche', y: 8.6, at: [0], w: 1.2, h: 1.8 },          // the Saviour's image, after the name [U]
        { on: 'field', kind: 'niche', y: 8.6, at: [0], w: 1.2, h: 1.8 },
        { on: 'sides', kind: 'port', y: 8.6, at: [-2.5], r: 0.3 },
      ],
      wall: { x: -2.5, walk: 6.2, max: 24 },
    },
  },
  {
    key: 'bernardine', cover: 0.92,
    sub: 'Bernardinų vartai, Vilnius · as it may have stood about 1800',
    note: 'The gate by the Vilnia south of the Bernardine church, first named in 1593; its exact site was never found. In 2004 the footings of a square tower, 6.5 by 8.8 m, were dug up under the church’s outbuilding: it guarded the gate’s east side, and it stands here about where it was found. The gate beside it is conjecture.',
    spec: {
      name: 'Bernardine Gate', site: [425, -463], out: norm(0.985, -0.17),
      shift: [12, 18.3],                                  // onto Šv. Brunono Bonifaco g., west of the tower found in 2004
      tower: { depth: 7, hw: 4.5, eave: 9, roof: { kind: 'hip', rise: 2.2 }, bands: [6.0] },
      passage: { aw: 1.8, spring: 3.2 },
      flank: { x0: -2, x1: 4.5, z0: -13.3, z1: -4.5, eave: 12, rise: 2.4, bands: [6.0] },   // 6.5 x 8.8 m outside (KVR 39)
      holes: [
        { on: 'field', kind: 'port', y: 7.4, at: [-2.6, 2.6], r: 0.3 },
        { on: 'town', kind: 'window', y: 7.4, at: [0], w: 0.7, h: 1.1 },
        { on: 'flank', kind: 'port', y: 9.6, n: 2, r: 0.3 },
        { on: 'flank', kind: 'window', y: 4.2, at: [0], w: 0.3, h: 1.0 },
      ],
      wall: { x: -3.0, walk: 6.2, max: 24 },
    },
  },
  {
    key: 'castle', cover: 0.97,
    sub: 'Pilies vartai, Vilnius · as it may have stood about 1800',
    note: 'The gate at the head of Pilies g., where the town met the Lower Castle by the bridge over the Vilnia’s channel; it was the castle’s south gate tower, given to the district’s nobles in 1611, repaired and enlarged for their land and castle courts, and it came down only in 1837, with the court house beside it. Granite blocks in the paving mark where it stood. Its form here, a broad block of three floors, is conjecture.',
    spec: {
      name: 'Castle Gate', site: [144, -692], out: norm(-0.077, -0.997),
      tower: { depth: 11, hw: 9, eave: 12.5, roof: { kind: 'hip', rise: 3.2 }, bands: [6.6, 9.6] },
      passage: { aw: 2.0, spring: 3.4 },
      holes: [
        { on: 'town', kind: 'window', y: 8.1, n: 5, w: 0.9, h: 1.3 }, { on: 'field', kind: 'window', y: 8.1, n: 5, w: 0.9, h: 1.3 },
        { on: 'town', kind: 'window', y: 11.0, n: 5, w: 0.8, h: 1.1 }, { on: 'field', kind: 'window', y: 11.0, n: 5, w: 0.8, h: 1.1 },
        { on: 'town', kind: 'window', y: 2.4, at: [-6.5, -4.2, 4.2, 6.5], w: 0.8, h: 1.1 },
        { on: 'sides', kind: 'window', y: 8.1, n: 3, w: 0.9, h: 1.3 }, { on: 'sides', kind: 'window', y: 11.0, n: 3, w: 0.8, h: 1.1 },
        { on: 'field', kind: 'port', y: 2.6, at: [-6.5, 6.5], r: 0.3 },
      ],
      wall: { x: -3.0, walk: 6.2, max: 12 },
    },
  },
  {
    key: 'wet', cover: 0.85,
    sub: 'Šv. Marijos Magdalenos (Šlapieji) vartai, Vilnius · walled up, as it stood before 1800',
    note: 'The small north-west gate to the Lukiškės and Puškarnė suburbs and the bridge over the Kačerga brook; walled up in 1677 and not used again. From Smuglevičius’s panorama of 1785, which shows its north side, and other views, it was small: one storey under a hipped roof, a tall arched gateway and two gun ports either side, a little taller than the wall. Its site was never found on the ground.',
    spec: {
      name: 'Wet Gate', site: [-87, -714], out: norm(-0.126, -0.992),
      tower: { depth: 6, hw: 4.5, eave: 9.4, roof: { kind: 'hip', rise: 2.4 }, bands: [7.0] },
      passage: { aw: 1.9, spring: 4.2, walled: true },
      holes: [
        { on: 'field', kind: 'port', y: 2.2, at: [-3.25, 3.25], r: 0.28 }, { on: 'field', kind: 'port', y: 5.0, at: [-3.25, 3.25], r: 0.28 },
      ],
      wall: { x: -3.0, walk: 6.2, max: 24 },
    },
  },
  {
    key: 'tatar', cover: 0.55, plaster: [0.76, 0.6, 0.36], roof: '#a65c48',   // Kamarauskas's flaking ochre, red tiles
    sub: 'Totorių vartai, Vilnius · after Juozapas Kamarauskas, 1894–97',
    note: 'The north gate east of where Benediktinių g. meets Totorių g., named, it is said, for the Tatar soldiers who kept it; at the end of the 18th century it still had three storeys under a tiled roof. No picture from its time survives. In 1894–97 Juozapas Kamarauskas painted it as he imagined it, and it is built after him: a Gothic gatehouse with a steep roof along the wall, brick gables full of blind niches under a crescent vane, and the gateway in a tall brick frame with three round openings over the arch.',
    view: { label: 'The 1894 view', dir: [1, 0.9], pitch: 0.03 },
    spec: {
      name: 'Tatar Gate', site: [-284, -513], out: norm(-0.698, -0.716),
      // a gatehouse, its ridge along the wall and its Gothic gables at the wall's ends (Kamarauskas 1894, 1897)
      tower: { depth: 10, hw: 6, eave: 12.5, roof: { kind: 'saddle', rise: 7.2, ridge: 'wall', gable: 'gothic' }, chimney: true, vane: 'crescent' },
      passage: { aw: 1.6, spring: 3.4, bay: { w: 5.8, h: 9.3 } },
      holes: [
        { on: 'field', kind: 'port', y: 7.0, at: [-1.0, 0, 1.0], r: 0.36 },            // three round openings over the arch (1894)
        { on: 'field', kind: 'window', y: 10.5, at: [-3.4, 3.4], w: 0.55, h: 0.85 },    // small windows high up (1897)
        { on: 'sides', kind: 'window', y: 6.9, at: [3.4], w: 0.5, h: 1.0 },
        { on: 'town', kind: 'window', y: 7.2, at: [-3.2, 3.2], w: 0.6, h: 0.95 }, { on: 'town', kind: 'window', y: 10.3, at: [-3.2, 0, 3.2], w: 0.6, h: 0.95 },
      ],
      wall: { x: -4.0, walk: 6.2, max: 24 },
    },
  },
  {
    key: 'vilija', cover: 0.93,
    sub: 'Vilijos (Vilniaus) vartai, Vilnius · as it may have stood before 1802',
    note: 'The north gate to the Neris and on across it to Ukmergė, named from 1555, pulled down in November 1802. An image of the Virgin hung over it; when the gate came down it went to the chapel of the orphanage on Subačiaus g. The tower’s form is conjecture.',
    spec: {
      name: 'Vilija Gate', site: [-381, -462], out: norm(-0.478, -0.879),
      shift: [1.5, -5.5],                                 // between the houses either side of Šv. Ignoto g.
      tower: { depth: 8.5, hw: 5.5, eave: 14, roof: { kind: 'hip', rise: 2.6 }, bands: [6.0, 10.0] },
      passage: { aw: 1.8, spring: 3.2 },
      holes: [
        { on: 'town', kind: 'niche', y: 7.9, at: [0], w: 1.3, h: 1.9 },            // the Virgin's image (KVR 39)
        { on: 'town', kind: 'window', y: 12.2, at: [-2.6, 2.6] },
        { on: 'field', kind: 'port', y: 12.2, n: 3, r: 0.3 }, { on: 'field', kind: 'window', y: 8.0, at: [0], w: 0.5, h: 1.6 },
        { on: 'sides', kind: 'port', y: 12.2, n: 2, r: 0.3 }, { on: 'sides', kind: 'window', y: 8.0, at: [-2.5], w: 0.6, h: 0.9 },
      ],
      wall: { x: -2.5, walk: 6.2, max: 24 },
    },
  },
  {
    key: 'trakai', cover: 0.95,
    sub: 'Trakų vartai, Vilnius · as it may have stood before 1803',
    note: 'The west gate on the road to Trakai, in the gap still left between Pylimo g. 22 and Trakų g. 2, where the Kačerga brook ran along the wall. A Baroque gate of two storeys under a saddle roof, with few gun ports, rich window surrounds and saints’ images; the Virgin’s hung on the town side and went to the Franciscans’ church in 1803, before the gate came down. The details are conjecture.',
    spec: {
      name: 'Trakai Gate', site: [-575, -181], out: [-1, 0],
      shift: [-13, -4],                                   // into the gap between the two houses (KVR 39)
      tower: { depth: 7, hw: 7.5, eave: 10.5, roof: { kind: 'saddle', rise: 4.5, ridge: 'wall' }, bands: [6.2], pilasters: [-7.2, -2.9, 2.9, 7.2], cross: true },
      passage: { aw: 1.9, spring: 3.4 },
      holes: [
        { on: 'town', kind: 'niche', y: 8.2, at: [0], w: 1.4, h: 2.0 },            // the Virgin's image (KVR 39)
        { on: 'field', kind: 'niche', y: 8.2, at: [0], w: 1.2, h: 1.8 },           // a saint's
        { on: 'town', kind: 'window', y: 8.2, at: [-5.05, 5.05], w: 0.9, h: 1.5, ornate: true },
        { on: 'field', kind: 'window', y: 8.2, at: [-5.05, 5.05], w: 0.9, h: 1.5, ornate: true },
        { on: 'town', kind: 'window', y: 2.6, at: [-5.05, 5.05], w: 0.7, h: 1.0 },
        { on: 'field', kind: 'port', y: 2.4, at: [-5.05, 5.05], r: 0.26 },
        { on: 'sides', kind: 'window', y: 12.0, at: [0], w: 0.6, h: 0.9 },         // in the gables
      ],
      wall: { x: -3.5, walk: 6.2, max: 24 },
    },
  },
];

export const lostGatePlan = (g: LostGate) => gatePlan(g.spec);
export const buildLostGate = (g: LostGate, o: Parameters<typeof buildTowerGate>[1]) => buildTowerGate(g.spec, o);
