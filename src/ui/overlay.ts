import type * as THREE from 'three';
import { loadFonts } from './fonts';
import { createOptions } from './options';
import type { SettingsStore } from './settings';

// The address is put together here so it never sits whole in the page's source, out of reach of the simplest harvesters
const EMAIL = ['paulius.sruogis', 'gmail.com'].join('@');

const CREDITS_HTML = `
  <h2>Credits</h2>
  <p class="by">Made by Paulius Sruogis · <a href="mailto:${EMAIL}">${EMAIL}</a></p>
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
    <li>Music: klezmer by Harry Kandel's Orchestra, Victor, 1921 (Library of Congress National Jukebox, public domain)</li>
    <li>Map and menu lettering: Almendra, Cinzel, Cormorant Garamond, UnifrakturCook (SIL Open Font License)</li>
    <li>three.js (MIT), suncalc (BSD-2-Clause), straight-skeleton (MIT)</li>
  </ul>
  <p class="dim">No Google Maps, Street View, Earth or 3D Tiles imagery was used.</p>
  <div class="foot"><button type="button" class="abtn red" data-back>Back</button></div>`;

export interface Overlay {
  setVisible(v: boolean): void;
  /** Called whenever the title or pause screen appears (true) or goes (false). */
  onVisibility(fn: (visible: boolean) => void): void;
  setProgress(p: number): void;
  ready(): void;
}

type View = 'main' | 'options' | 'credits';

const RAILS = [12, 30, 48, 66, 84].map(top => `<i class="stud" style="top:${top}%"></i>`).join('');
const DIVIDER = '<svg class="divider" width="220" height="14" viewBox="0 0 220 14" fill="none" aria-hidden="true"><path d="M0 7H92M128 7H220" stroke="#5b504a" stroke-width="1.5"/><path d="M110 0L118 7L110 14L102 7Z" fill="#7b2f2f" stroke="#c9b8a4"/></svg>';
const TRACERY = '<svg class="tracery" viewBox="0 0 360 120" preserveAspectRatio="xMidYMax meet" fill="none" stroke="rgba(214,196,170,.09)" stroke-width="1.5" aria-hidden="true"><path d="M20 120V70Q20 20 80 20Q140 20 140 70V120"/><path d="M140 120V70Q140 20 200 20Q260 20 260 70V120"/><path d="M260 120V70Q260 20 320 20Q350 20 350 60V120"/><path d="M50 120V85Q50 50 80 50Q110 50 110 85V120"/><path d="M170 120V85Q170 50 200 50Q230 50 230 85V120"/><path d="M290 120V85Q290 50 320 50Q330 50 330 80V120"/></svg>';

/** Title screen and pause screen in one: the walk's name, Walk (Continue), Options and Credits. */
export function createOverlay(onStart: () => void, store: SettingsStore, mute: { get(): boolean; toggle(): boolean }): Overlay {
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const el = document.createElement('div');
  el.className = 'overlay';
  el.dataset.view = 'main';
  const key = (k: string) => `<kbd class="cap">${k}</kbd>`;
  el.innerHTML = `
    <div class="menu">
      <div class="brand">
        <h1 class="wordmark"><span>VILNIUS</span><span class="gg">.GG</span></h1>
        ${DIVIDER}
        <p class="tagline">Vilnius in the 1900s</p>
        <p class="place">Town Hall Square</p>
      </div>
      <nav class="buttons" aria-label="Menu">
        <button type="button" class="mbtn on" data-start disabled aria-busy="true"><b class="rim"></b><b class="rim2"></b><b class="plate"><b class="prog"></b></b><span class="lbl">Loading</span></button>
        <button type="button" class="mbtn" data-open="options"><b class="rim"></b><b class="rim2"></b><b class="plate"></b><span class="lbl">Options</span></button>
        <button type="button" class="mbtn" data-open="credits"><b class="rim"></b><b class="rim2"></b><b class="plate"></b><span class="lbl">Credits</span></button>
      </nav>
      ${RAILS}${TRACERY}
    </div>
    <section class="stage stage-main">
      <div class="how">
        <h2>How to walk</h2>
        ${touch
          ? '<p class="touch-how">The ring in the corner walks; pushed to its edge it jogs. Drag anywhere else to look, pinch to zoom, tap the round map to open it.</p>'
          : `<ul>
          <li><span class="caps">${key('W')}${key('A')}${key('S')}${key('D')}</span> walk</li>
          <li>${key('Shift')} jog</li><li>${key('Mouse')} look</li><li>${key('Tab')} map</li><li>${key('M')} mute</li><li>${key('Esc')} pause</li>
        </ul>`}
      </div>
    </section>
    <section class="stage stage-options" hidden></section>
    <section class="stage stage-credits" hidden><div class="credits">${CREDITS_HTML}</div></section>`;
  const startBtn = el.querySelector<HTMLButtonElement>('[data-start]')!;
  const startLbl = startBtn.querySelector<HTMLElement>('.lbl')!;
  const optionsBtn = el.querySelector<HTMLButtonElement>('[data-open="options"]')!;
  const creditsBtn = el.querySelector<HTMLButtonElement>('[data-open="credits"]')!;
  const stageOptions = el.querySelector<HTMLElement>('.stage-options')!;
  const listeners: ((visible: boolean) => void)[] = [];
  let view: View = 'main';
  let isReady = false, started = false;

  const showView = (v: View, focus = true) => {
    view = v;
    el.dataset.view = v;
    el.classList.remove('peek');
    el.querySelector<HTMLElement>('.stage-main')!.hidden = v !== 'main';
    stageOptions.hidden = v !== 'options';
    el.querySelector<HTMLElement>('.stage-credits')!.hidden = v !== 'credits';
    optionsBtn.classList.toggle('on', v === 'options');
    creditsBtn.classList.toggle('on', v === 'credits');
    startBtn.classList.toggle('on', v === 'main');
    if (v === 'options') options.open();
    if (!focus) return;
    if (v === 'options') stageOptions.querySelector<HTMLElement>('[role=tab][aria-selected=true]')?.focus({ preventScroll: true });
    else el.querySelector<HTMLElement>('[data-back]')?.focus({ preventScroll: true });
  };

  const options = createOptions(store, {
    mute,
    leave: reload => {
      if (reload) {
        // the address's own ?weather= would win again, so it goes
        const u = new URL(location.href);
        u.searchParams.delete('weather');
        location.assign(u);
        return;
      }
      showView('main', false);
      optionsBtn.focus({ preventScroll: true });
    },
  }, touch);
  options.onPeek(on => el.classList.toggle('peek', on));
  stageOptions.append(options.el);

  const setVisible = (v: boolean) => {
    const was = !el.classList.contains('hidden');
    el.classList.toggle('hidden', !v);
    if (v !== was) {
      if (v && view !== 'main') showView('main', false);
      for (const fn of listeners) fn(v);
    }
  };
  const start = () => {
    if (!isReady) return;
    started = true;
    startLbl.textContent = 'Continue';
    onStart();
    setVisible(false);
  };

  el.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const open = t.closest<HTMLElement>('[data-open]');
    if (open) { showView(open.dataset.open as View); return; }
    if (t.closest('[data-back]')) { showView('main', false); creditsBtn.focus({ preventScroll: true }); return; }
    if (t.closest('[data-start]')) { start(); return; }
    // the scene beside the menu: a click there starts (or resumes) the walk, as it always has
    if (view === 'main' && t.closest('.stage-main') && !t.closest('.how')) start();
  });
  window.addEventListener('keydown', e => {
    if (el.classList.contains('hidden')) return;
    if (e.code === 'Escape' && view !== 'main') {
      if (view === 'options') { store.cancel(); showView('main', false); optionsBtn.focus({ preventScroll: true }); }
      else { showView('main', false); creditsBtn.focus({ preventScroll: true }); }
      e.preventDefault();
      return;
    }
    const onControl = e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement || e.target instanceof HTMLAnchorElement;
    if ((e.code === 'Enter' || e.code === 'Space') && view === 'main' && !onControl) { e.preventDefault(); start(); }
  });

  document.body.appendChild(el);
  // the lettering waits for its fonts (a moment at most) rather than flashing in a stand-in
  el.classList.add('fonts-wait');
  const shown = () => el.classList.remove('fonts-wait');
  loadFonts().then(shown, shown);
  setTimeout(shown, 2500);

  return {
    setVisible,
    onVisibility: fn => { listeners.push(fn); },
    setProgress: p => { startBtn.style.setProperty('--p', `${Math.round(Math.min(1, Math.max(0, p)) * 100)}%`); },
    ready: () => {
      isReady = true;
      startBtn.disabled = false;
      startBtn.removeAttribute('aria-busy');
      startBtn.dataset.ready = '';
      startLbl.textContent = started ? 'Continue' : 'Walk';
    },
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
  el.className = 'overlay plain';
  el.innerHTML = `
    <div class="card">
      <h1 class="wordmark"><span>VILNIUS</span><span class="gg">.GG</span></h1>
      ${DIVIDER}
      <p class="tagline">Vilnius in the 1900s</p>
      <p class="msg">${reason === 'webgl'
        ? 'This walk needs WebGL 2, which this browser or device does not support.'
        : 'This walk cannot run in this browser.'}</p>
      ${onTryAnyway ? '<button class="mbtn on" type="button" data-try><b class="rim"></b><b class="rim2"></b><b class="plate"></b><span class="lbl">Try anyway</span></button>' : ''}
    </div>`;
  el.querySelector('[data-try]')?.addEventListener('click', () => { el.remove(); onTryAnyway?.(); });
  document.body.appendChild(el);
  void loadFonts();
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
