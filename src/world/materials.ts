import * as THREE from 'three';
import { age } from './ageing';
import { parallax } from '../render/pom';
import { createTreeMaterials } from './trees';

const loader = new THREE.TextureLoader();

// One image load (and one GPU upload) per file: materials get clones that share the image source but
// keep their own tiling. Clones made before the image arrives are flagged for upload when it does.
const cache = new Map<string, { base: THREE.Texture; loaded: boolean; clones: THREE.Texture[] }>();

function tex(url: string, srgb: boolean, anisotropy: number): THREE.Texture {
  let entry = cache.get(url);
  if (!entry) {
    const e = { base: null as unknown as THREE.Texture, loaded: false, clones: [] as THREE.Texture[] };
    e.base = loader.load(url, () => { e.loaded = true; for (const c of e.clones) c.needsUpdate = true; });
    cache.set(url, (entry = e));
  }
  const t = entry.base.clone();
  entry.clones.push(t);
  if (entry.loaded) t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

/** Colour, normal and roughness maps; `packed` sets read roughness (G) and ambient occlusion (R) from one arm.jpg. */
function pbrSet(id: string, anisotropy: number, packed = false) {
  const base = `assets/tex/${id}`;
  const arm = packed ? tex(`${base}/arm.jpg`, false, anisotropy) : null;
  return {
    map: tex(`${base}/diff.jpg`, true, anisotropy),
    normalMap: tex(`${base}/nor.jpg`, false, anisotropy),
    roughnessMap: arm ?? tex(`${base}/rough.jpg`, false, anisotropy),
    ...(arm ? { aoMap: arm } : {}),
  };
}

/** Poly Haven height ('Displacement') map for parallax, 0 = deepest joint … 1 = top. */
function heightMap(id: string): THREE.Texture {
  return tex(`assets/tex/${id}/height.jpg`, false, 1);
}

/** Sets the tiling of every map of a material at once (parallax needs them to share one UV). */
function tile<T extends THREE.MeshStandardMaterial>(m: T, repeat: number): T {
  for (const t of [m.map, m.normalMap, m.roughnessMap, m.aoMap]) t?.repeat.set(repeat, repeat);
  return m;
}

// Real sizes of the Poly Haven scans: cobblestone_floor_08 is 2 m square, clay_roof_tiles 4 m.
// The cobbles are laid at 3.4 m (larger, rounder fieldstones, as in the period photographs); the tiles
// at their true size: monk-and-nun barrel tiles about 15 cm across.
const ROOF_TILE_M = 4.0;

// Large-scale variation across the square, so the 3.4 m repeat doesn't read from standing height:
// patches of greyer and of warmer, sandier stone, darker trodden ground. In texture repeats (3.4 m).
const GROUND_MACRO = /* glsl */ `
  {
    vec2 q = vMapUv;
    float m1 = gr_noise(q * 0.47), m2 = gr_noise(q * 1.9 + 7.3), m3 = gr_noise(q * 0.16 + 3.1);
    diffuseColor.rgb *= 0.84 + 0.2 * m1 + 0.12 * m2;
    float grey = dot(diffuseColor.rgb, vec3(0.3333));
    diffuseColor.rgb = mix(diffuseColor.rgb, grey * vec3(0.97, 0.99, 1.03), smoothstep(0.5, 0.85, m3) * 0.45);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.06, 1.0, 0.9), smoothstep(0.55, 0.9, 1.0 - m3) * 0.5);
  }
`;
const GROUND_NOISE = /* glsl */ `
  float gr_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float gr_noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(gr_hash(i), gr_hash(i + vec2(1, 0)), u.x), mix(gr_hash(i + vec2(0, 1)), gr_hash(i + vec2(1, 1)), u.x), u.y); }
`;

/** Rounded fieldstone cobbles for streets and the square: real relief (parallax), no visible repeat. */
export function createGroundMaterial(anisotropy: number): THREE.MeshStandardMaterial {
  // Warm, sandy tint: the period views show dusty ochre paving, not grey stone.
  const m = new THREE.MeshStandardMaterial({ ...pbrSet('cobblestone_floor_08', anisotropy, true), color: '#f2e2c4', vertexColors: true, roughness: 1 });
  m.normalScale.set(1.3, 1.3);
  m.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GROUND_NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${GROUND_MACRO}`)
      // Dry, dusty stone: no sheen at grazing angles. Broad patches of more and less worn stone
      // (the rain shows them as glossier and duller stretches of paving).
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, 0.82) * (0.88 + 0.24 * gr_noise(vMapUv * 0.6 + 2.7));');
  };
  // Joints 5 cm deep; laid in irregular patches of about 2.5 repeats (8 m) that meet stone against stone.
  return parallax(m, { heightMap: heightMap('cobblestone_floor_08'), depth: 0.05, minSteps: 8, maxSteps: 28, fadeStart: 16, fadeEnd: 30, antiTile: 2.5, shadow: true, cavity: 0.4 });
}

/** Weathered timber for fences, barrels, carts and stalls. */
export function createWoodMaterial(anisotropy: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ ...pbrSet('weathered_planks', anisotropy), roughness: 1 });
}

export function worldTex(id: string, map: string, srgb: boolean, anisotropy: number, tile: number): THREE.Texture {
  const t = tex(`assets/tex/${id}/${map}.jpg`, srgb, anisotropy);
  t.repeat.set(1 / tile, 1 / tile);
  return t;
}

/** Small-paned casement glass, drawn once to a canvas. */
function windowPaneTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 96; c.height = 160;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 96, 160);
  grad.addColorStop(0, '#2a3238'); grad.addColorStop(1, '#161b1f');
  g.fillStyle = grad; g.fillRect(0, 0, 96, 160);
  g.strokeStyle = '#e9e4d8'; g.lineWidth = 4; g.strokeRect(2, 2, 92, 156);
  g.lineWidth = 3;
  for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo((96 * i) / 3, 0); g.lineTo((96 * i) / 3, 160); g.stroke(); }
  for (let j = 1; j < 4; j++) { g.beginPath(); g.moveTo(0, (160 * j) / 4); g.lineTo(96, (160 * j) / 4); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

  // The plaster texture only modulates the tint (its own mean brightness is divided out).
const PLASTER_DETAIL = `{
    float lum = dot(sampledDiffuseColor.rgb, vec3(0.3333)) / 0.42;
    diffuseColor.rgb = diffuse * clamp(lum, 0.82, 1.12);
  }`;
export function plasterMaterial(tint: string, anisotropy: number, tile = 2.5): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({
      color: tint, roughness: 1,
      map: worldTex('plastered_wall_04', 'diff', true, anisotropy, tile),
      normalMap: worldTex('plastered_wall_04', 'nor', false, anisotropy, tile),
      roughnessMap: worldTex('plastered_wall_04', 'rough', false, anisotropy, tile),
    });
    m.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n${PLASTER_DETAIL}`);
    };
    return m;
}

/** Materials for the Town Hall model (UVs in metres). */
export function createTownHallMaterials(anisotropy: number) {
  const plaster = (tint: string, tile = 2.5) => plasterMaterial(tint, anisotropy, tile);
  // Rusticated plaster: horizontal courses with staggered joints, pressed into the render.
  // Honey-coloured sandstone render, as in Zaleski's view of the square
  const wall = plaster('#dcc091');
  wall.normalScale.set(0.5, 0.5);
  wall.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n${PLASTER_DETAIL}\n#include <map_fragment_rust>`);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMetres;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMetres = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMetres;')
      .replace('#include <map_fragment_rust>', `
        {
          float course = 0.62, block = 1.5;
          float row = floor(vMetres.y / course);
          float fy = fract(vMetres.y / course);
          float fx = fract((vMetres.x + mod(row, 2.0) * block * 0.5) / block);
          float gy = 1.0 - smoothstep(0.0, 0.035, fy) * smoothstep(1.0, 0.965, fy);
          float gx = 1.0 - smoothstep(0.0, 0.012, fx) * smoothstep(1.0, 0.988, fx);
          diffuseColor.rgb *= 1.0 - 0.2 * max(gy, gx * 0.8);
        }`);
  };
  const stone = plaster('#e3cb9c');
  const plinth = plaster('#a8998a', 1.6);
  const roof = tileRoof(new THREE.MeshStandardMaterial({ ...pbrSet('clay_roof_tiles', anisotropy, true), roughness: 1, color: '#b98f7c', side: THREE.DoubleSide }), 1);
  const glass = new THREE.MeshStandardMaterial({ map: windowPaneTexture(), roughness: 0.25, metalness: 0 });
  const wood = new THREE.MeshStandardMaterial({
    color: '#6b5240', roughness: 1,
    map: worldTex('weathered_planks', 'diff', true, anisotropy, 1.2),
    normalMap: worldTex('weathered_planks', 'nor', false, anisotropy, 1.2),
  });
  return { wall, stone, plinth, roof, glass, wood };
}

/** Materials for St Casimir's (simplified): plaster, lead-grey sheet roofs, copper cupolas, gilt crown. */
/**
 * Three painted icons for the niches of St Casimir's in its Orthodox years (the 1915-18 postcard shows
 * saints in colour where the Catholic church had statues): standing figures with haloes on gold,
 * side by side on one canvas, a third each. Drawn here, so there is no image to license.
 */
function iconTexture(anisotropy: number): THREE.Texture {
  const W = 384, H = 384, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const panel = (i: number, robe: string, mantle: string, book: boolean) => {
    const x = i * 128;
    g.fillStyle = '#3e2416'; g.fillRect(x, 0, 128, H);                       // the frame
    const gold = g.createLinearGradient(0, 0, 0, H);
    gold.addColorStop(0, '#a88a48'); gold.addColorStop(1, '#6e5328');
    g.fillStyle = gold; g.fillRect(x + 7, 7, 114, H - 14);
    g.fillStyle = '#7a6a3a'; g.fillRect(x + 7, H - 40, 114, 33);             // the ground they stand on
    g.fillStyle = '#c9aa5e'; g.beginPath(); g.arc(x + 64, 92, 25, 0, Math.PI * 2); g.fill();   // halo
    g.strokeStyle = '#8a5a2a'; g.lineWidth = 2; g.stroke();
    g.fillStyle = robe; g.beginPath();                                         // robe
    g.moveTo(x + 48, 116); g.lineTo(x + 80, 116); g.lineTo(x + 90, 346); g.lineTo(x + 38, 346); g.closePath(); g.fill();
    g.fillStyle = mantle; g.beginPath();                                       // mantle over the left shoulder
    g.moveTo(x + 44, 118); g.lineTo(x + 74, 122); g.quadraticCurveTo(x + 66, 230, x + 84, 300); g.lineTo(x + 40, 346); g.lineTo(x + 36, 200); g.closePath(); g.fill();
    g.fillStyle = '#b88a60'; g.beginPath(); g.ellipse(x + 64, 94, 11, 15, 0, 0, Math.PI * 2); g.fill();   // face
    g.fillStyle = '#4a3222'; g.beginPath(); g.ellipse(x + 64, 106, 10, 8, 0, 0, Math.PI); g.fill();        // beard
    g.fillStyle = '#b88a60'; g.beginPath(); g.ellipse(x + 76, 168, 6, 8, 0, 0, Math.PI * 2); g.fill();     // raised hand
    if (book) { g.fillStyle = '#8a2a1e'; g.fillRect(x + 50, 176, 22, 28); g.fillStyle = '#d8b35c'; g.fillRect(x + 58, 184, 6, 12); }
  };
  panel(0, '#7d2b22', '#2c3f5a', true);
  panel(1, '#2c3f5a', '#8a2a1e', true);
  panel(2, '#3f5a3a', '#7d2b22', false);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

export function createChurchMaterials(anisotropy: number) {
  return {
    wall: plasterMaterial('#d8b47e', anisotropy),
    stone: plasterMaterial('#e2c594', anisotropy),
    roof: new THREE.MeshStandardMaterial({ color: '#7e4a3a', metalness: 0.15, roughness: 0.7, side: THREE.DoubleSide }),
    dome: new THREE.MeshStandardMaterial({ color: '#8a4a36', metalness: 0.25, roughness: 0.6, side: THREE.DoubleSide }),
    gilt: new THREE.MeshStandardMaterial({ color: '#c9a44e', metalness: 1, roughness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: '#1d1b19', roughness: 0.9, side: THREE.DoubleSide }),
    bronze: new THREE.MeshStandardMaterial({ color: '#6b5636', metalness: 0.85, roughness: 0.5, side: THREE.DoubleSide }),
    icon: new THREE.MeshStandardMaterial({ map: iconTexture(anisotropy), color: '#d6cec2', roughness: 0.6, metalness: 0.15 }),
    base: plasterMaterial('#b8a7a4', anisotropy),
  };
}

/** The Town Hall promenade and the market booth (from the period views, docs/REFERENCES.md §4.5). */
export function createPromenadeMaterials(anisotropy: number) {
  return {
    stone: age(plasterMaterial('#cdbb98', anisotropy, 1.5), { strength: 1.1, seed: 6 }) as THREE.MeshStandardMaterial, // weathered sandstone posts
    wood: createWoodMaterial(anisotropy),
    bark: new THREE.MeshStandardMaterial({ color: '#5a4a3a', roughness: 1, map: worldTex('weathered_planks', 'diff', true, anisotropy, 0.6) }),
    leaves: createTreeMaterials(new THREE.MeshStandardMaterial()).leaves,
    lawn: new THREE.MeshStandardMaterial({
      color: '#5b6e37', roughness: 1,
      map: worldTex('plastered_wall_04', 'diff', true, anisotropy, 1.2),
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }),
    water: new THREE.MeshStandardMaterial({ color: '#2f3b3a', roughness: 0.04, metalness: 0.2 }),
    iron: new THREE.MeshStandardMaterial({ color: '#23231f', roughness: 0.5, metalness: 0.55 }),
    lampGlass: new THREE.MeshStandardMaterial({ color: '#d8d4c4', roughness: 0.15, metalness: 0, transparent: true, opacity: 0.75, emissive: new THREE.Color('#ffcf8a'), emissiveIntensity: 0.0 }),
    gravel: new THREE.MeshStandardMaterial({
      color: '#c8b28a', roughness: 1,
      map: worldTex('plastered_wall_04', 'diff', true, anisotropy, 3),
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }),
    roof: tileRoof(new THREE.MeshStandardMaterial({ ...pbrSet('clay_roof_tiles', anisotropy, true), color: '#d9b8a6', roughness: 0.9 }), 1),
  };
}
export type PromenadeMaterials = ReturnType<typeof createPromenadeMaterials>;

/** Market stalls, carts and their goods. */
export function createMarketMaterials(anisotropy: number) {
  const plain = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  return {
    wood: createWoodMaterial(anisotropy),
    canvas: new THREE.MeshStandardMaterial({ color: '#d9ceb6', roughness: 1, side: THREE.DoubleSide }),
    goods: [plain('#6f8a45'), plain('#9a3b2a'), plain('#c9b48a'), plain('#b7894a'), plain('#a08a64')], // cabbages, apples, turnips, onions, sacks
  };
}

/** Painted sheet-metal roofs with standing seams (most roofs c.1900). */
export function createMetalRoofMaterial(): THREE.MeshStandardMaterial {
  const c = document.createElement('canvas'); c.width = 64; c.height = 8;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 8);
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 3, 8);                       // seam shadow
  g.fillStyle = '#f0f0f0'; g.fillRect(3, 0, 2, 8);                       // seam highlight
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2.2 / 0.6, 1);   // roof UVs are in 2.2 m units: a seam every 0.6 m along the eave
  const m = new THREE.MeshStandardMaterial({ map: t, vertexColors: true, roughness: 0.5, metalness: 0.35, side: THREE.DoubleSide });
  return m;
}

/** Clay tiles at their true size with parallax relief; `uvUnit` = metres per UV unit of the roof geometry. */
function tileRoof(m: THREE.MeshStandardMaterial, uvUnit: number): THREE.MeshStandardMaterial {
  tile(m, uvUnit / ROOF_TILE_M);
  // Barrel tiles: the courses stand ~4 cm proud of the gaps between them.
  return parallax(m, { heightMap: heightMap('clay_roof_tiles'), depth: 0.04, minSteps: 6, maxSteps: 20, fadeStart: 22, fadeEnd: 40, shadow: true, cavity: 0.3 });
}

/** Hand-made clay tile roofs (skeleton roof UVs are in 2.2 m units, buildings.ts). */
export function createRoofMaterial(anisotropy: number): THREE.MeshStandardMaterial {
  const m = tileRoof(new THREE.MeshStandardMaterial({ ...pbrSet('clay_roof_tiles', anisotropy, true), vertexColors: true, roughness: 1 }), 2.2);
  m.side = THREE.DoubleSide; // skeleton faces are thin; show them from below the eave too
  age(m, { roof: true, strength: 1 });
  return m;
}

// GLSL for c.1800 façades, drawn procedurally in façade space:
// vFacade = (u along the wall, h above ground, wall length L, seed), vInfo = (eave, role, style, 0)
const FACADE_FRAGMENT = /* glsl */ `
  float hash1(float n) { return fract(sin(n) * 43758.5453123); }
  float box(vec2 p, vec2 lo, vec2 hi) { return step(lo.x, p.x) * step(p.x, hi.x) * step(lo.y, p.y) * step(p.y, hi.y); }

  vec3 facadeColor(vec3 wall, out float glassMask) {
    glassMask = 0.0;
    float u = vFacade.x, h = vFacade.y, L = vFacade.z, seed = vFacade.w;
    float eave = vInfo.x, role = vInfo.y, style = vInfo.z;
    vec3 col = wall;

    // Plinth and ground grime
    col *= mix(0.72, 1.0, smoothstep(0.0, 0.6, h));
    col = mix(vec3(0.46, 0.43, 0.39), col, smoothstep(0.35, 0.45, h));

    // Cornice under the eave, and a thin string course at each floor line
    float groundF = 4.4, upperF = 3.7;
    float cornice = smoothstep(eave - 0.55, eave - 0.45, h);
    col = mix(col, wall * 1.08 + 0.03, cornice);
    col *= 1.0 - 0.35 * smoothstep(eave - 0.62, eave - 0.55, h) * (1.0 - smoothstep(eave - 0.55, eave - 0.52, h));

    if (role > 0.5 && role < 2.5) return col; // hero buildings get real geometry later

    float storeyIdx = h < groundF ? 0.0 : 1.0 + floor((h - groundF) / upperF);
    float fy = h < groundF ? h : mod(h - groundF, upperF);
    float upperStoreys = floor(max(eave - groundF - 0.6, 0.0) / upperF + 0.05); // complete upper floors (tolerant of float error)
    if (storeyIdx > upperStoreys + 0.5) return col;                       // attic band: blank
    if (h > eave - 0.7) return col;
    float course = storeyIdx > 0.5 ? (1.0 - smoothstep(0.0, 0.12, fy)) : 0.0;
    col = mix(col, wall * 1.06, course * 0.6);

    // Window bays, centred on the wall, kept clear of the corners
    float bay = mix(2.9, 3.6, hash1(style * 17.0 + 1.0));
    float usable = L - 1.4;
    if (usable < 1.6) return col;
    float nb = max(1.0, floor(usable / bay));
    float bayW = usable / nb;
    float bu = (u - 0.7) / bayW;
    if (bu < 0.0 || bu >= nb) return col;
    float bi = floor(bu);
    float x = (fract(bu) - 0.5) * bayW;

    vec3 frameC = vec3(0.93, 0.91, 0.86);
    vec3 glassC = vec3(0.10, 0.12, 0.14);
    float sh = hash1(style * 31.0 + 7.0);
    vec3 shutterC = sh < 0.33 ? vec3(0.22, 0.30, 0.22) : (sh < 0.66 ? vec3(0.32, 0.22, 0.15) : vec3(0.40, 0.42, 0.40));
    bool shutters = hash1(style * 13.0 + 3.0) > 0.45;

    if (storeyIdx < 0.5) {
      // Ground floor: a vaulted doorway every few bays, small barred windows between.
      float doorEvery = 2.0 + floor(hash1(style * 5.0) * 2.0);
      bool door = mod(bi + floor(hash1(seed * 9.0) * doorEvery), doorEvery) < 0.5;
      if (door) {
        float w = 0.8, top = 2.4;
        float r = length(vec2(x, (fy - top) * 1.0));
        float opening = box(vec2(x, fy), vec2(-w, 0.0), vec2(w, top)) + step(fy, top + w) * step(top, fy) * step(r, w);
        float surround = box(vec2(x, fy), vec2(-w - 0.14, 0.0), vec2(w + 0.14, top)) + step(fy, top + w + 0.14) * step(top, fy) * step(r, w + 0.14);
        col = mix(col, frameC * 0.9, clamp(surround, 0.0, 1.0));
        vec3 wood = vec3(0.24, 0.16, 0.10) * (0.85 + 0.15 * step(0.5, fract(x * 4.0)));
        col = mix(col, wood, clamp(opening, 0.0, 1.0));
      } else {
        float w = 0.45, lo = 1.3, hi = 2.5;
        float win = box(vec2(x, fy), vec2(-w, lo), vec2(w, hi));
        float frame = box(vec2(x, fy), vec2(-w - 0.1, lo - 0.1), vec2(w + 0.1, hi + 0.1));
        col = mix(col, frameC, frame);
        float bars = step(0.9, fract((x + w) * 5.0));
        col = mix(col, mix(glassC, vec3(0.05), bars), win);
        glassMask = win * (1.0 - bars);
      }
      return col;
    }

    // Upper floors: tall small-paned casements with a stucco surround and a sill
    float w = mix(0.52, 0.62, hash1(style * 11.0)), lo = 0.95, hi = lo + mix(1.55, 1.8, hash1(style * 23.0));
    float frame = box(vec2(x, fy), vec2(-w - 0.13, lo - 0.08), vec2(w + 0.13, hi + 0.13));
    float sill = box(vec2(x, fy), vec2(-w - 0.2, lo - 0.14), vec2(w + 0.2, lo - 0.04));
    float win = box(vec2(x, fy), vec2(-w, lo), vec2(w, hi));
    if (shutters) {
      float sL = box(vec2(x, fy), vec2(-2.0 * w - 0.15, lo), vec2(-w - 0.15, hi));
      float sR = box(vec2(x, fy), vec2(w + 0.15, lo), vec2(2.0 * w + 0.15, hi));
      float planks = 0.88 + 0.12 * step(0.5, fract(fy * 6.0));
      col = mix(col, shutterC * planks, clamp(sL + sR, 0.0, 1.0));
    }
    col = mix(col, frameC, frame);
    col = mix(col, frameC * 0.95, sill);
    vec2 pane = vec2((x + w) / (2.0 * w) * 3.0, (fy - lo) / (hi - lo) * 4.0);
    float muntin = max(step(0.93, fract(pane.x)), step(0.93, fract(pane.y)));
    vec3 glass = glassC + 0.06 * hash1(bi + storeyIdx * 7.0 + seed * 3.0);
    col = mix(col, mix(glass, frameC * 0.9, muntin), win);
    glassMask = win * (1.0 - muntin);
    return col;
  }
`;

/** Lime-plastered walls with procedural c.1800 windows, doors and shutters. */
export function createFacadeMaterial(anisotropy: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ ...pbrSet('plastered_wall_04', anisotropy), vertexColors: true, roughness: 1 });
  m.normalScale.set(0.6, 0.6);
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFacade;\nattribute vec4 aInfo;\nvarying vec4 vFacade;\nvarying vec4 vInfo;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFacade = aFacade;\nvInfo = aInfo;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec4 vFacade;\nvarying vec4 vInfo;\nfloat gGlass = 0.0;\n${FACADE_FRAGMENT}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        // The plaster texture is near-white: use its luminance as detail on the limewash tint.
        {
          float detail = dot(diffuseColor.rgb, vec3(0.3333)) / 0.72;
          vec3 wall = vColor.rgb * clamp(detail, 0.82, 1.12);
          diffuseColor.rgb = facadeColor(wall, gGlass);
        }`)
      .replace('#include <color_fragment>', '')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.18, gGlass);');
  };
  return m;
}
