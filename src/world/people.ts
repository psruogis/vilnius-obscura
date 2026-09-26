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
  restHeight: number;                   // model height in rest pose, scene units
  restTop: number;
  female: boolean;
}

// c.1900 townsfolk after the period views: dark, full clothes, hats (coat = the model's shirt and sleeves)
const MEN = [
  { Shirt: '#1c1b1a', Pants: '#2a2826', TieTexture: '#e8e3d6', Details: '#161514', Hair: '#2b2118', Skin: '#c79a7a', Coat: '#1c1b1a', Hat: '#141312' },
  { Shirt: '#26221e', Pants: '#3a3632', TieTexture: '#efe9dc', Details: '#1c1a18', Hair: '#4a3727', Skin: '#d2a888', Coat: '#26221e', Hat: '#1a1816' },
  { Shirt: '#2e2a24', Pants: '#23201d', TieTexture: '#ddd5c4', Details: '#211e1b', Hair: '#1f1a15', Skin: '#bb8c6a', Coat: '#2e2a24', Hat: '#3a3530' },
  { Shirt: '#1f2428', Pants: '#2c2c2a', TieTexture: '#e2dccd', Details: '#1a1c1e', Hair: '#6a5238', Skin: '#cfa283', Coat: '#1f2428', Hat: '#161819' },
  { Shirt: '#3a3026', Pants: '#2e2a26', TieTexture: '#f0ead8', Details: '#2a241e', Hair: '#3b2c20', Skin: '#c49276', Coat: '#3a3026', Hat: '#2a2520' },
  { Shirt: '#232a22', Pants: '#262420', TieTexture: '#e8e2d2', Details: '#1c201a', Hair: '#2e241b', Skin: '#c89a7c', Coat: '#232a22', Hat: '#1c1c1a' },
];
const WOMEN = [
  { Dress: '#1e1c1b', Shoes: '#1a1614', Hair: '#3a2a1d', Skin: '#d4a98a', Shawl: '#ece6d8', Hat: '#ece6d8' },
  { Dress: '#2a2420', Shoes: '#1a1614', Hair: '#5a4128', Skin: '#caa085', Shawl: '#3a3530', Hat: '#221f1c' },
  { Dress: '#232830', Shoes: '#1a1614', Hair: '#2a1f16', Skin: '#d8b096', Shawl: '#e2dccb', Hat: '#e2dccb' },
  { Dress: '#3a2420', Shoes: '#1a1614', Hair: '#4a3522', Skin: '#c59478', Shawl: '#5a4e40', Hat: '#2a2320' },
  { Dress: '#26291f', Shoes: '#1a1614', Hair: '#6b4c30', Skin: '#d2a488', Shawl: '#d8cfbc', Hat: '#d8cfbc' },
  { Dress: '#4a4236', Shoes: '#1a1614', Hair: '#1e1712', Skin: '#c89a7c', Shawl: '#efe9dc', Hat: '#1e1c1a' },
  { Dress: '#161616', Shoes: '#141210', Hair: '#3a2a1d', Skin: '#d4a98a', Shawl: '#8a7a64', Hat: '#161616' },
];

// --- Period dress: hats, coat skirts, full skirts, shawls, umbrellas (attached to the bones) --------------
function colored(g: THREE.BufferGeometry, c: THREE.ColorRepresentation): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const n = src.getAttribute('position').count, arr = new Float32Array(n * 3), col = new THREE.Color(c);
  for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
  src.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (src.getAttribute('uv')) src.deleteAttribute('uv');
  return src;
}
const lathe = (pts: [number, number][], seg = 18) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

function hatGeometry(kind: number, c: string): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  if (kind === 0) {        // top hat
    parts.push(lathe([[0, 0.2], [0.098, 0.2], [0.092, 0.03], [0.095, 0]], 16), new THREE.CylinderGeometry(0.098, 0.098, 0.005, 16).translate(0, 0.2, 0));
    parts.push(new THREE.CylinderGeometry(0.17, 0.17, 0.012, 20).translate(0, 0.012, 0));
  } else if (kind === 1) { // bowler
    parts.push(new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.05, 1.1).translate(0, 0.01, 0));
    parts.push(lathe([[0.1, 0.01], [0.155, 0.012], [0.165, 0.03]], 20));
  } else if (kind === 2) { // peaked cap
    parts.push(new THREE.CylinderGeometry(0.115, 0.1, 0.075, 14).translate(0, 0.04, 0));
    parts.push(new THREE.BoxGeometry(0.16, 0.012, 0.09).rotateX(0.25).translate(0, 0.012, 0.13));
  } else if (kind === 3) { // bonnet
    parts.push(new THREE.SphereGeometry(0.115, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.62).scale(1, 1.05, 1.15).translate(0, -0.03, -0.02));
    parts.push(new THREE.TorusGeometry(0.12, 0.025, 6, 14, Math.PI).rotateX(-0.35).translate(0, -0.03, 0.05));
  } else {                 // headscarf, knotted under the chin
    parts.push(new THREE.SphereGeometry(0.118, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.6).scale(1, 1.1, 1.12).translate(0, -0.04, -0.01));
    parts.push(new THREE.ConeGeometry(0.1, 0.16, 6).rotateX(Math.PI).translate(0, -0.1, -0.1));
  }
  return mergeGeometries(parts.map(p => colored(p, c)), false)!;
}

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
  scene.updateMatrixWorld(true);
  const rb = new THREE.Box3().setFromObject(scene);
  return { geometry, partOf, parts, scene, idle: find(idleName), walk: find(walkName), height, palettes, restHeight: rb.max.y - rb.min.y, restTop: rb.max.y, female: parts.includes('Dress') };
}

interface Person {
  root: THREE.Group; mesh: THREE.SkinnedMesh; mixer: THREE.AnimationMixer;
  idle: THREE.AnimationAction; walk: THREE.AnimationAction;
  mode: 'stand' | 'walk' | 'pause';
  target: THREE.Vector2; speed: number; timer: number; yaw: number; wIdle: number;
  job?: LampJob;
}

/** A lamplighter's round: go to the nearest lamp that needs him (and that he can see), work it, move on. */
interface LampJob {
  ground: THREE.Vector2[]; needs: (i: number) => boolean; act: (i: number) => void;
  state: 'seek' | 'go' | 'work' | 'wander'; lamp: number; t: number; done: boolean;
}

export interface Crowd {
  group: THREE.Group; update(dt: number, walker: THREE.Vector3): void; count: number;
  addLamplighter(o: { start: THREE.Vector2; ground: THREE.Vector2[]; needs: (i: number) => boolean; act: (i: number) => void }): void;
}

export async function buildCrowd(opts: {
  walls: WallGrid; terrain: Terrain; centre: THREE.Vector2; radius: number;
  free: (x: number, z: number) => boolean;           // open ground (not inside a building)
  groups: THREE.Vector2[];                            // spots where people stand in knots
  strollers: number; material: THREE.MeshStandardMaterial; accessories: THREE.MeshStandardMaterial; umbrellas: boolean;
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

  const spawn = (x: number, z: number, mode: Person['mode'], yaw: number, lamplighter = false): Person | null => {
    const base = lamplighter ? (bases.find(b => !b.female) ?? bases[0]) : bases[people.length % bases.length === 0 && rnd() < 0.5 ? 0 : Math.floor(rnd() * bases.length)];
    const skel = cloneSkinned(base.scene);
    let skinned: THREE.SkinnedMesh | null = null;
    skel.traverse(o => { if (!skinned && (o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh; });
    if (!skinned) return null;
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
    // scale to height (from the rest-pose size of the whole model, as the market figures do)
    const s = (base.height * (0.94 + rnd() * 0.1)) / Math.max(1e-3, base.restHeight);
    skel.scale.multiplyScalar(s);
    // dress: hat on the head, coat skirt or full skirt on the hips, shawl on the shoulders
    skel.updateMatrixWorld(true);
    const H = base.restHeight * s, top = base.restTop * s;
    const bone = (n: string) => skel.getObjectByName(n);
    const attach = (b: THREE.Object3D | undefined, geo: THREE.BufferGeometry, at: THREE.Vector3) => {
      if (!b) return;
      const m = new THREE.Mesh(geo, opts.accessories);
      new THREE.Matrix4().copy(b.matrixWorld).invert().multiply(new THREE.Matrix4().makeTranslation(at.x, at.y, at.z)).decompose(m.position, m.quaternion, m.scale);
      m.castShadow = true; m.frustumCulled = false;
      b.add(m);
    };
    const attachM = (b: THREE.Object3D | undefined, geo: THREE.BufferGeometry, world: THREE.Matrix4) => {
      if (!b) return;
      const m = new THREE.Mesh(geo, opts.accessories);
      new THREE.Matrix4().copy(b.matrixWorld).invert().multiply(world).decompose(m.position, m.quaternion, m.scale);
      m.castShadow = true; m.frustumCulled = false;
      b.add(m);
    };
    const head = bone('Head'), hips = bone('Hips'), torso = bone('Torso');
    const palm = bone('PalmR') ?? bone('Palm.R');
    const umbrellaHand = !lamplighter && opts.umbrellas && palm && rnd() < 0.4 ? palm.getWorldPosition(new THREE.Vector3()) : null;
    const umbrellaTop = top;
    const hp = new THREE.Vector3(), tp = new THREE.Vector3();
    if (head) head.getWorldPosition(hp);
    if (hips) hips.getWorldPosition(tp);
    const P = pal as Record<string, string>;
    if (!base.female) {
      const hatKind = lamplighter ? 2 : rnd() < 0.42 ? 0 : rnd() < 0.62 ? 1 : 2;
      attach(head, hatGeometry(hatKind, P.Hat ?? '#161514'), new THREE.Vector3(hp.x, top - (hatKind === 2 ? 0.06 : 0.07), hp.z + 0.01));
      // frock coat or greatcoat skirt, waist to knee (or calf)
      const knee = H * (rnd() < 0.4 ? 0.2 : 0.3);
      attach(hips, colored(lathe([[0.165, H * 0.6], [0.19, H * 0.5], [0.23, H * 0.38], [0.27, knee]], 16), new THREE.Color(P.Coat ?? '#1c1b1a').multiplyScalar(0.95)), new THREE.Vector3(tp.x, 0, tp.z));
    } else {
      // full skirt to the ground
      const w0 = 0.15, w1 = 0.36 + rnd() * 0.1;
      attach(hips, colored(lathe([[w0, H * 0.6], [w0 + 0.05, H * 0.5], [w1 * 0.8, H * 0.25], [w1, 0.03], [w1 * 0.95, 0.0]], 20), P.Dress ?? '#1e1c1b'), new THREE.Vector3(tp.x, 0, tp.z));
      // shawl over the shoulders (most women), bonnet or headscarf
      if (rnd() < 0.75) attach(torso ?? hips, colored(lathe([[0.075, H * 0.84], [0.17, H * 0.8], [0.25, H * 0.7], [0.24, H * 0.6]], 18), P.Shawl ?? '#ece6d8'), new THREE.Vector3(tp.x, 0, tp.z));
      const hatKind = rnd() < 0.55 ? 4 : 3;
      attach(head, hatGeometry(hatKind, P.Hat ?? '#ece6d8'), new THREE.Vector3(hp.x, top - 0.1, hp.z));
    }
    const root = new THREE.Group();
    root.add(skel);
    root.position.set(x, opts.terrain.heightAt(x, z), z);
    root.rotation.y = yaw;
    if (lamplighter) {
      // the lighting pole, held upright: a hook and a small burning wick at the top
      const pole = new THREE.Mesh(mergeGeometries([
        colored(new THREE.CylinderGeometry(0.016, 0.02, 3.6, 6).translate(0, 2.35, 0), '#5a4430'),
        colored(new THREE.TorusGeometry(0.06, 0.008, 4, 8, Math.PI).translate(0, 4.2, 0), '#2a2622'),
        colored(new THREE.SphereGeometry(0.03, 6, 4).translate(0.03, 4.13, 0), '#ffcf7a'),
      ], false)!, opts.accessories);
      pole.position.set(0.25, 0, 0.18);
      root.add(pole);
    } else if (opts.umbrellas && umbrellaHand) {
      // umbrella held in the right hand: shaft from the hand up over the head, canopy just above the hat
      const hand = umbrellaHand, headTop = umbrellaTop;
      const tip = new THREE.Vector3(hp.x * 0.3 + hand.x * 0.7, headTop + 0.22, hp.z * 0.3 + hand.z * 0.7 + 0.05);
      const axis = tip.clone().sub(hand), len = axis.length();
      const geo = mergeGeometries([
        colored(new THREE.CylinderGeometry(0.009, 0.009, len + 0.1, 5).translate(0, (len + 0.1) / 2 - 0.08, 0), '#2a2420'),
        colored(new THREE.TorusGeometry(0.035, 0.008, 4, 8, Math.PI).rotateZ(Math.PI).translate(0.035, -0.08, 0), '#2a2420'),   // crook handle
        colored(lathe([[0, 0.3], [0.2, 0.24], [0.4, 0.1], [0.47, 0.02], [0.46, 0]], 8).translate(0, len - 0.02, 0), '#141414'),
      ], false)!;
      const m = new THREE.Matrix4().compose(hand, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize()), new THREE.Vector3(1, 1, 1));
      attachM(palm ?? bone('LowerArmR'), geo, m);
    }
    group.add(root);
    const mixer = new THREE.AnimationMixer(skel);
    const idle = mixer.clipAction(base.idle), walk = mixer.clipAction(base.walk);
    idle.play(); walk.play();
    idle.time = rnd() * base.idle.duration; walk.time = rnd() * base.walk.duration;
    const walking = mode === 'walk';
    idle.setEffectiveWeight(walking ? 0 : 1); walk.setEffectiveWeight(walking ? 1 : 0);
    idle.timeScale = 0.8 + rnd() * 0.4;
    const person: Person = { root, mesh, mixer, idle, walk, mode, target: new THREE.Vector2(x, z), speed: 1.05 + rnd() * 0.35, timer: rnd() * 6, yaw, wIdle: walking ? 0 : 1 };
    people.push(person);
    return person;
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
    addLamplighter(o) {
      const p = spawn(o.start.x, o.start.y, 'pause', 0, true);
      if (!p) return;
      p.speed = 1.25;
      p.job = { ground: o.ground, needs: o.needs, act: o.act, state: 'seek', lamp: -1, t: 0, done: false };
    },
    update(dt: number, walker: THREE.Vector3) {
      for (const p of people) {
        const dist = Math.hypot(p.root.position.x - walker.x, p.root.position.z - walker.z);
        const far = dist > 140;
        p.root.visible = !far;
        p.mesh.castShadow = dist < 45;
        const j = p.job;
        if (j) {
          if (j.state === 'seek') {
            // the nearest lamp that needs lighting (or putting out) and that he can walk to in a straight line
            const px = p.root.position.x, pz = p.root.position.z;
            let best = -1, bd = Infinity;
            j.ground.forEach((g, i) => {
              if (!j.needs(i)) return;
              const d = Math.hypot(g.x - px, g.y - pz);
              if (d < bd && d < 90 && opts.walls.castSegment(px, pz, g.x, g.y) >= 0.999) { bd = d; best = i; }
            });
            if (best >= 0) { j.lamp = best; p.target.copy(j.ground[best]); p.mode = 'walk'; j.state = 'go'; }
            else if (pickTarget(p)) { p.mode = 'walk'; j.state = 'wander'; }
          } else if ((j.state === 'go' || j.state === 'wander') && p.mode === 'pause') {
            if (j.state === 'go') { j.state = 'work'; j.t = 0; j.done = false; } else j.state = 'seek';
          } else if (j.state === 'work') {
            j.t += dt;
            p.mode = 'stand';
            if (j.t > 1.3 && !j.done) { j.act(j.lamp); j.done = true; }
            if (j.t > 2.6) { j.state = 'seek'; p.mode = 'pause'; p.timer = 99; }
          }
        }
        if (p.mode === 'pause' && !j) {
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
