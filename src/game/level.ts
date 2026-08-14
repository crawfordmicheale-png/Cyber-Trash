import { Rng } from '../core/rng';
import { clamp, type Rect } from '../core/math';
import { prop, TILE, SCATTER_PROPS, BG_PROPS } from '../art/props';
import type { Renderer } from '../render/renderer';
import { PAL, rgba } from '../render/palette';
import { particles } from '../fx/particles';
import { time } from '../core/time';
import { drawText } from '../render/text';

/**
 * Layer 01 — THE SCRAP.
 *
 * The level is a vertical shaft assembled from procedurally generated chunks.
 * Generation walks a guaranteed critical path of ledges from the bottom to the
 * top — every ledge is placed inside the player's jump envelope — and then
 * decorates around it. That means a run is always climbable, but never the same
 * shape twice.
 */

export const enum Tile {
  Empty = 0,
  Solid = 1,
  Platform = 2, // one-way, drop through with down+jump
  Spike = 3,
  Sludge = 4,
}

/** Movement envelope, in tiles. Generation must never exceed these. */
const MAX_JUMP_UP = 3;
const MAX_JUMP_ACROSS = 6;

export const CHUNK_W = 30;
export const CHUNK_H = 14;

/** Billboard slogans. Scavenger graffiti, not corporate copy. */
const SIGN_SLOGANS = ['NO FUTURE', 'SLUDGE LIFE', 'KEEP OUT', 'ALL TRASH', 'UP IS A LIE'];

export interface PropInstance {
  id: string;
  x: number;
  y: number;
  flip: boolean;
  /** 0 = static world, >0 = parallax background. */
  depth: number;
  /** Neon accent used for the drip under it. */
  tint?: string;
  /** Text painted over a billboard, drawn with the pixel font. */
  label?: string;
  labelColor?: string;
}

export interface SpawnPoint {
  x: number;
  y: number;
  tier: 'common' | 'uncommon' | 'elite';
}

export interface PickupSpot {
  x: number;
  y: number;
  kind: 'part' | 'scrap' | 'health' | 'ammo';
}

export class Level {
  readonly cols: number;
  readonly rows: number;
  readonly tiles: Uint8Array;

  props: PropInstance[] = [];
  bgProps: PropInstance[] = [];
  spawns: SpawnPoint[] = [];
  pickups: PickupSpot[] = [];
  /** Neon drips hanging off ledge edges — purely cosmetic. */
  private drips: { x: number; y: number; len: number; color: string }[] = [];

  playerStart = { x: 0, y: 0 };
  exit = { x: 0, y: 0 };
  workbench = { x: 0, y: 0 };

  constructor(public readonly chunkCount: number, private rng: Rng, public readonly depth: number) {
    this.cols = CHUNK_W;
    this.rows = CHUNK_H * chunkCount + 6; // +6 for the start room
    this.tiles = new Uint8Array(this.cols * this.rows);
    this.generate();
  }

  // ---- grid access ------------------------------------------------------

  get(cx: number, cy: number): Tile {
    if (cx < 0 || cx >= this.cols || cy < 0) return Tile.Solid;
    if (cy >= this.rows) return Tile.Empty; // fall out the bottom
    return this.tiles[cy * this.cols + cx] as Tile;
  }

  set(cx: number, cy: number, t: Tile): void {
    if (cx < 0 || cx >= this.cols || cy < 0 || cy >= this.rows) return;
    this.tiles[cy * this.cols + cx] = t;
  }

  isSolid(cx: number, cy: number): boolean {
    return this.get(cx, cy) === Tile.Solid;
  }

  isBlocking(cx: number, cy: number): boolean {
    const t = this.get(cx, cy);
    return t === Tile.Solid || t === Tile.Platform;
  }

  get widthPx(): number { return this.cols * TILE; }
  get heightPx(): number { return this.rows * TILE; }

  /** Is any solid tile overlapping this world-space rect? */
  overlapsSolid(r: Rect): boolean {
    const x0 = Math.floor(r.x / TILE);
    const x1 = Math.floor((r.x + r.w - 0.001) / TILE);
    const y0 = Math.floor(r.y / TILE);
    const y1 = Math.floor((r.y + r.h - 0.001) / TILE);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (this.isSolid(x, y)) return true;
      }
    }
    return false;
  }

  /** Hazard tile under a rect, if any. */
  hazardAt(r: Rect): Tile | null {
    const x0 = Math.floor(r.x / TILE);
    const x1 = Math.floor((r.x + r.w - 0.001) / TILE);
    const y0 = Math.floor(r.y / TILE);
    const y1 = Math.floor((r.y + r.h - 0.001) / TILE);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = this.get(x, y);
        if (t === Tile.Spike || t === Tile.Sludge) return t;
      }
    }
    return null;
  }

  /** Cast a ray through the grid; returns the hit distance or `max`. */
  raycast(x: number, y: number, dx: number, dy: number, max: number): number {
    const step = 3;
    for (let d = 0; d < max; d += step) {
      const px = x + dx * d;
      const py = y + dy * d;
      if (this.isSolid(Math.floor(px / TILE), Math.floor(py / TILE))) return d;
    }
    return max;
  }

  // ---- generation -------------------------------------------------------

  private carveLedge(cx: number, cy: number, w: number, solid: boolean): void {
    for (let i = 0; i < w; i++) {
      this.set(cx + i, cy, solid ? Tile.Solid : Tile.Platform);
      if (solid) {
        // Give solid ledges a little body so they read as structure.
        this.set(cx + i, cy + 1, Tile.Solid);
      }
    }
  }

  private generate(): void {
    const rng = this.rng;

    // Outer walls.
    for (let y = 0; y < this.rows; y++) {
      this.set(0, y, Tile.Solid);
      this.set(1, y, Tile.Solid);
      this.set(this.cols - 1, y, Tile.Solid);
      this.set(this.cols - 2, y, Tile.Solid);
    }

    // --- Start room (bottom 6 rows): flat floor, workbench, no hazards.
    const floorY = this.rows - 3;
    for (let x = 0; x < this.cols; x++) {
      for (let y = floorY; y < this.rows; y++) this.set(x, y, Tile.Solid);
    }
    // The bench sits right where you land, so the first thing a run shows you is
    // the build system rather than a corridor.
    this.playerStart = { x: 6 * TILE, y: floorY * TILE };
    this.workbench = { x: 8 * TILE, y: floorY * TILE };
    this.props.push({ id: 'workbench', x: this.workbench.x, y: this.workbench.y, flip: false, depth: 0 });
    this.props.push({ id: 'vending', x: 19 * TILE, y: floorY * TILE, flip: false, depth: 0, tint: PAL.magenta });
    this.props.push({
      id: 'signNoFuture', x: 25 * TILE, y: (floorY - 3) * TILE, flip: false, depth: 0,
      label: rng.pick(SIGN_SLOGANS), labelColor: rng.pick([PAL.magenta, PAL.toxic, PAL.cyan]),
    });
    this.props.push({ id: 'junkPile', x: 27 * TILE, y: floorY * TILE, flip: rng.chance(0.5), depth: 0 });

    // --- Climb chunks, generated bottom-up along a guaranteed path.
    let cursorX = 6;
    let cursorY = floorY - 2;

    for (let chunk = 0; chunk < this.chunkCount; chunk++) {
      const chunkTop = this.rows - 6 - (chunk + 1) * CHUNK_H;
      const chunkBottom = this.rows - 6 - chunk * CHUNK_H;
      // Deeper chunks get denser hazards and tougher spawns.
      const difficulty = clamp((chunk / Math.max(1, this.chunkCount - 1)) + this.depth * 0.25, 0, 1.6);

      while (cursorY > chunkTop) {
        const rise = rng.int(2, MAX_JUMP_UP);
        const shift = rng.int(-MAX_JUMP_ACROSS, MAX_JUMP_ACROSS);
        const w = rng.int(3, 7);
        const nx = clamp(cursorX + shift, 2, this.cols - 2 - w);
        const ny = cursorY - rise;
        if (ny <= chunkTop) break;

        // Solid ledges mostly; thin catwalks sometimes, for drop-through play.
        const solid = rng.chance(0.62);
        this.carveLedge(nx, ny, w, solid);

        this.decorateLedge(nx, ny, w, difficulty, solid);

        cursorX = nx + Math.floor(w / 2);
        cursorY = ny;
      }

      // Side ledges that aren't on the critical path: optional loot routes.
      const extras = rng.int(4, 7);
      for (let i = 0; i < extras; i++) {
        const w = rng.int(3, 6);
        const nx = rng.int(2, this.cols - 2 - w);
        const ny = rng.int(chunkTop + 1, chunkBottom - 2);
        if (this.rowHasGeometry(ny, nx - 2, nx + w + 2)) continue;
        this.carveLedge(nx, ny, w, rng.chance(0.4));
        if (rng.chance(0.55)) {
          this.pickups.push({
            x: (nx + w / 2) * TILE,
            y: ny * TILE,
            kind: rng.chance(0.4) ? 'part' : rng.chance(0.5) ? 'scrap' : rng.chance(0.5) ? 'health' : 'ammo',
          });
        }
        if (rng.chance(0.4)) {
          this.props.push({
            id: rng.pick(SCATTER_PROPS),
            x: (nx + rng.int(0, w - 1)) * TILE + TILE / 2,
            y: ny * TILE,
            flip: rng.chance(0.5),
            depth: 0,
          });
        }
      }

      // Wall graffiti.
      for (let i = 0; i < 3; i++) {
        this.props.push({
          id: 'graffitiSkull',
          x: rng.chance(0.5) ? 2 * TILE + 6 : (this.cols - 2) * TILE - 6,
          y: rng.int(chunkTop, chunkBottom) * TILE,
          flip: rng.chance(0.5),
          depth: 0,
        });
      }
    }

    // --- Exit platform at the top.
    const exitY = Math.max(2, cursorY - 3);
    const exitX = clamp(cursorX - 3, 3, this.cols - 9);
    this.carveLedge(exitX, exitY, 7, true);
    this.exit = { x: (exitX + 3.5) * TILE, y: exitY * TILE };
    this.props.push({ id: 'exitGate', x: this.exit.x, y: this.exit.y, flip: false, depth: 0, tint: PAL.cyan });

    // Ceiling.
    for (let x = 0; x < this.cols; x++) {
      for (let y = 0; y < Math.max(1, exitY - 4); y++) this.set(x, y, Tile.Solid);
    }

    this.buildDrips();
    this.buildBackground();
  }

  private rowHasGeometry(row: number, x0: number, x1: number): boolean {
    for (let x = Math.max(0, x0); x <= Math.min(this.cols - 1, x1); x++) {
      if (this.get(x, row) !== Tile.Empty) return true;
      if (this.get(x, row - 1) !== Tile.Empty) return true;
      if (this.get(x, row + 1) !== Tile.Empty) return true;
    }
    return false;
  }

  private decorateLedge(nx: number, ny: number, w: number, difficulty: number, solid: boolean): void {
    const rng = this.rng;

    // Hazards sit ON the ledge so they threaten the landing, not the jump.
    if (solid && rng.chance(0.16 + difficulty * 0.14) && w >= 4) {
      const hx = nx + rng.int(0, w - 2);
      const kind = rng.chance(0.55) ? Tile.Spike : Tile.Sludge;
      this.set(hx, ny - 1, kind);
      if (rng.chance(0.4)) this.set(hx + 1, ny - 1, kind);
    }

    // Enemies.
    const enemyChance = 0.45 + difficulty * 0.3;
    if (rng.chance(enemyChance)) {
      const tier: SpawnPoint['tier'] =
        rng.chance(0.08 + difficulty * 0.12) ? 'elite'
        : rng.chance(0.25 + difficulty * 0.3) ? 'uncommon'
        : 'common';
      this.spawns.push({ x: (nx + rng.range(1, Math.max(1.2, w - 1))) * TILE, y: ny * TILE, tier });
    }

    // Loot.
    if (rng.chance(0.22)) {
      this.pickups.push({
        x: (nx + w / 2) * TILE,
        y: ny * TILE,
        kind: rng.chance(0.3) ? 'part' : rng.chance(0.4) ? 'health' : rng.chance(0.5) ? 'ammo' : 'scrap',
      });
    }

    // Set dressing.
    if (rng.chance(0.4)) {
      this.props.push({
        id: rng.pick(SCATTER_PROPS),
        x: (nx + rng.int(0, w - 1)) * TILE + TILE / 2,
        y: ny * TILE,
        flip: rng.chance(0.5),
        depth: 0,
      });
    }
  }

  private buildDrips(): void {
    const rng = this.rng;
    const colors = [PAL.magenta, PAL.cyan, PAL.toxic, PAL.violet, PAL.orange];
    for (let y = 1; y < this.rows; y++) {
      for (let x = 2; x < this.cols - 2; x++) {
        if (!this.isSolid(x, y)) continue;
        if (this.get(x, y + 1) !== Tile.Empty) continue;
        if (!rng.chance(0.05)) continue;
        this.drips.push({
          x: x * TILE + rng.int(2, 13),
          y: (y + 1) * TILE,
          len: rng.int(3, 11),
          color: rng.pick(colors),
        });
      }
    }
  }

  private buildBackground(): void {
    const rng = this.rng;
    for (let i = 0; i < Math.round(this.rows / 3); i++) {
      this.bgProps.push({
        id: rng.pick(BG_PROPS),
        x: rng.range(0, this.widthPx),
        y: rng.range(0, this.heightPx),
        flip: rng.chance(0.5),
        depth: rng.range(0.25, 0.6),
      });
    }
  }

  // ---- rendering --------------------------------------------------------

  /** Parallax background. Drawn before everything else. */
  drawBackground(r: Renderer, camX: number, camY: number, viewW: number, viewH: number): void {
    const g = r.g;
    // Deep gradient: the shaft glows faintly from below, from the fires.
    const grd = g.createLinearGradient(0, 0, 0, viewH);
    grd.addColorStop(0, '#08070f');
    grd.addColorStop(0.55, '#0d0a16');
    grd.addColorStop(1, '#16101c');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = grd;
    g.fillRect(0, 0, viewW, viewH);

    for (const p of this.bgProps) {
      const px = p.x - camX * p.depth;
      const py = p.y - camY * p.depth;
      if (px < -80 || px > viewW + 80 || py < -80 || py > viewH + 80) continue;
      const sprite = prop(p.id);
      g.globalAlpha = 0.35 + p.depth * 0.35;
      r.drawSprite(sprite, px, py, { flip: p.flip, glow: 0.4 });
      g.globalAlpha = 1;
    }
  }

  /**
   * Terrain. Draws only the visible window, picking the "top" tile art wherever
   * a surface is exposed so ledges read as ledges rather than blocks.
   */
  drawTerrain(r: Renderer, camX: number, camY: number, viewW: number, viewH: number): void {
    const x0 = Math.max(0, Math.floor(camX / TILE));
    const x1 = Math.min(this.cols - 1, Math.ceil((camX + viewW) / TILE));
    const y0 = Math.max(0, Math.floor(camY / TILE));
    const y1 = Math.min(this.rows - 1, Math.ceil((camY + viewH) / TILE));

    const top = prop('tileTop');
    const mid = prop('tileMid');
    const plat = prop('tilePlatform');
    const spike = prop('spikes');
    const sludge = prop('sludge');
    const g = r.g;

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = this.get(x, y);
        if (t === Tile.Empty) continue;
        const px = x * TILE;
        const py = y * TILE;
        switch (t) {
          case Tile.Solid: {
            const exposed = this.get(x, y - 1) !== Tile.Solid;
            r.drawSprite(exposed ? top : mid, px, py, { glow: 0.5 });
            // Exposed vertical faces get an outline so silhouettes stay crisp.
            if (!this.isSolid(x - 1, y)) { g.fillStyle = PAL.black; g.fillRect(px, py, 1, TILE); }
            if (!this.isSolid(x + 1, y)) { g.fillStyle = PAL.black; g.fillRect(px + TILE - 1, py, 1, TILE); }
            break;
          }
          case Tile.Platform:
            r.drawSprite(plat, px, py, { glow: 0.5 });
            break;
          case Tile.Spike:
            r.drawSprite(spike, px, py + TILE - 6, { glow: 1 });
            break;
          case Tile.Sludge:
            r.drawSprite(sludge, px, py + TILE - 5, { glow: 1 });
            if (Math.random() < 0.02) particles.vapour(px + Math.random() * TILE, py + TILE - 4, PAL.toxic);
            break;
        }
      }
    }

    // Neon drips off the ledge undersides.
    const t = time.elapsed;
    for (const d of this.drips) {
      if (d.x < camX - 8 || d.x > camX + viewW + 8 || d.y < camY - 20 || d.y > camY + viewH + 20) continue;
      const wobble = (Math.sin(t * 1.4 + d.x * 0.21) * 0.5 + 0.5) * 3;
      r.glowRect(d.x, d.y, 1, d.len, rgba(d.color, 0.55), 0.5, 0);
      r.glowRect(d.x, d.y + d.len + wobble, 1, 2, d.color, 0.85, 1);
    }
  }

  /** Foreground props. Drawn after terrain, before entities. */
  drawProps(r: Renderer, camX: number, camY: number, viewW: number, viewH: number): void {
    for (const p of this.props) {
      if (p.x < camX - 40 || p.x > camX + viewW + 40 || p.y < camY - 60 || p.y > camY + viewH + 40) continue;
      const sprite = prop(p.id);
      r.drawSprite(sprite, p.x, p.y, { flip: p.flip });
      if (p.label) {
        const color = p.labelColor ?? PAL.magenta;
        drawText(r.g, p.label, p.x, p.y - sprite.oy + 4, {
          color, glow: color, align: 'center', shadow: PAL.black,
        });
      }
    }
  }

  /** Ambient emitters — sparks near terminals, vapour off sludge. */
  ambient(dt: number, camX: number, camY: number, viewW: number, viewH: number): void {
    if (Math.random() > dt * 8) return;
    for (const p of this.props) {
      if (p.x < camX || p.x > camX + viewW || p.y < camY || p.y > camY + viewH) continue;
      if (Math.random() > 0.05) continue;
      if (p.id === 'terminal' || p.id === 'vending') {
        particles.ambient(p.x + (Math.random() - 0.5) * 10, p.y - 12, Math.random() < 0.5 ? PAL.cyan : PAL.magenta);
      }
    }
  }
}
