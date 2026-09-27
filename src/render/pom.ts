import * as THREE from 'three';

/**
 * Parallax occlusion mapping for MeshStandardMaterial: cobbles and clay tiles that read as real stones
 * and courses up close, with no extra geometry. The view ray is marched through a height map (linear
 * steps, more at grazing angles, then a short binary refinement); every map that shares the UV (map,
 * normalMap, roughnessMap, aoMap) is then read at the offset point. The tangent frame comes from
 * screen-space derivatives, so it works on the LiDAR terrain, skeleton roofs of any orientation and
 * walls alike (nothing in the scene has tangent attributes). Faded out with distance, where the relief
 * is below a pixel and would only shimmer.
 *
 * Optional anti-tiling: the texture is laid in irregular patches, each with its own offset and mirroring;
 * neighbouring patches meet along a height blend (the taller stone wins), so the seams look like stones
 * set against stones rather than a smear, and the repeat no longer reads across the square.
 *
 * Exposes `float gPomHeight` (0 = deepest joint … 1 = stone top, at the visible point) under
 * `#define POM_HEIGHT`, so later shader code (rain) can fill the joints first.
 *
 * Chained like wet()/age(): the material's own onBeforeCompile runs first, customProgramCacheKey is
 * extended. The patched maps are switched in three's shared chunks behind `#ifdef USE_POM`, so the
 * `#include` lines stay in place for the patchers that run after this one (wet, age, shadows).
 */

export interface ParallaxOptions {
  /** Height in the red channel, 0 = deepest joint … 1 = top; read with the material map's UVs. */
  heightMap: THREE.Texture;
  /** Relief depth in metres (joint bottom to stone top). */
  depth: number;
  minSteps?: number;   // looking straight down
  maxSteps?: number;   // at grazing angles
  fadeStart?: number;  // metres from the camera
  fadeEnd?: number;
  /** Anti-tiling patch size in texture repeats (0 = off). */
  antiTile?: number;
  /** Soft self-shadowing of the relief towards the sun (only where the sun is strong: clear weather). */
  shadow?: boolean;
}

// --- Shared chunks: the map lookups, switched to the offset UV for POM materials only -------------------
let installed = false;
function installChunks(): void {
  if (installed) return;
  installed = true;
  const C = THREE.ShaderChunk as unknown as Record<string, string>;
  const swap = (chunk: string, from: string, to: string) => {
    if (!C[chunk].includes(from)) throw new Error(`pom: ${chunk} changed, cannot patch`);
    C[chunk] = C[chunk].replace(from, `#ifdef USE_POM\n${to}\n#else\n${from}\n#endif`);
  };
  swap('map_fragment', 'vec4 sampledDiffuseColor = texture2D( map, vMapUv );', 'vec4 sampledDiffuseColor = pomTexture( map );');
  swap('roughnessmap_fragment', 'vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );', 'vec4 texelRoughness = pomTexture( roughnessMap );');
  swap('normal_fragment_maps', 'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', 'vec3 mapN = pomNormal( normalMap );');
  swap('aomap_fragment', 'float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;',
    'float ambientOcclusion = ( pomTexture( aoMap ).r - 1.0 ) * aoMapIntensity + 1.0;');
}

const PARS = /* glsl */ `
uniform sampler2D pomHeightMap;
uniform vec4 pomParams;   // depth (m), min steps, max steps, 1 / anti-tiling patch size
uniform vec2 pomFade;     // fade start, end (m)
// the visible point: base UV (all maps share it), explicit gradients (continuous across the offsets)
vec2 gPomUv = vec2(0.0), gPomDx = vec2(0.0), gPomDy = vec2(0.0);
// anti-tiling: two patch layers (mirror signs, offsets), patch weight, and the height blend at the visible point
vec2 gPomSa = vec2(1.0), gPomSb = vec2(1.0), gPomOffA = vec2(0.0), gPomOffB = vec2(0.0);
float gPomW = 0.0, gPomBlend = 0.0, gPomLastB = 0.0;
float gPomHeight = 1.0;
float gPomShadow = 1.0;   // sun visibility from the relief (POM_SHADOW)

float pm_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float pm_noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(pm_hash(i), pm_hash(i + vec2(1, 0)), u.x), mix(pm_hash(i + vec2(0, 1)), pm_hash(i + vec2(1, 1)), u.x), u.y); }
// patch k: an offset and a mirroring (keeps the rows of stones running the same way)
void pm_layer(float k, out vec2 s, out vec2 off) {
  off = vec2(pm_hash(vec2(k, 1.7)), pm_hash(vec2(k, 9.3)));
  s = vec2(pm_hash(vec2(k, 4.1)) < 0.5 ? -1.0 : 1.0, pm_hash(vec2(k, 6.6)) < 0.5 ? -1.0 : 1.0);
}
// weight of b where two patches meet: the taller stone wins, w shifts the balance across the seam
float pm_hblend(float a, float b, float w) {
  float ha = a + 1.0 - w, hb = b + w, m = max(ha, hb) - 0.12;
  float wa = max(ha - m, 0.0), wb = max(hb - m, 0.0);
  return wb / (wa + wb);
}
float pomH(vec2 uv) {
  float a = textureGrad(pomHeightMap, uv * gPomSa + gPomOffA, gPomDx * gPomSa, gPomDy * gPomSa).r;
  #ifdef POM_ANTITILE
    gPomLastB = 0.0;
    if (gPomW > 0.0) {
      float b = textureGrad(pomHeightMap, uv * gPomSb + gPomOffB, gPomDx * gPomSb, gPomDy * gPomSb).r;
      gPomLastB = pm_hblend(a, b, gPomW);
      a = mix(a, b, gPomLastB);
    }
  #endif
  return a;
}
vec4 pomTexture(sampler2D s) {
  vec4 a = textureGrad(s, gPomUv * gPomSa + gPomOffA, gPomDx * gPomSa, gPomDy * gPomSa);
  #ifdef POM_ANTITILE
    if (gPomBlend > 0.001) a = mix(a, textureGrad(s, gPomUv * gPomSb + gPomOffB, gPomDx * gPomSb, gPomDy * gPomSb), gPomBlend);
  #endif
  return a;
}
// tangent-space normal, un-mirrored per patch
vec3 pomNormal(sampler2D s) {
  vec3 a = textureGrad(s, gPomUv * gPomSa + gPomOffA, gPomDx * gPomSa, gPomDy * gPomSa).xyz * 2.0 - 1.0;
  a.xy *= gPomSa;
  #ifdef POM_ANTITILE
    if (gPomBlend > 0.001) {
      vec3 b = textureGrad(s, gPomUv * gPomSb + gPomOffB, gPomDx * gPomSb, gPomDy * gPomSb).xyz * 2.0 - 1.0;
      b.xy *= gPomSb;
      a = mix(a, b, gPomBlend);
    }
  #endif
  return a;
}
`;

// The sun's direct light is dimmed by the relief's own shadow (sun = the first directional light;
// CSM's cascades all share its direction; the gas lamps are point lights and stay unshadowed).
const SHADOW_PARS = /* glsl */ `
#if defined( POM_SHADOW ) && NUM_DIR_LIGHTS > 0
  IncidentLight pomLit(IncidentLight l) {
    if (dot(l.direction, directionalLights[0].direction) > 0.999) l.color *= gPomShadow;
    return l;
  }
  #undef RE_Direct
  #define RE_Direct(l, p, n, v, c, m, r) RE_Direct_Physical(pomLit(l), p, n, v, c, m, r)
#endif
`;

const MAIN = /* glsl */ `
{
  vec2 uv0 = vMapUv;
  gPomUv = uv0;
  gPomDx = dFdx(uv0); gPomDy = dFdy(uv0);
  #ifdef POM_ANTITILE
  {
    // irregular patches: level sets of a smooth noise, each level its own layer; blend across the seams
    float l = pm_noise(uv0 * pomParams.w) * 9.0 + pm_noise(uv0 * pomParams.w * 2.7 + 5.0) * 3.0;
    float k = floor(l), w = smoothstep(0.3, 0.7, fract(l));
    pm_layer(k, gPomSa, gPomOffA);
    pm_layer(k + 1.0, gPomSb, gPomOffB);
    if (w >= 1.0) { gPomSa = gPomSb; gPomOffA = gPomOffB; w = 0.0; }
    gPomW = w;
  }
  #endif
  float pomFadeK = 1.0 - smoothstep(pomFade.x, pomFade.y, length(vViewPosition));
  vec3 pn = normalize(vNormal);
  vec3 pv = normalize(vViewPosition);          // towards the eye
  float ndv = dot(pn, pv);
  // surface gradients of u and v (UV per metre) from screen-space derivatives (outside any branch)
  vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition);
  vec3 q1p = cross(q1, pn), q0p = cross(pn, q0);
  float det = dot(q0, q1p);
  float idet = abs(det) > 1e-24 ? 1.0 / det : 0.0;
  vec3 gu = (q1p * gPomDx.x + q0p * gPomDy.x) * idet;
  vec3 gv = (q1p * gPomDx.y + q0p * gPomDy.y) * idet;
  bool pomOn = gl_FrontFacing && pomFadeK > 0.0 && ndv > 0.02 && idet != 0.0;
  if (pomOn) {
    // UV shift of the view ray from the top of the relief down to its full depth
    vec2 P = -vec2(dot(gu, pv), dot(gv, pv)) / max(ndv, 0.18) * pomParams.x * pomFadeK;
    float n = floor(mix(pomParams.z, pomParams.y, ndv));
    float stepL = 1.0 / n;
    vec2 dUv = P * stepL;
    vec2 uv = uv0, puv = uv0;
    float layer = 0.0, player = 0.0;
    float hd = 1.0 - pomH(uv), phd = hd;
    for (int i = 0; i < 64; i++) {
      if (layer >= hd || float(i) >= n) break;
      puv = uv; phd = hd; player = layer;
      uv += dUv; layer += stepL;
      hd = 1.0 - pomH(uv);
    }
    if (layer > 0.0) {
      for (int j = 0; j < 4; j++) {
        vec2 muv = 0.5 * (puv + uv); float ml = 0.5 * (player + layer);
        float mhd = 1.0 - pomH(muv);
        if (ml < mhd) { puv = muv; player = ml; phd = mhd; } else { uv = muv; layer = ml; hd = mhd; }
      }
      float a0 = phd - player, a1 = hd - layer;
      gPomUv = mix(puv, uv, clamp(a0 / max(a0 - a1, 1e-5), 0.0, 1.0));
    }
  }
  gPomHeight = pomH(gPomUv);
  gPomBlend = gPomLastB;
  #if defined( POM_SHADOW ) && NUM_DIR_LIGHTS > 0
  {
    // soft self-shadow: march from the visible point up towards the sun; only for a sun strong enough
    // to cast crisp shadows (the clear morning, not the overcast rain)
    vec3 L = directionalLights[0].direction;
    vec3 sc = directionalLights[0].color;
    float sunK = smoothstep(2.0, 5.0, max(sc.r, max(sc.g, sc.b))) * pomFadeK;
    float ndl = dot(pn, L);
    if (pomOn && sunK > 0.0 && ndl > 0.0) {
      vec2 Ls = vec2(dot(gu, L), dot(gv, L)) / max(ndl, 0.1) * pomParams.x * pomFadeK;
      float d0 = 1.0 - gPomHeight, occ = 0.0;
      for (int k = 1; k <= 8; k++) {
        float t = float(k) * 0.125;
        float ray = d0 * (1.0 - t), surf = 1.0 - pomH(gPomUv + Ls * d0 * t);
        occ = max(occ, (ray - surf) * (1.0 - t));
      }
      gPomShadow = 1.0 - sunK * clamp(occ * 7.0, 0.0, 1.0);
    }
  }
  #endif
}
`;

/** Adds parallax occlusion mapping (and optionally anti-tiling) to a standard material with a map. */
export function parallax<T extends THREE.MeshStandardMaterial>(m: T, o: ParallaxOptions): T {
  installChunks();
  const own = m.onBeforeCompile;
  const ownKey = m.customProgramCacheKey();
  const anti = o.antiTile ?? 0;
  const uniforms = {
    pomHeightMap: { value: o.heightMap },
    pomParams: { value: new THREE.Vector4(o.depth, o.minSteps ?? 8, o.maxSteps ?? 24, anti > 0 ? 1 / anti : 0) },
    pomFade: { value: new THREE.Vector2(o.fadeStart ?? 18, o.fadeEnd ?? 28) },
  };
  m.defines = { ...m.defines, USE_POM: '', POM_HEIGHT: '', ...(anti > 0 ? { POM_ANTITILE: '' } : {}), ...(o.shadow ? { POM_SHADOW: '' } : {}) };
  m.onBeforeCompile = (shader, renderer) => {
    own.call(m, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `${PARS}\n#include <common>`)
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>\n${SHADOW_PARS}`)
      .replace('#include <map_fragment>', `${MAIN}\n#include <map_fragment>`);
  };
  m.customProgramCacheKey = () => `${ownKey}|pom${anti > 0 ? '-at' : ''}${o.shadow ? '-sh' : ''}`;
  m.userData.pom = uniforms;
  m.needsUpdate = true;
  return m;
}
