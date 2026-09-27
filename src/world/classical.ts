import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Classical mouldings for the landmarks. Cut stone and lime render are never razor-sharp, and a
 * cornice is a drawn profile, not a box: so profiles are swept along paths (cornices, architraves,
 * window surrounds, raking cornices), turned about an axis (columns, basin rims) and boxes get
 * softened arrises. Profiles are written as an architect draws them, (s, u) pairs: s across the path in
 * its plane (outwards), u out of that plane; walked with the solid on the left. UVs are in metres.
 *
 * Baked occlusion: a per-vertex `aOcc` (0 open .. 1 shut in) from rays cast against a few coarse
 * proxies, applied to the sky and bounce light only (occlusion() below). Screen-space AO covers the
 * small scale; this covers what it cannot reach, like the back of a five-metre-deep portico.
 */

export type P2 = [number, number];
const dedupe = (p: P2[]) => p.filter((q, i) => i === 0 || Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) > 1e-5);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Indexed triangle soup whose triangles are wound to face their vertex normals. */
class Soup {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; idx: number[] = [];
  vert(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number): number {
    this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }
  tri(a: number, b: number, c: number): void {
    const P = this.pos, N = this.nor;
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az;
    const vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const nx = N[a * 3] + N[b * 3] + N[c * 3], ny = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], nz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
    if (fx * nx + fy * ny + fz * nz < 0) this.idx.push(a, c, b); else this.idx.push(a, b, c);
  }
  quad(a: number, b: number, c: number, d: number): void { this.tri(a, b, c); this.tri(a, c, d); }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    return g;
  }
}

/**
 * A box with chamfered arrises (b metres). Normals on each chamfer blend from one face to the next,
 * so the arris catches the light like a worn, rounded edge. 24 vertices, 44 triangles.
 */
export function bevelBox(w: number, h: number, d: number, x: number, y: number, z: number, b = 0.03): THREE.BufferGeometry {
  const H = [w / 2, h / 2, d / 2], C = [x, y, z];
  b = Math.max(0.002, Math.min(b, H[0] * 0.45, H[1] * 0.45, H[2] * 0.45));
  const S = new Soup();
  // vertex of face `a` (axis) at corner signs s[3]: on the face plane, inset by b along the other axes
  const ids = new Map<number, number>();
  const key = (a: number, s: number[]) => a * 8 + (s[0] > 0 ? 4 : 0) + (s[1] > 0 ? 2 : 0) + (s[2] > 0 ? 1 : 0);
  const vid = (a: number, s: number[]) => {
    const k = key(a, s);
    let i = ids.get(k);
    if (i === undefined) {
      const p = [0, 1, 2].map(j => C[j] + s[j] * (j === a ? H[j] : H[j] - b));
      const n = [0, 0, 0]; n[a] = s[a];
      const [iu, iv] = a === 0 ? [2, 1] : a === 1 ? [0, 2] : [0, 1];
      i = S.vert(V(p[0], p[1], p[2]), V(n[0], n[1], n[2]), p[iu], p[iv]);
      ids.set(k, i);
    }
    return i;
  };
  const sg = [-1, 1];
  for (let a = 0; a < 3; a++) {
    const [i, j] = [(a + 1) % 3, (a + 2) % 3];
    for (const sa of sg) {
      const c = (si: number, sj: number) => { const s = [0, 0, 0]; s[a] = sa; s[i] = si; s[j] = sj; return vid(a, s); };
      S.quad(c(-1, -1), c(1, -1), c(1, 1), c(-1, 1));                              // face
    }
    // chamfers along axis a
    for (const si of sg) for (const sj of sg) {
      const e = (sa: number, face: number) => { const s = [0, 0, 0]; s[a] = sa; s[i] = si; s[j] = sj; return vid(face, s); };
      S.quad(e(-1, i), e(1, i), e(1, j), e(-1, j));
    }
  }
  for (const sx of sg) for (const sy of sg) for (const sz of sg) {
    const s = [sx, sy, sz];
    S.tri(vid(0, s), vid(1, s), vid(2, s));                                           // corner facet
  }
  return S.geometry();
}

export interface SweepOpts {
  closed?: boolean;
  /** open paths: in-plane directions of the end cuts (default square to the path) */
  startCut?: THREE.Vector3; endCut?: THREE.Vector3;
  caps?: boolean;
  /** profile corners sharper than this (degrees) get split normals */
  hard?: number;
}

/**
 * Sweeps a profile along a path lying in a plane with normal `up`: s goes along cross(up, tangent)
 * (to the left of travel seen from `up`), u along `up`. Corners are mitred.
 */
export function sweep(path: THREE.Vector3[], up: THREE.Vector3, profile0: P2[], o: SweepOpts = {}): THREE.BufferGeometry {
  const profile = dedupe(profile0);
  const n = path.length, closed = !!o.closed, segs = closed ? n : n - 1;
  const U = up.clone().normalize();
  const T: THREE.Vector3[] = [], Sd: THREE.Vector3[] = [];
  for (let k = 0; k < segs; k++) {
    const t = path[(k + 1) % n].clone().sub(path[k]).normalize();
    T.push(t);
    Sd.push(new THREE.Vector3().crossVectors(U, t).normalize());
  }
  const cutOffset = (dir: THREE.Vector3, side: THREE.Vector3) => {
    const d = dir.clone().addScaledVector(U, -dir.dot(U));
    return d.multiplyScalar(1 / Math.max(0.2, d.dot(side)));
  };
  const offs: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    if (!closed && i === 0) { offs.push(o.startCut ? cutOffset(o.startCut, Sd[0]) : Sd[0].clone()); continue; }
    if (!closed && i === n - 1) { offs.push(o.endCut ? cutOffset(o.endCut, Sd[segs - 1]) : Sd[segs - 1].clone()); continue; }
    const a = Sd[(i - 1 + segs) % segs], b = Sd[i % segs];
    const m = a.clone().add(b);
    if (m.lengthSq() < 1e-8) m.copy(b);
    m.normalize();
    offs.push(m.multiplyScalar(1 / Math.max(0.2, m.dot(b))));
  }
  // profile normals (right of travel) and smoothing
  const pn: P2[] = [], plen: number[] = [0];
  for (let j = 0; j + 1 < profile.length; j++) {
    const ds = profile[j + 1][0] - profile[j][0], du = profile[j + 1][1] - profile[j][1], l = Math.hypot(ds, du) || 1;
    pn.push([du / l, -ds / l]);
    plen.push(plen[j] + l);
  }
  const cosHard = Math.cos(THREE.MathUtils.degToRad(o.hard ?? 40));
  const nAt = (j: number, end: boolean): P2 => {
    const own = pn[j], nb = end ? pn[j + 1] : pn[j - 1];
    if (!nb || own[0] * nb[0] + own[1] * nb[1] < cosHard) return own;
    const x = own[0] + nb[0], y = own[1] + nb[1], l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  const L: number[] = [0];
  for (let k = 0; k < segs; k++) L.push(L[k] + path[(k + 1) % n].distanceTo(path[k]));
  const S = new Soup();
  const p = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let k = 0; k < segs; k++) {
    const A = path[k], B = path[(k + 1) % n], oA = offs[k], oB = offs[(k + 1) % n], side = Sd[k];
    for (let j = 0; j + 1 < profile.length; j++) {
      const q: number[] = [];
      for (const [pj, end] of [[j, false], [j + 1, true]] as [number, boolean][]) {
        const [s, u] = profile[pj], [ns, nu] = nAt(j, end);
        nn.copy(side).multiplyScalar(ns).addScaledVector(U, nu).normalize();
        q.push(S.vert(p.copy(A).addScaledVector(oA, s).addScaledVector(U, u), nn, L[k], plen[pj]));
        q.push(S.vert(p.copy(B).addScaledVector(oB, s).addScaledVector(U, u), nn, L[k + 1], plen[pj]));
      }
      S.quad(q[0], q[1], q[3], q[2]);
    }
  }
  if (!closed && o.caps !== false) {
    const contour = profile.map(([s, u]) => new THREE.Vector2(s, u));
    if (Math.abs(profile[profile.length - 1][0]) > 1e-4) contour.push(new THREE.Vector2(0, profile[profile.length - 1][1]));
    if (Math.abs(profile[0][0]) > 1e-4) contour.unshift(new THREE.Vector2(0, profile[0][1]));
    if (contour.length > 2 && contour[0].distanceTo(contour[contour.length - 1]) < 1e-5) contour.pop();
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const [end, P0, off, t] of [[false, path[0], offs[0], T[0]], [true, path[n - 1], offs[n - 1], T[segs - 1]]] as [boolean, THREE.Vector3, THREE.Vector3, THREE.Vector3][]) {
      const cut = off.clone().normalize();
      const cn = new THREE.Vector3().crossVectors(U, cut).normalize();
      if (cn.dot(t) * (end ? 1 : -1) < 0) cn.negate();
      const base = contour.map(c => S.vert(p.copy(P0).addScaledVector(off, c.x).addScaledVector(U, c.y), cn, c.x, c.y));
      for (const [a, b, c] of tris) S.tri(base[a], base[b], base[c]);
    }
  }
  return S.geometry();
}

/** Turns a profile of (r, y) points, walked upwards with the solid towards the axis. */
export function lathe(profile0: P2[], segments = 48, o: { hard?: number; uvR?: number } = {}): THREE.BufferGeometry {
  const profile = dedupe(profile0);
  const pn: P2[] = [], plen: number[] = [0];
  for (let j = 0; j + 1 < profile.length; j++) {
    const dr = profile[j + 1][0] - profile[j][0], dy = profile[j + 1][1] - profile[j][1], l = Math.hypot(dr, dy) || 1;
    pn.push([dy / l, -dr / l]);
    plen.push(plen[j] + l);
  }
  const cosHard = Math.cos(THREE.MathUtils.degToRad(o.hard ?? 40));
  const nAt = (j: number, end: boolean): P2 => {
    const own = pn[j], nb = end ? pn[j + 1] : pn[j - 1];
    if (!nb || own[0] * nb[0] + own[1] * nb[1] < cosHard) return own;
    const x = own[0] + nb[0], y = own[1] + nb[1], l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  const uvR = o.uvR ?? Math.max(...profile.map(p => p[0]));
  const S = new Soup();
  const p = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let j = 0; j + 1 < profile.length; j++) {
    const ring: number[][] = [[], []];
    for (let k = 0; k <= segments; k++) {
      const th = (k / segments) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      for (const e of [0, 1]) {
        const [r, y] = profile[j + e], [nr, ny] = nAt(j, e === 1);
        ring[e].push(S.vert(p.set(r * c, y, r * s), nn.set(nr * c, ny, nr * s), th * uvR, plen[j + e]));
      }
    }
    for (let k = 0; k < segments; k++) S.quad(ring[0][k], ring[0][k + 1], ring[1][k + 1], ring[1][k]);
  }
  return S.geometry();
}

/** A flat grid (for surfaces that need vertices inside them, e.g. for baked occlusion). UVs in metres. */
export function grid(origin: THREE.Vector3, eu: THREE.Vector3, ev: THREE.Vector3, cell: number, normal: THREE.Vector3, uv0: P2 = [0, 0], cellV = cell): THREE.BufferGeometry {
  const lu = eu.length(), lv = ev.length();
  const nu = Math.max(1, Math.round(lu / cell)), nv = Math.max(1, Math.round(lv / cellV));
  const S = new Soup(), p = new THREE.Vector3(), row: number[][] = [];
  for (let j = 0; j <= nv; j++) {
    row.push([]);
    for (let i = 0; i <= nu; i++) {
      p.copy(origin).addScaledVector(eu, i / nu).addScaledVector(ev, j / nv);
      row[j].push(S.vert(p, normal, uv0[0] + (lu * i) / nu, uv0[1] + (lv * j) / nv));
    }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) S.quad(row[j][i], row[j][i + 1], row[j + 1][i + 1], row[j + 1][i]);
  return S.geometry();
}

/** Merges parts into one indexed geometry with position/normal/uv/aOcc (missing attributes zero-filled). */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const ready = parts.map(g0 => {
    let g = g0;
    if (!g.index) g.setIndex(Array.from({ length: g.getAttribute('position').count }, (_, i) => i));
    const n = g.getAttribute('position').count;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'aOcc'].includes(k)) g.deleteAttribute(k);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.getAttribute('aOcc')) g.setAttribute('aOcc', new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    return g;
  });
  const m = mergeGeometries(ready, false);
  if (!m) throw new Error('mergeParts failed');
  return m;
}

// --- Baked occlusion ---------------------------------------------------------------------------

export type Occluder =
  | { box: [number, number, number, number, number, number]; ground?: boolean }
  | { cyl: [number, number, number, number, number] }; // x, z, radius, y0, y1 (vertical)

// cosine-weighted hemisphere directions about +Z (Hammersley)
const RAYS = Array.from({ length: 28 }, (_, i) => {
  const u1 = (i + 0.5) / 28, u2 = (i * 0.6180339887) % 1, r = Math.sqrt(u1), ph = u2 * Math.PI * 2;
  return [r * Math.cos(ph), r * Math.sin(ph), Math.sqrt(1 - u1)];
});

function hitDist(o: Occluder, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
  if ('box' in o) {
    const b = o.box;
    let t0 = 0, t1 = 1e9;
    const slab = (orig: number, dir: number, lo: number, hi: number) => {
      if (Math.abs(dir) < 1e-9) return orig >= lo && orig <= hi;
      let a = (lo - orig) / dir, c = (hi - orig) / dir;
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      return t0 <= t1;
    };
    if (!slab(ox, dx, b[0], b[3]) || !slab(oy, dy, b[1], b[4]) || !slab(oz, dz, b[2], b[5])) return Infinity;
    return t0;
  }
  const [cx, cz, r, y0, y1] = o.cyl;
  const px = ox - cx, pz = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return Infinity;
  const b = px * dx + pz * dz, c = px * px + pz * pz - r * r;
  const disc = b * b - a * c;
  if (disc < 0) return Infinity;
  const t = (-b - Math.sqrt(disc)) / a;
  if (t < 0) return Infinity;
  const y = oy + dy * t;
  return y >= y0 && y <= y1 ? t : Infinity;
}

/**
 * Bakes `aOcc` for vertices inside `region`. Rays that escape count as sky (or as the lit square below
 * the horizon), rays stopped by `ground` proxies count as bounce from the pavement, others as dim
 * bounce from the stone; the result is relative to the same surface standing in the open.
 */
export function bakeOcclusion(g: THREE.BufferGeometry, occluders: Occluder[], region: THREE.Box3, strength = 1): void {
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
  const out = new Float32Array(pos.count);
  const n = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3(), p = new THREE.Vector3();
  const GROUND = 0.55, STONE = 0.2;
  const seen = new Map<string, number>(); // lathe and sweep seams repeat positions: bake each once
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (!region.containsPoint(p)) continue;
    const key = `${Math.round(p.x * 200)},${Math.round(p.y * 200)},${Math.round(p.z * 200)}`;
    const known = seen.get(key);
    if (known !== undefined) { out[i] = known; continue; }
    n.fromBufferAttribute(nor, i).normalize();
    t.set(Math.abs(n.y) < 0.9 ? 0 : 1, Math.abs(n.y) < 0.9 ? 1 : 0, 0).cross(n).normalize();
    b.crossVectors(n, t);
    const ox = p.x + n.x * 0.02, oy = p.y + n.y * 0.02, oz = p.z + n.z * 0.02;
    let vis = 0, ref = 0;
    for (const [rx, ry, rz] of RAYS) {
      const dx = t.x * rx + b.x * ry + n.x * rz, dy = t.y * rx + b.y * ry + n.y * rz, dz = t.z * rx + b.z * ry + n.z * rz;
      const open = dy >= 0 ? 1 : GROUND;
      ref += open;
      let best = Infinity, ground = false;
      for (const o of occluders) {
        const d = hitDist(o, ox, oy, oz, dx, dy, dz);
        if (d < best) { best = d; ground = 'box' in o && !!o.ground; }
      }
      vis += best === Infinity ? open : ground ? GROUND : STONE;
    }
    out[i] = Math.min(1, Math.max(0, 1 - Math.pow(vis / ref, 1.4))) * strength;
    seen.set(key, out[i]);
  }
  g.setAttribute('aOcc', new THREE.Float32BufferAttribute(out, 1));
}

/**
 * Sky lost under an overhang (a cornice or corona of depth `depth` whose soffit is at `ySoffit`), for
 * wall-like faces: the cosine-weighted share of the upper view it cuts off, falling with the distance
 * below the soffit. Combined with any baked value (the larger wins). `yAt` gives the soffit height at
 * a point when it isn't level (a raking cornice).
 */
export function overhangOcclusion(g: THREE.BufferGeometry, ySoffit: number | ((x: number) => number), depth: number, k = 0.6): void {
  const pos = g.getAttribute('position');
  const prev = g.getAttribute('aOcc');
  const out = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const ys = typeof ySoffit === 'number' ? ySoffit : ySoffit(pos.getX(i));
    const d = Math.max(0, ys - pos.getY(i));
    out[i] = Math.max(prev ? prev.getX(i) : 0, k * (1 - Math.sin(Math.atan(d / depth))));
  }
  g.setAttribute('aOcc', new THREE.Float32BufferAttribute(out, 1));
}

/**
 * age() (ageing.ts) lays its stains along a wall using the direction of the surface normal; on turned
 * work far from the world origin that coordinate spins round with the normal and the pattern
 * shatters into chevrons. Where the surface curves (the normal turns faster than 1/25 m⁻¹), use a
 * plain horizontal world coordinate instead; flat faces are unchanged. A no-op if age() isn't on the material.
 */
export function steadyAge(m: THREE.Material): THREE.Material {
  const own = m.onBeforeCompile;
  const ownKey = m.customProgramCacheKey();
  // the stain coordinate, and the one for the bumps of the hand-laid render
  const AGE_Q = 'vec2 q = vertical > 0.5 ? vec2(dot(p.xz, normalize(vec2(-n.z, n.x) + 1e-5)), p.y) : p.xz;';
  const AGE_QQ = 'vec2 qq = abs(nw.y) < 0.7 ? vec2(dot(pw.xz, normalize(vec2(-nw.z, nw.x) + 1e-5)), pw.y) : pw.xz;';
  m.onBeforeCompile = (shader, renderer) => {
    own.call(m, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace(AGE_Q, `${AGE_Q}
        if (vertical > 0.5 && length(fwidth(n)) > 0.04 * length(fwidth(p))) q = vec2((p.x + p.z) * 0.7071, p.y); // radius under 25 m`)
      .replace(AGE_QQ, `${AGE_QQ}
        if (abs(nw.y) < 0.7 && length(fwidth(nw)) > 0.04 * length(fwidth(pw))) qq = vec2((pw.x + pw.z) * 0.7071, pw.y);`);
  };
  m.customProgramCacheKey = () => `${ownKey}|steadyage`;
  m.needsUpdate = true;
  return m;
}

/** Lets a material use the baked `aOcc`: sky and bounce light are cut, direct sun is left alone. */
export function occlusion(m: THREE.Material): THREE.Material {
  const own = m.onBeforeCompile;
  const ownKey = m.customProgramCacheKey();
  m.onBeforeCompile = (shader, renderer) => {
    own.call(m, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aOcc;\nvarying float vOcc;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOcc = aOcc;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vOcc;')
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= 1.0 - vOcc;
        reflectedLight.indirectSpecular *= 1.0 - vOcc;`);
  };
  m.customProgramCacheKey = () => `${ownKey}|bakedocc`;
  m.needsUpdate = true;
  return m;
}
