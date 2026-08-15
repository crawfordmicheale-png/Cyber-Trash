import { compile, type Sprite, type SpriteDef } from '../render/sprite';
import { PAL } from '../render/palette';

/**
 * Weapon art.
 *
 * Weapons are separate objects bolted onto the character, never baked into a
 * character frame. That separation is what makes "hundreds of weapons on one
 * sprite" work: a weapon is a base silhouette + a core attachment + a mod
 * attachment, composited at draw time.
 *
 * All bases point RIGHT. The pivot sits on the grip.
 */

const W = {
  k: '#07070c',
  m: '#22202c',
  M: '#34313f',
  L: '#4f4a60',
  H: '#6f6982',
  r: '#6d4230',
  R: '#96603c',
  t: '#191822', // tape / grip wrap
  g: '#12111a',
  w: '#c8c2bb',
};

const NEON = {
  C: PAL.cyan,
  P: PAL.magenta,
  G: PAL.toxic,
  V: PAL.violet,
  O: PAL.orange,
  Y: PAL.yellow,
};

function wdef(rows: string[], ox: number, oy: number, extra: Record<string, string> = {}): SpriteDef {
  return {
    pal: { ...W, ...NEON, ...extra },
    glow: 'CPGVOY',
    blur: 2,
    glowStrength: 1,
    rows,
    ox,
    oy,
  };
}

// ---------------------------------------------------------------------------
// MELEE BASES
// ---------------------------------------------------------------------------

const PIPE = wdef([
  '..kkkkkkkkkkkkkkkkkkk',
  '.ktttkLLLLLPLLLLLLLLk',
  'kMtttMMMMMMMMMMMMrrMk',
  'kMtttMMMMMMMMMMMMrrMk',
  '.ktttkMMMMMMMMMMMMMMk',
  '..kkkkkkkkkkkkkkkkkkk',
], 3, 3);

const CLEAVER = wdef([
  '.....kkkkkkkkkkkkkk.',
  '....kLLLLPLLLLLLLLLk',
  '...kHLLLLPkLLLLLLLLk',
  'kkkkMMMMMMMMMMMMMMMk',
  'kttkMMMMMMPkMMMMMMMk',
  'kkkkkMMMMMMMMMMMMMMk',
  '.....kkkkkkkkkkkkkk.',
], 2, 4);

const SCRAP_SWORD = wdef([
  '.......kkkkkkkkkkkkkkkk',
  '......kHHHHVHHHHHHHHHHk',
  'kkkkkkMLLLLLLLLLLLLLLk.',
  'kttkkkMMMMMMMMMMMMMMk..',
  'kkkkkkMLLLLLLLLLLLLk...',
  '......kHHHHHHHHHHHk....',
  '.......kkkkkkkkkkk.....',
], 2, 3);

const CROWBAR = wdef([
  '................kkkk.',
  '...............kMMCCk',
  'kkkkkkkkkkkkkkkMMMCk.',
  'kttttMMMMMMMMMMMMkk..',
  'kkkkkkkkkkkkkkkMMMk..',
  '..............kMMk...',
  '..............kkk....',
], 2, 3);

const CHAINSAW = wdef([
  '.....kkkkkkkkkkkkkkkkk',
  '....kMHkHkPkHkHkHkHkMk',
  '.kkkMMMMMMMMMMMMMMMMMk',
  'kttMMMMMMMMMMMMMMMMMMk',
  'kttMMMMMMMPMMMMMMMMMMk',
  '.kkkMMMMMMMMMMMMMMMMMk',
  '....kMHkHkHkHkHkHkHkMk',
  '.....kkkkkkkkkkkkkkkkk',
], 2, 4);

const DRILL = wdef([
  '.....kkkkkkk.........',
  '..kkkMMMMMMMkkk......',
  'kttkMMMMMMMMMMMkk....',
  'kttkMMMMMMMMMMMMMkk..',
  'kttkMMMMMMMMMMMkk....',
  '..kkkMMMMMMMkkk......',
  '.....kkkkkkk.........',
], 2, 3);

// ---------------------------------------------------------------------------
// RANGED BASES
// ---------------------------------------------------------------------------

const PISTOL = wdef([
  '....kkkkkkkkkk.',
  '...kMMMMMCMMMMk',
  '..kMMMMMMMMMMMk',
  'kkMMMMMMkkkkkk.',
  'kttMMMMk.......',
  'kttMMMk........',
  'ktttMk.........',
  '.kkkk..........',
], 2, 4);

const NAILGUN = wdef([
  '......kkkkk........',
  '.....kMMMMMkkkkkkk.',
  '....kMMMMMGMMMMMMMk',
  'kkkkMMMMMMMMMMMMMMk',
  'kttMMMMMMMMkkkkkkk.',
  'kttMMMMMMMk........',
  'kttMMMMk...........',
  '.kkkkkk............',
], 2, 4);

const SHOTGUN = wdef([
  '.....kkkkkkkkkkkkkkkk',
  '....kMMMMMOOOOOMMMMMk',
  '...kMMMMMMMMMMMMMMMMk',
  'kkkMMMMMMMkkkkkkkkkk.',
  'kttMMMMMMMk..........',
  'kttMMMMMk............',
  'kttMMMk..............',
  '.kkkkk...............',
], 2, 4);

const JUNK_CANNON = wdef([
  '.......kkkkkkkkkkkkkkk',
  '.....kkMMMMMYMMMMMMMMk',
  '....kMMMMMMMMMMMMMMMMk',
  '..kkMMMMMMMGMMMMMMMMMk',
  'kkkMMMMMMMMMMMMMMMMMMk',
  'kttMMMMMMMMMMMMMMMMMMk',
  'kttMMMMMkkkkkkkkkkkkk.',
  'kttMMMMk.............',
  '.kkkkkk..............',
], 2, 5);

const BEAM_ROD = wdef([
  '..............kkkkk..',
  '.............kCCCCCk.',
  '..kkkkkkkkkkkMCCCCCMk',
  'kttttMMMMMMMMMCCCCCMk',
  '..kkkkkkkkkkkMCCCCCMk',
  '.............kCCCCCk.',
  '..............kkkkk..',
], 2, 3);

// ---------------------------------------------------------------------------
// ATTACHMENTS — snapped onto the base at its mount points.
// ---------------------------------------------------------------------------

const ATTACH_BATTERY = wdef([
  '.kkkk.',
  'kCCCCk',
  'kCkkCk',
  'kCCCCk',
  'kMMMMk',
  '.kkkk.',
], 3, 3);

const ATTACH_CANISTER = wdef([
  '.kkkk.',
  'kMMMMk',
  'kGGGGk',
  'kGkkGk',
  'kGGGGk',
  '.kkkk.',
], 3, 3);

const ATTACH_PLASMA = wdef([
  '..kk..',
  '.kPPk.',
  'kPPPPk',
  'kPwwPk',
  '.kPPk.',
  '..kk..',
], 3, 3);

const ATTACH_VOID = wdef([
  '.kkkk.',
  'kVVVVk',
  'kVkkVk',
  'kVkkVk',
  'kVVVVk',
  '.kkkk.',
], 3, 3);

const ATTACH_DATA = wdef([
  'kkkkkk',
  'kCMCMCk',
  'kMCMCMk',
  'kCMCMCk',
  'kMCMCMk',
  'kkkkkk',
], 3, 3);

const ATTACH_REACTOR = wdef([
  '.kkkk.',
  'kOOOOk',
  'kOYYOk',
  'kOYYOk',
  'kOOOOk',
  '.kkkk.',
], 3, 3);

const ATTACH_MOTOR = wdef([
  'kkkkk',
  'kMLMk',
  'kLMLk',
  'kMLMk',
  'kkkkk',
], 2, 2);

const ATTACH_CHIP = wdef([
  'kkkkkkk',
  'wMMMMMw',
  'wMCCCMw',
  'wMMMMMw',
  'kkkkkkk',
], 3, 2);

const ATTACH_COIL = wdef([
  '.kkk.',
  'kCkCk',
  'kkCkk',
  'kCkCk',
  '.kkk.',
], 2, 2);

const ATTACH_TANK = wdef([
  '.kkkk.',
  'kMMMMk',
  'kMOOMk',
  'kMMMMk',
  '.kkkk.',
], 3, 3);

const ATTACH_MAGNET = wdef([
  '.kkkk.',
  'kPPkkk',
  'kPk...',
  'kPk...',
  'kPPkkk',
  '.kkkk.',
], 3, 3);

// ---------------------------------------------------------------------------
// PROJECTILES — all point right, pivot at centre.
// ---------------------------------------------------------------------------

const P_NAIL = wdef(['kkkH', 'kHHH', 'kkkH'], 2, 1);
const P_SLUG = wdef(['.kk.', 'kYYk', 'kYYk', '.kk.'], 2, 2);
const P_PLASMA = wdef([
  '..PP..',
  '.PwwP.',
  'PwwwwP',
  'PwwwwP',
  '.PwwP.',
  '..PP..',
], 3, 3);
const P_SHOCK = wdef([
  '..C...C..',
  '.CCC.CCC.',
  'CCwwwwwCC',
  '.CCC.CCC.',
  '..C...C..',
], 4, 2);
const P_TOXIC = wdef([
  '.GG.',
  'GGGG',
  'GGGG',
  '.GG.',
], 2, 2);
const P_VOID = wdef([
  '.VVV.',
  'VkkkV',
  'VkkkV',
  'VkkkV',
  '.VVV.',
], 2, 2);
const P_SAW = wdef([
  '..kHk..',
  '.kHHHk.',
  'kHHHHHk',
  'HHHkHHH',
  'kHHHHHk',
  '.kHHHk.',
  '..kHk..',
], 3, 3);
const P_GRENADE = wdef([
  '..kk..',
  '.kPPk.',
  'kPwPPk',
  'kPkkPk',
  '.kPPk.',
  '..kk..',
], 3, 3);
const P_ROCKET = wdef([
  '.....kkkk..',
  'kOOkMMMMMMk',
  'kOOkMPPPPMMk',
  'kOOkMMMMMMk',
  '.....kkkk..',
], 5, 2);
const P_TOXIC_CAN = wdef([
  '.kkkk.',
  'kGGGGk',
  'kGkkGk',
  'kGkkGk',
  'kGGGGk',
  '.kkkk.',
], 3, 3);

// ---------------------------------------------------------------------------

const registry: Record<string, SpriteDef> = {
  pipe: PIPE,
  cleaver: CLEAVER,
  scrapSword: SCRAP_SWORD,
  crowbar: CROWBAR,
  chainsaw: CHAINSAW,
  drill: DRILL,
  pistol: PISTOL,
  nailgun: NAILGUN,
  shotgun: SHOTGUN,
  junkCannon: JUNK_CANNON,
  beamRod: BEAM_ROD,

  attachBattery: ATTACH_BATTERY,
  attachCanister: ATTACH_CANISTER,
  attachPlasma: ATTACH_PLASMA,
  attachVoid: ATTACH_VOID,
  attachData: ATTACH_DATA,
  attachReactor: ATTACH_REACTOR,
  attachMotor: ATTACH_MOTOR,
  attachChip: ATTACH_CHIP,
  attachCoil: ATTACH_COIL,
  attachTank: ATTACH_TANK,
  attachMagnet: ATTACH_MAGNET,

  projNail: P_NAIL,
  projSlug: P_SLUG,
  projPlasma: P_PLASMA,
  projShock: P_SHOCK,
  projToxic: P_TOXIC,
  projVoid: P_VOID,
  projSaw: P_SAW,
  projGrenade: P_GRENADE,
  projRocket: P_ROCKET,
  projToxicCan: P_TOXIC_CAN,
};

const cache = new Map<string, Sprite>();

export function weaponSprite(id: string): Sprite {
  const hit = cache.get(id);
  if (hit) return hit;
  const d = registry[id] ?? registry.pipe;
  const s = compile(d);
  cache.set(id, s);
  return s;
}

/**
 * Recoloured copy of a base, so an element visibly changes the weapon rather
 * than only changing its numbers. `L`/`H` (the bright metal) becomes the
 * element colour and starts glowing.
 */
export function tintedWeapon(id: string, elementColor: string, coreColor: string): Sprite {
  const key = `${id}|${elementColor}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const base = registry[id] ?? registry.pipe;
  const s = compile({
    ...base,
    pal: { ...base.pal, H: coreColor, L: elementColor },
    glow: (base.glow ?? '') + 'HL',
    glowStrength: 0.8,
  });
  cache.set(key, s);
  return s;
}
