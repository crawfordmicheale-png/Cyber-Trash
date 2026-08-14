import { particles } from './particles';
import { fx } from './fx';
import { PAL } from '../render/palette';
import type { ElementStyle } from '../render/palette';
import { audio } from '../core/audio';
import { fxRng } from '../core/rng';
import type { Sprite } from '../render/sprite';

/**
 * Death dispatcher.
 *
 * Per the bible, death is spectacular and varies by damage type — that variety
 * is bought entirely with particles, so a single static sprite supports seven
 * distinct death presentations with no extra art.
 */

export type DeathKind = ElementStyle['death'];

export interface DeathContext {
  x: number;
  y: number;
  /** Roughly the entity's height in pixels; scales the effect. */
  size: number;
  sprite?: Sprite;
  flip?: boolean;
}

/** Shatter a sprite into its own pixels — the most expensive but best-looking one. */
function shatterSprite(ctx: DeathContext, power: number): boolean {
  const sprite = ctx.sprite;
  if (!sprite) return false;
  let data: ImageData;
  try {
    data = sprite.base.getContext('2d')!.getImageData(0, 0, sprite.w, sprite.h);
  } catch {
    return false; // Tainted canvas; fall back to a generic burst.
  }
  // Sample every other pixel: half the particles, same read.
  const step = sprite.w * sprite.h > 900 ? 2 : 1;
  for (let y = 0; y < sprite.h; y += step) {
    for (let x = 0; x < sprite.w; x += step) {
      const i = (y * sprite.w + x) * 4;
      if (data.data[i + 3] < 40) continue;
      if (fxRng.chance(0.45)) continue;
      const r = data.data[i], g = data.data[i + 1], b = data.data[i + 2];
      const wx = ctx.x + (ctx.flip ? sprite.ox - x : x - sprite.ox);
      const wy = ctx.y + (y - sprite.oy);
      const dx = wx - ctx.x;
      const dy = wy - (ctx.y - ctx.size * 0.5);
      const d = Math.max(1, Math.hypot(dx, dy));
      particles.spawn({
        kind: 'pixel',
        x: wx, y: wy,
        vx: (dx / d) * fxRng.range(30, 160) * power,
        vy: (dy / d) * fxRng.range(30, 160) * power - fxRng.range(10, 60),
        gravity: 460,
        life: fxRng.range(0.4, 1.0),
        size: step,
        color: `rgb(${r},${g},${b})`,
      });
    }
  }
  return true;
}

export function playDeath(kind: DeathKind, ctx: DeathContext, power = 1): void {
  const { x, y, size } = ctx;
  const cy = y - size * 0.5;

  switch (kind) {
    case 'scrap':
      shatterSprite(ctx, power);
      particles.scrapBurst(x, cy, power);
      fx.impactStar(x, cy, PAL.orange, PAL.white, power);
      fx.ring(x, y, 2, 22 * power, PAL.orange, 0.26, 2, 0.4);
      audio.enemyDie('scrap');
      break;

    case 'burst':
      shatterSprite(ctx, power * 1.3);
      fx.ring(x, cy, 2, 30 * power, PAL.cyan, 0.28, 2);
      fx.ring(x, cy, 2, 20 * power, PAL.white, 0.18, 1);
      particles.impact(x, cy, PAL.cyan, PAL.white, power * 1.6);
      audio.explode();
      break;

    case 'sludge':
      particles.sludgeBurst(x, cy, power);
      fx.ring(x, y, 2, 24 * power, PAL.toxic, 0.34, 2, 0.35);
      for (let i = 0; i < 6; i++) particles.vapour(x + fxRng.spread(1) * 10, y, PAL.toxic);
      audio.enemyDie('sludge');
      break;

    case 'glitch':
      particles.glitchBurst(x, cy, power);
      if (ctx.sprite) {
        // The sprite tears itself apart in horizontal bands before vanishing.
        for (let i = 0; i < 5; i++) {
          fx.afterimage(
            ctx.sprite, x + fxRng.spread(1) * 12, cy + size * 0.5,
            1, 1, 0, ctx.flip ?? false,
            fxRng.chance(0.5) ? PAL.cyan : PAL.magenta,
            fxRng.range(0.1, 0.3),
          );
        }
      }
      audio.enemyDie('glitch');
      audio.glitch();
      break;

    case 'implode': {
      particles.implode(x, cy, power);
      fx.ring(x, cy, 26 * power, 1, PAL.violet, 0.3, 2);
      // A brief afterglow where the enemy used to be.
      particles.spawn({ kind: 'glow', x, y: cy, life: 0.4, size: 2, color: PAL.violet, additive: true, grow: 5 });
      audio.enemyDie('void');
      break;
    }

    case 'shatter':
      if (!shatterSprite(ctx, power * 1.5)) particles.scrapBurst(x, cy, power);
      fx.impactStar(x, cy, PAL.cyan, PAL.white, power * 1.2);
      audio.enemyDie('scrap');
      break;

    case 'ash':
      shatterSprite(ctx, power * 0.6);
      particles.ashBurst(x, cy, power);
      fx.ring(x, cy, 2, 20 * power, PAL.orange, 0.3, 2);
      audio.explode();
      break;
  }
}

/** Big set-piece death used for elites and bosses. */
export function playBossDeath(ctx: DeathContext): void {
  const { x, y, size } = ctx;
  const cy = y - size * 0.5;
  for (let i = 0; i < 5; i++) {
    const dx = fxRng.spread(1) * size * 0.6;
    const dy = fxRng.spread(1) * size * 0.6;
    setTimeout(() => {
      fx.ring(x + dx, cy + dy, 2, 36, PAL.orange, 0.35, 3);
      particles.impact(x + dx, cy + dy, PAL.orange, PAL.yellow, 2);
      particles.scrapBurst(x + dx, cy + dy, 1.6);
      audio.explode();
    }, i * 110);
  }
  shatterSprite(ctx, 2);
  particles.ashBurst(x, cy, 2.5);
}
