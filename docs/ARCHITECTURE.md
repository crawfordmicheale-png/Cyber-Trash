# Architecture

No engine, no runtime dependencies. TypeScript bundled by esbuild, rendered to a
single 2D canvas. The whole game is ~130 KB minified.

## Layering

Modules only depend downward. `core` knows nothing about the game; `render`
knows nothing about gameplay; `game` is the only layer that knows about all of
it.

```
core/     loop, fixed timestep, input, time control, camera, RNG, audio, save
render/   canvas, sprite compiler, palette, pixel font
fx/       particles, mid-level effects, death dispatcher
art/      character maps for players, enemies, weapons, props
game/     level, actors, weapons, combat resolution, UI
main.ts   screens and run lifecycle
```

## Core

**`loop.ts`** — fixed 120 Hz simulation with an accumulator, capped at 8 steps
per frame so a stalled tab can't spiral. 120 Hz rather than 60 because the dash
(390 px/s) and projectiles (up to 520 px/s) would otherwise tunnel through
16 px tiles.

**`time.ts`** — one place owns hit-stop and slow-motion. `time.step(rawDt)`
returns the scaled gameplay dt; hit-stop returns exactly `0`, which freezes the
sim while `time.elapsed` keeps running so VFX and UI stay alive during the
freeze.

**`input.ts`** — every action press is timestamped and stays "fresh" for 120 ms.
`take()` = `pressed()` + `consume()`. This buffer is why an input that lands a
few frames early still fires; it is load-bearing for game feel, not a nicety.

**`camera.ts`** — damped follow with velocity look-ahead (more when falling than
rising: you need to see the floor). Shake is trauma-squared, so small hits barely
register and big ones are violent. The view origin is integer-snapped or the
whole scene shimmers.

**`audio.ts`** — procedural WebAudio. Oscillators and three noise buffers
(white, pink, and a ring-modulated "metal"), fed through a limiter. Sounds are
throttled per-key so a shotgun doesn't stack twelve blasts.

**`save.ts`** — `localStorage`, degrades to in-memory if unavailable. Holds
banked scrap, blueprints, unlocked characters and permanent upgrade levels.

## Render

**`sprite.ts`** — the sprite compiler. Sprites are authored as arrays of
character-map rows and compiled once at boot into three canvases:

| Canvas | Purpose |
| --- | --- |
| `base` | the sprite |
| `glow` | blurred copy of only the emissive pixels, drawn additively |
| `silhouette` | solid white mask, used for hit flash and afterimages |

Baking the glow at load time means neon costs one extra blit per draw instead of
a per-frame blur — which matters because nearly everything in this game glows.

**`renderer.ts`** — draws into a 480×270 buffer, then upscales to fit the
window. `drawSprite` is the single call that replaces frame animation: scale for
squash/stretch, rotation for lean and swings, flash for impacts. The CRT pass
(scanlines, vignette, chromatic aberration, glitch bands, screen flash) runs at
composite time.

Scaling has two modes. At 2x or more the scale is floored to an integer, which
keeps every pixel square. Below that it stays fractional — a phone in landscape
lands near 1.4x, and flooring it to 1x would shrink the game to a stamp in the
middle of the screen. Filling the screen wins there. The backing store is sized
to `cssScale × devicePixelRatio` (capped at 2) so phones render at device
resolution instead of having the compositor blur an undersized canvas.

There is also an **overlay** canvas, composited last at 1:1 with no zoom and no
shake. Touch controls live there: a button that moves with the camera is a
button you miss.

**`text.ts`** — a 5×7 pixel font defined inline as binary row strings, compiled
into a white atlas and tinted per colour on demand.

## FX

**`particles.ts`** — a 2200-slot pool with nine particle kinds and named
emitters (`runDust`, `landDust`, `dashTrail`, `wallSparks`, `impact`,
`scrapBurst`, `sludgeBurst`, `glitchBurst`, `implode`, `ashBurst`, `muzzle`).
Particles do most of the work of selling motion, since the sprites barely move.

**`fx.ts`** — the big readable shapes: slash arcs (three concentric strokes —
bloom, body, hot core — plus dripping paint), shockwave rings, afterimages,
floating text, beams, auras and charge circles.

**`deaths.ts`** — dispatches on the killing element. `shatterSprite` reads the
sprite's own pixels back out of its canvas and launches them outward, so a
kinetic death disassembles the exact thing you were looking at.

## Game

**`level.ts`** — a 30-tile-wide vertical shaft (480 px, exactly one screen, so
the climb is purely vertical). Generation walks a critical path bottom-to-top,
placing each ledge within `MAX_JUMP_UP` / `MAX_JUMP_ACROSS` of the last — the
climb is always possible by construction — then adds optional side ledges,
hazards, spawns, loot and set dressing around it.

**`actor.ts`** — shared body and presentation state. Collision is axis-separated
AABB against the tile grid: horizontal first, then vertical, so walking into a
wall never eats the jump. Holds the squash spring, lean, flash and status
timers; `drawScale()` returns the final scale including idle breathing.

**`player.ts`** — movement tuning constants, the attack state machine
(windup → active → recover) and the weapon pose curves. Every archetype has its
own pose function; a swing rotates the weapon through an arc, a thrust
translates it forward, a spin rotates it twice around.

**`weapon.ts`** — `assemble(base, core, mod)` derives stats, behaviour flags,
generated name, rarity, and the recoloured sprite from three parts. This is the
one function that makes "BUILD = STATS + BEHAVIOR + APPEARANCE" true.

**`enemy.ts`** — one class for the whole roster; behaviour switches on
`def.behavior`. Adding an enemy is a row in `enemies.data.ts` plus one character
map.

**`world.ts`** — the simulation, and the single place combat resolves.
`damageInArc` (melee cones), `damageInLine` (beams), `explode` (radial) and
`chainFrom` all funnel into `Enemy.hit`, so feedback is identical no matter what
caused the damage. Entities outside a 2.2-screen box are skipped.

**`workbench.ts`** — the build UI. Part lists are in canonical data-table order,
deliberately *not* equipped-first (see below).

**`touch.ts`** — on-screen controls. Two layouts (gameplay and menu) plus one
contextual button that appears only when there is something to interact with.
Every press routes through `input.virtualDown/Up`, which is the same state the
keyboard writes to, so buffering, `take()` semantics and blur handling all come
for free and no gameplay code has a touch branch in it. Pointer events are
tracked per `pointerId`, so multi-touch works and sliding a thumb from one pad
to another hands the action over cleanly. Move and release are bound to the
window rather than the canvas — a thumb that slides off the edge still has to
let go of the button, or the player runs into a pit forever.

## Testing

`scripts/smoke.mjs` drives a real Chromium through the entire loop and asserts
on live state exposed at `window.cyberTrash`. It found two real bugs:

1. **Equip mismatch.** The workbench originally listed the equipped base first.
   Fitting a part changed what was equipped, which resorted the list underneath
   the cursor, so the *next* confirm silently fitted whatever slid into that
   row. Fixed by using canonical ordering; the test now asserts the committed
   weapon matches the previewed one.

2. **Explosion recursion.** An explosive mod called `world.explode`, which
   damaged enemies via `Enemy.hit`, which re-triggered the explosive mod — an
   infinite recursion that blew the stack the first time a grenade landed in a
   crowd. Fixed with an `allowSecondary` flag on `hit` plus a re-entry guard on
   `explode`.

A second pass then repeats the critical path in a 844×390 viewport with touch
emulation: it checks the controls auto-enable, the canvas scales up to the
device's resolution, taps navigate the menus, holding the movement pad actually
moves the player, releasing actually stops them (the classic stuck-virtual-key
bug), the contextual button works, and rotating to portrait keeps everything
alive.

The test also guards frame rate (fails under 45 fps on desktop, 30 on mobile)
and fails on any console error, page exception or failed request.

All of it runs in CI on every push to `main` (`.github/workflows/pages.yml`),
which then publishes `dist/` to GitHub Pages. Deployment is gated on the suite
passing, so the live site is always a build that booted and played.

## Browser support

The bundle targets **ES2019** and is checked against that by the smoke test.
This is not conservatism for its own sake: a syntax feature the browser cannot
parse fails the *entire* bundle before a single line runs, and the symptom is
a boot screen that looks fine and does nothing when tapped. The same rule
applies to runtime APIs used at module-evaluation time — `structuredClone` in
the save store was exactly this bug, and cost every phone older than Safari
15.4 the whole game.

Two guards keep it that way:

- `scripts/smoke.mjs` parses the built bundle as ES2019 and fails on
  `structuredClone`.
- `index.html` carries a plain-ES5 **boot watchdog**, outside the bundle, that
  catches load failures, script errors and unhandled rejections and prints them
  on the boot screen — plus a timeout that speaks up if the bundle never
  signals `window.__cyberTrashReady`. A `<script nomodule>` covers browsers with
  no ES-module support at all.

Anything added at module scope should be assumed to run on the oldest phone
someone will point at the dev server.

One related trap, since it cost a round of debugging: the deployed site must be
a *built* artifact. GitHub Pages was originally serving the repository root,
which has `index.html` but no `bundle.js` — that only exists in `dist/`, which
is gitignored. The page loaded, the script 404'd, and the boot screen sat there
with a tap that did nothing. The Pages workflow now deploys `dist/`.

## Performance notes

- Glow is pre-blurred per sprite, never per frame.
- Particles and projectiles are fixed pools; no per-frame allocation in the hot
  path.
- Terrain draws only the visible tile window.
- Enemies outside a 2.2-screen box are not simulated.
- The chromatic-aberration pass is the most expensive effect and only runs when
  aberration is non-zero.

Measured 60 fps at 1440×900 in headless Chromium during combat.
