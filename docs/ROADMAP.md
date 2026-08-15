# Roadmap

What the vertical slice deliberately does not include, and roughly what each
piece would cost. Ordered by how much it would move the game.

## Not built

### Layers 02–07

Only **Layer 01 — THE SCRAP** exists. The HUD says `SECTOR 01/02/03` rather than
`LAYER 02` on purpose: sectors are the same authored layer with harder spawn
tables, and labelling them as new layers would be a lie the art doesn't back up.

Each new layer needs a terrain kit, a hazard, and a mechanical hook:

| Layer | Kit | Hook |
| --- | --- | --- |
| 02 TOXIC WORKS | pipes, vats, catwalks | acid pools, corrosion over time |
| 03 DEAD NETWORK | server racks, cabling | corrupted programs manifesting physically |
| 04 MACHINE SLUMS | market stalls, shanties | NPCs, vendors, factions — a real hub |
| 05 NEON UNDERCITY | arcades, clubs, apartments | vertical interiors, crowds |
| 06 CORPORATE WASTE | clean-room debris | active security, the lore turn |
| 07 THE SURFACE | — | the answer |

The level generator is layer-agnostic; it takes a tile set and a spawn table.
The expensive part is art, not code.

### Enemy roster

12 of the ~24 enemies in the bible are built. Missing: Shiv
Splicer, Leaking Barrel, Hacker Shade, Night Reaper, Void Fiend, Circuit
Breaker, Spike Monger, Drone Commander, Overclocked Sentinel, Plague Technician.

Most are a data row plus one character map — the seven existing behaviour
routines cover them. A few want new behaviours (Drone Commander needs a summon;
Night Reaper wants a teleport).

### Bosses

Only the **Scrap Titan** mini-boss is in. The Waste Worm, Megawatt Colossus,
Data Grave, Railspine Behemoth and Smog King are not. These are the one place
the static-sprite rule needs bending — a boss wants multi-part sprites with
independently transformed limbs, which the renderer supports (weapons already
work that way) but no boss currently uses.

### The settlement as a place

Right now it's a menu. The bible wants Layer 04 to be an actual explorable hub
with vendors, weapon builders, a black market and NPCs. That means a
non-combat level type, dialogue, and shop inventory persistence.

### Other gaps

- **Music.** SFX are fully procedural; there is no soundtrack.
- **Gamepad.** Keyboard, mouse and touch are supported; gamepad is not.
- **Consumables and mutations.** The bible lists both as run-scoped rewards;
  neither exists. Mods cover some of that ground.
- **Extraction risk.** Currently extracting is strictly better than dying. The
  bible's "light extraction mechanics" imply a real decision — push deeper for
  more, or bank what you have.
- **Weapon durability / heat.** Unstable cores are the only downside pressure.

## Worth doing next

1. **Two more mods with genuinely new behaviour** — the build system is the
   game's identity and it has the best ratio of interest to effort. Something
   that changes movement (a weapon that dashes you on attack) or targeting
   (a weapon that fires backwards) would prove the system stretches.
2. **The extraction decision.** Make banking a real choice: an extraction point
   partway up, with the run's haul at stake. This is the roguelite hook the
   slice is currently missing.
3. **Layer 02.** The second tile kit will show whether the generator's
   assumptions actually generalise, and it is the cheapest way to double the
   apparent size of the game.
4. **Boss #1 proper.** A multi-part boss with real phases, to find out where the
   static-sprite approach stops paying.

## Known rough edges

- The camera clamps horizontally because the shaft is exactly one screen wide.
  A wider layer will need the horizontal look-ahead retuned.
- Elite off-screen markers are a coloured dot; they should be directional
  arrows.
- The workbench has no comparison against the currently equipped weapon — you
  see the preview's stats but not the delta.
- `Enemy.hit` takes seven positional parameters and should become an options
  object before it grows again.
