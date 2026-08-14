/** Small math helpers. Everything here is allocation-free and hot-path safe. */

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

/**
 * Frame-rate independent exponential approach. `rate` is roughly "how much of
 * the remaining distance is covered per second" (0.99 = very snappy).
 */
export const damp = (a: number, b: number, rate: number, dt: number): number =>
  lerp(a, b, 1 - Math.pow(1 - rate, dt * 60));

/** Move `a` toward `b` by at most `maxDelta`. */
export function approach(a: number, b: number, maxDelta: number): number {
  if (a < b) return Math.min(a + maxDelta, b);
  if (a > b) return Math.max(a - maxDelta, b);
  return b;
}

export const smoothstep = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/** Cheap ease used all over the attack curves: fast out, slow in. */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number): number => t * t * t;
export const easeOutBack = (t: number): number => {
  const c = 1.9;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

export const dist2 = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
};

/** Shortest signed angular difference from a to b, in radians. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const pointInRect = (px: number, py: number, r: Rect): boolean =>
  px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;

/** Distance from a point to a rect (0 when inside). Used for radial hitboxes. */
export function rectPointDist(r: Rect, px: number, py: number): number {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Does an arc (cone) centered at (cx,cy) intersect a rect? This is the melee
 * hit test: swings are cones, not boxes, so the arc VFX and the damage agree.
 */
export function arcHitsRect(
  cx: number,
  cy: number,
  radius: number,
  facing: number,
  halfAngle: number,
  r: Rect,
): boolean {
  if (rectPointDist(r, cx, cy) > radius) return false;
  // Test the rect centre plus its corners against the cone.
  const px = [r.x + r.w / 2, r.x, r.x + r.w, r.x, r.x + r.w];
  const py = [r.y + r.h / 2, r.y, r.y, r.y + r.h, r.y + r.h];
  for (let i = 0; i < px.length; i++) {
    const dx = px[i] - cx;
    const dy = py[i] - cy;
    if (dx * dx + dy * dy > radius * radius) continue;
    const ang = Math.atan2(dy, dx);
    if (Math.abs(angleDelta(facing, ang)) <= halfAngle) return true;
  }
  return false;
}
