import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { WET } from '../render/weather';
import { MeshoptSimplifier } from '../../vendor/meshoptimizer/meshopt_simplifier.js';

/**
 * Townsfolk bodies: Quaternius' Universal Base Characters (CC0) - a man and a woman with real faces,
 * hands and one shared 65-bone rig - animated with the Universal Animation Library (CC0, same rig).
 * The packs come undressed, so c.1900 clothes are built here from the body itself, in its bind pose:
 * coat, bodice and trousers are the body's own surface smoothed of anatomy and pushed out by the cloth
 * thickness (so they bend exactly as the body does), with the hem and cuff edges closed; frock-coat
 * skirts, floor-length skirts, capes, shawls and aprons hang from the waist or shoulders, skinned to
 * the pelvis and thighs so they swing with the stride; hats sit on the head bone. After the period
 * views and photographs: dark wool, white linen at collar and cuffs, black silk hats, muddy hems.
 * Each figure is one skinned mesh and one draw; colours come from a per-person palette uniform.
 */

// Palette slots (per vertex); the shader looks the colour and cloth response up per person.
export const SLOT = { SKIN: 0, HAIR: 1, EYE: 2, COAT: 3, LOWER: 4, LINEN: 5, HAT: 6, LEATHER: 7, ACCENT: 8, LINING: 9, BROLLY: 10, WOOD: 11, CURLS: 12 } as const;
const NSLOT = 13;   // CURLS: hair built as a shell (women's put-up hair), coloured as HAIR

export interface FolkBody {
  sex: 'm' | 'f';
  template: THREE.Object3D;                // the armature, bones only; cloned per figure
  boneNames: string[];                     // skeleton order (= skin joint indices)
  boneInverses: THREE.Matrix4[];
  bone: (name: string) => number;
  J: Record<string, THREE.Vector3>;        // bind-pose joint positions (mesh space: metres, y up, facing +Z)
  parts: Record<string, THREE.BufferGeometry>;
  tex: { skin: THREE.Texture; skinN: THREE.Texture; hair: THREE.Texture; eye: THREE.Texture };
  clips: Record<string, THREE.AnimationClip>;
  height: number;                          // feet to crown, bind pose
  m: Marks;
}
interface Marks {
  neckY: number; headY: number; eyeY: number; top: number;
  shoulderX: number; elbowX: number; wristX: number; armY: number; armZ: number;
  waistY: number; hipY: number; kneeY: number; ankleY: number; zc: number;
}

const loader = new GLTFLoader();
let clothTex: THREE.Texture | null = null;

/** Loads both bodies and the shared animation set (once); clips are fitted to each body (pelvis height). */
let folkLoad: Promise<{ m: FolkBody; f: FolkBody }> | null = null;
export function loadFolk(): Promise<{ m: FolkBody; f: FolkBody }> {
  return (folkLoad ??= loadBodies());
}
async function loadBodies(): Promise<{ m: FolkBody; f: FolkBody }> {
  await MeshoptSimplifier.ready;
  const [gm, gf, ga] = await Promise.all(['assets/char/folk_male.glb', 'assets/char/folk_female.glb', 'assets/char/folk_anims.glb'].map(u => loader.loadAsync(u)));
  clothTex ??= new THREE.TextureLoader().load('assets/char/wool_disp.jpg', t => { t.needsUpdate = true; });
  clothTex.wrapS = clothTex.wrapT = THREE.RepeatWrapping;
  clothTex.anisotropy = 4;
  return { m: body(gm, 'm', ga.animations, ga.scene), f: body(gf, 'f', ga.animations, ga.scene) };
}

function body(g: { scene: THREE.Group }, sex: 'm' | 'f', anims: THREE.AnimationClip[], animScene: THREE.Object3D): FolkBody {
  const meshes: Record<string, THREE.SkinnedMesh> = {};
  g.scene.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes[o.name] = o as THREE.SkinnedMesh; });
  const b = meshes.Body;
  const sk = b.skeleton;
  const boneNames = sk.bones.map(x => x.name);
  const J: Record<string, THREE.Vector3> = {};
  sk.bones.forEach((x, i) => { J[x.name] = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(sk.boneInverses[i]).invert()); });
  const parts: Record<string, THREE.BufferGeometry> = {};
  for (const [k, m] of Object.entries(meshes)) parts[k] = m.geometry;
  const mat = (k: string) => meshes[k]?.material as THREE.MeshStandardMaterial;
  const tex = { skin: mat('Body').map!, skinN: mat('Body').normalMap!, eye: mat('Eyes').map!, hair: mat('Brows').map! };
  // bones only: the armature with its meshes removed
  const template = b.parent!;
  for (const m of Object.values(meshes)) m.removeFromParent();
  template.removeFromParent();
  template.position.set(0, 0, 0); template.rotation.set(0, 0, 0); template.scale.set(1, 1, 1);
  const pos = parts.Body.getAttribute('position');
  let top = 0;
  for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
  parts.Eyes.computeBoundingBox();
  const eb = parts.Eyes.boundingBox!;
  // torso depth centre at the hips (the axis the skirts hang round)
  let z0 = 9, z1 = -9;
  for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i) - J.pelvis.y) < 0.03 && Math.abs(pos.getX(i)) < 0.3) { z0 = Math.min(z0, pos.getZ(i)); z1 = Math.max(z1, pos.getZ(i)); }
  const m: Marks = {
    neckY: J.neck_01.y, headY: J.Head.y, eyeY: (eb.min.y + eb.max.y) / 2, top,
    shoulderX: J.upperarm_l.x, elbowX: J.lowerarm_l.x, wristX: J.hand_l.x, armY: J.upperarm_l.y, armZ: J.lowerarm_l.z,
    waistY: THREE.MathUtils.lerp(J.spine_01.y, J.spine_02.y, 0.7), hipY: J.pelvis.y, kneeY: J.calf_l.y, ankleY: J.foot_l.y, zc: (z0 + z1) / 2,
  };
  // the animation set was made on its own mannequin: scale the pelvis track to this body's hip height
  const animPelvis = animScene.getObjectByName('pelvis')!.position.length();
  const own = sk.bones[boneNames.indexOf('pelvis')].position.length();
  // the library's hands are balled into fists: open them halfway, towards the relaxed bind pose
  const q = new THREE.Quaternion(), rest = new THREE.Quaternion();
  const clips: Record<string, THREE.AnimationClip> = {};
  for (const a of anims) {
    const c = a.clone();
    for (const t of c.tracks) {
      if (t.name === 'pelvis.position') for (let i = 0; i < t.values.length; i++) t.values[i] *= own / animPelvis;
      const fm = /^((index|middle|ring|pinky|thumb)_0[1-3]_[lr])\.quaternion$/.exec(t.name);
      if (!fm) continue;
      rest.copy(sk.bones[boneNames.indexOf(fm[1])].quaternion);
      const k = fm[2] === 'thumb' ? 0.25 : 0.45;
      for (let i = 0; i < t.values.length; i += 4) q.fromArray(t.values, i).slerp(rest, k).toArray(t.values, i);
    }
    clips[a.name] = c;
  }
  return { sex, template, boneNames, boneInverses: sk.boneInverses, bone: n => boneNames.indexOf(n), J, parts, tex, clips, height: top, m };
}

// --- Geometry builder with skin data --------------------------------------------------------------
type W4 = [number, number, number, number];
interface Skin { j: W4; w: W4 }
class Geo {
  p: number[] = []; n: number[] = []; uv: number[] = []; j: number[] = []; w: number[] = []; s: number[] = []; idx: number[] = [];
  get count(): number { return this.p.length / 3; }
  v(x: number, y: number, z: number, sk: Skin, slot: number, u = 0, t = 0, nx = 0, ny = 1, nz = 0): number {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, t); this.j.push(...sk.j); this.w.push(...sk.w); this.s.push(slot);
    return this.count - 1;
  }
  tri(a: number, b: number, c: number): void { this.idx.push(a, b, c); }
  quad(a: number, b: number, c: number, d: number): void { this.idx.push(a, b, c, a, c, d); }
  /** Smooth normals for the vertices from `v0` on, from the triangles from `i0` on. */
  normals(v0: number, i0: number): void {
    const P = this.p, N = this.n;
    for (let v = v0; v < this.count; v++) N[v * 3] = N[v * 3 + 1] = N[v * 3 + 2] = 0;
    for (let i = i0; i < this.idx.length; i += 3) {
      const a = this.idx[i] * 3, b = this.idx[i + 1] * 3, c = this.idx[i + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      for (const k of [a, b, c]) if (k >= v0 * 3) { N[k] += nx; N[k + 1] += ny; N[k + 2] += nz; }
    }
    for (let v = v0; v < this.count; v++) {
      const l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
      if (l < 1e-12) { N[v * 3] = 0; N[v * 3 + 1] = 1; N[v * 3 + 2] = 0; continue; }   // degenerate: any unit normal (never NaN)
      N[v * 3] /= l; N[v * 3 + 1] /= l; N[v * 3 + 2] /= l;
    }
  }
  /** A back face for thin cloth: the vertices from v0 and triangles from i0, copied with the winding reversed. */
  backFace(v0: number, i0: number): void {
    const n = this.count - v0, i1 = this.idx.length, b0 = this.count;
    for (let v = v0; v < v0 + n; v++) this.v(this.p[v * 3], this.p[v * 3 + 1], this.p[v * 3 + 2], { j: this.j.slice(v * 4, v * 4 + 4) as W4, w: this.w.slice(v * 4, v * 4 + 4) as W4 }, this.s[v], this.uv[v * 2], this.uv[v * 2 + 1]);
    for (let i = i0; i < i1; i += 3) this.tri(this.idx[i] - v0 + b0, this.idx[i + 2] - v0 + b0, this.idx[i + 1] - v0 + b0);
    this.normals(b0, i1);
  }
  /** Compact attributes (half the memory of plain floats): byte normals and weights, half-float UVs. */
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry(), n = this.count;
    const nrm = new Int8Array(n * 3), wts = new Uint8Array(n * 4);
    for (let i = 0; i < n * 3; i++) nrm[i] = Math.round(clamp(this.n[i], -1, 1) * 127);
    for (let v = 0; v < n; v++) {
      let sum = 0, big = 0;
      for (let k = 0; k < 4; k++) { wts[v * 4 + k] = Math.round(this.w[v * 4 + k] * 255); sum += wts[v * 4 + k]; if (wts[v * 4 + k] > wts[v * 4 + big]) big = k; }
      wts[v * 4 + big] += 255 - sum;   // the weights must still add up to one
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3, true));
    g.setAttribute('uv', new THREE.Float16BufferAttribute(this.uv.map(x => THREE.DataUtils.toHalfFloat(x)), 2));
    g.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(this.j, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(wts, 4, true));
    g.setAttribute('slot', new THREE.Uint8BufferAttribute(this.s, 1));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    return g;
  }
}
/** Weights from {bone: weight} (bones by index), the four largest, normalised. */
function skin(ws: Map<number, number>): Skin {
  const e = [...ws.entries()].filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = e.reduce((a, [, w]) => a + w, 0) || 1;
  const j: W4 = [0, 0, 0, 0], w: W4 = [0, 0, 0, 0];
  e.forEach(([b, x], i) => { j[i] = b; w[i] = x / sum; });
  return { j, w };
}
const mix = (a: Map<number, number>, b: Map<number, number>, t: number): Map<number, number> => {
  const o = new Map<number, number>();
  for (const [k, v] of a) o.set(k, v * (1 - t));
  for (const [k, v] of b) o.set(k, (o.get(k) ?? 0) + v * t);
  return o;
};
const rigid = (b: number): Skin => ({ j: [b, 0, 0, 0], w: [1, 0, 0, 0] });
const ss = THREE.MathUtils.smoothstep;
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;

// --- The body in bind pose ------------------------------------------------------------------------
interface BodyGeo {
  P: Float32Array; UV: Float32Array; J: ArrayLike<number>; W: ArrayLike<number>; I: ArrayLike<number>;
  wid: Int32Array; nw: number;                 // position-welded vertex ids (the UV seams are split)
}
const bodyGeoCache = new WeakMap<THREE.BufferGeometry, BodyGeo>();
function bodyGeo(g: THREE.BufferGeometry): BodyGeo {
  let bg = bodyGeoCache.get(g);
  if (bg) return bg;
  const P = g.getAttribute('position').array as Float32Array;
  const n = P.length / 3, wid = new Int32Array(n), keys = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(P[i * 3] * 1e4)},${Math.round(P[i * 3 + 1] * 1e4)},${Math.round(P[i * 3 + 2] * 1e4)}`;
    let w = keys.get(k);
    if (w === undefined) { w = keys.size; keys.set(k, w); }
    wid[i] = w;
  }
  bg = { P, UV: g.getAttribute('uv').array as Float32Array, J: g.getAttribute('skinIndex').array as ArrayLike<number>, W: g.getAttribute('skinWeight').array as ArrayLike<number>, I: g.index!.array, wid, nw: keys.size };
  bodyGeoCache.set(g, bg);
  return bg;
}
const vskin = (B: BodyGeo, v: number): Skin => ({ j: [B.J[v * 4], B.J[v * 4 + 1], B.J[v * 4 + 2], B.J[v * 4 + 3]], w: [B.W[v * 4], B.W[v * 4 + 1], B.W[v * 4 + 2], B.W[v * 4 + 3]] });
const vskinMap = (B: BodyGeo, v: number): Map<number, number> => { const m = new Map<number, number>(); for (let k = 0; k < 4; k++) if (B.W[v * 4 + k] > 0) m.set(B.J[v * 4 + k], (m.get(B.J[v * 4 + k]) ?? 0) + B.W[v * 4 + k]); return m; };

interface ShellOpts {
  inside: (x: number, y: number, z: number) => boolean;   // per vertex; a triangle is taken when all three are
  shape?: (p: THREE.Vector3) => void;                      // reshapes the vertex before smoothing (e.g. tubular sleeves)
  offset: (x: number, y: number, z: number) => number;     // cloth thickness along the smoothed normal
  smooth: number;                                          // Taubin iterations (anatomy out, form kept)
  cut?: (p: THREE.Vector3) => void;                        // moves an edge vertex onto the intended hem line
  keepSkin?: boolean;                                      // cut only the garment's edge, not the skin under it
  slot: number; rim: number;                               // surface slot, edge (thickness) slot
}
interface Shell { verts: Map<number, number>; pos: Float32Array; nrm: Float32Array }   // body vertex -> shell vertex

/** A garment made from the body surface: the covered triangles, smoothed and pushed out, edges closed. */
function shell(B: BodyGeo, o: ShellOpts, out: Geo, taken: Uint8Array): Shell {
  const P = B.P, I = B.I, wid = B.wid;
  const inV = new Uint8Array(P.length / 3);
  for (let v = 0; v < inV.length; v++) inV[v] = o.inside(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]) ? 1 : 0;
  const tris: number[] = [];
  for (let t = 0; t < I.length / 3; t++) {
    const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
    if (inV[a] && inV[b] && inV[c]) { tris.push(t); taken[t] = 1; }
  }
  // welded topology of the taken part
  const wpos = new Float32Array(B.nw * 3), used = new Uint8Array(B.nw);
  const nb = new Map<number, Set<number>>(), edge = new Map<number, number>();
  const ek = (a: number, b: number) => (a < b ? a * 1e6 + b : b * 1e6 + a);
  const tmp = new THREE.Vector3();
  for (const t of tris) for (let k = 0; k < 3; k++) {
    const v = I[t * 3 + k], w = wid[v];
    if (!used[w]) {
      used[w] = 1;
      tmp.set(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      o.shape?.(tmp);
      wpos.set([tmp.x, tmp.y, tmp.z], w * 3);
    }
    const w2 = wid[I[t * 3 + ((k + 1) % 3)]];
    edge.set(ek(w, w2), (edge.get(ek(w, w2)) ?? 0) + 1);
    if (!nb.has(w)) nb.set(w, new Set());
    if (!nb.has(w2)) nb.set(w2, new Set());
    nb.get(w)!.add(w2); nb.get(w2)!.add(w);
  }
  const border = new Uint8Array(B.nw);
  for (const [w, s] of nb) for (const x of s) if (edge.get(ek(w, x)) === 1) border[w] = 1;
  // straight hems: the edge follows the triangles, so it zig-zags; pull its vertices onto the line
  if (o.cut) {
    for (const w of nb.keys()) if (border[w]) { tmp.fromArray(wpos, w * 3); o.cut(tmp); tmp.toArray(wpos, w * 3); }
    // the skin meets the garment on the same line (B.P is this outfit's own copy)
    if (!o.keepSkin) {
      for (const t of tris) for (let k = 0; k < 3; k++) {
        const v = I[t * 3 + k], w = wid[v];
        if (!border[w]) continue;
        tmp.set(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); o.cut(tmp); tmp.toArray(P, v * 3);
      }
      // skin vertices on the covered side that no garment triangle reached would poke through the hem
      for (let v = 0; v < inV.length; v++) if (inV[v] && !used[wid[v]]) { tmp.set(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); o.cut(tmp); tmp.toArray(P, v * 3); }
    }
  }
  // Taubin smoothing (lambda/mu), border pinned
  const ids = [...nb.keys()], nxt = new Float32Array(wpos);
  for (let it = 0; it < o.smooth * 2; it++) {
    const f = it % 2 ? -0.53 : 0.5;
    for (const w of ids) {
      if (border[w]) continue;
      const s = nb.get(w)!;
      let ax = 0, ay = 0, az = 0;
      for (const x of s) { ax += wpos[x * 3]; ay += wpos[x * 3 + 1]; az += wpos[x * 3 + 2]; }
      const k = 1 / s.size;
      nxt[w * 3] = wpos[w * 3] + f * (ax * k - wpos[w * 3]);
      nxt[w * 3 + 1] = wpos[w * 3 + 1] + f * (ay * k - wpos[w * 3 + 1]);
      nxt[w * 3 + 2] = wpos[w * 3 + 2] + f * (az * k - wpos[w * 3 + 2]);
    }
    wpos.set(nxt);
  }
  // normals on the welded surface
  const wn = new Float32Array(B.nw * 3);
  for (const t of tris) {
    const a = wid[I[t * 3]] * 3, b = wid[I[t * 3 + 1]] * 3, c = wid[I[t * 3 + 2]] * 3;
    const ux = wpos[b] - wpos[a], uy = wpos[b + 1] - wpos[a + 1], uz = wpos[b + 2] - wpos[a + 2];
    const vx = wpos[c] - wpos[a], vy = wpos[c + 1] - wpos[a + 1], vz = wpos[c + 2] - wpos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { wn[k] += nx; wn[k + 1] += ny; wn[k + 2] += nz; }
  }
  for (const w of ids) {
    const l = Math.hypot(wn[w * 3], wn[w * 3 + 1], wn[w * 3 + 2]) || 1;
    wn[w * 3] /= l; wn[w * 3 + 1] /= l; wn[w * 3 + 2] /= l;
    const d = o.offset(wpos[w * 3], wpos[w * 3 + 1], wpos[w * 3 + 2]);
    wpos[w * 3] += wn[w * 3] * d; wpos[w * 3 + 1] += wn[w * 3 + 1] * d; wpos[w * 3 + 2] += wn[w * 3 + 2] * d;
  }
  const verts = new Map<number, number>();
  const vert = (v: number) => {
    let i = verts.get(v);
    if (i === undefined) {
      const w = wid[v] * 3;
      i = out.v(wpos[w], wpos[w + 1], wpos[w + 2], vskin(B, v), o.slot, B.UV[v * 2], B.UV[v * 2 + 1], wn[w], wn[w + 1], wn[w + 2]);
      verts.set(v, i);
    }
    return i;
  };
  const i0 = out.idx.length;
  for (const t of tris) out.tri(vert(I[t * 3]), vert(I[t * 3 + 1]), vert(I[t * 3 + 2]));
  // close the edges: a strip from the garment edge back down to the skin
  const seen = new Set<number>();
  for (const t of tris) for (let k = 0; k < 3; k++) {
    const a = I[t * 3 + k], b = I[t * 3 + ((k + 1) % 3)];
    const key = ek(wid[a], wid[b]);
    if (edge.get(key) !== 1 || seen.has(key)) continue;
    seen.add(key);
    const as = out.p.slice(vert(a) * 3, vert(a) * 3 + 3), bs = out.p.slice(vert(b) * 3, vert(b) * 3 + 3);
    const v0 = out.count;
    out.v(bs[0], bs[1], bs[2], vskin(B, b), o.rim);
    out.v(as[0], as[1], as[2], vskin(B, a), o.rim);
    out.v(P[a * 3], P[a * 3 + 1], P[a * 3 + 2], vskin(B, a), o.rim);
    out.v(P[b * 3], P[b * 3 + 1], P[b * 3 + 2], vskin(B, b), o.rim);
    const j0 = out.idx.length;
    out.quad(v0, v0 + 1, v0 + 2, v0 + 3);
    out.normals(v0, j0);
  }
  void i0;
  return { verts, pos: wpos, nrm: wn };
}

// --- Hanging cloth: coat skirts, skirts, aprons ---------------------------------------------------
interface HangOpts {
  yTop: number; hem: (th: number) => number;
  radius: (k: number, t: number, th: number) => number;      // row k (0 = top), depth t (0..1), angle (0 = front)
  open?: (t: number) => number; vent?: (t: number) => number; // half-angles of the front opening and back vent
  span?: [number, number];                                    // or an explicit angular range (aprons)
  rows: number; cols: number; slot: number; inner: number | null; thick: number;
  weights: (x: number, y: number, z: number, t: number) => Map<number, number>;
  zc: number;
}
function hang(o: HangOpts, out: Geo): void {
  const sheets: [(t: number) => number, (t: number) => number][] = [];
  if (o.span) sheets.push([() => o.span![0], () => o.span![1]]);
  else if (o.vent) {
    const op = o.open ?? (() => 0), ve = o.vent;
    sheets.push([t => op(t), t => Math.PI - ve(t)], [t => Math.PI + ve(t), t => Math.PI * 2 - op(t)]);
  } else if (o.open) { const op = o.open; sheets.push([t => op(t), t => Math.PI * 2 - op(t)]); }
  else sheets.push([() => 0, () => Math.PI * 2]);
  const closed = !o.open && !o.vent && !o.span;
  for (const [a0, a1] of sheets) {
    const cols = Math.max(4, Math.round(o.cols * (a1(1) - a0(1)) / (Math.PI * 2)));
    const grid = (sign: number, slot: number) => {
      const v0 = out.count, i0 = out.idx.length;
      const nc = closed ? cols : cols + 1;
      for (let k = 0; k < o.rows; k++) {
        const t = k / (o.rows - 1);
        for (let c = 0; c < nc; c++) {
          const th = lerp(a0(t), a1(t), c / cols);
          const y = lerp(o.yTop, o.hem(th), t);
          const r = o.radius(k, t, th) - (sign < 0 ? o.thick : 0);
          const x = Math.sin(th) * r, z = o.zc + Math.cos(th) * r;
          out.v(x, y, z, skin(o.weights(x, y, z, t)), slot, th * r, y);
        }
      }
      for (let k = 0; k < o.rows - 1; k++) for (let c = 0; c < cols; c++) {
        const c1 = closed ? (c + 1) % cols : c + 1;
        const a = v0 + k * nc + c, b = v0 + k * nc + c1, d = v0 + (k + 1) * nc + c, e = v0 + (k + 1) * nc + c1;
        // angle grows towards +x (the figure's left); outward faces wind (a, d, e, b)
        if (sign > 0) out.quad(a, d, e, b); else out.quad(a, b, e, d);
      }
      out.normals(v0, i0);
      return { v0, nc };
    };
    const outer = grid(1, o.slot);
    if (o.inner === null) continue;
    const inner = grid(-1, o.inner);
    // hem and opening edges
    const i0 = out.idx.length, nc = outer.nc, last = (o.rows - 1) * nc;
    const e0 = out.count;
    const copy = (v: number) => out.v(out.p[v * 3], out.p[v * 3 + 1], out.p[v * 3 + 2], { j: out.j.slice(v * 4, v * 4 + 4) as W4, w: out.w.slice(v * 4, v * 4 + 4) as W4 }, o.inner!);
    for (let c = 0; c < cols; c++) {
      const c1 = closed ? (c + 1) % cols : c + 1;
      const a = copy(outer.v0 + last + c), b = copy(outer.v0 + last + c1), d = copy(inner.v0 + last + c), e = copy(inner.v0 + last + c1);
      out.quad(a, d, e, b);
    }
    if (!closed) for (const [c, s] of [[0, 1], [cols, -1]] as const) for (let k = 0; k < o.rows - 1; k++) {
      const a = copy(outer.v0 + k * nc + c), b = copy(outer.v0 + (k + 1) * nc + c), d = copy(inner.v0 + k * nc + c), e = copy(inner.v0 + (k + 1) * nc + c);
      if (s > 0) out.quad(a, d, e, b); else out.quad(a, b, e, d);
    }
    out.normals(e0, i0);
  }
}

/** Largest distance from the hanging axis of the body (and what is already on it) per height and angle. */
function radialTable(pts: Float32Array | number[], zc: number, y0: number, y1: number, rows: number, cols: number, keep: (x: number, y: number, z: number) => boolean): Float32Array {
  const T = new Float32Array(rows * cols);
  const dy = (y1 - y0) / Math.max(1, rows - 1);
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i], y = pts[i + 1], z = pts[i + 2];
    if (!keep(x, y, z)) continue;
    const r = Math.hypot(x, z - zc);
    const th = (Math.atan2(x, z - zc) + Math.PI * 2) % (Math.PI * 2);
    const kf = (y - y0) / dy;
    for (let k = Math.max(0, Math.floor(kf - 0.8)); k <= Math.min(rows - 1, Math.ceil(kf + 0.8)); k++) {
      const cf = th / (Math.PI * 2) * cols;
      for (let c = Math.floor(cf - 1); c <= Math.ceil(cf + 1); c++) {
        const ci = ((c % cols) + cols) % cols;
        if (T[k * cols + ci] < r) T[k * cols + ci] = r;
      }
    }
  }
  return T;
}
const lookup = (T: Float32Array, cols: number, k: number, th: number) => {
  const cf = ((th / (Math.PI * 2)) * cols + cols * 4) % cols, c0 = Math.floor(cf), c1 = (c0 + 1) % cols, f = cf - c0;
  return T[k * cols + c0] * (1 - f) + T[k * cols + c1] * f;
};

// --- Outfits -------------------------------------------------------------------------------------
export type MaleCoat = 'frock' | 'great' | 'caped' | 'jacket' | 'long';
export type MaleHat = 'top' | 'bowler' | 'felt' | 'wide' | 'cap' | 'flatcap';
export type FemaleHat = 'brim' | 'toque' | 'bonnet' | 'scarf';
export interface Outfit {
  sex: 'm' | 'f';
  coat?: MaleCoat; hat: MaleHat | FemaleHat; beard?: 'full' | 'moustache' | 'none'; hair?: 'parted' | 'buzzed';
  stout?: boolean; apron?: boolean;
  wrap?: 'shawl' | 'cape' | 'none';                        // women: over the shoulders
  umbrella?: boolean; pole?: boolean;
}
export const outfitKey = (o: Outfit) => [o.sex, o.coat, o.hat, o.beard, o.hair, o.stout, o.apron, o.wrap, o.umbrella, o.pole].join('|');

export interface FigureGeometry { lods: THREE.BufferGeometry[]; grip: THREE.Vector3 | null; top: number; paint: THREE.Vector4; legs: Float32Array | null }
const outfitCache = new Map<string, FigureGeometry>();

/** The dressed figure, in bind pose, with two lower levels of detail sharing its vertices. */
export function dress(F: FolkBody, o: Outfit): FigureGeometry {
  const key = outfitKey(o);
  const hit = outfitCache.get(key);
  if (hit) return hit;
  const B0 = bodyGeo(F.parts.Body), B: BodyGeo = { ...B0, P: B0.P.slice() };   // hems move the skin's edge vertices
  const m = F.m, male = F.sex === 'm';
  const out = new Geo();
  const taken = new Uint8Array(B.I.length / 3);
  const bi = F.bone;
  const back = (z: number) => ss(-z, -0.02, 0.07);                 // 0 at the front of the neck, 1 behind
  const neckHalf = male ? 0.075 : 0.068;
  const coatLine = (z: number) => m.neckY + (male ? 0.006 : 0.05) + (male ? 0.03 : 0.014) * back(z);
  const collarLine = (z: number) => Math.min(m.neckY + 0.034 + 0.03 * back(z), m.headY - 0.03);   // low under the chin, up behind
  const isHand = (x: number) => Math.abs(x) > m.wristX - (male ? 0.028 : 0.022);
  const isHeadArea = (x: number, y: number, z: number) => y > m.headY - 0.015 || (Math.abs(x) < neckHalf + 0.05 && y > coatLine(z));
  const long = o.coat === 'great' || o.coat === 'caped' || o.coat === 'long';
  // leg of mutton sleeves (women), stout men
  const armT = (x: number) => clamp((Math.abs(x) - m.shoulderX) / (m.wristX - m.shoulderX), 0, 1);
  const upperOff = (x: number, y: number, z: number) => {
    const a = armT(x);
    let d = Math.abs(x) < m.shoulderX + 0.01 ? (male ? 0.021 : 0.009) : lerp(male ? 0.019 : 0.009, male ? 0.011 : 0.006, a);
    if (male && long) d += 0.008;
    if (!male && Math.abs(x) > m.shoulderX - 0.03) d += 0.03 * Math.pow(Math.sin(Math.PI * clamp((Math.abs(x) - m.shoulderX + 0.03) / 0.26, 0, 1)), 0.8);
    if (o.stout && z > -0.02 && y < m.waistY + 0.2 && Math.abs(x) < m.shoulderX) d += 0.055 * Math.exp(-(((y - m.waistY + 0.03) / 0.13) ** 2)) * ss(z, -0.02, 0.09);
    return d;
  };
  // sleeves and trouser legs lose the anatomy: pushed out to a tube round the limb's axis
  const tube = (p: THREE.Vector3) => {
    if (Math.abs(p.x) > m.shoulderX + 0.03 && p.y > m.waistY) {
      // sleeves: a tube round the arm, the muscles all but gone
      const a = armT(p.x), R = lerp(0.052, 0.042, a) + (male ? 0 : -0.008);
      const dy = p.y - m.armY, dz = p.z - m.armZ, r = Math.hypot(dy, dz);
      const rr = r < R ? R : R + (r - R) * (male ? 0.3 : 0.5);
      if (r > 1e-4) { p.y = m.armY + dy / r * rr; p.z = m.armZ + dz / r * rr; }
    } else if (male && p.y > m.waistY - 0.05) {
      // the heroic V-shaped torso of the base model, made ordinary
      p.x *= 1 - 0.1 * ss(Math.abs(p.x), 0.07, 0.24) * ss(p.y, m.waistY, m.waistY + 0.15);
      if (p.z > 0.05) p.z = 0.05 + (p.z - 0.05) * 0.75;
    } else if (male && p.y < m.hipY - 0.06) {
      const sx = Math.sign(p.x) || 1, ax = sx * F.J.thigh_l.x, t = clamp((m.hipY - p.y) / (m.hipY - m.ankleY), 0, 1);
      const az = lerp(F.J.thigh_l.z, F.J.foot_l.z, t) + 0.01, R = lerp(0.082, 0.064, t);
      const dx = p.x - ax, dz = p.z - az, r = Math.hypot(dx, dz);
      if (r < R && r > 1e-4 && Math.abs(p.x) > 0.02) { p.x = ax + dx / r * R; p.z = az + dz / r * R; }
    }
  };
  // coat or bodice with sleeves
  const cuffX = m.wristX - (male ? 0.028 : 0.022), hemY = m.waistY - (male ? 0.04 : 0.03);
  const upper = shell(B, {
    inside: (x, y, z) => !isHand(x) && !isHeadArea(x, y, z) && y > hemY,
    shape: tube, offset: upperOff, smooth: male ? 10 : 7, slot: SLOT.COAT, rim: male ? SLOT.LINING : SLOT.COAT,
    cut: p => {
      if (Math.abs(p.x) > m.wristX - 0.1) p.x = Math.sign(p.x) * cuffX;
      else if (p.y < m.waistY) p.y = hemY;
      else if (p.y > m.neckY - 0.06 && Math.abs(p.x) < neckHalf + 0.06) p.y = coatLine(p.z);
    },
  }, out, taken);
  // shirt cuffs and collar (men); the women's high collar is part of the bodice
  if (male) {
    shell(B, {
      inside: (x, y, z) => Math.abs(x) < neckHalf + 0.05 && y > m.neckY - 0.04 && y < collarLine(z), offset: () => 0.006, smooth: 3, slot: SLOT.LINEN, rim: SLOT.LINEN,
      cut: p => { if (p.y > m.neckY + 0.01) p.y = collarLine(p.z); },
    }, out, taken);
    shell(B, { inside: x => Math.abs(x) > m.wristX - 0.034 && Math.abs(x) < m.wristX - 0.012, offset: () => 0.008, smooth: 2, slot: SLOT.LINEN, rim: SLOT.LINEN, cut: p => { p.x = Math.sign(p.x) * (Math.abs(p.x) > m.wristX - 0.023 ? m.wristX - 0.012 : m.wristX - 0.034); } }, out, taken);
  }
  // legs: trousers (men); under a floor-length skirt nothing shows, so they go
  const bootTop = m.ankleY + (male ? 0.07 : 0.1);
  const trousers = male ? shell(B, { inside: (x, y) => y < m.waistY + 0.03 && y > m.ankleY + 0.035 && !isHand(x) && Math.abs(x) < 0.3, shape: tube, offset: () => 0.012, smooth: 8, slot: SLOT.LOWER, rim: SLOT.LOWER }, out, taken) : null;
  if (!male) for (let t = 0; t < taken.length; t++) {
    const ys = [0, 1, 2].map(k => B.P[B.I[t * 3 + k] * 3 + 1]);
    if (Math.max(...ys) < m.waistY - 0.02 && Math.min(...ys) > bootTop - 0.02) taken[t] = 1;
  }
  // boots
  shell(B, { inside: (_x, y) => y < bootTop, offset: () => 0.006, smooth: 14, slot: SLOT.LEATHER, rim: SLOT.LEATHER }, out, taken);

  // --- hanging garments
  const drape0 = out.count;
  const zc = m.zc;
  const upperPts = upper.pos;
  const lowerY = male ? (o.coat === 'jacket' ? m.hipY - 0.1 : long ? m.kneeY - 0.2 : m.kneeY + 0.02) : 0.012;
  const topY = m.waistY + 0.012;
  const ROWS = male ? (o.coat === 'jacket' ? 5 : 11) : 16, COLS = male ? 44 : 56;
  // body clearance: everything below the waist (hands and arms excepted), per height and angle
  const bodyT = radialTable(B.P, zc, topY, lowerY, ROWS, COLS, (x, y) => Math.abs(x) < 0.3 && y < topY + 0.05 && (male || y > 0.3));
  const topT = radialTable(upperPts, zc, topY - 0.02, topY + 0.02, 1, COLS, (x, y) => Math.abs(x) < m.shoulderX && Math.abs(y - topY) < 0.04 && y !== 0);
  const pel = bi('pelvis'), tl = bi('thigh_l'), tr = bi('thigh_r'), sp1 = bi('spine_01');
  const hangW = (thigh: number) => (x: number, _y: number, _z: number, t: number) => {
    const l = clamp(0.5 + x / 0.24, 0, 1), th = thigh * Math.pow(t, 1.4);
    return new Map([[sp1, 0.35 * (1 - ss(t, 0, 0.25))], [pel, 1 - th], [tl, th * l], [tr, th * (1 - l)]]);
  };
  const cl = bi('calf_l'), cr = bi('calf_r');
  const coatW = (x: number, y: number, z: number, t: number) => {
    const l = clamp(0.5 + x / 0.24, 0, 1), th = 0.9 * ss(t, 0, 0.6);
    const c = 0.4 * ss(-(z - zc) / Math.max(1e-6, Math.hypot(x, z - zc)), -0.3, 0.7) * (1 - ss(y, m.kneeY - 0.2, m.kneeY + 0.02));
    return new Map([[sp1, 0.35 * (1 - ss(t, 0, 0.25))], [pel, 1 - th], [tl, th * l * (1 - c)], [tr, th * (1 - l) * (1 - c)], [cl, th * l * c], [cr, th * (1 - l) * c]]);
  };
  const rng = seeded(key);
  const ph = [rng() * 6, rng() * 6, rng() * 6];
  const folds = (th: number, t: number, n: number, amp: number) => 1 + amp * Math.pow(t, 1.2) * (0.6 * Math.sin(th * n + ph[0]) + 0.4 * Math.sin(th * (n * 1.7 + 1) + ph[1]));
  if (male) {
    const flare = o.coat === 'jacket' ? 0.02 : long ? 0.12 : 0.07;
    const radii = new Float32Array(ROWS * COLS);
    for (let c = 0; c < COLS; c++) {
      let r = Math.max(topT[c] - 0.004, bodyT[c] + 0.012);
      for (let k = 0; k < ROWS; k++) {
        const t = k / (ROWS - 1);
        r = Math.max(r + (k ? flare * (Math.pow(t, 1.5) - Math.pow((k - 1) / (ROWS - 1), 1.5)) : 0), bodyT[k * COLS + c] + 0.016);
        radii[k * COLS + c] = r;
      }
    }
    smoothRows(radii, ROWS, COLS, 3);
    const hemM = (th: number) => lowerY + (o.coat === 'frock' ? 0.03 * Math.cos(th) : 0.012 * Math.cos(th));
    const amp = o.coat === 'jacket' ? 0.01 : 0.03;
    const coatR = (k: number, th: number) => {   // the coat skirt's radius at a fractional row
      const k0 = Math.min(ROWS - 1, Math.floor(k)), k1 = Math.min(ROWS - 1, k0 + 1), f = k - k0;
      return lerp(lookup(radii, COLS, k0, th), lookup(radii, COLS, k1, th), f) * folds(th, k / (ROWS - 1), 7, amp);
    };
    hang({
      yTop: topY, hem: hemM, rows: ROWS, cols: COLS, zc,
      radius: (k, _t, th) => coatR(k, th),
      open: o.coat === 'frock' ? t => 0.07 + 0.3 * t * t : o.coat === 'jacket' ? t => 0.05 + 0.2 * t : t => 0.03 + 0.05 * t,
      vent: o.coat === 'jacket' ? undefined : t => (t > 0.25 ? 0.035 * ss(t, 0.25, 0.4) : 0),
      slot: SLOT.COAT, inner: SLOT.LINING, thick: 0.005, weights: o.coat === 'jacket' ? hangW(0.6) : coatW,
    }, out);
    if (o.apron) {
      // over the coat skirt where there is one, then clear of the legs down to the knee
      const aTop = topY - 0.02, aHem = m.kneeY - 0.05, AR = 8;
      const legT = radialTable(B.P, zc, aTop, aHem, AR, COLS, (x, y) => Math.abs(x) < 0.3 && y < aTop + 0.05);
      hang({
        yTop: aTop, hem: () => aHem, rows: AR, cols: COLS, zc, span: [-0.75, 0.75],
        radius: (k, t, th) => {
          const y = lerp(aTop, aHem, t), kc = (topY - y) / (topY - hemM(th)) * (ROWS - 1);
          return Math.max(kc <= ROWS - 1 ? coatR(Math.max(0, kc), th) : 0, (lookup(legT, COLS, k, th) + 0.03) * folds(th, t, 5, 0.012)) + 0.012;
        },
        slot: SLOT.ACCENT, inner: SLOT.ACCENT, thick: 0.003, weights: hangW(0.55),
      }, out);
    }
  } else {
    // bell skirt: smooth over the hips, flaring from the knee to the floor, a little train behind
    const radii = new Float32Array(ROWS * COLS);
    const fullness = 0.16 + rng() * 0.08;
    for (let c = 0; c < COLS; c++) {
      const th = (c / COLS) * Math.PI * 2;
      let r = Math.max(topT[c] - 0.003, bodyT[c] + 0.01);
      for (let k = 0; k < ROWS; k++) {
        const t = k / (ROWS - 1);
        const want = bodyT[k * COLS + c] + 0.025 + fullness * Math.pow(ss(t, 0.15, 1.05), 1.15) + 0.05 * Math.max(0, -Math.cos(th)) * t * t;
        r = Math.max(r, want);
        radii[k * COLS + c] = r;
      }
    }
    smoothRows(radii, ROWS, COLS, 4);
    const skirtFolds = (th: number, t: number) => 1 + 0.045 * Math.pow(t, 1.5) * (Math.abs(Math.sin(th * 5 + ph[0])) - 0.5 + 0.35 * Math.sin(th * 11 + ph[1]));
    const hemF = (th: number) => 0.012 - 0.01 * Math.max(0, -Math.cos(th));
    const skirtR = (k: number, th: number) => {
      const k0 = Math.min(ROWS - 1, Math.floor(k)), k1 = Math.min(ROWS - 1, k0 + 1), f = k - k0;
      return lerp(lookup(radii, COLS, k0, th), lookup(radii, COLS, k1, th), f) * skirtFolds(th, k / (ROWS - 1));
    };
    hang({
      yTop: topY, hem: hemF, rows: ROWS, cols: COLS, zc,
      radius: (k, _t, th) => skirtR(k, th),
      slot: SLOT.LOWER, inner: null, thick: 0, weights: hangW(0.34),
    }, out);
    if (o.apron) {
      const aTop = topY - 0.01;
      hang({
        yTop: aTop, hem: () => 0.3, rows: 10, cols: COLS, zc, span: [-1.0, 1.0],
        radius: (_k, t, th) => skirtR(Math.max(0, (topY - lerp(aTop, 0.3, t)) / (topY - hemF(th)) * (ROWS - 1)), th) + 0.014,
        slot: SLOT.ACCENT, inner: SLOT.ACCENT, thick: 0.002, weights: hangW(0.3),
      }, out);
    }
  }
  // the legs as capsules the coat skirts and aprons are kept out of as they move (see figureMaterial)
  const legs = trousers ? legCapsules(F, out, trousers, drape0, out.count) : null;
  // capes and shawls hang from the shoulders
  const wrap = male ? (o.coat === 'caped' ? 'cape' : 'none') : (o.wrap ?? 'none');
  if (wrap !== 'none') shoulderWrap(F, upperPts, wrap as 'cape' | 'shawl', male, out, rng);
  // coat collar and lapels, buttons
  if (male) coatDetails(F, upper, o, out);
  // head: hair, beard, brows, eyes, hat
  const hat = hatGeometry(F, B, o, out);
  const hideAbove = hat.band;
  const addPart = (name: string, slot: number, keep?: (x: number, y: number, z: number) => boolean) => {
    const g = F.parts[name];
    if (!g) return;
    const PB = g.getAttribute('position').array as Float32Array, UV = g.getAttribute('uv').array as Float32Array;
    const NB = g.getAttribute('normal').array as Float32Array;
    const JS = g.getAttribute('skinIndex').array, WS = g.getAttribute('skinWeight').array;
    const I = g.index!.array, base = out.count;
    for (let v = 0; v < PB.length / 3; v++) out.v(PB[v * 3], PB[v * 3 + 1], PB[v * 3 + 2], { j: [JS[v * 4], JS[v * 4 + 1], JS[v * 4 + 2], JS[v * 4 + 3]], w: [WS[v * 4], WS[v * 4 + 1], WS[v * 4 + 2], WS[v * 4 + 3]] }, slot, UV[v * 2], UV[v * 2 + 1], NB[v * 3], NB[v * 3 + 1], NB[v * 3 + 2]);
    for (let t = 0; t < I.length; t += 3) {
      if (keep && ![0, 1, 2].some(k => keep(PB[I[t + k] * 3], PB[I[t + k] * 3 + 1], PB[I[t + k] * 3 + 2]))) continue;
      out.tri(base + I[t], base + I[t + 1], base + I[t + 2]);
    }
  };
  addPart('Eyes', SLOT.EYE);
  addPart('Brows', SLOT.HAIR);
  if (male) {
    if (hat.kind !== 'none') addPart(o.hair === 'buzzed' ? 'Hair_Buzzed' : 'Hair_SimpleParted', SLOT.HAIR, (_x, y) => y < hideAbove);
    if (o.beard === 'full') addPart('Hair_Beard', SLOT.HAIR);
    else if (o.beard === 'moustache') addPart('Hair_Beard', SLOT.HAIR, (x, y, z) => y > m.eyeY - 0.085 && y < m.eyeY - 0.045 && z > 0.06 && Math.abs(x) < 0.04);
  } else if (o.hat !== 'scarf' && o.hat !== 'bonnet') femaleHair(F, B, out, hideAbove);
  // the body: skin where nothing covers it
  const base = out.count, bodyMap = new Map<number, number>();
  const bv = (v: number) => {
    let i = bodyMap.get(v);
    if (i === undefined) { i = out.v(B.P[v * 3], B.P[v * 3 + 1], B.P[v * 3 + 2], vskin(B, v), SLOT.SKIN, B.UV[v * 2], B.UV[v * 2 + 1]); bodyMap.set(v, i); }
    return i;
  };
  const bi0 = out.idx.length;
  for (let t = 0; t < taken.length; t++) if (!taken[t]) out.tri(bv(B.I[t * 3]), bv(B.I[t * 3 + 1]), bv(B.I[t * 3 + 2]));
  // body normals: from the source mesh (welded seams keep the skin smooth)
  const SN = F.parts.Body.getAttribute('normal').array as Float32Array;
  for (const [v, i] of bodyMap) { out.n[i * 3] = SN[v * 3]; out.n[i * 3 + 1] = SN[v * 3 + 1]; out.n[i * 3 + 2] = SN[v * 3 + 2]; }
  void base; void bi0;
  // umbrella or the lamplighter's pole, held in the right hand (the arm is posed onto it each frame)
  let grip: THREE.Vector3 | null = null;
  const H = F.height, root = bi('root');
  if (o.umbrella) {
    grip = new THREE.Vector3(-0.2 * H / 1.7, H * 0.66, 0.26 * H / 1.7);
    umbrella(out, grip, H + 0.2 - grip.y, root);
  } else if (o.pole) {
    grip = new THREE.Vector3(-0.25, H * 0.62, 0.2);
    pole(out, new THREE.Vector3(-0.25, 0, 0.2), root);
  }
  const lod0 = out.geometry();
  const r: FigureGeometry = { lods: [lod0, ...lods(lod0)], grip, top: H, paint: hat.paint, legs };
  outfitCache.set(key, r);
  return r;
}

function smoothRows(T: Float32Array, rows: number, cols: number, passes: number): void {
  const tmp = new Float32Array(cols);
  for (let k = 0; k < rows; k++) for (let p = 0; p < passes; p++) {
    for (let c = 0; c < cols; c++) tmp[c] = (T[k * cols + ((c + cols - 1) % cols)] + 2 * T[k * cols + c] + T[k * cols + ((c + 1) % cols)]) / 4;
    T.set(tmp, k * cols);
  }
}

// Skirts and legs: a coat skirt hangs 1-2 cm clear of the trousers in the bind pose but only half
// follows the thighs (it is cloth, not a trouser leg), so the stance and the stride carried the legs
// straight through it. The legs are capsules (thigh, calf; each side) and the vertex shader pushes the
// cloth out of them, round the outside of the leg; a coat at rest keeps its shape exactly.
const DRAPE_PAD = 0.008, DRAPE_SOFT = 0.02, DRAPE_MAX = 0.2;   // clearance past the capsule (the cloth spans ~8 cm between rows); soft zone; the most it moves
const DRAPE_BONES = ['thigh_l', 'calf_l', 'thigh_r', 'calf_r'];

/** Bind-pose capsules round the trouser legs, in DRAPE_BONES order: [a.xyz, ra, b.xyz, rb] each. */
function legCapsules(F: FolkBody, out: Geo, legs: Shell, d0: number, d1: number): Float32Array {
  const m = F.m, P = out.p, caps = new Float32Array(32);
  const lv = [...new Set(legs.verts.values())];
  const segD = (x: number, y: number, z: number, a: number[], b: number[]): [number, number] => {
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const u = clamp(((x - a[0]) * abx + (y - a[1]) * aby + (z - a[2]) * abz) / (abx * abx + aby * aby + abz * abz), 0, 1);
    return [Math.hypot(x - a[0] - abx * u, y - a[1] - aby * u, z - a[2] - abz * u), u];
  };
  for (const [side, s] of [[0, 1], [1, -1]]) {
    const mine = lv.filter(v => P[v * 3] * s > 0.01);
    // the leg's centre at a height: the middle of the trouser leg's cross-section there
    const centre = (y: number) => {
      let x0 = 9, x1 = -9, z0 = 9, z1 = -9;
      for (const v of mine) if (Math.abs(P[v * 3 + 1] - y) < 0.025) { x0 = Math.min(x0, P[v * 3]); x1 = Math.max(x1, P[v * 3]); z0 = Math.min(z0, P[v * 3 + 2]); z1 = Math.max(z1, P[v * 3 + 2]); }
      return [(x0 + x1) / 2, y, (z0 + z1) / 2];
    };
    const ys = [m.hipY - 0.15, m.kneeY, m.ankleY + 0.12];
    for (let seg = 0; seg < 2; seg++) {
      const a = centre(ys[seg]), b = centre(ys[seg + 1]);
      // wide enough for the leg...
      let ra = 0, rb = 0;
      for (const v of mine) {
        const y = P[v * 3 + 1];
        if (y > a[1] + 0.03 || y < b[1] - 0.03) continue;
        const [d, u] = segD(P[v * 3], y, P[v * 3 + 2], a, b);
        if (u < 0.5) ra = Math.max(ra, d); else rb = Math.max(rb, d);
      }
      // ...but not touching the cloth as it hangs in the bind pose
      for (let it = 0; it < 3; it++) for (let v = d0; v < d1; v++) {
        const [d, u] = segD(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], a, b);
        const e = ra * (1 - u) + rb * u - (d - DRAPE_PAD - DRAPE_SOFT);
        if (e > 0) { const n2 = (1 - u) ** 2 + u * u; ra -= e * (1 - u) / n2; rb -= e * u / n2; }
      }
      caps.set([...a, Math.max(0, ra), ...b, Math.max(0, rb)], (side * 2 + seg) * 8);
    }
  }
  return caps;
}

/** Simpler levels of detail: new index buffers over the same vertices (meshoptimizer, MIT). */
function lods(g: THREE.BufferGeometry): THREE.BufferGeometry[] {
  const pos = g.getAttribute('position').array as Float32Array;
  const src = new Uint32Array(g.index!.array);
  const slot = g.getAttribute('slot').array as Uint8Array;
  // the slot as an attribute keeps part boundaries (face / collar / coat) where they are
  const attr = new Float32Array(slot.length);
  for (let i = 0; i < slot.length; i++) attr[i] = slot[i];
  // errors in metres: the thin garments over one another must not cross (legs through an apron)
  return ([[0.25, 0.007], [0.1, 0.02]] as const).map(([f, err]) => {
    const [idx] = MeshoptSimplifier.simplifyWithAttributes(src, pos, 3, attr, 1, [0.5], null, Math.floor(src.length * f / 3) * 3, err, ['ErrorAbsolute']);
    const l = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(g.attributes)) l.setAttribute(k, a);
    l.setIndex(new THREE.BufferAttribute(pos.length / 3 > 65535 ? idx : new Uint16Array(idx), 1));
    return l;
  });
}

function seeded(s: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}

/** A cape (to the elbow) or a shawl (pointed behind) laid over the shoulders from the neck. */
function shoulderWrap(F: FolkBody, pts: Float32Array, kind: 'cape' | 'shawl', male: boolean, out: Geo, rng: () => number): void {
  const m = F.m, zc = F.J.spine_03.z - 0.01;
  const COLS = 48, ROWS = 17;
  // the torso's top surface beneath (the T-posed arms left out: the cape hangs as if they were down)
  const topY = m.neckY + (male ? 0.0 : 0.02);             // it sits on the shoulders, below the collar
  const hemY = kind === 'cape' ? m.armY - (male ? 0.36 : 0.3) : m.armY - 0.24;
  const shY = m.armY + (male ? 0.04 : 0.035);             // the shoulder point
  const edgeR = (th: number) => { const a = m.shoulderX + (male ? 0.06 : 0.05), b = male ? 0.17 : 0.16; return a * b / Math.hypot(b * Math.sin(th), a * Math.cos(th)); };
  const neckR = (th: number) => (male ? 0.098 : 0.082) * (1 + 0.1 * Math.abs(Math.sin(th)));
  const torsoTop = (x: number, z: number) => {
    let best = -1;
    for (let i = 0; i < pts.length; i += 3) {
      if (pts[i] === 0 && pts[i + 1] === 0) continue;
      if (Math.abs(pts[i]) < m.shoulderX - 0.02 && Math.abs(pts[i] - x) < 0.03 && Math.abs(pts[i + 2] - z) < 0.03 && pts[i + 1] > m.armY - 0.15 && pts[i + 1] < topY + 0.05) best = Math.max(best, pts[i + 1]);
    }
    return best;
  };
  const s3 = F.bone('spine_03'), s2 = F.bone('spine_02'), cl = F.bone('clavicle_l'), cr = F.bone('clavicle_r');
  const open = kind === 'shawl' ? 0.24 : 0.06;
  const v0 = out.count, i0 = out.idx.length;
  const cols = COLS + 1;
  const ring: THREE.Vector3[][] = [];
  const ph = rng() * 6;
  for (let c = 0; c < cols; c++) {
    const th = lerp(open, Math.PI * 2 - open, c / COLS);
    const sx = Math.sin(th), cz = Math.cos(th);
    // over the shoulder from the neck (a gentle slope, clear of the torso), round the shoulder, then down
    const path: [number, number][] = [];                    // (radius, height)
    const r0 = neckR(th), r1 = edgeR(th), rho = male ? 0.06 : 0.05;
    const side = Math.abs(sx), y0 = topY + lerp(-0.035, 0.02, (1 - cz) / 2), yEdge = lerp(y0 - 0.06, shY, side);   // low at the throat, up behind
    for (let i = 0; i <= 5; i++) {
      const t = i / 5, r = lerp(r0, r1, t), y = lerp(y0, yEdge, Math.pow(t, 1.5));
      path.push([r, i ? Math.max(y, torsoTop(sx * r, zc + cz * r) + 0.018) : y]);
    }
    const [er, ey] = path[path.length - 1];
    for (let i = 1; i <= 4; i++) { const f = (i / 4) * Math.PI / 2; path.push([er + rho * Math.sin(f), ey - rho * (1 - Math.cos(f))]); }
    // a shawl comes to a point behind and its ends hang down in front; a cape is level
    const ends = Math.max(0, 1 - Math.min(th, Math.PI * 2 - th) / 0.9);
    const hem = hemY - (kind === 'shawl' ? 0.3 * Math.pow(Math.max(0, -cz), 2) + 0.16 * ends : 0.015 * cz) + (rng() - 0.5) * 0.01;
    const [dr, dy] = path[path.length - 1];
    for (let i = 1; i <= 7; i++) {
      const t = i / 7, fold = 1 + 0.1 * t + 0.05 * Math.pow(t, 1.2) * (Math.sin(th * 9 + ph) * 0.65 + Math.sin(th * 16 + ph * 2) * 0.35);
      path.push([dr * fold, lerp(dy, hem, t)]);
    }
    ring.push(path.map(([r, y]) => new THREE.Vector3(sx * r, y, zc + cz * r)));
  }
  const W = (y: number, x: number) => {
    const t = clamp((topY - y) / (topY - hemY), 0, 1);
    return skin(new Map([[s3, 0.75 - 0.25 * t], [s2, 0.25 * t], [cl, 0.25 * clamp(x / 0.2, 0, 1) * (1 - t)], [cr, 0.25 * clamp(-x / 0.2, 0, 1) * (1 - t)]]));
  };
  const slot = kind === 'cape' ? SLOT.COAT : SLOT.ACCENT;
  const grid = (d: number, sl: number, flip: boolean) => {
    const b0 = out.count, j0 = out.idx.length;
    for (let k = 0; k < ROWS; k++) for (let c = 0; c < cols; c++) {
      const p = ring[c][k], th = lerp(open, Math.PI * 2 - open, c / COLS);
      out.v(p.x - Math.sin(th) * d, p.y, p.z - Math.cos(th) * d, W(p.y, p.x), sl, th * 0.2, p.y);
    }
    for (let k = 0; k < ROWS - 1; k++) for (let c = 0; c < COLS; c++) {
      const a = b0 + k * cols + c, b = a + 1, dd = a + cols, e = dd + 1;
      if (!flip) out.quad(a, dd, e, b); else out.quad(a, b, e, dd);
    }
    out.normals(b0, j0);
    return b0;
  };
  const o0 = grid(0, slot, false), n0 = grid(0.006, SLOT.LINING, true);
  const e0 = out.count, j0 = out.idx.length;
  const cp = (v: number, s: number) => out.v(out.p[v * 3], out.p[v * 3 + 1], out.p[v * 3 + 2], { j: out.j.slice(v * 4, v * 4 + 4) as W4, w: out.w.slice(v * 4, v * 4 + 4) as W4 }, s);
  const last = (ROWS - 1) * cols;
  for (let c = 0; c < COLS; c++) out.quad(cp(o0 + last + c, slot), cp(n0 + last + c, slot), cp(n0 + last + c + 1, slot), cp(o0 + last + c + 1, slot));
  for (const [c, s] of [[0, 1], [COLS, -1]] as const) for (let k = 0; k < ROWS - 1; k++) {
    const a = cp(o0 + k * cols + c, slot), b = cp(o0 + (k + 1) * cols + c, slot), d = cp(n0 + k * cols + c, slot), e = cp(n0 + (k + 1) * cols + c, slot);
    if (s > 0) out.quad(a, d, e, b); else out.quad(a, b, e, d);
  }
  out.normals(e0, j0);
  void v0; void i0;
}

/** Turned-down coat collar, lapels and a row of buttons, laid on the coat's front. */
function coatDetails(F: FolkBody, upper: Shell, o: Outfit, out: Geo): void {
  const m = F.m;
  const pts = upper.pos;
  const long = o.coat === 'great' || o.coat === 'caped' || o.coat === 'long';
  const front = (x: number, y: number) => {   // the coat's front surface: nearest shell points, frontmost
    let best = -1, bz = 0, bw = 0;
    for (let i = 0; i < pts.length; i += 3) {
      if (pts[i] === 0 && pts[i + 1] === 0) continue;
      const dx = pts[i] - x, dy = pts[i + 1] - y;
      if (Math.abs(dx) < 0.02 && Math.abs(dy) < 0.02 && pts[i + 2] > 0) { const w = 1 / (0.002 + dx * dx + dy * dy); bz += pts[i + 2] * w; bw += w; best = 1; }
    }
    return best < 0 ? 0.1 : bz / bw;
  };
  const near = (x: number, y: number, z: number): Skin => {
    let bd = Infinity, bv = 0;
    for (const [v, i] of upper.verts) { const d = (out.p[i * 3] - x) ** 2 + (out.p[i * 3 + 1] - y) ** 2 + (out.p[i * 3 + 2] - z) ** 2; if (d < bd) { bd = d; bv = v; } }
    const i = upper.verts.get(bv)!;
    return { j: out.j.slice(i * 4, i * 4 + 4) as W4, w: out.w.slice(i * 4, i * 4 + 4) as W4 };
  };
  const vBot = o.coat === 'jacket' ? m.armY - 0.2 : o.coat === 'frock' ? m.armY - 0.16 : m.armY - 0.1;
  const vTop = m.neckY - 0.01;
  // lapels: a flap each side of the V, widest at the notch
  for (const s of [-1, 1]) {
    const v0 = out.count, i0 = out.idx.length, N = 8;
    for (let k = 0; k <= N; k++) {
      const t = k / N, y = lerp(vBot, vTop, t);
      const xi = s * lerp(0.012, 0.07, t), w = lerp(0.018, 0.05, Math.pow(t, 0.8)) * (t > 0.85 ? 0.6 : 1);
      for (const [dx, lift] of [[0, 0.003], [w * 0.5, 0.006], [w, 0.004]]) {
        const x = xi + s * dx, z = front(x, y) + lift;
        out.v(x, y, z, near(x, y, z), o.coat === 'frock' ? SLOT.LINING : SLOT.COAT);   // silk-faced on the frock coat
      }
    }
    for (let k = 0; k < N; k++) for (let c = 0; c < 2; c++) {
      const a = v0 + k * 3 + c, b = a + 1, d = a + 3, e = d + 1;
      if (s > 0) out.quad(a, b, e, d); else out.quad(a, d, e, b);
    }
    out.normals(v0, i0);
  }
  // collar round the back of the neck
  {
    const v0 = out.count, i0 = out.idx.length, N = 14, y0 = m.neckY - 0.005;
    for (let c = 0; c <= N; c++) {
      const th = lerp(0.75, Math.PI * 2 - 0.75, c / N), r = 0.068 + 0.012 * Math.abs(Math.sin(th));
      for (const [dy, dr] of [[0, 0.018], [0.03, 0.012], [0.045, 0.004]]) {
        const x = Math.sin(th) * (r + dr), z = -0.03 + Math.cos(th) * (r + dr) * 0.95, y = y0 + dy * (0.6 + 0.4 * Math.abs(Math.cos(th)));
        out.v(x, y, z, near(x, y, z), SLOT.COAT);
      }
    }
    for (let c = 0; c < N; c++) for (let k = 0; k < 2; k++) {
      const a = v0 + c * 3 + k, b = a + 1, d = a + 3, e = d + 1;
      out.quad(a, d, e, b);
    }
    out.normals(v0, i0);
  }
  // buttons down the front (two rows on the greatcoat)
  const cols = long ? [-0.06, 0.06] : [0.022];
  const n = o.coat === 'jacket' ? 3 : 4;
  for (const bx of cols) for (let k = 0; k < n; k++) {
    const y = lerp(vBot - 0.01, m.waistY + 0.02, k / (n - 1));
    const z = front(bx, y) + 0.002;
    const sk = near(bx, y, z);
    const v0 = out.count, i0 = out.idx.length;
    const c = out.v(bx, y, z + 0.004, sk, SLOT.LEATHER);
    for (let a = 0; a < 6; a++) out.v(bx + Math.cos(a * Math.PI / 3) * 0.008, y + Math.sin(a * Math.PI / 3) * 0.008, z, sk, SLOT.LEATHER);
    for (let a = 0; a < 6; a++) out.tri(c, v0 + 1 + a, v0 + 1 + ((a + 1) % 6));
    out.normals(v0, i0);
  }
}

/** Women's hair put up c.1900: full at the front (pompadour), a bun on the crown. */
function femaleHair(F: FolkBody, B: BodyGeo, out: Geo, below: number): void {
  const m = F.m;
  const hz = -0.005;
  const hairline = (x: number, z: number) => { const c = Math.cos(Math.atan2(x, z - hz)); return m.eyeY + 0.012 + (c > 0 ? 0.04 * c * c : 0.045 * c); };
  const fake = new Uint8Array(B.I.length / 3);
  shell(B, {
    inside: (x, y, z) => y > hairline(x, z) && y > m.headY - 0.03,
    offset: (x, y, z) => 0.007 + 0.022 * ss(z, -0.01, 0.07) * ss(y, m.eyeY + 0.03, m.eyeY + 0.09) + 0.008 * ss(Math.abs(x), 0.03, 0.08) * ss(y, m.eyeY, m.eyeY + 0.06),
    smooth: 7, slot: SLOT.CURLS, rim: SLOT.CURLS,
    cut: p => { p.y = Math.max(hairline(p.x, p.z), m.headY - 0.03); },
  }, out, fake);
  // the bun (hidden under a big hat's crown if it would poke through)
  const hb = F.bone('Head'), v0 = out.count, i0 = out.idx.length;
  const cy = Math.min(m.top - 0.01, below - 0.008), [, bz, hc] = headAt(F, cy), cz = hc - bz - 0.012, R = 0.042;
  const g = new THREE.SphereGeometry(R, 12, 8);
  const P = g.getAttribute('position'), U = g.getAttribute('uv');
  for (let i = 0; i < P.count; i++) out.v(P.getX(i) * 1.15, cy + P.getY(i) * 0.8, cz + P.getZ(i), rigid(hb), SLOT.CURLS, U.getX(i), U.getY(i));
  const I = g.index!.array;
  for (let i = 0; i < I.length; i += 3) out.tri(v0 + I[i], v0 + I[i + 1], v0 + I[i + 2]);
  out.normals(v0, i0);
}

// --- Hats -----------------------------------------------------------------------------------------
/** Head size at a height (half-extents x, z and centre z), from the body's head vertices. */
function headAt(F: FolkBody, y: number): [number, number, number] {
  const P = F.parts.Body.getAttribute('position').array as Float32Array;
  let x1 = 0, z0 = 9, z1 = -9;
  for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 1] - y) < 0.012 && Math.abs(P[i]) < 0.12 && P[i + 1] > F.m.headY) { x1 = Math.max(x1, Math.abs(P[i])); z0 = Math.min(z0, P[i + 2]); z1 = Math.max(z1, P[i + 2]); }
  return [x1, (z1 - z0) / 2, (z0 + z1) / 2];
}

/** Closed profiles (r as a multiple of the head fit, y above the band) revolved round the head. */
const HATS: Record<string, { band: number; tilt: number; prof: [number, number][]; brimCurl?: number; peak?: boolean; ribbon?: [number, number]; feather?: boolean }> = {
  // silk top hat, a little shorter than mid-century ones, the brim curled up at the sides
  top: { band: 0.052, tilt: -0.07, brimCurl: 0.018, ribbon: [0.004, 0.035], prof: [[0, 0.17], [0.97, 0.17], [1.0, 0.165], [0.96, 0.09], [1.0, 0.01], [1.05, 0.0], [1.62, 0.004], [1.66, 0.012], [1.6, -0.006], [1.04, -0.012], [0, -0.012]] },
  bowler: { band: 0.048, tilt: -0.05, brimCurl: 0.016, ribbon: [0.002, 0.022], prof: [[0, 0.118], [0.45, 0.112], [0.8, 0.09], [0.98, 0.05], [1.02, 0.01], [1.06, 0.0], [1.48, 0.004], [1.53, 0.014], [1.47, -0.004], [1.04, -0.01], [0, -0.01]] },
  felt: { band: 0.05, tilt: -0.04, ribbon: [0.002, 0.03], prof: [[0, 0.085], [0.3, 0.1], [0.7, 0.112], [0.95, 0.09], [1.02, 0.01], [1.07, 0.0], [1.62, -0.012], [1.66, -0.018], [1.6, -0.022], [1.04, -0.012], [0, -0.012]] },
  wide: { band: 0.05, tilt: -0.03, ribbon: [0.002, 0.025], prof: [[0, 0.1], [0.9, 0.1], [0.98, 0.09], [1.01, 0.01], [1.07, 0.0], [1.95, -0.006], [1.99, -0.012], [1.94, -0.016], [1.04, -0.012], [0, -0.012]] },
  cap: { band: 0.056, tilt: 0.0, peak: true, prof: [[0, 0.075], [1.12, 0.07], [1.2, 0.058], [1.08, 0.03], [1.0, 0.0], [0.96, -0.012], [0, -0.012]] },
  flatcap: { band: 0.046, tilt: 0.1, peak: true, prof: [[0, 0.055], [0.9, 0.06], [1.12, 0.042], [1.06, 0.015], [1.0, 0.0], [0.96, -0.01], [0, -0.01]] },
  // women: a wide hat worn on top of the hair, a small toque
  brim: { band: 0.088, tilt: 0.06, ribbon: [0.004, 0.034], feather: true, prof: [[0, 0.07], [0.55, 0.074], [0.88, 0.066], [1.0, 0.04], [1.02, 0.004], [1.12, 0.0], [1.6, -0.004], [2.0, -0.016], [2.06, -0.014], [2.0, -0.024], [1.6, -0.014], [1.1, -0.01], [0, -0.01]] },
  toque: { band: 0.085, tilt: -0.14, ribbon: [0.004, 0.03], feather: true, prof: [[0, 0.07], [0.8, 0.074], [1.02, 0.062], [1.08, 0.03], [1.06, 0.004], [1.14, 0.0], [1.42, 0.012], [1.46, 0.02], [1.4, 0.004], [1.1, -0.008], [0, -0.008]] },
};

/** Hat on the head bone; bonnets and headscarves are shells of the head. Returns the band height. */
function hatGeometry(F: FolkBody, B: BodyGeo, o: Outfit, out: Geo): { band: number; kind: string; paint: THREE.Vector4 } {
  const m = F.m, hb = F.bone('Head');
  const paint = new THREE.Vector4(0, 0, 0, 0);
  if (o.hat === 'scarf' || o.hat === 'bonnet') {
    // a kerchief (or a bonnet) shaped on the head, framing the face
    const fake = new Uint8Array(B.I.length / 3);
    const scarf = o.hat === 'scarf', fa = scarf ? 0.066 : 0.074, fb = scarf ? 0.088 : 0.1, fc = m.eyeY - (scarf ? 0.028 : 0.02);
    const oval = (x: number, y: number) => (x / fa) ** 2 + ((y - fc) / fb) ** 2;
    const face = (x: number, y: number, z: number) => z > -0.01 && oval(x, y) < 1;
    const bottom = (z: number) => lerp(m.eyeY - (scarf ? 0.14 : 0.1), m.headY - (scarf ? 0.035 : 0.0), ss(-z, -0.03, 0.06));   // tied under the chin
    shell(B, {
      inside: (x, y, z) => y > bottom(z) && !face(x, y, z),
      offset: (x, y, z) => 0.013 + 0.01 * ss(y, m.eyeY, m.top) + (scarf ? 0.03 : 0.02) * ss(-z, 0, 0.09) * ss(y, m.eyeY - 0.06, m.eyeY + 0.02) + 0 * x,
      smooth: 8, slot: SLOT.HAT, rim: SLOT.HAT, keepSkin: true,
      // a clean oval round the face, a straight edge below
      cut: p => {
        const e = oval(p.x, p.y);
        if (p.z > -0.02 && e < 2.2) { const k = 1 / Math.sqrt(Math.max(e, 1e-4)); p.x *= k; p.y = fc + (p.y - fc) * k; }
      },
    }, out, fake);
    if (o.hat === 'scarf') {
      // the tail of the kerchief down the back of the neck
      const v0 = out.count, i0 = out.idx.length, nk = F.bone('neck_01'), s3 = F.bone('spine_03');
      const y0 = m.headY + 0.01, y1 = m.neckY - 0.2;
      for (let k = 0; k <= 4; k++) {
        const t = k / 4, y = lerp(y0, y1, t), w = lerp(0.1, 0.006, Math.pow(t, 0.8)), z = lerp(-0.125, -0.15, t) - 0.012 * Math.sin(t * Math.PI);
        const sk = skin(new Map([[hb, 1 - t], [nk, t * 0.5], [s3, t * 0.5]]));
        out.v(-w, y, z, sk, SLOT.HAT); out.v(0, y, z - 0.008, sk, SLOT.HAT); out.v(w, y, z, sk, SLOT.HAT);
      }
      for (let k = 0; k < 4; k++) for (let c = 0; c < 2; c++) { const a = v0 + k * 3 + c; out.quad(a, a + 3, a + 4, a + 1); }
      out.normals(v0, i0);
      out.backFace(v0, i0);
    }
    return { band: m.headY - 0.03, kind: o.hat, paint };
  }
  const h = HATS[o.hat];
  const band = m.eyeY + h.band;
  const [ax, bz, cz] = headAt(F, band);
  const onHair = F.sex === 'f' ? 0.016 : 0.004;   // women's hats sit on the put-up hair
  const fx = ax + 0.004 + onHair, fz = bz + 0.004 + onHair;
  const SEG = 32, v0 = out.count, i0 = out.idx.length;
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), h.tilt);
  const p = new THREE.Vector3();
  const pr = h.prof, np = pr.length;
  for (let c = 0; c <= SEG; c++) {
    const th = (c / SEG) * Math.PI * 2, s = Math.sin(th), co = Math.cos(th);
    for (let k = 0; k < np; k++) {
      const [r, y] = pr[k];
      // curled brims rise at the sides; a cap's crown overhangs its peak
      const brim = r > 1.2 ? 1 : 0;
      const yy = y + (h.brimCurl && brim ? h.brimCurl * s * s * ss(r, 1.2, 1.6) : 0);
      const rr = r * (h.peak && co > 0 && y > 0.03 ? 1 + 0.08 * co : 1);
      p.set(s * rr * fx, yy, co * rr * fz).applyQuaternion(q);
      out.v(p.x, band + p.y, cz + p.z, rigid(hb), SLOT.HAT, th * 0.1, k / np);
    }
  }
  for (let c = 0; c < SEG; c++) for (let k = 0; k < np - 1; k++) {
    const a = v0 + c * np + k, b = a + 1, d = a + np, e = d + 1;
    out.quad(a, b, e, d);
  }
  out.normals(v0, i0);
  if (h.peak) {
    // the peak: a stiff curved visor at the front
    const w0 = out.count, j0 = out.idx.length, N = 10;
    for (let c = 0; c <= N; c++) {
      const th = lerp(-1.05, 1.05, c / N);
      for (const [r, y] of [[1.0, 0.004], [1.65 - 0.25 * Math.abs(th), -0.022], [1.6 - 0.25 * Math.abs(th), -0.03], [1.0, -0.006]]) {
        p.set(Math.sin(th) * r * fx, y, Math.cos(th) * r * fz).applyQuaternion(q);
        out.v(p.x, band + p.y, cz + p.z, rigid(hb), SLOT.HAT);
      }
    }
    for (let c = 0; c < N; c++) for (let k = 0; k < 3; k++) { const a = w0 + c * 4 + k, b = a + 1, d = a + 4, e = d + 1; out.quad(a, b, e, d); }
    out.normals(w0, j0);
  }
  if (h.feather) {
    // an ostrich plume curling back from the band on the left
    const w0 = out.count, j0 = out.idx.length, N = 12;
    for (let k = 0; k <= N; k++) {
      const t = k / N, a = 0.4 + t * 2.3;
      const cx = 0.9 + 0.35 * Math.sin(t * 2.2), cyy = 0.03 + 0.07 * Math.sin(t * Math.PI * 0.9), wdt = 0.028 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05));
      for (const [dw, dz] of [[-1, 0], [0, 0.006], [1, 0]]) {
        p.set(Math.sin(a) * cx * fx + dw * wdt * Math.cos(a) * 0.4, cyy + dw * wdt, Math.cos(a) * cx * fz - dw * wdt * Math.sin(a) * 0.4 + dz).applyQuaternion(q);
        out.v(p.x, band + p.y, cz + p.z, rigid(hb), SLOT.ACCENT);
      }
    }
    for (let k = 0; k < N; k++) for (let c = 0; c < 2; c++) { const a = w0 + k * 3 + c; out.quad(a, a + 3, a + 4, a + 1); }
    out.normals(w0, j0);
    out.backFace(w0, j0);
  }
  if (h.ribbon) paint.set(band + h.ribbon[0], band + h.ribbon[1], h.tilt, cz);
  return { band: band - 0.004, kind: o.hat, paint };
}

/** Umbrella in the right hand: eight ribs, the cover sagging between them, ferrule and crook (bind-pose space). */
function umbrella(out: Geo, grip: THREE.Vector3, shaftLen: number, root: number): void {
  const R = 0.52, Hd = 0.2, RINGS = 7, SEG = 48;
  const sk = rigid(root);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.06, 0, -0.05));   // tipped back and in, over the head
  const put = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyQuaternion(q).add(grip);
  const pt = (t: number, th: number) => {
    const sag = 1 - Math.abs(Math.cos(4 * th));
    const r = R * Math.sin(t * Math.PI / 2) * (1 - 0.07 * sag * t);
    const y = Hd * Math.cos(t * Math.PI / 2) + 0.045 * sag * t * t - 0.02 * t;
    return [Math.cos(th) * r, shaftLen + y, Math.sin(th) * r] as const;
  };
  for (const side of [1, -1]) {
    const v0 = out.count, i0 = out.idx.length;
    for (let j = 0; j <= RINGS; j++) for (let k = 0; k < SEG; k++) {
      const [x, y, z] = pt(j / RINGS, (k / SEG) * Math.PI * 2);
      const w = put(x, y - (side < 0 ? 0.004 : 0), z);
      out.v(w.x, w.y, w.z, sk, side > 0 ? SLOT.BROLLY : SLOT.LINING);
    }
    for (let j = 0; j < RINGS; j++) for (let k = 0; k < SEG; k++) {
      const a = v0 + j * SEG + k, b = v0 + j * SEG + ((k + 1) % SEG), d = a + SEG, e = b + SEG;
      if (side > 0) out.quad(a, d, e, b); else out.quad(a, b, e, d);
    }
    out.normals(v0, i0);
  }
  const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, slot: number) => {
    const v0 = out.count, i0 = out.idx.length, dir = b.clone().sub(a), qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    for (const e of [a, b]) for (let k = 0; k < 4; k++) {
      const v = new THREE.Vector3(Math.cos(k * Math.PI / 2) * r, 0, Math.sin(k * Math.PI / 2) * r).applyQuaternion(qq).add(e);
      out.v(v.x, v.y, v.z, sk, slot);
    }
    for (let k = 0; k < 4; k++) out.quad(v0 + k, v0 + ((k + 1) % 4), v0 + 4 + ((k + 1) % 4), v0 + 4 + k);
    out.normals(v0, i0);
  };
  for (let k = 0; k < 8; k++) {
    const th = (k / 8) * Math.PI * 2;
    const [mx, my, mz] = pt(0.55, th);
    rod(put(0, shaftLen - 0.28, 0), put(mx, my - 0.012, mz), 0.003, SLOT.LINING);
    for (let j = 0; j < 6; j++) { const [ax, ay, az] = pt(j / 6, th), [bx, by, bz] = pt((j + 1) / 6, th); rod(put(ax, ay - 0.008, az), put(bx, by - 0.008, bz), 0.004, SLOT.LINING); }
  }
  rod(put(0, -0.1, 0), put(0, shaftLen + Hd + 0.09, 0), 0.008, SLOT.WOOD);
  // crook handle
  for (let k = 0; k < 6; k++) {
    const a0 = (k / 6) * Math.PI, a1 = ((k + 1) / 6) * Math.PI;
    rod(put(0.04 - Math.cos(a0) * 0.04, -0.1 - Math.sin(a0) * 0.04, 0), put(0.04 - Math.cos(a1) * 0.04, -0.1 - Math.sin(a1) * 0.04, 0), 0.011, SLOT.WOOD);
  }
}

/** The lamplighter's pole: a hook and a small burning wick at the top. */
function pole(out: Geo, at: THREE.Vector3, root: number): void {
  const sk = rigid(root);
  const cyl = (y0: number, y1: number, r0: number, r1: number, slot: number) => {
    const v0 = out.count, i0 = out.idx.length;
    for (const [y, r] of [[y0, r0], [y1, r1]]) for (let k = 0; k < 6; k++) out.v(at.x + Math.cos(k * Math.PI / 3) * r, y, at.z + Math.sin(k * Math.PI / 3) * r, sk, slot);
    for (let k = 0; k < 6; k++) out.quad(v0 + k, v0 + 6 + k, v0 + 6 + ((k + 1) % 6), v0 + ((k + 1) % 6));
    out.normals(v0, i0);
  };
  cyl(0.55, 4.15, 0.02, 0.016, SLOT.WOOD);
  cyl(4.1, 4.24, 0.012, 0.006, SLOT.LINING);
  cyl(4.12, 4.16, 0.03, 0.03, SLOT.BROLLY);   // the wick's glow (BROLLY = the flame colour for him)
}

// --- Material ------------------------------------------------------------------------------------
export interface Palette { skin: string; hair: string; coat: string; lower: string; linen: string; hat: string; leather: string; accent: string; lining: string; brolly: string; wood: string; eye?: string }
const ROUGH = [0.55, 0.6, 0.12, 0.88, 0.86, 0.74, 0.62, 0.42, 0.84, 0.48, 0.6, 0.5, 0.6];

/**
 * One material per figure (one shader program for all): skin, hair and eyes from the model's textures,
 * cloth coloured from the palette with a fine wool weave (Poly Haven, CC0) as a bump; in the rain
 * the shoulders and hat crowns darken and shine unless an umbrella keeps them dry, hems carry mud.
 */
export function figureMaterial(F: FolkBody, pal: Palette, o: { exposed: number; paint: THREE.Vector4; outfit: Outfit; pattern?: [number, number] }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ map: F.tex.skin, normalMap: F.tex.skinN, roughness: 1, metalness: 0 });
  const cols = [pal.skin, pal.hair, pal.eye ?? '#ffffff', pal.coat, pal.lower, pal.linen, pal.hat, pal.leather, pal.accent, pal.lining, pal.brolly, pal.wood, pal.hair].map(c => new THREE.Color(c));
  const rough = [...ROUGH];
  if (o.outfit.hat === 'top' || o.outfit.hat === 'bowler') rough[SLOT.HAT] = o.outfit.hat === 'top' ? 0.34 : 0.5;   // silk plush, hard felt
  const m = F.m, male = F.sex === 'm', ot = o.outfit;
  // painted details in bind-pose space: waistcoat, shirt front and tie in the coat's V, the hat ribbon
  const vBot = ot.coat === 'jacket' ? m.armY - 0.2 : ot.coat === 'frock' ? m.armY - 0.16 : m.armY - 0.1;
  const buttoned = ot.coat === 'great' || ot.coat === 'caped' || ot.coat === 'long';   // only collar and tie show at the throat
  const vee = male ? new THREE.Vector4(buttoned ? m.neckY - 0.075 : vBot, m.neckY - 0.005, buttoned ? 0.04 : 0.07, 1) : new THREE.Vector4(m.waistY - 0.005, m.waistY + 0.03, m.neckY - 0.01, 0);
  const uniforms = {
    uPal: { value: cols }, uRough: { value: rough }, tHair: { value: F.tex.hair }, tEye: { value: F.tex.eye }, tCloth: { value: clothTex },
    uWet: WET, uExposed: { value: o.exposed }, uVee: { value: vee }, uHatBand: { value: o.paint },
    // behind: two buttons at the top of the vent (frock coat), a half-belt (greatcoats)
    uBack: { value: new THREE.Vector2(m.waistY, !male || ot.coat === 'jacket' ? 0 : ot.coat === 'frock' || ot.coat === 'long' ? 1 : 2) }, uPattern: { value: new THREE.Vector2(...(o.pattern ?? [0, 0])) },
    // the legs (posed, mesh space) for the cloth to keep out of; set per frame by figure(), off until then
    uLegA: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, uLegB: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, uDrape: { value: new THREE.Vector2(-1, m.zc) },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = s => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float slot;\nflat varying int vSlot;\nvarying vec3 vBind;\nvarying vec3 vBindN;\nuniform vec4 uLegA[4], uLegB[4];\nuniform vec2 uDrape;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvBindN = objectNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position; vSlot = int(slot + 0.5);')
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
// coat skirts and aprons (below the bodice) pushed out of the leg capsules, to the outside of the leg
#ifdef USE_SKINNING
if (position.y < uDrape.x && (vSlot == ${SLOT.COAT} || vSlot == ${SLOT.LINING} || vSlot == ${SLOT.ACCENT})) {
  float side = vSlot == ${SLOT.LINING} ? -1.0 : 1.0;   // the lining faces in
  vec3 outside = normalize((skinMatrix * vec4(position.x, 0.0, position.z - uDrape.y, 0.0)).xyz);   // away from the axis the skirt hangs round
  for (int i = 0; i < 4; i++) {
    vec3 a = uLegA[i].xyz, ab = uLegB[i].xyz - a;
    float u = clamp(dot(transformed - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0), c = mix(uLegA[i].w, uLegB[i].w, u);
    vec3 q = a + ab * u, w = transformed - q, ax = normalize(ab), op = outside - ax * dot(outside, ax);
    float along = length(op), ww = dot(w, w);   // along ~0: the leg points straight out through the cloth (a knee raised high)
    if (c <= 0.0 || ww > (c + 0.3) * (c + 0.3)) continue;
    float C = c + ${DRAPE_PAD.toFixed(3)}, S = ${DRAPE_SOFT.toFixed(3)}, f = smoothstep(0.2, 0.45, along);
    // out along the cloth's own outward direction (square to the leg) until clear of the leg, so a leg
    // that has gone right through takes the cloth over it rather than tearing it; straight away from
    // the leg where that direction runs along it
    op = along > 1e-4 ? op / along : outside;
    float wo = dot(w, op), disc = wo * wo - ww + C * C;
    float t = ww <= C * C || (wo < 0.0 && disc >= 0.0) ? -wo + sqrt(max(disc, 0.0)) : C - sqrt(ww);   // exit distance, or minus the gap
    float r = C - sqrt(ww);   // the same, straight out from the leg
    t = mix(r, t, f);
    float k = min(t > S ? t : t > -S ? (t + S) * (t + S) / (4.0 * S) : 0.0, ${DRAPE_MAX.toFixed(3)});
    if (k <= 0.0) continue;
    transformed += normalize(mix(ww > 1e-10 ? w / sqrt(ww) : outside, op, f)) * k;
    vec3 n = transformed - q - ax * dot(transformed - q, ax);
    vNormal = normalize(vNormal + normalMatrix * normalize(n) * side * 0.6 * clamp(k / S, 0.0, 1.0));
  }
}
#endif`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
flat varying int vSlot;
varying vec3 vBind;
varying vec3 vBindN;
uniform vec3 uPal[${NSLOT}];
uniform float uRough[${NSLOT}];
uniform sampler2D tHair, tEye, tCloth;
uniform float uWet, uExposed;
uniform vec4 uVee, uHatBand;
uniform vec2 uBack;
uniform vec2 uPattern;   // printed cloth on the kerchief (x) and the shawl or apron (y): 1 check, 2 flowers, 3 stripes
float fRough; float fBump; float fWet;
vec3 printed(vec3 c, float kind, vec3 p) {
  vec2 q = vec2(p.x + p.z * 0.7, p.y);
  if (kind < 0.5) return c;
  float fw = fwidth(q.x * 14.0) + fwidth(q.y * 14.0), fade = 1.0 - smoothstep(0.25, 0.9, fw);
  if (kind < 1.5) {       // woven check
    vec2 g = abs(fract(q * 14.0) - 0.5);
    float bars = smoothstep(0.32, 0.28, g.x) + smoothstep(0.32, 0.28, g.y);
    return c * mix(1.0, 0.72 + 0.2 * bars, fade);
  } else if (kind < 2.5) { // printed flowers (a kerchief)
    vec2 g = fract(q * 30.0) - 0.5;
    float d = length(g), f = smoothstep(0.24, 0.16, d) * (0.6 + 0.4 * sin(atan(g.y, g.x) * 5.0));
    return mix(c, c * 0.4 + vec3(0.55, 0.5, 0.36), f * 0.7 * fade);
  }
  float st = smoothstep(0.1, 0.0, abs(fract(q.y * 5.0) - 0.5) - 0.38);   // a striped border
  return mix(c, c * 0.45, st * fade);
}
float clothH(vec3 p, vec3 n) {           // triplanar weave height, ~11 cm tiles
  vec3 w = pow(abs(n), vec3(4.0)); w /= max(dot(w, vec3(1.0)), 1e-4);
  p *= 9.0;
  return texture2D(tCloth, p.zy).r * w.x + texture2D(tCloth, p.xz).r * w.y + texture2D(tCloth, p.xy).r * w.z;
}`)
      .replace('#include <map_fragment>', `
int sl = vSlot;
vec2 dux = dFdx(vMapUv), duy = dFdy(vMapUv);
vec3 col = uPal[sl];
fRough = uRough[sl]; fBump = 0.0;
float h = clothH(vBind, vBindN);
if (sl == 0) { vec3 sk = textureGrad(map, vMapUv, dux, duy).rgb; col = mix(sk, vec3(dot(sk, vec3(0.3, 0.59, 0.11))), 0.22) * col * 1.2; }   // paler, northern
else if (sl == 1) { col *= 0.35 + 1.1 * textureGrad(tHair, vMapUv, dux, duy).r; }
else if (sl == 12) {
  // put-up hair: fine strands swept back over the head
  float a = atan(vBind.x, vBind.z + 0.02);
  float st = texture2D(tHair, vec2(a * 0.8, vBind.y * 3.0)).r;
  col *= 0.4 + 0.9 * st;
  fBump = 0.6;
}
else if (sl == 2) col = textureGrad(tEye, vMapUv, dux, duy).rgb;
else {
  // painted details (bind pose): the coat's V shows waistcoat, shirt and tie; a belt; the hat band
  if (sl == 3 && uVee.w > 0.5 && vBind.z > 0.0 && vBind.y > uVee.x && vBind.y < uVee.y) {
    float t = (vBind.y - uVee.x) / (uVee.y - uVee.x);
    float hw = mix(0.012, uVee.z, t);
    if (abs(vBind.x) < hw) {
      col = uPal[8]; fRough = uRough[8];
      float inner = mix(-0.01, uVee.z * 0.75, t);
      if (abs(vBind.x) < inner && t > 0.35) { col = uPal[5]; fRough = uRough[5]; if (abs(vBind.x) < 0.011 * (1.0 - t * 0.4) + 0.004) { col = uPal[6] * 0.9 + 0.02; fRough = 0.45; } }
      else if (abs(vBind.x) < 0.006 && fract(vBind.y * 28.0) < 0.35) { col = vec3(0.12, 0.1, 0.08); }
    }
  }
  if (sl == 3 && uVee.w < 0.5 && vBind.y > uVee.x && vBind.y < uVee.y && abs(vBind.x) < 0.2) { col = uPal[8]; fRough = uRough[8]; }
  if (sl == 3 && uVee.w < 0.5 && vBind.y > uVee.z && abs(vBind.x) < 0.075) { col = uPal[5]; fRough = uRough[5]; }
  if (sl == 6 && uHatBand.y > 0.0 && vBind.y > uHatBand.x && vBind.y < uHatBand.y) { col = uPal[8] * 0.8; fRough = 0.3; }
  if (sl == 3 && uBack.y > 0.5 && vBind.z < -0.04 && abs(vBind.y - uBack.x) < 0.05) {
    float by = vBind.y - uBack.x;
    if (uBack.y > 1.5 && abs(vBind.x) < 0.13 && by > -0.018 && by < 0.022) { col *= 0.78; fRough = 0.8; }
    if (length(vec2(abs(vBind.x) - 0.045, by)) < 0.009) { col = uPal[7]; fRough = 0.35; }
  }
  if (sl == 6) col = printed(col, uPattern.x, vBind);
  if (sl == 8) col = printed(col, uPattern.y, vBind);
  // wool weave, darker in the grooves; a little of it on everything woven
  float weave = (sl == 7 || sl == 11) ? 0.0 : 1.0;
  col *= 1.0 + weave * (h - 0.5) * 0.3;
  fBump = weave * (sl == 6 ? 0.15 : 0.6);
  // mud and wet at the hems (bind height), strongest on boots and skirts
  float mud = (1.0 - smoothstep(0.02, sl == 7 ? 0.2 : 0.28, vBind.y)) * (sl == 4 || sl == 7 || sl == 3 ? 1.0 : 0.0) * (0.35 + 0.65 * uWet);
  col = mix(col, col * vec3(0.55, 0.48, 0.4) + vec3(0.03, 0.025, 0.018), mud * 0.7);
}
diffuseColor.rgb = col;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = fRough;')
      .replace('#include <normal_fragment_maps>', `
if (sl == 0) {
  vec3 mapN = textureGrad(normalMap, vNormalMapUv, dux, duy).xyz * 2.0 - 1.0;
  mapN.xy *= normalScale;
  normal = normalize(tbn * mapN);
} else if (fBump > 0.0) {
  // bump from the weave height (as three's perturbNormalArb)
  vec3 sx = normalize(dFdx(-vViewPosition)), sy = normalize(dFdy(-vViewPosition));
  vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float det = dot(sx, r1) * faceDirection;
  vec2 dH = vec2(dFdx(h), dFdy(h)) * fBump;
  vec3 bn = max(abs(det), 1e-4) * normal - sign(det) * (dH.x * r1 + dH.y * r2);
  if (dot(bn, bn) > 1e-10) normal = normalize(bn);
}
{
  // rain: what faces the sky gets soaked (darker, glossier) unless an umbrella is held over it
  vec3 wn = (vec4(normal, 0.0) * viewMatrix).xyz;
  fWet = uWet * uExposed * smoothstep(0.15, 0.85, wn.y) * (sl >= 3 ? 1.0 : 0.5);
  bool hard = sl == 6 || sl == 7 || sl == 10 || sl == 11;   // silk, leather and oilcloth shine; wool only darkens
  diffuseColor.rgb *= 1.0 - (hard ? 0.2 : 0.4) * fWet;
  roughnessFactor = mix(roughnessFactor, hard ? 0.18 : 0.55, fWet);
}`);
  };
  mat.customProgramCacheKey = () => 'folk-figure';
  return mat;
}

// --- Figures -------------------------------------------------------------------------------------
export interface Figure {
  root: THREE.Object3D;        // the armature: add to a group, scale for height
  mesh: THREE.SkinnedMesh;
  lods: THREE.BufferGeometry[];
  bone: (n: string) => THREE.Bone;
  lod: number;
  setLod(i: number): void;
}

/** A dressed, skinned figure (bones cloned from the body's template). */
export function figure(F: FolkBody, fg: FigureGeometry, mat: THREE.Material): Figure {
  const root = F.template.clone(true);
  const byName = new Map<string, THREE.Bone>();
  root.traverse(o => { if ((o as THREE.Bone).isBone) byName.set(o.name, o as THREE.Bone); });
  const skeleton = new THREE.Skeleton(F.boneNames.map(n => byName.get(n)!), F.boneInverses);
  const mesh = new THREE.SkinnedMesh(fg.lods[0], mat);
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.castShadow = true; mesh.receiveShadow = true;
  // a fixed bound from the bind pose, with room for the limbs (skinned bounds don't follow the animation)
  fg.lods[0].computeBoundingSphere();
  mesh.boundingSphere = fg.lods[0].boundingSphere!.clone();
  mesh.boundingSphere.radius += 0.25;
  root.add(mesh);
  // the leg capsules, posed into mesh space just before each draw, for the skirt to keep out of
  const U = (mat.userData as { uniforms?: Record<string, THREE.IUniform> }).uniforms;
  if (fg.legs && U?.uLegA) {
    const L = fg.legs, bones = DRAPE_BONES.map(n => byName.get(n)!), inv = DRAPE_BONES.map(n => F.boneInverses[F.bone(n)]);
    const A = U.uLegA.value as THREE.Vector4[], Bv = U.uLegB.value as THREE.Vector4[], M = new THREE.Matrix4();
    (U.uDrape.value as THREE.Vector2).x = F.m.waistY - 0.03;
    mesh.onBeforeRender = () => {
      for (let i = 0; i < 4; i++) {
        M.multiplyMatrices(mesh.bindMatrixInverse, bones[i].matrixWorld).multiply(inv[i]);
        A[i].set(L[i * 8], L[i * 8 + 1], L[i * 8 + 2], 1).applyMatrix4(M).setW(L[i * 8 + 3]);
        Bv[i].set(L[i * 8 + 4], L[i * 8 + 5], L[i * 8 + 6], 1).applyMatrix4(M).setW(L[i * 8 + 7]);
      }
    };
  }
  const f: Figure = {
    root, mesh, lods: fg.lods, lod: 0, bone: n => byName.get(n)!,
    setLod(i) { if (i !== f.lod) { f.lod = i; mesh.geometry = fg.lods[i]; } },
  };
  return f;
}

/**
 * How far the body travels per cycle of an in-place locomotion clip (from the planted foot sliding
 * back) and when the left foot lands, so speed and stride can be matched.
 */
export function measureGait(root: THREE.Object3D, frame: THREE.Object3D, clip: THREE.AnimationClip, foot: THREE.Object3D, fallback: number): { cycleDist: number; offset: number } {
  const N = 60, dur = clip.duration, v = new THREE.Vector3();
  const probe = new THREE.AnimationMixer(root);
  const pa = probe.clipAction(clip); pa.play();
  const ys: number[] = [], zs: number[] = [];
  for (let i = 0; i <= N; i++) {
    probe.setTime((i / N) * dur);
    root.updateMatrixWorld(true);
    foot.getWorldPosition(v); frame.worldToLocal(v);
    ys.push(v.y); zs.push(v.z);
  }
  probe.stopAllAction(); probe.uncacheRoot(root);
  const yMin = Math.min(...ys);
  let dz = 0, n = 0, land = -1;
  for (let i = 0; i < N; i++) if (ys[i] < yMin + 0.03 && ys[i + 1] < yMin + 0.03) { dz += Math.abs(zs[i + 1] - zs[i]); n++; if (land < 0 && (i === 0 || ys[i - 1] >= yMin + 0.03)) land = i; }
  const cycleDist = n > 3 ? THREE.MathUtils.clamp((dz / n) / (dur / N) * dur, 0.6, 4) : fallback;
  return { cycleDist, offset: land >= 0 ? land / N : 0 };
}
