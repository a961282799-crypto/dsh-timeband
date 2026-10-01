import test from 'node:test';
import assert from 'node:assert/strict';
import { bandAt, chinaDay, countdown, todaySegments, nextTransition, DAY } from '../src/schedule.ts';
const at = (s: string) => Date.parse(`${s}+08:00`);

test('all four weekday boundaries use start-inclusive, end-exclusive intervals', () => {
  for (const [time, before, after] of [
    ['09:00', 'offpeak', 'peak'], ['12:00', 'peak', 'offpeak'],
    ['14:00', 'offpeak', 'peak'], ['18:00', 'peak', 'offpeak'],
  ]) {
    const timestamp = at(`2026-09-30T${time}:00`);
    assert.equal(bandAt(timestamp - 1), before);
    assert.equal(bandAt(timestamp), after);
    assert.equal(nextTransition(timestamp - 1)?.at, timestamp);
    assert.ok(nextTransition(timestamp)!.at > timestamp);
  }
});
test('holiday and makeup weekend follow billing rules, not employment workdays', () => {
  for (const day of ['2026-01-01', '2026-02-16', '2026-02-23', '2026-04-06', '2026-05-05', '2026-06-19', '2026-09-25', '2026-10-07', '2026-10-10', '2026-09-20']) {
    assert.equal(bandAt(at(`${day}T10:00:00`)), 'offpeak', day);
    assert.deepEqual(todaySegments(at(`${day}T10:00:00`)), [{ start: 0, end: 24, band: 'offpeak' }]);
  }
});
test('next transition crosses a whole holiday and ignores unchanged midnights', () => {
  assert.deepEqual(nextTransition(at('2026-09-30T18:00:00')), { at: at('2026-10-08T09:00:00'), band: 'peak' });
  assert.deepEqual(nextTransition(at('2026-02-13T18:00:00')), { at: at('2026-02-24T09:00:00'), band: 'peak' });
  assert.deepEqual(nextTransition(at('2026-10-09T18:00:00')), { at: at('2026-10-12T09:00:00'), band: 'peak' });
});
test('uncovered years do not invent holidays or assert uncertain peak rates', () => {
  assert.equal(bandAt(at('2027-01-04T10:00:00')), 'unknown');
  assert.equal(bandAt(at('2027-01-04T13:00:00')), 'offpeak');
  assert.equal(bandAt(at('2027-01-02T10:00:00')), 'offpeak');
  assert.deepEqual(nextTransition(at('2026-12-31T18:00:00')), { at: at('2027-01-01T09:00:00'), band: 'unknown' });
});
test('Chinese date is independent of the local machine timezone', () => {
  const oldZone = process.env.TZ;
  try {
    for (const zone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
      process.env.TZ = zone;
      assert.equal(chinaDay(Date.parse('2026-09-30T16:00:00Z')).key, '2026-10-01');
      assert.equal(bandAt(Date.parse('2026-09-30T01:00:00Z')), 'peak');
    }
  } finally { if (oldZone === undefined) delete process.env.TZ; else process.env.TZ = oldZone; }
});
test('every 2026 timeline covers 24h, with no gaps or disagreement with bandAt', () => {
  for (let day = at('2026-01-01T00:00:00'); day < at('2027-01-01T00:00:00'); day += DAY) {
    const segments = todaySegments(day);
    assert.equal(segments[0]!.start, 0);
    assert.equal(segments.at(-1)!.end, 24);
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index]!;
      if (index) assert.equal(segments[index - 1]!.end, segment.start);
      assert.equal(bandAt(day + (segment.start + .1) * 3600000), segment.band);
    }
  }
});
test('countdown omits leading units and carries seconds across minute, hour and day boundaries', () => {
  assert.deepEqual(countdown(1), { major: [], seconds: 1 });
  assert.deepEqual(countdown(59000), { major: [], seconds: 59 });
  assert.deepEqual(countdown(59999), { major: [{ value: 1, unit: 'minutes' }], seconds: 0 });
  assert.deepEqual(countdown(3599000), { major: [{ value: 59, unit: 'minutes' }], seconds: 59 });
  assert.deepEqual(countdown(3600000), { major: [{ value: 1, unit: 'hours' }, { value: 0, unit: 'minutes' }], seconds: 0 });
  assert.deepEqual(countdown(DAY - 1000), { major: [{ value: 23, unit: 'hours' }, { value: 59, unit: 'minutes' }], seconds: 59 });
  assert.deepEqual(countdown(8 * DAY), { major: [{ value: 8, unit: 'days' }, { value: 0, unit: 'hours' }, { value: 0, unit: 'minutes' }], seconds: 0 });
  assert.deepEqual(countdown(-1000), { major: [], seconds: 0 });
  assert.throws(() => bandAt(NaN), RangeError);
});
