import * as THREE from 'three';
import type { Building, XZ } from './area';
import { mbox, merged, trianglesToGeometry } from './geom';

/*
 * St Casimir's Church. West front after the c.1900 photographs (the owner's reference), or with
 * variant '1800' the pre-1864 form; the body is simplified ("landmark-lite").
 * Sources (docs/REFERENCES.md §5): KVR 27304; OSM outline (way 29503660); national LiDAR
 * (eaves ~18 m, top ~56 m); the 1836 Januszewicz view and 1840 survey drawing for the
 * pre-1864 form: taller square west towers with clock stages and domed caps, a crown on
 * the dome lantern. Proportions of towers, drum and crown are conjecture (grade C).
 *
 * Local frame: origin at the middle of the west façade, +X east along the nave, +Z south.
 */

export interface ChurchMaterials {
  wall: THREE.Material;
  stone: THREE.Material;
  roof: THREE.Material;  // lead-grey sheet
  dome: THREE.Material;  // copper
  gilt: THREE.Material;  // crown and crosses
  dark: THREE.Material;  // window and door openings
}

/** Oriented bounding box of a ring: tries each edge direction, keeps the smallest area. */
function orientedBox(ring: XZ[]) {
  let best = { area: Infinity, ux: 1, uz: 0, min: [0, 0], max: [0, 0] };
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 2) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of ring) {
      const u = x * ux + z * uz, v = -x * uz + z * ux;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (area < best.area) best = { area, ux, uz, min: [u0, v0], max: [u1, v1] };
  }
  // Make u the long axis pointing east (+x).
  let { ux, uz } = best;
  let [u0, v0] = best.min, [u1, v1] = best.max;
  if (u1 - u0 < v1 - v0) {
    [ux, uz] = [-uz, ux];
    [u0, u1, v0, v1] = [v0, v1, -u1, -u0];
  }
  if (ux < 0) { ux = -ux; uz = -uz; [u0, u1] = [-u1, -u0]; [v0, v1] = [-v1, -v0]; }
  return { ux, uz, u0, u1, v0, v1 };
}

function gableRoof(x0: number, x1: number, halfW: number, y: number, rise: number, alongX: boolean): THREE.BufferGeometry {
  const p = (a: number, b: number, h: number) => (alongX ? new THREE.Vector3(a, h, b) : new THREE.Vector3(b, h, a));
  const r0 = p(x0, 0, y + rise), r1 = p(x1, 0, y + rise);
  return trianglesToGeometry([
    [p(x0, -halfW, y), r0, r1], [p(x0, -halfW, y), r1, p(x1, -halfW, y)],
    [p(x0, halfW, y), r1, r0], [p(x0, halfW, y), p(x1, halfW, y), r1],
  ]);
}

function gableEnd(x: number, halfW: number, y: number, rise: number, alongX: boolean): THREE.BufferGeometry {
  const shape = new THREE.Shape([new THREE.Vector2(-halfW, 0), new THREE.Vector2(halfW, 0), new THREE.Vector2(0, rise)]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false });
  g.translate(0, y, -0.25);
  if (alongX) g.rotateY(Math.PI / 2);
  g.translate(alongX ? x : 0, 0, alongX ? 0 : x);
  return g;
}

function arched(x: number, z: number, y: number, w: number, h: number, facing: 'x' | 'z'): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(w / 2, h - w / 2);
  shape.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
  shape.lineTo(-w / 2, 0);
  const g = new THREE.ShapeGeometry(shape, 8);
  if (facing === 'x') g.rotateY(-Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

export function buildStCasimir(b: Building, mats: ChurchMaterials, variant: 'photos' | '1800' = 'photos'): THREE.Group {
  const old = variant === '1800';
  const box = orientedBox(b.rings[0]);
  const L = box.u1 - box.u0, Wd = box.v1 - box.v0;
  const eave = b.eave;                         // LiDAR, ~18 m
  const nave = { x0: 7, x1: L - 11, half: Math.min(13, Wd / 2 - 3.5) };
  const xc = L * 0.63;                         // crossing, from the widest part of the outline
  const tHalf = 9;                             // transept half-width along the nave
  const roofRise = 8.5;

  const wall: THREE.BufferGeometry[] = [], stone: THREE.BufferGeometry[] = [], roof: THREE.BufferGeometry[] = [];
  const dome: THREE.BufferGeometry[] = [], gilt: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [];

  // Nave with aisles, and the transept
  wall.push(mbox(nave.x1 - nave.x0, eave + 2, nave.half * 2, (nave.x0 + nave.x1) / 2, eave / 2 - 1, 0));
  wall.push(mbox(tHalf * 2, eave + 2, Wd - 1, xc, eave / 2 - 1, (box.v0 + box.v1) / 2 - (box.v0 + box.v1) / 2));
  // Apse (half cylinder) at the east end
  const apseR = Math.min(9, nave.half - 1);
  const apse = new THREE.CylinderGeometry(apseR, apseR, eave - 2 + 2, 20, 1, false, 0, Math.PI);
  apse.translate(nave.x1, (eave - 2) / 2 - 1, 0);
  wall.push(apse);
  const apseRoof = new THREE.SphereGeometry(apseR + 0.3, 20, 8, 0, Math.PI, 0, Math.PI / 2);
  apseRoof.scale(1, 0.55, 1);
  apseRoof.translate(nave.x1, eave - 2, 0);
  roof.push(apseRoof);
  // Main cornice
  stone.push(mbox(nave.x1 - nave.x0 + 0.6, 0.7, nave.half * 2 + 0.8, (nave.x0 + nave.x1) / 2, eave - 0.35, 0));
  stone.push(mbox(tHalf * 2 + 0.8, 0.7, Wd - 0.2, xc, eave - 0.35, 0));

  // Gabled roofs (lead-grey sheet), gable ends
  roof.push(gableRoof(nave.x0, nave.x1, nave.half + 0.5, eave, roofRise, true));
  roof.push(gableRoof(-(Wd / 2 - 0.2), Wd / 2 - 0.2, tHalf + 0.5, eave, roofRise, false).translate(xc, 0, 0));
  for (const zEnd of [-(Wd / 2 - 0.5), Wd / 2 - 0.5]) {
    const g = gableEnd(0, tHalf, eave, roofRise, false);
    g.translate(xc, 0, zEnd);
    wall.push(g);
  }

  // --- West front, after the c.1900 photographs (Edition D. Visun No. 49C; stereo card 1822) ---------
  // The storeys, pilaster order, windows and niches are the 18th-century façade; the onion helms, the
  // central turret and the domed porch date from the 1864-68 rebuild (variant '1800' leaves them out).
  const W = Wd, towerW = 7.2, towerZ = W / 2 - towerW / 2;
  const T1 = 18.6, T2 = 29.6, T3 = 34.5;          // storey tops (photo 1 scaled to the 30 m façade)
  const inner = towerZ - towerW / 2;               // tower inner edge
  const fb = (list: THREE.BufferGeometry[], z: number, y0: number, y1: number, w: number, d: number, x = 0) =>
    list.push(mbox(d, y1 - y0, w, x - d / 2, (y0 + y1) / 2, z));
  // bodies: towers and the central section (tall enough to meet the nave roof)
  for (const sgn of [-1, 1]) wall.push(mbox(towerW, T3 + 1, towerW, towerW / 2, T3 / 2 - 0.5, sgn * towerZ));
  wall.push(mbox(8, T2 + 1, inner * 2, 4, T2 / 2 - 0.5, 0));
  // plinth, storey entablatures and cornices across the whole front
  fb(stone, 0, -1, 1.3, W + 0.6, 0.35);
  fb(stone, 0, T1 - 1.4, T1 - 0.6, W + 0.4, 0.45);          // frieze band
  fb(stone, 0, T1 - 0.6, T1, W + 1.2, 1.0);                 // cornice
  fb(stone, 0, T2 - 1.1, T2 - 0.5, W + 0.2, 0.4);
  fb(stone, 0, T2 - 0.5, T2, W + 0.9, 0.85);
  // paired pilasters with capitals, both storeys, at the tower edges and either side of the centre bay
  const pil = [-W / 2 + 0.6, -inner - 0.6, -inner + 0.6, -3.3, 3.3, inner - 0.6, inner + 0.6, W / 2 - 0.6];
  for (const z of pil) {
    for (const [y0, y1] of [[1.3, T1 - 1.4], [T1, T2 - 1.1]]) {
      fb(stone, z, y0, y1, 0.85, 0.32);
      fb(stone, z, y1 - 0.5, y1, 1.15, 0.45);               // capital
      fb(stone, z, y0, y0 + 0.4, 1.1, 0.42);                // base
    }
  }
  // lower storey: a round-headed window on each tower with a cartouche above; windows by the portal
  for (const sgn of [-1, 1]) {
    const z = sgn * towerZ;
    dark.push(arched(-0.36, z, 6.2, 2.0, 4.2, 'x'));
    stone.push(new THREE.SphereGeometry(0.75, 12, 8).scale(0.35, 1.25, 1).translate(-0.3, 13.8, z));   // cartouche
    fb(stone, z, 11.4, 11.7, 3.0, 0.25);                     // sill band
    dark.push(new THREE.PlaneGeometry(1.8, 3.2).rotateY(-Math.PI / 2).translate(-0.36, 12.2, sgn * 4.6));
    fb(stone, sgn * 4.6, 10.4, 10.6, 2.4, 0.3);
  }
  dark.push(arched(-0.36, 0, 0, 3.2, 7.0, 'x'));             // main portal
  // upper storey: tower windows and three niches with statues
  for (const [z, w, isNiche] of [[-towerZ, 2.1, false], [-5.4, 2.0, true], [0, 2.5, true], [5.4, 2.0, true], [towerZ, 2.1, false]] as [number, number, boolean][]) {
    const h = z === 0 ? 7.0 : 6.2, y0 = T1 + 1.6;
    if (isNiche) {
      stone.push(arched(-0.35, z, y0, w + 0.5, h + 0.3, 'x'));
      dark.push(arched(-0.37, z, y0 + 0.15, w, h, 'x'));
      // statue on a pedestal
      const sx = -0.75, base = y0 + 0.2, sh = z === 0 ? 3.0 : 2.5;
      stone.push(mbox(0.8, 0.6, 1.0, sx, base + 0.3, z));
      stone.push(new THREE.CylinderGeometry(0.34, 0.5, sh * 0.72, 10).translate(sx, base + 0.6 + sh * 0.36, z));
      stone.push(new THREE.SphereGeometry(0.28, 10, 8).translate(sx, base + 0.6 + sh * 0.8, z));
    } else {
      dark.push(arched(-0.36, z, y0, w, h, 'x'));
      fb(stone, z, y0 - 0.35, y0, w + 0.8, 0.35);
    }
  }
  // balustrade with urns over the centre, between towers and turret
  for (const sgn of [-1, 1]) {
    const za = sgn * 3.6, zb = sgn * (inner - 0.2);
    fb(stone, (za + zb) / 2, T2, T2 + 0.25, Math.abs(zb - za), 0.6, -0.1);
    fb(stone, (za + zb) / 2, T2 + 1.0, T2 + 1.2, Math.abs(zb - za), 0.6, -0.1);
    for (let z = Math.min(za, zb) + 0.3; z < Math.max(za, zb) - 0.2; z += 0.45) stone.push(new THREE.CylinderGeometry(0.1, 0.13, 0.75, 6).translate(-0.4, T2 + 0.62, z));
  }
  // tower top stages, helms, lanterns, crosses
  const onion = (r: number, h: number) => new THREE.LatheGeometry([
    [0, 0], [r * 0.86, 0], [r * 0.97, h * 0.12], [r, h * 0.28], [r * 0.92, h * 0.45], [r * 0.68, h * 0.62], [r * 0.4, h * 0.77],
    [r * 0.18, h * 0.9], [r * 0.08, h], [0, h * 1.02],
  ].map(([a, b]) => new THREE.Vector2(a, b)), 28);
  const baroqueCap = (r: number, h: number) => new THREE.LatheGeometry([
    [0, 0], [r, 0], [r * 1.02, h * 0.1], [r * 0.9, h * 0.32], [r * 0.62, h * 0.5], [r * 0.46, h * 0.6], [r * 0.5, h * 0.72],
    [r * 0.38, h * 0.86], [r * 0.2, h * 0.95], [0, h],
  ].map(([a, b]) => new THREE.Vector2(a, b)), 28);
  const cross = (x: number, y: number, z: number, hgt: number) => {
    gilt.push(mbox(0.16, hgt, 0.16, x, y + hgt / 2, z));
    gilt.push(mbox(0.14, 0.14, hgt * 0.45, x, y + hgt * 0.68, z));
    if (!old) {
      // Orthodox three-bar cross: titulus above, slanted foot bar below
      gilt.push(mbox(0.12, 0.12, hgt * 0.24, x, y + hgt * 0.86, z));
      gilt.push(mbox(0.12, 0.12, hgt * 0.3, 0, 0, 0).rotateX(0.38).translate(x, y + hgt * 0.3, z));
    }
  };
  for (const sgn of [-1, 1]) {
    const z = sgn * towerZ, cx = towerW / 2, sw = towerW - 1.2;
    wall.push(mbox(sw, T3 - T2 + 0.4, sw, cx, (T2 + T3) / 2, z));
    for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) stone.push(mbox(0.7, T3 - T2, 0.7, cx + (dx * sw) / 2, (T2 + T3) / 2, z + (dz * sw) / 2));
    stone.push(mbox(sw + 0.9, 0.7, sw + 0.9, cx, T3 + 0.05, z));
    for (const k of [0, 1, 2, 3]) {
      const a = (k * Math.PI) / 2, g = arched(0, 0, 0, 1.4, 3.2, 'x');
      g.rotateY(-a);
      g.translate(cx - Math.cos(a) * (sw / 2 + 0.02), T2 + 0.9, z + Math.sin(a) * (sw / 2 + 0.02));
      dark.push(g);
    }
    // urn finials on the corners of the storey below
    for (const dz of [-1, 1]) stone.push(new THREE.SphereGeometry(0.35, 10, 8).scale(1, 1.4, 1).translate(-0.3, T2 + 0.55, z + dz * (towerW / 2 - 0.4)));
    const drumTop = T3 + 1.2;
    wall.push(new THREE.CylinderGeometry(2.7, 2.9, 1.2, 24).translate(cx, T3 + 0.95, z));
    if (old) {
      dome.push(baroqueCap(3.1, 5.0).translate(cx, drumTop, z));
      wall.push(new THREE.CylinderGeometry(0.75, 0.85, 1.8, 10).translate(cx, drumTop + 5.6, z));
      dome.push(baroqueCap(0.95, 1.6).translate(cx, drumTop + 6.5, z));
      cross(cx, drumTop + 8.0, z, 2.0);
    } else {
      dome.push(onion(3.0, 4.6).translate(cx, drumTop, z));
      wall.push(new THREE.CylinderGeometry(0.7, 0.75, 1.7, 10).translate(cx, drumTop + 4.4, z));
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; dark.push(mbox(0.05, 0.9, 0.3, cx + Math.cos(a) * 0.71, drumTop + 4.4, z + Math.sin(a) * 0.71).rotateY(0)); }
      dome.push(onion(0.95, 1.7).translate(cx, drumTop + 5.25, z));
      cross(cx, drumTop + 6.9, z, 2.4);
    }
  }
  if (!old) {
    // central turret: window stage flanked by scrolls, bell dome, lantern, onion, cross (1864-68)
    const tw = 5.8, td = 4.2, cx = td / 2;
    wall.push(mbox(td, T3 + 1 - T2, tw, cx, (T2 + T3 + 1) / 2, 0));
    for (const dz of [-1, 1]) stone.push(mbox(0.5, T3 + 1 - T2, 0.6, -0.1, (T2 + T3 + 1) / 2, (dz * tw) / 2));
    dark.push(arched(-0.02, 0, T2 + 1.0, 1.8, 3.8, 'x'));
    stone.push(mbox(td + 0.9, 0.7, tw + 0.9, cx, T3 + 1.1, 0));
    for (const dz of [-1, 1]) {
      // scroll: a quarter-round sweep from the balustrade up to the turret side
      const sh = new THREE.Shape();
      sh.moveTo(0, 0); sh.lineTo(2.4, 0); sh.quadraticCurveTo(0.6, 0.4, 0.3, 3.4); sh.lineTo(0, 3.4); sh.lineTo(0, 0);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.7, bevelEnabled: false, curveSegments: 10 });
      g.translate(0, 0, -0.35);
      g.rotateY(dz > 0 ? -Math.PI / 2 : Math.PI / 2);
      g.translate(-0.2, T2, (dz * tw) / 2);
      stone.push(g);
      stone.push(new THREE.CylinderGeometry(0.45, 0.45, 0.72, 14).rotateX(Math.PI / 2).rotateY(Math.PI / 2).translate(-0.2, T2 + 0.45, dz * (tw / 2 + 2.2)));
    }
    const dy = T3 + 1.45;
    wall.push(new THREE.CylinderGeometry(3.0, 3.2, 1.3, 8).translate(cx, dy + 0.65, 0));
    dome.push(baroqueCap(3.7, 5.6).translate(cx, dy + 1.3, 0));
    wall.push(new THREE.CylinderGeometry(0.85, 0.9, 1.9, 10).translate(cx, dy + 7.2, 0));
    dome.push(onion(1.1, 2.0).translate(cx, dy + 8.15, 0));
    cross(cx, dy + 10.0, 0, 2.6);

    // domed porch on columns before the portal (1864-68)
    const px = -5.2, pw = 8.2, ph = 9.8;
    for (const dz of [-1, 1]) for (const zz of [pw / 2 - 0.5, pw / 2 - 1.5]) {
      stone.push(new THREE.CylinderGeometry(0.34, 0.38, ph - 1.6, 16).translate(px - 0.5, (ph - 1.6) / 2 + 0.6, dz * zz));
      stone.push(mbox(0.9, 0.6, 0.9, px - 0.5, 0.3, dz * zz));
      stone.push(mbox(0.95, 0.45, 0.95, px - 0.5, ph - 0.8, dz * zz));
    }
    for (const dz of [-1, 1]) wall.push(mbox(5.0, ph, 1.2, px + 2.5, ph / 2, (dz * (pw - 1.2)) / 2));      // side walls
    stone.push(mbox(6.4, 1.3, pw + 0.8, px + 2.3, ph + 0.35, 0));                                    // entablature
    stone.push(mbox(6.8, 0.4, pw + 1.2, px + 2.3, ph + 1.2, 0));
    wall.push(mbox(5.6, 1.2, pw - 0.6, px + 2.3, ph + 2.0, 0));                                      // attic
    const pd = new THREE.SphereGeometry(3.3, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.05, 1).translate(px + 2.3, ph + 2.6, 0);
    dome.push(pd);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const rib = new THREE.TorusGeometry(3.32, 0.06, 4, 12, Math.PI / 2).rotateZ(0).rotateY(-a);
      rib.translate(px + 2.3, ph + 2.6, 0);
      stone.push(rib);
    }
    wall.push(new THREE.CylinderGeometry(0.6, 0.65, 1.4, 10).translate(px + 2.3, ph + 6.5, 0));
    dome.push(onion(0.75, 1.3).translate(px + 2.3, ph + 7.2, 0));
    cross(px + 2.3, ph + 8.4, 0, 1.8);
    dark.push(arched(px - 0.02, 0, 0.3, 3.0, 5.6, 'x'));
    for (let k = 0; k < 4; k++) stone.push(mbox(0.45, 0.2, pw + 2.4 - k * 0.4, px - 1.0 - (3 - k) * 0.45, 0.1 + k * 0.2, 0));   // steps
  } else {
    // 1800: a curved gable with a cross over the centre bay
    const sh = new THREE.Shape();
    sh.moveTo(-inner + 0.3, 0); sh.lineTo(inner - 0.3, 0); sh.quadraticCurveTo(inner * 0.35, 1.2, 2.6, 3.6);
    sh.lineTo(-2.6, 3.6); sh.quadraticCurveTo(-inner * 0.35, 1.2, -inner + 0.3, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.2, bevelEnabled: false, curveSegments: 10 });
    g.rotateY(Math.PI / 2).translate(-0.3, T2, 0);
    wall.push(g);
    wall.push(mbox(1.2, 2.2, 5.2, 0.3, T2 + 4.7, 0));
    stone.push(mbox(1.6, 0.4, 5.8, 0.3, T2 + 5.9, 0));
    cross(0.3, T2 + 6.1, 0, 2.2);
  }

  // Side windows along the nave (tall, round-headed)
  for (let x = nave.x0 + 4; x < nave.x1 - 3; x += 6) {
    if (Math.abs(x - xc) < tHalf + 1.5) continue;
    for (const s of [-1, 1]) {
      const g = arched(0, 0, 0, 1.9, 6, 'z');
      if (s > 0) g.rotateY(Math.PI);
      g.translate(x, 6.5, s * (nave.half + 0.01));
      dark.push(g);
    }
  }

  // Crossing dome: drum, stepped dome, lantern, and the crown with orb and cross.
  // LiDAR max over the church is 56.1 m above ground; the drum height is set to reach it.
  const drumR = 8.5, drumTop = eave + 16;
  const drum = new THREE.CylinderGeometry(drumR, drumR, drumTop - eave + 2, 32);
  drum.translate(xc, (eave + drumTop) / 2 - 1, 0);
  wall.push(drum);
  stone.push(new THREE.CylinderGeometry(drumR + 0.5, drumR + 0.5, 0.6, 32).translate(xc, drumTop - 0.3, 0));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const g = arched(0, 0, 0, 1.4, 3.6, 'x');
    g.rotateY(-a);
    g.translate(xc + Math.cos(a) * (drumR + 0.02), eave + 6.5, Math.sin(a) * (drumR + 0.02));
    dark.push(g);
  }
  const step = new THREE.CylinderGeometry(drumR - 0.6, drumR, 1.8, 32);
  step.translate(xc, drumTop + 0.9, 0);
  dome.push(step);
  const cupola = new THREE.SphereGeometry(drumR - 0.6, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  cupola.translate(xc, drumTop + 1.8, 0);
  dome.push(cupola);
  const lanternBase = drumTop + 1.8 + (drumR - 0.6) - 0.5;
  wall.push(new THREE.CylinderGeometry(2.2, 2.4, 6, 16).translate(xc, lanternBase + 3, 0));
  dome.push(new THREE.SphereGeometry(2.5, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(xc, lanternBase + 6, 0));
  if (old) {
    // Crown: eight arched bands rising to an orb and cross
    const crownBase = lanternBase + 7.5;
    gilt.push(new THREE.TorusGeometry(2.4, 0.25, 8, 24).rotateX(Math.PI / 2).translate(xc, crownBase, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const band = new THREE.TorusGeometry(2.2, 0.16, 6, 16, Math.PI / 2);
      band.rotateY(-a);
      band.translate(xc, crownBase, 0);
      gilt.push(band);
    }
    gilt.push(new THREE.SphereGeometry(0.6, 12, 8).translate(xc, crownBase + 2.8, 0));
    gilt.push(mbox(0.2, 2.2, 0.2, xc, crownBase + 4.3, 0));
    gilt.push(mbox(0.2, 0.2, 1.2, xc, crownBase + 4.8, 0));
  } else {
    // onion helm with lantern and cross (1864-68)
    dome.push(onion(2.6, 4.2).translate(xc, lanternBase + 6.2, 0));
    cross(xc, lanternBase + 10.3, 0, 2.8);
  }

  const group = new THREE.Group();
  group.name = 'stcasimir';
  const add = (parts: THREE.BufferGeometry[], mat: THREE.Material, cast = true) => {
    if (!parts.length) return;
    const mesh = new THREE.Mesh(merged(parts.map(p => { if (!p.getAttribute('uv')) p.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.getAttribute('position').count * 2), 2)); return p; })), mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(wall, mats.wall);
  add(stone, mats.stone);
  add(roof, mats.roof);
  add(dome, mats.dome);
  add(gilt, mats.gilt);
  add(dark, mats.dark, false);

  // Place: origin at the west façade centre, +X along the nave (east)
  const cu = box.u0, cv = (box.v0 + box.v1) / 2;
  const ox = cu * box.ux - cv * box.uz, oz = cu * box.uz + cv * box.ux;
  group.position.set(ox, b.groundY, oz);
  group.rotation.y = Math.atan2(-box.uz, box.ux);
  return group;
}
