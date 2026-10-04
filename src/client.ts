import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import { createClock } from './clock.ts';
import { createCalendarStore } from './calendar-store.ts';
import { createReminderStore } from './reminder-store.ts';
import { createReminders } from './reminders.ts';
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
  const reminderStore = createReminderStore();
  const notifications = new Set<Notification>();
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const show = (title: string, body: string, tag: string, failed = () => reminderStore.fail('delivery')) => {
    const notification = new Notification(`DSH TimeBand · ${title}`, { body, tag });
    notifications.add(notification);
    notification.onclose = () => notifications.delete(notification);
    notification.onerror = () => {
      failed(); notifications.delete(notification); notification.close();
    };
    notification.onclick = () => { window.focus(); notification.close(); };
  };
  const reminders = createReminders({ clock, calendarStore, reminderStore, notify(at, failed) {
    const t = ctx.locale.bind('timeband');
    show(t('reminderTitle'), t('reminderBody', { time: time.format(at) }), `dsh-timeband-peak-${at}`, failed);
  } });
  const testReminder = () => {
    if (!reminderStore.getSnapshot().enabled) return;
    const t = ctx.locale.bind('timeband');
    try { show(t('reminderTestTitle'), t('reminderTestBody'), 'dsh-timeband-test'); }
    catch { reminderStore.fail('delivery'); }
  };
  ctx.effect(() => clock.start());
  ctx.effect(() => calendarStore.start());
  ctx.effect(() => reminderStore.start());
  ctx.effect(() => reminders.start());
  ctx.effect(() => () => { for (const notification of notifications) notification.close(); notifications.clear(); });
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'dsh-timeband', order: 100, locale: 'timeband',
    inject: () => ({ hooks: { clock }, props: { calendarStore, reminderStore, testReminder } }),
  }, TimeBand));
}
