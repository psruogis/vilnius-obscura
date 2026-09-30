import * as THREE from 'three';

/**
 * Age for any standard material, worked out in world space so it needs no special UVs:
 * mottled, uneven colour; soot and rain streaks down vertical faces; dust on ledges; grime and damp
 * rising from the ground. Roofs get their own recipe: tile-by-tile colour variation, lichen and moss
 * patches, dark runs down the slope. Chained after any shader code the material already injects.
 */

const NOISE = /* glsl */ `
  float ag_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float ag_noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(ag_hash(i), ag_hash(i + vec2(1, 0)), u.x), mix(ag_hash(i + vec2(0, 1)), ag_hash(i + vec2(1, 1)), u.x), u.y);
  }
  float ag_fbm(vec2 p) { return 0.5 * ag_noise(p) + 0.28 * ag_noise(p * 2.07 + 5.2) + 0.14 * ag_noise(p * 4.3 + 1.7) + 0.08 * ag_noise(p * 8.9 + 9.1); }
`;

const WALL = /* glsl */ `
  {
    vec3 p = vAgeWorld, n = normalize(vAgeNormal);
    float vertical = 1.0 - smoothstep(0.55, 0.8, abs(n.y));
    vec2 q = vertical > 0.5 ? vec2(dot(p.xz, normalize(vec2(-n.z, n.x) + 1e-5)), p.y) : p.xz;
    vec3 c = diffuseColor.rgb;
    // uneven, sun-bleached and re-limed patches
    c *= 0.84 + 0.24 * ag_fbm(q * 0.21 + uAgeSeed);
    // broad, soft staining (no stripes): rain-darkened patches that fade out downwards
    float stain = ag_fbm(vec2(q.x * 0.35, p.y * 0.18) + uAgeSeed * 3.0);
    c *= 1.0 - uAgeStrength * 0.16 * vertical * smoothstep(0.5, 0.8, stain);
    // dust and soot settled on ledges
    c *= 1.0 - uAgeStrength * 0.18 * smoothstep(0.6, 0.9, n.y);
    // grime and damp rising from the street
    float edge = uAgeGround + 0.9 + 0.7 * ag_fbm(vec2(q.x * 0.8, 1.0));
    float damp = 1.0 - smoothstep(uAgeGround, edge, p.y);
    c = mix(c, c * vec3(0.66, 0.62, 0.56), damp * uAgeStrength * 0.8);
    diffuseColor.rgb = c;
  }
`;

const ROOF = /* glsl */ `
  {
    vec3 p = vAgeWorld, n = normalize(vAgeNormal);
    vec3 c = diffuseColor.rgb;
    // tile-by-tile variation: hand-made clay fired unevenly, replaced tiles here and there
    vec2 tile = floor(vec2(p.x * 3.6 + p.z * 0.3, p.z * 2.7 - p.x * 0.2 + p.y * 1.3));
    float t = ag_hash(tile + uAgeSeed);
    c *= mix(vec3(0.72, 0.7, 0.72), vec3(1.12, 1.03, 0.95), t);
    // broad weathering: darker, greyer roofs in patches
    float broad = ag_fbm(p.xz * 0.09 + uAgeSeed);
    c = mix(c, c * vec3(0.62, 0.6, 0.6), smoothstep(0.35, 0.8, broad) * 0.6 * uAgeStrength);
    // lichen (pale grey-green) and moss (olive), favouring the shaded, north-facing slopes
    float north = smoothstep(-0.2, 0.6, -n.z);
    float lichen = smoothstep(0.66, 0.74, ag_fbm(p.xz * 1.3 + 11.0 + uAgeSeed));
    float moss = smoothstep(0.68, 0.78, ag_fbm(p.xz * 0.8 + 3.0 + uAgeSeed)) * (0.3 + 0.7 * north);
    c = mix(c, c * vec3(1.05, 1.1, 0.95) + vec3(0.03, 0.035, 0.02), lichen * 0.45 * uAgeStrength);
    c = mix(c, c * vec3(0.55, 0.62, 0.4), moss * 0.55 * uAgeStrength);
    // dark runs down the slope
    vec2 dn = normalize(n.xz + 1e-5);
    float across = dot(p.xz, vec2(-dn.y, dn.x));
    c *= 1.0 - 0.22 * uAgeStrength * smoothstep(0.55, 0.85, ag_noise(vec2(across * 2.3, p.y * 0.4 + uAgeSeed)));
    diffuseColor.rgb = c;
  }
`;

export interface AgeOptions { ground?: number; strength?: number; seed?: number; roof?: boolean }

export function age(m: THREE.Material, opts: AgeOptions = {}): THREE.Material {
  const own = m.onBeforeCompile;
  const ownKey = m.customProgramCacheKey();
  const uniforms = {
    uAgeGround: { value: opts.ground ?? -1000 },
    uAgeStrength: { value: opts.strength ?? 1 },
    uAgeSeed: { value: opts.seed ?? 0 },
  };
  m.onBeforeCompile = (shader, renderer) => {
    own.call(m, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vAgeWorld; varying vec3 vAgeNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vAgeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vAgeNormal = mat3(modelMatrix) * objectNormal;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vAgeWorld; varying vec3 vAgeNormal;
        uniform float uAgeGround; uniform float uAgeStrength; uniform float uAgeSeed;
        ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${opts.roof ? ROOF : WALL}`);
  };
  if (!opts.roof) {
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      prev.call(m, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 pw = vAgeWorld; vec3 nw = normalize(vAgeNormal);
          vec2 qq = abs(nw.y) < 0.7 ? vec2(dot(pw.xz, normalize(vec2(-nw.z, nw.x) + 1e-5)), pw.y) : pw.xz;
          float hgt = ag_fbm(qq * 1.4) * 0.014 + ag_noise(qq * 6.5) * 0.0025;  // hand-laid render, metres
          vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
          vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
          float det = dot(dpdx, r1);
          vec3 grad = sign(det) * (dFdx(hgt) * r1 + dFdy(hgt) * r2);
          vec3 bumped = abs(det) * normal - grad;
          normal = dot(bumped, bumped) > 1e-20 ? normalize(bumped) : normal;   // (a zero vector would put a NaN on screen, and bloom spreads it)
        }`);
    };
  }
  m.customProgramCacheKey = () => `${ownKey}|age-${opts.roof ? 'roof' : 'wall'}`;
  m.needsUpdate = true;
  return m;
}
