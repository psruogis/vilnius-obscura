import * as THREE from 'three';
import { loadArea } from './world/area';
import { buildWalls, buildRoofs } from './world/buildings';
import { Terrain } from './world/terrain';
import { createFacadeMaterial, createGroundMaterial, createRoofMaterial, createTownHallMaterials, createChurchMaterials, createPromenadeMaterials, createMarketMaterials, createWoodMaterial } from './world/materials';
import { buildBarriers } from './world/props';
import { buildTownHall } from './world/townhall';
import { buildStCasimir } from './world/stcasimir';
import { buildPromenade } from './world/promenade';
import { buildMarket, type Market } from './world/market';
import { buildFacades } from './world/facades';
import { createHouseMaterials } from './world/houseMaterials';
import { age } from './world/ageing';
import { Character, TOWNSMAN, TRAVELLER } from './player/character';
import { Ambience } from './audio/ambience';
import { Post } from './render/post';
import { SunShadows } from './render/shadows';
import { WallGrid } from './world/collision';
import { createSky, sunDirection } from './world/sky';
import { Input } from './player/input';
import { Walker } from './player/walker';
import { createOverlay, createStats, showUnsupported, unsupportedReason } from './ui/overlay';

// A late-September afternoon, in Vilnius local mean time (UT + 1h41m): 16:00 LMT.
// Light presets. 'golden' (default) follows Zaleski's view: warm, low sun raking across the portico.
// The portico faces NNE, so only a summer morning sun lights it: 24 Jun 1800, 05:50 local mean time,
// sun ~15° up in the ENE, the market just opening. 'day' is a September afternoon.
// Sun-to-sky ratio is kept high (as in real sunlight) so shadows read; the grade and AO carry the shade.
const LIGHTS = {
  golden: { time: Date.UTC(1800, 5, 24, 4, 10), sun: '#ffc68a', sunI: 9, exposure: 0.55, turbidity: 4.6, fog: '#dccdb8', env: 0.3, hemi: ['#c9d1da', '#b3906a', 0.18] },
  day: { time: Date.UTC(1800, 8, 20, 14, 19), sun: '#fff0d8', sunI: 8, exposure: 0.55, turbidity: 3.2, fog: '#c9d3db', env: 0.32, hemi: ['#c3d5e8', '#a88f6c', 0.2] },
} as const;
const LIGHT = LIGHTS[new URLSearchParams(location.search).get('light') === 'day' ? 'day' : 'golden'];
const SCENE_TIME = new Date(LIGHT.time);

async function main(force = false): Promise<void> {
  const unsupported = unsupportedReason();
  if (unsupported && !force && !new URLSearchParams(location.search).has('force')) {
    // A friendly card, with a way through for people who have a keyboard after all.
    showUnsupported(unsupported, unsupported === 'webgl' ? null : () => main(true).catch(fail));
    return;
  }
  const app = document.getElementById('app')!;
  let ambience: Ambience | null = null;
  const overlay = createOverlay(() => { input.requestLock(); ambience?.start(); });
  THREE.DefaultLoadingManager.onProgress = (_url, loaded, total) => overlay.setProgress(loaded / total);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping; // softer, filmic highlight roll-off
  renderer.toneMappingExposure = LIGHT.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 5000);

  const data = await loadArea();
  const [thx, thz] = data.meta.townHall;

  // Sky and sun
  const sunDir = sunDirection(SCENE_TIME);
  scene.add(createSky(sunDir, 4500, LIGHT.turbidity));
  // Sky light for everything in shade: a prefiltered environment map rendered from the same sky.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(createSky(sunDir, 500, LIGHT.turbidity));
  scene.environment = pmrem.fromScene(envScene, 0, 0.1, 1000).texture;
  scene.environmentIntensity = LIGHT.env;
  pmrem.dispose();
  scene.fog = new THREE.Fog(LIGHT.fog, 70, 800); // the hazy, dusty distance of the period views

  // Sun: cascaded shadows, sharp near the walker and still present on distant buildings.
  const shadows = new SunShadows(scene, camera, sunDir, LIGHT.sun, LIGHT.sunI);
  // Warm bounce from sunlit cobbles and façades into the shade.
  scene.add(new THREE.HemisphereLight(LIGHT.hemi[0], LIGHT.hemi[1], LIGHT.hemi[2]));

  // Ground: LiDAR terrain with fieldstone cobbles
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const terrain = new Terrain(data);
  scene.add(terrain.buildMesh(createGroundMaterial(aniso), thx, thz, 1000, 4, 3.4));

  // Buildings: plastered walls with period windows, and skeleton roofs in clay tile
  const wallMesh = new THREE.Mesh(buildWalls(data), age(createFacadeMaterial(aniso), { strength: 0.8, seed: 4 }));
  const roofMesh = new THREE.Mesh(buildRoofs(data), createRoofMaterial(aniso));
  for (const m of [wallMesh, roofMesh]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  // Houses near the walk: real façade geometry (openings, reveals, sills, cornices, chimneys)
  const houseMats = createHouseMaterials(aniso);
  houseMats.glass.envMap = scene.environment; // full-strength sky reflections in the glass (scene env is dimmed)
  houseMats.glass.envMapIntensity = 1.0;
  const facades = buildFacades(data, terrain, houseMats);
  scene.add(facades.group);
  const townHallData = data.buildings.find(b => b.role === 'townhall');
  if (townHallData) {
    const m = createTownHallMaterials(aniso);
    for (const k of ['wall', 'stone', 'plinth'] as const) age(m[k], { ground: townHallData.groundY, strength: 0.9, seed: 1 });
    age(m.roof, { roof: true, strength: 0.9 });
    scene.add(buildTownHall(townHallData, m));
  }
  const stCasimirData = data.buildings.find(b => b.role === 'stcasimir');
  if (stCasimirData) {
    const m = createChurchMaterials(aniso);
    for (const k of ['wall', 'stone'] as const) age(m[k], { ground: stCasimirData.groundY, strength: 1, seed: 2 });
    age(m.roof, { roof: true, strength: 0.7 });
    scene.add(buildStCasimir(stCasimirData, m));
  }
  const walls = new WallGrid(data);
  let promenadeRef: { update(dt: number): void } | null = null;
  if (townHallData) {
    const promenade = buildPromenade(townHallData, terrain, createPromenadeMaterials(aniso));
    scene.add(promenade.group);
    for (const [ax, az, bx, bz] of promenade.segments) walls.addSegment(ax, az, bx, bz);
    promenadeRef = promenade;
  }
  // Market stalls, carts and townsfolk stream in after the first frame
  let market: Market | null = null;
  if (townHallData) {
    buildMarket(data, townHallData, terrain, createMarketMaterials(aniso)).then(mk => {
      market = mk;
      scene.add(mk.group);
      shadows.apply(mk.group);
      for (const [ax, az, bx, bz] of mk.segments) walls.addSegment(ax, az, bx, bz);
    }).catch(err => console.warn('market', err));
  }
  const barriers = buildBarriers(data, terrain, thx, thz, data.meta.walkRadius, createWoodMaterial(aniso));
  if (barriers) scene.add(barriers);

  // Walker: start on the square, north of the Town Hall, facing it
  const input = new Input(renderer.domElement);
  const walker = new Walker(input, walls, { cx: thx, cz: thz, radius: data.meta.walkRadius }, (x, z) => terrain.heightAt(x, z));
  walker.place(thx + 4, thz - 42, Math.PI);
  scene.add(walker.object);
  // The character model streams in; the placeholder capsule stands in until then.
  let character: Character | null = null;
  const spec = new URLSearchParams(location.search).get('char') === 'townsman' ? TOWNSMAN : TRAVELLER;
  Character.load(spec).then(c => { character = c; walker.setBody(c.object); shadows.apply(c.object); }).catch(err => console.warn('character', err));

  // Sound: market murmur centred on the square north of the Town Hall, bells from St Casimir's
  const bellsAt = stCasimirData ? new THREE.Vector3(
    stCasimirData.rings[0].reduce((a, p) => a + p[0], 0) / stCasimirData.rings[0].length, stCasimirData.eaveY,
    stCasimirData.rings[0].reduce((a, p) => a + p[1], 0) / stCasimirData.rings[0].length) : null;
  ambience = new Ambience(camera, scene, { square: new THREE.Vector3(thx, terrain.heightAt(thx, thz - 30), thz - 30), bells: bellsAt });
  scene.add(camera);
  window.addEventListener('keydown', e => { if (e.code === 'KeyM') ambience?.toggleMute(); });

  document.addEventListener('pointerlockchange', () => overlay.setVisible(!input.locked));
  // Ready once every texture queued above has arrived.
  THREE.DefaultLoadingManager.onLoad = () => overlay.ready();
  const stats = createStats(renderer);
  window.addEventListener('keydown', e => { if (e.code === 'Backquote') stats.toggle(); });

  // Everything built so far receives the cascades; late arrivals (figure, market) are added when they load.
  shadows.apply(scene);
  const post = new Post(renderer, scene, camera);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    post.setSize(window.innerWidth, window.innerHeight);
    shadows.resize();
  });

  const timer = new THREE.Timer();
  renderer.setAnimationLoop((time: number) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.05);
    walker.update(dt, camera);
    character?.update(dt, walker.speed);
    ambience?.update(dt, walker.position, walker.speed);
    market?.update(dt);
    promenadeRef?.update(dt);
    shadows.update();
    post.render(dt);
    stats.update(dt);
  });

  if (import.meta.env.DEV) {
    // Test hooks for screenshots and debugging.
    (window as unknown as Record<string, unknown>).__walk = {
      data, walker, camera, renderer, scene,
      get character() { return character; },
      get ambience() { return ambience; },
      post, shadows, facadeStats: facades.stats,
      // Saves the current frame to .screens/<name>.jpg via the dev server.
      snapshot: async (name: string) => {
        post.render(0);
        const body = renderer.domElement.toDataURL('image/jpeg', 0.85);
        return (await fetch(`/__snapshot?name=${encodeURIComponent(name)}`, { method: 'POST', body })).text();
      },
      place: (x: number, z: number, yaw: number, pitch?: number) => {
        walker.place(x, z, yaw);
        if (pitch !== undefined) walker.pitch = pitch;
        overlay.setVisible(false);
      },
    };
  }
}

function fail(err: unknown): void {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;padding:16px">${String(err)}</pre>`);
}
main().catch(fail);
