import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Building } from './area';
import type { WallGrid } from './collision';
import type { Terrain } from './terrain';
import { townHallFrame } from './townhall';
import { twoBoneIK } from '../player/ik';
import { buildVehicle, coachMaterial, surfPatch, sweep, curve, ellipse, flat, lathe, cushion, mulberry, FIN, type Finish, type Hitch, type VehicleKind, type VehicleGeo } from './coachwork';

/**
 * Horse-drawn traffic round the square, as in the photographs of c.1900: izvozchiks' droshkies, a closed
 * carriage and a peasant's farm cart, each drawn by one shaft horse in Russian harness (collar with hames,
 * the duga arching over it, saddle pad and girth, breeching, bridle with blinkers) and driven by a seated
 * coachman in a long dark caftan and low hat with the reins in his hands. They keep to a loop that runs up
 * the open square on each side of the promenade and round behind the Town Hall; the loop is fitted to the
 * open ground at load time (each point is shifted sideways until the lane is clear of buildings, stalls and
 * fences by ~2.4 m), then smoothed. The harness is fitted to the horse's body and skinned to its bones, so it
 * moves with the walk. Horse and figure: Quaternius (CC0).
 */

export interface Vehicle { kind: VehicleKind; root: THREE.Group; s: number; speed: number }
export interface Traffic {
  group: THREE.Group; update(dt: number, walker: THREE.Vector3): void; route: THREE.Vector3[];
  vehicles: Vehicle[];                 // DEV: s (distance along the loop) can be set
  paused: boolean;                     // DEV: freeze for close-ups
}

const CLEAR = 2.4;

function clearance(walls: WallGrid, x: number, z: number): number {
  let m = Infinity;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2, R = 6;
    m = Math.min(m, walls.castSegment(x, z, x + Math.cos(a) * R, z + Math.sin(a) * R) * R);
  }
  return m;
}

/** The loop in the Town Hall frame (x along the north façade, -z north), fitted to open ground. */
export function fitRoute(th: Building, walls: WallGrid, free: (x: number, z: number) => boolean): THREE.Vector2[] {
  const f = townHallFrame(th);
  const toWorld = (x: number, z: number) => f.origin.clone().addScaledVector(f.dirX, x).addScaledVector(f.dirZ, z);
  const ideal: [number, number][] = [
    [54, 40], [55, 0], [55, -40], [54, -80], [52, -120], [40, -158], [18, -166], [-4, -158], [-16, -120],
    [-18, -80], [-18, -40], [-16, 0], [-14, 40], [0, 50], [20, 52], [40, 50],
  ];
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < ideal.length; i++) {
    const [x, z] = ideal[i], [px, pz] = ideal[(i - 1 + ideal.length) % ideal.length], [nx, nz] = ideal[(i + 1) % ideal.length];
    // shift along the local normal (in the frame) to find the clearest spot
    let tx = nx - px, tz = nz - pz; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nX = -tz, nZ = tx;
    let best: THREE.Vector3 | null = null, bestC = -1;
    for (const sft of [0, 2, -2, 4, -4, 6, -6, 8, -8, 10, -10]) {
      const w = toWorld(x + nX * sft, z + nZ * sft);
      if (!free(w.x, w.z)) continue;
      const c = clearance(walls, w.x, w.z);
      if (c >= CLEAR) { best = w; bestC = c; break; }
      if (c > bestC) { bestC = c; best = w; }
    }
    if (best && bestC >= 1.6) pts.push(new THREE.Vector2(best.x, best.z));
  }
  // smooth corners (Chaikin, 3 rounds) and resample every 1 m
  let p = pts;
  for (let r = 0; r < 3; r++) {
    const q: THREE.Vector2[] = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      q.push(a.clone().lerp(b, 0.25), a.clone().lerp(b, 0.75));
    }
    p = q;
  }
  return p;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** Smoothstep that also runs downhill (a > b). */
const sstep = (x: number, a: number, b: number) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// --- Skinned models: one merged mesh per figure, parts coloured per vertex ------------------------------------
interface Model {
  scene: THREE.Object3D; gltf: GLTF;
  geometry: THREE.BufferGeometry;       // bind space, attributes position/normal/skinIndex/skinWeight
  part: string[];                       // material name per vertex
  metric: Float32Array;                 // rest-pose vertex positions in metric model space (feet on y = 0)
  s: number; yOff: number;              // metric = scene * s + (0, yOff, 0)
  toBind: THREE.Matrix4;                // metric → bind space
  bones: { name: string; a: THREE.Vector3; b: THREE.Vector3 }[];   // skeleton.bones order, metric rest
  boneWorld: THREE.Matrix4[];           // rest matrixWorld of each bone (scene space)
}

async function loadModel(url: string, size: (box: THREE.Box3) => number): Promise<Model> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const meshes: THREE.SkinnedMesh[] = [];
  scene.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
  const box = new THREE.Box3().setFromObject(scene);
  const s = size(box), yOff = -box.min.y * s;
  const geos: THREE.BufferGeometry[] = [], part: string[] = [];
  const src = meshes[0];
  for (const m of meshes) {
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const g0 = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    const groups = m.geometry.groups.length ? m.geometry.groups : [{ start: 0, count: g0.getAttribute('position').count, materialIndex: 0 }];
    for (const gr of groups) {
      const piece = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'skinIndex', 'skinWeight']) {
        const a = g0.getAttribute(name) as THREE.BufferAttribute, arr: number[] = [];
        for (let i = gr.start; i < gr.start + gr.count; i++) for (let c = 0; c < a.itemSize; c++) arr.push(a.getComponent(i, c));
        piece.setAttribute(name, name === 'skinIndex' ? new THREE.Uint16BufferAttribute(arr, 4) : new THREE.Float32BufferAttribute(arr, a.itemSize));
      }
      const nm = (mats[gr.materialIndex ?? 0] as THREE.Material).name;
      for (let i = 0; i < gr.count; i++) part.push(nm);
      geos.push(piece);
    }
  }
  const geometry = mergeGeometries(geos, false)!;
  // rest-pose metric positions (bind pose = rest pose for these models)
  const P = geometry.getAttribute('position'), metric = new Float32Array(P.count * 3), v = new THREE.Vector3();
  const toMetric = new THREE.Matrix4().makeTranslation(0, yOff, 0).multiply(new THREE.Matrix4().makeScale(s, s, s)).multiply(src.matrixWorld);
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(toMetric); metric.set([v.x, v.y, v.z], i * 3); }
  const bones = src.skeleton.bones.map(b => {
    const a = b.getWorldPosition(new THREE.Vector3());
    const child = b.children.find(c => (c as THREE.Bone).isBone) ?? b.children[0];
    const e = child ? child.getWorldPosition(new THREE.Vector3()) : a.clone().add(new THREE.Vector3(0, 0.01, 0).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion())));
    const M = (p: THREE.Vector3) => p.multiplyScalar(s).add(new THREE.Vector3(0, yOff, 0));
    return { name: b.name, a: M(a), b: M(e) };
  });
  return { scene, gltf, geometry, part, metric, s, yOff, toBind: toMetric.clone().invert(), bones, boneWorld: src.skeleton.bones.map(b => b.matrixWorld.clone()) };
}

/** Accumulates skinned parts (built in metric rest space) and the model body into one geometry. */
class SkinKit {
  private parts: THREE.BufferGeometry[] = [];
  private md: Model;
  constructor(md: Model) { this.md = md; }
  bone(name: string): number { const i = this.md.bones.findIndex(b => b.name === name); if (i < 0) throw new Error(`bone ${name}`); return i; }
  /** Weights from the distance to the given bones' segments (sharp falloff), or rigid to one bone. */
  add(g: THREE.BufferGeometry, f: Finish, bones: string[] | ((p: THREE.Vector3) => [number, number][])): this {
    const geo = g.index ? g.toNonIndexed() : g;
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    const P = geo.getAttribute('position'), n = P.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), p = new THREE.Vector3(), seg = new THREE.Line3(), q = new THREE.Vector3();
    const ids = typeof bones === 'function' ? [] : bones.map(b => this.bone(b));
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(P, i);
      let w: [number, number][];
      if (typeof bones === 'function') w = bones(p);
      else if (ids.length === 1) w = [[ids[0], 1]];
      else {
        w = ids.map(k => { seg.set(this.md.bones[k].a, this.md.bones[k].b); seg.closestPointToPoint(p, true, q); return [k, 1 / Math.pow(q.distanceTo(p) + 0.03, 4)] as [number, number]; });
        w.sort((a, b) => b[1] - a[1]); w = w.slice(0, 3);
      }
      const tot = w.reduce((a, b) => a + b[1], 0) || 1;
      w.slice(0, 4).forEach(([k, x], j) => { si[i * 4 + j] = k; sw[i * 4 + j] = x / tot; });
    }
    geo.applyMatrix4(this.md.toBind);
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', geo.getAttribute('position'));
    out.setAttribute('normal', geo.getAttribute('normal'));
    out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    this.finish(out, () => f);
    this.parts.push(out);
    return this;
  }
  /** The model itself, coloured per vertex by `paint(part, metric position)`. */
  addBody(paint: (part: string, p: THREE.Vector3) => Finish & { col?: THREE.Color }): this {
    const g = this.md.geometry.clone();
    smoothNormals(g);
    const p = new THREE.Vector3();
    this.finish(g, i => paint(this.md.part[i], p.fromArray(this.md.metric, i * 3)));
    this.parts.push(g);
    return this;
  }
  private finish(g: THREE.BufferGeometry, f: (i: number) => Finish & { col?: THREE.Color }): void {
    const n = g.getAttribute('position').count, col = new Float32Array(n * 3), surf = new Float32Array(n * 4), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const fi = f(i);
      if (fi.col) c.copy(fi.col); else c.set(fi.c);
      col.set([c.r, c.g, c.b], i * 3);
      surf.set([fi.r ?? 0.6, fi.m ?? 0, fi.w ?? 0, fi.e ?? 0], i * 4);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('surf', new THREE.BufferAttribute(surf, 4));
  }
  build(): THREE.BufferGeometry {
    return mergeVertices(mergeGeometries(this.parts, false)!, 1e-5);
  }
}

/** Smooth normals for a triangle soup, shared across vertices at the same position (material seams). */
function smoothNormals(g: THREE.BufferGeometry): void {
  const P = g.getAttribute('position'), acc = new Map<string, THREE.Vector3>(), keys: string[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) keys.push(`${Math.round(P.getX(i) * 1e6)},${Math.round(P.getY(i) * 1e6)},${Math.round(P.getZ(i) * 1e6)}`);
  for (let t = 0; t < P.count; t += 3) {
    a.fromBufferAttribute(P, t); b.fromBufferAttribute(P, t + 1); c.fromBufferAttribute(P, t + 2);
    const n = b.sub(a).cross(c.sub(a));
    for (let k = 0; k < 3; k++) { const key = keys[t + k]; const v = acc.get(key); v ? v.add(n) : acc.set(key, n.clone()); }
  }
  const N = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) { const v = acc.get(keys[i])!.clone().normalize(); N.set([v.x, v.y, v.z], i * 3); }
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
}

// --- Fitting straps to the horse's body ------------------------------------------------------------------------
/** Ray casts against the horse's rest-pose surface (metric space). */
class Surface {
  private tris: Float32Array; private ok: Uint8Array;
  constructor(md: Model, keep: (part: string) => boolean) {
    const n = md.metric.length / 9;
    this.tris = md.metric; this.ok = new Uint8Array(n);
    for (let t = 0; t < n; t++) this.ok[t] = keep(md.part[t * 3]) ? 1 : 0;
  }
  /** Distance to the nearest (or farthest, within `max`) hit along a ray, or -1. */
  cast(o: THREE.Vector3, d: THREE.Vector3, far = false, max = 1): number {
    const T = this.tris; let best = far ? -1 : Infinity;
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), pv = new THREE.Vector3(), tv = new THREE.Vector3(), qv = new THREE.Vector3(), a = new THREE.Vector3();
    for (let t = 0; t < this.ok.length; t++) {
      if (!this.ok[t]) continue;
      a.fromArray(T, t * 9);
      e1.fromArray(T, t * 9 + 3).sub(a); e2.fromArray(T, t * 9 + 6).sub(a);
      pv.crossVectors(d, e2);
      const det = e1.dot(pv);
      if (Math.abs(det) < 1e-9) continue;
      tv.subVectors(o, a);
      const u = tv.dot(pv) / det; if (u < 0 || u > 1) continue;
      qv.crossVectors(tv, e1);
      const w = d.dot(qv) / det; if (w < 0 || u + w > 1) continue;
      const dist = e2.dot(qv) / det;
      if (dist <= 1e-4 || dist > max) continue;
      best = far ? Math.max(best, dist) : Math.min(best, dist);
    }
    return best === Infinity ? -1 : best;
  }
  /** Surface point along a ray, pushed out by `off` (falls back to `fb` metres if nothing is hit). */
  at(o: THREE.Vector3, d: THREE.Vector3, off: number, far = false, fb = 0.2, max = 1): THREE.Vector3 {
    const dn = d.clone().normalize(), t = this.cast(o, dn, far, max);
    return o.clone().addScaledVector(dn, (t < 0 ? fb : t) + off);
  }
  /** A ring round the body: rays from `c` in the plane normal to `n`, starting at `ref`, smoothed. */
  /** `far`: take the outermost surface (e.g. over the mane) for rays within that angle of `ref`. */
  ring(c: THREE.Vector3, n: THREE.Vector3, ref: THREE.Vector3, off: number, bins = 28, far = 0, a0 = 0, a1 = Math.PI * 2): { p: THREE.Vector3[]; out: THREE.Vector3[] } {
    const e1 = ref.clone().addScaledVector(n, -ref.dot(n)).normalize(), e2 = n.clone().cross(e1).normalize();
    const closed = a1 - a0 >= Math.PI * 2 - 1e-6, N = closed ? bins : bins + 1;
    const dirs: THREE.Vector3[] = [], r: number[] = [];
    for (let i = 0; i < N; i++) {
      const a = a0 + ((a1 - a0) * i) / bins;
      const d = e1.clone().multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a));
      const wrapped = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
      dirs.push(d); r.push(this.cast(c, d, wrapped < far, wrapped < far ? 0.35 : 0.6));
    }
    // fill misses from neighbours, then smooth
    for (let k = 0; k < N; k++) if (r[k] < 0) { let j = 1; while (j < N && r[(k + j) % N] < 0 && r[(k - j + N) % N] < 0) j++; r[k] = Math.max(r[(k + j) % N], r[(k - j + N) % N], 0.1); }
    const rs = r.map((x, i) => (closed || (i > 0 && i < N - 1)) ? (r[(i - 1 + N) % N] + 2 * x + r[(i + 1) % N]) / 4 : x);
    return { p: dirs.map((d, i) => c.clone().addScaledVector(d, rs[i] + off)), out: dirs };
  }
}

/** Centroid of the kept surface within a slab `band` thick about the plane (c, n), within `rad` of c. */
function centreOf(md: Model, keep: (p: string) => boolean, c: THREE.Vector3, n: THREE.Vector3, band = 0.04, rad = 0.4): THREE.Vector3 {
  const s = new THREE.Vector3(), p = new THREE.Vector3(); let k = 0;
  for (let i = 0; i < md.part.length; i++) {
    if (!keep(md.part[i])) continue;
    p.fromArray(md.metric, i * 3);
    if (Math.abs(p.clone().sub(c).dot(n)) > band || p.distanceTo(c) > rad) continue;
    s.add(p); k++;
  }
  return k ? s.divideScalar(k) : c.clone();
}

/** A leather strap along surface points, lying flat on the body (its width along `side` of the path). */
const strap = (pts: THREE.Vector3[], outs: THREE.Vector3[], w: number, t: number, closed = false) =>
  sweep(pts, flat(w / 2, t / 2), { ups: outs, closed });

// --- The horse, harnessed -------------------------------------------------------------------------------------
interface Coat { coat: string; dark: string; light: string; muzzle: string; hair: string; points?: string; dapple?: boolean }
const COATS: Record<string, Coat> = {
  bay: { coat: '#5c3421', dark: '#3c2415', light: '#7a4a2c', muzzle: '#231b16', hair: '#141010', points: '#19130f' },
  black: { coat: '#1f1b19', dark: '#161312', light: '#2c2724', muzzle: '#1c1715', hair: '#0f0d0c' },
  grey: { coat: '#8e8983', dark: '#6c6762', light: '#ada79f', muzzle: '#3c3735', hair: '#d4cec4', points: '#57524e', dapple: true },
  chestnut: { coat: '#7c4526', dark: '#5a311a', light: '#9c5f36', muzzle: '#3c2b22', hair: '#6c3a1c' },
};

interface HorseFit {
  hitch: Hitch;                          // horse-local positions in the walking pose (for the rigid shafts/duga)
  harness: (k: SkinKit, trim: Finish, hair: string) => void;
  rear: number;                          // horse origin to the buttocks
  bit: { bone: number; local: THREE.Vector3 }[];      // bit rings (left, right), bone-local (scene units)
  terret: { bone: number; local: THREE.Vector3 }[];   // rein rings on the saddle pad
}

/** Fits the Russian shaft harness to the horse (rest pose), and finds the tug and saddle points in the walk. */
function fitHorse(md: Model, walk: THREE.AnimationClip): HorseFit {
  const B = (n: string) => md.bones[md.bones.findIndex(b => b.name === n)];
  const skin = (p: string) => p === 'Main' || p === 'Main_Dark' || p === 'Main_Light' || p === 'Muzzle';
  const body = new Surface(md, skin);
  const mid = (c: THREE.Vector3, n: THREE.Vector3, band = 0.05, rad = 0.45) => centreOf(md, skin, c, n, band, rad);
  const withHair = new Surface(md, p => p !== 'Eye_Black' && p !== 'Eye_White' && p !== 'Hooves');
  const up = V(0, 1, 0), X = V(1, 0, 0);
  const T3 = B('Torso3').a, N1 = B('Neck1').a, N2 = B('Neck2').a, N3 = B('Neck3').a, HD = B('Head').a, T2 = B('Torso2').a, BK = B('Back').a;
  const avg = (part: string, side = 0) => { const s = new THREE.Vector3(); let n = 0; for (let i = 0; i < md.part.length; i++) if (md.part[i] === part && (side === 0 || Math.sign(md.metric[i * 3]) === side)) { s.x += md.metric[i * 3]; s.y += md.metric[i * 3 + 1]; s.z += md.metric[i * 3 + 2]; n++; } return s.divideScalar(Math.max(1, n)); };
  const muzzle = avg('Muzzle');
  // collar at the base of the neck, more upright than the neck itself
  const ndir = N3.clone().sub(T3).normalize();
  const cn = V(0, ndir.y * 0.55, ndir.z).normalize();
  const cc = mid(N1.clone().lerp(N2, 0.25), cn, 0.05, 0.3); cc.x = 0;
  const collar = withHair.ring(cc, cn, up, 0.045, 30, 0.9);
  const tugI = Math.round(30 * 0.27); // just below the horizontal on the left (+x) side
  const side = (i: number, sx: number) => sx > 0 ? i : (30 - i) % 30;
  const tugRest = collar.p[side(tugI, 1)].clone().addScaledVector(collar.out[side(tugI, 1)], 0.05).addScaledVector(cn, 0.02);
  const crestRest = collar.p[0].clone();
  // saddle pad and girth behind the withers
  const sz = T2.z + (T3.z - T2.z) * 0.6, Z = V(0, 0, 1), sc = mid(V(0, T2.y + 0.15, sz), Z, 0.05, 0.5); sc.x = 0;
  const girth = body.ring(sc, Z, up, 0.008, 30);
  const pad = body.ring(sc, Z, up, 0.028, 12, 0, -1.05, 1.05);
  const saddleTop = pad.p[6].clone().add(V(0, 0.02, 0));
  // head: poll → muzzle axis
  const hax = muzzle.clone().sub(HD).normalize(), hup = up.clone().addScaledVector(hax, -up.dot(hax)).normalize();
  const hp = (t: number) => { const c = mid(HD.clone().lerp(muzzle, t), hax, 0.035, 0.22); c.x = 0; return c; };
  const eyeL = avg('Eye_Black', 1), eyeR = avg('Eye_Black', -1);

  // tug and saddle points in the walking pose, averaged over the cycle (the shafts are rigid)
  const clone = cloneSkinned(md.scene), mixer = new THREE.AnimationMixer(clone), act = mixer.clipAction(walk);
  act.play();
  const bonesC: THREE.Object3D[] = md.bones.map(b => clone.getObjectByName(b.name)!);
  const toScene = (p: THREE.Vector3) => p.clone().sub(V(0, md.yOff, 0)).divideScalar(md.s);
  const toMetricP = (p: THREE.Vector3) => p.clone().multiplyScalar(md.s).add(V(0, md.yOff, 0));
  const inWalk = (p: THREE.Vector3, bone: string) => {
    const k = md.bones.findIndex(b => b.name === bone), local = toScene(p).applyMatrix4(md.boneWorld[k].clone().invert());
    const acc = new THREE.Vector3();
    for (let i = 0; i < 12; i++) { mixer.setTime((i / 12) * walk.duration); clone.updateMatrixWorld(true); acc.add(local.clone().applyMatrix4(bonesC[k].matrixWorld)); }
    return toMetricP(acc.divideScalar(12));
  };
  const tug = inWalk(tugRest, 'Neck1'), crest = inWalk(crestRest, 'Neck1'), saddle = inWalk(saddleTop, 'Torso2');
  tug.x = Math.abs(tug.x); crest.x = 0; saddle.x = 0;
  const local = (p: THREE.Vector3, bone: string) => { const k = md.bones.findIndex(b => b.name === bone); return { bone: k, local: toScene(p).applyMatrix4(md.boneWorld[k].clone().invert()) }; };

  // bit rings at the corners of the mouth
  const bitAt = (sx: number) => body.at(hp(0.86), hup.clone().multiplyScalar(-0.55).addScaledVector(X, sx).normalize(), 0.012);
  const bits = [bitAt(1), bitAt(-1)];
  const terrets = [-1, 1].map(sx => pad.p[6 + sx * 2].clone().add(V(0, 0.04, 0)));

  const harness = (k: SkinKit, trim: Finish) => {
    const L = FIN.leather;
    // collar: a thick leather roll, the hames standing on its front, tug loops at the sides
    k.add(sweep(collar.p, ellipse(0.05, 0.046, 8), { ups: collar.out, closed: true }), L, ['Torso3', 'Neck1']);
    for (const sx of [1, -1]) {
      const idx = Array.from({ length: 13 }, (_, i) => side(2 + i, sx));
      const pts = idx.map(i => collar.p[i].clone().addScaledVector(collar.out[i], 0.05).addScaledVector(cn, 0.03));
      k.add(sweep(curve(pts, 16), ellipse(0.02, 0.016, 6)), trim, ['Torso3', 'Neck1']);
      const tp = collar.p[side(tugI, sx)].clone().addScaledVector(collar.out[side(tugI, sx)], 0.07);
      k.add(new THREE.TorusGeometry(0.035, 0.012, 5, 10).rotateY(Math.PI / 2).translate(tp.x, tp.y, tp.z), FIN.brass, ['Neck1']);
    }
    // saddle pad with the rein terrets, girth
    k.add(strap(pad.p, pad.out, 0.2, 0.04), L, ['Torso2', 'Torso3']);
    k.add(strap(pad.p.map((p, i) => p.clone().addScaledVector(pad.out[i], 0.024)), pad.out, 0.12, 0.008), trim, ['Torso2', 'Torso3']);
    k.add(strap(girth.p, girth.out, 0.06, 0.01, true), L, ['Torso2', 'Torso3', 'Torso']);
    for (const t of terrets) k.add(new THREE.TorusGeometry(0.028, 0.007, 5, 10).translate(t.x, t.y, t.z), FIN.brass, ['Torso2']);
    // breeching: from the hames along the flanks, round the quarters; hip straps and back strap hold it up
    const yb = BK.y - 0.2, band: THREE.Vector3[] = [], bandOut: THREE.Vector3[] = [];
    const flank = (z: number, y: number, sx: number) => {
      const c = mid(V(0, y, z), Z, 0.06, 0.5), o = V(0, THREE.MathUtils.clamp(y, c.y - 0.12, c.y + 0.12), z), d = V(sx, 0, 0);
      return [body.at(o, d, 0.012, false, 0.26), d] as const;
    };
    for (let i = 0; i <= 8; i++) { const t = i / 8, z = THREE.MathUtils.lerp(tugRest.z - 0.12, BK.z + 0.1, t), y = THREE.MathUtils.lerp(tugRest.y - 0.02, yb, sstep(t, 0, 1)); const [p, d] = flank(z, y, 1); band.push(p); bandOut.push(d); }
    const rc = mid(V(0, yb, BK.z + 0.12), up, 0.05, 0.5); rc.set(0, yb, rc.z);
    for (let i = 1; i < 12; i++) { const a = (i / 12) * Math.PI, d = V(Math.cos(a), 0, -Math.sin(a)); band.push(body.at(rc, d, 0.012, false, 0.3)); bandOut.push(d); }
    for (let i = 8; i >= 0; i--) { const t = i / 8, z = THREE.MathUtils.lerp(tugRest.z - 0.12, BK.z + 0.1, t), y = THREE.MathUtils.lerp(tugRest.y - 0.02, yb, sstep(t, 0, 1)); const [p, d] = flank(z, y, -1); band.push(p); bandOut.push(d); }
    const hindBones = ['Back', 'Torso', 'BackLegL', 'BackLegR', 'Torso2'];
    k.add(strap(curve(band, 44), curve(bandOut, 44), 0.055, 0.01), L, hindBones);
    for (const z of [BK.z + 0.28, BK.z - 0.02]) {
      const cz = mid(V(0, yb + 0.1, z), Z, 0.05, 0.5); cz.x = 0;
      const hip = body.ring(cz, Z, up, 0.01, 10, 0, -1.25, 1.25);
      k.add(strap(hip.p, hip.out, 0.035, 0.008), L, hindBones);
    }
    const back: THREE.Vector3[] = [], backOut: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) { const z = THREE.MathUtils.lerp(sz - 0.12, BK.z - 0.1, i / 8); const c = mid(V(0, T2.y + 0.15, z), Z, 0.05, 0.5); back.push(body.at(V(0, c.y, z), up, 0.01, false, 0.25)); backOut.push(up); }
    k.add(strap(back, backOut, 0.035, 0.008), L, ['Torso2', 'Torso', 'Back']);
    // bridle: headstall behind the ears, browband, noseband, cheek pieces, blinkers, bit rings
    const headRing = (t: number, w: number, a0 = 0, a1 = Math.PI * 2, bins = 20) => { const r = body.ring(hp(t), hax, hup, 0.008, bins, 0, a0, a1); k.add(strap(r.p, r.out, w, 0.008, a1 - a0 >= Math.PI * 2 - 1e-6), L, ['Head']); return r; };
    headRing(0.04, 0.03);
    headRing(0.14, 0.022, -1.2, 1.2, 10);
    const nose = headRing(0.66, 0.035);
    for (const sx of [1, -1]) {
      const pts: THREE.Vector3[] = [], outs: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = THREE.MathUtils.lerp(0.04, 0.84, i / 8), d = hup.clone().multiplyScalar(THREE.MathUtils.lerp(-0.05, -0.5, i / 8)).addScaledVector(X, sx).normalize();
        pts.push(body.at(hp(t), d, 0.009)); outs.push(d);
      }
      k.add(strap(pts, outs, 0.026, 0.008), L, ['Head']);
      // blinker: a stiff leather cup standing off the eye
      const eye = sx > 0 ? eyeL : eyeR, bo = V(sx, 0.1, -0.15).normalize();
      const bl = cushion(0.006, 0.05, 0.065, 0.3, 10, 6);
      bl.applyMatrix4(new THREE.Matrix4().lookAt(new THREE.Vector3(), V(sx, 0, 0), up).premultiply(new THREE.Matrix4().makeRotationY(sx * 0.2)));
      k.add(bl.translate(eye.x + bo.x * 0.045, eye.y + 0.01, eye.z - 0.02), L, ['Head']);
      const b = bits[sx > 0 ? 0 : 1];
      k.add(new THREE.TorusGeometry(0.026, 0.006, 5, 12).rotateY(Math.PI / 2).translate(b.x + sx * 0.008, b.y, b.z), FIN.nickel, ['Head']);
    }
    void nose;
  };

  const mane = (k: SkinKit, hair: string) => {
    const rnd = mulberry(7), neck = ['Torso3', 'Neck1', 'Neck2', 'Neck3', 'Head'];
    const chain = [T3.clone().lerp(N1, 0.6), N1, N2, N3, HD.clone().add(hax.clone().multiplyScalar(-0.06))];
    const path = curve(chain, 22);
    for (let i = 0; i < path.length; i++) {
      const tdir = path[Math.min(path.length - 1, i + 1)].clone().sub(path[Math.max(0, i - 1)]).normalize();
      const dors = V(0, tdir.z, -tdir.y).normalize();
      const top = withHair.at(path[i], dors, -0.01, true, 0.12, 0.45);
      const len = (0.16 + rnd() * 0.1) * (i > path.length - 4 ? 0.6 : 1), sx = -1;
      const p0 = top, p1 = top.clone().add(V(sx * 0.04, 0.02, -0.02)), p2 = top.clone().add(V(sx * 0.1, -len * 0.35, -0.03)), p3 = top.clone().add(V(sx * (0.13 + rnd() * 0.03), -len, -0.05 + rnd() * 0.03));
      k.add(sweep(curve([p0, p1, p2, p3], 7), ellipse(0.028, 0.009, 5), { scale: t => 1 - 0.75 * t, up0: X }), { c: hair, r: 0.7 }, neck);
    }
    // forelock over the brow
    for (const sx of [-0.02, 0.02]) {
      const p0 = withHair.at(hp(0.02), hup, -0.01, true, 0.1, 0.4);
      k.add(sweep(curve([p0, p0.clone().addScaledVector(hax, 0.08).addScaledVector(hup, 0.02).add(V(sx, 0, 0)), p0.clone().addScaledVector(hax, 0.2).add(V(sx * 2, 0, 0))], 6), ellipse(0.025, 0.008, 5), { scale: t => 1 - 0.7 * t, up0: hup }), { c: hair, r: 0.7 }, ['Head']);
    }
    // tail: locks following the tail bones, spreading towards the end
    const tb = ['Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6', 'Tail7'].map(n => B(n));
    const tc = [...tb.map(b => b.a), tb[6].b, tb[6].b.clone().add(V(0, -0.25, -0.02))];
    for (let j = 0; j < 12; j++) {
      const a = (j / 12) * Math.PI * 2, rr = 0.02 + rnd() * 0.015;
      const pts = tc.slice(1).map((p, i) => p.clone().add(V(Math.cos(a) * rr * (1 + i * 0.35), 0, Math.sin(a) * rr * (1 + i * 0.25))));
      const g = sweep(curve(pts, 16), ellipse(0.022, 0.022, 5), { scale: t => 1 - 0.6 * t });
      k.add(g, { c: hair, r: 0.72 }, tb.map(b => b.name));
    }
  };

  return {
    hitch: { horseZ: 0, tug, crest, saddle },
    harness: (k, trim, hair) => { harness(k, trim); mane(k, hair); },
    rear: -Math.min(...Array.from({ length: md.part.length }, (_, i) => md.part[i] === 'Main' && md.metric[i * 3 + 1] > 0.9 ? md.metric[i * 3 + 2] : 0)),
    bit: bits.map(b => local(b, 'Head')),
    terret: terrets.map(t => local(t, 'Torso2')),
  };
}

function horseGeometry(md: Model, fit: HorseFit, coat: Coat, trim: Finish): THREE.BufferGeometry {
  const k = new SkinKit(md);
  const c = new THREE.Color(), base = new THREE.Color(), pts = coat.points ? new THREE.Color(coat.points) : null;
  k.addBody((part, p) => {
    if (part === 'Hooves') return { c: '#1d1a17', r: 0.38 };
    if (part === 'Eye_Black') return { c: '#050403', r: 0.08 };
    if (part === 'Eye_White') return { c: '#2a1c14', r: 0.1 };
    if (part === 'Hair') return { c: coat.hair, r: 0.7 };
    if (part === 'Muzzle') return { c: coat.muzzle, r: 0.5 };
    base.set(part === 'Main_Dark' ? coat.dark : part === 'Main_Light' ? coat.light : coat.coat);
    c.copy(base);
    // black points on the legs, a darker line along the back, soft variation in the coat
    if (pts) c.lerp(pts, sstep(p.y, 0.66, 0.42));
    c.multiplyScalar(1 - 0.16 * sstep(Math.abs(p.x), 0.12, 0.0) * sstep(p.y, 1.35, 1.6));
    c.multiplyScalar(0.94 + 0.12 * (0.5 + 0.5 * Math.sin(p.x * 7.1 + p.z * 5.3) * Math.sin(p.y * 6.7 - p.z * 3.1)));
    if (coat.dapple) { const d = Math.sin(p.x * 31 + p.y * 7) * Math.sin(p.y * 29 - p.z * 5) * Math.sin(p.z * 27 + p.x * 3); if (d > 0.25 && p.y > 0.9) c.multiplyScalar(1.16); }
    return { c: '#000', col: c, r: 0.56 };
  });
  fit.harness(k, trim, coat.hair);
  return k.build();
}

// --- The coachman ---------------------------------------------------------------------------------------------
interface Dress { coat: string; lining: string; sash: string; hat: 'low' | 'top' | 'felt'; hatC: string; skin: string; hair: string; beard: boolean }
const DRESS: Record<VehicleKind, Dress[]> = {
  droshky: [
    { coat: '#1a1f2c', lining: '#15181f', sash: '#6a2a1c', hat: 'low', hatC: '#121212', skin: '#c49074', hair: '#3a2a1e', beard: true },
    { coat: '#1e2230', lining: '#171a22', sash: '#2a3a2a', hat: 'low', hatC: '#141414', skin: '#bf8a6c', hair: '#5a4630', beard: true },
  ],
  brougham: [{ coat: '#141618', lining: '#101112', sash: '#141618', hat: 'top', hatC: '#0e0e0e', skin: '#caa085', hair: '#2a2018', beard: false }],
  cart: [{ coat: '#5e5446', lining: '#4a4236', sash: '#7a6a4a', hat: 'felt', hatC: '#2e2a24', skin: '#c08868', hair: '#6a5238', beard: true }],
};

interface Driver { root: THREE.Object3D; mixer: THREE.AnimationMixer; mesh: THREE.SkinnedMesh; arms: { u: THREE.Object3D; l: THREE.Object3D; h: THREE.Object3D }[] }

function hatGeometry(kind: Dress['hat']): THREE.BufferGeometry {
  // the izvozchik's low hat: a short crown widening to a flat top, narrow brim curled up at the sides
  if (kind === 'low') return lathe([[0, -0.004], [0.1, -0.004], [0.165, 0.0], [0.172, 0.03], [0.16, 0.012], [0.104, 0.02], [0.118, 0.112], [0.112, 0.12], [0, 0.12]], 22);
  if (kind === 'top') return lathe([[0, 0], [0.155, 0], [0.165, 0.025], [0.16, 0.012], [0.095, 0.03], [0.098, 0.17], [0, 0.17]], 20);
  return lathe([[0, -0.005], [0.19, -0.01], [0.21, -0.005], [0.2, 0.01], [0.1, 0.02], [0.09, 0.08], [0, 0.085]], 22);
}

function driverGeometry(md: Model, d: Dress, H: number): THREE.BufferGeometry {
  const k = new SkinKit(md);
  const sc = H / 1.72;
  k.addBody(part => {
    if (part === 'Skin') return { c: d.skin, r: 0.62 };
    if (part === 'Hair') return { c: d.hair, r: 0.8 };
    if (part === 'Eyes') return { c: '#1a1410', r: 0.3 };
    if (part === 'Details') return { c: '#15120f', r: 0.45 };
    return { c: d.coat, r: 0.9 };
  });
  const bone = (n: string) => md.bones[md.bones.findIndex(b => b.name === n)];
  const hips = bone('Hips').a, head = bone('Head').a, neck = bone('Neck').a;
  const iUL = k.bone('UpperLegL'), iUR = k.bone('UpperLegR'), iLL = k.bone('LowerLegL'), iLR = k.bone('LowerLegR'), iH = k.bone('Hips'), iA = k.bone('Abdomen');
  // the caftan's skirt, waist to mid-calf: the front follows the thighs and shins when he sits, the back hangs
  // (height / H, half-width, front, back); snug in front so the lap lies close over the thighs when he sits
  const rings: [number, number, number, number][] = [[0.6, 0.165, 0.125, 0.135], [0.54, 0.19, 0.13, 0.16], [0.47, 0.205, 0.12, 0.18], [0.38, 0.215, 0.105, 0.19], [0.3, 0.225, 0.1, 0.2], [0.22, 0.235, 0.1, 0.205], [0.15, 0.245, 0.1, 0.21]];
  const skirt = (inset: number) => rings.map(([h, rx, rf, rb]) => Array.from({ length: 29 }, (_, j) => {
    const a = (j / 28) * Math.PI * 2, cz = Math.cos(a);
    return V(hips.x + Math.sin(a) * (rx - inset) * sc, h * H, hips.z + cz * ((cz > 0 ? rf : rb) - inset) * sc);
  }));
  const weights = (p: THREE.Vector3): [number, number][] => {
    const h = p.y / H, f = sstep((p.z - hips.z) / (0.12 * sc), -0.2, 0.6), L = p.x > hips.x;
    const up = sstep(h, 0.43, 0.49), knee = sstep(h, 0.3, 0.23), top = sstep(h, 0.53, 0.6), leg = f * (1 - up);
    return [[L ? iUL : iUR, leg * (1 - knee) + 1e-4], [L ? iLL : iLR, leg * knee], [iH, (1 - leg) * (1 - top) + 1e-4], [iA, (1 - leg) * top]];
  };
  const mid = V(hips.x, H * 0.4, hips.z);
  const outer = gridOriented(skirt(0), mid, false), inner = gridOriented(skirt(0.012), mid, true);
  k.add(outer, { c: d.coat, r: 0.9 }, weights).add(inner, { c: d.lining, r: 0.95 }, weights);
  // sash tied round the waist
  k.add(lathe([[0.17 * sc, H * 0.565], [0.178 * sc, H * 0.585], [0.172 * sc, H * 0.61]], 20).scale(1, 1, 0.8).translate(hips.x, 0, hips.z), { c: d.sash, r: 0.85 }, ['Hips', 'Abdomen']);
  // padded shoulders and chest (the izvozchik's bulk), standing collar
  k.add(lathe([[0.16 * sc, H * 0.6], [0.17 * sc, H * 0.68], [0.175 * sc, H * 0.76], [0.14 * sc, H * 0.8], [0.07 * sc, H * 0.82]], 18).scale(1, 1, 0.78).translate(hips.x, 0, hips.z), { c: d.coat, r: 0.9 }, ['Abdomen', 'Torso']);
  k.add(lathe([[0.07 * sc, neck.y - 0.03], [0.072 * sc, neck.y + 0.03], [0.068 * sc, neck.y + 0.045]], 14).translate(neck.x, 0, neck.z), { c: d.coat, r: 0.9 }, ['Torso', 'Neck']);
  // hat and beard on the head
  const top = md.bones.reduce((m, b) => Math.max(m, b.b.y), 0);
  const hat = hatGeometry(d.hat).translate(head.x, top - 0.06 * sc, head.z + 0.005);
  k.add(hat, { c: d.hatC, r: 0.7 }, ['Head']);
  if (d.hat === 'low') k.add(lathe([[0.107, 0.022], [0.109, 0.04], [0.108, 0.042]], 22).translate(head.x, top - 0.06 * sc, head.z + 0.005), { c: '#2a2a2a', r: 0.6 }, ['Head']);
  // full beard along the jaw, below the mouth
  if (d.beard) k.add(cushion(0.07 * sc, 0.055 * sc, 0.045 * sc, 0.6, 12, 8).translate(head.x, head.y - 0.035 * sc, head.z + 0.062 * sc), { c: d.hair, r: 0.85 }, ['Head']);
  return k.build();
}

/** Grid surface whose normals face away from `inside` (or towards it for a lining). */
function gridOriented(rows: THREE.Vector3[][], inside: THREE.Vector3, flip: boolean): THREE.BufferGeometry {
  const R = rows.length, C = rows[0].length, pos: number[] = [], idx: number[] = [];
  for (const r of rows) for (const p of r) pos.push(p.x, p.y, p.z);
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < C - 1; j++) { const a = i * C + j; idx.push(a, a + 1, a + C + 1, a, a + C + 1, a + C); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const N = g.getAttribute('normal'), p = new THREE.Vector3(1, 0, 0);
  const s = N.getX(C * 2 + 3) * (pos[(C * 2 + 3) * 3] - inside.x) + N.getZ(C * 2 + 3) * (pos[(C * 2 + 3) * 3 + 2] - inside.z);
  if ((s < 0) !== flip) { for (let q = 0; q < idx.length; q += 3) [idx[q + 1], idx[q + 2]] = [idx[q + 2], idx[q + 1]]; g.setIndex(idx); g.computeVertexNormals(); }
  void p;
  return g;
}

// --- Reins: two lines from the bit through the saddle rings to the driver's hands, rebuilt each frame -----------
class Reins {
  readonly mesh: THREE.Mesh;
  private N = 18; private R = 4;
  constructor(mat: THREE.Material) {
    const n = this.N * this.R * 2, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    const col = new Float32Array(n * 3), surf = new Float32Array(n * 4), c = new THREE.Color('#1c1612');
    for (let i = 0; i < n; i++) { col.set([c.r, c.g, c.b], i * 3); surf.set([0.45, 0, 0, 0], i * 4); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('surf', new THREE.BufferAttribute(surf, 4));
    const idx: number[] = [];
    for (let r = 0; r < 2; r++) for (let i = 0; i < this.N - 1; i++) for (let j = 0; j < this.R; j++) {
      const o = r * this.N * this.R, a = o + i * this.R + j, b = o + i * this.R + ((j + 1) % this.R), c2 = b + this.R, d = a + this.R;
      idx.push(a, b, c2, a, c2, d);
    }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
  }
  private p = new THREE.Vector3(); private t = new THREE.Vector3(); private u = new THREE.Vector3(); private w = new THREE.Vector3();
  update(lines: [THREE.Vector3, THREE.Vector3, THREE.Vector3][]): void {
    const P = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute, Nm = this.mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
    const pts: THREE.Vector3[] = Array.from({ length: this.N }, () => new THREE.Vector3());
    lines.forEach(([a, b, c], r) => {
      // bit → terret nearly taut, terret → hand with a little slack
      const k0 = 6;
      for (let i = 0; i < this.N; i++) {
        if (i < k0) { const t = i / k0; pts[i].copy(a).lerp(b, t); pts[i].y -= 0.02 * Math.sin(Math.PI * t); }
        else { const t = (i - k0) / (this.N - 1 - k0); pts[i].copy(b).lerp(c, t); pts[i].y -= 0.07 * Math.sin(Math.PI * t); }
      }
      for (let i = 0; i < this.N; i++) {
        this.t.copy(pts[Math.min(this.N - 1, i + 1)]).sub(pts[Math.max(0, i - 1)]).normalize();
        this.u.set(0, 1, 0).addScaledVector(this.t, -this.t.y).normalize();
        this.w.crossVectors(this.t, this.u);
        for (let j = 0; j < this.R; j++) {
          const an = (j / this.R) * Math.PI * 2, cs = Math.cos(an), sn = Math.sin(an), k = r * this.N * this.R + i * this.R + j;
          this.p.copy(this.u).multiplyScalar(cs).addScaledVector(this.w, sn);
          Nm.setXYZ(k, this.p.x, this.p.y, this.p.z);
          P.setXYZ(k, pts[i].x + this.p.x * 0.007, pts[i].y + this.p.y * 0.007, pts[i].z + this.p.z * 0.007);
        }
      }
    });
    P.needsUpdate = true; Nm.needsUpdate = true;
  }
}

// --- Traffic ---------------------------------------------------------------------------------------------------
interface Rig {
  v: Vehicle; geo: VehicleGeo; hitch: Hitch;
  body: THREE.Group; front: THREE.Group; wheelsR: THREE.Mesh; wheelsF: THREE.Mesh;
  horse: THREE.Object3D; hmesh: THREE.SkinnedMesh; mixer: THREE.AnimationMixer; walk: THREE.AnimationAction; idle: THREE.AnimationAction;
  driver: Driver | null; reins: Reins; hands: THREE.Vector3[];
  vel: number; phase: number; bits: { o: THREE.Object3D; local: THREE.Vector3 }[]; terrets: { o: THREE.Object3D; local: THREE.Vector3 }[];
}

export async function buildTraffic(opts: {
  th: Building; walls: WallGrid; terrain: Terrain; free: (x: number, z: number) => boolean;
  wood: THREE.MeshStandardMaterial; rain: boolean; wet?: (m: THREE.Material, kind: 'ground' | 'roof' | 'wall', groundY?: number, hExpr?: string) => THREE.Material;
}): Promise<Traffic> {
  const group = new THREE.Group();
  group.name = 'traffic';
  const loop = fitRoute(opts.th, opts.walls, opts.free);
  const route = loop.map(p => new THREE.Vector3(p.x, 0, p.y));
  const vehicles: Vehicle[] = [];
  if (loop.length < 8) return { group, update: () => {}, route, vehicles, paused: false };
  const cum: number[] = [0];
  for (let i = 1; i <= loop.length; i++) cum.push(cum[i - 1] + loop[i % loop.length].distanceTo(loop[i - 1]));
  const total = cum[cum.length - 1];
  const at = (s: number, out: THREE.Vector2) => {
    s = ((s % total) + total) % total;
    let i = 1; while (cum[i] < s) i++;
    const a = loop[i - 1], b = loop[i % loop.length];
    return out.copy(a).lerp(b, (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1));
  };

  const [hm, mm] = await Promise.all([
    loadModel('assets/char/horse.glb', b => 2.5 / Math.max(b.max.x - b.min.x, b.max.z - b.min.z)),   // nose to tail ~2.5 m
    loadModel('assets/char/man.glb', b => 1.72 / (b.max.y - b.min.y)),
  ]);
  const clip = (m: Model, n: string) => m.gltf.animations.find(a => a.name.endsWith(n))!;
  const clipWalk = clip(hm, 'Walk'), clipIdle = clip(hm, 'Idle');
  const sitting = THREE.AnimationUtils.subclip(clip(mm, 'Man_Sitting'), 'seated', 12, 200, 24);
  const fit = fitHorse(hm, clipWalk);

  // materials: coachwork (paint, leather, iron, timber by vertex), horse coat with a soft sheen, cloth
  const coach = coachMaterial(opts.wood);
  const horseMat = surfPatch(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 1, metalness: 1, sheen: 0.6, sheenRoughness: 0.5, sheenColor: '#6a6058' }), false);
  const clothMat = surfPatch(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 1, metalness: 1, sheen: 0.4, sheenRoughness: 0.7, sheenColor: '#4a4a50' }), false);
  if (opts.wet) { opts.wet(coach, 'roof'); opts.wet(horseMat, 'roof'); opts.wet(clothMat, 'wall', 0, '2.0'); }

  const specs: { kind: VehicleKind; coat: string; paint: string; wheel: string; duga: string; trim: Finish }[] = [
    { kind: 'droshky', coat: 'bay', paint: '#141414', wheel: '#161412', duga: '#5a1c14', trim: FIN.lacquer('#121212') },
    { kind: 'cart', coat: 'grey', paint: '#000', wheel: '#000', duga: '#000', trim: FIN.wood('#9a8266') },
    { kind: 'brougham', coat: 'black', paint: '#18261d', wheel: '#15211a', duga: '#141414', trim: FIN.brass },
    { kind: 'droshky', coat: 'chestnut', paint: '#16181e', wheel: '#4a1e16', duga: '#2a3a24', trim: FIN.lacquer('#101010') },
  ];
  const n = Math.min(specs.length, Math.max(1, Math.floor(total / 90)));
  const rigs: Rig[] = [];
  for (let i = 0; i < n; i++) {
    const sp = specs[i];
    const root = new THREE.Group();
    root.rotation.order = 'YXZ';
    // horse stands ~0.4 m ahead of the front wheels
    const rFguess = sp.kind === 'brougham' ? 0.4 : sp.kind === 'cart' ? 0.4 : 0.37;
    const hitch: Hitch = { ...fit.hitch, horseZ: rFguess + 0.42 + fit.rear };
    const geo = buildVehicle(sp.kind, hitch, { rain: opts.rain, paint: sp.paint, wheelPaint: sp.wheel, duga: sp.duga, seed: 11 + i });
    const mesh = (g: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D) => { const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    mesh(geo.chassis, coach, root);
    const body = new THREE.Group(); body.position.copy(geo.pivot); root.add(body);
    mesh(geo.body, coach, body);
    const wheelsR = mesh(geo.wheelsR, coach, root); wheelsR.position.set(0, geo.rR, 0);
    const front = new THREE.Group(); front.position.set(0, 0, geo.wb); root.add(front);
    mesh(geo.front, coach, front);
    const wheelsF = mesh(geo.wheelsF, coach, front); wheelsF.position.set(0, geo.rF, 0);
    // horse
    const horse = cloneSkinned(hm.scene);
    let hmesh: THREE.SkinnedMesh | null = null;
    horse.traverse(o => { if (!hmesh && (o as THREE.SkinnedMesh).isSkinnedMesh) hmesh = o as THREE.SkinnedMesh; });
    const hsrc = hmesh! as THREE.SkinnedMesh;
    const hg = horseGeometry(hm, fit, COATS[sp.coat], sp.trim);
    const hmNew = new THREE.SkinnedMesh(hg, horseMat);
    hmNew.bind(hsrc.skeleton, hsrc.bindMatrix);
    hmNew.castShadow = true; hmNew.receiveShadow = true; hmNew.frustumCulled = false;
    hsrc.parent!.add(hmNew);
    horse.traverse(o => { if ((o as THREE.Mesh).isMesh && o !== hmNew) o.visible = false; });
    horse.scale.multiplyScalar(hm.s);
    horse.position.set(0, hm.yOff, hitch.horseZ);
    front.add(horse);
    const mixer = new THREE.AnimationMixer(horse);
    const walk = mixer.clipAction(clipWalk), idle = mixer.clipAction(clipIdle);
    walk.play(); idle.play(); idle.setEffectiveWeight(0);
    walk.time = (i * 0.37) % clipWalk.duration;
    const boneOf = (k: number) => horse.getObjectByName(hm.bones[k].name)!;
    // coachman on the box
    let driver: Driver | null = null;
    {
      const dress = DRESS[sp.kind][i % DRESS[sp.kind].length];
      const Hh = 1.72 * (0.97 + 0.05 * ((i * 0.618) % 1));
      const fig = cloneSkinned(mm.scene);
      let fsrc: THREE.SkinnedMesh | null = null;
      fig.traverse(o => { if (!fsrc && (o as THREE.SkinnedMesh).isSkinnedMesh) fsrc = o as THREE.SkinnedMesh; });
      const fs = fsrc! as THREE.SkinnedMesh;
      const fm = new THREE.SkinnedMesh(driverGeometry(mm, dress, Hh), clothMat);
      fm.bind(fs.skeleton, fs.bindMatrix);
      fm.castShadow = true; fm.receiveShadow = true; fm.frustumCulled = false;
      fs.parent!.add(fm);
      fig.traverse(o => { if ((o as THREE.Mesh).isMesh && o !== fm) o.visible = false; });
      const ks = Hh / 1.72;
      fig.scale.multiplyScalar(mm.s * ks);
      const droot = new THREE.Group();
      droot.add(fig);
      fig.position.y = mm.yOff * ks;
      // seated: his pelvis on the cushion, thighs forward over the front edge
      droot.position.set(0, geo.seat.y - 0.39 * ks, geo.seat.z + 0.24 * ks);
      body.add(droot);
      const dm = new THREE.AnimationMixer(fig);
      const a = dm.clipAction(sitting); a.play(); a.time = (i * 1.7) % sitting.duration;
      const b = (nm: string) => fig.getObjectByName(nm)!;
      driver = { root: droot, mixer: dm, mesh: fm, arms: [{ u: b('UpperArmL'), l: b('LowerArmL'), h: b('PalmL') }, { u: b('UpperArmR'), l: b('LowerArmR'), h: b('PalmR') }] };
    }
    const reins = new Reins(coach);
    group.add(reins.mesh);
    group.add(root);
    const v: Vehicle = { kind: sp.kind, root, s: (total / n) * i, speed: 1.9 + 0.3 * (i % 2) };
    vehicles.push(v);
    rigs.push({
      v, geo, hitch, body, front, wheelsR, wheelsF, horse, hmesh: hmNew, mixer, walk, idle, driver, reins, hands: [new THREE.Vector3(), new THREE.Vector3()],
      vel: 0, phase: i * 1.3,
      bits: fit.bit.map(b => ({ o: boneOf(b.bone), local: b.local })), terrets: fit.terret.map(b => ({ o: boneOf(b.bone), local: b.local })),
    });
  }

  const p0 = new THREE.Vector2(), pF = new THREE.Vector2(), pH = new THREE.Vector2(), pB = new THREE.Vector2();
  const ik = new THREE.Vector3(), pole = new THREE.Vector3(), bitW = [new THREE.Vector3(), new THREE.Vector3()], terW = [new THREE.Vector3(), new THREE.Vector3()];
  const traffic: Traffic = {
    group, route, vehicles, paused: false,
    update(dtIn: number, walker: THREE.Vector3) {
      const dt = traffic.paused ? 0 : dtIn;
      for (const r of rigs) {
        const g = r.geo, lead = g.wb + r.hitch.horseZ;
        // stop for the walker standing in front of the horse
        at(r.v.s + lead + 1.8, pB);
        const block = Math.hypot(walker.x - pB.x, walker.z - pB.y) < 2.2;
        const want = block ? 0 : r.v.speed;
        r.vel += (want - r.vel) * (1 - Math.exp(-2.5 * dt));
        const ds = r.vel * dt;
        r.v.s += ds;
        // rear axle, front axle and horse on the path: the body follows the chord, the front unit turns
        at(r.v.s, p0); at(r.v.s + g.wb, pF); at(r.v.s + lead + 0.3, pH);
        const yawB = Math.atan2(pF.x - p0.x, pF.y - p0.y), yawF = Math.atan2(pH.x - pF.x, pH.y - pF.y);
        const h0 = opts.terrain.heightAt(p0.x, p0.y), hF = opts.terrain.heightAt(pF.x, pF.y);
        const root = r.v.root;
        root.position.set(p0.x, h0, p0.y);
        root.rotation.set(-Math.atan2(hF - h0, g.wb), yawB, 0);
        r.front.rotation.y = Math.atan2(Math.sin(yawF - yawB), Math.cos(yawF - yawB));
        const dist = Math.hypot(p0.x - walker.x, p0.y - walker.z);
        root.visible = dist < 170;
        r.reins.mesh.visible = dist < 80;
        if (!root.visible) continue;
        r.wheelsR.rotation.x += ds / g.rR;
        r.wheelsF.rotation.x += ds / g.rF;
        // horse gait; the body rocks on its springs with the pull and the cobbles
        const k = Math.min(1, r.vel / r.v.speed);
        r.walk.setEffectiveWeight(k); r.idle.setEffectiveWeight(1 - k);
        r.walk.timeScale = Math.max(0.3, r.vel / 2.0);
        const far = dist > 90;
        if (!far) r.mixer.update(dt);
        r.phase += dt;
        const gait = (r.walk.time / clipWalk.duration) * Math.PI * 4, sp = g.springy;
        const cob = Math.sin(r.v.s * 3.7) * 0.6 + Math.sin(r.v.s * 7.9 + 1.3) * 0.4;
        r.body.position.set(g.pivot.x, g.pivot.y + k * (sp * 0.008 * Math.sin(gait + 0.8) + 0.004 * cob), g.pivot.z);
        r.body.rotation.set(k * (sp * 0.008 * Math.sin(gait)), 0, k * (sp * 0.014 * Math.sin(r.phase * 1.7) + (0.004 + sp * 0.004) * cob) + (1 - k) * sp * 0.003 * Math.sin(r.phase * 0.9));
        if (r.driver && !far) {
          r.driver.mixer.update(dt);
          r.driver.mesh.castShadow = dist < 45;
          // hands on the reins, forearms forward over the knees
          root.updateMatrixWorld(true);
          const s = g.seat;
          r.driver.arms.forEach((a, j) => {
            const sx = j === 0 ? 1 : -1;
            ik.set(sx * 0.11, s.y + 0.22 + 0.01 * Math.sin(gait + j), s.z + 0.36);
            r.body.localToWorld(ik);
            pole.set(sx * 0.8, -0.6, -0.5).transformDirection(r.body.matrixWorld);
            twoBoneIK(a.u, a.l, a.h, ik, pole);
            a.h.getWorldPosition(r.hands[j]);
          });
        }
        if (r.reins.mesh.visible) {
          if (far) root.updateMatrixWorld(true);
          r.bits.forEach((b, j) => bitW[j].copy(b.local).applyMatrix4(b.o.matrixWorld));
          r.terrets.forEach((t, j) => terW[j].copy(t.local).applyMatrix4(t.o.matrixWorld));
          r.reins.update([[bitW[0], terW[1], r.hands[0]], [bitW[1], terW[0], r.hands[1]]]);
        }
      }
    },
  };
  return traffic;
}
