import { Actor } from './actor';
import type { World } from './world';
import type { EnemyDef } from './enemies.data';
import { enemyArt, type EnemyArt } from '../art/enemies';
import { ELEMENTS, PAL } from '../render/palette';
import type { Renderer } from '../render/renderer';
import { clamp, damp, dist2 } from '../core/math';
import { time } from '../core/time';
import { particles } from '../fx/particles';
import { fx } from '../fx/fx';
import { playDeath, playBossDeath } from '../fx/deaths';
import { fxRng } from '../core/rng';
import { drawText } from '../render/text';
import { audio } from '../core/audio';
import type { Weapon } from './weapon';

type AiState = 'idle' | 'chase' | 'telegraph' | 'attack' | 'recover';

/**
 * One enemy class covers the whole roster. Behaviour switches on `def.behavior`
 * and everything visual is the shared transform stack — the same production
 * bargain the player makes.
 */
export class Enemy extends Actor {
  readonly def: EnemyDef;
  readonly art: EnemyArt;
  readonly id: number;

  /** AI state. */
  private state: AiState = 'idle';
  private stateTime = 0;
  private cooldown = 0;
  private patrolDir: 1 | -1 = 1;
  private aggro = false;
  private hopTimer = 0;
  private floatPhase = fxRng.range(0, Math.PI * 2);
  private chargeVx = 0;

  /** Damage-number aggregation so a chainsaw doesn't spam forty floaters. */
  private pendingDamage = 0;
  private pendingTimer = 0;
  private lastElement = 'kinetic';

  /** Set when killed, so the world can clean up after the effects play. */
  private deathTimer = -1;

  static nextId = 1;

  constructor(def: EnemyDef, x: number, y: number, hpScale = 1) {
    super();
    this.id = Enemy.nextId++;
    this.def = def;
    this.art = enemyArt(def.art);
    this.w = this.art.w;
    this.h = this.art.h;
    this.x = x;
    this.y = y;
    this.maxHp = Math.round(def.hp * hpScale);
    this.hp = this.maxHp;
    this.gravityScale = def.gravity > 0 ? 1 : 0;
    this.patrolDir = fxRng.chance(0.5) ? 1 : -1;
  }

  get isBoss(): boolean {
    return this.def.tier === 'boss';
  }

  update(world: World, dt: number): void {
    if (this.dead) {
      if (this.deathTimer > 0) this.deathTimer -= dt;
      return;
    }

    this.cooldown = Math.max(0, this.cooldown - dt);
    this.stateTime += dt;
    this.updateStatusEffects(world, dt);

    const player = world.player;
    const dx = player.x - this.x;
    const dy = player.cy - this.cy;
    const distSq = dx * dx + dy * dy;
    const sightSq = this.def.sight * this.def.sight;

    if (!this.aggro && distSq < sightSq) this.aggro = true;
    // Once you've been seen, you stay seen until you get well clear.
    if (this.aggro && distSq > sightSq * 4) this.aggro = false;

    if (this.stun <= 0) {
      switch (this.def.behavior) {
        case 'walker': this.behaveWalker(world, dt, dx); break;
        case 'hopper': this.behaveHopper(world, dt, dx); break;
        case 'flyer': this.behaveFlyer(world, dt, dx, dy); break;
        case 'shooter': this.behaveShooter(world, dt, dx, dy, distSq); break;
        case 'charger': this.behaveCharger(world, dt, dx, distSq); break;
        case 'blob': this.behaveBlob(world, dt, dx); break;
        case 'brute': this.behaveBrute(world, dt, dx, distSq); break;
      }
    }

    if (this.def.gravity > 0) {
      this.applyGravity(dt, this.def.gravity, 460);
    }

    this.moveAndCollide(world.level, dt);

    if (this.onGround && !this.wasOnGround) {
      const force = clamp(Math.abs(this.vy) / 400 + 0.2, 0.2, 1);
      this.squash(force * 2.4);
      particles.landDust(this.x, this.y, force * 0.6);
    }

    this.contactDamage(world);
    this.updateVisual(dt);

    if (this.pendingTimer > 0) {
      this.pendingTimer -= dt;
      if (this.pendingTimer <= 0 && this.pendingDamage > 0) this.flushDamageNumber();
    }

    // Fell out of the level.
    if (this.y > world.level.heightPx + 300) this.die(world, 'kinetic');
  }

  // ---- behaviours -------------------------------------------------------

  private behaveWalker(world: World, dt: number, dx: number): void {
    const speed = this.def.speed;
    if (this.aggro) {
      const dir = Math.sign(dx) || 1;
      this.vx = damp(this.vx, dir * speed, 0.12, dt);
      this.facing = dir > 0 ? 1 : -1;
      // Hop over small obstacles rather than grinding into them.
      if (this.onGround && this.onWall !== 0) this.vy = -240;
    } else {
      this.vx = damp(this.vx, this.patrolDir * speed * 0.45, 0.08, dt);
      this.facing = this.patrolDir;
      if (this.onWall !== 0 || !this.hasFloorAhead(world)) this.patrolDir = -this.patrolDir as 1 | -1;
    }
  }

  private behaveHopper(world: World, dt: number, dx: number): void {
    this.hopTimer -= dt;
    if (this.onGround) {
      this.vx = damp(this.vx, 0, 0.2, dt);
      if (this.hopTimer <= 0 && this.aggro) {
        this.hopTimer = fxRng.range(0.55, 0.95);
        const dir = Math.sign(dx) || 1;
        this.facing = dir > 0 ? 1 : -1;
        this.vx = dir * this.def.speed;
        this.vy = -280;
        this.squash(-2.2);
        particles.landDust(this.x, this.y, 0.4);
      }
    }
    void world;
  }

  private behaveFlyer(world: World, dt: number, dx: number, dy: number): void {
    this.floatPhase += dt * 2.4;
    if (this.aggro) {
      const d = Math.max(1, Math.hypot(dx, dy));
      this.vx = damp(this.vx, (dx / d) * this.def.speed, 0.045, dt);
      this.vy = damp(this.vy, (dy / d) * this.def.speed + Math.sin(this.floatPhase) * 22, 0.045, dt);
      this.facing = dx > 0 ? 1 : -1;
    } else {
      this.vx = damp(this.vx, this.patrolDir * 22, 0.03, dt);
      this.vy = damp(this.vy, Math.sin(this.floatPhase) * 18, 0.05, dt);
      if (this.onWall !== 0) this.patrolDir = -this.patrolDir as 1 | -1;
    }
    if (this.def.attack) this.tryRangedAttack(world, dx, dy);
  }

  private behaveShooter(world: World, dt: number, dx: number, dy: number, distSq: number): void {
    const ideal = (this.def.attack?.range ?? 160) * 0.6;
    this.floatPhase += dt * 2;
    if (this.aggro) {
      this.facing = dx > 0 ? 1 : -1;
      const d = Math.max(1, Math.hypot(dx, dy));
      // Back off if too close, close in if too far — hover at the ideal band.
      const want = distSq < ideal * ideal ? -1 : distSq > ideal * ideal * 2.2 ? 1 : 0;
      this.vx = damp(this.vx, (dx / d) * this.def.speed * want, 0.05, dt);
      this.vy = damp(this.vy, (dy / d) * this.def.speed * want * 0.6 + Math.sin(this.floatPhase) * 20, 0.05, dt);
      this.tryRangedAttack(world, dx, dy);
    } else {
      this.vx = damp(this.vx, this.patrolDir * 20, 0.03, dt);
      this.vy = damp(this.vy, Math.sin(this.floatPhase) * 16, 0.05, dt);
      if (this.onWall !== 0) this.patrolDir = -this.patrolDir as 1 | -1;
    }
  }

  private behaveCharger(world: World, dt: number, dx: number, distSq: number): void {
    const atk = this.def.attack!;
    switch (this.state) {
      case 'idle':
      case 'chase': {
        if (this.aggro) {
          const dir = Math.sign(dx) || 1;
          this.facing = dir > 0 ? 1 : -1;
          this.vx = damp(this.vx, dir * this.def.speed * 0.7, 0.1, dt);
          if (this.cooldown <= 0 && distSq < atk.range * atk.range && this.onGround) {
            this.setState('telegraph');
          }
        } else {
          this.vx = damp(this.vx, this.patrolDir * this.def.speed * 0.4, 0.08, dt);
          this.facing = this.patrolDir;
          if (this.onWall !== 0 || !this.hasFloorAhead(world)) this.patrolDir = -this.patrolDir as 1 | -1;
        }
        break;
      }
      case 'telegraph': {
        // Crouch and shake: the tell that makes the charge fair.
        this.vx = damp(this.vx, 0, 0.3, dt);
        this.squash(dt * 26);
        if (this.stateTime >= atk.telegraph) {
          this.chargeVx = this.facing * this.def.speed * 3.4;
          this.setState('attack');
          this.squash(-3);
          particles.dashTrail(this.x, this.y, this.facing, ELEMENTS[this.def.element].glow);
        }
        break;
      }
      case 'attack': {
        this.vx = this.chargeVx;
        if (fxRng.chance(dt * 40)) {
          fx.afterimage(this.art.sprite, this.x, this.y, 1, 1, 0, this.facing < 0, ELEMENTS[this.def.element].glow, 0.16);
        }
        if (this.stateTime > 0.42 || this.onWall !== 0) {
          this.setState('recover');
          this.cooldown = atk.cooldown;
        }
        break;
      }
      case 'recover': {
        this.vx = damp(this.vx, 0, 0.2, dt);
        if (this.stateTime > 0.35) this.setState('chase');
        break;
      }
    }
  }

  private behaveBlob(world: World, dt: number, dx: number): void {
    if (this.aggro) {
      const dir = Math.sign(dx) || 1;
      this.facing = dir > 0 ? 1 : -1;
      this.vx = damp(this.vx, dir * this.def.speed, 0.03, dt);
    } else {
      this.vx = damp(this.vx, this.patrolDir * this.def.speed * 0.5, 0.03, dt);
      if (this.onWall !== 0 || !this.hasFloorAhead(world)) this.patrolDir = -this.patrolDir as 1 | -1;
    }
    // Wobble instead of walking: blobs breathe hard.
    if (fxRng.chance(dt * 3)) this.squash(0.5);
    if (fxRng.chance(dt * 6)) particles.vapour(this.x + fxRng.spread(1) * 6, this.y, PAL.toxic);
  }

  private behaveBrute(world: World, dt: number, dx: number, distSq: number): void {
    const atk = this.def.attack!;
    switch (this.state) {
      case 'idle':
      case 'chase': {
        const dir = Math.sign(dx) || 1;
        this.facing = dir > 0 ? 1 : -1;
        this.vx = damp(this.vx, this.aggro ? dir * this.def.speed : 0, 0.08, dt);
        if (this.aggro && this.cooldown <= 0) {
          const inMelee = distSq < atk.range * atk.range;
          const canShoot = atk.projectile && distSq < this.def.sight * this.def.sight;
          if (inMelee || canShoot) this.setState('telegraph');
        }
        break;
      }
      case 'telegraph': {
        this.vx = damp(this.vx, 0, 0.25, dt);
        this.squash(dt * 20);
        if (this.stateTime >= atk.telegraph) this.setState('attack');
        break;
      }
      case 'attack': {
        if (this.stateTime === 0) break;
        this.performBruteAttack(world, distSq);
        this.setState('recover');
        this.cooldown = atk.cooldown;
        break;
      }
      case 'recover': {
        this.vx = damp(this.vx, 0, 0.2, dt);
        if (this.stateTime > 0.4) this.setState('chase');
        break;
      }
    }
  }

  private performBruteAttack(world: World, distSq: number): void {
    const atk = this.def.attack!;
    const style = ELEMENTS[this.def.element];
    if (distSq < atk.range * atk.range) {
      // Ground slam.
      fx.slash({
        x: this.x + this.facing * 8, y: this.cy,
        facing: this.facing > 0 ? 0.4 : Math.PI - 0.4,
        spread: 2.2, radius: atk.range, thickness: 8,
        color: style.glow, core: style.core, sigil: true,
      });
      fx.ring(this.x, this.y, 4, atk.range * 1.2, style.glow, 0.34, 3, 0.35);
      world.camera.addTrauma(0.4);
      particles.landDust(this.x, this.y, 1.4);
      const p = world.player;
      if (dist2(p.x, p.cy, this.x + this.facing * 12, this.cy) < atk.range * atk.range) {
        p.damage(world, atk.damage, this.x, this.cy);
      }
      this.squash(2.4);
    } else if (atk.projectile) {
      const count = atk.count ?? 1;
      const base = Math.atan2(world.player.cy - this.cy, world.player.x - this.x);
      for (let i = 0; i < count; i++) {
        const off = count > 1 ? (i / (count - 1) - 0.5) * (atk.spread ?? 0.3) : 0;
        world.spawnEnemyProjectile(
          this.x + this.facing * 10, this.cy, base + off,
          atk.speed ?? 180, atk.damage, atk.projectile, this.def.element,
        );
      }
      particles.muzzle(this.x + this.facing * 12, this.cy, base, style.glow, style.core);
      world.camera.addTrauma(0.15);
    }
  }

  private tryRangedAttack(world: World, dx: number, dy: number): void {
    const atk = this.def.attack;
    if (!atk || !atk.projectile) return;
    if (this.cooldown > 0) return;
    const distSq = dx * dx + dy * dy;
    if (distSq > atk.range * atk.range) return;

    if (this.state !== 'telegraph') {
      this.setState('telegraph');
      return;
    }
    if (this.stateTime < atk.telegraph) return;

    const angle = Math.atan2(dy, dx);
    world.spawnEnemyProjectile(
      this.x + Math.cos(angle) * 8, this.cy + Math.sin(angle) * 8,
      angle, atk.speed ?? 170, atk.damage, atk.projectile, this.def.element,
    );
    const style = ELEMENTS[this.def.element];
    particles.muzzle(this.x + Math.cos(angle) * 8, this.cy + Math.sin(angle) * 8, angle, style.glow, style.core);
    this.cooldown = atk.cooldown;
    this.setState('chase');
    this.squash(1.2);
  }

  private setState(s: AiState): void {
    this.state = s;
    this.stateTime = 0;
  }

  /** Is there ground in front of me? Stops patrols walking off ledges. */
  private hasFloorAhead(world: World): boolean {
    const probeX = this.x + this.patrolDir * (this.w / 2 + 3);
    return world.level.isBlocking(Math.floor(probeX / 16), Math.floor((this.y + 4) / 16));
  }

  // ---- damage -----------------------------------------------------------

  private contactDamage(world: World): void {
    const p = world.player;
    if (p.dead || p.invuln > 0) return;
    const a = this.rect;
    const b = p.rect;
    if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
      p.damage(world, this.def.touch, this.x, this.cy);
    }
  }

  private updateStatusEffects(world: World, dt: number): void {
    if (this.poison > 0) {
      this.poison -= dt;
      if (fxRng.chance(dt * 3)) {
        this.takeTick(world, 2, 'toxic');
        particles.vapour(this.x + fxRng.spread(1) * 5, this.y, PAL.toxic);
      }
    }
    if (this.burn > 0) {
      this.burn -= dt;
      if (fxRng.chance(dt * 4)) {
        this.takeTick(world, 3, 'fire');
        particles.spawn({
          kind: 'glow', x: this.x + fxRng.spread(1) * 5, y: this.cy,
          vy: -30, life: 0.3, size: 2, color: PAL.orange, additive: true, grow: 0.4,
        });
      }
    }
    if (this.shocked > 0) {
      this.shocked -= dt;
      this.stun = Math.max(this.stun, 0.02);
      if (fxRng.chance(dt * 10)) {
        particles.spawn({
          kind: 'spark', x: this.x + fxRng.spread(1) * this.w, y: this.cy + fxRng.spread(1) * this.h * 0.5,
          vx: fxRng.spread(1) * 60, vy: fxRng.spread(1) * 60, life: 0.12, size: 1,
          color: PAL.cyan, additive: true,
        });
      }
    }
    if (this.corrupted > 0) {
      this.corrupted -= dt;
      if (fxRng.chance(dt * 5)) {
        world.renderer.glitch = Math.max(world.renderer.glitch, 0.12);
        particles.spawn({
          kind: 'bit', x: this.x + fxRng.spread(1) * this.w, y: this.cy,
          life: 0.2, size: 2, color: fxRng.chance(0.5) ? PAL.cyan : PAL.magenta, additive: true,
        });
      }
    }
  }

  private takeTick(world: World, amount: number, element: string): void {
    this.hp -= amount;
    this.hitFlash(0.4);
    this.queueDamageNumber(amount, element);
    if (this.hp <= 0) this.die(world, element);
  }

  /**
   * Take a hit from a player weapon. Returns true if it connected.
   *
   * `allowSecondary` gates the effects that themselves deal damage — currently
   * the explosive mod. Damage that originates from one of those effects must
   * pass false, or an explosive weapon detonates inside its own blast and
   * recurses until the stack blows up.
   */
  hit(
    world: World,
    damage: number,
    weapon: Weapon,
    fromX: number,
    fromY: number,
    knockScale = 1,
    allowSecondary = true,
  ): boolean {
    if (this.dead) return false;

    const dmg = Math.max(1, Math.round(damage));
    this.hp -= dmg;
    this.hitFlash(1);
    this.squash(1.5);
    this.stun = Math.max(this.stun, weapon.heavy ? 0.16 : 0.08);
    this.knockback(fromX, fromY, weapon.knockback * knockScale * (this.isBoss ? 0.12 : 1), 0.4);
    this.queueDamageNumber(dmg, weapon.element);

    fx.impactStar(
      this.cx + fxRng.spread(1) * 4, this.cy + fxRng.spread(1) * 4,
      weapon.style.glow, weapon.style.core, weapon.heavy ? 1.4 : 1,
    );

    // On-hit status from the core.
    switch (weapon.core?.onHit) {
      case 'poison': this.poison = Math.max(this.poison, 2.4); break;
      case 'burn': this.burn = Math.max(this.burn, 2); break;
      case 'shock': this.shocked = Math.max(this.shocked, 0.5); break;
      case 'corrupt': this.corrupted = Math.max(this.corrupted, 1.6); break;
      case 'pull': {
        // Void cores drag everything toward the impact point.
        for (const e of world.enemies) {
          if (e === this || e.dead) continue;
          if (dist2(e.x, e.cy, this.cx, this.cy) > 60 * 60) continue;
          e.knockback(this.cx, this.cy, -120, 0.2);
        }
        fx.ring(this.cx, this.cy, 30, 2, PAL.violet, 0.28, 2);
        break;
      }
      default: break;
    }

    if (allowSecondary && weapon.effects.explode) {
      world.explode(this.cx, this.cy, weapon.effects.explode, dmg * 0.6, weapon, true);
    }

    audio.hit(weapon.heavy, weapon.element);

    if (this.hp <= 0) {
      this.die(world, weapon.element, weapon);
      return true;
    }
    return true;
  }

  private queueDamageNumber(amount: number, element: string): void {
    this.pendingDamage += amount;
    this.lastElement = element;
    if (this.pendingTimer <= 0) this.pendingTimer = 0.1;
  }

  private flushDamageNumber(): void {
    const style = ELEMENTS[this.lastElement as keyof typeof ELEMENTS] ?? ELEMENTS.kinetic;
    fx.floater(String(this.pendingDamage), this.cx, this.cy - this.h * 0.4, style.core, {
      glow: style.glow,
      scale: this.pendingDamage >= 25 ? 2 : 1,
    });
    this.pendingDamage = 0;
  }

  die(world: World, element: string, weapon?: Weapon): void {
    if (this.dead) return;
    this.dead = true;
    this.deathTimer = 0.6;
    if (this.pendingDamage > 0) this.flushDamageNumber();

    const style = ELEMENTS[(element as keyof typeof ELEMENTS)] ?? ELEMENTS.kinetic;
    const ctx = { x: this.x, y: this.y, size: this.h, sprite: this.art.sprite, flip: this.facing < 0 };

    if (this.isBoss) {
      playBossDeath(ctx);
      world.camera.addTrauma(1);
      world.renderer.screenFlash(style.glow, 0.6);
      time.slowMo(1.2, 0.3);
    } else {
      playDeath(style.death, ctx, this.def.tier === 'elite' ? 1.6 : 1);
      world.camera.addTrauma(this.def.tier === 'elite' ? 0.5 : 0.22);
      time.hitStop(this.def.tier === 'elite' ? 0.1 : 0.045);
    }

    world.onEnemyKilled(this, weapon);
  }

  get finished(): boolean {
    return this.dead && this.deathTimer <= 0;
  }

  // ---- draw -------------------------------------------------------------

  draw(r: Renderer): void {
    if (this.dead) return;
    const [sx, sy] = this.drawScale(true, this.def.behavior === 'blob' ? 0.05 : 0.015);
    const flip = this.facing < 0;
    const float = this.def.gravity === 0 ? Math.sin(this.floatPhase) * 1.6 : 0;
    const bob = this.runBob(Math.abs(this.vx) / Math.max(1, this.def.speed)) * 0.6;

    const style = ELEMENTS[this.def.element];

    // Telegraph: shake hard and flare so the tell is impossible to miss.
    let jitterX = 0;
    let jitterY = 0;
    if (this.state === 'telegraph') {
      const atk = this.def.attack;
      const p = atk ? clamp(this.stateTime / atk.telegraph, 0, 1) : 0;
      jitterX = fxRng.spread(1) * p * 2.4;
      jitterY = fxRng.spread(1) * p * 1.6;
      fx.drawCharge(r, this.x, this.y, style.glow, p, time.elapsed);
    }

    r.drawSprite(this.art.sprite, this.x + jitterX, this.y + float + bob + jitterY, {
      sx, sy,
      rot: this.lean + this.rot,
      flip,
      flash: this.flash + (this.state === 'telegraph' ? 0.35 : 0),
      glow: 1,
    });

    if (this.isBoss || this.def.tier === 'elite') this.drawHealthBar(r);
  }

  private drawHealthBar(r: Renderer): void {
    if (this.hp >= this.maxHp && !this.aggro) return;
    const w = this.isBoss ? 44 : 26;
    const x = Math.round(this.x - w / 2);
    const y = Math.round(this.y - this.h - (this.isBoss ? 12 : 8));
    const pct = clamp(this.hp / this.maxHp, 0, 1);
    r.g.fillStyle = PAL.black;
    r.g.fillRect(x - 1, y - 1, w + 2, 4);
    r.g.fillStyle = PAL.metalDark;
    r.g.fillRect(x, y, w, 2);
    r.glowRect(x, y, Math.round(w * pct), 2, this.isBoss ? PAL.magenta : PAL.orange, 0.9, 1);
    if (this.isBoss) {
      drawText(r.g, this.def.name, this.x, y - 9, {
        color: PAL.white, glow: PAL.magenta, align: 'center', shadow: PAL.black,
      });
    }
  }

}
