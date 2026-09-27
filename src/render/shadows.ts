import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';

/**
 * Cascaded sun shadows: crisp near the walker, still present on buildings 300 m away.
 * CSM replaces a material's onBeforeCompile, so ours are chained and each material keeps its own
 * program cache key (otherwise materials with different injected shaders could share one program).
 */
export class SunShadows {
  readonly csm: CSM;
  private done = new WeakSet<THREE.Material>();

  /** reach: how far the cascades go (m) and how many; the rain's mist hides everything past ~160 m. */
  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, sunDir: THREE.Vector3, color: THREE.ColorRepresentation, intensity: number, reach = { far: 320, cascades: 3 }) {
    this.csm = new CSM({
      camera, parent: scene,
      cascades: reach.cascades, maxFar: reach.far, mode: 'practical', practicalModeLambda: 0.75,
      shadowMapSize: 2048, shadowBias: -0.00025,
      lightDirection: sunDir.clone().negate(), lightIntensity: intensity,
      lightNear: 1, lightFar: 900, lightMargin: 150,
    });
    this.csm.fade = true;
    for (const l of this.csm.lights) {
      l.color.set(color);
      l.shadow.normalBias = 0.05;
    }
  }

  /** Makes every standard material under `root` receive the cascades. Safe to call repeatedly. */
  apply(root: THREE.Object3D): void {
    root.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.Material[]) {
        if (this.done.has(m) || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) continue;
        this.done.add(m);
        const own = m.onBeforeCompile;
        const ownKey = m.customProgramCacheKey();
        this.csm.setupMaterial(m);
        const csmHook = m.onBeforeCompile;
        m.onBeforeCompile = (shader, renderer) => { own.call(m, shader, renderer); csmHook.call(m, shader, renderer); };
        m.customProgramCacheKey = () => `${ownKey}|csm`;
        m.needsUpdate = true;
      }
    });
  }

  update(): void {
    this.csm.update();
  }

  resize(): void {
    this.csm.updateFrustums();
  }
}
