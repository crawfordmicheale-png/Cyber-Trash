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

await browser.close();
server.close();

if (errors.length) {
  console.error(`\nSMOKE FAILED - ${errors.length} error(s):\n`);
  for (const e of errors) console.error(`  ${e}\n`);
  process.exit(1);
}
console.log(`smoke ok  ${JSON.stringify(stats)}\n  screenshots in ${OUT}/`);
