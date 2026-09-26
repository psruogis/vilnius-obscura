import * as THREE from 'three';
import type { AreaData, Building, XZ } from './area';
import type { Terrain } from './terrain';
import { hashString, LIMEWASH } from './buildings';
import type { HouseMaterials } from './houseMaterials';

/**
 * Real façade geometry for the houses near the walk (Building.detail): walls with openings cut
 * through them, windows set into deep masonry reveals with sills, surrounds, hoods and open shutters,
 * arched doors and carriage gateways, a moulded cornice that tucks under the overhanging roof, plinth
 * and string-course bands, corner pilasters and chimneys. Party walls (against a neighbour) stay blank.
 * Everything casts and receives the sun's shadows; the wall shader adds weathering from the same layout.
 */

const GROUND_F = 4.0;   // ground-floor height, m (matches the painted façades)
const UPPER_F = 3.4;    // upper floors
const WIN_DEPTH = 0.26; // window glass set back from the wall face
const DOOR_DEPTH = 0.42;

const SHUTTERS = ['#3d4f3f', '#5b3b2b', '#6b675b', '#3f4b55', '#4a5a48', '#6a4a36'];
const DOORS = ['#7a5436', '#6a4a30', '#86603f', '#6b665a', '#72563a', '#5d6b5a'];

// --- Geometry builder -------------------------------------------------------------------------------

class GeoBuilder {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = [];
  extra = new Map<string, number[]>();
  private readonly e1 = new THREE.Vector3(); private readonly e2 = new THREE.Vector3(); private readonly fn = new THREE.Vector3();

  constructor(private readonly extras: string[] = []) { for (const k of extras) this.extra.set(k, []); }

  /** One triangle, wound to face along n. `ex` holds per-vertex extras: ex[k][vertex] = 4 numbers. */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, n: THREE.Vector3, ua: number[], ub: number[], uc: number[], color: THREE.Color, ex?: number[][][]): void {
    this.fn.crossVectors(this.e1.subVectors(b, a), this.e2.subVectors(c, a));
    let vs = [a, b, c], us = [ua, ub, uc], order = [0, 1, 2];
    if (this.fn.dot(n) < 0) { vs = [a, c, b]; us = [ua, uc, ub]; order = [0, 2, 1]; }
    for (let i = 0; i < 3; i++) {
      this.pos.push(vs[i].x, vs[i].y, vs[i].z);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(us[i][0], us[i][1]);
      this.col.push(color.r, color.g, color.b);
      this.extras.forEach((k, j) => this.extra.get(k)!.push(...(ex ? ex[j][order[i]] : [0, 0, 0, 0])));
    }
  }

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, n: THREE.Vector3, uvs: number[][], color: THREE.Color): void {
    this.tri(a, b, c, n, uvs[0], uvs[1], uvs[2], color);
    this.tri(a, c, d, n, uvs[0], uvs[2], uvs[3], color);
  }

  geometry(): THREE.BufferGeometry | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    for (const [k, v] of this.extra) g.setAttribute(k, new THREE.Float32BufferAttribute(v, 4));
    g.computeBoundingSphere();
    return g;
  }
}

// --- Edge frames --------------------------------------------------------------------------------------

/** A wall edge: origin at its start, t along it, n out of the building, heights from the house's ground. */
interface Edge {
  ax: number; az: number; tx: number; tz: number; nx: number; nz: number; L: number; gy: number;
  party: boolean;
}
const UP = new THREE.Vector3(0, 1, 0);

function P(e: Edge, u: number, h: number, d: number): THREE.Vector3 {
  return new THREE.Vector3(e.ax + e.tx * u + e.nx * d, e.gy + h, e.az + e.tz * u + e.nz * d);
}
const vT = (e: Edge, s = 1) => new THREE.Vector3(e.tx * s, 0, e.tz * s);
const vN = (e: Edge, s = 1) => new THREE.Vector3(e.nx * s, 0, e.nz * s);

/** A box in an edge frame: centre (u, h, d), half-sizes along t, up and n. UVs in metres. */
function box(g: GeoBuilder, e: Edge, u: number, h: number, d: number, su: number, sh: number, sd: number, color: THREE.Color, onWall = false): void {
  const c = (i: number, j: number, k: number) => P(e, u + i * su, h + j * sh, d + k * sd);
  const faces: [THREE.Vector3, number[][], number[][]][] = [
    [vN(e), [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [[0, 0], [2 * su, 0], [2 * su, 2 * sh], [0, 2 * sh]]],
    [vN(e, -1), [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], [[0, 0], [2 * su, 0], [2 * su, 2 * sh], [0, 2 * sh]]],
    [UP, [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], [[0, 0], [2 * su, 0], [2 * su, 2 * sd], [0, 2 * sd]]],
    [UP.clone().negate(), [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], [[0, 0], [2 * su, 0], [2 * su, 2 * sd], [0, 2 * sd]]],
    [vT(e), [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], [[0, 0], [2 * sd, 0], [2 * sd, 2 * sh], [0, 2 * sh]]],
    [vT(e, -1), [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], [[0, 0], [2 * sd, 0], [2 * sd, 2 * sh], [0, 2 * sh]]],
  ];
  faces.forEach(([n, cs, uvs], fi) => { if (onWall && fi === 1) return; g.quad(c(...cs[0] as [number, number, number]), c(...cs[1] as [number, number, number]), c(...cs[2] as [number, number, number]), c(...cs[3] as [number, number, number]), n, uvs, color); });
}

/**
 * Extrudes a cross-section profile [(d, h)] (from the wall face out and back) along an edge from ua to ub.
 * At ring corners the ends are mitred (startMiter/endMiter give the corner's offset direction per metre of d);
 * elsewhere they are square and capped.
 */
function extrude(g: GeoBuilder, e: Edge, ua: number, ub: number, prof: number[][], color: THREE.Color,
  startMiter: [number, number] | null, endMiter: [number, number] | null): void {
  if (ub - ua < 0.05) return;
  const at = (u: number, miter: [number, number] | null, d: number, h: number) => {
    if (!miter) return P(e, u, h, d);
    const bx = e.ax + e.tx * u, bz = e.az + e.tz * u;
    return new THREE.Vector3(bx + miter[0] * d, e.gy + h, bz + miter[1] * d);
  };
  let s = 0;
  for (let i = 0; i + 1 < prof.length; i++) {
    const [d0, h0] = prof[i], [d1, h1] = prof[i + 1];
    const len = Math.hypot(d1 - d0, h1 - h0);
    if (len < 1e-4) continue;
    const nd = (h1 - h0) / len, nh = -(d1 - d0) / len;
    const n = new THREE.Vector3(e.nx * nd, nh, e.nz * nd);
    g.quad(at(ua, startMiter, d0, h0), at(ub, endMiter, d0, h0), at(ub, endMiter, d1, h1), at(ua, startMiter, d1, h1), n,
      [[ua, s], [ub, s], [ub, s + len], [ua, s + len]], color);
    s += len;
  }
  // Caps on square ends
  const shape = prof.map(([d, h]) => new THREE.Vector2(d, h));
  const tris = THREE.ShapeUtils.triangulateShape(shape, []);
  for (const [end, u, miter] of [[-1, ua, startMiter], [1, ub, endMiter]] as const) {
    if (miter) continue;
    const n = vT(e, end);
    for (const [a, b, c] of tris) {
      const pa = P(e, u, prof[a][1], prof[a][0]), pb = P(e, u, prof[b][1], prof[b][0]), pc = P(e, u, prof[c][1], prof[c][0]);
      g.tri(pa, pb, pc, n, [prof[a][0], prof[a][1]], [prof[b][0], prof[b][1]], [prof[c][0], prof[c][1]], color);
    }
  }
}

// --- Buildings ----------------------------------------------------------------------------------------

function inRing(x: number, z: number, r: XZ[]): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const insideBuilding = (b: Building, x: number, z: number) => inRing(x, z, b.rings[0]) && !b.rings.slice(1).some(h => inRing(x, z, h));

interface Opening { kind: 'window' | 'gwindow' | 'door' | 'gate'; u: number; w: number; bottom: number; top: number; spring?: number; variant: number }

function rnd(seed: number, salt: number): number {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function openingPolygon(o: Opening): THREE.Vector2[] {
  const l = o.u - o.w / 2, r = o.u + o.w / 2;
  if (o.spring === undefined) return [new THREE.Vector2(l, o.bottom), new THREE.Vector2(r, o.bottom), new THREE.Vector2(r, o.top), new THREE.Vector2(l, o.top)];
  const pts = [new THREE.Vector2(l, o.bottom), new THREE.Vector2(r, o.bottom)];
  const R = o.w / 2, N = 10;
  for (let i = 0; i <= N; i++) { const a = (Math.PI * i) / N; pts.push(new THREE.Vector2(o.u + Math.cos(a) * R, o.spring + Math.sin(a) * R)); }
  return pts;
}

export interface FacadeStats { houses: number; windows: number; doors: number; triangles: number }

export function buildFacades(data: AreaData, terrain: Terrain, mats: HouseMaterials): { group: THREE.Group; stats: FacadeStats } {
  const houses = data.buildings.filter(b => b.detail);
  // Neighbours for party-wall tests: every building whose bounding box is near
  const boxes = data.buildings.map(b => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of b.rings[0]) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    return { b, x0, z0, x1, z1 };
  });

  const wall = new GeoBuilder(['aWall', 'aLayout', 'aLayout2']);
  // flat: thin mouldings whose shadows are too small to matter (AO shades them); kept out of the shadow maps
  const trim = new GeoBuilder(), flat = new GeoBuilder(), glass = new GeoBuilder(), wood = new GeoBuilder();
  const stats: FacadeStats = { houses: houses.length, windows: 0, doors: 0, triangles: 0 };
  const cWhite = new THREE.Color();

  for (const b of houses) {
    const seed = hashString(b.id);
    const tint = new THREE.Color(LIMEWASH[seed % LIMEWASH.length]);
    const trimStyle = (seed >>> 5) % 3;
    const trimC = trimStyle === 0 ? new THREE.Color('#f2ede2') : trimStyle === 1 ? tint.clone().lerp(cWhite.set('#ffffff'), 0.55) : new THREE.Color('#d8d0c0');
    const plinthC = new THREE.Color('#a29b8f');
    const shutterC = new THREE.Color(SHUTTERS[(seed >>> 9) % SHUTTERS.length]);
    const doorC = new THREE.Color(DOORS[(seed >>> 13) % DOORS.length]);
    const hasShutters = rnd(seed, 1) > 0.45, hasHoods = rnd(seed, 2) > 0.4, hasPilasters = rnd(seed, 3) > 0.35;
    const bayTarget = 2.9 + 0.8 * rnd(seed, 4);
    const k = b.roof?.k ?? 0, ov = b.overhang ?? 0;
    const topH = b.eaveY - b.groundY + ov * k;
    const h0 = b.baseY - b.groundY;
    const nUp = Math.max(0, Math.floor((topH - GROUND_F - 0.9) / UPPER_F + 0.05));
    const me = boxes.find(o => o.b === b)!;
    const near = boxes.filter(o => o.b !== b && o.x1 > me.x0 - 2 && o.x0 < me.x1 + 2 && o.z1 > me.z0 - 2 && o.z0 < me.z1 + 2);

    b.rings.forEach((ring, ri) => {
      const n = ring.length;
      // Edge frames with outward normals and party-wall flags
      const edges: Edge[] = ring.map((a, i) => {
        const c = ring[(i + 1) % n];
        const L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1e-6;
        const tx = (c[0] - a[0]) / L, tz = (c[1] - a[1]) / L;
        let nx = tz, nz = -tx;
        const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
        if (insideBuilding(b, mx + nx * 0.05, mz + nz * 0.05)) { nx = -nx; nz = -nz; }
        let hits = 0;
        for (const f of [0.2, 0.5, 0.8]) {
          const px = a[0] + tx * L * f + nx * 0.6, pz = a[1] + tz * L * f + nz * 0.6;
          if (near.some(o => px >= o.x0 && px <= o.x1 && pz >= o.z0 && pz <= o.z1 && insideBuilding(o.b, px, pz))) hits++;
        }
        return { ax: a[0], az: a[1], tx, tz, nx, nz, L, gy: b.groundY, party: hits >= 2 };
      });
      const miterAt = (i: number): [number, number] | null => {
        const ep = edges[(i - 1 + n) % n], ec = edges[i];
        if (ep.party || ec.party || ep.L < 0.05) return null;
        let mx = ep.nx + ec.nx, mz = ep.nz + ec.nz;
        const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
        const s = 1 / Math.max(0.35, mx * ec.nx + mz * ec.nz);
        return [mx * s, mz * s];
      };

      edges.forEach((e, i) => {
        if (e.L < 0.05) return;
        const eseed = hashString(`${b.id}:${ri}:${i}`);
        // --- Openings -------------------------------------------------------------------------------
        const openings: Opening[] = [];
        let u0 = 0.7, bayW = 0, nb = 0, halfW = 0;
        if (!e.party && e.L >= 2.6) {
          const usable = e.L - 1.4;
          nb = Math.max(1, Math.floor(usable / bayTarget));
          bayW = usable / nb;
          halfW = Math.min(0.55, (bayW - 0.75) / 2);
          if (halfW < 0.32) nb = 0;
        }
        if (nb > 0) {
          const doorEvery = 2 + Math.floor(rnd(eseed, 5) * 2), doorOff = Math.floor(rnd(eseed, 6) * doorEvery);
          const gateBay = e.L >= 13 && rnd(eseed, 7) > 0.3 ? Math.floor(nb / 2) : -1;
          for (let bi = 0; bi < nb; bi++) {
            const u = u0 + (bi + 0.5) * bayW;
            const g = P(e, u, 0, 0.5);
            const hl = Math.max(h0 + 0.12, terrain.heightAt(g.x, g.z) - e.gy);
            // Ground floor
            if (bi === gateBay && hl < 0.9) {
              const w = Math.min(2.6, bayW - 0.4);
              openings.push({ kind: 'gate', u, w, bottom: hl, spring: hl + 1.9, top: hl + 1.9 + w / 2, variant: 0 });
            } else if ((bi + doorOff) % doorEvery === 0 && hl < 0.95 && hl > h0 + 0.1) {
              openings.push({ kind: 'door', u, w: 1.3, bottom: hl, spring: hl + 2.05, top: hl + 2.7, variant: 0 });
            } else {
              const sill = Math.max(1.15, hl + 0.75), top = sill + 1.35;
              if (top < GROUND_F - 0.35) openings.push({ kind: 'gwindow', u, w: Math.min(1.0, halfW * 2 - 0.1), bottom: sill, top, variant: eseed % 4 });
            }
            // Upper floors
            for (let s = 1; s <= nUp; s++) {
              const sill = GROUND_F + (s - 1) * UPPER_F + 0.85, top = sill + 1.8;
              if (top > topH - 0.95) break;
              openings.push({ kind: 'window', u, w: halfW * 2, bottom: sill, top, variant: (eseed + bi * 7 + s * 3) % 4 });
            }
          }
        }

        // --- Wall surface with the openings cut out ------------------------------------------------
        const contour = [new THREE.Vector2(0, h0), new THREE.Vector2(e.L, h0), new THREE.Vector2(e.L, topH), new THREE.Vector2(0, topH)];
        const holes = openings.map(openingPolygon);
        const all = contour.concat(...holes);
        const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
        const layout = [u0, bayW, nb, halfW], layout2 = [nUp, 0, 0, 0];
        const nOut = vN(e);
        for (const [a, bb, c] of tris) {
          const va = all[a], vb = all[bb], vc = all[c];
          const ex = [[[va.x, va.y, topH, (seed % 997) / 997], [vb.x, vb.y, topH, (seed % 997) / 997], [vc.x, vc.y, topH, (seed % 997) / 997]],
            [layout, layout, layout], [layout2, layout2, layout2]];
          wall.tri(P(e, va.x, va.y, 0), P(e, vb.x, vb.y, 0), P(e, vc.x, vc.y, 0), nOut,
            [va.x / 2.5, va.y / 2.5], [vb.x / 2.5, vb.y / 2.5], [vc.x / 2.5, vc.y / 2.5], tint, ex);
        }

        // --- Reveals, glazing, doors, trim ---------------------------------------------------------
        for (const [oi, o] of openings.entries()) {
          const poly = holes[oi];
          const depth = o.kind === 'door' || o.kind === 'gate' ? DOOR_DEPTH : WIN_DEPTH;
          for (let j = 0; j < poly.length; j++) {
            const p = poly[j], q = poly[(j + 1) % poly.length];
            const du = q.x - p.x, dh = q.y - p.y, len = Math.hypot(du, dh);
            if (len < 1e-4) continue;
            const nIn = vT(e, -dh / len).add(UP.clone().multiplyScalar(du / len)); // towards the opening's centre
            const reveal = { ...e };
            const ex = [[[p.x, p.y, topH, 0], [q.x, q.y, topH, 0], [q.x, q.y, topH, 0]], [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]];
            const A = P(reveal, p.x, p.y, 0), B = P(reveal, q.x, q.y, 0), C = P(reveal, q.x, q.y, -depth), D = P(reveal, p.x, p.y, -depth);
            wall.tri(A, B, C, nIn, [0, 0], [len / 2.5, 0], [len / 2.5, depth / 2.5], tint, ex);
            wall.tri(A, C, D, nIn, [0, 0], [len / 2.5, depth / 2.5], [0, depth / 2.5], tint, ex);
          }
          const l = o.u - o.w / 2, r = o.u + o.w / 2;
          if (o.kind === 'window' || o.kind === 'gwindow') {
            stats.windows++;
            const vx = (o.variant % 2) * 0.5, vy = 1 - (Math.floor(o.variant / 2) + 1) * 0.5;
            glass.quad(P(e, l, o.bottom, -depth), P(e, r, o.bottom, -depth), P(e, r, o.top, -depth), P(e, l, o.top, -depth), nOut,
              [[vx, vy], [vx + 0.5, vy], [vx + 0.5, vy + 0.5], [vx, vy + 0.5]], cWhite.set('#ffffff'));
            // Sill, surround and (upper floors) a hood moulding and open shutters
            box(trim, e, o.u, o.bottom - 0.04, (0.09 - depth + 0.02) / 2, o.w / 2 + 0.12, 0.04, (0.09 + depth - 0.02) / 2, trimC, true);
            const sw = o.kind === 'window' ? 0.14 : 0.11;
            box(flat, e, l - sw / 2, (o.bottom + o.top + sw) / 2, 0.0175, sw / 2, (o.top + sw - o.bottom) / 2, 0.0175, trimC, true);
            box(flat, e, r + sw / 2, (o.bottom + o.top + sw) / 2, 0.0175, sw / 2, (o.top + sw - o.bottom) / 2, 0.0175, trimC, true);
            box(flat, e, o.u, o.top + sw / 2, 0.0175, o.w / 2, sw / 2, 0.0175, trimC, true);
            if (o.kind === 'window' && hasHoods) {
              box(trim, e, o.u, o.top + sw + 0.07, 0.055, o.w / 2 + 0.22, 0.05, 0.055, trimC, true);
              box(trim, e, o.u, o.top + sw + 0.15, 0.075, o.w / 2 + 0.27, 0.03, 0.075, trimC, true);
            }
            if (o.kind === 'window' && hasShutters && bayW - o.w - 2 * sw > o.w * 0.95) {
              const sh = (o.top - o.bottom) / 2, mid = (o.top + o.bottom) / 2;
              box(wood, e, l - sw - 0.02 - o.w / 4, mid, 0.055, o.w / 4, sh, 0.018, shutterC, true);
              box(wood, e, r + sw + 0.02 + o.w / 4, mid, 0.055, o.w / 4, sh, 0.018, shutterC, true);
            }
          } else {
            stats.doors++;
            // Door leaves (or gate leaves) filling the opening, set deep in the wall
            const shape = holes[oi];
            const dt = THREE.ShapeUtils.triangulateShape(shape, []);
            for (const [a, bb, c] of dt) {
              wood.tri(P(e, shape[a].x, shape[a].y, -depth), P(e, shape[bb].x, shape[bb].y, -depth), P(e, shape[c].x, shape[c].y, -depth), nOut,
                [shape[a].x, shape[a].y], [shape[bb].x, shape[bb].y], [shape[c].x, shape[c].y], doorC);
            }
            // Stone surround: jambs, an arch band and a keystone
            const jw = o.kind === 'gate' ? 0.28 : 0.2, pd = 0.045;
            box(flat, e, l - jw / 2, (o.bottom + o.spring!) / 2, pd / 2, jw / 2, (o.spring! - o.bottom) / 2, pd / 2, trimC, true);
            box(flat, e, r + jw / 2, (o.bottom + o.spring!) / 2, pd / 2, jw / 2, (o.spring! - o.bottom) / 2, pd / 2, trimC, true);
            const R0 = o.w / 2, R1 = R0 + jw, N = 10;
            for (let j = 0; j < N; j++) {
              const a0 = (Math.PI * j) / N, a1 = (Math.PI * (j + 1)) / N;
              const q = (a: number, R: number, d: number) => P(e, o.u + Math.cos(a) * R, o.spring! + Math.sin(a) * R, d);
              flat.quad(q(a0, R0, pd), q(a0, R1, pd), q(a1, R1, pd), q(a1, R0, pd), nOut, [[0, 0], [jw, 0], [jw, 0.3], [0, 0.3]], trimC);
              const am = (a0 + a1) / 2;
              const nRad = vT(e, Math.cos(am)).add(UP.clone().multiplyScalar(Math.sin(am)));
              flat.quad(q(a0, R1, 0), q(a1, R1, 0), q(a1, R1, pd), q(a0, R1, pd), nRad, [[0, 0], [0.3, 0], [0.3, pd], [0, pd]], trimC);
            }
            box(flat, e, o.u, o.spring! + R0 + jw * 0.4, pd, 0.14, jw * 0.7, pd, trimC, true); // keystone
            // Leaves: meeting stile, lock rail and bottom rail standing proud of the boards
            const lb = -depth + 0.02;
            box(wood, e, o.u, (o.bottom + o.spring! + R0 * 0.6) / 2, lb, 0.05, (o.spring! + R0 * 0.6 - o.bottom) / 2, 0.02, doorC, true);
            for (const rh of [o.bottom + 0.15, o.bottom + 1.0]) box(wood, e, o.u, rh, lb, o.w / 2 - 0.02, 0.06, 0.02, doorC, true);
          }
        }

        // --- Bands: plinth, string course, cornice (street and courtyard faces only) --------------
        if (!e.party) {
          const mStart = miterAt(i), mEnd = miterAt((i + 1) % n);
          const doorSpans = openings.filter(o => o.kind === 'door' || o.kind === 'gate').map(o => [o.u - o.w / 2 - (o.kind === 'gate' ? 0.3 : 0.22), o.u + o.w / 2 + (o.kind === 'gate' ? 0.3 : 0.22)]);
          const plinth = [[0, h0], [0.07, h0], [0.07, 0.55], [0.03, 0.62], [0, 0.62]];
          let ua = 0;
          for (const [s0, s1] of doorSpans.sort((p, q) => p[0] - q[0])) {
            extrude(trim, e, ua, s0, plinth, plinthC, ua === 0 ? mStart : null, null);
            ua = s1;
          }
          extrude(trim, e, ua, e.L, plinth, plinthC, ua === 0 ? mStart : null, mEnd);
          if (topH > GROUND_F + 2) {
            // Broken where a tall arch rises through it
            const course = [[0, GROUND_F - 0.12], [0.05, GROUND_F - 0.12], [0.05, GROUND_F + 0.02], [0.08, GROUND_F + 0.05], [0.08, GROUND_F + 0.12], [0, GROUND_F + 0.12]];
            const cuts = openings.filter(o => o.spring !== undefined && o.top + 0.3 > GROUND_F - 0.14).map(o => [o.u - o.w / 2 - 0.32, o.u + o.w / 2 + 0.32]).sort((p, q) => p[0] - q[0]);
            let ca = 0;
            for (const [c0, c1] of cuts) { extrude(trim, e, ca, c0, course, trimC, ca === 0 ? mStart : null, null); ca = c1; }
            extrude(trim, e, ca, e.L, course, trimC, ca === 0 ? mStart : null, mEnd);
          }
          const topOut = ov > 0 ? Math.max(-0.43, -0.34 * k - 0.03) : 0;
          const cornice = [[0, -0.78], [0.05, -0.78], [0.05, -0.62], [0.13, -0.56], [0.13, -0.48], [0.3, -0.44], [0.34, -0.44], [0.34, topOut], [0, ov > 0 ? -0.03 : 0]]
            .map(([d, h]) => [d, topH + h]);
          extrude(trim, e, 0, e.L, cornice, trimC, mStart, mEnd);
          // Corner pilasters on convex street corners
          if (hasPilasters) {
            const ep = edges[(i - 1 + n) % n], en = edges[(i + 1) % n];
            const convex = (a: Edge, c: Edge) => c.tx * a.nx + c.tz * a.nz < -0.3;
            const ph = (0.62 + topH - 0.78) / 2, phh = (topH - 0.78 - 0.62) / 2;
            if (!ep.party && convex(ep, e) && e.L > 1.6) box(flat, e, 0.25, ph, 0.02, 0.25, phh, 0.02, trimC, true);
            if (!en.party && convex(e, en) && e.L > 1.6) box(flat, e, e.L - 0.25, ph, 0.02, 0.25, phh, 0.02, trimC, true);
          }
        }
      });
    });

    // --- Chimneys on the ridge ----------------------------------------------------------------------
    if (b.roof && b.area > 35) {
      const V = b.roof.v;
      let tMax = 0;
      for (let i = 2; i < V.length; i += 3) tMax = Math.max(tMax, V[i]);
      const want = Math.min(3, Math.max(1, Math.round(b.area / 140)));
      const picks: [number, number, number][] = [];
      for (let i = 0; i < V.length && picks.length < want; i += 3) {
        const t = V[i + 2];
        if (t < tMax * 0.85) continue;
        if (picks.some(([x, z]) => Math.hypot(x - V[i], z - V[i + 1]) < 5)) continue;
        if (rnd(seed, 20 + i) < 0.25) continue;
        picks.push([V[i], V[i + 1], t]);
      }
      const ring = b.rings[0];
      const ex = { ax: 0, az: 0, tx: 1, tz: 0, nx: 0, nz: 1, L: 1, gy: 0, party: false };
      // align with the longest edge
      let best = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], c = ring[(i + 1) % ring.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
        if (L > best) { best = L; ex.tx = (c[0] - a[0]) / L; ex.tz = (c[1] - a[1]) / L; ex.nx = ex.tz; ex.nz = -ex.tx; }
      }
      const chimC = tint.clone().multiplyScalar(0.88), capC = new THREE.Color('#857f76');
      for (const [x, z, t] of picks) {
        const ridge = b.eaveY + t * k;
        const f = { ...ex, ax: x, az: z };
        box(trim, f, 0, ridge + 0.2, 0, 0.42, 1.2, 0.28, chimC);
        box(trim, f, 0, ridge + 1.44, 0, 0.52, 0.05, 0.38, capC);
        box(trim, f, 0, ridge + 1.56, 0, 0.3, 0.07, 0.17, capC);
      }
    }
  }

  const group = new THREE.Group();
  group.name = 'facades';
  for (const [builder, mat, cast] of [[wall, mats.wall, true], [trim, mats.trim, true], [flat, mats.trim, false], [glass, mats.glass, false], [wood, mats.wood, true]] as const) {
    const g = builder.geometry();
    if (!g) continue;
    stats.triangles += g.getAttribute('position').count / 3;
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return { group, stats };
}
