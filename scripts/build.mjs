import * as esbuild from 'esbuild';
import { mkdirSync, copyFileSync } from 'node:fs';

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

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  if (serve) {
    const { host, port } = await ctx.serve({ servedir: 'dist', port: 5173 });
    console.log(`\n  CYBER-TRASH running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}\n`);
  }
} else {
  await esbuild.build(options);
  console.log('  built -> dist/bundle.js');
}
