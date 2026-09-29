import type * as THREE from 'three';

const CREDITS_HTML = `
  <h2>Credits</h2>
  <p>Town Hall Square around 1900, rebuilt from real map data and period photographs. Ordinary houses follow their real footprints
  and heights with a generated late-19th-century look; historic layouts come from public-domain city plans.</p>
  <ul>
    <li>Building footprints: GRPK © Nacionalinė žemės tarnyba prie Aplinkos ministerijos, CC BY 4.0</li>
    <li>Heights and terrain: national LiDAR © Nacionalinė žemės tarnyba prie Aplinkos ministerijos, 2025, CC BY 4.0</li>
    <li>Heritage register data: Kultūros vertybių registras, Kultūros paveldo departamentas, CC BY 4.0</li>
    <li>Street layout and some height tags: © OpenStreetMap contributors, ODbL 1.0</li>
    <li>Historic plans of Vilnius, 1842 and 1866: National Library of Poland (Polona), public domain</li>
    <li>Textures: Poly Haven, CC0</li>
    <li>Walking figure, townsfolk and horses: Quaternius (via Poly Pizza), CC0</li>
    <li>Sounds (Freesound, CC0): bolkmar, craigsmith, straget, mikewest, Nox_Sound, rasunter255</li>
    <li>Map lettering: Almendra, Cinzel, UnifrakturCook (SIL Open Font License)</li>
    <li>three.js (MIT), suncalc (BSD-2-Clause), straight-skeleton (MIT)</li>
  </ul>
  <p class="dim">No Google Maps, Street View, Earth or 3D Tiles imagery was used.</p>
  <div class="cta" data-close>Back</div>`;

export interface Overlay {
  setVisible(v: boolean): void;
  /** Called whenever the title or pause screen appears (true) or goes (false). */
  onVisibility(fn: (visible: boolean) => void): void;
  setProgress(p: number): void;
  ready(): void;
}

/** Title screen: loading bar, "Click to walk" (or "Tap to walk"), credits. Also the pause screen. */
export function createOverlay(onStart: () => void): Overlay {
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const el = document.createElement('div');
  el.className = 'overlay';
  el.innerHTML = `
    <div class="panel">
      <h1>Vilnius Town Hall</h1>
      <p>Town Hall Square, around 1900</p>
      <div class="bar"><div class="fill"></div></div>
      <div class="cta" data-start hidden>${touch ? 'Tap to walk' : 'Click to walk'}</div>
      <p class="hint">${touch
        ? 'The ring in the corner walks, pushed to its edge it jogs · drag anywhere else to look · pinch to zoom · tap the map to open it'
        : 'W A S D to walk · Shift to jog · mouse to look · Tab for the map · M to mute · Esc to pause'}</p>
      <p class="links"><a href="#" data-credits>Credits</a></p>
    </div>
    <div class="panel credits" hidden>${CREDITS_HTML}</div>`;
  const main = el.querySelector<HTMLElement>('.panel')!;
  const credits = el.querySelector<HTMLElement>('.credits')!;
  const fill = el.querySelector<HTMLElement>('.fill')!;
  const bar = el.querySelector<HTMLElement>('.bar')!;
  const start = el.querySelector<HTMLElement>('[data-start]')!;
  let isReady = false;
  const listeners: ((visible: boolean) => void)[] = [];
  const setVisible = (v: boolean) => {
    const was = !el.classList.contains('hidden');
    el.classList.toggle('hidden', !v);
    if (v !== was) for (const fn of listeners) fn(v);
  };

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
    setVisible(false);
  });
  document.body.appendChild(el);
  return {
    setVisible,
    onVisibility: fn => { listeners.push(fn); },
    setProgress: p => { fill.style.width = `${Math.round(Math.min(1, Math.max(0, p)) * 100)}%`; },
    ready: () => { isReady = true; bar.hidden = true; start.hidden = false; },
  };
}

/** Browsers without WebGL 2 get a friendly card instead of a broken 3D scene. (Phones walk by touch.ts.) */
export function unsupportedReason(): string | null {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return 'webgl';
  return null;
}

export function showUnsupported(reason: string, onTryAnyway: (() => void) | null): void {
  const el = document.createElement('div');
  el.className = 'overlay';
  el.style.cursor = 'default';
  el.innerHTML = `
    <div class="panel">
      <h1>Vilnius Town Hall</h1>
      <p>Town Hall Square, around 1900</p>
      <p style="margin-top:22px">${reason === 'webgl'
        ? 'This walk needs WebGL 2, which this browser or device does not support.'
        : 'This walk cannot run in this browser.'}</p>
      ${onTryAnyway ? '<button class="cta" type="button" data-try>Try anyway</button>' : ''}
    </div>`;
  el.querySelector('[data-try]')?.addEventListener('click', () => { el.remove(); onTryAnyway?.(); });
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
