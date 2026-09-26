import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { WallGrid } from './collision';
import type { Terrain } from './terrain';

/**
 * Townsfolk filling the square and streets as in the period views: strollers who walk between points
 * they can see, pause, and move on; small groups standing and talking. Each figure is one skinned mesh
 * with one material (parts coloured by vertex colour), so a crowd of dozens stays cheap to draw.
 * Clothes in period cloth colours, drawn from a few palettes per model.
 */

interface Base {
  geometry: THREE.BufferGeometry;       // merged, smooth-shaded, colour attribute per part
  partOf: Float32Array;                 // part index per vertex
  parts: string[];                      // material name per part index
  scene: THREE.Object3D;                // skeleton source
  idle: THREE.AnimationClip; walk: THREE.AnimationClip;
  height: number; palettes: Record<string, string>[];
}

const MEN = [
  { Shirt: '#3d2f22', Pants: '#4a4237', TieTexture: '#e6dfd0', Details: '#5e4c36', Hair: '#2b2118', Skin: '#c79a7a' },
  { Shirt: '#2c3640', Pants: '#5a5146', TieTexture: '#efe9dc', Details: '#4a3c2a', Hair: '#4a3727', Skin: '#d2a888' },
  { Shirt: '#5a4430', Pants: '#2e2a26', TieTexture: '#ddd5c4', Details: '#3a3028', Hair: '#1f1a15', Skin: '#bb8c6a' },
  { Shirt: '#44382e', Pants: '#6b5f4c', TieTexture: '#e2dccd', Details: '#6a5a40', Hair: '#6a5238', Skin: '#cfa283' },
  { Shirt: '#3a4034', Pants: '#3b352e', TieTexture: '#f0ead8', Details: '#2e2822', Hair: '#3b2c20', Skin: '#c49276' },
];
const WOMEN = [
  { Dress: '#5b4a3b', Shoes: '#2a2019', Hair: '#3a2a1d', Skin: '#d4a98a' },
  { Dress: '#3d4a55', Shoes: '#241c16', Hair: '#5a4128', Skin: '#caa085' },
  { Dress: '#7a6a55', Shoes: '#2a2019', Hair: '#2a1f16', Skin: '#d8b096' },
  { Dress: '#6b3b2e', Shoes: '#221a14', Hair: '#4a3522', Skin: '#c59478' },
  { Dress: '#4e5840', Shoes: '#2a2019', Hair: '#6b4c30', Skin: '#d2a488' },
  { Dress: '#8a7a64', Shoes: '#221a14', Hair: '#1e1712', Skin: '#c89a7c' },
];

async function loadBase(url: string, idleName: string, walkName: string, palettes: Record<string, string>[], height: number): Promise<Base> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const scene = gltf.scene;
  const meshes: THREE.SkinnedMesh[] = [];
  scene.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
  const parts: string[] = [];
  const geos: THREE.BufferGeometry[] = [];
  for (const m of meshes) {
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    const groups = m.geometry.groups.length ? m.geometry.groups : [{ start: 0, count: src.getAttribute('position').count, materialIndex: 0 }];
    for (const g of groups) {
      const mat = mats[g.materialIndex ?? 0] as THREE.MeshStandardMaterial;
      let pi = parts.indexOf(mat.name);
      if (pi < 0) { parts.push(mat.name); pi = parts.length - 1; }
      const piece = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'skinIndex', 'skinWeight']) {
        const a = src.getAttribute(name) as THREE.BufferAttribute;
        piece.setAttribute(name, new THREE.BufferAttribute((a.array as Float32Array).slice(g.start * a.itemSize, (g.start + g.count) * a.itemSize), a.itemSize, a.normalized));
      }
      piece.setAttribute('part', new THREE.BufferAttribute(new Float32Array(g.count).fill(pi), 1));
      geos.push(piece);
    }
  }
  let geometry = mergeGeometries(geos, false)!;
  geometry.deleteAttribute('normal');
  geometry = mergeVertices(geometry, 1e-4);
  geometry.computeVertexNormals();
  const partOf = geometry.getAttribute('part').array as Float32Array;
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(partOf.length * 3), 3));
  const find = (n: string) => gltf.animations.find(a => a.name.endsWith(n))!;
  return { geometry, partOf, parts, scene, idle: find(idleName), walk: find(walkName), height, palettes };
}

interface Person {
  root: THREE.Group; mesh: THREE.SkinnedMesh; mixer: THREE.AnimationMixer;
  idle: THREE.AnimationAction; walk: THREE.AnimationAction;
  mode: 'stand' | 'walk' | 'pause';
  target: THREE.Vector2; speed: number; timer: number; yaw: number; wIdle: number;
}

export interface Crowd { group: THREE.Group; update(dt: number, walker: THREE.Vector3): void; count: number }

export async function buildCrowd(opts: {
  walls: WallGrid; terrain: Terrain; centre: THREE.Vector2; radius: number;
  free: (x: number, z: number) => boolean;           // open ground (not inside a building)
  groups: THREE.Vector2[];                            // spots where people stand in knots
  strollers: number; material: THREE.MeshStandardMaterial;
}): Promise<Crowd> {
  const bases = (await Promise.all([
    loadBase('assets/char/man.glb', 'Man_Idle', 'Man_Walk', MEN, 1.72),
    loadBase('assets/char/woman.glb', 'Female_Idle', 'Female_Walk', WOMEN, 1.62),
  ].map(p => p.catch(e => { console.warn('crowd', e); return null; })))).filter((b): b is Base => !!b);
  const group = new THREE.Group();
  group.name = 'crowd';
  const people: Person[] = [];
  if (!bases.length) return { group, update: () => {}, count: 0 };
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tint = new THREE.Color(), skinVar = new THREE.Color();

  const spawn = (x: number, z: number, mode: Person['mode'], yaw: number): void => {
    const base = bases[people.length % bases.length === 0 && rnd() < 0.5 ? 0 : Math.floor(rnd() * bases.length)];
    const skel = cloneSkinned(base.scene);
    let skinned: THREE.SkinnedMesh | null = null;
    skel.traverse(o => { if (!skinned && (o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh; });
    if (!skinned) return;
    const src = skinned as THREE.SkinnedMesh;
    // one mesh, one material: our merged geometry bound to this clone's skeleton
    const geo = base.geometry.clone();
    const pal = base.palettes[Math.floor(rnd() * base.palettes.length)];
    const col = geo.getAttribute('color') as THREE.BufferAttribute;
    const jitter = 0.9 + rnd() * 0.2;
    for (let i = 0; i < col.count; i++) {
      const name = base.parts[base.partOf[i]];
      tint.set(pal[name] ?? '#6b5e50');
      if (name === 'Skin') { skinVar.set(pal.Skin ?? '#c99c7c'); tint.copy(skinVar); }
      else tint.multiplyScalar(jitter);
      col.setXYZ(i, tint.r, tint.g, tint.b);
    }
    const mesh = new THREE.SkinnedMesh(geo, opts.material);
    mesh.bind(src.skeleton, src.bindMatrix);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    src.parent!.add(mesh);
    skel.traverse(o => { if ((o as THREE.Mesh).isMesh && o !== mesh) o.visible = false; });
    // scale to height
    skel.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(src);
    const s = (base.height * (0.94 + rnd() * 0.1)) / Math.max(0.1, box.max.y - box.min.y);
    skel.scale.setScalar(s);
    const root = new THREE.Group();
    root.add(skel);
    root.position.set(x, opts.terrain.heightAt(x, z), z);
    root.rotation.y = yaw;
    group.add(root);
    const mixer = new THREE.AnimationMixer(skel);
    const idle = mixer.clipAction(base.idle), walk = mixer.clipAction(base.walk);
    idle.play(); walk.play();
    idle.time = rnd() * base.idle.duration; walk.time = rnd() * base.walk.duration;
    const walking = mode === 'walk';
    idle.setEffectiveWeight(walking ? 0 : 1); walk.setEffectiveWeight(walking ? 1 : 0);
    idle.timeScale = 0.8 + rnd() * 0.4;
    people.push({ root, mesh, mixer, idle, walk, mode, target: new THREE.Vector2(x, z), speed: 1.05 + rnd() * 0.35, timer: rnd() * 6, yaw, wIdle: walking ? 0 : 1 });
  };

  // Knots of 2-4 people facing each other
  for (const g of opts.groups) {
    const n = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.5, r = 0.7 + rnd() * 0.3;
      const x = g.x + Math.cos(a) * r, z = g.y + Math.sin(a) * r;
      if (!opts.free(x, z)) continue;
      spawn(x, z, 'stand', Math.atan2(g.x - x, g.y - z));
    }
  }
  // Strollers at random open points
  let tries = 0;
  while (people.filter(p => p.mode !== 'stand').length < opts.strollers && tries++ < opts.strollers * 40) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * opts.radius;
    const x = opts.centre.x + Math.cos(a) * r, z = opts.centre.y + Math.sin(a) * r;
    if (!opts.free(x, z)) continue;
    spawn(x, z, 'pause', rnd() * Math.PI * 2);
  }

  const pickTarget = (p: Person): boolean => {
    const px = p.root.position.x, pz = p.root.position.z;
    for (let k = 0; k < 12; k++) {
      const a = rnd() * Math.PI * 2, d = 8 + rnd() * 30;
      const tx = px + Math.cos(a) * d, tz = pz + Math.sin(a) * d;
      if (Math.hypot(tx - opts.centre.x, tz - opts.centre.y) > opts.radius) continue;
      if (!opts.free(tx, tz)) continue;
      if (opts.walls.castSegment(px, pz, tx, tz) < 0.999) continue;
      p.target.set(tx, tz);
      return true;
    }
    return false;
  };

  const tmp = new THREE.Vector2();
  return {
    group, count: people.length,
    update(dt: number, walker: THREE.Vector3) {
      for (const p of people) {
        const dist = Math.hypot(p.root.position.x - walker.x, p.root.position.z - walker.z);
        const far = dist > 140;
        p.root.visible = !far;
        p.mesh.castShadow = dist < 45;
        if (p.mode === 'pause') {
          p.timer -= dt;
          if (p.timer <= 0) p.mode = pickTarget(p) ? 'walk' : 'pause', p.timer = 1 + rnd() * 3;
        } else if (p.mode === 'walk') {
          tmp.set(p.target.x - p.root.position.x, p.target.y - p.root.position.z);
          const d = tmp.length();
          if (d < 0.4) { p.mode = 'pause'; p.timer = 2 + rnd() * 7; }
          else {
            tmp.divideScalar(d);
            // step aside for the walker
            const wx = p.root.position.x - walker.x, wz = p.root.position.z - walker.z, wd = Math.hypot(wx, wz);
            if (wd < 1.6 && wd > 1e-3) { tmp.x += (wx / wd) * 0.8; tmp.y += (wz / wd) * 0.8; tmp.normalize(); }
            const step = p.speed * dt;
            const nx = p.root.position.x + tmp.x * step, nz = p.root.position.z + tmp.y * step;
            if (opts.free(nx, nz)) { p.root.position.x = nx; p.root.position.z = nz; }
            else { p.mode = 'pause'; p.timer = 0.5; }
            p.root.position.y = opts.terrain.heightAt(p.root.position.x, p.root.position.z);
            const want = Math.atan2(tmp.x, tmp.y);
            let diff = want - p.yaw; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            p.yaw += diff * (1 - Math.exp(-6 * dt));
            p.root.rotation.y = p.yaw;
          }
        }
        const wantIdle = p.mode === 'walk' ? 0 : 1;
        p.wIdle += (wantIdle - p.wIdle) * (1 - Math.exp(-6 * dt));
        p.idle.setEffectiveWeight(p.wIdle);
        p.walk.setEffectiveWeight(1 - p.wIdle);
        if (!far) p.mixer.update(dt);
      }
    },
  };
}
