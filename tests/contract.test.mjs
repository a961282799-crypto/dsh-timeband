import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { Context } from '@deepseek-ai/cordis';
const require = createRequire(import.meta.url);

function factory(path) {
  let registration;
  globalThis.window.__ModuleLoader__ = { load(value) { registration = value; } };
  vm.runInNewContext(readFileSync(path, 'utf8'), { window: globalThis.window, console, document: globalThis.document, URL, TextEncoder, TextDecoder, AbortController, fetch, setInterval, clearInterval, setTimeout, clearTimeout });
  assert.equal(typeof registration.factory, 'function');
  return registration;
}

test('built artifact mounts in real rc.2 Cordis/SlotRegistry, follows slot lifetimes and cleans up', async () => {
  const styles = new Set();
  const doc = new EventTarget();
  doc.visibilityState = 'hidden';
  doc.querySelector = () => null;
  doc.createElement = () => { const style = { dataset: {}, remove: () => styles.delete(style) }; return style; };
  doc.head = { append: value => styles.add(value), appendChild: value => styles.add(value) };
  const oldDoc = globalThis.document, oldWin = globalThis.window;
  globalThis.document = doc;
  globalThis.window = new EventTarget();
  let rootOwner;
  try {
    const rendererRegistration = factory(require.resolve('@deepseek-ai/dsh-client-ui-renderer/client'));
    const { SlotRegistry } = rendererRegistration.factory(require);
    const registration = factory('dist/client.js');
    assert.equal(registration.id, 'dsh-timeband');
    const requests = [];
    const plugin = registration.factory(id => { requests.push(id); return require(id); });
    assert.ok(requests.every(id => ['react', 'react-dom', 'react/jsx-runtime'].includes(id)));
    const root = new Context();
    let ctx;
    rootOwner = root.plugin(owned => { ctx = owned; });
    await rootOwner.await();
    await ctx.plugin(SlotRegistry).await();
    let dictionaries = 0;
    ctx.provide('locale', { register() { dictionaries++; return () => { dictionaries--; }; } });
    const mounted = ctx.plugin(plugin);
    await mounted.await();
    assert.equal(styles.size, 1);
    assert.equal(dictionaries, 1);
    assert.equal(ctx.get('slots').entries('sidebar.footer.action').length, 0);
    const declare = () => ctx.get('slots').register({ name: 'root', children: { 'sidebar.footer.action': { kind: 'list', scope: 'root' } } }, () => null);
    const remove = declare();
    assert.equal(ctx.get('slots').entries('sidebar.footer.action').length, 1);
    assert.equal(ctx.get('slots').entries('sidebar.footer.action')[0].options.id, 'dsh-timeband');
    remove();
    assert.equal(ctx.get('slots').entries('sidebar.footer.action').length, 0);
    const removeAgain = declare();
    assert.equal(ctx.get('slots').entries('sidebar.footer.action').length, 1);
    await mounted.dispose();
    assert.equal(ctx.get('slots').entries('sidebar.footer.action').length, 0);
    assert.equal(styles.size, 0);
    assert.equal(dictionaries, 0);
    removeAgain();
  } finally {
    if (rootOwner) await rootOwner.dispose();
    globalThis.document = oldDoc; globalThis.window = oldWin;
  }
});
