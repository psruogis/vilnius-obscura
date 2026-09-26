import * as THREE from 'three';
import type { Terrain } from './terrain';

/**
 * Where rainwater runs on the streets, baked once from the real terrain (LiDAR) and the building
 * outlines, at 1 m: every open cell drains to its steepest lower neighbour (D8), with shallow gutters
 * along the house walls and roof water from the downpipes added at the walls; water is accumulated
 * downhill. Packed as RGBA: R = how much water runs here (log scale), G/B = flow direction,
 * A = distance to the nearest wall (0-8 m). The street shader (render/weather.ts) turns it into
 * running water, wet joints and mud.
 */
export interface FlowMap { tex: THREE.DataTexture; box: THREE.Vector4; stats: { cells: number; maxAcc: number; streams: number } }

export function buildFlowMap(terrain: Terrain, free: (x: number, z: number) => boolean, cx: number, cz: number, R = 200): FlowMap {
  const N = R * 2, x0 = cx - R, z0 = cz - R, NN = N * N;
  const open = new Uint8Array(NN);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) open[j * N + i] = free(x0 + i + 0.5, z0 + j + 0.5) ? 1 : 0;

  // distance to the nearest building cell (two-pass chamfer)
  const D = new Float32Array(NN);
  for (let k = 0; k < NN; k++) D[k] = open[k] ? 1e6 : 0;
  const S2 = Math.SQRT2;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i; let d = D[k];
    if (i > 0) d = Math.min(d, D[k - 1] + 1);
    if (j > 0) { d = Math.min(d, D[k - N] + 1); if (i > 0) d = Math.min(d, D[k - N - 1] + S2); if (i < N - 1) d = Math.min(d, D[k - N + 1] + S2); }
    D[k] = d;
  }
  for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) {
    const k = j * N + i; let d = D[k];
    if (i < N - 1) d = Math.min(d, D[k + 1] + 1);
    if (j < N - 1) { d = Math.min(d, D[k + N] + 1); if (i < N - 1) d = Math.min(d, D[k + N + 1] + S2); if (i > 0) d = Math.min(d, D[k + N - 1] + S2); }
    D[k] = d;
  }

  // ground height with gutters along the walls and a smooth large-scale tilt to drain flat ground coherently
  const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const smooth = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const H = new Float32Array(NN);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    if (!open[k]) { H[k] = 1e6; continue; }
    const x = x0 + i + 0.5, z = z0 + j + 0.5, d = D[k];
    const gutter = d <= 1.5 ? 0.2 : d <= 2.5 ? 0.09 : 0;   // stone gutters along the house fronts
    H[k] = terrain.heightAt(x, z) - gutter + (smooth(x / 23, z / 23) - 0.5) * 0.05 + hash(i, j) * 0.002;
  }

  // D8 downstream neighbour (steepest descent among open cells)
  const down = new Int32Array(NN).fill(-1);
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, S2], [1, -1, S2], [-1, 1, S2], [-1, -1, S2]];
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    const k = j * N + i;
    if (!open[k]) continue;
    let best = -1, bs = 0;
    for (const [di, dj, dl] of nb) {
      const q = k + dj * N + di;
      if (!open[q]) continue;
      const s = (H[k] - H[q]) / dl;
      if (s > bs) { bs = s; best = q; }
    }
    down[k] = best;
  }

  // accumulate downhill: rain on every open cell, roof water from downpipes at the walls
  const order: number[] = [];
  for (let k = 0; k < NN; k++) if (open[k]) order.push(k);
  order.sort((a, b) => H[b] - H[a]);
  const acc = new Float32Array(NN);
  for (const k of order) acc[k] = 1 + (D[k] <= 1.5 ? 4 : 0);
  for (const k of order) if (down[k] >= 0) acc[down[k]] += acc[k];

  // amount (log scale), direction (acc-weighted average of neighbouring flow), light blur for width
  const amt = new Float32Array(NN), dx = new Float32Array(NN), dz = new Float32Array(NN);
  const LOGMAX = Math.log(20000);
  for (const k of order) {
    amt[k] = Math.min(1, Math.log(acc[k]) / LOGMAX);
    const q = down[k];
    if (q >= 0) { const w = Math.log(1 + acc[k]); dx[k] = ((q % N) - (k % N)) * w; dz[k] = (Math.floor(q / N) - Math.floor(k / N)) * w; }
  }
  const data = new Uint8Array(NN * 4);
  let maxAcc = 0, streams = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    let a = 0, wsum = 0, vx = 0, vz = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
      const q = jj * N + ii, w = di === 0 && dj === 0 ? 0.4 : 0.075;
      a += amt[q] * w; wsum += w; vx += dx[q]; vz += dz[q];
    }
    a = open[k] ? Math.max(amt[k] * 0.85, a / wsum) : 0;
    const vl = Math.hypot(vx, vz) || 1;
    data[k * 4] = Math.round(a * 255);
    data[k * 4 + 1] = Math.round((vx / vl * 0.5 + 0.5) * 255);
    data[k * 4 + 2] = Math.round((vz / vl * 0.5 + 0.5) * 255);
    data[k * 4 + 3] = Math.round(Math.min(8, D[k]) / 8 * 255);
    maxAcc = Math.max(maxAcc, acc[k]);
    if (a > 0.6) streams++;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return { tex, box: new THREE.Vector4(x0, z0, 1 / N, 0), stats: { cells: order.length, maxAcc, streams } };
}
