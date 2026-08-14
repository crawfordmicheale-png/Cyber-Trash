import { Level } from './level';
import { Player } from './player';
import { Enemy } from './enemy';
import { ProjectilePool, drawExplosionFx } from './projectile';
import { PickupPool, scrapDropCount } from './pickup';
import { Camera } from '../core/camera';
import type { Renderer } from '../render/renderer';
import { VIEW_W, VIEW_H } from '../render/renderer';
import { Rng, fxRng } from '../core/rng';
import { particles } from '../fx/particles';
import { fx } from '../fx/fx';
import { PAL, ELEMENTS, type Element } from '../render/palette';
import { arcHitsRect, clamp, dist2, rectPointDist, type Rect } from '../core/math';
import { enemiesOfTier, BY_ID, type Tier } from './enemies.data';
import type { Weapon } from './weapon';
import { rollPart } from './weapon';
import type { CharacterArt } from '../art/player';
import { audio } from '../core/audio';
import { time } from '../core/time';
import { TILE } from '../art/props';

export interface Notification {
  text: string;
  color: string;
  life: number;
}

export interface SpawnProjectileArgs {
  x: number;
  y: number;
  angle: number;
  weapon: Weapon;
  fromPlayer: boolean;
}

/**
 * The simulation. Owns the level and everything in it, and is the single place
 * combat resolves — player and enemies both route damage through here so hit
 * feedback stays consistent no matter what caused it.
 */
export class World {
  level: Level;
  player: Player;
  enemies: Enemy[] = [];
  projectiles = new ProjectilePool();
  pickups = new PickupPool();
  camera: Camera;
  rng: Rng;

  /** Layer index; 0 = THE SCRAP. */
  depth: number;
  seed: number;

  notifications: Notification[] = [];

  // Run stats.
  runScrap = 0;
  kills = 0;
  elapsed = 0;

  /** Set when the player touches the exit gate. */
  exitReached = false;
  /** Set while the player is standing on the workbench. */
  nearWorkbench = false;

  private cullBounds: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(
    public renderer: Renderer,
    character: CharacterArt,
    depth: number,
    seed: number,
  ) {
    this.depth = depth;
    this.seed = seed;
    this.rng = new Rng(seed);
    this.level = new Level(4 + Math.min(3, depth), this.rng, depth);
    this.player = new Player(character);
    this.player.x = this.level.playerStart.x;
    this.player.y = this.level.playerStart.y;
    this.camera = new Camera(VIEW_W, VIEW_H);
    this.camera.bounds = { x: 0, y: 0, w: this.level.widthPx, h: this.level.heightPx };
    this.camera.snapTo(this.player.x, this.player.y - 20);
    this.populate();
  }

  /** Carry a player across a layer transition without rebuilding their build. */
  adopt(player: Player): void {
    this.player = player;
    player.x = this.level.playerStart.x;
    player.y = this.level.playerStart.y;
    player.vx = 0;
    player.vy = 0;
    player.dead = false;
    this.camera.snapTo(player.x, player.y - 20);
  }

  private populate(): void {
    const hpScale = 1 + this.depth * 0.35;
    for (const spot of this.level.spawns) {
      const pool = enemiesOfTier(spot.tier as Tier);
      if (pool.length === 0) continue;
      const def = this.rng.pick(pool);
      this.enemies.push(new Enemy(def, spot.x, spot.y, hpScale));
    }

    // One boss near the top once you are deep enough to have a build.
    if (this.depth >= 1) {
      const boss = BY_ID.get('scrapTitan');
      if (boss) {
        this.enemies.push(new Enemy(boss, this.level.exit.x, this.level.exit.y + TILE * 6, 1 + this.depth * 0.4));
      }
    }

    for (const spot of this.level.pickups) {
      switch (spot.kind) {
        case 'part':
          this.pickups.spawn('part', spot.x, spot.y - 8, 1, rollPart(this.rng, this.depth));
          break;
        case 'health':
          this.pickups.spawn('health', spot.x, spot.y - 8, 20);
          break;
        case 'ammo':
          this.pickups.spawn('ammo', spot.x, spot.y - 8, 24);
          break;
        default:
          this.pickups.spawn('scrap', spot.x, spot.y - 8, this.rng.int(3, 9));
          break;
      }
    }
  }

  notify(text: string, color = PAL.cyan): void {
    this.notifications.unshift({ text, color, life: 2.6 });
    if (this.notifications.length > 5) this.notifications.pop();
  }

  // ---- simulation -------------------------------------------------------

  update(dt: number): void {
    if (dt <= 0) return;
    this.elapsed += dt;

    this.player.update(this, dt);

    // Only simulate what's near the view; a tall shaft holds a lot of enemies.
    const cam = { x: 0, y: 0 };
    this.camera.viewOrigin(cam);
    this.cullBounds.x = cam.x - VIEW_W * 0.6;
    this.cullBounds.y = cam.y - VIEW_H * 0.6;
    this.cullBounds.w = VIEW_W * 2.2;
    this.cullBounds.h = VIEW_H * 2.2;

    for (const e of this.enemies) {
      if (e.dead) continue;
      if (rectPointDist(this.cullBounds, e.x, e.y) > 0) continue;
      e.update(this, dt);
    }
    this.enemies = this.enemies.filter((e) => !e.finished);

    this.projectiles.update(this, dt);
    this.pickups.update(this, dt);

    particles.update(dt);
    fx.update(dt);
    this.level.ambient(dt, cam.x, cam.y, VIEW_W, VIEW_H);

    for (const n of this.notifications) n.life -= dt;
    this.notifications = this.notifications.filter((n) => n.life > 0);

    this.camera.follow(this.player.x, this.player.y - 14, this.player.vx, this.player.vy, dt);

    this.checkExit();
    this.checkWorkbench();
  }

  private checkExit(): void {
    if (this.exitReached || this.player.dead) return;
    if (dist2(this.player.x, this.player.y, this.level.exit.x, this.level.exit.y) < 22 * 22) {
      this.exitReached = true;
      audio.layerClear();
      this.renderer.screenFlash(PAL.cyan, 0.6);
      fx.ring(this.level.exit.x, this.level.exit.y - 10, 4, 90, PAL.cyan, 0.7, 3);
      particles.shimmer(this.level.exit.x, this.level.exit.y - 10, PAL.cyan, 40);
    }
  }

  private checkWorkbench(): void {
    this.nearWorkbench =
      !this.player.dead &&
      dist2(this.player.x, this.player.y, this.level.workbench.x, this.level.workbench.y) < 44 * 44;
  }

  // ---- combat resolution ------------------------------------------------

  /**
   * Melee. Cone test against every live enemy; `already` prevents one swing
   * from hitting the same target on consecutive frames.
   */
  damageInArc(
    cx: number, cy: number, radius: number,
    facing: number, halfAngle: number,
    weapon: Weapon, already: Set<number>,
  ): number {
    let hits = 0;
    const chainTargets: Enemy[] = [];
    for (const e of this.enemies) {
      if (e.dead || already.has(e.id)) continue;
      if (!arcHitsRect(cx, cy, radius, facing, halfAngle, e.rect)) continue;
      already.add(e.id);
      e.hit(this, weapon.damage, weapon, cx, cy);
      chainTargets.push(e);
      hits++;
    }
    if (hits > 0 && weapon.effects.chain) this.chainFrom(chainTargets, weapon, already);
    return hits;
  }

  /** Hitscan beams. */
  damageInLine(x1: number, y1: number, x2: number, y2: number, width: number, weapon: Weapon): number {
    let hits = 0;
    const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 6);
    const seen = new Set<number>();
    for (let i = 0; i <= steps; i++) {
      const t = i / Math.max(1, steps);
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      for (const e of this.enemies) {
        if (e.dead || seen.has(e.id)) continue;
        if (rectPointDist(e.rect, px, py) > width) continue;
        seen.add(e.id);
        e.hit(this, weapon.damage, weapon, px, py);
        hits++;
      }
    }
    return hits;
  }

  /** Capacitor bank: arc to a nearby second target. */
  private chainFrom(sources: Enemy[], weapon: Weapon, already: Set<number>): void {
    const jumps = weapon.effects.chain ?? 0;
    for (const src of sources) {
      let from = src;
      for (let j = 0; j < jumps; j++) {
        let best: Enemy | null = null;
        let bestD = 70 * 70;
        for (const e of this.enemies) {
          if (e.dead || already.has(e.id)) continue;
          const d = dist2(from.cx, from.cy, e.cx, e.cy);
          if (d < bestD) { bestD = d; best = e; }
        }
        if (!best) break;
        already.add(best.id);
        fx.beam(from.cx, from.cy, best.cx, best.cy, weapon.style.glow, weapon.style.core, 2, 0.18);
        best.hit(this, weapon.damage * 0.6, weapon, from.cx, from.cy);
        from = best;
      }
    }
  }

  /**
   * Radial damage. Used by pressure tanks, rockets, barrels and overloads.
   *
   * Guarded against re-entry: an explosion's own damage must never trigger
   * another explosion, or an explosive weapon chains into itself forever.
   */
  private exploding = false;

  explode(x: number, y: number, radius: number, damage: number, weapon: Weapon, fromPlayer: boolean): void {
    drawExplosionFx(x, y, radius, weapon.style);
    this.camera.addTrauma(clamp(radius / 90, 0.1, 0.7));
    time.hitStop(0.04);
    audio.explode();

    if (fromPlayer && !this.exploding) {
      this.exploding = true;
      try {
        for (const e of this.enemies) {
          if (e.dead) continue;
          const d = rectPointDist(e.rect, x, y);
          if (d > radius) continue;
          const falloff = 1 - clamp(d / radius, 0, 1) * 0.6;
          e.hit(this, damage * falloff, weapon, x, y, 1.4, false);
        }
      } finally {
        this.exploding = false;
      }
    }
    // Explosions always shove the player, friendly or not — that is the cost of
    // strapping a pressure tank to a nailgun.
    const pd = rectPointDist(this.player.rect, x, y);
    if (pd < radius) {
      this.player.knockback(x, y, 200 * (1 - pd / radius), 0.6);
    }
  }

  spawnProjectile(args: SpawnProjectileArgs): void {
    const p = this.projectiles.get();
    if (!p) return;
    p.spawnFromWeapon(args.x, args.y, args.angle, args.weapon, args.fromPlayer);
  }

  spawnEnemyProjectile(
    x: number, y: number, angle: number, speed: number,
    damage: number, spriteId: string, element: Element,
  ): void {
    const p = this.projectiles.get();
    if (!p) return;
    p.spawnEnemyShot(x, y, angle, speed, damage, spriteId, element);
  }

  onEnemyKilled(enemy: Enemy, weapon?: Weapon): void {
    this.kills++;

    for (const amount of scrapDropCount(enemy.def.scrap)) {
      this.pickups.spawn('scrap', enemy.cx, enemy.cy, amount);
    }
    if (fxRng.chance(enemy.def.partChance)) {
      this.pickups.spawn('part', enemy.cx, enemy.cy, 1, rollPart(this.rng, this.depth));
    }
    if (fxRng.chance(0.14)) this.pickups.spawn('health', enemy.cx, enemy.cy, 12);
    if (fxRng.chance(0.2)) this.pickups.spawn('ammo', enemy.cx, enemy.cy, 12);

    if (enemy.isBoss) {
      this.notify('SCRAP TITAN DOWN', PAL.magenta);
      for (let i = 0; i < 3; i++) {
        this.pickups.spawn('part', enemy.cx + fxRng.spread(1) * 26, enemy.cy, 1, rollPart(this.rng, this.depth + 2));
      }
    } else if (enemy.def.tier === 'elite') {
      this.notify(`${enemy.def.name} DOWN`, PAL.orange);
    }
    void weapon;
  }

  // ---- rendering --------------------------------------------------------

  draw(): void {
    const r = this.renderer;
    const cam = { x: 0, y: 0 };
    this.camera.viewOrigin(cam);
    r.zoom = this.camera.zoomPunch();

    r.clear(PAL.void);
    this.level.drawBackground(r, cam.x, cam.y, VIEW_W, VIEW_H);

    const g = r.g;
    g.setTransform(1, 0, 0, 1, -cam.x, -cam.y);

    this.level.drawTerrain(r, cam.x, cam.y, VIEW_W, VIEW_H);
    this.level.drawProps(r, cam.x, cam.y, VIEW_W, VIEW_H);

    fx.drawUnder(r);
    this.pickups.draw(r);

    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.x < cam.x - 60 || e.x > cam.x + VIEW_W + 60) continue;
      if (e.y < cam.y - 80 || e.y > cam.y + VIEW_H + 80) continue;
      e.draw(r);
    }

    this.player.draw(r);
    this.projectiles.draw(r);
    particles.draw(r);
    fx.drawOver(r);

    this.drawOffscreenMarkers(r, cam);

    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Edge arrows for elites and the boss, so threats off-screen are legible. */
  private drawOffscreenMarkers(r: Renderer, cam: { x: number; y: number }): void {
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.def.tier !== 'elite' && e.def.tier !== 'boss') continue;
      const sx = e.x - cam.x;
      const sy = e.y - cam.y;
      if (sx > 0 && sx < VIEW_W && sy > 0 && sy < VIEW_H) continue;
      const mx = clamp(sx, 8, VIEW_W - 8) + cam.x;
      const my = clamp(sy, 8, VIEW_H - 8) + cam.y;
      const color = e.isBoss ? PAL.magenta : PAL.orange;
      const pulse = 0.5 + Math.sin(time.elapsed * 6) * 0.3;
      r.glowRect(mx - 2, my - 2, 4, 4, color, pulse, 2);
    }
  }

  /** Height climbed, as a 0..1 fraction of the shaft. */
  get climbProgress(): number {
    const total = this.level.heightPx - this.level.exit.y;
    return clamp(1 - (this.player.y - this.level.exit.y) / Math.max(1, total), 0, 1);
  }

  get elementStyle(): typeof ELEMENTS[Element] {
    return this.player.weapon.style;
  }

  dispose(): void {
    particles.clear();
    fx.clear();
    this.projectiles.clear();
    this.pickups.clear();
  }
}
