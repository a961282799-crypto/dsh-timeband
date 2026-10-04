import bundled from '../calendars/2026.json' with { type: 'json' };

export interface HolidayCalendar {
  readonly schemaVersion: 1;
  readonly years: readonly number[];
  readonly verifiedOn: string;
  readonly source: string;
  readonly holidays: readonly (readonly [string, string])[];
}
export const CALENDAR_DOWNLOAD = 'https://github.com/a961282799-crypto/dsh-timeband/tree/main/calendars';
export const MAX_CALENDAR_BYTES = 64 * 1024;

export class CalendarError extends Error {
  readonly kind: 'invalid' | 'storage';
  constructor(kind: 'invalid' | 'storage') { super(kind); this.kind = kind; }
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Import only data, with valid dates, explicit coverage and a government source. */
export function parseCalendar(text: string): HolidayCalendar {
  try {
    if (new TextEncoder().encode(text).length > MAX_CALENDAR_BYTES) throw new Error();
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object') throw new Error();
    const data = value as Record<string, unknown>;
    if (data.schemaVersion !== 1 || !Array.isArray(data.years) || !data.years.length || data.years.length > 20) throw new Error();
    const years: number[] = data.years;
    if (years.some((year, index) => !Number.isInteger(year) || year < 2000 || year > 9998 || (index > 0 && year <= years[index - 1]!))) throw new Error();
    if (!validDate(data.verifiedOn) || typeof data.source !== 'string') throw new Error();
    const source = new URL(data.source);
    if (source.protocol !== 'https:' || source.username || source.password || !(source.hostname === 'gov.cn' || source.hostname.endsWith('.gov.cn'))) throw new Error();
    if (!Array.isArray(data.holidays) || data.holidays.length > 400) throw new Error();
    const holidays: [string, string][] = [];
    for (const interval of data.holidays) {
      if (!Array.isArray(interval) || interval.length !== 2) throw new Error();
      const [start, end] = interval;
      if (!validDate(start) || !validDate(end) || start > end || start.slice(0, 4) !== end.slice(0, 4) || !years.includes(Number(start.slice(0, 4)))) throw new Error();
      if (holidays.length && start <= holidays.at(-1)![1]) throw new Error();
      holidays.push([start, end]);
    }
    // A covered year must have actual holiday entries, rather than an empty claim.
    if (years.some(year => !holidays.some(([start]) => Number(start.slice(0, 4)) === year))) throw new Error();
    return { schemaVersion: 1, years: [...years], verifiedOn: data.verifiedOn, source: source.href, holidays };
  } catch { throw new CalendarError('invalid'); }
}

/** Verified public-holiday intervals, inclusive; makeup weekends remain off-peak. */
export const calendar = parseCalendar(JSON.stringify(bundled));
