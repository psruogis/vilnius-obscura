import type { AreaData, XZ } from '../world/area';

/**
 * The name of the street you are walking on, as a title at the top of the screen for a few seconds, then fading.
 * It is announced when the walker has settled onto a new street (a corner does not count), the first time at the start of
 * the walk, and not again for the same street within half a minute. The names are the map's: today's names, from
 * OpenStreetMap. Around 1900 many streets had other, Russian names (docs/map-sources.md), and which is not researched.
 */
const NEAR = 14;     // m from a street's centre line that still counts as being on it
const KEEP = 3;      // m: the street you are on keeps you until another is this much closer
const SETTLE = 0.7;  // s on a new street before it is announced
const AGAIN = 30;    // s before the same street is announced again
const HOLD = 3.8;    // s the title stays before it fades
const TICK = 0.2;    // s between looks at the ground under the walker

/** English for the places the walk is about. */
const ENGLISH: Record<string, string> = { 'Rotušės a.': 'Town Hall Square' };

/** "Vokiečių g." as it is said in full: "Vokiečių gatvė". */
export function fullName(name: string): string {
  return name.replace(/\bskg\.$/, 'skersgatvis').replace(/\bpr\.$/, 'prospektas').replace(/\bg\.$/, 'gatvė').replace(/\ba\.$/, 'aikštė');
}

interface Street { name: string; line: XZ[]; x0: number; z0: number; x1: number; z1: number }
interface Square { name: string; ring: XZ[]; x0: number; z0: number; x1: number; z1: number }

const box = (pts: XZ[]) => ({
  x0: Math.min(...pts.map(p => p[0])), z0: Math.min(...pts.map(p => p[1])),
  x1: Math.max(...pts.map(p => p[0])), z1: Math.max(...pts.map(p => p[1])),
});

function distToSegment(px: number, pz: number, a: XZ, b: XZ): number {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = dx * dx + dz * dz;
  const t = len ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / len)) : 0;
  return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz));
}

function inside(px: number, pz: number, ring: XZ[]): boolean {
  let c = false;
  for (let i = 0, n = ring.length; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    if ((a[1] > pz) !== (b[1] > pz) && px < (b[0] - a[0]) * (pz - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

export class PlaceTitle {
  private readonly el: HTMLElement;
  private readonly nameEl: HTMLElement;
  private readonly subEl: HTMLElement;
  private readonly streets: Street[];
  private readonly squares: Square[];
  private current: string | null = null;
  private candidate: string | null = null;
  private wait = 0;
  private acc = 0;
  private clock = 0;
  private active = false;
  private readonly last = new Map<string, number>();
  private timer = 0;

  constructor(data: AreaData) {
    this.streets = data.roads
      .filter(r => r.name && !r.tunnel && r.line.length > 1)
      .map(r => ({ name: r.name!, line: r.line, ...box(r.line) }));
    this.squares = data.areas.filter(a => a.name && a.ring.length > 2).map(a => ({ name: a.name!, ring: a.ring, ...box(a.ring) }));
    this.el = document.createElement('div');
    this.el.className = 'streettitle';
    this.el.setAttribute('role', 'status');
    this.el.innerHTML = '<div class="st-name"></div><svg class="st-rule" width="150" height="10" viewBox="0 0 150 10" fill="none" aria-hidden="true"><path d="M0 5H62M88 5H150" stroke="#8e8073" stroke-width="1.2"/><path d="M75 0.5L80.5 5L75 9.5L69.5 5Z" fill="#a63c3c" stroke="#d9cdb8" stroke-width="0.8"/></svg><div class="st-sub"></div>';
    this.nameEl = this.el.querySelector('.st-name')!;
    this.subEl = this.el.querySelector('.st-sub')!;
    document.body.appendChild(this.el);
  }

  /** Off while the title or pause screen is up (nothing is announced, and a title on screen goes); on when the walk goes on. */
  setActive(on: boolean): void {
    this.active = on;
    if (!on) { window.clearTimeout(this.timer); this.el.classList.remove('show'); return; }
    this.current = null; this.candidate = null; this.acc = TICK; // look again at once
  }

  /** The name of the square the point is in, else of the street it is on (or null out in the open, far from any). */
  private where(x: number, z: number): string | null {
    for (const s of this.squares) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && inside(x, z, s.ring)) return s.name;
    const near = new Map<string, number>();
    for (const s of this.streets) {
      if (x < s.x0 - NEAR || x > s.x1 + NEAR || z < s.z0 - NEAR || z > s.z1 + NEAR) continue;
      let d = Infinity;
      for (let i = 0; i + 1 < s.line.length; i++) d = Math.min(d, distToSegment(x, z, s.line[i], s.line[i + 1]));
      if (d <= NEAR && d < (near.get(s.name) ?? Infinity)) near.set(s.name, d);
    }
    let best: string | null = null, bd = Infinity;
    for (const [n, d] of near) if (d < bd) { best = n; bd = d; }
    const mine = this.current === null ? undefined : near.get(this.current);
    if (best !== null && mine !== undefined && bd > mine - KEEP) return this.current;
    return best;
  }

  /** Once a frame, while walking. */
  update(dt: number, x: number, z: number): void {
    if (!this.active) return;
    this.clock += dt;
    this.acc += dt;
    if (this.acc < TICK) return;
    const step = this.acc;
    this.acc = 0;
    const here = this.where(x, z);
    if (here === null || here === this.current) { this.candidate = null; this.wait = 0; return; }
    if (here !== this.candidate) { this.candidate = here; this.wait = 0; }
    this.wait += step;
    if (this.current !== null && this.wait < SETTLE) return;
    this.current = here;
    this.candidate = null;
    this.announce(here);
  }

  private announce(name: string): void {
    if (this.clock - (this.last.get(name) ?? -Infinity) < AGAIN) return;
    this.last.set(name, this.clock);
    this.nameEl.textContent = fullName(name);
    const en = ENGLISH[name] ?? '';
    this.subEl.textContent = en;
    this.subEl.hidden = !en;
    window.clearTimeout(this.timer);
    this.el.classList.remove('show');
    void this.el.offsetWidth; // start the fade-in again if a title was still fading out
    this.el.classList.add('show');
    this.timer = window.setTimeout(() => this.el.classList.remove('show'), HOLD * 1000);
  }

  /** For tests. */
  get shown(): { name: string; visible: boolean } {
    return { name: this.nameEl.textContent ?? '', visible: this.el.classList.contains('show') };
  }
}
