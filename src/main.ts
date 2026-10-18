import * as THREE from 'three';
import { loadArea } from './world/area';
import { buildWalls, buildRoofs, buildSoffits, hasTileRoof } from './world/buildings';
import { Terrain } from './world/terrain';
import { createFacadeMaterial, createGroundMaterial, createRoofMaterial, createTownHallMaterials, createChurchMaterials, createPromenadeMaterials, createMarketMaterials, createMetalRoofMaterial, createWoodMaterial, createGateMaterials, WORLD_TEXTURES, texturesReady } from './world/materials';
import { fetchBuffer, fetchImage } from './render/assets';
import { groundRaster, groundTest } from './world/ground';
import { FadeIns } from './render/fadein';
import { buildBarriers } from './world/props';
import { buildStreetProps, createStreetPropMaterials } from './world/streetprops';
import { buildTownHall } from './world/townhall';
import { buildStCasimir } from './world/stcasimir';
import { buildSubaciusGate, SUBACIUS_GATE } from './world/subacius';
import { buildRudninkaiGate, RUDNINKAI_GATE } from './world/rudninkai';
import { LOST_GATES, buildLostGate, lostGatePlan } from './world/lostgates';
import { buildDawnGate, DAWN_GATE } from './world/dawn';
import { buildPromenade } from './world/promenade';
import { buildMarket, type Market } from './world/market';
import { assembleFacades, buildFacades, facadeChunkOrder } from './world/facades';
import { facadesOnWorkers, warmFacadeWorkers } from './world/facadeworkers';
import { buildCrowd, type Crowd } from './world/people';
import { buildTraffic, type Traffic } from './world/carriages';
import { createHouseMaterials } from './world/houseMaterials';
import { age } from './world/ageing';
import { Character, TOWNSMAN, TRAVELLER } from './player/character';
import { Ambience } from './audio/ambience';
import { Post } from './render/post';
import { SunShadows } from './render/shadows';
import { installHeightFog, createOvercastSky, createRain, wet, WET, RAIN_TIME, FLOW, SKY_MIRROR } from './render/weather';
import { buildFlowMap } from './world/flow';
import { StreetLamps, type LampSpot } from './world/lamps';
import { WallGrid } from './world/collision';
import { WalkZone } from './world/zone';
import { createSky, sunDirection } from './world/sky';
import { Input } from './player/input';
import { Walker } from './player/walker';
import { TouchControls } from './player/touch';
import { createOverlay, createStats, showUnsupported, unsupportedReason } from './ui/overlay';
import { createMap } from './ui/map';
import { PlaceTitle } from './ui/place';
import { SettingsStore, weatherNow } from './ui/settings';

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
// Weather: rain by default; ?weather=clear (or the Options screen) for the sunny morning.
const RAIN = weatherNow() === 'rain';
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
  const settings = new SettingsStore();
  const overlay = createOverlay(() => { input.requestLock(); ambience?.start(); touch.setActive(true); }, settings, {
    get: () => ambience?.isMuted ?? false,
    toggle: () => { const m = ambience?.toggleMute() ?? false; touch.setMuted(m); return m; },
  });
  // The loading bar follows the stages below. Between stages the page gets a moment to paint the bar and caption;
  // within one it is busy, and only the bar's sheen (run by the compositor) keeps moving.
  const stage = (p: number, text: string) => {
    overlay.setStage(p, text);
    performance.mark(`vo:stage:${text}`);
    // after the next paint (a hidden tab paints nothing: then after 100 ms)
    return Promise.race([new Promise<void>(r => requestAnimationFrame(() => setTimeout(r, 0))), new Promise<void>(r => setTimeout(r, 100))]);
  };
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

  warmFacadeWorkers();   // their code loads now, while the page waits for the map
  // Start every texture and model downloading now, on a worker, while the world is built (render/assets.ts)
  for (const url of WORLD_TEXTURES) void fetchImage(url).catch(() => {});
  for (const url of ['assets/char/folk_male.glb', 'assets/char/folk_female.glb', 'assets/char/folk_anims.glb', 'assets/char/horse.glb', 'assets/char/man.glb']) void fetchBuffer(url).catch(() => {});
  await stage(0.04, 'Reading the map');
  const data = await loadArea();
  performance.mark('vo:area');                               // load phases, timed by tools/load-profile.mjs
  const [thx, thz] = data.meta.townHall;
  // The walk: the square and the road out to the Subačius Gate site (world/zone.ts)
  const zone = new WalkZone(data);
  const around = (m: number): [number, number, number, number] => [zone.box[0] - m, zone.box[1] - m, zone.box[2] + m, zone.box[3] + m];
  await stage(0.1, 'Measuring the streets');
  // Open ground: a 1 m raster of the building outlines over the walk and its surroundings
  const ground = groundRaster(data, around(120)), free = groundTest(ground);
  // the house fronts take longest: built on workers meanwhile, and collected before the street furniture needs them
  const facadeWork = facadesOnWorkers(data, ground);

  // Sky and sun
  const sunDir = sunDirection(SCENE_TIME);
  scene.add(RAIN ? createOvercastSky('#7f8a90', '#56616a') : createSky(sunDir, 4500, LIGHT.turbidity));
  // Sky light for everything in shade: a prefiltered environment map rendered from the same sky.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(RAIN ? createOvercastSky('#9aa3a7', '#6c767d', 400) : createSky(sunDir, 500, LIGHT.turbidity));
  scene.environment = pmrem.fromScene(envScene, 0, 0.1, 1000).texture;
  scene.environmentIntensity = LIGHT.env;
  if (RAIN) SKY_MIRROR.value = 0.67; // the wet street mirrors the sky as seen (the colours above), dimmer than its light
  pmrem.dispose();
  // Rain: exponential mist, thick at street level (installHeightFog); clear: the dusty haze of the period views
  scene.fog = RAIN ? new THREE.FogExp2(LIGHT.fog, 0.0072) : new THREE.Fog(LIGHT.fog, 70, 800);
  const rain = RAIN ? createRain(11000) : null;
  const rainScene = new THREE.Scene();
  if (rain) rainScene.add(rain.mesh);

  // Sun: cascaded shadows, sharp near the walker and still present on distant buildings.
  // (in the rain the mist closes the view at ~160 m, so two cascades over that distance are enough)
  const shadows = new SunShadows(scene, camera, sunDir, LIGHT.sun, LIGHT.sunI, RAIN ? { far: 160, cascades: 2 } : undefined);
  // Warm bounce from sunlit cobbles and façades into the shade.
  scene.add(new THREE.HemisphereLight(LIGHT.hemi[0], LIGHT.hemi[1], LIGHT.hemi[2]));

  await stage(0.18, 'Laying the cobbles');
  // Ground: LiDAR terrain with fieldstone cobbles
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const terrain = new Terrain(data);
  // Streets: mud in the joints and along the walls always; in rain, water running in the gutters
  const flow = buildFlowMap(terrain, free, around(90));
  FLOW.map.value = flow.tex;
  FLOW.box.value.copy(flow.box);
  const groundMat = createGroundMaterial(aniso);
  wet(groundMat, 'ground');
  // the ground: a square round the whole walk, out to the farthest gate, and the backdrop beyond it
  const groundSq = { cx: (zone.box[0] + zone.box[2]) / 2, cz: (zone.box[1] + zone.box[3]) / 2, size: Math.ceil((Math.max(zone.box[2] - zone.box[0], zone.box[3] - zone.box[1]) + 400) / 4) * 4, step: 4 };
  scene.add(terrain.buildMesh(groundMat, groundSq.cx, groundSq.cz, groundSq.size, groundSq.step, 3.4));

  await stage(0.28, 'Raising the walls and roofs');
  // Buildings: plastered walls with period windows, and skeleton roofs in clay tile
  const wallMat = age(createFacadeMaterial(aniso), { strength: 0.8, seed: 4 });
  if (RAIN) wet(wallMat, 'wall', 0, 'vFacade.y');
  const wallMesh = new THREE.Mesh(buildWalls(data), wallMat);
  const roofMesh = new THREE.Mesh(buildRoofs(data, hasTileRoof), RAIN ? wet(createRoofMaterial(aniso), 'roof') : createRoofMaterial(aniso));
  const metalRoofMesh = new THREE.Mesh(buildRoofs(data, b => !hasTileRoof(b), true), RAIN ? wet(createMetalRoofMaterial(), 'roof') : createMetalRoofMaterial());
  metalRoofMesh.castShadow = true; metalRoofMesh.receiveShadow = true;
  scene.add(metalRoofMesh);
  for (const m of [wallMesh, roofMesh]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  await stage(0.38, 'Fronting the houses');
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
  await stage(0.6, "The Town Hall and St Casimir's");
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
    // faded, uneven limewash as in the tinted postcard: fully on the walls, less on the base and dressings
    const fade = { wall: 1, base: 0.8, stone: 0.45 } as const;
    const churchFade = new URLSearchParams(location.search).get('church') === '1800' ? 0 : 1;
    for (const k of ['wall', 'stone', 'base'] as const) age(m[k], { ground: stCasimirData.groundY, strength: 1, seed: 2, fade: fade[k] * churchFade });
    age(m.roof, { roof: true, strength: 0.7 });
    if (RAIN) { for (const k of ['wall', 'stone', 'base'] as const) wet(m[k], 'wall', stCasimirData.groundY); }
    // ?church=1800 shows the pre-1864 form; default follows the owner's c.1900 photographs and the
    // coloured 1915-18 postcard, the only colour reference: rose walls and pilasters, pinkish-cream
    // dressings, a paler, greyer pink for the banded base, light grey helms (docs/REFERENCES.md §5.3)
    const churchForm = new URLSearchParams(location.search).get('church') === '1800' ? '1800' : 'photos';
    if (churchForm === 'photos') {
      (m.wall as THREE.MeshStandardMaterial).color.set('#cd9d96');
      (m.stone as THREE.MeshStandardMaterial).color.set('#ecdcd3');
      (m.dome as THREE.MeshStandardMaterial).color.set('#c4c8ca');
      (m.roof as THREE.MeshStandardMaterial).color.set('#565d5c');
    }
    scene.add(buildStCasimir(stCasimirData, m, churchForm));
  }
  const walls = new WallGrid(data);
  await stage(0.68, 'The city gates');
  // The city gates the walk shows (docs/gates.md §8-10): the Subačius Gate at the end of the road, the Rūdninkai Gate
  // at the end of Rūdninkų g., the Saviour's Gate by the Užupis bridge, and further out the Bernardine, Castle, Wet,
  // Tatar, Vilija and Trakai gates (reached by travel from the map), each standing as it stood before it came down,
  // with the wall either side: a deliberate anachronism in 1900. ?gate=ghost (or #ghost) shows them as ghosts over the
  // street instead.
  const ghostGate = new URLSearchParams(location.search).get('gate') === 'ghost' || location.hash === '#ghost';
  const saviour = LOST_GATES.find(g => g.key === 'saviour')!;
  const outer = ['bernardine', 'castle', 'wet', 'tatar', 'vilija', 'trakai'].map(k => LOST_GATES.find(g => g.key === k)!);
  type GateBuild = (o: Parameters<typeof buildSubaciusGate>[0]) => ReturnType<typeof buildSubaciusGate>;
  const gateList: [GateBuild, { x: number; z: number }, number, ([number, number, number] | undefined)?, string?][] = [
    [buildSubaciusGate, SUBACIUS_GATE, 0.97], [buildRudninkaiGate, RUDNINKAI_GATE, 0.92],
    ...[saviour, ...outer].map(g => [(o: Parameters<GateBuild>[0]) => buildLostGate(g, o), lostGatePlan(g), g.cover, g.plaster, g.roof] as [GateBuild, { x: number; z: number }, number, [number, number, number] | undefined, string | undefined]),
    // the Gate of Dawn, standing in 1900 (world/dawn.ts): always solid, its chapel in its own warmer render
    [o => buildDawnGate({ ...o, chapel: createGateMaterials(aniso, terrain.heightAt(DAWN_GATE.x, DAWN_GATE.z), 1, [0.74, 0.6, 0.42]) }), DAWN_GATE, 1, [0.86, 0.84, 0.78]],
  ];
  const gates = gateList.map(([build, at, cover, plaster, roof]) => {
    const mats = createGateMaterials(aniso, terrain.heightAt(at.x, at.z), cover, plaster);
    if (roof) (mats.roof as THREE.MeshStandardMaterial).color.set(roof);   // as the gate viewer (gate.ts) tints it
    const gate = build({ data, terrain, mats, look: ghostGate ? 'ghost' : 'solid', fog: RAIN ? { density: 0.0072 } : { near: 70, far: 800 } });
    for (const m of [mats.render, mats.trim, mats.wall]) age(m, { ground: gate.floor, strength: 1, seed: 5 });
    age(mats.roof, { roof: true, strength: 0.8 });
    if (RAIN) {
      for (const m of [mats.render, mats.trim, mats.stone, mats.wall, mats.remnant]) wet(m, 'wall', gate.floor);
      for (const m of [mats.roof, mats.wood]) wet(m, 'roof');
    }
    scene.add(gate.solid);
    rainScene.add(gate.ghost);
    for (const [ax, az, bx, bz] of gate.segments) walls.addSegment(ax, az, bx, bz);
    return gate;
  });
  let promenadeRef: { update(dt: number): void } | null = null;
  // gas lamps: the garden's lamp posts and the lanterns on the house fronts
  const facades = await (facadeWork?.then(parts => assembleFacades(parts, houseMats, facadeChunkOrder(data))).catch(err => {
    console.warn(err);
    return buildFacades(data, terrain, houseMats, free);
  }) ?? buildFacades(data, terrain, houseMats, free));
  scene.add(facades.group);
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
  await stage(0.74, 'Street furniture and lamps');
  // Street furniture c.1900: pavements and kerbs, guard stones, drain grates, the advertising column,
  // the cab stand with its pump and trough, garden benches, goods at a few shop doors
  const propMats = createStreetPropMaterials(aniso);
  if (RAIN) for (const m of Object.values(propMats)) wet(m, 'roof');
  propMats.gutter.envMap = propMats.water.envMap = scene.environment; // standing water mirrors the full sky, as the glass does
  const streetProps = buildStreetProps({ data, terrain, anchors: facades.anchors, flow, mats: propMats, th: townHallData, zone, ground: groundSq, rain: RAIN }); // ground: the terrain mesh's grid
  scene.add(streetProps.group);
  for (const [ax, az, bx, bz, low] of streetProps.segments) walls.addSegment(ax, az, bx, bz, low);
  // Market stalls, carts and townsfolk stream in after the first frame
  let market: Market | null = null;
  let crowd: Crowd | null = null, traffic: Traffic | null = null;
  const parallelCompile = renderer.extensions.has('KHR_parallel_shader_compile');
  const settle = (p: Promise<unknown>) => Promise.race([p.catch(() => {}), new Promise(r => setTimeout(r, 8000))]);   // never wait for ever
  const fades = new FadeIns();   // the townsfolk and carriages arrive after the walk can start: they fade in
  if (townHallData) {
    buildMarket(data, townHallData, terrain, createMarketMaterials(aniso), false).then(async mk => { // c.1900: no stalls on the square
      market = mk;
      scene.add(mk.group);
      shadows.apply(mk.group);
      for (const [ax, az, bx, bz] of mk.segments) walls.addSegment(ax, az, bx, bz);
      // Droshkies, a closed carriage and a farm cart on a loop fitted round the square (hoods up in the rain)
      buildTraffic({
        th: townHallData, walls, terrain, free, wood: createWoodMaterial(aniso), rain: RAIN, wet: RAIN ? wet : undefined,
      }).then(async tr => { if (parallelCompile) await settle(renderer.compileAsync(tr.group, camera, scene)); traffic = tr; scene.add(tr.group); shadows.apply(tr.group); fades.add(tr.group); }).catch(err => console.warn('traffic', err));
      // Townsfolk: knots of people talking (on the square, and a few along the road to the gate), and strollers
      const groups: THREE.Vector2[] = [];
      const roomy = (x: number, z: number) => free(x, z) && free(x + 1.5, z) && free(x - 1.5, z) && free(x, z + 1.5) && free(x, z - 1.5);
      for (let k = 0, tries = 0; k < 16 && tries < 400; tries++) {
        const a = tries * 2.399, r = 12 + ((tries * 37) % 90);
        const x = thx + Math.cos(a) * r, z = thz + Math.sin(a) * r;
        if (roomy(x, z)) { groups.push(new THREE.Vector2(x, z)); k++; }
      }
      let gseed = 7;
      const grnd = () => ((gseed = (gseed * 16807) % 2147483647) / 2147483647);
      for (let k = 0, tries = 0; k < 3 && tries < 400; tries++) {
        const [x, z] = zone.sample(grnd, 1);
        if (Math.hypot(x - thx, z - thz) > data.meta.walkRadius + 20 && roomy(x, z)) { groups.push(new THREE.Vector2(x, z)); k++; }
      }
      buildCrowd({
        walls, terrain, free, zone, reach: 25, groups, strollers: 54,
        material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
        accessories: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }),
        umbrellas: RAIN,
      }).then(async c => {
        if (parallelCompile) await settle(renderer.compileAsync(c.group, camera, scene));
        crowd = c; scene.add(c.group); fades.add(c.group);
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
  const barrierWood = createWoodMaterial(aniso);
  if (RAIN) wet(barrierWood, 'roof');
  const barriers = buildBarriers(data, terrain, zone, barrierWood, propMats.iron);
  if (barriers) scene.add(barriers);

  await stage(0.8, 'The walker');
  // Walker: start on the square, north of the Town Hall, facing it
  const input = new Input(renderer.domElement);
  // Phones and tablets: the stick in the corner, look anywhere else, pinch to zoom, pause and mute buttons
  const pauseWalk = () => { touch.setActive(false); overlay.setVisible(true); };
  const touch = new TouchControls(renderer.domElement, input, { pause: pauseWalk, mute: () => ambience?.toggleMute() ?? false });
  document.addEventListener('visibilitychange', () => { if (document.hidden && touch.isActive) pauseWalk(); });
  const walker = new Walker(input, walls, zone, (x, z) => terrain.heightAt(x, z));
  walker.place(thx + 4, thz - 42, Math.PI);
  // #gate (or #ghost; #solid, as it was once linked, is the same as #gate): start on Subačiaus g., walking up to the
  // gate. A bare #anchor, because a claude.ai artifact passes that to the page and never the ?query
  if (['#gate', '#ghost', '#solid'].includes(location.hash)) walker.place(296, 241, -Math.PI / 2);
  scene.add(walker.object);
  // Travel: the screen fades to black, the walker is put down at the place, and it fades back in
  const veil = document.createElement('div');
  veil.className = 'travel-veil';
  document.body.append(veil);
  let travelling = false;
  const travel = (x: number, z: number, yaw: number) => {
    if (travelling) return;
    travelling = true;
    veil.classList.add('on');
    setTimeout(() => {
      walker.place(x, z, yaw);
      setTimeout(() => { veil.classList.remove('on'); travelling = false; }, 300);   // a few frames to settle the camera
    }, 500);
  };
  // The map: a round plan in the corner while walking; Tab (or a tap on it) opens it full-screen and holds the walk still
  let hadLock = false; // embedded pages (claude.ai artifacts) never get the lock: nothing to give back, no pause screen
  const map = createMap(data, () => ({ x: walker.position.x, z: walker.position.z, yaw: walker.yaw }), {
    onOpen: () => { hadLock = input.locked; touch.setActive(false); input.releaseLock(); },
    onClose: () => {
      touch.setActive(true);
      if (!hadLock) return;
      // Esc is not a user gesture in some browsers, so the lock can be refused: then the pause screen takes over
      input.requestLock().then(ok => { if (!ok && !touch.isActive) overlay.setVisible(true); });
    },
    onLook: look => settings.keep('mapLook', look),
  }, settings.current.mapLook, ghostGate ? 'ghost' : 'solid', [
    // travel: the places the walk reaches, picked on the full map (where you arrive, which way you face)
    { name: 'Town Hall Square', label: 'Town Hall', x: thx, z: thz, go: () => travel(thx + 4, thz - 42, Math.PI) },
    { name: SUBACIUS_GATE.name, label: SUBACIUS_GATE.name, x: SUBACIUS_GATE.x, z: SUBACIUS_GATE.z, go: () => travel(296, 241, -Math.PI / 2) },
    // the other two gates, from 22 m inside the town, facing out along the street through them (build-area.mjs)
    { name: RUDNINKAI_GATE.name, label: RUDNINKAI_GATE.name, x: RUDNINKAI_GATE.x, z: RUDNINKAI_GATE.z, go: () => travel(-224.6, 330.3, Math.atan2(0.6685, -0.7436)) },
    { name: saviour.spec.name, label: saviour.spec.name, x: lostGatePlan(saviour).x, z: lostGatePlan(saviour).z, go: () => travel(300.6, -237.4, Math.atan2(-0.92, -0.392)) },
    // the Gate of Dawn from Aušros Vartų g., 20 m north of its chapel, looking at it (build-area.mjs)
    { name: DAWN_GATE.name, label: DAWN_GATE.name, x: DAWN_GATE.x, z: DAWN_GATE.z, go: () => travel(164.6, 446.0, Math.atan2(-0.184, -0.983)) },
    // further out (build-area.mjs): 22 m inside the town facing out; the Vilija Gate from outside, facing it
    ...([['bernardine', 418.3, -443.3, 1], ['castle', 145.7, -670.1, 1], ['wet', -84.2, -692.2, 1], ['tatar', -268.6, -497.2, 1], ['trakai', -555.8, -132.5, 1], ['vilija', -394.3, -474.6, 0]] as const).map(([k, x, z, sense]) => {
      const g = outer.find(o => o.key === k)!, at = lostGatePlan(g), [ux, uz] = g.spec.out;
      // sense 0: face the gate's middle from where you stand (the Vilija Gate's street veers outside)
      const yaw = sense ? Math.atan2(-ux * sense, -uz * sense) : Math.atan2(-(at.x - x), -(at.z - z));
      return { name: g.spec.name, label: g.spec.name, x: at.x, z: at.z, go: () => travel(x, z, yaw) };
    }),
  ]);
  const streetTitle = new PlaceTitle(data); // the street you are on, as a title for a few seconds
  overlay.onVisibility(visible => { map.setWalking(!visible); streetTitle.setActive(!visible); });
  // The character model streams in; the placeholder capsule stands in until then.
  let character: Character | null = null;
  const spec = new URLSearchParams(location.search).get('char') === 'townsman' ? TOWNSMAN : TRAVELLER;
  const dressed = Character.load(spec).then(c => {
    character = c; walker.setBody(c.object); shadows.apply(c.object);
    c.onStep = (_foot, sp) => ambience?.step(sp);
  }).catch(err => console.warn('character', err));

  // Sound: market murmur centred on the square north of the Town Hall, bells from St Casimir's
  const bellsAt = stCasimirData ? new THREE.Vector3(
    stCasimirData.rings[0].reduce((a, p) => a + p[0], 0) / stCasimirData.rings[0].length, stCasimirData.eaveY,
    stCasimirData.rings[0].reduce((a, p) => a + p[1], 0) / stCasimirData.rings[0].length) : null;
  ambience = new Ambience(camera, scene, {
    square: new THREE.Vector3(thx, terrain.heightAt(thx, thz - 30), thz - 30), bells: bellsAt,
    townHall: { x: thx, z: thz }, ground: (x, z) => terrain.heightAt(x, z),
  }, RAIN);
  scene.add(camera);
  window.addEventListener('keydown', e => { if (e.code === 'KeyM' && ambience) touch.setMuted(ambience.toggleMute()); });

  document.addEventListener('pointerlockchange', () => { if (!map.isOpen) overlay.setVisible(!input.locked); });
  // Ready once every texture queued above has arrived.
  performance.mark('vo:built');
  const stats = createStats(renderer);
  window.addEventListener('keydown', e => { if (e.code === 'Backquote') stats.toggle(); });

  // Everything built so far receives the cascades; late arrivals (figure, market) are added when they load.
  shadows.apply(scene);
  const post = new Post(renderer, scene, camera, rainScene, RAIN); // RAIN: reflections in the wet streets
  if (RAIN) post.paint.uniforms.uVarnish.value = 0.2; // keep the rain light cool and grey

  // The player's options (menu > Options), put to use now and whenever they change
  settings.bind(s => {
    ambience?.setMix({ master: s.master / 100, street: s.street / 100, bells: s.bells / 100, steps: s.steps / 100, music: s.music / 100 });
    post.setQuality(s.quality);
    post.reflections = s.reflections;
    shadows.setMapSize(s.quality === 'low' ? 1024 : 2048);
    map.setLook(s.mapLook);
    // brightness and saturation are a filter on the picture; 50 and 50 leave it untouched (and cost nothing)
    renderer.domElement.style.filter = s.brightness === 50 && s.saturation === 50
      ? '' : `brightness(${(0.6 + 0.8 * s.brightness / 100).toFixed(3)}) saturate(${(2 * s.saturation / 100).toFixed(3)})`;
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    post.setSize(window.innerWidth, window.innerHeight);
    shadows.resize();
  });

  const timer = new THREE.Timer();
  let frames = 0, shown = () => {};
  const firstFrame = new Promise<void>(r => { shown = r; });
  const step = (time: number) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.05);
    if (map.isOpen) { map.update(); return; } // the world holds still under the full map
    fades.update();
    walker.update(dt, camera);
    RAIN_TIME.value += dt;
    rain?.update(dt, camera.position);
    character?.update(dt, { speed: walker.speed, angularVelocity: walker.angularVelocity, forwardAccel: walker.forwardAccel, facing: walker.facing, lookYaw: walker.yaw, lookPitch: walker.pitch });
    ambience?.update(dt, walker.position, walker.speed);
    streetTitle.update(dt, walker.position.x, walker.position.z);
    market?.update(dt);
    crowd?.update(dt, walker.position);
    traffic?.update(dt, walker.position);
    promenadeRef?.update(dt);
    for (const g of gates) g.update(dt);
    lamps.update(dt, camera.position);
    shadows.update();
    post.render(dt);
    map.update();
    stats.update(dt);
    if (frames < 2) { performance.mark(`vo:frame${++frames}`, { detail: { programs: renderer.info.programs?.length, parallelCompile } }); shown(); }
  };
  // One frame's error must not stop the walk: three.js asks for the next frame only after this one returns, so an
  // exception would freeze the picture and every tap for good. Say what it was, on screen, and carry on.
  const frame = (time: number) => { try { step(time); } catch (err) { report(err); } };
  // Where the browser compiles shaders in parallel (KHR_parallel_shader_compile; real GPUs), the world's compile
  // first, off the page's thread, so the first frame does not freeze the page while the loading bar is up.
  // Elsewhere (software WebGL) that only adds work: the first frame compiles what it draws.
  await stage(0.88, 'Lighting the square');
  if (parallelCompile) void settle(renderer.compileAsync(scene, camera)).then(() => renderer.setAnimationLoop(frame));
  else renderer.setAnimationLoop(frame);
  // Ready to walk once the world's textures are in, the walker is dressed and the first frame is drawn; the
  // townsfolk and carriages fade in when they are ready, and the sounds start downloading only now
  void firstFrame.then(() => overlay.setStage(0.96, 'Dressing the walker'));
  Promise.all([texturesReady(), dressed, firstFrame]).then(() => { overlay.setStage(1, ''); performance.mark('vo:ready'); overlay.ready(); ambience?.load(); });

  if (import.meta.env.DEV) {
    // Test hooks for screenshots and debugging.
    (window as unknown as Record<string, unknown>).__walk = {
      data, walker, camera, renderer, scene, map, settings, overlay, streetTitle,
      get character() { return character; },
      get ambience() { return ambience; },
      get crowd() { return crowd; }, get traffic() { return traffic; },
      post, shadows, lamps, facadeStats: facades.stats, streetProps: streetProps.spots, streetStats: streetProps.stats, flowStats: flow.stats, flowTex: flow.tex, flowBox: flow.box,
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

/** Open ground test from a 1 m raster of the building outlines over the box [x0, z0, x1, z1]; outside it, nothing is open. */
/** A small panel at the top with what went wrong (once per message), for a phone where there is no console to see. */
const reported = new Set<string>();
function report(err: unknown): void {
  const msg = err instanceof Error ? `${err.message}\n${(err.stack ?? '').split('\n').slice(1, 4).join('\n')}` : String(err);
  if (reported.has(msg) || reported.size > 4) return;
  reported.add(msg);
  console.error(err);
  const el = document.createElement('div');
  el.className = 'error-note';
  el.setAttribute('role', 'alert');
  el.textContent = `Something went wrong (tap to close). Please send a screenshot of this:\n${msg}`;
  el.addEventListener('click', () => el.remove());
  document.body.append(el);
}
window.addEventListener('error', e => report(e.error ?? e.message));
window.addEventListener('unhandledrejection', e => report(e.reason));

function fail(err: unknown): void {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;padding:16px">${String(err)}</pre>`);
}
main().catch(fail);
