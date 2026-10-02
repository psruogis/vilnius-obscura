// Static build without npm: strips TypeScript with Node's built-in stripTypeScriptTypes, rewrites
// extensionless relative imports to .js, and copies public/ into dist/. The result runs on any static
// host, at the site root or under a sub-path (all URLs are relative; bare imports use an import map).
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
      js = js.replace(/assets\/char\/([\w-]+)\.glb/g, 'assets/char/$1.gltf.json'); // see the model conversion below
      fs.writeFileSync(out.replace(/\.ts$/, '.js'), js);
    } else {
      fs.copyFileSync(src, out);
    }
  }
}
build(path.join(ROOT, 'src'));

// Vercel Web Analytics: Vercel serves the counting script itself, from an absolute path that exists
// nowhere else, so it goes in only when Vercel is doing the build (it sets VERCEL). Every other copy of
// dist/ stays as it was: relative URLs throughout, and nothing phoning home. Web Analytics also has to
// be turned on for the project in the Vercel dashboard, or the script 404s there too.
const ANALYTICS = process.env.VERCEL ? '\n    <script defer src="/_vercel/insights/script.js"></script>' : '';

// Page
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace('<head>', `<head>\n    <script type="importmap">${JSON.stringify(IMPORT_MAP)}</script>${ANALYTICS}`)
  .replace('href="/src/style.css"', 'href="src/style.css"')
  .replace('src="/src/main.ts"', 'src="src/main.js"');
fs.writeFileSync(path.join(DIST, 'index.html'), html);

// The Subačius Gate on its own (gate.html), and its artifact page (content only, stylesheet inlined)
const gateCss = fs.readFileSync(path.join(ROOT, 'src', 'gate.css'), 'utf8');
fs.writeFileSync(path.join(DIST, 'gate.html'), fs.readFileSync(path.join(ROOT, 'gate.html'), 'utf8')
  .replace('<head>', `<head>\n    <script type="importmap">${JSON.stringify(IMPORT_MAP)}</script>${ANALYTICS}`)
  .replace('href="/src/gate.css"', 'href="src/gate.css"')
  .replace('src="/src/gate.ts"', 'src="src/gate.js"'));
fs.writeFileSync(path.join(DIST, 'gate-artifact.html'), `<title>Vilnius Gates Model</title>
<style>
${gateCss}</style>
<script type="importmap">${JSON.stringify(IMPORT_MAP)}</script>
<div id="app"></div>
<script type="module" src="src/gate.js"></script>
`);

// claude.ai artifact page: content only (the host adds doctype, head and body), stylesheet inlined.
// A single deliberate dark look, so the page paints its own background and pins color-scheme.
const css = fs.readFileSync(path.join(ROOT, 'src', 'style.css'), 'utf8');
fs.writeFileSync(path.join(DIST, 'artifact.html'), `<title>Vilnius Town Hall Walk</title>
<style>
:root { color-scheme: dark; }
${css}</style>
<script type="importmap">${JSON.stringify(IMPORT_MAP)}</script>
<div id="app"></div>
<script type="module" src="src/main.js"></script>
`);

// Public files (vendor libraries, textures, models, sounds, area data)
fs.cpSync(path.join(ROOT, 'public'), DIST, { recursive: true });
// Models: GLB -> self-contained glTF JSON (buffers as data URIs). Some hosts, claude.ai artifacts among
// them, serve only web media types; GLTFLoader reads either form.
const charDir = path.join(DIST, 'assets', 'char');
for (const f of fs.existsSync(charDir) ? fs.readdirSync(charDir) : []) {
  if (!f.endsWith('.glb')) continue;
  const glb = fs.readFileSync(path.join(charDir, f));
  const jsonLen = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const binLen = glb.readUInt32LE(20 + jsonLen);
  gltf.buffers[0].uri = `data:application/octet-stream;base64,${glb.subarray(binStart, binStart + binLen).toString('base64')}`;
  fs.writeFileSync(path.join(charDir, f.replace(/\.glb$/, '.gltf.json')), JSON.stringify(gltf));
  fs.rmSync(path.join(charDir, f));
}
for (const f of ['CREDITS.md', 'README.md']) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(DIST, f));

// Size report
let total = 0, count = 0;
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { total += fs.statSync(p).size; count++; } } };
walk(DIST);
console.log(`dist/: ${count} files, ${(total / 1e6).toFixed(1)} MB`);
