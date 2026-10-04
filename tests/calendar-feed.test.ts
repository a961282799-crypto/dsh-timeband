import test from 'node:test';
import assert from 'node:assert/strict';
import { calendar, CalendarError } from '../src/calendar.ts';
import { parseHolidayFeed } from '../src/calendar-feed.ts';
import { bandAt } from '../src/schedule.ts';

const at = (value: string) => Date.parse(`${value}+08:00`);
const feed = { year: 2027, papers: ['https://www.gov.cn/fixture-holiday-notice'], days: [
  { name: 'Fixture holiday', date: '2027-01-04', isOffDay: true },
  { name: 'Fixture holiday', date: '2027-01-05', isOffDay: true },
  { name: 'Fixture makeup weekend', date: '2027-01-09', isOffDay: false },
] };

test('annual feed becomes contiguous billing holiday intervals, ignoring makeup weekends', () => {
  const data = parseHolidayFeed(JSON.stringify(feed), 2027, '2026-12-02', calendar)!;
  assert.deepEqual(data.years, [2027]);
  assert.deepEqual(data.holidays, [['2027-01-04', '2027-01-05']]);
  assert.equal(bandAt(at('2027-01-04T10:00:00'), data), 'offpeak');
  assert.equal(bandAt(at('2027-01-06T10:00:00'), data), 'peak');
  assert.equal(bandAt(at('2027-01-09T10:00:00'), data), 'offpeak');
});

test('empty annual placeholders mean unpublished data, not a year with no holidays', () => {
  assert.equal(parseHolidayFeed(JSON.stringify({ year: 2027, papers: [], days: [] }), 2027, '2026-12-02', calendar), null);
  assert.throws(() => parseHolidayFeed(JSON.stringify({ ...feed, days: [] }), 2027, '2026-12-02', calendar), CalendarError);
});

test('feed requires an official source, correct year, valid unique dates and boolean day flags', () => {
  for (const change of [
    { year: 2028 }, { papers: [] }, { papers: ['https://gov.cn.example.com/holiday'] },
    { papers: ['http://www.gov.cn/holiday'] }, { papers: [false] },
    { days: [{ name: 'Fixture', date: '2027-02-30', isOffDay: true }] },
    { days: [{ name: 'Fixture', date: '2028-01-01', isOffDay: true }] },
    { days: [{ name: 'Fixture', date: '2026-11-30', isOffDay: true }] },
    { days: [{ name: '', date: '2027-01-01', isOffDay: true }] },
    { days: [{ name: 'Fixture', date: '2027-01-01', isOffDay: 'true' }] },
    { days: [feed.days[0], feed.days[0]] },
  ]) assert.throws(() => parseHolidayFeed(JSON.stringify({ ...feed, ...change }), 2027, '2026-12-02', calendar), CalendarError);
});

test('preceding December days augment known coverage without deleting previous holidays', () => {
  const data = parseHolidayFeed(JSON.stringify({ ...feed, days: [
    ...feed.days, { name: 'Fixture cross-year holiday', date: '2026-12-31', isOffDay: true },
  ] }), 2027, '2026-12-02', calendar)!;
  assert.deepEqual(data.years, [2026, 2027]);
  assert.equal(bandAt(at('2026-12-31T10:00:00'), data), 'offpeak');
  assert.equal(bandAt(at('2026-10-01T10:00:00'), data), 'offpeak');
  assert.equal(bandAt(at('2026-10-08T10:00:00'), data), 'peak');
  const unknownPrevious = parseHolidayFeed(JSON.stringify({ ...feed, days: [
    ...feed.days, { name: 'Fixture', date: '2026-12-31', isOffDay: true },
  ] }), 2027, '2026-12-02', { ...calendar, years: [], holidays: [] })!;
  assert.deepEqual(unknownPrevious.years, [2027]);
});
