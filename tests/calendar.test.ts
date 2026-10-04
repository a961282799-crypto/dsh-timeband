import test from 'node:test';
import assert from 'node:assert/strict';
import { calendar, CalendarError, mergeCalendars, parseCalendar } from '../src/calendar.ts';
import { CALENDAR_STORAGE_KEY, createCalendarStore } from '../src/calendar-store.ts';
import { bandAt, calendarCoverage, createScheduleReader, todaySegments, nextTransition } from '../src/schedule.ts';
const at = (value: string) => Date.parse(`${value}+08:00`);
// Synthetic future dates exercise updates; they are not a shipped holiday forecast.
const future = parseCalendar(JSON.stringify({ ...calendar, years: [2027], holidays: [['2027-01-04', '2027-01-05']] }));

test('calendar data validates real dates, coverage, ordering, source and size', () => {
  assert.deepEqual(parseCalendar(JSON.stringify(calendar)), calendar);
  for (const change of [
    { schemaVersion: 2 }, { years: [] }, { years: [2026, 2026] }, { years: [2026, 2025] },
    { holidays: [] }, { holidays: [['2026-02-29', '2026-03-01']] },
    { holidays: [['2026-01-03', '2026-01-01']] }, { holidays: [['2026-12-31', '2027-01-01']] },
    { holidays: [['2027-01-01', '2027-01-03']] },
    { holidays: [['2026-01-01', '2026-01-03'], ['2026-01-03', '2026-01-04']] },
    { verifiedOn: 'not-a-date' }, { source: 'javascript:alert(1)' }, { source: 'https://gov.cn.example.com/holidays' },
    { source: 'http://www.gov.cn/holidays' },
  ]) assert.throws(() => parseCalendar(JSON.stringify({ ...calendar, ...change })), CalendarError);
  assert.throws(() => parseCalendar('{'), CalendarError);
  assert.throws(() => parseCalendar(JSON.stringify({ ...calendar, unused: '大'.repeat(24000) })), CalendarError);
});

test('an automatic update extends coverage, persists, and refreshes both timeline and countdown', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  const store = createCalendarStore(() => storage);
  let updates = 0;
  const unsubscribe = store.subscribe(() => updates++);
  assert.deepEqual(store.getSnapshot().data.years, [2026]);
  store.save(future);
  const imported = store.getSnapshot().data;
  const now = at('2027-01-04T10:00:00');
  assert.equal(bandAt(now, imported), 'offpeak');
  assert.deepEqual(todaySegments(now, imported), [{ start: 0, end: 24, band: 'offpeak' }]);
  assert.equal(nextTransition(now, imported)?.at, at('2027-01-06T09:00:00'));
  assert.deepEqual(createCalendarStore(() => storage).getSnapshot().data.years, [2026, 2027]);
  assert.equal(bandAt(at('2026-10-01T10:00:00'), imported), 'offpeak');
  const good = store.getSnapshot();
  assert.throws(() => store.save({ ...future, years: [] }), CalendarError);
  assert.equal(store.getSnapshot(), good);
  assert.equal(data.has(CALENDAR_STORAGE_KEY), true);
  assert.equal(updates, 1);
  unsubscribe();
});

test('storage errors do not pretend an update was saved; corrupt saved data falls back', () => {
  const corrupt = createCalendarStore(() => ({ getItem: () => 'broken', setItem() {}, removeItem() {} }));
  assert.equal(corrupt.getSnapshot().data, calendar);
  assert.equal(corrupt.getSnapshot().issue, 'invalid');
  const inaccessible = createCalendarStore(() => { throw new Error('blocked'); });
  const initial = inaccessible.getSnapshot();
  assert.equal(initial.issue, 'storage');
  assert.throws(() => inaccessible.save(future), (error: unknown) => error instanceof CalendarError && error.kind === 'storage');
  assert.equal(inaccessible.getSnapshot(), initial);
});

test('legacy imported years are retained, but older data cannot override a newer bundled year', () => {
  const imported = createCalendarStore(() => ({ getItem: () => JSON.stringify(future), setItem() {}, removeItem() {} }));
  assert.deepEqual(imported.getSnapshot().data.years, [2026, 2027]);
  const older = parseCalendar(JSON.stringify({ ...calendar, verifiedOn: '2026-01-01', holidays: [['2026-10-01', '2026-10-01']] }));
  assert.deepEqual(mergeCalendars(calendar, older), calendar);
  assert.deepEqual(mergeCalendars(calendar, future).years, [2026, 2027]);
});

test('coverage warning starts in the last 30 days and skips covered future years', () => {
  assert.equal(calendarCoverage(at('2026-12-01T10:00:00')).notice, null);
  assert.deepEqual(calendarCoverage(at('2026-12-02T00:00:00')), { expiresOn: '2026-12-31', notice: 'expiresSoon' });
  assert.equal(calendarCoverage(at('2027-01-01T00:00:00')).notice, 'uncovered');
  const extended = parseCalendar(JSON.stringify({ ...calendar, years: [2026, 2027], holidays: [...calendar.holidays, ...future.holidays] }));
  assert.deepEqual(calendarCoverage(at('2026-12-31T22:00:00'), extended), { expiresOn: '2027-12-31', notice: null });
});

test('cached schedules stay correct at switches, midnight, calendar replacement and clock jumps', () => {
  const read = createScheduleReader();
  const now = at('2026-09-30T11:59:58');
  const before = read(now);
  assert.equal(read(now + 1000), before);
  assert.equal(read(now + 2000).band, 'offpeak');
  const rewound = read(now);
  assert.equal(rewound.band, 'peak');
  assert.equal(read(at('2026-10-01T00:00:00')).segments.length, 1);
  assert.equal(read(at('2026-10-08T10:00:00')).band, 'peak');
  const unknown = at('2027-01-04T10:00:00');
  assert.equal(read(unknown).band, 'unknown');
  assert.equal(read(unknown, parseCalendar(JSON.stringify(future))).band, 'offpeak');
  assert.throws(() => read(NaN), RangeError);
});

test('storage notifications and focus refresh work until the calendar store is disposed', () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const win = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: win });
  let text: string | null = null;
  const store = createCalendarStore(() => ({ getItem: () => text, setItem: (_key, value) => { text = value; }, removeItem: () => { text = null; } }));
  const stop = store.start();
  try {
    text = JSON.stringify(future);
    win.dispatchEvent(Object.assign(new Event('storage'), { key: CALENDAR_STORAGE_KEY }));
    assert.deepEqual(store.getSnapshot().data.years, [2026, 2027]);
    text = null; win.dispatchEvent(new Event('focus'));
    assert.deepEqual(store.getSnapshot().data.years, [2026]);
    stop();
    text = JSON.stringify(future); win.dispatchEvent(new Event('focus'));
    assert.deepEqual(store.getSnapshot().data.years, [2026]);
  } finally {
    stop();
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window');
  }
});
