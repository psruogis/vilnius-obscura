import * as THREE from 'three';
import { loadArea } from './world/area';
import { buildWalls, buildRoofs, buildSoffits, hasTileRoof } from './world/buildings';
import { Terrain } from './world/terrain';
import { createFacadeMaterial, createGroundMaterial, createRoofMaterial, createTownHallMaterials, createChurchMaterials, createPromenadeMaterials, createMarketMaterials, createMetalRoofMaterial, createWoodMaterial } from './world/materials';
import { buildBarriers } from './world/props';
import { buildTownHall } from './world/townhall';
import { buildStCasimir } from './world/stcasimir';
import { buildPromenade } from './world/promenade';
import { buildMarket, type Market } from './world/market';
import { buildFacades } from './world/facades';
import { buildCrowd, type Crowd } from './world/people';
import { buildTraffic, type Traffic } from './world/carriages';
import { createHouseMaterials } from './world/houseMaterials';
import { age } from './world/ageing';
import { Character, TOWNSMAN, TRAVELLER } from './player/character';
import { Ambience } from './audio/ambience';
import { Post } from './render/post';
import { SunShadows } from './render/shadows';
import { installHeightFog, createOvercastSky, createRain, wet, WET, RAIN_TIME, FLOW } from './render/weather';
import { buildFlowMap } from './world/flow';
import { StreetLamps, type LampSpot } from './world/lamps';
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
  // Summer rain: an overcast afternoon, soft diffuse light, the street filling with mist.
  rain: { time: Date.UTC(1800, 5, 24, 13, 30), sun: '#d9dee2', sunI: 1.4, exposure: 0.95, turbidity: 10, fog: '#7f8a90', env: 1.0, hemi: ['#b4bdc4', '#6d675e', 0.3] },
} as const;
// Weather: rain by default (?weather=clear for the sunny morning).
const RAIN = new URLSearchParams(location.search).get('weather') !== 'clear';
const LIGHT = RAIN ? LIGHTS.rain : LIGHTS[new URLSearchParams(location.search).get('light') === 'day' ? 'day' : 'golden'];
if (RAIN) installHeightFog(0, 6, 1.6); // must run before any material compiles
WET.value = RAIN ? 1 : 0;
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
  scene.add(RAIN ? createOvercastSky('#7f8a90', '#56616a') : createSky(sunDir, 4500, LIGHT.turbidity));
  // Sky light for everything in shade: a prefiltered environment map rendered from the same sky.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(RAIN ? createOvercastSky('#9aa3a7', '#6c767d', 400) : createSky(sunDir, 500, LIGHT.turbidity));
  scene.environment = pmrem.fromScene(envScene, 0, 0.1, 1000).texture;
  scene.environmentIntensity = LIGHT.env;
  pmrem.dispose();
  // Rain: exponential mist, thick at street level (installHeightFog); clear: the dusty haze of the period views
  scene.fog = RAIN ? new THREE.FogExp2(LIGHT.fog, 0.0072) : new THREE.Fog(LIGHT.fog, 70, 800);
  const rain = RAIN ? createRain(11000) : null;
  const rainScene = new THREE.Scene();
  if (rain) rainScene.add(rain.mesh);

  // Sun: cascaded shadows, sharp near the walker and still present on distant buildings.
  const shadows = new SunShadows(scene, camera, sunDir, LIGHT.sun, LIGHT.sunI);
  // Warm bounce from sunlit cobbles and façades into the shade.
  scene.add(new THREE.HemisphereLight(LIGHT.hemi[0], LIGHT.hemi[1], LIGHT.hemi[2]));

  // Ground: LiDAR terrain with fieldstone cobbles
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const terrain = new Terrain(data);
  // Streets: mud in the joints and along the walls always; in rain, water running in the gutters
  const flow = buildFlowMap(terrain, openGround(data, thx, thz, 200), thx, thz, 200);
  FLOW.map.value = flow.tex;
  FLOW.box.value.copy(flow.box);
  const groundMat = createGroundMaterial(aniso);
  wet(groundMat, 'ground');
  scene.add(terrain.buildMesh(groundMat, thx, thz, 1000, 4, 3.4));

  // Buildings: plastered walls with period windows, and skeleton roofs in clay tile
  const wallMat = age(createFacadeMaterial(aniso), { strength: 0.8, seed: 4 });
  if (RAIN) wet(wallMat, 'wall', 0, 'vFacade.y');
  const wallMesh = new THREE.Mesh(buildWalls(data), wallMat);
  const roofMesh = new THREE.Mesh(buildRoofs(data, hasTileRoof), RAIN ? wet(createRoofMaterial(aniso), 'roof') : createRoofMaterial(aniso));
  const metalRoofMesh = new THREE.Mesh(buildRoofs(data, b => !hasTileRoof(b), true), RAIN ? wet(createMetalRoofMaterial(), 'roof') : createMetalRoofMaterial());
  metalRoofMesh.castShadow = true; metalRoofMesh.receiveShadow = true;
  scene.add(metalRoofMesh);
  for (const m of [wallMesh, roofMesh]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  // Houses near the walk: real façade geometry (openings, reveals, sills, cornices, chimneys)
  const houseMats = createHouseMaterials(aniso);
  houseMats.glass.envMap = scene.environment; // full-strength sky reflections in the glass (scene env is dimmed)
  houseMats.glass.envMapIntensity = 1.0;
  if (RAIN) {
    wet(houseMats.wall, 'wall', 0, 'vWall.y');
    wet(houseMats.trim, 'wall', 0);
    wet(houseMats.canvas, 'roof');
    wet(houseMats.metal, 'roof');
    houseMats.glass.emissiveIntensity = 1.6; // a few rooms lit against the gloom
  }
  const facades = buildFacades(data, terrain, houseMats, openGround(data, thx, thz, 240));
  scene.add(facades.group);
  // Eave soffits: the limewashed undersides of the overhanging roofs (buildings.ts)
  const soffits = new THREE.Mesh(buildSoffits(data), houseMats.trim);
  soffits.receiveShadow = true;
  scene.add(soffits);
  const townHallData = data.buildings.find(b => b.role === 'townhall');
  if (townHallData) {
    const m = createTownHallMaterials(aniso);
    for (const k of ['wall', 'stone', 'plinth'] as const) age(m[k], { ground: townHallData.groundY, strength: 0.9, seed: 1 });
    age(m.roof, { roof: true, strength: 0.9 });
    if (RAIN) { for (const k of ['wall', 'stone', 'plinth'] as const) wet(m[k], 'wall', townHallData.groundY); wet(m.roof, 'roof'); }
    scene.add(buildTownHall(townHallData, m));
  }
  const stCasimirData = data.buildings.find(b => b.role === 'stcasimir');
  if (stCasimirData) {
    const m = createChurchMaterials(aniso);
    for (const k of ['wall', 'stone'] as const) age(m[k], { ground: stCasimirData.groundY, strength: 1, seed: 2 });
    age(m.roof, { roof: true, strength: 0.7 });
    if (RAIN) { for (const k of ['wall', 'stone'] as const) wet(m[k], 'wall', stCasimirData.groundY); }
    // ?church=1800 shows the pre-1864 form; default follows the owner's c.1900 photographs:
    // a pale limewashed front and dark painted-metal helms
    const churchForm = new URLSearchParams(location.search).get('church') === '1800' ? '1800' : 'photos';
    if (churchForm === 'photos') {
      (m.wall as THREE.MeshStandardMaterial).color.set('#e2d9c6');
      (m.stone as THREE.MeshStandardMaterial).color.set('#ece5d6');
      (m.dome as THREE.MeshStandardMaterial).color.set('#46534c');
      (m.roof as THREE.MeshStandardMaterial).color.set('#565d5c');
    }
    scene.add(buildStCasimir(stCasimirData, m, churchForm));
  }
  const walls = new WallGrid(data);
  let promenadeRef: { update(dt: number): void } | null = null;
  // gas lamps: the garden's lamp posts and the lanterns on the house fronts
  const lampSpots: LampSpot[] = [...facades.lamps];
  if (townHallData) {
    const promMats = createPromenadeMaterials(aniso);
    if (RAIN) { promMats.lampGlass.emissiveIntensity = 2.2; wet(promMats.lawn, 'roof'); } // gas lamps lit in the gloom
    const promenade = buildPromenade(townHallData, terrain, promMats);
    scene.add(promenade.group);
    for (const [ax, az, bx, bz] of promenade.segments) walls.addSegment(ax, az, bx, bz);
    promenadeRef = promenade;
    lampSpots.push(...promenade.lamps);
  }
  // Market stalls, carts and townsfolk stream in after the first frame
  let market: Market | null = null;
  let crowd: Crowd | null = null, traffic: Traffic | null = null;
  if (townHallData) {
    buildMarket(data, townHallData, terrain, createMarketMaterials(aniso), false).then(async mk => { // c.1900: no stalls on the square
      market = mk;
      scene.add(mk.group);
      shadows.apply(mk.group);
      for (const [ax, az, bx, bz] of mk.segments) walls.addSegment(ax, az, bx, bz);
      // Open ground: a 1 m occupancy raster of the building outlines around the walk
      const free = openGround(data, thx, thz, 180);
      // Horse-drawn coaches and carts on a loop fitted round the square
      buildTraffic({
        th: townHallData, walls, terrain, free,
        mats: {
          wood: createWoodMaterial(aniso),
          body: new THREE.MeshStandardMaterial({ color: '#34241c', roughness: 0.45, metalness: 0.05 }),
          dark: new THREE.MeshStandardMaterial({ color: '#15130f', roughness: 0.3 }),
          horse: new THREE.MeshStandardMaterial(),
        },
      }).then(tr => { traffic = tr; scene.add(tr.group); shadows.apply(tr.group); }).catch(err => console.warn('traffic', err));
      // Townsfolk: knots of people talking, and strollers
      const groups: THREE.Vector2[] = [];
      for (let k = 0, tries = 0; k < 16 && tries < 400; tries++) {
        const a = tries * 2.399, r = 12 + ((tries * 37) % 90);
        const x = thx + Math.cos(a) * r, z = thz + Math.sin(a) * r;
        if (free(x, z) && free(x + 1.5, z) && free(x - 1.5, z) && free(x, z + 1.5) && free(x, z - 1.5)) { groups.push(new THREE.Vector2(x, z)); k++; }
      }
      buildCrowd({
        walls, terrain, free, centre: new THREE.Vector2(thx, thz), radius: data.meta.walkRadius + 25, groups, strollers: 46,
        material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
        accessories: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }),
        umbrellas: RAIN,
      }).then(c => {
        crowd = c; scene.add(c.group);
        c.addLamplighter({
          start: new THREE.Vector2(thx + 10, thz - 40), ground: lampSpots.map(l => l.ground),
          needs: i => (RAIN ? !lamps.isLit(i) : lamps.isLit(i)),
          act: i => (RAIN ? lamps.light(i) : lamps.putOut(i)),
        });
        shadows.apply(c.group);
      }).catch(err => console.warn('crowd', err));
    }).catch(err => console.warn('market', err));
  }
  // In the rain the lamps start dark and the lamplighter lights them; on the clear morning he puts them out.
  const lamps = new StreetLamps(lampSpots, !RAIN, RAIN ? 30 : 12);
  scene.add(lamps.group);
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
  Character.load(spec).then(c => {
    character = c; walker.setBody(c.object); shadows.apply(c.object);
    c.onStep = (_foot, sp) => ambience?.step(sp);
  }).catch(err => console.warn('character', err));

  // Sound: market murmur centred on the square north of the Town Hall, bells from St Casimir's
  const bellsAt = stCasimirData ? new THREE.Vector3(
    stCasimirData.rings[0].reduce((a, p) => a + p[0], 0) / stCasimirData.rings[0].length, stCasimirData.eaveY,
    stCasimirData.rings[0].reduce((a, p) => a + p[1], 0) / stCasimirData.rings[0].length) : null;
  ambience = new Ambience(camera, scene, { square: new THREE.Vector3(thx, terrain.heightAt(thx, thz - 30), thz - 30), bells: bellsAt }, RAIN);
  scene.add(camera);
  window.addEventListener('keydown', e => { if (e.code === 'KeyM') ambience?.toggleMute(); });

  document.addEventListener('pointerlockchange', () => overlay.setVisible(!input.locked));
  // Ready once every texture queued above has arrived.
  THREE.DefaultLoadingManager.onLoad = () => overlay.ready();
  const stats = createStats(renderer);
  window.addEventListener('keydown', e => { if (e.code === 'Backquote') stats.toggle(); });

  // Everything built so far receives the cascades; late arrivals (figure, market) are added when they load.
  shadows.apply(scene);
  const post = new Post(renderer, scene, camera, rainScene);
  if (RAIN) post.paint.uniforms.uVarnish.value = 0.2; // keep the rain light cool and grey

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
    RAIN_TIME.value += dt;
    rain?.update(dt, camera.position);
    character?.update(dt, { speed: walker.speed, angularVelocity: walker.angularVelocity, forwardAccel: walker.forwardAccel, facing: walker.facing, lookYaw: walker.yaw, lookPitch: walker.pitch });
    ambience?.update(dt, walker.position, walker.speed);
    market?.update(dt);
    crowd?.update(dt, walker.position);
    traffic?.update(dt, walker.position);
    promenadeRef?.update(dt);
    lamps.update(dt, camera.position);
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
      get crowd() { return crowd; }, get traffic() { return traffic; },
      post, shadows, lamps, facadeStats: facades.stats, flowStats: flow.stats, flowTex: flow.tex, flowBox: flow.box,
      // Saves the current frame to .screens/<name>.jpg via the dev server.
      snapshot: async (name: string) => {
        post.render(0);
        const body = renderer.domElement.toDataURL('image/jpeg', 0.85);
        return (await fetch(`/__snapshot?name=${encodeURIComponent(name)}`, { method: 'POST', body })).text();
      },
      place: (x: number, z: number, yaw: number, pitch?: number) => {
        walker.place(x, z, yaw);
        if (pitch !== undefined) walker.setPitch(pitch);
        overlay.setVisible(false);
      },
    };
  }
}

/** Open ground test from a 1 m raster of the building outlines within `radius` of (cx, cz). */
function openGround(data: Awaited<ReturnType<typeof loadArea>>, cx: number, cz: number, radius: number): (x: number, z: number) => boolean {
  const N = Math.ceil(radius * 2), c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  for (const b of data.buildings) {
    if (b.dist > radius + 60) continue;
    g.beginPath();
    for (const ring of b.rings) ring.forEach(([x, z], i) => (i ? g.lineTo : g.moveTo).call(g, x - cx + radius, z - cz + radius));
    g.fill('evenodd');
  }
  const px = g.getImageData(0, 0, N, N).data;
  return (x, z) => {
    const i = Math.floor(x - cx + radius), j = Math.floor(z - cz + radius);
    if (i < 0 || j < 0 || i >= N || j >= N) return false;
    return px[(j * N + i) * 4] < 64;
  };
}

function fail(err: unknown): void {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;padding:16px">${String(err)}</pre>`);
}
main().catch(fail);
