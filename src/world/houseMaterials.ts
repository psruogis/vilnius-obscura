import * as THREE from 'three';
import { plasterMaterial, worldTex } from './materials';
import { age } from './ageing';

/**
 * Materials for the detailed houses (facades.ts). Colours come from vertex colours so one material
 * serves every house. The wall material adds weathering in the shader, laid out from per-vertex façade
 * attributes: patchy limewash, rain streaks under every window sill, grime under the cornice, rising
 * damp at street level.
 */

const NOISE = /* glsl */ `
  float hw_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float hw_noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hw_hash(i), hw_hash(i + vec2(1, 0)), u.x), mix(hw_hash(i + vec2(0, 1)), hw_hash(i + vec2(1, 1)), u.x), u.y);
  }
  float hw_fbm(vec2 p) { return 0.55 * hw_noise(p) + 0.3 * hw_noise(p * 2.13 + 7.1) + 0.15 * hw_noise(p * 4.37 + 3.3); }
`;

const WEATHER = /* glsl */ `
  {
    float u = vWall.x, h = vWall.y, top = vWall.z, seed = vWall.w;
    vec3 c = diffuseColor.rgb;
    // Patchy limewash: broad, soft variation
    c *= 0.84 + 0.24 * hw_fbm(vec2(u * 0.22, h * 0.3) + seed * 17.0);
    // where the limewash has flaked: darker, rougher plaster beneath
    float flake = smoothstep(0.7, 0.74, hw_fbm(vec2(u * 0.7, h * 0.7) + seed * 23.0)) * (0.4 + 0.6 * (1.0 - smoothstep(0.5, 4.5, h)));
    c = mix(c, vec3(0.55, 0.47, 0.4), flake * 0.7);
    // broad, soft staining (no stripes)
    c *= 1.0 - 0.14 * smoothstep(0.5, 0.8, hw_fbm(vec2(u * 0.35, h * 0.18) + seed * 9.0));
    // Rain streaks under each upper window sill
    float u0 = vLayout.x, bayW = vLayout.y, nb = vLayout.z, halfW = vLayout.w, nUp = vLayout2.x;
    float streak = 0.0;
    if (nb > 0.5 && bayW > 0.1) {
      float bu = (u - u0) / bayW;
      if (bu >= 0.0 && bu < nb) {
        float x = (fract(bu) - 0.5) * bayW;
        float across = 1.0 - smoothstep(halfW * 0.55, halfW * 1.2, abs(x));
        for (int k = 1; k <= 5; k++) {
          if (float(k) > nUp + 0.5) break;
          float sill = 4.0 + float(k - 1) * 3.4 + 0.85;
          float below = sill - 0.07 - h;
          if (below > 0.0 && below < 2.4) {
            float n = hw_fbm(vec2(x * 2.2 + seed * 31.0 + float(k) * 3.7, h * 0.35));
            streak = max(streak, across * pow(1.0 - below / 2.4, 1.6) * (0.35 + 0.65 * n));
          }
        }
      }
    }
    c *= 1.0 - 0.22 * streak;
    // Grime under the cornice, with drips
    float drip = hw_noise(vec2(u * 3.0 + seed * 11.0, 0.0));
    float underCornice = smoothstep(top - 1.9 - drip * 0.9, top - 0.8, h) * (1.0 - step(top - 0.78, h));
    c *= 1.0 - 0.26 * underCornice;
    // Rising damp and splash-back at street level
    float edge = 0.9 + 0.5 * hw_fbm(vec2(u * 0.9, seed * 5.0));
    float damp = 1.0 - smoothstep(0.15, edge, h);
    c = mix(c, c * vec3(0.64, 0.6, 0.54), damp * 0.7);
    diffuseColor.rgb = c;
  }
`;

function windowAtlas(): { map: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
  // 2 x 2 variants. Each cell is stretched over a window about 1.05 m wide and 1.8 m tall.
  const S = 512, C = 256;
  const col = document.createElement('canvas'); col.width = col.height = S;
  const rgh = document.createElement('canvas'); rgh.width = rgh.height = S;
  const g = col.getContext('2d')!, r = rgh.getContext('2d')!;
  const pxX = C / 1.05, pxY = C / 1.8; // pixels per metre in each direction
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * C, oy = Math.floor(v / 2) * C;
    // Glass: dark room behind, slight green-blue cast, vertical falloff
    const grad = g.createLinearGradient(0, oy, 0, oy + C);
    grad.addColorStop(0, '#1f282c'); grad.addColorStop(1, '#10161a');
    g.fillStyle = grad; g.fillRect(ox, oy, C, C);
    // Curtains behind the glass in some variants
    if (v === 1 || v === 3) {
      g.fillStyle = v === 1 ? '#b8ab93' : '#8c6f58';
      const cw = C * (v === 1 ? 0.2 : 0.28);
      g.fillRect(ox, oy + C * 0.08, cw, C * 0.92); g.fillRect(ox + C - cw, oy + C * 0.08, cw, C * 0.92);
    }
    if (v === 2) { g.fillStyle = 'rgba(214, 206, 188, 0.55)'; g.fillRect(ox, oy + C * 0.3, C, C * 0.7); } // lace half-curtain
    r.fillStyle = 'rgb(18,18,18)'; r.fillRect(ox, oy, C, C); // glass: glossy
    // Frame and glazing bars: white-painted wood
    const frame = (x: number, y: number, w: number, h: number) => {
      g.fillStyle = '#e8e3d6'; g.fillRect(ox + x, oy + y, w, h);
      r.fillStyle = 'rgb(150,150,150)'; r.fillRect(ox + x, oy + y, w, h);
    };
    const fX = 0.07 * pxX, fY = 0.07 * pxY, bX = 0.03 * pxX, bY = 0.03 * pxY, mX = 0.06 * pxX, tY = 0.06 * pxY;
    frame(0, 0, C, fY); frame(0, C - fY * 1.4, C, fY * 1.4); frame(0, 0, fX, C); frame(C - fX, 0, fX, C);
    const transom = C * 0.27;
    frame(0, transom - tY / 2, C, tY);        // transom
    frame(C / 2 - mX / 2, 0, mX, C);          // central meeting stiles
    // Casements below the transom: two panes wide, three high each; top lights: one pane each side
    for (const side of [0, 1]) {
      const x0 = side ? C / 2 + mX / 2 : fX, x1 = side ? C - fX : C / 2 - mX / 2;
      const xm = (x0 + x1) / 2;
      frame(xm - bX / 2, transom, bX, C - transom - fY);
      for (let j = 1; j < 3; j++) frame(x0, transom + ((C - fY * 1.4 - transom) * j) / 3 - bY / 2, x1 - x0, bY);
    }
  }
  const map = new THREE.CanvasTexture(col); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const rough = new THREE.CanvasTexture(rgh); rough.anisotropy = 8;
  return { map, rough };
}

export function createHouseMaterials(anisotropy: number) {
  const wall = plasterMaterial('#ffffff', anisotropy, 2.5);
  wall.vertexColors = true;
  wall.normalScale.set(0.8, 0.8);
  const plaster = wall.onBeforeCompile;
  wall.onBeforeCompile = (shader, renderer) => {
    plaster.call(wall, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aWall; attribute vec4 aLayout; attribute vec4 aLayout2;
        varying vec4 vWall; varying vec4 vLayout; varying vec4 vLayout2;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vWall = aWall; vLayout = aLayout; vLayout2 = aLayout2;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vWall; varying vec4 vLayout; varying vec4 vLayout2;
        ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${WEATHER}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // hand-laid lime render: gentle waves and trowel marks catch the low sun
          vec2 qq = vWall.xy;
          float hgt = hw_fbm(qq * 1.4 + vWall.w * 13.0) * 0.014 + hw_noise(qq * 6.5) * 0.0025;
          vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
          vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
          float det = dot(dpdx, r1);
          vec3 grad = sign(det) * (dFdx(hgt) * r1 + dFdy(hgt) * r2);
          normal = normalize(abs(det) * normal - grad);
        }`);
  };
  wall.customProgramCacheKey = () => 'house-wall';

  const trim = plasterMaterial('#ffffff', anisotropy, 1.6);
  trim.vertexColors = true;
  trim.normalScale.set(0.5, 0.5);
  trim.customProgramCacheKey = () => 'house-trim';
  age(trim, { strength: 0.8, seed: 3 });

  const { map, rough } = windowAtlas();
  const glass = new THREE.MeshStandardMaterial({ map, roughnessMap: rough, roughness: 1, metalness: 0, envMapIntensity: 1.8 });

  const wood = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.85,
    map: worldTex('weathered_planks', 'diff', true, anisotropy, 1.1),
    normalMap: worldTex('weathered_planks', 'nor', false, anisotropy, 1.1),
    roughnessMap: worldTex('weathered_planks', 'rough', false, anisotropy, 1.1),
  });
  age(wood, { strength: 0.6, seed: 5 });
  return { wall, trim, glass, wood };
}
export type HouseMaterials = ReturnType<typeof createHouseMaterials>;
