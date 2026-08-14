# CYBER-TRASH — High-Level Game Bible

The design document this project is built from. Preserved as the source of
truth; implementation notes elsewhere in `docs/` describe how much of it is
currently real.

---

## 1. Elevator pitch

CYBER-TRASH is a fast, stylish 2D action-platformer roguelite set inside a
colossal vertical scrapyard built from centuries of discarded technology,
machinery, weapons, chemicals, robots, and people.

You are another piece of garbage thrown into The Stack.

Your objective is simple: **Climb. Kill. Scavenge. Build. Escape.**

The player fights upward through increasingly dangerous layers of the
megastructure, collecting junk and combining it into absurd weapons and
upgrades.

The defining visual philosophy is equally important:

> Almost nothing needs traditional character animation.

Characters and enemies are primarily static pixel-art sprites. Motion and combat
are communicated through squash/stretch, rotation, recoil, displacement,
particles, dust, screen effects, weapon movement, and exaggerated neon VFX.

The result should feel like pixel-art graffiti violently coming alive.

## 2. Genre

**Primary:** 2D Action Platformer.
**Secondary:** Roguelite · Loot/Build Crafting · Action RPG · Light Extraction.

**Run structure:** Enter The Stack → Fight → Explore → Scavenge → Build Weapons
→ Defeat Bosses → Climb → Die/Escape → Upgrade → Repeat.

Runs should be immediately playable but support increasingly ridiculous builds.

## 3. The world

Human civilization didn't solve its waste problem. It built upward instead.

Eventually everything unwanted was dumped beneath civilization: machinery,
electronics, weapons, industrial waste, obsolete robots, failed biotech,
corrupted AI systems, toxic chemicals, abandoned infrastructure, criminals,
debtors, political undesirables, entire forgotten communities.

Over centuries these layers became a massive artificial ecosystem known simply
as **THE STACK**.

Nobody knows how deep it actually goes. People living near the bottom aren't
even sure the surface exists anymore.

## 4. Player fantasy

The player begins as practically nobody — a scavenger using whatever they could
find.

```
Rusty Pipe
  ↓
Electrified Pipe
  ↓
Electrified Pipe + Broken Plasma Cell
  ↓
Overcharged Plasma Maul
  ↓
Overcharged Plasma Maul of questionable structural integrity
firing chain lightning while leaking radioactive sludge
```

The game embraces improvisation. Nothing matches. Nothing is supposed to.

## 5. Core mechanic — BUILD FROM TRASH

Weapons are assembled from scavenged components. Rather than finding endless
complete swords and guns, players primarily discover parts.

**Weapon bases:** Pipe · Cleaver · Crowbar · Scrap Sword · Pistol Frame ·
Nailgun · Shotgun Receiver · Industrial Drill · Broken Drone · Saw Blade

**Power sources:** Battery · Plasma Cell · Toxic Canister · Reactor Fragment ·
Corrupted Data Core · Void Battery

**Modifiers:** Servo Motor · Magnet · Capacitor · Pressure Tank · Cooling Coil ·
Targeting Chip · Chainsaw Motor · Broken AI Module

Components physically alter the weapon. Therefore:

> **BUILD = STATS + BEHAVIOR + APPEARANCE**

## 6. Weapon philosophy

Weapons are separate objects attached to the character rather than baked into
character animation. This allows huge weapon variety.

- **Melee** — blades, clubs, cleavers, chainsaws, powered fists, spears
- **Ranged** — scrap pistols, rifles, nailguns, plasma weapons, junk cannons, beam weapons
- **Thrown** — grenades, toxic cans, saw blades, drones, mines
- **Energy** — arc weapons, plasma blades, corrupted-data weapons, elemental devices
- **Heavy** — industrial equipment, cannons, giant hammers, construction machinery

The best weapons should often look like something that absolutely should not
work.

## 7. Combat

Combat is fast, readable and extremely punchy. The character itself performs
minimal animation. Instead, attacks are communicated through **weapon motion +
VFX + physics + sound**.

A sword attack might consist of:

1. Weapon rotates rapidly.
2. Character leans slightly.
3. Giant neon slash appears.
4. Enemy receives knockback.
5. Hit spark appears.
6. Camera bumps.
7. Brief hit-stop occurs.
8. Pixel debris explodes outward.

The result should feel far more animated than the actual sprites are.

## 8. Movement

Movement should feel excellent despite minimal sprite animation.

- **Running** — static sprite, slight forward lean, subtle vertical bob, tiny
  squash/stretch, dust particles behind the feet.
- **Jump** — character compresses, launches, sprite stretches vertically, slight
  rotation while airborne.
- **Landing** — fast squash, dust explosion, small camera shake.
- **Dash** — player partially obscured by glitch trails, neon streaks,
  afterimages, pixel distortion.
- **Wall movement** — wall slide produces sparks, dust, tiny debris.

Again: effects create the illusion of animation.

## 9. Combat effects

Slash arcs · whirlwind attacks · projectile trails · muzzle flashes · hit sparks
· explosions · electricity · toxic clouds · pixel corruption · elemental bursts ·
dust · debris · buff auras · charge circles.

Effects can be recoloured and combined. This dramatically expands content
without requiring completely new artwork.

## 10. Enemy philosophy

Enemies follow exactly the same production philosophy as the player: static
sprite + simple transformations + VFX. This makes a huge enemy roster practical.

**Common** — Scrap Rat · Garbage Hound · Data Mite · Glitch Goblin · Toxic Slime · Spare Drone
**Uncommon** — Rust Crawler · Neon Lurker · Wire Wraith · Batterbot · Shiv Splicer · Leaking Barrel
**Elite** — Junk Butcher · Overclocked Sentinel · Plague Technician
**Rare** — Hacker Shade · Night Reaper · Void Fiend · Circuit Breaker · Spike Monger · Drone Commander
**Bosses** — Waste Worm · Megawatt Colossus · Data Grave
**World / mini bosses** — Railspine Behemoth · Smog King · Scrap Titan

## 11. The Stack

| Layer | Name | Description |
| --- | --- | --- |
| 01 | THE SCRAP | Mountains of discarded machinery. Rust, conveyor belts, crushed cars, broken robots. The starting region. |
| 02 | TOXIC WORKS | Abandoned chemical processing. Acid pools, leaking pipes, mutated enemies. |
| 03 | DEAD NETWORK | An enormous abandoned data center. Servers still running centuries later; corrupted programs manifesting physically. |
| 04 | MACHINE SLUMS | Settlements built by scavengers. Markets, factions, NPCs, weapon builders, black-market technology. |
| 05 | NEON UNDERCITY | A forgotten city buried beneath newer civilization. Arcades, nightclubs, apartments, factories — everything still glowing despite being abandoned. |
| 06 | CORPORATE WASTE | Highly advanced discarded technology. Security systems become extremely dangerous. Where the player begins discovering uncomfortable truths. |
| 07 | THE SURFACE | Unknown. Reaching it becomes the game's central mystery. |

## 12. Roguelite structure

Runs begin from a persistent settlement deep inside The Stack.

**Temporary:** weapons, weapon components, buffs, mutations, consumables.
**Permanent:** blueprints, characters, crafting knowledge, NPCs, new vendors,
shortcuts, lore, permanent upgrades.

Death removes most run-specific equipment. But knowledge remains.

## 13. Build system

The game should encourage broken combinations.

```
Nailgun + Toxic Canister            = Poison Nailgun
      + Ricochet Chip               = Poison Ricochet Nailgun
      + Overcharged Battery         = Electrified Poison Ricochet Nailgun
      + Corrupted AI                = ...now the gun occasionally chooses
                                      its own targets. Including bad ones.
```

The philosophy: **every upgrade should change how something behaves — not merely
increase a number.**

## 14. Risky technology

Some of the strongest components are unstable.

> **CRACKED REACTOR** — +300% weapon damage. But every attack has a small chance
> to overload.

> **BOOTLEG TARGETING AI** — Projectiles automatically seek enemies.
> Unfortunately, the AI is extremely stupid.

This gives the game humor without turning the entire world into a joke.

## 15. Visual identity

The aesthetic is deliberately different from polished cyberpunk. Think:
*cyberpunk technology after fifty years in a landfill.*

**Ingredients:** black backgrounds · dirty metal · rust · cables · broken screens
· CRT displays · spray paint · graffiti · warning labels · duct tape · leaking
batteries · exposed circuitry · improvised armor.

Against extremely bright: **cyan · magenta · toxic green · violet · hazard
orange**.

The contrast is critical.

## 16. Pixel art philosophy

Characters should remain relatively detailed and readable. We are not chasing
strict historical pixel-art limitations. Instead: **modern pixel art pretending
it came from hardware that never existed.**

Characters should have recognizable silhouettes, clothing, equipment and
personalities. Particles can be chunky and deliberately messy. Glow should
enhance the pixel art without making everything blurry.

## 17. Character animation philosophy

Traditional animation is intentionally minimized. Characters primarily use
scaling, squash/stretch, rotation, translation, weapon rotation, recoil,
hit-stop, particles, trails, afterimages, shader effects and screen shake.

Idle breathing could simply be approximately `100% → 101–102% → 100%`. Extremely
subtle.

This becomes part of the game's visual signature while massively reducing asset
production requirements.

## 18. Death

Death should be spectacular. Enemies can explode into pixels, collapse into
scrap, glitch apart, burst into toxic sludge, shatter, become corrupted data, or
break into individual mechanical pieces.

Different damage types can produce different deaths. This adds enormous visual
variety without requiring death animations.

## 19. Tone

The world is grim. The people aren't necessarily.

The Stack is filled with people surviving through humor, graffiti, scavenger
culture, ridiculous technology, music, underground markets, strange religions,
gangs and communities.

The setting can tell serious stories without becoming relentlessly depressing.

## 20. UI

The UI should look like scavenged technology: hacked CRT terminals, cracked
handheld computers, industrial displays, spray-painted signage.

Typography should combine clean pixel fonts with graffiti-style headers.
Inventory screens should feel like the player literally dumped their backpack
onto a workbench.

## 21. Sound

**Music:** industrial + synthwave + punk + breakbeat + distorted electronic.

**SFX** should be exaggerated: metal clangs, electrical crackles, huge impacts,
dirty gunshots, digital glitches. The audio carries part of the animation
workload.

## 22. Design pillars

1. **MOVEMENT FEELS GOOD** — before anything else, simply controlling the
   character must be enjoyable.
2. **COMBAT FEELS VIOLENT** — hits need weight. VFX, sound, recoil, hit-stop and
   physics accomplish this.
3. **BUILD SOMETHING STUPID** — players should constantly wonder "what happens
   if I attach this to this?"
4. **CLIMB HIGHER** — the player should always be curious about what exists
   above them.
5. **EVERYTHING IS TRASH** — the world, weapons, enemies, UI and lore should
   reinforce the same identity.

## 23. Scope advantage

The static-character approach isn't merely an artistic choice. It is a
production strategy.

One character sprite can support hundreds of weapons, dozens of buffs, multiple
movement abilities, many attack types, cosmetic equipment and elemental effects.
Likewise, one enemy sprite can support numerous behaviors without requiring
massive animation sheets.

That allows development effort to go toward more enemies, more weapons, more
builds, more areas and better gameplay.

## 24. The one-sentence vision

> CYBER-TRASH is a neon pixel-art action-platformer roguelite where a discarded
> scavenger climbs through a civilization-sized garbage megastructure, bolting
> together increasingly ridiculous weapons from the technological trash of the
> world above.

### North star

When someone sees ten seconds of gameplay, they should immediately recognize it.
Not because it resembles another pixel-art game. Because they see a static
little scavenger rocket across the screen in a cloud of neon garbage, swing a
chainsaw welded to a plasma battery, obliterate a mutant trash monster in a
shower of glowing pixels, grab whatever falls out of it, and bolt that shit onto
their weapon.

That's CYBER-TRASH.
