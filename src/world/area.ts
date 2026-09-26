/** Local metres: X = E - 583000, Z = -(N - 6061000). */
export type XZ = [number, number];

export interface Roof {
  /** Skeleton vertices, flat: x, z, t (t = horizontal distance from the eave line). */
  v: number[];
  /** Skeleton faces, one per footprint edge, as vertex indices. */
  f: number[][];
  /** Rise per metre of t (roof pitch). */
  k: number;
}

export interface Building {
  id: string;
  role: 'ordinary' | 'townhall' | 'stcasimir' | 'recon';
  area: number;
  dist: number;
  walk: boolean;
  /** Height of the eave above the building's ground, metres. */
  eave: number;
  heightSource: string;
  capped: boolean;
  /** Heights relative to the Town Hall square (meta.h0). */
  groundY: number;
  baseY: number;
  eaveY: number;
  roof: Roof | null;
  rings: XZ[][];
  /** Near the walk: full façade geometry (src/world/facades.ts). */
  detail?: boolean;
  /** Metres the roof reaches beyond the walls (detailed houses). */
  overhang?: number;
  source?: string | null;
  grade?: string;
}

export interface AreaData {
  meta: {
    townHall: XZ;
    h0: number;
    walkRadius: number;
    contextRadius: number;
    sources: string[];
    stats: Record<string, number>;
  };
  buildings: Building[];
  terrain: { e0: number; n0: number; cell: number; nx: number; ny: number; h: number[] } | null;
  areas: { id: number; name: string | null; ring: XZ[] }[];
  roads: { id: number; kind: string; name: string | null; tunnel: string | null; line: XZ[] }[];
}

export async function loadArea(url = 'data/area.json'): Promise<AreaData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}
