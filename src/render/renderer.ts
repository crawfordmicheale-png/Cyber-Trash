import type { Sprite } from './sprite';
import { PAL, rgba } from './palette';
import { fxRng } from '../core/rng';

/** Internal resolution. Everything is authored against this. */
export const VIEW_W = 480;
export const VIEW_H = 270;

/** Upper bound on the canvas backing-store multiplier. See `resize()`. */
export const MAX_DPR = 2;

export interface DrawOptions {
  /** Horizontal / vertical scale. Squash and stretch live here. */
  sx?: number;
  sy?: number;
  rot?: number;
  flip?: boolean;
  alpha?: number;
  /** 0..1 white-out, for hit flash. */
  flash?: number;
  /** Multiplier on the baked glow layer. */
  glow?: number;
  /** Override colour for the whole silhouette (used by afterimages). */
  silhouette?: string;
  /** Extra pivot offset in sprite pixels, applied before rotation. */
  pivotX?: number;
  pivotY?: number;
}

/**
 * Renders at 480x270 into an offscreen buffer, then upscales by an integer
 * factor. Integer-only scaling is what keeps the pixels square; the leftover
 * screen space is just letterboxed.
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  /** The low-res buffer everything draws into. */
  readonly buffer: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;

  /** Scratch buffer for full-screen post effects. */
  private scratch: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;

  /**
   * UI layer composited after the world, at 1:1 with no zoom and no shake.
   * On-screen touch controls live here: a button that shakes with the camera is
   * a button you miss.
   */
  readonly overlay: HTMLCanvasElement;
  readonly ov: CanvasRenderingContext2D;
  /** Set each frame by whoever draws into the overlay. */
  overlayActive = false;

  private scanlines: HTMLCanvasElement;
  private vignette: HTMLCanvasElement;
  private damageVignette: HTMLCanvasElement;

  /** Buffer pixels -> CSS pixels. */
  cssScale = 1;
  /** Buffer pixels -> canvas backing-store pixels (cssScale * devicePixelRatio). */
  private backingScale = 1;
  /** True while the window is taller than it is wide. */
  portrait = false;

  // ---- post-process state, set by gameplay each frame -------------------
  /** 0..1 digital corruption: horizontal band displacement + colour split. */
  glitch = 0;
  /** 0..1 red damage vignette. */
  damage = 0;
  /** Full-screen additive flash. */
  flashColor = PAL.white;
  flashAmount = 0;
  /** 0..1 extra chromatic aberration (independent of glitch). */
  aberration = 0;
  /** Camera zoom, driven by trauma. */
  zoom = 1;

  constructor(mount: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    mount.appendChild(this.canvas);

    this.buffer = document.createElement('canvas');
    this.buffer.width = VIEW_W;
    this.buffer.height = VIEW_H;
    this.g = this.buffer.getContext('2d', { alpha: false })!;
    this.g.imageSmoothingEnabled = false;

    this.scratch = document.createElement('canvas');
    this.scratch.width = VIEW_W;
    this.scratch.height = VIEW_H;
    this.sctx = this.scratch.getContext('2d')!;
    this.sctx.imageSmoothingEnabled = false;

    this.overlay = document.createElement('canvas');
    this.overlay.width = VIEW_W;
    this.overlay.height = VIEW_H;
    this.ov = this.overlay.getContext('2d')!;
    this.ov.imageSmoothingEnabled = false;

    this.scanlines = this.buildScanlines();
    this.vignette = this.buildVignette();
    this.damageVignette = this.buildDamageVignette();

    this.resize();
    window.addEventListener('resize', () => this.resize());
    // Mobile browsers fire orientationchange before the new viewport size is
    // readable, so re-measure on the next frame as well.
    window.addEventListener('orientationchange', () => {
      this.resize();
      requestAnimationFrame(() => this.resize());
    });
    window.visualViewport?.addEventListener('resize', () => this.resize());
  }

  private buildScanlines(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 2;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(0, 1, 1, 1);
    return c;
  }

  private buildVignette(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = VIEW_W;
    c.height = VIEW_H;
    const ctx = c.getContext('2d')!;
    const grd = ctx.createRadialGradient(
      VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.28,
      VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.82,
    );
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    return c;
  }

  /**
   * Damage feedback lives in the corners, never over the middle of the screen.
   * A full-screen red wash reads as "the game broke"; an edge bloom reads as
   * "you got hit" while leaving the fight legible.
   */
  private buildDamageVignette(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = VIEW_W;
    c.height = VIEW_H;
    const ctx = c.getContext('2d')!;
    const grd = ctx.createRadialGradient(
      VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.42,
      VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.9,
    );
    grd.addColorStop(0, 'rgba(255,51,85,0)');
    grd.addColorStop(0.6, 'rgba(255,51,85,0.35)');
    grd.addColorStop(1, 'rgba(255,45,149,0.85)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    return c;
  }

  private resize(): void {
    // Prefer the stage's content box so CSS safe-area padding is already
    // subtracted. Falling back to the viewport keeps boot/tests working if the
    // canvas is somehow unmounted.
    const stage = this.canvas.parentElement;
    const availW = stage?.clientWidth || window.visualViewport?.width || window.innerWidth;
    const availH = stage?.clientHeight || window.visualViewport?.height || window.innerHeight;
    this.portrait = (window.visualViewport?.height ?? window.innerHeight)
      > (window.visualViewport?.width ?? window.innerWidth);

    let scale = Math.min(availW / VIEW_W, availH / VIEW_H);
    // Integer scaling keeps pixels square, but only when there is room for it.
    // A phone in landscape lands around 1.4x, and flooring that to 1x would
    // letterbox the game down to a postage stamp — there, filling the screen
    // matters more than perfectly uniform pixels.
    if (scale >= 2) scale = Math.floor(scale);
    scale = Math.max(scale, 0.25);
    this.cssScale = scale;

    // Render at device resolution so phones don't upscale a small canvas
    // through the compositor and blur every edge. Capped at 2: the source is
    // 480x270 nearest-neighbour pixel art, so a 3x backing store is visually
    // indistinguishable from 2x while costing ~10% of the frame budget on a
    // phone (measured 58fps vs 50fps at 844x390).
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const cssW = Math.round(VIEW_W * scale);
    const cssH = Math.round(VIEW_H * scale);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.backingScale = scale * dpr;
    this.ctx.imageSmoothingEnabled = false;
  }

  /**
   * Convert a client-space point into buffer pixels. Measured off the element's
   * own rect, so it stays correct across device pixel ratio, fractional scaling
   * and CSS transforms.
   */
  toBufferPoint(clientX: number, clientY: number, out: { x: number; y: number }): void {
    const r = this.canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) { out.x = -1; out.y = -1; return; }
    out.x = ((clientX - r.left) / r.width) * VIEW_W;
    out.y = ((clientY - r.top) / r.height) * VIEW_H;
  }

  clear(color = PAL.void): void {
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.globalAlpha = 1;
    this.g.globalCompositeOperation = 'source-over';
    this.g.fillStyle = color;
    this.g.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  /**
   * Draw a sprite with the full transform stack. This single call is what
   * replaces traditional frame animation across the entire game: scale for
   * squash/stretch, rot for lean and weapon swings, flash for impacts.
   */
  drawSprite(sprite: Sprite, x: number, y: number, o: DrawOptions = {}): void {
    const g = this.g;
    const sx = o.sx ?? 1;
    const sy = o.sy ?? 1;
    const rot = o.rot ?? 0;
    const flip = o.flip ?? false;
    const alpha = o.alpha ?? 1;
    if (alpha <= 0.004) return;

    const px = sprite.ox + (o.pivotX ?? 0);
    const py = sprite.oy + (o.pivotY ?? 0);

    const simple = rot === 0 && sx === 1 && sy === 1 && !o.silhouette;
    g.save();
    if (simple) {
      // Fast, perfectly crisp path — the common case for props and terrain.
      g.translate(Math.round(x), Math.round(y));
      if (flip) g.scale(-1, 1);
    } else {
      g.translate(Math.round(x), Math.round(y));
      if (rot !== 0) g.rotate(rot);
      g.scale(flip ? -sx : sx, sy);
    }

    if (sprite.glow) {
      const gAmt = (o.glow ?? 1) * sprite.glowStrength * alpha;
      if (gAmt > 0.01) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = Math.min(1, gAmt);
        g.drawImage(sprite.glow, -px - sprite.glowPad, -py - sprite.glowPad);
        g.globalCompositeOperation = 'source-over';
      }
    }

    g.globalAlpha = alpha;
    if (o.silhouette) {
      g.drawImage(sprite.silhouette, -px, -py);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = o.silhouette;
      g.fillRect(-px, -py, sprite.w, sprite.h);
      g.globalCompositeOperation = 'source-over';
    } else {
      g.drawImage(sprite.base, -px, -py);
      const flash = o.flash ?? 0;
      if (flash > 0.01) {
        g.globalAlpha = alpha * Math.min(1, flash);
        g.drawImage(sprite.silhouette, -px, -py);
      }
    }

    g.restore();
    g.globalAlpha = 1;
  }

  /** Additive neon rectangle — the workhorse for VFX shapes. */
  glowRect(x: number, y: number, w: number, h: number, color: string, alpha = 1, spread = 2): void {
    const g = this.g;
    g.save();
    g.globalCompositeOperation = 'lighter';
    if (spread > 0) {
      g.globalAlpha = alpha * 0.28;
      g.fillStyle = color;
      g.fillRect(Math.round(x - spread), Math.round(y - spread), w + spread * 2, h + spread * 2);
    }
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.fillRect(Math.round(x), Math.round(y), Math.max(1, w), Math.max(1, h));
    g.restore();
    g.globalAlpha = 1;
  }

  /** Additive line, used for beams, sparks and wires. */
  glowLine(x1: number, y1: number, x2: number, y2: number, color: string, width = 1, alpha = 1): void {
    const g = this.g;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = color;
    g.lineCap = 'butt';
    g.globalAlpha = alpha * 0.3;
    g.lineWidth = width + 2;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
    g.globalAlpha = alpha;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
    g.restore();
    g.globalAlpha = 1;
  }

  /**
   * Composite the buffer to the screen with the CRT / corruption pass.
   * This is where the "found in a landfill" texture gets applied.
   */
  present(): void {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);

    if (this.damage > 0.01) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = Math.min(1, this.damage) * 0.6;
      g.drawImage(this.damageVignette, 0, 0);
      g.restore();
    }

    g.globalAlpha = 1;
    g.drawImage(this.vignette, 0, 0);

    // Scanlines: tile a 1x2 pattern over the whole frame.
    const pattern = g.createPattern(this.scanlines, 'repeat');
    if (pattern) {
      g.fillStyle = pattern;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    if (this.flashAmount > 0.01) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = Math.min(1, this.flashAmount);
      g.fillStyle = this.flashColor;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      g.restore();
    }

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = PAL.void;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const s = this.backingScale;
    const z = this.zoom;
    const dw = VIEW_W * s * z;
    const dh = VIEW_H * s * z;
    const dx = (this.canvas.width - dw) / 2;
    const dy = (this.canvas.height - dh) / 2;

    const ab = Math.min(0.6, this.aberration + this.glitch * 0.5);
    if (ab > 0.01) {
      // Split the channels by drawing the frame three times with tinted
      // composites. Cheap, and it reads exactly like a dying screen.
      const off = Math.round(1 + ab * 2) * s;
      ctx.globalCompositeOperation = 'lighter';
      this.drawChannel(ctx, 'rgb(255,0,60)', dx - off, dy, dw, dh);
      this.drawChannel(ctx, 'rgb(0,255,220)', dx + off, dy, dw, dh);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.buffer, dx, dy, dw, dh);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.drawImage(this.buffer, dx, dy, dw, dh);
    }

    if (this.glitch > 0.01) this.drawGlitchBands(ctx, dx, dy, dw, dh);

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Overlay last, at z=1 and with no shake, so touch targets sit exactly
    // where they are drawn no matter what the camera is doing.
    if (this.overlayActive) {
      const ow = VIEW_W * s;
      const oh = VIEW_H * s;
      ctx.drawImage(this.overlay, (this.canvas.width - ow) / 2, (this.canvas.height - oh) / 2, ow, oh);
    }
  }

  /** Wipe the overlay layer. Call before drawing into `ov`. */
  clearOverlay(): void {
    this.ov.setTransform(1, 0, 0, 1, 0, 0);
    this.ov.globalAlpha = 1;
    this.ov.globalCompositeOperation = 'source-over';
    this.ov.clearRect(0, 0, VIEW_W, VIEW_H);
    this.overlayActive = false;
  }

  private drawChannel(
    ctx: CanvasRenderingContext2D,
    tint: string,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void {
    const s = this.sctx;
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalCompositeOperation = 'source-over';
    s.globalAlpha = 1;
    s.clearRect(0, 0, VIEW_W, VIEW_H);
    s.drawImage(this.buffer, 0, 0);
    s.globalCompositeOperation = 'multiply';
    s.fillStyle = tint;
    s.fillRect(0, 0, VIEW_W, VIEW_H);
    s.globalCompositeOperation = 'source-over';
    // Kept low: the split is a fringe on the silhouette edges, not a double image.
    ctx.globalAlpha = 0.26;
    ctx.drawImage(this.scratch, dx, dy, dw, dh);
  }

  private drawGlitchBands(
    ctx: CanvasRenderingContext2D,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void {
    const bands = Math.round(2 + this.glitch * 9);
    for (let i = 0; i < bands; i++) {
      const by = fxRng.int(0, VIEW_H - 4);
      const bh = fxRng.int(2, 12);
      const shift = fxRng.spread(1) * this.glitch * 26;
      ctx.drawImage(
        this.buffer,
        0, by, VIEW_W, bh,
        dx + shift * this.backingScale * this.zoom,
        dy + (by / VIEW_H) * dh,
        dw, (bh / VIEW_H) * dh,
      );
      if (fxRng.chance(0.35)) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.18 * this.glitch;
        ctx.fillStyle = fxRng.chance(0.5) ? PAL.cyan : PAL.magenta;
        ctx.fillRect(dx, dy + (by / VIEW_H) * dh, dw, (bh / VIEW_H) * dh);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  /** Decay the post-process state. Call once per frame after present(). */
  decay(dt: number): void {
    const k = Math.pow(0.001, dt);
    this.glitch *= k;
    this.damage *= Math.pow(0.02, dt);
    this.flashAmount *= Math.pow(0.0001, dt);
    this.aberration *= k;
    if (this.glitch < 0.005) this.glitch = 0;
    if (this.flashAmount < 0.005) this.flashAmount = 0;
    if (this.aberration < 0.005) this.aberration = 0;
  }

  screenFlash(color: string, amount: number): void {
    this.flashColor = color;
    this.flashAmount = Math.max(this.flashAmount, amount);
  }

  /** Translucent panel in the scavenged-terminal style used by all UI. */
  panel(x: number, y: number, w: number, h: number, accent: string, fill = 0.86): void {
    const g = this.g;
    g.fillStyle = rgba(PAL.black, fill);
    g.fillRect(x, y, w, h);
    g.strokeStyle = rgba(accent, 0.85);
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // Corner brackets: the "industrial display" tell.
    g.fillStyle = accent;
    const c = 4;
    g.fillRect(x, y, c, 1); g.fillRect(x, y, 1, c);
    g.fillRect(x + w - c, y, c, 1); g.fillRect(x + w - 1, y, 1, c);
    g.fillRect(x, y + h - 1, c, 1); g.fillRect(x, y + h - c, 1, c);
    g.fillRect(x + w - c, y + h - 1, c, 1); g.fillRect(x + w - 1, y + h - c, 1, c);
  }
}
