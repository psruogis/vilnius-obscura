import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadFolk, dress, figure, figureMaterial, measureGait, type Outfit, type Palette } from '../world/folk';

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
 * The walker's body: one of the townsfolk (Quaternius' CC0 Universal Base Characters and Animation
 * Library, dressed in folk.ts), blending idle / walk / jog by ground speed with stride-matched feet.
 * Out in the rain without an umbrella: his hat and shoulders darken and shine as they soak.
 */

export interface CharacterSpec {
  outfit: Outfit;
  palette: Palette;
  height: number;                                             // metres, feet to crown
  clips: { idle: string; alt?: string; walk: string; run: string };
}

// A traveller come to town: a caped greatcoat (the cape for the rain), bowler, full beard.
export const TRAVELLER: CharacterSpec = {
  outfit: { sex: 'm', coat: 'caped', hat: 'bowler', beard: 'full', hair: 'parted' },
  palette: {
    skin: '#fff4ec', hair: '#3b2a1d', coat: '#3a3128', lower: '#2c2824', linen: '#e8e2d4', hat: '#1a1714', leather: '#17120e',
    accent: '#4a3e30', lining: '#1a1512', brolly: '#161616', wood: '#3a2a1e',
  },
  height: 1.76,
  clips: { idle: 'Idle_Loop', alt: 'Idle_FoldArms_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop' },
};

// A townsman: black frock coat, top hat, moustache; the formal walk.
export const TOWNSMAN: CharacterSpec = {
  outfit: { sex: 'm', coat: 'frock', hat: 'top', beard: 'moustache', hair: 'parted' },
  palette: {
    skin: '#fff6f0', hair: '#2e241b', coat: '#1d1c1b', lower: '#34312d', linen: '#ece7da', hat: '#121110', leather: '#141210',
    accent: '#3a3228', lining: '#0e0d0c', brolly: '#161616', wood: '#3a2a1e',
  },
  height: 1.76,
  clips: { idle: 'Idle_Loop', alt: 'Idle_FoldArms_Loop', walk: 'Walk_Formal_Loop', run: 'Jog_Fwd_Loop' },
};

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

  private constructor(private readonly root: THREE.Object3D, clips: Record<string, THREE.AnimationClip>, spec: CharacterSpec) {
    const need = (name: string) => { const c = clips[name]; if (!c) throw new Error(`clip ${name} missing`); return c; };
    this.lean.add(root);
    this.object.add(this.lean);
    this.mixer = new THREE.AnimationMixer(root);
    this.idle = this.mixer.clipAction(need(spec.clips.idle));
    this.idleAlt = spec.clips.alt ? this.mixer.clipAction(need(spec.clips.alt)) : null;
    const bone = (n: string) => root.getObjectByName(n) ?? null;
    this.neck = bone('neck_01'); this.head = bone('Head');
    this.footL = bone('ball_l'); this.footR = bone('ball_r');
    this.walk = this.gait(need(spec.clips.walk), 1.45);
    this.run = this.gait(need(spec.clips.run), 2.6);
    for (const a of [this.idle, this.idleAlt, this.walk.action, this.run.action]) { if (!a) continue; a.play(); a.setEffectiveWeight(0); }
    this.idle.setEffectiveWeight(1);
    this.walk.action.timeScale = 0; this.run.action.timeScale = 0;   // their time is driven by the shared stride phase
  }

  /** Measures a locomotion clip, so walk and run can share one stride phase. */
  private gait(clip: THREE.AnimationClip, fallback: number): Gait {
    const action = this.mixer.clipAction(clip);
    const g = this.footL ? measureGait(this.root, this.object, clip, this.footL, fallback) : { cycleDist: fallback, offset: 0 };
    return { action, duration: clip.duration, ...g };
  }

  static async load(spec: CharacterSpec): Promise<Character> {
    const folk = await loadFolk();
    const F = folk[spec.outfit.sex];
    const geo = dress(F, spec.outfit);
    const fig = figure(F, geo, figureMaterial(F, spec.palette, { exposed: 1, paint: geo.paint, outfit: spec.outfit }));
    // to the wanted height, facing -Z (the figures face +Z)
    fig.root.scale.setScalar(spec.height / F.height);
    fig.root.rotation.y = Math.PI;
    return new Character(fig.root, F.clips, spec);
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
    const pitchH = THREE.MathUtils.clamp(-(m.lookPitch - 0.18) * 0.5, -0.25, 0.2);
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
