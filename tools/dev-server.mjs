// Zero-dependency dev server: serves index.html with an import map, strips
// TypeScript on the fly (Node's built-in stripTypeScriptTypes), and serves
// public/ at the root, mirroring Vite's layout.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5173;

const IMPORT_MAP = {
  imports: {
    three: '/vendor/three/build/three.module.js',
    'three/examples/jsm/': '/vendor/three/examples/jsm/',
    suncalc: '/vendor/suncalc/suncalc.mjs',
  },
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.ktx2': 'image/ktx2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
};

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function serveTs(file, res) {
  const src = fs.readFileSync(file, 'utf8');
  let js = stripTypeScriptTypes(src, { mode: 'transform', sourceUrl: file });
  js = js.replaceAll('import.meta.env.DEV', 'true');
  send(res, 200, MIME['.js'], js);
}

function saveSnapshot(req, res, name) {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const dataUrl = Buffer.concat(chunks).toString('utf8');
    const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const dir = path.join(ROOT, '.screens');
    fs.mkdirSync(dir, { recursive: true });
    const safe = (name || 'shot').replace(/[^a-z0-9_-]/gi, '_');
    const file = path.join(dir, `${safe}.jpg`);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    send(res, 200, 'text/plain', file);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let p = decodeURIComponent(url.pathname);
  if (req.method === 'POST' && p === '/__snapshot') return saveSnapshot(req, res, url.searchParams.get('name'));
  try {
    // the pages: the walk, and the Subačius Gate on its own (gate.html)
    if (p === '/' || p === '/index.html' || p === '/gate.html') {
      const html = fs.readFileSync(path.join(ROOT, p === '/' ? 'index.html' : p.slice(1)), 'utf8').replace(
        '<head>',
        `<head>\n    <script type="importmap">${JSON.stringify(IMPORT_MAP)}</script>`,
      );
      return send(res, 200, MIME['.html'], html);
    }
    if (p.startsWith('/src/')) {
      const base = path.join(ROOT, p);
      if (!base.startsWith(path.join(ROOT, 'src'))) return send(res, 403, 'text/plain', 'Forbidden');
      if (p.endsWith('.css')) return send(res, 200, MIME['.css'], fs.readFileSync(base));
      const ts = base.endsWith('.ts') ? base : `${base}.ts`;
      if (fs.existsSync(ts)) return serveTs(ts, res);
      if (fs.existsSync(path.join(base, 'index.ts'))) return serveTs(path.join(base, 'index.ts'), res);
      return send(res, 404, 'text/plain', `Not found: ${p}`);
    }
    const file = path.join(ROOT, 'public', p);
    if (!file.startsWith(path.join(ROOT, 'public'))) return send(res, 403, 'text/plain', 'Forbidden');
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      return send(res, 200, MIME[path.extname(file)] || 'application/octet-stream', fs.readFileSync(file));
    }
    send(res, 404, 'text/plain', `Not found: ${p}`);
  } catch (err) {
    console.error(err);
    send(res, 500, 'text/plain', String(err));
  }
});

server.listen(PORT, () => console.log(`dev server on http://localhost:${PORT}`));
