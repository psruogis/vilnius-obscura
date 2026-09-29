import * as THREE from 'three';
import { MUSIC_BASE, type Manifest, type ZoneSpec } from './manifest';

/**
 * Music that belongs to a place. Walk west along Vokiečių g. towards the Jewish quarter and klezmer comes
 * faintly from that side, louder and clearer as you near it, and is gone behind you. Each zone is one stream
 * (an <audio> element, so nothing is fetched until the walker comes near) heard from the nearest of its sites,
 * panned towards it, muffled with distance as if from a courtyard or an upper window. The pieces in a zone
 * follow one another while the walker is in earshot.
 */
const LEVEL = 0.5;        // gain at the nearest point, before the player's Music slider
const HEARD = 40;         // m beyond `far` at which the stream is started (and kept, so it does not stall at the edge)
const IDLE = 12;          // s out of earshot before a stream is paused
const ANCHOR_HEIGHT = 3;  // m above the ground: a window, a musician on a step
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

interface Live {
  spec: ZoneSpec;
  el: HTMLAudioElement;
  out: THREE.PositionalAudio;
  anchor: THREE.Object3D;
  filter: BiquadFilterNode;
  site: number;
  file: number;
  playing: boolean;
  away: number;
  gain: number;
}

export class Zones {
  private live: Live[] = [];
  private started = false;
  private level = 1;

  constructor(
    private readonly listener: THREE.AudioListener,
    private readonly scene: THREE.Object3D,
    private readonly origin: { x: number; z: number },
    private readonly groundAt: (x: number, z: number) => number,
    manifest: Promise<Manifest>,
  ) {
    void manifest.then(m => { for (const spec of m.zones) this.add(spec); });
  }

  private add(spec: ZoneSpec): void {
    const el = new Audio();
    el.preload = 'none';
    const out = new THREE.PositionalAudio(this.listener);
    out.setMediaElementSource(el);
    out.setDistanceModel('linear');
    out.setRolloffFactor(0);            // the level is set here from the walker's distance; the object only pans
    out.setVolume(0);
    const filter = this.listener.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    out.setFilter(filter);
    const anchor = new THREE.Object3D();
    anchor.add(out);
    this.scene.add(anchor);
    const z: Live = { spec, el, out, anchor, filter, site: -1, file: 0, playing: false, away: 0, gain: 0 };
    el.addEventListener('ended', () => { if (z.playing) { z.file = (z.file + 1) % spec.files.length; this.play(z); } });
    el.addEventListener('error', () => { if (z.playing) console.warn('audio', el.src); });
    this.live.push(z);
    if (this.started) this.unlock(z);
  }

  private unlock(z: Live): void {
    z.el.src = SILENCE;
    void z.el.play().catch(() => { /* best effort */ });
  }

  /** Call from a user gesture (phones only let a page start audio then). */
  start(): void {
    if (this.started) return;
    this.started = true;
    for (const z of this.live) this.unlock(z);
  }

  setLevel(v: number): void { this.level = v; }

  status(): unknown[] {
    return this.live.map(z => ({ id: z.spec.id, playing: z.playing, gain: +z.gain.toFixed(2), site: z.site, file: z.spec.files[z.file], at: Math.round(z.el.currentTime) }));
  }

  private play(z: Live): void {
    z.el.src = MUSIC_BASE + z.spec.files[z.file];
    z.playing = true;
    z.el.play().catch(() => { z.playing = false; });
  }

  /** Once a frame. Returns how loud the loudest zone is, 0 to 1, so that the background piano can step aside. */
  update(dt: number, x: number, z: number): number {
    if (!this.started) return 0;
    let loudest = 0;
    for (const zn of this.live) {
      const { near, far, sites } = zn.spec;
      let d = Infinity, at = 0;
      sites.forEach(([dx, dz], i) => { const e = Math.hypot(x - (this.origin.x + dx), z - (this.origin.z + dz)); if (e < d) { d = e; at = i; } });
      if (at !== zn.site) {
        zn.site = at;
        const sx = this.origin.x + sites[at][0], sz = this.origin.z + sites[at][1];
        zn.anchor.position.set(sx, this.groundAt(sx, sz) + ANCHOR_HEIGHT, sz);
      }
      const k = THREE.MathUtils.clamp((far - d) / (far - near), 0, 1);
      const level = k * k * (3 - 2 * k);
      if (d < far + HEARD) {
        zn.away = 0;
        if (!zn.playing) { if (zn.el.src && !zn.el.src.startsWith('data:')) { zn.playing = true; void zn.el.play().catch(() => { zn.playing = false; }); } else this.play(zn); }
      } else if (zn.playing && (zn.away += dt) > IDLE) {
        zn.el.pause();
        zn.playing = false;
      }
      // ease towards the target so that a step across an edge is a swell, not a click
      zn.gain += (level - zn.gain) * Math.min(1, dt * 2.5);
      zn.out.setVolume(zn.gain * LEVEL * this.level);
      zn.filter.frequency.value = 1500 + 7500 * zn.gain;
      loudest = Math.max(loudest, zn.gain);
    }
    return loudest;
  }
}
