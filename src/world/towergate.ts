import * as THREE from 'three';
import type { AreaData, XZ } from './area';
import type { Terrain } from './terrain';
import { merged } from './geom';
import { faceBox, uvMetres, setGround, ghostMaterial, type Gate, type GateLook, type GateMaterials } from './subacius';

/*
 * A city gate of the tower kind, from a specification (world/rudninkai.ts, world/lostgates.ts; docs/gates.md §9, §10):
 * a gate block with its passage, a hipped or saddle roof (plain or Baroque gables), string courses and a cornice, a
 * fieldstone footing; round ports, windows and an icon's niche where the sources put them; a barbican on the field
 * side, a tower beside the gate, a walled-up passage, if the gate had them; and the city wall either side, until it
 * meets a house standing on its line today, with its covered gallery. The finish is the Subačius Gate's (§8).
 * Built in a frame along the road (x outwards, z along the wall, y up), then turned onto the site.
 */

export type Roof =
  | { kind: 'hip'; rise: number }
  | { kind: 'saddle'; rise: number; ridge: 'road' | 'wall'; gable?: 'plain' | 'baroque' };

/** Openings on a face: `n` spread evenly along it, or `at` offsets from its middle along it; `y` above that part's floor. */
export interface Holes {
  on: 'town' | 'field' | 'sides' | 'bSides' | 'bEnd' | 'flank' | 'passage';
  kind: 'port' | 'window' | 'niche';
  y: number; n?: number; at?: number[];
  w?: number; h?: number; r?: number;
  /** A richer surround, with a hood over it (the Baroque gates). */
  ornate?: boolean;
}

export interface GateSpec {
  name: string;
  /** Where the road crosses the wall's line, and the road's direction away from the town (local frame), normalised. */
  site: XZ; out: XZ;
  /** The gate's own origin, moved along the road and along the wall from `site` (to clear a house, say). */
  shift?: [number, number];
  /** The gate block: from x = -depth (the town face) to 0 (the field face), z = -hw..hw. */
  tower: { depth: number; hw: number; eave: number; roof: Roof; bands?: number[]; chimney?: boolean; pilasters?: number[]; cross?: boolean };
  /** The passage: half its width, its arches' springing; walled up, as the Wet Gate was. */
  passage: { aw: number; spring: number; walled?: boolean; leaves?: boolean };
  /** A barbican on the field side, from x = 0 to `length`. */
  barbican?: { length: number; hw: number; eave: number; rise: number; bands?: number[]; pilasters?: boolean };
  /** A tower beside the gate, in the local frame. */
  flank?: { x0: number; x1: number; z0: number; z1: number; eave: number; rise: number; bands?: number[] };
  holes: Holes[];
  /** The wall either side: its centre line (x), the height of its walk, its longest reach. */
  wall?: { x: number; walk: number; max: number };
}

const WALL_T = 1.8;
// the image in an icon's niche, darkened gilt (one material for every gate)
const GILT = new THREE.MeshStandardMaterial({ color: '#8a6d3b', roughness: 0.45, metalness: 0.55 });

/** A gate's frame: from local (x along the road, z along the wall) to the world, and its rotation. */
export function gateFrame(spec: GateSpec) {
  const U = spec.out, W: XZ = [-U[1], U[0]], [sx, sz] = spec.shift ?? [0, 0];
  const O: XZ = [spec.site[0] + U[0] * sx + W[0] * sz, spec.site[1] + U[1] * sx + W[1] * sz];
  const world = (x: number, z: number): XZ => [O[0] + U[0] * x + W[0] * z, O[1] + U[1] * x + W[1] * z];
  const M = new THREE.Matrix4().makeRotationY(Math.atan2(-U[1], U[0])).setPosition(O[0], 0, O[1]);
  return { U, W, O, world, M };
}

/** Where a gate stood, for the map: its block, barbican and flanking tower, and its middle. */
export function gatePlan(spec: GateSpec): { name: string; x: number; z: number; out: XZ; plan: XZ[][] } {
  const { world } = gateFrame(spec), t = spec.tower, b = spec.barbican, f = spec.flank;
  const rect = (x0: number, x1: number, z0: number, z1: number) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => world(x, z));
  const plan = [rect(-t.depth, 0, -t.hw, t.hw)];
  if (b) plan.push(rect(-0.3, b.length, -b.hw, b.hw));
  if (f) plan.push(rect(f.x0, f.x1, f.z0, f.z1));
  const [x, z] = world(((b ? b.length : 0) - t.depth) / 2, 0);
  return { name: spec.name, x, z, out: spec.out, plan };
}

/** A roof over [x0, x1] x [z0, z1] from eaves at yE, rising `rise`, its ridge along x or z, hipped at either end or
 *  not (then it ends square, over a gable or against a taller wall). UVs in metres: u along the eave, v up the slope. */
function roofGeo(x0: number, x1: number, z0: number, z1: number, yE: number, rise: number, alongX: boolean, hip0: boolean, hip1: boolean): THREE.BufferGeometry {
  const [a0, a1, b0, b1] = alongX ? [x0, x1, z0, z1] : [z0, z1, x0, x1];
  const h = (b1 - b0) / 2, bc = (b0 + b1) / 2, sl = Math.hypot(1, rise / h);
  const r0 = hip0 ? a0 + h : a0, r1 = hip1 ? a1 - h : a1;
  const P = (a: number, b: number, y: number) => (alongX ? new THREE.Vector3(a, y, b) : new THREE.Vector3(b, y, a));
  const pos: number[] = [], uv: number[] = [];
  const tri = (p: THREE.Vector3[], t: [number, number][]) => {
    const n = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0]));
    for (const i of n.y >= 0 ? [0, 1, 2] : [0, 2, 1]) { pos.push(p[i].x, p[i].y, p[i].z); uv.push(t[i][0], t[i][1]); }
  };
  const yR = yE + rise, v = h * sl;
  for (const be of [b0, b1]) {
    const e0 = P(a0, be, yE), e1 = P(a1, be, yE), q0 = P(r0, bc, yR), q1 = P(r1, bc, yR);
    tri([e0, e1, q1], [[a0, 0], [a1, 0], [r1, v]]);
    tri([e0, q1, q0], [[a0, 0], [r1, v], [r0, v]]);
  }
  const hip = (ae: number, r: number) => tri([P(ae, b0, yE), P(ae, b1, yE), P(r, bc, yR)], [[b0, 0], [b1, 0], [bc, v]]);
  if (hip1) hip(a1, r1);
  if (hip0) hip(a0, r0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.userData.metres = true;
  return g;
}

/** A Baroque gable's outline, `hw` either side of its middle and `H` tall: volutes stepping in to a rounded crown. */
function baroqueGable(hw: number, H: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-hw, 0);
  s.lineTo(-hw, 0.1 * H);
  s.quadraticCurveTo(-0.66 * hw, 0.12 * H, -0.6 * hw, 0.46 * H);       // the lower volute
  s.lineTo(-0.66 * hw, 0.5 * H);
  s.lineTo(-0.38 * hw, 0.53 * H);
  s.quadraticCurveTo(-0.36 * hw, 0.78 * H, -0.18 * hw, 0.84 * H);       // the upper volute
  s.lineTo(-0.2 * hw, 0.88 * H);
  s.quadraticCurveTo(0, 1.04 * H, 0.2 * hw, 0.88 * H);                 // the crown
  s.lineTo(0.18 * hw, 0.84 * H);
  s.quadraticCurveTo(0.36 * hw, 0.78 * H, 0.38 * hw, 0.53 * H);
  s.lineTo(0.66 * hw, 0.5 * H);
  s.lineTo(0.6 * hw, 0.46 * H);
  s.quadraticCurveTo(0.66 * hw, 0.12 * H, hw, 0.1 * H);
  s.lineTo(hw, 0);
  s.closePath();
  return s;
}

export function buildTowerGate(spec: GateSpec, o: {
  data: AreaData; terrain: Terrain; look: GateLook; mats: GateMaterials;
  /** The scene's mist, for the ghost (it is drawn after the fog): exp² density, or a linear near/far. */
  fog: { density: number } | { near: number; far: number };
}): Gate {
  const { terrain } = o;
  const { world, M } = gateFrame(spec);
  const T = spec.tower, B = spec.barbican, F = spec.flank, AW = spec.passage.aw;
  const TX0 = -T.depth, TX1 = 0, THW = T.hw;
  const gr = (x: number, z: number) => terrain.heightAt(...world(x, z));
  const g0 = gr(TX0 / 2, 0), gB = B ? gr(B.length / 2, 0) : g0, gF = F ? gr((F.x0 + F.x1) / 2, (F.z0 + F.z1) / 2) : g0;
  let low = Math.min(g0, gB, gF);
  const corners: XZ[] = [[TX0, -THW], [TX0, THW], [TX1, -THW], [TX1, THW]];
  if (B) corners.push([B.length, -B.hw], [B.length, B.hw]);
  if (F) corners.push([F.x0, F.z0], [F.x1, F.z0], [F.x0, F.z1], [F.x1, F.z1]);
  for (const [x, z] of corners) low = Math.min(low, gr(x, z));
  const base = low - 0.6;

  const P = { render: [] as THREE.BufferGeometry[], band: [] as THREE.BufferGeometry[], trim: [] as THREE.BufferGeometry[], stone: [] as THREE.BufferGeometry[],
    roof: [] as THREE.BufferGeometry[], dark: [] as THREE.BufferGeometry[], wood: [] as THREE.BufferGeometry[], iron: [] as THREE.BufferGeometry[],
    wall: [] as THREE.BufferGeometry[], wallRoof: [] as THREE.BufferGeometry[], infill: [] as THREE.BufferGeometry[], icon: [] as THREE.BufferGeometry[] };
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
  const box = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) =>
    new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const run = (a: XZ, b: XZ, n: [number, number], y0: number, h: number, d: number, list: THREE.BufferGeometry[]) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L > 0.05) list.push(faceBox(L, h, d, (a[0] + b[0]) / 2, y0 + h / 2, (a[1] + b[1]) / 2, n[0], n[1]));
  };

  // ---- the gate block and the barbican, the passage through both; a flanking tower ----
  const yT = g0 + T.eave, yB = B ? gB + B.eave : g0, yF = F ? gF + F.eave : g0;
  P.render.push(body(THW, base, yT, g0 + spec.passage.spring, TX0, TX1 - TX0));
  if (B) P.render.push(body(B.hw, base, yB, gB + spec.passage.spring - 0.2, -0.3, B.length + 0.3));
  if (F) P.render.push(box(F.x0, F.x1, F.z0, F.z1, base, yF));

  // ---- roofs, with boards under the eaves and gables where the roof ends square ----
  const ov = 0.5;
  // boards under the eaves on the faces `ends` (-z, +z, -x, +x), running `ext` past the corners (less where a gable stops them)
  const eaveBoards = (x0: number, x1: number, z0: number, z1: number, y: number, ends: [boolean, boolean, boolean, boolean], ext = ov) => {
    if (ends[0]) P.wood.push(faceBox(x1 - x0 + 2 * ext, 0.22, ov, (x0 + x1) / 2, y - 0.16, z0, 0, -1));
    if (ends[1]) P.wood.push(faceBox(x1 - x0 + 2 * ext, 0.22, ov, (x0 + x1) / 2, y - 0.16, z1, 0, 1));
    if (ends[2]) P.wood.push(faceBox(z1 - z0 + 2 * ext, 0.22, ov, x0, y - 0.16, (z0 + z1) / 2, -1, 0));
    if (ends[3]) P.wood.push(faceBox(z1 - z0 + 2 * ext, 0.22, ov, x1, y - 0.16, (z0 + z1) / 2, 1, 0));
  };
  const R = T.roof;
  if (R.kind === 'hip') {
    const alongX = TX1 - TX0 >= 2 * THW;
    P.roof.push(roofGeo(TX0 - ov, TX1 + ov, -THW - ov, THW + ov, yT - 0.05, R.rise, alongX, true, true));
    eaveBoards(TX0, TX1, -THW, THW, yT, [true, true, true, true]);
  } else {
    const alongX = R.ridge === 'road', hw = alongX ? THW : (TX1 - TX0) / 2, baroque = R.gable === 'baroque';
    const gH = baroque ? R.rise + 1.6 : R.rise;
    // past plain gables the roof runs on a little; behind Baroque ones it stops short
    const ext = baroque ? -0.3 : 0.15, [ax0, ax1] = alongX ? [TX0 - ext, TX1 + ext] : [TX0 - ov, TX1 + ov], [az0, az1] = alongX ? [-THW - ov, THW + ov] : [-THW - ext, THW + ext];
    P.roof.push(roofGeo(ax0, ax1, az0, az1, yT - 0.05, R.rise, alongX, false, false));
    eaveBoards(TX0, TX1, -THW, THW, yT, alongX ? [true, true, false, false] : [false, false, true, true], ext);
    P.roof.push(new THREE.BoxGeometry(alongX ? ax1 - ax0 : 0.34, 0.2, alongX ? 0.34 : az1 - az0).translate((TX0 + TX1) / 2, yT + R.rise + 0.02, 0));   // ridge tiles
    // the gables: in the plane of the faces the ridge runs into, 0.6 thick
    const shape = baroque ? baroqueGable(hw, gH) : new THREE.Shape([new THREE.Vector2(-hw, 0), new THREE.Vector2(hw, 0), new THREE.Vector2(0, gH)]);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false, curveSegments: 10 });
    for (const [i, e] of (alongX ? [TX0, TX1 - 0.6] : [-THW, THW - 0.6]).entries()) {
      // the extrusion runs along z; turned a quarter about y it runs along x, from e to e + 0.6
      const m = alongX ? new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(e, yT - 0.01, 0) : new THREE.Matrix4().setPosition((TX0 + TX1) / 2, yT - 0.01, e);
      P.render.push(g.clone().applyMatrix4(m));
      if (baroque) {
        // its coping, a round window, and finials on the steps and the crown
        const sg = i === 0 ? -1 : 1, face = i === 0 ? e : e + 0.6, nX = alongX ? sg : 0, nZ = alongX ? 0 : sg;
        const at = (s: number): XZ => (alongX ? [face, s] : [(TX0 + TX1) / 2 + s, face]);
        run(at(-hw), at(hw), [nX, nZ], yT - 0.05, 0.3, 0.2, P.trim);
        const [wx, wz] = at(0);
        port(wx, yT + gH * 0.45, wz, nX, nZ, 0.45);
        for (const [s, y] of [[-0.62 * hw, 0.48 * gH], [0.62 * hw, 0.48 * gH], [0, 0.94 * gH]] as const) {
          const [px, pz] = at(s);
          P.trim.push(new THREE.BoxGeometry(0.34, 0.6, 0.34).translate(px - nX * 0.3, yT + y + 0.3, pz - nZ * 0.3));
          P.trim.push(new THREE.SphereGeometry(0.2, 8, 6).translate(px - nX * 0.3, yT + y + 0.75, pz - nZ * 0.3));
        }
      }
    }
  }
  if (T.cross) {                                                    // the chapel's cross on the ridge
    P.iron.push(new THREE.BoxGeometry(0.08, 1.6, 0.08).translate((TX0 + TX1) / 2, yT + T.roof.rise + 0.8, 0));
    P.iron.push(new THREE.BoxGeometry(0.08, 0.08, 0.8).translate((TX0 + TX1) / 2, yT + T.roof.rise + 1.15, 0));
  }
  if (T.chimney) {
    P.render.push(new THREE.BoxGeometry(0.9, 2.2, 0.9).translate(TX0 + 2.2, yT + T.roof.rise * 0.55 + 0.6, THW - 2.4));
    P.trim.push(new THREE.BoxGeometry(1.15, 0.2, 1.15).translate(TX0 + 2.2, yT + T.roof.rise * 0.55 + 1.75, THW - 2.4));
  }
  if (B) {
    P.roof.push(roofGeo(TX1, B.length + ov, -B.hw - ov, B.hw + ov, yB - 0.05, B.rise, true, false, true));
    eaveBoards(TX1 + ov, B.length, -B.hw, B.hw, yB, [true, true, false, true]);
  }
  if (F) {
    P.roof.push(roofGeo(F.x0 - ov, F.x1 + ov, F.z0 - ov, F.z1 + ov, yF - 0.05, F.rise, F.x1 - F.x0 >= F.z1 - F.z0, true, true));
    eaveBoards(F.x0, F.x1, F.z0, F.z1, yF, [true, true, true, true]);
  }

  // ---- string courses, cornices, the footing ----
  type Face = [XZ, XZ, [number, number]];
  const T_FACES: Face[] = [
    [[TX0, -THW], [TX0, THW], [-1, 0]], [[TX1, -THW], [TX1, THW], [1, 0]],
    [[TX0, -THW], [TX1, -THW], [0, -1]], [[TX0, THW], [TX1, THW], [0, 1]],
  ];
  const B_FACES: Face[] = B ? [[[B.length, -B.hw], [B.length, B.hw], [1, 0]], [[TX1, -B.hw], [B.length, -B.hw], [0, -1]], [[TX1, B.hw], [B.length, B.hw], [0, 1]]] : [];
  const F_FACES: Face[] = F ? [
    [[F.x0, F.z0], [F.x0, F.z1], [-1, 0]], [[F.x1, F.z0], [F.x1, F.z1], [1, 0]],
    [[F.x0, F.z0], [F.x1, F.z0], [0, -1]], [[F.x0, F.z1], [F.x1, F.z1], [0, 1]],
  ] : [];
  const gabled = (n: [number, number]) => R.kind === 'saddle' && (R.ridge === 'road' ? n[0] !== 0 : n[0] === 0);
  for (const [a, b, n] of T_FACES) {
    for (const y of T.bands ?? []) run(a, b, n, g0 + y, 0.28, 0.16, P.band);
    run(a, b, n, yT - 0.42, 0.42, gabled(n) ? 0.2 : 0.3, P.trim);
  }
  for (const [a, b, n] of B_FACES) {
    for (const y of B!.bands ?? []) run(a, b, n, gB + y, 0.26, 0.15, P.band);
    run(a, b, n, yB - 0.38, 0.38, 0.26, P.trim);
  }
  for (const [a, b, n] of F_FACES) {
    for (const y of F!.bands ?? []) run(a, b, n, gF + y, 0.26, 0.15, P.band);
    run(a, b, n, yF - 0.38, 0.38, 0.26, P.trim);
  }
  const footing = (a: XZ, b: XZ, n: [number, number], g: number, cut: boolean) => {
    if (cut) { run(a, [a[0], -AW - 0.4], n, base, g + 1.0 - base, 0.3, P.stone); run([a[0], AW + 0.4], b, n, base, g + 1.0 - base, 0.3, P.stone); }
    else run(a, b, n, base, g + 1.0 - base, 0.3, P.stone);
  };
  for (const [a, b, n] of T_FACES) if (!(B && n[0] === 1)) footing(a, b, n, g0, n[0] !== 0);
  for (const [a, b, n] of B_FACES) footing(a, b, n, gB, n[0] !== 0);
  for (const [a, b, n] of F_FACES) footing(a, b, n, gF, false);
  // pilasters up the two fronts
  for (const z of T.pilasters ?? []) for (const [x, s] of [[TX0, -1], [TX1, 1]] as const) {
    if (B && s > 0 && Math.abs(z) < B.hw) continue;
    P.trim.push(faceBox(0.6, yT - 0.42 - (g0 + 0.9), 0.12, x, (g0 + 0.9 + yT - 0.42) / 2, z, s, 0));
  }

  // ---- openings ----
  function opening(x: number, y: number, z: number, nx: number, nz: number, w: number, h: number, fw = 0.07, ornate = false) {
    const tx = -nz, tz = nx, e = 0.03;
    const c = new THREE.Vector3(x + nx * e, y, z + nz * e);
    const Pt = (u: number, v: number) => c.clone().add(new THREE.Vector3(tx * u, v, tz * u));
    loop([Pt(-w / 2, -h / 2), Pt(w / 2, -h / 2), Pt(w / 2, h / 2), Pt(-w / 2, h / 2)]);
    P.dark.push(new THREE.PlaneGeometry(w, h).rotateY(Math.atan2(nx, nz)).translate(c.x, c.y, c.z));
    const f = ornate ? 0.16 : fw, d = ornate ? 0.09 : 0.05;
    for (const s of [-1, 1]) {
      P.trim.push(faceBox(w + 2 * f, f, d, x, y + s * (h / 2 + f / 2), z, nx, nz));
      P.trim.push(faceBox(f, h, d, x + tx * s * (w / 2 + f / 2), y, z + tz * s * (w / 2 + f / 2), nx, nz));
    }
    if (ornate) {                                                   // a hood over it, and a sill under it
      P.trim.push(faceBox(w + 0.8, 0.18, 0.22, x, y + h / 2 + f + 0.12, z, nx, nz));
      P.trim.push(faceBox(w + 0.5, 0.12, 0.16, x, y - h / 2 - f - 0.06, z, nx, nz));
    }
  }
  function port(x: number, y: number, z: number, nx: number, nz: number, r: number) {
    const tx = -nz, tz = nx, c = new THREE.Vector3(x + nx * 0.03, y, z + nz * 0.03), n = 14;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push(c.clone().add(new THREE.Vector3(tx * Math.cos(a) * r, Math.sin(a) * r, tz * Math.cos(a) * r))); }
    loop(pts);
    P.dark.push(new THREE.CircleGeometry(r, n).rotateY(Math.atan2(nx, nz)).translate(c.x, c.y, c.z));
    P.trim.push(new THREE.TorusGeometry(r + 0.07, 0.07, 6, 18).rotateY(Math.atan2(nx, nz)).translate(x + nx * 0.02, y, z + nz * 0.02));
  }
  // an icon's niche: a deep recess under a hood, in a broad frame, the image in it
  function niche(x: number, y: number, z: number, nx: number, nz: number, w: number, h: number) {
    opening(x, y, z, nx, nz, w, h, 0.18);
    P.icon.push(new THREE.PlaneGeometry(w * 0.64, h * 0.74).rotateY(Math.atan2(nx, nz)).translate(x + nx * 0.05, y - h * 0.04, z + nz * 0.05));
    P.trim.push(faceBox(w + 1.0, 0.24, 0.3, x, y + h / 2 + 0.36, z, nx, nz));
    P.trim.push(faceBox(w + 0.6, 0.16, 0.24, x, y - h / 2 - 0.26, z, nx, nz));
  }
  for (const H of spec.holes) {
    const faces: { face: Face; g: number }[] =
      H.on === 'town' ? [{ face: T_FACES[0], g: g0 }] : H.on === 'field' ? [{ face: T_FACES[1], g: g0 }] :
      H.on === 'sides' ? [{ face: T_FACES[2], g: g0 }, { face: T_FACES[3], g: g0 }] :
      H.on === 'bSides' ? B_FACES.slice(1).map(face => ({ face, g: gB })) : H.on === 'bEnd' ? B_FACES.slice(0, 1).map(face => ({ face, g: gB })) :
      H.on === 'flank' ? F_FACES.map(face => ({ face, g: gF })) : [];
    if (H.on === 'passage') {                                        // the guard's niche, in the passage's south wall (-z)
      for (const a of H.at ?? [4]) opening(TX0 + a, g0 + H.y, -AW, 0, 1, H.w ?? 0.9, H.h ?? 1.9);
      continue;
    }
    for (const { face: [a, b, n], g } of faces) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), mid: XZ = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], t: XZ = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const offs = H.at ?? Array.from({ length: H.n ?? 1 }, (_, i) => -L / 2 + (L * (i + 0.5)) / (H.n ?? 1));
      for (const s of offs) {
        const x = mid[0] + t[0] * s, z = mid[1] + t[1] * s;
        if (H.kind === 'port') port(x, g + H.y, z, n[0], n[1], H.r ?? 0.32);
        else if (H.kind === 'niche') niche(x, g + H.y, z, n[0], n[1], H.w ?? 1.2, H.h ?? 1.8);
        else opening(x, g + H.y, z, n[0], n[1], H.w ?? 0.8, H.h ?? 1.3, 0.07, H.ornate);
      }
    }
  }

  // ---- the gateways: stone surrounds and keystones, or walled up; pilasters at the barbican's corners; the leaves ----
  const fieldX = B ? B.length : TX1, gField = B ? gB : g0, springField = spec.passage.spring - (B ? 0.2 : 0);
  for (const [x0, s, g, spring0] of [[fieldX, 1, gField, springField], [TX0 - 0.12, -1, g0, spec.passage.spring]] as const) {
    const spring = g + spring0;
    const ring = new THREE.Shape();
    ring.absarc(0, spring, AW + 0.38, Math.PI, 0, true);
    ring.lineTo(AW, spring);
    ring.absarc(0, spring, AW, 0, Math.PI, false);
    ring.closePath();
    P.trim.push(alongX(new THREE.ExtrudeGeometry(ring, { depth: 0.12, bevelEnabled: false, curveSegments: 16 }), x0));
    const fx = s > 0 ? fieldX : TX0;
    for (const dz of [-1, 1]) P.trim.push(faceBox(0.38, spring - base, 0.12, fx, base + (spring - base) / 2, dz * (AW + 0.19), s, 0));
    P.trim.push(faceBox(0.5, 0.7, 0.18, fx, spring + AW + 0.2, 0, s, 0));
    if (spec.passage.walled) {                                       // bricked up in bare brick, a little back from the face
      const sec = new THREE.Shape();
      sec.moveTo(-AW, base); sec.lineTo(-AW, spring); sec.absarc(0, spring, AW, Math.PI, 0, true); sec.lineTo(AW, base); sec.closePath();
      P.infill.push(alongX(new THREE.ExtrudeGeometry(sec, { depth: 0.7, bevelEnabled: false, curveSegments: 14 }), s > 0 ? fx - 0.9 : fx + 0.2));
    }
  }
  if (B?.pilasters) for (const dz of [-1, 1]) P.trim.push(faceBox(0.55, yB - 0.4 - base, 0.1, B.length, base + (yB - 0.4 - base) / 2, dz * (B.hw - 0.28), 1, 0));
  if (spec.passage.leaves !== false && !spec.passage.walled) for (const dz of [-1, 1]) {
    const z = dz * (AW - 0.06), x = fieldX - 1.4, h = springField - 0.1;
    P.wood.push(new THREE.BoxGeometry(1.7, h, 0.1).translate(x, gField + h / 2, z));
    for (const y of [0.45, 1.45, 2.45]) P.iron.push(new THREE.BoxGeometry(1.6, 0.09, 0.02).translate(x, gField + y, z - dz * 0.06));
  }

  // ---- the wall either side, until it meets a house that stands on its line today, or broken off ----
  const wallSegs: [number, number, number, number][] = [];
  if (spec.wall) {
    const { x: WX, walk: WALK, max: WMAX } = spec.wall;
    const site = spec.site;
    const houses = (o.data.buildings ?? []).filter(b => b.rings[0]?.some(([x, z]) => Math.hypot(x - site[0], z - site[1]) < 70)).map(b => b.rings[0]);
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
      const Tr = (...p: THREE.Vector3[]) => p.forEach(v => pos.push(v.x, v.y, v.z));
      for (let i = 0; i < n; i++) {
        const a = q(i), b = q(i + 1);
        Tr(a.af, b.af, a.at, b.af, b.at, a.at);
        Tr(a.bf, a.bt, b.bf, b.bf, a.bt, b.bt);
        Tr(a.at, b.at, a.bt, b.at, b.bt, a.bt);
      }
      const s = q(0), e = q(n);
      Tr(s.af, s.at, s.bf, s.bf, s.at, s.bt);
      Tr(e.af, e.bf, e.at, e.bf, e.bt, e.at);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      return g;
    };
    const xT = WX - WALL_T / 2, xF = WX + WALL_T / 2;
    for (const s of [-1, 1]) {
      // a flanking tower on this side ends the wall at its face
      const flankAt = F && xF > F.x0 && xT < F.x1 && Math.sign(F.z0 + F.z1) === s ? Math.min(Math.abs(F.z0), Math.abs(F.z1)) - THW : Infinity;
      let len = Math.min(WMAX, flankAt), cut = flankAt < WMAX;
      for (let d = 0; d <= len; d += 0.5) {
        if ([xT - 0.6, WX, xF].some(x => inHouse(world(x, s * (THW + d))))) { len = d - 0.3; cut = true; break; }
      }
      if (len < 1.5) continue;
      const zIn = s * (THW - 2), zOut = s * (THW + len);
      const [z0, z1] = s > 0 ? [zIn, zOut] : [zOut, zIn];
      const lvl = (z: number) => gr(WX, z);
      const fromEnd = (z: number) => Math.abs(zOut - z);
      const hash = (k: number) => { const h = Math.sin(k * 12.9898 + s * 78.233) * 43758.5453; return h - Math.floor(h); };
      const brokenTop = (z: number) => (cut || fromEnd(z) > 5 ? WALK : WALK - (1 - fromEnd(z) / 5) * (WALK - 4) + 1.2 * (hash(Math.floor(z)) - 0.5));
      P.wall.push(slab(xT, xF, z0, z1, (_x, z) => lvl(z) + brokenTop(z), (x, z) => gr(x, z) - 0.5));
      const [w0, w1] = s > 0 ? [s * THW, zOut - (cut ? 0 : 5)] : [zOut + (cut ? 0 : 5), s * THW];
      if (w1 - w0 > 0.5) {
        P.wall.push(slab(xF - 0.6, xF, w0, w1, (_x, z) => lvl(z) + WALK + 1.8, (_x, z) => lvl(z) + WALK));
        const xr0 = xT - 0.6, xr1 = xF + 0.3;
        const roofY = (x: number, z: number) => lvl(z) + WALK + 2.0 - (xr1 - x) * 0.5;
        P.wallRoof.push(slab(xr0, xr1, w0, w1, roofY, (x, z) => roofY(x, z) - 0.2));
        for (let z = w0 + 1; z < w1; z += 2.5) {
          const y0 = lvl(z) + WALK, y1 = roofY(xT + 0.15, z) - 0.2;
          P.wood.push(new THREE.BoxGeometry(0.18, y1 - y0, 0.18).translate(xT + 0.15, (y0 + y1) / 2, z));
        }
        for (let z = w0 + 0.9; z < w1 - 0.5; z += 1.8) opening(xF, lvl(z) + WALK + 1.0, z, 1, 0, 0.18, 0.6, 0.05);
        if (g0 + WALK + 1.9 < yT - 0.5) opening(WX - 0.3, g0 + WALK + 0.95, s * THW, 0, s, 0.9, 1.9, 0.1);   // a doorway from the walk
      }
      P.stone.push(slab(xF, xF + 0.25, z0, z1, (x, z) => gr(x, z) + 0.9, (x, z) => gr(x, z) - 0.5));
      for (const x of [xT, xF]) wallSegs.push([x, z0, x, z1]);
      wallSegs.push([xT, zOut, xF, zOut]);
    }
  }

  // ---- out of the gate's frame onto the site ----
  const place = (g: THREE.BufferGeometry) => uvMetres(g).applyMatrix4(M);
  const inkWorld = new Float32Array(ink.length);
  for (let i = 0; i < ink.length; i += 3) {
    const [x, z] = world(ink[i], ink[i + 2]);
    inkWorld[i] = x; inkWorld[i + 1] = ink[i + 1]; inkWorld[i + 2] = z;
  }
  const segments: [number, number, number, number][] = [];
  const seg = (x0: number, z0: number, x1: number, z1: number) => { const a = world(x0, z0), b = world(x1, z1); segments.push([a[0], a[1], b[0], b[1]]); };
  const rect = (x0: number, z0: number, x1: number, z1: number) => { seg(x0, z0, x1, z0); seg(x1, z0, x1, z1); seg(x1, z1, x0, z1); seg(x0, z1, x0, z0); };

  const solid = new THREE.Group(), ghost = new THREE.Group();
  const plan = gatePlan(spec);
  const uniforms = {
    uTime: { value: 0 },
    uFog: { value: 'density' in o.fog ? new THREE.Vector3(1, o.fog.density, 0) : new THREE.Vector3(0, o.fog.near, o.fog.far) },
    uGate: { value: new THREE.Vector2(plan.x, plan.z) },
  };
  const mesh = (parts: THREE.BufferGeometry[], mat: THREE.Material, shadow = true) => {
    if (!parts.length) return;
    const m = new THREE.Mesh(merged(parts.map(place)), mat);
    m.castShadow = shadow; m.receiveShadow = true;
    solid.add(m);
  };
  if (o.look === 'solid') {
    solid.name = spec.name;
    const Mt = o.mats;
    mesh(P.render, Mt.render); mesh([...P.band, ...P.trim], Mt.trim); mesh(P.stone, Mt.stone);
    mesh([...P.roof, ...P.wallRoof], Mt.roof); mesh(P.dark, Mt.dark, false); mesh(P.wood, Mt.wood); mesh(P.iron, Mt.iron);
    mesh(P.wall, Mt.wall); mesh(P.infill, Mt.remnant); mesh(P.icon, GILT, false);
    // the gate stops the walker: its block either side of the passage (all of it, if walled up), the barbican, the
    // flanking tower and the wall
    if (spec.passage.walled) rect(TX0, -THW, TX1, THW);
    else { rect(TX0, -THW, TX1, -AW); rect(TX0, AW, TX1, THW); }
    if (B) { rect(TX1, -B.hw, B.length, -AW); rect(TX1, AW, B.length, B.hw); }
    if (F) rect(F.x0, F.z0, F.x1, F.z1);
    for (const s of wallSegs) seg(...s);
  } else {
    ghost.name = `${spec.name} ghost`;
    const faces = merged([...P.render, ...P.band, ...P.roof, ...P.wall, ...P.wallRoof, ...P.infill].map(place).map(g => { g.deleteAttribute('uv'); return g; }));
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
