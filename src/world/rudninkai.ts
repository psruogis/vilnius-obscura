import * as THREE from 'three';
import type { AreaData, XZ } from './area';
import type { Terrain } from './terrain';
import { merged } from './geom';
import { faceBox, uvMetres, setGround, ghostMaterial, type Gate, type GateLook, type GateMaterials } from './subacius';

/*
 * The Rūdninkai Gate (Rūdninkų vartai), the city wall's west gate on the road to Grodno and Poland, where Rūdninkų g.
 * meets Pylimo g. (docs/gates.md §9). Built with the wall in 1503-22, first named in 1557; in 1675-79 a long barbican
 * of two storeys was built onto its west front, on the rampart of 1648; pulled down in 1800, its bricks sold off. Its
 * lower part survives under the street. (VSAA; KVR 39) [V]
 * Form after P. Smuglevičius's drawing of 1785 (reproduced by VSAA) and the descriptions: a tall gate tower like the
 * Gate of Dawn's, three and a half storeys (KVR 39) with round cannon ports on its fourth floor (VSAA), under a low
 * hipped roof; in front of it the barbican, two storeys, hipped, the gateway in its far end and round ports on its
 * second floor; cornices in rhythm on both; a niche for the guard in the passage's south wall (archaeology, VSAA). [V]
 * Measurements are read off the drawing and are conjecture. [U] Like the Subačius Gate it stands as it was before it
 * came down, in a walk set around 1900 (the owner's choice); `?gate=ghost` draws it as a ghost. [U]
 */

// The road through the gate runs from Rūdninkų g. (north-east) on into Šv. Stepono g. (south-west); the wall followed
// Pylimo g. across it, nearly square. Local frame: x along the road, outwards; z along the wall (north-west); y up.
const SITE: XZ = [-239.3, 346.7];                       // Rūdninkų g. meets Pylimo g. (OSM)
const U: XZ = (() => { const l = Math.hypot(-58.8, 65.4); return [-58.8 / l, 65.4 / l] as XZ; })();   // Rūdninkų g.'s last stretch
const W: XZ = [-U[1], U[0]];
// the tower stands at the end of Rūdninkų g., 1.5 m south-east of the street's line to clear the house at Pylimo g. 46
const O: XZ = [SITE[0] + U[0] * 1.0 - W[0] * 1.5, SITE[1] + U[1] * 1.0 - W[1] * 1.5];
const world = (x: number, z: number): XZ => [O[0] + U[0] * x + W[0] * z, O[1] + U[1] * x + W[1] * z];

const T_X0 = -9.5, T_X1 = 0, T_HW = 6;                  // the tower: town face, field face, half its width
const B_X0 = -0.3, B_X1 = 15, B_HW = 5;                 // the barbican, from inside the tower's field face
const T_EAVE = 18.5, T_RISE = 2.4, B_EAVE = 7.2, B_RISE = 1.9;
const AW = 1.8, T_SPRING = 3.2, B_SPRING = 3.0;         // the passage: half its width, the arches' springing
const WALL_X = -2.6, WALL_T = 1.8, WALK = 6.2, WALL_MAX = 24;      // the wall about 8 m to its parapet (KVR 39: about 6.5 m)

/** Where the gate stood, for the map: the tower and the barbican. */
export const RUDNINKAI_GATE = {
  name: 'Rūdninkai Gate', out: U,                       // out: along the road, away from the town
  ...(() => { const [x, z] = world((T_X0 + B_X1) / 2, 0); return { x, z }; })(),
  plan: [[[T_X0, -T_HW], [T_X1, -T_HW], [T_X1, T_HW], [T_X0, T_HW]], [[B_X0, -B_HW], [B_X1, -B_HW], [B_X1, B_HW], [B_X0, B_HW]]]
    .map(r => r.map(([x, z]) => world(x, z))) as XZ[][],
};

/** A hipped roof over [x0, x1] x [z0, z1], its eaves at yE, rising `rise`; the ridge runs the long way. With
 *  `openX0` the end at x0 has no hip (it runs into a taller wall). UVs in metres: u along the eave, v up the slope. */
function hipRoof(x0: number, x1: number, z0: number, z1: number, yE: number, rise: number, openX0 = false): THREE.BufferGeometry {
  const alongX = x1 - x0 >= z1 - z0;
  // work in (a, b): a the ridge's direction, b across it
  const [a0, a1, b0, b1] = alongX ? [x0, x1, z0, z1] : [z0, z1, x0, x1];
  const h = (b1 - b0) / 2, bc = (b0 + b1) / 2, k = rise / h, sl = Math.hypot(1, k);
  const r0 = openX0 && alongX ? a0 : a0 + h, r1 = a1 - h;
  const P = (a: number, b: number, y: number) => (alongX ? new THREE.Vector3(a, y, b) : new THREE.Vector3(b, y, a));
  const pos: number[] = [], uv: number[] = [];
  const tri = (p: THREE.Vector3[], t: [number, number][]) => {
    const n = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0]));
    const order = n.y >= 0 ? [0, 1, 2] : [0, 2, 1];
    for (const i of order) { pos.push(p[i].x, p[i].y, p[i].z); uv.push(t[i][0], t[i][1]); }
  };
  const yR = yE + rise;
  for (const be of [b0, b1]) {                                    // the two long slopes
    const e0 = P(a0, be, yE), e1 = P(a1, be, yE), q0 = P(r0, bc, yR), q1 = P(r1, bc, yR);
    const v = h * sl;
    tri([e0, e1, q1], [[a0, 0], [a1, 0], [r1, v]]);
    tri([e0, q1, q0], [[a0, 0], [r1, v], [r0, v]]);
  }
  const hip = (ae: number, r: number) => {                        // a hip end
    const e0 = P(ae, b0, yE), e1 = P(ae, b1, yE), q = P(r, bc, yR);
    tri([e0, e1, q], [[b0, 0], [b1, 0], [bc, h * sl]]);
  };
  hip(a1, r1);
  if (!(openX0 && alongX)) hip(a0, r0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.userData.metres = true;
  return g;
}

export function buildRudninkaiGate(o: {
  data: AreaData; terrain: Terrain; look: GateLook; mats: GateMaterials;
  /** The scene's mist, for the ghost (it is drawn after the fog): exp² density, or a linear near/far. */
  fog: { density: number } | { near: number; far: number };
}): Gate {
  const { terrain } = o;
  const gr = (x: number, z: number) => terrain.heightAt(...world(x, z));
  const g0 = gr((T_X0 + T_X1) / 2, 0), gB = gr((B_X0 + B_X1) / 2, 0);   // the passage floor in the tower, in the barbican
  let low = Math.min(g0, gB);
  for (const [x, z] of [[T_X0, -T_HW], [T_X0, T_HW], [B_X1, -B_HW], [B_X1, B_HW], [T_X1, -T_HW], [T_X1, T_HW]]) low = Math.min(low, gr(x, z));
  const base = low - 0.6;

  const P = { render: [] as THREE.BufferGeometry[], band: [] as THREE.BufferGeometry[], trim: [] as THREE.BufferGeometry[], stone: [] as THREE.BufferGeometry[],
    roof: [] as THREE.BufferGeometry[], dark: [] as THREE.BufferGeometry[], wood: [] as THREE.BufferGeometry[], iron: [] as THREE.BufferGeometry[],
    wall: [] as THREE.BufferGeometry[], wallRoof: [] as THREE.BufferGeometry[] };
  const ink: number[] = [];
  const loop = (pts: THREE.Vector3[]) => pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; ink.push(p.x, p.y, p.z, q.x, q.y, q.z); });
  // a section in the (z, y) plane, extruded along x from x0
  const alongX = (g: THREE.BufferGeometry, x0: number) => g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, x0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1));
  const body = (hw: number, y0: number, yTop: number, spring: number, x0: number, depth: number) => {
    const sec = new THREE.Shape();
    sec.moveTo(-hw, y0); sec.lineTo(-AW, y0); sec.lineTo(-AW, spring);
    sec.absarc(0, spring, AW, Math.PI, 0, true);
    sec.lineTo(AW, y0); sec.lineTo(hw, y0); sec.lineTo(hw, yTop); sec.lineTo(-hw, yTop); sec.closePath();
    return alongX(new THREE.ExtrudeGeometry(sec, { depth, bevelEnabled: false, curveSegments: 14 }), x0);
  };

  // ---- the tower and the barbican, the passage through both ----
  const yT = g0 + T_EAVE, yB = gB + B_EAVE;
  P.render.push(body(T_HW, base, yT, g0 + T_SPRING, T_X0, T_X1 - T_X0));
  P.render.push(body(B_HW, base, yB, gB + B_SPRING, B_X0, B_X1 - B_X0));

  // ---- low hipped roofs; the barbican's runs into the tower; boards under the eaves; a chimney on the tower ----
  const ov = 0.5;
  P.roof.push(hipRoof(T_X0 - ov, T_X1 + ov, -T_HW - ov, T_HW + ov, yT - 0.05, T_RISE));
  P.roof.push(hipRoof(T_X1, B_X1 + ov, -B_HW - ov, B_HW + ov, yB - 0.05, B_RISE, true));
  const eaves = (x0: number, x1: number, hw: number, y: number, ends: boolean[]) => {
    for (const s of [-1, 1]) P.wood.push(faceBox(x1 - x0, 0.22, ov, (x0 + x1) / 2, y - 0.16, s * hw, 0, s));
    if (ends[0]) P.wood.push(faceBox(2 * hw + 2 * ov, 0.22, ov, x0, y - 0.16, 0, -1, 0));
    if (ends[1]) P.wood.push(faceBox(2 * hw + 2 * ov, 0.22, ov, x1, y - 0.16, 0, 1, 0));
  };
  eaves(T_X0, T_X1, T_HW, yT, [true, true]);
  eaves(T_X1, B_X1, B_HW, yB, [false, true]);
  P.render.push(new THREE.BoxGeometry(0.9, 2.2, 0.9).translate(T_X0 + 2.2, yT + T_RISE * 0.55 + 0.6, T_HW - 2.4));   // a chimney
  P.trim.push(new THREE.BoxGeometry(1.15, 0.2, 1.15).translate(T_X0 + 2.2, yT + T_RISE * 0.55 + 1.75, T_HW - 2.4));

  // ---- cornices in rhythm, and the footing ----
  const run = (a: XZ, b: XZ, n: [number, number], y0: number, h: number, d: number, list: THREE.BufferGeometry[]) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L > 0.05) list.push(faceBox(L, h, d, (a[0] + b[0]) / 2, y0 + h / 2, (a[1] + b[1]) / 2, n[0], n[1]));
  };
  const T_FACES: [XZ, XZ, [number, number]][] = [
    [[T_X0, -T_HW], [T_X0, T_HW], [-1, 0]], [[T_X1, -T_HW], [T_X1, T_HW], [1, 0]],
    [[T_X0, -T_HW], [T_X1, -T_HW], [0, -1]], [[T_X0, T_HW], [T_X1, T_HW], [0, 1]],
  ];
  const B_FACES: [XZ, XZ, [number, number]][] = [
    [[B_X1, -B_HW], [B_X1, B_HW], [1, 0]], [[T_X1, -B_HW], [B_X1, -B_HW], [0, -1]], [[T_X1, B_HW], [B_X1, B_HW], [0, 1]],
  ];
  for (const [a, b, n] of T_FACES) {
    run(a, b, n, g0 + 9.5, 0.28, 0.16, P.band);                   // the string courses
    run(a, b, n, g0 + 14.1, 0.28, 0.16, P.band);
    run(a, b, n, yT - 0.42, 0.42, 0.3, P.trim);                    // the cornice under the eaves
  }
  for (const [a, b, n] of B_FACES) {
    run(a, b, n, gB + 3.6, 0.26, 0.15, P.band);
    run(a, b, n, yB - 0.38, 0.38, 0.26, P.trim);
  }
  // the footing, broken by the passage on the barbican's far end and the tower's town face
  const foot = (a: XZ, b: XZ, n: [number, number], g: number) => {
    if (n[0] !== 0) { run(a, [a[0], -AW - 0.4], n, base, g + 1.0 - base, 0.3, P.stone); run([a[0], AW + 0.4], b, n, base, g + 1.0 - base, 0.3, P.stone); }
    else run(a, b, n, base, g + 1.0 - base, 0.3, P.stone);
  };
  for (const [a, b, n] of T_FACES) if (n[0] !== 1) foot(a, b, n, g0);
  for (const [a, b, n] of B_FACES) foot(a, b, n, gB);

  // ---- openings: round cannon ports, windows, the guard's niche ----
  const opening = (x: number, y: number, z: number, nx: number, nz: number, w: number, h: number, fw = 0.07) => {
    const tx = -nz, tz = nx, e = 0.03;
    const c = new THREE.Vector3(x + nx * e, y, z + nz * e);
    const Pt = (u: number, v: number) => c.clone().add(new THREE.Vector3(tx * u, v, tz * u));
    loop([Pt(-w / 2, -h / 2), Pt(w / 2, -h / 2), Pt(w / 2, h / 2), Pt(-w / 2, h / 2)]);
    P.dark.push(new THREE.PlaneGeometry(w, h).rotateY(Math.atan2(nx, nz)).translate(c.x, c.y, c.z));
    for (const s of [-1, 1]) {
      P.trim.push(faceBox(w + 2 * fw, fw, 0.05, x, y + s * (h / 2 + fw / 2), z, nx, nz));
      P.trim.push(faceBox(fw, h, 0.05, x + tx * s * (w / 2 + fw / 2), y, z + tz * s * (w / 2 + fw / 2), nx, nz));
    }
  };
  const port = (x: number, y: number, z: number, nx: number, nz: number, r: number) => {
    const tx = -nz, tz = nx, c = new THREE.Vector3(x + nx * 0.03, y, z + nz * 0.03), n = 14;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push(c.clone().add(new THREE.Vector3(tx * Math.cos(a) * r, Math.sin(a) * r, tz * Math.cos(a) * r))); }
    loop(pts);
    P.dark.push(new THREE.CircleGeometry(r, n).rotateY(Math.atan2(nx, nz)).translate(c.x, c.y, c.z));
    P.trim.push(new THREE.TorusGeometry(r + 0.07, 0.07, 6, 18).rotateY(Math.atan2(nx, nz)).translate(x + nx * 0.02, y, z + nz * 0.02));
  };
  const along = (a: XZ, b: XZ, n: number, f: (x: number, z: number) => void) => {
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; f(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); }
  };
  // the tower: a row of round ports under the cornice, on every face; windows on the third floor
  for (const [a, b, n] of T_FACES) {
    along(a, b, n[0] !== 0 ? 4 : 3, (x, z) => port(x, g0 + 16.7, z, n[0], n[1], 0.32));
    if (n[0] === 0) opening((T_X0 + T_X1) / 2, g0 + 12.0, a[1], n[0], n[1], 0.8, 1.3);
    if (n[0] === 0) opening((T_X0 + T_X1) / 2 - 2.2, g0 + 6.6, a[1], n[0], n[1], 0.6, 0.9);
  }
  opening(T_X0, g0 + 12.0, -2.8, -1, 0, 0.8, 1.3);
  opening(T_X0, g0 + 12.0, 2.8, -1, 0, 0.8, 1.3);
  opening(T_X0, g0 + 7.2, 0, -1, 0, 0.9, 1.3);                     // over the arch, on the town side
  opening(T_X1, g0 + 12.4, 0, 1, 0, 0.5, 1.8);                     // the tall slit the drawing shows over the barbican
  // the barbican: round ports on its second floor along both sides, and one over the gateway
  for (const s of [-1, 1]) along([T_X1 + 1, s * B_HW], [B_X1 - 1, s * B_HW], 3, (x, z) => port(x, gB + 5.0, z, 0, s, 0.34));
  port(B_X1, gB + 6.1, 0, 1, 0, 0.36);
  // the guard's niche in the passage's south wall (local -z is south-east)
  opening(T_X0 + 4.2, g0 + 1.15, -AW, 0, 1, 0.9, 1.9);

  // ---- the gateways: stone surrounds, keystones; pilasters at the barbican's corners; the leaves, open ----
  for (const [x0, s, g] of [[B_X1, 1, gB], [T_X0 - 0.12, -1, g0]] as const) {
    const spring = g + (s > 0 ? B_SPRING : T_SPRING);
    const ring = new THREE.Shape();
    ring.absarc(0, spring, AW + 0.38, Math.PI, 0, true);
    ring.lineTo(AW, spring);
    ring.absarc(0, spring, AW, 0, Math.PI, false);
    ring.closePath();
    P.trim.push(alongX(new THREE.ExtrudeGeometry(ring, { depth: 0.12, bevelEnabled: false, curveSegments: 16 }), x0));
    const fx = s > 0 ? B_X1 : T_X0;
    for (const dz of [-1, 1]) P.trim.push(faceBox(0.38, spring - base, 0.12, fx, base + (spring - base) / 2, dz * (AW + 0.19), s, 0));
    P.trim.push(faceBox(0.5, 0.7, 0.18, fx, spring + AW + 0.2, 0, s, 0));
  }
  for (const dz of [-1, 1]) {
    P.trim.push(faceBox(0.55, yB - 0.4 - base, 0.1, B_X1, base + (yB - 0.4 - base) / 2, dz * (B_HW - 0.28), 1, 0));
    const z = dz * (AW - 0.06), x = B_X1 - 1.4;
    P.wood.push(new THREE.BoxGeometry(1.7, B_SPRING - 0.1, 0.1).translate(x, gB + (B_SPRING - 0.1) / 2, z));
    for (const h of [0.45, 1.45, 2.45]) P.iron.push(new THREE.BoxGeometry(1.6, 0.09, 0.02).translate(x, gB + h, z - dz * 0.06));
  }

  // ---- the wall either side, along Pylimo g., until it meets a house (as the stretches that survive do), or broken off ----
  const houses = (o.data.buildings ?? []).filter(b => b.rings[0]?.some(([x, z]) => Math.hypot(x - SITE[0], z - SITE[1]) < 70)).map(b => b.rings[0]);
  const inHouse = ([x, z]: XZ) => houses.some(r => {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > z) !== (r[j][1] > z) && x < ((r[j][0] - r[i][0]) * (z - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
    return c;
  });
  // a slab between x = xa and xb (xa < xb), from z0 to z1 (z0 < z1), sampled every metre, from foot(x, z) to top(x, z)
  const slab = (xa: number, xb: number, z0: number, z1: number, top: (x: number, z: number) => number, ft: (x: number, z: number) => number) => {
    const n = Math.max(1, Math.ceil(z1 - z0)), pos: number[] = [];
    const V = (x: number, z: number, y: number) => new THREE.Vector3(x, y, z);
    const at = (i: number) => z0 + ((z1 - z0) * i) / n;
    const q = (i: number) => { const z = at(i); return { af: V(xa, z, ft(xa, z)), at: V(xa, z, top(xa, z)), bf: V(xb, z, ft(xb, z)), bt: V(xb, z, top(xb, z)) }; };
    const T = (...p: THREE.Vector3[]) => p.forEach(v => pos.push(v.x, v.y, v.z));
    for (let i = 0; i < n; i++) {
      const a = q(i), b = q(i + 1);
      T(a.af, b.af, a.at, b.af, b.at, a.at);                       // the face at xa
      T(a.bf, a.bt, b.bf, b.bf, a.bt, b.bt);                       // the face at xb
      T(a.at, b.at, a.bt, b.at, b.bt, a.bt);                       // the top
    }
    const s = q(0), e = q(n);
    T(s.af, s.at, s.bf, s.bf, s.at, s.bt);
    T(e.af, e.bf, e.at, e.bf, e.bt, e.at);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };
  const wallSegs: [number, number, number, number][] = [];
  const xT = WALL_X - WALL_T / 2, xF = WALL_X + WALL_T / 2;      // the wall's town and field faces
  for (const s of [-1, 1]) {
    let len = WALL_MAX, cut = false;
    for (let d = 0; d <= WALL_MAX; d += 0.5) {
      if ([xT - 0.6, WALL_X, xF].some(x => inHouse(world(x, s * (T_HW + d))))) { len = d - 0.3; cut = true; break; }
    }
    if (len < 1.5) continue;
    const zIn = s * (T_HW - 2), zOut = s * (T_HW + len);         // bonded 2 m into the tower
    const [z0, z1] = s > 0 ? [zIn, zOut] : [zOut, zIn];
    const lvl = (z: number) => gr(WALL_X, z);
    const fromEnd = (z: number) => Math.abs(zOut - z);
    const hash = (k: number) => { const h = Math.sin(k * 12.9898 + s * 78.233) * 43758.5453; return h - Math.floor(h); };
    const brokenTop = (z: number) => (cut || fromEnd(z) > 5 ? WALK : WALK - (1 - fromEnd(z) / 5) * (WALK - 4) + 1.2 * (hash(Math.floor(z)) - 0.5));
    P.wall.push(slab(xT, xF, z0, z1, (_x, z) => lvl(z) + brokenTop(z), (x, z) => gr(x, z) - 0.5));
    const [w0, w1] = s > 0 ? [s * T_HW, zOut - (cut ? 0 : 5)] : [zOut + (cut ? 0 : 5), s * T_HW];
    if (w1 - w0 > 0.5) {
      P.wall.push(slab(xF - 0.6, xF, w0, w1, (_x, z) => lvl(z) + WALK + 1.8, (_x, z) => lvl(z) + WALK));   // the parapet
      const xr0 = xT - 0.6, xr1 = xF + 0.3;
      const roofY = (x: number, z: number) => lvl(z) + WALK + 2.0 - (xr1 - x) * 0.5;
      P.wallRoof.push(slab(xr0, xr1, w0, w1, roofY, (x, z) => roofY(x, z) - 0.2));
      for (let z = w0 + 1; z < w1; z += 2.5) {
        const y0 = lvl(z) + WALK, y1 = roofY(xT + 0.15, z) - 0.2;
        P.wood.push(new THREE.BoxGeometry(0.18, y1 - y0, 0.18).translate(xT + 0.15, (y0 + y1) / 2, z));
      }
      for (let z = w0 + 0.9; z < w1 - 0.5; z += 1.8) opening(xF, lvl(z) + WALK + 1.0, z, 1, 0, 0.18, 0.6, 0.05);
      // a doorway from the wall walk into the tower
      opening(WALL_X - 0.3, g0 + WALK + 0.95, s * T_HW, 0, s, 0.9, 1.9, 0.1);
    }
    P.stone.push(slab(xF, xF + 0.25, z0, z1, (x, z) => gr(x, z) + 0.9, (x, z) => gr(x, z) - 0.5));
    for (const x of [xT, xF]) wallSegs.push([x, z0, x, z1]);
    wallSegs.push([xT, zOut, xF, zOut]);
  }

  // ---- out of the local frame onto the site ----
  const M = new THREE.Matrix4().makeRotationY(Math.atan2(-U[1], U[0])).setPosition(O[0], 0, O[1]);
  const place = (g: THREE.BufferGeometry) => uvMetres(g).applyMatrix4(M);
  const inkWorld = new Float32Array(ink.length);
  for (let i = 0; i < ink.length; i += 3) {
    const [x, z] = world(ink[i], ink[i + 2]);
    inkWorld[i] = x; inkWorld[i + 1] = ink[i + 1]; inkWorld[i + 2] = z;
  }
  const segments: [number, number, number, number][] = [];
  const seg = (x0: number, z0: number, x1: number, z1: number) => { const a = world(x0, z0), b = world(x1, z1); segments.push([a[0], a[1], b[0], b[1]]); };
  const box = (x0: number, z0: number, x1: number, z1: number) => { seg(x0, z0, x1, z0); seg(x1, z0, x1, z1); seg(x1, z1, x0, z1); seg(x0, z1, x0, z0); };

  const solid = new THREE.Group(), ghost = new THREE.Group();
  const [cx, cz] = world((T_X0 + B_X1) / 2, 0);
  const uniforms = {
    uTime: { value: 0 },
    uFog: { value: 'density' in o.fog ? new THREE.Vector3(1, o.fog.density, 0) : new THREE.Vector3(0, o.fog.near, o.fog.far) },
    uGate: { value: new THREE.Vector2(cx, cz) },
  };
  const mesh = (parts: THREE.BufferGeometry[], mat: THREE.Material, shadow = true) => {
    if (!parts.length) return;
    const m = new THREE.Mesh(merged(parts.map(place)), mat);
    m.castShadow = shadow; m.receiveShadow = true;
    solid.add(m);
  };
  if (o.look === 'solid') {
    solid.name = 'rudninkai';
    const Mt = o.mats;
    mesh(P.render, Mt.render); mesh([...P.band, ...P.trim], Mt.trim); mesh(P.stone, Mt.stone);
    mesh([...P.roof, ...P.wallRoof], Mt.roof); mesh(P.dark, Mt.dark, false); mesh(P.wood, Mt.wood); mesh(P.iron, Mt.iron);
    mesh(P.wall, Mt.wall);
    // the gate stops the walker: the tower and the barbican either side of the passage, and the wall
    box(T_X0, -T_HW, T_X1, -AW); box(T_X0, AW, T_X1, T_HW);
    box(T_X1, -B_HW, B_X1, -AW); box(T_X1, AW, B_X1, B_HW);
    for (const s of wallSegs) seg(...s);
  } else {
    ghost.name = 'rudninkai-ghost';
    const faces = merged([...P.render, ...P.band, ...P.roof, ...P.wall, ...P.wallRoof].map(place).map(g => { g.deleteAttribute('uv'); return g; }));
    const edges = new THREE.EdgesGeometry(faces, 24);
    const inkPos = edges.getAttribute('position').array as Float32Array;
    const all = new Float32Array(inkPos.length + inkWorld.length);
    all.set(inkPos); all.set(inkWorld, inkPos.length);
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
