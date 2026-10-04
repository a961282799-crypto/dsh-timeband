import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
await build({ entryPoints: ['preview/main.tsx'], outfile: '.preview/preview.js', bundle: true, jsx: 'automatic', format: 'esm', define: { 'process.env.NODE_ENV': '"development"' } });
await build({ entryPoints: ['preview/host.tsx'], outfile: '.preview/host.js', bundle: true, jsx: 'automatic', format: 'esm', define: { 'process.env.NODE_ENV': '"development"' } });
const routes = { '/': ['preview/index.html', 'text/html; charset=utf-8'], '/preview.js': ['.preview/preview.js', 'text/javascript'], '/client.js': ['dist/client.js', 'text/javascript'], '/client.js.map': ['dist/client.js.map', 'application/json'], '/host': ['preview/host.html', 'text/html; charset=utf-8'], '/host.js': ['.preview/host.js', 'text/javascript'], '/host-renderer.js': [require.resolve('@deepseek-ai/dsh-client-ui-renderer/client'), 'text/javascript'] };
createServer(async (request, response) => {
  const route = routes[new URL(request.url, 'http://localhost').pathname];
  if (!route) { response.writeHead(404); response.end(); return; }
  try { response.writeHead(200, { 'Content-Type': route[1], 'Cache-Control': 'no-store' }); response.end(await readFile(route[0])); }
  catch { response.writeHead(500); response.end('Run npm run build first.'); }
}).listen(4173, '127.0.0.1', () => console.log('TimeBand preview: http://127.0.0.1:4173'));
