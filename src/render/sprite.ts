/**
 * Sprite compiler.
 *
 * Sprites are authored as character maps — readable, diffable, editable in a
 * text editor — and compiled once at boot into three canvases:
 *
 *   base        the sprite itself
 *   glow        a blurred copy of only the emissive pixels, drawn additively
 *   silhouette  a solid white mask, used for hit flash
 *
 * Baking the glow at load time means the neon costs one extra blit at runtime
 * instead of a per-frame blur, which matters because nearly every entity in
 * this game glows.
 */

export interface SpriteDef {
  /** char -> css colour. Any char not listed (and ' ') is transparent. */
  pal: Record<string, string>;
  /** Chars that emit light. These also get drawn into the glow layer. */
  glow?: string;
  rows: string[];
  /** Pivot in sprite pixels. Defaults to bottom-centre (feet on the ground). */
  ox?: number;
  oy?: number;
  /** Glow blur radius in sprite pixels. */
  blur?: number;
  /** Glow brightness multiplier. */
  glowStrength?: number;
}

export interface Sprite {
  w: number;
  h: number;
  /** Pivot, in sprite pixels from top-left. */
  ox: number;
  oy: number;
  base: HTMLCanvasElement;
  glow: HTMLCanvasElement | null;
  glowPad: number;
  glowStrength: number;
  silhouette: HTMLCanvasElement;
  /** Kept so the sprite can be re-tinted into a variant later. */
  def: SpriteDef;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

let blurSupported: boolean | null = null;
function canUseFilter(ctx: CanvasRenderingContext2D): boolean {
  if (blurSupported === null) {
    ctx.filter = 'blur(1px)';
    blurSupported = ctx.filter === 'blur(1px)';
    ctx.filter = 'none';
  }
  return blurSupported;
}

/** Compile a character-map definition into drawable canvases. */
export function compile(def: SpriteDef): Sprite {
  const h = def.rows.length;
  const w = def.rows.reduce((m, r) => Math.max(m, r.length), 0);

  const [base, bctx] = makeCanvas(w, h);
  const glowChars = new Set((def.glow ?? '').split(''));
  const hasGlow = glowChars.size > 0;

  const blur = def.blur ?? 2;
  const pad = hasGlow ? Math.ceil(blur * 2) + 1 : 0;
  const [emissive, ectx] = makeCanvas(w + pad * 2, h + pad * 2);

  for (let y = 0; y < h; y++) {
    const row = def.rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === ' ' || ch === '.') continue;
      const color = def.pal[ch];
      if (!color) continue;
      bctx.fillStyle = color;
      bctx.fillRect(x, y, 1, 1);
      if (glowChars.has(ch)) {
        ectx.fillStyle = color;
        ectx.fillRect(x + pad, y + pad, 1, 1);
      }
    }
  }

  let glow: HTMLCanvasElement | null = null;
  if (hasGlow) {
    const [gc, gctx] = makeCanvas(emissive.width, emissive.height);
    if (canUseFilter(gctx)) {
      gctx.filter = `blur(${blur}px)`;
      gctx.drawImage(emissive, 0, 0);
      gctx.filter = 'none';
    } else {
      // Fallback: stack offset copies at low alpha to fake a blur.
      gctx.globalAlpha = 0.24;
      for (let dy = -blur; dy <= blur; dy++) {
        for (let dx = -blur; dx <= blur; dx++) {
          if (dx * dx + dy * dy > blur * blur) continue;
          gctx.drawImage(emissive, dx, dy);
        }
      }
      gctx.globalAlpha = 1;
    }
    // Keep the hot core inside the bloom.
    gctx.drawImage(emissive, 0, 0);
    glow = gc;
  }

  const [sil, sctx] = makeCanvas(w, h);
  sctx.drawImage(base, 0, 0);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = '#ffffff';
  sctx.fillRect(0, 0, w, h);
  sctx.globalCompositeOperation = 'source-over';

  return {
    w,
    h,
    ox: def.ox ?? Math.floor(w / 2),
    oy: def.oy ?? h,
    base,
    glow,
    glowPad: pad,
    glowStrength: def.glowStrength ?? 1,
    silhouette: sil,
    def,
  };
}

/**
 * Produce a recoloured variant. Used to reskin one weapon base across every
 * element, and to build enemy colour variants without new art.
 */
export function retint(def: SpriteDef, remap: Record<string, string>, overrides: Partial<SpriteDef> = {}): Sprite {
  return compile({ ...def, ...overrides, pal: { ...def.pal, ...remap } });
}

/** Horizontally mirrored copy — cheaper than flipping in the draw call. */
export function mirror(sprite: Sprite): Sprite {
  const flipped = sprite.def.rows.map((r) => r.padEnd(sprite.w, ' ').split('').reverse().join(''));
  return compile({ ...sprite.def, rows: flipped, ox: sprite.w - sprite.ox });
}

/** Lazily compile a def the first time it is drawn. */
export function lazy(def: SpriteDef): () => Sprite {
  let cached: Sprite | null = null;
  return () => (cached ??= compile(def));
}
