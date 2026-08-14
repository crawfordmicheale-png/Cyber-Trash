import type { Renderer } from '../render/renderer';
import { VIEW_W, VIEW_H } from '../render/renderer';
import type { World } from './world';
import { PAL, RARITY, rgba } from '../render/palette';
import { drawText, textWidth } from '../render/text';
import { drawWeapon } from './weapon';
import { time } from '../core/time';
import { clamp } from '../core/math';

/**
 * HUD.
 *
 * Styled as scavenged hardware: hard-edged bars, corner brackets, CRT green
 * readouts. Nothing here uses a rounded corner or a gradient — it should look
 * bolted on, not designed.
 */

/**
 * The vertical slice ships one authored layer. Depth advances through sectors
 * of THE SCRAP rather than pretending to be layers whose art doesn't exist yet.
 */
export const SECTORS_IN_SLICE = 3;

/** Full name, for notifications and the run summary. */
export function layerName(depth: number): string {
  return `LAYER 01 // THE SCRAP  SECTOR 0${Math.min(depth + 1, SECTORS_IN_SLICE)}`;
}

/** Short form for the HUD strip, which shares the top row with the weapon card. */
export function layerNameShort(depth: number): string {
  return `THE SCRAP // 0${Math.min(depth + 1, SECTORS_IN_SLICE)}`;
}

export function drawHud(r: Renderer, world: World): void {
  const g = r.g;
  g.setTransform(1, 0, 0, 1, 0, 0);
  const p = world.player;

  // ---- health -----------------------------------------------------------
  const hpW = 84;
  const hpPct = clamp(p.hp / p.maxHp, 0, 1);
  g.fillStyle = rgba(PAL.black, 0.8);
  g.fillRect(6, 6, hpW + 4, 9);
  g.fillStyle = PAL.metalDark;
  g.fillRect(8, 8, hpW, 5);
  // Low health pulses; it should be impossible to die surprised.
  const hpColor = hpPct < 0.3
    ? (Math.sin(time.elapsed * 9) > 0 ? PAL.blood : PAL.orange)
    : PAL.blood;
  r.glowRect(8, 8, Math.round(hpW * hpPct), 5, hpColor, 1, 2);
  // Segment ticks every 25 HP so damage is countable at a glance.
  g.fillStyle = rgba(PAL.black, 0.75);
  for (let v = 25; v < p.maxHp; v += 25) {
    g.fillRect(8 + Math.round((v / p.maxHp) * hpW), 8, 1, 5);
  }
  drawText(g, `${Math.max(0, Math.ceil(p.hp))}`, 8 + hpW + 8, 8, { color: PAL.white, shadow: PAL.black });

  // ---- ammo -------------------------------------------------------------
  if (p.weapon.ammoCost > 0 || p.ammo < p.maxAmmo) {
    const aW = 52;
    const aPct = clamp(p.ammo / p.maxAmmo, 0, 1);
    g.fillStyle = rgba(PAL.black, 0.8);
    g.fillRect(6, 18, aW + 4, 7);
    g.fillStyle = PAL.metalDark;
    g.fillRect(8, 20, aW, 3);
    r.glowRect(8, 20, Math.round(aW * aPct), 3, PAL.yellow, 0.9, 1);
    drawText(g, `${p.ammo}`, 8 + aW + 8, 19, { color: PAL.yellow, shadow: PAL.black });
  }

  // ---- dash charges -----------------------------------------------------
  for (let i = 0; i < p.maxDashCharges; i++) {
    const filled = i < p.dashCharges;
    const x = 8 + i * 7;
    const y = 28;
    if (filled) r.glowRect(x, y, 5, 3, p.character.accent, 1, 1);
    else { g.fillStyle = PAL.metalDark; g.fillRect(x, y, 5, 3); }
  }

  // ---- weapon card ------------------------------------------------------
  const w = p.weapon;
  const cardW = 148;
  const cardX = VIEW_W - cardW - 6;
  const cardY = 6;
  r.panel(cardX, cardY, cardW, 40, rgba(RARITY[w.rarity].color, 0.9), 0.78);

  // Row 1: the generated name gets the full card width. Names like
  // "AUTONOMOUS ELECTRIFIED NAILGUN OF QUESTIONABLE INTEGRITY" are the point of
  // the build system, so they scroll rather than truncate.
  const nameColor = RARITY[w.rarity].color;
  const pad = 6;
  const maxTextW = cardW - pad * 2;
  const nw = textWidth(w.name);
  let nameX = cardX + pad;
  const clipped = nw > maxTextW;
  if (clipped) {
    nameX -= (Math.sin(time.elapsed * 0.6) * 0.5 + 0.5) * (nw - maxTextW);
    g.save();
    g.beginPath();
    g.rect(cardX + pad - 1, cardY + 3, maxTextW + 2, 11);
    g.clip();
  }
  drawText(g, w.name, nameX, cardY + 5, { color: nameColor, glow: nameColor, shadow: PAL.black });
  if (clipped) g.restore();

  // Row 2: the assembled weapon, drawn small, with its stats beside it.
  drawWeapon(r, w, cardX + pad + 4, cardY + 26, -0.24, false, 1);
  drawText(g, `${w.style.label} ${w.damage.toFixed(0)}DMG`, cardX + cardW - pad, cardY + 18, {
    color: w.style.glow, align: 'right', shadow: PAL.black,
  });
  if (w.instability > 0) {
    const risky = Math.sin(time.elapsed * 8) > 0;
    drawText(g, `UNSTABLE ${(w.instability * 100).toFixed(0)}%`, cardX + cardW - pad, cardY + 28, {
      color: risky ? PAL.orange : PAL.blood, align: 'right', shadow: PAL.black,
    });
  } else {
    drawText(g, w.base.name, cardX + cardW - pad, cardY + 28, {
      color: PAL.metalHi, align: 'right', shadow: PAL.black,
    });
  }

  // ---- layer + climb ----------------------------------------------------
  drawText(g, layerNameShort(world.depth), VIEW_W / 2 - 30, 7, {
    color: PAL.cyan, glow: PAL.cyanDim, align: 'center', shadow: PAL.black,
  });

  // Climb meter down the right edge: the "always curious what's above" pillar,
  // made legible.
  const meterH = 116;
  const meterX = VIEW_W - 8;
  const meterY = 62;
  g.fillStyle = rgba(PAL.black, 0.7);
  g.fillRect(meterX - 1, meterY - 2, 4, meterH + 4);
  g.fillStyle = PAL.metalDark;
  g.fillRect(meterX, meterY, 2, meterH);
  const climb = world.climbProgress;
  const markerY = meterY + meterH - climb * meterH;
  r.glowRect(meterX, markerY, 2, meterH - (markerY - meterY), PAL.cyan, 0.55, 1);
  r.glowRect(meterX - 2, Math.round(markerY) - 1, 6, 2, PAL.white, 1, 2);
  drawText(g, 'EXIT', meterX + 4, meterY - 10, { color: PAL.cyan, align: 'right' });

  // ---- scrap ------------------------------------------------------------
  drawText(g, `SCRAP ${p.scrap}`, 8, VIEW_H - 12, { color: PAL.metalHi, shadow: PAL.black });
  drawText(g, `KILLS ${world.kills}`, 8, VIEW_H - 22, { color: PAL.metalHi, shadow: PAL.black });

  // ---- notifications ----------------------------------------------------
  let ny = VIEW_H - 46;
  for (const n of world.notifications) {
    const a = clamp(n.life / 0.6, 0, 1);
    drawText(g, `+ ${n.text}`, 8, ny, { color: n.color, glow: n.color, alpha: a, shadow: PAL.black });
    ny -= 10;
  }

  // ---- workbench prompt -------------------------------------------------
  if (world.nearWorkbench) {
    const y = VIEW_H - 60;
    const label = '[TAB] WORKBENCH';
    const tw = textWidth(label) + 12;
    r.panel(VIEW_W / 2 - tw / 2, y - 4, tw, 15, PAL.lime, 0.8);
    drawText(g, label, VIEW_W / 2, y, { color: PAL.lime, glow: PAL.lime, align: 'center' });
  }

  if (world.exitReached) {
    const label = 'LAYER CLEARED';
    drawText(g, label, VIEW_W / 2, VIEW_H / 2 - 20, {
      color: PAL.white, glow: PAL.cyan, align: 'center', scale: 2,
    });
    drawText(g, '[E] ASCEND', VIEW_W / 2, VIEW_H / 2 + 2, {
      color: PAL.cyan, glow: PAL.cyan, align: 'center',
    });
  }
}

export interface RunTotals {
  depth: number;
  scrap: number;
  kills: number;
  elapsed: number;
  banked: number;
}

/**
 * Run stat readout for the end-of-run screens. These are whole-run totals, not
 * the final sector's — the run is the unit the player cares about.
 */
export function drawRunSummary(r: Renderer, totals: RunTotals, x: number, y: number): void {
  const g = r.g;
  const mins = Math.floor(totals.elapsed / 60);
  const secs = Math.floor(totals.elapsed % 60);
  const lines: [string, string, string][] = [
    ['REACHED', `SECTOR 0${Math.min(totals.depth + 1, SECTORS_IN_SLICE)}`, PAL.white],
    ['SCRAP', String(totals.scrap), PAL.white],
    ['KILLS', String(totals.kills), PAL.white],
    ['TIME', `${mins}:${String(secs).padStart(2, '0')}`, PAL.white],
    ['BANKED', String(totals.banked), PAL.lime],
  ];
  let ly = y;
  for (const [k, v, color] of lines) {
    drawText(g, k, x, ly, { color: PAL.metalHi });
    drawText(g, v, x + 52, ly, { color, glow: color === PAL.lime ? PAL.lime : undefined });
    ly += 11;
  }
}
