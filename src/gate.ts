import * as THREE from 'three';
import { buildSubaciusGate, SUBACIUS_GATE } from './world/subacius';
import { masonryMaterial, fieldstoneMaterial, plasterMaterial, createWoodMaterial, oldBrickMaterial, worldTex } from './world/materials';
import { age } from './world/ageing';
import { createSky } from './world/sky';
import { loadFonts } from './ui/fonts';
import type { AreaData } from './world/area';
import type { Terrain } from './world/terrain';

/**
 * The Subačius Gate on its own (gate.html): the game's model and materials in clear daylight, on level ground,
 * without the rain, the mist or the painted look of the walk, to be turned round and looked at. Drag to turn it,
 * wheel or pinch to come closer; the buttons frame the views that matter.
 */

const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 0.6;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 3000);

// A late-morning sun from the south-east, low enough to model the towers and to light the field front
const sunDir = new THREE.Vector3(0.62, 0.62, 0.48).normalize();
scene.add(createSky(sunDir, 2500, 3.4));
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
envScene.add(createSky(sunDir, 500, 3.4));
scene.environment = pmrem.fromScene(envScene, 0, 0.1, 1000).texture;
scene.environmentIntensity = 0.35;
pmrem.dispose();
scene.fog = new THREE.Fog('#c9d3db', 120, 600);

const [cx, cz] = [SUBACIUS_GATE.x, SUBACIUS_GATE.z];
const sun = new THREE.DirectionalLight('#fff0d8', 7);
sun.position.set(cx + sunDir.x * 80, sunDir.y * 80, cz + sunDir.z * 80);
sun.target.position.set(cx, 0, cz);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 220 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target, new THREE.HemisphereLight('#c3d5e8', '#a88f6c', 0.35));

// Level ground paved with the walk's cobbles
const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const groundGeo = new THREE.PlaneGeometry(260, 260).rotateX(-Math.PI / 2).translate(cx, 0, cz);
{
  const p = groundGeo.getAttribute('position') as THREE.BufferAttribute, uv = groundGeo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), -p.getZ(i));
}
const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
  color: '#9a9083', roughness: 0.95,
  map: worldTex('cobblestone_floor_08', 'diff', true, aniso, 3.4), normalMap: worldTex('cobblestone_floor_08', 'nor', false, aniso, 3.4),
}));
ground.receiveShadow = true;
scene.add(ground);

// The gate and the wall either side, exactly as in the walk (the same code and materials), on level ground
const flat = { heightAt: () => 0 } as unknown as Terrain;
const mats = {
  render: masonryMaterial(aniso, { brick: '#5e4034', plaster: [0.55, 0.52, 0.45], cover: 0.97, grime: 0.2, ground: 0 }),
  trim: plasterMaterial('#b3ab9b', aniso),
  stone: fieldstoneMaterial(aniso),
  roof: new THREE.MeshStandardMaterial({ map: worldTex('clay_roof_tiles', 'diff', true, aniso, 1.6), normalMap: worldTex('clay_roof_tiles', 'nor', false, aniso, 1.6), color: '#7d6258', roughness: 0.95, side: THREE.DoubleSide }),
  dark: new THREE.MeshStandardMaterial({ color: '#1c1815', roughness: 1 }),
  wood: createWoodMaterial(aniso),
  iron: new THREE.MeshStandardMaterial({ color: '#2b2a28', roughness: 0.55, metalness: 0.5 }),
  wall: masonryMaterial(aniso, { brick: '#5e4034', plaster: [0.5, 0.47, 0.41], cover: 0.88, grime: 0.24, ground: 0 }),
  remnant: oldBrickMaterial(aniso),
};
for (const m of [mats.render, mats.trim, mats.wall]) age(m, { ground: 0, strength: 1, seed: 5 });
age(mats.roof, { roof: true, strength: 0.8 });
const gate = buildSubaciusGate({ data: {} as AreaData, terrain: flat, look: 'solid', mats, fog: { near: 120, far: 600 } });
scene.add(gate.solid);

// ---- turning it round: yaw and pitch about a target, at a distance; eased toward the goal ----
interface View { yaw: number; pitch: number; dist: number; target: [number, number, number] }
// yaw: the camera's bearing from the target, 0 = east (the field side), pi/2 = south, pi = west (the town)
const VIEWS: Record<string, View> = {
  drawing: { yaw: 0.95, pitch: 0.1, dist: 42, target: [cx, 9, cz + 3] },                  // about where Smuglevičius sat
  field: { yaw: 0.04, pitch: 0.07, dist: 36, target: [cx + 2, 8, cz] },                  // from the Subačius road
  city: { yaw: Math.PI, pitch: 0.1, dist: 34, target: [cx - 2, 8, cz] },                 // from inside the town
  passage: { yaw: Math.PI, pitch: 0.05, dist: 24, target: [cx + 2, 3.4, cz] },           // looking through the gate
  above: { yaw: 0.6, pitch: 0.72, dist: 70, target: [cx - 6, 4, cz + 6] },               // the gate, the wall, the plan
};
// #field, #city, #passage, #above or #drawing (a bare #anchor reaches the page even as a claude.ai artifact) starts there
const first = location.hash.slice(1) in VIEWS ? location.hash.slice(1) : 'drawing';
const goal: View = { ...VIEWS[first], target: [...VIEWS[first].target] };
const now: View = first === 'drawing' ? { ...goal, yaw: goal.yaw - 0.9, dist: goal.dist * 1.4, target: [...goal.target] } : { ...goal, target: [...goal.target] };
let spin = first === 'drawing';                                                           // a slow turn until touched
const place = () => {
  const [tx, ty, tz] = now.target, c = Math.cos(now.pitch);
  camera.position.set(tx + Math.cos(now.yaw) * c * now.dist, ty + Math.sin(now.pitch) * now.dist, tz + Math.sin(now.yaw) * c * now.dist);
  camera.lookAt(tx, ty, tz);
};

const el = renderer.domElement;
el.style.touchAction = 'none';
const pointers = new Map<number, { x: number; y: number }>();
let pinch = 0;
el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); spin = false; });
el.addEventListener('pointerup', e => { pointers.delete(e.pointerId); pinch = 0; });
el.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); pinch = 0; });
el.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (pointers.size === 2) {                                   // two fingers: pinch to come closer
    p.x = e.clientX; p.y = e.clientY;
    const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch) goal.dist = THREE.MathUtils.clamp(goal.dist * (pinch / d), 6, 140);
    pinch = d;
    return;
  }
  goal.yaw += (e.clientX - p.x) * 0.006;
  goal.pitch = THREE.MathUtils.clamp(goal.pitch + (e.clientY - p.y) * 0.004, -0.05, 1.35);
  p.x = e.clientX; p.y = e.clientY;
});
el.addEventListener('wheel', e => { e.preventDefault(); spin = false; goal.dist = THREE.MathUtils.clamp(goal.dist * Math.exp(e.deltaY * 0.0012), 6, 140); }, { passive: false });

// ---- the caption and the view buttons ----
const ui = document.createElement('div');
ui.className = 'gv';
ui.innerHTML = `
  <header class="gv-card">
    <h1>Subačius Gate</h1>
    <p class="gv-sub">Subačiaus vartai, Vilnius · as it stood before 1801</p>
    <p class="gv-note">The city wall's east gate, on the road to Vitebsk, Polotsk and Moscow; built with the wall in 1503–22, pulled down in 1801–02. Modelled after P. Smuglevičius's drawing of 1785–86 and what archaeology found: the plan, the round towers, the loopholes and the vaulted passage are from the sources; the measurements are read off the drawing.</p>
  </header>
  <nav class="gv-views" aria-label="Views">
    ${Object.entries({ drawing: 'The 1785 view', field: 'Field side', city: 'Town side', passage: 'Passage', above: 'From above' })
      .map(([k, t]) => `<button data-view="${k}" aria-pressed="${k === first}">${t}</button>`).join('\n    ')}
  </nav>
  <p class="gv-hint">Drag to turn · scroll or pinch to come closer</p>`;
document.body.appendChild(ui);
ui.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.addEventListener('click', () => {
  const v = VIEWS[b.dataset.view!];
  Object.assign(goal, { ...v, target: [...v.target] });
  spin = false;
  ui.querySelectorAll('[data-view]').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
}));
void loadFonts();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Timer();
renderer.setAnimationLoop((t: number) => {
  clock.update(t);
  const dt = Math.min(clock.getDelta(), 0.05), k = 1 - Math.exp(-5 * dt);
  if (spin) goal.yaw += dt * 0.08;
  now.yaw += (goal.yaw - now.yaw) * k;
  now.pitch += (goal.pitch - now.pitch) * k;
  now.dist += (goal.dist - now.dist) * k;
  for (let i = 0; i < 3; i++) now.target[i] += (goal.target[i] - now.target[i]) * k;
  place();
  renderer.render(scene, camera);
});

// DEV: the screenshot tool can pick a view (window.__gate.view('field'))
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__gate = {
  view: (name: string) => { const v = VIEWS[name]; Object.assign(goal, { ...v, target: [...v.target] }); Object.assign(now, { ...v, target: [...v.target] }); spin = false; },
  renderer, scene, camera,
};
