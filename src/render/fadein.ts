import * as THREE from 'three';

/**
 * Fades late arrivals in (the townsfolk, the carriages), so that whoever is already walking sees them appear
 * rather than pop. Each material is made transparent and brought up from nothing over `seconds`, then given back
 * its own transparency and opacity. Changing these needs no shader recompile.
 */
export class FadeIns {
  private readonly fades: { mats: { m: THREE.Material; transparent: boolean; opacity: number }[]; t0: number; seconds: number }[] = [];

  add(object: THREE.Object3D, seconds = 1.5): void {
    const seen = new Set<THREE.Material>();
    object.traverse(o => {
      const m = (o as THREE.Mesh).material;
      if (m) for (const x of Array.isArray(m) ? m : [m]) seen.add(x);
    });
    const mats = [...seen].map(m => ({ m, transparent: m.transparent, opacity: m.opacity }));
    for (const x of mats) { x.m.transparent = true; x.m.opacity = 0; }
    this.fades.push({ mats, t0: performance.now(), seconds });
  }

  /** By the clock, not the frame time: a slow machine still sees them arrive within the fade. */
  update(): void {
    const now = performance.now();
    for (let i = this.fades.length - 1; i >= 0; i--) {
      const f = this.fades[i];
      const k = Math.min(1, (now - f.t0) / 1000 / f.seconds), e = k * k * (3 - 2 * k);
      for (const x of f.mats) x.m.opacity = x.opacity * e;
      if (k < 1) continue;
      for (const x of f.mats) { x.m.transparent = x.transparent; x.m.opacity = x.opacity; }
      this.fades.splice(i, 1);
    }
  }
}
