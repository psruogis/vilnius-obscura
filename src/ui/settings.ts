import type { Look } from './map';

/**
 * The player's options, kept in localStorage. The Options screen edits a working copy that is applied to the
 * running game at once (so a volume can be heard while it is set); Accept keeps it, Cancel goes back to what
 * was kept, Default resets it. Weather is fixed when the world is built, so a change of weather is kept on
 * Accept and the walk reloads. ?weather=, ?map= and ?quality= in the address override what was kept (for
 * links and tests) without changing it.
 */
export type Quality = 'low' | 'medium' | 'high';
export type Weather = 'rain' | 'clear';

export interface Settings {
  weather: Weather;
  /** 0 to 100; 50 leaves the picture as rendered. */
  brightness: number;
  saturation: number;
  mapLook: Look;
  quality: Quality;
  reflections: boolean;
  /** 0 to 100; 100 is the level the mix was made at. */
  master: number;
  street: number;
  bells: number;
  steps: number;
  music: number;
}

const KEY = 'vo.settings';
const LOOKS: Look[] = ['pastel', 'dark', 'glow'];
const QUALITIES: Quality[] = ['low', 'medium', 'high'];
const WEATHERS: Weather[] = ['rain', 'clear'];
const SLIDERS = ['brightness', 'saturation', 'master', 'street', 'bells', 'steps', 'music'] as const;

export function defaults(): Settings {
  const phone = window.matchMedia('(pointer: coarse)').matches;
  return {
    weather: 'rain', brightness: 50, saturation: 50, mapLook: 'pastel',
    quality: phone ? 'medium' : 'high', reflections: true,
    master: 100, street: 100, bells: 100, steps: 100, music: 100,
  };
}

const oneOf = <T extends string>(list: T[], v: unknown, fallback: T): T => (list as string[]).includes(v as string) ? v as T : fallback;

function clean(raw: unknown, base: Settings): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const s: Settings = { ...base };
  s.weather = oneOf(WEATHERS, r.weather, base.weather);
  s.mapLook = oneOf(LOOKS, r.mapLook, base.mapLook);
  s.quality = oneOf(QUALITIES, r.quality, base.quality);
  if (typeof r.reflections === 'boolean') s.reflections = r.reflections;
  for (const k of SLIDERS) if (typeof r[k] === 'number' && Number.isFinite(r[k])) s[k] = Math.round(Math.min(100, Math.max(0, r[k] as number)));
  return s;
}

/** What was kept, without the address's overrides. */
export function loadKept(): Settings {
  try { return clean(JSON.parse(localStorage.getItem(KEY) ?? 'null'), defaults()); } catch { return defaults(); }
}

export function saveKept(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* the choice lasts until the page closes */ }
}

/** The weather the page was asked for: the address first, then what was kept. */
export function weatherNow(): Weather {
  const q = new URLSearchParams(location.search).get('weather');
  return q === 'clear' ? 'clear' : q === 'rain' ? 'rain' : loadKept().weather;
}

export class SettingsStore {
  /** What is kept (the address's overrides are not part of it). */
  private kept: Settings = loadKept();
  /** What is applied now: the kept settings with the address's overrides, then any edits not yet accepted. */
  current: Settings;
  /** What Cancel goes back to: what was showing when the edits began. */
  private baseline: Settings;
  /** Settings the player has changed since the last Accept: only these are kept, so an address's override never is. */
  private touched = new Set<keyof Settings>();
  /** The weather the running world was built with. */
  readonly running: Weather = weatherNow();
  private apply: (s: Settings) => void = () => {};
  private listeners: (() => void)[] = [];

  constructor() {
    const q = new URLSearchParams(location.search);
    this.current = clean({ ...this.kept, weather: this.running, mapLook: q.get('map') ?? this.kept.mapLook, quality: q.get('quality') ?? this.kept.quality }, this.kept);
    this.baseline = { ...this.current };
  }

  /** The game says how to put settings to use, and they are applied once, now. */
  bind(apply: (s: Settings) => void): void {
    this.apply = apply;
    apply(this.current);
  }

  onChange(fn: () => void): void { this.listeners.push(fn); }

  private put(next: Settings): void {
    this.current = next;
    this.apply(next);
    for (const fn of this.listeners) fn();
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.touched.add(key);
    this.put({ ...this.current, [key]: value });
  }

  /** Keeps something chosen elsewhere (the look switch on the full map) at once, outside Accept and Cancel. */
  keep<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.kept = { ...this.kept, [key]: value };
    saveKept(this.kept);
    this.baseline = { ...this.baseline, [key]: value };
    this.touched.delete(key);
    this.put({ ...this.current, [key]: value });
  }

  /** Keeps what the player changed. Returns true when the weather it asks for is not the one the world was built with. */
  accept(): boolean {
    const next = { ...this.kept };
    for (const k of this.touched) (next as Record<string, unknown>)[k] = this.current[k];
    this.kept = next;
    saveKept(next);
    this.baseline = { ...this.current };
    this.touched.clear();
    return this.current.weather !== this.running;
  }

  cancel(): void {
    this.touched.clear();
    this.put({ ...this.baseline });
  }

  reset(): void {
    const d = defaults();
    for (const k of Object.keys(d) as (keyof Settings)[]) this.touched.add(k);
    this.put(d);
  }
}
