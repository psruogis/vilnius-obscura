import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Local metres: X = E - 583000, Z = -(N - 6061000). */
export type XZ = [number, number];

export interface Building {
  id: string;
  role: 'ordinary' | 'townhall' | 'stcasimir';
  area: number;
  dist: number;
  walk: boolean;
  eave: number;
  heightSource: string;
  capped: boolean;
  ground: number;
  rings: XZ[][];
}

export interface AreaData {
  meta: {
    townHall: XZ;
    walkRadius: number;
    contextRadius: number;
    sources: string[];
    stats: Record<string, number>;
  };
  buildings: Building[];
  areas: { id: number; name: string | null; ring: XZ[] }[];
  roads: { id: number; kind: string; name: string | null; tunnel: string | null; line: XZ[] }[];
}

export async function loadArea(url = '/data/area.json'): Promise<AreaData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}

// Limewash tints for c.1800 façades, authored in sRGB and converted to linear.
const LIMEWASH = ['#efe7d6', '#e8dcc0', '#e3cf9f', '#dcc7a4', '#e9e2d4', '#d9d2c3', '#e6d3b3', '#cfc4b0'];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function ringToShapePath(ring: XZ[]): THREE.Vector2[] {
  // Shape space (x, y) maps to world (x, -y) after rotating the extrusion upright.
  const pts = ring.map(([x, z]) => new THREE.Vector2(x, -z));
  return pts;
}

function extrudeBuilding(b: Building): THREE.BufferGeometry {
  const [outer, ...holes] = b.rings;
  let outerPts = ringToShapePath(outer);
  if (THREE.ShapeUtils.isClockWise(outerPts)) outerPts = outerPts.reverse();
  const shape = new THREE.Shape(outerPts);
  for (const hole of holes) {
    let pts = ringToShapePath(hole);
    if (!THREE.ShapeUtils.isClockWise(pts)) pts = pts.reverse();
    shape.holes.push(new THREE.Path(pts));
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: b.eave, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** One merged mesh for all buildings, tinted per building. */
export function buildBuildingsMesh(data: AreaData): THREE.Mesh {
  const geos: THREE.BufferGeometry[] = [];
  const color = new THREE.Color();
  for (const b of data.buildings) {
    const geo = extrudeBuilding(b);
    if (b.role === 'townhall') color.set('#f3f1ec');
    else if (b.role === 'stcasimir') color.set('#efe9dc');
    else color.set(LIMEWASH[hashString(b.id) % LIMEWASH.length]);
    const n = geo.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) color.toArray(colors, i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geos.push(geo.index ? geo.toNonIndexed() : geo);
  }
  const merged = mergeGeometries(geos, false);
  geos.forEach(g => g.dispose());
  if (!merged) throw new Error('Failed to merge building geometry');
  merged.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'buildings';
  return mesh;
}
