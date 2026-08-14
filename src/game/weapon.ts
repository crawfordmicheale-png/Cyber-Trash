import type { BasePart, CorePart, ModPart, ModEffects, Archetype, ProjectileSpec } from './parts.data';
import { BASES, CORES, MODS, RARITY_WEIGHT } from './parts.data';
import { ELEMENTS, RARITY, type Element, type ElementStyle, type Rarity } from '../render/palette';
import { weaponSprite, tintedWeapon } from '../art/weapons';
import type { Sprite } from '../render/sprite';
import type { Renderer } from '../render/renderer';
import type { Rng } from '../core/rng';

/**
 * Weapon assembly.
 *
 * BUILD = STATS + BEHAVIOUR + APPEARANCE. All three are derived here from the
 * same three parts, so a weapon can never look like something it doesn't do.
 */

export interface Weapon {
  base: BasePart;
  core: CorePart | null;
  mod: ModPart | null;

  name: string;
  rarity: Rarity;
  element: Element;
  style: ElementStyle;

  archetype: Archetype;
  damage: number;
  attackTime: number;
  range: number;
  knockback: number;
  spread: number;
  heavy: boolean;
  ammoCost: number;
  projectile: ProjectileSpec | null;
  effects: ModEffects;
  /** 0..1 chance per attack that something goes wrong. */
  instability: number;

  sprite: Sprite;
  coreSprite: Sprite | null;
  modSprite: Sprite | null;
}

/** Short names so generated titles stay readable. */
const SHORT: Record<string, string> = {
  pipe: 'PIPE',
  cleaver: 'CLEAVER',
  scrapSword: 'SWORD',
  crowbar: 'CROWBAR',
  chainsaw: 'CHAINSAW',
  drill: 'DRILL',
  pistol: 'PISTOL',
  nailgun: 'NAILGUN',
  shotgun: 'SHOTGUN',
  junkCannon: 'CANNON',
  beamRod: 'ARC ROD',
};

/** Element adjective used in generated names. */
const ELEMENT_WORD: Record<Element, string> = {
  kinetic: '',
  shock: 'ELECTRIFIED',
  toxic: 'TOXIC',
  plasma: 'PLASMA',
  void: 'VOID',
  data: 'CORRUPTED',
  fire: 'OVERCHARGED',
};

const RARITY_ORDER: Rarity[] = ['junk', 'common', 'rare', 'exotic', 'cursed'];

function highestRarity(...parts: ({ rarity: Rarity } | null)[]): Rarity {
  let best: Rarity = 'junk';
  for (const p of parts) {
    if (!p) continue;
    if (RARITY_ORDER.indexOf(p.rarity) > RARITY_ORDER.indexOf(best)) best = p.rarity;
  }
  return best;
}

function buildName(base: BasePart, core: CorePart | null, mod: ModPart | null, instability: number): string {
  const words: string[] = [];
  if (mod) words.push(mod.prefix);
  if (core) {
    const w = ELEMENT_WORD[core.element];
    if (w) words.push(w);
  }
  words.push(SHORT[base.id] ?? base.name);
  let name = words.join(' ');
  // The bible's running gag, earned rather than sprinkled: only the genuinely
  // dangerous builds get the disclaimer.
  if (instability >= 0.12) name += ' OF QUESTIONABLE INTEGRITY';
  else if (instability >= 0.06) name += ' (UNSTABLE)';
  return name;
}

export function assemble(base: BasePart, core: CorePart | null, mod: ModPart | null): Weapon {
  const fx = mod?.effects ?? {};
  const element: Element = core?.element ?? 'kinetic';
  const style = ELEMENTS[element];

  const damage = base.damage * (core?.damageMul ?? 1) * (fx.damageMul ?? 1);
  const attackTime = base.attackTime / ((core?.fireRateMul ?? 1) * (fx.fireRateMul ?? 1));
  const range = base.range * (fx.rangeMul ?? 1);
  const knockback = base.knockback * (fx.knockbackMul ?? 1);
  const instability = core?.instability ?? 0;

  const projectile = base.projectile
    ? { ...base.projectile, radius: base.projectile.radius * (fx.sizeMul ?? 1) }
    : null;

  // The element visibly rewrites the weapon: bright metal becomes the element
  // colour and starts emitting. A toxic pipe does not look like a plasma pipe.
  const sprite = core
    ? tintedWeapon(base.sprite, style.glow, style.core)
    : weaponSprite(base.sprite);

  return {
    base, core, mod,
    name: buildName(base, core, mod, instability),
    rarity: highestRarity(base, core, mod),
    element,
    style,
    archetype: base.archetype,
    damage,
    attackTime: Math.max(0.05, attackTime),
    range,
    knockback,
    spread: base.spread,
    heavy: base.heavy,
    ammoCost: base.ammoCost ?? 0,
    projectile,
    effects: fx,
    instability,
    sprite,
    coreSprite: core ? weaponSprite(core.sprite) : null,
    modSprite: mod ? weaponSprite(mod.sprite) : null,
  };
}

/** The weapon every run starts with. */
export function startingWeapon(): Weapon {
  return assemble(BASES[0], null, null);
}

/** Human-readable stat lines for the workbench panel. */
export function weaponStats(w: Weapon): string[] {
  const lines = [
    `DMG ${w.damage.toFixed(1)}`,
    `RATE ${(1 / w.attackTime).toFixed(1)}/S`,
    `DPS ${(w.damage / w.attackTime).toFixed(0)}`,
  ];
  if (w.element !== 'kinetic') lines.push(w.style.label);
  const e = w.effects;
  if (e.multishot) lines.push(`X${e.multishot + 1} SHOT`);
  if (e.multihit) lines.push(`X${e.multihit} HIT`);
  if (e.ricochet) lines.push(`BOUNCE ${e.ricochet}`);
  if (e.pierce) lines.push(`PIERCE ${e.pierce}`);
  if (e.homing) lines.push('SEEKING');
  if (e.explode) lines.push('EXPLOSIVE');
  if (e.chain) lines.push('CHAINING');
  if (e.lifesteal) lines.push('LEECH');
  if (e.magnet) lines.push('MAGNETIC');
  if (w.instability > 0) lines.push(`RISK ${(w.instability * 100).toFixed(0)}%`);
  return lines;
}

export function rarityColor(r: Rarity): string {
  return RARITY[r].color;
}

/**
 * Draw an assembled weapon. Base first, then the core and mod attachments at
 * their mount points, all inside the same rotation — so the whole assembly
 * swings as one object.
 */
export function drawWeapon(
  r: Renderer,
  w: Weapon,
  x: number,
  y: number,
  angle: number,
  flip: boolean,
  alpha = 1,
  scale = 1,
): void {
  const g = r.g;
  g.save();
  g.translate(Math.round(x), Math.round(y));
  g.rotate(flip ? Math.PI - angle : angle);
  g.scale(scale, flip ? -scale : scale);

  const drawAt = (sprite: Sprite, dx: number, dy: number): void => {
    if (sprite.glow) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = alpha * sprite.glowStrength;
      g.drawImage(sprite.glow, dx - sprite.ox - sprite.glowPad, dy - sprite.oy - sprite.glowPad);
      g.globalCompositeOperation = 'source-over';
    }
    g.globalAlpha = alpha;
    g.drawImage(sprite.base, dx - sprite.ox, dy - sprite.oy);
  };

  drawAt(w.sprite, 0, 0);
  if (w.coreSprite) drawAt(w.coreSprite, w.base.mount[0], w.base.mount[1]);
  if (w.modSprite) drawAt(w.modSprite, w.base.modMount[0], w.base.modMount[1]);

  g.restore();
  g.globalAlpha = 1;
}

/** Tip of the weapon in local space — where muzzle flashes and beams originate. */
export function weaponTip(w: Weapon): number {
  return w.sprite.w - w.sprite.ox;
}

// ---------------------------------------------------------------------------
// Loot
// ---------------------------------------------------------------------------

export type AnyPart = BasePart | CorePart | ModPart;

/** Roll a random part, biased by the run's depth (deeper = better junk). */
export function rollPart(rng: Rng, depth: number, slot?: 'base' | 'core' | 'mod'): AnyPart {
  const pool: AnyPart[] =
    slot === 'base' ? BASES
    : slot === 'core' ? CORES
    : slot === 'mod' ? MODS
    : rng.chance(0.34) ? BASES : rng.chance(0.5) ? CORES : MODS;

  // Depth shifts weight away from junk and toward the dangerous stuff.
  const bias = Math.min(2.4, 1 + depth * 0.25);
  return rng.weighted(pool, (p) => {
    const base = RARITY_WEIGHT[p.rarity];
    const isGood = p.rarity === 'rare' || p.rarity === 'exotic' || p.rarity === 'cursed';
    return isGood ? base * bias : base / bias;
  });
}

/** A fully random assembled weapon — used by shops and boss rewards. */
export function rollWeapon(rng: Rng, depth: number): Weapon {
  const base = rollPart(rng, depth, 'base') as BasePart;
  const core = rng.chance(0.75) ? (rollPart(rng, depth, 'core') as CorePart) : null;
  const mod = rng.chance(0.6) ? (rollPart(rng, depth, 'mod') as ModPart) : null;
  return assemble(base, core, mod);
}

export { BASES, CORES, MODS };
