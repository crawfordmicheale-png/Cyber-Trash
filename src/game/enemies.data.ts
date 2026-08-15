import type { Element } from '../render/palette';

/**
 * Enemy roster.
 *
 * Behaviour is data, not code-per-enemy: the same six behaviour routines cover
 * the whole roster, and personality comes from the numbers, the sprite and the
 * element. Adding an enemy is adding a row here plus one character map.
 */

export type Behavior =
  | 'walker' // patrols, chases on sight
  | 'hopper' // chases in jumps
  | 'flyer' // ignores gravity, drifts toward the player
  | 'shooter' // keeps range, fires projectiles
  | 'charger' // telegraphs, then dashes
  | 'blob' // slow, relentless, contact damage
  | 'brute'; // heavy melee with a wind-up slam

export type Tier = 'common' | 'uncommon' | 'elite' | 'boss';

export interface EnemyDef {
  id: string;
  name: string;
  art: string;
  tier: Tier;
  behavior: Behavior;
  hp: number;
  /** Contact damage. */
  touch: number;
  speed: number;
  /** Detection radius in pixels. */
  sight: number;
  /** Scrap dropped on death. */
  scrap: number;
  /** Death presentation. */
  element: Element;
  gravity: number;
  /** Ranged attack, for shooters and the elite. */
  attack?: {
    damage: number;
    cooldown: number;
    range: number;
    /** Projectile art id; omitted means a melee lunge. */
    projectile?: string;
    speed?: number;
    /** Shots per volley. */
    count?: number;
    spread?: number;
    /** Seconds of visible wind-up before the shot lands. */
    telegraph: number;
  };
  /** Chance a kill drops a weapon part. */
  partChance: number;
}

export const ENEMIES: EnemyDef[] = [
  // --- COMMON
  {
    id: 'scrapRat', name: 'SCRAP RAT', art: 'scrapRat', tier: 'common', behavior: 'walker',
    hp: 14, touch: 6, speed: 62, sight: 150, scrap: 3, element: 'kinetic', gravity: 900,
    partChance: 0.03,
  },
  {
    id: 'garbageHound', name: 'GARBAGE HOUND', art: 'garbageHound', tier: 'common', behavior: 'charger',
    hp: 22, touch: 9, speed: 74, sight: 190, scrap: 5, element: 'kinetic', gravity: 900,
    attack: { damage: 9, cooldown: 1.9, range: 96, telegraph: 0.45 },
    partChance: 0.05,
  },
  {
    id: 'dataMite', name: 'DATA MITE', art: 'dataMite', tier: 'common', behavior: 'flyer',
    hp: 12, touch: 6, speed: 52, sight: 200, scrap: 4, element: 'data', gravity: 0,
    partChance: 0.05,
  },
  {
    id: 'toxicSlime', name: 'TOXIC SLIME', art: 'toxicSlime', tier: 'common', behavior: 'blob',
    hp: 26, touch: 8, speed: 26, sight: 130, scrap: 4, element: 'toxic', gravity: 900,
    partChance: 0.04,
  },
  {
    id: 'spareDrone', name: 'SPARE DRONE', art: 'spareDrone', tier: 'common', behavior: 'shooter',
    hp: 16, touch: 4, speed: 44, sight: 210, scrap: 6, element: 'shock', gravity: 0,
    attack: { damage: 6, cooldown: 1.6, range: 190, projectile: 'projShock', speed: 190, telegraph: 0.4 },
    partChance: 0.07,
  },
  {
    id: 'glitchGoblin', name: 'GLITCH GOBLIN', art: 'glitchGoblin', tier: 'common', behavior: 'hopper',
    hp: 20, touch: 8, speed: 70, sight: 170, scrap: 5, element: 'data', gravity: 900,
    partChance: 0.06,
  },

  // --- UNCOMMON
  {
    id: 'rustCrawler', name: 'RUST CRAWLER', art: 'rustCrawler', tier: 'uncommon', behavior: 'walker',
    hp: 40, touch: 11, speed: 84, sight: 200, scrap: 9, element: 'kinetic', gravity: 900,
    partChance: 0.1,
  },
  {
    id: 'wireWraith', name: 'WIRE WRAITH', art: 'wireWraith', tier: 'uncommon', behavior: 'flyer',
    hp: 34, touch: 10, speed: 62, sight: 230, scrap: 10, element: 'void', gravity: 0,
    attack: { damage: 8, cooldown: 2.1, range: 170, projectile: 'projVoid', speed: 150, telegraph: 0.5 },
    partChance: 0.12,
  },
  {
    id: 'neonLurker', name: 'NEON LURKER', art: 'neonLurker', tier: 'uncommon', behavior: 'hopper',
    hp: 38, touch: 11, speed: 88, sight: 210, scrap: 10, element: 'void', gravity: 900,
    partChance: 0.11,
  },
  {
    id: 'batterbot', name: 'BATTERBOT', art: 'batterbot', tier: 'uncommon', behavior: 'charger',
    hp: 46, touch: 12, speed: 66, sight: 200, scrap: 11, element: 'shock', gravity: 900,
    attack: { damage: 12, cooldown: 2.2, range: 110, telegraph: 0.55 },
    partChance: 0.12,
  },

  // --- ELITE
  {
    id: 'junkButcher', name: 'JUNK BUTCHER', art: 'junkButcher', tier: 'elite', behavior: 'brute',
    hp: 130, touch: 16, speed: 52, sight: 260, scrap: 34, element: 'kinetic', gravity: 900,
    attack: { damage: 20, cooldown: 2.4, range: 46, telegraph: 0.62 },
    partChance: 0.65,
  },

  // --- BOSS
  {
    id: 'scrapTitan', name: 'SCRAP TITAN', art: 'scrapTitan', tier: 'boss', behavior: 'brute',
    hp: 620, touch: 20, speed: 44, sight: 400, scrap: 180, element: 'fire', gravity: 900,
    attack: {
      damage: 22, cooldown: 2.0, range: 72, projectile: 'projRocket',
      speed: 190, count: 3, spread: 0.42, telegraph: 0.7,
    },
    partChance: 1,
  },
];

export const BY_ID = new Map(ENEMIES.map((e) => [e.id, e]));

export function enemiesOfTier(tier: Tier): EnemyDef[] {
  return ENEMIES.filter((e) => e.tier === tier);
}
