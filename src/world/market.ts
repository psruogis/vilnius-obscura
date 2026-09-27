import * as THREE from 'three';
import type { AreaData, Building } from './area';
import type { Terrain } from './terrain';
import { townHallFrame } from './townhall';
import { mbox, merged } from './geom';
import { loadFolk, dress, figure, figureMaterial, type Outfit } from './folk';

/**
 * Market life on the square (the period views show stalls, carts and townsfolk around the Town Hall):
 * canvas-roofed stalls, two-wheeled carts, barrels, crates and sacks either side of the promenade, and
 * townsfolk (folk.ts) standing at the stalls or strolling. Every spot is checked
 * against the building outlines at load time, so the layout survives changes to the data.
 */

type Kind = 'stall' | 'cart' | 'goods';
interface Spot { kind: Kind; x: number; z: number; yaw: number } // Town Hall frame; yaw 0 = facing +X

// West of the promenade (its fence is at x = 4.1) and east of it (x = 32.7); north is -Z.
const SPOTS: Spot[] = [
  { kind: 'stall', x: -3, z: -40, yaw: 0 }, { kind: 'stall', x: -3, z: -52, yaw: 0 }, { kind: 'stall', x: -3, z: -64, yaw: 0 },
  { kind: 'stall', x: 40, z: -26, yaw: Math.PI }, { kind: 'stall', x: 40, z: -38, yaw: Math.PI }, { kind: 'stall', x: 40, z: -50, yaw: Math.PI },
  { kind: 'stall', x: 40, z: -62, yaw: Math.PI },
  { kind: 'cart', x: -10, z: -76, yaw: 1.2 }, { kind: 'cart', x: 47, z: -12, yaw: -0.4 }, { kind: 'cart', x: 46, z: -74, yaw: 2.6 },
  { kind: 'goods', x: -14, z: -30, yaw: 0.3 }, { kind: 'goods', x: -4, z: -76, yaw: 1 }, { kind: 'goods', x: 44, z: -30, yaw: 2 },
  { kind: 'goods', x: 44, z: -56, yaw: 0.5 }, { kind: 'goods', x: -1, z: -14, yaw: 0 },
];
const FOOTPRINT: Record<Kind, [number, number]> = { stall: [3.2, 2.4], cart: [3.6, 1.8], goods: [2.2, 2.2] };

export interface MarketMaterials { wood: THREE.Material; canvas: THREE.Material; goods: THREE.Material[] }

export interface Market {
  group: THREE.Group;
  segments: [number, number, number, number][];
  update(dt: number): void;
}

export async function buildMarket(data: AreaData, th: Building, terrain: Terrain, mats: MarketMaterials, withStalls = true): Promise<Market> {
  const f = townHallFrame(th);
  const toWorld = (x: number, z: number) => {
    const p = f.origin.clone().addScaledVector(f.dirX, x).addScaledVector(f.dirZ, z);
    p.y = terrain.heightAt(p.x, p.z);
    return p;
  };
  const worldYaw = (yaw: number) => f.theta + yaw;
  const near = data.buildings.filter(b => b.dist < data.meta.walkRadius + 60);
  const blocked = (pts: THREE.Vector3[]) => pts.some(p => near.some(b => inRing(p.x, p.z, b.rings[0])));

  const group = new THREE.Group();
  group.name = 'market';
  const wood: THREE.BufferGeometry[] = [], canvas: THREE.BufferGeometry[] = [];
  const goods: THREE.BufferGeometry[][] = mats.goods.map(() => []);
  const segments: Market['segments'] = [];
  const standAt: { p: THREE.Vector3; yaw: number }[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0);
  const put = (list: THREE.BufferGeometry[], g: THREE.BufferGeometry, p: THREE.Vector3, yaw: number) =>
    list.push(g.applyMatrix4(m.compose(p, q.setFromAxisAngle(Y, yaw), one)));

  for (const [i, s] of (withStalls ? SPOTS : []).entries()) {
    const p = toWorld(s.x, s.z), yaw = worldYaw(s.yaw);
    const [L, W] = FOOTPRINT[s.kind];
    const corners = [[-L / 2 - 1.5, -W / 2 - 1.5], [L / 2 + 1.5, -W / 2 - 1.5], [L / 2 + 1.5, W / 2 + 1.5], [-L / 2 - 1.5, W / 2 + 1.5]]
      .map(([x, z]) => new THREE.Vector3(x, 0, z).applyAxisAngle(Y, yaw).add(p));
    if (blocked([p, ...corners])) continue; // a building stands here in this version of the data
    const body = corners.map(c => c.clone().sub(p).multiplyScalar(0.72).add(p));
    for (let k = 0; k < 4; k++) segments.push([body[k].x, body[k].z, body[(k + 1) % 4].x, body[(k + 1) % 4].z]);

    if (s.kind === 'stall') {
      // Four posts, a counter along the front (+X side), a sloping canvas roof, goods on the counter
      for (const [x, z] of [[-1.5, -1.1], [1.5, -1.1], [-1.5, 1.1], [1.5, 1.1]]) put(wood, mbox(0.1, x > 0 ? 2.1 : 2.5, 0.1, x, x > 0 ? 1.05 : 1.25, z), p, yaw);
      put(wood, mbox(0.7, 0.08, 2.3, 1.2, 0.85, 0), p, yaw);
      put(wood, mbox(0.06, 0.8, 2.3, 1.52, 0.42, 0), p, yaw);
      const roof = new THREE.PlaneGeometry(3.4, 2.7).rotateX(-Math.PI / 2).rotateZ(-0.13);
      put(canvas, roof.translate(0, 2.35, 0), p, yaw);
      for (let k = 0; k < 5; k++) {
        const gi = (i + k) % goods.length;
        put(goods[gi], new THREE.SphereGeometry(0.16 + 0.04 * (k % 2), 8, 6).scale(1.4, 0.7, 1.2).translate(1.15, 0.97, -0.9 + k * 0.45), p, yaw);
      }
      put(wood, mbox(0.5, 0.35, 0.4, -0.9, 0.18, 0.6), p, yaw); // a crate under the counter
      standAt.push({ p: new THREE.Vector3(-0.3, 0, -0.2).applyAxisAngle(Y, yaw).add(p), yaw: yaw + Math.PI / 2 }); // the stallholder
    } else if (s.kind === 'cart') {
      // Two big wheels, a plank bed, shafts resting on the ground
      put(wood, mbox(2.2, 0.1, 1.3, 0, 0.75, 0), p, yaw);
      for (const z of [-0.65, 0.65]) put(wood, mbox(2.2, 0.35, 0.06, 0, 0.95, z), p, yaw);
      for (const z of [-0.78, 0.78]) {
        put(wood, new THREE.TorusGeometry(0.62, 0.05, 6, 20).translate(-0.2, 0.62, z), p, yaw);
        put(wood, new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8).rotateX(Math.PI / 2).translate(-0.2, 0.62, z), p, yaw);
        for (let k = 0; k < 6; k++) put(wood, mbox(0.04, 1.2, 0.04, 0, 0, 0).rotateZ((k * Math.PI) / 6).translate(-0.2, 0.62, z), p, yaw);
      }
      for (const z of [-0.45, 0.45]) put(wood, mbox(2.0, 0.07, 0.07, 1.9, 0.4, z).rotateZ(-0.18), p, yaw);
      for (let k = 0; k < 3; k++) put(goods[(i + k) % goods.length], new THREE.SphereGeometry(0.3, 8, 6).scale(1.2, 0.8, 1).translate(-0.6 + k * 0.6, 1.0, 0.1 * k), p, yaw);
    } else {
      // Barrels, crates and sacks
      const barrel = new THREE.CylinderGeometry(0.3, 0.3, 0.85, 12);
      barrel.scale(1, 1, 1);
      put(wood, barrel.clone().translate(0, 0.43, 0), p, yaw);
      put(wood, barrel.clone().translate(0.65, 0.43, 0.2), p, yaw);
      put(wood, mbox(0.6, 0.5, 0.6, -0.5, 0.25, 0.6), p, yaw);
      put(wood, mbox(0.5, 0.4, 0.5, -0.45, 0.7, 0.62), p, yaw);
      put(goods[i % goods.length], new THREE.SphereGeometry(0.32, 8, 6).scale(1, 1.2, 0.9).translate(0.5, 0.36, -0.6), p, yaw);
    }
  }
  const add = (parts: THREE.BufferGeometry[], mat: THREE.Material) => {
    if (!parts.length) return;
    const mesh = new THREE.Mesh(merged(parts), mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(wood, mats.wood);
  add(canvas, mats.canvas);
  goods.forEach((g, i) => add(g, mats.goods[i]));

  // --- Townsfolk ---------------------------------------------------------------------------------
  const people = withStalls ? await loadPeople() : []; // c.1900: the crowd (people.ts) fills the square instead
  const mixers: THREE.AnimationMixer[] = [];
  const walkers: { obj: THREE.Object3D; a: THREE.Vector3; b: THREE.Vector3; t: number; dir: number; speed: number }[] = [];
  const figures = (people.length ? standAt : []).map((s, i) => ({ ...s, look: people[i % people.length] }));
  // A few more at the booth and on the promenade
  for (const [x, z, yaw] of [[-2, -18, -0.5], [-3, -25, 0.4], [14, -30, 2.2], [22, -31, -1.9]] as const) {
    const p = toWorld(x, z);
    if (!blocked([p])) figures.push({ p, yaw: worldYaw(yaw), look: people[figures.length % Math.max(1, people.length)] });
  }
  for (const [i, fg] of figures.entries()) {
    if (!fg.look) break;
    const obj = fg.look.spawn(i);
    obj.position.copy(fg.p);
    obj.rotation.y = fg.yaw;
    group.add(obj);
    mixers.push(fg.look.play(obj, 'idle', i));
  }
  // Strollers: back and forth along open stretches
  for (const [i, [x0, z0, x1, z1]] of ([[12, -14, 12, -95], [25, -100, 25, -20], [-9, -35, -9, -85], [50, -20, 50, -70]] as const).entries()) {
    if (!people.length) break;
    const a = toWorld(x0, z0), b = toWorld(x1, z1);
    if (blocked([a, b, a.clone().lerp(b, 0.5)])) continue;
    const look = people[(i + 1) % people.length];
    const obj = look.spawn(100 + i);
    group.add(obj);
    mixers.push(look.play(obj, 'walk', i));
    walkers.push({ obj, a, b, t: (i * 0.37) % 1, dir: 1, speed: 1.1 + 0.15 * i });
  }

  const tmp = new THREE.Vector3();
  return {
    group, segments,
    update(dt: number) {
      for (const mx of mixers) mx.update(dt);
      for (const w of walkers) {
        const len = w.a.distanceTo(w.b);
        w.t += (w.dir * w.speed * dt) / len;
        if (w.t > 1 || w.t < 0) { w.dir *= -1; w.t = THREE.MathUtils.clamp(w.t, 0, 1); }
        tmp.lerpVectors(w.a, w.b, w.t);
        tmp.y = terrain.heightAt(tmp.x, tmp.z);
        w.obj.position.copy(tmp);
        const d = w.dir > 0 ? tmp.copy(w.b).sub(w.a) : tmp.copy(w.a).sub(w.b);
        w.obj.rotation.y = Math.atan2(d.x, d.z); // models face +Z
      }
    },
  };
}

function inRing(x: number, z: number, r: [number, number][]): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// --- Figure library ----------------------------------------------------------------------------

interface Look {
  spawn(seed: number): THREE.Object3D;
  play(obj: THREE.Object3D, clip: 'idle' | 'walk', seed: number): THREE.AnimationMixer;
}

// Market folk: working clothes (jacket and cap, apron; kerchief and shawl), period cloth colours.
const CLOTH = [
  { coat: '#4b3a2a', lower: '#3b352e', linen: '#e8e2d4', hat: '#2a2622', leather: '#1a1512', accent: '#8a8270', lining: '#161411' },
  { coat: '#2f3a44', lower: '#5a5146', linen: '#efe9dc', hat: '#1c2026', leather: '#161311', accent: '#6b5a48', lining: '#111318' },
  { coat: '#5c4632', lower: '#2e2a26', linen: '#ddd5c4', hat: '#6a4a36', leather: '#1c1611', accent: '#7a6a52', lining: '#1a1510' },
  { coat: '#3d4a55', lower: '#3d4a55', linen: '#e8dfcf', hat: '#5a3a2a', leather: '#18120f', accent: '#5a4e40', lining: '#121410' },
];

/** The townsfolk figures (folk.ts), dressed for the market. */
async function loadPeople(): Promise<Look[]> {
  try {
    const folk = await loadFolk();
    const outfits: Outfit[] = [
      { sex: 'm', coat: 'jacket', hat: 'cap', beard: 'moustache', hair: 'buzzed', apron: true },
      { sex: 'f', hat: 'scarf', wrap: 'shawl', apron: true },
      { sex: 'm', coat: 'great', hat: 'felt', beard: 'full', hair: 'parted' },
      { sex: 'f', hat: 'bonnet', wrap: 'none', apron: true },
    ];
    return outfits.map((o, k) => {
      const F = o.sex === 'm' ? folk.m : folk.f;
      const geo = dress(F, o);
      return {
        spawn(seed) {
          const c = CLOTH[(seed + k) % CLOTH.length];
          const mat = figureMaterial(F, { ...c, skin: '#fff4ec', hair: ['#3b2a1d', '#5a4128', '#2a1f16'][seed % 3], brolly: '#161616', wood: '#3a2a1e' }, { exposed: 1, paint: geo.paint, outfit: o, pattern: [o.hat === 'scarf' ? 2 : 0, o.wrap === 'shawl' ? 1 : 0] });
          const fig = figure(F, geo, mat);
          fig.root.scale.setScalar(((o.sex === 'm' ? 1.72 : 1.62) / F.height) * (0.94 + 0.1 * ((seed * 7) % 5) / 4));
          const wrap = new THREE.Group();
          wrap.add(fig.root);
          return wrap;
        },
        play(obj, clip, seed) {
          const mixer = new THREE.AnimationMixer(obj.children[0]);
          const c = F.clips[clip === 'idle' ? (seed % 2 ? 'Idle_Talking_Loop' : 'Idle_Loop') : 'Walk_Loop'];
          const a = mixer.clipAction(c);
          a.time = (seed * 0.61) % c.duration;
          a.timeScale = clip === 'walk' ? 0.85 : 0.9 + 0.2 * ((seed % 3) / 2);
          a.play();
          return mixer;
        },
      };
    });
  } catch (e) {
    console.warn('townsfolk', e);
    return [];
  }
}
