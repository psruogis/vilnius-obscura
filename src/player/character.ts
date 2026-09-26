import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Low-poly models ship flat-shaded; weld shared vertices and recompute normals for smooth, rounded forms. */
export function smoothShade(root: THREE.Object3D): void {
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry.clone();
    g.deleteAttribute('normal');
    const welded = mergeVertices(g, 1e-4);
    welded.computeVertexNormals();
    mesh.geometry = welded;
  });
}

/**
 * The walker's body: a CC0 Quaternius figure (Poly Pizza) recoloured in dull c.1800 cloth colours,
 * blending idle / walk / run by ground speed.
 */

export interface CharacterSpec {
  url: string;
  height: number;                      // metres, feet to crown
  hide: string[];                      // node names to hide (props that don't belong in 1800)
  palette: Record<string, string>;     // material name -> sRGB colour
  /** Pull the parts using these materials towards the spine (softens fantasy shoulder guards into a cape). */
  soften?: { materials: string[]; xScale: number; yDrop: number }; // yDrop: fraction of the part's height lost at its top
}

// Plain townsman: dark brown coat, fawn waistcoat, grey-brown breeches, black shoes, dull brass.
export const TOWNSMAN: CharacterSpec = {
  url: 'assets/char/adventurer.glb',
  height: 1.74,
  hide: ['Backpack'],
  palette: {
    Green: '#4a3b2d', LightGreen: '#8a7658', Brown: '#3a2c20', Brown2: '#2a2019', Grey: '#5d5852',
    Black: '#1b1917', Gold: '#7d6c4e', Hair: '#3b2a1d',
  },
};

// Hooded traveller: brown wool hood and coat; the model's shoulder guards, dyed to match, read as the
// shoulder cape of a c.1800 caped greatcoat. Breeches and boots.
export const TRAVELLER: CharacterSpec = {
  url: 'assets/char/hooded_adventurer.glb',
  height: 1.72,
  hide: ['Sword'],
  soften: { materials: ['Metal', 'Metal_Dark'], xScale: 0.8, yDrop: 0.3 },
  palette: {
    LightBrown: '#5a4634', DarkBrown: '#34271d', Brown2: '#4a3a2c', Brown: '#2a1f17',
    White: '#3a2a1e', // the model's hair
    Black: '#1b1917', Metal: '#4a3b2d', Metal_Dark: '#3b2f24', Gold: '#6d5f47',
  },
};

/** Scales the vertices drawn with the given materials towards the model's centre line, in bind pose. */
function softenParts(mesh: THREE.Mesh, mats: THREE.Material[], opt: NonNullable<CharacterSpec['soften']>): void {
  const g = mesh.geometry;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const index = g.getIndex();
  const hit = new Set<number>();
  const groups = g.groups.length ? g.groups : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }];
  for (const grp of groups) {
    const m = mats[grp.materialIndex ?? 0];
    if (!m || !opt.materials.includes(m.name)) continue;
    for (let i = grp.start; i < grp.start + grp.count; i++) hit.add(index ? index.getX(i) : i);
  }
  if (!hit.size) return;
  let yMax = -Infinity, yMin = Infinity;
  for (const v of hit) { yMax = Math.max(yMax, pos.getY(v)); yMin = Math.min(yMin, pos.getY(v)); }
  const span = Math.max(1e-6, yMax - yMin);
  for (const v of hit) {
    pos.setX(v, pos.getX(v) * opt.xScale);
    pos.setY(v, pos.getY(v) - opt.yDrop * span * ((pos.getY(v) - yMin) / span)); // flatten the raised tips
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
}

/** What the animation needs from the walker each frame. */
export interface Motion { speed: number; angularVelocity: number; forwardAccel: number; facing: number; lookYaw: number; lookPitch: number }

interface Gait { action: THREE.AnimationAction; duration: number; cycleDist: number; offset: number }

export class Character {
  readonly object = new THREE.Group();
  private readonly lean = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private idle: THREE.AnimationAction;
  private idleAlt: THREE.AnimationAction | null;
  private walk: Gait;
  private run: Gait;
  private phase = 0;
  private w = { idle: 1, walk: 0, run: 0, alt: 0 };
  private bank = 0; private pitchLean = 0; private headYaw = 0; private headPitch = 0;
  private idleTimer = 8; private altOn = false;
  private readonly neck: THREE.Object3D | null; private readonly head: THREE.Object3D | null;
  private readonly footL: THREE.Object3D | null; private readonly footR: THREE.Object3D | null;
  private footDown = [false, false]; private footMin = [Infinity, Infinity];
  /** Called when a foot touches the ground while moving (0 = left, 1 = right), with the speed. */
  onStep: ((foot: number, speed: number) => void) | null = null;

  private constructor(private readonly root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    const find = (name: string) => clips.find(k => k.name === name || k.name.endsWith(`|${name}`)) ?? null;
    const need = (name: string) => { const c = find(name); if (!c) throw new Error(`clip ${name} missing`); return c; };
    this.lean.add(root);
    this.object.add(this.lean);
    this.mixer = new THREE.AnimationMixer(root);
    this.idle = this.mixer.clipAction(need('Idle'));
    const alt = find('Idle_Neutral');
    this.idleAlt = alt ? this.mixer.clipAction(alt) : null;
    const bone = (n: string) => root.getObjectByName(n) ?? root.getObjectByName(n.replace('.', '')) ?? null;
    this.neck = bone('Neck'); this.head = bone('Head');
    this.footL = bone('LowerLeg.L_end') ?? bone('LowerLegL_end'); this.footR = bone('LowerLeg.R_end') ?? bone('LowerLegR_end');
    this.walk = this.gait(need('Walk'));
    this.run = this.gait(need('Run'));
    for (const a of [this.idle, this.idleAlt, this.walk.action, this.run.action]) { if (!a) continue; a.play(); a.setEffectiveWeight(0); }
    this.idle.setEffectiveWeight(1);
    this.walk.action.timeScale = 0; this.run.action.timeScale = 0;   // their time is driven by the shared stride phase
  }

  /**
   * Measures a locomotion clip: how far the body travels per cycle (from the planted foot sliding back
   * in the in-place animation) and when the left foot lands, so walk and run can share one phase.
   */
  private gait(clip: THREE.AnimationClip): Gait {
    const action = this.mixer.clipAction(clip);
    const foot = this.footL, N = 60, dur = clip.duration;
    let cycleDist = clip.name.includes('Run') ? 2.6 : 1.45, offset = 0;
    if (foot) {
      const probe = new THREE.AnimationMixer(this.root);
      const pa = probe.clipAction(clip); pa.play();
      const ys: number[] = [], zs: number[] = [];
      const v = new THREE.Vector3();
      for (let i = 0; i <= N; i++) {
        probe.setTime((i / N) * dur);
        this.root.updateMatrixWorld(true);
        foot.getWorldPosition(v);
        this.object.worldToLocal(v);
        ys.push(v.y); zs.push(v.z);
      }
      probe.stopAllAction(); probe.uncacheRoot(this.root);
      const yMin = Math.min(...ys);
      let dz = 0, n = 0, land = -1;
      for (let i = 0; i < N; i++) {
        if (ys[i] < yMin + 0.03 && ys[i + 1] < yMin + 0.03) { dz += Math.abs(zs[i + 1] - zs[i]); n++; if (land < 0 && (i === 0 || ys[i - 1] >= yMin + 0.03)) land = i; }
      }
      if (n > 3) {
        const stanceSpeed = (dz / n) / (dur / N);   // m/s the planted foot slides back = ground speed
        cycleDist = THREE.MathUtils.clamp(stanceSpeed * dur, 0.6, 4);
      }
      offset = land >= 0 ? land / N : 0;
    }
    return { action, duration: dur, cycleDist, offset };
  }

  static async load(spec: CharacterSpec): Promise<Character> {
    const gltf = await new GLTFLoader().loadAsync(spec.url);
    const root = gltf.scene;
    smoothShade(root);
    for (const name of spec.hide) {
      const n = root.getObjectByName(name);
      if (n) n.visible = false;
    }
    root.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // skinned bounds don't follow the animation
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (spec.soften) softenParts(mesh, mats, spec.soften);
      for (const m of mats as THREE.MeshStandardMaterial[]) {
        const c = spec.palette[m.name];
        if (c) m.color.set(c);
        m.roughness = 0.9;
        m.metalness = m.name === 'Gold' ? 0.4 : 0; // the 'Metal' parts are dyed wool now
      }
    });
    // Scale to the wanted height, feet on the ground, facing -Z (the models face +Z).
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const s = spec.height / (box.max.y - box.min.y);
    root.scale.setScalar(s);
    root.position.y = -box.min.y * s;
    root.rotation.y = Math.PI;
    return new Character(root, gltf.animations);
  }

  /** Blend space by speed with phase-synced, stride-matched walk/run; leaning; head look; footsteps. */
  update(dt: number, m: Motion): void {
    const s = m.speed;
    const wWalk = this.walk.cycleDist / this.walk.duration, wRun = this.run.cycleDist / this.run.duration;   // natural speeds
    const idleT = 1 - THREE.MathUtils.smoothstep(s, 0.04, 0.45);
    const runT = THREE.MathUtils.smoothstep(s, wWalk * 1.05, Math.max(wWalk * 1.1, wRun * 0.85));
    const k = 1 - Math.exp(-14 * dt);
    this.w.idle += (idleT - this.w.idle) * k;
    this.w.run += ((1 - idleT) * runT - this.w.run) * k;
    this.w.walk += ((1 - idleT) * (1 - runT) - this.w.walk) * k;
    // idle variation: now and then settle into the other idle
    if (idleT > 0.9) { this.idleTimer -= dt; if (this.idleTimer <= 0) { this.altOn = !this.altOn; this.idleTimer = this.altOn ? 5 + Math.random() * 4 : 9 + Math.random() * 8; } }
    else { this.altOn = false; this.idleTimer = 8; }
    this.w.alt += ((this.altOn && this.idleAlt ? 1 : 0) - this.w.alt) * (1 - Math.exp(-2 * dt));
    this.idle.setEffectiveWeight(this.w.idle * (1 - this.w.alt));
    this.idleAlt?.setEffectiveWeight(this.w.idle * this.w.alt);
    this.walk.action.setEffectiveWeight(this.w.walk);
    this.run.action.setEffectiveWeight(this.w.run);
    // one stride phase for both gaits; it advances by distance covered, so the feet stay planted
    const rw = this.w.run / Math.max(1e-3, this.w.run + this.w.walk);
    const cycle = THREE.MathUtils.lerp(this.walk.cycleDist, this.run.cycleDist, rw);
    this.phase = (this.phase + (s * dt) / cycle) % 1;
    this.walk.action.time = ((this.phase + this.walk.offset) % 1) * this.walk.duration;
    this.run.action.time = ((this.phase + this.run.offset) % 1) * this.run.duration;
    this.mixer.update(dt);

    // lean into turns and into starting and stopping
    const bankT = THREE.MathUtils.clamp(m.angularVelocity * s * 0.05, -0.2, 0.2);
    const pitchT = THREE.MathUtils.clamp(m.forwardAccel * 0.02 + (s / Math.max(1, wRun)) * 0.07, -0.08, 0.14);
    this.bank += (bankT - this.bank) * (1 - Math.exp(-7 * dt));
    this.pitchLean += (pitchT - this.pitchLean) * (1 - Math.exp(-6 * dt));
    this.lean.rotation.set(-this.pitchLean, 0, this.bank);

    // head (and a little neck) turn towards where the camera looks, within a natural range
    let off = m.lookYaw - m.facing;
    off = Math.atan2(Math.sin(off), Math.cos(off));
    const yawT = Math.abs(off) > 2.3 ? 0 : THREE.MathUtils.clamp(off, -1.1, 1.1);   // don't twist to look behind
    const pitchH = THREE.MathUtils.clamp(-(m.lookPitch - 0.18) * 0.5, -0.35, 0.25);
    this.headYaw += (yawT - this.headYaw) * (1 - Math.exp(-5 * dt));
    this.headPitch += (pitchH - this.headPitch) * (1 - Math.exp(-5 * dt));
    this.turnBone(this.neck, this.headYaw * 0.35, this.headPitch * 0.3);
    this.turnBone(this.head, this.headYaw * 0.65, this.headPitch * 0.7);

    // footsteps: a foot landing while moving
    if (this.onStep && s > 0.35) {
      [this.footL, this.footR].forEach((f, i) => {
        if (!f) return;
        f.getWorldPosition(this.tmp); this.object.worldToLocal(this.tmp);
        this.footMin[i] = Math.min(this.footMin[i] + dt * 0.05, this.tmp.y);
        const down = this.tmp.y < this.footMin[i] + 0.04;
        if (down && !this.footDown[i]) this.onStep!(i, s);
        this.footDown[i] = down;
      });
    }
  }

  private readonly tmp = new THREE.Vector3();
  private readonly qa = new THREE.Quaternion(); private readonly qb = new THREE.Quaternion(); private readonly qp = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0); private readonly side = new THREE.Vector3();

  /** Adds a world-space turn (yaw about up, pitch about the body's side axis) on top of the animated pose. */
  private turnBone(b: THREE.Object3D | null, yaw: number, pitch: number): void {
    if (!b) return;
    b.parent?.updateMatrixWorld(true);
    this.object.getWorldQuaternion(this.qp);
    this.side.set(1, 0, 0).applyQuaternion(this.qp);
    this.qa.setFromAxisAngle(this.up, yaw).multiply(this.qb.setFromAxisAngle(this.side, pitch));
    b.getWorldQuaternion(this.qb);
    this.qb.premultiply(this.qa);
    if (b.parent) { b.parent.getWorldQuaternion(this.qp); this.qb.premultiply(this.qp.invert()); }
    b.quaternion.copy(this.qb);
    b.updateMatrixWorld(true);
  }
}
