import { calendar } from './calendar.ts';
import type { HolidayCalendar } from './calendar.ts';

export const PRICING_SOURCE = 'https://api-docs.deepseek.com/quick_start/pricing/';
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
const CHINA_OFFSET = 8 * HOUR;
const BOUNDARIES = [0, 9, 12, 14, 18, 24] as const;
export type Band = 'peak' | 'offpeak' | 'unknown';
export type DayKind = 'weekday' | 'weekend' | 'holiday' | 'unverified';
export interface Segment { start: number; end: number; band: Band }
export interface Transition { at: number; band: Band }

/** Shanghai has no daylight-saving transitions in the supported calendar. */
export function chinaDay(now: number, data: HolidayCalendar = calendar) {
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) throw new RangeError('Invalid timestamp');
  const date = new Date(now + CHINA_OFFSET);
  const key = date.toISOString().slice(0, 10);
  const midnight = Date.parse(`${key}T00:00:00+08:00`);
  const holiday = data.holidays.some(([start, end]) => key >= start && key <= end);
  const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
  const covered = data.years.includes(date.getUTCFullYear());
  const kind: DayKind = holiday ? 'holiday' : weekend ? 'weekend' : covered ? 'weekday' : 'unverified';
  return { key, midnight, kind, covered, hour: (now - midnight) / HOUR };
}

export function todaySegments(now: number, data: HolidayCalendar = calendar): Segment[] {
  const { kind } = chinaDay(now, data);
  if (kind === 'holiday' || kind === 'weekend') return [{ start: 0, end: 24, band: 'offpeak' }];
  const peak: Band = kind === 'unverified' ? 'unknown' : 'peak';
  return [
    { start: 0, end: 9, band: 'offpeak' }, { start: 9, end: 12, band: peak },
    { start: 12, end: 14, band: 'offpeak' }, { start: 14, end: 18, band: peak },
    { start: 18, end: 24, band: 'offpeak' },
  ];
}

export function bandAt(now: number, data: HolidayCalendar = calendar): Band {
  const { hour, kind } = chinaDay(now, data);
  if (kind === 'holiday' || kind === 'weekend' || hour < 9 || (hour >= 12 && hour < 14) || hour >= 18) return 'offpeak';
  return kind === 'unverified' ? 'unknown' : 'peak';
}

/** First real band change, skipping nights, weekends and multi-day public holidays.
 * Stop at an uncertain interval: never promise a peak date beyond calendar coverage.
 */
export function nextTransition(now: number, data: HolidayCalendar = calendar): Transition | null {
  const current = bandAt(now, data);
  const { midnight } = chinaDay(now, data);
  for (let day = 0; day < 370; day++) {
    for (const hour of BOUNDARIES) {
      const at = midnight + day * DAY + hour * HOUR;
      if (at <= now) continue;
      const band = bandAt(at, data);
      if (band !== current) return { at, band };
    }
  }
  return null;
}

export function calendarCoverage(now: number, data: HolidayCalendar = calendar) {
  const day = chinaDay(now, data);
  let endYear = Number(day.key.slice(0, 4));
  if (!day.covered) return { expiresOn: null, notice: 'uncovered' as const };
  while (data.years.includes(endYear + 1)) endYear++;
  const expiresOn = `${endYear}-12-31`;
  const until = Date.parse(`${endYear + 1}-01-01T00:00:00+08:00`);
  return { expiresOn, notice: until - day.midnight <= 30 * DAY ? 'expiresSoon' as const : null };
}

export interface ScheduleSnapshot {
  day: Omit<ReturnType<typeof chinaDay>, 'hour'>;
  band: Band;
  next: Transition | null;
  segments: Segment[];
  coverage: ReturnType<typeof calendarCoverage>;
}

/** Reuse a schedule within an interval; invalidate at boundaries, midnight,
 * calendar replacement, clock rewind, or a jump after sleep. */
export function createScheduleReader() {
  let previous: HolidayCalendar | undefined;
  let start = 0, end = 0;
  let cached: ScheduleSnapshot | undefined;
  return (now: number, data: HolidayCalendar = calendar): ScheduleSnapshot => {
    if (!Number.isFinite(now)) throw new RangeError('Invalid timestamp');
    if (cached && previous === data && now >= start && now < end) return cached;
    const { hour, ...day } = chinaDay(now, data);
    const daily = day.kind === 'holiday' || day.kind === 'weekend';
    const before = daily ? 0 : BOUNDARIES.findLast(boundary => boundary <= hour)!;
    const after = daily ? 24 : BOUNDARIES.find(boundary => boundary > hour)!;
    start = day.midnight + before * HOUR;
    end = day.midnight + after * HOUR;
    previous = data;
    cached = { day, band: bandAt(now, data), next: nextTransition(now, data), segments: todaySegments(now, data), coverage: calendarCoverage(now, data) };
    return cached;
  };
}

/** Ceiling avoids displaying zero before the boundary actually arrives. */
export function countdown(milliseconds: number) {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor(total / 3600) % 24;
  const minutes = Math.floor(total / 60) % 60;
  const major: { value: number; unit: 'days' | 'hours' | 'minutes' }[] = [];
  if (days > 0) major.push({ value: days, unit: 'days' });
  if (total >= 3600) major.push({ value: hours, unit: 'hours' });
  if (total >= 60) major.push({ value: minutes, unit: 'minutes' });
  return { major, seconds: total % 60 };
}
