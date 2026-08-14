/**
 * Meta progression.
 *
 * Death removes the run's equipment but not what you learned: blueprints,
 * characters and permanent upgrades persist. This is the "knowledge remains"
 * half of the roguelite loop.
 */

const KEY = 'cyber-trash.save.v1';

export interface SaveData {
  /** Banked scrap, spent between runs. */
  scrap: number;
  /** Part ids the player has ever picked up — the blueprint list. */
  blueprints: string[];
  /** Character ids unlocked. */
  characters: string[];
  /** Deepest layer index reached. */
  bestDepth: number;
  /** Highest single-run scrap haul. */
  bestHaul: number;
  runs: number;
  kills: number;
  /** Permanent upgrade levels. */
  upgrades: {
    vitality: number; // +12 max HP each
    reflex: number; // +1 dash charge at level 1, then cooldown
    scavenger: number; // +15% scrap each
    ordnance: number; // +12 max ammo each
  };
}

/**
 * A brand-new save.
 *
 * Built fresh each call rather than cloned from a shared constant: this runs at
 * module-evaluation time, so it must not depend on anything the browser might
 * not have. `structuredClone` lived here and is only available from Safari
 * 15.4 — on an older phone it threw before a single line of the game ran, which
 * left the boot screen up and every tap doing nothing.
 */
function freshSave(): SaveData {
  return {
    scrap: 0,
    blueprints: [],
    characters: ['drifter'],
    bestDepth: 0,
    bestHaul: 0,
    runs: 0,
    kills: 0,
    upgrades: { vitality: 0, reflex: 0, scavenger: 0, ordnance: 0 },
  };
}

export const UPGRADE_INFO = {
  vitality: { name: 'REINFORCED RIBS', desc: '+12 MAX HP', baseCost: 120, step: 90, max: 6 },
  reflex: { name: 'SALVAGED SERVOS', desc: '+1 DASH CHARGE', baseCost: 260, step: 240, max: 2 },
  scavenger: { name: 'SCAVENGER EYE', desc: '+15% SCRAP', baseCost: 150, step: 120, max: 5 },
  ordnance: { name: 'AMMO WEBBING', desc: '+12 MAX AMMO', baseCost: 100, step: 70, max: 5 },
} as const;

export type UpgradeKey = keyof SaveData['upgrades'];

class SaveStore {
  data: SaveData = freshSave();
  /** False when localStorage is unavailable (private mode, file://, etc). */
  persistent = true;

  load(): void {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      const base = freshSave();
      this.data = {
        ...base,
        ...parsed,
        upgrades: { ...base.upgrades, ...(parsed.upgrades ?? {}) },
      };
    } catch {
      // A corrupt save should never stop the game booting.
      this.persistent = false;
      this.data = freshSave();
    }
  }

  save(): void {
    if (!this.persistent) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      this.persistent = false;
    }
  }

  reset(): void {
    this.data = freshSave();
    this.save();
  }

  /** Record everything a finished run leaves behind. */
  bankRun(opts: { scrap: number; depth: number; kills: number; blueprints: string[] }): void {
    const mult = 1 + this.data.upgrades.scavenger * 0.15;
    this.data.scrap += Math.round(opts.scrap * mult);
    this.data.bestDepth = Math.max(this.data.bestDepth, opts.depth);
    this.data.bestHaul = Math.max(this.data.bestHaul, opts.scrap);
    this.data.kills += opts.kills;
    this.data.runs += 1;
    for (const id of opts.blueprints) {
      if (!this.data.blueprints.includes(id)) this.data.blueprints.push(id);
    }
    this.save();
  }

  upgradeCost(key: UpgradeKey): number {
    const info = UPGRADE_INFO[key];
    const level = this.data.upgrades[key];
    if (level >= info.max) return Infinity;
    return info.baseCost + info.step * level;
  }

  buyUpgrade(key: UpgradeKey): boolean {
    const cost = this.upgradeCost(key);
    if (!Number.isFinite(cost) || this.data.scrap < cost) return false;
    this.data.scrap -= cost;
    this.data.upgrades[key]++;
    this.save();
    return true;
  }

  unlockCharacter(id: string, cost: number): boolean {
    if (this.data.characters.includes(id)) return false;
    if (this.data.scrap < cost) return false;
    this.data.scrap -= cost;
    this.data.characters.push(id);
    this.save();
    return true;
  }

  hasCharacter(id: string): boolean {
    return this.data.characters.includes(id);
  }

  knows(partId: string): boolean {
    return this.data.blueprints.includes(partId);
  }
}

export const save = new SaveStore();
