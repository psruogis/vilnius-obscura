// How long the walk takes to load, and where the time goes. Serves dist/ the way Vercel does (text files
// brotli-compressed, assets cacheable), opens it in a fresh headless Chrome with an empty cache, and reports the
// load phases main.ts marks (area data, world built, first frames, ready to walk), what was downloaded and when,
// and the main thread's busiest scripts.
//
//   node tools/build-static.mjs && node tools/load-profile.mjs [--mbps 25] [--runs 3] [--query weather=clear]
//                                                             [--size 1600x900] [--json out.json]
//
// --mbps throttles the download (one shared line, 40 ms latency; the server paces it) to stand in for a home
// connection; without it the files come from this machine. Chrome comes from $CHROME (default: Google Chrome on macOS, `chromium` elsewhere). On a
// machine without a GPU (a Linux container) WebGL runs in software, so the first-frame time there is far longer
// than on a real graphics card; the other phases are not affected.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const MBPS = Number(opt('mbps', 0));
const RUNS = Number(opt('runs', 1));
const QUERY = opt('query', '');
const [W, H] = opt('size', '1600x900').split('x').map(Number);
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.CHROME || (process.platform === 'darwin' ? MAC_CHROME : 'chromium');
const ANGLE = process.env.ANGLE || (process.platform === 'darwin' ? 'metal' : 'swiftshader');
if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error('no dist/: run node tools/build-static.mjs first'); process.exit(1); }

// --- a static server like the host: text compressed, everything under assets/ and vendor/ cached for a year
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ktx2': 'image/ktx2',
  '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.md': 'text/markdown',
};
const TEXT = /^(text\/|application\/json|image\/svg)/;
const packed = new Map();
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(DIST, path.normalize(rel));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
  const headers = { 'Content-Type': type };
  if (/^\/(assets|vendor)\//.test(rel)) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  let body = fs.readFileSync(file);
  if (TEXT.test(type) && /\bbr\b/.test(req.headers['accept-encoding'] ?? '')) {
    if (!packed.has(file)) packed.set(file, zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }));
    body = packed.get(file); headers['Content-Encoding'] = 'br';
  }
  headers['Content-Length'] = body.length;
  if (!MBPS) { res.writeHead(200, headers); res.end(body); return; }
  // --mbps: one shared line, 40 ms away. Each 16 KB goes out at the line's next free moment, whoever asked for it
  // (Chrome's own throttling skips a worker's fetches, so the server does it)
  setTimeout(() => {
    res.writeHead(200, headers);
    let at = 0;
    const next = () => {
      if (at >= body.length) { res.end(); return; }
      const chunk = body.subarray(at, at + 16384);
      at += chunk.length;
      const now = performance.now();
      line = Math.max(line, now) + (chunk.length * 8) / (MBPS * 1000);
      setTimeout(() => { res.write(chunk); next(); }, line - now);
    };
    next();
  }, 40);
});
let line = 0;   // when the throttled line is next free (ms)
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/${QUERY ? `?${QUERY}` : ''}`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const kind = url => {
  const p = new URL(url, 'http://x').pathname;
  if (url.startsWith('data:') || url.startsWith('blob:')) return 'embedded (data/blob)';
  return p.match(/^\/assets\/(\w+)\//)?.[1] ?? p.match(/^\/(data|vendor|src)\//)?.[1] ?? p.slice(1);
};

async function run() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loadprof-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--user-data-dir=${tmp}`, '--remote-debugging-port=0', `--window-size=${W},${H}`,
    '--enable-gpu', '--ignore-gpu-blocklist', `--use-angle=${ANGLE}`, '--enable-unsafe-swiftshader', '--enable-webgl', '--mute-audio',
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  chrome.stderr.on('data', d => { stderr += d; });
  const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} };
  try {
    let wsPort = 0;
    for (let i = 0; i < 100 && !wsPort; i++) { await sleep(100); try { wsPort = Number(fs.readFileSync(path.join(tmp, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch {} }
    if (!wsPort) throw new Error(`chrome did not start (${CHROME}; set $CHROME)\n${stderr.slice(-1500)}`);
    const page = (await (await fetch(`http://127.0.0.1:${wsPort}/json/list`)).json()).find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = new Map(), reqs = new Map(), errors = [];
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data), p = m.params;
      if (m.id && pending.has(m.id)) { const q = pending.get(m.id); pending.delete(m.id); m.error ? q.rej(new Error(m.error.message)) : q.res(m.result); return; }
      if (m.method === 'Network.requestWillBeSent') reqs.set(p.requestId, { url: p.request.url, start: p.timestamp });
      // a worker's requests surface only from their response on: start them from its timing
      if (m.method === 'Network.responseReceived' && !reqs.has(p.requestId)) reqs.set(p.requestId, { url: p.response.url, start: p.response.timing?.requestTime ?? p.timestamp });
      if (m.method === 'Network.loadingFinished' && reqs.has(p.requestId)) Object.assign(reqs.get(p.requestId), { end: p.timestamp, bytes: p.encodedDataLength });
      // workers (render/assets.ts downloads on one): watch their network too
      if (m.method === 'Target.attachedToTarget') {
        send('Network.enable', {}, p.sessionId).catch(() => {});
      }
      if (m.method === 'Runtime.exceptionThrown') errors.push(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text);
    };
    const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
    const evaluate = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result.value; };
    await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
    await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 1000 }); await send('Profiler.start');
    await send('Page.navigate', { url: URL_ });
    let marks = null;
    for (let i = 0; i < 2400 && !marks?.['vo:ready']; i++) {
      await sleep(100);
      try { marks = await evaluate(`Object.fromEntries(performance.getEntriesByType('mark').filter(m => m.name.startsWith('vo:')).map(m => [m.name, m.startTime]))`); } catch {}
    }
    const detail = await evaluate(`performance.getEntriesByName('vo:frame1')[0]?.detail ?? null`).catch(() => null);
    const programs = detail ? `${detail.programs} shader programs, parallel compile ${detail.parallelCompile ? 'on' : 'off'}` : null;
    const { profile } = await send('Profiler.stop');
    ws.close();
    // main-thread self time per script, from the sampled profile
    const nodes = new Map(profile.nodes.map(n => [n.id, n])), scripts = new Map();
    for (let i = 0; i < profile.samples.length; i++) {
      const cf = nodes.get(profile.samples[i]).callFrame;
      const k = cf.url ? new URL(cf.url, 'http://x').pathname.replace(/^\/(src|vendor)\//, '') : `(${cf.functionName || 'native'})`;
      scripts.set(k, (scripts.get(k) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1e6);
    }
    const files = [...reqs.values()].filter(r => r.end);
    const t0 = Math.min(...files.map(r => r.start));
    return { marks: marks ?? {}, programs, errors, scripts, files: files.map(r => ({ url: r.url.startsWith('data:') ? 'data:…' : r.url.replace(URL_.replace(/\?.*/, ''), '/'), kind: kind(r.url), start: r.start - t0, end: r.end - t0, bytes: r.bytes ?? 0 })) };
  } finally { cleanup(); }
}

const s = ms => (ms / 1000).toFixed(1).padStart(5) + ' s';
const mb = b => (b / 1048576).toFixed(2).padStart(6) + ' MB';
const results = [];
for (let r = 0; r < RUNS; r++) {
  const res = await run();
  results.push(res);
  const m = res.marks;
  console.log(`\nrun ${r + 1}${MBPS ? ` at ${MBPS} Mbit/s` : ''}${m['vo:ready'] ? '' : '  (never became ready: timed out)'}`);
  console.log(`  area data loaded  ${s(m['vo:area'] ?? NaN)}`);
  console.log(`  world built       ${s(m['vo:built'] ?? NaN)}`);
  console.log(`  first frame       ${s(m['vo:frame1'] ?? NaN)}   second frame ${s(m['vo:frame2'] ?? NaN).trim()}${res.programs ? `   (${res.programs})` : ''}`);
  console.log(`  ready to walk     ${s(m['vo:ready'] ?? NaN)}`);
  if (r === 0) {
    const net = res.files.filter(f => !f.kind.startsWith('embedded')), ready = (m['vo:ready'] ?? Infinity) / 1000, before = net.filter(f => f.end <= ready);
    console.log(`  downloaded before ready: ${mb(before.reduce((a, f) => a + f.bytes, 0)).trim()} in ${before.length} files; in all ${mb(net.reduce((a, f) => a + f.bytes, 0)).trim()} (embedded data is decoded, not downloaded)`);
    const kinds = new Map();
    for (const f of res.files) { const k = kinds.get(f.kind) ?? { n: 0, bytes: 0, start: Infinity, end: 0 }; kinds.set(f.kind, { n: k.n + 1, bytes: k.bytes + f.bytes, start: Math.min(k.start, f.start), end: Math.max(k.end, f.end) }); }
    console.log('  by kind (transferred, compressed where the host compresses):');
    for (const [k, v] of [...kinds].sort((a, b) => b[1].bytes - a[1].bytes)) console.log(`    ${mb(v.bytes)}  ${String(v.n).padStart(3)} files  requested from ${v.start.toFixed(1)} s, done by ${v.end.toFixed(1)} s  ${k}`);
    console.log('  main thread, busiest scripts:');
    for (const [k, v] of [...res.scripts].filter(([k]) => k !== '(idle)').sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`    ${v.toFixed(2).padStart(6)} s  ${k}`);
    if (res.errors.length) console.log(`  page errors:\n    ${[...new Set(res.errors)].slice(0, 8).join('\n    ')}`);
  }
}
if (RUNS > 1) {
  const med = k => { const v = results.map(r => r.marks[k]).filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : NaN; };
  console.log(`\nmedian of ${RUNS}: built ${s(med('vo:built')).trim()}, first frame ${s(med('vo:frame1')).trim()}, ready ${s(med('vo:ready')).trim()}`);
}
const out = opt('json');
if (out) fs.writeFileSync(out, JSON.stringify(results.map(r => ({ ...r, scripts: Object.fromEntries(r.scripts) })), null, 1));
server.close();
process.exit(0);
