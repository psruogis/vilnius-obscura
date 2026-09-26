import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Building } from './area';
import type { WallGrid } from './collision';
import type { Terrain } from './terrain';
import { townHallFrame } from './townhall';
import { mbox, merged } from './geom';

/**
 * Horse-drawn traffic round the square, as in the period views: closed coaches and carts on a loop
 * that runs up the open square on each side of the promenade and round behind the Town Hall.
 * The loop is fitted to the open ground at load time (each point is shifted sideways until the lane
 * is clear of buildings, stalls and fences by ~2.4 m), then smoothed. Horse: Quaternius (CC0).
 */

export interface Traffic { group: THREE.Group; update(dt: number, walker: THREE.Vector3): void; route: THREE.Vector3[] }

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

interface Rig { root: THREE.Group; horse: THREE.Object3D; mixer: THREE.AnimationMixer; walk: THREE.AnimationAction; idle: THREE.AnimationAction; s: number; speed: number; v: number; wheels: THREE.Object3D[]; len: number }

function coachGeometry(kind: 'coach' | 'cart') {
  const body: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [], wood: THREE.BufferGeometry[] = [];
  // axle trees and perch, facing +Z (forward)
  wood.push(mbox(0.12, 0.1, 3.0, 0, 0.55, -0.2));
  if (kind === 'coach') {
    // body slung between front and rear springs: curved panels approximated by boxes, windows dark
    body.push(mbox(1.35, 1.2, 1.75, 0, 1.55, -0.55));
    body.push(mbox(1.2, 0.25, 1.95, 0, 0.98, -0.55));
    body.push(mbox(1.45, 0.1, 1.85, 0, 2.2, -0.55));                   // roof
    dark.push(mbox(1.37, 0.5, 0.6, 0, 1.75, -0.55));                   // side windows
    dark.push(mbox(0.9, 0.5, 1.77, 0, 1.75, -0.55));                   // front/back windows
    wood.push(mbox(1.1, 0.12, 0.5, 0, 1.55, 0.95));                    // coachman's box
    wood.push(mbox(1.1, 0.5, 0.08, 0, 1.3, 1.18));
    wood.push(mbox(0.08, 0.9, 0.08, -0.45, 1.05, 0.95)); wood.push(mbox(0.08, 0.9, 0.08, 0.45, 1.05, 0.95));
    for (const z of [-1.55, 0.45]) wood.push(mbox(1.2, 0.08, 0.3, 0, 0.9, z)); // springs
  } else {
    wood.push(mbox(1.3, 0.1, 2.4, 0, 0.9, -0.3));
    for (const x of [-0.66, 0.66]) wood.push(mbox(0.06, 0.4, 2.4, x, 1.15, -0.3));
    wood.push(mbox(1.3, 0.4, 0.06, 0, 1.15, -1.5));
    wood.push(mbox(1.0, 0.1, 0.4, 0, 1.25, 0.9));                     // driver's plank
  }
  // shafts to the horse
  for (const x of [-0.42, 0.42]) wood.push(mbox(0.07, 0.07, 2.6, x, 0.95, 2.0));
  return { body: body.length ? merged(body) : null, dark: dark.length ? merged(dark) : null, wood: merged(wood) };
}

function wheel(r: number, mat: THREE.Material): THREE.Object3D {
  const parts = [new THREE.TorusGeometry(r, 0.045, 6, 28).rotateY(Math.PI / 2), new THREE.CylinderGeometry(0.08, 0.08, 0.22, 10).rotateZ(Math.PI / 2)];
  for (let k = 0; k < 12; k++) parts.push(new THREE.BoxGeometry(0.03, r * 2, 0.035).rotateX((k * Math.PI) / 12));
  const m = new THREE.Mesh(merged(parts), mat);
  m.castShadow = true;
  return m;
}

export async function buildTraffic(opts: {
  th: Building; walls: WallGrid; terrain: Terrain; free: (x: number, z: number) => boolean;
  mats: { wood: THREE.Material; body: THREE.Material; dark: THREE.Material; horse: THREE.MeshStandardMaterial; driver?: () => THREE.Object3D | null };
}): Promise<Traffic> {
  const group = new THREE.Group();
  group.name = 'traffic';
  const loop = fitRoute(opts.th, opts.walls, opts.free);
  const route = loop.map(p => new THREE.Vector3(p.x, 0, p.y));
  if (loop.length < 8) return { group, update: () => {}, route };
  const cum: number[] = [0];
  for (let i = 1; i <= loop.length; i++) cum.push(cum[i - 1] + loop[i % loop.length].distanceTo(loop[i - 1]));
  const total = cum[cum.length - 1];
  const at = (s: number, out: THREE.Vector2, dir: THREE.Vector2) => {
    s = ((s % total) + total) % total;
    let i = 1; while (cum[i] < s) i++;
    const a = loop[i - 1], b = loop[i % loop.length];
    const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    out.copy(a).lerp(b, t);
    dir.copy(b).sub(a).normalize();
  };

  const gltf = await new GLTFLoader().loadAsync('assets/char/horse.glb');
  const src = gltf.scene;
  const colours: Record<string, string>[] = [
    { Main: '#4a2d1c', Main_Dark: '#2a1a10', Main_Light: '#6a4630', Hair: '#1a1410' },   // bay
    { Main: '#2a2320', Main_Dark: '#171311', Main_Light: '#3a312c', Hair: '#0f0d0c' },   // black
    { Main: '#8a8078', Main_Dark: '#5a5550', Main_Light: '#b0a89c', Hair: '#dcd6cc' },   // grey
    { Main: '#7a4a28', Main_Dark: '#4e2e18', Main_Light: '#a06a40', Hair: '#3a2416' },   // chestnut
  ];
  const clipWalk = gltf.animations.find(a => a.name.endsWith('Walk'))!, clipIdle = gltf.animations.find(a => a.name.endsWith('Idle'))!;

  const makeHorse = (ci: number): { obj: THREE.Object3D; mixer: THREE.AnimationMixer; walk: THREE.AnimationAction; idle: THREE.AnimationAction } => {
    const h = cloneSkinned(src);
    h.traverse(o => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      const g = m.geometry.clone(); g.deleteAttribute('normal');
      const w = mergeVertices(g, 1e-6); w.computeVertexNormals(); m.geometry = w;
      m.material = (Array.isArray(m.material) ? m.material : [m.material]).map(mm => {
        const c = (mm as THREE.MeshStandardMaterial).clone();
        const col = colours[ci][c.name];
        if (col) c.color.set(col);
        c.roughness = 0.75; c.metalness = 0;
        return c;
      }) as unknown as THREE.Material;
      if (Array.isArray(m.material) && (m.material as THREE.Material[]).length === 1) m.material = (m.material as THREE.Material[])[0];
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    });
    h.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(h);
    const size = box.getSize(new THREE.Vector3());
    const s = 2.35 / Math.max(size.x, size.z);        // nose to tail ~2.35 m
    h.scale.multiplyScalar(s);
    h.position.y = -box.min.y * s;
    const mixer = new THREE.AnimationMixer(h);
    const walk = mixer.clipAction(clipWalk), idle = mixer.clipAction(clipIdle);
    walk.play(); idle.play(); idle.setEffectiveWeight(0);
    return { obj: h, mixer, walk, idle };
  };

  const rigs: Rig[] = [];
  const kinds: ('coach' | 'cart')[] = ['coach', 'cart', 'coach', 'cart'];
  const n = Math.min(kinds.length, Math.max(1, Math.floor(total / 90)));
  for (let i = 0; i < n; i++) {
    const kind = kinds[i];
    const root = new THREE.Group();
    const g = coachGeometry(kind);
    const add = (geo: THREE.BufferGeometry | null, mat: THREE.Material) => { if (!geo) return; const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; root.add(m); };
    add(g.body, opts.mats.body); add(g.dark, opts.mats.dark); add(g.wood, opts.mats.wood);
    const wheels: THREE.Object3D[] = [];
    for (const [x, z, r] of kind === 'coach' ? [[-0.72, -1.4, 0.72], [0.72, -1.4, 0.72], [-0.68, 0.5, 0.5], [0.68, 0.5, 0.5]] : [[-0.78, -0.4, 0.62], [0.78, -0.4, 0.62]]) {
      const w = wheel(r, opts.mats.wood); w.position.set(x, r, z); w.userData.r = r; root.add(w); wheels.push(w);
    }
    const hr = makeHorse(i % colours.length);
    hr.obj.position.set(0, hr.obj.position.y, 3.1);
    root.add(hr.obj);
    const driver = opts.mats.driver?.();
    if (driver) { driver.position.set(0, kind === 'coach' ? 1.6 : 1.3, kind === 'coach' ? 0.95 : 0.9); root.add(driver); }
    group.add(root);
    rigs.push({ root, horse: hr.obj, mixer: hr.mixer, walk: hr.walk, idle: hr.idle, s: (total / n) * i, speed: 1.9 + 0.3 * (i % 2), v: 0, wheels, len: 5.6 });
  }

  const p0 = new THREE.Vector2(), d0 = new THREE.Vector2(), p1 = new THREE.Vector2(), d1 = new THREE.Vector2();
  return {
    group, route,
    update(dt: number, walker: THREE.Vector3) {
      for (const r of rigs) {
        // stop for the walker standing in front of the horse
        at(r.s + 3.5, p0, d0);
        const block = Math.hypot(walker.x - p0.x, walker.z - p0.y) < 2.2;
        const want = block ? 0 : r.speed;
        r.v += (want - r.v) * (1 - Math.exp(-2.5 * dt));
        r.s += r.v * dt;
        // rear axle and horse positions on the path: the body follows the curve
        at(r.s, p0, d0);
        at(r.s + 3.1, p1, d1);
        const mid = p0.clone().lerp(p1, 0.35);
        const yaw = Math.atan2(p1.x - p0.x, p1.y - p0.y);
        r.root.position.set(mid.x, opts.terrain.heightAt(mid.x, mid.y), mid.y);
        r.root.rotation.y = yaw;
        for (const w of r.wheels) w.rotation.x += (r.v * dt) / w.userData.r;
        const k = Math.min(1, r.v / r.speed);
        r.walk.setEffectiveWeight(k); r.idle.setEffectiveWeight(1 - k);
        r.walk.timeScale = Math.max(0.3, r.v / 1.9);
        r.mixer.update(dt);
      }
    },
  };
}
