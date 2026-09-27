import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Coachwork for the traffic of c.1900 Vilnius (then a governorate town of the Russian Empire), built from
 * the shapes of the real vehicles: the izvozchik's droshky (a light, low four-wheel cab with a folding
 * leather hood and the driver on a box seat), a closed carriage (brougham), and the peasant's ladder-sided
 * farm cart. Wheels with nave, spokes, felloes and iron tyres (rear larger than front); elliptic springs;
 * a turning front axle with the shafts and the Russian shaft-bow (duga) standing over the collar.
 *
 * Everything is merged per moving part into a few meshes with one shared material: colour, roughness,
 * metalness, wood grain and lamp glow travel as vertex attributes (see coachMaterial()).
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// --- Finishes -------------------------------------------------------------------------------------------
/** Colour (sRGB), roughness, metalness, wood-grain amount (0 = smooth paint, 1 = raw timber), glow. */
export interface Finish { c: THREE.ColorRepresentation; r?: number; m?: number; w?: number; e?: number }
export const FIN = {
  lacquer: (c: string): Finish => ({ c, r: 0.26, w: 0.06 }),
  paintWood: (c: string): Finish => ({ c, r: 0.42, w: 0.35 }),
  wood: (c = '#c9b79a'): Finish => ({ c, r: 0.85, w: 1 }),
  iron: { c: '#26241f', r: 0.48, m: 0.75 } as Finish,
  brass: { c: '#b3904f', r: 0.3, m: 1 } as Finish,
  nickel: { c: '#b9b7b0', r: 0.22, m: 1 } as Finish,
  leather: { c: '#171513', r: 0.44 } as Finish,
  cloth: (c: string): Finish => ({ c, r: 0.9 }),
  glass: { c: '#0c0f11', r: 0.04 } as Finish,
};

// --- Geometry kit: parts merged into one geometry with per-vertex finish ----------------------------------
export class Kit {
  private parts: THREE.BufferGeometry[] = [];
  /** Adds a part (consumed) with a finish, optionally transformed; `flat` gives faceted normals. */
  add(g: THREE.BufferGeometry, f: Finish, xf?: THREE.Matrix4, flat = false): this {
    let geo = g.index ? g.toNonIndexed() : g;
    if (xf) geo.applyMatrix4(xf);
    if (flat || !geo.getAttribute('normal')) { geo.deleteAttribute('normal'); geo.computeVertexNormals(); }
    const P = geo.getAttribute('position'), N = geo.getAttribute('normal'), n = P.count;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', P);
    out.setAttribute('normal', N);
    out.setAttribute('uv', new THREE.BufferAttribute(boxUV(P, N), 2));
    const col = new Float32Array(n * 3), surf = new Float32Array(n * 4), c = new THREE.Color(f.c);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      surf[i * 4] = f.r ?? 0.6; surf[i * 4 + 1] = f.m ?? 0; surf[i * 4 + 2] = f.w ?? 0; surf[i * 4 + 3] = f.e ?? 0;
    }
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('surf', new THREE.BufferAttribute(surf, 4));
    this.parts.push(out);
    return this;
  }
  get empty(): boolean { return this.parts.length === 0; }
  build(): THREE.BufferGeometry {
    const g0 = mergeGeometries(this.parts, false);
    if (!g0) throw new Error('coachwork: merge failed');
    const g = mergeVertices(g0, 1e-5);
    g.computeBoundingSphere();
    return g;
  }
}

/** UVs in metres, projected along the dominant normal axis (for the wood grain). */
function boxUV(P: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, N: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Float32Array {
  const uv = new Float32Array(P.count * 2);
  for (let i = 0; i < P.count; i++) {
    const ax = Math.abs(N.getX(i)), ay = Math.abs(N.getY(i)), az = Math.abs(N.getZ(i));
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    if (ax >= ay && ax >= az) { uv[i * 2] = z; uv[i * 2 + 1] = y; }
    else if (ay >= az) { uv[i * 2] = z; uv[i * 2 + 1] = x; }
    else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  return uv;
}

// --- Primitives -------------------------------------------------------------------------------------------
export const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
export const RX = (a: number) => new THREE.Matrix4().makeRotationX(a);
export const RY = (a: number) => new THREE.Matrix4().makeRotationY(a);
export const RZ = (a: number) => new THREE.Matrix4().makeRotationZ(a);
export const mul = (...m: THREE.Matrix4[]) => m.reduce((a, b) => a.multiply(b), new THREE.Matrix4());

/** Surface of revolution about +Y from [radius, y] pairs. */
export const lathe = (pts: [number, number][], seg = 16, phi0 = 0) =>
  new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), seg, phi0);

/** Ellipse cross-section, counter-clockwise. */
export const ellipse = (a: number, b: number, n = 6): [number, number][] =>
  Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * a, Math.sin((i / n) * Math.PI * 2) * b]);
/** Rounded rectangle cross-section (half sizes a × b), counter-clockwise, `k` + 1 points per corner. */
export const rrect = (a: number, b: number, r = Math.min(a, b) * 0.45, k = 2): [number, number][] => {
  const out: [number, number][] = [];
  for (const [cx, cy, a0] of [[a - r, b - r, 0], [-a + r, b - r, 90], [-a + r, -b + r, 180], [a - r, -b + r, 270]] as const)
    for (let i = 0; i <= k; i++) { const t = ((a0 + (i * 90) / k) * Math.PI) / 180; out.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]); }
  return out;
};
/** A flat bar (straps, leaves, guards): six points, rounded edges once smooth-shaded. */
export const flat = (a: number, b: number): [number, number][] => [[a, 0], [a * 0.8, b], [-a * 0.8, b], [-a, 0], [-a * 0.8, -b], [a * 0.8, -b]];

/**
 * Sweeps a closed cross-section (points in the section's (side, up) plane) along a path. `ups` sets the
 * section's up direction per point (default: carried along from `up0` by parallel transport); `scale`
 * tapers it along the path (t = 0..1); open paths get end caps.
 */
export function sweep(path: THREE.Vector3[], section: [number, number][], o: {
  closed?: boolean; ups?: THREE.Vector3[]; up0?: THREE.Vector3; scale?: (t: number) => number | [number, number]; caps?: boolean;
} = {}): THREE.BufferGeometry {
  const n = path.length, m = section.length, closed = !!o.closed;
  const Ts: THREE.Vector3[] = [], Us: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = path[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = path[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    Ts.push(b.clone().sub(a).normalize());
  }
  for (let i = 0; i < n; i++) {
    let u: THREE.Vector3;
    if (o.ups) u = o.ups[i].clone();
    else if (i === 0) u = (o.up0 ?? V(0, 1, 0)).clone();
    else u = Us[i - 1].clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Ts[i - 1], Ts[i]));
    u.addScaledVector(Ts[i], -u.dot(Ts[i]));
    if (u.lengthSq() < 1e-10) u = Math.abs(Ts[i].y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
    Us.push(u.normalize());
  }
  const pos: number[] = [], idx: number[] = [];
  const ring = (i: number, pushTo: number[]) => {
    const t = n > 1 ? i / (n - 1) : 0;
    const sc = o.scale ? o.scale(t) : 1, [sx, sy] = typeof sc === 'number' ? [sc, sc] : sc;
    const S = Us[i].clone().cross(Ts[i]);
    for (const [a, b] of section) {
      const p = path[i].clone().addScaledVector(S, a * sx).addScaledVector(Us[i], b * sy);
      pushTo.push(p.x, p.y, p.z);
    }
  };
  for (let i = 0; i < n; i++) ring(i, pos);
  const rows = closed ? n : n - 1;
  for (let i = 0; i < rows; i++) for (let j = 0; j < m; j++) {
    const a = i * m + j, b = i * m + ((j + 1) % m), c = ((i + 1) % n) * m + ((j + 1) % m), d = ((i + 1) % n) * m + j;
    idx.push(a, b, c, a, c, d);
  }
  if (!closed && o.caps !== false) {
    for (const [i, flip] of [[0, true], [n - 1, false]] as const) {
      const base = pos.length / 3;
      ring(i, pos);
      const cx = path[i];
      pos.push(cx.x, cx.y, cx.z);
      for (let j = 0; j < m; j++) flip ? idx.push(base + m, base + ((j + 1) % m), base + j) : idx.push(base + m, base + j, base + ((j + 1) % m));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A smooth path through control points (Catmull-Rom), `n` samples. */
export const curve = (pts: THREE.Vector3[], n: number, closed = false) => new THREE.CatmullRomCurve3(pts, closed, 'centripetal').getPoints(closed ? n : n - 1).slice(0, closed ? n : n);

/** Straight or curved rod. */
export const rod = (pts: THREE.Vector3[], r: number, n = pts.length > 2 ? 10 : 2, radial = 6, taper = 1) =>
  sweep(pts.length > 2 ? curve(pts, n) : pts, ellipse(r, r, radial), { scale: t => 1 + (taper - 1) * t });

/** A soft box (superellipsoid): cushions, sacks, roofs. p → 0 is boxy, 1 is an ellipsoid. */
export function cushion(a: number, b: number, c: number, p = 0.25, ws = 14, hs = 8): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const P = g.getAttribute('position');
  const f = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), p);
  for (let i = 0; i < P.count; i++) P.setXYZ(i, f(P.getX(i)) * a, f(P.getY(i)) * b, f(P.getZ(i)) * c);
  const m = mergeVertices(g, 1e-5);
  m.computeVertexNormals();
  return m;
}

/** A side profile (in the z-y plane) extruded across the width, edges rounded. Centred on x = 0. */
export function slab(shape: THREE.Shape, width: number, bevel: number, curveSegments = 5): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-3, width - 2 * bevel), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments });
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g.applyMatrix4(mul(T((width - 2 * bevel) / 2, 0, 0), RY(-Math.PI / 2)));
  const m = mergeVertices(g, 1e-5);
  m.computeVertexNormals();
  return m;
}

/** Smooth rounded shape from (z, y) points, each corner rounded by `r`. */
export function roundedShape(pts: [number, number][], r = 0.04): THREE.Shape {
  const s = new THREE.Shape();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = new THREE.Vector2(...pts[i]), a = new THREE.Vector2(...pts[(i - 1 + n) % n]), b = new THREE.Vector2(...pts[(i + 1) % n]);
    const da = a.clone().sub(p), db = b.clone().sub(p);
    const ra = Math.min(r, da.length() * 0.45), rb = Math.min(r, db.length() * 0.45);
    const p0 = p.clone().addScaledVector(da.normalize(), ra), p1 = p.clone().addScaledVector(db.normalize(), rb);
    if (i === 0) s.moveTo(p0.x, p0.y); else s.lineTo(p0.x, p0.y);
    s.quadraticCurveTo(p.x, p.y, p1.x, p1.y);
  }
  s.closePath();
  return s;
}

/** A thin panel bent round a vertical axis (backrests, dashboards seen from above). */
export function bentPanel(w: number, h: number, d: number, R: number, seg = 12): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, seg, 1, 1);
  g.deleteAttribute('uv');
  const P = g.getAttribute('position');
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), a = x / R;
    P.setXYZ(i, Math.sin(a) * (R - z), P.getY(i), R - Math.cos(a) * (R - z));
  }
  g.computeVertexNormals();
  return g;
}

/** A surface through rows of points (grid), normals pointing away from `inside`. */
export function gridSurface(rows: THREE.Vector3[][], inside: THREE.Vector3): THREE.BufferGeometry {
  const R = rows.length, C = rows[0].length, pos: number[] = [], idx: number[] = [];
  for (const r of rows) for (const p of r) pos.push(p.x, p.y, p.z);
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < C - 1; j++) {
    const a = i * C + j, b = a + 1, c = a + C + 1, d = a + C;
    idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // orient: normals away from the inside point
  const N = g.getAttribute('normal');
  let s = 0;
  for (let i = 0; i < N.count; i += 7) s += N.getX(i) * (pos[i * 3] - inside.x) + N.getY(i) * (pos[i * 3 + 1] - inside.y) + N.getZ(i) * (pos[i * 3 + 2] - inside.z);
  if (s < 0) {
    for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

// --- Running gear -----------------------------------------------------------------------------------------
/**
 * A wheel on the +X side, axle along X, centred at the origin: nave with iron bands and axle cap,
 * `spokes` tapered spokes (dished outward), felloe and iron tyre. Right-hand wheels are this rotated 180°.
 */
export function wheel(k: Kit, r: number, spokes: number, o: { paint: Finish; hub?: number; width?: number; spoke?: number; cap?: Finish; seg?: number }, xf: THREE.Matrix4): void {
  const hub = o.hub ?? 1, w = o.width ?? 0.05, sp = o.spoke ?? 1, seg = o.seg ?? Math.round(24 + r * 20);
  const toX = RZ(-Math.PI / 2); // lathe axis Y → X (outboard)
  const L = (m: THREE.Matrix4) => mul(xf.clone(), m);
  // nave
  const nave: [number, number][] = [[0.028, -0.12], [0.05, -0.11], [0.068, -0.07], [0.078, -0.02], [0.076, 0.03], [0.062, 0.075], [0.05, 0.1], [0.047, 0.115]];
  k.add(lathe(nave.map(([a, b]) => [a * hub, b * hub]), 14), o.paint, L(toX));
  for (const y of [-0.075, 0.07]) k.add(lathe([[0.071 * hub, y * hub - 0.008], [0.074 * hub, y * hub], [0.071 * hub, y * hub + 0.008]], 14), FIN.iron, L(toX));
  k.add(lathe([[0.047 * hub, 0.112 * hub], [0.05 * hub, 0.125 * hub], [0.042 * hub, 0.15 * hub], [0.02 * hub, 0.158 * hub], [0, 0.16 * hub]], 12), o.cap ?? FIN.iron, L(toX));
  // spokes, dished: the nave stands ~2 cm outboard of the rim
  const tT = 0.012, fH = 0.05 * Math.max(1, r / 0.5), rin = r - tT - fH;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2, d = V(0, Math.cos(a), Math.sin(a));
    const p0 = d.clone().multiplyScalar(0.06 * hub).add(V(0.02, 0, 0)), p1 = d.clone().multiplyScalar(rin + 0.01);
    k.add(sweep([p0, p1], ellipse(0.017 * sp, 0.012 * sp, 6), { up0: V(1, 0, 0), scale: t => [1 - 0.3 * t, 1 - 0.15 * t] }), o.paint, xf);
  }
  // felloe and tyre
  const fr = rrect(fH / 2, w / 2, 0.012, 1).map(([a, b]) => [rin + fH / 2 + a, b] as [number, number]);
  k.add(lathe([...fr, fr[0]], seg), o.paint, L(toX));
  k.add(lathe([[r - tT, -w / 2 - 0.003], [r, -w / 2 - 0.002], [r + 0.002, 0], [r, w / 2 + 0.002], [r - tT, w / 2 + 0.003], [r - tT, -w / 2 - 0.003]], seg), FIN.iron, L(toX));
}

/** A pair of wheels on one axle (axle along X at the origin, wheels at ±track). */
export function wheelPair(r: number, spokes: number, track: number, o: Parameters<typeof wheel>[2]): THREE.BufferGeometry {
  const k = new Kit();
  wheel(k, r, spokes, o, T(track, 0, 0));
  wheel(k, r, spokes, o, mul(T(-track, 0, 0), RY(Math.PI)));
  return k.build();
}

/** Elliptic (double-bow) leaf spring along Z, centred at the origin, `h` tall between the bow centres. */
export function ellipticSpring(k: Kit, len: number, h: number, leaves: number, xf: THREE.Matrix4, width = 0.05): void {
  const t = 0.009;
  for (const side of [1, -1]) for (let i = 0; i < leaves; i++) {
    const L = (len / 2) * (1 - i * 0.2), pts: THREE.Vector3[] = [], ups: THREE.Vector3[] = [];
    for (let j = 0; j <= 10; j++) {
      const z = -L + (2 * L * j) / 10, u = z / (len / 2);
      const y = side * ((h / 2) * (1 - u * u) + i * t * 1.05);
      pts.push(V(0, y, z));
      ups.push(V(0, 1, side * h * u / (len / 2)).normalize().multiplyScalar(side));
    }
    k.add(sweep(pts, flat(width / 2, t / 2), { ups }), FIN.iron, xf);
  }
  for (const z of [-len / 2, len / 2]) k.add(rod([V(-width / 2 - 0.01, 0, z), V(width / 2 + 0.01, 0, z)], 0.016, 2, 6), FIN.iron, xf);
  k.add(new THREE.BoxGeometry(width + 0.02, 0.03, 0.08).translate(0, h / 2 + leaves * t, 0), FIN.iron, xf);
  k.add(new THREE.BoxGeometry(width + 0.02, 0.03, 0.08).translate(0, -h / 2 - leaves * t, 0), FIN.iron, xf);
}

/** Carriage lamp: square lantern with glass, pyramid roof and chimney, on a short bracket (towards -x). */
export function carriageLamp(k: Kit, xf: THREE.Matrix4, lit: boolean, body: Finish = FIN.nickel): void {
  const sq = (pts: [number, number][]) => lathe(pts, 4, Math.PI / 4);
  k.add(sq([[0, -0.16], [0.012, -0.15], [0.02, -0.11], [0.04, -0.085], [0.062, -0.075], [0.066, -0.065]]), body, xf, true);
  k.add(sq([[0.062, -0.065], [0.06, 0.065]]), { c: lit ? '#ffd9a0' : '#262a2a', r: 0.05, e: lit ? 3.2 : 0 }, xf, true);
  k.add(sq([[0.068, 0.065], [0.07, 0.078], [0.05, 0.1], [0.02, 0.125], [0.02, 0.17], [0.034, 0.18], [0.028, 0.19], [0, 0.195]]), body, xf, true);
  for (const a of [0, 1, 2, 3]) k.add(new THREE.BoxGeometry(0.008, 0.13, 0.008).translate(0.062, 0, 0).applyMatrix4(RY((a * Math.PI) / 2 + Math.PI / 4)), body, xf);
  k.add(rod([V(-0.065, -0.03, 0), V(-0.16, -0.04, 0)], 0.009), FIN.iron, xf);
}

// --- Folding hood (calash) ----------------------------------------------------------------------------------
/**
 * Leather hood on iron bows that all pivot on one axis (x) at `pivot`: the bows are U-shaped hoops
 * tilted by `angles` (0 = upright, + = forward); the leather sags between them and its side panels fan in
 * to the hinge. Raised (rain) it arches over the seat; folded it lies in a bundle behind it.
 */
export function hood(k: Kit, o: { pivot: THREE.Vector3; W: number; H: number; rc: number; angles: number[]; sag: number; leather: Finish; lining: Finish; joints: boolean; rail?: (x: number, h: number) => THREE.Vector3 }, xf = new THREE.Matrix4()): void {
  const M = 26, SUB = 5;
  const hoop: [number, number][] = []; // (x, h) along the U, by arc length
  {
    const pts: THREE.Vector2[] = [];
    const W = o.W / 2, H = o.H, rc = o.rc;
    pts.push(new THREE.Vector2(-W, 0), new THREE.Vector2(-W, H - rc));
    for (let i = 1; i < 6; i++) { const a = Math.PI - (i / 6) * (Math.PI / 2); pts.push(new THREE.Vector2(-W + rc + Math.cos(a) * rc, H - rc + Math.sin(a) * rc)); }
    pts.push(new THREE.Vector2(-W + rc, H), new THREE.Vector2(W - rc, H));
    for (let i = 1; i < 6; i++) { const a = Math.PI / 2 - (i / 6) * (Math.PI / 2); pts.push(new THREE.Vector2(W - rc + Math.cos(a) * rc, H - rc + Math.sin(a) * rc)); }
    pts.push(new THREE.Vector2(W, H - rc), new THREE.Vector2(W, 0));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    for (let j = 0; j < M; j++) {
      const s = (j / (M - 1)) * cum[cum.length - 1];
      let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
      const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
      const p = pts[i - 1].clone().lerp(pts[i], t);
      hoop.push([p.x, p.y]);
    }
  }
  const at = (x: number, h: number, th: number, inset: number) => {
    const hx = x - Math.sign(x) * inset * Math.min(1, h / 0.2), hh = Math.max(0, h - inset);
    return V(hx, o.pivot.y + hh * Math.cos(th), o.pivot.z + hh * Math.sin(th));
  };
  const surf = (inset: number) => {
    const rows: THREE.Vector3[][] = [];
    const A = o.angles;
    for (let b = 0; b < A.length - 1; b++) for (let s = 0; s < SUB; s++) {
      const t = s / SUB, th = A[b] + (A[b + 1] - A[b]) * t, sag = 1 - o.sag * Math.sin(Math.PI * t);
      rows.push(hoop.map(([x, h]) => at(x * (1 - (1 - sag) * 0.25), h * sag, th, inset)));
    }
    rows.push(hoop.map(([x, h]) => at(x, h, A[A.length - 1], inset)));
    // the back curtain, from the last bow down to the rail behind the seat
    if (o.rail) for (let s = 1; s <= 3; s++) rows.push(hoop.map(([x, h]) => at(x, h, A[A.length - 1], inset).lerp(o.rail!(x - Math.sign(x) * inset, h), s / 3)));
    return rows;
  };
  const inside = V(0, o.pivot.y + o.H * 0.3, o.pivot.z);
  k.add(gridSurface(surf(0), inside), o.leather, xf);
  const inner = gridSurface(surf(0.014), inside);
  const I = inner.getIndex()!;
  for (let i = 0; i < I.count; i += 3) { const a = I.getX(i + 1); I.setX(i + 1, I.getX(i + 2)); I.setX(i + 2, a); }
  inner.computeVertexNormals();
  k.add(inner, o.lining, xf);
  // the bows show as ridges; hinge plates; jointed stays locking the raised hood
  for (const th of o.angles) k.add(sweep(hoop.map(([x, h]) => at(x * 1.004, h + 0.006, th, 0)), ellipse(0.011, 0.011, 4)), FIN.leather, xf);
  for (const sx of [-1, 1]) {
    k.add(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 12).rotateZ(Math.PI / 2).translate(sx * (o.W / 2 + 0.008), o.pivot.y, o.pivot.z), FIN.brass, xf);
    if (o.joints) {
      const A = at(sx * (o.W / 2 + 0.018), 0.42, o.angles[0], 0), B = at(sx * (o.W / 2 + 0.018), 0.42, o.angles[2], 0);
      const mid = A.clone().lerp(B, 0.5).add(V(sx * 0.02, 0.07, 0));
      k.add(rod([A, mid], 0.011), FIN.iron, xf).add(rod([mid, B], 0.011), FIN.iron, xf);
      k.add(new THREE.SphereGeometry(0.022, 8, 6).translate(mid.x, mid.y, mid.z), FIN.brass, xf);
    }
  }
}

// --- Vehicles -------------------------------------------------------------------------------------------------
export type VehicleKind = 'droshky' | 'brougham' | 'cart';

/** Where the horse stands and where its collar tugs are, in the front unit's frame (see buildVehicle). */
export interface Hitch {
  horseZ: number;                       // horse origin ahead of the front axle
  tug: THREE.Vector3;                   // left hame tug (x > 0), horse-origin relative
  crest: THREE.Vector3;                 // top of the neck at the collar
  saddle: THREE.Vector3;                // top of the saddle pad, centre
}

export interface VehicleGeo {
  kind: VehicleKind;
  rR: number; rF: number; wb: number;
  chassis: THREE.BufferGeometry;        // rides on the rear axle, fixed
  body: THREE.BufferGeometry;           // on the springs (sways), built about `pivot`
  pivot: THREE.Vector3;
  front: THREE.BufferGeometry;          // turns with the front axle: axle, spring, shafts, duga
  wheelsR: THREE.BufferGeometry; wheelsF: THREE.BufferGeometry;
  seat: THREE.Vector3;                  // driver's seat top (body frame, relative to pivot)
  fare?: THREE.Vector3;                 // a passenger's seat, if it has one (body frame)
  foot: number;                         // driver's footboard height (body frame)
  springy: number;                      // how much the body moves on its springs (0 for a cart)
}

/** Shafts from the front axle to the collar and the duga over it (front-unit frame). */
function shaftsAndDuga(k: Kit, h: Hitch, rF: number, trackF: number, duga: Finish, shaft: Finish): void {
  const tz = h.horseZ + h.tug.z, tx = h.tug.x, ty = h.tug.y;
  for (const sx of [-1, 1]) {
    const pts = [V(sx * trackF * 0.62, rF + 0.1, 0.12), V(sx * (tx + 0.1), rF + 0.1 + (ty - rF - 0.1) * 0.55, tz - 1.15), V(sx * (tx + 0.05), ty - 0.03, tz - 0.3), V(sx * (tx + 0.02), ty, tz + 0.25)];
    k.add(sweep(curve(pts, 14), ellipse(0.032, 0.036, 7), { scale: t => 1 - 0.3 * t }), shaft);
    // tug loops: leather wraps holding the shaft and the duga end to the hame
    k.add(new THREE.TorusGeometry(0.05, 0.016, 5, 10).rotateY(Math.PI / 2).translate(sx * (tx + 0.025), ty + 0.01, tz), FIN.leather);
    // iron shaft tips
    k.add(rod([V(sx * (tx + 0.02), ty, tz + 0.2), V(sx * (tx + 0.018), ty + 0.002, tz + 0.3)], 0.024, 2, 7, 0.7), FIN.iron);
  }
  // splinter bar joining the shafts at the axle
  k.add(rod([V(-trackF * 0.66, rF + 0.1, 0.15), V(trackF * 0.66, rF + 0.1, 0.15)], 0.03, 2, 7), shaft);
  // the duga: a bent wooden bow, oval in section, standing a little forward over the collar
  const apex = h.crest.y + 0.44, pts: THREE.Vector3[] = [], ups: THREE.Vector3[] = [];
  for (let i = 0; i <= 22; i++) {
    const a = Math.PI - (i / 22) * Math.PI, c = Math.cos(a), s = Math.sin(a);
    const x = (tx + 0.035) * c * (1 + 0.1 * s), y = ty + (apex - ty) * Math.pow(s, 0.85);
    pts.push(V(x, y, tz + 0.02 + 0.13 * s));
    ups.push(V(c, Math.pow(s, 0.6), 0).normalize());
  }
  k.add(sweep(pts, ellipse(0.036, 0.021, 8), { ups, scale: t => 0.8 + 0.3 * Math.sin(Math.PI * t) }), duga);
  // straps from the shafts up to the saddle pad (holding the shafts up), girth loop
  for (const sx of [-1, 1]) k.add(sweep([V(sx * (tx + 0.06), ty - 0.08, h.horseZ + h.saddle.z), V(sx * 0.16, h.saddle.y - 0.01, h.horseZ + h.saddle.z)], flat(0.02, 0.005)), FIN.leather);
}

/**
 * A vehicle's parts. Frames: `root` at the rear axle on the ground (+z forward); the body about `pivot`;
 * the front unit at the front axle on the ground, turning about y.
 */
export function buildVehicle(kind: VehicleKind, h: Hitch, o: { rain: boolean; paint: string; wheelPaint: string; duga: string; line: string; seed: number }): VehicleGeo {
  const chassis = new Kit(), body = new Kit(), front = new Kit();
  const P = FIN.lacquer(o.paint), W = FIN.paintWood(o.wheelPaint);
  if (kind === 'droshky') {
    // Izvozchik's cab (proletka): tub seat for two under the hood, driver on a box in front.
    const rR = 0.5, rF = 0.37, wb = 1.62, tR = 0.68, tF = 0.62, pivot = V(0, 0.78, 0.55);
    const B = (m: THREE.Matrix4 = new THREE.Matrix4()) => mul(T(-pivot.x, -pivot.y, -pivot.z), m);
    // running gear: axle, springs, perch, fifth wheel
    chassis.add(rod([V(-tR, rR, 0), V(tR, rR, 0)], 0.026), FIN.iron);
    for (const x of [-0.42, 0.42]) ellipticSpring(chassis, 0.84, 0.2, 3, T(x, rR + 0.12, 0));
    chassis.add(sweep(curve([V(0, rR + 0.06, -0.1), V(0, 0.62, 0.7), V(0, 0.66, 1.3), V(0, 0.67, wb)], 14), rrect(0.03, 0.025)), FIN.iron);
    chassis.add(new THREE.TorusGeometry(0.26, 0.014, 5, 24).rotateX(Math.PI / 2).translate(0, 0.66, wb), FIN.iron);
    // tub: solid lower body with rounded edges, the side panels sweeping up into the back
    body.add(slab(roundedShape([[-0.3, 0.74], [-0.52, 0.86], [-0.5, 0.96], [0.36, 0.96], [0.5, 0.82], [0.95, 0.8], [1.02, 0.88], [1.08, 0.72], [0.4, 0.69]], 0.07), 1.02, 0.035), P, B());
    for (const sx of [-1, 1]) {
      // painted coach line along the tub
      body.add(sweep(curve([V(sx * 0.513, 0.84, -0.44), V(sx * 0.513, 0.905, -0.3), V(sx * 0.513, 0.905, 0.3), V(sx * 0.513, 0.85, 0.44), V(sx * 0.513, 0.79, 0.62), V(sx * 0.513, 0.76, 0.95)], 16), ellipse(0.004, 0.006, 4)), FIN.lacquer(o.line), B());
      body.add(slab(roundedShape([[-0.53, 0.9], [-0.56, 1.24], [-0.46, 1.34], [-0.2, 1.3], [0.08, 1.15], [0.3, 1.12], [0.44, 1.03], [0.42, 0.9]], 0.08), 0.045, 0.018), P, B(T(sx * 0.5, 0, 0)));
      // armrest roll in leather along the top edge
      body.add(sweep(curve([V(sx * 0.5, 1.33, -0.46), V(sx * 0.5, 1.28, -0.18), V(sx * 0.5, 1.16, 0.1), V(sx * 0.5, 1.12, 0.32), V(sx * 0.5, 1.02, 0.44)], 14), ellipse(0.03, 0.022, 7)), FIN.leather, B());
      // mudguards over the rear wheels and the step
      const mg: THREE.Vector3[] = [], ups: THREE.Vector3[] = [];
      for (let i = 0; i <= 12; i++) { const a = (0.3 + (i / 12) * 1.9); mg.push(V(sx * tR, rR + Math.sin(a) * (rR + 0.06), Math.cos(a) * (rR + 0.06))); ups.push(V(0, Math.sin(a), Math.cos(a))); }
      body.add(sweep(mg, flat(0.085, 0.005), { ups }), FIN.leather, B());
      body.add(rod([V(sx * 0.5, 0.78, 0.2), V(sx * (tR - 0.02), 0.9, 0.12), V(sx * tR, rR + 0.5, 0.05)], 0.01, 8), FIN.iron, B());
      body.add(rod([V(sx * 0.5, 0.74, 0.7), V(sx * 0.6, 0.55, 0.72), V(sx * 0.62, 0.44, 0.73)], 0.012, 8), FIN.iron, B());
      body.add(cushion(0.07, 0.012, 0.09, 0.2, 10, 6).translate(sx * 0.64, 0.44, 0.73), FIN.iron, B());
    }
    // curved backrest and cushions (dark blue cloth)
    body.add(bentPanel(1.0, 0.36, 0.04, 0.9).translate(0, 1.13, -0.5), P, B());
    const cloth = FIN.cloth('#1f2638');
    body.add(cushion(0.47, 0.07, 0.27, 0.28).translate(0, 1.02, -0.2), cloth, B());
    body.add(cushion(0.44, 0.17, 0.06, 0.3).applyMatrix4(RX(-0.22)).translate(0, 1.18, -0.43), cloth, B());
    // neck up to the driver's box, footboard and curved dash
    body.add(slab(roundedShape([[0.9, 0.8], [1.18, 0.98], [1.3, 1.14], [1.56, 1.14], [1.6, 0.98], [1.25, 0.76]], 0.05), 0.58, 0.03), P, B());
    body.add(cushion(0.27, 0.06, 0.17, 0.25).translate(0, 1.2, 1.42), cloth, B());
    body.add(new THREE.BoxGeometry(0.62, 0.03, 0.4).translate(0, 0.835, 1.82), FIN.wood('#6a5a48'), B());
    for (const sx of [-1, 1]) body.add(rod([V(sx * 0.25, 1.0, 1.5), V(sx * 0.28, 0.88, 1.7), V(sx * 0.3, 0.83, 1.95)], 0.012, 8), FIN.iron, B());
    const dash = curve([V(0, 0.84, 2.0), V(0, 1.04, 2.02), V(0, 1.24, 2.1), V(0, 1.34, 2.2)], 10);
    body.add(sweep(dash, flat(0.31, 0.008), { ups: dash.map(() => V(0, 0, 1)) }), FIN.leather, B());
    body.add(sweep(curve([V(-0.3, 0.84, 2.0), V(-0.31, 1.24, 2.1), V(-0.28, 1.35, 2.2), V(0.28, 1.35, 2.2), V(0.31, 1.24, 2.1), V(0.3, 0.84, 2.0)], 20), ellipse(0.009, 0.009, 5)), FIN.iron, B());
    for (const sx of [-1, 1]) carriageLamp(body, B(mul(T(sx * 0.46, 1.2, 1.4), RY(sx > 0 ? 0 : Math.PI))), o.rain);
    // the hood: raised in the rain, folded back in the sun
    const hp = V(0, 1.22, -0.3);
    hood(body, {
      pivot: hp, W: 1.08, H: 0.9, rc: 0.3, sag: o.rain ? 0.05 : 0.14,
      angles: o.rain ? [0.42, 0.06, -0.3, -0.6] : [-1.42, -1.54, -1.66, -1.78, -1.9],
      leather: FIN.leather, lining: FIN.cloth('#2c2926'), joints: o.rain,
      rail: o.rain ? (x, h) => V(x, hp.y, hp.z).lerp(V(x * 0.97, 1.33, -0.56), THREE.MathUtils.smoothstep(h, 0, 0.45)) : undefined,
    }, B());
    // front unit: axle, transverse spring, mudguards, shafts, duga
    front.add(rod([V(-tF, rF, 0), V(tF, rF, 0)], 0.024), FIN.iron);
    ellipticSpring(front, 0.9, 0.14, 2, mul(T(0, rF + 0.12, 0), RY(Math.PI / 2)));
    front.add(new THREE.TorusGeometry(0.26, 0.014, 5, 24).rotateX(Math.PI / 2).translate(0, 0.64, 0), FIN.iron);
    for (const sx of [-1, 1]) {
      const mg: THREE.Vector3[] = [], ups: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) { const a = 0.35 + (i / 10) * 1.7; mg.push(V(sx * tF, rF + Math.sin(a) * (rF + 0.06), Math.cos(a) * (rF + 0.06))); ups.push(V(0, Math.sin(a), Math.cos(a))); }
      front.add(sweep(mg, flat(0.075, 0.005), { ups }), FIN.leather);
      front.add(rod([V(sx * (tF - 0.1), rF, 0), V(sx * tF, rF + 0.2, 0.3), V(sx * tF, rF + 0.4, 0.2)], 0.009, 8), FIN.iron);
    }
    shaftsAndDuga(front, h, rF, tF, FIN.lacquer(o.duga), FIN.paintWood('#2a2018'));
    return {
      kind, rR, rF, wb, pivot, springy: 1,
      chassis: chassis.build(), body: body.build(), front: front.build(),
      wheelsR: wheelPair(rR, 14, tR, { paint: W }), wheelsF: wheelPair(rF, 12, tF, { paint: W, hub: 0.9 }),
      seat: V(0, 1.26, 1.42).sub(pivot), foot: 0.85 - pivot.y, fare: V(-0.2, 1.09, -0.26).sub(pivot),
    };
  }
  if (kind === 'brougham') {
    // Closed carriage: glazed cabin with a door, curved lower panels, coachman high on the box.
    const rR = 0.54, rF = 0.4, wb = 1.95, tR = 0.72, tF = 0.66, pivot = V(0, 0.8, 0.5);
    const B = (m: THREE.Matrix4 = new THREE.Matrix4()) => mul(T(-pivot.x, -pivot.y, -pivot.z), m);
    chassis.add(rod([V(-tR, rR, 0), V(tR, rR, 0)], 0.028), FIN.iron);
    for (const x of [-0.46, 0.46]) ellipticSpring(chassis, 0.9, 0.2, 4, T(x, rR + 0.15, 0));
    chassis.add(sweep(curve([V(0, rR + 0.07, -0.1), V(0, 0.66, 0.8), V(0, 0.7, wb)], 12), rrect(0.032, 0.028)), FIN.iron);
    chassis.add(new THREE.TorusGeometry(0.28, 0.015, 5, 24).rotateX(Math.PI / 2).translate(0, 0.7, wb), FIN.iron);
    const upper = FIN.lacquer('#101010');
    // lower body: rounded tub under the cabin, curving in towards the front ("cant")
    body.add(slab(roundedShape([[-0.52, 0.76], [-0.7, 0.98], [-0.68, 1.32], [0.86, 1.32], [0.82, 1.08], [0.6, 0.8], [0.1, 0.7]], 0.12), 1.2, 0.045), P, B());
    // upper cabin (black) with the roof
    body.add(slab(roundedShape([[-0.68, 1.3], [-0.66, 1.96], [0.8, 1.96], [0.86, 1.3]], 0.07), 1.16, 0.035), upper, B());
    body.add(cushion(0.64, 0.05, 0.84, 0.18, 12, 8).translate(0, 1.99, 0.07), { c: '#151413', r: 0.55 }, B());
    body.add(sweep(curve([V(-0.62, 2.02, -0.74), V(0.62, 2.02, -0.74), V(0.62, 2.02, 0.88), V(-0.62, 2.02, 0.88)], 40, true), ellipse(0.012, 0.018, 5), { closed: true }), FIN.nickel, B());
    // glass: door window, quarter lights, front glass; mouldings and handle
    for (const sx of [-1, 1]) {
      const g = (z0: number, z1: number, y0: number, y1: number) => {
        body.add(slab(roundedShape([[z0, y0], [z0, y1], [z1, y1], [z1, y0]], 0.05), 0.012, 0.004).translate(sx * 0.585, 0, 0), FIN.glass, B());
        const fr = [V(sx * 0.592, y0, z0), V(sx * 0.592, y1, z0), V(sx * 0.592, y1, z1), V(sx * 0.592, y0, z1)];
        body.add(sweep(fr, ellipse(0.012, 0.01, 4), { closed: true }), FIN.lacquer('#0a0a0a'), B());
      };
      g(-0.02, 0.44, 1.4, 1.86); g(-0.56, -0.16, 1.4, 1.86); g(0.56, 0.74, 1.4, 1.86);
      body.add(sweep(curve([V(sx * 0.6, 1.33, -0.72), V(sx * 0.6, 1.33, 0.2), V(sx * 0.6, 1.33, 0.88)], 12), ellipse(0.012, 0.012, 5)), FIN.lacquer('#6a4a1c'), B());
      body.add(sweep(curve([V(sx * 0.601, 1.02, -0.62), V(sx * 0.601, 0.86, -0.4), V(sx * 0.601, 0.8, 0.1), V(sx * 0.601, 0.88, 0.62), V(sx * 0.601, 1.1, 0.78)], 16), ellipse(0.004, 0.006, 4)), FIN.lacquer(o.line), B());
      body.add(sweep([V(sx * 0.6, 0.76, -0.06), V(sx * 0.6, 1.9, -0.06), V(sx * 0.6, 1.9, 0.5), V(sx * 0.6, 0.76, 0.5)], ellipse(0.006, 0.006, 4)), FIN.lacquer('#050505'), B());
      body.add(rod([V(sx * 0.605, 1.3, 0.42), V(sx * 0.63, 1.3, 0.42), V(sx * 0.63, 1.3, 0.34)], 0.009, 6), FIN.brass, B());
      carriageLamp(body, B(mul(T(sx * 0.66, 1.62, 0.84), RY(sx > 0 ? 0 : Math.PI))), o.rain);
      // step under the door
      body.add(rod([V(sx * 0.55, 0.72, 0.22), V(sx * 0.66, 0.55, 0.22), V(sx * 0.68, 0.46, 0.22)], 0.013, 8), FIN.iron, B());
      body.add(cushion(0.07, 0.012, 0.1, 0.2, 10, 6).translate(sx * 0.7, 0.45, 0.22), FIN.iron, B());
      // mudguards over the rear wheels
      const mg: THREE.Vector3[] = [], ups: THREE.Vector3[] = [];
      for (let i = 0; i <= 12; i++) { const a = 0.35 + (i / 12) * 1.9; mg.push(V(sx * tR, rR + Math.sin(a) * (rR + 0.06), Math.cos(a) * (rR + 0.06))); ups.push(V(0, Math.sin(a), Math.cos(a))); }
      body.add(sweep(mg, flat(0.085, 0.005), { ups }), FIN.leather, B());
    }
    body.add(slab(roundedShape([[0.8, 1.38], [0.84, 1.88], [0.86, 1.88], [0.86, 1.38]], 0.02), 1.0, 0.004), FIN.glass, B());
    { // the front glass in its frame, with a centre bar
      const fz = (y: number) => 0.868 - (y - 1.38) * 0.05;
      body.add(sweep([V(-0.5, 1.38, fz(1.38)), V(-0.5, 1.88, fz(1.88)), V(0.5, 1.88, fz(1.88)), V(0.5, 1.38, fz(1.38))], ellipse(0.014, 0.012, 4), { closed: true }), FIN.lacquer('#0a0a0a'), B());
      body.add(rod([V(0, 1.38, fz(1.38)), V(0, 1.88, fz(1.88))], 0.01, 2, 4), FIN.lacquer('#0a0a0a'), B());
    }
    // coachman's box on an iron frame over the front wheels, footboard and dash
    for (const sx of [-1, 1]) {
      body.add(rod([V(sx * 0.4, 1.3, 0.84), V(sx * 0.42, 1.48, 1.1), V(sx * 0.4, 1.56, 1.3)], 0.016, 10), FIN.iron, B());
      body.add(rod([V(sx * 0.35, 1.0, 0.8), V(sx * 0.36, 1.08, 1.35), V(sx * 0.36, 1.15, 1.7)], 0.014, 10), FIN.iron, B());
    }
    body.add(slab(roundedShape([[1.08, 1.4], [1.1, 1.58], [1.46, 1.58], [1.44, 1.4]], 0.04), 0.86, 0.025), upper, B());
    body.add(cushion(0.4, 0.05, 0.18, 0.25).translate(0, 1.63, 1.3), FIN.cloth('#2a2622'), B());
    body.add(new THREE.BoxGeometry(0.76, 0.03, 0.42).translate(0, 1.25, 1.82), FIN.wood('#5a4a3a'), B());
    const dash = curve([V(0, 1.25, 2.02), V(0, 1.4, 2.05), V(0, 1.56, 2.14), V(0, 1.64, 2.24)], 10);
    body.add(sweep(dash, flat(0.38, 0.008), { ups: dash.map(() => V(0, 0, 1)) }), FIN.leather, B());
    front.add(rod([V(-tF, rF, 0), V(tF, rF, 0)], 0.026), FIN.iron);
    ellipticSpring(front, 1.0, 0.16, 3, mul(T(0, rF + 0.13, 0), RY(Math.PI / 2)));
    front.add(new THREE.TorusGeometry(0.28, 0.015, 5, 24).rotateX(Math.PI / 2).translate(0, 0.68, 0), FIN.iron);
    for (const sx of [-1, 1]) {
      const mg: THREE.Vector3[] = [], ups: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) { const a = 0.35 + (i / 10) * 1.7; mg.push(V(sx * tF, rF + Math.sin(a) * (rF + 0.06), Math.cos(a) * (rF + 0.06))); ups.push(V(0, Math.sin(a), Math.cos(a))); }
      front.add(sweep(mg, flat(0.08, 0.005), { ups }), FIN.leather);
      front.add(rod([V(sx * (tF - 0.1), rF, 0), V(sx * tF, rF + 0.2, 0.3), V(sx * tF, rF + 0.42, 0.2)], 0.009, 8), FIN.iron);
    }
    shaftsAndDuga(front, h, rF, tF, FIN.lacquer(o.duga), FIN.lacquer('#141414'));
    return {
      kind, rR, rF, wb, pivot, springy: 0.8,
      chassis: chassis.build(), body: body.build(), front: front.build(),
      wheelsR: wheelPair(rR, 14, tR, { paint: W }), wheelsF: wheelPair(rF, 12, tF, { paint: W, hub: 0.95 }),
      seat: V(0, 1.68, 1.3).sub(pivot), foot: 1.265 - pivot.y,
    };
  }
  // Peasant's farm cart: ladder sides splayed outwards on a plank bed, no springs, a load of hay and sacks.
  const rR = 0.45, rF = 0.4, wb = 1.55, tR = 0.62, tF = 0.6, pivot = V(0, 0.72, 0.6);
  const B = (m: THREE.Matrix4 = new THREE.Matrix4()) => mul(T(-pivot.x, -pivot.y, -pivot.z), m);
  const wood = FIN.wood('#b9a58a'), dark = FIN.wood('#8a7a64');
  chassis.add(rod([V(-tR, rR, 0), V(tR, rR, 0)], 0.035, 2, 6), dark);
  chassis.add(new THREE.BoxGeometry(1.1, 0.1, 0.12).translate(0, rR + 0.08, 0), dark);
  chassis.add(rod([V(0, rR + 0.1, -0.5), V(0, rR + 0.1, wb)], 0.045, 2, 6), dark);
  for (const sx of [-1, 1]) body.add(new THREE.BoxGeometry(0.09, 0.08, 2.6).translate(sx * 0.36, 0.7, 0.55), dark, B());
  body.add(new THREE.BoxGeometry(0.84, 0.035, 2.5).translate(0, 0.76, 0.55), wood, B());
  // ladders: top poles, bottom rails and rungs, leaning out
  const rnd = mulberry(o.seed);
  for (const sx of [-1, 1]) {
    const top = (z: number) => V(sx * (0.66 + 0.02 * Math.sin(z * 2)), 1.28 + 0.05 * Math.sin(z * 1.3 + 1), z);
    const bot = (z: number) => V(sx * 0.42, 0.8, z);
    body.add(rod([top(-0.95), top(0.4), top(2.05)], 0.032, 12, 6), wood, B());
    body.add(rod([bot(-0.72), bot(1.8)], 0.026, 2, 6), wood, B());
    for (let i = 0; i <= 12; i++) {
      const z = -0.66 + i * 0.2 + (rnd() - 0.5) * 0.03;
      body.add(rod([bot(z), top(z + 0.05)], 0.014 + rnd() * 0.004, 2, 5), wood, B());
    }
    // stakes holding the ladders out
    for (const z of [-0.45, 0.6, 1.6]) body.add(rod([V(sx * 0.38, 0.66, z), V(sx * 0.7, 1.3, z)], 0.028, 2, 6), dark, B());
  }
  body.add(new THREE.BoxGeometry(0.9, 0.3, 0.04).translate(0, 0.95, -0.75), wood, B());
  // the load: hay mounded in the bed (sackcloth over it in the rain), a few sacks, the driver's board
  const hay = cushion(0.52, 0.3, 0.95, 0.55, 20, 12);
  { const Pp = hay.getAttribute('position'); for (let i = 0; i < Pp.count; i++) { const x = Pp.getX(i), y = Pp.getY(i), z = Pp.getZ(i); const n = 1 + 0.07 * Math.sin(x * 13 + z * 7) + 0.05 * Math.sin(z * 17 + y * 9); Pp.setXYZ(i, x * n, Math.max(y, -0.1) * n, z); } hay.computeVertexNormals(); }
  body.add(hay.translate(0, 1.02, 0.05), { c: '#8a7f66', r: 0.92, w: 0.25 }, B());
  for (const z of [-0.45, 0.5]) body.add(rod([V(-0.62, 0.98, z), V(-0.4, 1.28, z + 0.02), V(0, 1.35, z), V(0.4, 1.28, z - 0.02), V(0.62, 0.98, z)], 0.011, 12, 5), { c: '#9a8a66', r: 0.9, w: 0.3 }, B());
  for (const [x, z, a] of [[-0.2, 0.95, 0.3], [0.18, 1.1, -0.2], [0, 1.3, 0.1]] as const) body.add(cushion(0.2, 0.14, 0.3, 0.6, 12, 8).applyMatrix4(RY(a)).translate(x, 0.92, z), { c: '#8a7a60', r: 0.95, w: 0.2 }, B());
  body.add(new THREE.BoxGeometry(0.95, 0.04, 0.3).translate(0, 1.2, 1.55), wood, B());
  front.add(rod([V(-tF, rF, 0), V(tF, rF, 0)], 0.035, 2, 6), dark);
  front.add(new THREE.BoxGeometry(1.0, 0.1, 0.12).translate(0, rF + 0.08, 0), dark);
  shaftsAndDuga(front, h, rF, tF, FIN.wood('#a08060'), FIN.wood('#9a8a70'));
  const heavy = { paint: FIN.wood('#8f7c64'), hub: 1.35, width: 0.065, spoke: 1.35, cap: FIN.wood('#6a5a48') };
  return {
    kind, rR, rF, wb, pivot, springy: 0,
    chassis: chassis.build(), body: body.build(), front: front.build(),
    wheelsR: wheelPair(rR, 12, tR, heavy), wheelsF: wheelPair(rF, 10, tF, heavy),
    seat: V(0, 1.22, 1.52).sub(pivot), foot: 0.8 - pivot.y,
  };
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Material --------------------------------------------------------------------------------------------------
/**
 * Reads the per-vertex finish (attribute `surf`: roughness, metalness, wood grain, glow) into a standard
 * material. With a map/normalMap (the weathered planks) the grain shows on raw timber and faintly through
 * paint. Chains onBeforeCompile and extends the program key, like wet() and age().
 */
export function surfPatch<M extends THREE.MeshStandardMaterial>(m: M, grain = true): M {
  const own = m.onBeforeCompile, ownKey = m.customProgramCacheKey();
  m.onBeforeCompile = (shader, renderer) => {
    own.call(m, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 surf; varying vec4 vSurf;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = surf;');
    let f = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vSurf;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= vSurf.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= vSurf.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vSurf.w;');
    if (grain) {
      f = f.replace('#include <map_fragment>', `#ifdef USE_MAP
          vec3 grainC = texture2D(map, vMapUv).rgb;
          diffuseColor.rgb *= mix(vec3(1.0), grainC * 5.5, vSurf.z);
        #endif`)
        .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * vSurf.z;'));
    }
    shader.fragmentShader = f;
  };
  m.customProgramCacheKey = () => `${ownKey}|surf${grain ? 'g' : ''}`;
  return m;
}

export function coachMaterial(wood: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  return surfPatch(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 1, map: wood.map, normalMap: wood.normalMap,
    emissive: '#000000',
  }));
}
