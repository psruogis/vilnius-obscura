import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

/**
 * The image pipeline: scene -> ground-truth ambient occlusion (contact shadows in corners, reveals,
 * under eaves) -> a faint bloom on sunlit highlights -> filmic tone mapping -> colour grade and
 * vignette in the spirit of the period oils -> SMAA anti-aliasing.
 * P toggles the effects off and on (for comparison and slow machines).
 */

// Display-space grade: warm highlights, cooler shadows, gentle S-curve, a touch of saturation, vignette.
const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uWarm: { value: new THREE.Vector3(1.035, 1.0, 0.95) },
    uCool: { value: new THREE.Vector3(0.96, 0.99, 1.04) },
    uSat: { value: 1.08 },
    uContrast: { value: 1.06 },
    uVignette: { value: 0.28 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uWarm, uCool;
    uniform float uSat, uContrast, uVignette, uAspect;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      // split toning by luminance
      c.rgb *= mix(uCool, uWarm, smoothstep(0.15, 0.75, l));
      // contrast around mid grey, then saturation
      c.rgb = (c.rgb - 0.5) * uContrast + 0.5;
      l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      // vignette
      vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
      c.rgb *= 1.0 - uVignette * smoothstep(0.35, 1.05, length(p));
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a);
    }`,
};

export class Post {
  private composer: EffectComposer;
  readonly gtao: GTAOPass;
  readonly bloom: UnrealBloomPass;
  private grade: ShaderPass;
  enabled = true;

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    const w = window.innerWidth, h = window.innerHeight;
    const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));

    this.gtao = new GTAOPass(scene, camera, w, h);
    this.gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 1.6, scale: 1.15, samples: 16, distanceFallOff: 1.0 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    this.gtao.blendIntensity = 0.9;
    this.composer.addPass(this.gtao);

    // Bloom samples the linear HDR image before tone mapping: only real highlights (sun glints, sky) pass.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.12, 0.4, 6.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new SMAAPass());
    this.setSize(w, h);

    window.addEventListener('keydown', e => { if (e.code === 'KeyP') this.enabled = !this.enabled; });
  }

  setSize(w: number, h: number): void {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.grade.uniforms.uAspect.value = w / h;
  }

  render(dt: number): void {
    if (this.enabled) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
