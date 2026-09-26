import * as THREE from 'three';
import { loadArea } from './world/area';
import { buildWalls, buildRoofs } from './world/buildings';
import { Terrain } from './world/terrain';
import { createFacadeMaterial, createGroundMaterial, createRoofMaterial, createTownHallMaterials, createChurchMaterials, createPromenadeMaterials, createWoodMaterial } from './world/materials';
import { buildBarriers } from './world/props';
import { buildTownHall } from './world/townhall';
import { buildStCasimir } from './world/stcasimir';
import { buildPromenade } from './world/promenade';
import { Character, TOWNSMAN, TRAVELLER } from './player/character';
import { WallGrid } from './world/collision';
import { createSky, sunDirection } from './world/sky';
import { Input } from './player/input';
import { Walker } from './player/walker';
import { createOverlay, createStats, showUnsupported, unsupportedReason } from './ui/overlay';

// A late-September afternoon, in Vilnius local mean time (UT + 1h41m): 16:00 LMT.
const SCENE_TIME = new Date(Date.UTC(1800, 8, 20, 14, 19));
const SHADOW_EXTENT = 70; // half-size of the sun's shadow box around the walker, m

async function main(): Promise<void> {
  const unsupported = unsupportedReason();
  if (unsupported && !new URLSearchParams(location.search).has('force')) {
    showUnsupported(unsupported);
    return;
  }
  const app = document.getElementById('app')!;
  const overlay = createOverlay(() => input.requestLock());
  THREE.DefaultLoadingManager.onProgress = (_url, loaded, total) => overlay.setProgress(loaded / total);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.72;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 5000);

  const data = await loadArea();
  const [thx, thz] = data.meta.townHall;

  // Sky and sun
  const sunDir = sunDirection(SCENE_TIME);
  scene.add(createSky(sunDir));
  // Sky light for everything in shade: a prefiltered environment map rendered from the same sky.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(createSky(sunDir, 500));
  scene.environment = pmrem.fromScene(envScene, 0, 0.1, 1000).texture;
  scene.environmentIntensity = 0.38;
  pmrem.dispose();
  scene.fog = new THREE.Fog('#c9d3db', 180, 1100);

  const sun = new THREE.DirectionalLight('#fff0d8', 3.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -SHADOW_EXTENT; sc.right = SHADOW_EXTENT; sc.top = SHADOW_EXTENT; sc.bottom = -SHADOW_EXTENT;
  sc.near = 1; sc.far = 600;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  // Warm bounce from sunlit cobbles and façades into the shade.
  scene.add(new THREE.HemisphereLight('#c3d5e8', '#a88f6c', 0.45));

  // Ground: LiDAR terrain with fieldstone cobbles
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const terrain = new Terrain(data);
  scene.add(terrain.buildMesh(createGroundMaterial(aniso), thx, thz, 1000, 4, 3.4));

  // Buildings: plastered walls with period windows, and skeleton roofs in clay tile
  const wallMesh = new THREE.Mesh(buildWalls(data), createFacadeMaterial(aniso));
  const roofMesh = new THREE.Mesh(buildRoofs(data), createRoofMaterial(aniso));
  for (const m of [wallMesh, roofMesh]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  const townHallData = data.buildings.find(b => b.role === 'townhall');
  if (townHallData) scene.add(buildTownHall(townHallData, createTownHallMaterials(aniso)));
  const stCasimirData = data.buildings.find(b => b.role === 'stcasimir');
  if (stCasimirData) scene.add(buildStCasimir(stCasimirData, createChurchMaterials(aniso)));
  const walls = new WallGrid(data);
  if (townHallData) {
    const promenade = buildPromenade(townHallData, terrain, createPromenadeMaterials(aniso));
    scene.add(promenade.group);
    for (const [ax, az, bx, bz] of promenade.segments) walls.addSegment(ax, az, bx, bz);
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
  Character.load(spec).then(c => { character = c; walker.setBody(c.object); }).catch(err => console.warn('character', err));

  document.addEventListener('pointerlockchange', () => overlay.setVisible(!input.locked));
  // Ready once every texture queued above has arrived.
  THREE.DefaultLoadingManager.onLoad = () => overlay.ready();
  const stats = createStats(renderer);
  window.addEventListener('keydown', e => { if (e.code === 'Backquote') stats.toggle(); });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Keep the shadow box centred on the walker, snapped to shadow texels to avoid shimmer.
  const texel = (2 * SHADOW_EXTENT) / sun.shadow.mapSize.x;
  const centre = new THREE.Vector3();
  function updateSun(): void {
    centre.set(
      Math.round(walker.position.x / texel) * texel,
      walker.position.y,
      Math.round(walker.position.z / texel) * texel,
    );
    sun.target.position.copy(centre);
    sun.position.copy(centre).addScaledVector(sunDir, 300);
  }

  const timer = new THREE.Timer();
  renderer.setAnimationLoop((time: number) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.05);
    walker.update(dt, camera);
    character?.update(dt, walker.speed);
    updateSun();
    renderer.render(scene, camera);
    stats.update(dt);
  });

  if (import.meta.env.DEV) {
    // Test hooks for screenshots and debugging.
    (window as unknown as Record<string, unknown>).__walk = {
      data, walker, camera, renderer, scene,
      get character() { return character; },
      // Saves the current frame to .screens/<name>.jpg via the dev server.
      snapshot: async (name: string) => {
        renderer.render(scene, camera);
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

main().catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;padding:16px">${String(err)}</pre>`);
});
