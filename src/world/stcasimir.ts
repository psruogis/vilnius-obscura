import * as THREE from 'three';
import type { Building, XZ } from './area';
import { mbox, merged, trianglesToGeometry } from './geom';
import { bevelBox, sweep, lathe, type P2 } from './classical';

/*
 * St Casimir's Church. West front after the c.1900 photographs (the owner's reference), or with
 * variant '1800' the pre-1864 form; the body is simplified ("landmark-lite").
 * Sources (docs/REFERENCES.md §5): KVR 27304; OSM outline (way 29503660); national LiDAR
 * (eaves ~18 m, top ~56 m); the 1836 Januszewicz view and 1840 survey drawing for the
 * pre-1864 form: taller square west towers with clock stages and domed caps, a crown on
 * the dome lantern. Proportions of towers, drum and crown are conjecture (grade C).
 *
 * Mouldings are drawn, not boxed (classical.ts): the storey entablatures are swept cornice profiles
 * that wrap round the towers, the openings have arched architraves with keystones and sills, the
 * porch stands on turned Tuscan columns, balusters and urns are turned, and plain blocks have
 * softened arrises.
 *
 * Local frame: origin at the middle of the west façade, +X east along the nave, +Z south.
 */

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const Y = new THREE.Vector3(0, 1, 0);

/** A cornice section from the frieze face p0 out to p1, h high: bed ovolo, soffit, corona, cyma recta. */
function corniceP(p0: number, p1: number, h: number): P2[] {
  const q: P2[] = [[0, 0], [0.12, 0], [0.12, 0.07], [0.19, 0.1], [0.26, 0.17], [0.3, 0.25], [0.32, 0.32], [0.8, 0.33], [0.8, 0.37],
    [0.85, 0.4], [0.85, 0.7], [0.89, 0.73], [0.89, 0.77], [0.93, 0.8], [0.97, 0.86], [0.99, 0.93], [1.0, 1.0], [0, 1.0]];
  return q.map(([a, b]) => [p0 + a * (p1 - p0), b * h] as P2);
}
// An architrave round an opening: width out from the opening, projection from the wall; reveal last
const ARCH_P: P2[] = [[0.3, 0], [0.3, 0.05], [0.27, 0.08], [0.23, 0.08], [0.21, 0.12], [0.05, 0.13], [0.02, 0.15], [0, 0.15], [0, 0]];

/**
 * An arched (or square-headed) architrave on a wall with outward normal n; c is the middle of the
 * opening's sill line. Keystone at the crown, sill below.
 */
function framed(out: THREE.BufferGeometry[], c: THREE.Vector3, n: THREE.Vector3, w: number, h: number, arched = true, k = 1): void {
  const right = new THREE.Vector3().crossVectors(Y, n).normalize();
  const P = (a: number, y: number) => c.clone().addScaledVector(right, a).addScaledVector(Y, y);
  const prof = ARCH_P.map(([a, b]) => [a * k, b * k] as P2);
  const r = w / 2;
  if (arched) {
    const pts = [P(-r, 0)];
    for (let i = 0; i <= 18; i++) { const a = Math.PI - (i / 18) * Math.PI; pts.push(P(Math.cos(a) * r, h - r + Math.sin(a) * r)); }
    pts.push(P(r, 0));
    out.push(sweep(pts, n, prof));
  } else {
    out.push(sweep([P(r, 0), P(-r, 0), P(-r, h), P(r, h)], n, prof, { closed: true }));
  }
  // keystone and sill, as small blocks square to the wall
  const block = (bw: number, bh: number, bd: number, a: number, y: number, o: number) => {
    const g = bevelBox(bw, bh, bd, 0, 0, 0, 0.025);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(right, Y, n));
    out.push(g.translate(...P(a, y).addScaledVector(n, o).toArray()));
  };
  if (arched) block(0.34 * k, 0.55 * k, 0.24 * k, 0, h + 0.12 * k, 0.12 * k);
  block(w + 0.75 * k, 0.14, 0.28, 0, -0.07, 0.14);
}

// Turned work: a baluster (on its rail, 0.75 m) and an urn finial (1.08 m), (r, y) walked upwards
const BALUSTER: P2[] = [[0.11, 0], [0.11, 0.05], [0.08, 0.08], [0.07, 0.12], [0.12, 0.25], [0.13, 0.32], [0.1, 0.42], [0.06, 0.55],
  [0.05, 0.6], [0.09, 0.64], [0.09, 0.68], [0.11, 0.7], [0.11, 0.75], [0, 0.75]];
const URN: P2[] = [[0.22, 0], [0.22, 0.08], [0.16, 0.12], [0.1, 0.16], [0.08, 0.22], [0.14, 0.28], [0.3, 0.42], [0.34, 0.55], [0.3, 0.68],
  [0.2, 0.76], [0.16, 0.8], [0.2, 0.84], [0.12, 0.9], [0.06, 0.98], [0.04, 1.05], [0, 1.08]];

// Pilaster capital (0.5 m: fillet, astragal, necking, ovolo, abacus) and base (torus, scotia, torus)
const PIL_CAP: P2[] = [[0, 0], [0.03, 0.03], [0.03, 0.09], [0.02, 0.1], [0.02, 0.24], [0.05, 0.26], [0.09, 0.3], [0.12, 0.35], [0.12, 0.38], [0.14, 0.39], [0.14, 0.5], [0, 0.5]];
const PIL_BASE: P2[] = [[0.1, 0], [0.12, 0.03], [0.12, 0.07], [0.09, 0.1], [0.06, 0.1], [0.05, 0.14], [0.07, 0.17], [0.06, 0.2], [0.02, 0.22], [0, 0.26]];

/** A Tuscan column shaft (base torus to echinus), h high, lower radius r, 1/7 diminution, entasis. */
function tuscan(r: number, h: number): THREE.BufferGeometry {
  const p: P2[] = [[r * 1.3, 0], [r * 1.3, 0.04]];
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI; p.push([r * 1.14 + Math.cos(a) * r * 0.18, 0.2 + Math.sin(a) * r * 0.18 + 0.04]); } // torus
  p.push([r * 1.06, 0.34], [r, 0.4]);
  const top = h - 0.55;
  for (let i = 0; i <= 10; i++) { const t = i / 10; p.push([t < 1 / 3 ? r : r * (1 - (1 / 7) * Math.sin(((t - 1 / 3) / (2 / 3)) * Math.PI / 2)), 0.4 + (top - 0.4) * t]); }
  const rt = r * 6 / 7;
  p.push([rt + 0.04, top + 0.02], [rt + 0.04, top + 0.08], [rt, top + 0.1], [rt, top + 0.3], [rt + 0.03, top + 0.32]);   // astragal, necking
  for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + (i / 5) * Math.PI / 2; p.push([rt + 0.03 + Math.cos(a) * 0.2, top + 0.52 + Math.sin(a) * 0.2]); } // echinus
  p.push([rt + 0.23, h], [0, h]);
  return lathe(p, 24, { hard: 35 });
}

/** A swept moulding (frieze band or cornice) along the west front and back along the tower sides. */
const frontRun = (y: number, half: number, ret: number) => [v3(ret, y, half), v3(0, y, half), v3(0, y, -half), v3(ret, y, -half)];

export interface ChurchMaterials {
  wall: THREE.Material;
  stone: THREE.Material;
  roof: THREE.Material;  // lead-grey sheet
  dome: THREE.Material;  // copper
  gilt: THREE.Material;  // crown and crosses
  dark: THREE.Material;  // window and door openings
}

/** Oriented bounding box of a ring: tries each edge direction, keeps the smallest area. */
function orientedBox(ring: XZ[]) {
  let best = { area: Infinity, ux: 1, uz: 0, min: [0, 0], max: [0, 0] };
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 2) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of ring) {
      const u = x * ux + z * uz, v = -x * uz + z * ux;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (area < best.area) best = { area, ux, uz, min: [u0, v0], max: [u1, v1] };
  }
  // Make u the long axis pointing east (+x).
  let { ux, uz } = best;
  let [u0, v0] = best.min, [u1, v1] = best.max;
  if (u1 - u0 < v1 - v0) {
    [ux, uz] = [-uz, ux];
    [u0, u1, v0, v1] = [v0, v1, -u1, -u0];
  }
  if (ux < 0) { ux = -ux; uz = -uz; [u0, u1] = [-u1, -u0]; [v0, v1] = [-v1, -v0]; }
  return { ux, uz, u0, u1, v0, v1 };
}

function gableRoof(x0: number, x1: number, halfW: number, y: number, rise: number, alongX: boolean): THREE.BufferGeometry {
  const p = (a: number, b: number, h: number) => (alongX ? new THREE.Vector3(a, h, b) : new THREE.Vector3(b, h, a));
  const r0 = p(x0, 0, y + rise), r1 = p(x1, 0, y + rise);
  return trianglesToGeometry([
    [p(x0, -halfW, y), r0, r1], [p(x0, -halfW, y), r1, p(x1, -halfW, y)],
    [p(x0, halfW, y), r1, r0], [p(x0, halfW, y), p(x1, halfW, y), r1],
  ]);
}

function gableEnd(x: number, halfW: number, y: number, rise: number, alongX: boolean): THREE.BufferGeometry {
  const shape = new THREE.Shape([new THREE.Vector2(-halfW, 0), new THREE.Vector2(halfW, 0), new THREE.Vector2(0, rise)]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false });
  g.translate(0, y, -0.25);
  if (alongX) g.rotateY(Math.PI / 2);
  g.translate(alongX ? x : 0, 0, alongX ? 0 : x);
  return g;
}

function arched(x: number, z: number, y: number, w: number, h: number, facing: 'x' | 'z'): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(w / 2, h - w / 2);
  shape.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
  shape.lineTo(-w / 2, 0);
  const g = new THREE.ShapeGeometry(shape, 8);
  if (facing === 'x') g.rotateY(-Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

export function buildStCasimir(b: Building, mats: ChurchMaterials, variant: 'photos' | '1800' = 'photos'): THREE.Group {
  const old = variant === '1800';
  const box = orientedBox(b.rings[0]);
  const L = box.u1 - box.u0, Wd = box.v1 - box.v0;
  const eave = b.eave;                         // LiDAR, ~18 m
  const nave = { x0: 7, x1: L - 11, half: Math.min(13, Wd / 2 - 3.5) };
  const xc = L * 0.63;                         // crossing, from the widest part of the outline
  const tHalf = 9;                             // transept half-width along the nave
  const roofRise = 8.5;

  const wall: THREE.BufferGeometry[] = [], stone: THREE.BufferGeometry[] = [], roof: THREE.BufferGeometry[] = [];
  const dome: THREE.BufferGeometry[] = [], gilt: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [];

  // Nave with aisles, and the transept
  wall.push(bevelBox(nave.x1 - nave.x0, eave + 2, nave.half * 2, (nave.x0 + nave.x1) / 2, eave / 2 - 1, 0, 0.06));
  wall.push(bevelBox(tHalf * 2, eave + 2, Wd - 1, xc, eave / 2 - 1, 0, 0.06));
  // Apse (half cylinder) at the east end
  const apseR = Math.min(9, nave.half - 1);
  const apse = new THREE.CylinderGeometry(apseR, apseR, eave - 2 + 2, 20, 1, false, 0, Math.PI);
  apse.translate(nave.x1, (eave - 2) / 2 - 1, 0);
  wall.push(apse);
  const apseRoof = new THREE.SphereGeometry(apseR + 0.3, 20, 8, 0, Math.PI, 0, Math.PI / 2);
  apseRoof.scale(1, 0.55, 1);
  apseRoof.translate(nave.x1, eave - 2, 0);
  roof.push(apseRoof);
  // Main cornice along the nave sides and round the transept
  const ce = eave - 0.7, zE = (Wd - 1) / 2;
  stone.push(sweep([v3(nave.x0, ce, -nave.half), v3(nave.x1, ce, -nave.half)], Y, corniceP(0, 0.7, 0.7)));
  stone.push(sweep([v3(nave.x1, ce, nave.half), v3(nave.x0, ce, nave.half)], Y, corniceP(0, 0.7, 0.7)));
  stone.push(sweep([v3(xc - tHalf, ce, -zE), v3(xc + tHalf, ce, -zE), v3(xc + tHalf, ce, zE), v3(xc - tHalf, ce, zE)], Y, corniceP(0, 0.7, 0.7), { closed: true }));

  // Gabled roofs (lead-grey sheet), gable ends
  roof.push(gableRoof(nave.x0, nave.x1, nave.half + 0.5, eave, roofRise, true));
  roof.push(gableRoof(-(Wd / 2 - 0.2), Wd / 2 - 0.2, tHalf + 0.5, eave, roofRise, false).translate(xc, 0, 0));
  for (const zEnd of [-(Wd / 2 - 0.5), Wd / 2 - 0.5]) {
    const g = gableEnd(0, tHalf, eave, roofRise, false);
    g.translate(xc, 0, zEnd);
    wall.push(g);
  }

  // --- West front, after the c.1900 photographs (Edition D. Visun No. 49C; stereo card 1822) ---------
  // The storeys, pilaster order, windows and niches are the 18th-century façade; the onion helms, the
  // central turret and the domed porch date from the 1864-68 rebuild (variant '1800' leaves them out).
  const W = Wd, towerW = 7.2, towerZ = W / 2 - towerW / 2;
  const T1 = 18.6, T2 = 29.6, T3 = 34.5;          // storey tops (photo 1 scaled to the 30 m façade)
  const inner = towerZ - towerW / 2;               // tower inner edge
  const fb = (list: THREE.BufferGeometry[], z: number, y0: number, y1: number, w: number, d: number, x = 0) =>
    list.push(bevelBox(d, y1 - y0, w, x - d / 2, (y0 + y1) / 2, z, Math.min(0.04, d * 0.2, (y1 - y0) * 0.2)));
  const west = v3(-1, 0, 0);
  // bodies: towers and the central section (tall enough to meet the nave roof)
  for (const sgn of [-1, 1]) wall.push(bevelBox(towerW, T3 + 1, towerW, towerW / 2, T3 / 2 - 0.5, sgn * towerZ, 0.06));
  wall.push(bevelBox(8, T2 + 1, inner * 2, 4, T2 / 2 - 0.5, 0, 0.06));
  // plinth, and the storey entablatures (frieze band and cornice) round the front and the towers
  fb(stone, 0, -1, 1.3, W + 0.6, 0.35);
  stone.push(sweep(frontRun(1.3, W / 2 + 0.3, towerW), Y, [[0.35, 0], [0.35, 0.04], [0.31, 0.08], [0.27, 0.1], [0.25, 0.16], [0, 0.18]]));        // plinth moulding
  stone.push(sweep(frontRun(T1 - 1.4, W / 2, towerW), Y, [[0, 0], [0.45, 0], [0.45, 0.8], [0, 0.8]], { hard: 30 }));
  stone.push(sweep(frontRun(T1 - 0.6, W / 2, towerW), Y, corniceP(0.45, 1.05, 0.62)));
  stone.push(sweep(frontRun(T2 - 1.1, W / 2, towerW), Y, [[0, 0], [0.4, 0], [0.4, 0.6], [0, 0.6]], { hard: 30 }));
  stone.push(sweep(frontRun(T2 - 0.5, W / 2, towerW), Y, corniceP(0.4, 0.9, 0.52)));
  // paired pilasters with capitals, both storeys, at the tower edges and either side of the centre bay
  const pil = [-W / 2 + 0.6, -inner - 0.6, -inner + 0.6, -3.3, 3.3, inner - 0.6, inner + 0.6, W / 2 - 0.6];
  for (const z of pil) {
    for (const [y0, y1] of [[1.3, T1 - 1.4], [T1, T2 - 1.1]]) {
      fb(stone, z, y0, y1, 0.85, 0.32);
      // moulded capital and base, run round the three faces of the pilaster
      const u = (y: number) => [v3(0, y, z + 0.425), v3(-0.32, y, z + 0.425), v3(-0.32, y, z - 0.425), v3(0, y, z - 0.425)];
      stone.push(sweep(u(y1 - 0.5), Y, PIL_CAP));
      fb(stone, z, y0, y0 + 0.22, 1.1, 0.46);                              // plinth
      stone.push(sweep(u(y0 + 0.22), Y, PIL_BASE));
    }
  }
  // lower storey: a round-headed window on each tower with a cartouche above; windows by the portal
  for (const sgn of [-1, 1]) {
    const z = sgn * towerZ;
    dark.push(arched(-0.012, z, 6.2, 2.0, 4.2, 'x'));
    framed(stone, v3(0, 6.2, z), west, 2.0, 4.2);
    stone.push(new THREE.SphereGeometry(0.75, 20, 12).scale(0.35, 1.25, 1).translate(-0.3, 13.8, z));   // cartouche
    stone.push(lathe([[0.95, 0], [0.95, 0.06], [0.88, 0.1], [0.8, 0.1], [0.8, 0.16], [0, 0.18]], 32).rotateZ(Math.PI / 2).scale(1, 1.3, 1).translate(-0.02, 13.8, z)); // its frame
    fb(stone, z, 11.4, 11.7, 3.0, 0.25);                     // sill band
    dark.push(new THREE.PlaneGeometry(1.8, 3.2).rotateY(-Math.PI / 2).translate(-0.012, 12.2, sgn * 4.6));
    framed(stone, v3(0, 10.6, sgn * 4.6), west, 1.8, 3.2, false, 0.8);
  }
  dark.push(arched(-0.012, 0, 0, 3.2, 7.0, 'x'));            // main portal
  framed(stone, v3(0, 0, 0), west, 3.2, 7.0, true, 1.3);
  // upper storey: tower windows and three niches with statues
  for (const [z, w, isNiche] of [[-towerZ, 2.1, false], [-5.4, 2.0, true], [0, 2.5, true], [5.4, 2.0, true], [towerZ, 2.1, false]] as [number, number, boolean][]) {
    const h = z === 0 ? 7.0 : 6.2, y0 = T1 + 1.6;
    if (isNiche) {
      dark.push(arched(-0.012, z, y0 + 0.15, w, h, 'x'));
      framed(stone, v3(0, y0 + 0.15, z), west, w, h, true, 1.1);
      // statue on a pedestal, standing in the niche
      const sx = -0.5, base = y0 + 0.2, sh = z === 0 ? 3.0 : 2.5;
      stone.push(bevelBox(0.8, 0.6, 1.0, sx, base + 0.3, z, 0.04));
      stone.push(lathe([[0.5, 0], [0.47, sh * 0.25], [0.4, sh * 0.5], [0.3, sh * 0.66], [0.2, sh * 0.72], [0.16, sh * 0.74], [0.24, sh * 0.8], [0.22, sh * 0.88], [0.12, sh * 0.93], [0, sh * 0.95]], 16).translate(sx, base + 0.6, z));
    } else {
      dark.push(arched(-0.012, z, y0, w, h, 'x'));
      framed(stone, v3(0, y0, z), west, w, h);
    }
  }
  // balustrade with urns over the centre, between towers and turret
  for (const sgn of [-1, 1]) {
    const za = sgn * 3.6, zb = sgn * (inner - 0.2);
    fb(stone, (za + zb) / 2, T2, T2 + 0.25, Math.abs(zb - za), 0.6, -0.1);
    fb(stone, (za + zb) / 2, T2 + 1.0, T2 + 1.2, Math.abs(zb - za), 0.6, -0.1);
    for (let z = Math.min(za, zb) + 0.3; z < Math.max(za, zb) - 0.2; z += 0.45) stone.push(lathe(BALUSTER, 10).translate(-0.4, T2 + 0.25, z));
  }
  // tower top stages, helms, lanterns, crosses
  const onion = (r: number, h: number) => new THREE.LatheGeometry([
    [0, 0], [r * 0.86, 0], [r * 0.97, h * 0.12], [r, h * 0.28], [r * 0.92, h * 0.45], [r * 0.68, h * 0.62], [r * 0.4, h * 0.77],
    [r * 0.18, h * 0.9], [r * 0.08, h], [0, h * 1.02],
  ].map(([a, b]) => new THREE.Vector2(a, b)), 28);
  const baroqueCap = (r: number, h: number) => new THREE.LatheGeometry([
    [0, 0], [r, 0], [r * 1.02, h * 0.1], [r * 0.9, h * 0.32], [r * 0.62, h * 0.5], [r * 0.46, h * 0.6], [r * 0.5, h * 0.72],
    [r * 0.38, h * 0.86], [r * 0.2, h * 0.95], [0, h],
  ].map(([a, b]) => new THREE.Vector2(a, b)), 28);
  const cross = (x: number, y: number, z: number, hgt: number) => {
    gilt.push(mbox(0.16, hgt, 0.16, x, y + hgt / 2, z));
    gilt.push(mbox(0.14, 0.14, hgt * 0.45, x, y + hgt * 0.68, z));
    if (!old) {
      // Orthodox three-bar cross: titulus above, slanted foot bar below
      gilt.push(mbox(0.12, 0.12, hgt * 0.24, x, y + hgt * 0.86, z));
      gilt.push(mbox(0.12, 0.12, hgt * 0.3, 0, 0, 0).rotateX(0.38).translate(x, y + hgt * 0.3, z));
    }
  };
  for (const sgn of [-1, 1]) {
    const z = sgn * towerZ, cx = towerW / 2, sw = towerW - 1.2;
    wall.push(bevelBox(sw, T3 - T2 + 0.4, sw, cx, (T2 + T3) / 2, z, 0.05));
    for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) stone.push(bevelBox(0.7, T3 - T2, 0.7, cx + (dx * sw) / 2, (T2 + T3) / 2, z + (dz * sw) / 2, 0.04));
    {
      const hw = sw / 2 + 0.35, sq = (y: number) => [v3(cx - hw, y, z - hw), v3(cx + hw, y, z - hw), v3(cx + hw, y, z + hw), v3(cx - hw, y, z + hw)];
      stone.push(sweep(sq(T3 - 0.3), Y, corniceP(0, 0.5, 0.7), { closed: true }));
    }
    for (const k of [0, 1, 2, 3]) {
      const a = (k * Math.PI) / 2, g = arched(0, 0, 0, 1.4, 3.2, 'x');
      g.rotateY(-a);
      g.translate(cx - Math.cos(a) * (sw / 2 + 0.02), T2 + 0.9, z + Math.sin(a) * (sw / 2 + 0.02));
      dark.push(g);
    }
    // urn finials on the corners of the storey below
    for (const dz of [-1, 1]) stone.push(lathe(URN, 16).translate(-0.3, T2, z + dz * (towerW / 2 - 0.4)));
    const drumTop = T3 + 1.2;
    wall.push(new THREE.CylinderGeometry(2.7, 2.9, 1.2, 24).translate(cx, T3 + 0.95, z));
    if (old) {
      dome.push(baroqueCap(3.1, 5.0).translate(cx, drumTop, z));
      wall.push(new THREE.CylinderGeometry(0.75, 0.85, 1.8, 10).translate(cx, drumTop + 5.6, z));
      dome.push(baroqueCap(0.95, 1.6).translate(cx, drumTop + 6.5, z));
      cross(cx, drumTop + 8.0, z, 2.0);
    } else {
      dome.push(onion(3.0, 4.6).translate(cx, drumTop, z));
      wall.push(new THREE.CylinderGeometry(0.7, 0.75, 1.7, 10).translate(cx, drumTop + 4.4, z));
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; dark.push(mbox(0.05, 0.9, 0.3, cx + Math.cos(a) * 0.71, drumTop + 4.4, z + Math.sin(a) * 0.71).rotateY(0)); }
      dome.push(onion(0.95, 1.7).translate(cx, drumTop + 5.25, z));
      cross(cx, drumTop + 6.9, z, 2.4);
    }
  }
  if (!old) {
    // central turret: window stage flanked by scrolls, bell dome, lantern, onion, cross (1864-68)
    const tw = 5.8, td = 4.2, cx = td / 2;
    wall.push(bevelBox(td, T3 + 1 - T2, tw, cx, (T2 + T3 + 1) / 2, 0, 0.05));
    for (const dz of [-1, 1]) stone.push(bevelBox(0.5, T3 + 1 - T2, 0.6, -0.1, (T2 + T3 + 1) / 2, (dz * tw) / 2, 0.04));
    dark.push(arched(-0.02, 0, T2 + 1.0, 1.8, 3.8, 'x'));
    { const hx = td / 2 + 0.1, hz = tw / 2 + 0.3, y = T3 + 0.75;
      stone.push(sweep([v3(cx - hx - 0.15, y, -hz), v3(cx + hx, y, -hz), v3(cx + hx, y, hz), v3(cx - hx - 0.15, y, hz)], Y, corniceP(0, 0.45, 0.7), { closed: true })); }
    for (const dz of [-1, 1]) {
      // scroll: a quarter-round sweep from the balustrade up to the turret side
      const sh = new THREE.Shape();
      sh.moveTo(0, 0); sh.lineTo(2.4, 0); sh.quadraticCurveTo(0.6, 0.4, 0.3, 3.4); sh.lineTo(0, 3.4); sh.lineTo(0, 0);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.7, bevelEnabled: false, curveSegments: 10 });
      g.translate(0, 0, -0.35);
      g.rotateY(dz > 0 ? -Math.PI / 2 : Math.PI / 2);
      g.translate(-0.2, T2, (dz * tw) / 2);
      stone.push(g);
      stone.push(new THREE.CylinderGeometry(0.45, 0.45, 0.72, 14).rotateX(Math.PI / 2).rotateY(Math.PI / 2).translate(-0.2, T2 + 0.45, dz * (tw / 2 + 2.2)));
    }
    const dy = T3 + 1.45;
    wall.push(new THREE.CylinderGeometry(3.0, 3.2, 1.3, 8).translate(cx, dy + 0.65, 0));
    dome.push(baroqueCap(3.7, 5.6).translate(cx, dy + 1.3, 0));
    wall.push(new THREE.CylinderGeometry(0.85, 0.9, 1.9, 10).translate(cx, dy + 7.2, 0));
    dome.push(onion(1.1, 2.0).translate(cx, dy + 8.15, 0));
    cross(cx, dy + 10.0, 0, 2.6);

    // domed porch on columns before the portal (1864-68)
    const px = -5.2, pw = 8.2, ph = 9.8;
    for (const dz of [-1, 1]) for (const zz of [pw / 2 - 0.5, pw / 2 - 1.5]) {
      stone.push(tuscan(0.38, ph - 1.6 - 0.2).translate(px - 0.5, 0.6, dz * zz));
      stone.push(bevelBox(0.9, 0.6, 0.9, px - 0.5, 0.3, dz * zz, 0.04));                                     // plinth
      stone.push(bevelBox(0.9, 0.2, 0.9, px - 0.5, ph - 1.1, dz * zz, 0.03));                                // abacus
    }
    for (const dz of [-1, 1]) wall.push(bevelBox(5.0, ph, 1.2, px + 2.5, ph / 2, (dz * (pw - 1.2)) / 2, 0.04)); // side walls
    // entablature on three sides: architrave, frieze, cornice; the attic and dome above
    const ex0 = px - 0.95, ez = pw / 2 + 0.05;
    const run3 = (y: number, o: number) => [v3(0.2, y, ez + o), v3(ex0 - o, y, ez + o), v3(ex0 - o, y, -ez - o), v3(0.2, y, -ez - o)];
    stone.push(sweep(run3(ph - 1.0, 0), Y, [[0, 0], [0.04, 0], [0.04, 0.3], [0.08, 0.33], [0.08, 0.55], [0.12, 0.58], [0.12, 0.65], [0, 0.65]], { hard: 30 }));
    stone.push(sweep(run3(ph - 0.35, 0), Y, [[0, 0], [0.02, 0], [0.02, 0.62], [0, 0.62]], { hard: 30 }));
    stone.push(sweep(run3(ph + 0.27, 0), Y, corniceP(0.02, 0.62, 0.62)));
    wall.push(bevelBox(5.6, 1.7, pw - 0.6, px + 2.3, ph + 1.75, 0, 0.04));                            // attic
    { const ax0 = px + 2.3 - 2.8, ax1 = px + 2.3 + 2.8, az = (pw - 0.6) / 2;
      stone.push(sweep([v3(ax0, ph + 2.3, -az), v3(ax1, ph + 2.3, -az), v3(ax1, ph + 2.3, az), v3(ax0, ph + 2.3, az)], Y, corniceP(0, 0.25, 0.3), { closed: true })); }
    const pd = new THREE.SphereGeometry(3.3, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.05, 1).translate(px + 2.3, ph + 2.6, 0);
    dome.push(pd);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const rib = new THREE.TorusGeometry(3.32, 0.06, 4, 12, Math.PI / 2).rotateZ(0).rotateY(-a);
      rib.translate(px + 2.3, ph + 2.6, 0);
      stone.push(rib);
    }
    wall.push(new THREE.CylinderGeometry(0.6, 0.65, 1.4, 10).translate(px + 2.3, ph + 6.5, 0));
    dome.push(onion(0.75, 1.3).translate(px + 2.3, ph + 7.2, 0));
    cross(px + 2.3, ph + 8.4, 0, 1.8);
    for (let k = 0; k < 4; k++) {                                                                           // steps, solid to the porch floor
      const xf = px - 1.225 - (3 - k) * 0.45, xb = px - 0.775, top = 0.2 * (k + 1);
      stone.push(bevelBox(xb - xf, top + 0.5, pw + 2.4 - k * 0.4, (xf + xb) / 2, (top - 0.5) / 2, 0, 0.03));
    }
  } else {
    // 1800: a curved gable with a cross over the centre bay
    const sh = new THREE.Shape();
    sh.moveTo(-inner + 0.3, 0); sh.lineTo(inner - 0.3, 0); sh.quadraticCurveTo(inner * 0.35, 1.2, 2.6, 3.6);
    sh.lineTo(-2.6, 3.6); sh.quadraticCurveTo(-inner * 0.35, 1.2, -inner + 0.3, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.2, bevelEnabled: false, curveSegments: 10 });
    g.rotateY(Math.PI / 2).translate(-0.3, T2, 0);
    wall.push(g);
    wall.push(bevelBox(1.2, 2.2, 5.2, 0.3, T2 + 4.7, 0, 0.04));
    stone.push(bevelBox(1.6, 0.4, 5.8, 0.3, T2 + 5.9, 0, 0.04));
    cross(0.3, T2 + 6.1, 0, 2.2);
  }

  // Side windows along the nave (tall, round-headed)
  for (let x = nave.x0 + 4; x < nave.x1 - 3; x += 6) {
    if (Math.abs(x - xc) < tHalf + 1.5) continue;
    for (const s of [-1, 1]) {
      const g = arched(0, 0, 0, 1.9, 6, 'z');
      if (s > 0) g.rotateY(Math.PI);
      g.translate(x, 6.5, s * (nave.half + 0.012));
      dark.push(g);
      framed(stone, v3(x, 6.5, s * nave.half), v3(0, 0, s), 1.9, 6);
    }
  }

  // Crossing dome: drum, stepped dome, lantern, and the crown with orb and cross.
  // LiDAR max over the church is 56.1 m above ground; the drum height is set to reach it.
  const drumR = 8.5, drumTop = eave + 16;
  const drum = new THREE.CylinderGeometry(drumR, drumR, drumTop - eave + 2, 32);
  drum.translate(xc, (eave + drumTop) / 2 - 1, 0);
  wall.push(drum);
  stone.push(lathe(corniceP(drumR, drumR + 0.6, 0.7), 64).translate(xc, drumTop - 0.7, 0));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const g = arched(0, 0, 0, 1.4, 3.6, 'x');
    g.rotateY(-a);
    g.translate(xc + Math.cos(a) * (drumR + 0.02), eave + 6.5, Math.sin(a) * (drumR + 0.02));
    dark.push(g);
  }
  const step = new THREE.CylinderGeometry(drumR - 0.6, drumR, 1.8, 32);
  step.translate(xc, drumTop + 0.9, 0);
  dome.push(step);
  const cupola = new THREE.SphereGeometry(drumR - 0.6, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  cupola.translate(xc, drumTop + 1.8, 0);
  dome.push(cupola);
  const lanternBase = drumTop + 1.8 + (drumR - 0.6) - 0.5;
  wall.push(new THREE.CylinderGeometry(2.2, 2.4, 6, 16).translate(xc, lanternBase + 3, 0));
  dome.push(new THREE.SphereGeometry(2.5, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(xc, lanternBase + 6, 0));
  if (old) {
    // Crown: eight arched bands rising to an orb and cross
    const crownBase = lanternBase + 7.5;
    gilt.push(new THREE.TorusGeometry(2.4, 0.25, 8, 24).rotateX(Math.PI / 2).translate(xc, crownBase, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const band = new THREE.TorusGeometry(2.2, 0.16, 6, 16, Math.PI / 2);
      band.rotateY(-a);
      band.translate(xc, crownBase, 0);
      gilt.push(band);
    }
    gilt.push(new THREE.SphereGeometry(0.6, 12, 8).translate(xc, crownBase + 2.8, 0));
    gilt.push(mbox(0.2, 2.2, 0.2, xc, crownBase + 4.3, 0));
    gilt.push(mbox(0.2, 0.2, 1.2, xc, crownBase + 4.8, 0));
  } else {
    // onion helm with lantern and cross (1864-68)
    dome.push(onion(2.6, 4.2).translate(xc, lanternBase + 6.2, 0));
    cross(xc, lanternBase + 10.3, 0, 2.8);
  }

  const group = new THREE.Group();
  group.name = 'stcasimir';
  const add = (parts: THREE.BufferGeometry[], mat: THREE.Material, cast = true) => {
    if (!parts.length) return;
    const mesh = new THREE.Mesh(merged(parts.map(p => { if (!p.getAttribute('uv')) p.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.getAttribute('position').count * 2), 2)); return p; })), mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(wall, mats.wall);
  add(stone, mats.stone);
  add(roof, mats.roof);
  add(dome, mats.dome);
  add(gilt, mats.gilt);
  add(dark, mats.dark, false);

  // Place: origin at the west façade centre, +X along the nave (east)
  const cu = box.u0, cv = (box.v0 + box.v1) / 2;
  const ox = cu * box.ux - cv * box.uz, oz = cu * box.uz + cv * box.ux;
  group.position.set(ox, b.groundY, oz);
  group.rotation.y = Math.atan2(-box.uz, box.ux);
  return group;
}
