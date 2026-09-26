import * as THREE from 'three';

const loader = new THREE.TextureLoader();

function tex(url: string, srgb: boolean, anisotropy: number): THREE.Texture {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

function pbrSet(id: string, anisotropy: number) {
  const base = `/assets/tex/${id}`;
  return {
    map: tex(`${base}/diff.jpg`, true, anisotropy),
    normalMap: tex(`${base}/nor.jpg`, false, anisotropy),
    roughnessMap: tex(`${base}/rough.jpg`, false, anisotropy),
  };
}

/** Rounded fieldstone cobbles for streets and the square. */
export function createGroundMaterial(anisotropy: number): THREE.MeshStandardMaterial {
  // Warm, sandy tint: the period views show dusty ochre paving, not grey stone.
  const m = new THREE.MeshStandardMaterial({ ...pbrSet('cobblestone_floor_08', anisotropy), color: '#f2e2c4', vertexColors: true, roughness: 1 });
  m.normalScale.set(1.3, 1.3);
  // Dry, dusty stone: no sheen at grazing angles.
  m.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, 0.82);',
    );
  };
  return m;
}

/** Weathered timber for fences, barrels, carts and stalls. */
export function createWoodMaterial(anisotropy: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ ...pbrSet('weathered_planks', anisotropy), roughness: 1 });
}

function worldTex(id: string, map: string, srgb: boolean, anisotropy: number, tile: number): THREE.Texture {
  const t = tex(`/assets/tex/${id}/${map}.jpg`, srgb, anisotropy);
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
function plasterMaterial(tint: string, anisotropy: number, tile = 2.5): THREE.MeshStandardMaterial {
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
  const wall = plaster('#efe5cf');
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
  const stone = plaster('#f4efe4');
  const plinth = plaster('#b3aea4', 1.6);
  const roof = new THREE.MeshStandardMaterial({
    roughness: 1,
    map: worldTex('clay_roof_tiles', 'diff', true, anisotropy, 2.2),
    normalMap: worldTex('clay_roof_tiles', 'nor', false, anisotropy, 2.2),
    roughnessMap: worldTex('clay_roof_tiles', 'rough', false, anisotropy, 2.2),
    side: THREE.DoubleSide,
  });
  const glass = new THREE.MeshStandardMaterial({ map: windowPaneTexture(), roughness: 0.25, metalness: 0 });
  const wood = new THREE.MeshStandardMaterial({
    color: '#6b5240', roughness: 1,
    map: worldTex('weathered_planks', 'diff', true, anisotropy, 1.2),
    normalMap: worldTex('weathered_planks', 'nor', false, anisotropy, 1.2),
  });
  return { wall, stone, plinth, roof, glass, wood };
}

/** Materials for St Casimir's (simplified): plaster, lead-grey sheet roofs, copper cupolas, gilt crown. */
export function createChurchMaterials(anisotropy: number) {
  return {
    wall: plasterMaterial('#ebdfc6', anisotropy),
    stone: plasterMaterial('#f3eee3', anisotropy),
    roof: new THREE.MeshStandardMaterial({ color: '#6c7277', metalness: 0.45, roughness: 0.55, side: THREE.DoubleSide }),
    dome: new THREE.MeshStandardMaterial({ color: '#5c8574', metalness: 0.35, roughness: 0.6, side: THREE.DoubleSide }),
    gilt: new THREE.MeshStandardMaterial({ color: '#c9a44e', metalness: 1, roughness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: '#1d1b19', roughness: 0.9, side: THREE.DoubleSide }),
  };
}

/** The Town Hall promenade and the market booth (from the period views, docs/REFERENCES.md §4.5). */
export function createPromenadeMaterials(anisotropy: number) {
  return {
    stone: plasterMaterial('#e6ddcb', anisotropy, 1.5),
    wood: createWoodMaterial(anisotropy),
    bark: new THREE.MeshStandardMaterial({ color: '#4a3b2c', roughness: 1 }),
    leaves: new THREE.MeshStandardMaterial({ color: '#6f8248', roughness: 0.95 }),
    gravel: new THREE.MeshStandardMaterial({
      color: '#c8b28a', roughness: 1,
      map: worldTex('plastered_wall_04', 'diff', true, anisotropy, 3),
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }),
    roof: new THREE.MeshStandardMaterial({
      color: '#d9b8a6', roughness: 0.9,
      map: worldTex('clay_roof_tiles', 'diff', true, anisotropy, 2.2),
      normalMap: worldTex('clay_roof_tiles', 'nor', false, anisotropy, 2.2),
    }),
  };
}
export type PromenadeMaterials = ReturnType<typeof createPromenadeMaterials>;

/** Hand-made clay tile roofs. */
export function createRoofMaterial(anisotropy: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ ...pbrSet('clay_roof_tiles', anisotropy), vertexColors: true, roughness: 1 });
  m.side = THREE.DoubleSide; // skeleton faces are thin; show them from below the eave too
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
    float groundF = 4.0, upperF = 3.4;
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
