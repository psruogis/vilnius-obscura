// Downloads browser dependencies from the jsDelivr CDN into public/vendor/.
// Used while the npm registry is unreachable on this network; the app code
// stays Vite-compatible (bare imports resolved by an import map in dev).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'vendor');

export const VERSIONS = { three: '0.186.1', suncalc: '1.9.0' };

const FILES = [
  ['three', VERSIONS.three, 'build/three.module.js'],
  ['three', VERSIONS.three, 'build/three.core.js'],
  ['three', VERSIONS.three, 'examples/jsm/objects/Sky.js'],
  ['three', VERSIONS.three, 'examples/jsm/utils/BufferGeometryUtils.js'],
  ['three', VERSIONS.three, 'examples/jsm/loaders/GLTFLoader.js'],
  ['three', VERSIONS.three, 'examples/jsm/utils/SkeletonUtils.js'],
  ['three', VERSIONS.three, 'LICENSE'],
  ['suncalc', VERSIONS.suncalc, '+esm', 'suncalc.mjs'],
  ['suncalc', VERSIONS.suncalc, 'LICENSE', 'LICENSE'],
];

// three.js add-ons, fetched with their relative imports (crawled)
const THREE_ADDONS = [
  'examples/jsm/postprocessing/EffectComposer.js', 'examples/jsm/postprocessing/RenderPass.js',
  'examples/jsm/postprocessing/OutputPass.js', 'examples/jsm/postprocessing/GTAOPass.js',
  'examples/jsm/postprocessing/UnrealBloomPass.js', 'examples/jsm/postprocessing/SMAAPass.js',
  'examples/jsm/postprocessing/ShaderPass.js', 'examples/jsm/csm/CSM.js',
];
{
  const seen = new Set(FILES.filter(f => f[0] === 'three').map(f => f[2]));
  const queue = [...THREE_ADDONS];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file) && fs.existsSync(path.join(OUT, 'three', file))) continue;
    seen.add(file);
    const dest = path.join(OUT, 'three', file);
    let src;
    if (fs.existsSync(dest)) src = fs.readFileSync(dest, 'utf8');
    else {
      const url = `https://cdn.jsdelivr.net/npm/three@${VERSIONS.three}/${file}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      src = await res.text();
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, src);
      console.log(`vendored three@${VERSIONS.three}/${file}`);
    }
    for (const m of src.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const dep = path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1]));
      if (!seen.has(dep)) queue.push(dep);
    }
  }
}

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
