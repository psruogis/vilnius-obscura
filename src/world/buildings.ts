import * as THREE from 'three';
import type { AreaData, Building, XZ } from './area';

/** Real-world size of one plaster / roof-tile texture repeat, metres. */
const PLASTER_TILE = 2.5;
const ROOF_TILE = 2.2;

// Limewash tints for c.1800 houses, authored in sRGB.
// Limewash after the period views (Zaleski, Peszka): ochres, pale pinks, straw, warm greys, a few whites.
export const LIMEWASH = ['#e3cc9c', '#d9b884', '#e6c49c', '#d8a888', '#e0b89e', '#cdb898', '#e8d8b6', '#d3c0a0', '#cca277', '#dfcaa6', '#c2a98a', '#dcc3a0', '#d5ae86', '#e4d2b4', '#c9b08f', '#e2bfa6'];
// Multiplied into the clay texture: deep, weathered red-browns as in the period oils.
const ROOF_TINTS = ['#c9a08e', '#b88a78', '#d4ae98', '#a87e6e', '#c4a494', '#9c7a6c', '#bf9582'];

/** c.1900: most roofs were re-covered in painted sheet metal; about three in ten kept clay tile. */
export const hasTileRoof = (b: Building): boolean => hashString(b.id) % 10 < 3;

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministic 0..1 from a seed and a salt. */
function rnd(seed: number, salt: number): number {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Eaves, c.1900: the rafters carry the roof past the walls; the edge shows the folded sheet or the first
 * course of tiles (fascia), and the underside is boarded and limewashed (soffit), sloping with the rafters.
 * Detailed houses already reach 0.3 m past their walls in the data; the others get a shorter eave here.
 */
export const EAVE = { overhang: 0.22, fascia: 0.12, fasciaDetail: 0.16 };

/** Signed area in (x, -z) space: positive = counter-clockwise seen from above. */
function signedArea(r: XZ[]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, z1] = r[i], [x2, z2] = r[(i + 1) % r.length];
    a += x1 * -z2 - x2 * -z1;
  }
  return a / 2;
}

class Builder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  extra: number[] = [];   // vec4 per vertex
  extra2: number[] = [];  // vec4 per vertex

  vertex(x: number, y: number, z: number, n: THREE.Vector3, u: number, v: number, c: THREE.Color, e: number[], e2: number[]): void {
    this.pos.push(x, y, z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(c.r, c.g, c.b);
    this.extra.push(...e);
    this.extra2.push(...e2);
  }

  /** A quad a-b-c-d with one normal; uvs per corner. */
  quad(p: THREE.Vector3[], n: THREE.Vector3, uvs: number[][], c: THREE.Color, e: number[], e2: number[]): void {
    for (const i of [0, 1, 2, 0, 2, 3]) this.vertex(p[i].x, p[i].y, p[i].z, n, uvs[i][0], uvs[i][1], c, e, e2);
  }

  geometry(extraName: string | null, extra2Name: string | null): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (extraName) g.setAttribute(extraName, new THREE.Float32BufferAttribute(this.extra, 4));
    if (extra2Name) g.setAttribute(extra2Name, new THREE.Float32BufferAttribute(this.extra2, 4));
    g.computeBoundingSphere();
    return g;
  }
}

const ROLE_CODE: Record<Building['role'], number> = { ordinary: 0, townhall: 1, stcasimir: 2, recon: 3 };

/**
 * Walls: a few panels per footprint edge, from below the lowest ground to the eave. Old walls are not
 * ruler-straight: each bellies out a few centimetres between its corners, most near the top where the
 * floor beams push. The corners stay put, so neighbouring walls still meet.
 * aFacade = (u along the edge, height above the building's ground, edge length, seed)
 * aInfo   = (eave height above ground, role code, style seed, 0)
 */
export function buildWalls(data: AreaData): THREE.BufferGeometry {
  const b = new Builder();
  const n = new THREE.Vector3(), nv = new THREE.Vector3();
  const tint = new THREE.Color();
  for (const bd of data.buildings) {
    if (bd.role === 'townhall' || bd.role === 'stcasimir' || bd.detail) continue; // modelled separately (townhall.ts, stcasimir.ts, facades.ts)
    const seed = hashString(bd.id);
    if (bd.role === 'stcasimir') tint.set('#efe8da');
    else tint.set(LIMEWASH[seed % LIMEWASH.length]);
    const info = [bd.eave, ROLE_CODE[bd.role], (seed % 997) / 997, 0];
    const near = bd.dist < 260;
    bd.rings.forEach((ring, ri) => {
      // Outer ring CCW, holes CW (seen from above): then "outward" is always to the right.
      const ccw = signedArea(ring) > 0;
      const pts = (ri === 0) === ccw ? ring : [...ring].reverse();
      for (let i = 0; i < pts.length; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[(i + 1) % pts.length];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 0.05) continue;
        // Direction in (east, north) = (dx, -dz); right-hand normal = (dy, -dx) in EN -> local (nx, 0, -ny)
        const de = (bx - ax) / L, dn = -(bz - az) / L;
        n.set(dn, 0, de);
        const tx = (bx - ax) / L, tz = (bz - az) / L;
        const edgeSeed = ((seed + i * 7919) % 1009) / 1009;
        const h0 = bd.baseY - bd.groundY, h1 = bd.eaveY - bd.groundY, H = h1 - h0;
        // the belly: zero at both corners, a little more at the top
        const es = hashString(`${bd.id}:${ri}:${i}`);
        const A = L < 4 || !near ? 0 : 0.012 + 0.03 * rnd(es, 1), ph = 6.28 * rnd(es, 2);
        const out = (u: number, h: number) => A * Math.sin(Math.PI * u / L) * (1 + 0.25 * Math.sin(3 * Math.PI * u / L + ph)) * (0.4 + 0.6 * (h - h0) / H);
        const cols = A > 0 ? Math.max(2, Math.round(L / 5)) : 1, rows = 1;
        const vert = (ci: number, rj: number) => {
          const u = (L * ci) / cols, h = h0 + (H * rj) / rows, o = out(u, h);
          const du = (out(Math.min(L, u + 0.05), h) - out(Math.max(0, u - 0.05), h)) / (Math.min(L, u + 0.05) - Math.max(0, u - 0.05));
          const dh = (out(u, h + 0.05) - out(u, h - 0.05)) / 0.1;
          nv.set(n.x - tx * du, -dh, n.z - tz * du).normalize();
          b.vertex(ax + tx * u + n.x * o, bd.groundY + h, az + tz * u + n.z * o, nv, u / PLASTER_TILE, h / PLASTER_TILE, tint, [u, h, L, edgeSeed], info);
        };
        for (let ci = 0; ci < cols; ci++) for (let rj = 0; rj < rows; rj++) {
          // Two triangles, counter-clockwise seen from outside.
          vert(ci, rj); vert(ci + 1, rj); vert(ci + 1, rj + 1);
          vert(ci, rj); vert(ci + 1, rj + 1); vert(ci, rj + 1);
        }
      }
    });
  }
  const g = b.geometry('aFacade', 'aInfo');
  fixWinding(g);
  return g;
}

/** Makes every triangle face along its stored normal. */
function fixWinding(g: THREE.BufferGeometry): void {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), s = new THREE.Vector3();
  const attrs = Object.values(g.attributes) as THREE.BufferAttribute[];
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const face = b.sub(a).cross(c.sub(a));
    s.fromBufferAttribute(nrm, i).add(n.fromBufferAttribute(nrm, i + 1)).add(n.fromBufferAttribute(nrm, i + 2));
    if (face.dot(s) < 0) {
      for (const at of attrs) {
        for (let k = 0; k < at.itemSize; k++) {
          const t = at.array[(i + 1) * at.itemSize + k];
          (at.array as Float32Array)[(i + 1) * at.itemSize + k] = at.array[(i + 2) * at.itemSize + k];
          (at.array as Float32Array)[(i + 2) * at.itemSize + k] = t;
        }
      }
    }
  }
}

// --- Skeleton roofs ---------------------------------------------------------------------------------

/** A hip or ridge: the skeleton edge shared by two roof faces (each with its plane normal and the way into it). */
export interface RoofRidge { a: number; b: number; sides: { n: THREE.Vector3; into: THREE.Vector3 }[] }
/** An eave: the t = 0 edge of a face, with the face's plane normal and the horizontal way out of the building. */
export interface RoofEave { a: number; b: number; n: THREE.Vector3; ox: number; oz: number }

export interface RoofModel {
  k: number;
  /** Subdivisions along every original triangle edge (the same on every face, so shared edges match). */
  N: number;
  x(i: number): number; z(i: number): number; t(i: number): number;
  /** The roof surface at skeleton coordinates (x, z, t): pitched, then sagged. */
  at(x: number, z: number, t: number): THREE.Vector3;
  /** Horizontal offset per metre at an eave corner (the mitre of its two eaves). */
  miter(i: number): [number, number];
  ridges: RoofRidge[];
  eaves: RoofEave[];
  /** Every surface triangle: warped points, smooth normals within the face, and (u along the eave, s up the slope). */
  eachTri(cb: (p: THREE.Vector3[], n: THREE.Vector3[], us: number[][]) => void): void;
}

/**
 * A straight-skeleton roof at pitch k, subdivided and gently deformed: old roofs sag between their hips,
 * most in the middle of the ridge, with a few centimetres of waviness in the boarding. The deformation is
 * one smooth field over the whole roof and vanishes along the eaves, so faces, hips, ridges, the eave edge,
 * the walls and cornices below all stay joined. Anything laid on the roof takes its height from at().
 */
export function roofModel(bd: Building, k: number): RoofModel {
  const V = bd.roof!.v, F = bd.roof!.f, seed = hashString(bd.id);
  const vx = (i: number) => V[i * 3], vz = (i: number) => V[i * 3 + 1], vt = (i: number) => V[i * 3 + 2];
  let tMax = 0, maxE = 0;
  for (let i = 2; i < V.length; i += 3) tMax = Math.max(tMax, V[i]);
  for (const f of F) for (let i = 0; i < f.length; i++) { const a = f[i], c = f[(i + 1) % f.length]; maxE = Math.max(maxE, Math.hypot(vx(a) - vx(c), vz(a) - vz(c))); }
  const N = bd.detail ? Math.min(3, Math.max(1, Math.ceil(maxE / 4))) : bd.dist < 220 ? Math.min(2, Math.max(1, Math.ceil(maxE / 8))) : 1;
  // the long axis: the sag is deepest half way along it
  const ring = bd.rings[0];
  let ax = 1, az = 0, best = 0, cx = 0, cz = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    cx += p[0] / ring.length; cz += p[1] / ring.length;
    if (L > best) { best = L; ax = (q[0] - p[0]) / L; az = (q[1] - p[1]) / L; }
  }
  let hl = 1;
  for (const [x, z] of ring) hl = Math.max(hl, Math.abs((x - cx) * ax + (z - cz) * az));
  const sag = 0.05 + 0.09 * rnd(seed, 71);
  const wav = 0.008 + 0.01 * rnd(seed, 72), f1 = 0.6 + 0.4 * rnd(seed, 73), f2 = 0.6 + 0.4 * rnd(seed, 74), p1 = 6.28 * rnd(seed, 75), p2 = 6.28 * rnd(seed, 76);
  // no sag over the overhang (a detailed house's eave reaches ov past its wall): the eave and the wall
  // head under it stay straight and closed
  const ov = bd.detail ? bd.overhang ?? 0 : 0;
  const warp = (x: number, z: number, t: number) => {
    if (tMax - ov < 1e-3) return 0;
    const wt = Math.sin((Math.min(1, Math.max(0, t - ov) / (tMax - ov)) * Math.PI) / 2);
    const s = Math.min(1, Math.abs((x - cx) * ax + (z - cz) * az) / hl);
    return -wt * (sag * (0.35 + 0.65 * Math.cos((s * Math.PI) / 2)) + wav * Math.sin(x * f1 + p1) * Math.sin(z * f2 + p2));
  };
  const at = (x: number, z: number, t: number) => new THREE.Vector3(x, bd.eaveY + t * k + warp(x, z, t), z);

  interface Face { f: number[]; n: THREE.Vector3; ox: number; oz: number; dx: number; dz: number }
  const faces: Face[] = [], eaves: RoofEave[] = [];
  const ridges = new Map<string, RoofRidge>();
  const outs = new Map<number, [number, number][]>();
  const p0 = new THREE.Vector3(), p1v = new THREE.Vector3(), p2v = new THREE.Vector3();
  for (const f of F) {
    if (f.length < 3) continue;
    let e0 = -1, e1 = -1;
    for (let i = 0; i < f.length; i++) {
      const j = (i + 1) % f.length;
      if (vt(f[i]) < 1e-4 && vt(f[j]) < 1e-4) { e0 = f[i]; e1 = f[j]; break; }
    }
    // plane normal (pointing up) and centroid, unwarped
    const n = new THREE.Vector3(), c = new THREE.Vector3();
    p0.set(vx(f[0]), bd.eaveY + vt(f[0]) * k, vz(f[0]));
    for (let i = 1; i + 1 < f.length; i++) {
      p1v.set(vx(f[i]), bd.eaveY + vt(f[i]) * k, vz(f[i])).sub(p0);
      p2v.set(vx(f[i + 1]), bd.eaveY + vt(f[i + 1]) * k, vz(f[i + 1])).sub(p0);
      n.add(p1v.cross(p2v));
    }
    if (n.y < 0) n.negate();
    n.normalize();
    for (const i of f) c.add(new THREE.Vector3(vx(i), bd.eaveY + vt(i) * k, vz(i)).divideScalar(f.length));
    let dx = 1, dz = 0, ox = vx(f[0]), oz = vz(f[0]);
    if (e0 >= 0) {
      ox = vx(e0); oz = vz(e0);
      const L = Math.hypot(vx(e1) - ox, vz(e1) - oz) || 1;
      dx = (vx(e1) - ox) / L; dz = (vz(e1) - oz) / L;
      let nx = dz, nz = -dx;
      if ((c.x - ox) * nx + (c.z - oz) * nz > 0) { nx = -nx; nz = -nz; }
      eaves.push({ a: e0, b: e1, n, ox: nx, oz: nz });
      for (const v of [e0, e1]) { if (!outs.has(v)) outs.set(v, []); outs.get(v)!.push([nx, nz]); }
    }
    faces.push({ f, n, ox, oz, dx, dz });
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      if (a === e0 && b === e1) continue;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!ridges.has(key)) ridges.set(key, { a: Math.min(a, b), b: Math.max(a, b), sides: [] });
      const A = new THREE.Vector3(vx(a), bd.eaveY + vt(a) * k, vz(a)), axis = new THREE.Vector3(vx(b), bd.eaveY + vt(b) * k, vz(b)).sub(A).normalize();
      const into = c.clone().sub(A);
      into.addScaledVector(axis, -into.dot(axis)).normalize();
      ridges.get(key)!.sides.push({ n, into });
    }
  }
  const miters = new Map<number, [number, number]>();
  for (const [v, o] of outs) {
    if (o.length < 2) { miters.set(v, o[0]); continue; }
    const [a, b] = o, d = 1 + a[0] * b[0] + a[1] * b[1];
    let mx = (a[0] + b[0]) / Math.max(d, 0.15), mz = (a[1] + b[1]) / Math.max(d, 0.15);
    const ml = Math.hypot(mx, mz);
    if (ml > 2.5) { mx *= 2.5 / ml; mz *= 2.5 / ml; }
    miters.set(v, [mx, mz]);
  }
  const slope = Math.sqrt(1 + k * k);

  return {
    k, N, x: vx, z: vz, t: vt, at,
    miter: i => miters.get(i) ?? [0, 0],
    ridges: [...ridges.values()],
    eaves,
    eachTri(cb) {
      const key = (p: THREE.Vector3) => `${Math.round(p.x * 500)}|${Math.round(p.z * 500)}`;
      const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
      for (const face of faces) {
        const { f } = face;
        const tris = THREE.ShapeUtils.triangulateShape(f.map(i => new THREE.Vector2(vx(i), vz(i))), []);
        const acc = new Map<string, THREE.Vector3>();
        const list: { p: THREE.Vector3[]; us: number[][] }[] = [];
        for (const [i0, i1, i2] of tris) {
          const a = f[i0], b = f[i1], c = f[i2];
          const lat = (q: number, r: number) => {
            const s = q / N, w = r / N;
            const x = vx(a) + (vx(b) - vx(a)) * s + (vx(c) - vx(a)) * w, z = vz(a) + (vz(b) - vz(a)) * s + (vz(c) - vz(a)) * w;
            const t = vt(a) + (vt(b) - vt(a)) * s + (vt(c) - vt(a)) * w;
            return { p: at(x, z, t), us: [(x - face.ox) * face.dx + (z - face.oz) * face.dz, t * slope] };
          };
          const put = (A: ReturnType<typeof lat>, B: ReturnType<typeof lat>, C: ReturnType<typeof lat>) => {
            const fn = e1.subVectors(B.p, A.p).cross(e2.subVectors(C.p, A.p));
            if (fn.y < 0) fn.negate();
            for (const P of [A, B, C]) { const kk = key(P.p); if (!acc.has(kk)) acc.set(kk, new THREE.Vector3()); acc.get(kk)!.add(fn); }
            list.push({ p: [A.p, B.p, C.p], us: [A.us, B.us, C.us] });
          };
          for (let r = 0; r < N; r++) for (let q = 0; q < N - r; q++) {
            put(lat(q, r), lat(q + 1, r), lat(q, r + 1));
            if (q + r < N - 1) put(lat(q + 1, r), lat(q + 1, r + 1), lat(q, r + 1));
          }
        }
        for (const T of list) cb(T.p, T.p.map(p => acc.get(key(p))!.clone().normalize()), T.us);
      }
    },
  };
}

/**
 * The eave edge: generic roofs are carried EAVE.overhang past their walls at the same pitch; every eave
 * then gets its edge (fascia) as a vertical band. Corners are mitred, so neighbouring eaves close.
 */
function addEaves(b: Builder, m: RoofModel, bd: Building, tint: THREE.Color, attr: number[], metal: boolean): void {
  const ext = bd.detail ? 0 : EAVE.overhang, F = bd.detail ? EAVE.fasciaDetail : EAVE.fascia, slope = Math.sqrt(1 + m.k * m.k), none = [0, 0, 0, 0];
  const y = bd.eaveY - ext * m.k;
  for (const e of m.eaves) {
    const [max, maz] = m.miter(e.a), [mbx, mbz] = m.miter(e.b);
    const A = new THREE.Vector3(m.x(e.a), bd.eaveY, m.z(e.a)), B = new THREE.Vector3(m.x(e.b), bd.eaveY, m.z(e.b));
    const A2 = new THREE.Vector3(A.x + max * ext, y, A.z + maz * ext), B2 = new THREE.Vector3(B.x + mbx * ext, y, B.z + mbz * ext);
    const L = A.distanceTo(B);
    if (ext > 0) b.quad([A, B, B2, A2], e.n, [[0, 0], [L / ROOF_TILE, 0], [L / ROOF_TILE, -ext * slope / ROOF_TILE], [0, -ext * slope / ROOF_TILE]], tint, [0, -ext, attr[2], 0], none);
    const out = new THREE.Vector3(e.ox, 0, e.oz);
    // tiles show their ends in a thin strip of the clay; sheet metal is plain where it folds over the edge
    const v0 = metal ? 0.5 : -0.02, v1 = metal ? 0.5 : -0.02 - F / ROOF_TILE, u1 = metal ? 0.14 : L / ROOF_TILE, u0 = metal ? 0.14 : 0;
    b.quad([A2, B2, B2.clone().setY(y - F), A2.clone().setY(y - F)], out, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], tint, [0, 0, attr[2], 0], none);
  }
}

/** Receives triangles: three points, their normals and UVs (roof-texture units). */
export type TriSink = (p: THREE.Vector3[], n: THREE.Vector3[], uv: number[][]) => void;

/**
 * Hip and ridge cappings, laid along the (sagging) skeleton edges: rounded ridge tiles bedded over the
 * joint on clay roofs, a folded sheet cap with its flanges turned down on metal ones.
 */
export function roofCaps(m: RoofModel, metal: boolean, cheap: boolean, tri: TriSink): void {
  const N = m.N;
  const side = new THREE.Vector3(), up = new THREE.Vector3(), axis = new THREE.Vector3();
  const quad = (A: THREE.Vector3, B: THREE.Vector3, C: THREE.Vector3, D: THREE.Vector3, na: THREE.Vector3, nd: THREE.Vector3, uv: number[][]) => {
    tri([A, B, C], [na, na, nd], [uv[0], uv[1], uv[2]]);
    tri([A, C, D], [na, nd, nd], [uv[0], uv[2], uv[3]]);
  };
  const plain = [[0.14, 0], [0.14, 0.1], [0.14, 0.1], [0.14, 0]];
  for (const r of m.ridges) {
    if (r.sides.length !== 2) continue;
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j <= N; j++) {
      const s = j / N;
      pts.push(m.at(m.x(r.a) + (m.x(r.b) - m.x(r.a)) * s, m.z(r.a) + (m.z(r.b) - m.z(r.a)) * s, m.t(r.a) + (m.t(r.b) - m.t(r.a)) * s));
    }
    const [s1, s2] = r.sides;
    up.copy(s1.n).add(s2.n).normalize();
    axis.subVectors(pts[N], pts[0]).normalize();
    side.crossVectors(axis, up).normalize();
    up.crossVectors(side, axis).normalize();
    if (metal) {
      // folded cap: an apex 3 cm proud, flanges 8.5 cm down each face, their edges pressed into the roof
      const W = cheap ? 0.1 : 0.085;
      for (let j = 0; j < N; j++) {
        const P = pts[j], Q = pts[j + 1];
        for (const sd of [s1, s2]) {
          const A = P.clone().addScaledVector(up, 0.028), B = Q.clone().addScaledVector(up, 0.028);
          const C = Q.clone().addScaledVector(sd.into, W).addScaledVector(sd.n, -0.005), D = P.clone().addScaledVector(sd.into, W).addScaledVector(sd.n, -0.005);
          const nn = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(D, A)).normalize();
          if (nn.dot(up) < 0) nn.negate();
          quad(A, B, C, D, nn, nn, plain);
        }
      }
      continue;
    }
    // half-round ridge tiles: the arc runs from one face over the top to the other, a little into each
    const ang = (d: THREE.Vector3) => Math.atan2(d.dot(up), d.dot(side));
    let aR = ang(s1.into), aL = ang(s2.into);
    if (s1.into.dot(side) < 0) [aR, aL] = [aL, aR];
    if (aL < 0) aL += Math.PI * 2;
    if (!(aR < Math.PI / 2 && aL > Math.PI / 2)) continue;
    aR -= 0.15; aL += 0.15;
    const R = cheap ? 0.12 : 0.105, nA = cheap ? 3 : 5, lift = up.clone().multiplyScalar(0.005);
    let along = 0;
    for (let j = 0; j < N; j++) {
      const P = pts[j].clone().add(lift), Q = pts[j + 1].clone().add(lift), len = P.distanceTo(Q);
      for (let a = 0; a < nA; a++) {
        const t0 = aR + ((aL - aR) * a) / nA, t1 = aR + ((aL - aR) * (a + 1)) / nA;
        const d0 = side.clone().multiplyScalar(Math.cos(t0)).addScaledVector(up, Math.sin(t0)), d1 = side.clone().multiplyScalar(Math.cos(t1)).addScaledVector(up, Math.sin(t1));
        const v0 = (R * (t0 - aR)) / ROOF_TILE, v1 = (R * (t1 - aR)) / ROOF_TILE, u0 = along / ROOF_TILE, u1 = (along + len) / ROOF_TILE;
        quad(P.clone().addScaledVector(d0, R), Q.clone().addScaledVector(d0, R), Q.clone().addScaledVector(d1, R), P.clone().addScaledVector(d1, R), d0, d1, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
      }
      along += len;
    }
  }
}

// Painted sheet metal, c.1900: grey, red-brown, green
const METAL_TINTS = ['#80868a', '#6d7275', '#7a4234', '#5a6a58', '#8a8e8c', '#6a3a30'];

/**
 * Roofs of the buildings `pick` selects (default: all); metal ones take painted-metal tints.
 * Straight-skeleton faces rise from every eave at the building's pitch, subdivided and sagging (roofModel),
 * with a real edge at the eaves and cappings on the hips and ridges.
 * aRoof = (u along the eave, slope distance from the eave, seed, 0)
 */
export function buildRoofs(data: AreaData, pick: (b: Building) => boolean = () => true, metal = false): THREE.BufferGeometry {
  const b = new Builder();
  const tint = new THREE.Color();
  const none = [0, 0, 0, 0];
  for (const bd of data.buildings) {
    if (bd.role === 'townhall' || bd.role === 'stcasimir' || bd.style || !pick(bd)) continue; // hero roofs are built in facades.ts
    const seed = hashString(bd.id);
    tint.set(metal ? METAL_TINTS[(seed >>> 3) % METAL_TINTS.length] : ROOF_TINTS[(seed >>> 3) % ROOF_TINTS.length]);
    if (!bd.roof) {
      addFlatRoof(b, bd, tint);
      continue;
    }
    const m = roofModel(bd, bd.roof.k), sf = (seed % 991) / 991;
    m.eachTri((p, n, us) => {
      for (let i = 0; i < 3; i++) b.vertex(p[i].x, p[i].y, p[i].z, n[i], us[i][0] / ROOF_TILE, us[i][1] / ROOF_TILE, tint, [us[i][0], us[i][1], sf, 0], none);
    });
    addEaves(b, m, bd, tint, [0, 0, sf, 0], metal);
    if (bd.detail || bd.dist < 220) roofCaps(m, metal, !bd.detail, (p, n, uv) => { for (let i = 0; i < 3; i++) b.vertex(p[i].x, p[i].y, p[i].z, n[i], uv[i][0], uv[i][1], tint, [0, 0, sf, 0], none); });
  }
  const g = b.geometry('aRoof', 'aUnused');
  fixWinding(g);
  return g;
}

/**
 * Eave soffits: the boarded, limewashed underside of every overhang, sloping with the rafters from the
 * bottom of the fascia back into the wall (a little past it, so a bellied wall never shows a gap).
 * For the plaster trim material (vertex colours, UVs in metres).
 */
export function buildSoffits(data: AreaData): THREE.BufferGeometry {
  const b = new Builder();
  const tint = new THREE.Color(), lime = new THREE.Color('#efe6d4');
  const none = [0, 0, 0, 0];
  for (const bd of data.buildings) {
    if (bd.role === 'townhall' || bd.role === 'stcasimir' || bd.style || !bd.roof) continue;
    const seed = hashString(bd.id);
    tint.set(LIMEWASH[seed % LIMEWASH.length]).lerp(lime, 0.5);
    const m = roofModel(bd, bd.roof.k), k = m.k;
    const ext = bd.detail ? 0 : EAVE.overhang, F = bd.detail ? EAVE.fasciaDetail : EAVE.fascia;
    const inset = ext + (bd.detail ? bd.overhang ?? 0 : 0) + 0.05;
    const y0 = bd.eaveY - ext * k - F, y1 = y0 + inset * k;
    for (const e of m.eaves) {
      const [max, maz] = m.miter(e.a), [mbx, mbz] = m.miter(e.b);
      const ax = m.x(e.a), az = m.z(e.a), bx = m.x(e.b), bz = m.z(e.b);
      const A = new THREE.Vector3(ax + max * ext, y0, az + maz * ext), B = new THREE.Vector3(bx + mbx * ext, y0, bz + mbz * ext);
      const C = new THREE.Vector3(B.x - mbx * inset, y1, B.z - mbz * inset), D = new THREE.Vector3(A.x - max * inset, y1, A.z - maz * inset);
      const L = A.distanceTo(B);
      b.quad([A, B, C, D], e.n.clone().negate(), [[0, 0], [L, 0], [L, inset], [0, inset]], tint, none, none);
    }
  }
  const g = b.geometry(null, null);
  fixWinding(g);
  return g;
}

function addFlatRoof(b: Builder, bd: Building, tint: THREE.Color): void {
  const [outer, ...holes] = bd.rings;
  const contour = outer.map(([x, z]) => new THREE.Vector2(x, z));
  const holePts = holes.map(h => h.map(([x, z]) => new THREE.Vector2(x, z)));
  const all = [...contour, ...holePts.flat()];
  const tris = THREE.ShapeUtils.triangulateShape(contour, holePts);
  const up = new THREE.Vector3(0, 1, 0);
  for (const t of tris) {
    for (const i of t) {
      const p = all[i];
      b.vertex(p.x, bd.eaveY + 0.3, p.y, up, p.x / ROOF_TILE, p.y / ROOF_TILE, tint, [p.x, p.y, 0, 0], [0, 0, 0, 0]);
    }
  }
}
