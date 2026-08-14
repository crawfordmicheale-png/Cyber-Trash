import { fxRng } from '../core/rng';
import { clamp } from '../core/math';
import type { Renderer } from '../render/renderer';
import { PAL, rgba } from '../render/palette';

/**
 * Pooled particle system.
 *
 * Particles are the single biggest contributor to the illusion of animation in
 * this game — the characters barely move, so dust, sparks and debris have to
 * sell every footstep, landing and impact.
 */

export type ParticleKind =
  | 'pixel' // chunky square debris, gravity, bounces off nothing
  | 'spark' // fast, bright, short streak
  | 'dust' // soft puff, drifts up, fades
  | 'smoke' // slow, expands, dark
  | 'glow' // additive blob, shrinks
  | 'shard' // rotating scrap chunk
  | 'streak' // motion line
  | 'bit' // glitch bit, jitters, snaps to grid
  | 'drip'; // slow falling sludge droplet

interface Particle {
  active: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  additive: boolean;
  rot: number;
  vrot: number;
  /** Size multiplier at end of life. >1 expands, <1 shrinks. */
  grow: number;
}

const MAX_PARTICLES = 2200;

export class Particles {
  private pool: Particle[] = [];
  private cursor = 0;
  private liveCount = 0;

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool.push({
        active: false, kind: 'pixel', x: 0, y: 0, vx: 0, vy: 0,
        gravity: 0, drag: 0, life: 0, maxLife: 1, size: 1,
        color: PAL.white, additive: false, rot: 0, vrot: 0, grow: 1,
      });
    }
  }

  get count(): number {
    return this.liveCount;
  }

  clear(): void {
    for (const p of this.pool) p.active = false;
    this.liveCount = 0;
  }

  /** Grab the next free slot, recycling the oldest if the pool is saturated. */
  private alloc(): Particle {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      if (!p.active) {
        p.active = true;
        this.liveCount++;
        return p;
      }
    }
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    return p;
  }

  spawn(opts: {
    kind: ParticleKind;
    x: number;
    y: number;
    vx?: number;
    vy?: number;
    gravity?: number;
    drag?: number;
    life: number;
    size?: number;
    color: string;
    additive?: boolean;
    rot?: number;
    vrot?: number;
    grow?: number;
  }): void {
    const p = this.alloc();
    p.kind = opts.kind;
    p.x = opts.x;
    p.y = opts.y;
    p.vx = opts.vx ?? 0;
    p.vy = opts.vy ?? 0;
    p.gravity = opts.gravity ?? 0;
    p.drag = opts.drag ?? 0;
    p.life = opts.life;
    p.maxLife = opts.life;
    p.size = opts.size ?? 1;
    p.color = opts.color;
    p.additive = opts.additive ?? false;
    p.rot = opts.rot ?? 0;
    p.vrot = opts.vrot ?? 0;
    p.grow = opts.grow ?? 1;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.liveCount--;
        continue;
      }
      p.vy += p.gravity * dt;
      if (p.drag > 0) {
        const k = Math.pow(1 - p.drag, dt * 60);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      if (p.kind === 'bit') {
        // Glitch bits teleport instead of moving smoothly.
        if (fxRng.chance(0.25)) {
          p.x += fxRng.spread(1) * 4;
          p.y += fxRng.spread(1) * 4;
        }
      }
    }
  }

  draw(r: Renderer): void {
    const g = r.g;
    // Two passes so all additive particles composite together cleanly.
    for (const additive of [false, true]) {
      g.globalCompositeOperation = additive ? 'lighter' : 'source-over';
      for (const p of this.pool) {
        if (!p.active || p.additive !== additive) continue;
        const t = p.life / p.maxLife; // 1 -> 0
        const size = Math.max(1, p.size * (1 + (p.grow - 1) * (1 - t)));
        const alpha = clamp(p.kind === 'smoke' ? t * 0.55 : t, 0, 1);
        g.globalAlpha = alpha;

        switch (p.kind) {
          case 'pixel':
          case 'bit': {
            g.fillStyle = p.color;
            g.fillRect(Math.round(p.x), Math.round(p.y), Math.round(size), Math.round(size));
            break;
          }
          case 'spark': {
            const len = Math.min(9, Math.hypot(p.vx, p.vy) * 0.035);
            const nx = p.vx === 0 && p.vy === 0 ? 0 : p.vx / Math.hypot(p.vx, p.vy);
            const ny = p.vx === 0 && p.vy === 0 ? 0 : p.vy / Math.hypot(p.vx, p.vy);
            g.strokeStyle = p.color;
            g.lineWidth = size;
            g.beginPath();
            g.moveTo(p.x, p.y);
            g.lineTo(p.x - nx * len, p.y - ny * len);
            g.stroke();
            break;
          }
          case 'streak': {
            g.strokeStyle = p.color;
            g.lineWidth = size;
            const len = 4 + size * 3;
            g.beginPath();
            g.moveTo(p.x - Math.cos(p.rot) * len, p.y - Math.sin(p.rot) * len);
            g.lineTo(p.x + Math.cos(p.rot) * len, p.y + Math.sin(p.rot) * len);
            g.stroke();
            break;
          }
          case 'dust':
          case 'smoke': {
            // Chunky pixel puff: a plus-shape rather than a circle, so it stays
            // in the pixel-art idiom instead of looking like a blurred blob.
            g.fillStyle = p.color;
            const s = Math.round(size);
            const x = Math.round(p.x);
            const y = Math.round(p.y);
            g.fillRect(x - s, y - s + 1, s * 2, s * 2 - 2);
            g.fillRect(x - s + 1, y - s, s * 2 - 2, s * 2);
            break;
          }
          case 'glow': {
            g.fillStyle = p.color;
            const s = Math.round(size);
            g.globalAlpha = alpha * 0.35;
            g.fillRect(Math.round(p.x) - s, Math.round(p.y) - s, s * 2, s * 2);
            g.globalAlpha = alpha;
            const c = Math.max(1, Math.round(s * 0.5));
            g.fillRect(Math.round(p.x) - c, Math.round(p.y) - c, c * 2, c * 2);
            break;
          }
          case 'shard': {
            g.save();
            g.translate(Math.round(p.x), Math.round(p.y));
            g.rotate(p.rot);
            g.fillStyle = p.color;
            g.fillRect(-size, -size * 0.6, size * 2, size * 1.2);
            g.restore();
            break;
          }
          case 'drip': {
            g.fillStyle = p.color;
            g.fillRect(Math.round(p.x), Math.round(p.y), Math.max(1, Math.round(size * 0.6)), Math.round(size * 1.6));
            break;
          }
        }
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // ---- Named emitters ---------------------------------------------------

  /** Footstep / run dust. Small, grey, drifts backwards. */
  runDust(x: number, y: number, dir: number, tint = PAL.metalHi): void {
    for (let i = 0; i < 2; i++) {
      this.spawn({
        kind: 'dust',
        x: x + fxRng.spread(1) * 3,
        y: y - fxRng.range(0, 2),
        vx: -dir * fxRng.range(6, 26) + fxRng.spread(1) * 8,
        vy: -fxRng.range(4, 18),
        gravity: 24,
        drag: 0.06,
        life: fxRng.range(0.18, 0.36),
        size: fxRng.range(1, 2.4),
        color: tint,
        grow: 1.7,
      });
    }
  }

  /** Landing impact: a wide, flat cloud plus a few bouncing chips. */
  landDust(x: number, y: number, force: number, tint = PAL.metalHi): void {
    const n = Math.round(6 + force * 10);
    for (let i = 0; i < n; i++) {
      const dir = fxRng.chance(0.5) ? 1 : -1;
      this.spawn({
        kind: 'dust',
        x: x + fxRng.spread(1) * 5,
        y: y - fxRng.range(0, 3),
        vx: dir * fxRng.range(20, 60 + force * 90),
        vy: -fxRng.range(2, 22) * force,
        gravity: 40,
        drag: 0.08,
        life: fxRng.range(0.22, 0.5),
        size: fxRng.range(1.2, 3),
        color: tint,
        grow: 2.1,
      });
    }
    for (let i = 0; i < Math.round(force * 6); i++) {
      this.spawn({
        kind: 'pixel',
        x, y,
        vx: fxRng.spread(1) * 110,
        vy: -fxRng.range(20, 90),
        gravity: 420,
        life: fxRng.range(0.25, 0.6),
        size: 1,
        color: fxRng.chance(0.3) ? PAL.rustLit : PAL.metalHi,
      });
    }
  }

  /** Dash: horizontal neon streaks and a puff at the origin. */
  dashTrail(x: number, y: number, dir: number, color: string): void {
    for (let i = 0; i < 7; i++) {
      this.spawn({
        kind: 'streak',
        x: x + fxRng.spread(1) * 6,
        y: y - fxRng.range(2, 22),
        vx: -dir * fxRng.range(60, 190),
        vy: fxRng.spread(1) * 12,
        drag: 0.05,
        life: fxRng.range(0.1, 0.26),
        size: fxRng.range(0.8, 2),
        color: fxRng.chance(0.4) ? PAL.white : color,
        additive: true,
        rot: 0,
      });
    }
    this.landDust(x, y, 0.5, PAL.metalHi);
  }

  /** Wall-slide sparks. */
  wallSparks(x: number, y: number, dir: number): void {
    for (let i = 0; i < 2; i++) {
      this.spawn({
        kind: 'spark',
        x, y: y + fxRng.spread(1) * 4,
        vx: dir * fxRng.range(20, 70),
        vy: fxRng.range(-30, 40),
        gravity: 380,
        life: fxRng.range(0.14, 0.34),
        size: 1,
        color: fxRng.chance(0.5) ? PAL.yellow : PAL.orange,
        additive: true,
      });
    }
  }

  /** Generic impact spark burst, coloured by damage element. */
  impact(x: number, y: number, color: string, core: string, power = 1): void {
    const n = Math.round(6 + power * 12);
    for (let i = 0; i < n; i++) {
      const a = fxRng.range(0, Math.PI * 2);
      const sp = fxRng.range(60, 240) * power;
      this.spawn({
        kind: 'spark',
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 20,
        gravity: 300,
        drag: 0.03,
        life: fxRng.range(0.12, 0.34),
        size: fxRng.range(1, 2),
        color: fxRng.chance(0.35) ? core : color,
        additive: true,
      });
    }
    this.spawn({
      kind: 'glow', x, y, life: 0.12, size: 5 * power, color, additive: true, grow: 2.4,
    });
  }

  /** Scrap explosion — metal chunks, used for mechanical deaths. */
  scrapBurst(x: number, y: number, power = 1): void {
    const colors = [PAL.metal, PAL.metalLit, PAL.metalHi, PAL.rust, PAL.rustLit];
    for (let i = 0; i < Math.round(12 + power * 14); i++) {
      const a = fxRng.range(0, Math.PI * 2);
      const sp = fxRng.range(40, 200) * power;
      this.spawn({
        kind: fxRng.chance(0.35) ? 'shard' : 'pixel',
        x: x + fxRng.spread(1) * 4,
        y: y + fxRng.spread(1) * 6,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - fxRng.range(20, 80),
        gravity: 460,
        life: fxRng.range(0.4, 1.1),
        size: fxRng.range(1, 2.6),
        color: fxRng.pick(colors),
        rot: fxRng.range(0, Math.PI),
        vrot: fxRng.spread(1) * 14,
      });
    }
  }

  /** Toxic death — heavy sludge that pools and drips. */
  sludgeBurst(x: number, y: number, power = 1): void {
    for (let i = 0; i < Math.round(14 + power * 16); i++) {
      const a = fxRng.range(-Math.PI, 0);
      const sp = fxRng.range(30, 160) * power;
      this.spawn({
        kind: fxRng.chance(0.4) ? 'drip' : 'pixel',
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        gravity: 520,
        life: fxRng.range(0.5, 1.3),
        size: fxRng.range(1.4, 3),
        color: fxRng.chance(0.4) ? PAL.toxic : PAL.limeDim,
        additive: fxRng.chance(0.4),
      });
    }
    this.spawn({ kind: 'glow', x, y, life: 0.3, size: 10 * power, color: PAL.toxic, additive: true, grow: 2 });
  }

  /** Data death — the sprite corrupts into grid-snapped bits. */
  glitchBurst(x: number, y: number, power = 1): void {
    for (let i = 0; i < Math.round(18 + power * 18); i++) {
      this.spawn({
        kind: 'bit',
        x: x + fxRng.spread(1) * 10,
        y: y + fxRng.spread(1) * 14,
        vx: fxRng.spread(1) * 120,
        vy: fxRng.spread(1) * 90 - 30,
        drag: 0.02,
        life: fxRng.range(0.2, 0.7),
        size: fxRng.range(1, 3),
        color: fxRng.chance(0.5) ? PAL.cyan : fxRng.chance(0.5) ? PAL.magenta : PAL.violet,
        additive: true,
      });
    }
  }

  /** Void death — everything falls inward and vanishes. */
  implode(x: number, y: number, power = 1): void {
    for (let i = 0; i < Math.round(16 + power * 12); i++) {
      const a = fxRng.range(0, Math.PI * 2);
      const dist = fxRng.range(14, 40);
      const sp = fxRng.range(70, 190);
      this.spawn({
        kind: 'streak',
        x: x + Math.cos(a) * dist,
        y: y + Math.sin(a) * dist,
        vx: -Math.cos(a) * sp,
        vy: -Math.sin(a) * sp,
        life: dist / sp,
        size: fxRng.range(1, 2),
        color: fxRng.chance(0.4) ? PAL.white : PAL.violet,
        additive: true,
        rot: a,
      });
    }
    this.spawn({ kind: 'glow', x, y, life: 0.22, size: 3, color: PAL.violet, additive: true, grow: 6 });
  }

  /** Fire / thermal death. */
  ashBurst(x: number, y: number, power = 1): void {
    for (let i = 0; i < Math.round(14 + power * 14); i++) {
      this.spawn({
        kind: fxRng.chance(0.5) ? 'glow' : 'smoke',
        x: x + fxRng.spread(1) * 6,
        y: y + fxRng.spread(1) * 8,
        vx: fxRng.spread(1) * 60,
        vy: -fxRng.range(20, 90),
        gravity: -40,
        drag: 0.04,
        life: fxRng.range(0.4, 1.0),
        size: fxRng.range(1.5, 4),
        color: fxRng.chance(0.5) ? PAL.orange : PAL.metalDark,
        additive: fxRng.chance(0.5),
        grow: 2.2,
      });
    }
  }

  /** Muzzle flash. */
  muzzle(x: number, y: number, angle: number, color: string, core: string): void {
    this.spawn({ kind: 'glow', x, y, life: 0.07, size: 5, color: core, additive: true, grow: 0.4 });
    for (let i = 0; i < 6; i++) {
      const a = angle + fxRng.spread(1) * 0.5;
      const sp = fxRng.range(90, 260);
      this.spawn({
        kind: 'spark',
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        gravity: 140,
        life: fxRng.range(0.05, 0.16),
        size: fxRng.range(1, 2),
        color: fxRng.chance(0.5) ? core : color,
        additive: true,
      });
    }
    for (let i = 0; i < 3; i++) {
      this.spawn({
        kind: 'smoke',
        x, y,
        vx: Math.cos(angle) * fxRng.range(10, 40),
        vy: Math.sin(angle) * fxRng.range(10, 40) - 8,
        life: fxRng.range(0.2, 0.5),
        size: fxRng.range(1, 2.4),
        color: PAL.metalLit,
        grow: 2.6,
      });
    }
  }

  /** Ambient sparks / drips for set dressing. */
  ambient(x: number, y: number, color: string): void {
    this.spawn({
      kind: fxRng.chance(0.5) ? 'spark' : 'drip',
      x, y,
      vx: fxRng.spread(1) * 8,
      vy: fxRng.range(10, 40),
      gravity: 160,
      life: fxRng.range(0.4, 1.0),
      size: 1,
      color,
      additive: true,
    });
  }

  /** Pickup / crafting shimmer. */
  shimmer(x: number, y: number, color: string, count = 8): void {
    for (let i = 0; i < count; i++) {
      const a = fxRng.range(0, Math.PI * 2);
      this.spawn({
        kind: 'glow',
        x: x + Math.cos(a) * fxRng.range(0, 8),
        y: y + Math.sin(a) * fxRng.range(0, 8),
        vx: Math.cos(a) * 30,
        vy: Math.sin(a) * 30 - 24,
        drag: 0.06,
        life: fxRng.range(0.25, 0.6),
        size: fxRng.range(1, 2.2),
        color,
        additive: true,
        grow: 0.3,
      });
    }
  }

  /** Blood/oil spray when the player takes a hit. */
  hurtSpray(x: number, y: number, dir: number): void {
    for (let i = 0; i < 14; i++) {
      this.spawn({
        kind: 'pixel',
        x, y,
        vx: dir * fxRng.range(30, 170),
        vy: -fxRng.range(10, 120),
        gravity: 520,
        life: fxRng.range(0.3, 0.8),
        size: fxRng.range(1, 2),
        color: fxRng.chance(0.5) ? PAL.blood : PAL.magenta,
        additive: fxRng.chance(0.3),
      });
    }
  }

  /** Debug-friendly translucent haze used by toxic pools and vents. */
  vapour(x: number, y: number, color: string): void {
    this.spawn({
      kind: 'smoke',
      x: x + fxRng.spread(1) * 6,
      y,
      vx: fxRng.spread(1) * 10,
      vy: -fxRng.range(6, 22),
      life: fxRng.range(0.6, 1.6),
      size: fxRng.range(1.5, 3.5),
      color: rgba(color, 0.5),
      grow: 2.4,
    });
  }
}

export const particles = new Particles();
