import { Level, Tile } from './level';
import { TILE } from '../art/props';
import { clamp, damp, type Rect } from '../core/math';
import { time } from '../core/time';

/**
 * Shared body + "animation" state.
 *
 * There is exactly one animated thing in this codebase and it lives here: a
 * squash/stretch spring, a lean, a wobble and a flash. Every character in the
 * game is a static sprite driven by these four numbers.
 */
export class Actor {
  x = 0;
  y = 0; // feet
  vx = 0;
  vy = 0;

  w = 12;
  h = 28;

  facing: 1 | -1 = 1;
  onGround = false;
  wasOnGround = false;
  /** -1 / 1 while touching a wall, 0 otherwise. */
  onWall: 0 | 1 | -1 = 0;

  hp = 10;
  maxHp = 10;
  dead = false;

  /** Gravity multiplier; flyers set this to 0. */
  gravityScale = 1;

  // ---- presentation state ----------------------------------------------
  /** Squash spring: positive = squashed (wide+short), negative = stretched. */
  private squashVal = 0;
  private squashVel = 0;
  /** Lean angle in radians, driven by horizontal velocity. */
  lean = 0;
  /** Extra rotation, used for airborne tumble and hit reactions. */
  rot = 0;
  /** 0..1 white-out. */
  flash = 0;
  /** Per-actor phase so a crowd of enemies doesn't breathe in lockstep. */
  readonly phase = Math.random() * Math.PI * 2;
  /** Seconds of remaining knockback lockout. */
  stun = 0;
  /** Damage-over-time bookkeeping, set by elemental hits. */
  poison = 0;
  burn = 0;
  shocked = 0;
  corrupted = 0;

  get rect(): Rect {
    return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
  }

  get cx(): number { return this.x; }
  get cy(): number { return this.y - this.h / 2; }

  /**
   * Kick the squash spring.
   * @param amount positive squashes (landings), negative stretches (jumps).
   */
  squash(amount: number): void {
    this.squashVel += amount;
  }

  hitFlash(amount = 1): void {
    this.flash = Math.max(this.flash, amount);
  }

  /** Spring + decay for all the presentation values. */
  updateVisual(dt: number): void {
    // Critically-damped-ish spring back to neutral.
    const stiffness = 240;
    const damping = 16;
    this.squashVel += -this.squashVal * stiffness * dt;
    this.squashVel -= this.squashVel * damping * dt;
    this.squashVal += this.squashVel * dt;
    this.squashVal = clamp(this.squashVal, -0.5, 0.5);

    const targetLean = clamp(this.vx / 340, -0.16, 0.16) * this.facing;
    this.lean = damp(this.lean, targetLean, 0.14, dt);

    this.flash = Math.max(0, this.flash - dt * 6);
    this.stun = Math.max(0, this.stun - dt);
    this.rot = damp(this.rot, 0, 0.14, dt);
  }

  /**
   * Final draw scale. Combines the squash spring with idle breathing — the
   * bible's 100% -> 101-102% -> 100%, which reads as "alive" at almost no cost.
   */
  drawScale(breathing = true, amplitude = 0.015): [number, number] {
    const s = this.squashVal;
    let sx = 1 + s;
    let sy = 1 - s;
    if (breathing && this.onGround && Math.abs(this.vx) < 8) {
      const b = Math.sin(time.elapsed * 2.6 + this.phase) * amplitude;
      sy += b;
      sx -= b * 0.5;
    }
    return [sx, sy];
  }

  /** Vertical bob applied while running — cheaper and punchier than a walk cycle. */
  runBob(speedFraction: number): number {
    if (!this.onGround) return 0;
    const f = clamp(speedFraction, 0, 1);
    return -Math.abs(Math.sin(time.elapsed * 17)) * 1.6 * f;
  }

  applyGravity(dt: number, gravity: number, maxFall: number): void {
    if (this.gravityScale === 0) return;
    this.vy = Math.min(maxFall, this.vy + gravity * this.gravityScale * dt);
  }

  /**
   * Axis-separated tile collision. Horizontal first, then vertical, so walking
   * into a wall never eats the jump.
   *
   * @param dropThrough when true, one-way platforms are ignored.
   */
  moveAndCollide(level: Level, dt: number, dropThrough = false): void {
    this.wasOnGround = this.onGround;
    this.onWall = 0;

    // --- horizontal
    const dx = this.vx * dt;
    if (dx !== 0) {
      this.x += dx;
      const r = this.rect;
      if (level.overlapsSolid(r)) {
        const dir = Math.sign(dx);
        // Push out to the tile boundary.
        if (dir > 0) {
          const edge = Math.floor((r.x + r.w) / TILE) * TILE;
          this.x = edge - this.w / 2 - 0.01;
        } else {
          const edge = Math.floor(r.x / TILE) * TILE + TILE;
          this.x = edge + this.w / 2 + 0.01;
        }
        this.vx = 0;
        this.onWall = dir as 1 | -1;
      }
    }

    // --- vertical
    const dy = this.vy * dt;
    this.onGround = false;
    if (dy !== 0) {
      this.y += dy;
      const r = this.rect;
      if (level.overlapsSolid(r)) {
        if (dy > 0) {
          const edge = Math.floor((r.y + r.h) / TILE) * TILE;
          this.y = edge - 0.01;
          this.onGround = true;
        } else {
          const edge = Math.floor(r.y / TILE) * TILE + TILE;
          this.y = edge + this.h + 0.01;
        }
        this.vy = 0;
      } else if (dy > 0 && !dropThrough) {
        // One-way platforms: only collide when falling onto the top edge.
        const feetY = this.y;
        const prevFeet = feetY - dy;
        const row = Math.floor(feetY / TILE);
        const rowTop = row * TILE;
        if (prevFeet <= rowTop + 1 && feetY >= rowTop) {
          const x0 = Math.floor((this.x - this.w / 2) / TILE);
          const x1 = Math.floor((this.x + this.w / 2 - 0.001) / TILE);
          for (let cx = x0; cx <= x1; cx++) {
            if (level.get(cx, row) === Tile.Platform) {
              this.y = rowTop - 0.01;
              this.vy = 0;
              this.onGround = true;
              break;
            }
          }
        }
      }
    }

    // Standing still on the ground still needs a ground check.
    if (!this.onGround && this.vy >= 0) {
      const probe: Rect = { x: this.x - this.w / 2, y: this.y, w: this.w, h: 2 };
      if (level.overlapsSolid(probe)) {
        this.onGround = true;
      } else if (!dropThrough) {
        const row = Math.floor((this.y + 1) / TILE);
        const x0 = Math.floor((this.x - this.w / 2) / TILE);
        const x1 = Math.floor((this.x + this.w / 2 - 0.001) / TILE);
        for (let cx = x0; cx <= x1; cx++) {
          if (level.get(cx, row) === Tile.Platform && Math.abs(this.y - row * TILE) < 2) {
            this.onGround = true;
            break;
          }
        }
      }
    }
  }

  /** Knock the actor away from a point. */
  knockback(fromX: number, fromY: number, force: number, lift = 0.45): void {
    const dx = this.x - fromX;
    const dy = this.cy - fromY;
    const d = Math.max(1, Math.hypot(dx, dy));
    this.vx += (dx / d) * force;
    this.vy += (dy / d) * force * lift - force * lift * 0.7;
  }
}
