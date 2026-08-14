/**
 * Input with buffering. Pillar #1 is "movement feels good", and most of that is
 * forgiveness: every action press is remembered for a short window so an input
 * that lands a few frames early still fires.
 */

export type Action =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'jump'
  | 'dash'
  | 'attack'
  | 'throw'
  | 'interact'
  | 'workbench'
  | 'confirm'
  | 'cancel'
  | 'restart';

const KEY_MAP: Record<string, Action[]> = {
  KeyA: ['left'],
  ArrowLeft: ['left'],
  KeyD: ['right'],
  ArrowRight: ['right'],
  KeyW: ['up'],
  ArrowUp: ['up'],
  KeyS: ['down'],
  ArrowDown: ['down'],
  Space: ['jump'],
  KeyZ: ['jump'],
  ShiftLeft: ['dash'],
  ShiftRight: ['dash'],
  KeyL: ['dash'],
  KeyJ: ['attack'],
  KeyX: ['attack'],
  KeyK: ['throw'],
  KeyC: ['throw'],
  KeyE: ['interact', 'confirm'],
  Enter: ['confirm'],
  Tab: ['workbench'],
  Escape: ['cancel'],
  KeyR: ['restart'],
};

/** How long (seconds) a press stays "fresh" in the buffer. */
const BUFFER_TIME = 0.12;

export class Input {
  private down = new Set<Action>();
  private pressedAt = new Map<Action, number>();
  private consumed = new Set<Action>();
  private now = 0;

  /** Pointer position in canvas pixels, set by the renderer each frame. */
  pointerX = 0;
  pointerY = 0;
  pointerDown = false;

  /** True once the player has actually touched a control. */
  anyInputSeen = false;

  /**
   * Set while on-screen touch controls are visible. Raw mouse clicks then stop
   * mapping to attack/throw, so tapping a button doesn't also swing the weapon.
   * Touch devices never produce mouse events, so this only matters when the
   * touch layout is forced on a desktop for testing.
   */
  suppressMouse = false;

  /**
   * Press a virtual button. Routed through exactly the same state as a key, so
   * touch input inherits the buffering, `take()` semantics and blur handling
   * for free — nothing downstream can tell the difference.
   */
  virtualDown(action: Action): void {
    if (this.down.has(action)) return;
    this.anyInputSeen = true;
    this.down.add(action);
    this.pressedAt.set(action, this.now);
    this.consumed.delete(action);
  }

  virtualUp(action: Action): void {
    this.down.delete(action);
  }

  attach(target: HTMLElement | Window = window): void {
    window.addEventListener('keydown', (e) => {
      const actions = KEY_MAP[e.code];
      if (!actions) return;
      // Tab and Space would otherwise scroll or move focus out of the canvas.
      e.preventDefault();
      if (e.repeat) return;
      this.anyInputSeen = true;
      for (const a of actions) {
        this.down.add(a);
        this.pressedAt.set(a, this.now);
        this.consumed.delete(a);
      }
    });

    window.addEventListener('keyup', (e) => {
      const actions = KEY_MAP[e.code];
      if (!actions) return;
      e.preventDefault();
      for (const a of actions) this.down.delete(a);
    });

    // Losing focus mid-run should not leave the player sprinting into a pit.
    window.addEventListener('blur', () => this.releaseAll());

    target.addEventListener('mousedown', (e) => {
      if (this.suppressMouse) return;
      const btn = (e as MouseEvent).button;
      this.anyInputSeen = true;
      this.pointerDown = true;
      const action: Action = btn === 2 ? 'throw' : 'attack';
      this.down.add(action);
      this.pressedAt.set(action, this.now);
      this.consumed.delete(action);
    });
    target.addEventListener('mouseup', (e) => {
      if (this.suppressMouse) return;
      const btn = (e as MouseEvent).button;
      this.pointerDown = false;
      this.down.delete(btn === 2 ? 'throw' : 'attack');
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  releaseAll(): void {
    this.down.clear();
    this.pressedAt.clear();
    this.pointerDown = false;
  }

  /** Called once per frame before the sim step. */
  update(now: number): void {
    this.now = now;
  }

  held(action: Action): boolean {
    return this.down.has(action);
  }

  /** True if the action was pressed within the buffer window and not consumed. */
  pressed(action: Action): boolean {
    if (this.consumed.has(action)) return false;
    const t = this.pressedAt.get(action);
    return t !== undefined && this.now - t <= BUFFER_TIME;
  }

  /** Consume a buffered press so it cannot trigger twice. */
  consume(action: Action): void {
    this.consumed.add(action);
    this.pressedAt.delete(action);
  }

  /** pressed() + consume() in one call. */
  take(action: Action): boolean {
    if (!this.pressed(action)) return false;
    this.consume(action);
    return true;
  }

  /** -1, 0 or 1 horizontal intent. */
  moveX(): number {
    return (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
  }

  moveY(): number {
    return (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0);
  }
}

export const input = new Input();
