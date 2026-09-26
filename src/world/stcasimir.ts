import * as THREE from 'three';
import type { Building, XZ } from './area';
import { mbox, merged, trianglesToGeometry } from './geom';

/*
 * St Casimir's Church, simplified ("landmark-lite") as around 1800.
 * Sources (docs/REFERENCES.md §5): KVR 27304; OSM outline (way 29503660); national LiDAR
 * (eaves ~18 m, top ~56 m); the 1836 Januszewicz view and 1840 survey drawing for the
 * pre-1864 form: taller square west towers with clock stages and domed caps, a crown on
 * the dome lantern. Proportions of towers, drum and crown are conjecture (grade C).
 *
 * Local frame: origin at the middle of the west façade, +X east along the nave, +Z south.
 */

export interface ChurchMaterials {
  wall: THREE.Material;
  stone: THREE.Material;
  roof: THREE.Material;  // lead-grey sheet
  dome: THREE.Material;  // copper
  gilt: THREE.Material;  // crown and crosses
  dark: THREE.Material;  // window and door openings
}

/** Oriented bounding box of a ring: tries each edge direction, keeps the smallest area. */
function orientedBox(ring: XZ[]) {
  let best = { area: Infinity, ux: 1, uz: 0, min: [0, 0], max: [0, 0] };
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 2) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of ring) {
      const u = x * ux + z * uz, v = -x * uz + z * ux;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (area < best.area) best = { area, ux, uz, min: [u0, v0], max: [u1, v1] };
  }
  // Make u the long axis pointing east (+x).
  let { ux, uz } = best;
  let [u0, v0] = best.min, [u1, v1] = best.max;
  if (u1 - u0 < v1 - v0) {
    [ux, uz] = [-uz, ux];
    [u0, u1, v0, v1] = [v0, v1, -u1, -u0];
  }
  if (ux < 0) { ux = -ux; uz = -uz; [u0, u1] = [-u1, -u0]; [v0, v1] = [-v1, -v0]; }
  return { ux, uz, u0, u1, v0, v1 };
}

function gableRoof(x0: number, x1: number, halfW: number, y: number, rise: number, alongX: boolean): THREE.BufferGeometry {
  const p = (a: number, b: number, h: number) => (alongX ? new THREE.Vector3(a, h, b) : new THREE.Vector3(b, h, a));
  const r0 = p(x0, 0, y + rise), r1 = p(x1, 0, y + rise);
  return trianglesToGeometry([
    [p(x0, -halfW, y), r0, r1], [p(x0, -halfW, y), r1, p(x1, -halfW, y)],
    [p(x0, halfW, y), r1, r0], [p(x0, halfW, y), p(x1, halfW, y), r1],
  ]);
}

function gableEnd(x: number, halfW: number, y: number, rise: number, alongX: boolean): THREE.BufferGeometry {
  const shape = new THREE.Shape([new THREE.Vector2(-halfW, 0), new THREE.Vector2(halfW, 0), new THREE.Vector2(0, rise)]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false });
  g.translate(0, y, -0.25);
  if (alongX) g.rotateY(Math.PI / 2);
  g.translate(alongX ? x : 0, 0, alongX ? 0 : x);
  return g;
}

function arched(x: number, z: number, y: number, w: number, h: number, facing: 'x' | 'z'): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(w / 2, h - w / 2);
  shape.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
  shape.lineTo(-w / 2, 0);
  const g = new THREE.ShapeGeometry(shape, 8);
  if (facing === 'x') g.rotateY(-Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

export function buildStCasimir(b: Building, mats: ChurchMaterials): THREE.Group {
  const box = orientedBox(b.rings[0]);
  const L = box.u1 - box.u0, Wd = box.v1 - box.v0;
  const eave = b.eave;                         // LiDAR, ~18 m
  const nave = { x0: 7, x1: L - 11, half: Math.min(13, Wd / 2 - 3.5) };
  const xc = L * 0.63;                         // crossing, from the widest part of the outline
  const tHalf = 9;                             // transept half-width along the nave
  const roofRise = 8.5;

  const wall: THREE.BufferGeometry[] = [], stone: THREE.BufferGeometry[] = [], roof: THREE.BufferGeometry[] = [];
  const dome: THREE.BufferGeometry[] = [], gilt: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [];

  // Nave with aisles, and the transept
  wall.push(mbox(nave.x1 - nave.x0, eave + 2, nave.half * 2, (nave.x0 + nave.x1) / 2, eave / 2 - 1, 0));
  wall.push(mbox(tHalf * 2, eave + 2, Wd - 1, xc, eave / 2 - 1, (box.v0 + box.v1) / 2 - (box.v0 + box.v1) / 2));
  // Apse (half cylinder) at the east end
  const apseR = Math.min(9, nave.half - 1);
  const apse = new THREE.CylinderGeometry(apseR, apseR, eave - 2 + 2, 20, 1, false, 0, Math.PI);
  apse.translate(nave.x1, (eave - 2) / 2 - 1, 0);
  wall.push(apse);
  const apseRoof = new THREE.SphereGeometry(apseR + 0.3, 20, 8, 0, Math.PI, 0, Math.PI / 2);
  apseRoof.scale(1, 0.55, 1);
  apseRoof.translate(nave.x1, eave - 2, 0);
  roof.push(apseRoof);
  // Main cornice
  stone.push(mbox(nave.x1 - nave.x0 + 0.6, 0.7, nave.half * 2 + 0.8, (nave.x0 + nave.x1) / 2, eave - 0.35, 0));
  stone.push(mbox(tHalf * 2 + 0.8, 0.7, Wd - 0.2, xc, eave - 0.35, 0));

  // Gabled roofs (lead-grey sheet), gable ends
  roof.push(gableRoof(nave.x0, nave.x1, nave.half + 0.5, eave, roofRise, true));
  roof.push(gableRoof(-(Wd / 2 - 0.2), Wd / 2 - 0.2, tHalf + 0.5, eave, roofRise, false).translate(xc, 0, 0));
  for (const zEnd of [-(Wd / 2 - 0.5), Wd / 2 - 0.5]) {
    const g = gableEnd(0, tHalf, eave, roofRise, false);
    g.translate(xc, 0, zEnd);
    wall.push(g);
  }

  // West towers: taller in 1800, with clock stages and domed caps with lanterns
  const towerW = 7.5, towerZ = Wd / 2 - towerW / 2 - 0.5, towerTop = 34;
  for (const s of [-1, 1]) {
    const z = s * towerZ;
    wall.push(mbox(towerW, towerTop + 1, towerW, towerW / 2, towerTop / 2 - 0.5, z));
    stone.push(mbox(towerW + 0.6, 0.6, towerW + 0.6, towerW / 2, eave - 0.3, z));
    stone.push(mbox(towerW + 0.5, 0.6, towerW + 0.5, towerW / 2, towerTop - 0.3, z));
    // Belfry stage with clock faces
    wall.push(mbox(towerW - 1, 4.5, towerW - 1, towerW / 2, towerTop + 2.25, z));
    const clock = new THREE.CircleGeometry(1.1, 20);
    clock.rotateY(-Math.PI / 2);
    clock.translate(-0.01 + 0.5, towerTop + 2.4, z);
    gilt.push(clock);
    for (const k of [-1, 1]) dark.push(arched(towerW / 2, z + (k * towerW) / 2 - k * 0.01, towerTop - 6, 1.6, 4, 'z'));
    // Domed cap and lantern
    const cap = new THREE.SphereGeometry(towerW / 2 - 0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.translate(towerW / 2, towerTop + 4.5, z);
    dome.push(cap);
    const lantern = new THREE.CylinderGeometry(0.8, 0.9, 3, 8);
    lantern.translate(towerW / 2, towerTop + 4.5 + towerW / 2 - 0.3 + 1.2, z);
    wall.push(lantern);
    const tip = new THREE.ConeGeometry(0.9, 2.2, 8);
    tip.translate(towerW / 2, towerTop + 4.5 + towerW / 2 - 0.3 + 3.8, z);
    dome.push(tip);
  }
  // West façade between the towers: pediment over the central bay, portal and windows
  const facadeHalf = towerZ - towerW / 2;
  wall.push(mbox(1.2, eave + 2, facadeHalf * 2, 0.6, eave / 2 - 1, 0));
  const ped = gableEnd(0, facadeHalf, eave, 6, true);
  ped.translate(0.9, 0, 0);
  wall.push(ped);
  dark.push(arched(-0.01, 0, 0, 3.2, 6.5, 'x'));
  for (const zz of [-facadeHalf / 2, facadeHalf / 2]) dark.push(arched(-0.01, zz, 3, 1.8, 4.5, 'x'));
  dark.push(arched(-0.01, 0, 9.5, 2.4, 5, 'x'));

  // Side windows along the nave (tall, round-headed)
  for (let x = nave.x0 + 4; x < nave.x1 - 3; x += 6) {
    if (Math.abs(x - xc) < tHalf + 1.5) continue;
    for (const s of [-1, 1]) {
      const g = arched(0, 0, 0, 1.9, 6, 'z');
      if (s > 0) g.rotateY(Math.PI);
      g.translate(x, 6.5, s * (nave.half + 0.01));
      dark.push(g);
    }
  }

  // Crossing dome: drum, stepped dome, lantern, and the crown with orb and cross.
  // LiDAR max over the church is 56.1 m above ground; the drum height is set to reach it.
  const drumR = 8.5, drumTop = eave + 16;
  const drum = new THREE.CylinderGeometry(drumR, drumR, drumTop - eave + 2, 32);
  drum.translate(xc, (eave + drumTop) / 2 - 1, 0);
  wall.push(drum);
  stone.push(new THREE.CylinderGeometry(drumR + 0.5, drumR + 0.5, 0.6, 32).translate(xc, drumTop - 0.3, 0));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const g = arched(0, 0, 0, 1.4, 3.6, 'x');
    g.rotateY(-a);
    g.translate(xc + Math.cos(a) * (drumR + 0.02), eave + 6.5, Math.sin(a) * (drumR + 0.02));
    dark.push(g);
  }
  const step = new THREE.CylinderGeometry(drumR - 0.6, drumR, 1.8, 32);
  step.translate(xc, drumTop + 0.9, 0);
  dome.push(step);
  const cupola = new THREE.SphereGeometry(drumR - 0.6, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  cupola.translate(xc, drumTop + 1.8, 0);
  dome.push(cupola);
  const lanternBase = drumTop + 1.8 + (drumR - 0.6) - 0.5;
  wall.push(new THREE.CylinderGeometry(2.2, 2.4, 6, 16).translate(xc, lanternBase + 3, 0));
  dome.push(new THREE.SphereGeometry(2.5, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(xc, lanternBase + 6, 0));
  // Crown: eight arched bands rising to an orb and cross
  const crownBase = lanternBase + 7.5;
  gilt.push(new THREE.TorusGeometry(2.4, 0.25, 8, 24).rotateX(Math.PI / 2).translate(xc, crownBase, 0));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const band = new THREE.TorusGeometry(2.2, 0.16, 6, 16, Math.PI / 2);
    band.rotateY(-a);
    band.translate(xc, crownBase, 0);
    gilt.push(band);
  }
  gilt.push(new THREE.SphereGeometry(0.6, 12, 8).translate(xc, crownBase + 2.8, 0));
  gilt.push(mbox(0.2, 2.2, 0.2, xc, crownBase + 4.3, 0));
  gilt.push(mbox(0.2, 0.2, 1.2, xc, crownBase + 4.8, 0));

  const group = new THREE.Group();
  group.name = 'stcasimir';
  const add = (parts: THREE.BufferGeometry[], mat: THREE.Material, cast = true) => {
    if (!parts.length) return;
    const mesh = new THREE.Mesh(merged(parts.map(p => { if (!p.getAttribute('uv')) p.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.getAttribute('position').count * 2), 2)); return p; })), mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(wall, mats.wall);
  add(stone, mats.stone);
  add(roof, mats.roof);
  add(dome, mats.dome);
  add(gilt, mats.gilt);
  add(dark, mats.dark, false);

  // Place: origin at the west façade centre, +X along the nave (east)
  const cu = box.u0, cv = (box.v0 + box.v1) / 2;
  const ox = cu * box.ux - cv * box.uz, oz = cu * box.uz + cv * box.ux;
  group.position.set(ox, b.groundY, oz);
  group.rotation.y = Math.atan2(-box.uz, box.ux);
  return group;
}
