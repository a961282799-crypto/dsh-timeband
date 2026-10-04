import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createPluginUpdates, newer, parseRelease, RELEASE_API, RELEASES_URL, UPDATE_TIMEOUT } from '../src/plugin-updates.ts';
import type { NativePluginManager } from '../src/plugin-updates.ts';

const release = (version = '1.3.4') => ({ tag_name: `v${version}`, draft: false, prerelease: false,
  html_url: `${RELEASES_URL}/tag/v${version}`,
  assets: [{ name: `dsh-timeband-${version}.tgz`, state: 'uploaded', browser_download_url: `${RELEASES_URL}/download/v${version}/dsh-timeband-${version}.tgz` }],
});
function fixture(context: TestContext, manager?: NativePluginManager) {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const calls: { url: string; init?: RequestInit }[] = [];
  const state = { fetch: (async () => Response.json(release())) as typeof fetch };
  const options = { version: '1.3.3', manager: () => manager, fetch: (async (input, init) => {
    calls.push({ url: String(input), ...(init ? { init } : {}) }); return state.fetch(input, init);
  }) as typeof fetch };
  const updates = createPluginUpdates(options);
  context.after(updates.dispose);
  return { updates, options, state, calls };
}

test('stable versions compare numerically and releases require the exact repository and built asset', () => {
  assert.equal(newer('1.10.0', '1.9.99'), true);
  for (const version of ['1.3.3', '1.3.2', '1.3.4-rc.1', '01.3.4', '1.3.4/evil']) assert.equal(newer(version, '1.3.3'), false);
  assert.equal(parseRelease(release()).download, `${RELEASES_URL}/download/v1.3.4/dsh-timeband-1.3.4.tgz`);
  for (const bad of [{ ...release(), draft: true }, { ...release(), prerelease: true }, { ...release(), assets: [] },
    { ...release(), html_url: 'https://github.com/other/package' }, { ...release(), assets: [{ ...release().assets[0], browser_download_url: 'https://evil.example/package.tgz' }] }]) assert.throws(() => parseRelease(bad));
});

test('only explicit checks fetch metadata, without automatic checks or installation', async context => {
  let installs = 0;
  const f = fixture(context, { async installBundle() { installs++; return { ok: false, error: null }; }, async waitForInstall() { return { ok: true, value: null }; }, async cancelInstall() {} });
  await setImmediate(); context.mock.timers.tick(48 * 3600_000);
  assert.equal(f.calls.length, 0); assert.equal(f.updates.getSnapshot().check, 'idle');
  await Promise.all([f.updates.check(), f.updates.check()]);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0]!.url, RELEASE_API); assert.equal(f.calls[0]!.init!.credentials, 'omit');
  assert.equal(f.updates.getSnapshot().latest!.version, '1.3.4'); assert.equal(installs, 0);
  context.mock.timers.tick(48 * 3600_000); await setImmediate(); assert.equal(f.calls.length, 1);
  const reloaded = createPluginUpdates(f.options); context.after(reloaded.dispose);
  assert.equal(reloaded.getSnapshot().latest, null); assert.equal(f.calls.length, 1);
});

test('network failure and invalid or oversized metadata keep the known release and never alter its URL', async context => {
  const f = fixture(context); await f.updates.check();
  const original = f.updates.getSnapshot().latest;
  for (const fetcher of [async () => { throw new TypeError('offline'); }, async () => Response.json({ ...release('1.3.5'), prerelease: true }), async () => new Response('x'.repeat(65_537))]) {
    f.state.fetch = fetcher; await f.updates.check();
    assert.equal(f.updates.getSnapshot().check, 'failed'); assert.deepEqual(f.updates.getSnapshot().latest, original);
  }
  assert.equal(f.updates.canInstall(), false);
});

test('native installation pins the discovered asset, blocks duplicate clicks and requests a restart', async context => {
  const calls: { spec: string; requestId: string }[] = [];
  const f = fixture(context, {
    async installBundle(spec, options) { calls.push({ spec, requestId: options.requestId }); return { ok: true, value: { application: 'restart-required', bundle: 'dsh-timeband' } }; },
    async waitForInstall() { throw new Error('not needed'); }, async cancelInstall() {},
  });
  await f.updates.install(); assert.equal(calls.length, 0);
  await f.updates.check(); await Promise.all([f.updates.install(), f.updates.install()]); await f.updates.install();
  assert.equal(calls.length, 1); assert.equal(calls[0]!.spec, parseRelease(release()).download);
  assert.match(calls[0]!.requestId, /^[\da-f-]{36}$/); assert.equal(f.updates.getSnapshot().install, 'restart');
});

test('lost RPC replies recover the same request; an unconfirmed result cannot start a second installation', async context => {
  let installs = 0, recoveries = 0, known = true, requestId = '';
  const f = fixture(context, {
    async installBundle(_spec, options) { installs++; requestId = options.requestId; return { ok: false, error: 'disconnected' }; },
    async waitForInstall(id) { assert.equal(id, requestId); recoveries++; return { ok: true, value: known ? { application: 'restart-required', bundle: 'dsh-timeband' } : null }; }, async cancelInstall() {},
  });
  await f.updates.check(); await f.updates.install(); assert.equal(f.updates.getSnapshot().install, 'restart');
  f.updates.dispose(); known = false;
  const next = createPluginUpdates(f.options); context.after(next.dispose);
  await next.check(); await next.install(); await next.install();
  assert.equal(next.getSnapshot().install, 'unknown'); assert.equal(installs, 2); assert.equal(recoveries, 2);
});

test('native compatibility rejection and failed installs never report success', async context => {
  let incompatible = true;
  const f = fixture(context, { async installBundle() { return { ok: true, value: { application: 'failed', error: { code: incompatible ? 'incompatible-version' : 'operation-error' } } }; },
    async waitForInstall() { return { ok: true, value: null }; }, async cancelInstall() {},
  });
  await f.updates.check(); await f.updates.install(); assert.equal(f.updates.getSnapshot().install, 'incompatible');
  incompatible = false; await f.updates.install(); assert.equal(f.updates.getSnapshot().install, 'failed');
});

test('native applied acknowledgements are honored, while another bundle cannot count as a successful update', async context => {
  let bundle = 'dsh-timeband';
  const f = fixture(context, { async installBundle() { return { ok: true, value: { application: 'applied', bundle } }; },
    async waitForInstall() { return { ok: true, value: null }; }, async cancelInstall() {},
  });
  await f.updates.check(); await f.updates.install(); assert.equal(f.updates.getSnapshot().install, 'applied'); f.updates.dispose();
  bundle = 'other-plugin'; const next = createPluginUpdates(f.options); context.after(next.dispose);
  await next.check(); await next.install(); assert.equal(next.getSnapshot().install, 'unknown');
});

test('a stalled check times out and can be retried only by another explicit check', async context => {
  const f = fixture(context);
  f.state.fetch = (_input, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted'))));
  const pending = f.updates.check(); context.mock.timers.tick(UPDATE_TIMEOUT); await pending;
  assert.equal(f.updates.getSnapshot().check, 'failed');
  context.mock.timers.tick(48 * 3600_000); assert.equal(f.calls.length, 1);
  f.state.fetch = async () => Response.json(release()); await f.updates.check();
  assert.equal(f.updates.getSnapshot().check, 'current'); assert.equal(f.calls.length, 2);
});

test('unload cancels only its own native request and ignores late success', async context => {
  let finish: (value: Awaited<ReturnType<NativePluginManager['installBundle']>>) => void = () => {};
  let started = '', cancelled = '';
  const f = fixture(context, { installBundle(_spec, options) { started = options.requestId; return new Promise(resolve => { finish = resolve; }); },
    async waitForInstall() { return { ok: true, value: null }; }, async cancelInstall(id) { cancelled = id; },
  });
  await f.updates.check(); const pending = f.updates.install(); f.updates.dispose();
  finish({ ok: true, value: { application: 'restart-required', bundle: 'dsh-timeband' } }); await pending;
  assert.equal(cancelled, started); assert.equal(f.updates.getSnapshot().install, 'installing');
});

test('unload aborts a pending check, ignores its late response and prevents new requests', async context => {
  const f = fixture(context);
  let finish: (response: Response) => void = () => {};
  f.state.fetch = () => new Promise(resolve => { finish = resolve; });
  const pending = f.updates.check(); f.updates.dispose();
  assert.equal(f.calls[0]!.init!.signal!.aborted, true);
  finish(Response.json(release())); await pending; await f.updates.check(); await f.updates.install();
  assert.equal(f.updates.getSnapshot().latest, null); assert.equal(f.calls.length, 1);
});
