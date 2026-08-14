import type { World } from './world';
import type { Weapon } from './weapon';
import { weaponSprite } from '../art/weapons';
import type { Sprite } from '../render/sprite';
import type { Renderer } from '../render/renderer';
import { ELEMENTS, type Element, type ElementStyle, PAL } from '../render/palette';
import { particles } from '../fx/particles';
import { fx } from '../fx/fx';
import { TILE } from '../art/props';
import { angleDelta, dist2, TAU } from '../core/math';
import { fxRng } from '../core/rng';
import type { Enemy } from './enemy';

/**
 * Projectiles carry the mod behaviours: ricochet, homing, pierce, explode. This
 * is where "attach a chip to a nailgun and the bullets start bouncing" actually
 * becomes true.
 */
export class Projectile {
  active = false;

  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  gravity = 0;
  life = 0;
  radius = 3;
  damage = 0;
  spin = 0;
  rot = 0;
  fromPlayer = true;

  sprite!: Sprite;
  style!: ElementStyle;
  element: Element = 'kinetic';

  /** Behaviour, copied off the weapon at spawn time. */
  ricochet = 0;
  homing = 0;
  pierce = 0;
  explode = 0;
  chaos = 0;
  weapon: Weapon | null = null;

  private hitIds = new Set<number>();
  private trailTimer = 0;
  /** Who the bootleg AI has decided to chase this time. */
  private chaosTarget: Enemy | null = null;
  private chaosTimer = 0;

  spawnFromWeapon(x: number, y: number, angle: number, weapon: Weapon, fromPlayer: boolean): void {
    const p = weapon.projectile!;
    this.active = true;
    this.x = x;
    this.y = y;
    const speed = p.speed;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.gravity = p.gravity;
    this.life = p.life;
    this.radius = p.radius;
    this.damage = weapon.damage;
    this.spin = p.spin;
    this.rot = angle;
    this.sprite = weaponSprite(p.sprite);
    this.style = weapon.style;
    this.element = weapon.element;
    this.fromPlayer = fromPlayer;
    this.weapon = weapon;

    this.ricochet = weapon.effects.ricochet ?? 0;
    this.homing = weapon.effects.homing ?? 0;
    this.pierce = weapon.effects.pierce ?? 0;
    this.explode = weapon.effects.explode ?? 0;
    this.chaos = weapon.effects.chaos ?? 0;
    this.hitIds.clear();
    this.chaosTarget = null;
    this.chaosTimer = 0;
  }

  spawnEnemyShot(
    x: number, y: number, angle: number, speed: number,
    damage: number, spriteId: string, element: Element,
  ): void {
    this.active = true;
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.gravity = 0;
    this.life = 4;
    this.radius = 4;
    this.damage = damage;
    this.spin = 0;
    this.rot = angle;
    this.sprite = weaponSprite(spriteId);
    this.style = ELEMENTS[element];
    this.element = element;
    this.fromPlayer = false;
    this.weapon = null;
    this.ricochet = 0;
    this.homing = 0;
    this.pierce = 0;
    this.explode = 0;
    this.chaos = 0;
    this.hitIds.clear();
  }

  update(world: World, dt: number): void {
    if (!this.active) return;

    this.life -= dt;
    if (this.life <= 0) {
      this.finish(world, false);
      return;
    }

    if (this.homing > 0 && this.fromPlayer) this.steer(world, dt);

    this.vy += this.gravity * dt;
    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;

    // --- terrain
    if (world.level.isSolid(Math.floor(nx / TILE), Math.floor(ny / TILE))) {
      if (this.ricochet > 0) {
        this.bounce(world, nx, ny);
      } else {
        this.x = nx;
        this.y = ny;
        this.finish(world, true);
        return;
      }
    } else {
      this.x = nx;
      this.y = ny;
    }

    this.rot += this.spin * dt;

    // --- trail
    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = 0.02;
      particles.spawn({
        kind: 'glow',
        x: this.x, y: this.y,
        life: 0.16, size: this.radius * 0.9,
        color: this.style.glow, additive: true, grow: 0.2,
      });
    }

    // --- entities
    if (this.fromPlayer) {
      for (const e of world.enemies) {
        if (e.dead || this.hitIds.has(e.id)) continue;
        if (dist2(this.x, this.y, e.cx, e.cy) > (this.radius + Math.max(e.w, e.h) * 0.5) ** 2) continue;
        this.hitIds.add(e.id);
        e.hit(world, this.damage, this.weapon!, this.x, this.y);
        world.player.onProjectileHit();
        if (this.pierce > 0) {
          this.pierce--;
          this.damage *= 0.85; // piercing shots lose a little bite per body
        } else {
          this.finish(world, true);
          return;
        }
      }
    } else {
      const p = world.player;
      if (!p.dead && dist2(this.x, this.y, p.x, p.cy) < (this.radius + 9) ** 2) {
        p.damage(world, this.damage, this.x, this.y);
        this.finish(world, true);
        return;
      }
    }

    // Out of bounds.
    if (this.x < -40 || this.x > world.level.widthPx + 40 || this.y > world.level.heightPx + 60 || this.y < -200) {
      this.active = false;
    }
  }

  /** Homing. The "bootleg AI" chaos value makes it pick badly on purpose. */
  private steer(world: World, dt: number): void {
    this.chaosTimer -= dt;
    if (this.chaosTimer <= 0) {
      this.chaosTimer = 0.25;
      this.chaosTarget = this.pickTarget(world);
    }
    const target = this.chaosTarget;
    if (!target || target.dead) return;

    const desired = Math.atan2(target.cy - this.y, target.cx - this.x);
    const current = Math.atan2(this.vy, this.vx);
    const turn = angleDelta(current, desired);
    const rate = this.homing * dt;
    const next = current + Math.max(-rate, Math.min(rate, turn));
    const speed = Math.hypot(this.vx, this.vy);
    this.vx = Math.cos(next) * speed;
    this.vy = Math.sin(next) * speed;
    this.rot = next;
  }

  private pickTarget(world: World): Enemy | null {
    const candidates = world.enemies.filter((e) => !e.dead);
    if (candidates.length === 0) return null;
    // A stupid AI sometimes locks onto the furthest enemy on the level. That is
    // the joke, and it is also a real cost the player accepted.
    if (this.chaos > 0 && fxRng.chance(this.chaos)) {
      return fxRng.pick(candidates);
    }
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of candidates) {
      const d = dist2(this.x, this.y, e.cx, e.cy);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  private bounce(world: World, nx: number, ny: number): void {
    this.ricochet--;
    // Figure out which axis we crossed and mirror that component.
    const hitX = world.level.isSolid(Math.floor(nx / TILE), Math.floor(this.y / TILE));
    const hitY = world.level.isSolid(Math.floor(this.x / TILE), Math.floor(ny / TILE));
    if (hitX) this.vx = -this.vx;
    if (hitY) this.vy = -this.vy;
    if (!hitX && !hitY) { this.vx = -this.vx; this.vy = -this.vy; }
    this.rot = Math.atan2(this.vy, this.vx);
    particles.impact(this.x, this.y, this.style.glow, this.style.core, 0.4);
    if (this.ricochet <= 0 && this.explode <= 0) this.damage *= 0.9;
    void world;
  }

  private finish(world: World, impacted: boolean): void {
    this.active = false;
    if (impacted) {
      fx.impactStar(this.x, this.y, this.style.glow, this.style.core, 0.6);
    }
    if (this.explode > 0 && this.weapon) {
      world.explode(this.x, this.y, this.explode, this.damage * 0.8, this.weapon, this.fromPlayer);
    }
  }

  draw(r: Renderer): void {
    if (!this.active) return;
    r.drawSprite(this.sprite, this.x, this.y, {
      rot: this.rot,
      glow: 1.2,
      pivotY: 0,
    });
  }
}

/** Fixed-size pool. Nail-gun builds spray a lot of these. */
export class ProjectilePool {
  readonly items: Projectile[] = Array.from({ length: 220 }, () => new Projectile());

  get(): Projectile | null {
    for (const p of this.items) if (!p.active) return p;
    return null;
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
}

/** Explosion helper shared by pressure tanks, rockets and overloads. */
export function drawExplosionFx(x: number, y: number, radius: number, style: ElementStyle): void {
  fx.ring(x, y, 3, radius, style.glow, 0.3, 3);
  fx.ring(x, y, 3, radius * 0.6, PAL.white, 0.18, 2);
  particles.impact(x, y, style.glow, style.core, radius / 20);
  for (let i = 0; i < 10; i++) {
    const a = fxRng.range(0, TAU);
    particles.spawn({
      kind: 'smoke',
      x, y,
      vx: Math.cos(a) * fxRng.range(30, 110),
      vy: Math.sin(a) * fxRng.range(30, 110) - 20,
      drag: 0.05,
      life: fxRng.range(0.3, 0.8),
      size: fxRng.range(2, 4),
      color: PAL.metalLit,
      grow: 2.4,
    });
  }
}
