import * as THREE from 'three';
import { buildSubaciusGate, SUBACIUS_GATE } from './world/subacius';
import { buildRudninkaiGate, RUDNINKAI_GATE } from './world/rudninkai';
import { LOST_GATES, buildLostGate, lostGatePlan } from './world/lostgates';
import type { GateSpec } from './world/towergate';
import { createGateMaterials, worldTex } from './world/materials';
import { age } from './world/ageing';
import { createSky } from './world/sky';
import { loadFonts } from './ui/fonts';
import type { AreaData, XZ } from './world/area';
import type { Terrain } from './world/terrain';

/**
 * The city gates on their own (gate.html): the game's models and materials in clear daylight, on level ground,
 * without the rain, the mist or the painted look of the walk, to be turned round and looked at. Drag to turn one,
 * wheel or pinch to come closer; the buttons frame the views that matter, and the card switches between the gates.
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

// A late-morning sun from the south-east, low enough to model the towers and to light the fronts
const sunDir = new THREE.Vector3(0.62, 0.62, 0.48).normalize();
const sky = createSky(sunDir, 2500, 3.4);
scene.add(sky);
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
envScene.add(createSky(sunDir, 500, 3.4));
scene.environment = pmrem.fromScene(envScene, 0, 0.1, 1000).texture;
scene.environmentIntensity = 0.35;
pmrem.dispose();
scene.fog = new THREE.Fog('#c9d3db', 120, 600);

const sun = new THREE.DirectionalLight('#fff0d8', 7);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 220 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target, new THREE.HemisphereLight('#c3d5e8', '#a88f6c', 0.35));

// Level ground paved with the walk's cobbles, moved under whichever gate is shown
const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const groundGeo = new THREE.PlaneGeometry(260, 260).rotateX(-Math.PI / 2);
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

// The gates and the wall beside them, exactly as in the walk (the same code and materials), on level ground
const flat = { heightAt: () => 0 } as unknown as Terrain;
const matsFor = (cover?: number, plaster?: [number, number, number], roof?: string) => {
  const mats = createGateMaterials(aniso, 0, cover, plaster);
  if (roof) (mats.roof as THREE.MeshStandardMaterial).color.set(roof);
  for (const m of [mats.render, mats.trim, mats.wall]) age(m, { ground: 0, strength: 1, seed: 5 });
  age(mats.roof, { roof: true, strength: 0.8 });
  return mats;
};
const opts = { data: {} as AreaData, terrain: flat, look: 'solid' as const, mats: matsFor(), fog: { near: 120, far: 600 } };

// A view in the gate's own terms: the camera's bearing as a direction in (out, along) — out along the road, away from
// the town; along the wall — its pitch and distance, and what it looks at, offset from the gate's centre the same way
interface Shot { dir: XZ; pitch: number; dist: number; at: [number, number, number] }
interface GateDef { name: string; sub: string; note: string; centre: XZ; out: XZ; group: THREE.Group; views: Record<string, Shot>; labels: Record<string, string> }
const GATES: Record<string, GateDef> = {
  subacius: {
    name: 'Subačius Gate', sub: 'Subačiaus vartai, Vilnius · as it stood before 1801',
    note: 'The city wall’s east gate, on the road to Vitebsk, Polotsk and Moscow; built with the wall in 1503–22, pulled down in 1801–02. Modelled after P. Smuglevičius’s drawing of 1785–86 and what archaeology found: the plan, the round towers, the loopholes and the vaulted passage are from the sources; the measurements are read off the drawing.',
    centre: [SUBACIUS_GATE.x, SUBACIUS_GATE.z], out: [1, 0], group: buildSubaciusGate(opts).solid,
    views: {
      drawing: { dir: [0.58, 0.81], pitch: 0.1, dist: 42, at: [0, 9, 3] },      // about where Smuglevičius sat
      field: { dir: [1, 0.04], pitch: 0.07, dist: 36, at: [2, 8, 0] },           // from the Subačius road
      city: { dir: [-1, 0], pitch: 0.1, dist: 34, at: [-2, 8, 0] },              // from inside the town
      passage: { dir: [-1, 0], pitch: 0.05, dist: 24, at: [2, 3.4, 0] },         // looking through the gate
      above: { dir: [0.83, 0.56], pitch: 0.72, dist: 70, at: [-6, 4, 6] },        // the gate, the wall, the plan
    },
    labels: { drawing: 'The 1785 view', field: 'Field side', city: 'Town side', passage: 'Passage', above: 'From above' },
  },
  rudninkai: {
    name: 'Rūdninkai Gate', sub: 'Rūdninkų vartai, Vilnius · as it stood before 1800',
    note: 'The city wall’s west gate, on the road to Grodno and Poland; built with the wall in 1503–22, given its long barbican in 1675–79, pulled down in 1800. Modelled after P. Smuglevičius’s drawing of 1785 and the descriptions: the tall tower, the two-storey barbican, the round cannon ports and the guard’s niche in the passage are from the sources; the measurements are read off the drawing.',
    centre: [RUDNINKAI_GATE.x, RUDNINKAI_GATE.z], out: RUDNINKAI_GATE.out, group: buildRudninkaiGate(opts).solid,
    views: {
      drawing: { dir: [0.6, -1], pitch: 0.08, dist: 60, at: [2, 8, 0] },         // from the south, as Smuglevičius drew it
      field: { dir: [1, 0.06], pitch: 0.07, dist: 46, at: [3, 9, 0] },          // coming in from the Grodno road
      city: { dir: [-1, -0.05], pitch: 0.1, dist: 42, at: [-5, 10, 0] },         // from Rūdninkų g.
      passage: { dir: [1, 0], pitch: 0.05, dist: 26, at: [13, 3.6, 0] },         // looking into the gateway
      above: { dir: [0.55, -0.85], pitch: 0.7, dist: 82, at: [2, 5, 0] },        // the tower, the barbican, the wall
    },
    labels: { drawing: 'The 1785 view', field: 'Field side', city: 'Town side', passage: 'Passage', above: 'From above' },
  },
};
// The lost gates, which no drawing shows: the same five views, framed from each gate's size
const framed = (spec: GateSpec, painted: { dir: XZ; pitch: number; far?: number; lift?: number }[] = []): GateDef['views'] => {
  const t = spec.tower, H = t.eave + t.roof.rise + (t.roof.kind === 'saddle' && t.roof.gable === 'baroque' ? 1.6 : 0);
  const f = spec.flank, len = (spec.barbican?.length ?? 0) + t.depth, c = ((spec.barbican?.length ?? 0) - t.depth) / 2;
  const span = Math.max(2 * t.hw + 10, len, f ? 2 * Math.max(-f.z0, f.z1) + 4 : 0);
  const d = Math.max(30, 1.5 * H + 1.1 * span), y = H * 0.48, side = f && f.z0 + f.z1 < 0 ? 1 : -1;   // from the side away from a flanking tower
  return {
    drawing: painted[0] ? { dir: painted[0].dir, pitch: painted[0].pitch, dist: d * 0.85 * (painted[0].far ?? 1), at: [-2, y * (painted[0].lift ?? 0.9), 0] } : { dir: [0.72, 0.7 * side], pitch: 0.1, dist: d * 1.05, at: [0, y, 0] },
    ...(painted[1] ? { painting: { dir: painted[1].dir, pitch: painted[1].pitch, dist: d * 0.85 * (painted[1].far ?? 1), at: [-2, y * (painted[1].lift ?? 0.9), 0] as [number, number, number] } } : {}),
    field: { dir: [1, 0.05], pitch: 0.07, dist: d * 0.9, at: [-c, y, 0] },
    city: { dir: [-1, -0.05], pitch: 0.1, dist: d * 0.9, at: [-c - t.depth / 2, y, 0] },
    ...(spec.passage.walled ? {} : { passage: { dir: [-1, 0] as XZ, pitch: 0.05, dist: 18 + t.depth, at: [-c + 1, spec.passage.spring, 0] as [number, number, number] } }),
    above: { dir: [0.55, -0.85], pitch: 0.7, dist: d * 1.5, at: [0, 3, 0] },
  };
};
for (const g of LOST_GATES) {
  const plan = lostGatePlan(g), views = framed(g.spec, g.views);
  GATES[g.key] = {
    name: g.spec.name, sub: g.sub, note: g.note, centre: [plan.x, plan.z], out: plan.out,
    group: buildLostGate(g, { ...opts, mats: matsFor(g.cover, g.plaster, g.roof) }).solid, views,
    labels: { drawing: g.views?.[0]?.label ?? 'Corner view', ...(g.views?.[1] ? { painting: g.views[1].label } : {}), field: 'Field side', city: 'Town side', ...(views.passage ? { passage: 'Passage' } : {}), above: 'From above' },
  };
}
// the switch runs round the wall: east, north, west
const ORDER = ['subacius', 'saviour', 'bernardine', 'castle', 'wet', 'tatar', 'vilija', 'trakai', 'rudninkai'];
for (const d of Object.values(GATES)) { d.group.visible = false; scene.add(d.group); }

// ---- turning it round: yaw and pitch about a target, at a distance; eased toward the goal ----
interface View { yaw: number; pitch: number; dist: number; target: [number, number, number] }
const viewOf = (d: GateDef, s: Shot): View => {
  const [ox, oz] = d.out, [wx, wz] = [-oz, ox];                 // out along the road; along the wall
  const yaw = Math.atan2(oz * s.dir[0] + wz * s.dir[1], ox * s.dir[0] + wx * s.dir[1]);
  const [ax, ay, az] = s.at;
  return { yaw, pitch: s.pitch, dist: s.dist, target: [d.centre[0] + ox * ax + wx * az, ay, d.centre[1] + oz * ax + wz * az] };
};
// #rudninkai, #rudninkai-field, #field (the Subačius Gate), ... (a bare #anchor reaches the page even as a claude.ai artifact)
const [hashGate, hashView] = (() => {
  const h = location.hash.slice(1).split('-');
  return h[0] in GATES ? [h[0], h[1]] : ['subacius', h[0]];
})();
let gate = hashGate;
const first = hashView && hashView in GATES[gate].views ? hashView : 'drawing';
const goal: View = viewOf(GATES[gate], GATES[gate].views[first]);
// a swoop in on the opening view, unless the address asked for a view
const now: View = first === 'drawing' && !hashView ? { ...goal, yaw: goal.yaw - 0.9, dist: goal.dist * 1.4, target: [...goal.target] } : { ...goal, target: [...goal.target] };
let spin = first === 'drawing' && !hashView;                     // a slow turn until touched, unless a view was asked for
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
  if (pointers.size === 2) {                                     // two fingers: pinch to come closer
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

// ---- the caption, the gate switch and the view buttons ----
const ui = document.createElement('div');
ui.className = 'gv';
ui.innerHTML = `
  <header class="gv-card">
    <nav class="gv-gates" aria-label="Gates">${ORDER.map(k => `<button data-gate="${k}">${GATES[k].name.replace(' Gate', '')}</button>`).join('')}</nav>
    <h1></h1>
    <p class="gv-sub"></p>
    <p class="gv-note"></p>
  </header>
  <nav class="gv-views" aria-label="Views"></nav>
  <p class="gv-hint">Drag to turn · scroll or pinch to come closer</p>`;
document.body.appendChild(ui);
const viewsNav = ui.querySelector<HTMLElement>('.gv-views')!;
const pick = (v: string, jump = false) => {
  const d = GATES[gate], s = d.views[v];
  Object.assign(goal, viewOf(d, s));
  if (jump) Object.assign(now, { ...goal, target: [...goal.target] });
  spin = false;
  viewsNav.querySelectorAll('[data-view]').forEach(o => o.setAttribute('aria-pressed', String((o as HTMLElement).dataset.view === v)));
};
const show = (k: string, v: string, jump: boolean) => {
  gate = k;
  const d = GATES[k];
  for (const [key, g] of Object.entries(GATES)) g.group.visible = key === k;
  // the ground, the sun and its shadows follow the gate
  ground.position.set(d.centre[0], 0, d.centre[1]);
  sun.position.set(d.centre[0] + sunDir.x * 80, sunDir.y * 80, d.centre[1] + sunDir.z * 80);
  sun.target.position.set(d.centre[0], 0, d.centre[1]);
  ui.querySelector('h1')!.textContent = d.name;
  ui.querySelector('.gv-sub')!.textContent = d.sub;
  ui.querySelector('.gv-note')!.textContent = d.note;
  ui.querySelectorAll<HTMLButtonElement>('[data-gate]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.gate === k)));
  viewsNav.innerHTML = Object.entries(d.labels).map(([key, t]) => `<button data-view="${key}" aria-pressed="false">${t}</button>`).join('');
  viewsNav.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b => b.addEventListener('click', () => pick(b.dataset.view!)));
  pick(v, jump);
};
ui.querySelectorAll<HTMLButtonElement>('[data-gate]').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.gate === gate) return;
  show(b.dataset.gate!, 'drawing', true);
  history.replaceState(null, '', `#${b.dataset.gate}`);
}));
show(gate, first, false);
spin = first === 'drawing' && !hashView;
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

// DEV: the screenshot tool can pick a gate and a view (window.__gate.view('field', 'rudninkai'))
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__gate = {
  view: (name: string, which = gate) => { if (which !== gate) show(which, name, true); else pick(name, true); },
  renderer, scene, camera,
};
