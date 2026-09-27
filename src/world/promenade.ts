import * as THREE from 'three';
import type { Building } from './area';
import type { Terrain } from './terrain';
import type { PromenadeMaterials } from './materials';
import { townHallFrame, TOWN_HALL_SIZE } from './townhall';
import { mbox, merged, trianglesToGeometry } from './geom';
import { treeGeometry } from './trees';
import { bevelBox, sweep, lathe, steadyAge, type P2 } from './classical';
import { buildLawn, type LawnPanel } from './lawn';
import { WET, RAIN_TIME } from '../render/weather';
import { age } from './ageing';
import type { LampSpot } from './lamps';

/**
 * The fenced, tree-lined promenade in front of the Town Hall portico, and a market booth beside it.
 *
 * Layout from the 1842 plan (docs/REFERENCES.md §4.5): an enclosure as wide as the portico running
 * straight on from it up the middle of Didžioji, a row of trees inside each side fence, a rounded north
 * end with a well. Look from the period views: stone posts with timber rails, young trees (the c.1800
 * watercolour), and a long low booth with a tiled hip roof west of the portico.
 *
 * By c.1900 it is a municipal garden: three lawn panels in granite kerbs, cut by gravel cross walks at
 * the side entrances, a round basin with a fountain in the northern panel, gas lamps along the fences.
 * The fence posts stand on a low stone curb that edges the gravel. (The garden layout is conjecture in
 * the manner of the period's town squares, grade C.)
 */

const HALF = 14.3;            // fence line, either side of the axis (the portico is 28 m wide)
const TREE_T = 12.3;          // tree rows
const LAWN_T = 8.8;           // lawn edge (a 2.6 m gravel walk on either side, then the trees)
const LENGTH = 140;           // portico steps to the apex of the rounded north end
const R_END = HALF;
const S_END = LENGTH - R_END; // centre of the rounded end
const SKEW = THREE.MathUtils.degToRad(3); // the plan's axis leans ~3° west of the Town Hall's
const POST_STEP = 3.0;
const GAPS: [number, number][] = [[43, 47], [88, 92]]; // side entrances (s ranges, both sides)
const APEX_GAP = 0.16;        // half-angle of the north entrance, radians
const PANELS: LawnPanel[] = [
  { s0: 7, s1: 41.5, t0: -LAWN_T, t1: LAWN_T, r: 2.2 },
  { s0: 48.5, s1: 86.5, t0: -LAWN_T, t1: LAWN_T, r: 2.2 },
  { s0: 93.5, s1: 121.7, t0: -LAWN_T, t1: LAWN_T, r: 2.2, hole: [0, 0, 6.4] },
];
const BASIN_S = (PANELS[2].s0 + PANELS[2].s1) / 2, BASIN_R = 4.2;
// A cast-iron lamp standard, turned: moulded foot, fluted-looking drum, a ringed shaft, the lantern's seat
const LAMP_POST: P2[] = [[0.27, 0], [0.27, 0.07], [0.24, 0.09], [0.24, 0.15], [0.2, 0.18], [0.22, 0.22], [0.19, 0.27], [0.16, 0.3], [0.15, 0.52],
  [0.17, 0.55], [0.17, 0.6], [0.12, 0.66], [0.095, 0.74], [0.085, 0.8], [0.083, 1.36], [0.1, 1.39], [0.1, 1.45], [0.078, 1.49], [0.06, 3.5],
  [0.085, 3.54], [0.085, 3.61], [0.058, 3.65], [0.055, 3.95], [0.09, 3.98], [0.125, 4.04], [0.125, 4.1], [0.1, 4.16], [0.1, 4.24],
  [0.15, 4.27], [0.15, 4.3], [0.1, 4.31], [0, 4.31]];
const CURB_W = 0.42, CURB_H = 0.16; // the fence curb

export interface Promenade { group: THREE.Group; segments: [number, number, number, number][]; update(dt: number): void; lamps: LampSpot[] }

export function buildPromenade(th: Building, terrain: Terrain, mats: PromenadeMaterials, withBooth = false): Promenade {
  const f = townHallFrame(th);
  const { PORTICO_X0, PORTICO_X1, PORTICO_DEPTH } = TOWN_HALL_SIZE;
  // Promenade frame (s along the axis from the portico steps, t across, + towards the east side),
  // expressed in the Town Hall frame, then in the world.
  const s0x = (PORTICO_X0 + PORTICO_X1) / 2, s0z = -PORTICO_DEPTH - 2.2;
  const ax = -Math.sin(SKEW), az = -Math.cos(SKEW);   // along
  const nx = Math.cos(SKEW), nz = -Math.sin(SKEW);    // across
  const world = (s: number, t: number): THREE.Vector3 => {
    const lx = s0x + s * ax + t * nx, lz = s0z + s * az + t * nz;
    const p = f.origin.clone().addScaledVector(f.dirX, lx).addScaledVector(f.dirZ, lz);
    p.y = terrain.heightAt(p.x, p.z);
    return p;
  };
  // World yaw of the promenade's s axis, for boxes whose length runs along X.
  const along = new THREE.Vector3().addScaledVector(f.dirX, ax).addScaledVector(f.dirZ, az).normalize();
  const yawAlong = Math.atan2(-along.z, along.x);

  const stone: THREE.BufferGeometry[] = [], wood: THREE.BufferGeometry[] = [], bark: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [], gravel: THREE.BufferGeometry[] = [], roof: THREE.BufferGeometry[] = [];
  const kerbs: THREE.BufferGeometry[] = [], soil: THREE.BufferGeometry[] = [];
  const segments: [number, number, number, number][] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
  const place = (g: THREE.BufferGeometry, p: THREE.Vector3, yaw: number) =>
    g.applyMatrix4(m.compose(p, q.setFromAxisAngle(Y, yaw), one));
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // --- Kerbs: dressed stones about a metre long along an outline in (s, t), following the ground ----
  // Each stone is a swept section with chamfered arrises, bedded `sink` below the ground; on curves
  // the stones are curved (as cut kerbs are), with slight differences in height and joints between.
  const kerb = (pts: P2[], closed: boolean, w: number, h: number, sink: number, len = 1.0) => {
    const path = closed ? [...pts, pts[0]] : pts;
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    const total = cum[cum.length - 1], n = Math.max(1, Math.round(total / len));
    const at = (d: number): P2 => {
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i++;
      const k = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
      return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * k, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * k];
    };
    const cuts = Array.from({ length: n + 1 }, (_, i) => (i === 0 || i === n ? (total * i) / n : (total * (i + (rnd() - 0.5) * 0.3)) / n));
    const b = 0.018;
    for (let i = 0; i < n; i++) {
      const d0 = cuts[i] + 0.004, d1 = cuts[i + 1] - 0.004;
      const pp: P2[] = [at(d0)];
      for (let k = 1; k < path.length - 1; k++) if (cum[k] > d0 + 0.02 && cum[k] < d1 - 0.02) pp.push(path[k]);
      pp.push(at(d1));
      const dy = (rnd() - 0.5) * 0.022, dt = (rnd() - 0.5) * 0.012;
      const prof: P2[] = [[w / 2, -sink], [w / 2, h - b], [w / 2 - b, h], [-w / 2 + b, h], [-w / 2, h - b], [-w / 2, -sink]].map(([s, u]) => [s + dt, u + dy] as P2);
      kerbs.push(sweep(pp.map(([s, t]) => world(s, t)), Y, prof, { hard: 50 }));
    }
  };
  const arc = (cs: number, ct: number, r: number, a0: number, a1: number, n: number): P2[] =>
    Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cs + Math.cos(a) * r, ct + Math.sin(a) * r] as P2; });
  const roundedRect = (P: LawnPanel, off: number): P2[] => {
    const r = P.r + off, s0 = P.s0 - off, s1 = P.s1 + off, t0 = P.t0 - off, t1 = P.t1 + off, n = 8;
    return [
      ...arc(s1 - r, t0 + r, r, -Math.PI / 2, 0, n), ...arc(s1 - r, t1 - r, r, 0, Math.PI / 2, n),
      ...arc(s0 + r, t1 - r, r, Math.PI / 2, Math.PI, n), ...arc(s0 + r, t0 + r, r, Math.PI, Math.PI * 1.5, n),
    ];
  };

  // --- Fence: stone posts on a low curb, two timber rails, broken by the entrances --------------
  const curbTop = (p: THREE.Vector3) => p.clone().setY(p.y + CURB_H);
  const fenceRun = (pts: THREE.Vector3[]) => {
    for (const p of pts) {
      const post: THREE.BufferGeometry[] = [
        bevelBox(0.38, 0.14, 0.38, 0, 0.07, 0, 0.025),          // footing
        bevelBox(0.28, 0.8, 0.28, 0, 0.14 + 0.4, 0, 0.03),      // shaft
        bevelBox(0.36, 0.07, 0.36, 0, 0.975, 0, 0.02),          // cap slab
        bevelBox(0.3, 0.05, 0.3, 0, 1.035, 0, 0.015),
      ];
      const top = new THREE.ConeGeometry(0.2, 0.13, 4, 1).rotateY(Math.PI / 4).toNonIndexed(); // pyramidal cap
      top.computeVertexNormals();
      post.push(top.translate(0, 1.06 + 0.065, 0));
      for (const g of post) stone.push(place(g, curbTop(p), yawAlong));
    }
    for (let i = 0; i + 1 < pts.length; i++) {
      const A = pts[i], B = pts[i + 1];
      const L = Math.hypot(B.x - A.x, B.z - A.z);
      const yaw = Math.atan2(-(B.z - A.z), B.x - A.x);
      const mid = curbTop(A.clone().add(B).multiplyScalar(0.5));
      const pitch = Math.atan2(B.y - A.y, L);
      for (const h of [0.44, 0.84]) {
        const rail = bevelBox(L - 0.26, 0.09, 0.07, 0, 0, 0, 0.014).rotateZ(pitch).translate(0, h, 0);
        wood.push(place(rail, mid.clone(), yaw));
      }
      segments.push([A.x, A.z, B.x, B.z]);
    }
  };
  for (const side of [-1, 1]) {
    // Straight sides, split at the entrances
    const cuts = [0, ...GAPS.flat(), S_END];
    for (let k = 0; k < cuts.length; k += 2) {
      const a = cuts[k], b = cuts[k + 1];
      const n = Math.max(1, Math.round((b - a) / POST_STEP));
      fenceRun(Array.from({ length: n + 1 }, (_, i) => world(a + ((b - a) * i) / n, side * HALF)));
      kerb([[a - 0.22, side * HALF], [b + (b === S_END ? 0 : 0.22), side * HALF]], false, CURB_W, CURB_H, 0.12, 1.3);
    }
    // Rounded north end, each half up to the entrance
    const a0 = 0, a1 = Math.PI / 2 - APEX_GAP; // angle from the side towards the apex
    const n = Math.max(2, Math.round((R_END * (a1 - a0)) / POST_STEP));
    fenceRun(Array.from({ length: n + 1 }, (_, i) => {
      const a = a0 + ((a1 - a0) * i) / n;
      return world(S_END + Math.sin(a) * R_END, side * Math.cos(a) * R_END);
    }));
    const ends = Array.from({ length: 25 }, (_, i) => { const a = a0 + ((a1 + 0.012 - a0) * i) / 24; return [S_END + Math.sin(a) * R_END, side * Math.cos(a) * R_END] as P2; });
    kerb(ends, false, CURB_W, CURB_H, 0.12, 1.3);
  }

  // --- Lindens inside each fence, grown by c.1900, each in a ring of bare earth -------------------
  let i = 0;
  for (let s = 5; s <= S_END - 2; s += 8.5, i++) {
    if (GAPS.some(([a, b]) => s > a - 1.5 && s < b + 1.5)) continue;
    for (const side of [-1, 1]) {
      const p = world(s, side * TREE_T);
      const k = 0.85 + 0.3 * ((i * 7 + (side > 0 ? 3 : 0)) % 5) / 4;
      const t = treeGeometry(i * 2 + (side > 0 ? 1 : 0), k * 2.05); // c.1900: grown lindens (~10 m)
      bark.push(place(t.wood, p.clone(), i));
      leaves.push(place(t.leaves, p.clone(), i * 1.7));
      soil.push(new THREE.CircleGeometry(0.62, 20).rotateX(-Math.PI / 2).translate(p.x, p.y + 0.055, p.z));
    }
  }

  // --- Gravel, following the ground, from curb to curb --------------------------------------------
  const tris: THREE.Vector3[][] = [];
  const lift = (p: THREE.Vector3) => { p.y += 0.04; return p; };
  const GT = HALF - CURB_W / 2 + 0.02;
  const ds = 3, dtt = GT / 4;
  for (let s = 0; s < S_END; s += ds) {
    for (let t = -GT; t < GT - 1e-6; t += dtt) {
      const a = lift(world(s, t)), b = lift(world(s, t + dtt)), c = lift(world(Math.min(s + ds, S_END), t + dtt)), d = lift(world(Math.min(s + ds, S_END), t));
      tris.push([a, b, c], [a, c, d]);
    }
  }
  const segs = 24;
  for (let k = 0; k < segs; k++) {
    const a0 = -Math.PI / 2 + (Math.PI * k) / segs, a1 = -Math.PI / 2 + (Math.PI * (k + 1)) / segs;
    for (const [r0, r1] of [[0, GT * 0.5], [GT * 0.5, GT]]) {
      const p = (r: number, a: number) => lift(world(S_END + Math.cos(a) * r, Math.sin(a) * r));
      if (r0 === 0) tris.push([lift(world(S_END, 0)), p(r1, a0), p(r1, a1)]);
      else tris.push([p(r0, a0), p(r1, a0), p(r1, a1)], [p(r0, a0), p(r1, a1), p(r0, a1)]);
    }
  }
  gravel.push(flatGeometry(tris));

  // --- Lawns in granite kerbs --------------------------------------------------------------------
  const KERB_W = 0.15;
  for (const P of PANELS) {
    kerb(roundedRect(P, KERB_W / 2), true, KERB_W, 0.13, 0.1, 0.95);
    if (P.hole) {
      const [hs, ht, hr] = P.hole, cs = (P.s0 + P.s1) / 2 + hs, ct = (P.t0 + P.t1) / 2 + ht;
      kerb(arc(cs, ct, hr - KERB_W / 2, 0, Math.PI * 2, 48).slice(0, -1), true, KERB_W, 0.13, 0.1, 0.8);
    }
  }
  const lawns = buildLawn(PANELS, world, mats.lawn, (mats.leaves.userData.time ?? { value: 0 }) as { value: number });

  // --- Basin: a moulded stone rim round dark water, a fountain on a baluster pedestal ------------
  const bp = world(BASIN_S, 0);
  const R = BASIN_R;
  const rimP: P2[] = [[R - 0.02, -0.2], [R - 0.02, 0.06], [R + 0.04, 0.09], [R + 0.04, 0.14], [R, 0.16],   // footing, plinth
    [R - 0.03, 0.2], [R - 0.03, 0.36], [R + 0.03, 0.38], [R + 0.07, 0.42], [R + 0.08, 0.47], [R + 0.06, 0.51], [R + 0.02, 0.535], // wall, torus-nosed coping
    [R - 0.12, 0.55], [R - 0.26, 0.545], [R - 0.3, 0.52], [R - 0.31, 0.48], [R - 0.31, 0.2]];                    // top, inner face
  stone.push(lathe(rimP, 72, { hard: 60 }).translate(bp.x, bp.y, bp.z));
  const pedP: P2[] = [[0.62, 0.15], [0.62, 0.34], [0.55, 0.38], [0.5, 0.42], [0.36, 0.5], [0.28, 0.62], [0.26, 0.8], [0.3, 0.95], // base, baluster
    [0.24, 1.04], [0.2, 1.08], [0.24, 1.12], [0.62, 1.2], [0.95, 1.28], [1.08, 1.34], [1.12, 1.4], [1.08, 1.45], [0.98, 1.46], [0.9, 1.4], // bowl
    [0.35, 1.36], [0.18, 1.42], [0.16, 1.62], [0.22, 1.7], [0.2, 1.78], [0.08, 1.9], [0, 1.94]];                                          // finial
  stone.push(lathe(pedP, 40, { hard: 55 }).translate(bp.x, bp.y, bp.z));
  const water: THREE.BufferGeometry[] = [
    new THREE.CircleGeometry(R - 0.3, 64).rotateX(-Math.PI / 2).translate(bp.x, bp.y + 0.42, bp.z),
    new THREE.CircleGeometry(0.9, 24).rotateX(-Math.PI / 2).translate(bp.x, bp.y + 1.43, bp.z),     // the bowl, brim-full
  ];
  segments.push(...ringSegments(bp, R + 0.12, 16));
  // the fountain running: a low jet from the finial, and the bowl overflowing in a thin veil
  const falls: THREE.BufferGeometry[] = [
    lathe([[1.13, 1.45], [1.16, 1.36], [1.2, 1.1], [1.25, 0.75], [1.3, 0.43]], 48).translate(bp.x, bp.y, bp.z),
    lathe([[0.03, 1.9], [0.022, 2.2], [0.012, 2.42], [0, 2.46]], 10).translate(bp.x, bp.y, bp.z),
    lathe([[0.02, 2.4], [0.09, 2.36], [0.16, 2.2], [0.2, 1.95]], 16).translate(bp.x, bp.y, bp.z),   // falling back round it
  ];
  // cast-iron gas lamps just outside both fences
  const iron: THREE.BufferGeometry[] = [];
  const lamps: LampSpot[] = [];
  for (let s = 10; s < S_END - 4; s += 18) {
    for (const side of [-1, 1]) {
      const lp = world(s + (side > 0 ? 9 : 0), side * (HALF + 0.9));
      iron.push(lathe(LAMP_POST, 12, { hard: 50 }).translate(lp.x, lp.y, lp.z));
      for (let k = 0; k < 6; k++) {                                                    // the lantern's glazing bars
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6, bar = bevelBox(0.022, 0.42, 0.022, 0, 0, 0, 0.006).rotateZ(-0.12);
        iron.push(bar.rotateY(-a).translate(lp.x + Math.cos(a) * 0.125, lp.y + 4.5, lp.z + Math.sin(a) * 0.125));
      }
      iron.push(new THREE.SphereGeometry(0.045, 8, 6).translate(lp.x, lp.y + 5.1, lp.z)); // finial
      lamps.push({ pos: new THREE.Vector3(lp.x, lp.y + 4.5, lp.z), ground: new THREE.Vector2(lp.x - (lp.x - world(s, 0).x) * 0.12, lp.z - (lp.z - world(s, 0).z) * 0.12) }); // glass: lamps.ts
      iron.push(new THREE.ConeGeometry(0.3, 0.3, 6).translate(lp.x, lp.y + 4.93, lp.z));
      iron.push(mbox(0.5, 0.04, 0.04, 0, 3.7, 0).applyMatrix4(new THREE.Matrix4().makeTranslation(lp.x, lp.y, lp.z))); // ladder bar
      segments.push(...ringSegments(lp, 0.25, 6));
    }
  }

  // --- Market booth west of the portico (the c.1800 watercolour) -------------------------------
  // Long and low, a tiled hip roof, its open side (counter and posts) facing the promenade.
  // (c.1800 only: by 1900 the square has no market booths)
  if (withBooth) {
    const bw = 4.6, bl = 15, eave = 2.7;
    const bc = new THREE.Vector3().copy(f.origin)
      .addScaledVector(f.dirX, -8.5).addScaledVector(f.dirZ, -22);
    bc.y = terrain.heightAt(bc.x, bc.z);
    const byaw = yawAlong; // long side parallel to the promenade
    const booth: THREE.BufferGeometry[] = [];
    booth.push(mbox(bl, eave + 0.6, 0.18, 0, (eave + 0.6) / 2 - 0.6, -bw / 2));        // back wall (west)
    booth.push(mbox(0.18, eave + 0.6, bw, -bl / 2, (eave + 0.6) / 2 - 0.6, 0));        // end walls
    booth.push(mbox(0.18, eave + 0.6, bw, bl / 2, (eave + 0.6) / 2 - 0.6, 0));
    booth.push(mbox(bl, 1.5, 0.16, 0, 0.75 - 0.6, bw / 2));                              // counter (east)
    for (let x = -bl / 2; x <= bl / 2 + 1e-6; x += bl / 6) booth.push(mbox(0.2, eave, 0.2, x, eave / 2, bw / 2));
    booth.push(mbox(bl, 0.25, 0.22, 0, eave - 0.12, bw / 2));                            // lintel
    booth.forEach((g, k) => (k < 3 ? stone : wood).push(place(g, bc.clone(), byaw))); // walls limewashed, the rest timber
    roof.push(place(hipRoof(bl + 0.8, bw + 0.8, eave, 32), bc.clone(), byaw));
    const corners = [[-bl / 2, -bw / 2], [bl / 2, -bw / 2], [bl / 2, bw / 2], [-bl / 2, bw / 2]]
      .map(([x, z]) => new THREE.Vector3(x, 0, z).applyAxisAngle(Y, byaw).add(bc));
    for (let k = 0; k < 4; k++) segments.push([corners[k].x, corners[k].z, corners[(k + 1) % 4].x, corners[(k + 1) % 4].z]);
  }

  // --- Materials of our own: granite kerbs, bare earth, wet gravel -------------------------------
  const granite = new THREE.MeshStandardMaterial({ color: '#aaa397', roughness: 0.9, map: (mats.stone as THREE.MeshStandardMaterial).map });
  const kerbMat = damp(steadyAge(age(granite, { strength: 1.2, seed: 9 })) as THREE.MeshStandardMaterial, 0.6); // worn grey granite
  const soilMat = damp(new THREE.MeshStandardMaterial({ color: '#4a3b2c', roughness: 1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), 0.55);
  damp(mats.gravel, 0.75, 'gravel');
  damp(mats.water, 1, 'water');
  steadyAge(mats.stone);                       // the basin, fountain and posts are turned or small
  const barkMat = mats.bark.clone() as THREE.MeshStandardMaterial;
  barkMat.color.set('#71675b');               // linden bark: grey-brown, not black

  // --- Meshes ----------------------------------------------------------------------------------
  const group = new THREE.Group();
  group.name = 'promenade';
  const add = (parts: THREE.BufferGeometry[], mat: THREE.Material, shadow = true, name = '') => {
    if (!parts.length) return;
    const mesh = new THREE.Mesh(merged(parts.map(withUv)), mat);
    mesh.name = name;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(stone, mats.stone);
  add(kerbs, kerbMat, false);
  add(wood, mats.wood);
  add(bark, barkMat);
  add(leaves, mats.leaves);
  add(roof, mats.roof);
  add(gravel, mats.gravel, false, 'promenade-gravel');
  add(soil, soilMat, false);
  add(water, mats.water, false);
  add(falls, fallingWater((mats.leaves.userData.time ?? { value: 0 }) as { value: number }), false);
  add(iron, mats.iron);
  group.add(lawns);
  const clock = (mats.leaves.userData.time ?? { value: 0 }) as { value: number };
  return { group, segments, lamps, update: dt => { clock.value += dt; } };
}

/**
 * Rain on stone, earth, gravel and water (materials main.ts doesn't wet): darker and glossier with
 * WET. Gravel also gets pebbles and, in rain, shallow puddles in the low spots; puddles and the basin
 * water get rings from the drops.
 */
function damp(m: THREE.MeshStandardMaterial, dark: number, kind: 'plain' | 'gravel' | 'water' = 'plain'): THREE.MeshStandardMaterial {
  const own = m.onBeforeCompile, ownKey = m.customProgramCacheKey();
  m.onBeforeCompile = (shader, renderer) => {
    own.call(m, shader, renderer);
    shader.uniforms.uDampWet = WET;
    shader.uniforms.uDampTime = RAIN_TIME;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDampW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDampW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vDampW; uniform float uDampWet; uniform float uDampTime;
        float dp_h(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
        float dp_n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(dp_h(i), dp_h(i + vec2(1, 0)), f.x), mix(dp_h(i + vec2(0, 1)), dp_h(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dpPuddle = ${kind === 'water' ? 'uDampWet' : '0.0'}, dpPeb = 0.0;
        ${kind === 'gravel' ? `
        {
          // pebbles: two sizes of jittered stones, each of its own tone, in a darker sandy matrix;
          // faded out where they would be smaller than a pixel
          float px = length(fwidth(vDampW.xz));
          float peb = 0.0, tone = 0.0;
          for (int k = 0; k < 2; k++) {
            float sc = k == 0 ? 52.0 : 21.0;
            vec2 q = vDampW.xz * sc + float(k) * 17.3, c = floor(q), fq = fract(q) - 0.5;
            vec2 o = (vec2(dp_h(c), dp_h(c + 7.0)) - 0.5) * 0.5;
            float r = 0.16 + 0.2 * dp_h(c + 3.0), e = length((fq - o) * vec2(1.0, 1.0 + 0.7 * dp_h(c + 5.0)));
            float mk = (1.0 - smoothstep(r * 0.55, r, e)) * step(0.3, dp_h(c + 11.0)) * (1.0 - smoothstep(0.5, 1.5, px * sc));
            if (mk > peb) { peb = mk; tone = dp_h(c + 13.0); }
          }
          // grey granite chips to pale limestone, in a sandy matrix that darkens more than they do in rain
          float lum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
          vec3 stoneC = mix(vec3(lum * 0.95, lum * 0.97, lum), diffuseColor.rgb * 1.15, tone) * (0.9 + 0.35 * tone);
          diffuseColor.rgb = mix(diffuseColor.rgb * mix(0.92, 0.72, uDampWet), stoneC, peb * 0.75);
          dpPeb = peb;
          diffuseColor.rgb *= 0.88 + 0.24 * dp_n(vDampW.xz * 0.35);
          dpPuddle = smoothstep(0.64, 0.74, dp_n(vDampW.xz * 0.28) * 0.7 + dp_n(vDampW.xz * 1.3) * 0.3) * uDampWet;
          diffuseColor.rgb *= 1.0 - 0.3 * dpPuddle;
        }` : ''}
        diffuseColor.rgb *= mix(1.0, ${dark.toFixed(2)}, uDampWet);`)
      .replace('#include <metalnessmap_fragment>', `roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.55, uDampWet);
        roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.55, dpPeb * uDampWet);   // wet pebbles glint
        roughnessFactor = mix(roughnessFactor, 0.05, ${kind === 'water' ? '0.0' : 'dpPuddle'});
        #include <metalnessmap_fragment>`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (dpPuddle > 0.01) {
          // drop rings
          vec2 q = vDampW.xz / 0.5, g = vec2(0.0);
          for (int k = 0; k < 2; k++) {
            vec2 c = floor(q + float(k) * 0.5), fq = q + float(k) * 0.5 - c;
            float ph = fract(uDampTime * (0.9 + 0.4 * dp_h(c + 3.0)) + dp_h(c + 9.0));
            vec2 d = fq - (vec2(dp_h(c), dp_h(c + 17.0)) * 0.6 + 0.2); float r = length(d);
            g += normalize(d + 1e-4) * sin((r - ph * 0.45) * 55.0) * (1.0 - ph) * smoothstep(ph * 0.45 + 0.07, ph * 0.45, r) * smoothstep(ph * 0.45 - 0.12, ph * 0.45, r);
          }
          vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          normal = normalize(mix(normal, upV, dpPuddle) + (viewMatrix * vec4(g.x, 0.0, g.y, 0.0)).xyz * 0.25 * dpPuddle);
        }`);
  };
  m.customProgramCacheKey = () => `${ownKey}|damp-${kind}${dark}`;
  m.needsUpdate = true;
  return m;
}

/** Thin falling water: translucent, streaked, the streaks running down (uv.y runs down the sheet). */
function fallingWater(clock: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#dfe6e2', roughness: 0.08, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.onBeforeCompile = shader => {
    shader.uniforms.uFallTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFallUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvFallUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vFallUv; uniform float uFallTime;
        float fw_h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float fw_n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(fw_h(i), fw_h(i + vec2(1, 0)), f.x), mix(fw_h(i + vec2(0, 1)), fw_h(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // streaks falling, broken up as the sheet thins towards the bottom
        float fwS = fw_n(vec2(vFallUv.x * 14.0, vFallUv.y * 2.5 - uFallTime * 3.2)) * 0.6 + fw_n(vec2(vFallUv.x * 37.0, vFallUv.y * 6.0 - uFallTime * 4.5)) * 0.4;
        diffuseColor.a = clamp(0.1 + 0.55 * smoothstep(0.35, 0.8, fwS), 0.0, 1.0) * (1.0 - 0.5 * smoothstep(0.4, 1.0, vFallUv.y));`);
  };
  m.customProgramCacheKey = () => 'falling-water';
  return m;
}

/** Up-facing triangles with planar (x, z) UVs in metres. */
function flatGeometry(tris: THREE.Vector3[][]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let [a, b, c] of tris) {
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize();
    if (n.y < 0) { [b, c] = [c, b]; n.negate(); }
    for (const p of [a, b, c]) { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(p.x, p.z); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Keeps position/normal/uv only (zero UVs where missing), so mixed parts merge. */
function withUv(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'aSway'].includes(k)) g.deleteAttribute(k);
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  return g;
}

function ringSegments(c: THREE.Vector3, r: number, n = 10): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, b = ((k + 1) / n) * Math.PI * 2;
    out.push([c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, c.x + Math.cos(b) * r, c.z + Math.sin(b) * r]);
  }
  return out;
}

/** A hip roof over an l × w rectangle centred on the origin, springing from height y. */
function hipRoof(l: number, w: number, y: number, pitchDeg: number): THREE.BufferGeometry {
  const rise = (w / 2) * Math.tan(THREE.MathUtils.degToRad(pitchDeg));
  const hx = l / 2, hz = w / 2, r = Math.max(0, hx - hz);
  const V = (x: number, yy: number, z: number) => new THREE.Vector3(x, yy, z);
  const a = V(-hx, y, -hz), b = V(hx, y, -hz), c = V(hx, y, hz), d = V(-hx, y, hz);
  const e = V(-r, y + rise, 0), g = V(r, y + rise, 0);
  return trianglesToGeometry([
    [a, b, g], [a, g, e],       // long side
    [c, d, e], [c, e, g],       // long side
    [b, c, g], [d, a, e],       // hips
  ]);
}
