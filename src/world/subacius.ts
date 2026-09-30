import * as THREE from 'three';
import type { AreaData, XZ } from './area';
import type { Terrain } from './terrain';
import { merged } from './geom';

/*
 * The Subačius Gate (Subačiaus vartai), the city wall's east gate on the road to Vitebsk, Polotsk and Moscow.
 * Built with the wall in 1503-22, first named 1528, rebuilt in the 17th c.; demolished from 27 May 1801 and gone
 * by September 1802 (docs/gates.md). It stands here as it stood before 1801, with the wall either side: in a walk
 * set around 1900 that is a deliberate anachronism (the owner's choice). `?gate=ghost` shows it instead as a
 * ghost, an ink drawing laid over the street, with the wall's low remnants as they might have been in 1900.
 *
 * Form after P. Smuglevičius's drawing of 1785-86 and the archaeology, as summarised by VSAA (vsaa.lt/sena/subac_v.html):
 * a massive block, rectangular in plan, with a saddle roof and round corner towers, at least three
 * storeys; round cannon ports on the second floor; two rows of close-set upright loopholes near the top, the lower
 * row on a course projecting 15 cm (read as machicolations); a cornice, two rectangular niches and pilasters beside
 * the barrel-vaulted passage. The north-east corner with part of its tower's foundation survives. [V]
 * Place: the gap between the two surviving stretches of wall (OSM ways 194601579 and 1386286057) where they cross
 * Subačiaus g. at the Bokšto corner; the block stands on the street's line with its towers on the field (east)
 * side, clear of Subačiaus g. 16 (built 1775). Measurements are read off the drawing and are conjecture. [U]
 * Finish (lime render over brick, a fieldstone footing, clay tile, plank doors) is a guess from the drawing's light
 * walls and dark roofs and from the gates and wall that survive in Vilnius. [U]
 */

// The block: west (city) face, east (field) face, north and south sides, local metres
const X0 = 323, X1 = 333, Z0 = 233.5, Z1 = 245.5;
const XC = (X0 + X1) / 2, ZC = (Z0 + Z1) / 2;
const EAVE = 13;            // walls above the passage floor
const RISE = 7.2;           // the saddle roof, ridge north-south
const TOWER_R = 3.0, TOWER_TOP = 14, CONE_H = 5.8;
const ARCH_W = 3.6, ARCH_SPRING = 3.0;
const BAND_Y0 = 9.4, BAND_Y1 = 10.2;   // the corbel course with the lower row of loopholes
const WALL_H = 10, WALL_T = 1.8, REMNANT_H = 4.2;
const TOWERS: XZ[] = [[X1, Z0], [X1, Z1]];
// First stretch of each surviving wall (OSM), from the gate outwards; used if the area data has no walls
const WALL_IDS = [194601579, 1386286057];
const WALL_FALLBACK: XZ[][] = [[[323.1, 244.6], [304.2, 293.8]], [[328.1, 234], [340.6, 189]]];
const BROKEN = 6;           // m at the far end of each stretch where the wall is broken off

/** Where the gate stands, for the map: the block and its two towers. */
export const SUBACIUS_GATE = {
  name: 'Subačius Gate', x: XC, z: ZC,
  plan: [[[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]], ...TOWERS.map(([x, z]) => circle(x, z, TOWER_R, 24))] as XZ[][],
};

export type GateLook = 'ghost' | 'solid';
export interface GateMaterials {
  /** The gate's walls: lime render over brick. */ render: THREE.Material;
  /** Mouldings, courses, corbels and surrounds. */ trim: THREE.Material;
  /** The fieldstone footing. */ stone: THREE.Material;
  roof: THREE.Material; dark: THREE.Material; wood: THREE.Material; iron: THREE.Material;
  /** The city wall either side. */ wall: THREE.Material;
  /** Its remnants, for the ghost look. */ remnant: THREE.Material;
}
export interface Gate {
  /** In the scene: the gate and the wall (or, with the ghost, the wall's remnants). */
  solid: THREE.Group;
  /** The ghost, drawn over the finished picture (post.ts overlay), depth-tested against the town. Empty unless ghost. */
  ghost: THREE.Group;
  /** Wall segments for the walker (WallGrid). */
  segments: [number, number, number, number][];
  update(dt: number): void;
  /** Height of the passage floor (relative to the square), for the wet-wall shading. */
  floor: number;
}

function circle(cx: number, cz: number, r: number, n: number): XZ[] {
  const out: XZ[] = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  return out;
}

/** A surface of revolution round (cx, cz), profile [radius, height] from the bottom up, with UVs in metres: u round
 *  the circumference at radius `ur`, v along the profile from `v0` (so tiles on a cone run in rings, and a wall's v,
 *  started at its foot's height, is its height, as the masonry shader expects). */
function lathe(profile: [number, number][], segs: number, cx: number, cz: number, ur = Math.max(...profile.map(p => p[0])), v0 = 0): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  const P = profile.length, cum = [0];
  for (let j = 1; j < P; j++) cum.push(cum[j - 1] + Math.hypot(profile[j][0] - profile[j - 1][0], profile[j][1] - profile[j - 1][1]));
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i <= segs; i++) for (let j = 0; j < P; j++) uv.setXY(i * P + j, (i / segs) * 2 * Math.PI * ur, v0 + cum[j]);
  g.userData.metres = true;                            // uvMetres() leaves these UVs be
  return g.translate(cx, 0, cz);
}

/** A box w (along the face) x h x d (out of it), its back on a face at (x, y, z) with outward normal (nx, nz). */
function faceBox(w: number, h: number, d: number, x: number, y: number, z: number, nx: number, nz: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).rotateY(Math.atan2(nx, nz)).translate(x + nx * d / 2, y, z + nz * d / 2);
}

export function buildSubaciusGate(o: {
  data: AreaData; terrain: Terrain; look: GateLook; mats: GateMaterials;
  /** The scene's mist, for the ghost (it is drawn after the fog): exp² density, or a linear near/far. */
  fog: { density: number } | { near: number; far: number };
}): Gate {
  const { terrain } = o;
  const g0 = terrain.heightAt(XC, ZC);                 // the passage floor
  let low = g0;
  for (const [x, z] of [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1], ...TOWERS]) low = Math.min(low, terrain.heightAt(x, z) - TOWER_R * 0.1);
  const base = low - 0.6;                              // walls reach below the lowest ground
  const yE = g0 + EAVE, yT = g0 + TOWER_TOP;
  const hw = (Z1 - Z0) / 2, aw = ARCH_W / 2;
  const towerR = (y: number) => TOWER_R + 0.15 * (yT - y) / (yT - base);   // the battered towers' radius at height y

  // Parts by material. `shell` (render, band, roof, the wall's body) is also what the ghost is drawn from; `ink`
  // holds the ghost's outlines of the openings.
  const P = { render: [] as THREE.BufferGeometry[], band: [] as THREE.BufferGeometry[], trim: [] as THREE.BufferGeometry[], stone: [] as THREE.BufferGeometry[],
    roof: [] as THREE.BufferGeometry[], dark: [] as THREE.BufferGeometry[], wood: [] as THREE.BufferGeometry[], iron: [] as THREE.BufferGeometry[],
    wall: [] as THREE.BufferGeometry[], wallRoof: [] as THREE.BufferGeometry[], remnant: [] as THREE.BufferGeometry[] };
  const ink: number[] = [];                            // line segments, x y z x y z
  const line = (a: THREE.Vector3, b: THREE.Vector3) => ink.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const loop = (pts: THREE.Vector3[]) => pts.forEach((p, i) => line(p, pts[(i + 1) % pts.length]));
  // the section in the (z, y) plane, extruded west to east from x0 by depth: shape x = ZC - z
  const alongX = (g: THREE.BufferGeometry, x0: number) => g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, x0, 0, 1, 0, 0, -1, 0, 0, ZC, 0, 0, 0, 1));

  // ---- the block with its passage: the cross-section with the arch cut from its foot, extruded west to east ----
  const sec = new THREE.Shape();
  sec.moveTo(-hw, base);
  sec.lineTo(-aw, base);
  sec.lineTo(-aw, g0 + ARCH_SPRING);
  sec.absarc(0, g0 + ARCH_SPRING, aw, Math.PI, 0, true);
  sec.lineTo(aw, base);
  sec.lineTo(hw, base);
  sec.lineTo(hw, yE);
  sec.lineTo(-hw, yE);
  sec.closePath();
  P.render.push(alongX(new THREE.ExtrudeGeometry(sec, { depth: X1 - X0, bevelEnabled: false, curveSegments: 14 }), X0));

  // ---- the saddle roof: two slopes 0.25 m thick with 0.45 m eaves, over gable walls at the north and south ends ----
  const k = RISE / ((X1 - X0) / 2), ov = 0.45, rt = 0.25, gov = 0.35;
  const roofSec = new THREE.Shape([
    new THREE.Vector2(X0 - ov, yE - ov * k), new THREE.Vector2(XC, yE + RISE), new THREE.Vector2(X1 + ov, yE - ov * k),
    new THREE.Vector2(X1 + ov, yE - ov * k - rt), new THREE.Vector2(XC, yE + RISE - rt * Math.hypot(1, k)), new THREE.Vector2(X0 - ov, yE - ov * k - rt),
  ]);
  P.roof.push(new THREE.ExtrudeGeometry(roofSec, { depth: Z1 - Z0 + 2 * gov, bevelEnabled: false }).translate(0, 0, Z0 - gov));
  const gable = new THREE.Shape([new THREE.Vector2(X0, yE - 0.01), new THREE.Vector2(X1, yE - 0.01), new THREE.Vector2(XC, yE + RISE - rt * Math.hypot(1, k))]);
  for (const z of [Z0, Z1 - 0.6]) P.render.push(new THREE.ExtrudeGeometry(gable, { depth: 0.6, bevelEnabled: false }).translate(0, 0, z));
  P.roof.push(new THREE.BoxGeometry(0.34, 0.2, Z1 - Z0 + 2 * gov).translate(XC, yE + RISE + 0.02, ZC));   // ridge tiles
  // the small turret the drawing shows at the south gable: a chimney-like shaft with a cap
  P.render.push(new THREE.BoxGeometry(0.8, 2.0, 0.8).translate(XC, yE + RISE + 0.3, Z1 - 0.9));
  P.trim.push(new THREE.BoxGeometry(1.05, 0.18, 1.05).translate(XC, yE + RISE + 1.35, Z1 - 0.9));

  // ---- round towers on the field corners, a little battered, with tiled cones, soffits and finials ----
  for (const [tx, tz] of TOWERS) {
    P.render.push(lathe([[TOWER_R + 0.15, base], [TOWER_R, yT]], 36, tx, tz, TOWER_R, base));
    P.roof.push(lathe([[TOWER_R + 0.45, yT - 0.05], [0.04, yT + CONE_H]], 36, tx, tz));
    P.wood.push(lathe([[TOWER_R - 0.05, yT - 0.05], [TOWER_R + 0.45, yT - 0.05]], 36, tx, tz));   // under the eaves
    P.iron.push(new THREE.SphereGeometry(0.2, 10, 8).translate(tx, yT + CONE_H + 0.1, tz));
    P.iron.push(new THREE.CylinderGeometry(0.03, 0.05, 1.4, 6).translate(tx, yT + CONE_H + 0.8, tz));
    P.iron.push(new THREE.BoxGeometry(0.55, 0.32, 0.02).translate(tx + 0.3, yT + CONE_H + 1.2, tz));   // a vane
    // the course with the lower loopholes, 0.2 m proud, on corbels
    P.band.push(lathe([[TOWER_R, g0 + BAND_Y0], [TOWER_R + 0.2, g0 + BAND_Y0], [TOWER_R + 0.2, g0 + BAND_Y1], [TOWER_R, g0 + BAND_Y1]], 36, tx, tz, TOWER_R + 0.2, g0 + BAND_Y0 - 0.2));
    // the footing: fieldstone, a little wider, its top weathered to a slope
    P.stone.push(lathe([[TOWER_R + 0.34, base], [TOWER_R + 0.34, g0 + 0.8], [TOWER_R + 0.14, g0 + 1.15]], 36, tx, tz, TOWER_R + 0.34, base));
  }
  // the course along the block's faces, and its footing
  const run = (a: XZ, b: XZ, n: [number, number], y0: number, h: number, d: number, list: THREE.BufferGeometry[]) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L > 0.05) list.push(faceBox(L, h, d, (a[0] + b[0]) / 2, y0 + h / 2, (a[1] + b[1]) / 2, n[0], n[1]));
  };
  const FACES: [XZ, XZ, [number, number]][] = [
    [[X1, Z0 + TOWER_R], [X1, Z1 - TOWER_R], [1, 0]],   // field front, between the towers
    [[X0, Z0], [X0, Z1], [-1, 0]],                        // city front
    [[X0, Z0], [X1 - TOWER_R, Z0], [0, -1]],              // north side
    [[X0, Z1], [X1 - TOWER_R, Z1], [0, 1]],               // south side
  ];
  for (const [a, b, n] of FACES) {
    run(a, b, n, g0 + BAND_Y0, BAND_Y1 - BAND_Y0, 0.2, P.band);
    // the footing, broken by the passage on the two fronts
    const cut = n[0] !== 0;
    if (cut) { run(a, [a[0], ZC - aw - 0.35], n, base, g0 + 1.0 - base, 0.3, P.stone); run([a[0], ZC + aw + 0.35], b, n, base, g0 + 1.0 - base, 0.3, P.stone); }
    else run(a, b, n, base, g0 + 1.0 - base, 0.3, P.stone);
  }

  // ---- openings: loopholes, windows, niches and cannon ports ----
  // A rectangle on a face: centre (x, y, z), outward normal (nx, nz), w x h. A hole is dark inside a stone surround,
  // a niche a shallow recess framed the same way; the ghost draws the outline.
  const opening = (x: number, y: number, z: number, nx: number, nz: number, w: number, h: number, kind: 'hole' | 'niche' = 'hole', fw = 0.07) => {
    const tx = -nz, tz = nx, e = 0.03;
    const c = new THREE.Vector3(x + nx * e, y, z + nz * e);
    const Pt = (u: number, v: number) => c.clone().add(new THREE.Vector3(tx * u, v, tz * u));
    loop([Pt(-w / 2, -h / 2), Pt(w / 2, -h / 2), Pt(w / 2, h / 2), Pt(-w / 2, h / 2)]);
    if (kind === 'hole') P.dark.push(new THREE.PlaneGeometry(w, h).rotateY(Math.atan2(nx, nz)).translate(c.x, c.y, c.z));
    const d = kind === 'hole' ? 0.05 : 0.09;
    for (const s of [-1, 1]) {
      P.trim.push(faceBox(w + 2 * fw, fw, d, x, y + s * (h / 2 + fw / 2), z, nx, nz));
      P.trim.push(faceBox(fw, h, d, x + tx * s * (w / 2 + fw / 2), y, z + tz * s * (w / 2 + fw / 2), nx, nz));
    }
  };
  // a round cannon port in a stone ring
  const port = (x: number, y: number, z: number, nx: number, nz: number, r: number) => {
    const tx = -nz, tz = nx, c = new THREE.Vector3(x + nx * 0.03, y, z + nz * 0.03), n = 14;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push(c.clone().add(new THREE.Vector3(tx * Math.cos(a) * r, Math.sin(a) * r, tz * Math.cos(a) * r))); }
    loop(pts);
    P.dark.push(new THREE.CircleGeometry(r, n).rotateY(Math.atan2(nx, nz)).translate(c.x, c.y, c.z));
    P.trim.push(new THREE.TorusGeometry(r + 0.07, 0.07, 6, 18).rotateY(Math.atan2(nx, nz)).translate(x + nx * 0.02, y, z + nz * 0.02));
  };
  // loopholes round a tower (the side facing the field), and corbels under the course there
  const towerRow = (tx: number, tz: number, r: number, y: number, w: number, h: number, step: number, corbels = false) => {
    const n = Math.round((2 * Math.PI * r) / step);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, nx = Math.cos(a), nz = Math.sin(a);
      if (tx + nx * r < X1 - 0.2 && Math.abs(tz + nz * r - ZC) < hw - 0.2) continue;   // inside the block
      opening(tx + nx * r, y, tz + nz * r, nx, nz, w, h, 'hole', 0.05);
      if (corbels) {
        const b = a + Math.PI / n;                     // between two slits
        P.trim.push(faceBox(0.24, 0.34, 0.2, tx + Math.cos(b) * TOWER_R, g0 + BAND_Y0 - 0.17, tz + Math.sin(b) * TOWER_R, Math.cos(b), Math.sin(b)));
      }
    }
  };
  // ... and along a straight face from a to b
  const faceRow = (a: XZ, b: XZ, n: [number, number], y: number, w: number, h: number, step: number, skip?: (x: number, z: number) => boolean, corbels = false, out = 0.2) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.floor(L / step);
    for (let i = 0; i < m; i++) {
      const t = (i + 0.5) / m, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      if (!skip?.(x, z)) opening(x + n[0] * out, y, z + n[1] * out, n[0], n[1], w, h, 'hole', 0.05);
      if (corbels && i < m - 1) {
        const t2 = (i + 1) / m;
        P.trim.push(faceBox(0.24, 0.34, 0.2, a[0] + (b[0] - a[0]) * t2, g0 + BAND_Y0 - 0.17, a[1] + (b[1] - a[1]) * t2, n[0], n[1]));
      }
    }
  };
  const bandY = g0 + (BAND_Y0 + BAND_Y1) / 2, upperY = g0 + 11.6;
  for (const [tx, tz] of TOWERS) {
    towerRow(tx, tz, TOWER_R + 0.2, bandY, 0.16, 0.5, 0.8, true);  // the slits in the corbel course
    towerRow(tx, tz, towerR(upperY), upperY, 0.2, 0.75, 1.15);     // the upper row
    const out = tz < ZC ? -1 : 1;                                  // round ports: east, outward and between
    const pr = towerR(g0 + 4.8);
    for (const a of [0, out * Math.PI / 4, out * Math.PI / 2]) port(tx + Math.cos(a) * pr, g0 + 4.8, tz + Math.sin(a) * pr, Math.cos(a), Math.sin(a), 0.34);
  }
  for (const [a, b, n] of FACES) {
    faceRow(a, b, n, bandY, 0.16, 0.5, 0.8, undefined, true);
    faceRow(a, b, n, upperY, 0.2, 0.75, 1.1, undefined, false, 0);
    if (n[0] !== 1) faceRow(a, b, n, g0 + 7.4, 0.8, 1.2, 3.2, (_x, z) => n[0] !== 0 && Math.abs(z - ZC) < aw + 0.8, false, 0);   // small windows
  }
  // the field front over the arch: a window between two rectangular niches
  opening(X1, g0 + 7.4, ZC, 1, 0, 1.0, 1.4, 'hole', 0.1);
  for (const dz of [-1, 1]) opening(X1, g0 + 7.5, ZC + dz * 1.75, 1, 0, 0.7, 1.2, 'niche', 0.08);

  // ---- the passage: stone surrounds on both fronts, a cornice over them, pilasters beside the field arch, doors ----
  for (const [x0, s] of [[X1, 1], [X0 - 0.12, -1]] as const) {
    const ring = new THREE.Shape();
    ring.absarc(0, g0 + ARCH_SPRING, aw + 0.38, Math.PI, 0, true);
    ring.lineTo(aw, g0 + ARCH_SPRING);
    ring.absarc(0, g0 + ARCH_SPRING, aw, 0, Math.PI, false);
    ring.closePath();
    P.trim.push(alongX(new THREE.ExtrudeGeometry(ring, { depth: 0.12, bevelEnabled: false, curveSegments: 16 }), x0));
    for (const dz of [-1, 1]) P.trim.push(faceBox(0.38, ARCH_SPRING + (g0 - base), 0.12, s > 0 ? X1 : X0, base + (ARCH_SPRING + g0 - base) / 2, ZC + dz * (aw + 0.19), s, 0));
    P.trim.push(faceBox(0.5, 0.7, 0.18, s > 0 ? X1 : X0, g0 + ARCH_SPRING + aw + 0.2, ZC, s, 0));   // keystone
    const span = s > 0 ? Z1 - Z0 - 2 * TOWER_R : Z1 - Z0;
    P.trim.push(faceBox(span, 0.32, 0.24, s > 0 ? X1 : X0, g0 + 5.75, ZC, s, 0));                  // cornice
  }
  for (const dz of [-1, 1]) P.trim.push(faceBox(0.5, 5.4, 0.12, X1, g0 + 2.7, ZC + dz * (aw + 0.75), 1, 0));   // pilasters
  // the gate leaves, standing open against the passage walls near the field front: planks, three iron straps each
  for (const dz of [-1, 1]) {
    const z = ZC + dz * (aw - 0.06), x = X1 - 0.45 - 0.85;
    P.wood.push(new THREE.BoxGeometry(1.7, ARCH_SPRING - 0.1, 0.1).translate(x, g0 + (ARCH_SPRING - 0.1) / 2, z));
    for (const h of [0.45, 1.45, 2.45]) P.iron.push(new THREE.BoxGeometry(1.6, 0.09, 0.02).translate(x, g0 + h, z - dz * 0.06));
  }

  // ---- the wall either side: full height (or, for the ghost look, the remnants) ----
  // each stretch from the gate outwards (OSM draws one of them the other way)
  const lines = WALL_IDS.map((id, i) => {
    const w = o.data.cityWalls?.find(c => c.id === id);
    const [p, q] = w ? [w.line[0], w.line[1]] : WALL_FALLBACK[i];
    return Math.hypot(p[0] - XC, p[1] - ZC) <= Math.hypot(q[0] - XC, q[1] - ZC) ? [p, q] : [q, p];
  });
  const segments: [number, number, number, number][] = [];
  lines.forEach((ln, li) => {
    // Each stretch leaves the gate by its north or south side and starts 2.5 m inside the block, so its end and
    // parapet are bonded into the gate's masonry; the gallery roof and its posts start at the gate's side.
    // OSM ends the south stretch on the line of the gate's west face, running almost along it, which would leave
    // its gallery against that face; for the solid look it is pivoted about its far end (by under a metre at the
    // gate) to leave through the side, its town face flush with the gate's.
    const [a1, b] = ln;
    const zf = Math.abs(a1[1] - Z1) < Math.abs(a1[1] - Z0) ? Z1 : Z0;          // the side it leaves by
    let a0 = a1;
    if (o.look === 'solid') {
      const xf = a1[0] + ((zf - a1[1]) / (b[1] - a1[1])) * (b[0] - a1[0]);   // where it crosses that side's plane
      const min = X0 + (WALL_T / 2) * Math.hypot(b[0] - a1[0], b[1] - a1[1]) / Math.abs(b[1] - a1[1]) + 0.05;
      if (xf < min) a0 = [min, zf];
    }
    const L0 = Math.hypot(b[0] - a0[0], b[1] - a0[1]);
    const tx = (b[0] - a0[0]) / L0, tz = (b[1] - a0[1]) / L0;
    const a: XZ = [a0[0] - tx * 2.5, a0[1] - tz * 2.5], L = L0 + 2.5;
    let nx = tz, nz = -tx;
    if (nx < 0) { nx = -nx; nz = -nz; }                  // outward: east, away from the city
    const n = Math.ceil(L), whole = n - BROKEN;          // samples every metre; the last BROKEN are broken off
    const at = (i: number) => [a[0] + tx * (L * i) / n, a[1] + tz * (L * i) / n] as XZ;
    // how far along the line the parallel at offset s crosses the plane of the side it leaves by, and that point
    const dSide = (s: number) => (zf - a[1] - nz * s) / tz;
    const onSide = (s: number): XZ => [a[0] + tx * dSide(s) + nx * s, zf];
    // a slab along the line over samples i0..i1, from its foot to top(i), between offsets s0 and s1 across it;
    // with `cut`, its first row lies on the gate's side instead of square across the line
    const slab = (s0: number, s1: number, top: (i: number, x: number, z: number) => number, foot: (i: number, x: number, z: number) => number, i0 = 0, i1 = n, cut?: (s: number) => XZ) => {
      const pos: number[] = [], idx: number[] = [], m = i1 - i0;
      for (let i = i0; i <= i1; i++) {
        const [x, z] = at(i);
        for (const s of [s0, s1]) {
          const [px, pz] = cut && i === i0 ? cut(s) : [x + nx * s, z + nz * s];
          pos.push(px, foot(i, px, pz), pz, px, top(i, px, pz), pz);
        }
      }
      // per step: 4 verts (s0 foot, s0 top, s1 foot, s1 top)
      for (let i = 0; i < m; i++) {
        const q = i * 4, r = q + 4;
        idx.push(q, r, q + 1, r, r + 1, q + 1);             // the s0 face
        idx.push(q + 2, q + 3, r + 2, r + 2, q + 3, r + 3); // the s1 face
        idx.push(q + 1, r + 1, q + 3, r + 1, r + 3, q + 3); // the top
      }
      for (const q of [0, m * 4]) idx.push(q, q + 1, q + 2, q + 2, q + 1, q + 3);   // the ends
      const ix = new THREE.BufferGeometry();
      ix.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      ix.setIndex(idx);
      const geo = ix.toNonIndexed();
      geo.computeVertexNormals();
      return geo;
    };
    const ground = (x: number, z: number) => terrain.heightAt(x, z);
    const level = (i: number) => terrain.heightAt(at(i)[0], at(i)[1]);   // tops are level across the wall
    const across = (i: number, x: number, z: number) => (x - at(i)[0]) * nx + (z - at(i)[1]) * nz;
    // a broken top: courses lost here and there, a gap dropping a metre or more now and then
    const hash = (kk: number) => { const h = Math.sin(kk * 12.9898 + li * 78.233) * 43758.5453; return h - Math.floor(h); };
    const rough = (i: number) => {
      const t = i * 0.45, kk = Math.floor(t), f = t - kk, u = f * f * (3 - 2 * f);   // smooth noise along the top
      return -1.1 + 1.6 * (hash(kk) * (1 - u) + hash(kk + 1) * u) + 0.15 * Math.sin(i * 2.3 + li);
    };
    const foot = (_i: number, x: number, z: number) => ground(x, z) - 0.5;
    const i0 = Math.round((2.5 * n) / L);                // where the stretch leaves the gate: the remnants start there
    P.remnant.push(slab(-WALL_T / 2, WALL_T / 2, i => level(i) + REMNANT_H + rough(i), foot, i0));
    // The wall: its body up to the wall walk, broken off over its last metres; the parapet on the field side with
    // its loopholes; the gallery's lean-to roof on posts, from over the parapet down towards the city.
    const walk = WALL_H - 2.2;
    const brokenTop = (i: number) => i <= whole ? walk : walk - (i - whole) / BROKEN * (walk - 4.5) + 1.2 * rough(i);
    P.wall.push(slab(-WALL_T / 2, WALL_T / 2, i => level(i) + brokenTop(i), foot));
    P.wall.push(slab(WALL_T / 2 - 0.6, WALL_T / 2, i => level(i) + WALL_H, i => level(i) + walk, 0, whole));
    const pitch = (i: number, x: number, z: number) => (WALL_T / 2 + 0.3 - across(i, x, z)) * 0.5;
    const [rs0, rs1] = [-WALL_T / 2 - 0.6, WALL_T / 2 + 0.3], r0 = Math.ceil((Math.max(dSide(rs0), dSide(rs1)) * n) / L);
    P.wallRoof.push(slab(rs0, rs1, (i, x, z) => level(i) + WALL_H + 1.0 - pitch(i, x, z), (i, x, z) => level(i) + WALL_H + 0.8 - pitch(i, x, z), r0 - 1, whole, onSide));
    P.stone.push(slab(WALL_T / 2, WALL_T / 2 + 0.25, (_i, x, z) => ground(x, z) + 0.9, foot));      // the footing, field side
    for (let i = r0 + 0.2; i < whole; i += 2.5) {                                                        // gallery posts
      const [x, z] = at(i), px = x - nx * (WALL_T / 2 - 0.15), pz = z - nz * (WALL_T / 2 - 0.15), y0 = level(i) + walk, y1 = level(i) + WALL_H - 0.2;
      P.wood.push(new THREE.BoxGeometry(0.18, y1 - y0, 0.18).translate(px, (y0 + y1) / 2, pz));
    }
    for (let d = dSide(WALL_T / 2) + 1; d < (L * whole) / n - 1; d += 1.8) {                          // loopholes
      const x = a[0] + tx * d, z = a[1] + tz * d;
      opening(x + nx * WALL_T / 2, ground(x, z) + WALL_H - 1.0, z + nz * WALL_T / 2, nx, nz, 0.18, 0.6, 'hole', 0.05);
    }
    // a doorway in the gate's side where the wall walk comes in, on the middle of the walk
    {
      const [ex, ez] = onSide(-0.3), y = terrain.heightAt(ex, ez) + walk + 0.95;
      opening(Math.min(X1 - TOWER_R - 0.6, Math.max(X0 + 0.6, ex)), y, zf, 0, zf === Z0 ? -1 : 1, 0.9, 1.9, 'hole', 0.1);
    }
    // the wall stops the walker (with the ghost, only the remnants do: from where the gate was)
    const s0: XZ = o.look === 'solid' ? a : a0;
    for (const s of [-WALL_T / 2, WALL_T / 2]) segments.push([s0[0] + nx * s, s0[1] + nz * s, b[0] + nx * s, b[1] + nz * s]);
    segments.push([s0[0] - nx * WALL_T / 2, s0[1] - nz * WALL_T / 2, s0[0] + nx * WALL_T / 2, s0[1] + nz * WALL_T / 2]);
    segments.push([b[0] - nx * WALL_T / 2, b[1] - nz * WALL_T / 2, b[0] + nx * WALL_T / 2, b[1] + nz * WALL_T / 2]);
  });

  const solid = new THREE.Group(), ghost = new THREE.Group();
  const uniforms = {
    uTime: { value: 0 },
    uFog: { value: 'density' in o.fog ? new THREE.Vector3(1, o.fog.density, 0) : new THREE.Vector3(0, o.fog.near, o.fog.far) },
    uGate: { value: new THREE.Vector2(XC, ZC) },
  };
  const mesh = (parts: THREE.BufferGeometry[], mat: THREE.Material, shadow = true) => {
    const m = new THREE.Mesh(merged(parts.map(uvMetres)), mat);
    m.castShadow = shadow; m.receiveShadow = true;
    solid.add(m);
  };
  if (o.look === 'solid') {
    solid.name = 'subacius';
    const M = o.mats;
    mesh(P.render, M.render); mesh([...P.band, ...P.trim], M.trim); mesh(P.stone, M.stone);
    mesh([...P.roof, ...P.wallRoof], M.roof); mesh(P.dark, M.dark, false); mesh(P.wood, M.wood); mesh(P.iron, M.iron);
    mesh(P.wall, M.wall);
    // the gate stops the walker: its sides, the passage walls, the towers
    const box = (x0: number, z0: number, x1: number, z1: number) => segments.push([x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]);
    box(X0, Z0, X1, ZC - aw);
    box(X0, ZC + aw, X1, Z1);
    for (const [tx, tz] of TOWERS) { const r = circle(tx, tz, TOWER_R + 0.35, 12); r.forEach((p, i) => segments.push([p[0], p[1], r[(i + 1) % 12][0], r[(i + 1) % 12][1]])); }
  } else {
    solid.name = 'subacius-remnants'; ghost.name = 'subacius-ghost';
    // c.1900: what was left of the wall, low and ragged
    mesh(P.remnant, o.mats.remnant);
    // the ghost: a pale wash on the faces, strongest where they turn away (as the paper shows through an ink wash),
    // and the drawing's lines; both fade into the street at the foot, into the mist, and when walked into.
    // A depth pass first, so only the nearest face is washed and lines behind the gate's own faces are hidden.
    const faces = merged([...P.render, ...P.band, ...P.roof, ...P.wall, ...P.wallRoof].map(g => (g.index ? g.toNonIndexed() : g)).map(g => { g.deleteAttribute('uv'); return g; }));
    const edges = new THREE.EdgesGeometry(faces, 24);
    const inkPos = edges.getAttribute('position').array as Float32Array;
    const all = new Float32Array(inkPos.length + ink.length);
    all.set(inkPos); all.set(ink, inkPos.length);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(all, 3));
    for (const geo of [faces, lineGeo]) setGround(geo, terrain);
    const depth = new THREE.Mesh(faces, ghostMaterial(uniforms, 'depth'));
    const wash = new THREE.Mesh(faces, ghostMaterial(uniforms, 'wash'));
    const lines = new THREE.LineSegments(lineGeo, ghostMaterial(uniforms, 'lines'));
    depth.renderOrder = 1; wash.renderOrder = 2; lines.renderOrder = 3;
    ghost.add(depth, wash, lines);
  }
  return {
    solid, ghost, segments, floor: g0,
    update(dt: number) { uniforms.uTime.value += dt; },
  };
}

/** UVs in metres for the plaster and tile textures: projected on the face's own plane. */
function uvMetres(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  if (g.userData.metres) return geo;                   // already in metres (lathe)
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const p = geo.getAttribute('position') as THREE.BufferAttribute, n = geo.getAttribute('normal') as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ny > nx && ny > nz) { uv[i * 2] = x; uv[i * 2 + 1] = z; }
    else if (nx > nz) { uv[i * 2] = z; uv[i * 2 + 1] = y; }
    else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** The ground under each vertex, for the ghost's fade at its foot. */
function setGround(geo: THREE.BufferGeometry, terrain: Terrain): void {
  const p = geo.getAttribute('position') as THREE.BufferAttribute, gr = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) gr[i] = terrain.heightAt(p.getX(i), p.getZ(i));
  geo.setAttribute('aGround', new THREE.BufferAttribute(gr, 1));
}

// The ghost is drawn after tone mapping (post.ts overlay), so its colours are the picture's own: old paper and ink.
const WASH = new THREE.Color('#d8cdb6'), INK = new THREE.Color('#f1e8d4');

function ghostMaterial(u: { uTime: { value: number }; uFog: { value: THREE.Vector3 }; uGate: { value: THREE.Vector2 } }, pass: 'depth' | 'wash' | 'lines'): THREE.ShaderMaterial {
  const lines = pass === 'lines';
  return new THREE.ShaderMaterial({
    uniforms: { ...u, uColor: { value: lines ? INK : WASH }, uAlpha: { value: lines ? 0.62 : 0.13 } },
    vertexShader: /* glsl */ `
      attribute float aGround;
      varying vec3 vWorld; varying vec3 vNormal; varying float vHeight;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz; vHeight = position.y - aGround;
        ${lines ? 'vNormal = vec3(0.0, 1.0, 0.0);' : 'vNormal = normalize(mat3(modelMatrix) * normal);'}
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAlpha; uniform float uTime; uniform vec3 uFog; uniform vec2 uGate;
      varying vec3 vWorld; varying vec3 vNormal; varying float vHeight;
      void main() {
        float d = distance(cameraPosition, vWorld);
        float mist = uFog.x > 0.5 ? exp(-pow(uFog.y * d, 2.0)) : 1.0 - smoothstep(uFog.y, uFog.z, d);
        float a = uAlpha * mist;
        a *= smoothstep(0.0, 2.6, vHeight);                          // rising out of the street
        a *= smoothstep(1.2, 5.0, d);                                // and thinning when walked into
        a *= smoothstep(56.0, 30.0, distance(vWorld.xz, uGate));     // the wall fades away along its length
        a *= 0.9 + 0.1 * sin(uTime * 0.6 + vWorld.y * 0.15);         // breathing, slowly
        vec3 c = uColor;
        ${lines ? '' : `
        vec3 n = normalize(vNormal), v = normalize(cameraPosition - vWorld);
        float rim = pow(1.0 - abs(dot(n, v)), 2.0);
        float lit = 0.62 + 0.38 * max(dot(n, normalize(vec3(-0.4, 0.8, 0.45))), 0.0);
        // hatching on the faces turned from the light, as a draughtsman shades
        float hatch = step(0.62, fract((vWorld.x - vWorld.z) * 2.2 + vWorld.y * 1.4)) * (1.0 - smoothstep(0.62, 0.8, lit));
        a *= 0.55 + 1.3 * rim + 0.8 * hatch;
        c *= lit;`}
        ${pass === 'depth' ? 'if (a < 0.01) discard;' : ''}
        gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
      }`,
    transparent: true, depthTest: true, side: THREE.DoubleSide, toneMapped: false,
    // the depth pass sits a hair behind, so the wash and the lines on the nearest faces pass the test
    depthWrite: pass === 'depth', colorWrite: pass !== 'depth',
    polygonOffset: pass === 'depth', polygonOffsetFactor: 1, polygonOffsetUnits: 2,
  });
}
