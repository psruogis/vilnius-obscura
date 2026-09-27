import * as THREE from 'three';
import type { AreaData, Building, XZ } from './area';
import type { Terrain } from './terrain';
import { hashString, LIMEWASH, hasTileRoof, EAVE, roofModel, roofCaps } from './buildings';
import type { HouseMaterials } from './houseMaterials';
import type { LampSpot } from './lamps';

/**
 * Real façade geometry for the houses near the walk (Building.detail): walls with openings cut
 * through them, windows set into deep masonry reveals with sills, surrounds, hoods and open shutters,
 * arched doors and carriage gateways, a moulded cornice that tucks under the overhanging roof, plinth
 * and string-course bands, corner pilasters and chimneys. Party walls (against a neighbour) stay blank.
 * Everything casts and receives the sun's shadows; the wall shader adds weathering from the same layout.
 */

const GROUND_F = 4.4;   // ground-floor height, m (c.1900 shop floors; matches the painted façades and the data)
const UPPER_F = 3.7;    // upper floors
const WIN_DEPTH = 0.26; // window glass set back from the wall face
const DOOR_DEPTH = 0.42;

const SHUTTERS = ['#3d4f3f', '#5b3b2b', '#6b675b', '#3f4b55', '#4a5a48', '#6a4a36'];
const DOORS = ['#7a5436', '#6a4a30', '#86603f', '#6b665a', '#72563a', '#5d6b5a'];

// --- Geometry builder -------------------------------------------------------------------------------

class GeoBuilder {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = [];
  extra = new Map<string, number[]>();
  private readonly e1 = new THREE.Vector3(); private readonly e2 = new THREE.Vector3(); private readonly fn = new THREE.Vector3();

  /** bevel: scale of the chamfer box() gives this builder's pieces (0 = sharp, e.g. thin ironwork). */
  constructor(private readonly extras: string[] = [], readonly bevel = 1) { for (const k of extras) this.extra.set(k, []); }

  /**
   * One triangle, wound to face along n (or along its per-vertex normals ns, which are then stored).
   * `ex` holds per-vertex extras: ex[k][vertex] = 4 numbers.
   */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, n: THREE.Vector3, ua: number[], ub: number[], uc: number[], color: THREE.Color, ex?: number[][][], ns?: THREE.Vector3[]): void {
    this.fn.crossVectors(this.e1.subVectors(b, a), this.e2.subVectors(c, a));
    const facing = ns ? this.e1.copy(ns[0]).add(ns[1]).add(ns[2]) : n;
    let vs = [a, b, c], us = [ua, ub, uc], order = [0, 1, 2];
    if (this.fn.dot(facing) < 0) { vs = [a, c, b]; us = [ua, uc, ub]; order = [0, 2, 1]; }
    for (let i = 0; i < 3; i++) {
      const nv = ns ? ns[order[i]] : n;
      this.pos.push(vs[i].x, vs[i].y, vs[i].z);
      this.nor.push(nv.x, nv.y, nv.z);
      this.uv.push(us[i][0], us[i][1]);
      this.col.push(color.r, color.g, color.b);
      this.extras.forEach((k, j) => this.extra.get(k)!.push(...(ex ? ex[j][order[i]] : [0, 0, 0, 0])));
    }
  }

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, n: THREE.Vector3, uvs: number[][], color: THREE.Color): void {
    this.tri(a, b, c, n, uvs[0], uvs[1], uvs[2], color);
    this.tri(a, c, d, n, uvs[0], uvs[2], uvs[3], color);
  }

  geometry(): THREE.BufferGeometry | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    for (const [k, v] of this.extra) g.setAttribute(k, new THREE.Float32BufferAttribute(v, 4));
    g.computeBoundingSphere();
    return g;
  }
}

// --- Edge frames --------------------------------------------------------------------------------------

/**
 * A wall edge: origin at its start, t along it, n out of the building, heights from the house's ground.
 * knots/wo/wv: the wall's irregularity, piecewise linear in u between the knots (zero at both corners):
 * wo bellies it out of plumb, wv lets it sag. Everything placed with P() on the edge moves with it.
 */
interface Edge {
  ax: number; az: number; tx: number; tz: number; nx: number; nz: number; L: number; gy: number;
  party: boolean;
  knots?: number[]; wo?: number[]; wv?: number[];
}
const UP = new THREE.Vector3(0, 1, 0);

function warpAt(e: Edge, u: number): [number, number] {
  const K = e.knots!;
  if (u <= K[0] || u >= K[K.length - 1]) return [0, 0];
  let i = 1;
  while (i < K.length - 1 && K[i] < u) i++;
  const f = (u - K[i - 1]) / (K[i] - K[i - 1] || 1);
  return [e.wo![i - 1] + (e.wo![i] - e.wo![i - 1]) * f, e.wv![i - 1] + (e.wv![i] - e.wv![i - 1]) * f];
}

function P(e: Edge, u: number, h: number, d: number): THREE.Vector3 {
  if (e.knots) { const [o, v] = warpAt(e, u); d += o; h -= v; }
  return new THREE.Vector3(e.ax + e.tx * u + e.nx * d, e.gy + h, e.az + e.tz * u + e.nz * d);
}
const vT = (e: Edge, s = 1) => new THREE.Vector3(e.tx * s, 0, e.tz * s);
const vN = (e: Edge, s = 1) => new THREE.Vector3(e.nx * s, 0, e.nz * s);

/**
 * A box with chamfered arrises, flat-shaded so every edge catches the light as dressed stone and run
 * plaster do. at(x, y, z) maps offsets from the centre (along the axes ax) to world space; s: half-sizes.
 * back: the -z face lies on a wall, so it is left out and its edges (and the short ones running into the
 * wall) stay square: the piece sits flush. ch = 0 gives a plain box.
 */
function bev(g: GeoBuilder, at: (x: number, y: number, z: number) => THREE.Vector3, ax: THREE.Vector3[], s: number[], color: THREE.Color, back: boolean, ch: number): void {
  ch = Math.min(ch, 0.45 * Math.min(s[0], s[1], s[2]));
  const cut = (i: number, si: number, j: number, sj: number) => (ch <= 0 || (back && ((i === 2 && si < 0) || (j === 2 && sj < 0) || (i !== 2 && j !== 2))) ? 0 : ch);
  // a corner of the box as seen from face i: pulled in by the chamfers of the face's edges
  const corner = (i: number, sg: number[]) => {
    const c = [0, 0, 0];
    for (let j = 0; j < 3; j++) c[j] = j === i ? sg[j] * s[j] : sg[j] * (s[j] - cut(i, sg[i], j, sg[j]));
    return at(c[0], c[1], c[2]);
  };
  const others = [[1, 2], [2, 0], [0, 1]];
  for (let i = 0; i < 3; i++) for (const si of [-1, 1]) {
    if (back && i === 2 && si < 0) continue;
    const [j, k] = others[i];
    const sg = (a: number, b: number) => { const v = [0, 0, 0]; v[i] = si; v[j] = a; v[k] = b; return v; };
    const q = [sg(-1, -1), sg(1, -1), sg(1, 1), sg(-1, 1)].map(v => corner(i, v));
    const W = 2 * s[j], H = 2 * s[k];
    g.quad(q[0], q[1], q[2], q[3], ax[i].clone().multiplyScalar(si), [[0, 0], [W, 0], [W, H], [0, H]], color);
  }
  if (ch <= 0) return;
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) for (const si of [-1, 1]) for (const sj of [-1, 1]) {
    if (!cut(i, si, j, sj)) continue;
    const k = 3 - i - j, L = 2 * s[k];
    const sg = (sk: number) => { const v = [0, 0, 0]; v[i] = si; v[j] = sj; v[k] = sk; return v; };
    const n = ax[i].clone().multiplyScalar(si).addScaledVector(ax[j], sj).normalize();
    g.quad(corner(i, sg(-1)), corner(i, sg(1)), corner(j, sg(1)), corner(j, sg(-1)), n, [[0, 0], [L, 0], [L, ch], [0, ch]], color);
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    if (!cut(0, sx, 1, sy) || !cut(0, sx, 2, sz) || !cut(1, sy, 2, sz)) continue;
    const sg = [sx, sy, sz];
    const n = ax[0].clone().multiplyScalar(sx).addScaledVector(ax[1], sy).addScaledVector(ax[2], sz).normalize();
    g.tri(corner(0, sg), corner(1, sg), corner(2, sg), n, [0, 0], [ch, 0], [0, ch], color);
  }
}

/**
 * A bevelled box in an edge frame: centre (u, h, d), half-sizes along t, up and n. UVs in metres.
 * The chamfer scales with the piece (about a third of its thinnest side, 6 to 35 mm) unless given.
 */
function box(g: GeoBuilder, e: Edge, u: number, h: number, d: number, su: number, sh: number, sd: number, color: THREE.Color, onWall = false, ch?: number): void {
  const c = ch ?? g.bevel * Math.min(0.035, 0.6 * Math.min(su, sh, sd));
  bev(g, (x, y, z) => P(e, u + x, h + y, d + z), [vT(e), UP, vN(e)], [su, sh, sd], color, onWall, c < 0.006 ? 0 : c);
}

/** Places geometry built in an edge-local frame (x along the wall, y up, z out) at (u, h) on the wall. */
function onEdge(g: GeoBuilder, geo: THREE.BufferGeometry, e: Edge, u: number, h: number, color: THREE.Color): void {
  const m = new THREE.Matrix4().makeBasis(vT(e), UP, vN(e)).setPosition(P(e, u, h, 0));
  const src = (geo.index ? geo.toNonIndexed() : geo).applyMatrix4(m);
  const pos = src.getAttribute('position'), nor = src.getAttribute('normal');
  const v = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) => new THREE.Vector3().fromBufferAttribute(a as THREE.BufferAttribute, i);
  for (let i = 0; i < pos.count; i += 3) {
    const ns = [v(nor, i), v(nor, i + 1), v(nor, i + 2)];
    g.tri(v(pos, i), v(pos, i + 1), v(pos, i + 2), ns[0], [0, 0], [0.3, 0], [0.3, 0.3], color, undefined, ns);
  }
}

/** A pipe between two points (h, d) in the plane across the wall at u, overlapping its ends a little so bends close. */
function pipe(g: GeoBuilder, e: Edge, u: number, a: number[], b: number[], r: number, color: THREE.Color): void {
  const dir = new THREE.Vector3(0, b[0] - a[0], b[1] - a[1]), len = dir.length();
  dir.normalize();
  const geo = new THREE.CylinderGeometry(r, r, len + r, 7, 1, true)
    .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir))
    .translate(0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  onEdge(g, geo, e, u, 0, color);
}

// --- Mouldings ----------------------------------------------------------------------------------------

/**
 * Moulding profiles drawn from the bottom up as (d out of the wall, h up), or for surrounds (w out from
 * the opening, d off the wall). Curved members are smooth-shaded (a third value of 1 marks a smooth point);
 * the fillets between them stay crisp, as a plasterer's running mould leaves them.
 */
class Mould {
  readonly p: number[][];
  constructor(x: number, y: number) { this.p = [[x, y]]; }
  private get end(): number[] { return this.p[this.p.length - 1]; }
  to(x: number, y: number): this { this.p.push([x, y]); return this; }
  up(dy: number): this { return this.to(this.end[0], this.end[1] + dy); }
  out(dx: number): this { return this.to(this.end[0] + dx, this.end[1]); }
  private run(n: number, f: (s: number) => number[]): this {
    const [x0, y0] = this.end;
    for (let i = 1; i <= n; i++) { const [x, y] = f(i / n); this.p.push([x0 + x, y0 + y, i < n ? 1 : 0]); }
    return this;
  }
  /** Quarter round, convex (ovolo: out first, then up). */
  ovolo(dx: number, dy: number, n = 3): this { return this.run(n, s => [dx * Math.sin((s * Math.PI) / 2), dy * (1 - Math.cos((s * Math.PI) / 2))]); }
  /** Quarter hollow (cavetto: up first, then out). */
  cavetto(dx: number, dy: number, n = 3): this { return this.run(n, s => [dx * (1 - Math.cos((s * Math.PI) / 2)), dy * Math.sin((s * Math.PI) / 2)]); }
  /** Cyma recta: round below, hollow above, level at both ends (the crowning sima). */
  recta(dx: number, dy: number, n = 4): this { return this.run(n, s => [dx * s, (dy * (1 - Math.cos(s * Math.PI))) / 2]); }
  /** Cyma reversa: hollow below, round above, upright at both ends (the bed moulding). */
  reversa(dx: number, dy: number, n = 4): this { return this.run(n, s => [(dx * (1 - Math.cos(s * Math.PI))) / 2, dy * s]); }
  /** Half-round bead (torus) standing out of an upright face. */
  torus(r: number, n = 5): this { return this.run(n, s => [r * Math.sin(s * Math.PI), r * (1 - Math.cos(s * Math.PI))]); }
}

/** Per-segment normals (start, end) of a profile, turned clockwise or anticlockwise from its direction. */
function segNormals(prof: number[][], cw: boolean): number[][][] {
  const seg = prof.slice(0, -1).map((p, i) => {
    const q = prof[i + 1], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
    return cw ? [dy / l, -dx / l] : [-dy / l, dx / l];
  });
  const avg = (n: number[], m: number[] | undefined, smooth: boolean) => {
    if (!m || !smooth) return n;
    const x = n[0] + m[0], y = n[1] + m[1], l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  return seg.map((n, i) => [avg(n, seg[i - 1], prof[i][2] === 1), avg(n, seg[i + 1], prof[i + 1][2] === 1)]);
}

/**
 * Extrudes a cross-section profile [(d, h)] (from the wall face out and back) along an edge from ua to ub.
 * At ring corners the ends are mitred (startMiter/endMiter give the corner's offset direction per metre of d);
 * elsewhere they are square and capped. Split at the wall's knots so it follows the wall's irregularity.
 */
function extrude(g: GeoBuilder, e: Edge, ua: number, ub: number, prof: number[][], color: THREE.Color,
  startMiter: [number, number] | null, endMiter: [number, number] | null, caps = true): void {
  if (ub - ua < 0.05) return;
  const at = (u: number, miter: [number, number] | null, d: number, h: number) => {
    if (!miter) return P(e, u, h, d);
    const bx = e.ax + e.tx * u, bz = e.az + e.tz * u;
    return new THREE.Vector3(bx + miter[0] * d, e.gy + h, bz + miter[1] * d);
  };
  const ns = segNormals(prof, true).map(([a, b]) => [new THREE.Vector3(e.nx * a[0], a[1], e.nz * a[0]), new THREE.Vector3(e.nx * b[0], b[1], e.nz * b[0])]);
  const cuts = [ua, ...(e.knots ?? []).filter(k => k > ua + 1e-3 && k < ub - 1e-3), ub];
  for (let c = 0; c + 1 < cuts.length; c++) {
    const u0 = cuts[c], u1 = cuts[c + 1], m0 = c === 0 ? startMiter : null, m1 = c === cuts.length - 2 ? endMiter : null;
    let s = 0;
    for (let i = 0; i + 1 < prof.length; i++) {
      const [d0, h0] = prof[i], [d1, h1] = prof[i + 1];
      const len = Math.hypot(d1 - d0, h1 - h0);
      if (len < 1e-4) continue;
      const [na, nb] = ns[i];
      const A = at(u0, m0, d0, h0), B = at(u1, m1, d0, h0), C = at(u1, m1, d1, h1), D = at(u0, m0, d1, h1);
      g.tri(A, B, C, na, [u0, s], [u1, s], [u1, s + len], color, undefined, [na, na, nb]);
      g.tri(A, C, D, na, [u0, s], [u1, s + len], [u0, s + len], color, undefined, [na, nb, nb]);
      s += len;
    }
  }
  if (!caps) return;
  // Caps on square ends
  const shape = prof.map(([d, h]) => new THREE.Vector2(d, h));
  const tris = THREE.ShapeUtils.triangulateShape(shape, []);
  for (const [end, u, miter] of [[-1, ua, startMiter], [1, ub, endMiter]] as const) {
    if (miter) continue;
    const n = vT(e, end);
    for (const [a, b, c] of tris) {
      const pa = P(e, u, prof[a][1], prof[a][0]), pb = P(e, u, prof[b][1], prof[b][0]), pc = P(e, u, prof[c][1], prof[c][0]);
      g.tri(pa, pb, pc, n, [prof[a][0], prof[a][1]], [prof[b][0], prof[b][1]], [prof[c][0], prof[c][1]], color);
    }
  }
}

/**
 * A moulded surround run along a path in the wall plane: points (u, h) going clockwise round an opening
 * (up the left jamb, over the head, down the right), mitred at every bend. prof: (w, d) from the opening's
 * edge outwards and off the wall, starting and ending on the wall. caps closes the two open ends.
 */
function frame(g: GeoBuilder, e: Edge, path: number[][], prof: number[][], color: THREE.Color, caps = false): void {
  const n = path.length;
  const sn = path.slice(0, -1).map((p, i) => { const q = path[i + 1], du = q[0] - p[0], dh = q[1] - p[1], l = Math.hypot(du, dh) || 1; return [-dh / l, du / l]; });
  const off = path.map((_, i) => {
    if (i === 0) return sn[0];
    if (i === n - 1) return sn[n - 2];
    const a = sn[i - 1], b = sn[i], l = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1, x = (a[0] + b[0]) / l, y = (a[1] + b[1]) / l;
    const c = Math.max(0.3, x * b[0] + y * b[1]);
    return [x / c, y / c];
  });
  const Q = (i: number, w: number, d: number) => P(e, path[i][0] + off[i][0] * w, path[i][1] + off[i][1] * w, d);
  const pn = segNormals(prof, false);
  for (let i = 0; i + 1 < n; i++) {
    const S = vT(e, sn[i][0]).addScaledVector(UP, sn[i][1]), N0 = vN(e);
    let s = 0;
    for (let j = 0; j + 1 < prof.length; j++) {
      const [w0, d0] = prof[j], [w1, d1] = prof[j + 1], len = Math.hypot(w1 - w0, d1 - d0);
      if (len < 1e-4) continue;
      const na = S.clone().multiplyScalar(pn[j][0][0]).addScaledVector(N0, pn[j][0][1]), nb = S.clone().multiplyScalar(pn[j][1][0]).addScaledVector(N0, pn[j][1][1]);
      const A = Q(i, w0, d0), B = Q(i + 1, w0, d0), C = Q(i + 1, w1, d1), D = Q(i, w1, d1), L = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
      g.tri(A, B, C, na, [0, s], [L, s], [L, s + len], color, undefined, [na, na, nb]);
      g.tri(A, C, D, na, [0, s], [L, s + len], [0, s + len], color, undefined, [na, nb, nb]);
      s += len;
    }
  }
  if (!caps) return;
  const tris = THREE.ShapeUtils.triangulateShape(prof.map(([w, d]) => new THREE.Vector2(w, d)), []);
  for (const [i, j, sg] of [[0, 1, -1], [n - 1, n - 2, -1]]) {
    const du = path[j][0] - path[i][0], dh = path[j][1] - path[i][1], l = Math.hypot(du, dh) || 1;
    const nn = vT(e, (sg * du) / l).addScaledVector(UP, (sg * dh) / l);
    for (const [a, b, c] of tris) g.tri(Q(i, prof[a][0], prof[a][1]), Q(i, prof[b][0], prof[b][1]), Q(i, prof[c][0], prof[c][1]), nn, [0, 0], [0.1, 0], [0.1, 0.1], color);
  }
}

// Surround profiles (w, d): a stepped architrave with a raised inner bead, chamfered outer arris
const architrave = (w: number, d = 0.038) => [[0, 0], [0, d + 0.012], [0.018, d + 0.012], [0.026, d], [w - 0.014, d], [w, d - 0.014], [w, 0]];
// raking cornice of a pediment: a fillet under a crowning cyma
const rake = (w: number, d: number) => new Mould(0, 0).up(d * 0.6).out(0.012).up(0.012).recta(w - 0.03, d * 0.4 - 0.012, 3).out(0.018).to(w, 0).p;
// string course: a hollow under a plain band with a weathered top, projecting `out`
const course = (y: number, h: number, out: number) => new Mould(0, y).out(out * 0.25).cavetto(out * 0.5, h * 0.3).out(out * 0.25).up(h * 0.5).to(out * 0.7, y + h * 0.9).to(0, y + h).p;

// --- Buildings ----------------------------------------------------------------------------------------

function inRing(x: number, z: number, r: XZ[]): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const insideBuilding = (b: Building, x: number, z: number) => inRing(x, z, b.rings[0]) && !b.rings.slice(1).some(h => inRing(x, z, h));

interface Opening { kind: 'window' | 'gwindow' | 'door' | 'gate' | 'shop'; u: number; w: number; bottom: number; top: number; spring?: number; rise?: number; variant: number; balcony?: boolean; pediment?: 0 | 1 | 2 }

function rnd(seed: number, salt: number): number {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function openingPolygon(o: Opening): THREE.Vector2[] {
  const l = o.u - o.w / 2, r = o.u + o.w / 2;
  if (o.spring === undefined) return [new THREE.Vector2(l, o.bottom), new THREE.Vector2(r, o.bottom), new THREE.Vector2(r, o.top), new THREE.Vector2(l, o.top)];
  const pts = [new THREE.Vector2(l, o.bottom), new THREE.Vector2(r, o.bottom)];
  if (o.rise !== undefined && o.rise < o.w / 2 - 1e-3) {
    // segmental arch: a circle through both springing points with the given rise
    const hw = o.w / 2, R = (hw * hw + o.rise * o.rise) / (2 * o.rise), cy = o.spring + o.rise - R, a0 = Math.asin(hw / R), N = 10;
    for (let i = 0; i <= N; i++) { const a = -a0 + (2 * a0 * (N - i)) / N; pts.push(new THREE.Vector2(o.u + Math.sin(a) * R, cy + Math.cos(a) * R)); }
    return pts;
  }
  const R = o.w / 2, N = 10;
  for (let i = 0; i <= N; i++) { const a = (Math.PI * i) / N; pts.push(new THREE.Vector2(o.u + Math.cos(a) * R, o.spring + Math.sin(a) * R)); }
  return pts;
}

/** Points along a segmental arc over (uc, y) spanning ±span, radius span * rk, left to right. */
function segmentArc(uc: number, y: number, span: number, rk: number, n = 8): number[][] {
  const R = span * rk, cy = y - Math.sqrt(R * R - span * span), a0 = Math.asin(span / R);
  return Array.from({ length: n + 1 }, (_, k) => { const t = -a0 + (2 * a0 * k) / n; return [uc + Math.sin(t) * R, cy + Math.cos(t) * R]; });
}

/** Plinth: a plain, slightly battered base `out` proud, finished at `top` with a cyma weathering back to the wall. */
const plinthProfile = (h0: number, out: number, top: number) => new Mould(0, h0).out(out).to(out, top).reversa(-out * 0.6, 0.08).up(0.02).to(0, top + 0.1).p;

/**
 * Wall with openings, triangulated column by column between the given cut lines (each column is a
 * simple rectangle with its own holes), which is robust where one big shape can fail.
 */
function wallWithHoles(g: GeoBuilder, e: Edge, cuts: number[], h0: number, topH: number, openings: Opening[], color: THREE.Color, seedW: number): void {
  const nOut = vN(e), z4 = [0, 0, 0, 0];
  const xs = [...new Set([0, ...cuts.filter(c => c > 0.01 && c < e.L - 0.01), e.L])].sort((a, b) => a - b);
  for (let k = 0; k + 1 < xs.length; k++) {
    const x0 = xs[k], x1 = xs[k + 1];
    const contour = [new THREE.Vector2(x0, h0), new THREE.Vector2(x1, h0), new THREE.Vector2(x1, topH), new THREE.Vector2(x0, topH)];
    const holes = openings.filter(o => o.u > x0 && o.u < x1).map(openingPolygon);
    const all = contour.concat(...holes);
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, holes)) {
      const va = all[a], vb = all[b], vc = all[c];
      g.tri(P(e, va.x, va.y, 0), P(e, vb.x, vb.y, 0), P(e, vc.x, vc.y, 0), nOut, [va.x / 2.5, va.y / 2.5], [vb.x / 2.5, vb.y / 2.5], [vc.x / 2.5, vc.y / 2.5], color,
        [[[va.x, va.y, topH, seedW], [vb.x, vb.y, topH, seedW], [vc.x, vc.y, topH, seedW]], [z4, z4, z4], [z4, z4, z4]]);
    }
  }
}

// --- Hero façade: the eclectic house east of the Town Hall (the owner's 1920s photograph) -------------
// Three storeys over tall shopfronts: paired round-arched first-floor windows in stucco surrounds,
// paired second-floor windows under hoods, ornamental panels, a dentilled cornice, a baroque gable with
// an oval window over the balcony bay, and a low sheet-metal roof with dormers.
function heroFacade(e: Edge, topH: number, h0: number, terrain: Terrain,
  G: { wall: GeoBuilder; trim: GeoBuilder; flat: GeoBuilder; glass: GeoBuilder; wood: GeoBuilder; canvas: GeoBuilder; iron: GeoBuilder; shop: GeoBuilder; sign: GeoBuilder },
  wallC: THREE.Color, trimC: THREE.Color, stats: FacadeStats, withGable = true): void {
  const F0 = 4.6, F1 = 9.1, F2 = topH - 0.9;   // floor lines: first floor, second floor, cornice base
  const white = new THREE.Color('#ffffff');
  const nPairs = Math.max(2, Math.round((e.L - 2) / 4.9));
  const pairW = (e.L - 1.6) / nPairs, u0 = 0.8;
  const gablePair = withGable ? Math.min(1, nPairs - 1) : -1;
  const openings: Opening[] = [];
  const hlAt = (u: number) => { const g = P(e, u, 0, 0.5); return Math.max(h0 + 0.12, terrain.heightAt(g.x, g.z) - e.gy); };
  for (let p = 0; p < nPairs; p++) {
    const uc = u0 + (p + 0.5) * pairW;
    const hl = hlAt(uc);
    openings.push({ kind: 'shop', u: uc, w: Math.min(3.9, pairW - 0.9), bottom: hl, top: Math.min(hl + 3.3, F0 - 0.95), variant: p % 3 });
    for (const sd of [-1, 1]) {
      const u = uc + sd * 1.15;
      const balcony = p === gablePair;
      openings.push({ kind: 'window', u, w: 1.2, bottom: balcony ? F0 + 0.35 : F0 + 0.95, spring: F0 + 2.75, top: F0 + 3.35, variant: (p * 2 + sd + 3) % 4, balcony });
      openings.push({ kind: 'window', u, w: 1.15, bottom: F1 + 0.75, top: F1 + 2.75, variant: (p * 3 + sd + 5) % 4 });
    }
  }
  // wall with openings, bay by bay
  const holes = openings.map(openingPolygon);
  const nOut = vN(e);
  wallWithHoles(G.wall, e, Array.from({ length: nPairs + 1 }, (_, p) => u0 + p * pairW), h0, topH, openings, wallC, 0.3);
  // reveals
  for (const [oi, o] of openings.entries()) {
    const poly = holes[oi], depth = o.kind === 'shop' ? 0.34 : 0.3;
    for (let j = 0; j < poly.length; j++) {
      const p = poly[j], q = poly[(j + 1) % poly.length];
      const du = q.x - p.x, dh = q.y - p.y, len = Math.hypot(du, dh);
      if (len < 1e-4) continue;
      const nIn = vT(e, -dh / len).add(UP.clone().multiplyScalar(du / len));
      G.flat.quad(P(e, p.x, p.y, 0), P(e, q.x, q.y, 0), P(e, q.x, q.y, -depth), P(e, p.x, p.y, -depth), nIn, [[0, 0], [len, 0], [len, depth], [0, depth]], wallC);
    }
  }
  const band = (y: number, h: number, out: number) => extrude(G.trim, e, 0, e.L, course(y, h, out), trimC, null, null);
  // ground-floor rusticated piers between shopfronts, first-floor sill band, storey cornices
  for (let p = 0; p <= nPairs; p++) {
    const u = u0 + p * pairW;
    for (let y = 0.3; y < F0 - 0.4; y += 0.55) box(G.flat, e, u, y + 0.25, 0.05, 0.55, 0.24, 0.05, trimC, true);
  }
  extrude(G.trim, e, 0, e.L, plinthProfile(h0, 0.1, 0.5), new THREE.Color('#8f8577'), null, null);
  band(F0 - 0.25, 0.45, 0.32);
  band(F1 - 0.15, 0.3, 0.2);
  // main cornice: architrave band, cyma reversa bed moulding, frieze with dentils, ovolo, a corona on
  // modillions and a crowning cyma recta
  const main = new Mould(0, F2).out(0.1).up(0.06).reversa(0.05, 0.12).out(0.012).up(0.012).up(0.256)
    .ovolo(0.1, 0.07).up(0.01).out(0.478).up(0.14).out(0.015).up(0.015).recta(0.06, 0.11).up(0.015).to(0, F2 + 0.9);
  extrude(G.trim, e, 0, e.L, main.p, trimC, null, null);
  for (let u = 0.3; u < e.L - 0.2; u += 0.32) box(G.flat, e, u, F2 + 0.4, 0.22, 0.07, 0.06, 0.1, trimC, true);
  for (let u = 0.5; u < e.L - 0.3; u += 1.1) box(G.trim, e, u, F2 + 0.49, 0.43, 0.09, 0.05, 0.27, trimC, true);
  // ornamental pilaster strips between the window pairs on both upper floors, and a frieze of panels
  for (let p = 0; p <= nPairs; p++) {
    const u = u0 + p * pairW;
    for (const [y0, y1] of [[F0 + 0.2, F1 - 0.15], [F1 + 0.15, F2 - 0.05]]) {
      box(G.flat, e, u, (y0 + y1) / 2, 0.04, 0.28, (y1 - y0) / 2, 0.04, trimC, true);
      box(G.flat, e, u, (y0 + y1) / 2, 0.09, 0.14, (y1 - y0) / 2 - 0.35, 0.03, trimC, true);
      for (let y = y0 + 0.6; y < y1 - 0.4; y += 1.2) G.trim.tri(P(e, u - 0.1, y, 0.13), P(e, u + 0.1, y, 0.13), P(e, u, y + 0.2, 0.13), nOut, [0, 0], [0.2, 0], [0.1, 0.2], trimC);
    }
  }
  for (const o of openings) {
    const l = o.u - o.w / 2, r = o.u + o.w / 2;
    if (o.kind === 'shop') {
      stats.shops++;
      const fC = new THREE.Color(FASCIA[Math.floor(o.u * 7) % FASCIA.length]);
      const d = -0.32, H = o.top - o.bottom;
      box(G.wood, e, o.u, o.bottom + 0.3, d, o.w / 2, 0.3, 0.03, fC, true);
      const doorAt = o.variant === 1 ? r - 0.6 : o.u;
      for (const [a, c] of [[l, doorAt - 0.5], [doorAt + 0.5, r]] as [number, number][]) {
        if (c - a < 0.3) continue;
        G.shop.quad(P(e, a, o.bottom + 0.6, d - 0.01), P(e, c, o.bottom + 0.6, d - 0.01), P(e, c, o.top, d - 0.01), P(e, a, o.top, d - 0.01), nOut, shopCell(Math.floor(a * 3)), white);
        box(G.wood, e, (a + c) / 2, o.bottom + 0.6 + (H - 0.6) * 0.78, d + 0.02, (c - a) / 2, 0.03, 0.02, fC, true);
      }
      box(G.wood, e, doorAt, o.bottom + H / 2, d - 0.03, 0.5, H / 2, 0.03, fC, true);
      G.glass.quad(P(e, doorAt - 0.35, o.bottom + H * 0.45, d), P(e, doorAt + 0.35, o.bottom + H * 0.45, d), P(e, doorAt + 0.35, o.top - 0.12, d), P(e, doorAt - 0.35, o.top - 0.12, d), nOut, [[0.5, 0.5], [1, 0.5], [1, 1], [0.5, 1]], white);
      // signboard across the pair
      box(G.wood, e, o.u, o.top + 0.4, 0.08, o.w / 2 + 0.2, 0.3, 0.08, fC, true);
      signQuad(G.sign, e, o.u, o.top + 0.13, o.top + 0.67, o.w / 2 + 0.15, 0.165, Math.floor(o.u * 7));
      box(G.trim, e, o.u, o.top + 0.75, 0.12, o.w / 2 + 0.3, 0.04, 0.12, trimC, true);
      if (o.variant === 2) {
        const aw = o.w / 2 + 0.25, ay = o.top + 0.05, out = 1.5, drop = 0.7;
        const A = P(e, o.u - aw, ay, 0.15), B = P(e, o.u + aw, ay, 0.15), C = P(e, o.u + aw, ay - drop, out), D = P(e, o.u - aw, ay - drop, out);
        const upv = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(B, A), new THREE.Vector3().subVectors(D, A)).normalize();
        if (upv.y < 0) upv.negate();
        G.canvas.quad(A, B, C, D, upv, [[0, 0], [aw * 2, 0], [aw * 2, 1], [0, 1]], new THREE.Color('#e4d9c2'));
      }
      continue;
    }
    stats.windows++;
    const d = -0.28;
    const vx = (o.variant % 2) * 0.5, vy = 1 - (Math.floor(o.variant / 2) + 1) * 0.5;
    const top = o.spring !== undefined ? o.spring : o.top;
    G.glass.quad(P(e, l, o.bottom, d), P(e, r, o.bottom, d), P(e, r, top, d), P(e, l, top, d), nOut, [[vx, vy], [vx + 0.5, vy], [vx + 0.5, vy + 0.5], [vx, vy + 0.5]], white);
    if (o.spring !== undefined) {
      // arched head: glass fan and a moulded archivolt, run down the jambs, with a keystone cartouche
      const R = o.w / 2, N = 10;
      for (let k = 0; k < N; k++) {
        const a0 = (Math.PI * k) / N, a1 = (Math.PI * (k + 1)) / N;
        const q = (a: number, rr: number, dd: number) => P(e, o.u + Math.cos(a) * rr, o.spring! + Math.sin(a) * rr, dd);
        G.glass.tri(P(e, o.u, o.spring!, d), q(a0, R, d), q(a1, R, d), nOut, [vx + 0.25, vy + 0.4], [vx + 0.5, vy + 0.5], [vx + 0.25, vy + 0.5], white);
      }
      const arc = openingPolygon(o).slice(2).reverse().map(p => [p.x, p.y]);
      frame(G.flat, e, [[l, o.bottom], ...arc, [r, o.bottom]], architrave(0.2, 0.06), trimC);
      box(G.trim, e, o.u, o.spring + R + 0.15, 0.1, 0.16, 0.24, 0.1, trimC, true);
    } else {
      // eared architrave and a cornice hood on consoles
      frame(G.flat, e, [[l, o.bottom], [l, o.top], [r, o.top], [r, o.bottom]], architrave(0.2, 0.07), trimC);
      for (const sd of [-1, 1]) box(G.flat, e, o.u + sd * (o.w / 2 + 0.25), o.top + 0.12, 0.04, 0.07, 0.1, 0.04, trimC, true); // ears
      box(G.trim, e, o.u, o.top + 0.35, 0.12, o.w / 2 + 0.35, 0.07, 0.12, trimC, true);
      box(G.flat, e, o.u, o.top + 0.24, 0.07, o.w / 2 - 0.1, 0.05, 0.04, trimC, true); // frieze
    }
    // sill with an apron panel
    box(G.trim, e, o.u, o.bottom - 0.05, 0.08, o.w / 2 + 0.24, 0.05, 0.1, trimC, true);
    if (!o.balcony) box(G.flat, e, o.u, o.bottom - 0.45, 0.03, o.w / 2 - 0.05, 0.3, 0.03, trimC, true);
  }
  // balcony on consoles over the gable pair
  if (gablePair >= 0) {
    const uc = u0 + (gablePair + 0.5) * pairW, bw = 4.2, by = F0 + 0.2;
    box(G.trim, e, uc, by, 0.55, bw / 2, 0.1, 0.55, trimC, true);
    for (const sd of [-1, -0.33, 0.33, 1]) box(G.trim, e, uc + sd * (bw / 2 - 0.3), by - 0.35, 0.3, 0.1, 0.25, 0.3, trimC, true);
    const rh = 1.0;
    box(G.iron, e, uc, by + 0.1 + rh, 1.05, bw / 2, 0.025, 0.03, white);
    for (const sd of [-1, 1]) box(G.iron, e, uc + sd * (bw / 2 - 0.02), by + 0.1 + rh, 0.55, 0.02, 0.025, 0.52, white);
    for (let x = -bw / 2 + 0.08; x < bw / 2; x += 0.12) box(G.iron, e, uc + x, by + 0.1 + rh / 2, 1.05, 0.009, rh / 2, 0.009, white);
    for (const sd of [-1, 1]) for (let dd = 0.1; dd < 1.05; dd += 0.12) box(G.iron, e, uc + sd * (bw / 2 - 0.02), by + 0.1 + rh / 2, dd, 0.009, rh / 2, 0.009, white);
    // baroque gable over the cornice: scroll sides, oval window, capped by a segmental cornice and finial
    const gw = 5.4, gy = F2 + 0.9, gh = 3.2;
    const sh = new THREE.Shape();
    sh.moveTo(-gw / 2, 0); sh.lineTo(gw / 2, 0);
    sh.bezierCurveTo(gw / 2 - 0.2, 0.9, gw / 2 - 1.3, 0.9, gw / 2 - 1.1, gh * 0.72);
    sh.quadraticCurveTo(0, gh * 1.12, -gw / 2 + 1.1, gh * 0.72);
    sh.bezierCurveTo(-gw / 2 + 1.3, 0.9, -gw / 2 + 0.2, 0.9, -gw / 2, 0);
    const oval = new THREE.Path(); oval.absellipse(0, gh * 0.45, 0.45, 0.6, 0, Math.PI * 2, true);
    sh.holes.push(oval);
    const gg = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: false, curveSegments: 16 }).translate(0, 0, -0.45);
    onEdge(G.wall, gg, e, uc, gy, wallC);
    const og = new THREE.TorusGeometry(0.52, 0.08, 6, 24).scale(1, 1.3, 1).translate(0, gh * 0.45, 0.08);
    onEdge(G.trim, og, e, uc, gy, trimC);
    const ovalGlass = new THREE.CircleGeometry(0.45, 20).scale(1, 1.33, 1).translate(0, gh * 0.45, -0.3);
    onEdge(G.glass, ovalGlass, e, uc, gy, white);
    const cap = new THREE.TorusGeometry(gw * 0.32, 0.09, 6, 16, Math.PI * 0.62).rotateZ(Math.PI * 0.19).translate(0, gh * 0.93 - gw * 0.32, 0.05);
    onEdge(G.trim, cap, e, uc, gy, trimC);
    for (const sd of [-1, 1]) onEdge(G.trim, new THREE.TorusGeometry(0.22, 0.08, 6, 12).translate(sd * (gw / 2 - 0.35), 0.35, 0.05), e, uc, gy, trimC);
    onEdge(G.trim, new THREE.SphereGeometry(0.2, 10, 8).scale(1, 1.4, 1).translate(0, gh + 0.35, -0.2), e, uc, gy, trimC);
  }
}

// --- Hero façade: Hotel Italia behind the Town Hall (postcard "Ulica Wielka", c.1910) ------------------
// Four storeys: shops with a glass canopy at the hotel door, pedimented windows (triangular, then
// segmental, then eared), iron balconies, a bracketed cornice and the HOTEL ITALIA signboard.
function hotelFacade(e: Edge, topH: number, h0: number, terrain: Terrain,
  G: { wall: GeoBuilder; trim: GeoBuilder; flat: GeoBuilder; glass: GeoBuilder; wood: GeoBuilder; canvas: GeoBuilder; iron: GeoBuilder; shop: GeoBuilder; sign: GeoBuilder },
  wallC: THREE.Color, trimC: THREE.Color, stats: FacadeStats, extras: THREE.Object3D[], signMat: THREE.Material | null): void {
  const F = [4.6, 8.4, 12.1], FC = topH - 0.95;
  const white = new THREE.Color('#ffffff');
  const nPairs = Math.max(1, Math.round((e.L - 1.6) / 4.6));
  const pairW = (e.L - 1.6) / nPairs, u0 = 0.8;
  const openings: Opening[] = [];
  const hlAt = (u: number) => { const g = P(e, u, 0, 0.5); return Math.max(h0 + 0.12, terrain.heightAt(g.x, g.z) - e.gy); };
  const doorPair = Math.floor(nPairs / 2);
  for (let p = 0; p < nPairs; p++) {
    const uc = u0 + (p + 0.5) * pairW, hl = hlAt(uc);
    openings.push({ kind: 'shop', u: uc, w: Math.min(3.6, pairW - 0.9), bottom: hl, top: Math.min(hl + 3.2, F[0] - 0.95), variant: p === doorPair ? 0 : (p % 2) + 1 });
    for (const sd of [-1, 1]) {
      const u = uc + sd * 1.1;
      for (let f = 0; f < 3; f++) {
        const base = F[f], balcony = (f === 0 && (p === 1 || p === nPairs - 2)) || (f === 1 && p === doorPair);
        openings.push({ kind: 'window', u, w: 1.15, bottom: base + (balcony ? 0.3 : 0.85), top: base + 2.75 - (f === 2 ? 0.2 : 0), variant: (p * 5 + f * 3 + sd + 7) % 4, balcony, pediment: f === 0 ? 1 : f === 1 ? 2 : 0 });
      }
    }
  }
  const holes = openings.map(openingPolygon), nOut = vN(e);
  wallWithHoles(G.wall, e, Array.from({ length: nPairs + 1 }, (_, p) => u0 + p * pairW), h0, topH, openings, wallC, 0.6);
  for (const [oi, o] of openings.entries()) {
    const poly = holes[oi], depth = o.kind === 'shop' ? 0.34 : 0.3;
    for (let j = 0; j < poly.length; j++) {
      const p = poly[j], q = poly[(j + 1) % poly.length], du = q.x - p.x, dh = q.y - p.y, len = Math.hypot(du, dh);
      if (len < 1e-4) continue;
      const nIn = vT(e, -dh / len).add(UP.clone().multiplyScalar(du / len));
      G.flat.quad(P(e, p.x, p.y, 0), P(e, q.x, q.y, 0), P(e, q.x, q.y, -depth), P(e, p.x, p.y, -depth), nIn, [[0, 0], [len, 0], [len, depth], [0, depth]], wallC);
    }
  }
  const band = (y: number, h: number, out: number) => extrude(G.trim, e, 0, e.L, course(y, h, out), trimC, null, null);
  extrude(G.trim, e, 0, e.L, plinthProfile(h0, 0.1, 0.5), new THREE.Color('#8f8577'), null, null);
  band(F[0] - 0.3, 0.5, 0.32); band(F[1] - 0.15, 0.25, 0.18); band(F[2] - 0.15, 0.25, 0.18);
  // bracketed cornice: bed moulding, frieze, ovolo, corona on scrolled consoles, crowning cyma
  const main = new Mould(0, FC).out(0.12).up(0.08).reversa(0.06, 0.14).out(0.012).up(0.012).up(0.288)
    .ovolo(0.108, 0.08).up(0.012).out(0.568).up(0.148).out(0.015).up(0.015).recta(0.055, 0.1).up(0.012).to(0, FC + 0.95);
  extrude(G.trim, e, 0, e.L, main.p, trimC, null, null);
  for (let u = 0.45; u < e.L - 0.3; u += 0.9) {                                                                 // cornice brackets
    box(G.trim, e, u, FC + 0.51, 0.49, 0.085, 0.1, 0.34, trimC, true);
    box(G.trim, e, u, FC + 0.36, 0.13, 0.07, 0.06, 0.1, trimC, true);
  }
  for (let p = 0; p <= nPairs; p++) {                                                                          // rusticated piers, pilasters
    const u = u0 + p * pairW;
    for (let y = 0.3; y < F[0] - 0.45; y += 0.5) box(G.flat, e, u, y + 0.22, 0.05, 0.5, 0.22, 0.05, trimC, true);
    box(G.flat, e, u, (F[0] + FC) / 2, 0.05, 0.3, (FC - F[0]) / 2 - 0.1, 0.05, trimC, true);
  }
  for (const o of openings) {
    const l = o.u - o.w / 2, r = o.u + o.w / 2;
    if (o.kind === 'shop') {
      stats.shops++;
      const fC = new THREE.Color(o.variant === 0 ? '#2a2420' : FASCIA[Math.floor(o.u * 5) % FASCIA.length]), d = -0.32, H = o.top - o.bottom;
      box(G.wood, e, o.u, o.bottom + 0.3, d, o.w / 2, 0.3, 0.03, fC, true);
      const doorAt = o.variant === 2 ? r - 0.6 : o.u;
      for (const [a, c] of [[l, doorAt - 0.55], [doorAt + 0.55, r]] as [number, number][]) {
        if (c - a < 0.3) continue;
        G.shop.quad(P(e, a, o.bottom + 0.6, d - 0.01), P(e, c, o.bottom + 0.6, d - 0.01), P(e, c, o.top, d - 0.01), P(e, a, o.top, d - 0.01), nOut, shopCell(Math.floor(a * 3)), white);
      }
      box(G.wood, e, doorAt, o.bottom + H / 2, d - 0.03, 0.55, H / 2, 0.03, fC, true);
      box(G.wood, e, o.u, o.top + 0.38, 0.08, o.w / 2 + 0.2, 0.28, 0.08, fC, true);
      if (o.variant !== 0) signQuad(G.sign, e, o.u, o.top + 0.13, o.top + 0.63, o.w / 2 + 0.15, 0.165, Math.floor(o.u * 11) + 3);
      if (o.variant === 0) {
        // the hotel door: glass-and-iron canopy on brackets
        const cw = 2.4, cy = o.top + 0.05, out = 1.8;
        box(G.iron, e, o.u, cy, out / 2, cw / 2, 0.04, out / 2, white);
        for (const sd of [-1, 1]) box(G.iron, e, o.u + sd * (cw / 2 - 0.05), cy - 0.35, out / 2, 0.03, 0.03, out / 2, white);
        G.glass.quad(P(e, o.u - cw / 2, cy + 0.05, 0.05), P(e, o.u + cw / 2, cy + 0.05, 0.05), P(e, o.u + cw / 2, cy + 0.2, out), P(e, o.u - cw / 2, cy + 0.2, out), UP, [[0.5, 0.5], [1, 0.5], [1, 1], [0.5, 1]], white);
      } else if (o.variant === 1) {
        const aw = o.w / 2 + 0.25, ay = o.top + 0.05, out = 1.4, drop = 0.65;
        const A = P(e, o.u - aw, ay, 0.15), B = P(e, o.u + aw, ay, 0.15), C = P(e, o.u + aw, ay - drop, out), D = P(e, o.u - aw, ay - drop, out);
        const upv = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(B, A), new THREE.Vector3().subVectors(D, A)).normalize();
        if (upv.y < 0) upv.negate();
        G.canvas.quad(A, B, C, D, upv, [[0, 0], [aw * 2, 0], [aw * 2, 1], [0, 1]], new THREE.Color('#d9ccb0'));
      }
      continue;
    }
    stats.windows++;
    const d = -0.28, vx = (o.variant % 2) * 0.5, vy = 1 - (Math.floor(o.variant / 2) + 1) * 0.5;
    G.glass.quad(P(e, l, o.bottom, d), P(e, r, o.bottom, d), P(e, r, o.top, d), P(e, l, o.top, d), nOut, [[vx, vy], [vx + 0.5, vy], [vx + 0.5, vy + 0.5], [vx, vy + 0.5]], white);
    frame(G.flat, e, [[l, o.bottom], [l, o.top], [r, o.top], [r, o.bottom]], architrave(0.2, 0.07), trimC);
    box(G.trim, e, o.u, o.bottom - 0.05, 0.08, o.w / 2 + 0.24, 0.05, 0.1, trimC, true);
    const span = o.w / 2 + 0.3, yb = o.top + 0.22;
    if (o.pediment === 1) {
      box(G.trim, e, o.u, yb, 0.08, span, 0.05, 0.08, trimC, true);
      frame(G.trim, e, [[o.u - span, yb + 0.05], [o.u, yb + 0.45], [o.u + span, yb + 0.05]], rake(0.1, 0.15), trimC, true);
    } else if (o.pediment === 2) {
      box(G.trim, e, o.u, yb, 0.08, span, 0.05, 0.08, trimC, true);
      frame(G.trim, e, segmentArc(o.u, yb + 0.05, span, 1.3, 6), rake(0.1, 0.15), trimC, true);
    } else {
      box(G.trim, e, o.u, yb + 0.02, 0.1, span - 0.05, 0.06, 0.1, trimC, true);
    }
    if (o.balcony) {
      const bw = 2.1, by = o.bottom - 0.18;
      box(G.trim, e, o.u, by, 0.5, bw / 2, 0.09, 0.5, trimC, true);
      for (const sd of [-1, 1]) box(G.trim, e, o.u + sd * (bw / 2 - 0.2), by - 0.3, 0.25, 0.08, 0.22, 0.25, trimC, true);
      box(G.iron, e, o.u, by + 1.05, 0.96, bw / 2, 0.022, 0.03, white);
      for (let x = -bw / 2 + 0.07; x < bw / 2; x += 0.12) box(G.iron, e, o.u + x, by + 0.55, 0.96, 0.009, 0.5, 0.009, white);
      for (const sd of [-1, 1]) for (let dd = 0.1; dd < 0.95; dd += 0.12) box(G.iron, e, o.u + sd * (bw / 2 - 0.02), by + 0.55, dd, 0.009, 0.5, 0.009, white);
    }
  }
  // HOTEL ITALIA signboard across the middle of the front, between ground and first floor
  if (signMat && e.L > 14) {
    const sw = Math.min(9, e.L * 0.45), sh = 0.8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), signMat);
    m.position.copy(P(e, e.L / 2, F[0] + 0.2, 0.36));
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(UP, vN(e)).normalize(), UP, vN(e)));
    m.castShadow = true;
    extras.push(m);
  }
}

function hotelSign(): THREE.MeshStandardMaterial {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8e0cc'; g.fillRect(0, 0, 1024, 96);
  g.strokeStyle = '#3a3128'; g.lineWidth = 6; g.strokeRect(6, 6, 1012, 84);
  g.fillStyle = '#2a241e'; g.font = 'bold 64px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('HOTEL  ITALIA', 512, 52);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
}

/** Corner turret: an octagonal oriel on corbels from the first floor, a drum, bell dome, lantern and spire. */
function cornerTurret(cx: number, cz: number, dirX: number, dirZ: number, gy: number, topH: number,
  G: { wall: GeoBuilder; trim: GeoBuilder; glass: GeoBuilder; metal: GeoBuilder }, wallC: THREE.Color, trimC: THREE.Color): void {
  const R = 2.3, x = cx + dirX * 1.0, z = cz + dirZ * 1.0, y0 = gy + 4.8, y1 = gy + topH + 1.8;
  const mk = (g: THREE.BufferGeometry, b: GeoBuilder, c: THREE.Color) => {
    const src = (g.index ? g.toNonIndexed() : g);
    src.translate(x, 0, z);
    const pos = src.getAttribute('position'), nor = src.getAttribute('normal');
    const a = new THREE.Vector3(), bb = new THREE.Vector3(), cc = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i); bb.fromBufferAttribute(pos, i + 1); cc.fromBufferAttribute(pos, i + 2); n.fromBufferAttribute(nor, i);
      b.tri(a.clone(), bb.clone(), cc.clone(), n.clone(), [a.x * 0.4, a.y * 0.4], [bb.x * 0.4, bb.y * 0.4], [cc.x * 0.4, cc.y * 0.4], c);
    }
  };
  mk(new THREE.ConeGeometry(R, 1.6, 8, 1, true).rotateX(Math.PI).translate(0, y0 - 0.8, 0), G.trim, trimC);   // corbel
  mk(new THREE.CylinderGeometry(R, R, y1 - y0, 8, 1).translate(0, (y0 + y1) / 2, 0), G.wall, wallC);
  for (let f = 0; f < 3; f++) {
    const yy = y0 + 0.9 + f * 3.7;
    for (let k = 0; k < 8; k += 2) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const g = new THREE.PlaneGeometry(0.9, 2.0).rotateY(-a + Math.PI / 2).translate(Math.cos(a) * (R * 0.93), yy + 1.0, Math.sin(a) * (R * 0.93));
      mk(g, G.glass, new THREE.Color('#ffffff'));
    }
    mk(new THREE.CylinderGeometry(R + 0.12, R + 0.12, 0.22, 8).translate(0, yy - 0.3, 0), G.trim, trimC);
  }
  mk(new THREE.CylinderGeometry(R + 0.35, R + 0.35, 0.5, 8).translate(0, y1, 0), G.trim, trimC);
  mk(new THREE.CylinderGeometry(R * 0.85, R * 0.9, 1.6, 8).translate(0, y1 + 1.05, 0), G.wall, wallC);
  const bell = new THREE.LatheGeometry([[0, 0], [R * 0.95, 0], [R, 0.3], [R * 0.85, 1.3], [R * 0.5, 2.0], [R * 0.3, 2.4], [R * 0.34, 2.8], [0.25, 3.1], [0, 3.2]].map(([a, b]) => new THREE.Vector2(a, b)), 16);
  mk(bell.translate(0, y1 + 1.85, 0), G.metal, new THREE.Color('#566064'));
  mk(new THREE.CylinderGeometry(0.35, 0.4, 1.0, 8).translate(0, y1 + 5.3, 0), G.wall, wallC);
  mk(new THREE.ConeGeometry(0.42, 2.4, 8).translate(0, y1 + 7.0, 0), G.metal, new THREE.Color('#566064'));
}

const shopCell = (k: number): number[][] => { const c = ((k % 4) + 4) % 4, cx = (c % 2) * 0.5, cy = c < 2 ? 0.5 : 0; return [[cx, cy], [cx + 0.5, cy], [cx + 0.5, cy + 0.5], [cx, cy + 0.5]]; };
const signRow = (k: number): number[][] => { const r = ((k % 16) + 16) % 16, v0 = 1 - (r + 1) / 16, v1 = 1 - r / 16; return [[0, v0], [1, v0], [1, v1], [0, v1]]; };
function signQuad(b: GeoBuilder, e: Edge, u: number, y0: number, y1: number, hw: number, d: number, k: number): void {
  // lettering must read left to right for someone facing the wall: run it along the viewer's right (up x n)
  const n = vN(e), right = new THREE.Vector3().crossVectors(UP, n).normalize();
  const c = P(e, u, 0, d);
  const at = (s: number, y: number) => new THREE.Vector3(c.x + right.x * s, c.y + y, c.z + right.z * s);
  b.quad(at(-hw, y0), at(hw, y0), at(hw, y1), at(-hw, y1), n, signRow(k), new THREE.Color('#ffffff'));
}

export interface FacadeStats { houses: number; windows: number; doors: number; shops: number; triangles: number; heroDebug?: unknown[] }

// Shopfront fascia (signboard) and awning colours, after the period photographs of Wielka street
const FASCIA = ['#3f5a48', '#6e2e26', '#34425c', '#5a4632', '#8a6a34', '#cfc2a4', '#4a5e4a', '#7a5a3c'];
const AWNING = ['#e8dcc0', '#c8b48a', '#7a3b2c', '#3e5a44', '#d6c8a4', '#8a6a3a'];

export function buildFacades(data: AreaData, terrain: Terrain, mats: HouseMaterials, free?: (x: number, z: number) => boolean): { group: THREE.Group; stats: FacadeStats; lamps: LampSpot[] } {
  const houses = data.buildings.filter(b => b.detail);
  // Neighbours for party-wall tests: every building whose bounding box is near
  const boxes = data.buildings.map(b => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of b.rings[0]) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    return { b, x0, z0, x1, z1 };
  });

  const wall = new GeoBuilder(['aWall', 'aLayout', 'aLayout2']);
  // flat: thin mouldings whose shadows are too small to matter (AO shades them); kept out of the shadow maps
  const trim = new GeoBuilder(), flat = new GeoBuilder(), glass = new GeoBuilder(), wood = new GeoBuilder([], 0.4);
  const canvas = new GeoBuilder(), iron = new GeoBuilder([], 0), metal = new GeoBuilder([], 0.5), shop = new GeoBuilder(), sign = new GeoBuilder();
  const extras: THREE.Object3D[] = [];
  const lamps: LampSpot[] = [];
  const signMat = houses.some(h => h.style === 'hotel') ? hotelSign() : null;
  const stats: FacadeStats = { houses: houses.length, windows: 0, doors: 0, shops: 0, triangles: 0 };
  // open ground ahead of a wall: how far the street or square reaches (m, up to 30)
  const frontage = (e: Edge): number => {
    if (!free) return 0;
    const mx = e.ax + e.tx * e.L / 2, mz = e.az + e.tz * e.L / 2;
    for (let d = 1.5; d <= 30; d += 1.5) if (!free(mx + e.nx * d, mz + e.nz * d)) return d;
    return 30;
  };
  const cWhite = new THREE.Color();

  for (const b of houses) {
    const seed = hashString(b.id);
    const tint = new THREE.Color(LIMEWASH[seed % LIMEWASH.length]);
    const trimStyle = (seed >>> 5) % 3;
    const trimC = trimStyle === 0 ? new THREE.Color('#e6dac2') : trimStyle === 1 ? tint.clone().lerp(cWhite.set('#f4ead6'), 0.45) : new THREE.Color('#cdbd9f');
    const plinthC = new THREE.Color('#978b7b');
    const shutterC = new THREE.Color(SHUTTERS[(seed >>> 9) % SHUTTERS.length]);
    const doorC = new THREE.Color(DOORS[(seed >>> 13) % DOORS.length]);
    const hasShutters = rnd(seed, 1) > 0.6, hasHoods = rnd(seed, 2) > 0.3, hasPilasters = rnd(seed, 3) > 0.55, bracketed = rnd(seed, 12) > 0.35;
    const bayTarget = 2.9 + 0.8 * rnd(seed, 4);
    const k = b.roof?.k ?? 0, ov = b.overhang ?? 0;
    const topH = b.eaveY - b.groundY + ov * k;
    const h0 = b.baseY - b.groundY;
    const nUp = Math.max(0, Math.floor((topH - GROUND_F - 0.9) / UPPER_F + 0.05));
    const me = boxes.find(o => o.b === b)!;
    const near = boxes.filter(o => o.b !== b && o.x1 > me.x0 - 2 && o.x0 < me.x1 + 2 && o.z1 > me.z0 - 2 && o.z0 < me.z1 + 2);

    b.rings.forEach((ring, ri) => {
      const n = ring.length;
      // Edge frames with outward normals and party-wall flags
      const edges: Edge[] = ring.map((a, i) => {
        const c = ring[(i + 1) % n];
        const L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1e-6;
        const tx = (c[0] - a[0]) / L, tz = (c[1] - a[1]) / L;
        let nx = tz, nz = -tx;
        const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
        if (insideBuilding(b, mx + nx * 0.05, mz + nz * 0.05)) { nx = -nx; nz = -nz; }
        let hits = 0;
        for (const f of [0.2, 0.5, 0.8]) {
          const px = a[0] + tx * L * f + nx * 0.6, pz = a[1] + tz * L * f + nz * 0.6;
          if (near.some(o => px >= o.x0 && px <= o.x1 && pz >= o.z0 && pz <= o.z1 && insideBuilding(o.b, px, pz))) hits++;
        }
        return { ax: a[0], az: a[1], tx, tz, nx, nz, L, gy: b.groundY, party: hits >= 2 };
      });
      const miterAt = (i: number): [number, number] | null => {
        const ep = edges[(i - 1 + n) % n], ec = edges[i];
        if (ep.party || ec.party || ep.L < 0.05) return null;
        let mx = ep.nx + ec.nx, mz = ep.nz + ec.nz;
        const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
        const dot = mx * ec.nx + mz * ec.nz;
        if (dot < 0.5) return null; // sharp corner: square, capped ends instead of a long spike
        return [mx / dot, mz / dot];
      };

      // hero buildings: the square-facing front is modelled from the photograph
      // the square-facing front may be several slightly angled wall segments: take every open, square-facing
      // edge within 30 degrees of the longest one; the gable goes on the longest
      const heroEdges = new Set<number>();
      let gableEdge = -1;
      if (b.style && ri === 0) {
        const cand = edges.map((e, i) => ({ e, i })).filter(({ e }) => !e.party && e.L > 8 && frontage(e) >= (b.style === 'hotel' ? 6 : 12));
        const main = cand.reduce<{ e: Edge; i: number } | null>((m, c) => (!m || c.e.L > m.e.L ? c : m), null);
        if (main) {
          gableEdge = main.i;
          for (const c of cand) if (b.style === 'hotel' || c.e.nx * main.e.nx + c.e.nz * main.e.nz > 0.86) heroEdges.add(c.i);
        }
      }
      edges.forEach((e, i) => {
        if (e.L < 0.05) return;
        if (heroEdges.has(i)) {
          if (b.style === 'hotel') hotelFacade(e, topH, h0, terrain, { wall, trim, flat, glass, wood, canvas, iron, shop, sign }, new THREE.Color('#d9cdb4'), new THREE.Color('#ece3d0'), stats, extras, i === gableEdge ? signMat : null);
          else heroFacade(e, topH, h0, terrain, { wall, trim, flat, glass, wood, canvas, iron, shop, sign }, new THREE.Color('#e3dccb'), new THREE.Color('#efe9dc'), stats, i === gableEdge);
          return;
        }
        const eseed = hashString(`${b.id}:${ri}:${i}`);
        // --- Openings -------------------------------------------------------------------------------
        const openings: Opening[] = [];
        let u0 = 0.7, bayW = 0, nb = 0, halfW = 0;
        const front = ri === 0 && !e.party ? frontage(e) : 0;
        const shopEdge = front >= 12 ? rnd(eseed, 11) < 0.92 : front >= 5 ? rnd(eseed, 11) < 0.45 : false;
        const grand = front >= 12;              // houses facing the square: richer upper storeys
        if (!e.party && e.L >= 2.6) {
          const usable = e.L - 1.4;
          nb = Math.max(1, Math.floor(usable / bayTarget));
          bayW = usable / nb;
          halfW = Math.min(0.55, (bayW - 0.75) / 2);
          if (halfW < 0.32) nb = 0;
        }
        if (nb > 0) {
          const doorEvery = 2 + Math.floor(rnd(eseed, 5) * 2), doorOff = Math.floor(rnd(eseed, 6) * doorEvery);
          const gateBay = e.L >= 13 && rnd(eseed, 7) > 0.3 ? Math.floor(nb / 2) : -1;
          for (let bi = 0; bi < nb; bi++) {
            const u = u0 + (bi + 0.5) * bayW;
            const g = P(e, u, 0, 0.5);
            const hl = Math.max(h0 + 0.12, terrain.heightAt(g.x, g.z) - e.gy);
            // Ground floor
            if (shopEdge && bi !== gateBay && hl < 0.9 && hl > h0 + 0.05) {
              // every shop its own size, position in the bay and shape (square or arched head)
              const ss = hashString(`${b.id}:${ri}:${i}:${bi}`);
              const wMax = Math.min(3.5, bayW - 0.35);
              const w = Math.max(1.5, wMax * (0.6 + 0.4 * rnd(ss, 1)));
              const top = Math.min(hl + 2.35 + 0.95 * rnd(ss, 2), GROUND_F - 0.8);
              const arched = rnd(ss, 3) < 0.75 && top - hl > 2.2;   // most shops open through arches, as in the period views
              const rise = arched ? (rnd(ss, 4) < 0.6 ? Math.min(w / 2, top - hl - 1.6) : Math.min(w / 2 - 0.01, 0.35 + 0.6 * rnd(ss, 5))) : undefined;
              const du = (rnd(ss, 6) - 0.5) * Math.max(0, bayW - 0.35 - w) * 0.8;
              openings.push({ kind: 'shop', u: u + du, w, bottom: hl, top, spring: arched ? top - rise! : undefined, rise, variant: ss });
            } else if (bi === gateBay && hl < 0.9) {
              const w = Math.min(2.6, bayW - 0.4);
              openings.push({ kind: 'gate', u, w, bottom: hl, spring: hl + 1.9, top: hl + 1.9 + w / 2, variant: 0 });
            } else if ((bi + doorOff) % doorEvery === 0 && hl < 0.95 && hl > h0 + 0.1) {
              openings.push({ kind: 'door', u, w: 1.3, bottom: hl, spring: hl + 2.05, top: hl + 2.7, variant: 0 });
            } else {
              const sill = Math.max(1.15, hl + 0.75), top = sill + 1.35;
              if (top < GROUND_F - 0.35) openings.push({ kind: 'gwindow', u, w: Math.min(1.0, halfW * 2 - 0.1), bottom: sill, top, variant: eseed % 4 });
            }
            // Upper floors
            for (let s = 1; s <= nUp; s++) {
              const nobile = grand && s === 1;           // the first floor: taller windows, pediments
              const balcony = nobile && nb >= 3 && bi === Math.floor(nb / 2);
              const sill = GROUND_F + (s - 1) * UPPER_F + (balcony ? 0.3 : nobile ? 0.7 : 0.85), top = GROUND_F + (s - 1) * UPPER_F + (nobile ? 2.8 : 2.65);
              if (top > topH - 0.95) break;
              openings.push({ kind: 'window', u, w: halfW * 2, bottom: sill, top, variant: (eseed + bi * 7 + s * 3) % 4, balcony, pediment: nobile ? (bi % 2 === 0 ? 1 : 2) : 0 });
            }
          }
        }

        // --- Wall surface with the openings cut out ------------------------------------------------
        // Every opening must sit fully inside the wall, clear of the plinth line and the cornice.
        for (let k = openings.length - 1; k >= 0; k--) {
          const o = openings[k];
          if (o.bottom < h0 + 0.05 || o.top + (o.spring !== undefined ? 0.3 : 0.2) > topH - 0.85 || o.u - o.w / 2 < 0.35 || o.u + o.w / 2 > e.L - 0.35) openings.splice(k, 1);
        }
        // Old walls are not ruler-straight: between its corners this one bellies out and sags by a centimetre
        // or three. The offsets are piecewise linear between knots on the piers, so each bay moves as one and
        // nothing set into it parts from the wall; the corners stay put for the neighbouring walls.
        const knots = [0];
        for (const u of nb > 0 ? Array.from({ length: nb - 1 }, (_, k) => u0 + (k + 1) * bayW) : [e.L / 2]) if (u - knots[knots.length - 1] >= 4.5 && e.L - u >= 3) knots.push(u);
        knots.push(e.L);
        if (!e.party && knots.length > 2) {
          const A = 0.012 + 0.03 * rnd(eseed, 61), B = 0.008 + 0.024 * rnd(eseed, 62);   // (the eave leaves room for both)
          e.knots = knots;
          e.wo = knots.map((u, k) => A * Math.sin((Math.PI * u) / e.L) * (0.65 + 0.35 * rnd(eseed, 63 + k)));
          e.wv = knots.map((u, k) => B * Math.sin((Math.PI * u) / e.L) * (0.6 + 0.4 * rnd(eseed, 83 + k)));
        }
        // cut column by column between the knots; if a triangulation goes wrong, fall back to a blank wall
        const areaOf = (pts: THREE.Vector2[]) => Math.abs(THREE.ShapeUtils.area(pts));
        const cutWall = (ops: Opening[]): THREE.Vector2[][] | null => {
          const out: THREE.Vector2[][] = [];
          for (let c = 0; c + 1 < knots.length; c++) {
            const x0 = knots[c], x1 = knots[c + 1];
            if (x1 - x0 < 1e-3) continue;
            // (the wall head stops 5 cm under the roof line, inside the eave, so a bellied wall never shows through the roof)
            const contour = [new THREE.Vector2(x0, h0), new THREE.Vector2(x1, h0), new THREE.Vector2(x1, topH - 0.05), new THREE.Vector2(x0, topH - 0.05)];
            const hs = ops.filter(o => o.u > x0 && o.u < x1).map(openingPolygon), all = contour.concat(...hs);
            const tris = THREE.ShapeUtils.triangulateShape(contour, hs);
            const expect = (x1 - x0) * (topH - 0.05 - h0) - hs.reduce((a, h) => a + areaOf(h), 0);
            const got = tris.reduce((a, [i0, i1, i2]) => a + areaOf([all[i0], all[i1], all[i2]]), 0);
            if (!tris.length || Math.abs(got - expect) > 0.01 * expect + 0.05) return null;
            for (const [i0, i1, i2] of tris) out.push([all[i0], all[i1], all[i2]]);
          }
          return out;
        };
        let wallTris = cutWall(openings);
        if (!wallTris) { openings.length = 0; wallTris = cutWall([])!; }
        const holes = openings.map(openingPolygon);
        const layout = [u0, bayW, openings.some(o => o.kind === "window") ? nb : 0, halfW], layout2 = [nUp, 0, 0, 0];
        const nOut = vN(e);
        for (const [va, vb, vc] of wallTris) {
          const ex = [[[va.x, va.y, topH, (seed % 997) / 997], [vb.x, vb.y, topH, (seed % 997) / 997], [vc.x, vc.y, topH, (seed % 997) / 997]],
            [layout, layout, layout], [layout2, layout2, layout2]];
          wall.tri(P(e, va.x, va.y, 0), P(e, vb.x, vb.y, 0), P(e, vc.x, vc.y, 0), nOut,
            [va.x / 2.5, va.y / 2.5], [vb.x / 2.5, vb.y / 2.5], [vc.x / 2.5, vc.y / 2.5], tint, ex);
        }

        // --- Reveals, glazing, doors, trim ---------------------------------------------------------
        for (const [oi, o] of openings.entries()) {
          const poly = holes[oi];
          const depth = o.kind === 'door' || o.kind === 'gate' ? DOOR_DEPTH : o.kind === 'shop' ? 0.32 : WIN_DEPTH;
          for (let j = 0; j < poly.length; j++) {
            const p = poly[j], q = poly[(j + 1) % poly.length];
            const du = q.x - p.x, dh = q.y - p.y, len = Math.hypot(du, dh);
            if (len < 1e-4) continue;
            const nIn = vT(e, -dh / len).add(UP.clone().multiplyScalar(du / len)); // towards the opening's centre
            const reveal = { ...e };
            const ex = [[[p.x, p.y, topH, 0], [q.x, q.y, topH, 0], [q.x, q.y, topH, 0]], [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]];
            const A = P(reveal, p.x, p.y, 0), B = P(reveal, q.x, q.y, 0), C = P(reveal, q.x, q.y, -depth), D = P(reveal, p.x, p.y, -depth);
            wall.tri(A, B, C, nIn, [0, 0], [len / 2.5, 0], [len / 2.5, depth / 2.5], tint, ex);
            wall.tri(A, C, D, nIn, [0, 0], [len / 2.5, depth / 2.5], [0, depth / 2.5], tint, ex);
          }
          const l = o.u - o.w / 2, r = o.u + o.w / 2;
          if (o.kind === 'window' || o.kind === 'gwindow') {
            stats.windows++;
            const vx = (o.variant % 2) * 0.5, vy = 1 - (Math.floor(o.variant / 2) + 1) * 0.5;
            glass.quad(P(e, l, o.bottom, -depth), P(e, r, o.bottom, -depth), P(e, r, o.top, -depth), P(e, l, o.top, -depth), nOut,
              [[vx, vy], [vx + 0.5, vy], [vx + 0.5, vy + 0.5], [vx, vy + 0.5]], cWhite.set('#ffffff'));
            // Sill, a stepped architrave with a raised bead, and (upper floors) a hood moulding and open shutters
            const sw = o.kind === 'window' ? 0.14 : 0.11;
            box(trim, e, o.u, o.bottom - 0.04, (0.09 - depth + 0.02) / 2, o.w / 2 + sw + 0.04, 0.04, (0.09 + depth - 0.02) / 2, trimC, true);
            frame(flat, e, [[l, o.bottom], [l, o.top], [r, o.top], [r, o.bottom]], architrave(sw), trimC);
            if (o.kind === 'window' && o.pediment) {
              // triangular (1) or segmental (2) pediment on consoles
              const span = o.w / 2 + 0.3, yb = o.top + sw + 0.02;
              box(trim, e, o.u, yb + 0.06, 0.07, span, 0.06, 0.07, trimC, true);
              // raking cornices with a crowning cyma, run up from the base cornice
              if (o.pediment === 1) frame(trim, e, [[o.u - span, yb + 0.12], [o.u, yb + 0.54], [o.u + span, yb + 0.12]], rake(0.1, 0.14), trimC, true);
              else frame(trim, e, segmentArc(o.u, yb + 0.12, span, 1.25, 6), rake(0.1, 0.14), trimC, true);
              for (const sd of [-1, 1]) box(trim, e, o.u + sd * (o.w / 2 + 0.12), o.top + sw - 0.12, 0.06, 0.07, 0.14, 0.06, trimC, true); // consoles
            } else if (o.kind === 'window' && hasHoods) {
              box(trim, e, o.u, o.top + sw + 0.07, 0.055, o.w / 2 + 0.22, 0.05, 0.055, trimC, true);
              box(trim, e, o.u, o.top + sw + 0.15, 0.075, o.w / 2 + 0.27, 0.03, 0.075, trimC, true);
            }
            if (o.balcony) {
              // stone slab on consoles, wrought-iron railing
              const bw = Math.max(2.2, o.w + 1.1), by = GROUND_F + 0.14;
              box(trim, e, o.u, by, 0.46, bw / 2, 0.08, 0.46, trimC, true);
              for (const sd of [-1, 1]) box(trim, e, o.u + sd * (bw / 2 - 0.25), by - 0.28, 0.25, 0.09, 0.2, 0.25, trimC, true);
              const rh = 0.95;
              box(iron, e, o.u, by + 0.08 + rh, 0.88, bw / 2, 0.025, 0.03, cWhite.set('#ffffff'));
              for (const sd of [-1, 1]) box(iron, e, o.u + sd * (bw / 2 - 0.02), by + 0.08 + rh / 2, 0.46, 0.02, rh / 2, 0.44, cWhite.set('#ffffff'));
              box(iron, e, o.u, by + 0.08 + rh, 0.46, 0.02, 0.02, 0.44, cWhite.set('#ffffff'));
              for (let x = -bw / 2 + 0.1; x < bw / 2 - 0.05; x += 0.13) box(iron, e, o.u + x, by + 0.08 + rh / 2, 0.88, 0.009, rh / 2, 0.009, cWhite.set('#ffffff'));
              for (const sd of [-1, 1]) for (let d = 0.12; d < 0.85; d += 0.13) box(iron, e, o.u + sd * (bw / 2 - 0.02), by + 0.08 + rh / 2, d, 0.009, rh / 2, 0.009, cWhite.set('#ffffff'));
            }
            if (o.kind === 'window' && !o.balcony && hasShutters && bayW - o.w - 2 * sw > o.w * 0.95) {
              const sh = (o.top - o.bottom) / 2, mid = (o.top + o.bottom) / 2;
              box(wood, e, l - sw - 0.02 - o.w / 4, mid, 0.055, o.w / 4, sh, 0.018, shutterC, true);
              box(wood, e, r + sw + 0.02 + o.w / 4, mid, 0.055, o.w / 4, sh, 0.018, shutterC, true);
            }
          } else if (o.kind === 'shop') {
            stats.shops++;
            const ss = o.variant, R = (k: number) => rnd(ss, k);
            // colours unique to this shop: a period base colour, shifted in hue, saturation and value
            const fC = new THREE.Color(FASCIA[ss % FASCIA.length]).offsetHSL((R(10) - 0.5) * 0.1, (R(11) - 0.5) * 0.25, (R(12) - 0.5) * 0.14);
            const frameC = R(13) < 0.28 ? new THREE.Color('#e6ddc8').offsetHSL(0, 0, (R(14) - 0.5) * 0.08) : fC.clone().lerp(cWhite.set('#2e2720'), 0.1 + 0.35 * R(14));
            const tintC = new THREE.Color().setHSL(0.06 + 0.07 * R(18), 0.2 + 0.35 * R(19), 0.72 + 0.26 * R(20));
            const d = -depth + 0.02, arched = o.spring !== undefined, sTop = arched ? o.spring! : o.top, headTop = o.top;
            const riser = 0.4 + 0.4 * R(15), gb = o.bottom + riser;
            const cell = shopCell(ss), cu = cell[0][0], cv = cell[0][1];
            const uvAt = (x: number, y: number) => [cu + 0.5 * (x - l) / o.w, cv + 0.5 * Math.min(1, (y - gb) / Math.max(0.5, headTop - gb))];
            // stall riser: plain boards or fielded panels
            box(wood, e, o.u, o.bottom + riser / 2, d, o.w / 2, riser / 2, 0.03, frameC, true);
            if (R(34) < 0.5) for (let x = l + 0.35; x < r - 0.2; x += 0.6) box(wood, e, x, o.bottom + riser / 2, d + 0.03, 0.22, riser / 2 - 0.08, 0.015, frameC.clone().multiplyScalar(0.85), true);
            // door: none, left, centre or right
            const dm = Math.floor(R(16) * 4), dw = 0.9 + 0.25 * R(17);
            let doorAt: number | null = dm === 0 ? null : dm === 1 ? l + dw / 2 + 0.06 : dm === 2 ? o.u : r - dw / 2 - 0.06;
            if (doorAt !== null && o.w < dw + 0.9) doorAt = null;
            const spans = (doorAt === null ? [[l, r]] : [[l, doorAt - dw / 2], [doorAt + dw / 2, r]]).filter(([x0, x1]) => x1 - x0 > 0.25) as [number, number][];
            const nBars = Math.floor(R(21) * 4), transomAt = R(23) < 0.6 ? sTop - (0.35 + 0.3 * R(22)) : null;
            for (const [x0, x1] of spans) {
              shop.tri(P(e, x0, gb, d - 0.01), P(e, x1, gb, d - 0.01), P(e, x1, sTop, d - 0.01), nOut, uvAt(x0, gb), uvAt(x1, gb), uvAt(x1, sTop), tintC);
              shop.tri(P(e, x0, gb, d - 0.01), P(e, x1, sTop, d - 0.01), P(e, x0, sTop, d - 0.01), nOut, uvAt(x0, gb), uvAt(x1, sTop), uvAt(x0, sTop), tintC);
              const n = Math.min(nBars, Math.floor((x1 - x0) / 0.45));
              for (let k = 1; k <= n; k++) box(wood, e, x0 + ((x1 - x0) * k) / (n + 1), (gb + sTop) / 2, d + 0.02, 0.022, (sTop - gb) / 2, 0.02, frameC, true);
              if (transomAt !== null) {
                box(wood, e, (x0 + x1) / 2, transomAt, d + 0.02, (x1 - x0) / 2, 0.035, 0.025, frameC, true);
                if (R(24) < 0.5) for (let x = x0 + 0.28; x < x1 - 0.1; x += 0.28) box(wood, e, x, (transomAt + sTop) / 2, d + 0.02, 0.012, (sTop - transomAt) / 2, 0.015, frameC, true);
              }
            }
            if (arched) {
              // glazed head with radiating bars, a moulded stone archivolt and keystone
              const poly = holes[oi].slice(2);   // the arc points, left to right reversed
              for (let k = 0; k + 1 < poly.length; k++) {
                const p0 = poly[k], p1 = poly[k + 1];
                shop.tri(P(e, o.u, sTop, d - 0.01), P(e, p0.x, p0.y, d - 0.01), P(e, p1.x, p1.y, d - 0.01), nOut, uvAt(o.u, sTop), uvAt(p0.x, p0.y), uvAt(p1.x, p1.y), tintC);
                if (R(25) < 0.4 && k % 2 === 0) {
                  const ang = Math.atan2(p0.y - sTop, p0.x - o.u), rl = Math.hypot(p0.x - o.u, p0.y - sTop);
                  onEdge(wood, new THREE.BoxGeometry(rl, 0.014, 0.015).translate(rl / 2, 0, 0).rotateZ(ang), e, o.u, sTop, frameC);
                }
              }
              box(wood, e, o.u, sTop, d + 0.02, o.w / 2, 0.035, 0.025, frameC, true);
              // moulded stone archivolt and keystone
              frame(flat, e, [...poly].reverse().map(p => [p.x, p.y]), [[0.02, 0], [0.02, 0.05], [0.036, 0.062], [0.2, 0.062], [0.22, 0.046], [0.22, 0]], trimC, true);
              box(trim, e, o.u, headTop + 0.08, 0.07, 0.09, 0.14, 0.07, trimC, true);   // keystone
            }
            if (doorAt !== null) {
              const dTop = arched ? sTop : sTop;
              box(wood, e, doorAt, o.bottom + (dTop - o.bottom) / 2, d - 0.04, dw / 2, (dTop - o.bottom) / 2, 0.03, frameC, true);
              const gl = R(26) < 0.5 ? 0.45 : 0.3;
              shop.quad(P(e, doorAt - dw / 2 + 0.14, o.bottom + (dTop - o.bottom) * gl, d), P(e, doorAt + dw / 2 - 0.14, o.bottom + (dTop - o.bottom) * gl, d), P(e, doorAt + dw / 2 - 0.14, dTop - 0.14, d), P(e, doorAt - dw / 2 + 0.14, dTop - 0.14, d), nOut,
                [uvAt(doorAt - 0.3, gb), uvAt(doorAt + 0.3, gb), uvAt(doorAt + 0.3, sTop), uvAt(doorAt - 0.3, sTop)], tintC);
              box(iron, e, doorAt + dw / 2 - 0.2, o.bottom + 1.05, d + 0.04, 0.015, 0.1, 0.02, cWhite.set('#ffffff'));   // handle
            }
            // surround: plain boards, reeded pilasters or cast-iron columns
            const pil = Math.floor(R(27) * 3), ph = arched ? sTop - o.bottom : o.top - o.bottom;
            for (const sd of [-1, 1]) {
              const px = o.u + sd * (o.w / 2 + 0.11);
              if (pil === 2) {
                onEdge(iron, new THREE.CylinderGeometry(0.07, 0.08, ph, 10).translate(0, ph / 2, 0.12), e, px, o.bottom, cWhite.set('#ffffff'));
                box(iron, e, px, o.bottom + ph + 0.06, 0.12, 0.13, 0.06, 0.1, cWhite.set('#ffffff'));
              } else {
                box(wood, e, px, o.bottom + ph / 2 + 0.05, 0.06, 0.11, ph / 2 + 0.05, 0.06, frameC, true);
                if (pil === 1) for (const dx of [-0.05, 0, 0.05]) box(wood, e, px + dx, o.bottom + ph / 2 + 0.05, 0.12, 0.012, ph / 2 - 0.2, 0.012, frameC.clone().multiplyScalar(1.12), true);
                box(wood, e, px, o.bottom + ph + 0.12, 0.09, 0.15, 0.08, 0.09, frameC, true);   // capital
              }
            }
            // fascia and sign: a board over square fronts; over arches a smaller board if there is room
            const room = GROUND_F - 0.2 - (headTop + (arched ? 0.4 : 0.08));
            const signStyle = R(44);   // about half the shops have a lettered board, some a plain board, the rest none
            if (room > 0.35 && signStyle < 0.7) {
              const fh = Math.min(room - 0.1, 0.4 + 0.3 * R(28)), fy = headTop + (arched ? 0.4 : 0.08);
              const fw = arched ? Math.min(o.w / 2, 1.1 + 0.5 * R(29)) : o.w / 2 + 0.24;
              box(wood, e, o.u, fy + fh / 2, 0.07, fw, fh / 2, 0.07, fC, true);
              if (signStyle < 0.5) signQuad(sign, e, o.u, fy + 0.05, fy + fh - 0.05, fw - 0.05, 0.145, ss >>> 4);
              box(wood, e, o.u, fy + fh + 0.04, 0.1, fw + 0.08, 0.04, 0.1, frameC, true);
            }
            // awning: none, flat, rounded, or long with a scalloped valance; striped or plain canvas
            const aStyle = arched && R(30) > 0.3 ? 0 : Math.floor(R(31) * 4);
            if (aStyle > 0) {
              const aC = new THREE.Color(AWNING[(ss >>> 3) % AWNING.length]).offsetHSL((R(32) - 0.5) * 0.06, (R(33) - 0.5) * 0.2, (R(35) - 0.5) * 0.1);
              const striped = R(36) < 0.55;
              const aw = o.w / 2 + 0.2, ay = (arched ? sTop : o.top) + 0.06;
              const U = (x: number, v: number): number[] => (striped ? [x, v] : [0.15, v]);
              if (aStyle === 2) {
                // rounded canopy: a quarter barrel curving out and down, with closed ends
                const out = 0.9 + 0.4 * R(37), N = 7;
                const prof = Array.from({ length: N + 1 }, (_, k) => { const t = (k / N) * Math.PI / 2; return [0.1 + out * Math.sin(t), ay + 0.35 - 0.95 * (1 - Math.cos(t))]; });
                for (let k = 0; k < N; k++) {
                  const [d0, y0] = prof[k], [d1, y1] = prof[k + 1];
                  const A = P(e, o.u - aw, y0, d0), B = P(e, o.u + aw, y0, d0), C = P(e, o.u + aw, y1, d1), D = P(e, o.u - aw, y1, d1);
                  const nn = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(B, A), new THREE.Vector3().subVectors(D, A)).normalize();
                  if (nn.dot(vN(e)) + nn.y < 0) nn.negate();
                  canvas.quad(A, B, C, D, nn, [U(0, k / N), U(aw * 2, k / N), U(aw * 2, (k + 1) / N), U(0, (k + 1) / N)], aC);
                  for (const sd of [-1, 1]) canvas.tri(P(e, o.u + sd * aw, prof[N][1], 0.1), P(e, o.u + sd * aw, y0, d0), P(e, o.u + sd * aw, y1, d1), vT(e, sd), U(0.1, 0.5), U(0.1, 0.5), U(0.1, 0.5), aC);
                }
              } else {
                const out = aStyle === 3 ? 1.6 + 0.4 * R(37) : 1.05 + 0.4 * R(37), drop = 0.45 + 0.35 * R(38);
                const A = P(e, o.u - aw, ay, 0.12), B = P(e, o.u + aw, ay, 0.12), C = P(e, o.u + aw, ay - drop, out), D = P(e, o.u - aw, ay - drop, out);
                const up = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(B, A), new THREE.Vector3().subVectors(D, A)).normalize();
                if (up.y < 0) up.negate();
                canvas.quad(A, B, C, D, up, [U(0, 0), U(aw * 2, 0), U(aw * 2, 1), U(0, 1)], aC);
                const vh = 0.18 + 0.12 * R(39);
                if (aStyle === 3) {
                  // scalloped valance
                  const nS = Math.max(3, Math.round((aw * 2) / 0.35));
                  for (let k = 0; k < nS; k++) {
                    const x0 = o.u - aw + (aw * 2 * k) / nS, x1 = o.u - aw + (aw * 2 * (k + 1)) / nS, xm = (x0 + x1) / 2;
                    canvas.quad(P(e, x0, ay - drop, out), P(e, x1, ay - drop, out), P(e, x1, ay - drop - vh * 0.5, out), P(e, x0, ay - drop - vh * 0.5, out), vN(e), [U(x0, 1), U(x1, 1), U(x1, 1.1), U(x0, 1.1)], aC);
                    canvas.tri(P(e, x0, ay - drop - vh * 0.5, out), P(e, x1, ay - drop - vh * 0.5, out), P(e, xm, ay - drop - vh, out), vN(e), U(x0, 1.1), U(x1, 1.1), U(xm, 1.2), aC);
                  }
                  for (const sd of [-1, 1]) box(iron, e, o.u + sd * aw, ay - drop / 2 - 0.6, out, 0.012, drop / 2 + 0.6, 0.012, cWhite.set('#ffffff')); // posts
                } else {
                  canvas.quad(D, C, P(e, o.u + aw, ay - drop - vh, out), P(e, o.u - aw, ay - drop - vh, out), vN(e), [U(0, 1), U(aw * 2, 1), U(aw * 2, 1.2), U(0, 1.2)], aC);
                }
                for (const sd of [-1, 1]) box(iron, e, o.u + sd * aw, ay - drop / 2, out / 2 + 0.06, 0.01, 0.01, out / 2, cWhite.set('#ffffff')); // rods
              }
            }
            // hanging sign on an iron bracket, goods set out by the door
            if (R(2) < 0.22 && o.u + o.w / 2 + 0.7 < e.L - 0.3) {
              const sx = o.u + o.w / 2 + 0.45, sy = GROUND_F - 0.35, shape = R(40);
              box(iron, e, sx, sy, 0.5, 0.015, 0.015, 0.5, cWhite.set('#ffffff'));
              box(iron, e, sx, sy - 0.25, 0.08, 0.015, 0.25, 0.015, cWhite.set('#ffffff'));
              if (shape < 0.5) box(wood, e, sx, sy - 0.45, 0.62, 0.02, 0.28, 0.32, fC, false);
              else onEdge(wood, new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 0, 0.62), e, sx, sy - 0.42, fC);
            }
            if (R(41) < 0.22 && doorAt !== null) {
              for (let k = 0; k < 2; k++) {
                const gx = doorAt + (k ? 1 : -1) * (dw / 2 + 0.4);
                if (gx < 0.4 || gx > e.L - 0.4) continue;
                if (R(42 + k) < 0.5) onEdge(wood, new THREE.CylinderGeometry(0.26, 0.26, 0.7, 10).translate(0, 0.35, 0.45), e, gx, o.bottom, frameC.clone().lerp(cWhite.set('#6a4a30'), 0.7));
                else box(wood, e, gx, o.bottom + 0.22, 0.4, 0.3, 0.22, 0.25, new THREE.Color('#6a5038'), true);
              }
            }
          } else {
            stats.doors++;
            // Door leaves (or gate leaves) filling the opening, set deep in the wall
            const shape = holes[oi];
            const dt = THREE.ShapeUtils.triangulateShape(shape, []);
            for (const [a, bb, c] of dt) {
              wood.tri(P(e, shape[a].x, shape[a].y, -depth), P(e, shape[bb].x, shape[bb].y, -depth), P(e, shape[c].x, shape[c].y, -depth), nOut,
                [shape[a].x, shape[a].y], [shape[bb].x, shape[bb].y], [shape[c].x, shape[c].y], doorC);
            }
            // Stone surround: moulded jambs and arch in one run, and a keystone
            const jw = o.kind === 'gate' ? 0.28 : 0.2, pd = 0.045, R0 = o.w / 2;
            frame(flat, e, [[l, o.bottom], ...shape.slice(2).reverse().map(p => [p.x, p.y]), [r, o.bottom]], architrave(jw, pd), trimC, true);
            box(trim, e, o.u, o.spring! + R0 + jw * 0.4, pd, 0.14, jw * 0.7, pd, trimC, true); // keystone
            // Leaves: meeting stile, lock rail and bottom rail standing proud of the boards
            const lb = -depth + 0.02;
            box(wood, e, o.u, (o.bottom + o.spring! + R0 * 0.6) / 2, lb, 0.05, (o.spring! + R0 * 0.6 - o.bottom) / 2, 0.02, doorC, true);
            for (const rh of [o.bottom + 0.15, o.bottom + 1.0]) box(wood, e, o.u, rh, lb, o.w / 2 - 0.02, 0.06, 0.02, doorC, true);
          }
        }

        // --- Bands: plinth, string course, cornice (street and courtyard faces only) --------------
        if (!e.party) {
          const mStart = miterAt(i), mEnd = miterAt((i + 1) % n);
          const doorSpans = openings.filter(o => o.kind === 'door' || o.kind === 'gate' || o.kind === 'shop').map(o => [o.u - o.w / 2 - (o.kind === 'gate' ? 0.3 : 0.22), o.u + o.w / 2 + (o.kind === 'gate' ? 0.3 : 0.22)]);
          const plinth = front >= 5 ? plinthProfile(h0, 0.075, 0.52) : [[0, h0], [0.07, h0], [0.07, 0.55], [0.03, 0.62], [0, 0.62]];
          let ua = 0;
          for (const [s0, s1] of doorSpans.sort((p, q) => p[0] - q[0])) {
            extrude(trim, e, ua, s0, plinth, plinthC, ua === 0 ? mStart : null, null);
            ua = s1;
          }
          extrude(trim, e, ua, e.L, plinth, plinthC, ua === 0 ? mStart : null, mEnd);
          if (topH > GROUND_F + 2) {
            // Broken where a tall arch rises through it
            const sc = front >= 5 ? new Mould(0, GROUND_F - 0.13).out(0.02).cavetto(0.045, 0.045).out(0.012).up(0.14).to(0.055, GROUND_F + 0.085).to(0, GROUND_F + 0.1).p
              : [[0, GROUND_F - 0.12], [0.07, GROUND_F - 0.08], [0.07, GROUND_F + 0.08], [0, GROUND_F + 0.12]];
            const cuts = openings.filter(o => o.spring !== undefined && o.top + 0.3 > GROUND_F - 0.14).map(o => [o.u - o.w / 2 - 0.32, o.u + o.w / 2 + 0.32]).sort((p, q) => p[0] - q[0]);
            let ca = 0;
            for (const [c0, c1] of cuts) { extrude(trim, e, ca, c0, sc, trimC, ca === 0 ? mStart : null, null); ca = c1; }
            extrude(trim, e, ca, e.L, sc, trimC, ca === 0 ? mStart : null, mEnd);
          }
          // Main cornice, tucked under the eave's soffit (buildings.ts): a band, a cyma reversa bed moulding,
          // the frieze (with brackets), an ovolo, the corona and a crowning cyma recta. Its top runs on up
          // inside the eave, so the cornice stays closed against the soffit even where the wall sags.
          const T = ov > 0 ? -EAVE.fasciaDetail - 0.25 * k : -0.06;   // the soffit over the cornice's front
          const cm = front >= 5
            ? new Mould(0, -0.78).out(0.035).to(0.035, T - 0.37).reversa(0.04, 0.06).out(0.01).up(0.01)
              .to(0.085, T - 0.205).ovolo(0.04, 0.035).up(0.01).out(0.055).up(0.06).out(0.01).up(0.01).recta(0.06, 0.08).up(0.05)
            : new Mould(0, -0.78).out(0.04).to(0.04, T - 0.3).to(0.1, T - 0.25).to(0.1, T - 0.16).to(0.24, T - 0.12).to(0.24, T + 0.04);   // courtyards: plain
          const cornice = [...cm.p, [0, ov > 0 ? -EAVE.fasciaDetail + 0.05 : 0]].map(([d, h, sm]) => [d, topH + h, sm ?? 0]);
          extrude(trim, e, 0, e.L, cornice, trimC, mStart, mEnd);
          // Corner pilasters on convex street corners
          if (hasPilasters) {
            const ep = edges[(i - 1 + n) % n], en = edges[(i + 1) % n];
            const convex = (a: Edge, c: Edge) => c.tx * a.nx + c.tz * a.nz < -0.3;
            const ph = (0.62 + topH - 0.78) / 2, phh = (topH - 0.78 - 0.62) / 2;
            // (each runs 4 cm past the corner so the arris is solid)
            if (!ep.party && convex(ep, e) && e.L > 1.6) box(flat, e, 0.23, ph, 0.02, 0.27, phh, 0.02, trimC, true);
            if (!en.party && convex(e, en) && e.L > 1.6) box(flat, e, e.L - 0.23, ph, 0.02, 0.27, phh, 0.02, trimC, true);
          } else {
            // rusticated quoins on convex street corners: dressed stones, long and short in turn so they bond
            // round the corner (the courses are shared by both faces), each a little different in length,
            // height and projection, with a broad chamfer; each overlaps the corner by its depth so the arris is solid
            const ep = edges[(i - 1 + n) % n], en = edges[(i + 1) % n];
            const convex = (a: Edge, c: Edge) => c.tx * a.nx + c.tz * a.nz < -0.3;
            for (const [ok, u, sd] of [[!ep.party && convex(ep, e), 0, 1], [!en.party && convex(e, en), e.L, -1]] as [boolean, number, number][]) {
              if (!ok || e.L < 2 || front < 5) continue;   // courtyard corners keep plain arrises
              const qs = hashString(`${b.id}:q:${(e.ax + e.tx * u).toFixed(1)},${(e.az + e.tz * u).toFixed(1)}`);
              for (let y = 0.7, k = 0; ; k++) {
                const hh = 0.33 + 0.05 * rnd(qs, k), gap = 0.05 + 0.02 * rnd(qs, k + 50);
                if (y + hh > topH - 1.0) break;
                const w = ((k + (sd < 0 ? 1 : 0)) % 2 ? 0.45 : 0.8) + 0.1 * (rnd(eseed, 200 + k) - 0.5), dq = 0.024 + 0.008 * rnd(eseed, 300 + k);
                box(trim, e, u + (sd * (w - 2 * dq)) / 2, y + hh / 2, dq, (w + 2 * dq) / 2, hh / 2, dq, trimC, true, 0.022);
                y += hh + gap;
              }
            }
          }
          // gas lantern on an iron bracket, at a pier between bays, every ~18 m along the streets
          if (front >= 5 && ri === 0 && e.L > 6 && topH > GROUND_F + 2) {
            const uL = nb > 0 ? u0 + Math.round(nb / 2) * bayW : e.L / 2;
            const base = P(e, uL, GROUND_F + 0.75, 0.85);
            if (uL > 0.8 && uL < e.L - 0.8 && !lamps.some(q => q.pos.distanceTo(base) < 18) && !openings.some(o => Math.abs(o.u - uL) < o.w / 2 + 0.3 && o.top > GROUND_F)) {
              const white = new THREE.Color('#ffffff');
              box(iron, e, uL, GROUND_F + 1.02, 0.45, 0.025, 0.025, 0.45, white);                               // arm
              onEdge(iron, new THREE.BoxGeometry(0.02, 0.62, 0.02).rotateX(-0.95).translate(0, -0.12, 0.28), e, uL, GROUND_F + 0.85, white); // stay
              box(iron, e, uL, GROUND_F + 0.85, 0.02, 0.07, 0.25, 0.02, white);                                 // wall plate
              onEdge(iron, new THREE.ConeGeometry(0.2, 0.18, 6).translate(0, 0, 0.85), e, uL, GROUND_F + 0.97, white);   // cap
              onEdge(iron, new THREE.CylinderGeometry(0.06, 0.08, 0.06, 6).translate(0, 0, 0.85), e, uL, GROUND_F + 0.52, white);
              const g = P(e, uL, 0, 1.9);
              lamps.push({ pos: P(e, uL, GROUND_F + 0.72, 0.85), ground: new THREE.Vector2(g.x, g.z) });
            }
          }
          // cornice brackets (c.1900 houses): modillions under the corona, on the street fronts
          if (bracketed && front >= 5) for (let u = 0.5; u < e.L - 0.3; u += 0.95) box(flat, e, u, topH + T - 0.215, 0.085, 0.055, 0.055, 0.085, trimC, true);
          // the eave gutter: half-round sheet metal hung just off the fascia, with a rolled bead, turning the
          // corners; straight like the eave it hangs from (a copy of the edge without the wall's warp)
          const pipeC = new THREE.Color('#6f7478'), eg: Edge = { ...e, knots: undefined };
          const gr = 0.075, gd = ov + 0.015, gh = topH - ov * k - 0.05;
          if (ov > 0 && b.roof) {
            const gut = [[gd, gh]];
            for (let j = 1; j <= 6; j++) gut.push([gd + gr - Math.cos((Math.PI * j) / 6) * gr, gh - Math.sin((Math.PI * j) / 6) * gr, j < 6 ? 1 : 0]);
            gut.push([gd + 2 * gr + 0.011, gh + 0.007, 1], [gd + 2 * gr + 0.018, gh - 0.007]);
            extrude(metal, eg, 0, e.L, gut, pipeC, mStart, mEnd, false);
            for (const [u, m, sg] of [[0, mStart, -1], [e.L, mEnd, 1]] as const) {
              if (m) continue;   // a stop end where the gutter doesn't turn a corner
              for (let j = 0; j < 6; j++) metal.tri(P(eg, u, gh, gd + gr), P(eg, u, gut[j][1], gut[j][0]), P(eg, u, gut[j + 1][1], gut[j + 1][0]), vT(e, sg), [0, 0], [0.1, 0], [0.1, 0.1], pipeC);
            }
          }
          // downpipes at both ends: an outlet from the gutter, down in front of the cornice, a swan neck back
          // to the wall, then down on clips to a shoe that throws the water clear of the plinth
          if (e.L > 4 && topH > 5) {
            const dG = ov > 0 ? gd + gr : 0.3, hB = ov > 0 ? gh - gr : topH - 0.3, hA = topH - 0.86, hC = hA - 0.32, dP = 0.13;
            for (const u of [0.28, e.L - 0.28]) {
              const g0 = P(e, u, 0, 0.5), hl = Math.max(h0 + 0.2, terrain.heightAt(g0.x, g0.z) - e.gy);
              onEdge(metal, new THREE.CylinderGeometry(0.068, 0.05, 0.1, 8, 1, true).translate(0, hB - 0.03, dG), eg, u, 0, pipeC);
              pipe(metal, eg, u, [hB - 0.07, dG], [hA, dG], 0.05, pipeC);
              pipe(metal, eg, u, [hA, dG], [hC, dP], 0.05, pipeC);
              pipe(metal, e, u, [hC, dP], [hl + 0.3, dP], 0.055, pipeC);
              pipe(metal, e, u, [hl + 0.3, dP], [hl + 0.1, dP + 0.15], 0.055, pipeC);
              if (front >= 5) for (let y = hl + 1.5; y < hC - 0.5; y += 2.6) onEdge(iron, new THREE.CylinderGeometry(0.064, 0.064, 0.035, 6, 1, true).translate(0, 0, dP), e, u, y, cWhite.set('#ffffff'));   // pipe clips
            }
          }
        }
        // flower boxes under some upper windows (street fronts)
        if (front >= 5) for (const o of openings) {
          if (o.kind !== 'window' || o.balcony || rnd(hashString(`${b.id}:${i}:${o.u.toFixed(1)}:${o.bottom.toFixed(1)}`), 9) > 0.14) continue;
          box(wood, e, o.u, o.bottom - 0.2, 0.2, o.w / 2, 0.1, 0.12, new THREE.Color('#5a4030'), true);
          for (let x = -o.w / 2 + 0.1; x < o.w / 2 - 0.05; x += 0.14) {
            const blob = new THREE.IcosahedronGeometry(0.09, 0).translate(x, 0.02, 0.22);
            onEdge(canvas, blob, e, o.u, o.bottom - 0.08, new THREE.Color(rnd(x * 97, 3) < 0.5 ? '#5a7a3a' : '#a8362a'));
          }
        }
        // dormers in the roof over street fronts
        if (front >= 5 && b.roof && k > 0.2 && e.L > 7) {
          const nd = Math.floor(e.L / 6.5);
          const roofC = new THREE.Color(hasTileRoof(b) ? '#9a5a44' : '#7c8286');
          for (let j = 0; j < nd; j++) {
            const u = (e.L / nd) * (j + 0.5), din = 0.9, yb = topH + din * k;
            const H = 1.35, w = 1.0, depth = 1.2 + H / k;
            const yBot = yb - 0.05 - depth * k, yTop = yb + H; // the back of the body is buried in the roof
            box(wall, e, u, (yBot + yTop) / 2, -din - depth / 2, w / 2 + 0.12, (yTop - yBot) / 2, depth / 2, tint, true);
            box(trim, e, u, yb + H + 0.04, -din + 0.06, w / 2 + 0.2, 0.05, 0.12, trimC, true);
            glass.quad(P(e, u - w / 2 + 0.12, yb + 0.15, -din + 0.01), P(e, u + w / 2 - 0.12, yb + 0.15, -din + 0.01), P(e, u + w / 2 - 0.12, yb + H - 0.1, -din + 0.01), P(e, u - w / 2 + 0.12, yb + H - 0.1, -din + 0.01), vN(e), [[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]], cWhite.set('#ffffff'));
            // little gable roof over the dormer
            const gw = w / 2 + 0.3, gr = 0.55;
            for (const sd of [-1, 1]) {
              const A = P(e, u + sd * gw, yb + H + 0.08, -din + 0.25), B = P(e, u, yb + H + 0.08 + gr, -din + 0.25);
              const C = P(e, u, yb + H + 0.08 + gr, -din - depth), D = P(e, u + sd * gw, yb + H + 0.08, -din - depth);
              const nn = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(B, A), new THREE.Vector3().subVectors(D, A)).normalize();
              if (nn.y < 0) nn.negate();
              metal.quad(A, B, C, D, nn, [[0, 0], [1, 0], [1, 1], [0, 1]], roofC);
            }
            const tri = [P(e, u - gw + 0.25, yb + H + 0.08, -din + 0.02), P(e, u + gw - 0.25, yb + H + 0.08, -din + 0.02), P(e, u, yb + H + 0.08 + gr - 0.15, -din + 0.02)];
            wall.tri(tri[0], tri[1], tri[2], vN(e), [0, 0], [1, 0], [0.5, 0.4], tint);
          }
        }
      });
    });

    // --- Hero roof: low sheet-metal hip roof from the skeleton, with dormers ------------------------
    // (sagging a little like the others, with folded caps on the hips and ridge)
    if (b.style && b.roof) {
      const m = roofModel(b, Math.min(b.roof.k, 0.42)), roofC = new THREE.Color('#7b8184');
      const put = (p: THREE.Vector3[], nn: THREE.Vector3[], uv: number[][]) => metal.tri(p[0], p[1], p[2], nn[0], uv[0], uv[1], uv[2], roofC, undefined, nn);
      m.eachTri((p, nn) => put(p, nn, p.map(q => [q.x, q.z])));
      roofCaps(m, true, false, put);
    }

    // --- Chimneys on the ridge ----------------------------------------------------------------------
    if (b.roof && b.area > 35) {
      const V = b.roof.v;
      let tMax = 0;
      for (let i = 2; i < V.length; i += 3) tMax = Math.max(tMax, V[i]);
      const want = Math.min(3, Math.max(1, Math.round(b.area / 140)));
      const picks: [number, number, number][] = [];
      for (let i = 0; i < V.length && picks.length < want; i += 3) {
        const t = V[i + 2];
        if (t < tMax * 0.85) continue;
        if (picks.some(([x, z]) => Math.hypot(x - V[i], z - V[i + 1]) < 5)) continue;
        if (rnd(seed, 20 + i) < 0.25) continue;
        picks.push([V[i], V[i + 1], t]);
      }
      const ring = b.rings[0];
      const ex = { ax: 0, az: 0, tx: 1, tz: 0, nx: 0, nz: 1, L: 1, gy: 0, party: false };
      // align with the longest edge
      let best = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], c = ring[(i + 1) % ring.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
        if (L > best) { best = L; ex.tx = (c[0] - a[0]) / L; ex.tz = (c[1] - a[1]) / L; ex.nx = ex.tz; ex.nz = -ex.tx; }
      }
      const chimC = tint.clone().multiplyScalar(0.88), capC = new THREE.Color('#857f76');
      const rm = roofModel(b, b.style ? Math.min(k, 0.42) : k);   // stand on the (sagging) roof
      for (const [x, z, t] of picks) {
        const ridge = rm.at(x, z, t).y;
        const f = { ...ex, ax: x, az: z };
        box(trim, f, 0, ridge + 0.2, 0, 0.42, 1.2, 0.28, chimC);
        box(trim, f, 0, ridge + 1.44, 0, 0.52, 0.05, 0.38, capC);
        box(trim, f, 0, ridge + 1.56, 0, 0.3, 0.07, 0.17, capC);
        for (const dx of [-0.18, 0.18]) box(trim, f, dx, ridge + 1.78, 0, 0.07, 0.16, 0.07, new THREE.Color('#9a6a52')); // clay pots
      }
    }
  }

  const group = new THREE.Group();
  group.name = 'facades';
  for (const [builder, mat, cast] of [[wall, mats.wall, true], [trim, mats.trim, true], [flat, mats.trim, false], [glass, mats.glass, false], [wood, mats.wood, true], [canvas, mats.canvas, true], [iron, mats.iron, false], [metal, mats.metal, true], [shop, mats.shopGlass, false], [sign, mats.signs, false]] as const) {
    const g = builder.geometry();
    if (!g) continue;
    stats.triangles += g.getAttribute('position').count / 3;
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const x of extras) group.add(x);
  return { group, stats, lamps };
}
