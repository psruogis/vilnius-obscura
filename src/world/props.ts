import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AreaData, XZ } from './area';
import type { Terrain } from './terrain';

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
 * Period barriers across each street exit: a split-rail fence with barrels,
 * so the walkable area ends in something that belongs in 1800.
 */
export function buildBarriers(
  data: AreaData, terrain: Terrain, cx: number, cz: number, radius: number, material: THREE.Material,
): THREE.Mesh | null {
  const parts: THREE.BufferGeometry[] = [];
  const post = new THREE.CylinderGeometry(0.07, 0.08, 1.2, 6);
  const barrel = new THREE.CylinderGeometry(0.33, 0.33, 0.9, 12);
  barrel.scale(1, 1, 1);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  const r = radius + 0.6; // just outside the walker's limit

  for (const [a0, a1] of findExits(data, cx, cz, radius)) {
    const len = (a1 - a0) * r;
    const n = Math.max(2, Math.ceil(len / 2.2));
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      pts.push(new THREE.Vector3(x, terrain.heightAt(x, z), z));
    }
    // Posts
    for (const pt of pts) {
      p.set(pt.x, pt.y + 0.6, pt.z);
      m.compose(p, q.identity(), s);
      parts.push(post.clone().applyMatrix4(m));
    }
    // Two rails between each pair of posts
    for (let i = 0; i < pts.length - 1; i++) {
      const A = pts[i], B = pts[i + 1];
      const L = A.distanceTo(B);
      for (const hgt of [0.45, 0.95]) {
        const rail = new THREE.BoxGeometry(L, 0.08, 0.06);
        const mid = A.clone().add(B).multiplyScalar(0.5);
        mid.y += hgt;
        const ang = Math.atan2(-(B.z - A.z), B.x - A.x);
        m.compose(mid, q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang), s);
        parts.push(rail.applyMatrix4(m));
      }
    }
    // A couple of barrels on the walk side of the fence
    const inset = 0.9;
    for (let i = 1; i < pts.length - 1; i += 2) {
      const pt = pts[i];
      const dx = cx - pt.x, dz = cz - pt.z, dl = Math.hypot(dx, dz);
      const x = pt.x + (dx / dl) * inset, z = pt.z + (dz / dl) * inset;
      p.set(x, terrain.heightAt(x, z) + 0.45, z);
      m.compose(p, q.identity(), s);
      parts.push(barrel.clone().applyMatrix4(m));
    }
  }
  if (!parts.length) return null;
  const geo = mergeGeometries(parts.map(g => (g.index ? g.toNonIndexed() : g)), false);
  if (!geo) return null;
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'barriers';
  return mesh;
}
