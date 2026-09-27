import * as THREE from 'three';
import { trianglesToGeometry } from './geom';
import { bevelBox, sweep, lathe, grid, mergeParts, bakeOcclusion, occlusion, type P2, type Occluder } from './classical';
import type { Building } from './area';

/*
 * Vilnius Town Hall as finished in 1799 (L. Gucevičius, built 1788–1799).
 * Sources (docs/REFERENCES.md §4): KVR 678; GRPK footprint; national LiDAR heights;
 * Gucevičius's 1785–86 elevations; measurements from openly licensed photos.
 *
 * The order is Roman Doric, after the elevations and the building as it stands: six columns with
 * entasis on square plinths (torus base; necking, annulets, echinus and abacus), the outer pair close to
 * the portico's ends and the middle bay wider, as built; square antae against the wall behind the end
 * columns; a full entablature (architrave in two fasciae with a taenia, a triglyph frieze on the portico,
 * plain elsewhere, a cornice with mutules under the corona and a cyma crown) running round the whole
 * block; a low pediment with raking cornices and a plain recessed tympanum; a beamed, coved ceiling;
 * five bevelled granite steps between cheek blocks. Openings have moulded architraves with a deep
 * reveal, sills, and friezes and cornices over them (doors on consoles).
 *
 * Local frame: origin at the north-west corner of the main block, +X along the north
 * (portico) façade, +Z into the building (south), Y up from the square.
 */

// Main block and portico, metres
const W = 36.8;            // north/south façades (GRPK 35.5–37.1)
const D = 34.1;            // east/west façades
const PLINTH = 1.1;        // portico floor above the square
const GF_TOP = 6.5;        // ground-floor ceiling / upper-floor level
const ROOF_PITCH = THREE.MathUtils.degToRad(22);
const PORTICO_X0 = 4.45, PORTICO_X1 = 32.4, PORTICO_DEPTH = 5.0;
const PORTICO_MID = (PORTICO_X0 + PORTICO_X1) / 2;
const COL_SPACING = [4.85, 4.85, 6.45, 4.85, 4.85]; // wider central bay, as built; outer columns ~1 m in from the ends
const COL_H = 9.6, COL_R0 = 0.75, COL_R1 = 0.63;
const COL_Z = -PORTICO_DEPTH + 0.95;
// Entablature, the same height all round: architrave, frieze, cornice
const E_BASE = PLINTH + COL_H;              // 10.7
const ARCHITRAVE = 0.75, FRIEZE = 1.4;
const F_BASE = E_BASE + ARCHITRAVE;         // 11.45: frieze and portico ceiling
const C_BASE = F_BASE + FRIEZE;             // 12.85
const CORNICE_TOP = 13.6;                   // top of the main cornice (same level round the block)
const Z_FRIEZE = -PORTICO_DEPTH + 0.2;      // portico frieze face (the architrave and cornice project from it)
const PEDIMENT_PITCH = THREE.MathUtils.degToRad(17);

// Profiles: (projection, height) from the frieze face, walked with the stone on the left
const CORNICE_P: P2[] = [[0, 0], [0.06, 0], [0.06, 0.04], [0.1, 0.06], [0.15, 0.1], [0.19, 0.13], [0.2, 0.18], // bed mould
  [0.95, 0.18], [0.95, 0.2], [0.98, 0.22], [0.98, 0.48],                                                          // soffit, drip, corona
  [1.01, 0.5], [1.01, 0.53], [1.04, 0.56], [1.09, 0.6], [1.13, 0.64], [1.15, 0.68], [1.16, 0.72], [1.16, 0.75], // fillet, cyma recta
  [0, 0.75]];
const C_H = 0.75, C_PROJ = 1.16;
const ARCHITRAVE_P: P2[] = [[0, 0], [0.07, 0], [0.07, 0.3], [0.1, 0.33], [0.1, 0.58], [0.13, 0.61], [0.15, 0.62], [0.15, 0.75], [0, 0.75]];
const BASE_P: P2[] = [[0.12, 0], [0.12, 0.04], [0.14, 0.07], [0.13, 0.13], [0.09, 0.17], [0.05, 0.19], [0.03, 0.22], [0.02, 0.26], [0, 0.26]];
// Window architrave: (width out from the opening, projection from the wall), reveal last
const FRAME_P: P2[] = [[0.24, 0], [0.235, 0.05], [0.22, 0.09], [0.2, 0.11], [0.19, 0.14], [0.12, 0.14], [0.11, 0.16], [0.03, 0.16], [0, 0.14], [0, 0]];
const HOOD_P: P2[] = [[0, 0], [0.03, 0], [0.04, 0.03], [0.08, 0.05], [0.15, 0.08], [0.2, 0.08], [0.2, 0.17], [0.22, 0.18], [0.24, 0.21], [0.26, 0.24], [0.26, 0.26], [0, 0.26]];
const COVE_P: P2[] = [[0.3, 0], [0.2, 0.025], [0.12, 0.07], [0.05, 0.15], [0.015, 0.23], [0, 0.3]];

export interface TownHallMaterials {
  wall: THREE.Material;   // rusticated plaster
  stone: THREE.Material;  // columns, entablature, cornices, surrounds
  plinth: THREE.Material; // granite
  roof: THREE.Material;   // clay tile (1802 inventory)
  glass: THREE.Material;
  wood: THREE.Material;
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const scaleP = (p: P2[], ks: number, ku = ks): P2[] => p.map(([s, u]) => [s * ks, u * ku]);

/** Roman Doric column on a square plinth: torus base, shaft with entasis, necking, annulets, echinus, abacus. */
function column(x: number, z: number, base: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const PL = 0.32;
  parts.push(bevelBox(1.9, PL, 1.9, x, base + PL / 2, z, 0.04));
  const prof: P2[] = [];
  const arc = (cr: number, cy: number, rad: number, a0: number, a1: number, n: number) => {
    for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; prof.push([cr + rad * Math.cos(a), cy + rad * Math.sin(a)]); }
  };
  arc(0.8, PL + 0.15, 0.15, -Math.PI / 2, Math.PI / 2, 10);            // torus
  prof.push([0.79, PL + 0.3], [0.79, PL + 0.36]);                         // fillet
  arc(0.79, PL + 0.4, 0.04, -Math.PI / 2, -Math.PI, 4);                  // apophyge: a cove into the shaft
  const s0 = PL + 0.48, capH = 1.02, s1 = COL_H - capH;
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N, y = s0 + (s1 - s0) * t;
    // entasis: straight lower third, then a gentle convex diminution to the top diameter
    const r = t < 1 / 3 ? COL_R0 : COL_R1 + (COL_R0 - COL_R1) * Math.cos(((t - 1 / 3) / (2 / 3)) * (Math.PI / 2));
    prof.push([r, y]);
  }
  const R1 = COL_R1;
  prof.push([R1 + 0.02, s1 + 0.02], [R1 + 0.02, s1 + 0.04]);             // fillet under the astragal
  arc(R1 + 0.02, s1 + 0.1, 0.06, -Math.PI / 2, Math.PI / 2, 6);          // astragal bead
  prof.push([R1, s1 + 0.17], [R1, s1 + 0.48]);                            // necking
  const e0 = s1 + 0.48;
  prof.push([R1 + 0.04, e0 + 0.01], [R1 + 0.04, e0 + 0.04], [R1 + 0.07, e0 + 0.05], [R1 + 0.07, e0 + 0.08]); // annulets
  arc(R1 + 0.07, e0 + 0.28, 0.2, -Math.PI / 2, 0, 7);                    // echinus (quarter round)
  prof.push([R1 + 0.27, e0 + 0.3], [0, e0 + 0.3]);
  const col = lathe(prof, 48, { hard: 35, uvR: COL_R0 });
  col.translate(x, base, z);
  parts.push(col);
  const ab0 = base + e0 + 0.3;
  parts.push(bevelBox(1.8, 0.2, 1.8, x, ab0 + 0.1, z, 0.03));             // abacus
  parts.push(bevelBox(1.86, 0.05, 1.86, x, ab0 + 0.225, z, 0.015));       // its fillet
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

type OpeningKind = 'upper' | 'lower' | 'door' | 'gate';

/**
 * A window or door in a wall facing -Z (local to the wall, x from its left end): moulded architrave
 * with a 16 cm reveal, glass or panelled leaves set back in it, a sill, and a frieze and cornice over.
 * zOff pushes it out past the plinth when it starts at street level.
 */
function openingParts(cx: number, bottom: number, w: number, h: number, kind: OpeningKind, stone: THREE.BufferGeometry[], glass: THREE.BufferGeometry[], wood: THREE.BufferGeometry[], zOff = 0): void {
  const door = kind === 'door' || kind === 'gate';
  const k = door ? 1.25 : 1, fw = 0.24 * k, top = bottom + h;
  const xL = cx - w / 2, xR = cx + w / 2;
  const frame = scaleP(FRAME_P, k, 1);
  const up = v3(0, 0, -1);
  if (door) stone.push(sweep([v3(xR, bottom, zOff), v3(xR, top, zOff), v3(xL, top, zOff), v3(xL, bottom, zOff)], up, frame));
  else stone.push(sweep([v3(xL, bottom, zOff), v3(xR, bottom, zOff), v3(xR, top, zOff), v3(xL, top, zOff)], up, frame, { closed: true }));
  // cornice over the opening, with returns to the wall; a plain frieze under it on the upper windows and doors
  const frieze = kind === 'upper' ? 0.3 : door ? 0.36 : 0;
  const hx0 = xL - fw, hx1 = xR + fw, fy = top + fw;
  if (frieze) stone.push(bevelBox(hx1 - hx0, frieze, 0.12, cx, fy + frieze / 2, zOff - 0.06, 0.02));
  const hz = zOff - (frieze ? 0.12 : 0.16), hy = fy + frieze;
  const hood = scaleP(HOOD_P, door ? 1.2 : 1);
  stone.push(sweep([v3(hx0, hy, zOff), v3(hx0, hy, hz), v3(hx1, hy, hz), v3(hx1, hy, zOff)], v3(0, 1, 0), hood));
  if (door) {
    // scrolled consoles carrying the cornice ends
    for (const x of [hx0 + 0.1, hx1 - 0.1]) {
      stone.push(bevelBox(0.2, frieze + 0.5, 0.24, x, hy - (frieze + 0.5) / 2, zOff - 0.12, 0.04));
      stone.push(bevelBox(0.24, 0.12, 0.3, x, hy - frieze - 0.5, zOff - 0.15, 0.04));
    }
    // two panelled leaves, set back in the reveal
    const leafZ = zOff - 0.04;
    wood.push(bevelBox(w, h, 0.08, cx, bottom + h / 2, leafZ, 0.015));
    for (const side of [-1, 1]) {
      const lx = cx + (side * w) / 4, pw = w / 2 - 0.22;
      for (const [py, ph] of [[0.25, h * 0.28], [0.25 + h * 0.28 + 0.14, h * 0.2], [0.25 + h * 0.48 + 0.28, h - 0.25 - h * 0.48 - 0.28 - 0.22]]) {
        wood.push(bevelBox(pw, ph, 0.05, lx, bottom + py + ph / 2, leafZ - 0.05, 0.02));
      }
    }
    return;
  }
  // sill; the upper windows' on two small consoles
  stone.push(bevelBox(w + 2 * fw + 0.12, 0.1, 0.26, cx, bottom - 0.05, zOff - 0.13, 0.025));
  if (kind === 'upper') for (const x of [xL - fw * 0.5, xR + fw * 0.5]) stone.push(bevelBox(0.16, 0.26, 0.2, x, bottom - 0.23, zOff - 0.1, 0.03));
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateY(Math.PI);
  g.translate(cx, bottom + h / 2, zOff - 0.005);
  glass.push(g);
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

/** A wall face in the wall frame (facing -Z), UVs in metres (u along the wall, v = height). */
const wallFace = (x0: number, x1: number, y0: number, y1: number, cell = 100) =>
  grid(v3(x0, y0, 0), v3(x1 - x0, 0, 0), v3(0, y1 - y0, 0), cell, v3(0, 0, -1), [x0, y0]);

export function buildTownHall(b: Building, mats: TownHallMaterials): THREE.Group {
  const wall: THREE.BufferGeometry[] = [], stone: THREE.BufferGeometry[] = [], plinth: THREE.BufferGeometry[] = [];
  const roof: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [], wood: THREE.BufferGeometry[] = [];
  const px0 = PORTICO_X0, px1 = PORTICO_X1, pz = -PORTICO_DEPTH, zF = Z_FRIEZE;

  // Column centres
  let cx = PORTICO_MID - COL_SPACING.reduce((a, s) => a + s, 0) / 2;
  const colX: number[] = [cx];
  for (const s of COL_SPACING) colX.push((cx += s));

  // --- Walls: granite plinth, rusticated render up to the architrave, a smooth frieze above ------------
  plinth.push(bevelBox(W + 0.3, PLINTH + 2, D + 0.3, W / 2, PLINTH / 2 - 1, D / 2, 0.05));
  const lens = { n: W, e: D, s: W, w: D };
  for (const side of ['n', 'e', 's', 'w'] as const) {
    const L = lens[side];
    if (side === 'n') {
      wall.push(onWall(wallFace(0, px0, PLINTH, E_BASE + 0.05), side), onWall(wallFace(px1, W, PLINTH, E_BASE + 0.05), side));
      wall.push(onWall(wallFace(px0, px1, PLINTH, F_BASE + 0.02, 0.6), side)); // behind the portico, up to the ceiling: a fine grid for the baked shade
      stone.push(onWall(wallFace(0, px0, F_BASE - 0.05, C_BASE + 0.02), side), onWall(wallFace(px1, W, F_BASE - 0.05, C_BASE + 0.02), side));
    } else {
      wall.push(onWall(wallFace(0, L, PLINTH, E_BASE + 0.05), side));
      stone.push(onWall(wallFace(0, L, F_BASE - 0.05, C_BASE + 0.02), side));
    }
  }
  // base moulding on the plinth, round the block (not behind the portico, where the doors stand on the floor)
  stone.push(sweep([v3(px1, PLINTH, 0), v3(W, PLINTH, 0), v3(W, PLINTH, D), v3(0, PLINTH, D), v3(0, PLINTH, 0), v3(px0, PLINTH, 0)], v3(0, 1, 0), BASE_P));

  // --- Entablature round the block and the portico (one outline) ---------------------------------------
  const outline = (y: number) => [v3(0, y, 0), v3(px0, y, 0), v3(px0, y, zF), v3(px1, y, zF), v3(px1, y, 0), v3(W, y, 0), v3(W, y, D), v3(0, y, D)];
  stone.push(sweep(outline(E_BASE), v3(0, 1, 0), ARCHITRAVE_P, { closed: true }));
  stone.push(sweep(outline(C_BASE), v3(0, 1, 0), CORNICE_P, { closed: true }));
  // mutules under the corona, over every triglyph on the portico and at the same pitch elsewhere
  const mutY = C_BASE + 0.18 - 0.05;
  const mutX = (x: number, z: number, sgn: number) => stone.push(bevelBox(0.42, 0.1, 0.72, x, mutY, z + sgn * 0.57, 0.02));
  const mutZ = (x: number, z: number, sgn: number) => stone.push(bevelBox(0.72, 0.1, 0.42, x + sgn * 0.57, mutY, z, 0.02));

  // --- Portico -------------------------------------------------------------------------------------
  // platform and floor (the floor as a grid so the baked shade has vertices to live on)
  plinth.push(bevelBox(px1 - px0, PLINTH + 1 - 0.01, PORTICO_DEPTH, PORTICO_MID, (PLINTH - 1 - 0.01) / 2, pz / 2, 0.04));
  plinth.push(grid(v3(px0, PLINTH, pz), v3(px1 - px0, 0, 0), v3(0, 0, PORTICO_DEPTH), 0.6, v3(0, 1, 0), [px0, pz]));
  // steps between two cheek blocks: five bevelled risers down to the square
  const steps = 5, tread = 0.4, riser = PLINTH / steps, cheek = 1.5;
  const stepsW = px1 - px0 - 2 * cheek;
  for (let i = 0; i < steps; i++) {
    const topY = riser * (i + 1), depth = tread * (steps - i);
    plinth.push(bevelBox(stepsW, topY + 1, depth, PORTICO_MID, topY / 2 - 0.5, pz - depth / 2, 0.035));
  }
  for (const x of [px0 + cheek / 2, px1 - cheek / 2]) plinth.push(bevelBox(cheek, PLINTH + 1.12, tread * steps + 0.02, x, (PLINTH + 0.12) / 2 - 0.5, pz - (tread * steps) / 2, 0.05));
  // columns
  for (const x of colX) stone.push(...column(x, COL_Z, PLINTH));
  // antae (square pilasters) against the wall behind the end columns, with base and capital mouldings
  for (const x of [colX[0], colX[5]]) {
    const aw = 1.3, ad = 0.45;
    stone.push(bevelBox(aw, COL_H, ad, x, PLINTH + COL_H / 2, -ad / 2, 0.03));
    const u = (y: number) => [v3(x - aw / 2, y, 0), v3(x - aw / 2, y, -ad), v3(x + aw / 2, y, -ad), v3(x + aw / 2, y, 0)];
    stone.push(sweep(u(PLINTH + 0.32), v3(0, 1, 0), [[0.14, 0], [0.14, 0.05], [0.16, 0.1], [0.15, 0.2], [0.1, 0.26], [0.04, 0.3], [0, 0.34]].map(([s, h]) => [s, h] as P2)));
    stone.push(bevelBox(aw + 0.36, 0.32, ad + 0.18, x, PLINTH + 0.16, -(ad + 0.18) / 2, 0.03));
    stone.push(sweep(u(E_BASE - 0.62), v3(0, 1, 0), [[0, 0], [0.03, 0.04], [0.03, 0.2], [0.06, 0.23], [0.06, 0.28], [0.12, 0.3], [0.17, 0.36], [0.17, 0.62], [0, 0.62]]));
  }
  // beams: the architrave over the columns (front and returns), and one from each inner column to the wall
  const beamD = 1.4, sideW = colX[0] + 0.72 - px0;
  stone.push(bevelBox(px1 - px0, ARCHITRAVE, beamD, PORTICO_MID, E_BASE + ARCHITRAVE / 2, zF + beamD / 2, 0.03));
  for (const [x0, x1] of [[px0, px0 + sideW], [px1 - sideW, px1]]) stone.push(bevelBox(x1 - x0, ARCHITRAVE, -zF - beamD, (x0 + x1) / 2, E_BASE + ARCHITRAVE / 2, (zF + beamD) / 2, 0.03));
  for (const x of colX.slice(1, -1)) stone.push(bevelBox(1.2, ARCHITRAVE - 0.1, -zF - beamD, x, E_BASE + 0.1 + (ARCHITRAVE - 0.1) / 2, (zF + beamD) / 2, 0.03));
  // ceiling, and a cove round each bay between the beams
  stone.push(grid(v3(px0, F_BASE, zF), v3(px1 - px0, 0, 0), v3(0, 0, -zF), 0.6, v3(0, -1, 0), [px0, zF]));
  const bayEdges = [px0 + sideW, ...colX.slice(1, -1).flatMap(x => [x - 0.6, x + 0.6]), px1 - sideW];
  for (let k = 0; k < bayEdges.length; k += 2) {
    const x0 = bayEdges[k], x1 = bayEdges[k + 1], z0 = zF + beamD, z1 = 0;
    stone.push(sweep([v3(x0, F_BASE, z0), v3(x1, F_BASE, z0), v3(x1, F_BASE, z1), v3(x0, F_BASE, z1)], v3(0, -1, 0), COVE_P, { closed: true }));
  }
  // frieze faces of the portico (front and returns)
  stone.push(grid(v3(px0, F_BASE - 0.05, zF), v3(px1 - px0, 0, 0), v3(0, FRIEZE + 0.07, 0), 100, v3(0, 0, -1), [px0, F_BASE]));
  stone.push(grid(v3(px0, F_BASE - 0.05, 0), v3(0, 0, zF), v3(0, FRIEZE + 0.07, 0), 100, v3(-1, 0, 0), [0, F_BASE]));
  stone.push(grid(v3(px1, F_BASE - 0.05, zF), v3(0, 0, -zF), v3(0, FRIEZE + 0.07, 0), 100, v3(1, 0, 0), [0, F_BASE]));

  // triglyphs: over each column and at thirds of each bay (quarters of the wide middle one); regulae and
  // guttae under them on the architrave's taenia
  const tgX: number[] = [];
  colX.forEach((x, i) => { tgX.push(x); if (i < colX.length - 1) { const n = COL_SPACING[i] > 5.5 ? 4 : 3; for (let k = 1; k < n; k++) tgX.push(x + (COL_SPACING[i] * k) / n); } });
  const tgZ = [COL_Z, COL_Z + 1.62, COL_Z + 3.24];
  const triglyph = (along: 'x' | 'z', a: number, face: number, sgn: number) => {
    // `a` is the position along the face, `face` the face plane, sgn the outward direction
    const put = (w: number, h: number, d: number, da: number, y: number, out: number, bev: number) =>
      stone.push(along === 'x' ? bevelBox(w, h, d, a + da, y, face + sgn * out, bev) : bevelBox(d, h, w, face + sgn * out, y, a + da, bev));
    const tw = 0.56, th = FRIEZE - 0.12, y0 = F_BASE;
    put(tw, th, 0.06, 0, y0 + th / 2, 0.03, 0.01);
    for (const da of [-0.19, 0, 0.19]) put(0.125, th - 0.06, 0.1, da, y0 + (th - 0.06) / 2, 0.06, 0.035); // the glyphs, V-grooves between
    put(tw + 0.06, 0.12, 0.12, 0, y0 + FRIEZE - 0.06, 0.06, 0.02);                                      // capital band
    put(tw, 0.05, 0.05, 0, F_BASE - 0.155, 0.125, 0.01);                                               // regula
    for (let g = 0; g < 6; g++) {
      const gx = -tw / 2 + 0.05 + (g * (tw - 0.1)) / 5;
      const gut = new THREE.CylinderGeometry(0.018, 0.028, 0.06, 6).translate(0, F_BASE - 0.18 - 0.03, 0);
      gut.translate(along === 'x' ? a + gx : face + sgn * 0.125, 0, along === 'x' ? face + sgn * 0.125 : a + gx);
      stone.push(gut);
    }
  };
  for (const x of tgX) { triglyph('x', x, zF, -1); mutX(x, zF, -1); }
  for (const z of tgZ) { triglyph('z', z, px0, -1); triglyph('z', z, px1, 1); mutZ(px0, z, -1); mutZ(px1, z, 1); }
  // mutules on the rest of the block, at the triglyph pitch
  const pitch = 1.62;
  for (let x = 0.7; x < px0 - 0.4; x += pitch) { mutX(x, 0, -1); mutX(W - x, 0, -1); }
  for (let x = 0.7; x < W - 0.4; x += pitch) mutX(x, D, 1);
  for (let z = 0.7; z < D - 0.4; z += pitch) { mutZ(0, z, -1); mutZ(W, z, 1); }

  // --- Pediment: recessed tympanum, raking cornices meeting the horizontal cornice at the corners ------
  const xl = px0 - C_PROJ, xr = px1 + C_PROJ, tanP = Math.tan(PEDIMENT_PITCH), cosP = Math.cos(PEDIMENT_PITCH);
  const yUnder = CORNICE_TOP - C_H / cosP;                    // underside of the raking cornice at the corners
  const apexU = yUnder + (PORTICO_MID - xl) * tanP;           // ... and at the apex
  const rakeP: P2[] = CORNICE_P.map(([p, h]) => [h, p] as P2).reverse();
  stone.push(sweep([v3(xr, yUnder, zF), v3(PORTICO_MID, apexU, zF), v3(xl, yUnder, zF)], v3(0, 0, -1), rakeP, { startCut: v3(0, 1, 0), endCut: v3(0, 1, 0) }));
  const tx = (CORNICE_TOP - yUnder) / tanP;                   // where the rake's underside meets the cornice top
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([xl + tx, CORNICE_TOP - 0.02, zF, PORTICO_MID, apexU + 0.05, zF, xr - tx, CORNICE_TOP - 0.02, zF], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, -1, 0, 0, -1, 0, 0, -1], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([xl + tx, CORNICE_TOP, PORTICO_MID, apexU, xr - tx, CORNICE_TOP], 2));
    stone.push(g);
  }
  // mutules under the raking corona, square to the slope
  for (const sgn of [-1, 1]) {
    const L = (PORTICO_MID - xl) / cosP;
    for (let d = 1.2; d < L - 0.6; d += pitch) {
      const x = PORTICO_MID + sgn * (L - d) * cosP, y = apexU - (L - d) * Math.sin(PEDIMENT_PITCH);
      const m = bevelBox(0.42, 0.1, 0.72, 0, 0, 0, 0.02);
      m.translate(0, -0.05 + 0.18, 0).rotateZ(-sgn * PEDIMENT_PITCH);
      m.translate(x, y, zF - 0.57);
      stone.push(m);
    }
  }
  // gabled portico roof on the raking cornices, running back into the main roof
  const topAt = (x: number) => yUnder + C_H / cosP + (x - xl) * tanP;
  const ridgeY = topAt(PORTICO_MID), gz0 = zF - C_PROJ, gz1 = 12;
  roof.push(trianglesToGeometry([
    [v3(xl, topAt(xl), gz0), v3(PORTICO_MID, ridgeY, gz0), v3(PORTICO_MID, ridgeY, gz1)],
    [v3(xl, topAt(xl), gz0), v3(PORTICO_MID, ridgeY, gz1), v3(xl, topAt(xl), gz1)],
    [v3(xr, topAt(xl), gz0), v3(PORTICO_MID, ridgeY, gz1), v3(PORTICO_MID, ridgeY, gz0)],
    [v3(xr, topAt(xl), gz0), v3(xr, topAt(xl), gz1), v3(PORTICO_MID, ridgeY, gz1)],
  ]));
  // Hipped main roof in clay tile
  roof.push(hipRoof(-0.6, W + 0.6, -0.6, D + 0.6, CORNICE_TOP, ROOF_PITCH));

  // --- Openings ------------------------------------------------------------
  // North façade behind the portico: 5 bays between the columns; 3 doors below (centre widest)
  const nS: THREE.BufferGeometry[] = [], nG: THREE.BufferGeometry[] = [], nW: THREE.BufferGeometry[] = [];
  const bays = colX.slice(0, -1).map((x, i) => (x + colX[i + 1]) / 2);
  bays.forEach((x, i) => {
    openingParts(x, GF_TOP + 0.8, 1.35, 2.6, 'upper', nS, nG, nW);
    if (i === 2) openingParts(x, PLINTH, 1.9, 3.4, 'door', nS, nG, nW);
    else if (i === 1 || i === 3) openingParts(x, PLINTH, 1.5, 3.2, 'door', nS, nG, nW);
    else openingParts(x, PLINTH + 1.3, 1.25, 2.1, 'lower', nS, nG, nW);
  });
  nS.forEach(g => stone.push(onWall(g, 'n'))); nG.forEach(g => glass.push(onWall(g, 'n'))); nW.forEach(g => wood.push(onWall(g, 'n')));

  // Side façades (Gucevičius side elevation): 6 bays, drive-through gateways in bays 2 and 5
  for (const side of ['e', 'w'] as const) {
    const s: THREE.BufferGeometry[] = [], gl: THREE.BufferGeometry[] = [], wd: THREE.BufferGeometry[] = [];
    const bay = D / 6;
    for (let i = 0; i < 6; i++) {
      // Walls run from the façade's left end; on the west wall, bay 1 is at the south end.
      const idx = side === 'e' ? i : 5 - i;
      const x = bay * (i + 0.5);
      openingParts(x, GF_TOP + 0.9, 1.3, 2.5, 'upper', s, gl, wd);
      if (idx === 1 || idx === 4) openingParts(x, -0.4, 3.0, 4.5, 'gate', s, gl, wd, -0.16);
      else openingParts(x, PLINTH + 1.1, 1.25, 2.2, 'lower', s, gl, wd);
    }
    s.forEach(g => stone.push(onWall(g, side))); gl.forEach(g => glass.push(onWall(g, side))); wd.forEach(g => wood.push(onWall(g, side)));
  }

  // South façade (no period elevation found): 7 regular bays, a central door
  {
    const s: THREE.BufferGeometry[] = [], gl: THREE.BufferGeometry[] = [], wd: THREE.BufferGeometry[] = [];
    const bay = W / 7;
    for (let i = 0; i < 7; i++) {
      const x = bay * (i + 0.5);
      openingParts(x, GF_TOP + 0.9, 1.3, 2.5, 'upper', s, gl, wd);
      if (i === 3) openingParts(x, -0.4, 1.8, 3.8, 'door', s, gl, wd, -0.16);
      else openingParts(x, PLINTH + 1.1, 1.25, 2.2, 'lower', s, gl, wd);
    }
    s.forEach(g => stone.push(onWall(g, 's'))); gl.forEach(g => glass.push(onWall(g, 's'))); wd.forEach(g => wood.push(onWall(g, 's')));
  }

  // --- Baked shade inside the portico ----------------------------------------------------------------
  const occ: Occluder[] = [
    { box: [0.03, -5, 0.03, W - 0.03, CORNICE_TOP, D - 0.03] },
    { box: [px0 + 0.03, F_BASE + 0.02, zF + 0.03, px1 - 0.03, 18, 0.03] },
    { box: [px0 + 0.03, E_BASE + 0.03, zF + 0.03, px1 - 0.03, F_BASE - 0.01, zF + beamD - 0.03] },
    { box: [px0 + 0.03, E_BASE + 0.03, zF + 0.03, px0 + sideW - 0.03, F_BASE - 0.01, -0.03] },
    { box: [px1 - sideW + 0.03, E_BASE + 0.03, zF + 0.03, px1 - 0.03, F_BASE - 0.01, -0.03] },
    ...colX.slice(1, -1).map(x => ({ box: [x - 0.57, E_BASE + 0.13, zF + beamD, x + 0.57, F_BASE - 0.01, -0.03] as [number, number, number, number, number, number] })),
    ...colX.map(x => ({ cyl: [x, COL_Z, 0.6, PLINTH, E_BASE] as [number, number, number, number, number] })),
    ...[colX[0], colX[5]].map(x => ({ box: [x - 0.62, PLINTH, -0.42, x + 0.62, E_BASE, 0] as [number, number, number, number, number, number] })),
    { box: [px0 - 0.1, -10, pz - 2.2, px1 + 0.1, PLINTH - 0.01, 0], ground: true },
    { box: [-60, -10, -80, 100, -0.25, 80], ground: true },
  ];
  const region = new THREE.Box3(v3(px0 - 0.6, 0.4, zF - 0.5), v3(px1 + 0.6, F_BASE + 0.05, 0.3));
  const bake = (parts: THREE.BufferGeometry[]) => {
    const box = new THREE.Box3();
    for (const g of parts) {
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      box.setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);
      if (box.intersectsBox(region)) bakeOcclusion(g, occ, region);
    }
  };
  for (const parts of [wall, stone, plinth, wood, glass]) bake(parts);

  const group = new THREE.Group();
  group.name = 'townhall';
  const add = (parts: THREE.BufferGeometry[], mat: THREE.Material, shadows = true) => {
    if (!parts.length) return;
    const mesh = new THREE.Mesh(mergeParts(parts), mat);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  for (const m of [mats.wall, mats.stone, mats.plinth, mats.wood, mats.glass]) occlusion(m);
  add(wall, mats.wall);
  add(stone, mats.stone);
  add(plinth, mats.plinth);
  add(roof, mats.roof);
  add(glass, mats.glass, false);
  add(wood, mats.wood);

  placeOnFootprint(group, b);
  return group;
}

/** The Town Hall's local frame in world space: +X along the north façade, +Z into the building. */
export interface TownHallFrame { origin: THREE.Vector3; dirX: THREE.Vector3; dirZ: THREE.Vector3; theta: number }

/**
 * Orients the local frame on the GRPK footprint: +X along the north façade, origin at the
 * main block's north-west corner. Uses the footprint's longest northward-facing wall.
 */
export function townHallFrame(b: Building): TownHallFrame {
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
  const origin = new THREE.Vector3(nw[0], b.groundY, nw[1]).addScaledVector(dirX, along).addScaledVector(dirZ, across);
  return { origin, dirX, dirZ, theta };
}

function placeOnFootprint(group: THREE.Group, b: Building): void {
  const f = townHallFrame(b);
  group.position.copy(f.origin);
  group.rotation.y = f.theta;
}

/** Town Hall model dimensions, for things placed against it. */
export const TOWN_HALL_SIZE = { W, D, PORTICO_X0, PORTICO_X1, PORTICO_DEPTH };
