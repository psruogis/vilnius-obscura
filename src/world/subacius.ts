import * as THREE from 'three';
import type { AreaData, XZ } from './area';
import type { Terrain } from './terrain';
import { merged } from './geom';

/*
 * The Subačius Gate (Subačiaus vartai), the city wall's east gate on the road to Vitebsk, Polotsk and Moscow.
 * Built with the wall in 1503-22, first named 1528, rebuilt in the 17th c.; demolished from 27 May 1801 and gone
 * by September 1802 (docs/gates.md). Around 1900 nothing of it stood: by default it is a ghost, an ink drawing of
 * the gate laid over the street where it was; `?gate=solid` builds it in plaster and tile instead, for comparison.
 *
 * Form after P. Smuglevičius's drawing of 1785-86 and the archaeology, as summarised by VSAA (vsaa.lt/sena/subac_v.html):
 * a massive block, rectangular in plan, with a saddle roof and round corner towers, at least three
 * storeys; round cannon ports on the second floor; two rows of close-set upright loopholes near the top, the lower
 * row on a course projecting 15 cm (read as machicolations); a cornice, two rectangular niches and pilasters beside
 * the barrel-vaulted passage. The north-east corner with part of its tower's foundation survives. [V]
 * Place: the gap between the two surviving stretches of wall (OSM ways 194601579 and 1386286057) where they cross
 * Subačiaus g. at the Bokšto corner; the block stands on the street's line with its towers on the field (east)
 * side, clear of Subačiaus g. 16 (built 1775). Measurements are read off the drawing and are conjecture. [U]
 *
 * Also real in 1900 (a guess, [U]): the two stretches of wall either side, as low remnants; the ghost carries them
 * up to full height with the roofed gallery the drawing shows.
 */

// The block: west (city) face, east (field) face, north and south sides, local metres
const X0 = 323, X1 = 333, Z0 = 233.5, Z1 = 245.5;
const XC = (X0 + X1) / 2, ZC = (Z0 + Z1) / 2;
const EAVE = 13;            // walls above the passage floor
const RISE = 7.2;           // the saddle roof, ridge north-south
const TOWER_R = 3.0, TOWER_TOP = 14, CONE_H = 5.8;
const ARCH_W = 3.6, ARCH_SPRING = 3.0;
const BAND_Y0 = 9.4, BAND_Y1 = 10.2;   // the corbel course with the lower row of loopholes
const WALL_H = 10, WALL_T = 1.8, REMNANT_H = 4.2;
const TOWERS: XZ[] = [[X1, Z0], [X1, Z1]];
// First stretch of each surviving wall (OSM), from the gate outwards; used if the area data has no walls
const WALL_IDS = [194601579, 1386286057];
const WALL_FALLBACK: XZ[][] = [[[323.1, 244.6], [304.2, 293.8]], [[328.1, 234], [340.6, 189]]];

/** Where the gate stood and what it covered, for the map: the block and its two towers. */
export const SUBACIUS_GATE = {
  name: 'Subačius Gate', x: XC, z: ZC,
  plan: [[[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]], ...TOWERS.map(([x, z]) => circle(x, z, TOWER_R, 24))] as XZ[][],
};

export type GateLook = 'ghost' | 'solid';
export interface GateMaterials { wall: THREE.Material; roof: THREE.Material; dark: THREE.Material; remnant: THREE.Material }
export interface Gate {
  /** In the scene: the remnants of the wall, and the gate itself when solid. */
  solid: THREE.Group;
  /** Drawn over the finished picture (post.ts overlay), depth-tested against the town. Empty when solid. */
  ghost: THREE.Group;
  /** Wall segments for the walker (WallGrid). */
  segments: [number, number, number, number][];
  update(dt: number): void;
  /** Height of the passage floor (relative to the square), for the wet-wall shading. */
  floor: number;
}

function circle(cx: number, cz: number, r: number, n: number): XZ[] {
  const out: XZ[] = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  return out;
}

export function buildSubaciusGate(o: {
  data: AreaData; terrain: Terrain; look: GateLook; mats: GateMaterials;
  /** The scene's mist, for the ghost (it is drawn after the fog): exp² density, or a linear near/far. */
  fog: { density: number } | { near: number; far: number };
}): Gate {
  const { terrain } = o;
  const g0 = terrain.heightAt(XC, ZC);                 // the passage floor
  let low = g0;
  for (const [x, z] of [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1], ...TOWERS]) low = Math.min(low, terrain.heightAt(x, z) - TOWER_R * 0.1);
  const base = low - 0.6;                              // walls reach below the lowest ground
  const yE = g0 + EAVE;

  // ---- the body: faces (for the solid look, and the ghost's wash) and ink lines (the ghost's drawing) ----
  const wall: THREE.BufferGeometry[] = [], roof: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [];
  const ink: number[] = [];                            // line segments, x y z x y z
  const line = (a: THREE.Vector3, b: THREE.Vector3) => ink.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const loop = (pts: THREE.Vector3[]) => pts.forEach((p, i) => line(p, pts[(i + 1) % pts.length]));

  // The block with its passage: the cross-section (north-south by height) with the arch cut from its foot,
  // extruded west to east. Shape x = ZC - z, y = height; the extrusion runs along +x.
  const sec = new THREE.Shape();
  const hw = (Z1 - Z0) / 2, aw = ARCH_W / 2;
  sec.moveTo(-hw, base);
  sec.lineTo(-aw, base);
  sec.lineTo(-aw, g0 + ARCH_SPRING);
  sec.absarc(0, g0 + ARCH_SPRING, aw, Math.PI, 0, true);
  sec.lineTo(aw, base);
  sec.lineTo(hw, base);
  sec.lineTo(hw, yE);
  sec.lineTo(-hw, yE);
  sec.closePath();
  const block = new THREE.ExtrudeGeometry(sec, { depth: X1 - X0, bevelEnabled: false, curveSegments: 14 });
  block.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, X0, 0, 1, 0, 0, -1, 0, 0, ZC, 0, 0, 0, 1));
  wall.push(block);

  // Saddle roof, ridge north-south, gables at the ends, 0.45 m eaves
  const k = RISE / ((X1 - X0) / 2), ov = 0.45;
  const tri = new THREE.Shape([new THREE.Vector2(X0 - ov, yE - ov * k), new THREE.Vector2(X1 + ov, yE - ov * k), new THREE.Vector2(XC, yE + RISE)]);
  const roofG = new THREE.ExtrudeGeometry(tri, { depth: Z1 - Z0 + 0.5, bevelEnabled: false });
  roofG.translate(0, 0, Z0 - 0.25);
  roof.push(roofG);
  // a chimney on the ridge (the drawing's small turret at the south gable)
  roof.push(new THREE.BoxGeometry(0.7, 1.6, 0.7).translate(XC, yE + RISE - 0.1, Z1 - 1.2));

  // Round towers on the field corners, a little battered, with cone roofs and finials
  for (const [tx, tz] of TOWERS) {
    const h = g0 + TOWER_TOP - base;
    wall.push(new THREE.CylinderGeometry(TOWER_R, TOWER_R + 0.15, h, 28, 1, true).translate(tx, base + h / 2, tz));
    roof.push(new THREE.ConeGeometry(TOWER_R + 0.4, CONE_H, 28, 1, true).translate(tx, g0 + TOWER_TOP + CONE_H / 2, tz));
    roof.push(new THREE.SphereGeometry(0.2, 8, 6).translate(tx, g0 + TOWER_TOP + CONE_H + 0.1, tz));
    roof.push(new THREE.CylinderGeometry(0.03, 0.05, 1.3, 5).translate(tx, g0 + TOWER_TOP + CONE_H + 0.75, tz));
    // the corbel course round the tower
    wall.push(new THREE.CylinderGeometry(TOWER_R + 0.2, TOWER_R + 0.2, BAND_Y1 - BAND_Y0, 28, 1, true).translate(tx, g0 + (BAND_Y0 + BAND_Y1) / 2, tz));
  }
  // the corbel course along the block's faces (between and beside the towers)
  const course = (x0: number, z0: number, x1: number, z1: number, out: [number, number]) => {
    const L = Math.hypot(x1 - x0, z1 - z0), h = BAND_Y1 - BAND_Y0;
    const bx = new THREE.BoxGeometry(L, h, 0.2).rotateY(-Math.atan2(z1 - z0, x1 - x0));
    wall.push(bx.translate((x0 + x1) / 2 + out[0] * 0.1, g0 + BAND_Y0 + h / 2, (z0 + z1) / 2 + out[1] * 0.1));
  };
  course(X1, Z0 + TOWER_R, X1, Z1 - TOWER_R, [1, 0]);
  course(X0, Z0, X0, Z1, [-1, 0]);
  course(X0, Z0, X1 - TOWER_R, Z0, [0, -1]);
  course(X0, Z1, X1 - TOWER_R, Z1, [0, 1]);
  // a cornice over the passage on both faces, and pilasters beside the field arch
  for (const [x, s] of [[X1, 1], [X0, -1]] as const) {
    wall.push(new THREE.BoxGeometry(0.24, 0.32, s > 0 ? Z1 - Z0 - 2 * TOWER_R : Z1 - Z0).translate(x + s * 0.12, g0 + 5.6, ZC));
  }
  for (const dz of [-1, 1]) wall.push(new THREE.BoxGeometry(0.12, 5.4, 0.5).translate(X1 + 0.06, g0 + 2.7, ZC + dz * (aw + 0.45)));

  // ---- openings: dark in the solid look, drawn outlines in the ghost ----
  // a rectangle on a face: centre (x, y, z), outward normal (nx, nz), width w, height h
  const opening = (x: number, y: number, z: number, nx: number, nz: number, w: number, h: number) => {
    const tx = -nz, tz = nx, e = 0.03;
    const c = new THREE.Vector3(x + nx * e, y, z + nz * e);
    const P = (u: number, v: number) => c.clone().add(new THREE.Vector3(tx * u, v, tz * u));
    loop([P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, h / 2), P(-w / 2, h / 2)]);
    dark.push(new THREE.PlaneGeometry(w, h).rotateY(Math.atan2(nx, nz)).translate(c.x, c.y, c.z));
  };
  // a round cannon port
  const port = (x: number, y: number, z: number, nx: number, nz: number, r: number) => {
    const tx = -nz, tz = nx, c = new THREE.Vector3(x + nx * 0.03, y, z + nz * 0.03), n = 14;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push(c.clone().add(new THREE.Vector3(tx * Math.cos(a) * r, Math.sin(a) * r, tz * Math.cos(a) * r))); }
    loop(pts);
    dark.push(new THREE.CircleGeometry(r, n).rotateY(Math.atan2(nx, nz)).translate(c.x, c.y, c.z));
  };
  // Loopholes round a tower (the side facing the field), at height y; slits w x h, about `step` m apart
  const towerRow = (tx: number, tz: number, r: number, y: number, w: number, h: number, step: number) => {
    const n = Math.round((2 * Math.PI * r) / step);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, nx = Math.cos(a), nz = Math.sin(a);
      if (tx + nx * r < X1 - 0.2 && Math.abs(tz + nz * r - ZC) < hw - 0.2) continue;   // inside the block
      opening(tx + nx * r, y, tz + nz * r, nx, nz, w, h);
    }
  };
  // ... and along a straight face from a to b
  const faceRow = (a: XZ, b: XZ, n: [number, number], y: number, w: number, h: number, step: number, skip?: (x: number, z: number) => boolean) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.floor(L / step);
    for (let i = 0; i < m; i++) {
      const t = (i + 0.5) / m, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      if (!skip?.(x, z)) opening(x + n[0] * 0.2, y, z + n[1] * 0.2, n[0], n[1], w, h);
    }
  };
  const bandY = g0 + (BAND_Y0 + BAND_Y1) / 2, upperY = g0 + 11.6;
  for (const [tx, tz] of TOWERS) {
    towerRow(tx, tz, TOWER_R + 0.2, bandY, 0.16, 0.5, 0.8);        // the slits in the corbel course
    towerRow(tx, tz, TOWER_R, upperY, 0.2, 0.75, 1.15);            // the upper row
    const out = tz < ZC ? -1 : 1;                                  // round ports: east, outward and between
    for (const a of [0, out * Math.PI / 4, out * Math.PI / 2]) port(tx + Math.cos(a) * TOWER_R, g0 + 4.8, tz + Math.sin(a) * TOWER_R, Math.cos(a), Math.sin(a), 0.34);
  }
  faceRow([X1, Z0 + TOWER_R], [X1, Z1 - TOWER_R], [1, 0], bandY, 0.16, 0.5, 0.8);
  faceRow([X1, Z0 + TOWER_R], [X1, Z1 - TOWER_R], [1, 0], upperY, 0.2, 0.75, 1.1);
  for (const [a, b, n] of [[[X0, Z0], [X0, Z1], [-1, 0]], [[X0, Z0], [X1 - TOWER_R, Z0], [0, -1]], [[X0, Z1], [X1 - TOWER_R, Z1], [0, 1]]] as [XZ, XZ, [number, number]][]) {
    faceRow(a, b, n, bandY, 0.16, 0.5, 0.8);
    faceRow(a, b, n, upperY, 0.2, 0.75, 1.1);
    faceRow(a, b, n, g0 + 7.4, 0.8, 1.2, 3.2, (_x, z) => n[0] !== 0 && Math.abs(z - ZC) < aw + 0.8);   // small windows
  }
  // the field front over the arch: a window between two rectangular niches
  opening(X1, g0 + 7.4, ZC, 1, 0, 1.0, 1.4);
  for (const dz of [-1, 1]) opening(X1, g0 + 7.5, ZC + dz * 1.75, 1, 0, 0.7, 1.2);

  // ---- the wall either side: remnants (real) and the ghost wall with its roofed gallery ----
  const lines = WALL_IDS.map((id, i) => {
    const w = o.data.cityWalls?.find(c => c.id === id);
    return w ? [w.line[0], w.line[1]] as XZ[] : WALL_FALLBACK[i];
  });
  const remnant: THREE.BufferGeometry[] = [], ghostWall: THREE.BufferGeometry[] = [], ghostRoof: THREE.BufferGeometry[] = [];
  const segments: [number, number, number, number][] = [];
  lines.forEach((ln, li) => {
    const [a, b] = ln, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
    let nx = tz, nz = -tx;
    if (nx < 0) { nx = -nx; nz = -nz; }                  // outward: east, away from the city
    const n = Math.ceil(L);
    const at = (i: number) => [a[0] + tx * (L * i) / n, a[1] + tz * (L * i) / n] as XZ;
    // a slab along the line, from its foot to top(i), between offsets s0 and s1 across it
    const slab = (s0: number, s1: number, top: (i: number, x: number, z: number) => number, foot: (i: number, x: number, z: number) => number) => {
      const pos: number[] = [], idx: number[] = [];
      for (let i = 0; i <= n; i++) {
        const [x, z] = at(i);
        for (const s of [s0, s1]) {
          const px = x + nx * s, pz = z + nz * s;
          pos.push(px, foot(i, px, pz), pz, px, top(i, px, pz), pz);
        }
      }
      // per step: 4 verts (s0 foot, s0 top, s1 foot, s1 top)
      for (let i = 0; i < n; i++) {
        const q = i * 4, r = q + 4;
        idx.push(q, r, q + 1, r, r + 1, q + 1);             // the s0 face
        idx.push(q + 2, q + 3, r + 2, r + 2, q + 3, r + 3); // the s1 face
        idx.push(q + 1, r + 1, q + 3, r + 1, r + 3, q + 3); // the top
      }
      for (const q of [0, n * 4]) idx.push(q, q + 1, q + 2, q + 2, q + 1, q + 3);   // the ends
      const ix = new THREE.BufferGeometry();
      ix.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      ix.setIndex(idx);
      const geo = ix.toNonIndexed();
      geo.computeVertexNormals();
      return geo;
    };
    const ground = (x: number, z: number) => terrain.heightAt(x, z);
    const level = (i: number) => terrain.heightAt(at(i)[0], at(i)[1]);   // tops are level across the wall
    const across = (i: number, x: number, z: number) => (x - at(i)[0]) * nx + (z - at(i)[1]) * nz;
    // a broken top: courses lost here and there, a gap dropping a metre or more now and then
    const hash = (k: number) => { const h = Math.sin(k * 12.9898 + li * 78.233) * 43758.5453; return h - Math.floor(h); };
    const rough = (i: number) => {
      const t = i * 0.45, k = Math.floor(t), f = t - k, u = f * f * (3 - 2 * f);   // smooth noise along the top
      const n = hash(k) * (1 - u) + hash(k + 1) * u;
      return -1.1 + 1.6 * n + 0.15 * Math.sin(i * 2.3 + li);
    };
    const foot = (_i: number, x: number, z: number) => ground(x, z) - 0.5;
    remnant.push(uvMetres(slab(-WALL_T / 2, WALL_T / 2, i => level(i) + REMNANT_H + rough(i), foot)));
    // the whole wall: the body up to the wall walk, the parapet on the field side, and the gallery's lean-to roof
    // (from over the parapet down towards the city)
    ghostWall.push(slab(-WALL_T / 2, WALL_T / 2, i => level(i) + WALL_H - 2.2, foot));
    ghostWall.push(slab(WALL_T / 2 - 0.6, WALL_T / 2, i => level(i) + WALL_H, i => level(i) + WALL_H - 2.3));
    const pitch = (i: number, x: number, z: number) => (WALL_T / 2 + 0.3 - across(i, x, z)) * 0.5;
    ghostRoof.push(slab(-WALL_T / 2 - 0.6, WALL_T / 2 + 0.3, (i, x, z) => level(i) + WALL_H + 1.0 - pitch(i, x, z), (i, x, z) => level(i) + WALL_H + 0.8 - pitch(i, x, z)));
    // loopholes along the parapet
    for (let d = 2; d < L - 1; d += 1.8) {
      const x = a[0] + tx * d, z = a[1] + tz * d;
      opening(x + nx * WALL_T / 2, ground(x, z) + WALL_H - 1.0, z + nz * WALL_T / 2, nx, nz, 0.18, 0.6);
    }
    // the remnant stops the walker
    for (const s of [-WALL_T / 2, WALL_T / 2]) segments.push([a[0] + nx * s, a[1] + nz * s, b[0] + nx * s, b[1] + nz * s]);
    segments.push([a[0] - nx * WALL_T / 2, a[1] - nz * WALL_T / 2, a[0] + nx * WALL_T / 2, a[1] + nz * WALL_T / 2]);
    segments.push([b[0] - nx * WALL_T / 2, b[1] - nz * WALL_T / 2, b[0] + nx * WALL_T / 2, b[1] + nz * WALL_T / 2]);
  });

  const solid = new THREE.Group(), ghost = new THREE.Group();
  solid.name = 'subacius-remnants'; ghost.name = 'subacius-ghost';

  const uniforms = {
    uTime: { value: 0 },
    uFog: { value: 'density' in o.fog ? new THREE.Vector3(1, o.fog.density, 0) : new THREE.Vector3(0, o.fog.near, o.fog.far) },
    uGate: { value: new THREE.Vector2(XC, ZC) },
  };
  if (o.look === 'solid') {
    // before 1799: the gate and the whole wall
    for (const [parts, mat] of [[[...wall, ...ghostWall], o.mats.wall], [[...roof, ...ghostRoof], o.mats.roof], [dark, o.mats.dark]] as const) {
      const m = new THREE.Mesh(merged(parts.map(uvMetres)), mat);
      m.castShadow = mat !== o.mats.dark; m.receiveShadow = true;
      solid.add(m);
    }
    solid.name = 'subacius';
    // the solid gate stops the walker too: its sides, the passage walls, the towers
    const box = (x0: number, z0: number, x1: number, z1: number) => segments.push([x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]);
    box(X0, Z0, X1, ZC - aw);
    box(X0, ZC + aw, X1, Z1);
    for (const [tx, tz] of TOWERS) { const r = circle(tx, tz, TOWER_R + 0.1, 12); r.forEach((p, i) => segments.push([p[0], p[1], r[(i + 1) % 12][0], r[(i + 1) % 12][1]])); }
  } else {
    // c.1900: what was left of the wall, low and ragged
    const rem = new THREE.Mesh(merged(remnant), o.mats.remnant);
    rem.castShadow = rem.receiveShadow = true;
    solid.add(rem);
    // the ghost: a pale wash on the faces, strongest where they turn away (as the paper shows through an ink wash),
    // and the drawing's lines; both fade into the street at the foot, into the mist, and when walked into.
    // A depth pass first, so only the nearest face is washed and lines behind the gate's own faces are hidden.
    const faces = merged([...wall, ...roof, ...ghostWall, ...ghostRoof].map(g => (g.index ? g.toNonIndexed() : g)).map(g => { g.deleteAttribute('uv'); return g; }));
    const edges = new THREE.EdgesGeometry(faces, 24);
    const inkPos = edges.getAttribute('position').array as Float32Array;
    const all = new Float32Array(inkPos.length + ink.length);
    all.set(inkPos); all.set(ink, inkPos.length);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(all, 3));
    for (const geo of [faces, lineGeo]) setGround(geo, terrain);
    const depth = new THREE.Mesh(faces, ghostMaterial(uniforms, 'depth'));
    const wash = new THREE.Mesh(faces, ghostMaterial(uniforms, 'wash'));
    const lines = new THREE.LineSegments(lineGeo, ghostMaterial(uniforms, 'lines'));
    depth.renderOrder = 1; wash.renderOrder = 2; lines.renderOrder = 3;
    ghost.add(depth, wash, lines);
  }
  return {
    solid, ghost, segments, floor: g0,
    update(dt: number) { uniforms.uTime.value += dt; },
  };
}

/** UVs in metres for the plaster and tile textures: projected on the face's own plane. */
function uvMetres(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const p = geo.getAttribute('position') as THREE.BufferAttribute, n = geo.getAttribute('normal') as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ny > nx && ny > nz) { uv[i * 2] = x; uv[i * 2 + 1] = z; }
    else if (nx > nz) { uv[i * 2] = z; uv[i * 2 + 1] = y; }
    else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** The ground under each vertex, for the ghost's fade at its foot. */
function setGround(geo: THREE.BufferGeometry, terrain: Terrain): void {
  const p = geo.getAttribute('position') as THREE.BufferAttribute, gr = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) gr[i] = terrain.heightAt(p.getX(i), p.getZ(i));
  geo.setAttribute('aGround', new THREE.BufferAttribute(gr, 1));
}

// The ghost is drawn after tone mapping (post.ts overlay), so its colours are the picture's own: old paper and ink.
const WASH = new THREE.Color('#d8cdb6'), INK = new THREE.Color('#f1e8d4');

function ghostMaterial(u: { uTime: { value: number }; uFog: { value: THREE.Vector3 }; uGate: { value: THREE.Vector2 } }, pass: 'depth' | 'wash' | 'lines'): THREE.ShaderMaterial {
  const lines = pass === 'lines';
  return new THREE.ShaderMaterial({
    uniforms: { ...u, uColor: { value: lines ? INK : WASH }, uAlpha: { value: lines ? 0.62 : 0.13 } },
    vertexShader: /* glsl */ `
      attribute float aGround;
      varying vec3 vWorld; varying vec3 vNormal; varying float vHeight;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz; vHeight = position.y - aGround;
        ${lines ? 'vNormal = vec3(0.0, 1.0, 0.0);' : 'vNormal = normalize(mat3(modelMatrix) * normal);'}
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAlpha; uniform float uTime; uniform vec3 uFog; uniform vec2 uGate;
      varying vec3 vWorld; varying vec3 vNormal; varying float vHeight;
      void main() {
        float d = distance(cameraPosition, vWorld);
        float mist = uFog.x > 0.5 ? exp(-pow(uFog.y * d, 2.0)) : 1.0 - smoothstep(uFog.y, uFog.z, d);
        float a = uAlpha * mist;
        a *= smoothstep(0.0, 2.6, vHeight);                          // rising out of the street
        a *= smoothstep(1.2, 5.0, d);                                // and thinning when walked into
        a *= smoothstep(56.0, 30.0, distance(vWorld.xz, uGate));     // the wall fades away along its length
        a *= 0.9 + 0.1 * sin(uTime * 0.6 + vWorld.y * 0.15);         // breathing, slowly
        vec3 c = uColor;
        ${lines ? '' : `
        vec3 n = normalize(vNormal), v = normalize(cameraPosition - vWorld);
        float rim = pow(1.0 - abs(dot(n, v)), 2.0);
        float lit = 0.62 + 0.38 * max(dot(n, normalize(vec3(-0.4, 0.8, 0.45))), 0.0);
        // hatching on the faces turned from the light, as a draughtsman shades
        float hatch = step(0.62, fract((vWorld.x - vWorld.z) * 2.2 + vWorld.y * 1.4)) * (1.0 - smoothstep(0.62, 0.8, lit));
        a *= 0.55 + 1.3 * rim + 0.8 * hatch;
        c *= lit;`}
        ${pass === 'depth' ? 'if (a < 0.01) discard;' : ''}
        gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
      }`,
    transparent: true, depthTest: true, side: THREE.DoubleSide, toneMapped: false,
    // the depth pass sits a hair behind, so the wash and the lines on the nearest faces pass the test
    depthWrite: pass === 'depth', colorWrite: pass !== 'depth',
    polygonOffset: pass === 'depth', polygonOffsetFactor: 1, polygonOffsetUnits: 2,
  });
}
