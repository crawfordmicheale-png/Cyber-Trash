import { Renderer, VIEW_W, VIEW_H } from './render/renderer';
import { Loop } from './core/loop';
import { input } from './core/input';
import { time } from './core/time';
import { audio } from './core/audio';
import { save, UPGRADE_INFO, type UpgradeKey } from './core/save';
import { Rng } from './core/rng';
import { PAL, RARITY, rgba } from './render/palette';
import { drawText, drawGraffiti, textWidth } from './render/text';
import { World } from './game/world';
import { Workbench } from './game/workbench';
import { drawHud, drawRunSummary, layerName, SECTORS_IN_SLICE } from './game/hud';
import { characters, type CharacterArt } from './art/player';
import { particles } from './fx/particles';
import { fx } from './fx/fx';
import { prop } from './art/props';
import { ALL_PARTS } from './game/parts.data';
import type { Player } from './game/player';
import { touch } from './game/touch';

type Screen = 'title' | 'settlement' | 'run' | 'dead' | 'extracted';

/**
 * Game shell: screens, run lifecycle, and the bridge between the persistent
 * settlement and a run inside The Stack.
 */
class Game {
  private renderer: Renderer;
  readonly loop: Loop;
  world: World | null = null;
  readonly workbench = new Workbench();

  screen: Screen = 'title';
  private screenTime = 0;

  /** Settlement menu state. */
  private menuIndex = 0;
  private charIndex = 0;

  /** Run-scoped bookkeeping that survives sector transitions. */
  private runSeed = 0;
  private runDepth = 0;
  private carriedPlayer: Player | null = null;
  private runScrapTotal = 0;
  private runKillsTotal = 0;
  private runElapsed = 0;
  private banked = false;

  private titleRng = new Rng(1);

  constructor(mount: HTMLElement) {
    this.renderer = new Renderer(mount);
    this.loop = new Loop({
      step: (dt) => this.step(dt),
      render: () => this.render(),
    });
    input.attach(this.renderer.canvas);
    touch.attach(this.renderer);
    save.load();
  }

  start(): void {
    this.loop.start();
    this.exposeDebugHandle();
  }

  /**
   * Read-only view of the live sim, for the headless smoke test to assert
   * against. Nothing in the game reads this back.
   */
  private exposeDebugHandle(): void {
    Object.defineProperty(window, 'cyberTrash', {
      value: {
        get screen() { return gameInstance?.screen; },
        get weapon() { return gameInstance?.world?.player.weapon.name ?? null; },
        get damage() { return gameInstance?.world?.player.weapon.damage ?? 0; },
        get hp() { return gameInstance?.world?.player.hp ?? 0; },
        get kills() { return gameInstance?.world?.kills ?? 0; },
        get workbenchOpen() { return gameInstance?.workbench.open ?? false; },
        get nearWorkbench() { return gameInstance?.world?.nearWorkbench ?? false; },
        get fps() { return gameInstance?.loop.fps ?? 0; },
        get touchEnabled() { return touch.enabled; },
        get touchMode() { return touch.mode; },
        get playerX() { return gameInstance?.world?.player.x ?? 0; },
        get playerY() { return gameInstance?.world?.player.y ?? 0; },
        /**
         * Mutating test hooks, only wired up under ?kit=1. They exist so the
         * smoke test can reach the run-ending screens without having to
         * platform its way to the top of the shaft.
         */
        dev: devHooks(),
      },
      configurable: true,
    });
  }

  // ---- lifecycle --------------------------------------------------------

  private startRun(): void {
    const roster = characters();
    const character = roster[this.charIndex] ?? roster[0];
    this.runSeed = (Math.random() * 0xffffffff) >>> 0;
    this.runDepth = 0;
    this.runScrapTotal = 0;
    this.runKillsTotal = 0;
    this.runElapsed = 0;
    this.carriedPlayer = null;
    this.banked = false;
    this.buildWorld(character);
    this.screen = 'run';
    this.screenTime = 0;
    time.reset();
  }

  private buildWorld(character: CharacterArt): void {
    this.world?.dispose();
    const world = new World(this.renderer, character, this.runDepth, this.runSeed + this.runDepth * 7919);

    if (this.carriedPlayer) {
      world.adopt(this.carriedPlayer);
    } else {
      // Apply permanent upgrades on the fresh run only.
      const p = world.player;
      p.maxHp += save.data.upgrades.vitality * 12;
      p.hp = p.maxHp;
      p.maxDashCharges += save.data.upgrades.reflex;
      p.dashCharges = p.maxDashCharges;
      p.maxAmmo += save.data.upgrades.ordnance * 12;
      p.ammo = p.maxAmmo;
    }

    // ?kit=1 hands over one of every component. Useful for exercising the build
    // system without grinding for drops.
    if (new URLSearchParams(location.search).has('kit')) {
      for (const part of ALL_PARTS) world.player.addPart(part);
      world.notify('DEV KIT: ALL PARTS', PAL.lime);
    }

    this.world = world;
    world.notify(layerName(this.runDepth), PAL.cyan);
  }

  private nextSector(): void {
    const world = this.world;
    if (!world) return;
    this.runScrapTotal += world.runScrap;
    this.runKillsTotal += world.kills;
    this.runElapsed += world.elapsed;

    if (this.runDepth + 1 >= SECTORS_IN_SLICE) {
      this.finishRun('extracted');
      return;
    }

    this.runDepth++;
    this.carriedPlayer = world.player;
    // Ascending patches you up a little; it is the only free healing in a run.
    this.carriedPlayer.heal(Math.round(this.carriedPlayer.maxHp * 0.25));
    this.carriedPlayer.ammo = this.carriedPlayer.maxAmmo;
    this.buildWorld(world.player.character);
    this.renderer.screenFlash(PAL.cyan, 0.7);
    audio.layerClear();
  }

  private finishRun(outcome: 'dead' | 'extracted'): void {
    const world = this.world;
    if (world && !this.banked) {
      this.banked = true;
      if (outcome === 'dead') {
        this.runScrapTotal += world.runScrap;
        this.runKillsTotal += world.kills;
        this.runElapsed += world.elapsed;
      }
      const blueprints = [
        world.player.weapon.base.id,
        world.player.weapon.core?.id,
        world.player.weapon.mod?.id,
        ...world.player.inventory.bases.map((b) => b.id),
        ...world.player.inventory.cores.map((c) => c.id),
        ...world.player.inventory.mods.map((m) => m.id),
      ].filter((v): v is string => typeof v === 'string');

      // Extraction keeps the whole haul; dying leaves most of it in the Stack.
      const kept = outcome === 'extracted' ? this.runScrapTotal : Math.round(this.runScrapTotal * 0.45);
      save.bankRun({
        scrap: kept,
        depth: this.runDepth,
        kills: this.runKillsTotal,
        blueprints,
      });
    }
    this.screen = outcome;
    this.screenTime = 0;
  }

  private toSettlement(): void {
    this.world?.dispose();
    this.world = null;
    this.carriedPlayer = null;
    this.screen = 'settlement';
    this.screenTime = 0;
    this.menuIndex = 0;
    time.reset();
  }

  // ---- update -----------------------------------------------------------

  private step(dt: number): void {
    this.screenTime += dt;

    switch (this.screen) {
      case 'title': this.stepTitle(dt); break;
      case 'settlement': this.stepSettlement(dt); break;
      case 'run': this.stepRun(dt); break;
      case 'dead':
      case 'extracted': this.stepSummary(dt); break;
    }

    // Ambient particles keep running on menus so nothing ever looks frozen.
    if (this.screen !== 'run') {
      particles.update(dt);
      fx.update(dt);
      if (this.titleRng.chance(dt * 6)) {
        particles.spawn({
          kind: 'glow',
          x: this.titleRng.range(0, VIEW_W),
          y: VIEW_H + 4,
          vy: -this.titleRng.range(10, 34),
          vx: this.titleRng.spread(1) * 8,
          life: this.titleRng.range(1.4, 3.4),
          size: this.titleRng.range(0.8, 1.8),
          color: this.titleRng.chance(0.5) ? PAL.magenta : PAL.cyan,
          additive: true,
          grow: 0.4,
        });
      }
    }
  }

  private stepTitle(dt: number): void {
    void dt;
    if (input.take('confirm') || input.take('jump') || input.take('attack')) {
      audio.ui('select');
      this.toSettlement();
    }
  }

  private stepSettlement(dt: number): void {
    void dt;
    const options = this.settlementOptions();

    if (input.take('up')) {
      this.menuIndex = (this.menuIndex - 1 + options.length) % options.length;
      audio.ui('move');
    }
    if (input.take('down')) {
      this.menuIndex = (this.menuIndex + 1) % options.length;
      audio.ui('move');
    }

    const roster = characters();
    if (input.take('left') || input.take('right')) {
      const dir = input.held('left') ? -1 : 1;
      this.charIndex = (this.charIndex + dir + roster.length) % roster.length;
      audio.ui('move');
    }

    if (input.take('confirm') || input.take('attack')) {
      const opt = options[this.menuIndex];
      if (opt.kind === 'descend') {
        const chosen = roster[this.charIndex];
        if (save.hasCharacter(chosen.id)) {
          this.startRun();
        } else if (save.unlockCharacter(chosen.id, chosen.unlockCost)) {
          audio.craft();
        } else {
          audio.ui('back');
        }
      } else if (opt.kind === 'upgrade') {
        if (save.buyUpgrade(opt.key)) {
          audio.craft();
          particles.shimmer(VIEW_W / 2, VIEW_H / 2, PAL.lime, 14);
        } else {
          audio.ui('back');
        }
      }
    }
  }

  private stepRun(dt: number): void {
    const world = this.world;
    if (!world) return;

    // Workbench overlay swallows gameplay input while open.
    if (this.workbench.open) {
      this.workbench.update(world.player, dt);
      world.camera.follow(world.player.x, world.player.y - 14, 0, 0, dt);
      return;
    }

    if (world.nearWorkbench && input.take('workbench')) {
      this.workbench.show(world.player);
      return;
    }

    world.update(dt);

    if (world.exitReached && input.take('interact')) {
      this.nextSector();
      return;
    }

    if (world.player.dead && world.player.onGround) {
      // Let the death effects breathe before the summary takes over.
      if (this.screenTime > 0.1) this.finishRun('dead');
    }
  }

  private stepSummary(dt: number): void {
    void dt;
    if (this.screenTime < 0.6) return;
    if (input.take('confirm') || input.take('restart') || input.take('jump')) {
      audio.ui('select');
      this.toSettlement();
    }
  }

  // ---- render -----------------------------------------------------------

  private render(): void {
    const r = this.renderer;

    switch (this.screen) {
      case 'title': this.drawTitle(); break;
      case 'settlement': this.drawSettlement(); break;
      case 'run': {
        const world = this.world;
        if (world) {
          world.draw();
          drawHud(r, world, touch.enabled);
          this.workbench.draw(r, world.player);
        }
        break;
      }
      case 'dead':
      case 'extracted': {
        const world = this.world;
        if (world) {
          world.draw();
          r.g.setTransform(1, 0, 0, 1, 0, 0);
        }
        this.drawSummary();
        break;
      }
    }

    r.clearOverlay();
    this.syncTouchControls();
    touch.draw(r);

    r.present();
    r.decay(1 / 60);
  }

  /**
   * Point the touch layout at whatever the current screen needs, and surface the
   * one contextual action that would otherwise be a hidden keyboard shortcut.
   */
  private syncTouchControls(): void {
    if (!touch.enabled) return;

    if (this.screen === 'run' && !this.workbench.open) {
      touch.setMode('gameplay');
      touch.tapAnywhereConfirm = false;
      const world = this.world;
      if (world?.exitReached) {
        touch.contextAction = 'interact';
        touch.contextLabel = 'UP';
      } else if (world?.nearWorkbench) {
        touch.contextAction = 'workbench';
        touch.contextLabel = 'BUILD';
      } else {
        touch.contextAction = null;
      }
      return;
    }

    touch.contextAction = null;
    if (this.screen === 'run' || this.screen === 'settlement') {
      // Workbench and settlement are list menus: d-pad plus confirm.
      touch.setMode('menu');
      touch.tapAnywhereConfirm = false;
    } else {
      // Title and the run summary have a single action, so the whole screen is it.
      touch.setMode('menu');
      touch.tapAnywhereConfirm = true;
    }
  }

  private drawBackdrop(): void {
    const r = this.renderer;
    const g = r.g;
    r.clear(PAL.void);
    g.setTransform(1, 0, 0, 1, 0, 0);

    // Distant heaps, slowly drifting: the Stack, seen from the settlement.
    const t = time.elapsed;
    const heap = prop('bgHeap');
    for (let i = 0; i < 5; i++) {
      const x = ((i * 137 + t * 3) % (VIEW_W + 120)) - 60;
      g.globalAlpha = 0.18 + i * 0.05;
      r.drawSprite(heap, x, VIEW_H - 10 + i * 4, { sx: 2 + i * 0.4, sy: 2 + i * 0.4, glow: 0.3 });
    }
    g.globalAlpha = 1;
    particles.draw(r);
    fx.drawOver(r);
  }

  private drawTitle(): void {
    const r = this.renderer;
    const g = r.g;
    this.drawBackdrop();

    const roster = characters();
    const hero = roster[0];
    const bob = Math.sin(time.elapsed * 2.2) * 0.012;
    r.drawSprite(hero.sprite, VIEW_W / 2, VIEW_H - 46, {
      sx: 2 - bob, sy: 2 + bob, glow: 1,
    });

    drawGraffiti(g, 'CYBER-TRASH', VIEW_W / 2, 40, PAL.magenta, 4);
    drawText(g, 'CLIMB. KILL. SCAVENGE. BUILD. ESCAPE.', VIEW_W / 2, 78, {
      color: PAL.cyan, glow: PAL.cyanDim, align: 'center',
    });
    drawText(g, 'YOU ARE ANOTHER PIECE OF GARBAGE THROWN INTO THE STACK.', VIEW_W / 2, 92, {
      color: PAL.metalHi, align: 'center',
    });

    if (Math.sin(time.elapsed * 3.4) > -0.3) {
      drawText(g, '[ ENTER ]', VIEW_W / 2, VIEW_H - 22, {
        color: PAL.lime, glow: PAL.lime, align: 'center',
      });
    }

    if (save.data.runs > 0) {
      drawText(g, `RUNS ${save.data.runs}   BEST SECTOR 0${save.data.bestDepth + 1}   SCRAP ${save.data.scrap}`,
        VIEW_W / 2, VIEW_H - 10, { color: PAL.metal, align: 'center' });
    }
  }

  private settlementOptions(): ({ kind: 'upgrade'; key: UpgradeKey } | { kind: 'descend' })[] {
    return [
      ...(Object.keys(UPGRADE_INFO) as UpgradeKey[]).map((key) => ({ kind: 'upgrade' as const, key })),
      { kind: 'descend' as const },
    ];
  }

  private drawSettlement(): void {
    const r = this.renderer;
    const g = r.g;
    this.drawBackdrop();

    drawGraffiti(g, 'THE SETTLEMENT', VIEW_W / 2, 18, PAL.lime, 2);
    drawText(g, `BANKED SCRAP ${save.data.scrap}`, VIEW_W / 2, 32, {
      color: PAL.metalHi, align: 'center',
    });

    // --- character select
    const roster = characters();
    const chosen = roster[this.charIndex];
    const owned = save.hasCharacter(chosen.id);
    const charX = 62;
    r.panel(10, 44, 104, 118, owned ? chosen.accent : PAL.metal, 0.88);
    r.drawSprite(chosen.sprite, charX, 132, {
      sx: 2, sy: 2, glow: owned ? 1 : 0.3,
      alpha: owned ? 1 : 0.4,
      silhouette: owned ? undefined : PAL.metal,
    });
    drawText(g, chosen.name, charX, 48, {
      color: owned ? chosen.accent : PAL.metalHi, glow: owned ? chosen.accent : undefined, align: 'center',
    });
    drawText(g, chosen.tagline.slice(0, 26), charX, 140, { color: PAL.metal, align: 'center' });
    drawText(g, `HP ${chosen.stats.maxHp}  DASH ${chosen.stats.dashes}`, charX, 150, {
      color: PAL.metalHi, align: 'center',
    });
    if (!owned) {
      drawText(g, `LOCKED - ${chosen.unlockCost} SCRAP`, charX, 160, { color: PAL.orange, align: 'center' });
    }
    // On touch the on-screen arrows say this already, and the d-pad sits here.
    if (!touch.enabled) drawText(g, '< >', charX, 168, { color: PAL.metal, align: 'center' });

    // --- upgrades
    const options = this.settlementOptions();
    const listX = 126;
    let y = 46;
    r.panel(listX - 6, 44, VIEW_W - listX - 4, 122, PAL.cyan, 0.86);
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const selected = i === this.menuIndex;
      if (selected) {
        g.fillStyle = rgba(PAL.cyan, 0.16);
        g.fillRect(listX - 4, y - 2, VIEW_W - listX, 13);
        drawText(g, '>', listX - 2, y, { color: PAL.cyan, glow: PAL.cyan });
      }

      if (opt.kind === 'upgrade') {
        const info = UPGRADE_INFO[opt.key];
        const level = save.data.upgrades[opt.key];
        const cost = save.upgradeCost(opt.key);
        const maxed = level >= info.max;
        const afford = Number.isFinite(cost) && save.data.scrap >= cost;
        drawText(g, info.name, listX + 8, y, { color: maxed ? PAL.metal : PAL.white });
        drawText(g, info.desc, listX + 96, y, { color: PAL.metalHi });
        // Pips for the level.
        for (let p = 0; p < info.max; p++) {
          const px = listX + 176 + p * 5;
          if (p < level) r.glowRect(px, y + 1, 3, 5, PAL.lime, 1, 1);
          else { g.fillStyle = PAL.metalDark; g.fillRect(px, y + 1, 3, 5); }
        }
        drawText(g, maxed ? 'MAX' : `${cost}`, VIEW_W - 12, y, {
          color: maxed ? PAL.metal : afford ? PAL.lime : PAL.blood,
          align: 'right',
        });
      } else {
        drawText(g, owned ? 'DESCEND INTO THE STACK' : `UNLOCK ${chosen.name}`, listX + 8, y, {
          color: PAL.magenta, glow: PAL.magenta,
        });
      }
      y += 15;
    }

    // --- blueprints known
    const known = save.data.blueprints.length;
    drawText(g, `BLUEPRINTS KNOWN ${known}/${ALL_PARTS.length}`, VIEW_W / 2, VIEW_H - 22, {
      color: PAL.metalHi, align: 'center',
    });
    drawText(g, touch.enabled ? 'D-PAD MOVE   OK SELECT' : 'ARROWS MOVE   ENTER SELECT',
      VIEW_W / 2, VIEW_H - 10, { color: PAL.metal, align: 'center' });
  }

  private drawSummary(): void {
    const r = this.renderer;
    const g = r.g;
    const world = this.world;
    const dead = this.screen === 'dead';

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = rgba(PAL.void, 0.84);
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    const title = dead ? 'DISCARDED' : 'EXTRACTED';
    const color = dead ? PAL.blood : PAL.lime;
    drawGraffiti(g, title, VIEW_W / 2, 40, color, 3);

    drawText(g, dead
      ? 'THE STACK KEEPS MOST OF WHAT YOU FOUND.'
      : 'YOU CLIMBED OUT. THE SHAFT TO LAYER 02 IS SEALED.',
      VIEW_W / 2, 66, { color: PAL.metalHi, align: 'center' });

    const kept = dead ? Math.round(this.runScrapTotal * 0.45) : this.runScrapTotal;
    const panelW = 160;
    const panelX = (VIEW_W - panelW) / 2;
    r.panel(panelX, 82, panelW, 68, color, 0.88);
    drawRunSummary(r, {
      depth: this.runDepth,
      scrap: this.runScrapTotal,
      kills: this.runKillsTotal,
      elapsed: this.runElapsed,
      banked: kept,
    }, panelX + 14, 90);

    if (this.screenTime > 0.6 && Math.sin(time.elapsed * 3.4) > -0.3) {
      drawText(g, '[ ENTER ] RETURN TO THE SETTLEMENT', VIEW_W / 2, VIEW_H - 24, {
        color: PAL.cyan, glow: PAL.cyan, align: 'center',
      });
    }

    // A "look what you built" beat before the run is cleared away. Generated
    // names get long, so this scales down rather than running off the screen.
    if (world) {
      const w = world.player.weapon;
      const label = `LAST BUILD: ${w.name}`;
      // Generated names run long; tighten the tracking rather than clip.
      const tight = textWidth(label) > VIEW_W - 16;
      drawText(g, label, VIEW_W / 2, VIEW_H - 42, {
        color: RARITY[w.rarity].color, glow: RARITY[w.rarity].color,
        align: 'center', tracking: tight ? 0 : 1,
      });
    }
  }
}

// ---------------------------------------------------------------------------

let gameInstance: Game | null = null;

/** Only non-null when the page was opened with ?kit=1. */
function devHooks(): Record<string, (...args: never[]) => void> | null {
  if (!new URLSearchParams(location.search).has('kit')) return null;
  return {
    /** Drop the player straight onto the exit gate. */
    warpToExit(): void {
      const world = gameInstance?.world;
      if (!world) return;
      world.player.x = world.level.exit.x;
      world.player.y = world.level.exit.y;
      world.player.vx = 0;
      world.player.vy = 0;
      world.camera.snapTo(world.player.x, world.player.y - 20);
    },
    /** Kill the player outright. */
    killPlayer(): void {
      const world = gameInstance?.world;
      if (!world) return;
      world.player.damage(world, 9999, world.player.x + 20, world.player.y, true);
    },
  };
}

declare global {
  interface Window {
    /** Read by the boot watchdog in index.html. */
    __cyberTrashReady?: boolean;
  }
}

function boot(): void {
  // Tell the watchdog the bundle parsed and is executing. Anything that throws
  // from here on is caught by the window error handler and shown on screen.
  window.__cyberTrashReady = true;

  const stage = document.getElementById('stage');
  const bootScreen = document.getElementById('boot');
  if (!stage) throw new Error('missing #stage');

  const game = new Game(stage);
  gameInstance = game;

  let started = false;
  const begin = (): void => {
    if (started) return;
    started = true;
    // Audio needs a user gesture and can be refused outright by locked-down
    // browsers. A silent game is far better than a game that will not start.
    try {
      audio.init();
      audio.resume();
    } catch {
      /* no audio; carry on */
    }
    bootScreen?.remove();
    game.start();
  };

  if (bootScreen) {
    // Several routes to the same gesture. Tap-to-start is the one interaction
    // every player must succeed at, so it does not hang off a single event
    // type: some mobile browsers drop the synthesised click after a touch.
    bootScreen.addEventListener('click', begin);
    bootScreen.addEventListener('touchend', begin);
    bootScreen.addEventListener('pointerup', begin);
    window.addEventListener('keydown', begin);
  } else {
    begin();
  }
}

boot();
