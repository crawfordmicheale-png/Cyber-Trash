import * as esbuild from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

const watch = process.argv.includes('--watch');
const serve = process.argv.includes('--serve');

mkdirSync('dist', { recursive: true });

/**
 * Emit dist/index.html with a fresh cache-busting stamp on the bundle URL.
 *
 * Phones cache aggressively, and "I reloaded and it is still broken" is
 * impossible to tell apart from "the fix did not work" without this. The stamp
 * is also shown on the boot screen so the build on screen is identifiable.
 */
function writeHtml() {
  const stamp = Date.now().toString(36);
  const html = readFileSync('index.html', 'utf8')
    .replace('./bundle.js', `./bundle.js?v=${stamp}`)
    .replace('__BUILD__', stamp);
  writeFileSync('dist/index.html', html);
  return stamp;
}

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'dist/bundle.js',
  format: 'esm',
  // Deliberately conservative: this has to parse on whatever phone someone
  // points at the dev server. A syntax feature the browser cannot parse fails
  // the whole bundle silently, which looks exactly like "the game is broken".
  // es2019 covers iOS 13+ and esbuild downlevels the newer syntax we use.
  target: 'es2019',
  sourcemap: watch,
  minify: !watch,
  logLevel: 'info',
};

/** Every non-internal IPv4 the machine answers on, for testing on a phone. */
function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);
}

if (watch) {
  options.plugins = [{
    name: 'html',
    setup(build) { build.onEnd(() => { writeHtml(); }); },
  }];
  const ctx = await esbuild.context(options);
  await ctx.watch();
  if (serve) {
    // Bind all interfaces so a phone on the same Wi-Fi can reach it.
    const { port } = await ctx.serve({ servedir: 'dist', host: '0.0.0.0', port: 5173 });
    console.log(`\n  CYBER-TRASH`);
    console.log(`    local    http://localhost:${port}`);
    for (const ip of lanAddresses()) {
      console.log(`    network  http://${ip}:${port}   <- open this on your phone`);
    }
    console.log('');
  }
} else {
  await esbuild.build(options);
  const stamp = writeHtml();
  console.log(`  built -> dist/bundle.js  (build ${stamp})`);
}
