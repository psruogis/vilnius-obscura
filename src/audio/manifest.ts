/**
 * What music the walk has: public/assets/music/tracks.json.
 *
 *   pieces: quiet background pieces, played one at a time (music.ts)
 *   zones:  music that belongs to a place, heard when the walker is near it (zones.ts). `sites` are metres
 *           east and south of the Town Hall (the map's x and z), `near` and `far` the distances at which it is
 *           loudest and gone.
 *
 * Every file must be free to use in Europe as well as the US: a recording over 70 years old or released to the
 * public domain (CC0), of music whose composer died over 70 years ago; and be listed in CREDITS.md.
 * (A bare array is read as `pieces`.)
 */
export interface Piece { file: string; title?: string; by?: string }
export interface ZoneSpec { id: string; title?: string; files: string[]; sites: [number, number][]; near: number; far: number }
export interface Manifest { pieces: Piece[]; zones: ZoneSpec[] }

export const MUSIC_BASE = 'assets/music/';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export async function loadManifest(): Promise<Manifest> {
  try {
    const r = await fetch(`${MUSIC_BASE}tracks.json`);
    const raw: unknown = r.ok ? await r.json() : null;
    const obj = (Array.isArray(raw) ? { pieces: raw } : raw) as { pieces?: unknown; zones?: unknown } | null;
    const pieces = (Array.isArray(obj?.pieces) ? obj.pieces : []).filter((p): p is Piece => !!p && typeof (p as Piece).file === 'string');
    const zones = (Array.isArray(obj?.zones) ? obj.zones : []).filter((z): z is ZoneSpec => {
      const s = z as ZoneSpec;
      return !!s && typeof s.id === 'string' && Array.isArray(s.files) && s.files.length > 0 && Array.isArray(s.sites) && s.sites.length > 0
        && s.sites.every(p => Array.isArray(p) && isNum(p[0]) && isNum(p[1])) && isNum(s.near) && isNum(s.far) && s.far > s.near;
    });
    return { pieces, zones };
  } catch {
    return { pieces: [], zones: [] };
  }
}
