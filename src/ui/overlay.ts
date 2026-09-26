import type * as THREE from 'three';

export function createOverlay(onStart: () => void): { setVisible(v: boolean): void } {
  const el = document.createElement('div');
  el.className = 'overlay';
  el.innerHTML = `
    <div>
      <h1>Vilnius Town Hall</h1>
      <p>Town Hall Square, around 1800</p>
      <div class="cta">Click to walk</div>
      <p style="margin-top:18px">W A S D to walk · Shift to jog · mouse to look · Esc to pause</p>
    </div>`;
  el.addEventListener('click', () => {
    onStart();
    el.classList.add('hidden');
  });
  document.body.appendChild(el);
  return { setVisible: v => el.classList.toggle('hidden', !v) };
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
