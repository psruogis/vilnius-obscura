import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A box with UVs in metres (for world-scale textures). */
export function mbox(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let face = 0; face < 6; face++) {
    for (let i = 0; i < 4; i++) {
      const k = face * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[face][0], uv.getY(k) * dims[face][1]);
    }
  }
  g.translate(x, y, z);
  return g;
}

export function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts.map(p => (p.index ? p.toNonIndexed() : p)), false);
  if (!g) throw new Error('merge failed');
  return g;
}

/** Triangles facing up/out, with UVs in metres along the eave and up the slope. */
export function trianglesToGeometry(tris: THREE.Vector3[][]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let [a, b, c] of tris) {
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize();
    if (n.y < 0) { [b, c] = [c, b]; n.negate(); }
    // UV: u along the horizontal direction of the face, v up its slope.
    const hx = new THREE.Vector3(-n.z, 0, n.x);
    if (hx.lengthSq() < 1e-6) hx.set(1, 0, 0);
    hx.normalize();
    for (const p of [a, b, c]) {
      pos.push(p.x, p.y, p.z);
      nor.push(n.x, n.y, n.z);
      uv.push(p.dot(hx), p.y / Math.max(n.y, 0.2));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

