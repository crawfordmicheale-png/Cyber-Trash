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
  private pressed = new Set<string>();
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

  private hitTest(bx: number, by: number): string | null {
    for (const b of this.buttons()) {
      if (this.inside(b.shape, b.pad, bx, by)) return b.id;
    }
    if (this.mode === 'gameplay' && this.contextAction && this.inside(CONTEXT_SHAPE, 10, bx, by)) {
      return 'context';
    }
    return null;
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
    const id = this.hitTest(this.point.x, this.point.y);
    if (id === current || (id === null && current === '')) return;
    // Sliding from one pad to another swaps cleanly, which is how thumbs
    // actually move between left and right on a d-pad.
    this.releaseButton(current);
    this.held.delete(pointerId);
    if (id) this.press(pointerId, id);
    else this.held.set(pointerId, '');
  }

  private press(pointerId: number, id: string): void {
    this.held.set(pointerId, id);
    this.pressed.add(id);
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

  private releaseButton(id: string): void {
    if (id === '') return;
    this.pressed.delete(id);
    this.releasedAt.set(id, time.elapsed);
    const action = this.actionFor(id);
    // Only lift the action if no other finger is still on a button using it.
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
    this.pressed.clear();
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

    for (const b of this.buttons()) this.drawButton(g, b, this.pressed.has(b.id));

    if (this.mode === 'gameplay' && this.contextAction) {
      this.drawButton(g, {
        id: 'context',
        action: this.contextAction,
        label: this.contextLabel,
        color: PAL.lime,
        shape: CONTEXT_SHAPE,
        pad: 10,
      }, this.pressed.has('context'));
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
