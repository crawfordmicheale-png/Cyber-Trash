/**
 * 5x7 pixel font, authored inline so the game ships with zero font assets.
 *
 * Glyphs compile once into a white atlas; coloured text is drawn from a tinted
 * copy of that atlas, cached per colour (the UI only ever uses a handful).
 */

const GW = 5;
const GH = 7;

/* eslint-disable */
const GLYPHS: Record<string, string> = {
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.####/#..../#..../#..../#..../#..../.####',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####',
  F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#..##/#...#/#...#/.###.',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '.###./..#../..#../..#../..#../..#../.###.',
  J: '..###/...#./...#./...#./...#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#...#/#...#/#...#/#...#',
  N: '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#...#/#.#.#/##.##/#...#',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '#####/....#/...#./..#../.#.../#..../#####',
  '0': '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
  '1': '..#../.##../..#../..#../..#../..#../.###.',
  '2': '.###./#...#/....#/...#./..#../.#.../#####',
  '3': '####./....#/....#/.###./....#/....#/####.',
  '4': '...#./..##./.#.#./#..#./#####/...#./...#.',
  '5': '#####/#..../####./....#/....#/#...#/.###.',
  '6': '..##./.#.../#..../####./#...#/#...#/.###.',
  '7': '#####/....#/...#./..#../.#.../.#.../.#...',
  '8': '.###./#...#/#...#/.###./#...#/#...#/.###.',
  '9': '.###./#...#/#...#/.####/....#/...#./.##..',
  '.': '...../...../...../...../...../.##../.##..',
  ',': '...../...../...../...../.##../.##../.#...',
  '!': '..#../..#../..#../..#../..#../...../..#..',
  '?': '.###./#...#/....#/...#./..#../...../..#..',
  ':': '...../.##../.##../...../.##../.##../.....',
  ';': '...../.##../.##../...../.##../.##../.#...',
  '-': '...../...../...../#####/...../...../.....',
  '+': '...../..#../..#../#####/..#../..#../.....',
  '/': '....#/....#/...#./..#../.#.../#..../#....',
  '\\': '#..../#..../.#.../..#../...#./....#/....#',
  '%': '##..#/##.#./..#../..#../.#.../#.##./#.##.',
  "'": '..#../..#../...../...../...../...../.....',
  '"': '.#.#./.#.#./...../...../...../...../.....',
  '(': '...#./..#../.#.../.#.../.#.../..#../...#.',
  ')': '.#.../..#../...#./...#./...#./..#../.#...',
  '[': '.###./.#.../.#.../.#.../.#.../.#.../.###.',
  ']': '.###./...#./...#./...#./...#./...#./.###.',
  '<': '...#./..#../.#.../#..../.#.../..#../...#.',
  '>': '.#.../..#../...#./....#/...#./..#../.#...',
  '=': '...../...../#####/...../#####/...../.....',
  '*': '...../#.#.#/.###./#####/.###./#.#.#/.....',
  '#': '.#.#./.#.#./#####/.#.#./#####/.#.#./.....',
  '_': '...../...../...../...../...../...../#####',
  '|': '..#../..#../..#../..#../..#../..#../..#..',
  '^': '..#../.###./#.#.#/..#../..#../...../.....',
  'v': '...../...../#...#/#...#/.#.#./.#.#./..#..',
  '~': '...../...../.##.#/#..#./...../...../.....',
  '@': '.###./#...#/#.###/#.#.#/#.###/#..../.###.',
  '$': '..#../.####/#.#../.###./..#.#/####./..#..',
  '&': '.##../#..../.#.../##.#./#..##/#..#./.##.#',
};
/* eslint-enable */

const CHARS = Object.keys(GLYPHS);
const INDEX = new Map<string, number>(CHARS.map((c, i) => [c, i]));

let atlas: HTMLCanvasElement | null = null;
const tinted = new Map<string, HTMLCanvasElement>();

function buildAtlas(): HTMLCanvasElement {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = CHARS.length * GW;
  c.height = GH;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  CHARS.forEach((ch, i) => {
    const rows = GLYPHS[ch].split('/');
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        if (row[x] === '#') ctx.fillRect(i * GW + x, y, 1, 1);
      }
    }
  });
  atlas = c;
  return c;
}

function tintedAtlas(color: string): HTMLCanvasElement {
  const cached = tinted.get(color);
  if (cached) return cached;
  const src = buildAtlas();
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  tinted.set(color, c);
  return c;
}

export interface TextOptions {
  color?: string;
  /** Extra pixels between glyphs. Default 1. */
  tracking?: number;
  /** 'left' | 'center' | 'right' */
  align?: 'left' | 'center' | 'right';
  /** Drop a 1px offset shadow in this colour behind the text. */
  shadow?: string;
  /** Additive glow pass in this colour. */
  glow?: string;
  /** Integer pixel scale. Default 1. */
  scale?: number;
  alpha?: number;
}

export function textWidth(str: string, tracking = 1, scale = 1): number {
  if (str.length === 0) return 0;
  return (str.length * (GW + tracking) - tracking) * scale;
}

export const FONT_HEIGHT = GH;

/** Draw a string of pixel text. Coordinates are the top-left of the first glyph. */
export function drawText(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  opts: TextOptions = {},
): void {
  const {
    color = '#ffffff',
    tracking = 1,
    align = 'left',
    shadow,
    glow,
    scale = 1,
    alpha = 1,
  } = opts;

  const text = str.toUpperCase();
  const w = textWidth(text, tracking, scale);
  let ox = Math.round(x);
  if (align === 'center') ox = Math.round(x - w / 2);
  else if (align === 'right') ox = Math.round(x - w);
  const oy = Math.round(y);

  const prevAlpha = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = prevAlpha * alpha;

  if (shadow) blit(ctx, text, ox + scale, oy + scale, shadow, tracking, scale);
  if (glow) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (alpha * 0.5) * prevAlpha;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      blit(ctx, text, ox + dx * scale, oy + dy * scale, glow, tracking, scale);
    }
    ctx.globalAlpha = alpha * prevAlpha;
    ctx.globalCompositeOperation = 'source-over';
  }
  blit(ctx, text, ox, oy, color, tracking, scale);

  ctx.globalAlpha = prevAlpha;
}

function blit(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  tracking: number,
  scale: number,
): void {
  const src = tintedAtlas(color);
  let cx = x;
  for (const ch of text) {
    const idx = INDEX.get(ch);
    if (idx !== undefined) {
      ctx.drawImage(src, idx * GW, 0, GW, GH, cx, y, GW * scale, GH * scale);
    }
    cx += (GW + tracking) * scale;
  }
}

/**
 * Graffiti-style header: chunky, skewed, dripping. Used for run titles and layer
 * cards where a clean pixel font would look too tidy for this world.
 */
export function drawGraffiti(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  color: string,
  scale = 2,
): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.transform(1, 0, -0.16, 1, 0, 0);
  drawText(ctx, str, 0, 0, { color, scale, tracking: 2, align: 'center', shadow: '#0b0b12', glow: color });
  ctx.restore();
}
