import * as THREE from 'three';
import type { Building } from './area';
import type { Terrain } from './terrain';
import type { PromenadeMaterials } from './materials';
import { townHallFrame, TOWN_HALL_SIZE } from './townhall';
import { mbox, merged, trianglesToGeometry } from './geom';
import { treeGeometry } from './trees';

/**
 * The fenced, tree-lined promenade in front of the Town Hall portico, and a market booth beside it.
 *
 * Layout from the 1842 plan (docs/REFERENCES.md §4.5): an enclosure as wide as the portico running
 * straight on from it up the middle of Didžioji, a row of trees inside each side fence, a rounded north
 * end with a well. Look from the period views: stone posts with timber rails, young trees (the c.1800
 * watercolour), and a long low booth with a tiled hip roof west of the portico.
 */

const HALF = 14.3;            // fence line, either side of the axis (the portico is 28 m wide)
const TREE_T = 12.3;          // tree rows
const WALK_T = 11.4;          // gravel walk edge
const LENGTH = 140;           // portico steps to the apex of the rounded north end
const R_END = HALF;
const S_END = LENGTH - R_END; // centre of the rounded end
const SKEW = THREE.MathUtils.degToRad(3); // the plan's axis leans ~3° west of the Town Hall's
const POST_STEP = 3.0;
const GAPS: [number, number][] = [[43, 47], [88, 92]]; // side entrances (s ranges, both sides)
const APEX_GAP = 0.16;        // half-angle of the north entrance, radians

export interface Promenade { group: THREE.Group; segments: [number, number, number, number][]; update(dt: number): void }

export function buildPromenade(th: Building, terrain: Terrain, mats: PromenadeMaterials): Promenade {
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
  const segments: [number, number, number, number][] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
  const place = (g: THREE.BufferGeometry, p: THREE.Vector3, yaw: number) =>
    g.applyMatrix4(m.compose(p, q.setFromAxisAngle(Y, yaw), one));

  // --- Fence: runs of posts and rails, broken by the entrances ---------------------------------
  const fenceRun = (pts: THREE.Vector3[]) => {
    for (const p of pts) stone.push(place(mbox(0.3, 1.0, 0.3, 0, 0.5, 0), p.clone(), yawAlong));
    for (const p of pts) stone.push(place(mbox(0.38, 0.1, 0.38, 0, 1.03, 0), p.clone(), yawAlong));
    for (let i = 0; i + 1 < pts.length; i++) {
      const A = pts[i], B = pts[i + 1];
      const L = Math.hypot(B.x - A.x, B.z - A.z);
      const yaw = Math.atan2(-(B.z - A.z), B.x - A.x);
      const mid = A.clone().add(B).multiplyScalar(0.5);
      for (const h of [0.42, 0.82]) wood.push(place(mbox(L, 0.09, 0.07, 0, h, 0), mid.clone(), yaw));
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
    }
    // Rounded north end, each half up to the entrance
    const a0 = 0, a1 = Math.PI / 2 - APEX_GAP; // angle from the side towards the apex
    const n = Math.max(2, Math.round((R_END * (a1 - a0)) / POST_STEP));
    fenceRun(Array.from({ length: n + 1 }, (_, i) => {
      const a = a0 + ((a1 - a0) * i) / n;
      return world(S_END + Math.sin(a) * R_END, side * Math.cos(a) * R_END);
    }));
  }

  // --- Young lindens inside each fence (the c.1800 watercolour shows them newly planted) ------
  let i = 0;
  for (let s = 5; s <= S_END - 2; s += 8.5, i++) {
    if (GAPS.some(([a, b]) => s > a - 1.5 && s < b + 1.5)) continue;
    for (const side of [-1, 1]) {
      const p = world(s, side * TREE_T);
      const k = 0.85 + 0.3 * ((i * 7 + (side > 0 ? 3 : 0)) % 5) / 4;
      const t = treeGeometry(i * 2 + (side > 0 ? 1 : 0), k);
      bark.push(place(t.wood, p.clone(), i));
      leaves.push(place(t.leaves, p.clone(), i * 1.7));
    }
  }

  // --- Gravel walk, following the ground -------------------------------------------------------
  const tris: THREE.Vector3[][] = [];
  const lift = (p: THREE.Vector3) => { p.y += 0.04; return p; };
  const ds = 4, dt = WALK_T / 3;
  for (let s = 0; s < S_END; s += ds) {
    for (let t = -WALK_T; t < WALK_T - 1e-6; t += dt) {
      const a = lift(world(s, t)), b = lift(world(s, t + dt)), c = lift(world(Math.min(s + ds, S_END), t + dt)), d = lift(world(Math.min(s + ds, S_END), t));
      tris.push([a, b, c], [a, c, d]);
    }
  }
  const segs = 16, rw = WALK_T;
  for (let k = 0; k < segs; k++) {
    const a0 = -Math.PI / 2 + (Math.PI * k) / segs, a1 = -Math.PI / 2 + (Math.PI * (k + 1)) / segs;
    const c = lift(world(S_END, 0));
    tris.push([c, lift(world(S_END + Math.cos(a0) * rw, Math.sin(a0) * rw)), lift(world(S_END + Math.cos(a1) * rw, Math.sin(a1) * rw))]);
  }
  gravel.push(flatGeometry(tris));

  // --- Public well near the north end (the circle on the plan) ---------------------------------
  const wp = world(S_END + 2, -2);
  stone.push(new THREE.CylinderGeometry(1.3, 1.4, 0.9, 20).translate(wp.x, wp.y + 0.45, wp.z));
  for (const side of [-1, 1]) wood.push(place(mbox(0.18, 2.6, 0.18, 0, 1.3, side * 1.2), wp.clone(), yawAlong));
  wood.push(place(mbox(0.16, 0.16, 2.8, 0, 2.5, 0), wp.clone(), yawAlong));
  segments.push(...ringSegments(wp, 1.45));

  // --- Market booth west of the portico (the c.1800 watercolour) -------------------------------
  // Long and low, a tiled hip roof, its open side (counter and posts) facing the promenade.
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

  // --- Meshes ----------------------------------------------------------------------------------
  const group = new THREE.Group();
  group.name = 'promenade';
  const add = (parts: THREE.BufferGeometry[], mat: THREE.Material, shadow = true) => {
    if (!parts.length) return;
    const mesh = new THREE.Mesh(merged(parts), mat);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(stone, mats.stone);
  add(wood, mats.wood);
  add(bark, mats.bark);
  add(leaves, mats.leaves);
  add(roof, mats.roof);
  add(gravel, mats.gravel, false);
  const clock = (mats.leaves.userData.time ?? { value: 0 }) as { value: number };
  return { group, segments, update: dt => { clock.value += dt; } };
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
