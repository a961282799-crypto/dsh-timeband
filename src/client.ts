import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import { createClock } from './clock.ts';
import { createCalendarStore } from './calendar-store.ts';
import { createCalendarUpdater } from './calendar-updater.ts';
import { createReminderStore } from './reminder-store.ts';
import { createReminders } from './reminders.ts';
import { createReminderDelivery } from './reminder-delivery.ts';
import { createPluginUpdates } from './plugin-updates.ts';
import type { NativePluginManager } from './plugin-updates.ts';
import { version } from '../package.json';
import { TimeBand } from './view.tsx';
import { zh, en } from './locales.ts';
import css from './style.css';

export const inject = ['slots', 'locale'];
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('timeband', { zh, en }));
  ctx.effect(() => {
    const style = document.createElement('style');
    style.dataset.plugin = 'dsh-timeband';
    style.textContent = css;
    document.head.append(style);
    return () => style.remove();
  });
  const clock = createClock();
  const calendarStore = createCalendarStore();
  const calendarUpdater = createCalendarUpdater({ clock, store: calendarStore });
  const reminderStore = createReminderStore();
  const reminderDelivery = createReminderDelivery();
  const pluginUpdates = createPluginUpdates({ version, manager: () => {
    if (!ctx.get('remote.pluginManager')) return undefined;
    return (ctx.get('remote') as { pluginManager: NativePluginManager } | undefined)?.pluginManager;
  } });
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const reminders = createReminders({ clock, calendarStore, reminderStore, notify(at) {
    const t = ctx.locale.bind('timeband');
    reminderDelivery.show(t('reminderTitle'), t('reminderBody', { time: time.format(at) }), `dsh-timeband-peak-${at}`);
  } });
  const testReminder = () => {
    if (!reminderStore.getSnapshot().enabled) return;
    reminderDelivery.primeSound();
    const t = ctx.locale.bind('timeband');
    try { reminderDelivery.show(t('reminderTestTitle'), t('reminderTestBody'), 'dsh-timeband-test'); }
    catch { reminderStore.fail('delivery'); }
  };
  ctx.effect(() => clock.start());
  ctx.effect(() => calendarStore.start());
  ctx.effect(() => calendarUpdater.start());
  ctx.effect(() => reminderStore.start());
  ctx.effect(() => reminders.start());
  ctx.effect(() => () => pluginUpdates.dispose());
  ctx.effect(() => reminderStore.subscribe(() => { if (!reminderStore.getSnapshot().enabled) reminderDelivery.dismiss(); }));
  ctx.effect(() => {
    // Restore audio readiness after reload using ordinary user interaction.
    const prime = () => { if (reminderStore.getSnapshot().enabled) reminderDelivery.primeSound(); };
    document.addEventListener('pointerdown', prime, true);
    document.addEventListener('keydown', prime, true);
    return () => {
      document.removeEventListener('pointerdown', prime, true);
      document.removeEventListener('keydown', prime, true);
    };
  });
  ctx.effect(() => () => reminderDelivery.dispose());
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'dsh-timeband', order: 100, locale: 'timeband',
    inject: () => ({ hooks: { clock }, calendarStore, reminderStore, reminderDelivery, testReminder, pluginUpdates }),
  }, TimeBand));
}
