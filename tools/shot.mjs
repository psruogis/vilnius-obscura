// Headless screenshots of the walk, for checking changes without a person at the keyboard.
// Launches its own Chrome (GPU, headless) against a running dev server, waits for the town and the
// townsfolk to load, then renders each named view at a fixed pixel ratio and saves it as a JPEG.
// Also reports console errors and a rough frame time.
//
//   node tools/shot.mjs [--port 5173] [--out .screens] [--prefix x_] [--query weather=clear]
//                       [--views square,wall,vok,shops,hotel,street,puddles,roofs,aerial]
//                       [--view name:ex,ez,h,tx,tz,ty]   (a free camera: eye x/z/height, target x/z/height)
//                       [--js-view 'name:<js>']   (camera from page JS; `w` is window.__walk; the expression
//                                                  returns {eye: [x, y, z], target: [x, y, z]} in world coordinates)
//                       [--pre '<js>']            (page JS run once after loading, e.g. to pause something)
//                       [--scale 1.5] [--size 1600x900] [--wait 14] [--bench]
//                       [--static]                (a production build: load, screenshot, report errors)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const flag = k => args.includes(`--${k}`);
const PORT = Number(opt('port', process.env.PORT || 5173));
const OUT = path.resolve(ROOT, opt('out', '.screens'));
const PREFIX = opt('prefix', '');
const QUERY = opt('query', '');
const SCALE = Number(opt('scale', 1.5));
const [W, H] = opt('size', '1600x900').split('x').map(Number);
const WAIT = Number(opt('wait', 14));
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CHROME = process.env.CHROME || (process.platform === 'darwin' ? MAC_CHROME : 'chromium');
// ANGLE backend: Metal on macOS, software rasterisation elsewhere (Linux containers have no GPU).
const ANGLE = process.env.ANGLE || (process.platform === 'darwin' ? 'metal' : 'swiftshader');

// Named views. walk: third-person camera behind the walking figure (x, z, look-at x, z, pitch);
// free: the figure hidden, camera at eye (x, z, height above the ground there) looking at target (x, z, height).
const NW = [-19.33, 34.21], dX = [0.909, 0.416], dZ = [-0.373, 0.928];
const L = (x, z) => [NW[0] + dX[0] * x + dZ[0] * z, NW[1] + dX[1] * x + dZ[1] * z];
const VIEWS = {
  square: { walk: [4, -24], look: [22, 44], pitch: -0.25 },
  wall: { walk: [0, -45], look: [-40, -20], pitch: -0.12 },
  vok: { walk: [-38, 42], look: [-100, 34], pitch: -0.04 },
  shops: { free: [...L(30, -40), 1.8], target: [...L(60, -60), 3.5] },
  street: { free: [-38, 42, 1.7], target: [-100, 34, 3.5] },
  puddles: { free: [-38, 42, 1.5], target: [-58, 39, 0.0] },
  cobbles: { free: [4, -40, 1.2], target: [6, -46, 0.0] },
  roofs: { free: [-30, 20, 16], target: [-70, 30, 12] },
  aerial: { free: [20, -80, 26], target: [-10, 10, 4] },
  hotel: { hotel: true },
};

const views = [];
for (const name of opt('views', 'square,wall,vok,shops').split(',').filter(Boolean)) {
  if (!VIEWS[name]) { console.error(`unknown view ${name}; known: ${Object.keys(VIEWS).join(', ')}`); process.exit(2); }
  views.push({ name, ...VIEWS[name] });
}
for (let i = 0; i < args.length; i++) if (args[i] === '--view') {
  const [name, nums] = args[i + 1].split(':');
  const [ex, ez, h, tx, tz, ty] = nums.split(',').map(Number);
  views.push({ name, free: [ex, ez, h], target: [tx, tz, ty] });
}

for (let i = 0; i < args.length; i++) if (args[i] === '--js-view') {
  const k = args[i + 1].indexOf(':');
  views.push({ name: args[i + 1].slice(0, k), js: args[i + 1].slice(k + 1) });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'walkshot-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--user-data-dir=${tmp}`, '--remote-debugging-port=0', `--window-size=${W},${H}`,
  '--enable-gpu', '--ignore-gpu-blocklist', `--use-angle=${ANGLE}`, '--enable-webgl', '--mute-audio',
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '';
chrome.stderr.on('data', d => { stderr += d; });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);

const sleep = ms => new Promise(r => setTimeout(r, ms));
let wsPort = 0;
for (let i = 0; i < 100 && !wsPort; i++) {
  await sleep(100);
  try { wsPort = Number(fs.readFileSync(path.join(tmp, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch {}
}
if (!wsPort) { console.error('chrome did not start', stderr.slice(-2000)); process.exit(1); }
const list = await (await fetch(`http://127.0.0.1:${wsPort}/json/list`)).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
  if (m.method === 'Runtime.exceptionThrown') errors.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
    errors.push(`${m.params.type}: ${m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 400)}`);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr, timeout = 120000) => {
  const r = await Promise.race([
    send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }),
    sleep(timeout).then(() => { throw new Error('evaluate timed out'); }),
  ]);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile: false });
const url = `http://localhost:${PORT}/?${QUERY}`;
await send('Page.navigate', { url });

if (flag('static')) {
  // a production build (no DEV hooks): just let it load, then report errors and save what the page shows
  await sleep(WAIT * 1000 + 15000);
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${PREFIX}static.jpg`), Buffer.from(shot.data, 'base64'));
  console.log(path.join(OUT, `${PREFIX}static.jpg`));
  const uniq = [...new Set(errors)];
  console.log(uniq.length ? `console (${uniq.length}):\n  ` + uniq.slice(0, 30).join('\n  ') : 'console: clean');
  ws.close(); cleanup(); process.exit(0);
}

// wait for the town, the townsfolk and the textures
const ready = await evaluate(`(async () => {
  const t0 = performance.now();
  while (performance.now() - t0 < 90000) {
    const w = window.__walk;
    if (w && w.crowd && w.traffic !== undefined) break;
    await new Promise(r => setTimeout(r, 250));
  }
  const w = window.__walk;
  if (!w) return { ok: false, text: document.body.innerText.slice(0, 600) };
  w.post.setFixedScale(${SCALE});
  await new Promise(r => setTimeout(r, ${WAIT * 1000}));
  return { ok: true, gl: w.renderer.getContext().getParameter(w.renderer.getContext().VERSION), t: ((performance.now() - t0) / 1000).toFixed(1) };
})()`, 200000);
if (!ready.ok) { console.error('page did not load:', ready.text, errors.join('\n')); process.exit(1); }
console.log(`loaded in ${ready.t}s (${ready.gl})`);
if (opt('pre')) console.log('pre:', JSON.stringify(await evaluate(`(async () => { const w = window.__walk; return await (async () => (${opt('pre')}))(); })()`)));
fs.mkdirSync(OUT, { recursive: true });

for (const v of views) {
  await evaluate(`(async () => {
    const w = window.__walk, v = ${JSON.stringify(v)};
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
    w.walker.object.visible = true;
    w.__freeCam = null;
    if (v.hotel) {
      const hot = w.data.buildings.find(x => x.style === 'hotel');
      let cx = 0, cz = 0; for (const [x, z] of hot.rings[0]) { cx += x; cz += z; } cx /= hot.rings[0].length; cz /= hot.rings[0].length;
      v.free = [cx + 38, cz - 30, 3]; v.target = [cx, cz, 8];
    }
    if (v.js) {
      const c = await (async () => eval(v.js))();
      const [ex, , ez] = c.eye;
      w.place(ex, ez, yawTo(ex, ez, c.target[0], c.target[2]), 0);
      await wait(1500);
      const c2 = await (async () => eval(v.js))();   // re-evaluate: things may have moved
      w.walker.object.visible = false;
      w.camera.position.set(...c2.eye);
      w.camera.lookAt(...c2.target);
      w.camera.updateMatrixWorld();
    } else if (v.walk) {
      w.place(v.walk[0], v.walk[1], yawTo(v.walk[0], v.walk[1], v.look[0], v.look[1]), v.pitch);
      await wait(2500);
    } else {
      const [ex, ez, eh] = v.free, [tx, tz, th] = v.target;
      w.place(ex, ez, yawTo(ex, ez, tx, tz), 0);
      await wait(1500);
      w.walker.object.visible = false;
      const gy = w.walker.position.y;
      w.camera.position.set(ex, gy + eh, ez);
      w.camera.lookAt(tx, gy + th, tz);
      w.camera.updateMatrixWorld();
    }
    // Hold this framing: the animation loop keeps drawing, but the walker no longer moves the camera,
    // so every frame it presents is the shot. The page is photographed from the browser side below
    // (reading the canvas back mid-frame gives a half-drawn picture under a software rasteriser).
    w.__frozen = w.walker.update.bind(w.walker);
    w.walker.update = () => {};
    w.post.render(0);
  })()`);
  await sleep(600);   // a couple of frames of the held camera reach the screen
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  await evaluate(`(() => {
    const w = window.__walk;
    if (w.__frozen) { w.walker.update = w.__frozen; w.__frozen = null; }
    w.walker.object.visible = true;
  })()`);
  const file = path.join(OUT, `${PREFIX}${v.name}.jpg`);
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(file);
}

if (flag('bench')) {
  // GPU-synchronised render cost: 20 frames from the default start view, each followed by a 1-pixel
  // readback so the time includes the GPU work (vsync and rAF throttling don't matter)
  const b = await evaluate(`(async () => {
    const w = window.__walk; const [x, z] = w.data.meta.townHall;
    w.walker.object.visible = true;
    w.place(x + 4, z - 42, Math.PI, 0.05);
    await new Promise(r => setTimeout(r, 2000));
    const gl = w.renderer.getContext(), px = new Uint8Array(4);
    const frame = () => { w.post.render(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
    for (let i = 0; i < 4; i++) frame();
    w.renderer.info.autoReset = false; w.renderer.info.reset();
    const N = 20, t0 = performance.now();
    for (let i = 0; i < N; i++) frame();
    const ms = (performance.now() - t0) / N;
    const info = w.renderer.info;
    const r = { ms: ms.toFixed(1), calls: Math.round(info.render.calls / N), tris: Math.round(info.render.triangles / N), programs: info.programs?.length, geometries: info.memory.geometries, textures: info.memory.textures };
    info.autoReset = true;
    return r;
  })()`);
  console.log(`bench @${SCALE}x ${W}x${H}: ${b.ms} ms/frame GPU-synced, ${b.calls} draw calls, ${b.tris} triangles, ${b.programs} programs, ${b.textures} textures (compare runs on the same machine, not absolutes)`);
}

const uniq = [...new Set(errors)];
if (uniq.length) { console.log(`console (${uniq.length}):`); for (const e of uniq.slice(0, 30)) console.log('  ' + e); }
ws.close();
cleanup();
process.exit(0);
