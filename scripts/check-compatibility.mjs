import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const supported = manifest.peerDependencies['@deepseek-ai/dsh'];
const response = await fetch('https://registry.npmjs.org/@deepseek-ai%2Fdsh/latest', { signal: AbortSignal.timeout(20000) });
if (!response.ok) throw new Error(`Cannot read the npm release metadata: HTTP ${response.status}`);
const latest = await response.json();
assert.equal(latest.version, supported, `Harness latest is ${latest.version}; this plugin is tested on ${supported}. Run compatibility checks before changing the supported version.`);
for (const name of ['@deepseek-ai/dsh-client-ui-renderer', '@deepseek-ai/dsh-client-ui-sidebar', '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-locale']) {
  assert.equal(manifest.devDependencies[name], supported, `Host fixture ${name} must match the supported Harness version.`);
  const installed = JSON.parse(await readFile(new URL(`../node_modules/${name}/package.json`, import.meta.url), 'utf8'));
  assert.equal(installed.version, supported, `Installed ${name} does not match the tested host.`);
}
console.log(`Latest published Harness: ${latest.version}; all four host fixtures match. Run npm run check to validate the plugin.`);
