import * as THREE from 'three';

/**
 * Ambient sound for the square (all CC0 recordings from Freesound, see CREDITS.md):
 * a market murmur that fades away from the square, sparrows, St Casimir's bells now and then,
 * a horse and cart passing by, and footsteps paced to the walker.
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
  private readonly buffers = new Map<Key, AudioBuffer>();
  private crowd?: THREE.Audio; private scene2?: THREE.Audio; private sparrows?: THREE.Audio; private steps?: THREE.Audio; private rainLoop?: THREE.Audio;
  private bells?: THREE.PositionalAudio; private horses?: THREE.PositionalAudio;
  private readonly bellAnchor = new THREE.Object3D();
  private readonly horseAnchor = new THREE.Object3D();
  private started = false;
  private muted = false;
  private nextBells = 40 + Math.random() * 60;
  private nextHorses = 25 + Math.random() * 40;
  private stepGain = 0;

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
    if (this.started) return;
    this.started = true;
    for (const k of this.buffers.keys()) this.wire(k);
  }

  /** For tests: which layers are loaded and playing. */
  status(): Record<string, unknown> {
    return {
      context: this.listener.context.state, loaded: [...this.buffers.keys()],
      playing: { crowd: !!this.crowd?.isPlaying, scene: !!this.scene2?.isPlaying, sparrows: !!this.sparrows?.isPlaying, steps: !!this.steps?.isPlaying },
      stepGain: +this.stepGain.toFixed(2), nextBells: Math.round(this.nextBells), nextHorses: Math.round(this.nextHorses),
    };
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
      case 'steps': this.steps = this.loop('steps', 0); break;
      case 'rain': this.rainLoop = this.loop('rain', 0.55); break;
      case 'bells': this.bells = this.positional('bells', this.bellAnchor, 40); break;
      case 'horses': this.horses = this.positional('horses', this.horseAnchor, 12); break;
    }
  }

  update(dt: number, walker: THREE.Vector3, speed: number): void {
    if (!this.started) return;
    // Market bed: full on the square, fading into the side streets
    const d = Math.hypot(walker.x - this.sites.square.x, walker.z - this.sites.square.z);
    const k = THREE.MathUtils.clamp((d - 35) / 70, 0, 1);
    const hush = this.raining ? 0.45 : 1; // fewer people out in the rain
    this.crowd?.setVolume(THREE.MathUtils.lerp(0.38, 0.1, k) * hush);
    this.scene2?.setVolume(THREE.MathUtils.lerp(0.26, 0.06, k) * hush);
    this.sparrows?.setVolume(THREE.MathUtils.lerp(0.1, 0.18, k));

    // Footsteps: the step sequence loops while walking, paced to speed
    const want = speed > 0.25 ? THREE.MathUtils.clamp(0.35 + speed * 0.08, 0.4, 0.75) : 0;
    this.stepGain += (want - this.stepGain) * (1 - Math.exp(-(want > this.stepGain ? 12 : 6) * dt));
    if (this.steps) {
      this.steps.setVolume(this.stepGain);
      if (speed > 0.25) this.steps.setPlaybackRate(THREE.MathUtils.clamp(speed / 1.6, 0.8, 1.9));
    }

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
