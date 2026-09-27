import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { WET_GLSL, HEIGHT_FOG_GLSL, WET, RAIN_TIME, FLOW, SKY_MIRROR } from './weather';

/**
 * Screen-space reflections for the rain-soaked street, as in current games: puddles and running gutters
 * mirror the house fronts, lit shop windows, gas lamps and passers-by, broken by raindrop rings, while the
 * wet cobbles give a soft reflection drawn out into vertical streaks, the way lights smear on a wet road.
 *
 * No G-buffer. While this pass runs, the street shader (weather.ts, wet(…, 'ground')) writes its final
 * roughness into the alpha of the HDR image; every other opaque surface writes 1, and GTAO keeps alpha (it
 * multiplies by its own 1), so alpha < 0.75 reads "wet street, this rough". A semi-transparent surface drawn
 * over the street pushes the value toward 1, which only weakens the reflection there.
 *   1. trace, half resolution: view position from the shared depth texture; the water normal (level, rung by
 *      the same raindrop and running-water ripples as the street shader: WET_GLSL); a ray march in screen
 *      space (jittered steps, binary refinement, thickness test). Output: (hit − sky)·confidence, confidence,
 *      where "sky" is the environment map the street already reflects (so a hit replaces it, a miss keeps it)
 *      and confidence fades at the screen edges, for rays toward the camera and at the end of the ray.
 *   2. streaks, half resolution: rough stone's reflection is blurred, long vertically and short sideways.
 *   3. composite, full resolution: the street's own reflection weight (Fresnel at its roughness, less the mist
 *      between it and the eye) is worked out per pixel, so puddle edges stay crisp; alpha goes back to 1.
 * It runs after GTAO and before bloom, so reflected lamps bloom too. R toggles it (see post.ts).
 */

const STEPS = 32;

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Shared by the trace and the composite. (Built at run time: the height fog's GLSL exists only once
// installHeightFog has run.)
const COMMON = () => /* glsl */ `
  #include <cube_uv_reflection_fragment>
  uniform mat4 uInvProj, uCamWorld;
  uniform sampler2D tEnv;
  uniform float uEnvIntensity, uSkyMirror;
  ${HEIGHT_FOG_GLSL || 'float wt_heightFog(float a, float b, float c, float d) { return 0.0; }'}
  vec3 viewAt(vec2 uv, float d) { vec4 p = uInvProj * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
  uniform float uPuddle;
  // standing or running water, not damp stone
  float water(float rough) { return 1.0 - smoothstep(0.04, 0.2, rough); }
  // the view ray through a pixel, in world space: on level ground the view angle depends only on where the
  // pixel is on screen (no depth needed; the composite can't read the depth buffer it is drawing into)
  vec3 viewDir(vec2 uv) { return normalize(mat3(uCamWorld) * viewAt(uv, 0.5)); }
  // the prefiltered sky the street already reflects, as three.js samples it (and weather.ts dims it)
  vec3 skyLight(vec3 dir, float rough) {
    #ifdef ENVMAP_TYPE_CUBE_UV
      return textureCubeUV(tEnv, dir, rough).rgb * uEnvIntensity * uSkyMirror;
    #else
      return vec3(0.0);
    #endif
  }`;

const TRACE = () => /* glsl */ `
  #include <packing>
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform float uFogDensity, uRange;
  uniform mat4 uProj, uView;
  uniform vec2 uFull, uHalf;
  uniform float uNear, uFar, uRayLen;
  uniform int uTraceDebug;
  varying vec2 vUv;
  ${WET_GLSL}
  ${COMMON()}
  float sceneZ(vec2 uv) { return perspectiveDepthToViewZ(texture2D(tDepth, uv).r, uNear, uFar); }
  // the mist between the street and the eye veils its reflection as it veils the street; and out of range
  float fade(vec3 P, vec3 W) {
    return uWet * (1.0 - smoothstep(0.6, 1.0, -P.z / uRange)) * (1.0 - wt_heightFog(uCamWorld[3].y, W.y, -P.z, uFogDensity));
  }

  void main() {
    ivec2 fp = ivec2(gl_FragCoord.xy) * 2;
    float a0 = texelFetch(tColor, fp, 0).a;
    if (a0 > 0.7) { gl_FragColor = vec4(0.0, 0.0, 0.0, -1.0); return; }      // not wet street
    vec2 rk = wt_ssrUnpack(a0);
    float rough = rk.x;
    float d = texelFetch(tDepth, fp, 0).r;
    vec3 P = viewAt((vec2(fp) + 0.5) / uFull, d);
    vec3 W = (uCamWorld * vec4(P, 1.0)).xyz;
    vec3 Vw = normalize(W - uCamWorld[3].xyz);
    float fd = fade(P, W);
    gl_FragColor = vec4(0.0, 0.0, 0.0, fd);                                    // a miss keeps the sky
    if (fd * max(rk.y, water(rough) * uPuddle) < 0.003) return;               // too far, too misty to matter

    // the water surface: level, rung by raindrops, rippled downstream in the gutters (as the street shader)
    float wtr = water(rough);                                  // standing or running water, not damp stone
    vec4 fm = wt_flowAt(W.xz);
    float stream = wt_stream(fm.r);
    float detail = wt_detail(length(W - uCamWorld[3].xyz));
    vec2 g = wt_ripples(W.xz) * wt_rippleStrength(wtr * (1.0 - stream)) * detail;
    vec3 n = normalize(vec3(g.x, 1.0, g.y));
    float runW = clamp(stream + smoothstep(0.28, 0.46, fm.r) * uWet * wtr * 0.7, 0.0, 1.0);
    if (runW > 0.01) n = normalize(mix(n, wt_runNormal(W.xz, wt_flowDir(fm), fm.r, detail), runW));

    vec3 Rw = reflect(Vw, n);
    Rw.y = max(Rw.y, 0.03); Rw = normalize(Rw);                // a ripple can't send the ray into the street
    vec3 R = (uView * vec4(Rw, 0.0)).xyz;
    if (R.z > 0.5) return;

    // the ray, clipped to the near plane, then to the screen; z/w and 1/w interpolate linearly on screen
    float len = uRayLen;
    if (P.z + R.z * len > -2.0 * uNear) len = (-2.0 * uNear - P.z) / R.z;
    vec3 E = P + R * len;
    vec4 H0 = uProj * vec4(P, 1.0), H1 = uProj * vec4(E, 1.0);
    float k0 = 1.0 / H0.w, k1 = 1.0 / H1.w;
    vec2 S0 = H0.xy * k0 * 0.5 + 0.5, S1 = H1.xy * k1 * 0.5 + 0.5;
    float Q0 = P.z * k0, Q1 = E.z * k1;
    vec2 dS = S1 - S0;
    float tEnd = 1.0;
    if (dS.x > 1e-5) tEnd = min(tEnd, (1.0 - S0.x) / dS.x); else if (dS.x < -1e-5) tEnd = min(tEnd, -S0.x / dS.x);
    if (dS.y > 1e-5) tEnd = min(tEnd, (1.0 - S0.y) / dS.y); else if (dS.y < -1e-5) tEnd = min(tEnd, -S0.y / dS.y);
    float px = length(dS * tEnd * uHalf);                        // screen length in half-res pixels
    if (px < 2.0) return;
    float tMin = 1.5 / px;                                       // skip the pixel we start on
    float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));

    // march: steps grow away from the start (contacts stay sharp), per-pixel jitter hides the banding
    float tPrev = 0.0, tHit = -1.0, zPrev = P.z;
    for (int i = 0; i < ${STEPS}; i++) {
      float t = tMin + (1.0 - tMin) * pow((float(i) + jit) / float(${STEPS}), 1.35);
      t *= tEnd;
      float rz = mix(Q0, Q1, t) / mix(k0, k1, t);
      float dz = sceneZ(mix(S0, S1, t)) - rz;                    // > 0: the ray has gone behind the surface
      if (dz > 0.0 && dz < max(0.35, abs(rz - zPrev) * 2.0) + 0.02 * -rz) { tHit = t; break; }
      tPrev = t; zPrev = rz;
    }
    if (tHit < 0.0) return;
    float a = tPrev, b = tHit;
    for (int j = 0; j < 5; j++) {
      float m = 0.5 * (a + b);
      if (sceneZ(mix(S0, S1, m)) - mix(Q0, Q1, m) / mix(k0, k1, m) > 0.0) b = m; else a = m;
    }
    vec2 hit = mix(S0, S1, b);
    float dist = len * b * k1 / mix(k0, k1, b);                  // metres along the ray

    // confidence: fade toward the sky at the screen edges, for rays toward the camera, at the end of the
    // ray, and where the ray only met the street itself (a grazing ray clipping a hump of the paving)
    vec2 edge = smoothstep(0.0, 0.05, hit) * (1.0 - smoothstep(0.95, 1.0, hit));
    float conf = edge.x * edge.y * (1.0 - smoothstep(0.1, 0.5, R.z)) * (1.0 - smoothstep(0.6, 1.0, dist / uRayLen));
    conf *= step(0.7, texelFetch(tColor, min(ivec2(hit * uFull), ivec2(uFull) - 1), 0).a);
    // what the street already reflects (the prefiltered sky) is replaced by what the ray found
    vec3 env = skyLight(Rw, rough);
    vec3 hc = min(texture2D(tColor, hit).rgb, vec3(24.0));
    gl_FragColor = vec4((hc - env) * conf * fd, fd);
    if (uTraceDebug == 1) gl_FragColor = vec4(hc * conf * fd, fd);
    if (uTraceDebug == 2) gl_FragColor = vec4(env * conf * fd, fd);
  }`;

// Gather blur along one direction, radius from the street's roughness (half-res pixels); alpha < 0 = not street.
const BLUR = /* glsl */ `
  uniform sampler2D tSrc;
  uniform sampler2D tColor;
  uniform vec2 uHalf, uDir;
  uniform float uRadius, uBias;
  varying vec2 vUv;
  ${WET_GLSL}
  void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    vec4 c = texelFetch(tSrc, p, 0);
    if (c.a < 0.0) { gl_FragColor = c; return; }
    float r = (0.04 + smoothstep(0.03, 0.45, wt_ssrUnpack(texelFetch(tColor, p * 2, 0).a).x)) * uRadius;   // water: a pixel or two
    if (r < 0.5) { gl_FragColor = c; return; }
    ivec2 hi = ivec2(uHalf) - 1;
    vec4 sum = vec4(0.0); float ws = 0.0;
    for (int i = -3; i <= 3; i++) {
      vec2 o = uDir * (float(i) / 3.0 + uBias) * r;
      vec4 v = texelFetch(tSrc, clamp(p + ivec2(floor(o + 0.5)), ivec2(0), hi), 0);
      float w = exp(-0.12 * float(i * i)) * step(0.0, v.a);
      sum += v * w; ws += w;
    }
    gl_FragColor = ws > 0.0 ? sum / ws : c;
  }`;

const COMPOSITE = () => /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tRefl;
  uniform vec2 uHalf;
  uniform float uDarkRough, uGlow;
  uniform int uDebug;
  varying vec2 vUv;
  ${WET_GLSL}
  ${COMMON()}
  void main() {
    vec4 c = texture2D(tDiffuse, vUv);
    vec3 col = c.rgb;
    vec4 r = vec4(0.0);
    float k = 0.0;
    if (c.a < 0.7) {
      // bilinear upsample over the street texels only
      vec2 hp = vUv * uHalf - 0.5;
      ivec2 i0 = ivec2(floor(hp)), hi = ivec2(uHalf) - 1;
      vec2 f = hp - floor(hp);
      float ws = 0.0;
      for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
        vec4 v = texelFetch(tRefl, clamp(i0 + ivec2(i, j), ivec2(0), hi), 0);
        float w = (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y) * step(0.0, v.a);
        r += v * w; ws += w;
      }
      if (ws > 0.0) {
        r /= ws;
        // the weight per full-res pixel (crisp puddle edges): the share of the sky the street reflects here
        vec2 rk = wt_ssrUnpack(c.a);
        vec3 V = viewDir(vUv);
        // standing and running water mirror more boldly than physics would have it, most at a glancing
        // view (the cue that reads "puddle" in a game): the extra weight reflects the sky where rays missed
        k = min(mix(rk.y, max(rk.y, uPuddle * pow(1.0 - clamp(-V.y, 0.0, 1.0), 4.0)), water(rk.x)), 0.92);
        vec3 d = r.rgb;
        // lights reflect a little brighter too; a dark object only dims the sheen of rough stone a little,
        // while open water mirrors it fully
        d = max(d, 0.0) * uGlow + min(d, 0.0) * mix(1.0, uDarkRough, smoothstep(0.06, 0.4, rk.x));
        col = max(col + d * k + (k - rk.y) * r.a * skyLight(reflect(V, vec3(0.0, 1.0, 0.0)), rk.x), col * (1.0 - 0.8 * k));
      }
    }
    if (uDebug == 1) col = c.a < 0.7 ? vec3(wt_ssrUnpack(c.a).y, 1.0 - wt_ssrUnpack(c.a).x / 0.7, 0.0) : vec3(0.0);
    if (uDebug == 2) col = vec3(k * r.a * 2.0);
    if (uDebug == 3) col = max(r.rgb * k, 0.0) * 4.0 + max(-r.rgb * k, 0.0) * vec3(4.0, 0.0, 0.0);
    gl_FragColor = vec4(col, 1.0);
  }`;

export class SSRPass extends Pass {
  /** 1 mask (red: reflectance, green: smoothness), 2 reflection weight, 3 change in light (red: darker than the sky). */
  debug = 0;
  private readonly quad = new FullScreenQuad();
  private readonly trace: THREE.ShaderMaterial;
  private readonly blur: THREE.ShaderMaterial;
  private readonly comp: THREE.ShaderMaterial;
  private readonly a: THREE.WebGLRenderTarget;
  private readonly b: THREE.WebGLRenderTarget;

  constructor(private readonly camera: THREE.PerspectiveCamera, depth: THREE.DepthTexture, private readonly scene: THREE.Scene) {
    super();
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
    this.a = new THREE.WebGLRenderTarget(1, 1, opts);
    this.b = new THREE.WebGLRenderTarget(1, 1, opts);
    // the prefiltered sky the street already reflects (PMREM, cube-UV layout as three.js lays it out)
    const env = scene.environment as (THREE.Texture & { image: { height: number } }) | null;
    const defines: Record<string, string | number> = {};
    if (env && env.mapping === THREE.CubeUVReflectionMapping && env.image?.height) {
      const maxMip = Math.log2(env.image.height) - 2;
      defines.ENVMAP_TYPE_CUBE_UV = '';
      defines.CUBEUV_TEXEL_WIDTH = 1 / (3 * Math.max(2 ** maxMip, 7 * 16));
      defines.CUBEUV_TEXEL_HEIGHT = 1 / env.image.height;
      defines.CUBEUV_MAX_MIP = `${maxMip}.0`;
    }
    const mat = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>, d: Record<string, string | number> = {}) =>
      new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader, uniforms, defines: d, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
    // camera and mist uniforms, shared (same objects) by the trace and the composite
    const view = { uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, tEnv: { value: env }, uEnvIntensity: { value: 1 }, uSkyMirror: SKY_MIRROR, uPuddle: { value: 0.45 } };
    this.trace = mat(TRACE(), {
      ...view, tColor: { value: null }, tDepth: { value: depth },
      uFogDensity: { value: 0 }, uRange: { value: 110 }, uWet: WET,
      uProj: { value: new THREE.Matrix4() }, uView: { value: new THREE.Matrix4() },
      uFull: { value: new THREE.Vector2(1, 1) }, uHalf: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.1 }, uFar: { value: 1000 }, uRayLen: { value: 90 }, uTraceDebug: { value: 0 },
      uRainTime: RAIN_TIME, uFlowMap: FLOW.map, uFlowBox: FLOW.box,
    }, defines);
    this.blur = mat(BLUR, { uWet: WET, uRainTime: RAIN_TIME, uFlowMap: FLOW.map, uFlowBox: FLOW.box, tSrc: { value: null }, tColor: { value: null }, uHalf: { value: new THREE.Vector2(1, 1) }, uDir: { value: new THREE.Vector2(0, 1) }, uRadius: { value: 1 }, uBias: { value: 0 } });
    this.comp = mat(COMPOSITE(), {
      ...view, uWet: WET, uRainTime: RAIN_TIME, uFlowMap: FLOW.map, uFlowBox: FLOW.box, tDiffuse: { value: null }, tRefl: { value: null }, uHalf: { value: new THREE.Vector2(1, 1) },
      uDarkRough: { value: 0.5 }, uGlow: { value: 1.25 }, uDebug: { value: 0 },
    }, defines);
  }

  setSize(w: number, h: number): void {
    const hw = Math.max(1, Math.floor(w / 2)), hh = Math.max(1, Math.floor(h / 2));
    this.a.setSize(hw, hh);
    this.b.setSize(hw, hh);
    this.trace.uniforms.uFull.value.set(w, h);
    for (const m of [this.trace, this.blur, this.comp]) m.uniforms.uHalf.value.set(hw, hh);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const cam = this.camera, t = this.trace.uniforms;
    t.tColor.value = readBuffer.texture;
    t.uProj.value.copy(cam.projectionMatrix);
    t.uInvProj.value.copy(cam.projectionMatrixInverse);
    t.uView.value.copy(cam.matrixWorldInverse);
    t.uCamWorld.value.copy(cam.matrixWorld);
    t.uNear.value = cam.near; t.uFar.value = cam.far;
    t.uEnvIntensity.value = this.scene.environmentIntensity;
    const fog = this.scene.fog as THREE.FogExp2 | null;
    t.uFogDensity.value = fog && fog.isFogExp2 ? fog.density : 0;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;   // every pass writes every pixel; and the shared depth must survive
    this.draw(renderer, this.trace, this.a);
    // streaks: long vertical gather (biased upward, so the smear runs toward the viewer), a fine vertical
    // pass to fill between its taps, then a short horizontal one
    const h = this.a.height, bl = this.blur.uniforms;
    bl.tColor.value = readBuffer.texture;
    const pass = (src: THREE.WebGLRenderTarget, dst: THREE.WebGLRenderTarget, dx: number, dy: number, radius: number, bias: number) => {
      bl.tSrc.value = src.texture; bl.uDir.value.set(dx, dy); bl.uRadius.value = radius; bl.uBias.value = bias;
      this.draw(renderer, this.blur, dst);
    };
    pass(this.a, this.b, 0, 1, 0.06 * h, 0.35);
    pass(this.b, this.a, 0, 1, 0.012 * h, 0);
    pass(this.a, this.b, 1, 0, 0.006 * h, 0);
    this.comp.uniforms.tDiffuse.value = readBuffer.texture;
    this.comp.uniforms.tRefl.value = this.b.texture;
    this.comp.uniforms.uDebug.value = this.debug;
    this.draw(renderer, this.comp, this.renderToScreen ? null : writeBuffer);
    renderer.autoClear = autoClear;
  }

  private draw(renderer: THREE.WebGLRenderer, m: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    renderer.setRenderTarget(target);
    this.quad.material = m;
    this.quad.render(renderer);
  }

  dispose(): void {
    this.a.dispose(); this.b.dispose();
    this.trace.dispose(); this.blur.dispose(); this.comp.dispose();
    this.quad.dispose();
  }
}
