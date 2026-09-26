import * as THREE from 'three';
import type { AreaData } from './area';

const E0 = 583000, N0 = 6061000;

/** LiDAR ground heights (relative to the Town Hall square) with bilinear sampling. */
export class Terrain {
  private readonly e0: number;
  private readonly n0: number;
  private readonly cell: number;
  private readonly nx: number;
  private readonly ny: number;
  private readonly h: Float32Array;

  constructor(data: AreaData) {
    const t = data.terrain;
    if (!t) {
      this.e0 = E0; this.n0 = N0; this.cell = 1; this.nx = 1; this.ny = 1; this.h = new Float32Array(1);
      return;
    }
    this.e0 = t.e0; this.n0 = t.n0; this.cell = t.cell; this.nx = t.nx; this.ny = t.ny;
    this.h = Float32Array.from(t.h);
  }

  /** Ground height at local (x, z); clamps to the edge of the measured grid. */
  heightAt(x: number, z: number): number {
    const e = x + E0, n = N0 - z;
    const fx = (e - this.e0) / this.cell - 0.5, fy = (n - this.n0) / this.cell - 0.5;
    const x0 = Math.min(this.nx - 1, Math.max(0, Math.floor(fx)));
    const y0 = Math.min(this.ny - 1, Math.max(0, Math.floor(fy)));
    const x1 = Math.min(this.nx - 1, x0 + 1), y1 = Math.min(this.ny - 1, y0 + 1);
    const tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0));
    const h = this.h, w = this.nx;
    const a = h[y0 * w + x0] * (1 - tx) + h[y0 * w + x1] * tx;
    const b = h[y1 * w + x0] * (1 - tx) + h[y1 * w + x1] * tx;
    return a * (1 - ty) + b * ty;
  }

  /** A grid mesh centred on (cx, cz), `size` metres across, one vertex every `step` metres. */
  buildMesh(material: THREE.Material, cx: number, cz: number, size: number, step: number, uvScale: number): THREE.Mesh {
    const segs = Math.round(size / step);
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
      pos.setXYZ(i, x, this.heightAt(x, z), z);
      uv.setXY(i, x / uvScale, -z / uvScale);
      // Low-frequency mud and wear so the cobble texture doesn't read as a repeat.
      const n = 0.5 + 0.25 * Math.sin(x * 0.043 + Math.sin(z * 0.031) * 2.1) + 0.25 * Math.sin(z * 0.057 + Math.cos(x * 0.022) * 1.7);
      const shade = 0.62 + 0.2 * n;
      colors[i * 3] = shade;
      colors[i * 3 + 1] = shade * 0.93;
      colors[i * 3 + 2] = shade * 0.82;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }
}
