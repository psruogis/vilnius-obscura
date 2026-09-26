import * as THREE from 'three';

/**
 * Rain: ground-hugging fog, an overcast sky, falling streaks around the walker, and wet surfaces
 * (dark, glossy cobbles with rippling puddles, shinier roofs, walls darkened near the street).
 * The fog closes the view at ~150-200 m, so the low-detail town beyond the walk dissolves in mist.
 */

export const WET = { value: 1 };           // 0 dry .. 1 soaked (shared by every wet material)
export const RAIN_TIME = { value: 0 };     // seconds, drives drops and ripples
/** The baked street flow map (world/flow.ts) and its box: (x0, z0, 1/size, 0). */
export const FLOW = { map: { value: null as THREE.Texture | null }, box: { value: new THREE.Vector4(0, 0, 1, 0) } };

// --- Height fog --------------------------------------------------------------------------------------
// Replaces three's fog chunks for every built-in material: exponential fog whose density rises
// near the ground, so streets fill with mist while roofs and towers loom out of it.
export function installHeightFog(groundY: number, mistHeight: number, mistBoost: number): void {
  const C = THREE.ShaderChunk as unknown as Record<string, string>;
  C.fog_pars_vertex = `#ifdef USE_FOG
    varying float vFogDepth; varying vec3 vFogWorld;
  #endif`;
  C.fog_vertex = `#ifdef USE_FOG
    vFogDepth = - mvPosition.z;
    vFogWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif`;
  C.fog_pars_fragment = `#ifdef USE_FOG
    uniform vec3 fogColor;
    varying float vFogDepth; varying vec3 vFogWorld;
    #ifdef FOG_EXP2
      uniform float fogDensity;
    #else
      uniform float fogNear; uniform float fogFar;
    #endif
  #endif`;
  C.fog_fragment = `#ifdef USE_FOG
    #ifdef FOG_EXP2
      // mist thickest at street level, thinning with height (integrated along the view ray)
      float fy0 = cameraPosition.y - ${groundY.toFixed(2)}, fy1 = vFogWorld.y - ${groundY.toFixed(2)};
      float fk = 1.0 / ${mistHeight.toFixed(2)};
      float fdy = fy1 - fy0;
      // average of exp(-y/H) along the ray; near-level rays use the midpoint (avoids a precision seam at eye height)
      // (no clamping of heights: streets below the reference level just get a little more mist)
      float avgMist = abs(fdy) * fk > 0.05
        ? (exp(-fy0 * fk) - exp(-fy1 * fk)) / (fdy * fk)
        : exp(-0.5 * (fy0 + fy1) * fk);
      float fd = fogDensity * vFogDepth * (1.0 + ${mistBoost.toFixed(2)} * clamp(avgMist, 0.0, 1.6));
      float fogFactor = 1.0 - exp(-fd * fd * 0.6 - fd * 0.4);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, clamp(fogFactor, 0.0, 1.0));
  #endif`;
}

// --- Overcast sky --------------------------------------------------------------------------------------
export function createOvercastSky(horizon: THREE.ColorRepresentation, zenith: THREE.ColorRepresentation, radius = 4000): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uHorizon: { value: new THREE.Color(horizon) }, uZenith: { value: new THREE.Color(zenith) }, uTime: RAIN_TIME },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uHorizon, uZenith; uniform float uTime;
      varying vec3 vDir;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
      void main() {
        float y = max(vDir.y, 0.0);
        vec3 c = mix(uHorizon, uZenith, pow(y, 0.55));
        // low, heavy cloud deck drifting slowly
        vec2 uv = vDir.xz / (vDir.y + 0.12) * 1.6 + vec2(uTime * 0.012, uTime * 0.004);
        float cl = fbm(uv);
        c *= 0.82 + 0.3 * cl;
        c = mix(uHorizon, c, smoothstep(0.0, 0.25, y));  // melts into the mist at the horizon
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  m.name = 'overcast';
  m.frustumCulled = false;
  return m;
}

// --- Rain streaks --------------------------------------------------------------------------------------
export function createRain(count = 9000, box = new THREE.Vector3(44, 26, 44)): { mesh: THREE.Mesh; update(dt: number, cam: THREE.Vector3): void } {
  const base = new THREE.PlaneGeometry(1, 1, 1, 1).translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.getAttribute('position'));
  g.setAttribute('uv', base.getAttribute('uv'));
  const off = new Float32Array(count * 3), rnd = new Float32Array(count);
  for (let i = 0; i < count; i++) { off[i * 3] = Math.random(); off[i * 3 + 1] = Math.random(); off[i * 3 + 2] = Math.random(); rnd[i] = Math.random(); }
  g.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3));
  g.setAttribute('aRand', new THREE.InstancedBufferAttribute(rnd, 1));
  g.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    uniforms: { uTime: RAIN_TIME, uCam: { value: new THREE.Vector3() }, uBox: { value: box }, uWind: { value: new THREE.Vector3(1.1, 0, 0.5) }, uColor: { value: new THREE.Color('#c9d2d8') } },
    vertexShader: /* glsl */ `
      attribute vec3 aOffset; attribute float aRand;
      uniform float uTime; uniform vec3 uCam, uBox, uWind;
      varying float vA; varying vec2 vUv;
      void main() {
        float speed = 8.5 + aRand * 2.5;
        vec3 vel = vec3(uWind.x, -speed, uWind.z);
        vec3 p = aOffset * uBox + vel * uTime;
        p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;   // wrap around the camera
        vec3 dir = normalize(vel);
        vec3 toCam = normalize(cameraPosition - p);
        vec3 side = normalize(cross(dir, toCam));
        vec3 wp = p + side * (position.x * (0.014 + 0.01 * aRand)) - dir * position.y * (0.55 + 0.3 * aRand);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        float d = length(cameraPosition - p);
        vA = smoothstep(0.6, 2.0, d) * (1.0 - smoothstep(9.0, 22.0, d)) * (0.28 + 0.3 * aRand);
        vUv = uv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; varying float vA; varying vec2 vUv;
      void main() {
        float a = vA * sin(vUv.y * 3.14159) * (1.0 - abs(vUv.x - 0.5) * 2.0);
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.name = 'rain';
  mesh.renderOrder = 10;
  return {
    mesh,
    update(dt, cam) { mat.uniforms.uCam.value.copy(cam); void dt; },
  };
}

// --- Wet surfaces --------------------------------------------------------------------------------------
const NOISE = /* glsl */ `
  float wt_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float wt_noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(wt_hash(i), wt_hash(i + vec2(1, 0)), u.x), mix(wt_hash(i + vec2(0, 1)), wt_hash(i + vec2(1, 1)), u.x), u.y); }
  float wt_fbm(vec2 p) { return 0.5 * wt_noise(p) + 0.28 * wt_noise(p * 2.1 + 3.1) + 0.14 * wt_noise(p * 4.3 + 7.7) + 0.08 * wt_noise(p * 8.7 + 1.3); }
  // running-water surface height in flow coordinates (s along, t across), two layers scrolling downstream
  float wt_water(float s, float t, float ph1, float ph2) {
    return wt_noise(vec2(s * 3.0 - ph1 * 3.0, t * 7.0)) * 0.6 + wt_noise(vec2(s * 5.5 - ph2 * 5.5, t * 11.0 + 4.0)) * 0.4;
  }
`;

export type WetKind = 'ground' | 'roof' | 'wall';

/** Makes a standard material respond to WET: darker, glossier; the ground gets puddles with rain ripples. */
/** hExpr: GLSL for the height above the local ground (defaults to world height above groundY). */
export function wet(m: THREE.Material, kind: WetKind, groundY = 0, hExpr?: string): THREE.Material {
  const own = m.onBeforeCompile;
  const ownKey = m.customProgramCacheKey();
  m.onBeforeCompile = (shader, renderer) => {
    own.call(m, shader, renderer);
    shader.uniforms.uWet = WET;
    shader.uniforms.uRainTime = RAIN_TIME;
    shader.uniforms.uFlowMap = FLOW.map;
    shader.uniforms.uFlowBox = FLOW.box;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWetWorld; varying vec3 vWetNormal;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vWetWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWetNormal = mat3(modelMatrix) * objectNormal;`);
    let frag = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWetWorld; varying vec3 vWetNormal;
      uniform float uWet; uniform float uRainTime; uniform sampler2D uFlowMap; uniform vec4 uFlowBox;
      ${NOISE}`);
    if (kind === 'ground') {
      frag = frag
        .replace('#include <color_fragment>', `#include <color_fragment>
          // --- mud and running water, from the baked flow map --------------------------------------
          vec2 fuv = (vWetWorld.xz - uFlowBox.xy) * uFlowBox.z;
          float inMap = step(0.0, fuv.x) * step(fuv.x, 1.0) * step(0.0, fuv.y) * step(fuv.y, 1.0);
          vec2 wob = vec2(wt_noise(vWetWorld.xz * 1.3), wt_noise(vWetWorld.zx * 1.3 + 5.0)) - 0.5;
          vec4 fm = texture2D(uFlowMap, fuv + wob * uFlowBox.z * 0.45) * inMap;
          float flowAmt = fm.r;
          vec2 fdir = fm.gb * 2.0 - 1.0; float fdl = length(fdir); fdir = fdl > 0.05 ? fdir / fdl : vec2(0.0, 1.0);
          float wallD = inMap > 0.5 ? fm.a * 8.0 : 8.0;
          float lum = dot(diffuseColor.rgb, vec3(0.333));
          float mudZone = wt_fbm(vWetWorld.xz * 0.3 + 11.0) * 0.75 + 0.22 * (1.0 - smoothstep(0.4, 2.0, wallD)) + 0.3 * smoothstep(0.28, 0.45, flowAmt) * (1.0 - smoothstep(0.52, 0.64, flowAmt));
          float mud = smoothstep(0.62, 0.86, mudZone);
          float jointMud = smoothstep(0.46, 0.66, mudZone) * (1.0 - smoothstep(0.14, 0.32, lum));   // mud settles in the joints first
          float mudAll = max(mud * 0.88, jointMud);
          vec3 mudC = mix(vec3(0.19, 0.15, 0.11), vec3(0.33, 0.27, 0.19), wt_noise(vWetWorld.xz * 2.1)) * mix(1.3, 0.8, uWet);
          diffuseColor.rgb = mix(diffuseColor.rgb, mudC, mudAll);
          float stream = smoothstep(0.5, 0.62, flowAmt) * uWet;                                       // gutters running with water
          float film = smoothstep(0.28, 0.46, flowAmt) * uWet * (1.0 - smoothstep(0.14, 0.34, lum));    // water trickling in the joints
          float puddle = smoothstep(0.53, 0.6, wt_fbm(vWetWorld.xz * 0.22)) * uWet * (1.0 - stream);
          diffuseColor.rgb *= mix(1.0, 0.62, uWet);
          diffuseColor.rgb *= 1.0 - 0.35 * puddle;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.44, 0.36) + vec3(0.035, 0.026, 0.014), max(stream, film * 0.6)); // muddy water
          // flecks of foam carried downstream
          { vec2 pp = vWetWorld.xz, pr = vec2(-fdir.y, fdir.x); float fs = dot(pp, fdir) * 4.0 - uRainTime * (1.2 + 2.5 * flowAmt) * 4.0, ft = dot(pp, pr) * 9.0;
            float foam = smoothstep(0.78, 0.9, wt_noise(vec2(fs, ft))) * stream;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.58, 0.5), foam * 0.5); }`)
        .replace('#include <metalnessmap_fragment>', `roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.42, uWet);
          roughnessFactor = mix(roughnessFactor, mix(0.95, 0.3, uWet), mud);        // mud: dull when dry, glossy when wet
          roughnessFactor = mix(roughnessFactor, 0.04, puddle);
          roughnessFactor = mix(roughnessFactor, 0.07, film * 0.8);
          roughnessFactor = mix(roughnessFactor, 0.02, stream);
          #include <metalnessmap_fragment>`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          {
            vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
            normal = normalize(mix(normal, upV, puddle * 0.9));   // water fills the joints: flat mirror
            // ripples from falling drops, in puddles and faintly on the wet stones
            vec2 q = vWetWorld.xz / 0.55;
            vec2 grad = vec2(0.0);
            for (int k = 0; k < 2; k++) {
              vec2 cell = floor(q + float(k) * 0.5), f = q + float(k) * 0.5 - cell;
              vec2 c0 = vec2(wt_hash(cell), wt_hash(cell + 17.0)) * 0.6 + 0.2;
              float ph = fract(uRainTime * (0.9 + 0.4 * wt_hash(cell + 3.0)) + wt_hash(cell + 9.0));
              vec2 d = f - c0; float r = length(d);
              float ring = sin((r - ph * 0.45) * 55.0) * (1.0 - ph) * smoothstep(ph * 0.45 + 0.07, ph * 0.45, r) * smoothstep(ph * 0.45 - 0.12, ph * 0.45, r);
              grad += normalize(d + 1e-4) * ring;
            }
            vec3 rip = (viewMatrix * vec4(grad.x, 0.0, grad.y, 0.0)).xyz;
            normal = normalize(normal + rip * (0.06 + 0.25 * puddle) * uWet);
            // running water: a flat surface with ripples carried downstream
            float runW = clamp(stream + film * 0.7, 0.0, 1.0);
            if (runW > 0.01) {
              vec2 p = vWetWorld.xz, perp = vec2(-fdir.y, fdir.x);
              float s = dot(p, fdir), t = dot(p, perp), spd = 0.7 + 1.9 * flowAmt;
              float ph1 = uRainTime * spd, ph2 = uRainTime * spd * 1.37 + 3.1, e = 0.04;
              float h0 = wt_water(s, t, ph1, ph2), hs = wt_water(s + e, t, ph1, ph2), ht = wt_water(s, t + e, ph1, ph2);
              vec2 gw = fdir * (hs - h0) / e + perp * (ht - h0) / e;
              vec3 wn = normalize(vec3(-gw.x * 0.07, 1.0, -gw.y * 0.07));
              normal = normalize(mix(normal, normalize((viewMatrix * vec4(wn, 0.0)).xyz), runW));
            }
          }`);
    } else if (kind === 'roof') {
      frag = frag
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb *= mix(1.0, 0.72, uWet);`)
        .replace('#include <metalnessmap_fragment>', `roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.4, uWet);
          #include <metalnessmap_fragment>`);
    } else {
      frag = frag
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            // lime render soaks up rain: darker low down and in runs from ledges
            float hy = ${hExpr ?? `vWetWorld.y - ${groundY.toFixed(2)}`};
            float soak = (1.0 - smoothstep(0.0, 1.6 + 0.6 * wt_fbm(vWetWorld.xz * 0.7 + vWetWorld.y * 0.1), hy));
            float vertical = 1.0 - smoothstep(0.55, 0.8, abs(normalize(vWetNormal).y));
            diffuseColor.rgb *= mix(1.0, 0.86 - 0.22 * soak * vertical, uWet);
          }`)
        .replace('#include <metalnessmap_fragment>', `roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.8, uWet);
          #include <metalnessmap_fragment>`);
    }
    shader.fragmentShader = frag;
  };
  m.customProgramCacheKey = () => `${ownKey}|wet-${kind}`;
  m.needsUpdate = true;
  return m;
}
