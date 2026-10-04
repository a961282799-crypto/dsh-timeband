import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
await mkdir('dist', { recursive: true });
await mkdir('artifacts', { recursive: true });
await build({ entryPoints: ['src/index.ts'], outfile: 'dist/index.js', format: 'esm', platform: 'node', target: 'node22' });
await build({
  entryPoints: ['src/client.ts'], outfile: 'dist/client.js', bundle: true,
  format: 'cjs', platform: 'browser', target: 'chrome120', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-dom'], loader: { '.css': 'text' },
  // Keep maps for local debugging, without a map request in the shipped client.
  minify: true, sourcemap: 'external',
  banner: { js: `window.__ModuleLoader__.load({id:${JSON.stringify(pkg.name)},factory:function(require){var module={exports:{}};var exports=module.exports;` },
  footer: { js: 'return module.exports;}});' },
});
console.log(`Built ${pkg.name}@${pkg.version} for DSH 0.2.0-rc.2`);
