import type { Element, Rarity } from '../render/palette';

/**
 * Weapon components.
 *
 * The design rule from the bible: every upgrade must change how something
 * behaves, not just add a number. So cores carry an element and an on-hit
 * effect, and mods carry behaviour flags — flat damage multipliers only ever
 * ride along with something that also changes the feel.
 */

export type Archetype = 'swing' | 'thrust' | 'spin' | 'shoot' | 'burst' | 'beam' | 'lob';
export type PartSlot = 'base' | 'core' | 'mod';

export interface ProjectileSpec {
  sprite: string;
  speed: number;
  life: number;
  gravity: number;
  /** Collision radius in pixels. */
  radius: number;
  /** Spin the sprite while flying (saw blades, grenades). */
  spin: number;
}

export interface BasePart {
  id: string;
  slot: 'base';
  name: string;
  desc: string;
  rarity: Rarity;
  sprite: string;
  archetype: Archetype;
  damage: number;
  /** Seconds between attacks. */
  attackTime: number;
  /** Melee reach, or projectile spawn distance. */
  range: number;
  knockback: number;
  /** Melee cone width in radians. */
  spread: number;
  /** Heavier weapons get bigger hit-stop, shake and slower swings. */
  heavy: boolean;
  projectile?: ProjectileSpec;
  /** Where the core attaches, in sprite pixels relative to the grip pivot. */
  mount: [number, number];
  modMount: [number, number];
  /** Ammo drain per shot for ranged bases (melee is free). */
  ammoCost?: number;
}

export interface CorePart {
  id: string;
  slot: 'core';
  name: string;
  desc: string;
  rarity: Rarity;
  sprite: string;
  element: Element;
  damageMul: number;
  fireRateMul: number;
  /** Applied to the target on hit. */
  onHit?: 'burn' | 'shock' | 'poison' | 'pull' | 'corrupt';
  /** 0..1 chance per attack of an unstable discharge. Risk = power. */
  instability: number;
  /** Shown in red on the workbench when instability > 0. */
  risk?: string;
}

export interface ModEffects {
  damageMul?: number;
  fireRateMul?: number;
  knockbackMul?: number;
  rangeMul?: number;
  sizeMul?: number;
  /** Projectiles bounce off geometry this many times. */
  ricochet?: number;
  /** Projectiles steer toward enemies. */
  homing?: number;
  /** Extra projectiles per shot. */
  multishot?: number;
  /** Projectiles pass through this many enemies. */
  pierce?: number;
  /** Fraction of damage returned as health. */
  lifesteal?: number;
  /** Explode on impact, radius in pixels. */
  explode?: number;
  /** Pull drops toward the player. */
  magnet?: number;
  /** Melee attacks hit repeatedly while active (chainsaws). */
  multihit?: number;
  /** The gun occasionally picks its own target. Including badly. */
  chaos?: number;
  /** Attacks chain to a nearby second target. */
  chain?: number;
}

export interface ModPart {
  id: string;
  slot: 'mod';
  name: string;
  desc: string;
  rarity: Rarity;
  sprite: string;
  /** Prefix used when generating the assembled weapon's name. */
  prefix: string;
  effects: ModEffects;
  risk?: string;
}

export type Part = BasePart | CorePart | ModPart;

// ---------------------------------------------------------------------------
// BASES
// ---------------------------------------------------------------------------

export const BASES: BasePart[] = [
  {
    id: 'pipe', slot: 'base', name: 'RUSTY PIPE', rarity: 'junk',
    desc: 'IT WAS HOLDING SOMETHING UP. NOT ANYMORE.',
    sprite: 'pipe', archetype: 'swing',
    damage: 9, attackTime: 0.34, range: 26, knockback: 130, spread: 1.9,
    heavy: false, mount: [12, 0], modMount: [18, -2],
  },
  {
    id: 'cleaver', slot: 'base', name: 'MEAT CLEAVER', rarity: 'common',
    desc: 'FROM A KITCHEN THAT SERVED SOMETHING.',
    sprite: 'cleaver', archetype: 'swing',
    damage: 14, attackTime: 0.42, range: 27, knockback: 170, spread: 2.1,
    heavy: true, mount: [11, 1], modMount: [16, -2],
  },
  {
    id: 'scrapSword', slot: 'base', name: 'SCRAP SWORD', rarity: 'common',
    desc: 'FOUR STREET SIGNS AND A LOT OF OPTIMISM.',
    sprite: 'scrapSword', archetype: 'thrust',
    damage: 12, attackTime: 0.28, range: 34, knockback: 110, spread: 0.9,
    heavy: false, mount: [10, 0], modMount: [16, -1],
  },
  {
    id: 'crowbar', slot: 'base', name: 'CROWBAR', rarity: 'junk',
    desc: 'OPENS DOORS. OPENS OTHER THINGS.',
    sprite: 'crowbar', archetype: 'swing',
    damage: 11, attackTime: 0.3, range: 24, knockback: 190, spread: 2.0,
    heavy: false, mount: [10, 0], modMount: [14, -2],
  },
  {
    id: 'chainsaw', slot: 'base', name: 'CHAINSAW BAR', rarity: 'rare',
    desc: 'THE MOTOR STILL WORKS. NOBODY KNOWS WHY.',
    sprite: 'chainsaw', archetype: 'spin',
    damage: 6, attackTime: 0.5, range: 30, knockback: 60, spread: 6.28,
    heavy: true, mount: [12, 0], modMount: [18, -3],
  },
  {
    id: 'drill', slot: 'base', name: 'INDUSTRIAL DRILL', rarity: 'rare',
    desc: 'RATED FOR CONCRETE. NOT RATED FOR PEOPLE.',
    sprite: 'drill', archetype: 'thrust',
    damage: 7, attackTime: 0.14, range: 24, knockback: 40, spread: 0.7,
    heavy: false, mount: [8, 0], modMount: [13, -2],
  },
  {
    id: 'pistol', slot: 'base', name: 'PISTOL FRAME', rarity: 'junk',
    desc: 'SERIAL NUMBER FILED OFF BY RUST.',
    sprite: 'pistol', archetype: 'shoot',
    damage: 8, attackTime: 0.22, range: 12, knockback: 60, spread: 0.06,
    heavy: false, ammoCost: 1, mount: [8, 1], modMount: [12, -2],
    projectile: { sprite: 'projSlug', speed: 460, life: 1.1, gravity: 0, radius: 3, spin: 0 },
  },
  {
    id: 'nailgun', slot: 'base', name: 'NAILGUN', rarity: 'common',
    desc: 'CONSTRUCTION GRADE. CONSTRUCTION ABANDONED.',
    sprite: 'nailgun', archetype: 'shoot',
    damage: 5, attackTime: 0.1, range: 14, knockback: 26, spread: 0.13,
    heavy: false, ammoCost: 1, mount: [9, 1], modMount: [14, -3],
    projectile: { sprite: 'projNail', speed: 520, life: 0.8, gravity: 30, radius: 2, spin: 0 },
  },
  {
    id: 'shotgun', slot: 'base', name: 'SHOTGUN RECEIVER', rarity: 'common',
    desc: 'WIDE. LOUD. HONEST.',
    sprite: 'shotgun', archetype: 'burst',
    damage: 6, attackTime: 0.62, range: 14, knockback: 130, spread: 0.42,
    heavy: true, ammoCost: 4, mount: [10, 1], modMount: [15, -3],
    projectile: { sprite: 'projSlug', speed: 400, life: 0.34, gravity: 60, radius: 3, spin: 0 },
  },
  {
    id: 'junkCannon', slot: 'base', name: 'JUNK CANNON', rarity: 'exotic',
    desc: 'FIRES WHATEVER YOU PUT IN IT. ANYTHING.',
    sprite: 'junkCannon', archetype: 'lob',
    damage: 26, attackTime: 0.85, range: 16, knockback: 260,
    spread: 0.05, heavy: true, ammoCost: 6, mount: [12, 2], modMount: [18, -3],
    projectile: { sprite: 'projGrenade', speed: 300, life: 2.2, gravity: 420, radius: 5, spin: 12 },
  },
  {
    id: 'beamRod', slot: 'base', name: 'ARC ROD', rarity: 'exotic',
    desc: 'A LIGHTNING ROD SOMEONE TAUGHT TO POINT.',
    sprite: 'beamRod', archetype: 'beam',
    damage: 16, attackTime: 0.46, range: 150, knockback: 70, spread: 0.02,
    heavy: false, ammoCost: 3, mount: [10, 0], modMount: [15, -2],
  },
];

// ---------------------------------------------------------------------------
// CORES — power sources. These decide the element, and thus the entire
// visual and audio presentation of the weapon.
// ---------------------------------------------------------------------------

export const CORES: CorePart[] = [
  {
    id: 'battery', slot: 'core', name: 'CAR BATTERY', rarity: 'junk',
    desc: 'LEAKING, BUT IN A USEFUL DIRECTION.',
    sprite: 'attachBattery', element: 'shock', damageMul: 1.15, fireRateMul: 1,
    onHit: 'shock', instability: 0,
  },
  {
    id: 'toxicCan', slot: 'core', name: 'TOXIC CANISTER', rarity: 'common',
    desc: 'THE LABEL PEELED OFF DECADES AGO.',
    sprite: 'attachCanister', element: 'toxic', damageMul: 0.9, fireRateMul: 1.05,
    onHit: 'poison', instability: 0,
  },
  {
    id: 'plasmaCell', slot: 'core', name: 'PLASMA CELL', rarity: 'rare',
    desc: 'STILL WARM. IT HAS BEEN DOWN HERE 200 YEARS.',
    sprite: 'attachPlasma', element: 'plasma', damageMul: 1.45, fireRateMul: 0.92,
    onHit: 'burn', instability: 0.05,
    risk: 'RUNS HOT. SO DO YOU.',
  },
  {
    id: 'reactorFrag', slot: 'core', name: 'CRACKED REACTOR', rarity: 'cursed',
    desc: '+300% DAMAGE. THE CRACK IS LOAD-BEARING.',
    sprite: 'attachReactor', element: 'fire', damageMul: 3.0, fireRateMul: 0.8,
    onHit: 'burn', instability: 0.13,
    risk: 'MAY OVERLOAD AND DETONATE IN YOUR HANDS.',
  },
  {
    id: 'voidBattery', slot: 'core', name: 'VOID BATTERY', rarity: 'exotic',
    desc: 'THE CHARGE READING IS NEGATIVE.',
    sprite: 'attachVoid', element: 'void', damageMul: 1.3, fireRateMul: 0.95,
    onHit: 'pull', instability: 0.03,
    risk: 'OCCASIONALLY DRAINS THE HOLDER INSTEAD.',
  },
  {
    id: 'dataCore', slot: 'core', name: 'CORRUPTED DATA CORE', rarity: 'exotic',
    desc: 'IT IS STILL RUNNING SOMETHING. ASK IT NICELY.',
    sprite: 'attachData', element: 'data', damageMul: 1.2, fireRateMul: 1.15,
    onHit: 'corrupt', instability: 0.08,
    risk: 'SOMETIMES TARGETS THINGS THAT ARE NOT ENEMIES.',
  },
];

// ---------------------------------------------------------------------------
// MODS — behaviour. This is where the stupid combinations live.
// ---------------------------------------------------------------------------

export const MODS: ModPart[] = [
  {
    id: 'servo', slot: 'mod', name: 'SERVO MOTOR', rarity: 'junk',
    desc: 'ATTACKS 35% FASTER. RATTLES ALARMINGLY.',
    sprite: 'attachMotor', prefix: 'RAPID',
    effects: { fireRateMul: 1.35, damageMul: 0.9 },
  },
  {
    id: 'ricochetChip', slot: 'mod', name: 'RICOCHET CHIP', rarity: 'common',
    desc: 'SHOTS BOUNCE TWICE. AIM IS OPTIONAL.',
    sprite: 'attachChip', prefix: 'RICOCHET',
    effects: { ricochet: 2, damageMul: 0.95 },
  },
  {
    id: 'targetingChip', slot: 'mod', name: 'BOOTLEG TARGETING AI', rarity: 'rare',
    desc: 'PROJECTILES SEEK ENEMIES. THE AI IS VERY STUPID.',
    sprite: 'attachChip', prefix: 'SEEKING',
    effects: { homing: 3.4, chaos: 0.2 },
    risk: 'IT HAS OPINIONS ABOUT WHAT COUNTS AS A TARGET.',
  },
  {
    id: 'pressureTank', slot: 'mod', name: 'PRESSURE TANK', rarity: 'common',
    desc: 'EVERYTHING EXPLODES A LITTLE NOW.',
    sprite: 'attachTank', prefix: 'VOLATILE',
    effects: { explode: 26, fireRateMul: 0.85 },
  },
  {
    id: 'magnet', slot: 'mod', name: 'SALVAGE MAGNET', rarity: 'common',
    desc: 'DROPS COME TO YOU. SO DOES LOOSE DEBRIS.',
    sprite: 'attachMagnet', prefix: 'MAGNETIC',
    effects: { magnet: 70 },
  },
  {
    id: 'capacitor', slot: 'mod', name: 'CAPACITOR BANK', rarity: 'rare',
    desc: 'HITS ARC TO A SECOND TARGET.',
    sprite: 'attachCoil', prefix: 'CHAINED',
    effects: { chain: 1, damageMul: 1.1 },
  },
  {
    id: 'coolingCoil', slot: 'mod', name: 'COOLING COIL', rarity: 'common',
    desc: 'HEAVIER, HARDER, MORE RELIABLE.',
    sprite: 'attachCoil', prefix: 'STABILISED',
    effects: { damageMul: 1.25, fireRateMul: 0.88 },
  },
  {
    id: 'chainsawMotor', slot: 'mod', name: 'CHAINSAW MOTOR', rarity: 'rare',
    desc: 'MELEE HITS THREE TIMES PER SWING.',
    sprite: 'attachMotor', prefix: 'GRINDING',
    effects: { multihit: 3, damageMul: 0.55, knockbackMul: 0.4 },
  },
  {
    id: 'splitter', slot: 'mod', name: 'BARREL SPLITTER', rarity: 'rare',
    desc: 'TWO EXTRA PROJECTILES. TWICE THE MESS.',
    sprite: 'attachChip', prefix: 'SPLIT',
    effects: { multishot: 2, damageMul: 0.7 },
  },
  {
    id: 'railSpike', slot: 'mod', name: 'RAIL SPIKE', rarity: 'exotic',
    desc: 'SHOTS PIERCE THREE ENEMIES.',
    sprite: 'attachCoil', prefix: 'PIERCING',
    effects: { pierce: 3, damageMul: 1.15, knockbackMul: 1.3 },
  },
  {
    id: 'leechModule', slot: 'mod', name: 'LEECH MODULE', rarity: 'cursed',
    desc: 'RETURNS 8% OF DAMAGE AS HEALTH. IT IS WARM.',
    sprite: 'attachTank', prefix: 'PARASITIC',
    effects: { lifesteal: 0.08, damageMul: 0.85 },
    risk: 'IT IS NOT CLEAR WHAT IT DOES WHEN YOU ARE FULL.',
  },
  {
    id: 'brokenAI', slot: 'mod', name: 'BROKEN AI MODULE', rarity: 'cursed',
    desc: 'THE WEAPON NOW CHOOSES ITS OWN TARGETS.',
    sprite: 'attachChip', prefix: 'AUTONOMOUS',
    effects: { homing: 5, chaos: 0.55, fireRateMul: 1.2 },
    risk: 'ITS TARGET SELECTION IS BEST DESCRIBED AS CREATIVE.',
  },
];

export const ALL_PARTS: Part[] = [...BASES, ...CORES, ...MODS];

export function partById(id: string): Part | undefined {
  return ALL_PARTS.find((p) => p.id === id);
}

/** Loot tables weighted by rarity, used by drops and the run's shop. */
export const RARITY_WEIGHT: Record<Rarity, number> = {
  junk: 40,
  common: 30,
  rare: 16,
  exotic: 8,
  cursed: 6,
};
