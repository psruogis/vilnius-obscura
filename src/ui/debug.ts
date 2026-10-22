/**
 * A diagnostics panel for a device we can't plug in (?debug): what the browser is, the GPU, how far the load got,
 * whether touches and taps arrive (and on what), the frame rate, and any errors. A screenshot of it is the report.
 */
export function startDebugPanel(renderer: { getContext(): WebGLRenderingContext | WebGL2RenderingContext }): void {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;z-index:200;left:6px;right:6px;bottom:calc(6px + env(safe-area-inset-bottom));max-height:46vh;overflow:hidden;'
    + 'padding:6px 8px;border-radius:6px;background:rgba(0,0,0,.82);color:#cfe;font:10.5px/1.35 ui-monospace,Menlo,monospace;white-space:pre-wrap;pointer-events:none';
  document.body.append(el);
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const counts: Record<string, number> = {};
  const last: string[] = [];
  const errors: string[] = [];
  const name = (t: EventTarget | null) => { const e = t as HTMLElement | null; return e?.tagName ? `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''}` : String(t); };
  for (const type of ['touchstart', 'touchend', 'pointerdown', 'pointerup', 'pointercancel', 'click']) {
    window.addEventListener(type, e => {
      counts[type] = (counts[type] ?? 0) + 1;
      const p = e as PointerEvent;
      last.unshift(`${type} ${p.pointerType ?? ''} on ${name(e.target)}${'clientX' in p ? ` @${Math.round(p.clientX)},${Math.round(p.clientY)}` : ''}${e.defaultPrevented ? ' (prevented)' : ''}`);
      last.length = Math.min(last.length, 5);
    }, { capture: true, passive: true });
  }
  window.addEventListener('error', e => { errors.unshift(String(e.error?.message ?? e.message)); });
  window.addEventListener('unhandledrejection', e => { errors.unshift(`rejection: ${String((e.reason as Error)?.message ?? e.reason)}`); });
  let frames = 0, fps = 0, t0 = performance.now();
  const tick = () => { frames++; const t = performance.now(); if (t - t0 > 1000) { fps = (frames * 1000) / (t - t0); frames = 0; t0 = t; } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const draw = () => {
    const marks = performance.getEntriesByType('mark').filter(m => m.name.startsWith('vo:')).map(m => `${m.name.slice(3).replace('stage:', '')} ${(m.startTime / 1000).toFixed(1)}s`);
    const start = document.querySelector<HTMLButtonElement>('[data-start]');
    el.textContent = [
      `${navigator.userAgent}`,
      `GPU ${gpu} · WebGL${gl instanceof WebGL2RenderingContext ? '2' : '1'} · cores ${navigator.hardwareConcurrency} · mem ${(navigator as { deviceMemory?: number }).deviceMemory ?? '?'} GB · dpr ${devicePixelRatio} · ${innerWidth}x${innerHeight}`,
      `coarse ${matchMedia('(pointer: coarse)').matches} · fps ${fps.toFixed(0)} · button ${start ? `${start.disabled ? 'disabled' : 'enabled'} "${start.textContent?.trim()}"` : 'none'} · menu ${document.querySelector('.overlay')?.classList.contains('hidden') ? 'hidden' : 'shown'}`,
      `load: ${marks.slice(-6).join(' · ') || '…'}`,
      `events: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none yet'}`,
      ...last.map(s => `  ${s}`),
      ...errors.slice(0, 4).map(s => `ERROR ${s}`),
    ].join('\n');
  };
  setInterval(draw, 400);
  draw();
}
