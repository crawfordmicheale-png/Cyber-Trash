import { compile, type Sprite, type SpriteDef } from '../render/sprite';
import { PAL } from '../render/palette';

/**
 * Playable characters.
 *
 * One sprite per character, full stop. Everything the character "does" is
 * transform + VFX, so this file stays this short no matter how many weapons,
 * abilities or elements get added later.
 *
 * Rows are ~17–19 wide, ~30 tall, pivot at the feet. Authored to match the
 * cyber-trash character lineup sheet (Neon Drifter / Junk Reaper).
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
// 01 — NEON DRIFTER. Spiked white hair, cyan X-visor, magenta scarf & coat
// lining, chunky boots with cyan/magenta soles. Matches lineup sheet #01.
// ---------------------------------------------------------------------------
const DRIFTER_DEF: SpriteDef = {
  pal: {
    ...SKIN,
    h: '#9a95aa',
    H: '#ffffff',
    X: PAL.cyan,
    s: PAL.magenta,
    p: '#ff6eb5',
    c: PAL.cyan,
    i: '#ff2d95', // coat lining
  },
  glow: 'Xpcsi',
  blur: 2,
  glowStrength: 0.9,
  rows: [
    '     h h h h     ',
    '    hHhHhHhHh    ',
    '   hHHHHHHHHHh   ',
    '   kHHHHHHHHHk   ',
    '   kmMMMMMMMMk   ',
    '   kmXMmmXMmk   ',
    '   kmXMmmXMmk   ',
    '   kmmMMMMMmk   ',
    '    kmmmmmMk     ',
    '    ssssssss     ',
    '   kssssssssk    ',
    '  kdiiiiiiiidk   ',
    ' kddjjjjjjjjddk  ',
    ' kdljjwwwjjjldk  ',
    ' kdljkwpwkwjldk  ',
    ' kdljjwwwjjjldk  ',
    ' kdljjjwjjjjldk  ',
    ' kddjjjjjjjjddk  ',
    '  kdjjjjjjjjdk   ',
    '  kkdjjjjjjdkk   ',
    '   kggggggggk    ',
    '   kgcgggcggk    ',
    '   kggggggggk    ',
    '   kgg.kk.ggk    ',
    '   kgk....kgk    ',
    '   kgk....kgk    ',
    '   kgk....kgk    ',
    '  kbbkc..pkbbk   ',
    ' kbbbkk..kkbbbk  ',
    ' kkkkkk..kkkkkk  ',
  ],
};

/** Floating companion drone — the X-eyed orb from the Drifter sheet. */
export const DRIFTER_DRONE: SpriteDef = {
  pal: {
    k: '#05050a',
    m: '#1a1824',
    M: '#2e2b3a',
    X: PAL.cyan,
    c: PAL.cyan,
  },
  glow: 'Xc',
  blur: 2,
  glowStrength: 1.1,
  rows: [
    '..kkk..',
    '.kMMMk.',
    'kMXXkMk',
    'kMXkXMk',
    'kMXXkMk',
    '.kMMMk.',
    '..kkk..',
  ],
};

// ---------------------------------------------------------------------------
// 02 — JUNK REAPER. Tattered hood, yellow gas-mask eyes, toxin tubes,
// circular hazard mark. Matches lineup sheet #02.
// ---------------------------------------------------------------------------
const REAPER_DEF: SpriteDef = {
  pal: {
    ...SKIN,
    d: '#2b2735',
    j: '#3c3749',
    l: '#544d64',
    r: '#4a3628', // rope / leather
    Y: PAL.yellow,
    o: '#8a7a4a', // bone / mask
    c: PAL.lime,
    t: '#ffe74c', // tube
  },
  glow: 'Yct',
  blur: 2,
  glowStrength: 0.95,
  rows: [
    '     ddddddd     ',
    '   ddddddddddd   ',
    '  dddjjjjjjjddd  ',
    '  ddjkkkkkkkjdd  ',
    '  ddjkoookoojdd  ',
    '  ddkkYkkYkkdd   ',
    '  ddkkkkkkkkdd   ',
    '  ddjkoookojdd   ',
    '  dddjjjjjjddd   ',
    '  ddddddddddd    ',
    ' ddddjjYjjdddd   ',
    ' dddjjjjjjjjddd  ',
    'ddddjjjjjjjjdddd ',
    'dddjjjrrrjjjjddd ',
    'dddjjjrYrjjjjddd ',
    'dddjttrrrttjjddd ',
    'ddddjjjjjjjjdddd ',
    ' dddjjjjjjjjddd  ',
    ' dddjjjjjjjjddd  ',
    ' ddjjjjjjjjjjdd  ',
    '  ddjjjjjjjjdd   ',
    '  ddjjtjjtjjdd   ',
    '  dddjjjjjjddd   ',
    '  dd.ddddd.ddd   ',
    '   ddd...dddd    ',
    '   kgk...kgk     ',
    '   kgk...kgk     ',
    '  kbbk...kbbk    ',
    ' kbbbk...kbbbk   ',
    ' kkkkk...kkkkk   ',
  ],
};

export interface CharacterArt {
  id: string;
  name: string;
  tagline: string;
  sprite: Sprite;
  /** Optional orbiting companion drawn beside the character. */
  drone?: Sprite;
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
let droneCache: Sprite | null = null;

export function drifterDrone(): Sprite {
  if (!droneCache) droneCache = compile(DRIFTER_DRONE);
  return droneCache;
}

export function characters(): CharacterArt[] {
  if (cache) return cache;
  cache = [
    {
      id: 'drifter',
      name: 'NEON DRIFTER',
      tagline: 'THREW THEMSELF IN. NOBODY KNOWS WHY.',
      sprite: compile(DRIFTER_DEF),
      drone: compile(DRIFTER_DRONE),
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
