import type { Renderer } from '../render/renderer';
import type { Sprite } from '../render/sprite';
import { PAL, rgba } from '../render/palette';
import { fxRng } from '../core/rng';
import { clamp, easeOutCubic, TAU } from '../core/math';
import { drawText } from '../render/text';
import { particles } from './particles';

/**
 * Mid-level effects: the big readable shapes that sit on top of the particles.
 *
 * A melee hit in this game is a slash arc + an impact star + hit-stop + shake +
 * debris. None of it is sprite animation; all of it is here.
 */

interface Slash {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  a0: number;
  a1: number;
  thickness: number;
  color: string;
  core: string;
  life: number;
  maxLife: number;
  /** Arc grows outward as it fades. */
  expand: number;
  /** Draw a skull sigil at the arc's midpoint — reserved for heavy hits. */
  sigil: boolean;
}

interface Ring {
  active: boolean;
  x: number;
  y: number;
  r: number;
  targetR: number;
  color: string;
  life: number;
  maxLife: number;
  thickness: number;
  /** Squash the ring into an ellipse, for ground-level shockwaves. */
  flatten: number;
}

interface Afterimage {
  active: boolean;
  sprite: Sprite;
  x: number;
  y: number;
  sx: number;
  sy: number;
  rot: number;
  flip: boolean;
  color: string;
  life: number;
  maxLife: number;
}

interface Floater {
  active: boolean;
  text: string;
  x: number;
  y: number;
  vy: number;
  color: string;
  glow: string | undefined;
  life: number;
  maxLife: number;
  scale: number;
}

interface Beam {
  active: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  core: string;
  width: number;
  life: number;
  maxLife: number;
}

function poolOf<T extends { active: boolean }>(n: number, make: () => T): T[] {
  return Array.from({ length: n }, make);
}

export class Fx {
  private slashes = poolOf<Slash>(48, () => ({
    active: false, x: 0, y: 0, radius: 0, a0: 0, a1: 0, thickness: 0,
    color: PAL.magenta, core: PAL.white, life: 0, maxLife: 1, expand: 0, sigil: false,
  }));

  private rings = poolOf<Ring>(48, () => ({
    active: false, x: 0, y: 0, r: 0, targetR: 0, color: PAL.cyan,
    life: 0, maxLife: 1, thickness: 1, flatten: 1,
  }));

  private afterimages = poolOf<Afterimage>(64, () => ({
    active: false, sprite: null as unknown as Sprite, x: 0, y: 0, sx: 1, sy: 1,
    rot: 0, flip: false, color: PAL.cyan, life: 0, maxLife: 1,
  }));

  private floaters = poolOf<Floater>(48, () => ({
    active: false, text: '', x: 0, y: 0, vy: 0, color: PAL.white,
    glow: undefined, life: 0, maxLife: 1, scale: 1,
  }));

  private beams = poolOf<Beam>(24, () => ({
    active: false, x1: 0, y1: 0, x2: 0, y2: 0, color: PAL.cyan,
    core: PAL.white, width: 2, life: 0, maxLife: 1,
  }));

  private free<T extends { active: boolean }>(pool: T[]): T | null {
    for (const item of pool) if (!item.active) return item;
    return null;
  }

  clear(): void {
    for (const pool of [this.slashes, this.rings, this.afterimages, this.floaters, this.beams]) {
      for (const item of pool as { active: boolean }[]) item.active = false;
    }
  }

  // ---- spawners ---------------------------------------------------------

  /**
   * The signature melee arc. `facing` is the swing centre; the arc sweeps
   * `spread` radians around it.
   */
  slash(opts: {
    x: number;
    y: number;
    facing: number;
    spread: number;
    radius: number;
    thickness?: number;
    color?: string;
    core?: string;
    life?: number;
    sigil?: boolean;
  }): void {
    const s = this.free(this.slashes);
    if (!s) return;
    s.active = true;
    s.x = opts.x;
    s.y = opts.y;
    s.radius = opts.radius;
    s.a0 = opts.facing - opts.spread / 2;
    s.a1 = opts.facing + opts.spread / 2;
    s.thickness = opts.thickness ?? 5;
    s.color = opts.color ?? PAL.magenta;
    s.core = opts.core ?? PAL.white;
    s.life = opts.life ?? 0.19;
    s.maxLife = s.life;
    s.expand = opts.radius * 0.16;
    s.sigil = opts.sigil ?? false;

    // Dripping paint along the arc: the graffiti tell from the reference art.
    const drips = Math.round(opts.radius * 0.25);
    for (let i = 0; i < drips; i++) {
      const a = opts.facing + fxRng.spread(1) * opts.spread * 0.5;
      const rr = opts.radius * fxRng.range(0.75, 1.05);
      particles.spawn({
        kind: 'drip',
        x: opts.x + Math.cos(a) * rr,
        y: opts.y + Math.sin(a) * rr,
        vx: Math.cos(a) * 30,
        vy: fxRng.range(20, 90),
        gravity: 260,
        life: fxRng.range(0.15, 0.4),
        size: fxRng.range(1, 2),
        color: s.color,
        additive: true,
      });
    }
  }

  /** Whirlwind / spin attack: a flattened ring that reads as rotation. */
  spin(x: number, y: number, radius: number, color: string, life = 0.3): void {
    for (let i = 0; i < 3; i++) {
      const r = this.free(this.rings);
      if (!r) return;
      r.active = true;
      r.x = x;
      r.y = y;
      r.r = radius * (0.4 + i * 0.2);
      r.targetR = radius * (1 + i * 0.14);
      r.color = i === 0 ? PAL.white : color;
      r.life = life + i * 0.04;
      r.maxLife = r.life;
      r.thickness = 2 - i * 0.5;
      r.flatten = 0.42;
    }
  }

  /** Expanding shockwave. `flatten` < 1 makes it hug the ground. */
  ring(x: number, y: number, from: number, to: number, color: string, life = 0.28, thickness = 2, flatten = 1): void {
    const r = this.free(this.rings);
    if (!r) return;
    r.active = true;
    r.x = x;
    r.y = y;
    r.r = from;
    r.targetR = to;
    r.color = color;
    r.life = life;
    r.maxLife = life;
    r.thickness = thickness;
    r.flatten = flatten;
  }

  /** Impact star — the chunky burst drawn at the exact point of contact. */
  impactStar(x: number, y: number, color: string, core: string, power = 1): void {
    this.ring(x, y, 1, 10 * power, color, 0.16, 2);
    particles.impact(x, y, color, core, power);
    const spikes = 4 + Math.round(power * 2);
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * TAU + fxRng.range(0, 0.4);
      particles.spawn({
        kind: 'streak',
        x, y,
        vx: Math.cos(a) * 60 * power,
        vy: Math.sin(a) * 60 * power,
        drag: 0.2,
        life: 0.13,
        size: 1.6,
        color: core,
        additive: true,
        rot: a,
      });
    }
  }

  /** Ghost copy of a sprite, for dashes and fast movement. */
  afterimage(sprite: Sprite, x: number, y: number, sx: number, sy: number, rot: number, flip: boolean, color: string, life = 0.22): void {
    const a = this.free(this.afterimages);
    if (!a) return;
    a.active = true;
    a.sprite = sprite;
    a.x = x;
    a.y = y;
    a.sx = sx;
    a.sy = sy;
    a.rot = rot;
    a.flip = flip;
    a.color = color;
    a.life = life;
    a.maxLife = life;
  }

  /** Small piece of rising text: damage, pickups, status callouts. */
  floater(text: string, x: number, y: number, color: string, opts: { glow?: string; scale?: number; life?: number; vy?: number } = {}): void {
    const f = this.free(this.floaters);
    if (!f) return;
    f.active = true;
    f.text = text;
    f.x = x + fxRng.spread(1) * 4;
    f.y = y;
    f.vy = opts.vy ?? -34;
    f.color = color;
    f.glow = opts.glow;
    f.life = opts.life ?? 0.75;
    f.maxLife = f.life;
    f.scale = opts.scale ?? 1;
  }

  beam(x1: number, y1: number, x2: number, y2: number, color: string, core: string, width = 3, life = 0.14): void {
    const b = this.free(this.beams);
    if (!b) return;
    b.active = true;
    b.x1 = x1; b.y1 = y1; b.x2 = x2; b.y2 = y2;
    b.color = color; b.core = core; b.width = width;
    b.life = life; b.maxLife = life;
  }

  // ---- update / draw ----------------------------------------------------

  update(dt: number): void {
    for (const s of this.slashes) {
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) s.active = false;
    }
    for (const r of this.rings) {
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) { r.active = false; continue; }
      const p = 1 - r.life / r.maxLife;
      r.r += (r.targetR - r.r) * Math.min(1, easeOutCubic(p) * dt * 22);
    }
    for (const a of this.afterimages) {
      if (!a.active) continue;
      a.life -= dt;
      if (a.life <= 0) a.active = false;
    }
    for (const f of this.floaters) {
      if (!f.active) continue;
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy += 60 * dt;
      if (f.life <= 0) f.active = false;
    }
    for (const b of this.beams) {
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) b.active = false;
    }
  }

  /** Afterimages draw underneath entities; everything else draws on top. */
  drawUnder(r: Renderer): void {
    for (const a of this.afterimages) {
      if (!a.active) continue;
      const t = a.life / a.maxLife;
      r.g.globalCompositeOperation = 'lighter';
      r.drawSprite(a.sprite, a.x, a.y, {
        sx: a.sx, sy: a.sy, rot: a.rot, flip: a.flip,
        alpha: t * 0.55, silhouette: a.color, glow: 0,
      });
      r.g.globalCompositeOperation = 'source-over';
    }
  }

  drawOver(r: Renderer): void {
    const g = r.g;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'butt';

    for (const s of this.slashes) {
      if (!s.active) continue;
      const t = s.life / s.maxLife; // 1 -> 0
      const grow = (1 - t) * s.expand;
      const rad = s.radius + grow;
      // Three concentric strokes: bloom, body, hot core.
      const passes: [number, string, number][] = [
        [s.thickness * 2.1, s.color, t * 0.22],
        [s.thickness, s.color, t * 0.85],
        [Math.max(1, s.thickness * 0.34), s.core, t],
      ];
      for (const [w, color, alpha] of passes) {
        g.globalAlpha = clamp(alpha, 0, 1);
        g.strokeStyle = color;
        g.lineWidth = w;
        g.beginPath();
        g.arc(s.x, s.y, rad, s.a0, s.a1);
        g.stroke();
      }
      // Tapered tip: a short bright stub at the end of the sweep.
      const tipA = s.a1;
      g.globalAlpha = t;
      g.strokeStyle = s.core;
      g.lineWidth = Math.max(1, s.thickness * 0.5);
      g.beginPath();
      g.arc(s.x, s.y, rad, tipA - 0.18, tipA);
      g.stroke();

      if (s.sigil) {
        const mid = (s.a0 + s.a1) / 2;
        drawSkullMark(g, s.x + Math.cos(mid) * rad, s.y + Math.sin(mid) * rad, s.core, t);
      }
    }

    for (const ring of this.rings) {
      if (!ring.active) continue;
      const t = ring.life / ring.maxLife;
      g.globalAlpha = clamp(t * 0.9, 0, 1);
      g.strokeStyle = ring.color;
      g.lineWidth = Math.max(1, ring.thickness * t + 0.5);
      g.beginPath();
      g.ellipse(ring.x, ring.y, ring.r, ring.r * ring.flatten, 0, 0, TAU);
      g.stroke();
    }

    for (const b of this.beams) {
      if (!b.active) continue;
      const t = b.life / b.maxLife;
      g.globalAlpha = t * 0.4;
      g.strokeStyle = b.color;
      g.lineWidth = b.width * 2.6 * t;
      g.beginPath(); g.moveTo(b.x1, b.y1); g.lineTo(b.x2, b.y2); g.stroke();
      g.globalAlpha = t;
      g.strokeStyle = b.core;
      g.lineWidth = Math.max(1, b.width * t);
      g.beginPath(); g.moveTo(b.x1, b.y1); g.lineTo(b.x2, b.y2); g.stroke();
    }

    g.restore();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    for (const f of this.floaters) {
      if (!f.active) continue;
      const t = f.life / f.maxLife;
      drawText(r.g, f.text, f.x, f.y, {
        color: f.color,
        glow: f.glow,
        align: 'center',
        scale: f.scale,
        alpha: clamp(t * 1.6, 0, 1),
        shadow: PAL.black,
      });
    }
  }

  /** Looping aura drawn immediately under an entity. */
  drawAura(r: Renderer, x: number, y: number, color: string, t: number, radius = 10, intensity = 1): void {
    const g = r.g;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const phase = (t * 0.9 + i / 3) % 1;
      g.globalAlpha = (1 - phase) * 0.4 * intensity;
      g.strokeStyle = color;
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(x, y, radius * (0.5 + phase * 0.8), radius * 0.34 * (0.5 + phase * 0.8), 0, 0, TAU);
      g.stroke();
    }
    // Rising motes.
    for (let i = 0; i < 4; i++) {
      const phase = (t * 1.4 + i / 4) % 1;
      const ax = x + Math.sin((t * 2 + i) * 2.1) * radius * 0.7;
      const ay = y - phase * radius * 2.1;
      g.globalAlpha = (1 - phase) * 0.85 * intensity;
      g.fillStyle = color;
      g.fillRect(Math.round(ax), Math.round(ay), 1, 1);
    }
    g.restore();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  /** Charge-up circle, drawn while an attack winds up. */
  drawCharge(r: Renderer, x: number, y: number, color: string, progress: number, t: number): void {
    const g = r.g;
    const p = clamp(progress, 0, 1);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.45 + p * 0.5;
    g.strokeStyle = color;
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(x, y, 16 * (1 - p * 0.5), 5 * (1 - p * 0.5), 0, 0, TAU);
    g.stroke();
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + (i / 3) * TAU;
      const rr = 18 * (1 - p);
      g.fillStyle = i === 0 ? PAL.white : color;
      g.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(y + Math.sin(a) * rr * 0.35), 2, 2);
    }
    g.restore();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  /** Dripping neon paint under a platform edge — pure set dressing. */
  drawDrip(r: Renderer, x: number, y: number, len: number, color: string, t: number): void {
    const wobble = Math.sin(t * 1.7 + x * 0.3) * 0.5 + 0.5;
    r.glowRect(x, y, 1, len, rgba(color, 0.8), 0.6, 1);
    r.glowRect(x, y + len + wobble * 3, 1, 2, color, 0.9, 1);
  }
}

/** The recurring X-eyed skull mark, drawn as a tiny sigil on heavy hits. */
function drawSkullMark(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, alpha: number): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const px = Math.round(x) - 3;
  const py = Math.round(y) - 3;
  const rows = [
    '.####.',
    '#....#',
    '#.##.#',
    '#.##.#',
    '#....#',
    '.#.#..',
  ];
  for (let ry = 0; ry < rows.length; ry++) {
    for (let rx = 0; rx < rows[ry].length; rx++) {
      if (rows[ry][rx] === '#') ctx.fillRect(px + rx, py + ry, 1, 1);
    }
  }
}

export const fx = new Fx();
