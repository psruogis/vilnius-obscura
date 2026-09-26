// Downloads browser dependencies from the jsDelivr CDN into public/vendor/.
// Used while the npm registry is unreachable on this network; the app code
// stays Vite-compatible (bare imports resolved by an import map in dev).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'public', 'vendor');

export const VERSIONS = { three: '0.186.1', suncalc: '1.9.0' };

const FILES = [
  ['three', VERSIONS.three, 'build/three.module.js'],
  ['three', VERSIONS.three, 'build/three.core.js'],
  ['three', VERSIONS.three, 'examples/jsm/objects/Sky.js'],
  ['three', VERSIONS.three, 'examples/jsm/utils/BufferGeometryUtils.js'],
  ['three', VERSIONS.three, 'LICENSE'],
  ['suncalc', VERSIONS.suncalc, '+esm', 'suncalc.mjs'],
  ['suncalc', VERSIONS.suncalc, 'LICENSE', 'LICENSE'],
];

for (const [pkg, ver, file, saveAs] of FILES) {
  const url = `https://cdn.jsdelivr.net/npm/${pkg}@${ver}/${file}`;
  const dest = path.join(OUT, pkg, saveAs ?? file);
  if (fs.existsSync(dest)) continue;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`vendored ${pkg}@${ver}/${file}`);
}
