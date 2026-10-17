/**
 * Builds some of the façade squares off the page's thread (main.ts hands each worker a share of them). Gets the area
 * data and the open-ground raster, rebuilds the terrain, and sends back facadeParts: the geometry as typed arrays,
 * moved rather than copied.
 */
import type { AreaData } from './area';
import { Terrain } from './terrain';
import { facadeParts } from './facades';
import { groundTest, type GroundRaster } from './ground';

onmessage = ({ data: { area, ground, only } }: MessageEvent<{ area: AreaData; ground: GroundRaster; only: string[] }>) => {
  const keep = new Set(only);
  const parts = facadeParts(area, new Terrain(area), groundTest(ground), k => keep.has(k));
  const moved = parts.chunks.flatMap(c => c.parts.flatMap(p => p.attrs.map(([, a]) => a.buffer as ArrayBuffer)));
  (postMessage as (m: unknown, t: Transferable[]) => void)(parts, moved);
};
