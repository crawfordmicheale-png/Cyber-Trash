/**
 * Global time control. Hit-stop is doing a large share of the "combat feels
 * violent" work (pillar #2): on impact the whole sim freezes for a few frames
 * so the hit reads as a collision rather than an overlap.
 */
class TimeControl {
  /** Seconds of remaining full freeze. */
  private stopTimer = 0;
  /** Seconds of remaining slow-motion, and how slow. */
  private slowTimer = 0;
  private slowScale = 1;

  /** Scale applied to gameplay dt this frame. */
  scale = 1;
  /** Unscaled seconds since boot — VFX that must keep moving during hit-stop. */
  elapsed = 0;
  /** Scaled seconds since boot — gameplay clocks. */
  gameElapsed = 0;

  /** Freeze everything. Later, longer requests win. */
  hitStop(seconds: number): void {
    if (seconds > this.stopTimer) this.stopTimer = seconds;
  }

  slowMo(seconds: number, scale = 0.25): void {
    if (seconds > this.slowTimer) {
      this.slowTimer = seconds;
      this.slowScale = scale;
    }
  }

  reset(): void {
    this.stopTimer = 0;
    this.slowTimer = 0;
    this.scale = 1;
  }

  /** Advance the clocks. Returns the gameplay dt for this frame. */
  step(rawDt: number): number {
    this.elapsed += rawDt;

    if (this.stopTimer > 0) {
      this.stopTimer -= rawDt;
      this.scale = 0;
      return 0;
    }

    if (this.slowTimer > 0) {
      this.slowTimer -= rawDt;
      this.scale = this.slowScale;
    } else {
      this.scale = 1;
    }

    const dt = rawDt * this.scale;
    this.gameElapsed += dt;
    return dt;
  }
}

export const time = new TimeControl();
