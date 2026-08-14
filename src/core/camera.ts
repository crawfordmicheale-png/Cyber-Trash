import { clamp, damp, lerp } from './math';
import { fxRng } from './rng';

/**
 * Follow camera with trauma-based shake and directional kick.
 *
 * Shake uses squared trauma (Jonas Martinsson's model) so small hits barely
 * register and big ones are violent — a linear falloff makes everything feel
 * the same, which defeats the point.
 */
export class Camera {
  x = 0;
  y = 0;

  /** Where the camera wants to be, before shake/kick. */
  private targetX = 0;
  private targetY = 0;

  /** Shake energy in [0,1]. Decays continuously. */
  private trauma = 0;
  private shakeSeed = fxRng.range(0, 1000);

  /** Impulse offset, e.g. punched away from an explosion. */
  private kickX = 0;
  private kickY = 0;

  /** Look-ahead in the direction of travel, so you can see where you're going. */
  private leadX = 0;
  private leadY = 0;

  /** World bounds the view is clamped inside. */
  bounds = { x: 0, y: -Infinity, w: 4096, h: Infinity };

  constructor(public viewW: number, public viewH: number) {}

  snapTo(x: number, y: number): void {
    this.targetX = x;
    this.targetY = y;
    this.x = x;
    this.y = y;
    this.leadX = 0;
    this.leadY = 0;
  }

  addTrauma(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  /** Directional punch — used for recoil and landings. */
  kick(dx: number, dy: number): void {
    this.kickX += dx;
    this.kickY += dy;
  }

  /**
   * @param fx,fy   focus point (usually the player)
   * @param vx,vy   focus velocity, for look-ahead
   */
  follow(fx: number, fy: number, vx: number, vy: number, dt: number): void {
    this.leadX = damp(this.leadX, clamp(vx * 0.22, -34, 34), 0.06, dt);
    // Falling deserves more look-ahead than rising: you need to see the floor.
    const vLead = vy > 0 ? clamp(vy * 0.14, 0, 40) : clamp(vy * 0.08, -20, 0);
    this.leadY = damp(this.leadY, vLead, 0.05, dt);

    this.targetX = fx + this.leadX;
    this.targetY = fy + this.leadY - 10;

    // Slightly looser vertically so jumping doesn't drag the whole view.
    this.x = damp(this.x, this.targetX, 0.14, dt);
    this.y = damp(this.y, this.targetY, 0.1, dt);

    this.kickX = damp(this.kickX, 0, 0.2, dt);
    this.kickY = damp(this.kickY, 0, 0.2, dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
  }

  /** Top-left corner of the view in world space, including shake. Integer-snapped. */
  viewOrigin(out: { x: number; y: number }): void {
    const shake = this.trauma * this.trauma;
    const t = this.shakeSeed + performance.now() / 1000;
    // Two out-of-phase sines beat Math.random() here: random shake reads as
    // noise, oscillating shake reads as an impact.
    const sx = Math.sin(t * 47.3) * Math.sin(t * 23.1) * shake * 11;
    const sy = Math.cos(t * 41.7) * Math.sin(t * 31.9) * shake * 11;

    let ox = this.x + sx + this.kickX - this.viewW / 2;
    let oy = this.y + sy + this.kickY - this.viewH / 2;

    ox = clamp(ox, this.bounds.x, Math.max(this.bounds.x, this.bounds.x + this.bounds.w - this.viewW));
    if (Number.isFinite(this.bounds.h)) {
      oy = clamp(oy, this.bounds.y, Math.max(this.bounds.y, this.bounds.y + this.bounds.h - this.viewH));
    }

    // Snap to whole pixels or the whole scene shimmers.
    out.x = Math.round(ox);
    out.y = Math.round(oy);
  }

  /** Extra zoom punch on big hits, applied by the renderer. */
  zoomPunch(): number {
    return 1 + this.trauma * this.trauma * 0.035;
  }

  get shakeAmount(): number {
    return this.trauma;
  }

  /** Used by the "climb" HUD marker to ease between layer transitions. */
  static blend(a: number, b: number, t: number): number {
    return lerp(a, b, t);
  }
}
