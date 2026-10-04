import * as Cordis from '@deepseek-ai/cordis';
import * as Slots from '@deepseek-ai/dsh-client-ui-slots';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
import * as jsxRuntime from 'react/jsx-runtime';

/** Exercise the shipped rc.2 renderer instead of implementing its prop binding.
 * The shell, locale dictionary and empty session source are fixtures; entry
 * injection, observable hooks, React mounting and Cordis lifetimes are real. */
type ClientPlugin = Parameters<Cordis.Context['plugin']>[0];
type HostApi = { unload: () => Promise<void>; reload: () => Promise<void> };
declare global { interface Window { timebandHost?: HostApi; timebandUpdateManager?: unknown } }

const modules: Record<string, unknown> = {
  '@deepseek-ai/cordis': Cordis,
  '@deepseek-ai/dsh-client-ui-slots': Slots,
  react: React,
  'react-dom': ReactDOM,
  'react-dom/client': ReactDOMClient,
  'react/jsx-runtime': jsxRuntime,
};
(window as unknown as { __ModuleLoader__: unknown }).__ModuleLoader__ = {
  load({ id, factory }: { id: string; factory: (require: (id: string) => unknown) => unknown }) {
    modules[id] = factory(name => {
      if (!(name in modules)) throw new Error(`Unresolved real-renderer module: ${name}`);
      return modules[name];
    });
  },
};
function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(script);
  });
}
async function start() {
  await loadScript('/host-renderer.js');
  await loadScript('/client.js');
  const root = new Cordis.Context();
  // Tests supply the public remote facade. They never install a real package.
  if (window.timebandUpdateManager) {
    root.provide('remote', { pluginManager: window.timebandUpdateManager });
    root.provide('remote.pluginManager', window.timebandUpdateManager);
  }
  await root.plugin(modules['@deepseek-ai/dsh-client-ui-renderer'] as ClientPlugin).await();
  const dictionaries = new Map<string, Record<string, string>>();
  const locale = {
    register(namespace: string, values: { zh: Record<string, string> }) {
      dictionaries.set(namespace, values.zh);
      return () => { dictionaries.delete(namespace); };
    },
    bind: (namespace: string): Slots.Translate => (key, params) => {
      let value = dictionaries.get(namespace)?.[key] ?? key;
      for (const [name, entry] of Object.entries(params ?? {})) value = value.replaceAll(`{${name}}`, String(entry));
      return value;
    },
    getSnapshot: () => localeSnapshot,
    subscribe: (_listener: () => void) => () => {},
  };
  const localeSnapshot = { revision: 0 };
  root.provide('locale', locale);
  root.slots.installLocale(locale);
  const absent: Slots.StandardSourceBinding = { key: undefined, hooks: {}, keyedHooks: {}, props: {} };
  const session = { getSnapshot: () => absent, subscribe: (_listener: () => void) => () => {} };
  root.slots.installScope('session', { current: session, bindingSource: () => session });
  root.slots.register({
    name: 'root',
    children: { 'sidebar.footer.action': { kind: 'list', scope: 'root' } },
  }, ({ renderSlot }) => <aside className="host-sidebar">
    <p>真实 rc.2 渲染器 · 本地验证</p><div className="host-fill" />
    <div className="host-footer"><div>{renderSlot('sidebar.footer.action', { wide: true })}</div>
      <div><button aria-label="模拟账户">D</button></div></div>
  </aside>);
  const plugin = modules['dsh-timeband'] as ClientPlugin;
  let mounted = root.plugin(plugin);
  await mounted.await();
  root.uiRenderer.mount(document.getElementById('app')!);
  window.timebandHost = {
    unload: () => mounted.dispose(),
    async reload() { mounted = root.plugin(plugin); await mounted.await(); },
  };
}
void start().catch(error => { console.error(error); document.body.dataset.hostError = String(error); });
