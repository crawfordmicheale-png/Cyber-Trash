/**
 * Headless smoke test.
 *
 * Boots the game, drives it through the title, the settlement, the workbench and
 * a live fight, then asserts on the sim state exposed at `window.cyberTrash`.
 * Fails on any console error, page exception, or failed request. Screenshots
 * land in scripts/.smoke/ for eyeballing.
 *
 *   node scripts/smoke.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';

const PORT = Number(process.env.SMOKE_PORT ?? 5199);
const OUT = process.env.SMOKE_OUT ?? 'scripts/.smoke';
const CHROME = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.map': 'application/json' };

const server = createServer(async (req, res) => {
  const bare = req.url.split('?')[0];
  const path = bare === '/' ? '/index.html' : bare;
  try {
    const body = await readFile(join('dist', path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
// The browser always requests /favicon.ico; a 404 for it is not a game error.
const ignorable = (t) => t.includes('favicon');
// Subresource console errors carry no URL, so the response hook reports those.
const GENERIC = 'Failed to load resource';
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !ignorable(t) && !t.includes(GENERIC)) errors.push(`console: ${t}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack ?? ''}`));
page.on('response', (res) => {
  if (res.status() >= 400 && !ignorable(res.url())) errors.push(`http ${res.status()}: ${res.url()}`);
});

const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) });
const tap = async (key, ms = 110) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(ms);
};
const hold = async (key, ms) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
};
const probe = (fn) => page.evaluate(fn);

// --- Boot -------------------------------------------------------------------
await page.goto(`http://localhost:${PORT}/?kit=1`);
await page.waitForTimeout(400);
await page.click('#boot');
await page.waitForTimeout(700);
await shot('01-title');

// --- Title -> settlement ----------------------------------------------------
await tap('Enter', 500);
await shot('02-settlement');
if ((await probe(() => window.cyberTrash.screen)) !== 'settlement') {
  errors.push('did not reach the settlement screen');
}

// --- Settlement -> run ------------------------------------------------------
for (let i = 0; i < 4; i++) await tap('ArrowDown');
await tap('Enter', 900);
await shot('03-run-start');
if ((await probe(() => window.cyberTrash.screen)) !== 'run') errors.push('run did not start');

// --- Workbench: the bench sits beside the spawn point -----------------------
await page.waitForTimeout(300);
if (!(await probe(() => window.cyberTrash.nearWorkbench))) {
  errors.push('player does not spawn in range of the workbench');
}
await tap('Tab', 500);
await shot('04-workbench');
if (!(await probe(() => window.cyberTrash.workbenchOpen))) errors.push('workbench did not open');

// Build something ridiculous: junk cannon + cracked reactor + broken AI module.
for (let i = 0; i < 9; i++) await tap('ArrowDown');
await tap('ArrowRight');
for (let i = 0; i < 4; i++) await tap('ArrowDown');
await tap('ArrowRight');
for (let i = 0; i < 12; i++) await tap('ArrowDown');
await page.waitForTimeout(200);
await shot('05-build');

await tap('Enter', 250);
const equipped = await probe(() => ({
  weapon: window.cyberTrash.weapon,
  damage: window.cyberTrash.damage,
}));
await tap('Tab', 350);
if (await probe(() => window.cyberTrash.workbenchOpen)) errors.push('workbench did not close');

// The commit must fit exactly what the cursor was on. Regression guard for the
// part lists resorting underneath the cursor after an equip.
if (!/CANNON/.test(equipped.weapon ?? '')) {
  errors.push(`expected a CANNON build, got "${equipped.weapon}"`);
}
if (!/AUTONOMOUS/.test(equipped.weapon ?? '') || !/OVERCHARGED/.test(equipped.weapon ?? '')) {
  errors.push(`expected the mod and core in the name, got "${equipped.weapon}"`);
}
if (equipped.damage < 50) {
  errors.push(`cracked reactor should triple damage; got ${equipped.damage}`);
}

// --- Fight: run, jump, attack, dash ----------------------------------------
for (let i = 0; i < 7; i++) {
  await hold('KeyD', 240);
  await page.keyboard.press('Space');
  await page.waitForTimeout(140);
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(140);
  await page.keyboard.press('ShiftLeft');
  await page.waitForTimeout(160);
}
await shot('06-combat');

// --- Thrown secondary -------------------------------------------------------
await tap('KeyK', 600);
await shot('07-grenade');

await hold('KeyA', 700);
await page.keyboard.press('Space');
await page.waitForTimeout(200);
await page.keyboard.press('KeyJ');
await page.waitForTimeout(800);
await shot('08-run');

// --- Sector transition: warp to the exit and ascend ------------------------
await probe(() => window.cyberTrash.dev.warpToExit());
await page.waitForTimeout(500);
await shot('09-exit');
await tap('KeyE', 900);
if ((await probe(() => window.cyberTrash.screen)) !== 'run') errors.push('ascend broke the run');
const sector2 = await probe(() => window.cyberTrash.weapon);
if (sector2 !== equipped.weapon) errors.push('build was not carried between sectors');
await shot('10-sector-02');

// --- Extraction: clear the remaining sectors -------------------------------
for (let i = 0; i < 3; i++) {
  await probe(() => window.cyberTrash.dev.warpToExit());
  await page.waitForTimeout(400);
  await tap('KeyE', 800);
  if ((await probe(() => window.cyberTrash.screen)) !== 'run') break;
}
await page.waitForTimeout(400);
await shot('11-extracted');
if ((await probe(() => window.cyberTrash.screen)) !== 'extracted') {
  errors.push(`expected the extracted screen, got "${await probe(() => window.cyberTrash.screen)}"`);
}

// --- Death screen ----------------------------------------------------------
await tap('Enter', 700);
for (let i = 0; i < 4; i++) await tap('ArrowDown');
await tap('Enter', 900);
await probe(() => window.cyberTrash.dev.killPlayer());
await page.waitForTimeout(1800);
await shot('12-dead');
if ((await probe(() => window.cyberTrash.screen)) !== 'dead') {
  errors.push(`expected the death screen, got "${await probe(() => window.cyberTrash.screen)}"`);
}

const stats = await probe(() => ({
  screen: window.cyberTrash.screen,
  weapon: window.cyberTrash.weapon,
  kills: window.cyberTrash.kills,
  hp: Math.round(window.cyberTrash.hp),
  fps: Math.round(window.cyberTrash.fps),
}));
if (stats.fps < 45) errors.push(`fps too low: ${stats.fps}`);

// ---------------------------------------------------------------------------
// Mobile pass: a phone-sized landscape viewport with real touch emulation.
// ---------------------------------------------------------------------------
const mobile = await browser.newContext({
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const mp = await mobile.newPage();
mp.on('pageerror', (e) => errors.push(`mobile pageerror: ${e.message}\n${e.stack ?? ''}`));
mp.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !ignorable(t) && !t.includes(GENERIC)) errors.push(`mobile console: ${t}`);
});

const mshot = (name) => mp.screenshot({ path: join(OUT, `${name}.png`) });
const mprobe = (fn) => mp.evaluate(fn);
/** Tap a point given in 480x270 buffer coordinates. */
const bufferToClient = async (bx, by) => mp.evaluate(([x, y]) => {
  const c = document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  return [r.left + (x / 480) * r.width, r.top + (y / 270) * r.height];
}, [bx, by]);
const tapBuffer = async (bx, by, ms = 150) => {
  const [cx, cy] = await bufferToClient(bx, by);
  await mp.touchscreen.tap(cx, cy);
  await mp.waitForTimeout(ms);
};
/** Press and hold a buffer-space point, using raw CDP touch events. */
const holdBuffer = async (bx, by, ms) => {
  const [cx, cy] = await bufferToClient(bx, by);
  const cdp = await mobile.newCDPSession(mp);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: cx, y: cy, id: 1 }],
  });
  await mp.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
};

await mp.goto(`http://localhost:${PORT}/?kit=1`);
await mp.waitForTimeout(400);
await mp.tap('#boot');
await mp.waitForTimeout(800);
await mshot('13-mobile-title');

if (!(await mprobe(() => window.cyberTrash.touchEnabled))) {
  errors.push('touch controls did not enable on a touch device');
}

// The canvas must scale up to fill the phone screen rather than sitting at 1x
// in the middle of it. The game is a fixed 16:9, so on a taller-or-wider phone
// one axis is bound and the other is legitimately letterboxed — assert on the
// bound axis, and that the backing store is at device resolution.
const fit = await mprobe(() => {
  const c = document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  return {
    w: r.width, h: r.height,
    vw: window.innerWidth, vh: window.innerHeight,
    backingW: c.width, dpr: window.devicePixelRatio,
  };
});
const fillRatio = Math.max(fit.w / fit.vw, fit.h / fit.vh);
if (fillRatio < 0.98) {
  errors.push(`canvas fills only ${(fillRatio * 100).toFixed(0)}% of its bound axis`);
}
// Backing store must track the device pixel ratio, up to the renderer's cap.
const wantDpr = Math.min(fit.dpr, 2);
if (fit.backingW < fit.w * wantDpr - 1) {
  errors.push(`canvas backing store below ${wantDpr}x (${fit.backingW} < ${fit.w * wantDpr})`);
}

// Title -> settlement: the whole screen is the button here.
await tapBuffer(240, 120, 500);
if ((await mprobe(() => window.cyberTrash.screen)) !== 'settlement') {
  errors.push('mobile: tap-anywhere did not leave the title');
}
await mshot('14-mobile-settlement');

// Settlement: d-pad down to DESCEND, then OK.
for (let i = 0; i < 4; i++) await tapBuffer(62, 250, 160);
await tapBuffer(438, 218, 900);
if ((await mprobe(() => window.cyberTrash.screen)) !== 'run') {
  errors.push('mobile: could not start a run from the touch menu');
}
if ((await mprobe(() => window.cyberTrash.touchMode)) !== 'gameplay') {
  errors.push('mobile: touch layout did not switch to gameplay');
}
await mshot('15-mobile-run');

// Holding the RIGHT pad must actually move the player.
const beforeX = await mprobe(() => window.cyberTrash.playerX);
await holdBuffer(89, 227, 700);
await mp.waitForTimeout(120);
const afterX = await mprobe(() => window.cyberTrash.playerX);
if (afterX - beforeX < 20) {
  errors.push(`mobile: RIGHT pad moved the player only ${(afterX - beforeX).toFixed(1)}px`);
}

// Releasing must stop them — a stuck virtual key is the classic touch bug.
await mp.waitForTimeout(400);
const restX = await mprobe(() => window.cyberTrash.playerX);
await mp.waitForTimeout(400);
const stillX = await mprobe(() => window.cyberTrash.playerX);
if (Math.abs(stillX - restX) > 2) {
  errors.push(`mobile: player kept moving after release (${(stillX - restX).toFixed(1)}px)`);
}

// Jump and attack.
await tapBuffer(446, 226, 300);
await tapBuffer(388, 210, 300);
await mshot('16-mobile-combat');

// The contextual button only exists when there is something to interact with.
await mp.evaluate(() => window.cyberTrash.dev.warpToExit());
await mp.waitForTimeout(500);
await mshot('17-mobile-context');
await tapBuffer(240, 232, 900);
if ((await mprobe(() => window.cyberTrash.screen)) !== 'run') {
  errors.push('mobile: context button did not ascend cleanly');
}

// Portrait should tell the player to turn the phone rather than render unplayably.
await mp.setViewportSize({ width: 390, height: 844 });
await mp.waitForTimeout(500);
await mshot('18-mobile-portrait');
if (!(await mprobe(() => window.cyberTrash.touchEnabled))) {
  errors.push('mobile: touch controls lost on rotation');
}

const mobileStats = await mprobe(() => ({
  screen: window.cyberTrash.screen,
  touch: window.cyberTrash.touchEnabled,
  fps: Math.round(window.cyberTrash.fps),
}));
if (mobileStats.fps < 30) errors.push(`mobile fps too low: ${mobileStats.fps}`);

await mobile.close();
await browser.close();
server.close();

if (errors.length) {
  console.error(`\nSMOKE FAILED - ${errors.length} error(s):\n`);
  for (const e of errors) console.error(`  ${e}\n`);
  process.exit(1);
}
console.log(`smoke ok\n  desktop ${JSON.stringify(stats)}\n  mobile  ${JSON.stringify(mobileStats)}\n  screenshots in ${OUT}/`);
