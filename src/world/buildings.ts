import * as THREE from 'three';
import type { AreaData, Building, XZ } from './area';

/** Real-world size of one plaster / roof-tile texture repeat, metres. */
const PLASTER_TILE = 2.5;
const ROOF_TILE = 2.2;

// Limewash tints for c.1800 houses, authored in sRGB.
// Limewash after the period views (Zaleski, Peszka): ochres, pale pinks, straw, warm greys, a few whites.
export const LIMEWASH = ['#e3cc9c', '#d9b884', '#e6c49c', '#d8a888', '#e0b89e', '#cdb898', '#e8d8b6', '#d3c0a0', '#cca277', '#dfcaa6', '#c2a98a', '#dcc3a0', '#d5ae86', '#e4d2b4', '#c9b08f', '#e2bfa6'];
// Multiplied into the clay texture: deep, weathered red-browns as in the period oils.
const ROOF_TINTS = ['#c9a08e', '#b88a78', '#d4ae98', '#a87e6e', '#c4a494', '#9c7a6c', '#bf9582'];

/** c.1900: most roofs were re-covered in painted sheet metal; about three in ten kept clay tile. */
export const hasTileRoof = (b: Building): boolean => hashString(b.id) % 10 < 3;

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Signed area in (x, -z) space: positive = counter-clockwise seen from above. */
function signedArea(r: XZ[]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, z1] = r[i], [x2, z2] = r[(i + 1) % r.length];
    a += x1 * -z2 - x2 * -z1;
  }
  return a / 2;
}

class Builder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  extra: number[] = [];   // vec4 per vertex
  extra2: number[] = [];  // vec4 per vertex

  vertex(x: number, y: number, z: number, n: THREE.Vector3, u: number, v: number, c: THREE.Color, e: number[], e2: number[]): void {
    this.pos.push(x, y, z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(c.r, c.g, c.b);
    this.extra.push(...e);
    this.extra2.push(...e2);
  }

  geometry(extraName: string, extra2Name: string): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute(extraName, new THREE.Float32BufferAttribute(this.extra, 4));
    g.setAttribute(extra2Name, new THREE.Float32BufferAttribute(this.extra2, 4));
    g.computeBoundingSphere();
    return g;
  }
}

const ROLE_CODE: Record<Building['role'], number> = { ordinary: 0, townhall: 1, stcasimir: 2, recon: 3 };

/**
 * Walls: one quad per footprint edge, from below the lowest ground to the eave.
 * aFacade = (u along the edge, height above the building's ground, edge length, seed)
 * aInfo   = (eave height above ground, role code, style seed, 0)
 */
export function buildWalls(data: AreaData): THREE.BufferGeometry {
  const b = new Builder();
  const n = new THREE.Vector3();
  const tint = new THREE.Color();
  for (const bd of data.buildings) {
    if (bd.role === 'townhall' || bd.role === 'stcasimir' || bd.detail) continue; // modelled separately (townhall.ts, stcasimir.ts, facades.ts)
    const seed = hashString(bd.id);
    if (bd.role === 'stcasimir') tint.set('#efe8da');
    else tint.set(LIMEWASH[seed % LIMEWASH.length]);
    const info = [bd.eave, ROLE_CODE[bd.role], (seed % 997) / 997, 0];
    bd.rings.forEach((ring, ri) => {
      // Outer ring CCW, holes CW (seen from above): then "outward" is always to the right.
      const ccw = signedArea(ring) > 0;
      const pts = (ri === 0) === ccw ? ring : [...ring].reverse();
      for (let i = 0; i < pts.length; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[(i + 1) % pts.length];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 0.05) continue;
        // Direction in (east, north) = (dx, -dz); right-hand normal = (dy, -dx) in EN -> local (nx, 0, -ny)
        const de = (bx - ax) / L, dn = -(bz - az) / L;
        n.set(dn, 0, de);
        const edgeSeed = ((seed + i * 7919) % 1009) / 1009;
        const h0 = bd.baseY - bd.groundY, h1 = bd.eaveY - bd.groundY;
        const fa = (u: number, h: number) => [u, h, L, edgeSeed];
        const y0 = bd.baseY, y1 = bd.eaveY;
        // Two triangles, counter-clockwise seen from outside.
        b.vertex(ax, y0, az, n, 0, h0 / PLASTER_TILE, tint, fa(0, h0), info);
        b.vertex(bx, y0, bz, n, L / PLASTER_TILE, h0 / PLASTER_TILE, tint, fa(L, h0), info);
        b.vertex(bx, y1, bz, n, L / PLASTER_TILE, h1 / PLASTER_TILE, tint, fa(L, h1), info);
        b.vertex(ax, y0, az, n, 0, h0 / PLASTER_TILE, tint, fa(0, h0), info);
        b.vertex(bx, y1, bz, n, L / PLASTER_TILE, h1 / PLASTER_TILE, tint, fa(L, h1), info);
        b.vertex(ax, y1, az, n, 0, h1 / PLASTER_TILE, tint, fa(0, h1), info);
      }
    });
  }
  const g = b.geometry('aFacade', 'aInfo');
  fixWinding(g);
  return g;
}

/** Makes every triangle face along its stored normal. */
function fixWinding(g: THREE.BufferGeometry): void {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const attrs = Object.values(g.attributes) as THREE.BufferAttribute[];
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const face = b.sub(a).cross(c.sub(a));
    n.fromBufferAttribute(nrm, i);
    if (face.dot(n) < 0) {
      for (const at of attrs) {
        for (let k = 0; k < at.itemSize; k++) {
          const t = at.array[(i + 1) * at.itemSize + k];
          (at.array as Float32Array)[(i + 1) * at.itemSize + k] = at.array[(i + 2) * at.itemSize + k];
          (at.array as Float32Array)[(i + 2) * at.itemSize + k] = t;
        }
      }
    }
  }
}

/**
 * Roofs from straight skeletons: every face rises from its eave edge at the building's pitch.
 * aRoof = (u along the eave, slope distance from the eave, seed, 0)
 */
// Painted sheet metal, c.1900: grey, red-brown, green
const METAL_TINTS = ['#80868a', '#6d7275', '#7a4234', '#5a6a58', '#8a8e8c', '#6a3a30'];

/** Roofs of the buildings `pick` selects (default: all); metal ones take painted-metal tints. */
export function buildRoofs(data: AreaData, pick: (b: Building) => boolean = () => true, metal = false): THREE.BufferGeometry {
  const b = new Builder();
  const tint = new THREE.Color();
  const n = new THREE.Vector3();
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3();
  const none = [0, 0, 0, 0];
  for (const bd of data.buildings) {
    if (bd.role === 'townhall' || bd.role === 'stcasimir' || bd.style || !pick(bd)) continue; // hero roofs are built in facades.ts
    const seed = hashString(bd.id);
    tint.set(metal ? METAL_TINTS[(seed >>> 3) % METAL_TINTS.length] : ROOF_TINTS[(seed >>> 3) % ROOF_TINTS.length]);
    const roof = bd.roof;
    if (!roof) {
      addFlatRoof(b, bd, tint);
      continue;
    }
    const V = roof.v, k = roof.k, slope = Math.sqrt(1 + k * k);
    const vx = (i: number) => V[i * 3], vz = (i: number) => V[i * 3 + 1], vt = (i: number) => V[i * 3 + 2];
    const vy = (i: number) => bd.eaveY + vt(i) * k;
    for (const face of roof.f) {
      if (face.length < 3) continue;
      // The eave edge: the two consecutive vertices with t = 0.
      let e0 = -1, e1 = -1;
      for (let i = 0; i < face.length; i++) {
        const j = (i + 1) % face.length;
        if (vt(face[i]) < 1e-4 && vt(face[j]) < 1e-4) { e0 = face[i]; e1 = face[j]; break; }
      }
      let dx = 1, dz = 0, ox = vx(face[0]), oz = vz(face[0]);
      if (e0 >= 0) {
        ox = vx(e0); oz = vz(e0);
        const L = Math.hypot(vx(e1) - ox, vz(e1) - oz) || 1;
        dx = (vx(e1) - ox) / L; dz = (vz(e1) - oz) / L;
      }
      const contour = face.map(i => new THREE.Vector2(vx(i), vz(i)));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      // Face normal, pointing up.
      pa.set(vx(face[0]), vy(face[0]), vz(face[0]));
      n.set(0, 0, 0);
      for (let i = 1; i + 1 < face.length; i++) {
        pb.set(vx(face[i]), vy(face[i]), vz(face[i])).sub(pa);
        pc.set(vx(face[i + 1]), vy(face[i + 1]), vz(face[i + 1])).sub(pa);
        n.add(pb.cross(pc));
      }
      if (n.y < 0) n.negate();
      n.normalize();
      for (const t of tris) {
        for (const idx of t) {
          const vi = face[idx];
          const x = vx(vi), z = vz(vi);
          const u = (x - ox) * dx + (z - oz) * dz;
          const s = vt(vi) * slope;
          b.vertex(x, vy(vi), z, n, u / ROOF_TILE, s / ROOF_TILE, tint, [u, s, (seed % 991) / 991, 0], none);
        }
      }
    }
  }
  const g = b.geometry('aRoof', 'aUnused');
  fixWinding(g);
  return g;
}

function addFlatRoof(b: Builder, bd: Building, tint: THREE.Color): void {
  const [outer, ...holes] = bd.rings;
  const contour = outer.map(([x, z]) => new THREE.Vector2(x, z));
  const holePts = holes.map(h => h.map(([x, z]) => new THREE.Vector2(x, z)));
  const all = [...contour, ...holePts.flat()];
  const tris = THREE.ShapeUtils.triangulateShape(contour, holePts);
  const up = new THREE.Vector3(0, 1, 0);
  for (const t of tris) {
    for (const i of t) {
      const p = all[i];
      b.vertex(p.x, bd.eaveY + 0.3, p.y, up, p.x / ROOF_TILE, p.y / ROOF_TILE, tint, [p.x, p.y, 0, 0], [0, 0, 0, 0]);
    }
  }
}
