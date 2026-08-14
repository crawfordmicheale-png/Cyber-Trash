# CYBER-TRASH

A neon pixel-art action-platformer roguelite where a discarded scavenger climbs
through a civilization-sized garbage megastructure, bolting together
increasingly ridiculous weapons from the technological trash of the world above.

This repository is a **playable vertical slice**: the whole loop runs end to end
(settlement → climb → fight → scavenge → build → escape or die → upgrade →
repeat), built on Layer 01, THE SCRAP.

```bash
npm install
npm run dev     # http://localhost:5173
```

## Controls

| Action | Keys |
| --- | --- |
| Move | `A` / `D` or `←` / `→` |
| Jump | `Space` / `Z` — hold for height, tap for a hop |
| Drop through a catwalk | `S` + `Space` |
| Dash | `Shift` / `L` — i-frames, refunded on landing |
| Attack | `J` / `X` / left mouse |
| Throw grenade | `K` / `C` / right mouse |
| Workbench | `Tab` (while standing at a bench) |
| Ascend at the exit | `E` |
| Menus | Arrows + `Enter`, `Esc` to back out |

`?kit=1` in the URL hands over one of every component, for poking at the build
system without grinding drops.

## What's here

**Movement** — the first pillar. Run acceleration and friction, variable-height
jumps, coyote time, input buffering on every action, a flat i-frame dash with
afterimages, wall slide and wall jump, one-way catwalks.

**Combat** — seven attack archetypes (swing, thrust, spin, single shot, burst,
lob, hitscan beam), each with its own weapon-motion curve. Hits land with
hit-stop, trauma-based screen shake, knockback, a neon slash arc, an impact
star, and pixel debris.

**Build from trash** — 11 weapon bases × 6 power cores × 12 mods. A build
produces stats *and* behaviour *and* appearance: the core recolours the weapon
and drives every VFX and sound, and mods change what attacks physically do
(ricochet, homing, pierce, multishot, explode, chain, lifesteal, magnet,
multi-hit). Unstable cores can overload in your hands. Names are generated from
the parts — `AUTONOMOUS OVERCHARGED CANNON OF QUESTIONABLE INTEGRITY` is a real
weapon you can assemble.

**Enemies** — 11 enemies across four tiers driven by seven shared behaviour
routines, with visible telegraphs before every committed attack. Deaths vary by
damage type: kinetic shatters the sprite into its own pixels, toxic bursts into
sludge, data corrupts into glitch bits, void implodes.

**The Stack** — a vertical shaft generated per run. Generation walks a
guaranteed critical path of ledges, every one inside the player's jump envelope,
then decorates around it, so a run is always climbable and never the same shape.

**Roguelite loop** — three sectors per run, run summary, banked scrap
(everything on extraction, 45% on death), four permanent upgrades, a second
unlockable character, and a blueprint list that persists across deaths.

## Production philosophy

Almost nothing in this game has traditional character animation. Every character
and enemy is **one static sprite**; motion comes from a shared transform stack —
squash/stretch springs, lean, rotation, idle breathing, hit flash — plus
particles, dust, trails, hit-stop and screen effects.

That is a production strategy as much as an art direction. One 17×30 character
sprite supports every weapon, element, movement ability and status effect in the
game, so effort goes into more enemies, more weapons and more builds instead of
animation sheets. See [docs/GAME_FEEL.md](docs/GAME_FEEL.md).

## Assets

There are **no binary assets**. Sprites are authored as character maps in
TypeScript (`src/art/`), compiled at boot into base/glow/silhouette canvases.
The pixel font is defined inline in `src/render/text.ts`. All audio is
synthesised at call time from oscillators and noise buffers in
`src/core/audio.ts`.

The art in `src/art/` was authored to match the reference sheets that framed
this project (character line-up, weapon sheet, enemy roster, VFX sheet, Layer 01
environment kit) — the sheets themselves are not in the repository, so these are
new sprites in that style rather than slices of those images. The sprite
compiler takes any character map, so swapping in real art is a matter of
replacing the rows. See [docs/ASSET_PIPELINE.md](docs/ASSET_PIPELINE.md).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | esbuild watch + dev server on :5173 |
| `npm run build` | production bundle to `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run smoke` | headless Playwright run through the whole loop |
| `npm run check` | typecheck + build + smoke |

The smoke test drives a real browser through title → settlement → run →
workbench → combat → sector transition → extraction → death, asserts on live sim
state, and fails on any console error or page exception. It needs a Chromium
binary; set `CHROMIUM_PATH` if `playwright install chromium` put it somewhere
non-default. It caught two real bugs
during development (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#testing)).

## Documentation

- [docs/GAME_BIBLE.md](docs/GAME_BIBLE.md) — the design bible this is built from
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — code map and system boundaries
- [docs/GAME_FEEL.md](docs/GAME_FEEL.md) — the static-sprite animation model and every tuning constant
- [docs/ASSET_PIPELINE.md](docs/ASSET_PIPELINE.md) — how to author or replace art
- [docs/ROADMAP.md](docs/ROADMAP.md) — what is deliberately not built yet
