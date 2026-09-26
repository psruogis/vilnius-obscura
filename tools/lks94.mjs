// WGS84 lon/lat -> LKS94 / Lithuania TM (EPSG:3346), Krüger series (as PROJ etmerc).
const a = 6378137, f = 1 / 298.257222101, k0 = 0.9998, lon0 = (24 * Math.PI) / 180, FE = 500000;
const n = f / (2 - f), n2 = n * n, n3 = n2 * n, n4 = n3 * n;
const A = (a / (1 + n)) * (1 + n2 / 4 + n4 / 64);
const alpha = [
  n / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180,
  (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440,
  (61 * n3) / 240 - (103 * n4) / 140,
  (49561 * n4) / 161280,
];
const c = (2 * Math.sqrt(n)) / (1 + n);

/** @returns {[number, number]} [E, N] in metres */
export function toLks94(lon, lat) {
  const phi = (lat * Math.PI) / 180, dl = (lon * Math.PI) / 180 - lon0;
  const s = Math.sin(phi);
  const t = Math.sinh(Math.atanh(s) - c * Math.atanh(c * s));
  const xi1 = Math.atan2(t, Math.cos(dl));
  const eta1 = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
  let xi = xi1, eta = eta1;
  for (let j = 1; j <= 4; j++) {
    xi += alpha[j - 1] * Math.sin(2 * j * xi1) * Math.cosh(2 * j * eta1);
    eta += alpha[j - 1] * Math.cos(2 * j * xi1) * Math.sinh(2 * j * eta1);
  }
  return [FE + k0 * A * eta, k0 * A * xi];
}
