import type { Input } from './input';

/**
 * Touch controls for phones and tablets. A fixed ring in the bottom-left corner walks (push past the
 * dashed line to jog); a drag anywhere else turns the view; two fingers pinch the camera in and out.
 * Each touch is claimed once, when it lands, by where it lands, and everything feeds Input, so the
 * walker cannot tell a thumb from a keyboard. Pause and mute buttons stand in for Esc and M.
 */
const R = 56;             // ring radius and knob travel, CSS px
const HIT = 84;           // a touch landing this close to the ring's centre takes the stick
const DEAD = 0.12;        // deflection that still stands still
const JOG_AT = 0.85;      // deflection past which the walk becomes a jog (the dashed line)
const LOOK_GAIN = 2.4;    // a finger turns the view this much more than the same mouse travel
const PINCH_GAIN = 2.5;   // camera zoom per pixel of pinch, in wheel units

const ICON = {
  pause: '<svg width="20" height="20" viewBox="0 0 20 20"><path d="M7 4V16M13 4V16"/></svg>',
  sound: '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 8H7L12 4V18L7 14H3Z M15 8Q17.5 11 15 14 M17.5 5.5Q21.5 11 17.5 16.5"/></svg>',
  muted: '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 8H7L12 4V18L7 14H3Z M15 8.5L20 13.5 M20 8.5L15 13.5"/></svg>',
};

export class TouchControls {
  private readonly ui: HTMLElement;
  private readonly ring: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly walkHint: HTMLElement;
  private readonly lookHint: HTMLElement;
  private stickId: number | null = null;
  private readonly looks = new Map<number, { x: number; y: number }>();
  private pinch = 0;      // spread of the two look fingers at the last move; 0 = not pinching
  private active = false; // walking (the title screen is not showing)
  private used = window.matchMedia('(pointer: coarse)').matches; // a touch screen is in use

  constructor(private readonly el: HTMLElement, private readonly input: Input, on: { pause(): void; mute(): boolean }) {
    this.ui = document.createElement('div');
    this.ui.className = 'touch-ui';
    this.ui.hidden = true;
    this.ui.innerHTML = `
      <button type="button" class="hud-btn pause" aria-label="Pause">${ICON.pause}</button>
      <button type="button" class="hud-btn mute" aria-label="Mute sound">${ICON.sound}</button>
      <div class="look-hint">Drag anywhere to look<br><span>two fingers: pinch to zoom</span></div>
      <div class="stick"><div class="band"></div><div class="knob"></div></div>
      <div class="walk-hint">Walk · push to the edge to jog</div>`;
    this.ring = this.ui.querySelector('.stick')!;
    this.knob = this.ui.querySelector('.knob')!;
    this.walkHint = this.ui.querySelector('.walk-hint')!;
    this.lookHint = this.ui.querySelector('.look-hint')!;
    this.muteBtn = this.ui.querySelector('.mute')!;
    this.ui.querySelector('.pause')!.addEventListener('click', () => on.pause());
    this.muteBtn.addEventListener('click', () => this.setMuted(on.mute()));
    document.body.appendChild(this.ui);

    el.addEventListener('pointerdown', e => this.down(e));
    el.addEventListener('pointermove', e => this.move(e));
    el.addEventListener('pointerup', e => this.up(e));
    el.addEventListener('pointercancel', e => this.up(e));
    // A touch laptop starts in mouse mode; the first touch anywhere brings the controls up.
    window.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch' && !this.used) { this.used = true; this.refresh(); }
    }, { capture: true });
  }

  /** On while walking, off on the title screen; switching off lets go of every finger. */
  setActive(v: boolean): void {
    this.active = v;
    if (!v) {
      this.stickId = null;
      this.looks.clear();
      this.pinch = 0;
      this.steer(0, 0, false);
    }
    this.refresh();
  }

  get isActive(): boolean {
    return this.active && this.used;
  }

  setMuted(m: boolean): void {
    this.muteBtn.innerHTML = m ? ICON.muted : ICON.sound;
    this.muteBtn.setAttribute('aria-label', m ? 'Sound is off, turn it on' : 'Mute sound');
  }

  private refresh(): void {
    this.ui.hidden = !(this.active && this.used);
  }

  private centre(): { x: number; y: number } {
    const r = this.ring.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  private spread(): number {
    const [a, b] = [...this.looks.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private down(e: PointerEvent): void {
    if (e.pointerType !== 'touch' || !this.active) return;
    e.preventDefault(); // no emulated mouse events after the touch
    try { this.el.setPointerCapture(e.pointerId); } catch { /* the finger already lifted */ }
    const c = this.centre();
    if (this.stickId === null && Math.hypot(e.clientX - c.x, e.clientY - c.y) <= HIT) {
      this.stickId = e.pointerId;
      this.walkHint.hidden = true;
      this.steer(e.clientX - c.x, e.clientY - c.y, true);
    } else {
      this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.pinch = this.looks.size === 2 ? this.spread() : 0;
    }
  }

  private move(e: PointerEvent): void {
    if (e.pointerType !== 'touch') return;
    if (e.pointerId === this.stickId) {
      const c = this.centre();
      this.steer(e.clientX - c.x, e.clientY - c.y, true);
      return;
    }
    const p = this.looks.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.looks.size >= 2) {
      const d = this.spread();
      if (this.pinch > 0) this.input.addZoom((this.pinch - d) * PINCH_GAIN); // spreading brings the camera in
      this.pinch = d;
    } else {
      this.lookHint.hidden = true;
      this.input.addLook(dx * LOOK_GAIN, dy * LOOK_GAIN);
    }
  }

  private up(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.steer(0, 0, false);
    }
    if (this.looks.delete(e.pointerId)) this.pinch = this.looks.size === 2 ? this.spread() : 0;
  }

  /** Knob offset from the ring's centre, in CSS px (y down): moves the knob and sets the walk. */
  private steer(dx: number, dy: number, held: boolean): void {
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    const mag = Math.min(d, R) / R;
    const jog = held && mag > JOG_AT;
    const walk = !held || mag < DEAD ? 0 : jog ? 1 : Math.min(1, (mag - DEAD) / (JOG_AT - DEAD));
    const len = Math.hypot(dx, dy);
    const ux = len > 1e-6 ? dx / len : 0, uy = len > 1e-6 ? dy / len : 0;
    this.input.setStick(ux * walk, -uy * walk, jog); // screen up is forward
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.ring.classList.toggle('on', held);
    this.ring.classList.toggle('jog', jog);
  }
}
