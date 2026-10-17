import type { AreaData } from './area';
import { facadeChunkOrder, type FacadeParts } from './facades';
import type { GroundRaster } from './ground';

/**
 * The façades built on workers, a share of the CHUNK squares each, while the page builds everything else
 * (facades.worker.ts). The squares are dealt out by how many houses they hold, the fullest first, each to the
 * least-loaded worker. Null where there are no workers; the promise rejects if one fails (main.ts then builds
 * them on the page).
 */
let spare: Worker[] = [];

/** Starts the workers early (main.ts, before anything else): loading their code needs the page's thread, which is
 * free only until the world build starts. */
export function warmFacadeWorkers(): void {
  if (typeof Worker === 'undefined') return;
  const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  try {
    spare = Array.from({ length: n }, () => {
      const w = new Worker(new URL('./facades.worker.js', import.meta.url), { type: 'module' });
      w.onerror = () => { spare = spare.filter(x => x !== w); w.terminate(); };   // failed to load: not used
      return w;
    });
  } catch { spare = []; }
}

export function facadesOnWorkers(data: AreaData, ground: GroundRaster): Promise<FacadeParts[]> | null {
  if (typeof Worker === 'undefined') return null;
  const order = facadeChunkOrder(data);
  const houses = new Map<string, number>();
  for (const k of facadeChunkOrder(data, true)) houses.set(k, (houses.get(k) ?? 0) + 1);
  const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1, order.length));
  const shares = Array.from({ length: n }, () => ({ load: 0, only: [] as string[] }));
  for (const k of [...order].sort((a, b) => houses.get(b)! - houses.get(a)!)) {
    const s = shares.reduce((a, b) => (b.load < a.load ? b : a));
    s.only.push(k); s.load += houses.get(k)!;
  }
  const work = Promise.all(shares.map(({ only }) => new Promise<FacadeParts>((res, rej) => {
    const w = spare.pop() ?? new Worker(new URL('./facades.worker.js', import.meta.url), { type: 'module' });
    w.onmessage = e => { res(e.data as FacadeParts); w.terminate(); };
    w.onerror = e => { rej(new Error(`façade worker: ${e.message}`)); w.terminate(); };
    w.postMessage({ area: data, ground, only });
  })));
  for (const w of spare.splice(0)) w.terminate();
  // never wait for ever: after 30 s main.ts builds the façades on the page instead
  return Promise.race([work, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('façade workers timed out')), 30000))]);
}
