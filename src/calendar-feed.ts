import { CalendarError, parseCalendar, validDate } from './calendar.ts';
import type { HolidayCalendar } from './calendar.ts';

function intervals(dates: readonly string[]): [string, string][] {
  const result: [string, string][] = [];
  for (const date of [...new Set(dates)].sort()) {
    const previous = result.at(-1);
    if (previous && Date.parse(`${date}T00:00:00Z`) - Date.parse(`${previous[1]}T00:00:00Z`) === 86_400_000) previous[1] = date;
    else result.push([date, date]);
  }
  return result;
}

/** Adapt holiday-cn's government-notice-backed annual data to billing holidays.
 * isOffDay=false never turns a makeup weekend into a peak billing day.
 * Empty next-year placeholders are pending, not a calendar with no holidays. */
export function parseHolidayFeed(text: string, year: number, checkedOn: string, current: HolidayCalendar): HolidayCalendar | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object') throw new Error();
    const data = value as Record<string, unknown>;
    if (data.year !== year || !Array.isArray(data.papers) || !Array.isArray(data.days)) throw new Error();
    if (data.papers.length === 0 && data.days.length === 0) return null;
    if (!data.papers.length || data.papers.length > 20 || !data.days.length || data.days.length > 400) throw new Error();
    for (const paper of data.papers) {
      if (typeof paper !== 'string') throw new Error();
      const url = new URL(paper);
      if (url.protocol !== 'https:' || url.username || url.password || !(url.hostname === 'gov.cn' || url.hostname.endsWith('.gov.cn'))) throw new Error();
    }
    const dates: string[] = [], previous: string[] = [], seen = new Set<string>();
    for (const item of data.days) {
      if (!item || typeof item !== 'object') throw new Error();
      const entry = item as Record<string, unknown>;
      if (!validDate(entry.date) || typeof entry.isOffDay !== 'boolean' || typeof entry.name !== 'string' || !entry.name.trim() || seen.has(entry.date)) throw new Error();
      // Annual announcements can include the preceding December.
      if (entry.date < `${year - 1}-12-01` || entry.date > `${year}-12-31`) throw new Error();
      seen.add(entry.date);
      if (entry.isOffDay) (entry.date.startsWith(`${year}-`) ? dates : previous).push(entry.date);
    }
    if (!dates.length) throw new Error();
    const years = [year], holidays = intervals(dates);
    // Earlier-year entries are partial: augment an already covered year instead
    // of claiming its complete coverage from the new annual announcement.
    if (previous.length && current.years.includes(year - 1)) {
      const existing = current.holidays.filter(([start]) => start.startsWith(`${year - 1}-`));
      const all = [...previous];
      for (const [start, end] of existing) {
        for (let at = Date.parse(`${start}T00:00:00Z`); at <= Date.parse(`${end}T00:00:00Z`); at += 86_400_000) all.push(new Date(at).toISOString().slice(0, 10));
      }
      years.unshift(year - 1); holidays.unshift(...intervals(all));
    }
    return parseCalendar(JSON.stringify({ schemaVersion: 1, years, verifiedOn: checkedOn, source: data.papers[0], holidays }));
  } catch { throw new CalendarError('invalid'); }
}
