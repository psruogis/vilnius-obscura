import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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

const WALK_NOMINAL = 1.5;  // m/s at which the walk clip looks right
const RUN_NOMINAL = 4.0;

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

export class Character {
  readonly object = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private idle: THREE.AnimationAction;
  private walk: THREE.AnimationAction;
  private run: THREE.AnimationAction;
  private w = { idle: 1, walk: 0, run: 0 };

  private constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    const find = (name: string) => {
      const c = clips.find(k => k.name === name || k.name.endsWith(`|${name}`));
      if (!c) throw new Error(`clip ${name} missing`);
      return c;
    };
    this.mixer = new THREE.AnimationMixer(root);
    this.idle = this.mixer.clipAction(find('Idle'));
    this.walk = this.mixer.clipAction(find('Walk'));
    this.run = this.mixer.clipAction(find('Run'));
    for (const a of [this.idle, this.walk, this.run]) { a.play(); a.setEffectiveWeight(0); }
    this.idle.setEffectiveWeight(1);
    this.object.add(root);
  }

  static async load(spec: CharacterSpec): Promise<Character> {
    const gltf = await new GLTFLoader().loadAsync(spec.url);
    const root = gltf.scene;
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

  /** Blend clips by ground speed (m/s) and match the stride to it. */
  update(dt: number, speed: number): void {
    const tIdle = speed < 0.15 ? 1 : 0;
    const runK = THREE.MathUtils.clamp((speed - 2.4) / 1.2, 0, 1);
    const tWalk = tIdle ? 0 : 1 - runK, tRun = tIdle ? 0 : runK;
    const k = 1 - Math.exp(-10 * dt);
    this.w.idle += (tIdle - this.w.idle) * k;
    this.w.walk += (tWalk - this.w.walk) * k;
    this.w.run += (tRun - this.w.run) * k;
    this.idle.setEffectiveWeight(this.w.idle);
    this.walk.setEffectiveWeight(this.w.walk);
    this.run.setEffectiveWeight(this.w.run);
    this.walk.timeScale = THREE.MathUtils.clamp(speed / WALK_NOMINAL, 0.6, 1.6);
    this.run.timeScale = THREE.MathUtils.clamp(speed / RUN_NOMINAL, 0.7, 1.3);
    this.mixer.update(dt);
  }
}
