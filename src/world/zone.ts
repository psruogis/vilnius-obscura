import type { AreaData, WalkShape, XZ } from './area';

/**
 * The walk: where the walker may go. The square round the Town Hall, and the road out to the Subačius Gate site,
 * as circles and round-ended strips along the street centrelines (tools/build-area.mjs WALK_SHAPES). Distances
 * are signed: negative inside, positive outside. Everything that used to measure from the Town Hall (the walker's
 * limit, barriers, street props, townsfolk, the map) asks the zone instead.
 */
export class WalkZone {
  readonly shapes: WalkShape[];
  /** The merged outline, as polygons (outer ring, then any holes) in local metres. */
  readonly outline: XZ[][][];
  /** Bounding box of the outline: x0, z0, x1, z1. */
  readonly box: [number, number, number, number];

  constructor(data: AreaData) {
    const [thx, thz] = data.meta.townHall;
    const w = data.meta.walk;
    this.shapes = w?.shapes ?? [{ circle: [thx, thz], r: data.meta.walkRadius }];
    this.outline = w?.outline ?? [[circleRing(thx, thz, data.meta.walkRadius, 128)]];
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const poly of this.outline) for (const [x, z] of poly[0]) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    this.box = [x0, z0, x1, z1];
  }

  /** Signed distance to the walk (m): negative inside. */
  distance(x: number, z: number): number {
    let d = Infinity;
    for (const s of this.shapes) d = Math.min(d, shapeDistance(s, x, z));
    return d;
  }

  /** Inside the walk, or within `margin` m of it. */
  contains(x: number, z: number, margin = 0): boolean {
    return this.distance(x, z) < margin;
  }

  /** Moves a point outside the walk back onto its edge (onto the nearest shape). Mutates and returns `p`. */
  clamp(p: { x: number; z: number }): { x: number; z: number } {
    let best: WalkShape | null = null, bd = Infinity;
    for (const s of this.shapes) { const d = shapeDistance(s, p.x, p.z); if (d < bd) { bd = d; best = s; } }
    if (!best || bd <= 0) return p;
    let cx: number, cz: number, r: number;
    if (best.circle) { [cx, cz] = best.circle; r = best.r!; }
    else { [cx, cz] = nearestOnLine(best.line!, p.x, p.z); r = best.w!; }
    const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz) || 1;
    p.x = cx + (dx / d) * r;
    p.z = cz + (dz / d) * r;
    return p;
  }

  /** A random point inside the walk (rejection sampling in the bounding box); `rnd` returns 0..1. */
  sample(rnd: () => number, margin = 0): [number, number] {
    const [x0, z0, x1, z1] = this.box;
    for (let k = 0; k < 200; k++) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
      if (this.distance(x, z) < -margin) return [x, z];
    }
    const s = this.shapes[0];
    return s.circle ? [s.circle[0], s.circle[1]] : [s.line![0][0], s.line![0][1]];
  }
}

function shapeDistance(s: WalkShape, x: number, z: number): number {
  if (s.circle) return Math.hypot(x - s.circle[0], z - s.circle[1]) - s.r!;
  const [nx, nz] = nearestOnLine(s.line!, x, z);
  return Math.hypot(x - nx, z - nz) - s.w!;
}

function nearestOnLine(line: XZ[], x: number, z: number): [number, number] {
  let bx = line[0][0], bz = line[0][1], bd = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1], dx = line[i][0] - ax, dz = line[i][1] - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    const px = ax + t * dx, pz = az + t * dz, d = (x - px) ** 2 + (z - pz) ** 2;
    if (d < bd) { bd = d; bx = px; bz = pz; }
  }
  return [bx, bz];
}

function circleRing(cx: number, cz: number, r: number, n: number): XZ[] {
  const ring: XZ[] = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; ring.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  return ring;
}
