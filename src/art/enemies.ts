import { compile, type Sprite, type SpriteDef } from '../render/sprite';
import { PAL } from '../render/palette';

/**
 * Enemy art.
 *
 * Same production rule as the player: one static sprite each, no frames. The
 * roster can grow to dozens without the art budget moving, because behaviour
 * and death presentation are data, not animation.
 */

const E = {
  k: '#07070c', // outline
  m: '#22202c', // metal dark
  M: '#34313f', // metal mid
  L: '#4a4558', // metal light
  r: '#6d4230', // rust
  R: '#96603c', // rust light
  b: '#a89a86', // bone
  f: '#5e4152', // flesh
  s: '#3f5a1f', // sludge dark
  w: '#8d8798', // wire
};

const NEON = {
  G: PAL.toxic,
  C: PAL.cyan,
  P: PAL.magenta,
  V: PAL.violet,
  Y: PAL.yellow,
  O: PAL.orange,
};

const GLOW_CHARS = 'GCPVYO';

function def(rows: string[], extra: Record<string, string> = {}, opts: Partial<SpriteDef> = {}): SpriteDef {
  return {
    pal: { ...E, ...NEON, ...extra },
    glow: GLOW_CHARS,
    blur: 2,
    glowStrength: 0.95,
    rows,
    ...opts,
  };
}

// ---------------------------------------------------------------------------
// COMMON
// ---------------------------------------------------------------------------

const SCRAP_RAT = def([
  '..........kk........',
  '.........kMMk.......',
  '..kkkkk..kMMk.......',
  '.kMMMMMkkkkkk...kk..',
  '.kMGMMMMMMMMk..kMwk.',
  'kMMMMMMMMMMMMkkMwk..',
  'kbMMMMMMMMMMMMMwk...',
  '.kMMMMMMMMMMMMk.....',
  '.kk.kMk..kMk.kk.....',
  '....kMk..kMk........',
  '....kLk..kLk........',
  '....kkk..kkk........',
]);

const GARBAGE_HOUND = def([
  '.................kk.....',
  '..kk............kMMk....',
  '.kMMk..kkkkkkk..kMMk....',
  '.kMPk.kMMMMMMMkkkMMk....',
  '.kMMkkMMMMMMMMMMMMMk....',
  'kMGMMMMMMMMMMMMMMMk.....',
  'kMMMMMMrrrMMMMMMMk......',
  '.kMMMMMrPrMMMMMMk.......',
  '.kMMkkkrrrkkkMMMk.......',
  '..kMk..kkk..kMMk........',
  '..kMk..kkk..kMk.........',
  '..kLk..kLk..kLk.........',
  '..kkk..kkk..kkk.........',
]);

const DATA_MITE = def([
  '....k....k....',
  '....k....k....',
  '...kCk..kCk...',
  '..kkkkkkkkkk..',
  '.kMMMMMMMMMMk.',
  'kMMPPPPPPPPMMk',
  'kMPCCCCCCCCPMk',
  'kMPCCkkkkCCPMk',
  'kMPCCkPPkCCPMk',
  'kMPCCCCCCCCPMk',
  'kMMPPPPPPPPMMk',
  '.kMMMMMMMMMMk.',
  '..kkPkkkkPkk..',
  '....P....P....',
], {}, { oy: 14 });

const GLITCH_GOBLIN = def([
  '...C.......C...',
  '...kCk...kCk...',
  '...kCk...kCk...',
  '..kkPPkkPPkk...',
  '.kMMMMMMMMMMk..',
  'kMMPMMMMMMPMMk.',
  'kMMkCkMMMkCkMk.',
  'kMMMMMMMMMMMMk.',
  '.kMMMMMMMMMMk..',
  '..kMMMMMMMMk...',
  '..kMPMMMMPMk...',
  '.kMMMMMMMMMMk..',
  'kMMkMMMMMMkMMk.',
  'kMMkMMMMMMkMMk.',
  '.kkkMMMMMMkkk..',
  '....kMMMMk.....',
  '....kMkkMk.....',
  '....kMk.kMk....',
  '....kMk.kMk....',
  '...kLLk.kLLk...',
  '...kkkk.kkkk...',
]);

const TOXIC_SLIME = def([
  '.......GG.......',
  '.....kkGGkk.....',
  '...kksssssskk...',
  '..kssssssssssk..',
  '.ksssGssssGsssk.',
  'ksssGGssssGGsssk',
  'ksssssssssssssssk',
  'ksskkssssskkssssk',
  'ksGkksssskkGsssk',
  '.ksssssssssssk..',
  '..kkssssssskk...',
  '....kGkkkGk.....',
], { s: '#3f5a1f' });

const SPARE_DRONE = def([
  '...C......C...',
  '..kCk....kCk..',
  '.kkkkkkkkkkkk.',
  'kMMMMMMMMMMMMk',
  'kMMkkkkkkkkMMk',
  'kMMkPPPPPPkMMk',
  'kMMkPCCCCPkMMk',
  'kMMkPPPPPPkMMk',
  'kMMkkkkkkkkMMk',
  '.kMMMMMMMMMMk.',
  '..kkMkkkkMkk..',
  '....C....C....',
], {}, { oy: 12 });

// ---------------------------------------------------------------------------
// UNCOMMON
// ---------------------------------------------------------------------------

const RUST_CRAWLER = def([
  '.k..............k.',
  '.kk...kkkkkk...kk.',
  '..kk.kRRRRRRk.kk..',
  '.k.kkRRrGrRRkkk.k.',
  '.k..kRRrrrrRRk..k.',
  '.kk.kRRRRRRRRk.kk.',
  '..k.kkRRRRRRkk.k..',
  '..kk..kkkkkk..kk..',
  '.k.k.k......k.k.k.',
  '.k.k.k......k.k.k.',
  'kk.kk........kk.kk',
  'k...k........k...k',
], {}, { oy: 12 });

const WIRE_WRAITH = def([
  '....kkkkkk....',
  '...kMMMMMMk...',
  '..kMMkkkkMMk..',
  '..kMkVVVVkMk..',
  '..kMkVkkVkMk..',
  '..kMkVVVVkMk..',
  '..kMMkkkkMMk..',
  '.kMMMMMMMMMMk.',
  'kwMMMMMMMMMMwk',
  'kwkMMMMMMMMkwk',
  '.wkMMVVVVMMkw.',
  '.wkMMMMMMMMkw.',
  '.w.kMMMMMMk.w.',
  '.w..kMMMMk..w.',
  '.w..wkMMkw..w.',
  '.w..w.kk.w..w.',
  '....w....w....',
  '....w....w....',
], {}, { oy: 18 });

const BATTERBOT = def([
  '....k....k....',
  '...kYk..kYk...',
  '..kkkkkkkkkk..',
  '.kMMMMMMMMMMk.',
  'kMMkYYYYYYkMMk',
  'kMMkYkkkkYkMMk',
  'kMMkYYYYYYkMMk',
  'kMMMMMMMMMMMMk',
  '.kMMMMMMMMMMk.',
  'kMkMMMMMMMMkMk',
  'kMkkMMMMMMkkMk',
  'kMk.kMMMMk.kMk',
  '.k..kMk.kMk..k',
  '....kMk.kMk...',
  '...kLLk.kLLk..',
  '...kkkk.kkkk..',
]);

// ---------------------------------------------------------------------------
// ELITE
// ---------------------------------------------------------------------------

const JUNK_BUTCHER = def([
  '......kkkkkk......',
  '.....kbbbbbbk.....',
  '....kbbkbbkbbk....',
  '....kbPkbbkPbk....',
  '....kbbbbbbbbk....',
  '.....kbkkkkbk.....',
  '..kkkkkkkkkkkkkk..',
  '.kMMMMMMMMMMMMMMk.',
  'kMMrrMMMMMMMMrrMMk',
  'kMMrPrMMMMMMrPrMMk',
  'kMMrrMMMMMMMMrrMMk',
  'kMMMMMMPPPPMMMMMMk',
  'kMMMMMMPkkPMMMMMMk',
  'kMMMMMMPPPPMMMMMMk',
  '.kMMMMMMMMMMMMMMk.',
  '.kMMMMMMMMMMMMMMk.',
  '..kMMMMMMMMMMMMk..',
  '..kMMMkMMMMkMMMk..',
  '..kMMk.kMMk.kMMk..',
  '..kMMk.kMMk.kMMk..',
  '..kMMk.kMMk.kMMk..',
  '..kMMk.kMMk.kMMk..',
  '.kLLLk.kLLk.kLLLk.',
  '.kkkkk.kkkk.kkkkk.',
]);

// ---------------------------------------------------------------------------
// MINI BOSS — SCRAP TITAN (Layer 01)
// ---------------------------------------------------------------------------

const SCRAP_TITAN = def([
  '..........kkkkkkkkkk..........',
  '........kkMMMMMMMMMMkk........',
  '.......kMMMMMMMMMMMMMMk.......',
  '......kMMkkMMMMMMMMkkMMk......',
  '......kMkOOkMMMMMMkOOkMk......',
  '......kMkOOkMMMMMMkOOkMk......',
  '......kMMkkMMMMMMMMkkMMk......',
  '.....kMMMMMMMkkkkMMMMMMMk.....',
  '....kMMMMMMMkOOOOkMMMMMMMk....',
  '...kkMMMMMMMkOkkOkMMMMMMMkk...',
  '..kMMkMMMMMMkOOOOkMMMMMMkMMk..',
  '.kMMMkMMMMMMMkkkkMMMMMMMkMMMk.',
  'kMMMMkMMMMMMMMMMMMMMMMMMkMMMMk',
  'kMMMMkMMMrrrrrrrrrrMMMMMkMMMMk',
  'kMMMMkMMMrOOOOOOOOrMMMMMkMMMMk',
  'kMMMMkMMMrOkkkkkkOrMMMMMkMMMMk',
  'kMMMMkMMMrOOOOOOOOrMMMMMkMMMMk',
  'kMMMMkMMMrrrrrrrrrrMMMMMkMMMMk',
  '.kMMkkMMMMMMMMMMMMMMMMMMkkMMk.',
  '.kMMk.kMMMMMMMMMMMMMMMMk.kMMk.',
  '..kk..kMMMMMMMMMMMMMMMMk..kk..',
  '......kMMMMkkkkkkkkMMMMk......',
  '......kMMMk......kMMMMk.......',
  '.....kMMMMk......kMMMMk.......',
  '.....kMMMMk......kMMMMk.......',
  '.....kMMMMk......kMMMMk.......',
  '....kLLLLLk......kLLLLLk......',
  '....kkkkkkk......kkkkkkk......',
]);

export interface EnemyArt {
  sprite: Sprite;
  /** Collision box, in pixels, anchored at the sprite's pivot. */
  w: number;
  h: number;
}

const cache = new Map<string, EnemyArt>();

const DEFS: Record<string, { def: SpriteDef; w: number; h: number }> = {
  scrapRat: { def: SCRAP_RAT, w: 14, h: 11 },
  garbageHound: { def: GARBAGE_HOUND, w: 18, h: 12 },
  dataMite: { def: DATA_MITE, w: 12, h: 12 },
  glitchGoblin: { def: GLITCH_GOBLIN, w: 12, h: 20 },
  toxicSlime: { def: TOXIC_SLIME, w: 14, h: 11 },
  spareDrone: { def: SPARE_DRONE, w: 12, h: 10 },
  rustCrawler: { def: RUST_CRAWLER, w: 16, h: 11 },
  wireWraith: { def: WIRE_WRAITH, w: 12, h: 17 },
  batterbot: { def: BATTERBOT, w: 12, h: 15 },
  junkButcher: { def: JUNK_BUTCHER, w: 16, h: 23 },
  scrapTitan: { def: SCRAP_TITAN, w: 28, h: 27 },
};

export function enemyArt(id: string): EnemyArt {
  const hit = cache.get(id);
  if (hit) return hit;
  const entry = DEFS[id] ?? DEFS.scrapRat;
  const art: EnemyArt = { sprite: compile(entry.def), w: entry.w, h: entry.h };
  cache.set(id, art);
  return art;
}

export const ENEMY_ART_IDS = Object.keys(DEFS);
