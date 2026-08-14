import * as esbuild from 'esbuild';
import { mkdirSync, copyFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

const watch = process.argv.includes('--watch');
const serve = process.argv.includes('--serve');

mkdirSync('dist', { recursive: true });
copyFileSync('index.html', 'dist/index.html');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'dist/bundle.js',
  format: 'esm',
  target: 'es2022',
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
  console.log('  built -> dist/bundle.js');
}
