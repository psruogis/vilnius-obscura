import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { CSMShader } from 'three/examples/jsm/csm/CSMShader.js';

// three r186's cascaded-shadow lighting chunk leaves out the split-sum set-up of the standard chunk, so every
// material lit by the cascades had no specular at all: no sky in the glass or the wet roofs, no glint of the
// lamps. Restored here as three's own lights_fragment_begin does it.
const SPLIT_SUM = /* glsl */ `
#ifdef STANDARD
	float dotNVms = saturate( dot( geometryNormal, geometryViewDir ) );
	material.dfg = texture2D( dfgLUT, vec2( material.roughness, dotNVms ) ).rg;
	#if ( NUM_SUN_LIGHTS > 0 || NUM_DIR_LIGHTS > 0 || NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
		float EssMs = material.dfg.x + material.dfg.y;
		material.multiScatteringCompensation = 1.0 + material.specularColorBlended * ( 1.0 / EssMs - 1.0 );
	#endif
#endif
IncidentLight directLight;`;
if (!CSMShader.lights_fragment_begin.includes('material.dfg')) {
  CSMShader.lights_fragment_begin = CSMShader.lights_fragment_begin.replace('IncidentLight directLight;', SPLIT_SUM);
}

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
