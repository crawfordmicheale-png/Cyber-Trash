# CYBER-TRASH

A neon pixel-art action-platformer roguelite where a discarded scavenger climbs
through a civilization-sized garbage megastructure, bolting together
increasingly ridiculous weapons from the technological trash of the world above.

This repository is a **playable vertical slice**: the whole loop runs end to end
(settlement → climb → fight → scavenge → build → escape or die → upgrade →
repeat), built on Layer 01, THE SCRAP.

**Play it:** https://crawfordmicheale-png.github.io/Cyber-Trash/

```bash
npm install
npm run dev     # http://localhost:5173
```

Every push to `main` builds the game and publishes it to GitHub Pages
(`.github/workflows/pages.yml`). The workflow runs typecheck, build and the
full smoke suite first, so a broken build never reaches the deployed site.

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

On a phone or tablet, on-screen controls appear automatically: a movement pad
under the left thumb, action buttons under the right, and a contextual button
that only shows up when there is something to interact with. Menus get a d-pad
plus OK/BACK. Add `?touch=1` to force the same layout on a desktop.

`?kit=1` in the URL hands over one of every component, for poking at the build
system without grinding drops.

## Testing on your phone

The quickest route is the deployed site — open
https://crawfordmicheale-png.github.io/Cyber-Trash/ on the phone and hold it in
landscape.

To test uncommitted work instead, `npm run dev` binds to every interface and
prints a LAN address alongside the local one:

```
  CYBER-TRASH
    local    http://localhost:5173
    network  http://192.168.1.24:5173   <- open this on your phone
```

Open the network URL on a device on the same Wi-Fi and hold it in landscape —
portrait shows a rotate prompt. On iOS, "Add to Home Screen" launches it without
browser chrome, which is the only reliable way to get fullscreen there.

If the boot screen ever sits there doing nothing, it will now say why instead:
a watchdog outside the bundle reports a missing `bundle.js`, a script error, or
a browser too old to run the code. The boot screen also shows a short build
stamp, and the bundle URL is cache-busted on every build, so you can tell at a
glance whether the phone is actually running the latest code.

## What's here

**Movement** — the first pillar. Run acceleration and friction, variable-height
jumps, coyote time, input buffering on every action, a flat i-frame dash with
afterimages, wall slide and wall jump, one-way catwalks. Keyboard, mouse and
touch all feed the same buffered input state, so nothing downstream knows or
cares which one you used.

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
workbench → combat → sector transition → extraction → death, then repeats the
critical path in a phone-sized viewport with touch emulation — asserting that
taps actually move the player and that releasing actually stops them. It fails
on any console error or page exception. It needs a Chromium binary; set
`CHROMIUM_PATH` if `playwright install chromium` put it somewhere non-default.
It caught two real bugs during development (see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#testing)).

## Documentation

- [docs/GAME_BIBLE.md](docs/GAME_BIBLE.md) — the design bible this is built from
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — code map and system boundaries
- [docs/GAME_FEEL.md](docs/GAME_FEEL.md) — the static-sprite animation model and every tuning constant
- [docs/ASSET_PIPELINE.md](docs/ASSET_PIPELINE.md) — how to author or replace art
- [docs/ROADMAP.md](docs/ROADMAP.md) — what is deliberately not built yet
