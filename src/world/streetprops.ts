import * as THREE from 'three';
import type { AreaData, Building, XZ } from './area';
import type { Terrain } from './terrain';
import type { FacadeAnchor } from './facades';
import type { FlowMap } from './flow';
import { townHallFrame, TOWN_HALL_SIZE } from './townhall';
import { worldTex } from './materials';
import { merged } from './geom';

/**
 * Street furniture c.1900, after the photographs of the square and Wielka (Didžioji) street: S. Fleury's
 * stereo views of 1900 and 1903, A. Dauksza's view down the street (1890s) and the postcards of 1901-15
 * (Wikimedia Commons, public domain).
 * - Flagstone pavements with granite kerbs along the house fronts of the square and the wide street
 *   (the photographs show them there; the narrow lanes keep cobbles to the wall and their gutters).
 *   Laid on the terrain mesh itself and only 3 cm proud, so walking needs no step.
 * - Granite guard stones at the jambs of the carriage gateways and at exposed house corners.
 * - Cast-iron plates carrying the downpipe water across the pavement to the kerb.
 * - Drain grates where the baked rain-flow map (flow.ts) collects water in a pit.
 * - An advertising column on the square, as on the 1901-14 postcard, pasted with theatre, circus and trade
 *   bills in the town's languages (Russian in the pre-1918 spelling, Polish, Lithuanian, Yiddish).
 * - The cab stand by the Town Hall garden: an enamel stand plate, a cast-iron pump and a horse trough,
 *   straw and droppings where the horses wait.
 * - Cast-iron garden benches along the promenade walks and round the basin.
 * - Goods set out at a few shop doors, a handcart by a gateway, a few wet leaves in the corners.
 * Everything is merged per material (a handful of draw calls). Knee-high props get 'low' collision
 * segments: they stop the walker but not the camera or the carts' route fitting (collision.ts).
 */

const PAVE_W = 1.7;       // pavement width, wall to kerb face (the photographs: about two paces)
const KERB_W = 0.26;      // granite kerb stone width
const PAVE_LIFT = 0.03;   // flag tops above the cobbles
const FRONTAGE = 12;      // open ground in front of a house for it to have a pavement (the square, Wielka)

// The promenade's layout (promenade.ts, which owns it): keep in step with it
const P_HALF = 14.3, P_WALK = 11.4, P_LENGTH = 140, P_SEND = P_LENGTH - P_HALF, P_SKEW = THREE.MathUtils.degToRad(3);
const P_GAPS: [number, number][] = [[43, 47], [88, 92]];

type Seg = [number, number, number, number, boolean];
export interface StreetProps {
  group: THREE.Group;
  /** Collision segments (ax, az, bx, bz, low). */
  segments: Seg[];
  /** Where things are, for screenshots and other streams (e.g. parking cabs at the stand). */
  spots: Record<string, number[][]>;
  stats: Record<string, number>;
}

// --- Materials ------------------------------------------------------------------------------------------

/** Granite: a speckle of feldspar, quartz and mica; the vertex colour carries the stone's tint. */
function speckleTexture(): THREE.CanvasTexture {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#a4a4a4'; g.fillRect(0, 0, S, S);
  const r = mulberry(7);
  for (let k = 0; k < 90; k++) {   // soft cloudy variation
    const x = r() * S, y = r() * S, rad = 10 + r() * 34, v = 150 + r() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(${v},${v},${v},0.35)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
    for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) { g.save(); g.translate(dx, dy); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore(); }
  }
  for (let k = 0; k < 5200; k++) {
    const x = r() * S, y = r() * S, q = r();
    const v = q < 0.45 ? 60 + r() * 40 : q < 0.8 ? 190 + r() * 50 : 140 + r() * 30;
    g.fillStyle = `rgb(${v},${v * (0.98 + r() * 0.03)},${v * (0.95 + r() * 0.04)})`;
    const s = 0.8 + r() * (q < 0.45 ? 1.6 : 2.4);
    g.fillRect(x, y, s, s * (0.6 + r() * 0.8));
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 0.45, 1 / 0.45);   // UVs are in metres: a 45 cm repeat
  t.anisotropy = 4;
  return t;
}

export function createStreetPropMaterials(anisotropy: number) {
  const posters = posterAtlas();
  return {
    stone: new THREE.MeshStandardMaterial({ map: speckleTexture(), normalMap: worldTex('plastered_wall_04', 'nor', false, anisotropy, 0.7), normalScale: new THREE.Vector2(0.8, 0.8), vertexColors: true, roughness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({
      map: worldTex('weathered_planks', 'diff', true, anisotropy, 1.1), normalMap: worldTex('weathered_planks', 'nor', false, anisotropy, 1.1),
      roughnessMap: worldTex('weathered_planks', 'rough', false, anisotropy, 1.1), vertexColors: true, roughness: 1,
    }),
    iron: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35 }),   // painted cast iron
    cloth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: worldTex('plastered_wall_04', 'diff', true, anisotropy, 0.25) }),
    litter: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
    poster: new THREE.MeshStandardMaterial({ map: posters.tex, roughness: 0.88 }),
    water: new THREE.MeshStandardMaterial({ color: '#1c2422', roughness: 0.05, metalness: 0.1 }),
  };
}
export type StreetPropMaterials = ReturnType<typeof createStreetPropMaterials>;

// --- Small helpers ------------------------------------------------------------------------------------

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash3(x: number, y: number, z: number): number { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const h = (i: number, j: number, k: number) => hash3(xi + i, yi + j, zi + k);
  return l(l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v), l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v), w);
}
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function inRing(x: number, z: number, r: XZ[]): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/**
 * Vertex colour: the base colour, darkened towards the foot (grime/damp up to `grime` m above the lowest
 * point) and mottled a little, so no two stones or boards are quite alike.
 */
function paint(g: THREE.BufferGeometry, c: THREE.ColorRepresentation, grime = 0, dark = 0.35, mottle = 0.07): THREE.BufferGeometry {
  const col = new THREE.Color(c), pos = g.getAttribute('position');
  let y0 = Infinity;
  for (let i = 0; i < pos.count; i++) y0 = Math.min(y0, pos.getY(i));
  const a = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = (grime > 0 ? 1 - dark * (1 - smooth(0, grime, y - y0)) : 1) * (1 + mottle * (vnoise(x * 7, y * 7, z * 7) - 0.5) * 2);
    a[i * 3] = col.r * k; a[i * 3 + 1] = col.g * k; a[i * 3 + 2] = col.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), EUL = new THREE.Euler(), V = new THREE.Vector3(), S1 = new THREE.Vector3();
/** Places a local-space part: yaw turns local +z towards (sin yaw, cos yaw); optional pitch/roll tilt it. */
function put(g: THREE.BufferGeometry, x: number, y: number, z: number, yaw = 0, s = 1, pitch = 0, roll = 0): THREE.BufferGeometry {
  EUL.set(pitch, yaw, roll, 'YXZ');
  return g.applyMatrix4(M4.compose(V.set(x, y, z), Q.setFromEuler(EUL), S1.set(s, s, s)));
}

/** A box with rounded edges (after three's RoundedBoxGeometry), UVs in metres. */
export function roundBox(w: number, h: number, d: number, r: number, seg = 1): THREE.BufferGeometry {
  const s = seg * 2 + 1, half = 0.5 / s;
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const g = new THREE.BoxGeometry(1, 1, 1, s, s, s);
  const pos = g.getAttribute('position') as THREE.BufferAttribute, nor = g.getAttribute('normal') as THREE.BufferAttribute, uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r, v = new THREE.Vector3(), n = new THREE.Vector3(), per = (s + 1) * (s + 1);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.set(v.x - Math.sign(v.x) * half, v.y - Math.sign(v.y) * half, v.z - Math.sign(v.z) * half).normalize();
    const px = hx * Math.sign(v.x) + n.x * r, py = hy * Math.sign(v.y) + n.y * r, pz = hz * Math.sign(v.z) + n.z * r;
    pos.setXYZ(i, px, py, pz); nor.setXYZ(i, n.x, n.y, n.z);
    const f = Math.floor(i / per);
    if (f < 2) uv.setXY(i, pz, py); else if (f < 4) uv.setXY(i, px, pz); else uv.setXY(i, px, py);
  }
  return g;
}

/** A lathe with UVs in metres (around the widest girth, along the profile). */
function lathe(profile: number[][], segs: number, phi0 = 0): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, segs, phi0);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute, P = pts.length;
  const rmax = Math.max(...profile.map(p => p[0])), cum = [0];
  for (let j = 1; j < P; j++) cum.push(cum[j - 1] + pts[j].distanceTo(pts[j - 1]));
  for (let i = 0; i <= segs; i++) for (let j = 0; j < P; j++) uv.setXY(i * P + j, (i / segs) * Math.PI * 2 * rmax, cum[j]);
  return g;
}

/** Hand-hewn: pushes vertices in and out along their horizontal direction by a smooth noise. */
function hewn(g: THREE.BufferGeometry, amp: number, freq: number, seed: number): THREE.BufferGeometry {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const k = 1 + (amp / r) * (vnoise(x * freq + seed, y * freq, z * freq - seed) - 0.5) * 2;
    pos.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function tube(points: number[][], r: number, radial = 6, perPoint = 5): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return new THREE.TubeGeometry(curve, Math.max(4, points.length * perPoint), r, radial, false);
}

/** Collects parts per material slot and merges them into one mesh each. */
class Bags {
  private parts = new Map<string, THREE.BufferGeometry[]>();
  add(key: string, g: THREE.BufferGeometry): void {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    let list = this.parts.get(key);
    if (!list) this.parts.set(key, (list = []));
    list.push(g);
  }
  meshes(slots: Record<string, [THREE.Material, boolean]>, stats: Record<string, number>): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [key, list] of this.parts) {
      const [mat, cast] = slots[key];
      const g = merged(list);
      g.computeBoundingSphere();
      stats.triangles = (stats.triangles ?? 0) + g.getAttribute('position').count / 3;
      const m = new THREE.Mesh(g, mat);
      m.name = `street-${key}`;
      m.castShadow = cast; m.receiveShadow = true;
      out.push(m);
    }
    return out;
  }
}

/**
 * A slab on four ground corners with a chamfered top: tops[i] is the height of corner i, `bottom` its
 * underside. Faces are wound by their expected direction, so the corner order only has to go round.
 */
function slab(c: number[][], tops: number[], bottom: number, ch: number): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const cx = (c[0][0] + c[1][0] + c[2][0] + c[3][0]) / 4, cz = (c[0][1] + c[1][1] + c[2][1] + c[3][1]) / 4;
  const inner = c.map((p, i) => {
    const q = c[(i + 1) % 4], o = c[(i + 3) % 4];
    const d1x = q[0] - p[0], d1z = q[1] - p[1], l1 = Math.hypot(d1x, d1z) || 1, d2x = o[0] - p[0], d2z = o[1] - p[1], l2 = Math.hypot(d2x, d2z) || 1;
    return [p[0] + (d1x / l1 + d2x / l2) * ch, p[1] + (d1z / l1 + d2z / l2) * ch];
  });
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const quad = (a: THREE.Vector3, b: THREE.Vector3, cc: THREE.Vector3, d: THREE.Vector3, ex: number, ey: number, ez: number, side: boolean) => {
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(d, a));
    if (n.x * ex + n.y * ey + n.z * ez < 0) { const t = b.clone(); b = d; d = t; n.negate(); }
    n.normalize();
    const along = side ? Math.hypot(b.x - a.x, b.z - a.z) : 0;
    for (const [p, k] of [[a, 0], [b, 1], [cc, 2], [a, 0], [cc, 2], [d, 3]] as [THREE.Vector3, number][]) {
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z);
      if (side) uv.push(k === 1 || k === 2 ? along : 0, p.y); else uv.push(p.x, p.z);
    }
  };
  quad(A.set(inner[0][0], tops[0], inner[0][1]), B.set(inner[1][0], tops[1], inner[1][1]), C.set(inner[2][0], tops[2], inner[2][1]), D.set(inner[3][0], tops[3], inner[3][1]), 0, 1, 0, false);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const ox = (c[i][0] + c[j][0]) / 2 - cx, oz = (c[i][1] + c[j][1]) / 2 - cz;
    quad(A.set(c[i][0], tops[i] - ch, c[i][1]), B.set(c[j][0], tops[j] - ch, c[j][1]), C.set(inner[j][0], tops[j], inner[j][1]), D.set(inner[i][0], tops[i], inner[i][1]), ox, 0.7, oz, false);
    quad(A.set(c[i][0], bottom, c[i][1]), B.set(c[j][0], bottom, c[j][1]), C.set(c[j][0], tops[j] - ch, c[j][1]), D.set(c[i][0], tops[i] - ch, c[i][1]), ox, 0, oz, true);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Heights of the terrain mesh itself (main.ts builds it from heightAt on a regular grid), for flush paving. */
export interface GroundGrid { cx: number; cz: number; size: number; step: number }
function meshHeight(terrain: Terrain, grid: GroundGrid): (x: number, z: number) => number {
  const x0 = grid.cx - grid.size / 2, z0 = grid.cz - grid.size / 2, st = grid.step, cache = new Map<number, number>();
  const hv = (i: number, j: number) => {
    const k = i * 100003 + j;
    let h = cache.get(k);
    if (h === undefined) cache.set(k, (h = terrain.heightAt(x0 + i * st, z0 + j * st)));
    return h;
  };
  // PlaneGeometry splits each cell along the (0,1)-(1,0) diagonal
  return (x, z) => {
    const fx = (x - x0) / st, fz = (z - z0) / st, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const h00 = hv(i, j), h10 = hv(i + 1, j), h01 = hv(i, j + 1), h11 = hv(i + 1, j + 1);
    return u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  };
}

// --- Prop geometry (local space: y up from the ground, front towards +z) --------------------------------

/** A cooper's barrel: bulging staves, recessed heads, four iron hoops. */
export function barrelParts(H = 0.86, R = 0.3): { wood: THREE.BufferGeometry; iron: THREE.BufferGeometry } {
  const r = (y: number) => R * (1 - 0.13 * (2 * y / H - 1) ** 2);
  const prof: number[][] = [[0, 0.035], [r(0) - 0.028, 0.035], [r(0) - 0.02, 0]];
  for (let k = 0; k <= 10; k++) prof.push([r((k / 10) * H), (k / 10) * H]);
  prof.push([r(H) - 0.02, H], [r(H) - 0.028, H - 0.035], [0, H - 0.035]);
  const wood = lathe(prof, 22);
  const hoops = [0.07, 0.24, H - 0.24, H - 0.07].map(y => lathe([[r(y) - 0.002, y - 0.022], [r(y) + 0.006, y - 0.02], [r(y) + 0.006, y + 0.02], [r(y) - 0.002, y + 0.022]], 22));
  return { wood, iron: merged(hoops) };
}

/** A slatted crate. */
function crateParts(w: number, h: number, d: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [], t = 0.018, p = 0.035;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(roundBox(p, h, p, 0.006).translate(sx * (w / 2 - p / 2), h / 2, sz * (d / 2 - p / 2)));
  const rows = Math.max(2, Math.round(h / 0.11));
  for (let k = 0; k < rows; k++) {
    const y = 0.03 + (k + 0.5) * ((h - 0.06) / rows);
    const sh = (h - 0.06) / rows - 0.022;
    for (const sz of [-1, 1]) parts.push(roundBox(w - 0.01, sh, t, 0.005).translate(0, y, sz * (d / 2 - t / 2 + 0.004)));
    for (const sx of [-1, 1]) parts.push(roundBox(t, sh, d - 2 * p, 0.005).translate(sx * (w / 2 - t / 2 + 0.004), y, 0));
  }
  parts.push(roundBox(w - 0.02, t, d - 0.02, 0.005).translate(0, t / 2 + 0.01, 0));
  return merged(parts);
}

/** A filled sack, tied at the neck, slumped. */
function sackGeometry(seed: number, R = 0.22): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(R, 12, 10);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = y / R;                             // -1 bottom .. 1 top
    const girth = t > 0.45 ? 1 - (t - 0.45) * 1.25 : 1 + 0.12 * (1 - Math.abs(t + 0.2));
    const bump = 1 + 0.08 * (vnoise(x * 9 + seed, y * 9, z * 9) - 0.5);
    x *= girth * bump * 1.05; z *= girth * bump * 0.85;
    y = (t < -0.55 ? -0.55 * R : y) * 1.35 + R * 0.74;
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** A garden bench: cast-iron scrolled ends, four seat slats and three back slats. */
function benchParts(): { iron: THREE.BufferGeometry; wood: THREE.BufferGeometry } {
  const iron: THREE.BufferGeometry[] = [], wood: THREE.BufferGeometry[] = [];
  for (const x of [-0.78, 0.78]) {
    const at = (pts: number[][]) => pts.map(([z, y]) => [x, y, z]);
    iron.push(tube(at([[0.27, 0.05], [0.25, 0.01], [0.21, 0.0], [0.2, 0.08], [0.21, 0.25], [0.23, 0.44]]), 0.02));        // front leg with a scroll foot
    iron.push(tube(at([[-0.29, 0.0], [-0.25, 0.12], [-0.21, 0.3], [-0.2, 0.44], [-0.24, 0.62], [-0.3, 0.84], [-0.28, 0.9]]), 0.02)); // back leg and back
    iron.push(tube(at([[0.24, 0.43], [0.05, 0.445], [-0.2, 0.45]]), 0.018));                                              // seat rail
    iron.push(tube(at([[-0.25, 0.64], [-0.05, 0.67], [0.15, 0.66], [0.27, 0.62], [0.28, 0.56], [0.23, 0.55], [0.22, 0.48]]), 0.017)); // arm with scroll
  }
  for (const z of [0.18, 0.07, -0.04, -0.15]) wood.push(roundBox(1.9, 0.03, 0.09, 0.012).translate(0, 0.475, z));
  for (const [y, z] of [[0.6, -0.235], [0.7, -0.262], [0.8, -0.29]]) wood.push(put(roundBox(1.9, 0.08, 0.026, 0.01), 0, y, z, 0, 1, -0.22));
  return { iron: merged(iron), wood: merged(wood) };
}

/** A two-wheeled handcart, resting on its handles. */
function handcartParts(): { wood: THREE.BufferGeometry; iron: THREE.BufferGeometry } {
  const wood: THREE.BufferGeometry[] = [], iron: THREE.BufferGeometry[] = [];
  const Rw = 0.42, tilt = Math.atan2(Rw + 0.1 - 0.05, 1.6);   // bed rests on the axle at the back, handles on the ground
  const bed: THREE.BufferGeometry[] = [];
  bed.push(roundBox(0.78, 0.03, 1.15, 0.01).translate(0, 0, 0));
  for (const x of [-0.39, 0.39]) bed.push(roundBox(0.03, 0.22, 1.15, 0.01).translate(x, 0.11, 0));
  bed.push(roundBox(0.78, 0.22, 0.03, 0.01).translate(0, 0.11, -0.575));
  for (const x of [-0.33, 0.33]) bed.push(roundBox(0.05, 0.05, 2.1, 0.015).translate(x, -0.035, 0.35));
  const bedG = merged(bed);
  put(bedG, 0, Rw + 0.06, -0.35, 0, 1, tilt);
  wood.push(bedG);
  for (const x of [-0.46, 0.46]) {
    const parts = [lathe([[Rw - 0.035, -0.022], [Rw, -0.022], [Rw, 0.022], [Rw - 0.035, 0.022]], 26).rotateZ(Math.PI / 2)];
    for (let k = 0; k < 10; k++) parts.push(roundBox(0.02, Rw * 2 - 0.06, 0.03, 0.008).rotateX((k * Math.PI) / 10));
    parts.push(lathe([[0.001, -0.07], [0.06, -0.06], [0.07, 0], [0.06, 0.06], [0.001, 0.07]], 12).rotateZ(Math.PI / 2));
    wood.push(merged(parts).translate(x, Rw, -0.55));
    iron.push(lathe([[Rw - 0.002, -0.024], [Rw + 0.008, -0.022], [Rw + 0.008, 0.022], [Rw - 0.002, 0.024]], 26).rotateZ(Math.PI / 2).translate(x, Rw, -0.55));
  }
  iron.push(roundBox(0.95, 0.035, 0.035, 0.01).translate(0, Rw, -0.55));
  return { wood: merged(wood), iron: merged(iron) };
}

// --- The advertising column and its bills ----------------------------------------------------------------

/** Canvas atlas: the column's bills (a band wrapping the drum) and the cab-stand plate. */
interface PosterAtlas { tex: THREE.CanvasTexture; band: number[]; plate: number[] }
let atlasCache: PosterAtlas | null = null;
function posterAtlas(): PosterAtlas {
  if (atlasCache) return atlasCache;
  const W = 1536, H = 1280, BH = 1100;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const r = mulberry(1900);
  // the drum under the bills: old paste and scraps
  g.fillStyle = '#6d6452'; g.fillRect(0, 0, W, BH);
  for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(${200 + r() * 40},${190 + r() * 40},${160 + r() * 40},${0.25 + r() * 0.3})`; g.fillRect(r() * W, r() * BH, 30 + r() * 160, 20 + r() * 200); }
  const SERIF = '"Times New Roman", Times, "Liberation Serif", "DejaVu Serif", serif';
  const SANS = '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif';
  // one centred line, squeezed to fit (period bills were set in condensed faces)
  const line = (text: string, cx: number, y: number, size: number, o: { f?: string; b?: boolean; i?: boolean; col?: string; maxW: number; sq?: number }) => {
    g.font = `${o.i ? 'italic ' : ''}${o.b ? 'bold ' : ''}${size}px ${o.f ?? SERIF}`;
    g.fillStyle = o.col ?? '#1d1a17';
    const w = g.measureText(text).width, k = Math.min(o.sq ?? 1, o.maxW / w);
    g.save(); g.translate(cx, y); g.scale(k, 1); g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(text, 0, 0); g.restore();
  };
  const rule = (x0: number, x1: number, y: number, thick = 3, col = '#1d1a17') => { g.fillStyle = col; g.fillRect(x0, y, x1 - x0, thick); g.fillRect(x0, y + thick + 3, x1 - x0, 1.2); };
  // a bill: torn paper, printed content, then weather (fading, damp at the foot, streaks)
  const bill = (x: number, y: number, w: number, h: number, paper: string, draw: (w: number, h: number) => void, tilt = 0) => {
    for (const dx of x + w > W ? [0, -W] : x < 0 ? [0, W] : [0]) {
      g.save();
      g.translate(x + dx + w / 2, y + h / 2); g.rotate(tilt); g.translate(-w / 2, -h / 2);
      g.beginPath();
      const jag = (n: number, ax: number, ay: number, bx: number, by: number) => { for (let k = 0; k <= n; k++) { const t = k / n; g.lineTo(ax + (bx - ax) * t + (r() - 0.5) * 3, ay + (by - ay) * t + (r() - 0.5) * 3); } };
      // a torn-off corner now and then
      const tear = r() < 0.45, th = tear ? 30 + r() * 60 : 0, tw = tear ? 20 + r() * 70 : 0;
      g.moveTo(0, 0); jag(12, 0, 0, w, 0); jag(16, w, 0, w, h - th);
      if (tear) jag(5, w, h - th, w - tw, h);
      jag(12, w - tw, h, 0, h); jag(16, 0, h, 0, 0);
      g.closePath();
      g.save(); g.clip();
      g.fillStyle = paper; g.fillRect(-5, -5, w + 10, h + 10);
      draw(w, h);
      // weather: uneven fading, damp rising, paste wrinkles, rain runs
      for (let k = 0; k < 7; k++) { const gx = r() * w, gy = r() * h, gr = g.createRadialGradient(gx, gy, 0, gx, gy, 40 + r() * 90); gr.addColorStop(0, `rgba(240,230,200,${0.12 + r() * 0.15})`); gr.addColorStop(1, 'rgba(240,230,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
      const damp = g.createLinearGradient(0, h * 0.7, 0, h); damp.addColorStop(0, 'rgba(70,55,35,0)'); damp.addColorStop(1, 'rgba(70,55,35,0.35)'); g.fillStyle = damp; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 10; k++) { g.strokeStyle = `rgba(60,50,35,${0.05 + r() * 0.07})`; g.lineWidth = 1 + r() * 2; g.beginPath(); const sx = r() * w; g.moveTo(sx, r() * h * 0.3); g.lineTo(sx + (r() - 0.5) * 8, h); g.stroke(); }
      for (let k = 0; k < 5; k++) { g.strokeStyle = `rgba(255,250,235,${0.15 + r() * 0.15})`; g.lineWidth = 1; g.beginPath(); const sy = r() * h; g.moveTo(0, sy); g.bezierCurveTo(w * 0.3, sy + (r() - 0.5) * 30, w * 0.6, sy + (r() - 0.5) * 30, w, sy + (r() - 0.5) * 20); g.stroke(); }
      g.restore();
      g.strokeStyle = 'rgba(40,32,22,0.35)'; g.lineWidth = 1.5; g.stroke();
      g.restore();
    }
  };
  const INK = '#1d1a17', RED = '#9a2a20', BLUE = '#27365a';

  // Row 1 (upper), then row 2 pasted over its lower edge
  bill(20, 30, 300, 520, '#e8dcc0', (w, h) => {        // the city theatre (the Town Hall was the theatre c.1900)
    rule(18, w - 18, 20);
    line('ГОРОДСКОЙ', w / 2, 82, 50, { b: true, maxW: w - 30, sq: 0.8 });
    line('ТЕАТРЪ', w / 2, 142, 64, { b: true, maxW: w - 30, sq: 0.8 });
    line('Въ Субботу, 24 Іюня', w / 2, 180, 21, { i: true, maxW: w - 40 });
    rule(40, w - 40, 196, 2);
    line('представлено будетъ', w / 2, 232, 20, { maxW: w - 40 });
    line('РЕВИЗОРЪ', w / 2, 300, 62, { b: true, col: RED, maxW: w - 24, sq: 0.72 });
    line('комедія въ 5 дѣйствіяхъ', w / 2, 340, 22, { maxW: w - 40 });
    line('соч. Н. В. Гоголя', w / 2, 370, 22, { i: true, maxW: w - 40 });
    rule(40, w - 40, 392, 2);
    line('Начало въ 8 час. вечера', w / 2, 432, 24, { b: true, maxW: w - 40 });
    line('Цѣны мѣстамъ обыкновенныя', w / 2, 466, 18, { maxW: w - 40 });
    rule(18, w - 18, h - 30);
  }, -0.01);
  bill(345, 50, 360, 470, '#dcb95a', (w) => {          // the circus
    g.fillStyle = RED; g.fillRect(0, 0, w, 16);
    line('ЦИРКЪ', w / 2, 128, 120, { b: true, col: RED, maxW: w - 20, sq: 0.7 });
    line('Сегодня и ежедневно', w / 2, 172, 26, { i: true, maxW: w - 40 });
    line('БОЛЬШОЕ', w / 2, 232, 50, { b: true, f: SANS, maxW: w - 40, sq: 0.65 });
    line('ПРЕДСТАВЛЕНІЕ', w / 2, 282, 44, { b: true, f: SANS, maxW: w - 30, sq: 0.62 });
    // a rearing horse, cut in black
    g.save(); g.translate(w / 2, 390); g.fillStyle = INK;
    g.beginPath(); g.ellipse(0, 0, 58, 24, -0.25, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(40, -18); g.lineTo(62, -62); g.lineTo(80, -70); g.lineTo(84, -58); g.lineTo(70, -50); g.lineTo(58, -8); g.fill();
    for (const [lx, ly, ex, ey] of [[-40, 10, -52, 58], [-22, 16, -26, 60], [30, 8, 58, 38], [40, 0, 70, 20]]) { g.lineWidth = 9; g.strokeStyle = INK; g.beginPath(); g.moveTo(lx, ly); g.lineTo(ex, ey); g.stroke(); }
    g.beginPath(); g.moveTo(-56, -6); g.quadraticCurveTo(-96, 0, -88, 40); g.lineWidth = 7; g.stroke();
    g.restore();
    line('дрессированныя лошади · клоуны · акробаты', w / 2, 452, 18, { maxW: w - 30 });
  }, 0.012);
  bill(735, 24, 280, 400, '#cfd4bb', (w, h) => {         // Polish opera: Moniuszko's Halka
    g.strokeStyle = BLUE; g.lineWidth = 4; g.strokeRect(12, 12, w - 24, h - 24); g.lineWidth = 1.5; g.strokeRect(20, 20, w - 40, h - 40);
    line('TEATR POLSKI', w / 2, 72, 32, { b: true, col: BLUE, maxW: w - 50 });
    line('Dziś', w / 2, 112, 24, { i: true, maxW: w - 50 });
    line('HALKA', w / 2, 190, 76, { b: true, maxW: w - 50, sq: 0.8 });
    line('opera w 4 aktach', w / 2, 232, 22, { maxW: w - 50 });
    line('St. Moniuszki', w / 2, 262, 24, { i: true, maxW: w - 50 });
    line('Początek o godz. 8 wiecz.', w / 2, 330, 19, { maxW: w - 50 });
  }, -0.006);
  bill(1040, 40, 250, 330, '#e6e2d4', (w) => {           // Lithuanian evening (after the press ban was lifted in 1904)
    line('LIETUVIŲ', w / 2, 60, 40, { b: true, maxW: w - 30, sq: 0.8 });
    line('VAKARAS', w / 2, 104, 40, { b: true, maxW: w - 30, sq: 0.8 });
    rule(30, w - 30, 120, 2);
    line('Rodoma', w / 2, 158, 20, { i: true, maxW: w - 40 });
    line('«BIRUTĖ»', w / 2, 212, 46, { b: true, col: RED, maxW: w - 30, sq: 0.8 });
    line('M. Petrausko opera', w / 2, 250, 20, { maxW: w - 40 });
    line('Pradžia 7 val. vakare', w / 2, 296, 18, { maxW: w - 40 });
  }, 0.01);
  bill(1300, 60, 250, 380, '#d8b8a6', (w, h) => {        // cigarettes (wraps round the seam)
    g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(14, 14, w - 28, h - 28);
    g.beginPath(); g.ellipse(w / 2, 160, 90, 64, 0, 0, Math.PI * 2); g.lineWidth = 2; g.stroke();
    line('ПАПИРОСЫ', w / 2, 70, 38, { b: true, f: SANS, maxW: w - 40, sq: 0.7 });
    line('№ 6', w / 2, 178, 54, { b: true, col: RED, maxW: 150 });
    line('ВЫСШІЙ СОРТЪ', w / 2, 270, 26, { b: true, maxW: w - 40, sq: 0.8 });
    line('10 шт. — 6 коп.', w / 2, 316, 24, { maxW: w - 40 });
  }, -0.015);
  // row 2
  bill(-60, 530, 330, 440, '#f0ead8', (w, h) => {        // official notice: small, dense print
    line('ОБЯЗАТЕЛЬНОЕ', w / 2, 48, 30, { b: true, maxW: w - 30, sq: 0.85 });
    line('ПОСТАНОВЛЕНІЕ', w / 2, 84, 30, { b: true, maxW: w - 30, sq: 0.85 });
    line('Виленскаго Городского Управленія', w / 2, 112, 16, { i: true, maxW: w - 40 });
    g.fillStyle = 'rgba(29,26,23,0.55)';
    for (let y = 134; y < h - 40; y += 11) { let x = 24; while (x < w - 30) { const ww = 8 + r() * 34; g.fillRect(x, y, Math.min(ww, w - 24 - x), 4); x += ww + 5; } if (r() < 0.12) y += 8; }
  }, 0.004);
  bill(300, 560, 380, 480, '#b9c3c3', (w, h) => {        // beer
    g.fillStyle = BLUE; g.fillRect(0, 0, w, 70); g.fillRect(0, h - 50, w, 50);
    line('ВИЛЕНСКІЙ', w / 2, 52, 40, { b: true, col: '#e8e0c8', f: SANS, maxW: w - 30, sq: 0.7 });
    line('ПИВО', w / 2, 210, 130, { b: true, col: RED, maxW: w - 30, sq: 0.66 });
    line('Мартовское · Баварское', w / 2, 262, 26, { i: true, maxW: w - 40 });
    line('Пивоваренный заводъ', w / 2, 330, 28, { b: true, maxW: w - 40 });
    line('въ Вильнѣ', w / 2, 364, 26, { maxW: w - 40 });
    line('Складъ: Большая ул.', w / 2, h - 18, 22, { col: '#e8e0c8', maxW: w - 40 });
  }, -0.008);
  bill(700, 450, 300, 360, '#e2d3a8', (w) => {          // a Yiddish concert bill, Russian beneath
    line('קאָנצערט', w / 2, 96, 64, { b: true, f: `"Arial Hebrew", "Times New Roman", "David", ${SERIF}`, maxW: w - 30 });
    rule(30, w - 30, 120, 2);
    line('КОНЦЕРТЪ', w / 2, 172, 42, { b: true, maxW: w - 40, sq: 0.8 });
    line('въ Городскомъ саду', w / 2, 212, 22, { i: true, maxW: w - 40 });
    line('Оркестръ · Хоръ', w / 2, 256, 24, { maxW: w - 40 });
    line('Начало въ 7½ ч.', w / 2, 310, 22, { b: true, maxW: w - 40 });
  }, 0.018);
  bill(1010, 400, 300, 330, '#ece6d6', (w) => {          // a sale
    line('ДЕШЕВАЯ', w / 2, 70, 50, { b: true, f: SANS, maxW: w - 30, sq: 0.66 });
    line('РАСПРОДАЖА', w / 2, 124, 44, { b: true, f: SANS, col: RED, maxW: w - 30, sq: 0.62 });
    line('обуви, кожъ и галантереи', w / 2, 170, 20, { maxW: w - 40 });
    line('Нѣмецкая ул., № 12', w / 2, 230, 24, { i: true, maxW: w - 40 });
    line('Цѣны внѣ конкуренціи!', w / 2, 290, 22, { b: true, maxW: w - 40 });
  }, -0.012);
  bill(1320, 470, 240, 300, '#e9e1c9', (w) => {          // a flat to let (Polish)
    line('DO WYNAJĘCIA', w / 2, 60, 30, { b: true, maxW: w - 30, sq: 0.85 });
    line('mieszkanie', w / 2, 104, 26, { i: true, maxW: w - 40 });
    line('z 4 pokoi i kuchni', w / 2, 140, 22, { maxW: w - 40 });
    line('Wiadomość u stróża', w / 2, 200, 20, { maxW: w - 40 });
  }, 0.02);
  bill(40, 880, 360, 230, '#d9c7a0', (w) => {           // a steamship line, a strip along the foot
    line('ПАРОХОДСТВО', w / 2, 70, 44, { b: true, f: SANS, maxW: w - 30, sq: 0.66 });
    line('Рига · Либава · Нью-Йоркъ', w / 2, 118, 26, { maxW: w - 40 });
    line('Билеты въ конторѣ', w / 2, 160, 20, { i: true, maxW: w - 40 });
  }, 0.006);
  bill(640, 830, 420, 260, '#eee6cf', (w) => {           // a ball
    g.strokeStyle = RED; g.lineWidth = 3; g.strokeRect(10, 10, w - 20, 240);
    line('БАЛЪ', w / 2, 96, 84, { b: true, col: RED, maxW: w - 40, sq: 0.8 });
    line('въ пользу бѣдныхъ города Вильны', w / 2, 146, 22, { i: true, maxW: w - 40 });
    line('въ залѣ Городской Думы', w / 2, 184, 22, { maxW: w - 40 });
  }, -0.01);
  bill(1080, 740, 300, 340, '#c9ccb4', (w) => {
    line('ЧАЙ', w / 2, 120, 110, { b: true, maxW: w - 40, sq: 0.8 });
    line('развѣсной и въ пачкахъ', w / 2, 172, 22, { i: true, maxW: w - 40 });
    line('Торговля М. Блехера', w / 2, 230, 24, { b: true, maxW: w - 40 });
  }, 0.01);
  // grime along the foot of the band, where the street splashes it
  const foot = g.createLinearGradient(0, BH - 160, 0, BH); foot.addColorStop(0, 'rgba(60,48,32,0)'); foot.addColorStop(1, 'rgba(60,48,32,0.55)');
  g.fillStyle = foot; g.fillRect(0, 0, W, BH);

  // the cab-stand plate: blue enamel, white letters, chipped
  const px = 0, py = BH + 20, pw = 480, ph = 150;
  g.fillStyle = '#e8e4da'; g.fillRect(px, py, pw, ph);
  g.fillStyle = '#1f3766'; g.fillRect(px + 8, py + 8, pw - 16, ph - 16);
  g.strokeStyle = '#e8e4da'; g.lineWidth = 3; g.strokeRect(px + 16, py + 16, pw - 32, ph - 32);
  line('БИРЖА', px + pw / 2, py + 66, 40, { b: true, f: SANS, col: '#ece8dc', maxW: pw - 60, sq: 0.9 });
  line('ИЗВОЗЧИКОВЪ', px + pw / 2, py + 116, 40, { b: true, f: SANS, col: '#ece8dc', maxW: pw - 60, sq: 0.8 });
  for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(25,22,20,${0.5 + r() * 0.4})`; g.beginPath(); g.arc(px + r() * pw, py + (r() < 0.5 ? r() * 20 : ph - r() * 20), 2 + r() * 5, 0, Math.PI * 2); g.fill(); }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  atlasCache = { tex, band: [0, 1 - BH / H, 1, 1], plate: [px / W, 1 - (py + ph) / H, (px + pw) / W, 1 - py / H] };
  return atlasCache;
}

// --- Building the street -----------------------------------------------------------------------------

interface Front { ax: number; az: number; bx: number; bz: number }
interface Chain { P: number[][]; t: number[][]; n: number[][]; L: number[] }

export function buildStreetProps(opts: {
  data: AreaData; terrain: Terrain; anchors: FacadeAnchor[]; flow: FlowMap; ground: GroundGrid;
  mats: StreetPropMaterials; th?: Building;
}): StreetProps {
  const { data, terrain, flow, mats } = opts;
  const [cx, cz] = data.meta.townHall, walkR = data.meta.walkRadius;
  // only what can be seen from the walk (the fog and the barriers end it)
  const inWalk = (x: number, z: number, margin = 12) => Math.hypot(x - cx, z - cz) < walkR + margin;
  const anchors = opts.anchors.filter(a => inWalk(a.x, a.z, 8));
  const G = meshHeight(terrain, opts.ground);
  const bags = new Bags();
  const segments: Seg[] = [];
  const spots: Record<string, number[][]> = {};
  const stats: Record<string, number> = {};
  const spot = (k: string, ...v: number[]) => (spots[k] ??= []).push(v);
  const ring = (x: number, z: number, rad: number, low = true, n = 8) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, b = ((k + 1) / n) * Math.PI * 2;
      segments.push([x + Math.cos(a) * rad, z + Math.sin(a) * rad, x + Math.cos(b) * rad, z + Math.sin(b) * rad, low]);
    }
  };
  const rect = (x: number, z: number, yaw: number, hw: number, hd: number, low = true) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const pts = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => [x + u * c + v * s, z - u * s + v * c]);
    for (let k = 0; k < 4; k++) segments.push([pts[k][0], pts[k][1], pts[(k + 1) % 4][0], pts[(k + 1) % 4][1], low]);
  };

  // exact building test via a coarse grid of bounding boxes
  const near = data.buildings.filter(b => b.dist < walkR + 90);
  const bcell = 16, bgrid = new Map<number, Building[]>();
  const bkey = (i: number, j: number) => (i + 5000) * 10007 + (j + 5000);
  for (const b of near) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of b.rings[0]) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    for (let i = Math.floor(x0 / bcell); i <= Math.floor(x1 / bcell); i++) for (let j = Math.floor(z0 / bcell); j <= Math.floor(z1 / bcell); j++) {
      let l = bgrid.get(bkey(i, j)); if (!l) bgrid.set(bkey(i, j), (l = [])); l.push(b);
    }
  }
  const inside = (x: number, z: number) => (bgrid.get(bkey(Math.floor(x / bcell), Math.floor(z / bcell))) ?? []).some(b => inRing(x, z, b.rings[0]) && !b.rings.slice(1).some(h => inRing(x, z, h)));
  const nearAnchor = (x: number, z: number, d: number, kinds: FacadeAnchor['kind'][] = ['gate', 'door', 'shop']) =>
    anchors.some(a => kinds.includes(a.kind) && Math.hypot(a.x - x, a.z - z) < d + a.w / 2);

  // --- Pavements -------------------------------------------------------------------------------------
  // Street-facing house fronts with open ground ahead, oriented so the outward normal is (tz, -tx),
  // chained across party walls into continuous runs along the street.
  // Only on the square and Wielka (Didžioji), where the photographs show pavements: the front must face
  // one of their street lines (OSM centrelines, which follow the historic street there) within 24 m.
  const mains = data.roads.filter(r => r.name === 'Didžioji g.' || r.name === 'Rotušės a.').map(r => r.line);
  const nearMain = (x: number, z: number, d: number) => mains.some(l => l.some((p, i) => {
    if (i === 0) return false;
    const [ax, az] = l[i - 1], dx = p[0] - ax, dz = p[1] - az, l2 = dx * dx + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    return Math.hypot(x - ax - dx * u, z - az - dz * u) < d;
  }));
  const fronts: Front[] = [];
  for (const b of data.buildings) {
    if (!b.detail || b.role === 'townhall' || b.role === 'stcasimir' || b.dist > walkR + 25) continue;
    const r0 = b.rings[0], n = r0.length;
    for (let i = 0; i < n; i++) {
      let [ax, az] = r0[i], [bx, bz] = r0[(i + 1) % n];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.05) continue;
      let tx = (bx - ax) / L, tz = (bz - az) / L, nx = tz, nz = -tx;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (!inWalk(mx, mz, 14)) continue;
      if (inRing(mx + nx * 0.05, mz + nz * 0.05, r0)) { nx = -nx; nz = -nz; }
      let hits = 0;
      for (const f of [0.2, 0.5, 0.8]) if (inside(ax + (bx - ax) * f + nx * 0.6, az + (bz - az) * f + nz * 0.6)) hits++;
      if (hits >= 2) continue;
      let d = 1.5;
      while (d < FRONTAGE && !inside(mx + nx * d, mz + nz * d)) d += 1.5;
      if (d < FRONTAGE || !nearMain(mx + nx * 4, mz + nz * 4, 24)) continue;
      if (Math.abs(nx - tz) + Math.abs(nz + tx) > 0.5) { [ax, az, bx, bz] = [bx, bz, ax, az]; tx = -tx; tz = -tz; }
      fronts.push({ ax, az, bx, bz });
    }
  }
  const next = fronts.map(f => {
    let best = -1, bd = 0.8;
    fronts.forEach((g, j) => {
      if (g === f) return;
      const d = Math.hypot(g.ax - f.bx, g.az - f.bz);
      const t1x = f.bx - f.ax, t1z = f.bz - f.az, t2x = g.bx - g.ax, t2z = g.bz - g.az;
      if (d < bd && (t1x * t2x + t1z * t2z) / (Math.hypot(t1x, t1z) * Math.hypot(t2x, t2z)) > -0.5) { bd = d; best = j; }
    });
    return best;
  });
  const hasPrev = new Set(next.filter(j => j >= 0));
  const used = new Set<number>(), chains: Chain[] = [];
  const order = [...fronts.keys()].sort((a, b) => Number(hasPrev.has(a)) - Number(hasPrev.has(b)));   // chain heads first
  for (const s of order) {
    if (used.has(s)) continue;
    const list: Front[] = [];
    for (let k = s; k >= 0 && !used.has(k); k = next[k]) { used.add(k); list.push(fronts[k]); }
    const P: number[][] = [[list[0].ax, list[0].az]];
    for (let k = 1; k < list.length; k++) P.push([(list[k - 1].bx + list[k].ax) / 2, (list[k - 1].bz + list[k].az) / 2]);
    P.push([list[list.length - 1].bx, list[list.length - 1].bz]);
    const Q2 = P.filter((p, k) => k === 0 || Math.hypot(p[0] - P[k - 1][0], p[1] - P[k - 1][1]) > 0.05);
    if (Q2.length < 2) continue;
    const t: number[][] = [], n: number[][] = [], L: number[] = [];
    for (let k = 0; k + 1 < Q2.length; k++) {
      const dx = Q2[k + 1][0] - Q2[k][0], dz = Q2[k + 1][1] - Q2[k][1], l = Math.hypot(dx, dz);
      t.push([dx / l, dz / l]); n.push([dz / l, -dx / l]); L.push(l);
    }
    chains.push({ P: Q2, t, n, L });
  }
  // the chains' wall lines, for distance queries
  const wsegs: number[][] = [], wgrid = new Map<number, number[]>(), WC = 4;
  for (const c of chains) for (let k = 0; k + 1 < c.P.length; k++) {
    const id = wsegs.length; wsegs.push([c.P[k][0], c.P[k][1], c.P[k + 1][0], c.P[k + 1][1]]);
    const [ax, az] = c.P[k], [bx, bz] = c.P[k + 1];
    for (let i = Math.floor((Math.min(ax, bx) - 3) / WC); i <= Math.floor((Math.max(ax, bx) + 3) / WC); i++)
      for (let j = Math.floor((Math.min(az, bz) - 3) / WC); j <= Math.floor((Math.max(az, bz) + 3) / WC); j++) {
        let l = wgrid.get(bkey(i, j)); if (!l) wgrid.set(bkey(i, j), (l = [])); l.push(id);
      }
  }
  const nearestWall = (x: number, z: number): { d: number; s: number; u: number } => {
    let best = { d: Infinity, s: -1, u: 0 };
    for (const id of wgrid.get(bkey(Math.floor(x / WC), Math.floor(z / WC))) ?? []) {
      const [ax, az, bx, bz] = wsegs[id], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
      const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.hypot(x - ax - dx * u, z - az - dz * u);
      if (d < best.d) best = { d, s: id, u };
    }
    return best;
  };
  const onPavement = (x: number, z: number) => nearestWall(x, z).d < PAVE_W - 0.02 && !inside(x, z);
  const floor = (x: number, z: number) => G(x, z) + (onPavement(x, z) ? PAVE_LIFT : 0);

  const FLAGS = ['#a89e8e', '#9d9587', '#b0a592', '#948d81', '#aaa08c', '#a1998b', '#b5aa97'];
  const occ = new Map<number, number>(), OC = 0.2;
  const okey = (x: number, z: number) => (Math.floor(x / OC) + 50000) * 100003 + Math.floor(z / OC) + 50000;
  const rng = mulberry(42);
  let segId = 0, flagCount = 0, kerbCount = 0;
  const dMax = PAVE_W - KERB_W - 0.006;
  const at = (P: number[], t: number[], n: number[], u: number, d: number) => [P[0] + t[0] * u + n[0] * d, P[1] + t[1] * u + n[1] * d];
  for (const ch of chains) {
    const m = ch.L.length;
    const convex = (k: number) => k > 0 && k < m && ch.t[k - 1][0] * ch.n[k][0] + ch.t[k - 1][1] * ch.n[k][1] > 0.02;
    // flags, row by row along each wall segment; the corners are shared out through the occupancy grid
    for (let k = 0; k < m; k++, segId++) {
      const P = ch.P[k], t = ch.t[k], n = ch.n[k], L = ch.L[k];
      const u0 = k === 0 ? KERB_W + 0.01 : convex(k) ? -PAVE_W : 0;
      const u1 = k === m - 1 ? L - KERB_W - 0.01 : convex(k + 1) ? L + PAVE_W : L;
      const split = rng() < 0.3 ? [0.03, dMax] : [0.03, 0.03 + (dMax - 0.03) * (0.42 + 0.16 * rng()), dMax];
      for (let row = 0; row + 1 < split.length; row++) {
        const d0 = split[row] + (row ? 0.008 : 0), d1 = split[row + 1];
        let u = u0 - (row % 2) * 0.35 * rng();
        while (u < u1 - 0.05) {
          const len = 0.6 + 0.55 * rng(), ua = Math.max(u0, u), ub = Math.min(u1, u + len);
          u += len + 0.009;
          if (ub - ua < 0.12) continue;
          const tryPlace = (a: number, b: number, depth: number): void => {
            const cs = [at(P, t, n, a, d0), at(P, t, n, b, d0), at(P, t, n, b, d1), at(P, t, n, a, d1)];
            const probes = [[a + 0.06, d0 + 0.05], [b - 0.06, d0 + 0.05], [b - 0.06, d1 - 0.05], [a + 0.06, d1 - 0.05], [(a + b) / 2, (d0 + d1) / 2]].map(([pu, pd]) => at(P, t, n, pu, pd));
            const bad = probes.some(([x, z]) => {
              const o = occ.get(okey(x, z));
              return (o !== undefined && o !== segId) || nearestWall(x, z).d > dMax + 0.004 || inside(x, z);
            }) || cs.some(([x, z]) => nearestWall(x, z).d > dMax + 0.02);
            if (bad) { if (depth < 2 && b - a > 0.3) { const mid = (a + b) / 2; tryPlace(a, mid - 0.005, depth + 1); tryPlace(mid + 0.005, b, depth + 1); } return; }
            for (let su = a; su <= b; su += OC * 0.7) for (let sd = d0; sd <= d1; sd += OC * 0.7) { const [x, z] = at(P, t, n, su, sd); occ.set(okey(x, z), segId); }
            const tops = cs.map(([x, z]) => G(x, z) + PAVE_LIFT + (rng() - 0.5) * 0.006);
            const base = FLAGS[Math.floor(rng() * FLAGS.length)];
            const cc = new THREE.Color(base).multiplyScalar(0.92 + 0.14 * rng());
            if (rng() < 0.12) cc.multiplyScalar(0.8);    // a stained or newer stone
            bags.add('paving', paint(slab(cs, tops, Math.min(...tops) - 0.08, 0.012), cc, 0, 0, 0.05));
            flagCount++;
          };
          tryPlace(ua, ub, 0);
        }
      }
    }
    // kerb: the outer line at PAVE_W (arcs round convex corners, mitres into concave ones), returning to the wall at both ends
    const K: number[][] = [ch.P[0], at(ch.P[0], ch.t[0], ch.n[0], 0, PAVE_W)];
    for (let k = 1; k < m; k++) {
      const P = ch.P[k], n1 = ch.n[k - 1], n2 = ch.n[k];
      const cr = n1[0] * n2[1] - n1[1] * n2[0], dt = n1[0] * n2[0] + n1[1] * n2[1], ang = Math.atan2(cr, dt);
      if (Math.abs(ang) < 0.03) { K.push([P[0] + (n1[0] + n2[0]) / 2 * PAVE_W, P[1] + (n1[1] + n2[1]) / 2 * PAVE_W]); continue; }
      if (convex(k)) {
        const steps = Math.ceil(Math.abs(ang) / 0.3);
        for (let s = 0; s <= steps; s++) { const a = (ang * s) / steps, c = Math.cos(a), sn = Math.sin(a); K.push([P[0] + (n1[0] * c - n1[1] * sn) * PAVE_W, P[1] + (n1[0] * sn + n1[1] * c) * PAVE_W]); }
      } else {
        const k2 = Math.min(3, 1 / (1 + dt));
        K.push([P[0] + (n1[0] + n2[0]) * k2 * PAVE_W, P[1] + (n1[1] + n2[1]) * k2 * PAVE_W]);
      }
    }
    const PE = ch.P[m];
    K.push(at(PE, ch.t[m - 1], ch.n[m - 1], 0, PAVE_W), PE);
    // inner line of the kerb, mitred
    const inward = (i: number) => { const a = K[i], b = K[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; };
    const Kin = K.map((p, i) => {
      if (i === 0) { const w = inward(0); return [p[0] + w[0] * KERB_W, p[1] + w[1] * KERB_W]; }
      if (i === K.length - 1) { const w = inward(i - 1); return [p[0] + w[0] * KERB_W, p[1] + w[1] * KERB_W]; }
      const a = inward(i - 1), b = inward(i), d = a[0] * b[0] + a[1] * b[1], k2 = Math.min(3, 1 / (1 + d));
      return [p[0] + (a[0] + b[0]) * k2 * KERB_W, p[1] + (a[1] + b[1]) * k2 * KERB_W];
    });
    for (let i = 0; i + 1 < K.length; i++) {
      const len = Math.hypot(K[i + 1][0] - K[i][0], K[i + 1][1] - K[i][1]);
      if (len < 0.05) continue;
      const nst = Math.max(1, Math.round(len / (0.9 + 0.5 * rng())));
      for (let s = 0; s < nst; s++) {
        const f0 = s / nst + (s ? 0.004 / len : 0), f1 = (s + 1) / nst - (s < nst - 1 ? 0.004 / len : 0);
        const lerp = (A: number[], B: number[], f: number) => [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
        const cs = [lerp(K[i], K[i + 1], f0), lerp(K[i], K[i + 1], f1), lerp(Kin[i], Kin[i + 1], f1), lerp(Kin[i], Kin[i + 1], f0)];
        const lift = (rng() - 0.5) * 0.008;
        const tops = cs.map(([x, z], q) => G(x, z) + (q < 2 ? 0.05 : 0.042) + lift);
        const cc = new THREE.Color(rng() < 0.5 ? '#8f8b84' : '#99928a').multiplyScalar(0.9 + 0.15 * rng());
        bags.add('paving', paint(slab(cs, tops, Math.min(...tops) - 0.25, 0.022), cc, 0, 0, 0.06));
        kerbCount++;
      }
    }
    spot('kerb', ...K[1]);
  }
  stats.pavementChains = chains.length; stats.flags = flagCount; stats.kerbs = kerbCount;

  // downpipe water carried across the pavement in a cast-iron channel plate
  for (const a of anchors) {
    if (a.kind !== 'pipe') continue;
    const px = a.x + a.nx * 0.12, pz = a.z + a.nz * 0.12;
    const w = nearestWall(px, pz);
    if (w.d > 0.35) continue;
    const [ax, az, bx, bz] = wsegs[w.s], l = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / l, tz = (bz - az) / l, nx = tz, nz = -tx;
    const ox = ax + (bx - ax) * w.u, oz = az + (bz - az) * w.u;
    const cs = [[-0.1, 0.07], [0.1, 0.07], [0.1, dMax], [-0.1, dMax]].map(([u, d]) => [ox + tx * u + nx * d, oz + tz * u + nz * d]);
    const tops = cs.map(([x, z]) => G(x, z) + PAVE_LIFT + 0.012);
    bags.add('ironFlat', paint(slab(cs, tops, tops[0] - 0.03, 0.006), '#3b3935', 0, 0, 0.1));
    for (const u of [-0.05, 0, 0.05]) {
      const rs = [[u - 0.008, 0.1], [u + 0.008, 0.1], [u + 0.008, dMax - 0.03], [u - 0.008, dMax - 0.03]].map(([uu, d]) => [ox + tx * uu + nx * d, oz + tz * uu + nz * d]);
      bags.add('ironFlat', paint(slab(rs, rs.map(([x, z]) => G(x, z) + PAVE_LIFT + 0.02), tops[0] - 0.01, 0.003), '#46433d', 0, 0, 0.1));
    }
    stats.pipePlates = (stats.pipePlates ?? 0) + 1;
  }

  // --- Guard stones: at both jambs of every carriage gateway, and at exposed house corners ------------------
  const guardStone = (x: number, z: number, yaw: number, seed: number, lean = 0.1) => {
    const rr = mulberry(seed);
    const h = 0.58 + 0.16 * rr(), rb = 0.19 + 0.04 * rr();
    const g = lathe([[0, -0.12], [rb + 0.01, -0.12], [rb, 0.02], [rb * 0.93, h * 0.35], [rb * 0.78, h * 0.68], [rb * 0.56, h * 0.88], [rb * 0.3, h * 0.97], [0, h]], 14);
    hewn(g, 0.012, 7, seed % 97);
    g.scale(1, 1, 0.82);
    const cc = new THREE.Color(rr() < 0.7 ? '#8f8a82' : '#a0927c').multiplyScalar(0.9 + 0.15 * rr());
    bags.add('stone', put(paint(g, cc, 0.25, 0.3, 0.1), x, floor(x, z) - 0.02, z, yaw, 1, -lean));
    ring(x, z, rb + 0.02, true, 6);
  };
  let gi = 0;
  for (const a of anchors) {
    if (a.kind !== 'gate') continue;
    const yaw = Math.atan2(a.nx, a.nz);   // local +z out of the wall
    const iron = (Math.abs(Math.floor(a.x * 13 + a.z * 7)) % 10) < 3;
    for (const sd of [-1, 1]) {
      const u = sd * (a.w / 2 + 0.17), x = a.x + a.tx * u + a.nx * 0.2, z = a.z + a.tz * u + a.nz * 0.2;
      if (iron) {
        // cast-iron wheel guard: a bar bowing out from the jamb to the ground
        const bx = a.x + a.tx * sd * (a.w / 2 + 0.1), bz = a.z + a.tz * sd * (a.w / 2 + 0.1), y0 = floor(bx, bz);
        const g = tube([[0, 0.95, 0.02], [0, 0.8, 0.14], [0, 0.5, 0.3], [0, 0.2, 0.37], [0, -0.05, 0.38]], 0.035, 8);
        bags.add('iron', put(paint(g, '#2a2b28', 0.2, 0.3, 0.05), bx, y0, bz, yaw));
        bags.add('iron', put(paint(roundBox(0.12, 0.18, 0.03, 0.01).translate(0, 0.95, 0.015), '#2a2b28'), bx, y0, bz, yaw));
        ring(bx + a.nx * 0.25, bz + a.nz * 0.25, 0.14, true, 6);
      } else guardStone(x, z, yaw, 1000 + gi * 2 + (sd > 0 ? 1 : 0));
      spot('guard', x, floor(x, z), z, a.nx, a.nz);
    }
    gi++;
  }
  stats.gates = gi;
  // exposed convex corners of the houses on the walk
  let corners = 0;
  const cornerPts: number[][] = [];
  for (const b of data.buildings) {
    if (!b.detail || b.role === 'townhall' || b.role === 'stcasimir' || b.dist > walkR) continue;
    const r0 = b.rings[0], n = r0.length;
    for (let i = 0; i < n; i++) {
      const p = r0[(i - 1 + n) % n], c = r0[i], q = r0[(i + 1) % n];
      const l1 = Math.hypot(c[0] - p[0], c[1] - p[1]), l2 = Math.hypot(q[0] - c[0], q[1] - c[1]);
      if (l1 < 3 || l2 < 3) continue;
      const t1 = [(c[0] - p[0]) / l1, (c[1] - p[1]) / l1], t2 = [(q[0] - c[0]) / l2, (q[1] - c[1]) / l2];
      const turn = Math.abs(t1[0] * t2[1] - t1[1] * t2[0]);
      if (turn < 0.6) continue;   // a real corner, not a bend in the front
      // outward bisector: away from both edges; the corner is convex if the point just outside it is open
      let bx = t1[0] - t2[0], bz = t1[1] - t2[1]; const bl = Math.hypot(bx, bz); bx /= bl; bz /= bl;
      if (inRing(c[0] + bx * 0.3, c[1] + bz * 0.3, r0)) continue;
      if (inside(c[0] + bx * 0.5, c[1] + bz * 0.5) || inside(c[0] + bx * 3, c[1] + bz * 3)) continue;
      const x = c[0] + bx * 0.3, z = c[1] + bz * 0.3;
      if (!inWalk(x, z, 4)) continue;
      if (cornerPts.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < 8) || nearAnchor(x, z, 1.2)) continue;
      const seed = hashXZ(x, z);
      if (seed % 10 >= 6) continue;   // not every corner
      cornerPts.push([x, z]);
      guardStone(x, z, Math.atan2(bx, bz), seed, 0.06);
      corners++;
      spot('corner', x, floor(x, z), z, bx, bz);
    }
  }
  stats.cornerStones = corners;

  // --- Drain grates where the flow map collects water in a pit ------------------------------------------
  {
    const N = Math.round(1 / flow.box.z), px = flow.tex.image.data as Uint8Array, x0 = flow.box.x, z0 = flow.box.y;
    const cand: { x: number; z: number; v: number; i: number; j: number }[] = [];
    for (let j = 3; j < N - 3; j++) for (let i = 3; i < N - 3; i++) {
      const v = px[(j * N + i) * 4];
      if (v < 140) continue;
      const x = x0 + i + 0.5, z = z0 + j + 0.5;
      if (Math.hypot(x - cx, z - cz) > walkR - 4) continue;
      let peak = true;
      for (let dj = -3; dj <= 3 && peak; dj++) for (let di = -3; di <= 3; di++) { const w = px[((j + dj) * N + i + di) * 4]; if (w > v || (w === v && (dj < 0 || (dj === 0 && di < 0)))) { peak = false; break; } }
      if (peak) cand.push({ x, z, v, i, j });
    }
    cand.sort((a, b) => b.v - a.v);
    const placed: number[][] = [];
    for (const c of cand) {
      if (placed.length >= 7) break;
      let { x, z } = c;
      let yaw = 0;
      const w = nearestWall(x, z);
      if (w.d < PAVE_W + 0.45) {
        // under the pavement: set it in the gutter just off the kerb
        const [ax, az, bx, bz] = wsegs[w.s], l = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / l, tz = (bz - az) / l;
        x = ax + (bx - ax) * w.u + tz * (PAVE_W + 0.34); z = az + (bz - az) * w.u - tx * (PAVE_W + 0.34);
        yaw = Math.atan2(tz, -tx);
      } else {
        const fk = (c.j * N + c.i) * 4, fx = px[fk + 1] / 127.5 - 1, fz = px[fk + 2] / 127.5 - 1;
        yaw = Math.atan2(fx, fz);
      }
      if (inside(x, z) || placed.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < 16) || nearAnchor(x, z, 1.4)) continue;
      placed.push([x, z]);
      grate(x, z, yaw);
      spot('grate', x, G(x, z), z);
    }
    stats.grates = placed.length;
  }
  function grate(x: number, z: number, yaw: number) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const quad = (hw: number, hd: number, du = 0) => [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => [x + (u + du) * c + v * s, z - (u + du) * s + v * c]);
    const frame = quad(0.36, 0.3), fr = frame.map(([px, pz]) => G(px, pz) + 0.012);
    // granite frame round a dark sump, the grate's bars over it
    const hole = quad(0.26, 0.2);
    bags.add('paving', paint(slab(frame, fr, Math.min(...fr) - 0.2, 0.02), '#8c877f', 0, 0, 0.08));
    bags.add('ironFlat', paint(slab(hole, hole.map(([px, pz]) => G(px, pz) + 0.014), G(x, z) - 0.1, 0.004), '#0c0c0b', 0, 0, 0));
    for (let k = -3; k <= 3; k++) {
      const bar = [[-0.015, -0.21], [0.015, -0.21], [0.015, 0.21], [-0.015, 0.21]].map(([u, v]) => [x + (u + k * 0.068) * c + v * s, z - (u + k * 0.068) * s + v * c]);
      bags.add('ironFlat', paint(slab(bar, bar.map(([px, pz]) => G(px, pz) + 0.024), G(x, z) - 0.03, 0.004), '#34322e', 0, 0, 0.1));
    }
    for (const v of [-0.205, 0.205]) {
      const rim = [[-0.26, v - 0.012], [0.26, v - 0.012], [0.26, v + 0.012], [-0.26, v + 0.012]].map(([u, vv]) => [x + u * c + vv * s, z - u * s + vv * c]);
      bags.add('ironFlat', paint(slab(rim, rim.map(([px, pz]) => G(px, pz) + 0.024), G(x, z) - 0.03, 0.004), '#34322e', 0, 0, 0.1));
    }
  }

  // --- The Town Hall garden and the square round it (the promenade's frame) ----------------------------
  if (opts.th) {
    const f = townHallFrame(opts.th);
    const { PORTICO_X0, PORTICO_X1, PORTICO_DEPTH } = TOWN_HALL_SIZE;
    const s0x = (PORTICO_X0 + PORTICO_X1) / 2, s0z = -PORTICO_DEPTH - 2.2;
    const ax = -Math.sin(P_SKEW), az = -Math.cos(P_SKEW), nx = Math.cos(P_SKEW), nz = -Math.sin(P_SKEW);
    const world = (s: number, t: number): number[] => {
      const lx = s0x + s * ax + t * nx, lz = s0z + s * az + t * nz;
      return [f.origin.x + f.dirX.x * lx + f.dirZ.x * lz, f.origin.z + f.dirX.z * lx + f.dirZ.z * lz];
    };
    const o = world(0, 0), sa = world(1, 0), ta = world(0, 1);
    const along = [sa[0] - o[0], sa[1] - o[1]], across = [ta[0] - o[0], ta[1] - o[1]];
    const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz);
    const inGarden = (x: number, z: number) => {
      const s = (x - o[0]) * along[0] + (z - o[1]) * along[1], t = (x - o[0]) * across[0] + (z - o[1]) * across[1];
      return s > -3 && (s < P_SEND ? Math.abs(t) < P_HALF + 1.2 : Math.hypot(s - P_SEND, t) < P_HALF + 1.2);
    };

    // benches: along both gravel walks, between the trees, backs to the trees; four round the basin
    const bench = benchParts();
    const benchAt = (x: number, z: number, yaw: number) => {
      const y = G(x, z) + 0.04;   // on the gravel
      bags.add('iron', put(paint(bench.iron.clone(), '#23271f', 0.15, 0.25, 0.05), x, y, z, yaw));
      bags.add('wood', put(paint(bench.wood.clone(), '#8c7152', 0, 0, 0.12), x, y, z, yaw));
      rect(x, z, yaw, 0.98, 0.33);
      spot('bench', x, y, z, yaw);
    };
    const sides: [number, number[]][] = [[1, [17.75, 34.75, 60.25, 77.25]], [-1, [26.25, 51.75, 68.75, 111.25]]];
    for (const [side, ss] of sides) for (const s of ss) {
      if (P_GAPS.some(([a, b]) => s > a - 2 && s < b + 2)) continue;
      const [x, z] = world(s, side * (P_WALK - 0.45));
      benchAt(x, z, yawOf(-across[0] * side, -across[1] * side));
    }
    const basinS = P_SEND - 26;
    for (const a of [0.8, 2.35, 3.95, 5.5]) {
      const ds = Math.cos(a), dt = Math.sin(a), [x, z] = world(basinS + ds * 6.3, dt * 6.3);
      benchAt(x, z, yawOf(-(along[0] * ds + across[0] * dt), -(along[1] * ds + across[1] * dt)));
    }

    // the advertising column: out on the square beyond the garden's east fence
    {
      const [x, z] = world(64, P_HALF + 5.6), y = G(x, z);
      advertisingColumn(x, y, z, yawOf(across[0], across[1]));
      ring(x, z, 0.8, false, 12);
      spot('column', x, y, z);
    }

    // the cab stand along the east fence, near the Town Hall: plate, pump and trough, straw and droppings
    const standT = P_HALF + 2.2, outward = yawOf(across[0], across[1]), parallel = yawOf(along[0], along[1]);
    {
      const [x, z] = world(23.5, standT), y = G(x, z);
      standPlate(x, y, z, outward);
      ring(x, z, 0.1, true, 6);
      spot('stand', x, y, z, along[0], along[1]);
    }
    {
      const [x, z] = world(31.2, standT + 0.2), y = G(x, z);
      pump(x, y, z, outward);
      ring(x, z, 0.2, true, 6);
      spot('pump', x, y, z);
      const [tx, tz] = world(28.6, standT + 0.5);
      trough(tx, G(tx, tz), tz, parallel);
      rect(tx, tz, parallel, 0.34, 1.12);
      spot('trough', tx, G(tx, tz), tz);
    }
    litterStrip(world, 21, 36, standT + 1.4, standT + 5.2, 1);
    spots.cabStand = [[...world(22, standT + 3.4), ...world(36, standT + 3.4)]];

    // droppings here and there where the carts pass (open ground, well off the walls and the garden)
    const rr = mulberry(77);
    let dropped = 0;
    const N = Math.round(1 / flow.box.z), fpx = flow.tex.image.data as Uint8Array;
    for (let k = 0; k < 400 && dropped < 16; k++) {
      const a = rr() * Math.PI * 2, rad = 10 + rr() * (walkR - 18), x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
      const i = Math.floor(x - flow.box.x), j = Math.floor(z - flow.box.y);
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const wallD = (fpx[(j * N + i) * 4 + 3] / 255) * 8;
      if (wallD < 3.5 || inside(x, z) || inGarden(x, z) || onPavement(x, z)) continue;
      droppings(x, z, rr, 3 + Math.floor(rr() * 4));
      spot('dropping', x, G(x, z), z);
      dropped++;
    }

    // a few wet leaves under the garden's trees, blown against the fence and the kerbs
    for (let k = 0; k < 9; k++) {
      const side = k % 2 ? 1 : -1, s = 9 + ((k * 37) % 110);
      const [x, z] = world(s, side * (P_HALF + 0.35 + rr() * 0.6));
      leaves(x, z, rr, 10 + Math.floor(rr() * 14), 0.5);
    }

    // hitching posts in front of the hotel
    const hotel = data.buildings.find(b => b.style === 'hotel');
    if (hotel) {
      let hx = 0, hz = 0; for (const [x, z] of hotel.rings[0]) { hx += x; hz += z; } hx /= hotel.rings[0].length; hz /= hotel.rings[0].length;
      const fr = anchors.filter(a => a.kind === 'front' && Math.hypot(a.x - hx, a.z - hz) < 30).sort((a, b) => b.w - a.w)[0];
      if (fr) for (const u of [-3.1, 3.1]) {
        const x = fr.x + fr.tx * u + fr.nx * (PAVE_W - 0.5), z = fr.z + fr.tz * u + fr.nz * (PAVE_W - 0.5);
        hitchingPost(x, floor(x, z), z, Math.atan2(fr.tx, fr.tz));
        ring(x, z, 0.08, true, 6);
        spot('hitch', x, floor(x, z), z);
      }
    }
  }

  // --- Goods at a few shop doors; a handcart by some gateways ----------------------------------------
  {
    let kits = 0, carts = 0;
    const cart = handcartParts(), barrel = barrelParts(), smallBarrel = barrelParts(0.62, 0.22);
    const item = (kind: string, x: number, z: number, yaw: number, seed: number) => {
      const rr = mulberry(seed), y = floor(x, z) - 0.01;
      if (kind === 'barrel' || kind === 'keg') {
        const b = kind === 'barrel' ? barrel : smallBarrel;
        bags.add('wood', put(paint(b.wood.clone(), new THREE.Color('#8a6a4a').multiplyScalar(0.8 + 0.3 * rr()), 0.3, 0.3, 0.1), x, y, z, rr() * 6));
        bags.add('iron', put(paint(b.iron.clone(), '#3a3530', 0, 0, 0.1), x, y, z, 0));
        ring(x, z, kind === 'barrel' ? 0.3 : 0.23, true, 6);
      } else if (kind === 'crates') {
        const w = 0.6, d = 0.42;
        bags.add('wood', put(paint(crateParts(w, 0.38, d), new THREE.Color('#a0845e').multiplyScalar(0.8 + 0.25 * rr()), 0.2, 0.25, 0.12), x, y, z, yaw));
        if (rr() < 0.7) bags.add('wood', put(paint(crateParts(w, 0.34, d), new THREE.Color('#9a7c58').multiplyScalar(0.8 + 0.25 * rr()), 0, 0, 0.12), x + (rr() - 0.5) * 0.06, y + 0.39, z + (rr() - 0.5) * 0.06, yaw + (rr() - 0.5) * 0.4));
        rect(x, z, yaw, 0.32, 0.23);
      } else if (kind === 'sacks') {
        for (let k = 0; k < 3; k++) {
          const u = (k - 1) * 0.36, sx = x + Math.cos(yaw) * u, sz = z - Math.sin(yaw) * u;
          bags.add('cloth', put(paint(sackGeometry(seed + k), new THREE.Color(k % 2 ? '#a58d68' : '#8f7a5a').multiplyScalar(0.85 + 0.2 * rr()), 0.2, 0.3, 0.12), sx, y, sz, yaw + (rr() - 0.5) * 0.6, 0.9 + 0.2 * rr(), -0.12, (rr() - 0.5) * 0.2));
        }
        rect(x, z, yaw, 0.55, 0.22);
      }
    };
    for (const a of anchors) {
      const h = hashXZ(a.x, a.z) % 100;
      const yaw = Math.atan2(a.nx, a.nz), along = Math.atan2(a.tx, a.tz);
      if (a.kind === 'shop' && a.door !== undefined && !a.goods && h < 13) {
        // beside the door, on the side with more of the shop window
        const side = a.door > 0 ? -1 : 1, u = a.door + side * 0.95;
        if (Math.abs(u) > a.w / 2 - 0.15) continue;
        const x = a.x + a.tx * u + a.nx * 0.42, z = a.z + a.tz * u + a.nz * 0.42;
        const kind = ['barrel', 'crates', 'sacks', 'keg'][h % 4];
        item(kind, x, z, along, h * 31 + 7);
        if (h % 3 === 0 && Math.abs(u + side * 0.7) < a.w / 2 - 0.2) item(kind === 'barrel' ? 'keg' : 'barrel', a.x + a.tx * (u + side * 0.7) + a.nx * 0.4, a.z + a.tz * (u + side * 0.7) + a.nz * 0.4, along, h * 17 + 3);
        kits++;
        spot('goods', x, floor(x, z), z, a.nx, a.nz);
      } else if (a.kind === 'gate' && h < 30) {
        // a handcart left by the gateway, clear of the guard stones
        const side = h % 2 ? 1 : -1, u = side * (a.w / 2 + 1.35);
        const x = a.x + a.tx * u + a.nx * 0.62, z = a.z + a.tz * u + a.nz * 0.62;
        const ends = [[x + a.tx * 1.3, z + a.tz * 1.3], [x - a.tx * 1.3, z - a.tz * 1.3]];
        if (ends.some(([ex, ez]) => inside(ex, ez) || nearAnchor(ex, ez, 0.8))) continue;
        const cyaw = side > 0 ? along : along + Math.PI;   // handles pointing away from the gateway
        bags.add('wood', put(paint(cart.wood.clone(), '#806448', 0.2, 0.25, 0.1), x, floor(x, z), z, cyaw));
        bags.add('iron', put(paint(cart.iron.clone(), '#33302b'), x, floor(x, z), z, cyaw));
        rect(x, z, cyaw, 0.48, 1.1);
        carts++;
        spot('cart', x, floor(x, z), z, a.nx, a.nz);
      }
    }
    stats.goods = kits; stats.carts = carts;
  }

  // wet leaves gathered in the inner corners of the pavements
  {
    const rr = mulberry(9);
    for (const ch of chains) for (let k = 1; k < ch.L.length; k++) {
      const cr = ch.t[k - 1][0] * ch.n[k][0] + ch.t[k - 1][1] * ch.n[k][1];
      if (cr > -0.3) continue;   // concave only
      const P = ch.P[k], bx = ch.n[k - 1][0] + ch.n[k][0], bz = ch.n[k - 1][1] + ch.n[k][1], bl = Math.hypot(bx, bz);
      leaves(P[0] + (bx / bl) * 0.35, P[1] + (bz / bl) * 0.35, rr, 8 + Math.floor(rr() * 10), 0.35);
    }
  }

  // --- Prop builders that need the bags --------------------------------------------------------------
  function advertisingColumn(x: number, y: number, z: number, yaw: number) {
    const R = 0.58;
    // granite plinth, octagonal
    bags.add('stone', put(paint(lathe([[0, -0.1], [0.8, -0.1], [0.8, 0.2], [0.74, 0.26], [0.7, 0.28], [0, 0.28]], 8, Math.PI / 8), '#8e8a83', 0.3, 0.3, 0.08), x, y, z, yaw));
    const green = '#2d3a2f';
    // painted cast-iron base mouldings, cornice, a ribbed dome and a finial
    bags.add('iron', put(paint(lathe([[0.67, 0.28], [0.67, 0.34], [0.63, 0.38], [0.63, 0.44], [0.6, 0.47], [R - 0.004, 0.52], [R - 0.004, 0.6]], 40), green, 0.3, 0.3, 0.04), x, y, z, yaw));
    bags.add('iron', put(paint(lathe([[R - 0.004, 3.1], [0.6, 3.13], [0.61, 3.2], [0.66, 3.25], [0.71, 3.29], [0.72, 3.38], [0.69, 3.41], [0.66, 3.42]], 40), green, 0, 0, 0.04), x, y, z, yaw));
    const dome = lathe([[0.64, 3.42], [0.63, 3.48], [0.59, 3.58], [0.5, 3.7], [0.37, 3.8], [0.22, 3.87], [0.1, 3.9], [0.07, 3.93], [0.1, 3.98], [0.11, 4.03], [0.08, 4.07], [0.045, 4.1], [0.06, 4.16], [0.05, 4.22], [0.015, 4.3], [0, 4.42]], 32);
    const pos = dome.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {   // twelve ribs down the dome
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      if (py > 3.44 && py < 3.9) { const a = Math.atan2(pz, px), k = 1 + 0.035 * Math.pow(Math.abs(Math.cos(a * 6)), 6); pos.setXYZ(i, px * k, py, pz * k); }
    }
    dome.computeVertexNormals();
    bags.add('iron', put(paint(dome, green, 0, 0, 0.04), x, y, z, yaw));
    // brackets under the cornice
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      bags.add('iron', put(paint(roundBox(0.05, 0.12, 0.09, 0.012), green), x + Math.sin(a + yaw) * (R + 0.04), y + 3.2, z + Math.cos(a + yaw) * (R + 0.04), a + yaw));
    }
    // the bills: an open drum wrapped in the atlas band
    const [u0, v0, u1, v1] = posterAtlas().band;
    const drum = new THREE.CylinderGeometry(R, R, 2.5, 48, 1, true).translate(0, 0.6 + 1.25, 0);
    const uv = drum.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    bags.add('poster', put(drum, x, y, z, yaw));
  }

  function standPlate(x: number, y: number, z: number, yaw: number) {
    const iron = '#262a27';
    bags.add('iron', put(paint(lathe([[0.07, 0], [0.07, 0.12], [0.05, 0.16], [0.035, 0.22], [0.03, 2.3], [0.045, 2.34], [0.05, 2.4], [0.03, 2.44], [0, 2.5]], 10), iron, 0.2, 0.3, 0.04), x, y, z, yaw));
    // the plate on a bracket, facing along the stand, and a frame
    const [pu0, pv0, pu1, pv1] = posterAtlas().plate;
    for (const face of [0, Math.PI]) {
      const q = new THREE.PlaneGeometry(0.62, 0.2).translate(0, 0, 0.017);
      const uv = q.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pu0 + uv.getX(i) * (pu1 - pu0), pv0 + uv.getY(i) * (pv1 - pv0));
      if (face) q.rotateY(Math.PI);
      bags.add('poster', put(q.translate(0.36, 2.12, 0), x, y, z, yaw - Math.PI / 2));
    }
    // the plate sticks out towards the square, read by people walking along the fence
    bags.add('iron', put(paint(roundBox(0.66, 0.24, 0.03, 0.008).translate(0.36, 2.12, 0), iron), x, y, z, yaw - Math.PI / 2));
    bags.add('iron', put(paint(roundBox(0.7, 0.025, 0.025, 0.008).translate(0.35, 2.27, 0), iron), x, y, z, yaw - Math.PI / 2));
  }

  function pump(x: number, y: number, z: number, yaw: number) {
    const iron = '#2f3a31';
    // granite slab with a channel, the pump on a plinth at its back
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const cs = [[-0.45, -0.3], [0.45, -0.3], [0.45, 0.75], [-0.45, 0.75]].map(([u, v]) => [x + u * c + v * s, z - u * s + v * c]);
    const tops = cs.map(([px, pz]) => G(px, pz) + 0.07);
    bags.add('paving', paint(slab(cs, tops, Math.min(...tops) - 0.2, 0.025), '#8a857d', 0, 0, 0.1));
    const y0 = Math.max(...tops) - 0.005;
    const col = lathe([[0.17, 0], [0.17, 0.1], [0.14, 0.14], [0.13, 0.22], [0.12, 0.26], [0.11, 1.12], [0.13, 1.16], [0.15, 1.24], [0.14, 1.3], [0.1, 1.33], [0.11, 1.4], [0.08, 1.46], [0.09, 1.52], [0.05, 1.6], [0, 1.66]], 20);
    const pos = col.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {   // fluted shaft
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      if (py > 0.3 && py < 1.1) { const a = Math.atan2(pz, px), k = 1 + 0.06 * Math.max(0, Math.cos(a * 10)); pos.setXYZ(i, px * k, py, pz * k); }
    }
    col.computeVertexNormals();
    bags.add('iron', put(paint(col, iron, 0.25, 0.3, 0.05), x, y0, z, yaw));
    // spout with a bucket hook, and the long handle pivoting at the top
    bags.add('iron', put(paint(tube([[0, 0.9, 0.08], [0, 0.9, 0.24], [0, 0.86, 0.36], [0, 0.78, 0.4]], 0.035, 8), iron), x, y0, z, yaw));
    bags.add('iron', put(paint(lathe([[0.03, 0], [0.045, 0], [0.045, 0.04], [0.03, 0.04]], 10).translate(0, 0.74, 0.4), iron), x, y0, z, yaw));
    bags.add('iron', put(paint(tube([[0, 1.38, 0.02], [0, 1.43, -0.18], [0, 1.36, -0.45], [0, 1.2, -0.68], [0, 1.08, -0.78]], 0.022, 6), iron), x, y0, z, yaw));
    bags.add('iron', put(paint(lathe([[0, -0.05], [0.035, -0.04], [0.04, 0], [0.035, 0.04], [0, 0.05]], 10).translate(0, 1.07, -0.8), iron), x, y0, z, yaw));
    // a wooden pail under the spout
    const pail = barrelParts(0.3, 0.14);
    bags.add('wood', put(paint(pail.wood, '#7a5e40', 0.1, 0.2, 0.1), x + 0.42 * s, y0, z + 0.42 * c, yaw));
    bags.add('iron', put(paint(pail.iron, '#3a3530'), x + 0.42 * s, y0, z + 0.42 * c, yaw));
    bags.add('iron', put(paint(tube([[-0.13, 0.3, 0], [-0.1, 0.42, 0], [0, 0.46, 0], [0.1, 0.42, 0], [0.13, 0.3, 0]], 0.006, 4), '#3a3530'), x + 0.42 * s, y0, z + 0.42 * c, yaw));
  }

  function trough(x: number, y: number, z: number, yaw: number) {
    // a horse trough of heavy planks bound with iron, on two stone blocks, brim-full of rainwater
    const Lh = 1.05, Wd = 0.3, H = 0.42, yb = 0.24;
    for (const u of [-0.7, 0.7]) bags.add('stone', put(paint(roundBox(0.3, yb + 0.1, 0.62, 0.03).translate(0, (yb + 0.1) / 2 - 0.1, 0), '#8d887f', 0.2, 0.3, 0.1), x + Math.sin(yaw) * u, y, z + Math.cos(yaw) * u, yaw));
    const wood = [
      roundBox(Wd * 2, 0.06, Lh * 2, 0.015).translate(0, yb + 0.03, 0),
      roundBox(0.06, H, Lh * 2, 0.015).translate(Wd - 0.03, yb + H / 2, 0), roundBox(0.06, H, Lh * 2, 0.015).translate(-Wd + 0.03, yb + H / 2, 0),
      roundBox(Wd * 2 - 0.12, H, 0.06, 0.015).translate(0, yb + H / 2, Lh - 0.03), roundBox(Wd * 2 - 0.12, H, 0.06, 0.015).translate(0, yb + H / 2, -Lh + 0.03),
    ];
    bags.add('wood', put(paint(merged(wood), '#6e563e', 0.25, 0.25, 0.12), x, y, z, yaw));
    for (const v of [-0.6, 0, 0.6]) bags.add('iron', put(paint(roundBox(Wd * 2 + 0.02, 0.05, 0.03, 0.008).translate(0, yb + H - 0.06, v), '#3a3530'), x, y, z, yaw));
    bags.add('water', put(new THREE.PlaneGeometry(Wd * 2 - 0.12, Lh * 2 - 0.12).rotateX(-Math.PI / 2).translate(0, yb + H - 0.05, 0), x, y, z, yaw));
  }

  function hitchingPost(x: number, y: number, z: number, yaw: number) {
    const iron = '#262826';
    bags.add('iron', put(paint(lathe([[0.08, 0], [0.08, 0.06], [0.06, 0.1], [0.045, 0.16], [0.045, 0.92], [0.06, 0.96], [0.065, 1.0], [0.07, 1.06], [0.05, 1.12], [0, 1.14]], 12), iron, 0.2, 0.3, 0.05), x, y, z, yaw));
    bags.add('iron', put(paint(new THREE.TorusGeometry(0.065, 0.011, 6, 16).translate(0, 0.84, 0.1), iron), x, y, z, yaw));
  }

  function droppings(x: number, z: number, rr: () => number, n: number) {
    for (let k = 0; k < n; k++) {
      const px = x + (rr() - 0.5) * 0.3, pz = z + (rr() - 0.5) * 0.3, s = 0.028 + rr() * 0.02;
      const g = new THREE.SphereGeometry(s, 7, 5).scale(1.2, 0.75, 1);
      const col = new THREE.Color(rr() < 0.5 ? '#3b2f1f' : '#4a3d24').multiplyScalar(0.8 + 0.4 * rr());
      bags.add('litter', put(paint(g, col, 0, 0, 0.2), px, G(px, pz) + s * 0.35, pz, rr() * 6));
    }
  }

  function leaves(x: number, z: number, rr: () => number, n: number, spread: number) {
    const cols = ['#7a5a26', '#8a6a2c', '#5e5a2a', '#6b4a22', '#8f7a3a'];
    for (let k = 0; k < n; k++) {
      const a = rr() * Math.PI * 2, rad = Math.sqrt(rr()) * spread, px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad;
      if (inside(px, pz)) continue;
      const L = 0.05 + rr() * 0.04, W2 = L * 0.4, curl = 0.006 + rr() * 0.01;
      const g = new THREE.BufferGeometry();
      const pts = [[0, 0, -L], [W2, curl, 0], [0, 0, L * 0.9], [-W2, curl, 0]];
      const p = [0, 1, 2, 0, 2, 3].flatMap(i => pts[i]);
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: 6 }, () => [0, 1, 0]).flat(), 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
      bags.add('litter', put(paint(g, new THREE.Color(cols[Math.floor(rr() * cols.length)]).multiplyScalar(0.75 + 0.4 * rr()), 0, 0, 0.1), px, floor(px, pz) + 0.006, pz, rr() * 6, 1, (rr() - 0.5) * 0.3, (rr() - 0.5) * 0.3));
    }
  }

  /** Straw trodden into the cobbles, a few hay wisps and droppings, over a strip of the promenade frame. */
  function litterStrip(world: (s: number, t: number) => number[], s0: number, s1: number, t0: number, t1: number, seed: number) {
    const rr = mulberry(seed * 131);
    const strands: number[] = [], nors: number[] = [], cols: number[] = [];
    const straw = ['#b09a5e', '#9c8850', '#c2ad70', '#8a7446'];
    for (let c = 0; c < 16; c++) {
      const s = s0 + rr() * (s1 - s0), t = t0 + rr() * (t1 - t0), [x, z] = world(s, t), n = 30 + Math.floor(rr() * 90), spread = 0.25 + rr() * 0.7;
      for (let k = 0; k < n; k++) {
        const a = rr() * Math.PI * 2, rad = Math.pow(rr(), 0.7) * spread, px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad;
        const dir = rr() * Math.PI, L = 0.08 + rr() * 0.18, w = 0.0035 + rr() * 0.004, h = G(px, pz) + 0.004 + rr() * 0.014;
        const dx = Math.cos(dir) * L / 2, dz = Math.sin(dir) * L / 2, wx = -Math.sin(dir) * w, wz = Math.cos(dir) * w;
        const q = [[px - dx - wx, h, pz - dz - wz], [px + dx - wx, h + (rr() - 0.5) * 0.01, pz + dz - wz], [px + dx + wx, h + 0.002, pz + dz + wz], [px - dx + wx, h, pz - dz + wz]];
        for (const i of [0, 1, 2, 0, 2, 3]) strands.push(...q[i]);
        const cc = new THREE.Color(straw[Math.floor(rr() * straw.length)]).multiplyScalar(0.7 + 0.45 * rr());
        for (let i = 0; i < 6; i++) { nors.push(0, 1, 0); cols.push(cc.r, cc.g, cc.b); }
      }
      if (rr() < 0.55) droppings(x + (rr() - 0.5), z + (rr() - 0.5), rr, 3 + Math.floor(rr() * 5));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(strands, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nors, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((strands.length / 3) * 2).fill(0), 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    bags.add('litter', g);
    // two small hay heaps where a cabman fed his horse
    for (let k = 0; k < 2; k++) {
      const [x, z] = world(s0 + 3 + k * 7 + rr() * 2, t0 + 1 + rr() * 2);
      const heap = new THREE.SphereGeometry(0.34, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.3, 0.38, 1);
      hewn(heap, 0.05, 9, k * 7 + 3);
      bags.add('cloth', put(paint(heap, '#a28c52', 0, 0, 0.25), x, G(x, z) - 0.02, z, rr() * 6));
    }
  }

  const group = new THREE.Group();
  group.name = 'street-props';
  const slots: Record<string, [THREE.Material, boolean]> = {
    stone: [mats.stone, true], paving: [mats.stone, false], wood: [mats.wood, true], iron: [mats.iron, true], ironFlat: [mats.iron, false],
    cloth: [mats.cloth, true], litter: [mats.litter, false], poster: [mats.poster, true], water: [mats.water, false],
  };
  for (const m of bags.meshes(slots, stats)) group.add(m);
  stats.segments = segments.length;
  return { group, segments, spots, stats };
}

function hashXZ(x: number, z: number): number {
  let h = Math.imul(Math.round(x * 10) | 0, 73856093) ^ Math.imul(Math.round(z * 10) | 0, 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}
