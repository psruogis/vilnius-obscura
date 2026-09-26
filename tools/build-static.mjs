// Static build without npm: strips TypeScript with Node's built-in stripTypeScriptTypes, rewrites
// extensionless relative imports to .js, and copies public/ into dist/. The result runs on any static
// host, at the site root or under a sub-path (all URLs are relative; bare imports use an import map).
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');
const IMPORT_MAP = {
  imports: {
    three: './vendor/three/build/three.module.js',
    'three/examples/jsm/': './vendor/three/examples/jsm/',
    suncalc: './vendor/suncalc/suncalc.mjs',
  },
};

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// Source: .ts -> .js
const withExt = spec => (/\.(m?js|css|json)$/.test(spec) ? spec : `${spec}.js`);
function build(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const src = path.join(dir, e.name);
    const rel = path.relative(ROOT, src);
    if (e.isDirectory()) { build(src); continue; }
    const out = path.join(DIST, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    if (e.name.endsWith('.ts')) {
      let js = stripTypeScriptTypes(fs.readFileSync(src, 'utf8'), { mode: 'transform', sourceUrl: rel });
      js = js.replaceAll('import.meta.env.DEV', 'false');
      js = js.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\2/g, (_, pre, q, spec) => `${pre}${q}${withExt(spec)}${q}`);
      fs.writeFileSync(out.replace(/\.ts$/, '.js'), js);
    } else {
      fs.copyFileSync(src, out);
    }
  }
}
build(path.join(ROOT, 'src'));

// Page
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace('<head>', `<head>\n    <script type="importmap">${JSON.stringify(IMPORT_MAP)}</script>`)
  .replace('href="/src/style.css"', 'href="src/style.css"')
  .replace('src="/src/main.ts"', 'src="src/main.js"');
fs.writeFileSync(path.join(DIST, 'index.html'), html);

// Public files (vendor libraries, textures, models, sounds, area data)
fs.cpSync(path.join(ROOT, 'public'), DIST, { recursive: true });
for (const f of ['CREDITS.md', 'README.md']) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(DIST, f));

// Size report
let total = 0, count = 0;
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { total += fs.statSync(p).size; count++; } } };
walk(DIST);
console.log(`dist/: ${count} files, ${(total / 1e6).toFixed(1)} MB`);
