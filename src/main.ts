import * as THREE from 'three';
import { loadArea } from './world/area';
import { buildWalls, buildRoofs, buildSoffits, hasTileRoof } from './world/buildings';
import { Terrain } from './world/terrain';
import { createFacadeMaterial, createGroundMaterial, createRoofMaterial, createTownHallMaterials, createChurchMaterials, createPromenadeMaterials, createMarketMaterials, createMetalRoofMaterial, createWoodMaterial, createGateMaterials } from './world/materials';
import { buildBarriers } from './world/props';
import { buildStreetProps, createStreetPropMaterials } from './world/streetprops';
import { buildTownHall } from './world/townhall';
import { buildStCasimir } from './world/stcasimir';
import { buildSubaciusGate, SUBACIUS_GATE } from './world/subacius';
import { buildRudninkaiGate, RUDNINKAI_GATE } from './world/rudninkai';
import { LOST_GATES, buildLostGate, lostGatePlan } from './world/lostgates';
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
  // The walk: the square and the road out to the Subačius Gate site (world/zone.ts)
  const zone = new WalkZone(data);
  const around = (m: number): [number, number, number, number] => [zone.box[0] - m, zone.box[1] - m, zone.box[2] + m, zone.box[3] + m];
  // Open ground: a 1 m raster of the building outlines over the walk and its surroundings
  const free = openGround(data, around(120));

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

  // Ground: LiDAR terrain with fieldstone cobbles
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const terrain = new Terrain(data);
  // Streets: mud in the joints and along the walls always; in rain, water running in the gutters
  const flow = buildFlowMap(terrain, free, around(90));
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
  const facades = buildFacades(data, terrain, houseMats, free);
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
  // The city gates the walk shows (docs/gates.md §8-10): the Subačius Gate at the end of the road, the Rūdninkai Gate
  // at the end of Rūdninkų g. and, at the world's edge, the Saviour's Gate by the Užupis bridge, each standing as it
  // stood before it came down, with the wall either side: a deliberate anachronism in 1900. ?gate=ghost (or #ghost)
  // shows them as ghosts over the street instead. The other lost gates lie beyond the world (vilnius.gg/gates).
  const ghostGate = new URLSearchParams(location.search).get('gate') === 'ghost' || location.hash === '#ghost';
  const saviour = LOST_GATES.find(g => g.key === 'saviour')!;
  type GateBuild = (o: Parameters<typeof buildSubaciusGate>[0]) => ReturnType<typeof buildSubaciusGate>;
  const gateList: [GateBuild, { x: number; z: number }, number][] = [
    [buildSubaciusGate, SUBACIUS_GATE, 0.97], [buildRudninkaiGate, RUDNINKAI_GATE, 0.92],
    [o => buildLostGate(saviour, o), lostGatePlan(saviour), saviour.cover],
  ];
  const gates = gateList.map(([build, at, cover]) => {
    const mats = createGateMaterials(aniso, terrain.heightAt(at.x, at.z), cover);
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
  // Street furniture c.1900: pavements and kerbs, guard stones, drain grates, the advertising column,
  // the cab stand with its pump and trough, garden benches, goods at a few shop doors
  const propMats = createStreetPropMaterials(aniso);
  if (RAIN) for (const m of Object.values(propMats)) wet(m, 'roof');
  propMats.gutter.envMap = propMats.water.envMap = scene.environment; // standing water mirrors the full sky, as the glass does
  const streetProps = buildStreetProps({ data, terrain, anchors: facades.anchors, flow, mats: propMats, th: townHallData, zone, ground: { cx: thx, cz: thz, size: 1000, step: 4 }, rain: RAIN }); // ground: the terrain mesh's grid
  scene.add(streetProps.group);
  for (const [ax, az, bx, bz, low] of streetProps.segments) walls.addSegment(ax, az, bx, bz, low);
  // Market stalls, carts and townsfolk stream in after the first frame
  let market: Market | null = null;
  let crowd: Crowd | null = null, traffic: Traffic | null = null;
  if (townHallData) {
    buildMarket(data, townHallData, terrain, createMarketMaterials(aniso), false).then(async mk => { // c.1900: no stalls on the square
      market = mk;
      scene.add(mk.group);
      shadows.apply(mk.group);
      for (const [ax, az, bx, bz] of mk.segments) walls.addSegment(ax, az, bx, bz);
      // Droshkies, a closed carriage and a farm cart on a loop fitted round the square (hoods up in the rain)
      buildTraffic({
        th: townHallData, walls, terrain, free, wood: createWoodMaterial(aniso), rain: RAIN, wet: RAIN ? wet : undefined,
      }).then(tr => { traffic = tr; scene.add(tr.group); shadows.apply(tr.group); }).catch(err => console.warn('traffic', err));
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
  const barrierWood = createWoodMaterial(aniso);
  if (RAIN) wet(barrierWood, 'roof');
  const barriers = buildBarriers(data, terrain, zone, barrierWood, propMats.iron);
  if (barriers) scene.add(barriers);

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
  }, settings.current.mapLook, ghostGate ? 'ghost' : 'solid');
  const streetTitle = new PlaceTitle(data); // the street you are on, as a title for a few seconds
  overlay.onVisibility(visible => { map.setWalking(!visible); streetTitle.setActive(!visible); });
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
  ambience = new Ambience(camera, scene, {
    square: new THREE.Vector3(thx, terrain.heightAt(thx, thz - 30), thz - 30), bells: bellsAt,
    townHall: { x: thx, z: thz }, ground: (x, z) => terrain.heightAt(x, z),
  }, RAIN);
  scene.add(camera);
  window.addEventListener('keydown', e => { if (e.code === 'KeyM' && ambience) touch.setMuted(ambience.toggleMute()); });

  document.addEventListener('pointerlockchange', () => { if (!map.isOpen) overlay.setVisible(!input.locked); });
  // Ready once every texture queued above has arrived.
  THREE.DefaultLoadingManager.onLoad = () => overlay.ready();
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
  renderer.setAnimationLoop((time: number) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.05);
    if (map.isOpen) { map.update(); return; } // the world holds still under the full map
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
  });

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
function openGround(data: Awaited<ReturnType<typeof loadArea>>, box: [number, number, number, number]): (x: number, z: number) => boolean {
  const x0 = Math.floor(box[0]), z0 = Math.floor(box[1]), W = Math.ceil(box[2]) - x0, H = Math.ceil(box[3]) - z0;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#fff';
  for (const b of data.buildings) {
    if (b.rings[0].every(([x, z]) => x < x0 || z < z0 || x > x0 + W || z > z0 + H)) continue;
    g.beginPath();
    for (const ring of b.rings) ring.forEach(([x, z], i) => (i ? g.lineTo : g.moveTo).call(g, x - x0, z - z0));
    g.fill('evenodd');
  }
  const px = g.getImageData(0, 0, W, H).data;
  return (x, z) => {
    const i = Math.floor(x - x0), j = Math.floor(z - z0);
    if (i < 0 || j < 0 || i >= W || j >= H) return false;
    return px[(j * W + i) * 4] < 64;
  };
}

function fail(err: unknown): void {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;padding:16px">${String(err)}</pre>`);
}
main().catch(fail);
