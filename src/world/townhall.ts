import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Building } from './area';

/*
 * Vilnius Town Hall as finished in 1799 (L. Gucevičius, built 1788–1799).
 * Sources (docs/REFERENCES.md §4): KVR 678; GRPK footprint; national LiDAR heights;
 * Gucevičius's 1785–86 elevations; measurements from openly licensed photos.
 *
 * Local frame: origin at the north-west corner of the main block, +X along the north
 * (portico) façade, +Z into the building (south), Y up from the square.
 */

// Main block and portico, metres
const W = 36.8;            // north/south façades (GRPK 35.5–37.1)
const D = 34.1;            // east/west façades
const PLINTH = 1.1;        // portico floor above the square
const GF_TOP = 6.5;        // ground-floor ceiling / upper-floor level
const WALL_TOP = 12.6;     // underside of the main cornice
const CORNICE_TOP = 13.6;  // top of the main cornice (same level round the block)
const ROOF_PITCH = THREE.MathUtils.degToRad(22);
const PORTICO_X0 = 4.45, PORTICO_X1 = 32.4, PORTICO_DEPTH = 5.0;
const PORTICO_MID = (PORTICO_X0 + PORTICO_X1) / 2;
const COL_SPACING = [4.5, 4.5, 6.0, 4.5, 4.5]; // wider central bay, as built
const COL_H = 9.6, COL_R0 = 0.75, COL_R1 = 0.63;
const COL_Z = -PORTICO_DEPTH + 0.95;
const ARCHITRAVE = 0.75, FRIEZE = 1.4;
const PEDIMENT_PITCH = THREE.MathUtils.degToRad(17);

export interface TownHallMaterials {
  wall: THREE.Material;   // rusticated plaster
  stone: THREE.Material;  // columns, entablature, cornices, surrounds
  plinth: THREE.Material; // granite
  roof: THREE.Material;   // clay tile (1802 inventory)
  glass: THREE.Material;
  wood: THREE.Material;
}

/** A box with UVs in metres (for world-scale textures). */
function mbox(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let face = 0; face < 6; face++) {
    for (let i = 0; i < 4; i++) {
      const k = face * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[face][0], uv.getY(k) * dims[face][1]);
    }
  }
  g.translate(x, y, z);
  return g;
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts.map(p => (p.index ? p.toNonIndexed() : p)), false);
  if (!g) throw new Error('Town Hall: merge failed');
  return g;
}

/** A column: square plinth, torus, tapering shaft, echinus and abacus (Roman Doric). */
function column(x: number, z: number, base: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(mbox(1.7, 0.22, 1.7, x, base + 0.11, z));
  const torus = new THREE.TorusGeometry(COL_R0 + 0.06, 0.09, 8, 24);
  torus.rotateX(Math.PI / 2);
  torus.translate(x, base + 0.31, z);
  parts.push(torus);
  const shaftH = COL_H - 0.4 - 0.55;
  const shaft = new THREE.CylinderGeometry(COL_R1, COL_R0, shaftH, 24, 4);
  shaft.translate(x, base + 0.4 + shaftH / 2, z);
  parts.push(shaft);
  const top = base + 0.4 + shaftH;
  const neck = new THREE.CylinderGeometry(COL_R1 + 0.05, COL_R1, 0.08, 24);
  neck.translate(x, top + 0.04, z);
  parts.push(neck);
  const echinus = new THREE.CylinderGeometry(COL_R1 + 0.2, COL_R1 + 0.02, 0.22, 24);
  echinus.translate(x, top + 0.19, z);
  parts.push(echinus);
  parts.push(mbox(1.6, 0.25, 1.6, x, top + 0.3 + 0.125, z));
  return parts;
}

/** A hipped roof over the rectangle [x0,x1]×[z0,z1] starting at height y. */
function hipRoof(x0: number, x1: number, z0: number, z1: number, y: number, pitch: number): THREE.BufferGeometry {
  const w = x1 - x0, d = z1 - z0;
  const half = Math.min(w, d) / 2, rise = Math.tan(pitch) * half;
  const alongX = w >= d;
  const r0 = alongX ? new THREE.Vector3(x0 + half, y + rise, z0 + d / 2) : new THREE.Vector3(x0 + w / 2, y + rise, z0 + half);
  const r1 = alongX ? new THREE.Vector3(x1 - half, y + rise, z0 + d / 2) : new THREE.Vector3(x0 + w / 2, y + rise, z1 - half);
  const c = [new THREE.Vector3(x0, y, z0), new THREE.Vector3(x1, y, z0), new THREE.Vector3(x1, y, z1), new THREE.Vector3(x0, y, z1)];
  const tris: THREE.Vector3[][] = alongX
    ? [[c[0], r0, r1], [c[0], r1, c[1]], [c[1], r1, c[2]], [c[2], r1, r0], [c[2], r0, c[3]], [c[3], r0, c[0]]]
    : [[c[0], r0, c[1]], [c[1], r0, r1], [c[1], r1, c[2]], [c[2], r1, c[3]], [c[3], r1, r0], [c[3], r0, c[0]]];
  return trianglesToGeometry(tris);
}

/** Triangles facing up/out, with UVs in metres along the eave and up the slope. */
function trianglesToGeometry(tris: THREE.Vector3[][]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let [a, b, c] of tris) {
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize();
    if (n.y < 0) { [b, c] = [c, b]; n.negate(); }
    // UV: u along the horizontal direction of the face, v up its slope.
    const hx = new THREE.Vector3(-n.z, 0, n.x);
    if (hx.lengthSq() < 1e-6) hx.set(1, 0, 0);
    hx.normalize();
    for (const p of [a, b, c]) {
      pos.push(p.x, p.y, p.z);
      nor.push(n.x, n.y, n.z);
      uv.push(p.dot(hx), p.y / Math.max(n.y, 0.2));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** A window with frame, glass and a cornice hood, set on a wall facing -Z (local to the wall). */
function windowParts(cx: number, bottom: number, w: number, h: number, hood: boolean, stone: THREE.BufferGeometry[], glass: THREE.BufferGeometry[]): void {
  const f = 0.16, out = 0.1;
  stone.push(mbox(w + 2 * f, f, out, cx, bottom + h + f / 2, -out / 2));      // head
  stone.push(mbox(w + 2 * f + 0.1, 0.14, out + 0.08, cx, bottom - 0.07, -(out + 0.08) / 2)); // sill
  stone.push(mbox(f, h, out, cx - w / 2 - f / 2, bottom + h / 2, -out / 2));  // jambs
  stone.push(mbox(f, h, out, cx + w / 2 + f / 2, bottom + h / 2, -out / 2));
  if (hood) stone.push(mbox(w + 2 * f + 0.4, 0.16, 0.34, cx, bottom + h + f + 0.28, -0.17));
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateY(Math.PI);
  g.translate(cx, bottom + h / 2, -0.01);
  glass.push(g);
}

/** A door or gateway; zOff pushes it out past the plinth when it starts at street level. */
function doorParts(cx: number, bottom: number, w: number, h: number, stone: THREE.BufferGeometry[], wood: THREE.BufferGeometry[], zOff = 0): void {
  const f = 0.2, out = 0.12;
  stone.push(mbox(w + 2 * f, f, out, cx, bottom + h + f / 2, zOff - out / 2));
  stone.push(mbox(f, h, out, cx - w / 2 - f / 2, bottom + h / 2, zOff - out / 2));
  stone.push(mbox(f, h, out, cx + w / 2 + f / 2, bottom + h / 2, zOff - out / 2));
  stone.push(mbox(w + 2 * f + 0.5, 0.18, 0.36, cx, bottom + h + f + 0.3, zOff - 0.18));
  wood.push(mbox(w, h, 0.06, cx, bottom + h / 2, zOff - 0.03));
}

/** Moves geometry built for a wall facing -Z (origin at the wall's left end) onto a wall of the block. */
function onWall(g: THREE.BufferGeometry, side: 'n' | 'e' | 's' | 'w'): THREE.BufferGeometry {
  const m = new THREE.Matrix4();
  if (side === 'n') m.identity();
  if (side === 'e') m.makeRotationY(-Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(W, 0, 0));
  if (side === 's') m.makeRotationY(Math.PI).premultiply(new THREE.Matrix4().makeTranslation(W, 0, D));
  if (side === 'w') m.makeRotationY(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(0, 0, D));
  return g.applyMatrix4(m);
}

export function buildTownHall(b: Building, mats: TownHallMaterials): THREE.Group {
  const wall: THREE.BufferGeometry[] = [], stone: THREE.BufferGeometry[] = [], plinth: THREE.BufferGeometry[] = [];
  const roof: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [], wood: THREE.BufferGeometry[] = [];

  // Plinth (granite) and walls (rusticated plaster), from below the sloping ground to the cornice.
  plinth.push(mbox(W + 0.3, PLINTH + 2, D + 0.3, W / 2, PLINTH / 2 - 1, D / 2));
  wall.push(mbox(W, WALL_TOP - PLINTH, D, W / 2, (WALL_TOP + PLINTH) / 2, D / 2));

  // Main cornice with modillions, all round
  stone.push(mbox(W + 1.2, CORNICE_TOP - WALL_TOP - 0.35, D + 1.2, W / 2, WALL_TOP + 0.35 + (CORNICE_TOP - WALL_TOP - 0.35) / 2, D / 2));
  stone.push(mbox(W + 0.5, 0.35, D + 0.5, W / 2, WALL_TOP + 0.175, D / 2));
  for (let x = 0.6; x < W - 0.3; x += 1.2) {
    stone.push(mbox(0.22, 0.2, 0.55, x, WALL_TOP + 0.45, -0.3));
    stone.push(mbox(0.22, 0.2, 0.55, x, WALL_TOP + 0.45, D + 0.3));
  }
  for (let z = 0.6; z < D - 0.3; z += 1.2) {
    stone.push(mbox(0.55, 0.2, 0.22, -0.3, WALL_TOP + 0.45, z));
    stone.push(mbox(0.55, 0.2, 0.22, W + 0.3, WALL_TOP + 0.45, z));
  }

  // Hipped main roof in clay tile
  roof.push(hipRoof(-0.6, W + 0.6, -0.6, D + 0.6, CORNICE_TOP, ROOF_PITCH));

  // --- Portico ---------------------------------------------------------------
  const px0 = PORTICO_X0, px1 = PORTICO_X1, pz = -PORTICO_DEPTH;
  plinth.push(mbox(px1 - px0, PLINTH, PORTICO_DEPTH, PORTICO_MID, PLINTH / 2, pz / 2));
  // Steps (simple, lower stone steps for 1799): five risers across the central span
  const stepsW = 22, steps = 5, tread = 0.4, riser = PLINTH / steps;
  for (let i = 0; i < steps; i++) {
    plinth.push(mbox(stepsW, riser * (i + 1), tread, PORTICO_MID, (riser * (i + 1)) / 2, pz - tread * (steps - i) + tread / 2));
  }
  // Columns
  let cx = PORTICO_MID - COL_SPACING.reduce((a, b) => a + b, 0) / 2;
  const colX: number[] = [cx];
  for (const s of COL_SPACING) colX.push((cx += s));
  for (const x of colX) stone.push(...column(x, COL_Z, PLINTH));
  // Engaged pilasters (antae) where the portico meets the wall
  for (const x of [px0 + 0.55, px1 - 0.55]) stone.push(mbox(1.1, COL_H, 1.1, x, PLINTH + COL_H / 2, -0.55));
  // Entablature over the portico: architrave, triglyph frieze, cornice
  const eBase = PLINTH + COL_H;
  stone.push(mbox(px1 - px0, ARCHITRAVE, PORTICO_DEPTH, PORTICO_MID, eBase + ARCHITRAVE / 2, pz / 2));
  stone.push(mbox(px1 - px0 - 0.2, FRIEZE, PORTICO_DEPTH - 0.2, PORTICO_MID, eBase + ARCHITRAVE + FRIEZE / 2, pz / 2 + 0.1));
  const fTop = eBase + ARCHITRAVE + FRIEZE;
  stone.push(mbox(px1 - px0 + 1.0, CORNICE_TOP - fTop, PORTICO_DEPTH + 0.5, PORTICO_MID, fTop + (CORNICE_TOP - fTop) / 2, pz / 2 - 0.25));
  // Triglyphs over each column and between (front)
  const triglyphXs: number[] = [];
  for (let i = 0; i < colX.length; i++) {
    triglyphXs.push(colX[i]);
    if (i < colX.length - 1) {
      const n = COL_SPACING[i] > 5 ? 2 : 1;
      for (let k = 1; k <= n; k++) triglyphXs.push(colX[i] + (COL_SPACING[i] * k) / (n + 1));
    }
  }
  for (const x of triglyphXs) stone.push(mbox(0.62, FRIEZE - 0.1, 0.12, x, eBase + ARCHITRAVE + FRIEZE / 2, pz + 0.04));
  // Portico ceiling
  stone.push(mbox(px1 - px0, 0.1, PORTICO_DEPTH, PORTICO_MID, eBase - 0.05, pz / 2));

  // Pediment (low, ~17°) with raking cornices, and the portico's gabled roof back to the main roof
  const pw = px1 - px0 + 1.0, prise = Math.tan(PEDIMENT_PITCH) * (pw / 2);
  const pedShape = new THREE.Shape([new THREE.Vector2(-pw / 2, 0), new THREE.Vector2(pw / 2, 0), new THREE.Vector2(0, prise)]);
  const ped = new THREE.ExtrudeGeometry(pedShape, { depth: 0.6, bevelEnabled: false });
  ped.translate(PORTICO_MID, CORNICE_TOP, pz - 0.25);
  stone.push(ped);
  const rake = Math.hypot(pw / 2, prise);
  for (const sgn of [-1, 1]) {
    const r = mbox(rake + 0.3, 0.35, 0.9, 0, 0, 0);
    r.rotateZ(sgn * -PEDIMENT_PITCH);
    r.translate(PORTICO_MID + (sgn * pw) / 4, CORNICE_TOP + prise / 2 + 0.15, pz - 0.2);
    stone.push(r);
  }
  // Gabled portico roof: two slopes from the pediment back into the main roof
  const gz0 = pz - 0.7, gz1 = 6;
  const ridge = new THREE.Vector3(PORTICO_MID, CORNICE_TOP + prise + 0.25, 0);
  roof.push(trianglesToGeometry([
    [new THREE.Vector3(px0 - 0.5, CORNICE_TOP + 0.1, gz0), ridge.clone().setZ(gz0), ridge.clone().setZ(gz1)],
    [new THREE.Vector3(px0 - 0.5, CORNICE_TOP + 0.1, gz0), ridge.clone().setZ(gz1), new THREE.Vector3(px0 - 0.5, CORNICE_TOP + 0.1, gz1)],
    [new THREE.Vector3(px1 + 0.5, CORNICE_TOP + 0.1, gz0), ridge.clone().setZ(gz1), ridge.clone().setZ(gz0)],
    [new THREE.Vector3(px1 + 0.5, CORNICE_TOP + 0.1, gz0), new THREE.Vector3(px1 + 0.5, CORNICE_TOP + 0.1, gz1), ridge.clone().setZ(gz1)],
  ]));

  // --- Openings ------------------------------------------------------------
  // North façade behind the portico: 5 bays between the columns; 3 doors below (centre widest)
  const northStone: THREE.BufferGeometry[] = [], northGlass: THREE.BufferGeometry[] = [], northWood: THREE.BufferGeometry[] = [];
  const bays = colX.slice(0, -1).map((x, i) => (x + colX[i + 1]) / 2);
  bays.forEach((x, i) => {
    windowParts(x, GF_TOP + 0.8, 1.35, 2.6, true, northStone, northGlass);
    if (i === 2) doorParts(x, PLINTH, 1.9, 3.4, northStone, northWood);
    else if (i === 1 || i === 3) doorParts(x, PLINTH, 1.5, 3.2, northStone, northWood);
    else windowParts(x, PLINTH + 1.3, 1.25, 2.1, true, northStone, northGlass);
  });
  northStone.forEach(g => stone.push(onWall(g, 'n')));
  northGlass.forEach(g => glass.push(onWall(g, 'n')));
  northWood.forEach(g => wood.push(onWall(g, 'n')));

  // Side façades (Gucevičius side elevation): 6 bays, drive-through gateways in bays 2 and 5
  for (const side of ['e', 'w'] as const) {
    const s: THREE.BufferGeometry[] = [], gl: THREE.BufferGeometry[] = [], wd: THREE.BufferGeometry[] = [];
    const bay = D / 6;
    for (let i = 0; i < 6; i++) {
      // Walls run from the façade's left end; on the west wall, bay 1 is at the south end.
      const idx = side === 'e' ? i : 5 - i;
      const x = bay * (i + 0.5);
      windowParts(x, GF_TOP + 0.9, 1.3, 2.5, true, s, gl);
      if (idx === 1 || idx === 4) doorParts(x, -0.4, 3.0, 4.5, s, wd, -0.16);
      else windowParts(x, PLINTH + 1.1, 1.25, 2.2, false, s, gl);
    }
    s.forEach(g => stone.push(onWall(g, side)));
    gl.forEach(g => glass.push(onWall(g, side)));
    wd.forEach(g => wood.push(onWall(g, side)));
  }

  // South façade (no period elevation found): 7 regular bays, a central door
  {
    const s: THREE.BufferGeometry[] = [], gl: THREE.BufferGeometry[] = [], wd: THREE.BufferGeometry[] = [];
    const bay = W / 7;
    for (let i = 0; i < 7; i++) {
      const x = bay * (i + 0.5);
      windowParts(x, GF_TOP + 0.9, 1.3, 2.5, true, s, gl);
      if (i === 3) doorParts(x, -0.4, 1.8, 3.8, s, wd, -0.16);
      else windowParts(x, PLINTH + 1.1, 1.25, 2.2, false, s, gl);
    }
    s.forEach(g => stone.push(onWall(g, 's')));
    gl.forEach(g => glass.push(onWall(g, 's')));
    wd.forEach(g => wood.push(onWall(g, 's')));
  }

  const group = new THREE.Group();
  group.name = 'townhall';
  const add = (parts: THREE.BufferGeometry[], mat: THREE.Material, shadows = true) => {
    if (!parts.length) return;
    const mesh = new THREE.Mesh(merged(parts), mat);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(wall, mats.wall);
  add(stone, mats.stone);
  add(plinth, mats.plinth);
  add(roof, mats.roof);
  add(glass, mats.glass, false);
  add(wood, mats.wood);

  placeOnFootprint(group, b);
  return group;
}

/**
 * Orients the local frame on the GRPK footprint: +X along the north façade, origin at the
 * main block's north-west corner. Uses the footprint's longest northward-facing wall.
 */
function placeOnFootprint(group: THREE.Group, b: Building): void {
  // Main-block corners from the GRPK outline (see docs/REFERENCES.md §4.3):
  // NW (-19.33, 34.21), NE (14.37, 49.65), SW (-32.02, 65.79).
  const ring = b.rings[0];
  const byName = (x: number, z: number) => ring.reduce((best, p) => (Math.hypot(p[0] - x, p[1] - z) < Math.hypot(best[0] - x, best[1] - z) ? p : best), ring[0]);
  const nw = byName(-19.33, 34.21), ne = byName(14.37, 49.65), sw = byName(-32.02, 65.79);
  const ux = ne[0] - nw[0], uz = ne[1] - nw[1];
  const len = Math.hypot(ux, uz);
  // Rotating +X by θ about Y gives (cos θ, 0, -sin θ).
  const theta = Math.atan2(-uz / len, ux / len);
  // Centre the model on the footprint: the GRPK block is ~37.1 × 34.1 m.
  const along = (len - W) / 2;
  const vx = sw[0] - nw[0], vz = sw[1] - nw[1];
  const depth = Math.hypot(vx, vz);
  const across = (depth - D) / 2;
  const dirX = new THREE.Vector3(ux / len, 0, uz / len), dirZ = new THREE.Vector3(vx / depth, 0, vz / depth);
  group.position.set(nw[0], b.groundY, nw[1]).addScaledVector(dirX, along).addScaledVector(dirZ, across);
  group.rotation.y = theta;
}
