import type { AreaData } from './area';

/** A wall segment in the XZ plane. */
interface Seg {
  ax: number; az: number; bx: number; bz: number;
  stamp: number;
  /** Knee-high street furniture: blocks walking, but not the camera's or the carts' line of sight. */
  low?: boolean;
}

/**
 * Uniform grid of building wall segments, for walking collisions and the
 * camera's line-of-sight check. Buildings are taller than the camera, so 2D is enough.
 */
export class WallGrid {
  private cells = new Map<number, Seg[]>();
  private stamp = 0;
  private readonly scratch: Seg[] = [];

  constructor(data: AreaData, private readonly cell = 8) {
    for (const b of data.buildings) {
      for (const ring of b.rings) {
        for (let i = 0; i < ring.length; i++) {
          const [ax, az] = ring[i];
          const [bx, bz] = ring[(i + 1) % ring.length];
          this.add({ ax, az, bx, bz, stamp: 0 });
        }
      }
    }
  }

  /** Adds a free-standing wall (fences, booths); `low` for knee-high props (see Seg.low). */
  addSegment(ax: number, az: number, bx: number, bz: number, low = false): void {
    this.add({ ax, az, bx, bz, stamp: 0, low });
  }

  private key(cx: number, cz: number): number {
    return (cx + 32768) * 65536 + (cz + 32768);
  }

  private add(s: Seg): void {
    const x0 = Math.floor(Math.min(s.ax, s.bx) / this.cell), x1 = Math.floor(Math.max(s.ax, s.bx) / this.cell);
    const z0 = Math.floor(Math.min(s.az, s.bz) / this.cell), z1 = Math.floor(Math.max(s.az, s.bz) / this.cell);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = this.key(cx, cz);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(s);
      }
    }
  }

  /** Collects unique segments whose cells overlap the box; reuses an internal array. */
  private query(minX: number, minZ: number, maxX: number, maxZ: number): Seg[] {
    const out = this.scratch;
    out.length = 0;
    const stamp = ++this.stamp;
    const x0 = Math.floor(minX / this.cell), x1 = Math.floor(maxX / this.cell);
    const z0 = Math.floor(minZ / this.cell), z1 = Math.floor(maxZ / this.cell);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.cells.get(this.key(cx, cz));
        if (!list) continue;
        for (const s of list) {
          if (s.stamp === stamp) continue;
          s.stamp = stamp;
          out.push(s);
        }
      }
    }
    return out;
  }

  /** Pushes a circle out of any walls it overlaps. Mutates and returns `pos`. */
  resolveCircle(pos: { x: number; z: number }, radius: number): { x: number; z: number } {
    for (let pass = 0; pass < 3; pass++) {
      const segs = this.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius);
      let moved = false;
      for (const s of segs) {
        const dx = s.bx - s.ax, dz = s.bz - s.az;
        const len2 = dx * dx + dz * dz;
        if (len2 < 1e-8) continue;
        let t = ((pos.x - s.ax) * dx + (pos.z - s.az) * dz) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = s.ax + t * dx, cz = s.az + t * dz;
        const ox = pos.x - cx, oz = pos.z - cz;
        const d2 = ox * ox + oz * oz;
        if (d2 >= radius * radius) continue;
        const d = Math.sqrt(d2);
        if (d > 1e-6) {
          const push = radius - d;
          pos.x += (ox / d) * push;
          pos.z += (oz / d) * push;
        } else {
          // Exactly on the wall: push along the segment normal.
          const inv = 1 / Math.sqrt(len2);
          pos.x += -dz * inv * radius;
          pos.z += dx * inv * radius;
        }
        moved = true;
      }
      if (!moved) break;
    }
    return pos;
  }

  /** Fraction (0..1) along a→b where the first wall is hit, or 1 if the path is clear. */
  castSegment(ax: number, az: number, bx: number, bz: number): number {
    const segs = this.query(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
    const rx = bx - ax, rz = bz - az;
    let best = 1;
    for (const s of segs) {
      if (s.low) continue;
      const sx = s.bx - s.ax, sz = s.bz - s.az;
      const denom = rx * sz - rz * sx;
      if (Math.abs(denom) < 1e-9) continue;
      const qx = s.ax - ax, qz = s.az - az;
      const t = (qx * sz - qz * sx) / denom;
      const u = (qx * rz - qz * rx) / denom;
      if (t >= 0 && t < best && u >= 0 && u <= 1) best = t;
    }
    return best;
  }
}
