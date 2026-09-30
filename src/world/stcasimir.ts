import * as THREE from 'three';
import type { Building, XZ } from './area';
import { mbox, merged, trianglesToGeometry } from './geom';
import { bevelBox, sweep, lathe, steadyAge, type P2 } from './classical';

/*
 * St Casimir's Church. West front after the c.1900 photographs (the owner's reference, checked
 * against the 1870s and 1889 photos on Commons), or with variant '1800' the pre-1864 form; the
 * body is simplified ("landmark-lite").
 * Sources (docs/REFERENCES.md §5, the c.1900 front feature by feature in §5.3): KVR 27304; OSM
 * outline (way 29503660); national LiDAR (eaves ~18 m, top ~56 m); the 1836 Januszewicz view and
 * 1840 survey drawing for the pre-1864 form: taller square west towers with clock stages and domed
 * caps, a crown on the dome lantern. Proportions of towers, drum and crown are conjecture (grade C).
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

// A panel moulding: from the panel's edge outwards, rising to a bead; reveal last
const PANEL_P: P2[] = [[0.18, 0], [0.18, 0.03], [0.13, 0.06], [0.07, 0.08], [0.03, 0.11], [0, 0.11], [0, 0]];

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

/** Turns a surface inside out (faces and normals), for reveals seen from within, like an arch soffit. */
function inward(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const s = g.index ? g.toNonIndexed() : g;
  for (const name of ['position', 'normal', 'uv']) {
    const a = s.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!a) continue;
    for (let i = 0; i < a.count; i += 3) for (let c = 0; c < a.itemSize; c++) {
      const t = a.getComponent(i + 1, c); a.setComponent(i + 1, c, a.getComponent(i + 2, c)); a.setComponent(i + 2, c, t);
    }
  }
  const n = s.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < n.array.length; i++) (n.array as Float32Array)[i] *= -1;
  return s;
}

/** Wall-plane ornament is drawn facing west (-X) at the origin, then turned to face `a` radians about Y and placed. */
const placeOn = (g: THREE.BufferGeometry, a: number, x: number, y: number, z: number) => g.rotateY(a).translate(x, y, z);

/**
 * A Baroque cartouche, s high-ish: an oval shield (or, given `oculus`, an oval window) in a moulded
 * ring, scrolls curling out at the sides, a crest above and a drop below. Faces west.
 */
function cartouche(out: THREE.BufferGeometry[], s: number, a: number, x: number, y: number, z: number, oculus?: THREE.BufferGeometry[]): void {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(new THREE.SphereGeometry(1, 12, 8).scale(0.14 * s, 0.62 * s, 0.46 * s).translate(-0.02 * s, 0, 0));          // shield
  if (oculus) oculus.push(placeOn(new THREE.CircleGeometry(0.2 * s, 14).scale(1, 1.3, 1).rotateY(-Math.PI / 2).translate(-0.17 * s, 0, 0), a, x, y, z)); // an oval window in it
  parts.push(new THREE.TorusGeometry(0.52 * s, 0.07 * s, 5, 20).scale(1, 1.3, 1).rotateY(Math.PI / 2));               // ring
  for (const sz of [-1, 1]) {
    // side scrolls (a curl each side at the waist) and ear scrolls at the top
    parts.push(new THREE.TorusGeometry(0.17 * s, 0.055 * s, 4, 8, Math.PI * 1.5).rotateZ(sz > 0 ? Math.PI * 0.75 : -Math.PI * 0.25).rotateY(Math.PI / 2).translate(-0.02 * s, -0.2 * s, sz * 0.66 * s));
    parts.push(new THREE.TorusGeometry(0.12 * s, 0.045 * s, 4, 7, Math.PI * 1.5).rotateZ(sz > 0 ? -Math.PI * 0.25 : Math.PI * 0.75).rotateY(Math.PI / 2).translate(-0.02 * s, 0.62 * s, sz * 0.36 * s));
  }
  parts.push(new THREE.SphereGeometry(0.15 * s, 8, 5).scale(0.6, 1.3, 1).translate(-0.04 * s, 0.86 * s, 0));          // crest
  parts.push(new THREE.ConeGeometry(0.1 * s, 0.34 * s, 8).rotateX(Math.PI).translate(-0.03 * s, -0.86 * s, 0));         // drop
  for (const p of parts) out.push(placeOn(p, a, x, y, z));
}

/** A garland swag hanging between two points `span` apart on a west-facing wall, centred at (x, y, z). */
function swag(out: THREE.BufferGeometry[], span: number, a: number, x: number, y: number, z: number): void {
  const arc = 1.9, R = span / 2 / Math.sin(arc / 2);
  const g = new THREE.TorusGeometry(R, 0.075 + span * 0.02, 5, 10, arc).rotateZ(-Math.PI / 2 - arc / 2);
  g.translate(0, R * Math.cos(arc / 2), 0).rotateY(Math.PI / 2).translate(-0.06, 0, 0);
  out.push(placeOn(g, a, x, y, z));
  for (const sz of [-1, 1]) out.push(placeOn(new THREE.SphereGeometry(0.1, 6, 4).translate(-0.08, 0.02, sz * span / 2), a, x, y, z)); // the knots it hangs from
}

/** A festoon of n swags hung round a drum of radius R centred at (x, y, z). */
function festoon(out: THREE.BufferGeometry[], n: number, R: number, x: number, y: number, z: number): void {
  const span = 2 * R * Math.sin(Math.PI / n);
  for (let k = 0; k < n; k++) {
    const g: THREE.BufferGeometry[] = [];
    swag(g, span, 0, -R * Math.cos(Math.PI / n), 0, 0);
    for (const p of g) out.push(p.rotateY(((k + 0.5) / n) * Math.PI * 2).translate(x, y, z));
  }
}

/** Glazing bars over a dark window of width w, height h (arched: the lights stop at the springing), sill at y0. */
function glazing(out: THREE.BufferGeometry[], x: number, z: number, y0: number, w: number, h: number, round: boolean): void {
  const top = round ? h - w / 2 : h, t = 0.055, mh = round ? h - 0.06 : h;
  const n = w > 2 ? 3 : 2;
  for (let i = 1; i < n; i++) out.push(mbox(t, mh, t, x - 0.03, y0 + mh / 2, z - w / 2 + (i * w) / n));
  for (let y = 0.8; y < top - 0.1; y += 0.8) out.push(mbox(t, t, w, x - 0.03, y0 + y, z));
  if (round) out.push(mbox(t, t, w, x - 0.03, y0 + top, z));
}

/** A bell of lip radius r with its lip at (x, y, z), hung from an iron stem `stem` long. */
function bell(bronze: THREE.BufferGeometry[], dark: THREE.BufferGeometry[], r: number, stem: number, x: number, y: number, z: number): void {
  const h = r * 1.8;
  bronze.push(lathe([[r * 1.0, 0], [r * 1.02, h * 0.04], [r * 0.9, h * 0.1], [r * 0.78, h * 0.28], [r * 0.64, h * 0.55],
    [r * 0.6, h * 0.78], [r * 0.55, h * 0.9], [r * 0.36, h * 0.98], [0, h]], 20).translate(x, y, z));
  dark.push(new THREE.CircleGeometry(r * 0.9, 20).rotateX(Math.PI / 2).translate(x, y + 0.03, z));   // the mouth, seen from the street
  bronze.push(mbox(0.08, stem, 0.08, x, y + h + stem / 2, z));
}

/**
 * An onion bulb r wide at the belly and h tall, with a narrow neck at the foot (radius 0.35 r) and
 * `ribs` raised ribs running up it, as the bulbs in the photos have. `rib` is the rib height over r.
 */
function bulb(r: number, h: number, ribs = 8, rib = 0.09): THREE.BufferGeometry {
  const prof: P2[] = [[0.001, 0], [r * 0.35, 0], [r * 0.5, h * 0.06], [r * 0.84, h * 0.18], [r, h * 0.32], [r * 0.95, h * 0.45], [r * 0.72, h * 0.6],
    [r * 0.42, h * 0.75], [r * 0.2, h * 0.88], [r * 0.09, h * 0.97], [0.001, h]];
  const seg = ribs * 6, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const [pr, py] of prof) for (let k = 0; k < seg; k++) {
    const th = (k / seg) * Math.PI * 2, rr = pr * (1 + rib * Math.pow(0.5 + 0.5 * Math.cos(ribs * th), 8));
    pos.push(rr * Math.cos(th), py, rr * Math.sin(th));
    uv.push(th * r, py);
  }
  for (let j = 0; j + 1 < prof.length; j++) for (let k = 0; k < seg; k++) {
    const a = j * seg + k, b = j * seg + ((k + 1) % seg), c = (j + 1) * seg + ((k + 1) % seg), d = (j + 1) * seg + k;
    idx.push(a, d, b, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * An octagonal lantern, r to the corners, h tall: arched openings on the eight faces, a plinth ring
 * and a moulded cornice. Walls go to `wall`, the openings to `dark`, mouldings to `stone`.
 */
function lantern(wall: THREE.BufferGeometry[], stone: THREE.BufferGeometry[], dark: THREE.BufferGeometry[],
  x: number, y: number, z: number, r: number, h: number): void {
  wall.push(new THREE.CylinderGeometry(r, r, h, 8).translate(x, y + h / 2, z));
  stone.push(new THREE.CylinderGeometry(r + 0.12, r + 0.18, 0.3, 8).translate(x, y + 0.15, z));
  stone.push(lathe(corniceP(r * 0.96, r * 0.96 + 0.3, 0.35), 8).translate(x, y + h - 0.35, z));
  const ap = r * Math.cos(Math.PI / 8), fw = 2 * r * Math.sin(Math.PI / 8);
  for (let k = 0; k < 8; k++) {
    const th = ((k + 0.5) / 8) * Math.PI * 2;
    const g = arched(0, 0, 0, fw * 0.55, h * 0.62, 'x');
    g.rotateY(th + Math.PI / 2).translate(x + Math.sin(th) * (ap + 0.012), y + h * 0.17, z + Math.cos(th) * (ap + 0.012));
    dark.push(g);
    // a pilaster strip on each angle
    const ta = (k / 8) * Math.PI * 2;
    stone.push(new THREE.BoxGeometry(0.16, h - 0.5, 0.16).rotateY(ta).translate(x + Math.sin(ta) * r, y + h / 2 - 0.05, z + Math.cos(ta) * r));
  }
}

/** A bell-shaped Baroque dome, r at the eaves, h tall, closing onto a neck of radius `neck`. */
function bellDome(r: number, h: number, neck: number): THREE.BufferGeometry {
  return lathe([[r * 1.02, 0], [r * 1.05, h * 0.03], [r, h * 0.08], [r * 0.97, h * 0.16], [r * 0.92, h * 0.34], [r * 0.8, h * 0.54],
    [r * 0.62, h * 0.72], [r * 0.44, h * 0.86], [Math.max(neck, r * 0.3), h * 0.96], [neck, h], [0, h]], 32);
}

export interface ChurchMaterials {
  wall: THREE.Material;
  stone: THREE.Material;
  roof: THREE.Material;  // lead-grey sheet
  dome: THREE.Material;  // copper
  gilt: THREE.Material;  // crown and crosses
  dark: THREE.Material;  // window and door openings
  bronze: THREE.Material; // the bells
  base: THREE.Material;   // the banded stone base of the front (c.1900)
  icon: THREE.Material;   // the painted icons in the niches (1864-1915)
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
  // bodies: towers and the central section (tall enough to meet the nave roof). The towers stop at
  // the upper cornice and their top stages stand on it. In the photos the tower openings of the upper
  // storey are belfries with bells hanging in them, so there the opening is cut 1 m into the tower.
  const bronze: THREE.BufferGeometry[] = [], icons: THREE.BufferGeometry[] = [], base: THREE.BufferGeometry[] = [];
  const bel = { w: 2.1, y0: T1 + 1.6, h: 6.2, d: 1.0 };
  for (const sgn of [-1, 1]) {
    const z = sgn * towerZ, top = T2 + 0.5;
    if (old) { wall.push(bevelBox(towerW, top + 1, towerW, towerW / 2, (top - 1) / 2, z, 0.06)); continue; }
    const { w, y0, h, d } = bel, y1 = y0 + h, ow = w / 2, side = (towerW - w) / 2, spring = y1 - ow;
    wall.push(bevelBox(towerW, y0 + 1, towerW, towerW / 2, (y0 - 1) / 2, z, 0.03));                          // below the opening
    wall.push(bevelBox(towerW, top - y1, towerW, towerW / 2, (y1 + top) / 2, z, 0.03));                       // above it
    for (const s of [-1, 1]) wall.push(bevelBox(towerW, h, side, towerW / 2, y0 + h / 2, z + s * (ow + side / 2), 0.01)); // piers
    wall.push(bevelBox(towerW - d, h, w, d + (towerW - d) / 2, y0 + h / 2, z, 0.01));                        // back
    for (const s of [-1, 1]) {                                                                                  // spandrels
      const sh = new THREE.Shape();
      sh.moveTo(s * ow, 0); sh.lineTo(s * ow, ow); sh.lineTo(0, ow); sh.absarc(0, 0, ow, Math.PI / 2, s > 0 ? 0 : Math.PI, s > 0);
      wall.push(new THREE.ShapeGeometry(sh, 10).rotateY(-Math.PI / 2).translate(0, spring, z));
    }
    wall.push(inward(new THREE.CylinderGeometry(ow, ow, d, 14, 1, true, Math.PI, Math.PI).rotateZ(-Math.PI / 2).translate(d / 2, spring, z))); // soffit
    dark.push(arched(d - 0.012, z, y0, w, h, 'x'));
    bell(bronze, dark, 0.55, spring - (y0 + 3.3) - 0.99, d * 0.52, y0 + 3.3, z);
    // a balustrade across the opening, as in the 1915-18 postcard
    stone.push(bevelBox(0.3, 0.14, w, 0.2, y0 + 0.07, z, 0.02), bevelBox(0.34, 0.14, w, 0.2, y0 + 1.0, z, 0.03));
    for (let k = 0; k < 4; k++) stone.push(lathe(BALUSTER.map(([r, v]) => [r * 1.05, v * 1.1] as P2), 10).translate(0.2, y0 + 0.13, z - ow + (k + 0.5) * (w / 4)));
  }
  wall.push(bevelBox(9, T2 + 1, inner * 2, 4.5, T2 / 2 - 0.5, 0, 0.06));
  // plinth, and the storey entablatures (frieze band and cornice) round the front and the towers.
  // In the photos (the 1915-18 postcard, the c.1900 view of the square) the lower storey stands on a
  // base of banded rustication in grey stone up to the porch cornice, pilasters and all.
  const plinthL = old ? stone : base, BASE_TOP = 7.9;
  fb(plinthL, 0, -1, 1.3, W + 0.6, 0.35);
  plinthL.push(sweep(frontRun(1.3, W / 2 + 0.3, towerW), Y, [[0.35, 0], [0.35, 0.04], [0.31, 0.08], [0.27, 0.1], [0.25, 0.16], [0, 0.18]]));        // plinth moulding
  if (!old) {
    const y0 = 1.48, n = 12, ch = (BASE_TOP - y0) / n;
    for (let k = 0; k < n; k++) {
      const y = y0 + (k + 0.5) * ch;
      base.push(bevelBox(0.07, ch, W + 0.14, -0.035, y, 0, 0.025));                                      // across the front
      for (const sz of [-1, 1]) base.push(bevelBox(towerW, ch, 0.07, towerW / 2, y, sz * (W / 2 + 0.035), 0.025)); // round the tower sides
    }
    stone.push(sweep(frontRun(BASE_TOP, W / 2 + 0.07, towerW), Y, [[0, 0], [0.42, 0], [0.42, 0.06], [0.47, 0.11], [0.47, 0.26], [0, 0.26]], { hard: 30 }));
  }
  stone.push(sweep(frontRun(T1 - 1.4, W / 2, towerW), Y, [[0, 0], [0.45, 0], [0.45, 0.8], [0, 0.8]], { hard: 30 }));
  stone.push(sweep(frontRun(T1 - 0.6, W / 2, towerW), Y, corniceP(0.45, 1.05, 0.62)));
  stone.push(sweep(frontRun(T2 - 1.1, W / 2, towerW), Y, [[0, 0], [0.4, 0], [0.4, 0.6], [0, 0.6]], { hard: 30 }));
  stone.push(sweep(frontRun(T2 - 0.5, W / 2, towerW), Y, corniceP(0.4, 0.9, 0.52)));
  // paired pilasters with capitals, both storeys, at the tower edges and either side of the centre bay
  const pil = [-W / 2 + 0.6, -inner - 0.6, -inner + 0.6, -3.3, 3.3, inner - 0.6, inner + 0.6, W / 2 - 0.6];
  for (const z of pil) {
    for (const [y0, y1] of [[1.3, T1 - 1.4], [T1, T2 - 1.1]]) {
      const lower = y0 < T1, foot = lower ? plinthL : stone;
      if (old) fb(stone, z, y0, y1, 0.85, 0.32);
      else if (lower) { fb(base, z, y0, BASE_TOP, 0.85, 0.32); fb(wall, z, BASE_TOP, y1, 0.85, 0.32); }
      else fb(wall, z, y0, y1, 0.85, 0.32);
      // moulded capital and base, run round the three faces of the pilaster
      const u = (y: number) => [v3(0, y, z + 0.425), v3(-0.32, y, z + 0.425), v3(-0.32, y, z - 0.425), v3(0, y, z - 0.425)];
      stone.push(sweep(u(y1 - 0.5), Y, PIL_CAP));
      fb(foot, z, y0, y0 + 0.22, 1.1, 0.46);                               // plinth
      foot.push(sweep(u(y0 + 0.22), Y, PIL_BASE));
    }
  }
  // lower storey. In the photos the tower bays are blind, with a cartouche high up, and the windows by
  // the portal are tall and glazed with a cartouche over each; 1800: a round-headed window on each tower.
  for (const sgn of [-1, 1]) {
    const z = sgn * towerZ;
    if (old) {
      dark.push(arched(-0.012, z, 6.2, 2.0, 4.2, 'x'));
      framed(stone, v3(0, 6.2, z), west, 2.0, 4.2);
      stone.push(new THREE.SphereGeometry(0.75, 20, 12).scale(0.35, 1.25, 1).translate(-0.3, 13.8, z));   // cartouche
      stone.push(lathe([[0.95, 0], [0.95, 0.06], [0.88, 0.1], [0.8, 0.1], [0.8, 0.16], [0, 0.18]], 32).rotateZ(Math.PI / 2).scale(1, 1.3, 1).translate(-0.02, 13.8, z)); // its frame
      fb(stone, z, 11.4, 11.7, 3.0, 0.25);                     // sill band
      dark.push(new THREE.PlaneGeometry(1.8, 3.2).rotateY(-Math.PI / 2).translate(-0.012, 12.2, sgn * 4.6));
      framed(stone, v3(0, 10.6, sgn * 4.6), west, 1.8, 3.2, false, 0.8);
    } else {
      cartouche(stone, 1.9, 0, -0.05, 14.9, z, dark);
      // a tall moulded panel on the tower bay, the cartouche at its head (postcard, c.1900 photo)
      { const za = z - 2.05, zb = z + 2.05, ya = 8.5, yb = 16.9;
        stone.push(sweep([v3(0, ya, zb), v3(0, ya, za), v3(0, yb, za), v3(0, yb, zb)], west, PANEL_P, { closed: true })); }
      dark.push(new THREE.PlaneGeometry(1.8, 4.0).rotateY(-Math.PI / 2).translate(-0.012, 12.6, sgn * 4.6));
      framed(stone, v3(0, 10.6, sgn * 4.6), west, 1.8, 4.0, false, 0.8);
      glazing(stone, 0, sgn * 4.6, 10.6, 1.8, 4.0, false);
      cartouche(stone, 1.15, 0, -0.05, 16.1, sgn * 4.6, dark);            // with an oval window (1889 photo)
    }
  }
  dark.push(arched(-0.012, 0, 0, 3.2, 7.0, 'x'));            // main portal
  framed(stone, v3(0, 0, 0), west, 3.2, 7.0, true, 1.3);
  // upper storey: tower openings (belfries in the photos, cut above) and three niches with statues
  for (const [z, w, isNiche] of [[-towerZ, 2.1, false], [-5.4, 2.0, true], [0, 2.5, true], [5.4, 2.0, true], [towerZ, 2.1, false]] as [number, number, boolean][]) {
    const h = z === 0 ? 7.0 : 6.2, y0 = T1 + 1.6;
    if (isNiche) {
      dark.push(arched(-0.012, z, y0 + 0.15, w, h, 'x'));
      framed(stone, v3(0, y0 + 0.15, z), west, w, h, true, 1.1);
      if (old) {
        // statue on a pedestal, standing in the niche
        const sx = -0.5, base = y0 + 0.2, sh = z === 0 ? 3.0 : 2.5;
        stone.push(bevelBox(0.8, 0.6, 1.0, sx, base + 0.3, z, 0.04));
        stone.push(lathe([[0.5, 0], [0.47, sh * 0.25], [0.4, sh * 0.5], [0.3, sh * 0.66], [0.2, sh * 0.72], [0.16, sh * 0.74], [0.24, sh * 0.8], [0.22, sh * 0.88], [0.12, sh * 0.93], [0, sh * 0.95]], 16).translate(sx, base + 0.6, z));
      } else {
        // in the Orthodox years the niches hold painted icons (1915-18 postcard), a third of the canvas each
        const iw = w - 0.24, ih = h - 0.3, g = arched(-0.03, z, y0 + 0.3, iw, ih, 'x'), uv = g.getAttribute('uv') as THREE.BufferAttribute;
        const slot = z < 0 ? 0 : z === 0 ? 1 : 2;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (slot + (uv.getX(i) + iw / 2) / iw) / 3, uv.getY(i) / ih);
        icons.push(g);
      }
    } else {
      if (old) dark.push(arched(-0.012, z, y0, w, h, 'x'));
      framed(stone, v3(0, y0, z), west, w, h);
    }
  }
  // balustrade over the centre, between the towers and the turret (or the 1800 gable)
  const zt = old ? 3.6 : 4.1;
  for (const sgn of [-1, 1]) {
    const za = sgn * zt, zb = sgn * (inner - 0.2);
    fb(stone, (za + zb) / 2, T2, T2 + 0.25, Math.abs(zb - za), 0.6, -0.1);
    fb(stone, (za + zb) / 2, T2 + 1.0, T2 + 1.2, Math.abs(zb - za), 0.6, -0.1);
    for (let z = Math.min(za, zb) + 0.3; z < Math.max(za, zb) - 0.2; z += 0.45) stone.push(lathe(BALUSTER, 10).translate(-0.4, T2 + 0.25, z));
  }
  // tower top stages, helms, lanterns, crosses
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
  const urn = (s: number, x: number, y: number, z: number) => stone.push(lathe(URN.map(([r, h]) => [r * s, h * s] as P2), 12).translate(x, y, z));
  for (const sgn of [-1, 1]) {
    const z = sgn * towerZ, cx = towerW / 2;
    if (old) {
      const sw = towerW - 1.2;
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
      for (const dz of [-1, 1]) urn(1, -0.3, T2, z + dz * (towerW / 2 - 0.4));
      const drumTop = T3 + 1.2;
      wall.push(new THREE.CylinderGeometry(2.7, 2.9, 1.2, 24).translate(cx, T3 + 0.95, z));
      dome.push(baroqueCap(3.1, 5.0).translate(cx, drumTop, z));
      wall.push(new THREE.CylinderGeometry(0.75, 0.85, 1.8, 10).translate(cx, drumTop + 5.6, z));
      dome.push(baroqueCap(0.95, 1.6).translate(cx, drumTop + 6.5, z));
      cross(cx, drumTop + 8.0, z, 2.0);
      continue;
    }
    // The photos (1870s and c.1900): on the upper cornice an attic with corner strips, a cartouche
    // between two garlands on the front and outer faces, a cornice with an urn on each corner; then a
    // bell dome, an open octagonal lantern, a bulb and the cross.
    const aw = towerW - 0.5, y0 = T2, y1 = T3 - 0.7, ym = (y0 + y1) / 2;
    wall.push(bevelBox(aw, y1 - y0 + 0.2, aw, cx, ym + 0.1, z, 0.04));
    for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) wall.push(bevelBox(0.8, y1 - y0, 0.8, cx + dx * (aw / 2 - 0.3), ym, z + dz * (aw / 2 - 0.3), 0.03));
    for (const [a, fx, fz] of [[0, cx - aw / 2, z], [sgn * Math.PI / 2, cx, z + sgn * aw / 2]] as [number, number, number][]) {
      cartouche(stone, 1.45, a, fx - (a === 0 ? 0.02 : 0), ym + 0.15, fz + (a === 0 ? 0 : sgn * 0.02), dark);
      for (const s of [-1, 1]) {
        // garlands either side of the cartouche, along the face
        const along = s * 1.75;
        swag(stone, 1.45, a, fx + (a === 0 ? 0 : along), y1 - 0.45, fz + (a === 0 ? along : 0));
      }
    }
    {
      const hw = aw / 2, sq = (y: number) => [v3(cx - hw, y, z - hw), v3(cx + hw, y, z - hw), v3(cx + hw, y, z + hw), v3(cx - hw, y, z + hw)];
      stone.push(sweep(sq(y1), Y, corniceP(0, 0.55, 0.7), { closed: true }));
    }
    for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) urn(1.25, cx + dx * (aw / 2 - 0.05), T3, z + dz * (aw / 2 - 0.05));
    // a low drum lifts the helm clear of the cornice and urns, as it reads from the street
    stone.push(new THREE.CylinderGeometry(2.8, 2.85, 0.9, 32).translate(cx, T3 + 0.45, z));
    stone.push(lathe(corniceP(2.8, 3.02, 0.28), 24).translate(cx, T3 + 0.62, z));
    const hb = T3 + 0.9;
    dome.push(bellDome(2.85, 4.2, 1.1).translate(cx, hb, z));
    lantern(stone, stone, dark, cx, hb + 4.1, z, 1.0, 2.8);
    dome.push(bellDome(1.26, 0.5, 0.28).translate(cx, hb + 6.9, z));
    dome.push(bulb(0.85, 1.9).translate(cx, hb + 7.35, z));
    cross(cx, hb + 9.2, z, 2.4);
  }
  if (!old) {
    // Central turret (1864-68): a square stage with a tall glazed window between corner pilasters,
    // great S-scrolls down to the towers, a cornice with an urn on each corner, a dome with four round
    // dormers, then lantern, bulb and cross: the highest point of the front (about 51 m in the photos).
    const tw = 8, tx0 = 0.6, cx = tx0 + tw / 2, TC = 39.6;
    wall.push(bevelBox(tw, TC - 1.4 - T2, tw, cx, (T2 + TC - 1.4) / 2, 0, 0.05));
    {
      const h = tw / 2, sq = (y: number) => [v3(cx - h, y, -h), v3(cx + h, y, -h), v3(cx + h, y, h), v3(cx - h, y, h)];
      stone.push(sweep(sq(TC - 1.4), Y, [[0, 0], [0.3, 0], [0.3, 0.6], [0, 0.6]], { hard: 30, closed: true }));
      stone.push(sweep(sq(TC - 0.8), Y, corniceP(0.3, 0.95, 0.8), { closed: true }));
    }
    for (const z of [-(tw / 2 - 0.45), tw / 2 - 0.45]) {
      fb(wall, z, T2 + 0.5, TC - 1.4, 0.9, 0.22, tx0);
      const u = (y: number) => [v3(tx0, y, z + 0.45), v3(tx0 - 0.22, y, z + 0.45), v3(tx0 - 0.22, y, z - 0.45), v3(tx0, y, z - 0.45)];
      stone.push(sweep(u(TC - 1.9), Y, PIL_CAP));
    }
    dark.push(arched(tx0 - 0.012, 0, T2 + 1.5, 2.3, 5.9, 'x'));
    framed(stone, v3(tx0, T2 + 1.5, 0), west, 2.3, 5.9, true, 1.1);
    glazing(stone, tx0, 0, T2 + 1.5, 2.3, 5.9, true);
    for (const sz of [-1, 1]) {
      // a round window high on each side face
      dark.push(new THREE.CircleGeometry(0.7, 20).translate(cx, TC - 3.2, sz * (tw / 2 + 0.012)));
      stone.push(new THREE.TorusGeometry(0.78, 0.1, 6, 24).translate(cx, TC - 3.2, sz * (tw / 2 + 0.02)));
      // the S-scroll: from high on the turret side down to the balustrade, a volute at each end
      const sh = new THREE.Shape();
      sh.moveTo(0, 0); sh.lineTo(sz * 3.3, 0); sh.lineTo(sz * 3.3, 0.75);
      sh.bezierCurveTo(sz * 2.2, 0.95, sz * 0.95, 2.3, sz * 0.55, 5.4);
      sh.lineTo(0, 5.7); sh.lineTo(0, 0);
      const d = 0.9, sx = tx0 + 0.25;
      const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1, curveSegments: 14 });
      stone.push(g.rotateY(-Math.PI / 2).translate(sx + d, T2 + 0.3, sz * tw / 2));
      for (const [r, zz, yy] of [[0.62, 2.75, 0.75], [0.42, 0.55, 5.25]]) {
        stone.push(new THREE.CylinderGeometry(r, r, d + 0.2, 20).rotateZ(Math.PI / 2).translate(sx + d / 2, T2 + 0.3 + yy, sz * (tw / 2 + zz)));
        stone.push(new THREE.CylinderGeometry(r * 0.45, r * 0.45, d + 0.36, 12).rotateZ(Math.PI / 2).translate(sx + d / 2, T2 + 0.3 + yy, sz * (tw / 2 + zz)));
      }
    }
    for (const dx of [0.35, tw - 0.35]) for (const dz of [-1, 1]) urn(1.15, tx0 + dx, TC, dz * (tw / 2 - 0.35));
    // A drum under the dome: the photos were taken from further back than the square allows, and
    // without it the cornice hides most of the dome from the street (a design choice, [U]).
    stone.push(new THREE.CylinderGeometry(3.85, 3.9, 1.6, 40).translate(cx, TC + 0.8, 0));
    stone.push(lathe(corniceP(3.85, 4.1, 0.3), 28).translate(cx, TC + 1.3, 0));
    const db = TC + 1.6;
    dome.push(lathe([[3.95, 0], [4.02, 0.1], [3.88, 0.32], [3.82, 0.72], [3.62, 1.78], [3.18, 2.95], [2.5, 3.95], [1.7, 4.62], [1.15, 4.92], [0, 5.0]], 40).translate(cx, db, 0));
    for (let k = 0; k < 4; k++) {
      // a lucarne on each quarter of the dome: an oval window in a moulded frame under a curved hood
      const a = (k * Math.PI) / 2, yD = db + 1.35, R = 3.95;
      stone.push(placeOn(bevelBox(1.4, 1.3, 1.1, -R + 0.7, 0, 0, 0.03), a, cx, yD, 0));
      dome.push(placeOn(new THREE.CylinderGeometry(0.62, 0.62, 1.5, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2).translate(-R + 0.7, 0.65, 0), a, cx, yD, 0));
      stone.push(placeOn(new THREE.TorusGeometry(0.34, 0.07, 6, 20).scale(1, 1.3, 1).rotateY(Math.PI / 2).translate(-R - 0.01, 0, 0), a, cx, yD, 0));
      dark.push(placeOn(new THREE.CircleGeometry(0.3, 16).scale(1, 1.3, 1).rotateY(-Math.PI / 2).translate(-R - 0.02, 0, 0), a, cx, yD, 0));
    }
    lantern(stone, stone, dark, cx, db + 4.9, 0, 1.0, 2.8);
    dome.push(bellDome(1.26, 0.5, 0.28).translate(cx, db + 7.7, 0));
    dome.push(bulb(0.88, 2.0).translate(cx, db + 8.15, 0));
    cross(cx, db + 10.1, 0, 2.7);

    // Porch before the portal (1864-68): paired Tuscan columns against a front wall with an arched
    // door, the entablature round three sides and a pediment with a clock; behind, an attic carrying a
    // ribbed dome with a garland ring, an open lantern, bulb and cross. Floor f above the street.
    const px = -5.2, pw = 8.2, ph = 7.6, f = 0.8;
    for (const dz of [-1, 1]) for (const zz of [pw / 2 - 0.5, pw / 2 - 1.5]) {
      stone.push(tuscan(0.38, ph - 1.2 - (f + 0.5)).translate(px - 0.5, f + 0.5, dz * zz));
      stone.push(bevelBox(0.9, 0.5, 0.9, px - 0.5, f + 0.25, dz * zz, 0.04));                                // plinth
      stone.push(bevelBox(0.9, 0.2, 0.9, px - 0.5, ph - 1.1, dz * zz, 0.03));                                // abacus
    }
    for (const dz of [-1, 1]) {
      stone.push(bevelBox(5.0, ph, 1.2, px + 2.5, ph / 2, (dz * (pw - 1.2)) / 2, 0.04));                    // side walls
      dark.push(arched(px + 2.4, dz * (pw / 2 + 0.012), f + 1.3, 1.0, 3.2, 'z'));                          // with a window each
      framed(stone, v3(px + 2.4, f + 1.3, dz * pw / 2), v3(0, 0, dz), 1.0, 3.2, true, 0.6);
    }
    stone.push(bevelBox(0.6, ph - 1.0, pw - 2.4, px + 0.3, (ph - 1.0) / 2, 0, 0.02));                        // front wall
    dark.push(arched(px - 0.012, 0, f, 2.4, 4.9, 'x'));                                                      // door
    framed(stone, v3(px, f, 0), west, 2.4, 4.9, true, 0.9);
    {
      // fanlight: a transom at the springing and bars radiating from its middle; a cartouche over the door
      const sp = f + 4.9 - 1.2;
      stone.push(mbox(0.06, 0.08, 2.4, px - 0.03, sp, 0));
      for (const al of [-1.05, -0.52, 0, 0.52, 1.05]) stone.push(mbox(0.05, 1.15, 0.05, 0, 0.575, 0).rotateX(al).translate(px - 0.03, sp, 0));
      cartouche(stone, 0.6, 0, px - 0.06, f + 5.35, 0);
    }
    // entablature on three sides: architrave, a Doric frieze with triglyphs, cornice (1889 photo)
    const ex0 = px - 0.95, ez = pw / 2 + 0.05, et = ph + 0.89;
    const run3 = (y: number, o: number) => [v3(0.2, y, ez + o), v3(ex0 - o, y, ez + o), v3(ex0 - o, y, -ez - o), v3(0.2, y, -ez - o)];
    stone.push(sweep(run3(ph - 1.0, 0), Y, [[0, 0], [0.04, 0], [0.04, 0.3], [0.08, 0.33], [0.08, 0.55], [0.12, 0.58], [0.12, 0.65], [0, 0.65]], { hard: 30 }));
    stone.push(sweep(run3(ph - 0.35, 0), Y, [[0, 0], [0.02, 0], [0.02, 0.62], [0, 0.62]], { hard: 30 }));
    stone.push(sweep(run3(ph + 0.27, 0), Y, corniceP(0.02, 0.62, 0.62)));
    for (let z = -ez + 0.3; z <= ez - 0.29; z += (2 * ez - 0.6) / 8) stone.push(bevelBox(0.08, 0.56, 0.36, ex0 - 0.06, ph - 0.04, z, 0.01));
    for (const sz of [-1, 1]) for (let x = ex0 + 0.3; x < -0.2; x += 0.95) stone.push(bevelBox(0.36, 0.56, 0.08, x, ph - 0.04, sz * (ez + 0.06), 0.01));
    // a broken segmental pediment, the clock in a scrolled frame rising through the break
    {
      const cw = ez + 0.35, rs = 1.9, R = (cw * cw + rs * rs) / (2 * rs), yc = et + rs - R;
      const phi = Math.asin(cw / R), gap = Math.asin(1.0 / R);
      const arc = (t0: number, t1: number) => Array.from({ length: 13 }, (_, i) => { const t = t0 + ((t1 - t0) * i) / 12; return v3(ex0, yc + R * Math.cos(t), R * Math.sin(t)); });
      const RAKE: P2[] = [[0.5, 0], [0.5, 0.62], [0.42, 0.62], [0.3, 0.56], [0.18, 0.44], [0.08, 0.34], [0, 0.3], [0, 0]];
      stone.push(sweep(arc(-phi, -gap), west, RAKE));
      stone.push(sweep(arc(gap, phi), west, RAKE));
      const ye = yc + Math.sqrt(R * R - ez * ez) - et, ae = Math.atan2(ye + (et - yc), ez);
      const sh = new THREE.Shape();
      sh.moveTo(-ez, 0); sh.lineTo(ez, 0); sh.lineTo(ez, ye); sh.absarc(0, yc - et, R, ae, Math.PI - ae, false);
      stone.push(new THREE.ExtrudeGeometry(sh, { depth: 1.0, bevelEnabled: false, curveSegments: 16 }).rotateY(-Math.PI / 2).translate(ex0 + 1.0, et, 0));
      const ck = v3(ex0 - 0.05, et + 1.35, 0);
      stone.push(bevelBox(0.6, 1.5, 1.7, ex0 + 0.25, et + 1.35, 0, 0.04));
      stone.push(new THREE.TorusGeometry(0.76, 0.13, 6, 28).rotateY(Math.PI / 2).translate(ck.x - 0.02, ck.y, ck.z));
      for (const sz of [-1, 1]) stone.push(new THREE.TorusGeometry(0.22, 0.08, 5, 12, Math.PI * 1.4).rotateZ(sz > 0 ? -0.3 : Math.PI - 1.1).rotateY(Math.PI / 2).translate(ck.x - 0.02, ck.y - 0.55, sz * 0.8));
      stone.push(new THREE.SphereGeometry(0.2, 10, 8).scale(0.6, 1.4, 1).translate(ck.x - 0.05, ck.y + 1.0, 0));
      stone.push(new THREE.CylinderGeometry(0.62, 0.62, 0.1, 28).rotateZ(Math.PI / 2).translate(ck.x, ck.y, ck.z));
      gilt.push(new THREE.TorusGeometry(0.64, 0.06, 6, 28).rotateY(Math.PI / 2).translate(ck.x - 0.03, ck.y, ck.z));
      for (const [len, ang] of [[0.34, -1.0], [0.5, 1.05]]) dark.push(mbox(0.03, len, 0.06, 0, len / 2, 0).rotateX(ang).translate(ck.x - 0.07, ck.y, ck.z));
    }
    // attic, drum with a garland, ribbed dome, lantern
    const dcx = -2.7, at = 11.2;
    stone.push(bevelBox(5.7, at - et, pw - 1.0, (px - 0.8 + -0.3) / 2, (et + at) / 2, 0, 0.04));
    { const ax0 = px - 0.8, ax1 = -0.3, az = (pw - 1.0) / 2;
      stone.push(sweep([v3(ax0, at - 0.3, -az), v3(ax1, at - 0.3, -az), v3(ax1, at - 0.3, az), v3(ax0, at - 0.3, az)], Y, corniceP(0, 0.25, 0.3), { closed: true })); }
    stone.push(new THREE.CylinderGeometry(3.25, 3.3, 0.6, 36).translate(dcx, at + 0.3, 0));
    stone.push(new THREE.TorusGeometry(3.31, 0.14, 6, 48).rotateX(Math.PI / 2).translate(dcx, at + 0.3, 0));
    festoon(stone, 12, 3.34, dcx, at + 0.5, 0);
    stone.push(new THREE.SphereGeometry(3.2, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).translate(dcx, at + 0.6, 0));   // near white in the postcard
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      dome.push(new THREE.TorusGeometry(3.23, 0.07, 4, 12, Math.PI / 2).rotateY(-a).translate(dcx, at + 0.6, 0));   // its ribs darker
    }
    lantern(stone, stone, dark, dcx, at + 3.7, 0, 0.62, 1.4);
    dome.push(bellDome(0.8, 0.35, 0.3).translate(dcx, at + 5.1, 0));
    dome.push(bulb(0.9, 1.9, 8, 0.16).translate(dcx, at + 5.4, 0));
    stone.push(new THREE.TorusGeometry(0.62, 0.08, 6, 20).rotateX(Math.PI / 2).translate(dcx, at + 5.62, 0));
    gilt.push(new THREE.SphereGeometry(0.16, 10, 8).translate(dcx, at + 7.35, 0));
    cross(dcx, at + 7.45, 0, 1.7);
    for (let k = 0; k < 4; k++) {                                                                           // steps, solid to the porch floor
      const xf = px - 1.225 - (3 - k) * 0.45, xb = px + 0.05, top = 0.2 * (k + 1);
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
  if (old) {
    wall.push(new THREE.CylinderGeometry(2.2, 2.4, 6, 16).translate(xc, lanternBase + 3, 0));
    dome.push(new THREE.SphereGeometry(2.5, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(xc, lanternBase + 6, 0));
  } else {
    // seen from the square, just behind the north tower (c.1900 photo)
    lantern(stone, stone, dark, xc, lanternBase, 0, 2.4, 6.0);
    dome.push(bellDome(2.75, 0.9, 1.0).translate(xc, lanternBase + 6.0, 0));
  }
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
    // ribbed onion helm and cross (1864-68)
    dome.push(bulb(2.2, 4.0, 12).translate(xc, lanternBase + 6.8, 0));
    cross(xc, lanternBase + 10.75, 0, 2.8);
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
  steadyAge(mats.wall); steadyAge(mats.stone);
  add(wall, mats.wall);
  add(stone, mats.stone);
  add(roof, mats.roof);
  add(dome, mats.dome);
  add(gilt, mats.gilt);
  add(bronze, mats.bronze);
  add(base, mats.base);
  add(icons, mats.icon, false);
  add(dark, mats.dark, false);

  // Place: origin at the west façade centre, +X along the nave (east)
  const cu = box.u0, cv = (box.v0 + box.v1) / 2;
  const ox = cu * box.ux - cv * box.uz, oz = cu * box.uz + cv * box.ux;
  group.position.set(ox, b.groundY, oz);
  group.rotation.y = Math.atan2(-box.uz, box.ux);
  return group;
}
