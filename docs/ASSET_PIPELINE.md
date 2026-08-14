# Asset pipeline

The game ships **no binary assets**. Sprites, the font and every sound are
defined in TypeScript. That keeps the whole game a single ~130 KB bundle, makes
art diffable in code review, and means there is no import step between "draw a
sprite" and "see it in the game".

## Authoring a sprite

A sprite is a palette plus rows of characters. Space and `.` are transparent;
any character not in the palette is also transparent.

```ts
const SCRAP_RAT = def([
  '..........kk........',
  '.........kMMk.......',
  '..kkkkk..kMMk.......',
  '.kMMMMMkkkkkk...kk..',
  '.kMGMMMMMMMMk..kMwk.',
  // ...
]);
```

Rows do not need to be the same length — the compiler pads them. Width is the
longest row; height is the row count.

### Sprite definition

```ts
interface SpriteDef {
  pal: Record<string, string>;   // char -> css colour
  glow?: string;                 // chars that emit light
  rows: string[];
  ox?: number;                   // pivot X, default centre
  oy?: number;                   // pivot Y, default bottom (feet)
  blur?: number;                 // glow radius in sprite pixels, default 2
  glowStrength?: number;         // glow brightness multiplier, default 1
}
```

**Pivots matter.** Characters pivot at the feet (`oy = height`) so squash and
stretch scale from the ground. Weapons pivot on the grip so they rotate around
the hand. Projectiles pivot at their centre.

### Compilation

`compile(def)` produces three canvases once at boot:

- `base` — the sprite
- `glow` — only the emissive pixels, pre-blurred, drawn additively
- `silhouette` — a solid white mask for hit flash and afterimages

`retint(def, remap)` produces a recoloured variant, and `mirror(sprite)` a
horizontally flipped one. Both are how one authored sprite becomes many.

## Palette discipline

The identity is contrast: filthy dark metal against extremely bright neon,
nothing in the comfortable middle. `src/render/palette.ts` holds both halves.

Two rules keep it readable:

1. **Character values sit above environment values.** The player's garment
   mid-tone (`#413c53`) is lighter than any terrain tone, so the silhouette
   never sinks into a cluttered background.
2. **Outlines go darker than the world, not black-ish.** The player outlines at
   `#05050a` while terrain bottoms out at `#1b1826`, which keeps the silhouette
   biting even against a wall.

Neon is applied sparingly — eyes, emblems, energy, graffiti, hazards. Everything
listed in a sprite's `glow` string will bloom, so a sprite that glows everywhere
turns into a smear.

## Where the art lives

| File | Contents |
| --- | --- |
| `src/art/player.ts` | playable characters (17×30) |
| `src/art/enemies.ts` | enemy roster, with collision box sizes |
| `src/art/weapons.ts` | weapon bases, core/mod attachments, projectiles |
| `src/art/props.ts` | terrain tiles, hazards, set dressing, parallax silhouettes |

Weapon bases all point **right**, with the pivot on the grip and two declared
mount points (`mount` for the core, `modMount` for the mod) so attachments bolt
on at the right place and rotate with the swing.

Terrain tiles have **no left/right outline** so they tile seamlessly; the
outline is drawn by the level renderer only on exposed faces.

## Replacing this with real art

The compiler takes any character map, so the cheapest path is to keep the
pipeline and replace the rows. If you want to move to image files instead:

1. Give `Sprite` an alternate constructor that takes an `HTMLImageElement`
   instead of rows — everything downstream only touches `base`, `glow`,
   `silhouette`, `ox`, `oy`.
2. Build the glow layer by masking the source against an emissive map (a second
   image, or a colour-key on the neon palette entries).
3. Keep the pivots. Every transform in the game assumes feet-pivot characters
   and grip-pivot weapons.

`shatterSprite` in `src/fx/deaths.ts` calls `getImageData` on the sprite's
canvas. Loading art from a different origin would taint that canvas; it already
catches the failure and falls back to a generic burst, but same-origin assets
keep the good death.

## Audio

`src/core/audio.ts` synthesises everything at call time: oscillators for tones,
three noise buffers (white, pink, and a ring-modulated "metal") for impacts, all
through a limiter. To add a sound, add a method — there is no asset to register.

There is currently **no music**, only SFX.
