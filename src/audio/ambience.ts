import * as THREE from 'three';
import { Music } from './music';

/**
 * Ambient sound for the square (all CC0 recordings from Freesound, see CREDITS.md):
 * a market murmur that fades away from the square, sparrows, St Casimir's bells now and then,
 * a horse and cart passing by, and footsteps paced to the walker. Music, if any is listed, is audio/music.ts.
 */

const FILES = {
  crowd: 'assets/snd/market_crowd.mp3',
  scene: 'assets/snd/market_scene.mp3',
  sparrows: 'assets/snd/sparrows.mp3',
  bells: 'assets/snd/bells.mp3',
  horses: 'assets/snd/horses.mp3',
  steps: 'assets/snd/steps_stone.mp3',
  rain: 'assets/snd/rain.mp3',
} as const;
type Key = keyof typeof FILES;

export interface AmbienceSites { square: THREE.Vector3; bells: THREE.Vector3 | null }

export class Ambience {
  private readonly listener = new THREE.AudioListener();
  private readonly music = new Music(this.listener);
  private readonly buffers = new Map<Key, AudioBuffer>();
  private crowd?: THREE.Audio; private scene2?: THREE.Audio; private sparrows?: THREE.Audio; private steps?: THREE.Audio; private rainLoop?: THREE.Audio;
  private bells?: THREE.PositionalAudio; private horses?: THREE.PositionalAudio;
  private readonly bellAnchor = new THREE.Object3D();
  private readonly horseAnchor = new THREE.Object3D();
  private started = false;
  private muted = false;
  private nextBells = 40 + Math.random() * 60;
  private nextHorses = 25 + Math.random() * 40;
  private stepOnsets: number[] = [];
  private lastStep = -1;

  constructor(camera: THREE.Camera, private readonly world: THREE.Scene, private readonly sites: AmbienceSites, private readonly raining = false) {
    camera.add(this.listener);
    world.add(this.bellAnchor, this.horseAnchor);
    if (sites.bells) this.bellAnchor.position.copy(sites.bells).setY(sites.bells.y + 30);
    const loader = new THREE.AudioLoader(new THREE.LoadingManager()); // don't hold up the loading bar
    for (const [k, url] of Object.entries(FILES) as [Key, string][]) {
      if (k === 'rain' && !raining) continue;
      if (k === 'sparrows' && raining) continue; // birds fall quiet in the rain
      loader.load(url, buf => { this.buffers.set(k, buf); if (this.started) this.wire(k); }, undefined, () => console.warn('audio', url));
    }
  }

  /** Call from a user gesture (browsers keep audio suspended until then). */
  start(): void {
    void this.listener.context.resume();
    this.music.start();
    if (this.started) return;
    this.started = true;
    for (const k of this.buffers.keys()) this.wire(k);
  }

  /** For tests: which layers are loaded and playing. */
  status(): Record<string, unknown> {
    return {
      context: this.listener.context.state, loaded: [...this.buffers.keys()],
      playing: { crowd: !!this.crowd?.isPlaying, scene: !!this.scene2?.isPlaying, sparrows: !!this.sparrows?.isPlaying },
      music: this.music.status(), steps: this.stepOnsets.length, nextBells: Math.round(this.nextBells), nextHorses: Math.round(this.nextHorses),
    };
  }

  /** One footstep, cut from the recording (a different step each time), louder and brighter when jogging. */
  step(speed: number): void {
    const buf = this.buffers.get('steps');
    if (!this.started || !buf || !this.stepOnsets.length) return;
    const ctx = this.listener.context;
    let k = Math.floor(Math.random() * this.stepOnsets.length);
    if (k === this.lastStep) k = (k + 1) % this.stepOnsets.length;
    this.lastStep = k;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.92 + Math.random() * 0.14 + Math.min(0.12, speed * 0.02);
    const g = ctx.createGain();
    g.gain.value = THREE.MathUtils.clamp(0.25 + speed * 0.1, 0.25, 0.7) * (this.raining ? 1.1 : 1);
    src.connect(g).connect(this.listener.getInput());
    const t = ctx.currentTime;
    g.gain.setValueAtTime(g.gain.value, t + 0.22);
    g.gain.linearRampToValueAtTime(0, t + 0.32);
    src.start(t, Math.max(0, this.stepOnsets[k] - 0.015), 0.34);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.listener.setMasterVolume(this.muted ? 0 : 1);
    return this.muted;
  }

  private loop(k: Key, volume: number, rate = 1): THREE.Audio {
    const a = new THREE.Audio(this.listener);
    a.setBuffer(this.buffers.get(k)!);
    a.setLoop(true);
    a.setVolume(volume);
    a.setPlaybackRate(rate);
    a.offset = Math.random() * a.buffer!.duration; // desynchronise the short loops
    a.play();
    return a;
  }

  private positional(k: Key, anchor: THREE.Object3D, refDistance: number): THREE.PositionalAudio {
    const a = new THREE.PositionalAudio(this.listener);
    a.setBuffer(this.buffers.get(k)!);
    a.setRefDistance(refDistance);
    a.setRolloffFactor(1.2);
    a.setDistanceModel('inverse');
    anchor.add(a);
    return a;
  }

  private wire(k: Key): void {
    switch (k) {
      case 'crowd': this.crowd = this.loop('crowd', 0.35, 0.97); break;
      case 'scene': this.scene2 = this.loop('scene', 0.25, 1.02); break;
      case 'sparrows': this.sparrows = this.loop('sparrows', 0.12); break;
      case 'steps': this.stepOnsets = findOnsets(this.buffers.get('steps')!); break;
      case 'rain': this.rainLoop = this.loop('rain', 0.55); break;
      case 'bells': this.bells = this.positional('bells', this.bellAnchor, 40); break;
      case 'horses': this.horses = this.positional('horses', this.horseAnchor, 12); break;
    }
  }

  update(dt: number, walker: THREE.Vector3, speed: number): void {
    if (!this.started) return;
    this.music.update(dt, !!this.bells?.isPlaying);
    // Market bed: full on the square, fading into the side streets
    const d = Math.hypot(walker.x - this.sites.square.x, walker.z - this.sites.square.z);
    const k = THREE.MathUtils.clamp((d - 35) / 70, 0, 1);
    const hush = this.raining ? 0.45 : 1; // fewer people out in the rain
    this.crowd?.setVolume(THREE.MathUtils.lerp(0.38, 0.1, k) * hush);
    this.scene2?.setVolume(THREE.MathUtils.lerp(0.26, 0.06, k) * hush);
    this.sparrows?.setVolume(THREE.MathUtils.lerp(0.1, 0.18, k));

    // St Casimir's bells every few minutes, about 30 s at a time
    this.nextBells -= dt;
    if (this.bells && this.nextBells <= 0 && !this.bells.isPlaying) {
      this.bells.offset = Math.random() * Math.max(0, this.bells.buffer!.duration - 35);
      this.bells.duration = 30;
      this.bells.play();
      this.nextBells = 180 + Math.random() * 120;
    }
    // A horse and cart passing somewhere near the edge of the square
    this.nextHorses -= dt;
    if (this.horses && this.nextHorses <= 0 && !this.horses.isPlaying) {
      const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 30;
      this.horseAnchor.position.set(this.sites.square.x + Math.cos(a) * r, this.sites.square.y + 1, this.sites.square.z + Math.sin(a) * r);
      this.horses.play();
      this.nextHorses = 70 + Math.random() * 80;
    }
  }
}

/** Start times of the individual steps in a footstep recording (peaks of the loudness envelope). */
function findOnsets(buf: AudioBuffer): number[] {
  const d = buf.getChannelData(0), rate = buf.sampleRate, win = Math.floor(rate * 0.01);
  const env: number[] = [];
  for (let i = 0; i + win < d.length; i += win) { let e = 0; for (let j = 0; j < win; j++) e += d[i + j] * d[i + j]; env.push(Math.sqrt(e / win)); }
  const max = Math.max(...env), out: number[] = [];
  let last = -1e9;
  for (let i = 1; i < env.length - 1; i++) {
    if (env[i] > max * 0.3 && env[i] >= env[i - 1] && env[i] >= env[i + 1] && (i - last) * 0.01 > 0.28) {
      // step back to where the sound starts rising
      let j = i; while (j > 0 && env[j - 1] < env[j] && env[j - 1] > max * 0.05) j--;
      out.push(j * 0.01); last = i;
    }
  }
  return out;
}
