# Game feel

> Before anything else, simply controlling the character must be enjoyable.

Everything in this document exists to serve that. It is also where the game's
central production bargain is spelled out: **characters are static sprites, and
motion is manufactured**.

## The animation model

A character has exactly one sprite. Four numbers animate it.

| Value | Driven by | Reads as |
| --- | --- | --- |
| **squash spring** | landings, jumps, hits, attacks | weight and impact |
| **lean** | horizontal velocity | momentum |
| **rotation** | air time, wall jumps, hit reactions | tumble and recoil |
| **flash** | taking damage | contact |

Plus idle breathing — the sprite scales to about 101.5% and back on a slow sine,
per-actor phase-offset so a crowd doesn't pulse in lockstep. It is almost
subliminal and it is the difference between "a character standing still" and "a
sticker".

The squash spring is a real spring (`stiffness 240`, `damping 16`), not a
keyframe. Impulses kick `squashVel`; positive squashes (wide and short, for
landings), negative stretches (tall and thin, for launches). Because it's a
spring it overshoots and settles, which is what makes a landing feel like it has
mass.

Running adds a vertical bob — `-|sin(t·17)| · 1.6px` scaled by speed — instead
of a walk cycle. At 32 px tall, with dust behind the feet, it reads as running.

## Movement constants

All in `src/game/player.ts`. Units are pixels and seconds.

```
RUN_SPEED        132     ~8 tiles/sec
ACCEL_GROUND    1500     ~0.09s to top speed
ACCEL_AIR        950     air control, deliberately weaker
FRICTION_GROUND 2000     stops in ~0.07s — crisp, not slippery
FRICTION_AIR     260     you keep your momentum in the air
GRAVITY_UP       900
GRAVITY_DOWN    1320     falls bite, rises float
MAX_FALL         460
JUMP_VELOCITY    300     ~50px = 3.1 tiles
JUMP_CUT        0.42     releasing early keeps 42% of upward speed
COYOTE_TIME     0.10     jump after walking off a ledge
input buffer    0.12     every action, not just jump
WALL_SLIDE       62
WALL_JUMP_X/Y  210/292
DASH_SPEED       390
DASH_TIME       0.15
DASH_COOLDOWN   0.42     charges refund on landing
INVULN_TIME     0.85
```

Three of these do most of the forgiveness work:

- **Asymmetric gravity.** Rising at 900 and falling at 1320 gives you hang time
  at the apex to aim, then drops you decisively. A symmetric arc feels floaty in
  both directions.
- **Coyote time + input buffer.** Together they mean the jump you *meant* is the
  jump you get, whether you pressed slightly early or slightly late.
- **Jump cut.** Height is continuous, not binary, so the same button covers a
  small hop and a full leap.

The dash is deliberately **flat** — it zeroes vertical velocity. Curved dashes
are harder to aim and read worse; a flat one is a readable line across the
screen, which is what the afterimages are drawing.

## Impact

A melee hit is seven things happening at once, none of which is a sprite frame:

1. The weapon rotates through its arc (the weapon is a separate object, so this
   is real motion, not implied).
2. The character leans and shifts forward.
3. A neon slash arc appears — three concentric strokes (bloom, body, hot core)
   with dripping paint particles along it.
4. The enemy squashes, flashes white, and takes knockback.
5. An impact star bursts at the contact point.
6. The whole sim freezes for 20–120 ms.
7. The camera gains trauma and takes a directional kick, and pixel debris flies.

**Hit-stop** is the single most important one. It scales with weapon weight and
the number of targets hit, and it's clamped so a chainsaw's multi-hit doesn't
lock the game up. Without it, hits read as overlaps; with it, they read as
collisions.

**Trauma-squared shake** means a rat and a boss don't shake the same. Shake is
two out-of-phase sines rather than random offsets — random reads as noise,
oscillating reads as impact.

## Deaths

Death presentation is picked by the damage element, which is how one sprite gets
seven distinct deaths for free:

| Element | Death |
| --- | --- |
| kinetic | `scrap` — sprite shatters into its own pixels + metal chunks |
| shock / plasma | `burst` — shockwave rings, sprite blows apart |
| toxic | `sludge` — heavy droplets, pooling, vapour |
| data | `glitch` — grid-snapped bits, torn afterimage bands, screen corruption |
| void | `implode` — everything falls inward and vanishes |
| fire | `ash` — sprite crumbles, embers rise, smoke |

`shatterSprite` reads the sprite's pixels back out of its own canvas, so the
debris is literally the thing you were just looking at.

## Screen effects

- **Scanlines and vignette**, always on. The "found in a landfill" texture.
- **Chromatic aberration** on dash and damage. Capped at 0.6 and composited at
  26% alpha — an early build ran this at 50% and doubled the entire frame, which
  read as "the game broke" rather than "you got hit".
- **Glitch bands** on data damage and death: horizontal slices displaced and
  tinted.
- **Damage vignette** at the screen edges only. Never a full-screen red wash —
  the fight has to stay legible at the moment you most need to read it.
- **Zoom punch** driven by camera trauma, up to 3.5%.

## Enemy tells

Every committed attack has a visible wind-up: the enemy shakes with increasing
amplitude, flashes at 35%, and grows a charge circle that closes as the attack
approaches. The telegraph duration is per-enemy data (0.4–0.7s). An attack that
can hurt you and has no tell is a bug.
