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
    uWarm: { value: new THREE.Vector3(1.05, 1.0, 0.9) },
    uCool: { value: new THREE.Vector3(0.98, 0.97, 0.98) },
    uSat: { value: 0.96 },
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

// Oil-painting treatment after the period views: a Kuwahara filter flattens detail into brush-sized patches
// while keeping edges, a faint canvas weave shows through, and an aged-varnish tone warms the image.
const PaintShader = {
  name: 'PaintShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
    uRadius: { value: 3 },
    uMix: { value: 0.5 },
    uCanvas: { value: 0.035 },
    uVarnish: { value: 0.55 },
  },
  vertexShader: GradeShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    uniform float uRadius, uMix, uCanvas, uVarnish;
    varying vec2 vUv;
    float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
    void main() {
      vec3 orig = texture2D(tDiffuse, vUv).rgb;
      // Kuwahara: pick the calmest of four overlapping quadrants
      vec3 m[4]; vec3 s[4];
      for (int k = 0; k < 4; k++) { m[k] = vec3(0.0); s[k] = vec3(0.0); }
      const int R = 3;
      float n = float((R + 1) * (R + 1));
      for (int j = 0; j <= R; j++) for (int i = 0; i <= R; i++) {
        vec2 o = vec2(float(i), float(j)) * uTexel * (uRadius / 3.0);
        vec3 c0 = texture2D(tDiffuse, vUv + vec2(-o.x, -o.y)).rgb; m[0] += c0; s[0] += c0 * c0;
        vec3 c1 = texture2D(tDiffuse, vUv + vec2( o.x, -o.y)).rgb; m[1] += c1; s[1] += c1 * c1;
        vec3 c2 = texture2D(tDiffuse, vUv + vec2( o.x,  o.y)).rgb; m[2] += c2; s[2] += c2 * c2;
        vec3 c3 = texture2D(tDiffuse, vUv + vec2(-o.x,  o.y)).rgb; m[3] += c3; s[3] += c3 * c3;
      }
      vec3 best = orig; float bestV = 1e9;
      for (int k = 0; k < 4; k++) {
        vec3 mu = m[k] / n;
        vec3 v = abs(s[k] / n - mu * mu);
        float vs = v.r + v.g + v.b;
        if (vs < bestV) { bestV = vs; best = mu; }
      }
      vec3 c = mix(orig, best, uMix);
      // canvas weave
      vec2 px = vUv / uTexel;
      float weave = (h21(floor(px * 0.5)) - 0.5) * 0.7 + (h21(floor(px * 0.125) + 17.0) - 0.5) * 0.3; // irregular canvas tooth, no regular pattern
      c *= 1.0 + uCanvas * weave;
      // aged varnish: warm, slightly yellowed highlights, softened blacks
      c = mix(c, c * vec3(1.05, 1.0, 0.86), uVarnish);
      c = c * 0.93 + vec3(0.035, 0.028, 0.018);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Post {
  private composer: EffectComposer;
  readonly gtao: GTAOPass;
  readonly bloom: UnrealBloomPass;
  private grade: ShaderPass;
  readonly paint: ShaderPass;
  enabled = true;

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, overlay?: THREE.Scene) {
    const w = window.innerWidth, h = window.innerHeight;
    // One depth buffer shared by both ping-pong targets: the AO pass reads the main render's depth and
    // rebuilds normals from it, instead of drawing the whole scene again.
    const depth = new THREE.DepthTexture(w, h);
    const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0, depthTexture: depth });
    this.composer = new EffectComposer(renderer, target);
    this.composer.renderTarget2.depthTexture = depth;
    this.composer.addPass(new RenderPass(scene, camera));

    this.gtao = new GTAOPass(scene, camera, w, h);
    // (passing depthTexture to the constructor trips a three.js r186 bug in setGBuffer; switching afterwards works)
    this.gtao.setGBuffer(depth);
    this.gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 1.6, scale: 1.15, samples: 16, distanceFallOff: 1.0 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    this.gtao.blendIntensity = 0.9;
    this.composer.addPass(this.gtao);

    // Bloom samples the linear HDR image before tone mapping: only real highlights (sun glints, sky) pass.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.12, 0.4, 6.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.paint = new ShaderPass(PaintShader);
    this.composer.addPass(this.paint);
    if (overlay) {
      // Drawn after the paint filter (which would smooth thin rain streaks away), tested against the scene depth
      const over = new RenderPass(overlay, camera);
      over.clear = false;
      over.clearDepth = false;
      this.composer.addPass(over);
    }
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new SMAAPass());
    // Full-screen passes must not touch the shared depth buffer: the rain is depth-tested against the scene.
    const calm = (m: unknown) => { const mm = m as THREE.Material; if (mm && mm.isMaterial) { mm.depthTest = false; mm.depthWrite = false; } };
    for (const pass of this.composer.passes) {
      if (pass instanceof RenderPass) continue;
      for (const v of Object.values(pass as unknown as Record<string, unknown>)) {
        calm(v);
        const q = v as { material?: unknown } | null;
        if (q && typeof q === 'object' && 'material' in q) calm(q.material);
      }
    }
    renderer.setPixelRatio(this.scale);
    this.setSize(w, h);

    window.addEventListener('keydown', e => {
      if (e.code === 'KeyP') this.enabled = !this.enabled;
      if (e.code === 'KeyO') this.paint.enabled = !this.paint.enabled;
    });
  }

  setSize(w: number, h: number): void {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.grade.uniforms.uAspect.value = w / h;
    const pr = this.renderer.getPixelRatio();
    this.paint.uniforms.uTexel.value.set(1 / (w * pr), 1 / (h * pr));
    this.paint.uniforms.uRadius.value = 1.7 * pr; // brush size stays the same on screen at any resolution
  }

  // Dynamic resolution: keep the frame rate near 60 by trading pixel density (0.75x to 2x).
  private acc = 0; private frames = 0;
  private scale = Math.min(window.devicePixelRatio, 1.5);

  /** Pins the pixel ratio (screenshots, benchmarks); null returns to dynamic resolution. */
  fixedScale: number | null = null;
  setFixedScale(s: number | null): void {
    this.fixedScale = s;
    if (s !== null && s !== this.scale) { this.scale = s; this.renderer.setPixelRatio(s); this.setSize(window.innerWidth, window.innerHeight); }
  }

  render(dt: number): void {
    if (this.enabled) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
    if (dt <= 0 || this.fixedScale !== null) return;
    this.acc += dt; this.frames++;
    if (this.acc < 1.5) return;
    const fps = this.frames / this.acc;
    this.acc = 0; this.frames = 0;
    const max = Math.min(window.devicePixelRatio, 2);
    const next = fps < 48 ? Math.max(0.75, this.scale - 0.25) : fps > 58 && this.scale < max ? Math.min(max, this.scale + 0.125) : this.scale;
    if (next !== this.scale) {
      this.scale = next;
      this.renderer.setPixelRatio(next);
      this.setSize(window.innerWidth, window.innerHeight);
    }
  }

  get pixelRatio(): number { return this.scale; }
}
