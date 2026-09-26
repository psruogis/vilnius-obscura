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
    // where the limewash has worn thin, mostly low down: slightly darker and greyer, soft-edged
    float flake = smoothstep(0.66, 0.78, hw_fbm(vec2(u * 0.7, h * 0.7) + seed * 23.0)) * (1.0 - smoothstep(0.5, 3.5, h));
    c = mix(c, c * vec3(0.82, 0.8, 0.77), flake * 0.6);
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
          float sill = 4.4 + float(k - 1) * 3.7 + 0.85;
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

function windowAtlas(): { map: THREE.CanvasTexture; rough: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  // 2 x 2 variants. Each cell is stretched over a window about 1.05 m wide and 1.8 m tall.
  const S = 512, C = 256;
  const col = document.createElement('canvas'); col.width = col.height = S;
  const rgh = document.createElement('canvas'); rgh.width = rgh.height = S;
  const glw = document.createElement('canvas'); glw.width = glw.height = S;
  const g = col.getContext('2d')!, r = rgh.getContext('2d')!, q = glw.getContext('2d')!;
  q.fillStyle = '#000'; q.fillRect(0, 0, S, S);
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
    if (v === 3) {
      // a lit room: warm light glowing through the curtains, brightest low in the middle
      const rg = q.createRadialGradient(ox + C / 2, oy + C * 0.65, C * 0.05, ox + C / 2, oy + C * 0.6, C * 0.7);
      rg.addColorStop(0, 'rgb(255,214,150)'); rg.addColorStop(1, 'rgb(90,55,25)');
      q.fillStyle = rg; q.fillRect(ox, oy, C, C);
    }
    r.fillStyle = 'rgb(18,18,18)'; r.fillRect(ox, oy, C, C); // glass: glossy
    // Frame and glazing bars: white-painted wood
    const frame = (x: number, y: number, w: number, h: number) => {
      g.fillStyle = '#e8e3d6'; g.fillRect(ox + x, oy + y, w, h);
      q.fillStyle = '#000'; q.fillRect(ox + x, oy + y, w, h);
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
  const glow = new THREE.CanvasTexture(glw); glow.colorSpace = THREE.SRGBColorSpace;
  return { map, rough, glow };
}

/** Four lit shop interiors seen through the glass: back wall, shelves of goods, counter, lamp glow. */
function shopInteriors(): THREE.CanvasTexture {
  const S = 1024, C = 512, R = 256;
  const c = document.createElement('canvas'); c.width = S; c.height = S / 2;
  const g = c.getContext('2d')!;
  let seed = 3;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const walls = ['#8a6a44', '#6e5a48', '#7a5a3a', '#5e5044'];
  const goods = [['#c9b27a', '#8a3a2a', '#e0d4b0', '#4a5a3a', '#b08a4a'], ['#3a3a4a', '#6a4a6a', '#c8c0b0', '#8a6a4a', '#2a4a5a'],
    ['#d8c090', '#b07040', '#e8dcc0', '#905030', '#f0e0b0'], ['#6a7a8a', '#c0a060', '#4a3a2a', '#d0c8b8', '#8a2a2a']];
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * C, oy = Math.floor(v / 2) * R;
    const grd = g.createRadialGradient(ox + C * 0.5, oy + R * 0.2, 10, ox + C * 0.5, oy + R * 0.5, C * 0.7);
    grd.addColorStop(0, '#f2d9a8'); grd.addColorStop(0.35, walls[v]); grd.addColorStop(1, '#2a2218');
    g.fillStyle = grd; g.fillRect(ox, oy, C, R);
    // shelves with goods
    for (let sh = 0; sh < 4; sh++) {
      const y = oy + 30 + sh * 45;
      g.fillStyle = '#3a2a1c'; g.fillRect(ox + 12, y + 28, C - 24, 6);
      for (let x = ox + 16; x < ox + C - 24;) {
        const w = 8 + r() * 22, h = 10 + r() * 18;
        g.fillStyle = goods[v][Math.floor(r() * 5)];
        if (r() < 0.4) { g.beginPath(); g.ellipse(x + w / 2, y + 28 - h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill(); }
        else g.fillRect(x, y + 28 - h, w, h);
        g.fillStyle = 'rgba(255,240,210,0.35)'; g.fillRect(x + 2, y + 28 - h + 2, 2, h - 4);   // highlight
        x += w + 3 + r() * 6;
      }
    }
    // counter and a display in front
    g.fillStyle = '#4a3422'; g.fillRect(ox, oy + R - 52, C, 52);
    g.fillStyle = '#6a4a30'; g.fillRect(ox, oy + R - 56, C, 6);
    for (let k = 0; k < 6; k++) { g.fillStyle = goods[v][k % 5]; g.fillRect(ox + 30 + k * 78, oy + R - 80, 40, 26); }
    // hanging lamp glow
    const lg = g.createRadialGradient(ox + C * 0.5, oy + 22, 2, ox + C * 0.5, oy + 22, 60);
    lg.addColorStop(0, 'rgba(255,236,190,0.95)'); lg.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = lg; g.fillRect(ox + C * 0.5 - 60, oy, 120, 90);
    // window reflection streaks
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.beginPath(); g.moveTo(ox + 60, oy); g.lineTo(ox + 150, oy); g.lineTo(ox + 60, oy + R); g.lineTo(ox - 30, oy + R); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** Shop signboards c.1900 (Polish, Russian and German lettering as in the period photographs), 16 rows. */
export const SIGN_ROWS = 16;
function signAtlas(): THREE.CanvasTexture {
  const W = 1024, H = 64;
  const c = document.createElement('canvas'); c.width = W; c.height = H * SIGN_ROWS;
  const g = c.getContext('2d')!;
  const names = ['KONFEKCJA', 'CUKIERNIA', 'APTEKA', 'M. SALIT', 'ZAWADZKI', 'GALANTERJA', 'KOLONJALNE TOWARY', 'ZEGARMISTRZ',
    'KAPELUSZE', 'OBUWIE', 'БАКАЛЕЙНАЯ ТОРГОВЛЯ', 'ХЛѢБЪ', 'HERBATA I KAWA', 'FRYZJER', 'P. LANEMAN', 'SKŁAD SUKNA'];
  const bgs = ['#1e2a22', '#e8dcc0', '#5a1e1a', '#1c2238', '#2a241e', '#cdb682', '#3a4a3a', '#efe6d2'];
  const fg = (bg: string) => (['#e8dcc0', '#cdb682', '#efe6d2'].includes(bg) ? '#2a2018' : '#e4c878');
  for (let i = 0; i < SIGN_ROWS; i++) {
    const y = i * H, bg = bgs[i % bgs.length];
    g.fillStyle = bg; g.fillRect(0, y, W, H);
    g.strokeStyle = fg(bg); g.globalAlpha = 0.7; g.lineWidth = 3; g.strokeRect(6, y + 6, W - 12, H - 12); g.globalAlpha = 1;
    g.fillStyle = fg(bg); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${names[i].length > 14 ? 34 : 42}px Georgia, "Times New Roman", serif`;
    g.fillText(names[i], W / 2, y + H / 2 + 2);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
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

  const { map, rough, glow } = windowAtlas();
  // emissiveIntensity is raised in the rain (a quarter of the windows show a lit room)
  const glass = new THREE.MeshStandardMaterial({ map, roughnessMap: rough, roughness: 1, metalness: 0, envMapIntensity: 1.8,
    emissive: new THREE.Color('#ffffff'), emissiveMap: glow, emissiveIntensity: 0 });

  const wood = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.85,
    map: worldTex('weathered_planks', 'diff', true, anisotropy, 1.1),
    normalMap: worldTex('weathered_planks', 'nor', false, anisotropy, 1.1),
    roughnessMap: worldTex('weathered_planks', 'rough', false, anisotropy, 1.1),
  });
  age(wood, { strength: 0.6, seed: 5 });
  // striped awning canvas (stripes run down the slope; colour from vertex colours)
  const sc = document.createElement('canvas'); sc.width = 64; sc.height = 4;
  const sg = sc.getContext('2d')!;
  for (let x = 0; x < 64; x += 16) { sg.fillStyle = '#ffffff'; sg.fillRect(x, 0, 8, 4); sg.fillStyle = '#b8ad98'; sg.fillRect(x + 8, 0, 8, 4); }
  const stripe = new THREE.CanvasTexture(sc); stripe.colorSpace = THREE.SRGBColorSpace; stripe.wrapS = stripe.wrapT = THREE.RepeatWrapping; stripe.repeat.set(1 / 0.6, 1);
  const canvas = new THREE.MeshStandardMaterial({ vertexColors: true, map: stripe, roughness: 0.95, side: THREE.DoubleSide });
  const iron = new THREE.MeshStandardMaterial({ color: '#1f1d1b', roughness: 0.55, metalness: 0.6 });
  // shop display windows: lit interiors with shelves and goods, 4 cells (2 x 2)
  const shopGlass = new THREE.MeshStandardMaterial({ map: shopInteriors(), vertexColors: true, emissive: new THREE.Color('#ffffff'), roughness: 0.12, metalness: 0, envMapIntensity: 1.2 });
  shopGlass.emissiveMap = shopGlass.map; shopGlass.emissiveIntensity = 0.55;
  // lettered signboards (16 rows)
  const signs = new THREE.MeshStandardMaterial({ map: signAtlas(), roughness: 0.7 });
  // painted sheet-metal roofing (hero buildings)
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide });
  return { wall, trim, glass, wood, canvas, iron, metal, shopGlass, signs };
}
export type HouseMaterials = ReturnType<typeof createHouseMaterials>;
