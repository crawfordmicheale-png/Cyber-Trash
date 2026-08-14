import type { Renderer } from '../render/renderer';
import { VIEW_W, VIEW_H } from '../render/renderer';
import type { Player } from './player';
import { PAL, RARITY, rgba } from '../render/palette';
import { drawText, textWidth } from '../render/text';
import { assemble, drawWeapon, weaponStats } from './weapon';
import type { BasePart, CorePart, ModPart } from './parts.data';
import { BASES, CORES, MODS } from './parts.data';
import { input } from '../core/input';
import { audio } from '../core/audio';
import { time } from '../core/time';
import { particles } from '../fx/particles';
import { clamp } from '../core/math';
import { weaponSprite } from '../art/weapons';
import { save } from '../core/save';

/**
 * The workbench.
 *
 * "Inventory screens should feel like the player literally dumped their backpack
 * onto a workbench" — so this is three grubby columns of loose parts with a live
 * preview of whatever monstrosity they currently add up to.
 */

type Column = 0 | 1 | 2;

const COLUMN_TITLES = ['BASE', 'POWER', 'MOD'];
const ROWS_VISIBLE = 7;

export class Workbench {
  open = false;
  private column: Column = 0;
  private cursor: [number, number, number] = [0, 0, 0];
  private scroll: [number, number, number] = [0, 0, 0];
  /** Currently selected part per slot; null = nothing fitted. */
  private selection: [BasePart | null, CorePart | null, ModPart | null] = [null, null, null];
  private openTime = 0;

  show(player: Player): void {
    this.open = true;
    this.openTime = 0;
    player.locked = true;
    this.selection = [player.weapon.base, player.weapon.core, player.weapon.mod];
    // Put the cursor on whatever is already fitted.
    const lists = this.lists(player);
    for (let c = 0; c < 3; c++) {
      const sel = this.selection[c];
      const idx = sel ? lists[c].findIndex((p) => p && p.id === sel.id) : 0;
      this.cursor[c] = Math.max(0, idx);
      this.scroll[c] = 0;
    }
    audio.ui('select');
  }

  hide(player: Player): void {
    this.open = false;
    player.locked = false;
    audio.ui('back');
  }

  /**
   * Column contents. Index 0 of core/mod is the "nothing fitted" slot.
   *
   * Ordering is canonical (the order the parts are declared in the data tables),
   * NOT "equipped first". That matters: fitting a part changes what's equipped,
   * and an equipped-first list would resort itself underneath the cursor, so the
   * next confirm would silently fit whatever slid into that row.
   */
  private lists(player: Player): [BasePart[], (CorePart | null)[], (ModPart | null)[]] {
    const ownedBases = new Set(player.inventory.bases.map((b) => b.id));
    ownedBases.add(player.weapon.base.id);
    const bases = BASES.filter((b) => ownedBases.has(b.id));

    const ownedCores = new Set(player.inventory.cores.map((c) => c.id));
    if (player.weapon.core) ownedCores.add(player.weapon.core.id);
    const cores: (CorePart | null)[] = [null, ...CORES.filter((c) => ownedCores.has(c.id))];

    const ownedMods = new Set(player.inventory.mods.map((m) => m.id));
    if (player.weapon.mod) ownedMods.add(player.weapon.mod.id);
    const mods: (ModPart | null)[] = [null, ...MODS.filter((m) => ownedMods.has(m.id))];

    return [bases, cores, mods];
  }

  update(player: Player, dt: number): void {
    if (!this.open) return;
    this.openTime += dt;
    const lists = this.lists(player);

    if (input.take('cancel') || input.take('workbench')) {
      this.commit(player);
      this.hide(player);
      return;
    }

    if (input.take('left') && this.column > 0) {
      this.column = (this.column - 1) as Column;
      audio.ui('move');
    }
    if (input.take('right') && this.column < 2) {
      this.column = (this.column + 1) as Column;
      audio.ui('move');
    }

    const list = lists[this.column];
    if (input.take('up')) {
      this.cursor[this.column] = (this.cursor[this.column] - 1 + list.length) % list.length;
      audio.ui('move');
    }
    if (input.take('down')) {
      this.cursor[this.column] = (this.cursor[this.column] + 1) % list.length;
      audio.ui('move');
    }

    // Keep the cursor inside the visible window.
    const c = this.column;
    const cur = this.cursor[c];
    if (cur < this.scroll[c]) this.scroll[c] = cur;
    if (cur >= this.scroll[c] + ROWS_VISIBLE) this.scroll[c] = cur - ROWS_VISIBLE + 1;

    // Live preview: selection follows the cursor, so you feel the build change
    // as you scroll rather than after committing.
    this.selection[0] = (lists[0][this.cursor[0]] ?? player.weapon.base) as BasePart;
    this.selection[1] = lists[1][this.cursor[1]] ?? null;
    this.selection[2] = lists[2][this.cursor[2]] ?? null;

    if (input.take('confirm') || input.take('attack')) {
      this.commit(player);
      audio.craft();
      particles.shimmer(player.x, player.y - 14, player.weapon.style.glow, 18);
    }
  }

  private commit(player: Player): void {
    const [base, core, mod] = this.selection;
    player.equip(base, core, mod);
    // Anything fitted counts as learned, and survives death.
    for (const p of [base, core, mod]) {
      if (p && !save.knows(p.id)) save.data.blueprints.push(p.id);
    }
    save.save();
  }

  draw(r: Renderer, player: Player): void {
    if (!this.open) return;
    const g = r.g;
    g.setTransform(1, 0, 0, 1, 0, 0);

    const t = clamp(this.openTime / 0.16, 0, 1);
    g.fillStyle = rgba(PAL.void, 0.9 * t);
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    if (t < 1) return;

    const lists = this.lists(player);
    const preview = assemble(
      this.selection[0] ?? player.weapon.base,
      this.selection[1],
      this.selection[2],
    );

    // --- header
    drawText(g, 'WORKBENCH', VIEW_W / 2, 8, {
      color: PAL.lime, glow: PAL.lime, align: 'center', scale: 2, shadow: PAL.black,
    });
    drawText(g, 'BOLT WHATEVER YOU FOUND ONTO WHATEVER YOU HAVE', VIEW_W / 2, 24, {
      color: PAL.metalHi, align: 'center',
    });

    // --- columns
    const colW = 132;
    const gap = 8;
    const totalW = colW * 3 + gap * 2;
    const startX = (VIEW_W - totalW) / 2;
    const listY = 40;

    for (let c = 0; c < 3; c++) {
      const x = startX + c * (colW + gap);
      const activeCol = c === this.column;
      const accent = activeCol ? PAL.lime : PAL.metal;
      r.panel(x, listY, colW, ROWS_VISIBLE * 12 + 16, accent, 0.86);
      drawText(g, COLUMN_TITLES[c], x + 6, listY + 5, {
        color: activeCol ? PAL.lime : PAL.metalHi,
        glow: activeCol ? PAL.lime : undefined,
      });

      const list = lists[c];
      const from = this.scroll[c];
      for (let i = 0; i < ROWS_VISIBLE; i++) {
        const idx = from + i;
        if (idx >= list.length) break;
        const part = list[idx];
        const y = listY + 16 + i * 12;
        const selected = idx === this.cursor[c];

        if (selected) {
          g.fillStyle = rgba(activeCol ? PAL.lime : PAL.metalLit, 0.22);
          g.fillRect(x + 2, y - 2, colW - 4, 11);
          drawText(g, '>', x + 4, y, { color: activeCol ? PAL.lime : PAL.metalHi });
        }

        if (!part) {
          drawText(g, '-- EMPTY --', x + 14, y, { color: PAL.metal });
          continue;
        }

        const col = RARITY[part.rarity].color;
        // Icon.
        const icon = weaponSprite(part.slot === 'base' ? part.sprite : part.sprite);
        g.save();
        g.globalAlpha = 0.9;
        const scale = part.slot === 'base' ? 0.5 : 1;
        g.translate(x + 18, y + 4);
        g.scale(scale, scale);
        g.drawImage(icon.base, -icon.ox, -icon.oy);
        g.restore();

        const label = part.name.length > 17 ? `${part.name.slice(0, 16)}.` : part.name;
        drawText(g, label, x + 26, y, { color: col });
      }

      // Scroll hint.
      if (list.length > ROWS_VISIBLE) {
        drawText(g, `${this.cursor[c] + 1}/${list.length}`, x + colW - 6, listY + 5, {
          color: PAL.metalHi, align: 'right',
        });
      }
    }

    // --- preview
    const pY = listY + ROWS_VISIBLE * 12 + 24;
    r.panel(startX, pY, totalW, 56, rgba(RARITY[preview.rarity].color, 0.9), 0.9);

    // The assembled weapon, idly rotating so you can read the silhouette.
    drawWeapon(r, preview, startX + 44, pY + 26, Math.sin(time.elapsed * 0.9) * 0.14 - 0.2, false, 1, 1);

    const nameColor = RARITY[preview.rarity].color;
    drawText(g, preview.name, startX + 80, pY + 8, {
      color: nameColor, glow: nameColor, shadow: PAL.black,
    });

    // Stat chips.
    let sx = startX + 80;
    const sy = pY + 20;
    for (const stat of weaponStats(preview)) {
      const w = textWidth(stat) + 6;
      if (sx + w > startX + totalW - 8) break;
      g.fillStyle = rgba(preview.style.glow, 0.16);
      g.fillRect(sx, sy - 2, w, 11);
      drawText(g, stat, sx + 3, sy, { color: preview.style.core });
      sx += w + 3;
    }

    // Risk / flavour line.
    const risk = preview.core?.risk ?? preview.mod?.risk;
    const flavour = preview.mod?.desc ?? preview.core?.desc ?? preview.base.desc;
    drawText(g, flavour, startX + 80, pY + 34, { color: PAL.metalHi });
    if (risk) {
      const warn = Math.sin(time.elapsed * 7) > 0 ? PAL.orange : PAL.blood;
      drawText(g, `! ${risk}`, startX + 80, pY + 44, { color: warn });
    }

    // --- controls
    drawText(g, 'ARROWS MOVE   ENTER FIT   TAB CLOSE', VIEW_W / 2, VIEW_H - 10, {
      color: PAL.metal, align: 'center',
    });
  }
}
