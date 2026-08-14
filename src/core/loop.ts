import { time } from './time';
import { input } from './input';

/** Physics runs at a fixed 120Hz so dashes and fast projectiles never tunnel. */
export const FIXED_DT = 1 / 120;
/** Never simulate more than this much wall time in one frame (tab-switch guard). */
const MAX_FRAME = 0.1;

export interface LoopHandlers {
  /** Fixed-step simulation. `dt` is always FIXED_DT (already time-scaled). */
  step(dt: number): void;
  /** Draw. `alpha` is the interpolation factor into the next step. */
  render(alpha: number): void;
}

export class Loop {
  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;

  /** Smoothed frames-per-second for the debug readout. */
  fps = 60;

  constructor(private handlers: LoopHandlers) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now() / 1000;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (nowMs: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const now = nowMs / 1000;
    let raw = now - this.lastTime;
    this.lastTime = now;
    if (raw > MAX_FRAME) raw = MAX_FRAME;
    if (raw <= 0) return;

    this.fps += ((1 / raw) - this.fps) * 0.05;

    input.update(time.elapsed + raw);
    const dt = time.step(raw);

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < 8) {
      this.handlers.step(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    // Bail out of a death spiral rather than falling further behind.
    if (steps >= 8) this.accumulator = 0;

    this.handlers.render(this.accumulator / FIXED_DT);
  };
}
