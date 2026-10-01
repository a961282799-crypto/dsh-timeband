import { calendar } from './calendar.ts';

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
export function chinaDay(now: number) {
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) throw new RangeError('Invalid timestamp');
  const date = new Date(now + CHINA_OFFSET);
  const key = date.toISOString().slice(0, 10);
  const midnight = Date.parse(`${key}T00:00:00+08:00`);
  const holiday = calendar.holidays.some(([start, end]) => key >= start && key <= end);
  const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
  const covered = calendar.years.includes(date.getUTCFullYear());
  const kind: DayKind = holiday ? 'holiday' : weekend ? 'weekend' : covered ? 'weekday' : 'unverified';
  return { key, midnight, kind, covered, hour: (now - midnight) / HOUR };
}

export function todaySegments(now: number): Segment[] {
  const { kind } = chinaDay(now);
  if (kind === 'holiday' || kind === 'weekend') return [{ start: 0, end: 24, band: 'offpeak' }];
  const peak: Band = kind === 'unverified' ? 'unknown' : 'peak';
  return [
    { start: 0, end: 9, band: 'offpeak' }, { start: 9, end: 12, band: peak },
    { start: 12, end: 14, band: 'offpeak' }, { start: 14, end: 18, band: peak },
    { start: 18, end: 24, band: 'offpeak' },
  ];
}

export function bandAt(now: number): Band {
  const { hour, kind } = chinaDay(now);
  if (kind === 'holiday' || kind === 'weekend' || hour < 9 || (hour >= 12 && hour < 14) || hour >= 18) return 'offpeak';
  return kind === 'unverified' ? 'unknown' : 'peak';
}

/** First real band change, skipping nights, weekends and multi-day public holidays.
 * Stop at an uncertain interval: never promise a peak date beyond calendar coverage.
 */
export function nextTransition(now: number): Transition | null {
  const current = bandAt(now);
  const { midnight } = chinaDay(now);
  for (let day = 0; day < 370; day++) {
    for (const hour of BOUNDARIES) {
      const at = midnight + day * DAY + hour * HOUR;
      if (at <= now) continue;
      const band = bandAt(at);
      if (band !== current) return { at, band };
    }
  }
  return null;
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
