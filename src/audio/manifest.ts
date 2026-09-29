/**
 * What music the walk has: public/assets/music/tracks.json. There is no music everywhere: every piece belongs to
 * a place, and is heard only near it (zones.ts).
 *
 *   zones: each has `files` (played one after another while the walker is in earshot) and `sites`, in metres east
 *          and south of the Town Hall (the map's x and z). It is loudest within `near` metres of a site and gone
 *          beyond `far`. `level` (0 to 1, default 0.5) is how loud it is at best; `height` (m, default 3) is how
 *          far above the ground the sound comes from: a window, a step.
 *
 * Every file must be free to use in Europe as well as the US: a recording over 70 years old or released to the
 * public domain (CC0), of music whose composer died over 70 years ago (or a traditional tune); and be listed in
 * CREDITS.md.
 */
export interface ZoneSpec { id: string; title?: string; files: string[]; sites: [number, number][]; near: number; far: number; level?: number; height?: number }
export interface Manifest { zones: ZoneSpec[] }

export const MUSIC_BASE = 'assets/music/';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export async function loadManifest(): Promise<Manifest> {
  try {
    const r = await fetch(`${MUSIC_BASE}tracks.json`);
    const raw = (r.ok ? await r.json() : null) as { zones?: unknown } | null;
    const zones = (Array.isArray(raw?.zones) ? raw.zones : []).filter((z): z is ZoneSpec => {
      const s = z as ZoneSpec;
      return !!s && typeof s.id === 'string' && Array.isArray(s.files) && s.files.length > 0 && Array.isArray(s.sites) && s.sites.length > 0
        && s.sites.every(p => Array.isArray(p) && isNum(p[0]) && isNum(p[1])) && isNum(s.near) && isNum(s.far) && s.far > s.near;
    });
    return { zones };
  } catch {
    return { zones: [] };
  }
}
