import { useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as jsxRuntime from 'react/jsx-runtime';
import type { TextKey } from '../src/locales.ts';
import type { TimeBandProps } from '../src/view.tsx';

/** Preview loads the shipped factory, not a different copy of the component.
 * This is an explicit host fixture; the real registry is tested separately. */
let Component: React.ComponentType<TimeBandProps>;
let pluginCleanup: (() => void)[] = [];
let plugin: { apply: (ctx: unknown) => void };
let dictionaries: { zh: Record<TextKey, string>; en: Record<TextKey, string> };
let clock: { subscribe: (listener: () => void) => () => void; getSnapshot: () => number };
let calendarStore: TimeBandProps['calendarStore'];
let reminderStore: TimeBandProps['reminderStore'];
let testReminder: TimeBandProps['testReminder'];
const registry: Record<string, unknown> = { react: React, 'react-dom': ReactDOM, 'react/jsx-runtime': jsxRuntime };
const params = new URLSearchParams(location.search);
let activeLocale: 'zh' | 'en' = params.has('en') ? 'en' : 'zh';
let instant = params.get('now') ? Date.parse(params.get('now')!) : Date.now();
const host = {
  effect(fn: () => (() => void) | void) { const dispose = fn(); if (dispose) pluginCleanup.push(dispose); },
  locale: {
    register: (_namespace: string, values: typeof dictionaries) => { dictionaries = values; return () => undefined; },
    bind: (_namespace: string) => (key: TextKey, values?: Record<string, string | number>) => {
      let text = dictionaries[activeLocale][key];
      for (const [key, value] of Object.entries(values ?? {})) text = text.replaceAll(`{${key}}`, String(value));
      return text;
    },
  },
  slots: {
    inject: (_: string, fn: () => void) => fn(),
    register: (options: { inject: () => { hooks: { clock: typeof clock }; props: { calendarStore: typeof calendarStore; reminderStore: typeof reminderStore; testReminder: typeof testReminder } } }, component: typeof Component) => { Component = component; const injected = options.inject(); clock = injected.hooks.clock; calendarStore = injected.props.calendarStore; reminderStore = injected.props.reminderStore; testReminder = injected.props.testReminder; },
  },
};
(window as unknown as { __ModuleLoader__: unknown }).__ModuleLoader__ = {
  load: ({ factory }: { factory: (require: (id: string) => unknown) => typeof plugin }) => {
    plugin = factory(id => { if (!(id in registry)) throw new Error(`Unresolved host module: ${id}`); return registry[id]; });
    plugin.apply(host);
    createRoot(document.getElementById('app')!).render(<Preview />);
  },
};

function Preview() {
  const [wide, setWide] = useState(!params.has('collapsed'));
  const [english, setEnglish] = useState(params.has('en'));
  const [mounted, setMounted] = useState(true);
  const [now, setNow] = useState(instant);
  const clockNow = useSyncExternalStore(clock.subscribe, clock.getSnapshot);
  const dict = english ? dictionaries.en : dictionaries.zh;
  const props = { wide, calendarStore, reminderStore, testReminder, t: (key: TextKey) => dict[key], useClock: (select: (n: number) => number) => select(params.has('live') ? clockNow : now) } as TimeBandProps;
  return <div className="preview-shell"><aside className={`preview-sidebar${wide ? '' : ' narrow'}`}>
    <div className="preview-brand">{wide ? 'DeepSeek Harness' : 'DS'}</div>
    {wide && <div className="preview-nav">＋ 新建对话<br />工作区<br />最近的对话</div>}
    <div className="preview-fill" />{wide && <div className="preview-marker">头像右侧 · 点击时间轴</div>}
    <div className="preview-footer"><div className="preview-actions">{mounted && <Component {...props} />}</div>
      <div className="preview-settings"><button className="preview-account" data-collapsed={!wide} aria-label="预览账户"><span className="preview-avatar">D</span>{wide && <span className="preview-user">我的账户</span>}</button></div>
    </div></aside><main className="preview-main"><div className="preview-kicker">DSH TIMEBAND / PLUGIN PREVIEW</div><h1>看见时间，<br />安排你的下一步。</h1><p>当前时段、下一次切换、今天的 24 小时。<br />在头像旁，一眼就能看清。</p>
      <div className="preview-controls"><select aria-label="预览场景" onChange={e => { instant = Date.parse(e.target.value); setNow(instant); }} defaultValue="">
        <option value="" disabled>选择测试场景</option><option value="2026-09-30T10:30:00+08:00">工作日 · 峰时段</option><option value="2026-09-30T12:30:00+08:00">午间 · 谷时段</option>
        <option value="2026-10-01T10:30:00+08:00">国庆假期</option><option value="2026-10-10T10:30:00+08:00">调休周六</option><option value="2027-01-04T10:30:00+08:00">未知年份</option></select>
        <button onClick={() => setWide(!wide)}>收起 / 展开侧栏</button><button onClick={() => { activeLocale = english ? 'zh' : 'en'; setEnglish(!english); }}>中文 / English</button>
        <button onClick={() => { if (mounted) { pluginCleanup.forEach(fn => fn()); pluginCleanup = []; } else plugin.apply(host); setMounted(!mounted); }}>卸载 / 挂载插件</button>
      </div><p className="preview-note">这是可交互的宿主布局模拟，使用真实插件构建产物。<br />预览时间固定，便于核对边界；安装后自动按当前时间更新。</p></main></div>;
}
const script = document.createElement('script'); script.src = '/client.js'; document.head.append(script);
