import type { World } from './world';
import type { Renderer } from '../render/renderer';
import { PAL, RARITY } from '../render/palette';
import { weaponSprite } from '../art/weapons';
import { prop } from '../art/props';
import type { Sprite } from '../render/sprite';
import { particles } from '../fx/particles';
import { fx } from '../fx/fx';
import { audio } from '../core/audio';
import { time } from '../core/time';
import { clamp, dist2 } from '../core/math';
import { fxRng } from '../core/rng';
import { TILE } from '../art/props';
import type { AnyPart } from './weapon';

export type PickupKind = 'part' | 'scrap' | 'health' | 'ammo';

/**
 * Drops. Everything the Stack coughs up when you break something.
 *
 * They bob, glow, and get sucked in by a salvage magnet — the loop the bible
 * describes is "obliterate a trash monster, grab whatever falls out, bolt it on",
 * so the grab step needs to feel automatic.
 */
export class Pickup {
  active = false;
  kind: PickupKind = 'scrap';
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  onGround = false;
  /** Prevents instant pickup while the drop is still flying out of a corpse. */
  arm = 0;
  amount = 0;
  part: AnyPart | null = null;
  private phase = fxRng.range(0, Math.PI * 2);
  private sprite: Sprite | null = null;
  private color = PAL.cyan;

  spawn(kind: PickupKind, x: number, y: number, amount: number, part: AnyPart | null = null): void {
    this.active = true;
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.vx = fxRng.spread(1) * 70;
    this.vy = -fxRng.range(60, 140);
    this.onGround = false;
    this.arm = 0.32;
    this.amount = amount;
    this.part = part;
    this.phase = fxRng.range(0, Math.PI * 2);

    switch (kind) {
      case 'part':
        this.sprite = weaponSprite(part ? (part.slot === 'base' ? part.sprite : part.sprite) : 'attachChip');
        this.color = part ? RARITY[part.rarity].color : PAL.cyan;
        break;
      case 'scrap':
        this.sprite = null;
        this.color = PAL.metalHi;
        break;
      case 'health':
        this.sprite = null;
        this.color = PAL.blood;
        break;
      case 'ammo':
        this.sprite = weaponSprite('projSlug');
        this.color = PAL.yellow;
        break;
    }
  }

  update(world: World, dt: number): void {
    if (!this.active) return;
    this.arm = Math.max(0, this.arm - dt);
    const p = world.player;

    // Magnet: a mod that changes how looting feels, not a stat.
    const magnet = p.weapon.effects.magnet ?? 0;
    const pullRange = 26 + magnet;
    const d2 = dist2(this.x, this.y, p.x, p.cy);

    if (!p.dead && d2 < pullRange * pullRange && this.arm <= 0) {
      const d = Math.max(1, Math.sqrt(d2));
      const pull = 340 * dt;
      this.vx += ((p.x - this.x) / d) * pull;
      this.vy += ((p.cy - this.y) / d) * pull;
      this.onGround = false;
    } else if (!this.onGround) {
      this.vy += 620 * dt;
      this.vx *= Math.pow(0.2, dt);
    }

    if (!this.onGround) {
      const nx = this.x + this.vx * dt;
      const ny = this.y + this.vy * dt;
      if (world.level.isSolid(Math.floor(nx / TILE), Math.floor(this.y / TILE))) this.vx = -this.vx * 0.4;
      else this.x = nx;

      if (world.level.isSolid(Math.floor(this.x / TILE), Math.floor(ny / TILE))) {
        if (this.vy > 0) {
          this.y = Math.floor(ny / TILE) * TILE - 0.01;
          this.onGround = true;
          this.vx = 0;
          this.vy = 0;
        } else {
          this.vy = 0;
        }
      } else {
        this.y = ny;
      }
    }

    if (!p.dead && this.arm <= 0 && d2 < 100) this.collect(world);
    if (this.y > world.level.heightPx + 200) this.active = false;
  }

  private collect(world: World): void {
    const p = world.player;
    this.active = false;
    particles.shimmer(this.x, this.y, this.color, 10);
    audio.pickup();

    switch (this.kind) {
      case 'scrap':
        p.scrap += this.amount;
        world.runScrap += this.amount;
        fx.floater(`+${this.amount}`, this.x, this.y - 6, PAL.metalHi, { glow: PAL.cyan });
        break;
      case 'health': {
        const healed = Math.min(this.amount, p.maxHp - p.hp);
        p.heal(this.amount);
        fx.floater(healed > 0 ? `+${healed} HP` : 'FULL', this.x, this.y - 6, PAL.blood, { glow: PAL.blood });
        break;
      }
      case 'ammo':
        p.ammo = Math.min(p.maxAmmo, p.ammo + this.amount);
        fx.floater(`+${this.amount} AMMO`, this.x, this.y - 6, PAL.yellow, { glow: PAL.orange });
        break;
      case 'part':
        if (this.part) {
          p.addPart(this.part);
          world.notify(this.part.name, RARITY[this.part.rarity].color);
          fx.floater(this.part.name, this.x, this.y - 8, RARITY[this.part.rarity].color, {
            glow: RARITY[this.part.rarity].color, life: 1.4,
          });
          audio.craft();
        }
        break;
    }
  }

  draw(r: Renderer): void {
    if (!this.active) return;
    const bob = Math.sin(time.elapsed * 3 + this.phase) * 1.6;
    const y = this.y - 6 + bob;

    fx.drawAura(r, this.x, this.y, this.color, time.elapsed + this.phase, 7, 0.6);

    if (this.sprite) {
      r.drawSprite(this.sprite, this.x, y, {
        rot: this.kind === 'part' ? Math.sin(time.elapsed * 1.6 + this.phase) * 0.25 : 0,
        glow: 1.2,
        pivotY: 0,
      });
    } else if (this.kind === 'scrap') {
      r.drawSprite(prop('crate'), this.x, y + 4, { sx: 0.5, sy: 0.5, glow: 0.6 });
    } else {
      // Health: a chunky pixel cross, drawn directly.
      const s = 2;
      r.glowRect(this.x - s, y - s * 3, s * 2, s * 6, this.color, 1, 2);
      r.glowRect(this.x - s * 3, y - s, s * 6, s * 2, this.color, 1, 2);
    }
  }
}

export class PickupPool {
  readonly items: Pickup[] = Array.from({ length: 120 }, () => new Pickup());

  spawn(kind: PickupKind, x: number, y: number, amount: number, part: AnyPart | null = null): void {
    for (const p of this.items) {
      if (!p.active) { p.spawn(kind, x, y, amount, part); return; }
    }
  }

  update(world: World, dt: number): void {
    for (const p of this.items) p.update(world, dt);
  }

  draw(r: Renderer): void {
    for (const p of this.items) p.draw(r);
  }

  clear(): void {
    for (const p of this.items) p.active = false;
  }

  get count(): number {
    return this.items.reduce((n, p) => n + (p.active ? 1 : 0), 0);
  }
}

/** Scale drop counts with how hard the thing was to kill. */
export function scrapDropCount(total: number): number[] {
  const drops: number[] = [];
  let left = total;
  while (left > 0) {
    const chunk = clamp(Math.round(left / 3), 1, 12);
    drops.push(chunk);
    left -= chunk;
    if (drops.length > 8) { if (left > 0) drops[drops.length - 1] += left; break; }
  }
  return drops;
}
