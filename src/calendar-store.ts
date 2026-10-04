import { calendar, CalendarError, parseCalendar } from './calendar.ts';
import type { HolidayCalendar } from './calendar.ts';

export const CALENDAR_STORAGE_KEY = 'dsh-timeband/calendar/v1';
type CalendarStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface CalendarState {
  readonly data: HolidayCalendar;
  readonly imported: boolean;
  readonly issue: 'invalid' | 'storage' | null;
}

/** One persisted calendar shared by the plugin views, scoped to this web origin. */
export function createCalendarStore(getStorage: () => CalendarStorage = () => window.localStorage) {
  const listeners = new Set<() => void>();
  const read = (): CalendarState => {
    try {
      const saved = getStorage().getItem(CALENDAR_STORAGE_KEY);
      return saved === null ? { data: calendar, imported: false, issue: null } : { data: parseCalendar(saved), imported: true, issue: null };
    } catch (error) {
      return { data: calendar, imported: false, issue: error instanceof CalendarError ? error.kind : 'storage' };
    }
  };
  let snapshot = read();
  const update = (state: CalendarState) => { snapshot = state; for (const listener of listeners) listener(); };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    import(text: string) {
      const data = parseCalendar(text);
      try { getStorage().setItem(CALENDAR_STORAGE_KEY, JSON.stringify(data)); }
      catch { throw new CalendarError('storage'); }
      update({ data, imported: true, issue: null });
    },
    restore() {
      try { getStorage().removeItem(CALENDAR_STORAGE_KEY); }
      catch { throw new CalendarError('storage'); }
      update({ data: calendar, imported: false, issue: null });
    },
    start() {
      const refresh = () => update(read());
      const onStorage = (event: StorageEvent) => { if (event.key === CALENDAR_STORAGE_KEY || event.key === null) refresh(); };
      window.addEventListener('storage', onStorage);
      window.addEventListener('focus', refresh);
      return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('focus', refresh); };
    },
  };
}
export type CalendarStore = ReturnType<typeof createCalendarStore>;
