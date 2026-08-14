import { compile, type Sprite, type SpriteDef } from '../render/sprite';
import { PAL } from '../render/palette';

/**
 * Playable characters.
 *
 * One sprite per character, full stop. Everything the character "does" is
 * transform + VFX, so this file stays this short no matter how many weapons,
 * abilities or elements get added later.
 *
 * Rows are 17 wide, 30 tall, pivot at the feet (centre column 8).
 */

/**
 * Character values sit deliberately above the terrain's: the player must stay
 * readable against a black, cluttered background at 32px tall, so the garment
 * mid-tone is lighter than anything in the environment palette.
 */
const SKIN = {
  k: '#05050a', // outline — darker than the world, so the silhouette bites
  m: '#211f2d', // mask / shadow
  w: '#d8d2cb', // cloth highlight
  d: '#2a2736', // garment dark
  j: '#413c53', // garment mid
  l: '#5d5673', // garment light
  g: '#35313f', // trousers
  b: '#575170', // boots
};

// ---------------------------------------------------------------------------
// 01 — NEON DRIFTER. White spiked hair, X-visor, magenta scarf.
// ---------------------------------------------------------------------------
const DRIFTER_DEF: SpriteDef = {
  pal: {
    ...SKIN,
    h: '#8f8aa0',
    H: '#ffffff',
    X: PAL.cyan,
    s: PAL.magenta,
    p: PAL.magenta,
    c: PAL.cyan,
  },
  glow: 'Xpcs',
  blur: 2,
  glowStrength: 0.85,
  rows: [
    '     h  h  h     ',
    '    hHhhHhhHh    ',
    '    hHHHHHHHh    ',
    '    kHHHHHHHk    ',
    '    kmmmmmmmk    ',
    '    kmXmmmXmk    ',
    '    kmXmmmXmk    ',
    '    kmmmmmmmk    ',
    '     kmmmmmk     ',
    '     sssssss     ',
    '    ksssssssk    ',
    '   kdjjjjjjjdk   ',
    '  kddjjwwwjjddk  ',
    '  kdljkwwwkjldk  ',
    '  kdljkwpwkjldk  ',
    '  kdljkwwwkjldk  ',
    '  kdljjwwwjjldk  ',
    '  kddjjjjjjjddk  ',
    '   kdjjjjjjjdk   ',
    '   kkdjjjjjdkk   ',
    '    kgggggggk    ',
    '    kgcgggcgk    ',
    '    kgggggggk    ',
    '    kgg.k.ggk    ',
    '    kgk...kgk    ',
    '    kgk...kgk    ',
    '    kgk...kgk    ',
    '   kbbk...kbbk   ',
    '  kbbbk...kbbbk  ',
    '  kkkkk...kkkkk  ',
  ],
};

// ---------------------------------------------------------------------------
// 02 — JUNK REAPER. Hooded, tattered, lime-lit skull face.
// ---------------------------------------------------------------------------
const REAPER_DEF: SpriteDef = {
  pal: {
    ...SKIN,
    d: '#2b2735',
    j: '#3c3749',
    l: '#544d64',
    r: '#4a3628', // rope / leather
    Y: PAL.lime,
    o: '#8a7a4a', // bone
    c: PAL.lime,
  },
  glow: 'Yc',
  blur: 2,
  glowStrength: 0.9,
  rows: [
    '     ddddddd     ',
    '    dddddddddd   ',
    '   dddjjjjjddd   ',
    '   ddjkkkkkjdd   ',
    '   ddjkkkkkjdd   ',
    '   ddkkYkYkkdd   ',
    '   ddkkkkkkkdd   ',
    '   ddjkoookjdd   ',
    '   dddjjjjjddd   ',
    '   dddddddddd    ',
    '  ddddjjjjjdddd  ',
    '  dddjjjjjjjddd  ',
    ' ddddjjjjjjjdddd ',
    ' dddjjjrrrjjjddd ',
    ' dddjjjrYrjjjddd ',
    ' dddjjjrrrjjjddd ',
    ' ddddjjjjjjjdddd ',
    '  dddjjjjjjjddd  ',
    '  dddjjjjjjjddd  ',
    '  ddjjjjjjjjjdd  ',
    '   ddjjjjjjjdd   ',
    '   ddjjjjjjjdd   ',
    '   dddjjjjjddd   ',
    '   dd.dddd.ddd   ',
    '    ddd..dddd    ',
    '    kgk...kgk    ',
    '    kgk...kgk    ',
    '   kbbk...kbbk   ',
    '  kbbbk...kbbbk  ',
    '  kkkkk...kkkkk  ',
  ],
};

export interface CharacterArt {
  id: string;
  name: string;
  tagline: string;
  sprite: Sprite;
  /** Trail / dash colour and general UI accent for this character. */
  accent: string;
  /** Gameplay tuning knobs the character brings with it. */
  stats: {
    maxHp: number;
    speed: number;
    jumpPower: number;
    dashes: number;
  };
  /** Unlocked by spending scrap in the settlement; index 0 is free. */
  unlockCost: number;
}

let cache: CharacterArt[] | null = null;

export function characters(): CharacterArt[] {
  if (cache) return cache;
  cache = [
    {
      id: 'drifter',
      name: 'NEON DRIFTER',
      tagline: 'THREW THEMSELF IN. NOBODY KNOWS WHY.',
      sprite: compile(DRIFTER_DEF),
      accent: PAL.magenta,
      stats: { maxHp: 100, speed: 1, jumpPower: 1, dashes: 1 },
      unlockCost: 0,
    },
    {
      id: 'reaper',
      name: 'JUNK REAPER',
      tagline: 'COLLECTS WHAT THE STACK IS DONE WITH.',
      sprite: compile(REAPER_DEF),
      accent: PAL.lime,
      stats: { maxHp: 80, speed: 1.08, jumpPower: 1.05, dashes: 2 },
      unlockCost: 400,
    },
  ];
  return cache;
}

/** Tiny 7x7 marker used by the HUD and the layer map. */
export const PLAYER_PIP: SpriteDef = {
  pal: { k: PAL.black, c: PAL.cyan, w: PAL.white },
  glow: 'c',
  blur: 1,
  rows: [
    '..ccc..',
    '.ccccc.',
    'cc.w.cc',
    'ccwwwcc',
    'cc.w.cc',
    '.ccccc.',
    '..ccc..',
  ],
};
