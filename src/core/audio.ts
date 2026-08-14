/**
 * Procedural audio. Every sound is synthesised at call time from oscillators and
 * noise buffers — no audio files ship with the game.
 *
 * Per the bible the audio "carries part of the animation workload", so these are
 * deliberately over-driven: dirty gunshots, metal clangs, digital glitches.
 */

type NoiseKind = 'white' | 'pink' | 'metal';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise = new Map<NoiseKind, AudioBuffer>();
  /** Rate-limit identical sounds so a shotgun doesn't produce 12 stacked blasts. */
  private lastPlayed = new Map<string, number>();

  muted = false;
  volume = 0.55;

  /** Must be called from a user gesture (browsers block autoplay). */
  init(): void {
    if (this.ctx) return;
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    // A gentle limiter keeps the layered explosions from clipping to mush.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 12;
    comp.attack.value = 0.002;
    comp.release.value = 0.14;
    this.master.connect(comp).connect(this.ctx.destination);

    this.buildNoise('white');
    this.buildNoise('pink');
    this.buildNoise('metal');
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  private buildNoise(kind: NoiseKind): void {
    if (!this.ctx) return;
    const len = this.ctx.sampleRate * 1.2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    if (kind === 'white') {
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } else if (kind === 'pink') {
      // Cheap pink-ish noise via a one-pole lowpass over white.
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.04 * w) / 1.04;
        data[i] = last * 3.2;
      }
    } else {
      // "Metal": white noise ring-modulated by a cluster of inharmonic partials.
      const partials = [1237, 1841, 2683, 3517, 4241];
      for (let i = 0; i < len; i++) {
        const t = i / this.ctx.sampleRate;
        let s = 0;
        for (const p of partials) s += Math.sin(t * p * Math.PI * 2);
        data[i] = (Math.random() * 2 - 1) * 0.6 + (s / partials.length) * 0.4;
      }
    }
    this.noise.set(kind, buf);
  }

  /** Returns false if this sound was played too recently to repeat. */
  private throttle(key: string, minGap: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    const last = this.lastPlayed.get(key) ?? -999;
    if (now - last < minGap) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  private env(gain: GainNode, t: number, peak: number, attack: number, decay: number): void {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(opts: {
    type: OscillatorType;
    freq: number;
    freqTo?: number;
    dur: number;
    gain?: number;
    attack?: number;
    detune?: number;
    delay?: number;
  }): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime + (opts.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = opts.type;
    osc.frequency.setValueAtTime(opts.freq, t);
    if (opts.freqTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqTo), t + opts.dur);
    }
    if (opts.detune) osc.detune.setValueAtTime(opts.detune, t);
    this.env(g, t, opts.gain ?? 0.25, opts.attack ?? 0.004, opts.dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + opts.dur + 0.06);
  }

  private burst(opts: {
    kind: NoiseKind;
    dur: number;
    gain?: number;
    filter?: BiquadFilterType;
    freq?: number;
    freqTo?: number;
    q?: number;
    delay?: number;
  }): void {
    if (!this.ctx || !this.master || this.muted) return;
    const buf = this.noise.get(opts.kind);
    if (!buf) return;
    const t = this.ctx.currentTime + (opts.delay ?? 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const filter = this.ctx.createBiquadFilter();
    filter.type = opts.filter ?? 'bandpass';
    filter.frequency.setValueAtTime(opts.freq ?? 1200, t);
    if (opts.freqTo !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, opts.freqTo), t + opts.dur);
    }
    filter.Q.value = opts.q ?? 1;
    const g = this.ctx.createGain();
    this.env(g, t, opts.gain ?? 0.3, 0.003, opts.dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.4);
    src.stop(t + opts.dur + 0.06);
  }

  // ---- The actual game sounds -------------------------------------------

  jump(): void {
    this.tone({ type: 'square', freq: 190, freqTo: 430, dur: 0.1, gain: 0.11 });
    this.burst({ kind: 'pink', dur: 0.09, gain: 0.07, filter: 'highpass', freq: 900 });
  }

  land(force: number): void {
    if (!this.throttle('land', 0.05)) return;
    const f = Math.min(1, force);
    this.tone({ type: 'sine', freq: 120, freqTo: 42, dur: 0.11, gain: 0.14 * f });
    this.burst({ kind: 'pink', dur: 0.13, gain: 0.13 * f, filter: 'lowpass', freq: 1600, freqTo: 300 });
  }

  dash(): void {
    this.burst({ kind: 'white', dur: 0.2, gain: 0.16, filter: 'bandpass', freq: 2600, freqTo: 600, q: 2.5 });
    this.tone({ type: 'sawtooth', freq: 720, freqTo: 170, dur: 0.14, gain: 0.07 });
  }

  swing(heavy: boolean): void {
    if (!this.throttle('swing', 0.05)) return;
    this.burst({
      kind: 'white',
      dur: heavy ? 0.19 : 0.13,
      gain: 0.14,
      filter: 'bandpass',
      freq: heavy ? 900 : 1900,
      freqTo: heavy ? 260 : 520,
      q: 1.6,
    });
  }

  hit(heavy: boolean, element: string): void {
    if (!this.throttle('hit', 0.02)) return;
    // The metallic core is the same every time; the element colours the tail.
    this.burst({ kind: 'metal', dur: heavy ? 0.17 : 0.1, gain: heavy ? 0.3 : 0.2, filter: 'bandpass', freq: 2400, q: 0.9 });
    this.tone({ type: 'square', freq: heavy ? 150 : 240, freqTo: 60, dur: 0.08, gain: 0.16 });
    switch (element) {
      case 'shock':
        this.tone({ type: 'sawtooth', freq: 3200, freqTo: 900, dur: 0.09, gain: 0.07, delay: 0.01 });
        break;
      case 'toxic':
        this.burst({ kind: 'pink', dur: 0.22, gain: 0.09, filter: 'lowpass', freq: 700, freqTo: 180, delay: 0.02 });
        break;
      case 'plasma':
        this.tone({ type: 'sine', freq: 900, freqTo: 130, dur: 0.16, gain: 0.1, delay: 0.005 });
        break;
      case 'void':
        this.tone({ type: 'triangle', freq: 70, freqTo: 28, dur: 0.3, gain: 0.13, delay: 0.01 });
        break;
      case 'data':
        for (let i = 0; i < 4; i++) {
          this.tone({ type: 'square', freq: 400 + Math.random() * 2400, dur: 0.02, gain: 0.05, delay: i * 0.022 });
        }
        break;
      default:
        break;
    }
  }

  shoot(element: string): void {
    if (!this.throttle('shoot', 0.03)) return;
    this.burst({ kind: 'white', dur: 0.11, gain: 0.2, filter: 'bandpass', freq: 1700, freqTo: 400, q: 1.2 });
    const base = element === 'plasma' ? 620 : element === 'shock' ? 900 : 380;
    this.tone({ type: element === 'plasma' ? 'sine' : 'square', freq: base, freqTo: base * 0.25, dur: 0.09, gain: 0.14 });
  }

  explode(): void {
    this.burst({ kind: 'pink', dur: 0.5, gain: 0.36, filter: 'lowpass', freq: 2200, freqTo: 90 });
    this.tone({ type: 'sine', freq: 90, freqTo: 26, dur: 0.42, gain: 0.28 });
    this.burst({ kind: 'metal', dur: 0.3, gain: 0.14, filter: 'highpass', freq: 1800, delay: 0.02 });
  }

  enemyDie(kind: string): void {
    if (kind === 'glitch' || kind === 'data') {
      for (let i = 0; i < 6; i++) {
        this.tone({ type: 'square', freq: 200 + Math.random() * 3000, dur: 0.03, gain: 0.07, delay: i * 0.025 });
      }
    } else if (kind === 'sludge') {
      this.burst({ kind: 'pink', dur: 0.35, gain: 0.2, filter: 'lowpass', freq: 900, freqTo: 120 });
    } else {
      this.burst({ kind: 'metal', dur: 0.26, gain: 0.22, filter: 'bandpass', freq: 1500, freqTo: 400 });
      this.tone({ type: 'square', freq: 180, freqTo: 44, dur: 0.2, gain: 0.14 });
    }
  }

  hurt(): void {
    this.tone({ type: 'sawtooth', freq: 330, freqTo: 80, dur: 0.24, gain: 0.24 });
    this.burst({ kind: 'white', dur: 0.14, gain: 0.14, filter: 'lowpass', freq: 900 });
  }

  pickup(): void {
    this.tone({ type: 'square', freq: 720, dur: 0.06, gain: 0.1 });
    this.tone({ type: 'square', freq: 1080, dur: 0.08, gain: 0.09, delay: 0.05 });
  }

  craft(): void {
    this.tone({ type: 'square', freq: 300, freqTo: 900, dur: 0.14, gain: 0.12 });
    this.burst({ kind: 'metal', dur: 0.2, gain: 0.16, filter: 'bandpass', freq: 2600 });
    this.tone({ type: 'sawtooth', freq: 1300, dur: 0.1, gain: 0.07, delay: 0.1 });
  }

  ui(kind: 'move' | 'select' | 'back'): void {
    if (kind === 'move') this.tone({ type: 'square', freq: 620, dur: 0.03, gain: 0.06 });
    else if (kind === 'select') this.tone({ type: 'square', freq: 880, freqTo: 1200, dur: 0.06, gain: 0.09 });
    else this.tone({ type: 'square', freq: 400, freqTo: 220, dur: 0.07, gain: 0.07 });
  }

  glitch(): void {
    for (let i = 0; i < 8; i++) {
      this.tone({
        type: 'square',
        freq: 120 + Math.random() * 3400,
        dur: 0.018,
        gain: 0.06,
        delay: i * 0.018,
      });
    }
  }

  layerClear(): void {
    const notes = [220, 277, 330, 440, 554];
    notes.forEach((f, i) => {
      this.tone({ type: 'square', freq: f, dur: 0.3, gain: 0.11, delay: i * 0.09 });
      this.tone({ type: 'sawtooth', freq: f / 2, dur: 0.4, gain: 0.05, delay: i * 0.09 });
    });
  }
}

export const audio = new AudioEngine();
