import type { AreaData } from './area';

/** Open ground: a 1 m raster of the building outlines over a box (1 = inside a building). */
export interface GroundRaster { x0: number; z0: number; w: number; h: number; inside: Uint8Array }

export function groundRaster(data: AreaData, box: [number, number, number, number]): GroundRaster {
  const x0 = Math.floor(box[0]), z0 = Math.floor(box[1]), w = Math.ceil(box[2]) - x0, h = Math.ceil(box[3]) - z0;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#fff';
  for (const b of data.buildings) {
    if (b.rings[0].every(([x, z]) => x < x0 || z < z0 || x > x0 + w || z > z0 + h)) continue;
    g.beginPath();
    for (const ring of b.rings) ring.forEach(([x, z], i) => (i ? g.lineTo : g.moveTo).call(g, x - x0, z - z0));
    g.fill('evenodd');
  }
  const px = g.getImageData(0, 0, w, h).data, inside = new Uint8Array(w * h);
  for (let i = 0; i < inside.length; i++) inside[i] = px[i * 4] < 64 ? 0 : 1;
  return { x0, z0, w, h, inside };
}

/** Is (x, z) open ground (in the raster, and not in a building)? */
export function groundTest(r: GroundRaster): (x: number, z: number) => boolean {
  return (x, z) => {
    const i = Math.floor(x - r.x0), j = Math.floor(z - r.z0);
    if (i < 0 || j < 0 || i >= r.w || j >= r.h) return false;
    return r.inside[j * r.w + i] === 0;
  };
}
