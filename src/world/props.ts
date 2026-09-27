import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AreaData, XZ } from './area';
import type { Terrain } from './terrain';
import { barrelParts } from './streetprops';

function pointInRing(x: number, z: number, r: XZ[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function insideAnyBuilding(data: AreaData, x: number, z: number): boolean {
  for (const b of data.buildings) {
    if (b.dist > data.meta.walkRadius + 80) continue;
    const [outer, ...holes] = b.rings;
    if (pointInRing(x, z, outer) && !holes.some(h => pointInRing(x, z, h))) return true;
  }
  return false;
}

/** Arcs of the walk boundary that cross open ground (street exits), as [startAngle, endAngle]. */
export function findExits(data: AreaData, cx: number, cz: number, radius: number): [number, number][] {
  const steps = Math.ceil((2 * Math.PI * radius) / 0.75);
  const open: boolean[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    open.push(!insideAnyBuilding(data, cx + Math.cos(a) * radius, cz + Math.sin(a) * radius));
  }
  const exits: [number, number][] = [];
  const start = open.findIndex(o => !o); // begin scanning from a closed point
  if (start < 0) return [[0, Math.PI * 2]];
  let run = -1;
  for (let k = 1; k <= steps; k++) {
    const i = (start + k) % steps;
    if (open[i] && run < 0) run = i;
    if (!open[i] && run >= 0) {
      const a0 = (run / steps) * Math.PI * 2;
      let a1 = (i / steps) * Math.PI * 2;
      if (a1 < a0) a1 += Math.PI * 2;
      if ((a1 - a0) * radius > 1.2) exits.push([a0, a1]);
      run = -1;
    }
  }
  return exits;
}

/**
 * Period barriers across each street exit: a post-and-rail fence of hewn posts and round rails, with
 * coopered barrels set against it, so the walkable area ends in something that belongs in the town.
 * `iron` (optional) paints the barrels' hoops; without it the hoops take the wood.
 */
export function buildBarriers(
  data: AreaData, terrain: Terrain, cx: number, cz: number, radius: number, material: THREE.Material, iron?: THREE.Material,
): THREE.Group | null {
  const wood: THREE.BufferGeometry[] = [], hoops: THREE.BufferGeometry[] = [];
  const barrel = barrelParts(0.9, 0.31);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0);
  const r = radius + 0.6; // just outside the walker's limit
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // a hewn post: slightly irregular girth, weathered to a blunt top
  const post = (x: number, y: number, z: number) => {
    const k = 0.9 + 0.2 * rnd();
    const g = new THREE.LatheGeometry([[0, -0.2], [0.085, -0.2], [0.085, 0.1], [0.08, 0.6], [0.076, 1.08], [0.06, 1.17], [0.03, 1.21], [0, 1.22]].map(([a, b]) => new THREE.Vector2(a * k, b)), 7, rnd() * 6);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) { const f = 1 + 0.1 * Math.sin(pos.getY(i) * 7 + Math.atan2(pos.getZ(i), pos.getX(i)) * 3 + k * 40); pos.setX(i, pos.getX(i) * f); pos.setZ(i, pos.getZ(i) * f); }
    g.computeVertexNormals();
    e.set((rnd() - 0.5) * 0.06, rnd() * 6, (rnd() - 0.5) * 0.06);
    wood.push(g.applyMatrix4(m.compose(p.set(x, y, z), q.setFromEuler(e), s)));
  };
  // a round rail sagging a little between two posts, its ends lapped over them
  const rail = (A: THREE.Vector3, B: THREE.Vector3, h: number) => {
    const L = A.distanceTo(B) + 0.24, sag = 0.02 + 0.02 * rnd(), rr = 0.042 + 0.01 * rnd();
    const g = new THREE.CylinderGeometry(rr, rr * (0.9 + 0.2 * rnd()), L, 6, 6).rotateZ(Math.PI / 2);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) { const u = pos.getX(i) / L; pos.setY(i, pos.getY(i) - sag * (1 - 4 * u * u)); }
    g.computeVertexNormals();
    g.rotateX(rnd() * 6);   // pole roll: the facets fall differently on each
    const mid = A.clone().add(B).multiplyScalar(0.5);
    q.setFromUnitVectors(X, p.subVectors(B, A).normalize());
    wood.push(g.applyMatrix4(m.compose(p.set(mid.x, mid.y + h, mid.z), q, s)));
  };

  for (const [a0, a1] of findExits(data, cx, cz, radius)) {
    const len = (a1 - a0) * r;
    const n = Math.max(2, Math.ceil(len / 2.2));
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      pts.push(new THREE.Vector3(x, terrain.heightAt(x, z), z));
    }
    for (const pt of pts) post(pt.x, pt.y, pt.z);
    for (let i = 0; i < pts.length - 1; i++) for (const hgt of [0.45, 0.95]) rail(pts[i], pts[i + 1], hgt);
    // a couple of barrels on the walk side of the fence
    const inset = 0.9;
    for (let i = 1; i < pts.length - 1; i += 2) {
      const pt = pts[i];
      const dx = cx - pt.x, dz = cz - pt.z, dl = Math.hypot(dx, dz);
      const x = pt.x + (dx / dl) * inset + (rnd() - 0.5) * 0.3, z = pt.z + (dz / dl) * inset + (rnd() - 0.5) * 0.3;
      m.compose(p.set(x, terrain.heightAt(x, z) - 0.02, z), q.setFromEuler(e.set((rnd() - 0.5) * 0.04, rnd() * 6, (rnd() - 0.5) * 0.04)), s);
      wood.push(barrel.wood.clone().applyMatrix4(m));
      const hoop = barrel.iron.clone().applyMatrix4(m);
      hoop.setAttribute('color', new THREE.Float32BufferAttribute(new Array(hoop.getAttribute('position').count * 3).fill(0.045), 3));   // dark iron (linear)
      hoops.push(hoop);
    }
  }
  if (!wood.length) return null;
  const group = new THREE.Group();
  group.name = 'barriers';
  const add = (parts: THREE.BufferGeometry[], mat: THREE.Material) => {
    const geo = mergeGeometries(parts.map(g => (g.index ? g.toNonIndexed() : g)), false);
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  if (iron) { add(wood, material); if (hoops.length) add(hoops, iron); } else add([...wood, ...hoops.map(h => { h.deleteAttribute('color'); return h; })], material);
  return group;
}
