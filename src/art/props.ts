import { compile, type Sprite, type SpriteDef } from '../render/sprite';
import { PAL } from '../render/palette';

/**
 * Layer 01 — THE SCRAP environment art.
 *
 * Terrain tiles have no left/right outline so they tile seamlessly; the outline
 * only appears on exposed faces, drawn by the level renderer.
 */

export const TILE = 16;

const T = {
  k: '#07070c',
  m: '#1b1826',
  M: '#332f42',
  L: '#4d4860',
  H: '#6b6484',
  r: '#7a4c36',
  R: '#a06d45',
  w: '#8f8798',
  b: '#c8c2bb',
};

const NEON = {
  C: PAL.cyan,
  P: PAL.magenta,
  G: PAL.toxic,
  V: PAL.violet,
  O: PAL.orange,
  Y: PAL.yellow,
};

function pdef(rows: string[], opts: Partial<SpriteDef> = {}): SpriteDef {
  return { pal: { ...T, ...NEON }, glow: 'CPGVOY', blur: 2, rows, ...opts };
}

// ---------------------------------------------------------------------------
// TERRAIN
// ---------------------------------------------------------------------------

const TILE_TOP = pdef([
  'HHHHHHHHHHHHHHHH',
  'LLLLLLLLLLLLLLLL',
  'MMkMMMMkMMMMkMMM',
  'MMkMMMMkMMMMkMMM',
  'MMMMMMMMMMMMMMMM',
  'MMrrMMMMMMMrrMMM',
  'MMrrMMMMMMMrrMMM',
  'MMMMMMMMMMMMMMMM',
  'MkMMMMkMMMMkMMMM',
  'MkMMMMkMMMMkMMMM',
  'MMMMMMMMMMMMMMMM',
  'mMMMMMMMMMMMMMMm',
  'mmMMMMMMMMMMMMmm',
  'mmMMMMMMMMMMMMmm',
  'mmmMMMMMMMMMMmmm',
  'mmmmmmmmmmmmmmmm',
], { ox: 0, oy: 0 });

const TILE_MID = pdef([
  'mmmmmmmmmmmmmmmm',
  'mMMMMMMMMMMMMMMm',
  'mMMMMMMMMMMMMMMm',
  'mMMrrrMMMMMMMMMm',
  'mMMrrrMMMMMMMMMm',
  'mMMMMMMMMMMMMMMm',
  'mMMMMMMMMMMMMMMm',
  'mMMMMMMMrrrMMMMm',
  'mMMMMMMMrrrMMMMm',
  'mMMMMMMMMMMMMMMm',
  'mMMMMMMMMMMMMMMm',
  'mmMMMMMMMMMMMMmm',
  'mmMMMMMMMMMMMMmm',
  'mMMMMMMMMMMMMMMm',
  'mMMMMMMMMMMMMMMm',
  'mmmmmmmmmmmmmmmm',
], { ox: 0, oy: 0 });

/** One-way platform: thin grated catwalk. */
const TILE_PLATFORM = pdef([
  'HHHHHHHHHHHHHHHH',
  'LLLLLLLLLLLLLLLL',
  'MkMMkMMkMMkMMkMM',
  'MkMMkMMkMMkMMkMM',
  'kkkkkkkkkkkkkkkk',
  '.k...k....k...k.',
], { ox: 0, oy: 0 });

const TILE_LADDER = pdef([
  '..kLLk....kLLk..',
  '..kLLk....kLLk..',
  '..kLLkkkkkkLLk..',
  '..kLLLLLLLLLLk..',
  '..kLLkkkkkkLLk..',
  '..kLLk....kLLk..',
  '..kLLk....kLLk..',
  '..kLLk....kLLk..',
  '..kLLkkkkkkLLk..',
  '..kLLLLLLLLLLk..',
  '..kLLkkkkkkLLk..',
  '..kLLk....kLLk..',
  '..kLLk....kLLk..',
  '..kLLk....kLLk..',
  '..kLLk....kLLk..',
  '..kLLk....kLLk..',
], { ox: 0, oy: 0 });

// ---------------------------------------------------------------------------
// HAZARDS
// ---------------------------------------------------------------------------

const SPIKES = pdef([
  '..P...P...P...P.',
  '.PPP.PPP.PPP.PPP',
  '.PPP.PPP.PPP.PPP',
  'kPPPkPPPkPPPkPPP',
  'kkkkkkkkkkkkkkkk',
  'mMMMMMMMMMMMMMMm',
], { ox: 0, oy: 0 });

const SLUDGE = pdef([
  '.GG...GG....GG..',
  'GGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGGGG',
  'sGGsGGGsGGGsGGGs',
  'ssssssssssssssss',
], { pal: { ...T, ...NEON, s: '#2f4a12' }, glow: 'G', ox: 0, oy: 0 });

const BARREL = pdef([
  '..kkkkkkkk..',
  '.kMMMMMMMMk.',
  'kMLLLLLLLLMk',
  'kMMMMMMMMMMk',
  'kMGGGGGGGGMk',
  'kMGkGGGGkGMk',
  'kMGGkkkkGGMk',
  'kMGGGGGGGGMk',
  'kMMMMMMMMMMk',
  'kMLLLLLLLLMk',
  'kMMMMMMMMMMk',
  'kMMrrMMrrMMk',
  'kMMMMMMMMMMk',
  '.kMMMMMMMMk.',
  '..kkkkkkkk..',
], { ox: 6, oy: 15 });

// ---------------------------------------------------------------------------
// PROPS / SET DRESSING
// ---------------------------------------------------------------------------

const JUNK_PILE = pdef([
  '.........kkkk.........',
  '......kkkMMMMkkk......',
  '...kkkMMMCMMMMMMkk....',
  '..kMMMMMMMMMMMMMMk....',
  '.kMMkkMMMMkkMMMMMMkk..',
  'kMMMMMMkMMMMMMkMMMMMk.',
  'kMrrMMMMMMPMMMMMMrrMMk',
  'kMMMMkkMMMMMMkkMMMMMMk',
  'kMMMMMMMMMMMMMMMMMMMMk',
  'kMkMMMMkMMMMkMMMMkMMMk',
  'kMMMMMMMMMMMMMMMMMMMMk',
  'kkkkkkkkkkkkkkkkkkkkkk',
], { ox: 11, oy: 12 });

const CRATE = pdef([
  'kkkkkkkkkkkkkk',
  'kMLLLLLLLLLLMk',
  'kLMMMMMMMMMMLk',
  'kLMkMMMMMMkMLk',
  'kLMMkMMMMkMMLk',
  'kLMMMkPPkMMMLk',
  'kLMMMkPPkMMMLk',
  'kLMMkMMMMkMMLk',
  'kLMkMMMMMMkMLk',
  'kLMMMMMMMMMMLk',
  'kMLLLLLLLLLLMk',
  'kkkkkkkkkkkkkk',
], { ox: 7, oy: 12 });

const VENDING = pdef([
  'kkkkkkkkkkkkkkkk',
  'kPPPPPPPPPPPPPPk',
  'kPkkkkkkkkkkkkPk',
  'kPkCCCCCCCCCCkPk',
  'kPkCMMMMMMMMCkPk',
  'kPkCMbMbMbMMCkPk',
  'kPkCMMMMMMMMCkPk',
  'kPkCMbMbMbMMCkPk',
  'kPkCMMMMMMMMCkPk',
  'kPkCCCCCCCCCCkPk',
  'kPkkkkkkkkkkkkPk',
  'kPPPPPPPPPPPPPPk',
  'kMMMMMMMMMMMMMMk',
  'kMkkkkkkkkkkkkMk',
  'kMkMMMMMMMMMMkMk',
  'kMkMMMMMMMMMMkMk',
  'kMkkkkkkkkkkkkMk',
  'kMMMMMMMMMMMMMMk',
  'kMMMMMMMMMMMMMMk',
  'kkkkkkkkkkkkkkkk',
  '.P............P.',
  '.P............P.',
], { ox: 8, oy: 22 });

const TERMINAL = pdef([
  'kkkkkkkkkkkk',
  'kMMMMMMMMMMk',
  'kMCCCCCCCCMk',
  'kMCkCkCkCCMk',
  'kMCCCCCCCCMk',
  'kMCkkCkkCCMk',
  'kMCCCCCCCCMk',
  'kMMMMMMMMMMk',
  'kMMkMMMMkMMk',
  'kMMMMMMMMMMk',
  'kkkkkkkkkkkk',
  '..kMk..kMk..',
  '..kMk..kMk..',
  '..kkk..kkk..',
], { ox: 6, oy: 14 });

const FAN = pdef([
  '..kkkkkkkkkk..',
  '.kMMMMMMMMMMk.',
  'kMMkkkkkkkkMMk',
  'kMkLLkkkkLLkMk',
  'kMkkLLkkLLkkMk',
  'kMkkkLLLLkkkMk',
  'kMkkkLCCLkkkMk',
  'kMkkkLLLLkkkMk',
  'kMkkLLkkLLkkMk',
  'kMkLLkkkkLLkMk',
  'kMMkkkkkkkkMMk',
  '.kMMMMMMMMMMk.',
  '..kkkkkkkkkk..',
], { ox: 7, oy: 13 });

/**
 * Billboard. Deliberately blank: the lettering is drawn on top with the pixel
 * font at render time, which stays legible at any size and lets one board carry
 * any slogan the level wants.
 */
const SIGN_BOARD = pdef([
  'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
  'kLLLLLLLLLLLLLLLLLLLLLLLLLLLLk',
  'kLMMMMMMMMMMMMMMMMMMMMMMMMMMLk',
  'kLMMMMMMMMMMMMMMMMMMMMMMMMMMLk',
  'kLMMMMMMMMMMMMMMMMMMMMMMMMMMLk',
  'kLMMMMMMMMMMMMMMMMMMMMMMMMMMLk',
  'kLMMMMMMMMMMMMMMMMMMMMMMMMMMLk',
  'kLMMMMMMMMMMMMMMMMMMMMMMMMMMLk',
  'kLMMMMMMMMMMMMMMMMMMMMMMMMMMLk',
  'kLLLLLLLLLLLLLLLLLLLLLLLLLLLLk',
  'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
  '.....kMk..............kMk.....',
  '.....kMk..............kMk.....',
  '.....kkk..............kkk.....',
], { ox: 15, oy: 14 });

const GRAFFITI_SKULL = pdef([
  '..PPPPPP..',
  '.PPPPPPPP.',
  'PPPPPPPPPP',
  'PPkPPPPkPP',
  'PPkPPPPkPP',
  'PPPPPPPPPP',
  '.PPPPPPPP.',
  '..PPkkPP..',
  '...P..P...',
], { ox: 5, oy: 9, glowStrength: 0.8 });

const CHAIN = pdef([
  '.kLk.',
  'kLLLk',
  '.kLk.',
  '..k..',
  '.kLk.',
  'kLLLk',
  '.kLk.',
  '..k..',
], { ox: 2, oy: 0 });

/** The layer exit: a freight elevator cage that hauls you up a layer. */
const EXIT_GATE = pdef([
  'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
  'kMMMMMMMMMMMMMMMMMMMMMMMMMMMMk',
  'kMCCCCCCCCCCCCCCCCCCCCCCCCCCMk',
  'kMCkkkkkkkkkkkkkkkkkkkkkkkkCMk',
  'kMCkMMMMMMMMMMMMMMMMMMMMMMkCMk',
  'kMCkMkkkkkkkkkkkkkkkkkkkkMkCMk',
  'kMCkMk....................kMkCMk',
  'kMCkMk....................kMkCMk',
  'kMCkMk....................kMkCMk',
  'kMCkMk....................kMkCMk',
  'kMCkMk....................kMkCMk',
  'kMCkMk....................kMkCMk',
  'kMCkMk....................kMkCMk',
  'kMCkMk....................kMkCMk',
  'kMCkMk....................kMkCMk',
  'kMCkMk....................kMkCMk',
  'kMCkMkkkkkkkkkkkkkkkkkkkkMkCMk',
  'kMCkMMMMMMMMMMMMMMMMMMMMMMkCMk',
  'kMCkkkkkkkkkkkkkkkkkkkkkkkkCMk',
  'kMCCCCCCCCCCCCCCCCCCCCCCCCCCMk',
  'kMMMMMMMMMMMMMMMMMMMMMMMMMMMMk',
  'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
], { ox: 15, oy: 22 });

/** Workbench: where the backpack gets dumped out. */
const WORKBENCH = pdef([
  '..kkkkkkkkkkkkkkkkkkkkkk..',
  '.kMMMMMMMMMMMMMMMMMMMMMMk.',
  'kMLLLLLLLLLLLLLLLLLLLLLLMk',
  'kMLCkMkMkYkMkPkMkGkMkCkLMk',
  'kMLLLLLLLLLLLLLLLLLLLLLLMk',
  'kMMMMMMMMMMMMMMMMMMMMMMMMk',
  'kkkkkkkkkkkkkkkkkkkkkkkkkk',
  '.kMk..............kMk.....',
  '.kMk..............kMk.....',
  '.kMk..............kMk.....',
  '.kMk..............kMk.....',
  '.kkk..............kkk.....',
], { ox: 13, oy: 12 });

// ---------------------------------------------------------------------------
// BACKGROUND SILHOUETTES (parallax)
// ---------------------------------------------------------------------------

const BG_TOWER = pdef([
  '....mmmm....',
  '....mmmm....',
  '...mmmmmm...',
  '...mCmmCm...',
  '...mmmmmm...',
  '..mmmmmmmm..',
  '..mmmmmmmm..',
  '..mCmmmmCm..',
  '..mmmmmmmm..',
  '.mmmmmmmmmm.',
  '.mmmmmmmmmm.',
  '.mmCmmmmCmm.',
  '.mmmmmmmmmm.',
  'mmmmmmmmmmmm',
  'mmmmmmmmmmmm',
  'mmmmmmmmmmmm',
], { glowStrength: 0.5, ox: 6, oy: 16 });

const BG_CRANE = pdef([
  'mmmmmmmmmmmmmmmm',
  'mmmmmmmmmmmmmmmm',
  '.....mm.........',
  '.....mm.........',
  '.....mm.........',
  '....mmmm........',
  '....mmmm........',
  '...mm..mm.......',
  '...mm..mm.......',
  '..mm....mm......',
  '..mm....mm......',
  '.mm......mm.....',
  '.mm......mm.....',
  'mm........mm....',
], { ox: 8, oy: 14 });

const BG_HEAP = pdef([
  '..........mmmm..........',
  '.......mmmmmmmmm........',
  '.....mmmmmmmmmmmmm......',
  '...mmmmmmmmmmmmmmmmm....',
  '..mmmmmmmCmmmmmmmmmmm...',
  '.mmmmmmmmmmmmmmmPmmmmm..',
  'mmmmmmmmmmmmmmmmmmmmmmm.',
  'mmmmmmmmmmmmmmmmmmmmmmmm',
  'mmmmmmmmmmmmmmmmmmmmmmmm',
  'mmmmmmmmmmmmmmmmmmmmmmmm',
], { glowStrength: 0.4, ox: 12, oy: 10 });

// ---------------------------------------------------------------------------

const registry: Record<string, SpriteDef> = {
  tileTop: TILE_TOP,
  tileMid: TILE_MID,
  tilePlatform: TILE_PLATFORM,
  tileLadder: TILE_LADDER,
  spikes: SPIKES,
  sludge: SLUDGE,
  barrel: BARREL,
  junkPile: JUNK_PILE,
  crate: CRATE,
  vending: VENDING,
  terminal: TERMINAL,
  fan: FAN,
  signNoFuture: SIGN_BOARD,
  graffitiSkull: GRAFFITI_SKULL,
  chain: CHAIN,
  exitGate: EXIT_GATE,
  workbench: WORKBENCH,
  bgTower: BG_TOWER,
  bgCrane: BG_CRANE,
  bgHeap: BG_HEAP,
};

const cache = new Map<string, Sprite>();

export function prop(id: string): Sprite {
  const hit = cache.get(id);
  if (hit) return hit;
  const s = compile(registry[id] ?? registry.crate);
  cache.set(id, s);
  return s;
}

/** Decorative props the level generator can scatter on any flat surface. */
export const SCATTER_PROPS = ['junkPile', 'crate', 'barrel', 'terminal', 'fan'] as const;
export const WALL_PROPS = ['graffitiSkull', 'signNoFuture'] as const;
export const BG_PROPS = ['bgTower', 'bgCrane', 'bgHeap'] as const;
