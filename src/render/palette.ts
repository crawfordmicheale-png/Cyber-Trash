/**
 * The CYBER-TRASH palette.
 *
 * The rule from the bible: filthy dark metal as the base, with a handful of
 * extremely bright neons on top. Contrast is the whole identity, so the darks
 * stay genuinely dark and the neons stay genuinely blown out — nothing lives in
 * the comfortable middle.
 */

export const PAL: Record<string, string> = {
  // Structure / grime
  void: '#05050a',
  black: '#0b0b12',
  metalDark: '#1d1c26',
  metal: '#2e2c3c',
  metalLit: '#454158',
  metalHi: '#5f5a75',
  rust: '#7a4a32',
  rustLit: '#a86a44',
  dirt: '#3a3040',
  bone: '#cfc7c0',
  white: '#ffffff',

  // Neons
  cyan: '#00f0ff',
  cyanDim: '#0a8fa8',
  magenta: '#ff2d95',
  magentaDim: '#a01a5e',
  lime: '#b6ff2e',
  limeDim: '#6d9c18',
  violet: '#a855ff',
  violetDim: '#6a2fb0',
  orange: '#ff8a1e',
  orangeDim: '#a85410',
  yellow: '#ffe74c',
  toxic: '#7dff3d',
  blood: '#ff3355',
};

export type PaletteKey = keyof typeof PAL;

/** Damage/energy types. Everything visual keys off these. */
export type Element = 'kinetic' | 'shock' | 'toxic' | 'plasma' | 'void' | 'data' | 'fire';

export interface ElementStyle {
  core: string;
  glow: string;
  dark: string;
  /** Death effect used when this element lands the killing blow. */
  death: 'scrap' | 'burst' | 'sludge' | 'glitch' | 'implode' | 'shatter' | 'ash';
  label: string;
}

export const ELEMENTS: Record<Element, ElementStyle> = {
  kinetic: { core: PAL.white, glow: PAL.magenta, dark: PAL.magentaDim, death: 'scrap', label: 'KINETIC' },
  shock: { core: '#dffcff', glow: PAL.cyan, dark: PAL.cyanDim, death: 'burst', label: 'SHOCK' },
  toxic: { core: '#eaffc8', glow: PAL.toxic, dark: PAL.limeDim, death: 'sludge', label: 'TOXIC' },
  plasma: { core: '#ffe4f5', glow: PAL.magenta, dark: PAL.magentaDim, death: 'burst', label: 'PLASMA' },
  void: { core: '#e8d8ff', glow: PAL.violet, dark: PAL.violetDim, death: 'implode', label: 'VOID' },
  data: { core: '#d9ffff', glow: PAL.cyan, dark: PAL.violetDim, death: 'glitch', label: 'DATA' },
  fire: { core: '#fff0c0', glow: PAL.orange, dark: PAL.orangeDim, death: 'ash', label: 'THERMAL' },
};

/** Rarity colouring for parts and drops. */
export const RARITY = {
  junk: { color: PAL.metalHi, label: 'JUNK' },
  common: { color: PAL.cyan, label: 'COMMON' },
  rare: { color: PAL.lime, label: 'RARE' },
  exotic: { color: PAL.magenta, label: 'EXOTIC' },
  cursed: { color: PAL.violet, label: 'UNSTABLE' },
} as const;

export type Rarity = keyof typeof RARITY;

/** Parse '#rrggbb' into components once, for tinting maths. */
export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Blend two hex colours. t=0 -> a, t=1 -> b. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}
