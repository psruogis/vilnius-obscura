import * as THREE from 'three';
import type { XZ } from './area';
import { merged } from './geom';
import { buildTowerGate, gateFrame, gatePlan, type GateSpec } from './towergate';
import { faceBox, uvMetres, type Gate, type GateMaterials } from './subacius';

/**
 * The Gate of Dawn (Aušros vartai), the one city gate still standing in 1900, as photographed then (docs/gates.md §11):
 * J. Čechavičius c. 1873 (the city side), S. F. Fleury c. 1896 (the field side and the wall east of it), J. Bułhak
 * 1912 (the field front and its attic close to). The tower comes from the gate kit (towergate.ts); this adds what the
 * kit has no words for: the entablature and the Renaissance attic on all four sides, its aedicules, the griffins and
 * the Vytis on the field front, the little belfry and cross on the town side, the classical chapel over the street on
 * the town side (1829), and the high wall running east. Sizes: the plan 11.2 x 10.8 m (Girlevičius 2009, p. 75) [V];
 * heights, openings and the chapel's front read off the photographs against that width [U].
 *
 * Frame (as the kit's): x out of town along the street (the field face at x = 0, the town face at x = -10.8), z along
 * the wall (positive west), y up from the passage floor.
 */

const norm = (x: number, z: number): XZ => { const l = Math.hypot(x, z); return [x / l, z / l]; };
const D = 10.8, HW = 5.6;                       // the tower, along the street and half across it
const EB = 14.2 - 1.4, ET = 14.2;               // the entablature (Bułhak 1912: 1.4 m under a 4.1 m attic)
const AT = 18.0, AC = 18.3;                     // the attic's top, and its cornice's

export const DAWN_SPEC: GateSpec = {
  name: 'Gate of Dawn', site: [171.2, 481.3], out: norm(0.184, 0.983),   // the field face on Aušros Vartų g.'s line (OSM)
  tower: { depth: D, hw: HW, eave: ET - 0.3, roof: { kind: 'hip', rise: 2.4 } },  // the roof hidden behind the attic, its eaves under the cornice
  passage: { aw: 1.7, spring: 3.9 },
  holes: [
    // round gun ports (Bułhak 1912): three across the field front under the entablature, two lower either side of the
    // niche over the gateway, one in the middle of each side (Fleury c. 1896)
    { on: 'field', kind: 'port', y: 11.6, at: [-3.1, 0, 3.1], r: 0.3 },
    { on: 'field', kind: 'port', y: 8.2, at: [-2.65, 2.65], r: 0.3 },
    { on: 'sides', kind: 'port', y: 11.6, at: [0], r: 0.3 },
  ],
};

/** For the map: the tower and the chapel. */
export const DAWN_GATE = (() => {
  const p = gatePlan(DAWN_SPEC), { world } = gateFrame(DAWN_SPEC);
  return { ...p, plan: [...p.plan, [world(-D, -4.8), world(-D - 5, -4.8), world(-D - 5, 4.8), world(-D, 4.8)]] };
})();

/** Chapel walls: their own render (ochre panels between white pilasters in the 1873 photograph [U]). */
export function buildDawnGate(o: Parameters<typeof buildTowerGate>[1] & { chapel: GateMaterials }): Gate {
  const gate = buildTowerGate(DAWN_SPEC, { ...o, look: 'solid' });   // it stood in 1900: never a ghost
  const { world, M } = gateFrame(DAWN_SPEC);
  const g0 = gate.floor, y = (h: number) => g0 + h;
  const P = { render: [] as THREE.BufferGeometry[], chapel: [] as THREE.BufferGeometry[], trim: [] as THREE.BufferGeometry[], roof: [] as THREE.BufferGeometry[],
    dark: [] as THREE.BufferGeometry[], iron: [] as THREE.BufferGeometry[], gilt: [] as THREE.BufferGeometry[], wall: [] as THREE.BufferGeometry[] };
  // the four faces: a point at the face's middle (at floor level), its outward normal, its direction along
  type Face = { c: XZ; n: XZ; t: XZ; len: number };
  const F: Record<'field' | 'town' | 'west' | 'east', Face> = {
    field: { c: [0, 0], n: [1, 0], t: [0, 1], len: 2 * HW },
    town: { c: [-D, 0], n: [-1, 0], t: [0, -1], len: 2 * HW },
    west: { c: [-D / 2, HW], n: [0, 1], t: [-1, 0], len: D },
    east: { c: [-D / 2, -HW], n: [0, -1], t: [1, 0], len: D },
  };
  const at = (f: Face, s: number, out = 0): XZ => [f.c[0] + f.t[0] * s + f.n[0] * out, f.c[1] + f.t[1] * s + f.n[1] * out];
  // a box standing out `d` from a face, `w` along it, centred `s` along it and at height h
  const fb = (f: Face, s: number, w: number, h0: number, h1: number, d: number, out = 0) => { const [x, z] = at(f, s, out); return faceBox(w, h1 - h0, d, x, y((h0 + h1) / 2), z, f.n[0], f.n[1]); };
  // a flat shape (in the face's own s, h) stood on a face and pushed out `d`
  const onFace = (f: Face, shape: THREE.Shape | THREE.Shape[], d: number, out = 0) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 10 });
    const [x, z] = at(f, 0, out);
    const tx = new THREE.Vector3(f.t[0], 0, f.t[1]), up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3(f.n[0], 0, f.n[1]);
    // (along, up, out) is a left-handed frame on these faces: extrude the other way and back, so the faces keep facing out
    if (tx.clone().cross(up).dot(n) < 0) g.scale(1, 1, -1).translate(0, 0, d);
    return g.applyMatrix4(new THREE.Matrix4().makeBasis(tx, up, n).setPosition(x, g0, z));
  };
  const flip = (pts: number[][]) => pts.map(([a, b]) => [-a, b]);
  const shapeOf = (pts: number[][], sx: number, sy: number, ox: number, oy: number) => new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(ox + a * sx, oy + b * sy)));

  // --- entablature (all four sides) and the attic -------------------------------------------------------------
  for (const f of Object.values(F)) {
    P.trim.push(fb(f, 0, f.len + 0.3, EB, EB + 0.7, 0.16));          // architrave
    P.render.push(fb(f, 0, f.len + 0.1, EB + 0.7, ET - 0.3, 0.06));   // frieze
    P.trim.push(fb(f, 0, f.len + 1.3, ET - 0.3, ET, 0.62));            // cornice (over the hidden roof's eaves)
    P.render.push(fb(f, 0, f.len, ET, AT, 0.6, -0.6));                 // the attic wall, set on the tower's face
    P.trim.push(fb(f, 0, f.len + 0.1, ET, ET + 0.18, 0.1));           // its plinth
    P.trim.push(fb(f, 0, f.len + 0.5, AT, AC, 0.25));                  // its cornice
  }

  // an aedicule (Bułhak 1912): an arched niche between pilasters, a little cornice and pediment, balls on it
  const aedicule = (f: Face, s: number) => {
    const b = ET + 0.35, spring = ET + 2.2, nw = 1.14;
    for (const k of [-1, 1]) P.trim.push(fb(f, s + k * (nw / 2 + 0.12), 0.24, b, spring + 0.35, 0.14));
    const ring = new THREE.Shape(); ring.absarc(0, 0, nw / 2 + 0.24, 0, Math.PI, false); ring.lineTo(-nw / 2, 0); ring.absarc(0, 0, nw / 2, Math.PI, 0, true); ring.closePath();
    P.trim.push(onFace(f, ring, 0.12).applyMatrix4(new THREE.Matrix4().makeTranslation(...shift(f, s, spring))));
    P.trim.push(fb(f, s, 1.9, spring + 0.85, spring + 0.97, 0.2));    // cornice
    const ped = new THREE.Shape([new THREE.Vector2(-0.95, 0), new THREE.Vector2(0.95, 0), new THREE.Vector2(0, 0.42)]);
    P.trim.push(onFace(f, ped, 0.16).applyMatrix4(new THREE.Matrix4().makeTranslation(...shift(f, s, spring + 0.97))));
    for (const [ds, dh] of [[-0.9, 0.06], [0, 0.48], [0.9, 0.06]]) {
      const [x, z] = at(f, s + ds, 0.1);
      P.trim.push(new THREE.SphereGeometry(0.09, 10, 8).translate(x, y(spring + 0.97 + dh), z));
    }
    P.trim.push(fb(f, s, 1.6, b - 0.08, b + 0.04, 0.18));             // sill
  };
  // shifts a shape built at the face's middle and floor to s along it and height h
  function shift(f: Face, s: number, h: number): [number, number, number] { return [f.t[0] * s, h, f.t[1] * s]; }
  // an obelisk finial on a block, and an S-scroll
  const obelisk = (f: Face, s: number, h: number) => {
    P.trim.push(fb(f, s, 0.3, h, h + 0.22, 0.18));
    const [x, z] = at(f, s, 0.09);
    P.trim.push(new THREE.ConeGeometry(0.12, 0.85, 4).rotateY(Math.PI / 4).translate(x, y(h + 0.22 + 0.42), z));
  };
  const scroll = (f: Face, s: number, h: number, dir: 1 | -1) => {
    const [x, z] = at(f, s, 0.05);
    const yaw = Math.atan2(-f.t[1], f.t[0]);   // the torus's plane onto the face's
    for (const [dy, flipY] of [[0.28, 1], [-0.28, -1]] as const) {
      P.trim.push(new THREE.TorusGeometry(0.22, 0.05, 6, 14, Math.PI * 1.4).rotateZ(dir * flipY > 0 ? -0.2 : Math.PI + 0.2).rotateY(yaw).translate(x, y(h + dy), z));
    }
  };

  // --- the field front's attic: the aedicules, the griffins and the Vytis between them --------------------------
  const field = F.field;
  for (const s of [-3.74, 3.74]) { aedicule(field, s); obelisk(field, s + Math.sign(s) * 1.35, ET + 0.9); scroll(field, s + Math.sign(s) * 1.25, ET + 2.3, s > 0 ? 1 : -1); }
  for (const s of [-1.95, 1.95]) obelisk(field, s, ET + 0.6);
  // the cartouche: an oval frame, a raised oval in it, the rider on it, a fleur-de-lis over it
  const oval = (rx: number, ry: number) => { const sh = new THREE.Shape(); sh.absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0); return sh; };
  const cy = ET + 1.75;
  const frame = oval(0.8, 1.1); frame.holes.push(oval(0.62, 0.92));
  P.trim.push(onFace(field, frame, 0.14).translate(0, cy, 0));
  P.trim.push(onFace(field, oval(0.64, 0.94), 0.05).translate(0, cy, 0));
  const VYTIS = [[-0.42, -0.42], [-0.3, -0.42], [-0.22, -0.18], [0.12, -0.2], [0.3, -0.44], [0.42, -0.44], [0.3, -0.12], [0.4, 0.08], [0.5, 0.2],
    [0.42, 0.26], [0.28, 0.1], [0.06, 0.1], [0.08, 0.3], [0.16, 0.44], [0.3, 0.62], [0.24, 0.66], [0.06, 0.46], [-0.04, 0.5], [-0.1, 0.34],
    [-0.08, 0.12], [-0.28, 0.1], [-0.46, 0.22], [-0.5, 0.08], [-0.36, -0.06], [-0.4, -0.2]];
  P.trim.push(onFace(field, shapeOf(VYTIS, 0.9, 1.1, 0, 0), 0.09).translate(0, cy - 0.05, 0));
  const LIS = [[0, 0], [0.14, 0.12], [0.28, 0.1], [0.3, 0.3], [0.18, 0.24], [0.1, 0.36], [0, 0.6], [-0.1, 0.36], [-0.18, 0.24], [-0.3, 0.3], [-0.28, 0.1], [-0.14, 0.12]];
  P.trim.push(onFace(field, shapeOf(LIS, 1, 1, 0, 0), 0.12).translate(0, cy + 1.08, 0));
  // the griffins, rampant, facing the shield (a flat relief, as the photograph shows them)
  const GRIFFIN = [[0.05, 0.35], [0, 0.6], [0.08, 0.7], [0.12, 0.55], [0.25, 0.6], [0.2, 0.85], [0.3, 1.15], [0.45, 1.05], [0.42, 0.85], [0.55, 0.95],
    [0.5, 0.75], [0.62, 0.8], [0.7, 1.0], [0.8, 1.02], [0.92, 0.95], [0.98, 0.9], [0.86, 0.88], [0.78, 0.82], [0.95, 0.72], [1.0, 0.6], [0.9, 0.62],
    [0.72, 0.66], [0.68, 0.5], [0.75, 0.3], [0.8, 0.05], [0.7, 0.05], [0.6, 0.3], [0.42, 0.35], [0.35, 0.15], [0.38, 0], [0.28, 0], [0.22, 0.25]];
  P.trim.push(onFace(field, shapeOf(GRIFFIN, 1.8, 1.8, -2.75, ET + 0.35), 0.12));           // on the left, facing right
  P.trim.push(onFace(field, shapeOf(flip(GRIFFIN), 1.8, 1.8, 2.75, ET + 0.35), 0.12));      // and its mirror

  // --- the field front below: the blind arched niche over the gateway, and the ports' thick moulded rims (1912) --
  {
    const w = 1.9, h0 = 6.3, sp = 9.0 - w / 2;
    const fr = new THREE.Shape(); fr.moveTo(-w / 2 - 0.2, h0); fr.lineTo(w / 2 + 0.2, h0); fr.lineTo(w / 2 + 0.2, sp); fr.absarc(0, sp, w / 2 + 0.2, 0, Math.PI, false); fr.closePath();
    const hole = new THREE.Path(); hole.moveTo(-w / 2, h0); hole.lineTo(w / 2, h0); hole.lineTo(w / 2, sp); hole.absarc(0, sp, w / 2, 0, Math.PI, false); hole.closePath();
    fr.holes.push(hole);
    P.render.push(onFace(field, fr, 0.22));                                     // the wall stands out round the niche
    P.trim.push(fb(field, 0, w + 0.7, h0 - 0.2, h0, 0.3));                      // its sill
    P.trim.push(fb(field, 0, 0.28, 9.0 - 0.05, 9.0 + 0.4, 0.3));               // keystone
  }
  const rim = (f: Face, s: number, h: number) => {
    const [x, z] = at(f, s, 0.02);
    P.trim.push(new THREE.TorusGeometry(0.4, 0.1, 8, 20).rotateY(Math.atan2(f.n[0], f.n[1])).translate(x, y(h), z));
  };
  for (const s of [-3.1, 0, 3.1]) rim(field, s, 11.6);
  for (const s of [-2.65, 2.65]) rim(field, s, 8.2);
  rim(F.west, 0, 11.6); rim(F.east, 0, 11.6);

  // --- the sides: two aedicules each, scrolls between ("arches joined by anchors" on three sides, lt.wikipedia) --
  for (const f of [F.west, F.east]) for (const s of [-2.7, 2.7]) { aedicule(f, s); scroll(f, s + Math.sign(s) * 1.25, ET + 2.3, s > 0 ? 1 : -1); }
  scroll(F.west, 0, ET + 2.3, 1); scroll(F.east, 0, ET + 2.3, -1);

  // --- the town side: two aedicules and, in the middle, the little belfry with its bell and the cross (1873) ------
  const town = F.town;
  for (const s of [-3.74, 3.74]) aedicule(town, s);
  {
    const w = 2.1, h0 = ET + 0.4, h1 = AC + 0.5;
    const bel = new THREE.Shape([new THREE.Vector2(-w / 2, h0), new THREE.Vector2(w / 2, h0), new THREE.Vector2(w / 2, h1), new THREE.Vector2(-w / 2, h1)]);
    const hole = new THREE.Path(); hole.moveTo(-0.45, h0 + 0.5); hole.lineTo(0.45, h0 + 0.5); hole.lineTo(0.45, h0 + 2.1); hole.absarc(0, h0 + 2.1, 0.45, 0, Math.PI, false); hole.lineTo(-0.45, h0 + 0.5);
    bel.holes.push(hole);
    P.render.push(onFace(town, bel, 0.45));
    P.dark.push(fb(town, 0, 0.92, h0 + 0.5, h0 + 2.55, 0.05));       // the dark behind the opening
    P.trim.push(fb(town, 0, w + 0.3, h1, h1 + 0.2, 0.6));             // its cap
    const [bx, bz] = at(town, 0, 0.25);
    const bell = new THREE.LatheGeometry([[0.02, 0], [0.32, 0], [0.3, 0.08], [0.22, 0.3], [0.2, 0.5], [0.12, 0.6], [0.02, 0.62]].map(([r, hh]) => new THREE.Vector2(r, hh)), 16);
    P.iron.push(bell.translate(bx, y(h0 + 1.2), bz));
    const [cx, cz] = at(town, 0, 0.3);
    P.iron.push(new THREE.BoxGeometry(0.1, 1.6, 0.1).translate(cx, y(h1 + 1.0), cz), new THREE.BoxGeometry(0.1, 0.1, 0.8).rotateY(Math.atan2(town.t[0], town.t[1])).translate(cx, y(h1 + 1.35), cz));
  }

  // --- the chapel over the street, on the town side (rebuilt 1828-30; its front as in the 1873 photograph) --------
  const C0 = -D, CD = 5, CW = 4.8, X1 = C0 - CD, TOP = 12.2, RISE = 3.9;
  {
    // the body, with the street's wide, low arch through it: span 7.7 m, rise 2.5 m, springing at 2.8 m [U]
    const c = 3.85, r = 2.5, sp = 2.8, R = (c * c + r * r) / (2 * r), oy = sp + r - R, a0 = Math.atan2(sp - oy, c);
    const sec = new THREE.Shape();
    sec.moveTo(-CW, -0.6); sec.lineTo(-c, -0.6); sec.lineTo(-c, sp); sec.absarc(0, oy, R, Math.PI - a0, a0, true); sec.lineTo(c, -0.6);
    sec.lineTo(CW, -0.6); sec.lineTo(CW, TOP); sec.lineTo(-CW, TOP); sec.closePath();
    const body = new THREE.ExtrudeGeometry(sec, { depth: CD, bevelEnabled: false, curveSegments: 18 });
    P.chapel.push(body.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, X1, 0, 1, 0, g0, -1, 0, 0, 0, 0, 0, 0, 1)));
    const front: Face = { c: [X1, 0], n: [-1, 0], t: [0, -1], len: 2 * CW };
    P.trim.push(fb(front, 0, 2 * CW + 0.2, 5.05, 5.4, 0.38));                   // the ledge over the arch, the lanterns on it
    for (const s of [-2.35, 2.35]) { const [lx, lz] = at(front, s, 0.25); P.iron.push(new THREE.BoxGeometry(0.26, 0.5, 0.26).translate(lx, y(5.7), lz)); }
    for (const [s, w] of [[-4.55, 0.5], [4.55, 0.5], [-2.35, 1.0], [2.35, 1.0]]) {   // pilasters, bases and capitals
      P.trim.push(fb(front, s, w, 5.4, 11.2, 0.18));
      P.trim.push(fb(front, s, w + 0.16, 5.4, 5.65, 0.26), fb(front, s, w + 0.22, 10.95, 11.2, 0.3));
    }
    P.trim.push(fb(front, 0, 2 * CW, 11.2, 11.55, 0.22), fb(front, 0, 2 * CW + 0.5, TOP - 0.3, TOP, 0.5));   // architrave, cornice
    // the windows: arched, the great one in the middle with its fanlight, the icon's gilt glimpsed through it
    const win = (s: number, w: number, h0: number, sp2: number) => {
      const sh = new THREE.Shape(); sh.moveTo(-w / 2, h0); sh.lineTo(w / 2, h0); sh.lineTo(w / 2, sp2); sh.absarc(0, sp2, w / 2, 0, Math.PI, false); sh.closePath();
      P.dark.push(onFace(front, sh, 0.02).applyMatrix4(new THREE.Matrix4().makeTranslation(...shift(front, s, 0))));
      const fr = new THREE.Shape(); fr.moveTo(-w / 2 - 0.16, h0 - 0.1); fr.lineTo(w / 2 + 0.16, h0 - 0.1); fr.lineTo(w / 2 + 0.16, sp2); fr.absarc(0, sp2, w / 2 + 0.16, 0, Math.PI, false); fr.closePath();
      fr.holes.push(new THREE.Path(sh.getPoints(16)));
      P.trim.push(onFace(front, fr, 0.1).applyMatrix4(new THREE.Matrix4().makeTranslation(...shift(front, s, 0))));
      P.trim.push(fb(front, s, w + 0.5, h0 - 0.22, h0 - 0.08, 0.2));             // sill
      for (const k of [-0.33, 0.33]) P.iron.push(fb(front, s + k * w, 0.05, h0, sp2, 0.04));   // glazing bars
      P.iron.push(fb(front, s, w, sp2 - 0.03, sp2 + 0.03, 0.04));
      for (let k = 1; k < 6; k++) {                                              // the fanlight's rays
        const a = (k / 6) * Math.PI, c = Math.cos(a), sn = Math.sin(a), r0 = 0.1, r1 = w / 2, hw = 0.025;
        const ray = new THREE.Shape([[r0, -hw], [r1, -hw], [r1, hw], [r0, hw]].map(([u, v]) => new THREE.Vector2(u * c - v * sn, sp2 + u * sn + v * c)));
        P.iron.push(onFace(front, ray, 0.04).applyMatrix4(new THREE.Matrix4().makeTranslation(...shift(front, s, 0))));
      }
    };
    win(0, 3.0, 5.7, 9.0);
    win(-3.6, 1.2, 5.7, 8.2); win(3.6, 1.2, 5.7, 8.2);
    const [ix, iz] = at(front, 0, 0.025);
    P.gilt.push(new THREE.CylinderGeometry(0.6, 0.6, 0.02, 20).rotateX(Math.PI / 2).scale(1, 1.5, 1).rotateY(Math.atan2(front.n[0], front.n[1])).translate(ix, y(7.6), iz));
    // the pediment, its raking cornices, a round in its tympanum [U]; the roof back to the tower
    const ped = new THREE.Shape([new THREE.Vector2(-CW - 0.1, TOP), new THREE.Vector2(CW + 0.1, TOP), new THREE.Vector2(0, TOP + RISE)]);
    P.chapel.push(onFace(front, ped, 0.6, -0.6));
    for (const k of [-1, 1]) {                                                   // raking cornices, foot to apex
      const [fx, fz] = at(front, k * (CW + 0.3), 0.1), [ax, az] = at(front, 0, 0.1);
      const a = new THREE.Vector3(fx, y(TOP), fz), b = new THREE.Vector3(ax, y(TOP + RISE + 0.15), az);
      const dir = b.clone().sub(a), L = dir.length(), xAxis = dir.normalize(), n3 = new THREE.Vector3(front.n[0], 0, front.n[1]), yAxis = n3.clone().cross(xAxis);
      P.trim.push(new THREE.BoxGeometry(L, 0.3, 0.5).applyMatrix4(new THREE.Matrix4().makeBasis(xAxis, yAxis, n3).setPosition(a.add(b).multiplyScalar(0.5))));
    }
    const [tx, tz] = at(front, 0, 0.04);
    P.trim.push(new THREE.TorusGeometry(0.45, 0.07, 8, 24).rotateY(Math.PI / 2).translate(tx, y(TOP + 1.35), tz));
    for (const k of [-1, 1]) {                                                   // two planes from the eaves to the ridge
      const pts = [new THREE.Vector3(X1 + 0.6, y(TOP), k * (CW + 0.35)), new THREE.Vector3(C0, y(TOP), k * (CW + 0.35)),
        new THREE.Vector3(C0, y(TOP + RISE + 0.1), 0), new THREE.Vector3(X1 + 0.6, y(TOP + RISE + 0.1), 0)];
      const g = new THREE.BufferGeometry().setFromPoints([pts[0], pts[1], pts[2], pts[0], pts[2], pts[3]]);
      g.computeVertexNormals();
      P.roof.push(g);
    }
  }

  // --- the city wall east of the gate (Fleury c. 1896): plain, plastered, about 7.5 m high, until a house today ---
  const segs: [number, number, number, number][] = [];
  {
    const wx = -3.0, T = 1.8, H = 7.5;
    let z = -HW, end = -HW;
    for (let k = 0; k < 16; k++) {
      const z1 = z - 3;
      const [ex, ez] = world(wx, z1);
      if ((o.data.buildings ?? []).some(b => inRing(ex, ez, b.rings[0]))) break;
      const [mx, mz] = world(wx, (z + z1) / 2), gz = o.terrain.heightAt(mx, mz);
      P.wall.push(new THREE.BoxGeometry(T, H + 0.8, 3.02).translate(wx, gz - 0.8 + (H + 0.8) / 2, (z + z1) / 2));
      P.trim.push(new THREE.BoxGeometry(T + 0.2, 0.25, 3.02).translate(wx, gz + H + 0.12, (z + z1) / 2));
      z = z1; end = z1;
    }
    if (end < -HW) for (const dx of [-T / 2, T / 2]) { const [ax, az] = world(wx + dx, -HW), [bx, bz] = world(wx + dx, end); segs.push([ax, az, bx, bz]); }
  }
  // the chapel's ground floor stops the walker either side of its arch
  for (const k of [-1, 1]) {
    const pts = [world(X1, k * 3.85), world(C0, k * 3.85), world(C0, k * CW), world(X1, k * CW)];
    for (let i = 0; i < 4; i++) { const a = pts[i], b = pts[(i + 1) % 4]; segs.push([a[0], a[1], b[0], b[1]]); }
  }

  const mats = o.mats;
  (mats.roof as THREE.MeshStandardMaterial).color.set('#5d5954');   // the chapel's roof, sheet metal [U]
  const add = (parts: THREE.BufferGeometry[], mat: THREE.Material, shadow = true) => {
    const list = parts.filter(g => g.getAttribute('position')?.count);
    if (!list.length) return;
    const m = new THREE.Mesh(merged(list.map(g => uvMetres(g).applyMatrix4(M))), mat);
    m.castShadow = shadow; m.receiveShadow = true;
    gate.solid.add(m);
  };
  add(P.render, mats.render); add(P.chapel, o.chapel.render); add(P.trim, mats.trim); add(P.roof, mats.roof);
  add(P.dark, mats.dark, false); add(P.iron, mats.iron); add(P.wall, mats.wall);
  add(P.gilt, new THREE.MeshStandardMaterial({ color: '#8a6d3b', roughness: 0.45, metalness: 0.55 }), false);
  return { ...gate, segments: [...gate.segments, ...segs] };
}

function inRing(x: number, z: number, r: XZ[]): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
