/** Keyboard + mouse state. Pointer lock when available; click-drag as a fallback. Touch (touch.ts) feeds in too. */
export class Input {
  readonly keys = new Set<string>();
  lookDX = 0;
  lookDY = 0;
  private zoomDY = 0;
  private dragging = false;
  private readonly stick = { x: 0, y: 0, jog: false };

  constructor(private readonly el: HTMLElement) {
    window.addEventListener('keydown', e => this.keys.add(e.code));
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement === this.el || this.dragging) {
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      }
    });
    // mouse wheel / trackpad scroll zooms the camera (also swallows ctrl-wheel page zoom)
    window.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoomDY += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    }, { passive: false });
    el.addEventListener('mousedown', () => { this.dragging = true; });
    window.addEventListener('mouseup', () => { this.dragging = false; });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.el;
  }

  requestLock(): void {
    // Not allowed in some embedded browsers; click-drag looking still works.
    Promise.resolve(this.el.requestPointerLock?.()).catch(() => {});
  }

  /**
   * Movement intent in camera space: x = right, y = forward, each in [-1, 1]. The keys give full
   * strides; the touch stick is analog, and its length is how much of a full stride to take.
   */
  moveAxis(out: { x: number; y: number }): { x: number; y: number } {
    const k = this.keys;
    out.x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    out.y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (out.x === 0 && out.y === 0) { out.x = this.stick.x; out.y = this.stick.y; }
    return out;
  }

  get jog(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.stick.jog;
  }

  /** The touch stick: x = right, y = forward, length up to 1; jog when pushed past its line. */
  setStick(x: number, y: number, jog: boolean): void {
    this.stick.x = x;
    this.stick.y = y;
    this.stick.jog = jog;
  }

  /** Look travel from a touch drag, in mouse pixels. */
  addLook(dx: number, dy: number): void {
    this.lookDX += dx;
    this.lookDY += dy;
  }

  /** Zoom from a pinch, in wheel pixels (positive = away from the character). */
  addZoom(dy: number): void {
    this.zoomDY += dy;
  }

  /** Scroll since the last call, in pixels (positive = away from the character). */
  consumeZoom(): number {
    const z = this.zoomDY;
    this.zoomDY = 0;
    return z;
  }

  consumeLook(out: { dx: number; dy: number }): { dx: number; dy: number } {
    out.dx = this.lookDX;
    out.dy = this.lookDY;
    this.lookDX = 0;
    this.lookDY = 0;
    return out;
  }
}
