import { calendarUpdateUrl, CalendarError, MAX_CALENDAR_BYTES } from './calendar.ts';
import { parseHolidayFeed } from './calendar-feed.ts';
import type { CalendarStore, CalendarUpdateStatus } from './calendar-store.ts';
import { calendarCoverage, chinaDay, DAY, HOUR } from './schedule.ts';

export const CALENDAR_CHECK_STORAGE_KEY = 'dsh-timeband/calendar-check/v1';
export const CALENDAR_RETRY = DAY;
export const CALENDAR_TIMEOUT = 10_000;
type CheckRecord = { year: number; at: number; status: 'waiting' | 'failed' };
type Options = {
  clock: { subscribe: (listener: () => void) => () => void };
  store: CalendarStore;
  now?: () => number;
  fetch?: typeof fetch;
  getStorage?: () => Pick<Storage, 'getItem' | 'setItem'>;
  synchronize?: (task: () => Promise<void>) => Promise<void>;
};

async function readCalendarText(response: Response) {
  if (Number(response.headers.get('content-length')) > MAX_CALENDAR_BYTES || !response.body) throw new CalendarError('invalid');
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_CALENDAR_BYTES) throw new CalendarError('invalid');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

/** Only fetch when coverage is missing or ends within 30 days. The host clock
 * handles wake/clock jumps; the hourly timer also works while the UI is hidden. */
export function createCalendarUpdater(options: Options) {
  const now = options.now ?? (() => Date.now());
  const fetchCalendar = options.fetch ?? ((input, init) => fetch(input, init));
  const storage = options.getStorage ?? (() => window.localStorage);
  const synchronize = options.synchronize ?? (task => typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request('dsh-timeband-calendar-update', task) : task());
  let running = false, busy = false, generation = 0;
  let request: AbortController | undefined, requestTimeout: ReturnType<typeof setTimeout> | undefined, lastCheck: CheckRecord | undefined;
  let nextPoll = 0, previous = options.store.getSnapshot().data;
  const targetYear = () => {
    const data = options.store.getSnapshot().data, instant = now();
    const day = chinaDay(instant, data), coverage = calendarCoverage(instant, data);
    if (!day.covered) return Number(day.key.slice(0, 4));
    return coverage.notice === 'expiresSoon' ? Number(coverage.expiresOn!.slice(0, 4)) + 1 : null;
  };
  const savedCheck = (): CheckRecord | undefined => {
    try {
      const value = JSON.parse(storage().getItem(CALENDAR_CHECK_STORAGE_KEY) ?? 'null') as CheckRecord | null;
      if (value && Number.isInteger(value.year) && Number.isFinite(value.at) && (value.status === 'waiting' || value.status === 'failed')) return value;
    } catch {}
    return lastCheck;
  };
  const remember = (record: CheckRecord) => {
    lastCheck = record;
    try { storage().setItem(CALENDAR_CHECK_STORAGE_KEY, JSON.stringify(record)); } catch {}
  };
  const check = async (online = false) => {
    if (!running || busy) return;
    busy = true;
    const operation = generation;
    try {
      await synchronize(async () => {
        if (!running || operation !== generation) return;
        options.store.refresh();
        const year = targetYear();
        if (year === null) { options.store.setUpdateStatus('idle'); return; }
        const recent = savedCheck();
        // Ignore future timestamps after a system clock rewind.
        if (recent?.year === year && now() >= recent.at && now() - recent.at < CALENDAR_RETRY && !(online && recent.status === 'failed')) {
          nextPoll = Math.min(nextPoll, recent.at + CALENDAR_RETRY);
          options.store.setUpdateStatus(recent.status); return;
        }
        options.store.setUpdateStatus('checking');
        const controller = new AbortController(); request = controller;
        const timeout = setTimeout(() => controller.abort(), CALENDAR_TIMEOUT); requestTimeout = timeout;
        let status: CalendarUpdateStatus = 'failed';
        try {
          const response = await fetchCalendar(calendarUpdateUrl(year), {
            signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-cache', redirect: 'error',
          });
          if (!running || operation !== generation || controller.signal.aborted) return;
          if (response.status === 404) status = 'waiting';
          else {
            if (!response.ok) throw new Error('Calendar request failed');
            const incoming = parseHolidayFeed(await readCalendarText(response), year, chinaDay(now()).key, options.store.getSnapshot().data);
            if (!running || operation !== generation || controller.signal.aborted) return;
            if (incoming === null) status = 'waiting';
            else { options.store.save(incoming); return; }
          }
        } catch (error) {
          if (!running || operation !== generation) return;
          if (error instanceof CalendarError && error.kind === 'storage') options.store.setUpdateStatus('failed', 'storage');
        } finally {
          clearTimeout(timeout); controller.abort();
          if (request === controller) request = undefined;
          if (requestTimeout === timeout) requestTimeout = undefined;
        }
        if (!running || operation !== generation) return;
        remember({ year, at: now(), status });
        options.store.setUpdateStatus(status);
      });
    } catch {
      if (running && operation === generation) {
        const year = targetYear();
        if (year !== null) remember({ year, at: now(), status: 'failed' });
        options.store.setUpdateStatus('failed');
      }
    } finally { if (operation === generation) busy = false; }
  };
  const refresh = () => {
    const instant = now(), data = options.store.getSnapshot().data;
    if (data !== previous || instant < nextPoll - HOUR || instant >= nextPoll) {
      previous = data; nextPoll = Math.min(instant + HOUR, chinaDay(instant, data).midnight + DAY); void check();
    }
  };
  return {
    start() {
      running = true; generation++; busy = false; nextPoll = 0;
      const win = window;
      const unsubscribe = [options.clock.subscribe(refresh), options.store.subscribe(refresh)];
      const online = () => { nextPoll = now() + HOUR; void check(true); };
      win.addEventListener('online', online);
      const timer = setInterval(refresh, HOUR);
      refresh();
      return () => {
        running = false; generation++; busy = false; request?.abort();
        clearTimeout(requestTimeout); requestTimeout = undefined;
        clearInterval(timer); unsubscribe.forEach(stop => stop()); win.removeEventListener('online', online);
        if (options.store.getSnapshot().update === 'checking') options.store.setUpdateStatus('idle');
      };
    },
  };
}
