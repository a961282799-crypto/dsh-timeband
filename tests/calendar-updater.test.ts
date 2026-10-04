import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { calendar, calendarUpdateUrl, MAX_CALENDAR_BYTES, parseCalendar } from '../src/calendar.ts';
import { CALENDAR_STORAGE_KEY, createCalendarStore } from '../src/calendar-store.ts';
import { CALENDAR_CHECK_STORAGE_KEY, CALENDAR_RETRY, CALENDAR_TIMEOUT, createCalendarUpdater } from '../src/calendar-updater.ts';
import { bandAt, DAY, HOUR } from '../src/schedule.ts';

const at = (time: string) => Date.parse(`${time}+08:00`);
// Synthetic future holidays are confined to test fixtures.
const future = parseCalendar(JSON.stringify({ ...calendar, verifiedOn: '2026-11-20', years: [2027], holidays: [['2027-01-04', '2027-01-05']] }));
const futureFeed = { year: 2027, papers: [future.source], days: [
  { name: 'Fixture holiday', date: '2027-01-04', isOffDay: true }, { name: 'Fixture holiday', date: '2027-01-05', isOffDay: true },
] };
const settle = () => setImmediate();
function fixture(context: TestContext, time: string, fetcher: typeof fetch = async () => Response.json(futureFeed)) {
  context.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now: at(time) });
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const win = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: win });
  const saved = new Map<string, string>();
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); }, removeItem: (key: string) => { saved.delete(key); } };
  const store = createCalendarStore(() => storage);
  const listeners = new Set<() => void>(), calls: { url: string; init?: RequestInit }[] = [];
  const clock = { subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
  const options = { clock, store, getStorage: () => storage, fetch: ((input, init) => {
    calls.push({ url: String(input), ...(init ? { init } : {}) }); return fetcher(input, init);
  }) as typeof fetch };
  const updater = createCalendarUpdater(options);
  const stop = updater.start();
  context.after(() => {
    stop();
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window');
  });
  const update = () => { for (const listener of listeners) listener(); };
  return { saved, storage, store, clock, listeners, calls, options, win, stop, update,
    advance: async (duration: number) => { context.mock.timers.tick(duration); update(); await settle(); },
  };
}

test('no network before 30 days; midnight at the boundary triggers exactly one update', async context => {
  const f = fixture(context, '2026-12-01T23:59:59');
  await settle(); assert.equal(f.calls.length, 0);
  await f.advance(999); assert.equal(f.calls.length, 0);
  await f.advance(1); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0]!.url, calendarUpdateUrl(2027));
  assert.equal(f.calls[0]!.init!.credentials, 'omit');
  assert.equal(f.calls[0]!.init!.referrerPolicy, 'no-referrer');
  assert.deepEqual(f.store.getSnapshot().data.years, [2026, 2027]);
  assert.equal(f.store.getSnapshot().update, 'idle');
  await f.advance(DAY); assert.equal(f.calls.length, 1);
  assert.deepEqual(createCalendarStore(() => f.storage).getSnapshot().data.years, [2026, 2027]);
});

test('missing current year is fetched after a wake, preserving earlier holiday coverage', async context => {
  const f = fixture(context, '2026-10-01T10:00:00');
  await settle(); assert.equal(f.calls.length, 0);
  context.mock.timers.setTime(at('2027-01-04T10:00:00')); f.update(); await settle();
  assert.equal(f.calls[0]!.url, calendarUpdateUrl(2027));
  assert.equal(bandAt(Date.now(), f.store.getSnapshot().data), 'offpeak');
  assert.equal(bandAt(at('2026-10-01T10:00:00'), f.store.getSnapshot().data), 'offpeak');
});

test('unpublished calendars are retried daily, including after a plugin reload', async context => {
  const f = fixture(context, '2026-12-02T10:00:00', async () => new Response('', { status: 404 }));
  await settle(); assert.equal(f.calls.length, 1);
  assert.equal(f.store.getSnapshot().update, 'waiting');
  assert.deepEqual(f.store.getSnapshot().data.years, [2026]);
  f.stop();
  const stop = createCalendarUpdater(f.options).start(); context.after(stop);
  await settle(); assert.equal(f.calls.length, 1);
  await f.advance(CALENDAR_RETRY - 1); assert.equal(f.calls.length, 1);
  await f.advance(1); assert.equal(f.calls.length, 2);
  assert.ok(f.saved.has(CALENDAR_CHECK_STORAGE_KEY));
});

test('network failure leaves existing data intact and reconnect retries immediately', async context => {
  let offline = true;
  const f = fixture(context, '2026-12-02T10:00:00', async () => {
    if (offline) throw new TypeError('offline'); return Response.json(futureFeed);
  });
  await settle(); assert.equal(f.store.getSnapshot().update, 'failed');
  assert.deepEqual(f.store.getSnapshot().data.years, [2026]);
  for (let index = 0; index < 5; index++) f.update();
  await settle(); assert.equal(f.calls.length, 1);
  offline = false; f.win.dispatchEvent(new Event('online')); await settle();
  assert.deepEqual(f.store.getSnapshot().data.years, [2026, 2027]);
  assert.equal(f.store.getSnapshot().update, 'idle');
});

test('invalid source, wrong year, invalid dates and HTTP errors keep old coverage', async context => {
  const invalid = [
    { ...futureFeed, papers: ['https://example.com/holidays'] },
    { ...futureFeed, year: 2028 }, calendar,
    { ...futureFeed, days: [{ name: 'Invalid', date: '2027-02-30', isOffDay: true }] },
  ];
  const f = fixture(context, '2026-12-02T10:00:00', async () => invalid.length
    ? Response.json(invalid.shift()) : new Response('', { status: 503 }));
  for (let index = 0; index < 5; index++) {
    await settle(); assert.equal(f.store.getSnapshot().update, 'failed');
    assert.deepEqual(f.store.getSnapshot().data.years, [2026]);
    assert.equal(f.saved.has(CALENDAR_STORAGE_KEY), false);
    if (index < 4) await f.advance(DAY);
  }
  assert.equal(f.calls.length, 5);
});

test('oversized response headers and streamed bytes are rejected without saving', async context => {
  let header = true;
  const f = fixture(context, '2026-12-02T10:00:00', async () => {
    if (header) return new Response('{}', { headers: { 'content-length': String(MAX_CALENDAR_BYTES + 1) } });
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array(MAX_CALENDAR_BYTES)); controller.enqueue(new Uint8Array(1)); controller.close();
    } }));
  });
  await settle(); assert.equal(f.store.getSnapshot().update, 'failed');
  header = false; await f.advance(DAY);
  assert.equal(f.calls.length, 2); assert.equal(f.store.getSnapshot().update, 'failed');
  assert.equal(f.saved.has(CALENDAR_STORAGE_KEY), false);
});

test('save failure is reported and never claims the future year was installed', async context => {
  const f = fixture(context, '2026-12-02T10:00:00');
  f.storage.setItem = () => { throw new Error('quota'); };
  await settle();
  assert.equal(f.store.getSnapshot().issue, 'storage');
  assert.equal(f.store.getSnapshot().update, 'failed');
  assert.deepEqual(f.store.getSnapshot().data.years, [2026]);
});

test('a stalled request times out and does not retry on every clock tick', async context => {
  const f = fixture(context, '2026-12-02T10:00:00', (_input, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')), { once: true });
  }));
  await settle(); assert.equal(f.store.getSnapshot().update, 'checking');
  await f.advance(CALENDAR_TIMEOUT);
  assert.equal(f.store.getSnapshot().update, 'failed');
  await f.advance(HOUR); assert.equal(f.calls.length, 1);
});

test('disposal aborts a pending fetch; late completion cannot save or rearm work', async context => {
  let complete!: (response: Response) => void;
  const f = fixture(context, '2026-12-02T10:00:00', () => new Promise(resolve => { complete = resolve; }));
  await settle(); assert.equal(f.store.getSnapshot().update, 'checking');
  f.stop(); assert.equal(f.calls[0]!.init!.signal!.aborted, true);
  assert.equal(f.listeners.size, 0);
  complete(Response.json(futureFeed)); await settle();
  assert.deepEqual(f.store.getSnapshot().data.years, [2026]);
  f.win.dispatchEvent(new Event('online')); await f.advance(DAY);
  assert.equal(f.calls.length, 1);
});

test('serialized windows refresh persisted coverage before making duplicate requests', async context => {
  const f = fixture(context, '2026-12-01T10:00:00'); f.stop();
  context.mock.timers.setTime(at('2026-12-02T10:00:00'));
  let queue = Promise.resolve();
  const synchronize = (task: () => Promise<void>) => { queue = queue.then(task); return queue; };
  const secondStore = createCalendarStore(() => f.storage);
  const first = createCalendarUpdater({ ...f.options, synchronize }).start(); context.after(first);
  const second = createCalendarUpdater({ ...f.options, store: secondStore, synchronize }).start(); context.after(second);
  await settle(); await queue;
  assert.equal(f.calls.length, 1);
  assert.deepEqual(secondStore.getSnapshot().data.years, [2026, 2027]);
});

test('a clock rewind does not let a future check timestamp suppress updates indefinitely', async context => {
  const f = fixture(context, '2026-12-02T10:00:00', async () => new Response('', { status: 404 }));
  await settle(); assert.equal(f.calls.length, 1);
  context.mock.timers.setTime(at('2026-12-02T09:00:00')); f.update(); await settle();
  assert.equal(f.calls.length, 2);
});
