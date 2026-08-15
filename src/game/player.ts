import { Actor } from './actor';
import type { World } from './world';
import { input } from '../core/input';
import { time } from '../core/time';
import { clamp, damp, lerp, easeOutCubic, TAU } from '../core/math';
import { particles } from '../fx/particles';
import { fx } from '../fx/fx';
import { audio } from '../core/audio';
import { PAL } from '../render/palette';
import type { Renderer } from '../render/renderer';
import type { CharacterArt } from '../art/player';
import { drawWeapon, type Weapon, startingWeapon, assemble } from './weapon';
import type { BasePart, CorePart, ModPart } from './parts.data';
import { MODS } from './parts.data';
import { Tile } from './level';
import { fxRng } from '../core/rng';

/**
 * Movement tuning. Pillar #1 says controlling the character has to be enjoyable
 * before anything else exists, so these numbers are the most load-bearing
 * constants in the project.
 */
const RUN_SPEED = 132;
const ACCEL_GROUND = 1500;
const ACCEL_AIR = 950;
const FRICTION_GROUND = 2000;
const FRICTION_AIR = 260;
const GRAVITY_UP = 900;
const GRAVITY_DOWN = 1320; // heavier on the way down: rises float, falls bite
const MAX_FALL = 460;
const JUMP_VELOCITY = 300;
const JUMP_CUT = 0.42; // releasing jump early keeps this fraction of upward speed
const COYOTE_TIME = 0.1;
const WALL_SLIDE_SPEED = 62;
const WALL_JUMP_X = 210;
const WALL_JUMP_Y = 292;
const DASH_SPEED = 390;
const DASH_TIME = 0.15;
const DASH_COOLDOWN = 0.42;
const INVULN_TIME = 0.85;

/** Weapon rest pose, radians. Slightly down and forward, held at the hip. */
const REST_ANGLE = 0.34;

/** Thrown secondary. Costs ammo, so it competes with the ranged builds. */
const GRENADE_COST = 8;
const GRENADE_COOLDOWN = 0.75;
/** Grenades always explode; that is what makes them grenades. */
const PRESSURE_TANK = MODS.find((m) => m.id === 'pressureTank') ?? null;
const GRENADE_BASE: BasePart = {
  id: 'scrapGrenade', slot: 'base', name: 'SCRAP GRENADE', rarity: 'junk',
  desc: 'A CAN, SOME WIRE, AND BAD INTENTIONS.',
  sprite: 'junkCannon', archetype: 'lob',
  damage: 18, attackTime: 0.75, range: 10, knockback: 200, spread: 0,
  heavy: true, mount: [0, 0], modMount: [0, 0],
  projectile: { sprite: 'projGrenade', speed: 260, life: 1.6, gravity: 460, radius: 5, spin: 14 },
};

type AttackPhase = 'none' | 'windup' | 'active' | 'recover';

export interface Inventory {
  bases: BasePart[];
  cores: CorePart[];
  mods: ModPart[];
}

export class Player extends Actor {
  character: CharacterArt;
  weapon: Weapon;
  inventory: Inventory = { bases: [], cores: [], mods: [] };

  scrap = 0;
  ammo = 60;
  maxAmmo = 60;

  private coyote = 0;
  private jumpHeld = false;
  private dashTimer = 0;
  private dashCooldown = 0;
  dashCharges = 1;
  maxDashCharges = 1;
  private dashDirX = 1;
  private afterimageTimer = 0;
  private dustTimer = 0;

  invuln = 0;
  private wallSlideTimer = 0;

  // ---- attack state
  private attackPhase: AttackPhase = 'none';
  private attackPhaseTime = 0;
  private windupTime = 0;
  private activeTime = 0;
  private recoverTime = 0;
  private attackCooldown = 0;
  private swingDir: 1 | -1 = 1;
  private multihitFired = 0;
  private weaponAngle = REST_ANGLE;
  private weaponPush = 0;
  private recoil = 0;
  private throwCooldown = 0;
  /** Enemies already hit by the current swing, so one swing hits once. */
  private hitThisSwing = new Set<number>();

  /** Set while the workbench overlay is open — suppresses all combat input. */
  locked = false;

  constructor(character: CharacterArt) {
    super();
    this.character = character;
    this.weapon = startingWeapon();
    this.w = 11;
    this.h = 28;
    this.maxHp = character.stats.maxHp;
    this.hp = this.maxHp;
    this.maxDashCharges = character.stats.dashes;
    this.dashCharges = this.maxDashCharges;
  }

  get isDashing(): boolean {
    return this.dashTimer > 0;
  }

  get attacking(): boolean {
    return this.attackPhase !== 'none';
  }

  equip(base: BasePart | null, core: CorePart | null, mod: ModPart | null): void {
    this.weapon = assemble(base ?? this.weapon.base, core, mod);
  }

  addPart(part: BasePart | CorePart | ModPart): void {
    if (part.slot === 'base') this.inventory.bases.push(part);
    else if (part.slot === 'core') this.inventory.cores.push(part);
    else this.inventory.mods.push(part);
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  /**
   * A projectile from this player's weapon connected. Melee routes its feedback
   * through onHitLanded; projectiles land later than the shot, so lifesteal and
   * the confirmation kick have to be applied here instead.
   */
  onProjectileHit(): void {
    const w = this.weapon;
    if (w.effects.lifesteal) {
      const healed = Math.max(1, Math.round(w.damage * w.effects.lifesteal));
      this.heal(healed);
    }
    time.hitStop(0.018);
  }

  // -----------------------------------------------------------------------

  update(world: World, dt: number): void {
    if (this.dead) {
      this.applyGravity(dt, GRAVITY_DOWN, MAX_FALL);
      this.moveAndCollide(world.level, dt);
      this.updateVisual(dt);
      return;
    }

    this.invuln = Math.max(0, this.invuln - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);

    const moveX = this.locked ? 0 : input.moveX();
    const wantDrop = !this.locked && input.held('down');

    if (this.dashTimer > 0) this.updateDash(world, dt);
    else this.updateGroundAir(world, dt, moveX);

    this.updateAttack(world, dt);
    this.updateStatus(world, dt);

    this.moveAndCollide(world.level, dt, wantDrop && this.vy >= 0);

    this.handleLanding(world);
    this.handleHazards(world, dt);
    this.updateVisual(dt);

    // Fell out of the world.
    if (this.y > world.level.heightPx + 200) this.damage(world, 999, this.x, this.y - 400);
  }

  private updateGroundAir(world: World, dt: number, moveX: number): void {
    // --- horizontal
    const accel = this.onGround ? ACCEL_GROUND : ACCEL_AIR;
    const friction = this.onGround ? FRICTION_GROUND : FRICTION_AIR;
    const speed = RUN_SPEED * this.character.stats.speed;

    if (moveX !== 0 && this.stun <= 0) {
      this.vx += moveX * accel * dt;
      this.vx = clamp(this.vx, -speed, speed);
      this.facing = moveX > 0 ? 1 : -1;
    } else {
      const drop = friction * dt;
      this.vx = Math.abs(this.vx) <= drop ? 0 : this.vx - Math.sign(this.vx) * drop;
    }

    // --- wall slide
    const pressingIntoWall = this.onWall !== 0 && moveX === this.onWall;
    const sliding = !this.onGround && pressingIntoWall && this.vy > 0;
    if (sliding) {
      this.vy = Math.min(this.vy, WALL_SLIDE_SPEED);
      this.wallSlideTimer += dt;
      if (this.wallSlideTimer > 0.05) {
        this.wallSlideTimer = 0;
        particles.wallSparks(this.x + this.onWall * 6, this.y - this.h * 0.5, -this.onWall);
      }
    }

    // --- gravity
    const g = this.vy < 0 ? GRAVITY_UP : GRAVITY_DOWN;
    this.applyGravity(dt, g, MAX_FALL);

    // --- coyote time
    if (this.onGround) this.coyote = COYOTE_TIME;
    else this.coyote = Math.max(0, this.coyote - dt);

    // --- jump
    if (!this.locked && input.pressed('jump')) {
      if (this.coyote > 0) {
        input.consume('jump');
        this.doJump(1);
      } else if (this.onWall !== 0) {
        input.consume('jump');
        this.doWallJump(world);
      }
    }
    // Variable height: let go early, rise less.
    if (this.jumpHeld && !input.held('jump') && this.vy < 0) {
      this.vy *= JUMP_CUT;
      this.jumpHeld = false;
    }
    if (this.vy >= 0) this.jumpHeld = false;

    // --- dash
    if (!this.locked && input.pressed('dash') && this.dashCharges > 0 && this.dashCooldown <= 0) {
      input.consume('dash');
      this.startDash(world);
    }
    if (this.onGround) this.dashCharges = this.maxDashCharges;

    // --- run dust
    if (this.onGround && Math.abs(this.vx) > 30) {
      this.dustTimer -= dt;
      if (this.dustTimer <= 0) {
        this.dustTimer = 0.07;
        particles.runDust(this.x, this.y, Math.sign(this.vx), PAL.metalHi);
      }
    }
  }

  private doJump(power: number): void {
    this.vy = -JUMP_VELOCITY * power * this.character.stats.jumpPower;
    this.coyote = 0;
    this.onGround = false;
    this.jumpHeld = true;
    this.squash(-2.6); // stretch vertically on launch
    particles.landDust(this.x, this.y, 0.35);
    audio.jump();
  }

  private doWallJump(world: World): void {
    const dir = -this.onWall;
    this.vx = dir * WALL_JUMP_X;
    this.vy = -WALL_JUMP_Y;
    this.facing = dir as 1 | -1;
    this.jumpHeld = true;
    this.squash(-2.2);
    this.rot = -dir * 0.3;
    for (let i = 0; i < 8; i++) particles.wallSparks(this.x - dir * 6, this.y - this.h * 0.5, dir);
    world.camera.kick(dir * 2, -1);
    audio.jump();
  }

  private startDash(world: World): void {
    this.dashTimer = DASH_TIME;
    this.dashCooldown = DASH_COOLDOWN;
    this.dashCharges--;
    this.dashDirX = input.moveX() !== 0 ? input.moveX() : this.facing;
    this.facing = this.dashDirX > 0 ? 1 : -1;
    this.invuln = Math.max(this.invuln, DASH_TIME + 0.05);
    this.squash(1.8);
    particles.dashTrail(this.x, this.y, this.dashDirX, this.character.accent);
    world.camera.kick(this.dashDirX * 3, 0);
    world.renderer.aberration = Math.max(world.renderer.aberration, 0.28);
    audio.dash();
  }

  private updateDash(world: World, dt: number): void {
    this.dashTimer -= dt;
    this.vx = this.dashDirX * DASH_SPEED;
    this.vy = 0; // dash is flat; it reads better and is easier to aim

    this.afterimageTimer -= dt;
    if (this.afterimageTimer <= 0) {
      this.afterimageTimer = 0.022;
      const [sx, sy] = this.drawScale(false);
      fx.afterimage(
        this.character.sprite, this.x, this.y, sx * 1.1, sy * 0.92, this.lean,
        this.facing < 0, fxRng.chance(0.5) ? this.character.accent : PAL.cyan, 0.18,
      );
    }

    if (this.dashTimer <= 0) {
      this.vx *= 0.55;
      this.squash(0.9);
    }
  }

  private handleLanding(world: World): void {
    if (this.onGround && !this.wasOnGround) {
      const force = clamp(Math.abs(this.vy) / MAX_FALL + 0.3, 0.3, 1.4);
      this.squash(force * 3.4);
      particles.landDust(this.x, this.y, force);
      fx.ring(this.x, this.y, 2, 10 + force * 16, PAL.metalHi, 0.2, 1, 0.3);
      world.camera.addTrauma(force * 0.12);
      world.camera.kick(0, force * 2.2);
      audio.land(force);
      this.dashCharges = this.maxDashCharges;
    }
  }

  private handleHazards(world: World, dt: number): void {
    const hazard = world.level.hazardAt({ x: this.x - this.w / 2, y: this.y - 4, w: this.w, h: 4 });
    if (hazard === Tile.Spike) {
      this.damage(world, 14, this.x, this.y);
    } else if (hazard === Tile.Sludge) {
      this.poison = Math.max(this.poison, 1.2);
      if (fxRng.chance(dt * 12)) particles.vapour(this.x, this.y, PAL.toxic);
    }
  }

  private updateStatus(world: World, dt: number): void {
    if (this.poison > 0) {
      this.poison -= dt;
      if (fxRng.chance(dt * 2.2)) {
        this.hp -= 1;
        world.renderer.damage = Math.max(world.renderer.damage, 0.2);
        particles.vapour(this.x, this.y - this.h * 0.5, PAL.toxic);
        if (this.hp <= 0) this.kill(world);
      }
    }
  }

  // ---- combat -----------------------------------------------------------

  private updateAttack(world: World, dt: number): void {
    const w = this.weapon;

    // Held OR buffered: a tap that lands between two sim steps must still fire,
    // exactly like jump and dash. Without this, quick taps get eaten.
    if (!this.locked && this.attackPhase === 'none' && this.attackCooldown <= 0) {
      if (input.held('attack')) {
        this.beginAttack(world);
      } else if (input.pressed('attack')) {
        input.consume('attack');
        this.beginAttack(world);
      }
    }

    if (!this.locked && this.throwCooldown <= 0 && input.take('throw')) {
      this.throwGrenade(world);
    }
    this.throwCooldown = Math.max(0, this.throwCooldown - dt);

    if (this.attackPhase !== 'none') {
      this.attackPhaseTime += dt;
      if (this.attackPhase === 'windup' && this.attackPhaseTime >= this.windupTime) {
        this.attackPhase = 'active';
        this.attackPhaseTime = 0;
        this.multihitFired = 0;
        this.hitThisSwing.clear();
        this.fire(world);
      } else if (this.attackPhase === 'active') {
        const multihit = w.effects.multihit ?? 0;
        if (multihit > 1) {
          const per = this.activeTime / multihit;
          const want = Math.min(multihit - 1, Math.floor(this.attackPhaseTime / per));
          while (this.multihitFired < want) {
            this.multihitFired++;
            this.hitThisSwing.clear();
            this.fire(world);
          }
        }
        if (this.attackPhaseTime >= this.activeTime) {
          this.attackPhase = 'recover';
          this.attackPhaseTime = 0;
        }
      } else if (this.attackPhase === 'recover' && this.attackPhaseTime >= this.recoverTime) {
        this.attackPhase = 'none';
        this.attackPhaseTime = 0;
      }
    }

    this.updateWeaponPose(dt);
  }

  private beginAttack(world: World): void {
    const w = this.weapon;
    if (w.ammoCost > 0 && this.ammo < w.ammoCost) {
      // Dry click: tiny feedback so it never feels like dropped input.
      this.attackCooldown = 0.25;
      audio.ui('back');
      fx.floater('NO AMMO', this.x, this.y - this.h - 6, PAL.orange, { scale: 1 });
      return;
    }
    const t = w.attackTime;
    this.windupTime = t * 0.16;
    this.activeTime = t * 0.3;
    this.recoverTime = t * 0.54;
    this.attackPhase = 'windup';
    this.attackPhaseTime = 0;
    this.attackCooldown = t;
    this.swingDir = this.swingDir === 1 ? -1 : 1; // alternate for readability
    void world;
  }

  /**
   * Universal secondary: a lobbed scrap grenade, available whatever you're
   * holding. It takes its element from the fitted core, so a toxic build throws
   * toxic cans and a void build throws something considerably worse.
   */
  private throwGrenade(world: World): void {
    if (this.ammo < GRENADE_COST) {
      audio.ui('back');
      fx.floater('NO SCRAP TO THROW', this.x, this.y - this.h - 6, PAL.orange);
      this.throwCooldown = 0.3;
      return;
    }
    this.ammo -= GRENADE_COST;
    this.throwCooldown = GRENADE_COOLDOWN;

    const [mx, my] = this.muzzlePoint();
    const angle = this.facing > 0 ? -0.72 : Math.PI + 0.72;
    // Built on the fly from the fitted core so the grenade matches the build.
    const grenade = assemble(GRENADE_BASE, this.weapon.core, PRESSURE_TANK);
    world.spawnProjectile({ x: mx, y: my - 6, angle, weapon: grenade, fromPlayer: true });

    this.vx -= this.facing * 24;
    this.squash(1.1);
    particles.muzzle(mx, my - 6, angle, grenade.style.glow, grenade.style.core);
    audio.shoot(grenade.element);
  }

  /** One discrete "hit moment" of the current attack. */
  private fire(world: World): void {
    const w = this.weapon;
    if (w.ammoCost > 0) this.ammo = Math.max(0, this.ammo - w.ammoCost);

    const ox = this.x + this.facing * 5;
    const oy = this.y - this.h * 0.55;
    const facingAngle = this.facing > 0 ? 0 : Math.PI;

    // Unstable cores can misfire. Risk is the price of the good components.
    if (w.instability > 0 && fxRng.chance(w.instability)) {
      this.overload(world, ox, oy);
      return;
    }

    switch (w.archetype) {
      case 'swing':
      case 'thrust':
        this.meleeHit(world, ox, oy, facingAngle);
        break;
      case 'spin':
        this.spinHit(world, ox, oy);
        break;
      case 'shoot':
      case 'burst':
        this.shoot(world, ox, oy, facingAngle);
        break;
      case 'lob':
        this.lob(world, ox, oy, facingAngle);
        break;
      case 'beam':
        this.beam(world, ox, oy, facingAngle);
        break;
    }
  }

  private meleeHit(world: World, ox: number, oy: number, facingAngle: number): void {
    const w = this.weapon;
    const spread = w.spread;
    const cx = this.x + this.facing * 4;
    const cy = this.y - this.h * 0.5;

    fx.slash({
      x: cx, y: cy,
      facing: facingAngle + this.swingDir * 0.15,
      spread,
      radius: w.range,
      thickness: w.heavy ? 7 : 5,
      color: w.style.glow,
      core: w.style.core,
      sigil: w.heavy,
    });
    audio.swing(w.heavy);

    const hits = world.damageInArc(cx, cy, w.range, facingAngle, spread / 2, w, this.hitThisSwing);
    this.onHitLanded(world, hits, w.heavy ? 1.3 : 1);

    // Swinging shoves you forward a touch — it makes contact feel committed.
    if (hits > 0) this.vx += this.facing * 26;
    else this.vx += this.facing * 12;
  }

  private spinHit(world: World, ox: number, oy: number): void {
    const w = this.weapon;
    const cx = this.x;
    const cy = this.y - this.h * 0.5;
    fx.spin(cx, cy, w.range, w.style.glow, 0.26);
    audio.swing(true);
    const hits = world.damageInArc(cx, cy, w.range, 0, Math.PI, w, this.hitThisSwing);
    this.onHitLanded(world, hits, 1.1);
    void ox; void oy;
  }

  private shoot(world: World, ox: number, oy: number, facingAngle: number): void {
    const w = this.weapon;
    if (!w.projectile) return;
    const pellets = (w.archetype === 'burst' ? 5 : 1) + (w.effects.multishot ?? 0);
    for (let i = 0; i < pellets; i++) {
      const jitter = fxRng.spread(1) * w.spread + (pellets > 1 ? (i / (pellets - 1) - 0.5) * w.spread : 0);
      world.spawnProjectile({
        x: ox + Math.cos(facingAngle) * 8,
        y: oy,
        angle: facingAngle + jitter,
        weapon: w,
        fromPlayer: true,
      });
    }
    particles.muzzle(ox + Math.cos(facingAngle) * 10, oy, facingAngle, w.style.glow, w.style.core);
    this.recoil = w.heavy ? 5 : 2.5;
    this.vx -= this.facing * (w.heavy ? 60 : 14);
    world.camera.kick(-this.facing * (w.heavy ? 3.5 : 1.4), 0);
    world.camera.addTrauma(w.heavy ? 0.16 : 0.05);
    audio.shoot(w.element);
  }

  private lob(world: World, ox: number, oy: number, facingAngle: number): void {
    const w = this.weapon;
    if (!w.projectile) return;
    world.spawnProjectile({
      x: ox, y: oy - 4,
      angle: facingAngle - 0.5,
      weapon: w,
      fromPlayer: true,
    });
    particles.muzzle(ox + Math.cos(facingAngle) * 12, oy - 4, facingAngle - 0.5, w.style.glow, w.style.core);
    this.recoil = 7;
    this.vx -= this.facing * 80;
    world.camera.addTrauma(0.22);
    world.camera.kick(-this.facing * 5, 0);
    audio.shoot(w.element);
  }

  private beam(world: World, ox: number, oy: number, facingAngle: number): void {
    const w = this.weapon;
    const dx = Math.cos(facingAngle);
    const dy = Math.sin(facingAngle);
    const dist = world.level.raycast(ox, oy, dx, dy, w.range);
    const ex = ox + dx * dist;
    const ey = oy + dy * dist;
    fx.beam(ox, oy, ex, ey, w.style.glow, w.style.core, 4, 0.16);
    const hits = world.damageInLine(ox, oy, ex, ey, 7, w);
    this.onHitLanded(world, hits, 1.2);
    particles.impact(ex, ey, w.style.glow, w.style.core, 0.8);
    this.recoil = 3;
    world.camera.addTrauma(0.1);
    audio.shoot(w.element);
  }

  /** Shared "the hit connected" feedback: hit-stop, shake, lifesteal. */
  private onHitLanded(world: World, hits: number, weight: number): void {
    if (hits <= 0) return;
    const w = this.weapon;
    time.hitStop(clamp(0.035 * weight + hits * 0.01, 0.02, 0.12));
    world.camera.addTrauma(clamp(0.1 * weight + hits * 0.03, 0, 0.5));
    world.camera.kick(this.facing * 2 * weight, 0);
    if (w.effects.lifesteal) {
      const healed = Math.max(1, Math.round(w.damage * hits * w.effects.lifesteal));
      this.heal(healed);
      fx.floater(`+${healed}`, this.x, this.y - this.h - 4, PAL.blood, { glow: PAL.blood });
    }
  }

  /** An unstable core letting go. Hurts, but it also clears the room. */
  private overload(world: World, ox: number, oy: number): void {
    const w = this.weapon;
    fx.ring(ox, oy, 2, 44, w.style.glow, 0.4, 3);
    fx.ring(ox, oy, 2, 30, PAL.white, 0.25, 2);
    particles.impact(ox, oy, w.style.glow, PAL.white, 2.4);
    particles.scrapBurst(ox, oy, 1.6);
    world.explode(ox, oy, 44, w.damage * 1.6, w, true);
    world.camera.addTrauma(0.6);
    world.renderer.screenFlash(w.style.glow, 0.5);
    time.hitStop(0.09);
    audio.explode();
    fx.floater('OVERLOAD', this.x, this.y - this.h - 8, PAL.orange, { glow: PAL.orange, scale: 1 });
    this.damage(world, 6, ox, oy, true);
  }

  // ---- weapon pose ------------------------------------------------------

  private updateWeaponPose(dt: number): void {
    const w = this.weapon;
    let target = REST_ANGLE;
    let push = 0;

    if (this.attackPhase !== 'none') {
      const p = clamp(this.attackPhaseTime / Math.max(0.0001, this.attackPhaseDuration()), 0, 1);
      switch (w.archetype) {
        case 'swing': {
          if (this.attackPhase === 'windup') target = lerp(REST_ANGLE, -1.75 * this.swingDir, easeOutCubic(p));
          else if (this.attackPhase === 'active') target = lerp(-1.75 * this.swingDir, 1.15 * this.swingDir, easeOutCubic(p));
          else target = lerp(1.15 * this.swingDir, REST_ANGLE, p);
          break;
        }
        case 'thrust': {
          target = -0.05;
          if (this.attackPhase === 'windup') push = lerp(0, -7, p);
          else if (this.attackPhase === 'active') push = lerp(-7, 13, easeOutCubic(p));
          else push = lerp(13, 0, p);
          break;
        }
        case 'spin': {
          const total = this.windupTime + this.activeTime + this.recoverTime;
          const elapsed = this.attackPhaseElapsed();
          target = REST_ANGLE + (elapsed / total) * TAU * 2;
          break;
        }
        case 'lob':
          target = -0.62;
          break;
        default:
          target = -0.02;
          break;
      }
    }

    this.weaponAngle = damp(this.weaponAngle, target, w.archetype === 'spin' ? 1 : 0.45, dt);
    if (w.archetype === 'spin' && this.attackPhase !== 'none') this.weaponAngle = target;
    this.weaponPush = damp(this.weaponPush, push, 0.5, dt);
    this.recoil = damp(this.recoil, 0, 0.25, dt);
  }

  private attackPhaseDuration(): number {
    return this.attackPhase === 'windup' ? this.windupTime
      : this.attackPhase === 'active' ? this.activeTime
      : this.recoverTime;
  }

  private attackPhaseElapsed(): number {
    if (this.attackPhase === 'windup') return this.attackPhaseTime;
    if (this.attackPhase === 'active') return this.windupTime + this.attackPhaseTime;
    return this.windupTime + this.activeTime + this.attackPhaseTime;
  }

  // ---- damage -----------------------------------------------------------

  damage(world: World, amount: number, fromX: number, fromY: number, ignoreInvuln = false): void {
    if (this.dead) return;
    if (!ignoreInvuln && (this.invuln > 0 || this.isDashing)) return;

    this.hp -= amount;
    this.invuln = INVULN_TIME;
    this.hitFlash(1);
    this.knockback(fromX, fromY, 170, 0.5);
    this.stun = 0.14;
    this.squash(1.6);

    particles.hurtSpray(this.x, this.y - this.h * 0.6, Math.sign(this.x - fromX) || 1);
    world.camera.addTrauma(0.45);
    world.renderer.damage = 1;
    world.renderer.aberration = Math.max(world.renderer.aberration, 0.35);
    time.hitStop(0.07);
    audio.hurt();

    if (this.hp <= 0) this.kill(world);
  }

  private kill(world: World): void {
    this.hp = 0;
    this.dead = true;
    world.camera.addTrauma(1);
    world.renderer.screenFlash(PAL.blood, 0.7);
    world.renderer.glitch = 1;
    time.slowMo(1.6, 0.25);
    particles.hurtSpray(this.x, this.y - this.h * 0.6, 1);
    particles.hurtSpray(this.x, this.y - this.h * 0.6, -1);
    particles.scrapBurst(this.x, this.y - this.h * 0.5, 1.2);
    audio.hurt();
    audio.glitch();
  }

  // ---- draw -------------------------------------------------------------

  draw(r: Renderer): void {
    const sprite = this.character.sprite;
    const [sx, sy] = this.drawScale(true);
    const bob = this.runBob(Math.abs(this.vx) / RUN_SPEED);
    const flip = this.facing < 0;

    // Airborne tumble: a little rotation sells the arc without a jump frame.
    const airRot = this.onGround ? 0 : clamp(this.vx / 900, -0.14, 0.14);
    const rot = this.lean + airRot + this.rot;

    // Invulnerability blink, but never fully invisible — losing the character
    // under your own i-frames feels worse than the hit did.
    const blink = this.invuln > 0 && !this.isDashing ? (Math.sin(time.elapsed * 42) > 0 ? 0.45 : 1) : 1;

    const drawWeaponBehind = this.facing > 0 ? false : true;
    if (drawWeaponBehind) this.drawHeldWeapon(r, blink);

    r.drawSprite(sprite, this.x, this.y + bob, {
      sx, sy, rot, flip,
      alpha: blink,
      flash: this.flash,
      glow: 1,
    });

    if (!drawWeaponBehind) this.drawHeldWeapon(r, blink);

    // Companion drone from the character sheet — orbits the shoulder so the
    // static sprite still feels alive without needing a second animation set.
    if (this.character.drone) {
      const orbit = time.elapsed * 2.1 + this.phase;
      const dx = Math.cos(orbit) * 11 * this.facing;
      const dy = Math.sin(orbit * 1.4) * 3 - this.h * 0.72;
      r.drawSprite(this.character.drone, this.x + dx, this.y + bob + dy, {
        alpha: blink * 0.95,
        glow: 1.15,
        sx: 1 + Math.sin(orbit * 2) * 0.04,
        sy: 1 - Math.sin(orbit * 2) * 0.04,
      });
    }

    // Element aura when carrying something genuinely dangerous.
    if (this.weapon.instability > 0.05) {
      fx.drawAura(r, this.x, this.y, this.weapon.style.glow, time.elapsed, 11, 0.7);
    }
  }

  private drawHeldWeapon(r: Renderer, alpha: number): void {
    const w = this.weapon;
    const gripX = this.x + this.facing * (5 + this.weaponPush - this.recoil * 0.6);
    const gripY = this.y - this.h * 0.55 + Math.sin(time.elapsed * 2.6 + this.phase) * 0.4;
    drawWeapon(r, w, gripX, gripY, this.weaponAngle, this.facing < 0, alpha);
  }

  /** Where a thrown item or projectile should originate. */
  muzzlePoint(): [number, number] {
    return [this.x + this.facing * 10, this.y - this.h * 0.55];
  }
}
