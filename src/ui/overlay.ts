import type * as THREE from 'three';

const CREDITS_HTML = `
  <h2>Credits</h2>
  <p>Town Hall Square around 1800, rebuilt from real map data. Ordinary houses follow their real footprints and heights
  with a generated c.&nbsp;1800 look; historic layouts come from public-domain city plans.</p>
  <ul>
    <li>Building footprints: GRPK © Nacionalinė žemės tarnyba prie Aplinkos ministerijos, CC BY 4.0</li>
    <li>Heights and terrain: national LiDAR © Nacionalinė žemės tarnyba prie Aplinkos ministerijos, 2025, CC BY 4.0</li>
    <li>Heritage register data: Kultūros vertybių registras, Kultūros paveldo departamentas, CC BY 4.0</li>
    <li>Street layout and some height tags: © OpenStreetMap contributors, ODbL 1.0</li>
    <li>Historic plans of Vilnius, 1842 and 1866: National Library of Poland (Polona), public domain</li>
    <li>Textures: Poly Haven, CC0</li>
    <li>Walking figure: Quaternius (via Poly Pizza), CC0</li>
    <li>three.js (MIT), suncalc (BSD-2-Clause), straight-skeleton (MIT)</li>
  </ul>
  <p class="dim">No Google Maps, Street View, Earth or 3D Tiles imagery was used.</p>
  <div class="cta" data-close>Back</div>`;

export interface Overlay {
  setVisible(v: boolean): void;
  setProgress(p: number): void;
  ready(): void;
}

/** Title screen: loading bar, "Click to walk", credits. */
export function createOverlay(onStart: () => void): Overlay {
  const el = document.createElement('div');
  el.className = 'overlay';
  el.innerHTML = `
    <div class="panel">
      <h1>Vilnius Town Hall</h1>
      <p>Town Hall Square, around 1800</p>
      <div class="bar"><div class="fill"></div></div>
      <div class="cta" data-start hidden>Click to walk</div>
      <p class="hint">W A S D to walk · Shift to jog · mouse to look · Esc to pause</p>
      <p class="links"><a href="#" data-credits>Credits</a></p>
    </div>
    <div class="panel credits" hidden>${CREDITS_HTML}</div>`;
  const main = el.querySelector<HTMLElement>('.panel')!;
  const credits = el.querySelector<HTMLElement>('.credits')!;
  const fill = el.querySelector<HTMLElement>('.fill')!;
  const bar = el.querySelector<HTMLElement>('.bar')!;
  const start = el.querySelector<HTMLElement>('[data-start]')!;
  let isReady = false;

  el.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-credits]')) {
      e.preventDefault();
      main.hidden = true; credits.hidden = false;
      return;
    }
    if (t.closest('[data-close]')) {
      credits.hidden = true; main.hidden = false;
      return;
    }
    if (!isReady || !credits.hidden) return;
    onStart();
    el.classList.add('hidden');
  });
  document.body.appendChild(el);
  return {
    setVisible: v => el.classList.toggle('hidden', !v),
    setProgress: p => { fill.style.width = `${Math.round(Math.min(1, Math.max(0, p)) * 100)}%`; },
    ready: () => { isReady = true; bar.hidden = true; start.hidden = false; },
  };
}

/** Phones and old GPUs get a friendly card instead of a broken 3D scene. */
export function unsupportedReason(): string | null {
  const coarse = window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches;
  if (coarse || Math.min(window.innerWidth, window.innerHeight) < 500) return 'phone';
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return 'webgl';
  return null;
}

export function showUnsupported(reason: string): void {
  const el = document.createElement('div');
  el.className = 'overlay';
  el.innerHTML = `
    <div class="panel">
      <h1>Vilnius Town Hall</h1>
      <p>Town Hall Square, around 1800</p>
      <p style="margin-top:22px">${reason === 'phone'
        ? 'This walk needs a keyboard and a mouse. Open it on a desktop or laptop.'
        : 'This walk needs WebGL 2, which this browser or device does not support.'}</p>
    </div>`;
  document.body.appendChild(el);
}

export function createStats(renderer: THREE.WebGLRenderer): { update(dt: number): void; toggle(): void } {
  const el = document.createElement('div');
  el.className = 'stats hidden';
  document.body.appendChild(el);
  let acc = 0, frames = 0;
  return {
    toggle: () => el.classList.toggle('hidden'),
    update(dt: number) {
      acc += dt; frames++;
      if (acc < 0.5) return;
      const info = renderer.info.render;
      el.textContent = `fps ${(frames / acc).toFixed(0)}\ncalls ${info.calls}\ntris ${(info.triangles / 1000).toFixed(0)}k`;
      acc = 0; frames = 0;
    },
  };
}
