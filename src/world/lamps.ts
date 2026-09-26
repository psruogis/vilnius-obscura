import * as THREE from 'three';

/**
 * Gas street lamps: the garden's lamp posts and lanterns on iron brackets along the house fronts.
 * Each lamp is lit or dark on its own (one instanced mesh; the instance colour drives the glow), so a
 * lamplighter can go round lighting them one by one, as the lamplighters of c.1900 did with a long pole.
 * The nearest lit lamps cast real light (a fixed pool of point lights, so shaders never recompile).
 */
export interface LampSpot { pos: THREE.Vector3; ground: THREE.Vector2 }

const POOL = 8;

export class StreetLamps {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly lit: Float32Array;
  private readonly target: Float32Array;
  private readonly flicker: Float32Array;
  private readonly lights: THREE.PointLight[] = [];
  private readonly col = new THREE.Color();
  private t = 0; private nextAssign = 0;

  constructor(readonly spots: LampSpot[], initiallyLit: boolean, private readonly brightness: number) {
    this.group.name = 'lamps';
    const geo = new THREE.CylinderGeometry(0.15, 0.1, 0.4, 6);
    const mat = new THREE.MeshStandardMaterial({ color: '#fff2d6', emissive: '#ffc070', emissiveIntensity: 2.6, roughness: 0.2, metalness: 0 });
    mat.onBeforeCompile = shader => {
      // the instance colour dims both the glass and its glow
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance *= vColor;\n#endif');
    };
    mat.customProgramCacheKey = () => 'street-lamp-glass';
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
    this.mesh.count = spots.length;
    const m = new THREE.Matrix4();
    spots.forEach((s, i) => this.mesh.setMatrixAt(i, m.makeTranslation(s.pos.x, s.pos.y, s.pos.z)));
    this.lit = new Float32Array(spots.length).fill(initiallyLit ? 1 : 0);
    this.target = new Float32Array(spots.length).fill(initiallyLit ? 1 : 0);
    this.flicker = new Float32Array(spots.length);
    for (let i = 0; i < spots.length; i++) this.paint(i);
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    for (let k = 0; k < POOL; k++) {
      const l = new THREE.PointLight('#ffbf73', 0, 16, 2);
      l.castShadow = false;
      this.lights.push(l);
      this.group.add(l);
    }
  }

  isLit(i: number): boolean { return this.target[i] > 0.5; }
  light(i: number): void { this.target[i] = 1; this.flicker[i] = 1.6; }
  putOut(i: number): void { this.target[i] = 0; }

  private paint(i: number): void {
    const v = 0.07 + 0.93 * this.lit[i];
    this.mesh.setColorAt(i, this.col.setRGB(v, v * 0.97, v * 0.92));
  }

  update(dt: number, cam: THREE.Vector3): void {
    this.t += dt;
    let dirty = false;
    for (let i = 0; i < this.spots.length; i++) {
      const goal = this.target[i];
      if (this.lit[i] !== goal || this.flicker[i] > 0) {
        // a newly lit mantle flares and flickers before settling
        this.flicker[i] = Math.max(0, this.flicker[i] - dt);
        const f = this.flicker[i] > 0 ? 0.75 + 0.25 * Math.sin(this.t * 37 + i) * Math.sin(this.t * 13 + i * 3) : 1;
        this.lit[i] += (goal - this.lit[i]) * (1 - Math.exp(-3 * dt));
        if (Math.abs(this.lit[i] - goal) < 0.01) this.lit[i] = goal;
        const keep = this.lit[i];
        this.lit[i] = keep * f;
        this.paint(i);
        this.lit[i] = keep;
        dirty = true;
      }
    }
    if (dirty && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    // light pools: the nearest lit lamps to the camera
    this.nextAssign -= dt;
    if (this.nextAssign <= 0) {
      this.nextAssign = 0.4;
      const cand = this.spots.map((s, i) => ({ i, d: s.pos.distanceToSquared(cam) })).filter(c => this.lit[c.i] > 0.05 && c.d < 70 * 70).sort((a, b) => a.d - b.d);
      this.lights.forEach((l, k) => {
        const c = cand[k];
        if (!c) { l.intensity = 0; l.userData.i = -1; return; }
        l.position.copy(this.spots[c.i].pos).y -= 0.15;
        l.userData.i = c.i;
      });
    }
    for (const l of this.lights) {
      const i = l.userData.i ?? -1;
      l.intensity = i >= 0 ? this.lit[i] * this.brightness : 0;
    }
  }
}
