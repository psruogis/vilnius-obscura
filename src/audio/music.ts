import * as THREE from 'three';

/**
 * Quiet music under the walk: the pieces listed in public/assets/music/tracks.json, one at a time in a
 * shuffled order, with a long silence between them. The first swells in slowly after the walk begins; each
 * one fades out at its end, and all of it sinks under St Casimir's bells. It shares Ambience's audio graph,
 * so the master mute (M) silences it too. A piece streams from an <audio> element, so a long recording is not
 * decoded into memory. With an empty list nothing plays and nothing is requested.
 *
 * Every file must be public domain or CC0, recording as well as composition, and be listed in CREDITS.md.
 */
export interface Track { file: string; title?: string; by?: string }

const BASE = 'assets/music/';
const LEVEL = 0.22;                      // gain at full, against the market bed's 0.1 to 0.38
const FADE = 8;                          // s in and out of each piece
const FADE_FIRST = 20;                   // s: the first piece rises more slowly
const GAP: [number, number] = [40, 90];  // s of silence between pieces
const DUCK = 0.45;                       // level while the bells ring
// A silent, empty WAV. Playing it inside the tap that starts the walk unlocks the <audio> element on phones,
// so later pieces may start without a tap.
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export class Music {
  private tracks: Track[] = [];
  private queue: Track[] = [];
  private readonly el = new Audio();
  private readonly out: THREE.Audio;
  private state: 'idle' | 'playing' | 'gap' = 'idle';
  private started = false;
  private first = true;
  private gap = 0;
  private duck = 1;
  private current: Track | null = null;

  constructor(listener: THREE.AudioListener) {
    this.el.preload = 'auto';
    this.out = new THREE.Audio(listener);
    this.out.setMediaElementSource(this.el);
    this.out.setVolume(0);
    const done = () => { if (this.state === 'playing') this.rest(); };
    this.el.addEventListener('ended', done);
    this.el.addEventListener('error', () => { if (this.state === 'playing') console.warn('audio', this.el.src); done(); });
    fetch(BASE + 'tracks.json').then(r => (r.ok ? r.json() : [])).then((list: unknown) => {
      this.tracks = Array.isArray(list) ? list.filter((t): t is Track => !!t && typeof (t as Track).file === 'string') : [];
      if (this.started && this.tracks.length) this.next();
    }).catch(() => { /* no list, no music */ });
  }

  /** Call from a user gesture, as Ambience.start does. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.el.src = SILENCE;
    void this.el.play().catch(() => { /* the unlock is best effort */ });
    if (this.tracks.length) this.next();
  }

  status(): Record<string, unknown> {
    return { tracks: this.tracks.length, state: this.state, playing: this.current?.title ?? this.current?.file ?? null, at: Math.round(this.el.currentTime) };
  }

  update(dt: number, bells: boolean): void {
    if (!this.started || this.state === 'idle') return;
    this.duck += ((bells ? DUCK : 1) - this.duck) * Math.min(1, dt / 1.5);
    if (this.state === 'gap') {
      this.out.setVolume(0);
      if ((this.gap -= dt) <= 0) this.next();
      return;
    }
    const t = this.el.currentTime, d = this.el.duration;
    const rise = Math.min(1, t / (this.first ? FADE_FIRST : FADE));
    const fall = Number.isFinite(d) ? Math.min(1, Math.max(0, (d - t) / FADE)) : 1;
    this.out.setVolume(LEVEL * Math.min(rise, fall) * this.duck);
  }

  private rest(): void {
    this.state = 'gap';
    this.first = false;
    this.gap = GAP[0] + Math.random() * (GAP[1] - GAP[0]);
    this.out.setVolume(0);
  }

  private next(): void {
    if (!this.queue.length) {
      this.queue = [...this.tracks].sort(() => Math.random() - 0.5);
      if (this.queue.length > 1 && this.queue[this.queue.length - 1] === this.current) this.queue.reverse(); // not the same piece twice in a row
    }
    this.current = this.queue.pop()!;
    this.state = 'playing';
    this.el.src = BASE + this.current.file;
    this.el.play().catch(() => { this.rest(); this.gap = 10; }); // blocked or unreadable: try again shortly
  }
}
