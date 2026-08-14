import { input, type Action } from '../core/input';
import type { Renderer } from '../render/renderer';
import { VIEW_W, VIEW_H } from '../render/renderer';
import { PAL, rgba } from '../render/palette';
import { drawText } from '../render/text';
import { time } from '../core/time';

/**
 * On-screen touch controls.
 *
 * Drawn into the renderer's overlay layer — 1:1, no zoom, no shake — so a
 * button is always exactly where it looks like it is, even mid-explosion. Every
 * press routes through `input.virtualDown/Up`, which is the same state keys
 * use, so nothing in the game has any idea whether it was played on a keyboard
 * or a thumb.
 */

export type TouchMode = 'none' | 'gameplay' | 'menu';

type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'disc'; x: number; y: number; r: number };

interface Button {
  id: string;
  action: Action;
  label: string;
  color: string;
  shape: Shape;
  /** Invisible margin around the shape. Fingers are imprecise; targets aren't. */
  pad: number;
}

const rect = (x: number, y: number, w: number, h: number): Shape => ({ kind: 'rect', x, y, w, h });
const disc = (x: number, y: number, r: number): Shape => ({ kind: 'disc', x, y, r });

const centreOf = (s: Shape): [number, number] =>
  s.kind === 'rect' ? [s.x + s.w / 2, s.y + s.h / 2] : [s.x, s.y];

/**
 * Gameplay layout, landscape. Movement under the left thumb, actions under the
 * right, nothing in the middle third where the character and the fight are.
 */
const GAMEPLAY: Button[] = [
  { id: 'left', action: 'left', label: '<', color: PAL.cyan, shape: rect(8, 200, 52, 62), pad: 8 },
  { id: 'right', action: 'right', label: '>', color: PAL.cyan, shape: rect(64, 200, 52, 62), pad: 8 },
  // Drop-through is rare, so it gets a small plate tucked above the left thumb
  // rather than a full-size pad sitting in the middle of the play area.
  { id: 'down', action: 'down', label: 'DROP', color: PAL.metalHi, shape: rect(8, 168, 52, 26), pad: 5 },

  { id: 'jump', action: 'jump', label: 'JUMP', color: PAL.lime, shape: disc(446, 226, 27), pad: 8 },
  { id: 'attack', action: 'attack', label: 'HIT', color: PAL.magenta, shape: disc(388, 210, 27), pad: 8 },
  { id: 'dash', action: 'dash', label: 'DASH', color: PAL.violet, shape: disc(444, 164, 23), pad: 6 },
  { id: 'throw', action: 'throw', label: 'LOB', color: PAL.orange, shape: disc(388, 148, 23), pad: 6 },
];

/** Menu layout: a d-pad and confirm/cancel. */
const MENU: Button[] = [
  // Sits below the settlement's character panel (which ends at y=162) so the
  // cross never covers the thing you are choosing between.
  { id: 'mup', action: 'up', label: 'UP', color: PAL.cyan, shape: rect(42, 168, 40, 36), pad: 6 },
  { id: 'mleft', action: 'left', label: '<', color: PAL.cyan, shape: rect(2, 204, 40, 36), pad: 6 },
  { id: 'mright', action: 'right', label: '>', color: PAL.cyan, shape: rect(82, 204, 40, 36), pad: 6 },
  { id: 'mdown', action: 'down', label: 'DN', color: PAL.cyan, shape: rect(42, 240, 40, 28), pad: 6 },

  { id: 'ok', action: 'confirm', label: 'OK', color: PAL.lime, shape: disc(438, 218, 30), pad: 10 },
  { id: 'back', action: 'cancel', label: 'BACK', color: PAL.metalHi, shape: disc(438, 154, 22), pad: 8 },
];

/** Contextual button — only drawn when there is something to interact with. */
const CONTEXT_SHAPE = disc(240, 232, 26);

export class TouchControls {
  /** Controls are visible and consuming input. */
  enabled = false;
  mode: TouchMode = 'none';

  /** Set by the game each frame; null hides the context button. */
  contextAction: Action | null = null;
  contextLabel = '';

  /** When set, a tap on empty space counts as confirm (title / summary screens). */
  tapAnywhereConfirm = false;

  private renderer!: Renderer;
  /** pointerId -> button id currently held by that pointer. */
  private held = new Map<number, string>();
  private point = { x: 0, y: 0 };
  /** Buttons flash briefly after release so a tap still reads as a tap. */
  private releasedAt = new Map<string, number>();

  attach(renderer: Renderer): void {
    this.renderer = renderer;
    const canvas = renderer.canvas;

    // Coarse pointers get the controls immediately; a mouse only gets them if
    // explicitly asked for, so desktop play is untouched.
    if (new URLSearchParams(location.search).has('touch')) this.enable();
    else if (window.matchMedia?.('(pointer: coarse)').matches) this.enable();

    if (!('PointerEvent' in window)) {
      // Older mobile browsers (and some embedded WebViews) never got pointer
      // events. Fall back to raw touch so the controls still work there.
      this.attachTouchFallback(canvas);
      return;
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.enable();
      if (!this.enabled) return;
      e.preventDefault();
      this.onDown(e.pointerId, e.clientX, e.clientY);
    });

    // Move/up on the window: a thumb that slides off the canvas must still
    // release its button, or the player runs into a pit forever.
    window.addEventListener('pointermove', (e) => {
      if (!this.enabled || !this.held.has(e.pointerId)) return;
      e.preventDefault();
      this.onMove(e.pointerId, e.clientX, e.clientY);
    });
    const release = (e: PointerEvent): void => {
      if (!this.enabled) return;
      this.onUp(e.pointerId);
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', () => this.releaseAll());
    // Backgrounding the tab can swallow the pointerup entirely, which would
    // otherwise leave a direction held down for the rest of the run.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
  }

  /** Touch-event equivalent of the pointer-event path, for browsers without it. */
  private attachTouchFallback(canvas: HTMLCanvasElement): void {
    const handle = (e: TouchEvent, phase: 'down' | 'move' | 'up'): void => {
      this.enable();
      e.preventDefault();
      if (phase === 'up') {
        for (let i = 0; i < e.changedTouches.length; i++) {
          this.onUp(e.changedTouches[i].identifier);
        }
        return;
      }
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (phase === 'down') this.onDown(t.identifier, t.clientX, t.clientY);
        else this.onMove(t.identifier, t.clientX, t.clientY);
      }
    };
    canvas.addEventListener('touchstart', (e) => handle(e, 'down'), { passive: false });
    window.addEventListener('touchmove', (e) => handle(e, 'move'), { passive: false });
    window.addEventListener('touchend', (e) => handle(e, 'up'), { passive: false });
    window.addEventListener('touchcancel', (e) => handle(e, 'up'), { passive: false });
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    input.suppressMouse = true;
  }

  private buttons(): Button[] {
    if (this.mode === 'gameplay') return GAMEPLAY;
    if (this.mode === 'menu') return MENU;
    return [];
  }

  /**
   * Which button is under this point?
   *
   * Buttons are padded outward so near-misses still count, which means adjacent
   * pads overlap along their shared seam. Returning the first match there would
   * hand the whole seam to whichever button happens to be first in the array —
   * pressing the inner edge of RIGHT gave you LEFT. Ties go to the nearest
   * centre instead, so the seam splits where it looks like it splits.
   */
  private hitTest(bx: number, by: number): string | null {
    let best: string | null = null;
    let bestDist = Infinity;

    const consider = (id: string, shape: Shape, pad: number): void => {
      if (!this.inside(shape, pad, bx, by)) return;
      const [cx, cy] = centreOf(shape);
      const d = (bx - cx) * (bx - cx) + (by - cy) * (by - cy);
      if (d < bestDist) {
        bestDist = d;
        best = id;
      }
    };

    for (const b of this.buttons()) consider(b.id, b.shape, b.pad);
    if (this.mode === 'gameplay' && this.contextAction) {
      consider('context', CONTEXT_SHAPE, 10);
    }
    return best;
  }

  /** Is any finger currently on this button? */
  private isPressed(id: string): boolean {
    for (const held of this.held.values()) if (held === id) return true;
    return false;
  }

  private inside(s: Shape, pad: number, bx: number, by: number): boolean {
    if (s.kind === 'rect') {
      return bx >= s.x - pad && bx <= s.x + s.w + pad && by >= s.y - pad && by <= s.y + s.h + pad;
    }
    const dx = bx - s.x;
    const dy = by - s.y;
    const r = s.r + pad;
    return dx * dx + dy * dy <= r * r;
  }

  private actionFor(id: string): Action | null {
    if (id === 'context') return this.contextAction;
    return this.buttons().find((b) => b.id === id)?.action ?? null;
  }

  private onDown(pointerId: number, clientX: number, clientY: number): void {
    // A fresh press on a pointer we still believe is down means we missed its
    // release; drop the stale claim rather than stacking a second one.
    if (this.held.has(pointerId)) this.onUp(pointerId);
    this.renderer.toBufferPoint(clientX, clientY, this.point);
    const id = this.hitTest(this.point.x, this.point.y);
    if (!id) {
      // Nothing under the finger. On the title and summary screens the whole
      // screen is the button.
      if (this.tapAnywhereConfirm) input.virtualDown('confirm');
      this.held.set(pointerId, '');
      return;
    }
    this.press(pointerId, id);
  }

  private onMove(pointerId: number, clientX: number, clientY: number): void {
    const current = this.held.get(pointerId);
    if (current === undefined) return;
    this.renderer.toBufferPoint(clientX, clientY, this.point);
    const next = this.hitTest(this.point.x, this.point.y) ?? '';
    if (next === current) return;

    // Sliding from one pad to another swaps cleanly, which is how thumbs
    // actually move between left and right on a d-pad.
    //
    // Order matters: this pointer's claim has to leave the map BEFORE the
    // release, because releaseButton asks whether any *other* pointer still
    // holds the action. Releasing first meant it found this very pointer,
    // concluded the button was still held, and never lifted the key — so a
    // slide from LEFT to RIGHT left both directions down (the character froze)
    // and, on lift, left the first one down forever (the character ran away).
    this.held.delete(pointerId);
    this.releaseButton(current);
    if (next) this.press(pointerId, next);
    else this.held.set(pointerId, '');
  }

  private press(pointerId: number, id: string): void {
    this.held.set(pointerId, id);
    const action = this.actionFor(id);
    if (action) input.virtualDown(action);
  }

  private onUp(pointerId: number): void {
    const id = this.held.get(pointerId);
    this.held.delete(pointerId);
    if (id === undefined) return;
    if (id === '') {
      if (this.tapAnywhereConfirm) input.virtualUp('confirm');
      return;
    }
    this.releaseButton(id);
  }

  /**
   * Lift a button's action, unless some other finger still wants it.
   *
   * The caller must already have removed this pointer from `held`.
   */
  private releaseButton(id: string): void {
    if (id === '') return;
    this.releasedAt.set(id, time.elapsed);
    const action = this.actionFor(id);
    if (!action) return;
    for (const otherId of this.held.values()) {
      if (otherId && this.actionFor(otherId) === action) return;
    }
    input.virtualUp(action);
  }

  releaseAll(): void {
    for (const id of this.held.values()) {
      const action = this.actionFor(id);
      if (action) input.virtualUp(action);
    }
    this.held.clear();
  }

  /** Called when the game switches screens, so stale holds don't leak across. */
  setMode(mode: TouchMode): void {
    if (mode === this.mode) return;
    this.releaseAll();
    this.mode = mode;
  }

  // ---- drawing ----------------------------------------------------------

  draw(r: Renderer): void {
    if (!this.enabled || this.mode === 'none') return;
    const g = r.ov;
    r.overlayActive = true;

    for (const b of this.buttons()) this.drawButton(g, b, this.isPressed(b.id));

    if (this.mode === 'gameplay' && this.contextAction) {
      this.drawButton(g, {
        id: 'context',
        action: this.contextAction,
        label: this.contextLabel,
        color: PAL.lime,
        shape: CONTEXT_SHAPE,
        pad: 10,
      }, this.isPressed('context'));
    }

    if (r.portrait) this.drawRotateHint(g);
  }

  private drawButton(g: CanvasRenderingContext2D, b: Button, down: boolean): void {
    // A short afterglow on release, so a quick tap still registers visually.
    const since = time.elapsed - (this.releasedAt.get(b.id) ?? -99);
    const glow = down ? 1 : Math.max(0, 1 - since / 0.18) * 0.7;

    const fill = rgba(b.color, 0.1 + glow * 0.34);
    const line = rgba(b.color, 0.5 + glow * 0.5);

    g.save();
    if (b.shape.kind === 'rect') {
      const { x, y, w, h } = b.shape;
      // Clipped corners: the scavenged-panel look, and it reads as a plate
      // rather than a web button.
      const c = 6;
      g.beginPath();
      g.moveTo(x + c, y);
      g.lineTo(x + w - c, y);
      g.lineTo(x + w, y + c);
      g.lineTo(x + w, y + h - c);
      g.lineTo(x + w - c, y + h);
      g.lineTo(x + c, y + h);
      g.lineTo(x, y + h - c);
      g.lineTo(x, y + c);
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      g.strokeStyle = line;
      g.lineWidth = 1;
      g.stroke();
      drawText(g, b.label, x + w / 2, y + h / 2 - 3, {
        color: down ? PAL.white : b.color, align: 'center', glow: glow > 0.1 ? b.color : undefined,
      });
    } else {
      const { x, y, r } = b.shape;
      // Octagon rather than a circle — antialiased curves fight the pixel art.
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      g.strokeStyle = line;
      g.lineWidth = 1;
      g.stroke();
      drawText(g, b.label, x, y - 3, {
        color: down ? PAL.white : b.color, align: 'center', glow: glow > 0.1 ? b.color : undefined,
      });
    }
    g.restore();
  }

  private drawRotateHint(g: CanvasRenderingContext2D): void {
    g.save();
    g.fillStyle = rgba(PAL.void, 0.88);
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    const blink = Math.sin(time.elapsed * 3) > -0.4;
    drawText(g, 'ROTATE YOUR DEVICE', VIEW_W / 2, VIEW_H / 2 - 12, {
      color: blink ? PAL.magenta : PAL.magentaDim, glow: PAL.magenta, align: 'center', scale: 2,
    });
    drawText(g, 'CYBER-TRASH IS PLAYED IN LANDSCAPE', VIEW_W / 2, VIEW_H / 2 + 10, {
      color: PAL.metalHi, align: 'center',
    });
    g.restore();
  }
}

export const touch = new TouchControls();
