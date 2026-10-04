import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { calendar, parseCalendar } from '../src/calendar.ts';
import { createCalendarStore } from '../src/calendar-store.ts';
import { createReminderStore, REMINDER_STORAGE_KEY } from '../src/reminder-store.ts';
import { createReminders, REMINDER_SENT_KEY } from '../src/reminders.ts';

const at = (value: string) => Date.parse(`${value}+08:00`);
const granted = { read: () => 'granted' as const, request: async () => 'granted' as const };
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function memory() {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  return { data, storage };
}
function fixture(context: TestContext, time: string) {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: at(time) });
  const { data, storage } = memory();
  const listeners = new Set<() => void>();
  const clock = { subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
  const calendarStore = createCalendarStore(() => storage);
  const reminderStore = createReminderStore(() => storage, granted);
  const notices: number[] = [];
  const options = { clock, calendarStore, reminderStore, getStorage: () => storage, now: () => Date.now(), notify: (value: number) => { notices.push(value); } };
  const controller = createReminders(options);
  const stop = controller.start(); context.after(stop);
  return { data, storage, listeners, calendarStore, reminderStore, notices, options, stop,
    update: () => { for (const listener of listeners) listener(); },
    advance: async (milliseconds: number) => { context.mock.timers.tick(milliseconds); await settle(); },
  };
}

test('reminders default off; permission is requested only by enabling, and the choice persists', async () => {
  const { storage, data } = memory(); let requests = 0, permission: NotificationPermission = 'default';
  const permissions = { read: () => permission, request: async (): Promise<NotificationPermission> => { requests++; permission = 'granted'; return permission; } };
  const store = createReminderStore(() => storage, permissions);
  assert.equal(store.getSnapshot().enabled, false); assert.equal(requests, 0);
  await store.setEnabled(true);
  assert.equal(requests, 1); assert.equal(store.getSnapshot().enabled, true);
  assert.equal(createReminderStore(() => storage, permissions).getSnapshot().enabled, true);
  await store.setEnabled(false);
  assert.equal(store.getSnapshot().enabled, false); assert.equal(data.has(REMINDER_STORAGE_KEY), false);
  assert.equal(requests, 1);
});

test('permission denial, unsupported APIs and save errors never enable a reminder', async () => {
  const { storage } = memory();
  for (const permission of ['denied', 'unsupported'] as const) {
    const store = createReminderStore(() => storage, { read: () => permission, request: async () => { throw new Error('must not request'); } });
    await store.setEnabled(true);
    assert.equal(store.getSnapshot().enabled, false); assert.equal(store.getSnapshot().issue, permission);
  }
  const denied = createReminderStore(() => storage, { read: () => 'default', request: async () => { throw new Error('dismissed'); } });
  await denied.setEnabled(true); assert.equal(denied.getSnapshot().issue, 'denied');
  const broken = createReminderStore(() => ({ ...storage, setItem() { throw new Error('quota'); } }), granted);
  await broken.setEnabled(true); assert.equal(broken.getSnapshot().enabled, false); assert.equal(broken.getSnapshot().issue, 'storage');
});

test('turning off cancels a pending permission request', async () => {
  const { storage, data } = memory(); let resolve!: (permission: NotificationPermission) => void;
  const store = createReminderStore(() => storage, { read: () => 'default', request: () => new Promise(done => { resolve = done; }) });
  const enabling = store.setEnabled(true);
  assert.equal(store.getSnapshot().busy, true);
  await store.setEnabled(false); resolve('granted'); await enabling;
  assert.equal(store.getSnapshot().enabled, false); assert.equal(data.has(REMINDER_STORAGE_KEY), false);
});

test('one deadline fires five minutes before each peak, even without foreground clock ticks', async context => {
  const f = fixture(context, '2026-09-30T08:54:59');
  await f.reminderStore.setEnabled(true);
  await f.advance(999); assert.deepEqual(f.notices, []);
  await f.advance(1); assert.deepEqual(f.notices, [at('2026-09-30T09:00:00')]);
  f.update(); await settle(); assert.equal(f.notices.length, 1);
  await f.advance(5 * 60_000);
  await f.advance((4 * 60 + 55) * 60_000);
  assert.deepEqual(f.notices, [at('2026-09-30T09:00:00'), at('2026-09-30T14:00:00')]);
  f.stop(); assert.equal(f.listeners.size, 0);
  await f.advance(24 * 3600_000); assert.equal(f.notices.length, 2);
});

test('disabled reminders have no deadline side effects', async context => {
  const f = fixture(context, '2026-09-30T08:54:59');
  await f.advance(1000); assert.deepEqual(f.notices, []); assert.equal(f.data.has(REMINDER_SENT_KEY), false);
  await f.reminderStore.setEnabled(true); await settle(); assert.equal(f.notices.length, 1);
  await f.reminderStore.setEnabled(false);
  await f.advance(5 * 3600_000); assert.equal(f.notices.length, 1);
});

test('holidays and weekends are skipped; an unknown calendar never predicts a peak reminder', async context => {
  const f = fixture(context, '2026-10-01T08:55:00');
  await f.reminderStore.setEnabled(true); await settle(); assert.deepEqual(f.notices, []);
  await f.advance(at('2026-10-08T08:55:00') - Date.now());
  assert.deepEqual(f.notices, [at('2026-10-08T09:00:00')]);
  context.mock.timers.setTime(at('2026-10-10T08:55:00')); f.update(); await settle();
  assert.equal(f.notices.length, 1);
  context.mock.timers.setTime(at('2027-01-04T08:55:00')); f.update(); await settle();
  await f.advance(5 * 60_000); assert.equal(f.notices.length, 1);
});

test('automatic calendar updates cancel an armed reminder and corrected data recomputes it', async context => {
  const f = fixture(context, '2026-09-30T13:54:59');
  await f.reminderStore.setEnabled(true);
  const holidays = [...calendar.holidays, ['2026-09-30', '2026-09-30']].sort((a, b) => a[0]!.localeCompare(b[0]!));
  f.calendarStore.save(parseCalendar(JSON.stringify({ ...calendar, holidays })));
  await f.advance(1000); assert.deepEqual(f.notices, []);
  f.calendarStore.save(calendar); await settle();
  assert.deepEqual(f.notices, [at('2026-09-30T14:00:00')]);
});

test('wake after the boundary drops the expired reminder; a clock rewind cannot replay it', async context => {
  const f = fixture(context, '2026-09-30T08:54:59');
  await f.reminderStore.setEnabled(true);
  context.mock.timers.setTime(at('2026-09-30T09:10:00')); f.update(); await settle();
  assert.deepEqual(f.notices, []);
  context.mock.timers.setTime(at('2026-09-30T13:55:00')); f.update(); await settle();
  assert.deepEqual(f.notices, [at('2026-09-30T14:00:00')]);
  context.mock.timers.setTime(at('2026-09-30T08:55:00')); f.update(); await settle();
  assert.equal(f.notices.length, 1);
});

test('shared storage and serialized claims deduplicate simultaneous windows and reloads', async context => {
  const f = fixture(context, '2026-09-30T08:55:00');
  f.stop();
  let queue = Promise.resolve();
  const synchronize = (task: () => void) => { queue = queue.then(task); return queue; };
  await f.reminderStore.setEnabled(true);
  const secondStore = createReminderStore(() => f.storage, granted);
  const first = createReminders({ ...f.options, synchronize }).start();
  const second = createReminders({ ...f.options, reminderStore: secondStore, synchronize }).start();
  context.after(first); context.after(second);
  await queue; assert.equal(f.notices.length, 1);
  first(); second();
  const reload = createReminders({ ...f.options, reminderStore: createReminderStore(() => f.storage, granted), synchronize }).start();
  context.after(reload); await queue; assert.equal(f.notices.length, 1);
});

test('a queued notification cannot arrive after disable or disposal', async context => {
  const f = fixture(context, '2026-09-30T08:55:00'); f.stop();
  let release!: () => void;
  const synchronize = (task: () => void) => new Promise<void>(done => { release = () => { task(); done(); }; });
  await f.reminderStore.setEnabled(true);
  const stop = createReminders({ ...f.options, synchronize }).start(); context.after(stop);
  await f.reminderStore.setEnabled(false); release(); await settle();
  assert.deepEqual(f.notices, []);
  await f.reminderStore.setEnabled(true); stop(); release(); await settle();
  assert.deepEqual(f.notices, []);
});

test('notification failure disables delivery and clears the claim instead of retrying every tick', async context => {
  const f = fixture(context, '2026-09-30T08:55:00'); f.stop();
  await f.reminderStore.setEnabled(true);
  let attempts = 0;
  const stop = createReminders({ ...f.options, notify: () => { attempts++; throw new Error('blocked'); } }).start(); context.after(stop);
  await settle();
  assert.equal(f.reminderStore.getSnapshot().enabled, false); assert.equal(f.reminderStore.getSnapshot().issue, 'delivery');
  assert.equal(f.data.has(REMINDER_SENT_KEY), false);
  for (let tick = 0; tick < 3; tick++) { f.update(); await settle(); }
  assert.equal(attempts, 1);
});

test('asynchronous delivery errors restore the previous claim without destroying an earlier reminder record', async context => {
  const f = fixture(context, '2026-09-30T13:55:00'); f.stop();
  const previous = String(at('2026-09-30T09:00:00')); f.data.set(REMINDER_SENT_KEY, previous);
  let failed!: () => void;
  await f.reminderStore.setEnabled(true);
  const stop = createReminders({ ...f.options, notify: (_at, report) => { failed = report; } }).start(); context.after(stop);
  await settle(); assert.equal(f.data.get(REMINDER_SENT_KEY), String(at('2026-09-30T14:00:00')));
  failed(); await settle();
  assert.equal(f.data.get(REMINDER_SENT_KEY), previous); assert.equal(f.reminderStore.getSnapshot().enabled, false);
});

test('settings sync and permission revocation stop notifications until explicitly enabled again', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const win = new EventTarget(); Object.defineProperty(globalThis, 'window', { configurable: true, value: win });
  const { data, storage } = memory(); let permission: NotificationPermission = 'granted';
  const store = createReminderStore(() => storage, { read: () => permission, request: async () => permission });
  const stop = store.start();
  try {
    data.set(REMINDER_STORAGE_KEY, 'true'); win.dispatchEvent(Object.assign(new Event('storage'), { key: REMINDER_STORAGE_KEY }));
    assert.equal(store.getSnapshot().enabled, true);
    permission = 'denied'; win.dispatchEvent(new Event('focus'));
    assert.equal(store.getSnapshot().enabled, false); assert.equal(store.getSnapshot().issue, 'denied');
    await store.setEnabled(false); stop(); data.set(REMINDER_STORAGE_KEY, 'true'); permission = 'granted'; win.dispatchEvent(new Event('focus'));
    assert.equal(store.getSnapshot().enabled, false);
  } finally {
    stop(); if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window');
  }
});
