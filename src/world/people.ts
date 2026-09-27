import * as THREE from 'three';
import type { WallGrid } from './collision';
import type { Terrain } from './terrain';
import { twoBoneIK } from '../player/ik';
import { loadFolk, dress, figure, figureMaterial, measureGait, type FolkBody, type Outfit, type Palette, type MaleCoat, type MaleHat, type FemaleHat } from './folk';

/**
 * Townsfolk filling the square and streets as in the period views: strollers who walk between points
 * they can see, pause, and move on; small groups standing and talking. c.1900 dress after the
 * photographs and paintings of Vilnius: dark frock coats, greatcoats and caped coats, a worker's
 * jacket and cap, top hats, bowlers and soft felt hats; women in floor-length skirts with shawls,
 * short capes or aprons, big trimmed hats, bonnets and kerchiefs. In the rain many carry umbrellas.
 * Each figure is one skinned mesh and one draw (folk.ts), with three levels of detail by distance.
 */

// Cloth after the period views: near-black, bottle green, brown and grey wool; off-white linen.
const MEN: Omit<Palette, 'skin' | 'hair' | 'brolly' | 'wood'>[] = [
  { coat: '#1c1b1a', lower: '#2a2826', linen: '#e8e3d6', hat: '#121110', leather: '#161311', accent: '#2e2a25', lining: '#0e0d0c' },
  { coat: '#26221e', lower: '#3a3632', linen: '#efe9dc', hat: '#1a1816', leather: '#1a1512', accent: '#4a4034', lining: '#141210' },
  { coat: '#2e2a24', lower: '#23201d', linen: '#ddd5c4', hat: '#2a2622', leather: '#15120f', accent: '#5a4a38', lining: '#161411' },
  { coat: '#1f2428', lower: '#2c2c2a', linen: '#e2dccd', hat: '#161819', leather: '#141414', accent: '#34302a', lining: '#101214' },
  { coat: '#3a3026', lower: '#2e2a26', linen: '#f0ead8', hat: '#2a2520', leather: '#1c1611', accent: '#6a5a44', lining: '#1a1510' },
  { coat: '#232a22', lower: '#262420', linen: '#e8e2d2', hat: '#1c1c1a', leather: '#161410', accent: '#3a3a30', lining: '#101410' },
  { coat: '#3c3a36', lower: '#2a2826', linen: '#e4ddcc', hat: '#1e1d1b', leather: '#181614', accent: '#2a2622', lining: '#141312' },
];
const WOMEN: Omit<Palette, 'skin' | 'hair' | 'brolly' | 'wood'>[] = [
  { coat: '#1e1c1b', lower: '#1e1c1b', linen: '#ece6d8', hat: '#1a1817', leather: '#141210', accent: '#5a4e40', lining: '#121110' },
  { coat: '#2a2420', lower: '#2a2420', linen: '#3a3530', hat: '#221f1c', leather: '#161311', accent: '#6b5a48', lining: '#141210' },
  { coat: '#232830', lower: '#232830', linen: '#e2dccb', hat: '#1c2026', leather: '#141414', accent: '#3a3f4a', lining: '#111318' },
  { coat: '#3a2420', lower: '#2e201c', linen: '#e8dfcf', hat: '#2a2320', leather: '#18120f', accent: '#5a4e40', lining: '#1a1210' },
  { coat: '#26291f', lower: '#26291f', linen: '#d8cfbc', hat: '#2a2b24', leather: '#151510', accent: '#8a7a64', lining: '#121410' },
  { coat: '#4a4236', lower: '#3a342c', linen: '#efe9dc', hat: '#1e1c1a', leather: '#1a1612', accent: '#e8e2d2', lining: '#1a1814' },
  { coat: '#161616', lower: '#161616', linen: '#161616', hat: '#161616', leather: '#121212', accent: '#2a2828', lining: '#0e0e0e' },   // mourning
  { coat: '#3a3530', lower: '#2e2a26', linen: '#e8e2d2', hat: '#6a4a36', leather: '#1a1511', accent: '#7a6a52', lining: '#161411' },   // kerchief, market woman
];
const SKIN = ['#fff6f0', '#fff1e8', '#fbeee6', '#fff8f4', '#f6e6dc', '#fff3ea'];
const HAIR = ['#2b2118', '#4a3727', '#1f1a15', '#6a5238', '#3b2c20', '#2e241b', '#5a5450', '#8a8680', '#3a2a1d', '#7a5a38'];
const BROLLY = ['#141414', '#1a1a1c', '#1c2220', '#241c18', '#161a22'];

interface Person {
  root: THREE.Group; fig: ReturnType<typeof figure>; mixer: THREE.AnimationMixer;
  idle: THREE.AnimationAction; walk: THREE.AnimationAction; natural: number;   // walk speed at timeScale 1 (m/s, this figure's size)
  mode: 'stand' | 'walk' | 'pause';
  target: THREE.Vector2; speed: number; timer: number; yaw: number; wIdle: number; acc: number;
  job?: LampJob;
  hold?: { upper: THREE.Object3D; lower: THREE.Object3D; hand: THREE.Object3D; grip: THREE.Vector3; side: number };
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
  strollers: number; umbrellas: boolean;
  material?: THREE.Material; accessories?: THREE.Material;   // unused: each figure has its own palette material
}): Promise<Crowd> {
  const group = new THREE.Group();
  group.name = 'crowd';
  const people: Person[] = [];
  let folk: { m: FolkBody; f: FolkBody };
  try { folk = await loadFolk(); } catch (e) { console.warn('crowd', e); return { group, update: () => {}, count: 0, addLamplighter: () => {} }; }
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  // stride per body and clip, measured once on a probe figure
  const gaits = new Map<string, number>();
  const natural = (F: FolkBody, clip: string) => {
    const k = F.sex + clip;
    if (!gaits.has(k)) {
      const probe = figure(F, dress(F, { sex: F.sex, hat: F.sex === 'm' ? 'bowler' : 'toque', coat: 'frock' }), new THREE.MeshBasicMaterial());
      const frame = new THREE.Group(); frame.add(probe.root); frame.updateMatrixWorld(true);
      const g = measureGait(probe.root, frame, F.clips[clip], probe.bone('ball_l'), 1.4);
      gaits.set(k, g.cycleDist / F.clips[clip].duration);
    }
    return gaits.get(k)!;
  };

  const outfit = (female: boolean, lamplighter: boolean, umbrella: boolean): Outfit => {
    if (lamplighter) return { sex: 'm', coat: 'jacket', hat: 'cap', beard: 'moustache', hair: 'buzzed', pole: true };
    if (female) {
      const hat = pick<FemaleHat>(['brim', 'brim', 'toque', 'toque', 'bonnet', 'scarf', 'scarf']);
      const working = hat === 'scarf';
      return { sex: 'f', hat, wrap: working ? pick(['shawl', 'shawl', 'none'] as const) : pick(['cape', 'none', 'shawl', 'none'] as const), apron: working && rnd() < 0.6, umbrella };
    }
    const coat = pick<MaleCoat>(['frock', 'frock', 'great', 'great', 'caped', 'jacket', 'long']);
    const hat: MaleHat = coat === 'jacket' ? pick(['cap', 'flatcap'] as const) : coat === 'long' ? pick(['wide', 'cap'] as const) : pick(['top', 'bowler', 'bowler', 'felt'] as const);
    return {
      sex: 'm', coat, hat, beard: coat === 'long' ? 'full' : pick(['full', 'moustache', 'moustache', 'none'] as const), hair: coat === 'jacket' ? 'buzzed' : 'parted',
      stout: coat !== 'jacket' && rnd() < 0.25, apron: coat === 'jacket' && rnd() < 0.5, umbrella,
    };
  };

  const spawn = (x: number, z: number, mode: Person['mode'], yaw: number, lamplighter = false): Person | null => {
    const female = !lamplighter && rnd() < 0.45;
    const F = female ? folk.f : folk.m;
    const umbrella = !lamplighter && opts.umbrellas && rnd() < 0.5;
    const o = outfit(female, lamplighter, umbrella);
    const geo = dress(F, o);
    const cloth = pick(female ? WOMEN : MEN);
    const hairC = new THREE.Color(pick(HAIR));
    const pal: Palette = { ...cloth, skin: pick(SKIN), hair: `#${hairC.getHexString()}`, brolly: lamplighter ? '#ffcf7a' : pick(BROLLY), wood: '#3a2a1e' };
    // a little variety within a palette: the same cloth never quite matches
    const j = 0.88 + rnd() * 0.24;
    for (const k of ['coat', 'lower', 'accent'] as const) pal[k] = `#${new THREE.Color(pal[k]).multiplyScalar(j).getHexString()}`;
    const mat = figureMaterial(F, pal, { exposed: umbrella ? 0.12 : 1, paint: geo.paint, outfit: o });
    const fig = figure(F, geo, mat);
    // height from the rest pose (men ~1.72 m, women ~1.62 m), and build: a little broader or slighter
    const s = ((female ? 1.62 : 1.72) * (0.94 + rnd() * 0.1)) / F.height, build = 0.95 + rnd() * 0.1 + (o.stout ? 0.04 : 0);
    fig.root.scale.set(s * build, s, s * build);
    const root = new THREE.Group();
    root.add(fig.root);
    root.position.set(x, opts.terrain.heightAt(x, z), z);
    root.rotation.y = yaw;
    root.userData = { umbrella, lamplighter, female };
    group.add(root);
    const mixer = new THREE.AnimationMixer(fig.root);
    const talk = mode === 'stand' ? pick(['Idle_Talking_Loop', 'Idle_Talking_Loop', 'Idle_Talking_Loop', 'Idle_Loop', female ? 'Idle_Loop' : 'Idle_FoldArms_Loop', 'Yes']) : 'Idle_Loop';
    const walkClip = !female && !lamplighter && rnd() < 0.5 ? 'Walk_Formal_Loop' : 'Walk_Loop';
    const idle = mixer.clipAction(F.clips[talk]), walk = mixer.clipAction(F.clips[walkClip]);
    idle.play(); walk.play();
    idle.time = rnd() * idle.getClip().duration; walk.time = rnd() * walk.getClip().duration;
    const walking = mode === 'walk';
    idle.setEffectiveWeight(walking ? 0 : 1); walk.setEffectiveWeight(walking ? 1 : 0);
    idle.timeScale = 0.85 + rnd() * 0.3;
    const person: Person = {
      root, fig, mixer, idle, walk, natural: natural(F, walkClip) * s, mode, target: new THREE.Vector2(x, z),
      speed: (female ? 1.0 : 1.1) + rnd() * 0.3, timer: rnd() * 6, yaw, wIdle: walking ? 0 : 1, acc: 0,
    };
    if (geo.grip) person.hold = { upper: fig.bone('upperarm_r'), lower: fig.bone('lowerarm_r'), hand: fig.bone('hand_r'), grip: geo.grip, side: -1 };
    people.push(person);
    return person;
  };

  // Knots of 2-4 people facing each other
  for (const g of opts.groups) {
    const n = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.5, r = 0.75 + rnd() * 0.3;
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

  const tmp = new THREE.Vector2(), ikT = new THREE.Vector3(), ikP = new THREE.Vector3();
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
        p.fig.mesh.castShadow = dist < 45;
        // detail by distance (a little hysteresis so nobody flickers between levels)
        const lod = p.fig.lod;
        p.fig.setLod(dist < (lod === 0 ? 17 : 15) ? 0 : dist < (lod === 2 ? 42 : 45) ? 1 : 2);
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
            const step = p.speed * (1 - p.wIdle) * dt;
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
        // the feet keep pace with the ground: the walk clip runs at the speed actually walked
        p.walk.timeScale = (p.speed * (1 - p.wIdle) + 0.2 * p.wIdle) / p.natural;
        if (far) continue;
        // far figures animate at a lower rate
        p.acc += dt;
        if (p.acc < (dist < 25 ? 0 : dist < 60 ? 1 / 30 : 1 / 15)) continue;
        p.mixer.update(p.acc);
        p.acc = 0;
        if (p.hold && dist < 60) {
          // right hand on the umbrella shaft (or the lamplighter's pole)
          p.root.updateMatrixWorld(true);
          p.fig.root.localToWorld(ikT.copy(p.hold.grip));
          p.root.localToWorld(ikP.set(p.hold.side * 0.6, -0.5, -0.6)).sub(p.root.position);   // elbow out, down, back
          twoBoneIK(p.hold.upper, p.hold.lower, p.hold.hand, ikT, ikP);
        }
      }
    },
  };
}
