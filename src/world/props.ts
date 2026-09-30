import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AreaData, XZ } from './area';
import type { Terrain } from './terrain';
import { barrelParts } from './streetprops';
import type { WalkZone } from './zone';

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
    if (b.edge > 80) continue;
    const [outer, ...holes] = b.rings;
    if (pointInRing(x, z, outer) && !holes.some(h => pointInRing(x, z, h))) return true;
  }
  return false;
}

/**
 * Stretches of the walk's edge that cross open ground (street exits and open yards), each as points every 0.75 m
 * along the edge with the outward normal there.
 */
export function findExits(data: AreaData, zone: WalkZone): { x: number; z: number; nx: number; nz: number }[][] {
  const exits: { x: number; z: number; nx: number; nz: number }[][] = [];
  for (const poly of zone.outline) for (const ring of poly) {
    const pts: { x: number; z: number; nx: number; nz: number; open: boolean }[] = [];
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length], L = Math.hypot(bx - ax, bz - az);
      if (L < 1e-6) continue;
      let nx = (bz - az) / L, nz = -(bx - ax) / L;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (zone.distance(mx + nx * 0.3, mz + nz * 0.3) < zone.distance(mx - nx * 0.3, mz - nz * 0.3)) { nx = -nx; nz = -nz; }
      for (let t = 0; t < L; t += 0.75) {
        const x = ax + ((bx - ax) * t) / L, z = az + ((bz - az) * t) / L;
        pts.push({ x, z, nx, nz, open: !insideAnyBuilding(data, x, z) });
      }
    }
    const start = pts.findIndex(p => !p.open); // begin scanning from a closed point
    if (start < 0) { exits.push(pts); continue; }
    let run: typeof pts = [];
    for (let k = 1; k <= pts.length; k++) {
      const p = pts[(start + k) % pts.length];
      if (p.open) run.push(p);
      else { if (run.length * 0.75 > 1.2) exits.push(run); run = []; }
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
  data: AreaData, terrain: Terrain, zone: WalkZone, material: THREE.Material, iron?: THREE.Material,
): THREE.Group | null {
  const wood: THREE.BufferGeometry[] = [], hoops: THREE.BufferGeometry[] = [];
  const barrel = barrelParts(0.9, 0.31, 12);
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
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0);
  const OUT = 0.6; // just outside the walker's limit
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // a hewn post: slightly irregular girth, weathered to a blunt top
  const post = (x: number, y: number, z: number) => {
    const k = 0.9 + 0.2 * rnd();
    const g = new THREE.LatheGeometry([[0, -0.2], [0.085, -0.2], [0.085, 0.1], [0.08, 0.6], [0.076, 1.08], [0.06, 1.17], [0.03, 1.21], [0, 1.22]].map(([a, b]) => new THREE.Vector2(a * k, b)), 6, rnd() * 6);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) { const f = 1 + 0.1 * Math.sin(pos.getY(i) * 7 + Math.atan2(pos.getZ(i), pos.getX(i)) * 3 + k * 40); pos.setX(i, pos.getX(i) * f); pos.setZ(i, pos.getZ(i) * f); }
    g.computeVertexNormals();
    e.set((rnd() - 0.5) * 0.06, rnd() * 6, (rnd() - 0.5) * 0.06);
    wood.push(g.applyMatrix4(m.compose(p.set(x, y, z), q.setFromEuler(e), s)));
  };
  // a round rail sagging a little between two posts, its ends lapped over them
  const rail = (A: THREE.Vector3, B: THREE.Vector3, h: number) => {
    const L = A.distanceTo(B) + 0.24, sag = 0.02 + 0.02 * rnd(), rr = 0.042 + 0.01 * rnd();
    const g = new THREE.CylinderGeometry(rr, rr * (0.9 + 0.2 * rnd()), L, 5, 4, true).rotateZ(Math.PI / 2);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) { const u = pos.getX(i) / L; pos.setY(i, pos.getY(i) - sag * (1 - 4 * u * u)); }
    g.computeVertexNormals();
    g.rotateX(rnd() * 6);   // pole roll: the facets fall differently on each
    const mid = A.clone().add(B).multiplyScalar(0.5);
    q.setFromUnitVectors(X, p.subVectors(B, A).normalize());
    wood.push(g.applyMatrix4(m.compose(p.set(mid.x, mid.y + h, mid.z), q, s)));
  };

  for (const run of findExits(data, zone)) {
    const len = run.length * 0.75;
    const n = Math.max(2, Math.ceil(len / 2.2));
    const pts: THREE.Vector3[] = [], inward: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const e = run[Math.min(run.length - 1, Math.round(((run.length - 1) * i) / n))];
      const x = e.x + e.nx * OUT, z = e.z + e.nz * OUT;
      pts.push(new THREE.Vector3(x, terrain.heightAt(x, z), z));
      inward.push([-e.nx, -e.nz]);
    }
    for (const pt of pts) post(pt.x, pt.y, pt.z);
    for (let i = 0; i < pts.length - 1; i++) for (const hgt of [0.45, 0.95]) rail(pts[i], pts[i + 1], hgt);
    // a few barrels on the walk side of the fence, in ones and twos
    const inset = 0.9;
    for (let i = 1; i < pts.length - 1; i += 2) {
      if (i > 1 && rnd() < 0.4) continue;
      const pt = pts[i], [ix, iz] = inward[i];
      const x = pt.x + ix * inset + (rnd() - 0.5) * 0.3, z = pt.z + iz * inset + (rnd() - 0.5) * 0.3;
      m.compose(p.set(x, terrain.heightAt(x, z) - 0.02, z), q.setFromEuler(e.set((rnd() - 0.5) * 0.04, rnd() * 6, (rnd() - 0.5) * 0.04)), s);
      wood.push(barrel.wood.clone().applyMatrix4(m));
      const hoop = barrel.iron.clone().applyMatrix4(m);
      hoop.setAttribute('color', new THREE.Float32BufferAttribute(new Array(hoop.getAttribute('position').count * 3).fill(0.045), 3));   // dark iron (linear)
      hoops.push(hoop);
    }
  }
  if (!wood.length) return null;
  if (iron) { add(wood, material); if (hoops.length) add(hoops, iron); } else add([...wood, ...hoops.map(h => { h.deleteAttribute('color'); return h; })], material);
  return group;
}
